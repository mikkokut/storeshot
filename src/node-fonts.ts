import { createHash, randomUUID } from "node:crypto"
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { registerFont } from "canvas"

import type { FontWeight, ScreenshotSet } from "./shared.js"

const BUNNY_FONT_ORIGIN = "https://fonts.bunny.net"
const FONT_CACHE_DIRECTORY = path.join(tmpdir(), "storeshot-fonts-v1")
const LOCAL_RENDER_FONTS = new Set(["Geist Variable", "Arial", "Georgia", "Times New Roman"])
const MAX_FONT_BYTES = 10 * 1024 * 1024
const FONT_WEIGHTS: FontWeight[] = [100, 200, 300, 400, 500, 600, 700, 800, 900]

interface RenderFontRequest {
  family: string
  text: string
  weight: FontWeight
}

interface FontLoaderDependencies {
  cacheDirectory: string
  fetch: typeof fetch
  register: typeof registerFont
}

interface UnicodeRange {
  end: number
  start: number
}

interface WoffFace {
  url: string
  weight: FontWeight
}

let bundledFontsRegistered = false

export async function registerScreenshotSetFonts(packageRoot: string, sets: ScreenshotSet[]): Promise<void> {
  registerBundledFonts(packageRoot)
  const dependencies: FontLoaderDependencies = {
    cacheDirectory: FONT_CACHE_DIRECTORY,
    fetch,
    register: registerFont,
  }
  await Promise.all(collectFontRequests(sets).map((request) => loadBunnyFont(request, dependencies)))
}

export async function loadBunnyFont(
  request: RenderFontRequest,
  dependencies: FontLoaderDependencies,
): Promise<void> {
  const stylesheetUrl = new URL("/css", BUNNY_FONT_ORIGIN)
  stylesheetUrl.searchParams.set("family", `${request.family}:${FONT_WEIGHTS.join(",")}`)
  stylesheetUrl.searchParams.set("display", "swap")
  const stylesheet = await fetchText(stylesheetUrl, dependencies.fetch, `font stylesheet for ${request.family}`)
  const faces = selectWoffFaces(stylesheet, request)
  if (faces.length === 0) {
    throw new Error(`Bunny Fonts did not provide a usable font for ${request.family}`)
  }

  await mkdir(dependencies.cacheDirectory, { recursive: true })
  for (const { url, weight } of faces) {
    let filename = await cacheFont(url, dependencies)
    try {
      dependencies.register(filename, { family: request.family, style: "normal", weight: String(weight) })
    } catch {
      await rm(filename, { force: true })
      filename = await cacheFont(url, dependencies)
      dependencies.register(filename, { family: request.family, style: "normal", weight: String(weight) })
    }
  }
}

export function selectWoffUrls(stylesheet: string, request: RenderFontRequest): string[] {
  return selectWoffFaces(stylesheet, request).map((face) => face.url)
}

function selectWoffFaces(stylesheet: string, request: RenderFontRequest): WoffFace[] {
  const candidates: WoffFace[] = []
  for (const match of stylesheet.matchAll(/@font-face\s*\{([\s\S]*?)\}/giu)) {
    const block = match[1]
    const family = cssValue(block, "font-family").replace(/^(['"])(.*)\1$/u, "$2")
    const weight = Number(cssValue(block, "font-weight"))
    const style = cssValue(block, "font-style")
    if (family !== request.family || !isFontWeight(weight) || style !== "normal") continue
    const range = cssValue(block, "unicode-range")
    if (range && !textIntersectsUnicodeRange(request.text, range)) continue
    const source = cssValue(block, "src")
    const url = source.match(/url\((?:['"]?)(https:\/\/fonts\.bunny\.net\/[^)'"]+\.woff(?:\?[^)'"]*)?)(?:['"]?)\)\s*format\((?:['"])woff(?:['"])\)/iu)?.[1]
    if (url) candidates.push({ url, weight })
  }
  const availableWeights = [...new Set(candidates.map((face) => face.weight))]
  if (availableWeights.length === 0) return []
  const closestWeight = availableWeights
    .reduce((closest, weight) => Math.abs(weight - request.weight) < Math.abs(closest - request.weight) ? weight : closest, availableWeights[0])
  return candidates.filter((face) => face.weight === closestWeight)
}

function collectFontRequests(sets: ScreenshotSet[]): RenderFontRequest[] {
  const requests = new Map<string, RenderFontRequest>()
  for (const set of sets) {
    for (const area of set.areas) {
      for (const element of area.elements) {
        if (element.type !== "text" || LOCAL_RENDER_FONTS.has(element.fontFamily) || element.text.length === 0) continue
        const key = `${element.fontFamily}\0${element.fontWeight}`
        const existing = requests.get(key)
        if (existing) existing.text += `\n${element.text}`
        else requests.set(key, { family: element.fontFamily, text: element.text, weight: element.fontWeight })
      }
    }
  }
  return [...requests.values()]
}

function registerBundledFonts(packageRoot: string): void {
  if (bundledFontsRegistered) return
  try {
    registerFont(path.join(packageRoot, "fonts/Geist-Variable.ttf"), { family: "Geist Variable" })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  bundledFontsRegistered = true
}

async function cacheFont(urlValue: string, dependencies: FontLoaderDependencies): Promise<string> {
  const url = new URL(urlValue)
  if (url.protocol !== "https:" || url.hostname !== "fonts.bunny.net") {
    throw new Error(`Refusing font URL outside ${BUNNY_FONT_ORIGIN}`)
  }
  const digest = createHash("sha256").update(url.href).digest("hex")
  const filename = path.join(dependencies.cacheDirectory, `${digest}.woff`)
  if (await fileExists(filename)) return filename

  const response = await dependencies.fetch(url)
  if (!response.ok) throw new Error(`Bunny Fonts returned ${response.status} for ${url.pathname}`)
  const declaredSize = Number(response.headers.get("content-length"))
  if (Number.isFinite(declaredSize) && declaredSize > MAX_FONT_BYTES) throw new Error(`Bunny font exceeds ${MAX_FONT_BYTES} bytes`)
  const contents = Buffer.from(await response.arrayBuffer())
  if (contents.length === 0 || contents.length > MAX_FONT_BYTES) throw new Error(`Invalid Bunny font size: ${contents.length} bytes`)

  const temporary = `${filename}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, contents, { flag: "wx" })
  try {
    await rename(temporary, filename)
  } catch (error) {
    if (!await fileExists(filename)) throw error
    await rm(temporary, { force: true })
  }
  return filename
}

async function fetchText(url: URL, request: typeof fetch, description: string): Promise<string> {
  const response = await request(url, { headers: { accept: "text/css" } })
  if (!response.ok) throw new Error(`Could not load ${description}: Bunny Fonts returned ${response.status}`)
  return response.text()
}

function cssValue(block: string, property: string): string {
  const match = block.match(new RegExp(`(?:^|\\n)\\s*${property}\\s*:\\s*([^;]+)`, "iu"))
  return match?.[1].trim() ?? ""
}

function textIntersectsUnicodeRange(text: string, value: string): boolean {
  const ranges = value.split(",").flatMap(parseUnicodeRange)
  if (ranges.length === 0) return true
  return [...text].some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && ranges.some((range) => codePoint >= range.start && codePoint <= range.end)
  })
}

function parseUnicodeRange(value: string): UnicodeRange[] {
  const normalized = value.trim().replace(/^U\+/iu, "")
  if (/^[0-9A-F]+-[0-9A-F]+$/iu.test(normalized)) {
    const [start, end] = normalized.split("-").map((part) => Number.parseInt(part, 16))
    return [{ start, end }]
  }
  if (/^[0-9A-F?]+$/iu.test(normalized)) {
    return [{
      start: Number.parseInt(normalized.replaceAll("?", "0"), 16),
      end: Number.parseInt(normalized.replaceAll("?", "F"), 16),
    }]
  }
  return []
}

function isFontWeight(value: number): value is FontWeight {
  return Number.isInteger(value) && value >= 100 && value <= 900 && value % 100 === 0
}

async function fileExists(filename: string): Promise<boolean> {
  try {
    await access(filename)
    return true
  } catch {
    return false
  }
}
