import { inspectArtworkTarget } from "./annotation-context.js"
import type { ArtworkAnnotationContext } from "./shared.js"
import type { Page } from "puppeteer-core"
import { exportPath } from "./app-store.js"
import { lstat, mkdir, realpath, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import path from "node:path"
import puppeteer, { type Browser } from "puppeteer-core"
import { serveArtboardResource } from "./artboard-files.js"
import type { ProjectStore } from "./project-store.js"
import type { ScreenshotArea, ScreenshotSet } from "./shared.js"

export interface RenderOptions {
  clean: boolean
  outputDirectory: string
  scale: number
  sets: ScreenshotSet[]
  store: ProjectStore
  area?: string
  chrome?: string
}
export interface RenderedFile { areaId: string; height: number; path: string; setId: string; width: number }
export interface RenderResult { files: RenderedFile[]; outputDirectory: string }

export async function launchChrome(executablePath = process.env.STORESHOT_CHROME): Promise<Browser> {
  try {
    return await puppeteer.launch({ headless: true, ...(executablePath ? { executablePath } : { channel: "chrome" as const }) })
  } catch (error) {
    throw new Error("Could not launch Chrome. Install Google Chrome or set STORESHOT_CHROME (or --chrome) to a Chrome/Chromium executable.", { cause: error })
  }
}

/** Serve only project artwork on an ephemeral loopback port; never use file:// access. */
export async function createBrowserRenderer(store: ProjectStore, chrome?: string) {
  const server = createServer((request, response) => {
    void serveArtboardResource(request, response, store.root).then((served) => {
      if (!served) response.writeHead(404).end()
    }).catch(() => response.writeHead(500).end())
  })
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  let browser: Browser
  try { browser = await launchChrome(chrome) } catch (error) { server.close(); throw error }
  async function withArtboard<T>(set: ScreenshotSet, area: ScreenshotArea, scale: number, action: (page: Page) => Promise<T>): Promise<T> {
    if (!Number.isFinite(scale) || scale <= 0 || scale > 1) throw new Error("Render scale must be greater than 0 and at most 1")
    if (Math.round(set.canvas.width * scale) < 1 || Math.round(set.canvas.height * scale) < 1) throw new Error("Render scale is too small for this artboard")
    const page = await browser.newPage()
    const failures = new Set<string>()
    try {
      await page.setJavaScriptEnabled(false)
      await page.setViewport({ width: Math.round(set.canvas.width), height: Math.round(set.canvas.height), deviceScaleFactor: scale })
      await page.setRequestInterception(true)
      page.on("request", (request) => {
        const url = new URL(request.url())
        if (url.origin === origin && url.pathname === "/favicon.ico") { void request.respond({ status: 204 }); return }
        const remoteFontResource = ["http:", "https:"].includes(url.protocol) && ["stylesheet", "font"].includes(request.resourceType())
        if (remoteFontResource || url.protocol === "data:" || (url.origin === origin && url.pathname.startsWith("/artboards/"))) void request.continue()
        else { failures.add(request.url()); void request.abort() }
      })
      page.on("requestfailed", (request) => failures.add(request.url()))
      page.on("response", (response) => { if (response.status() >= 400) failures.add(response.url()) })
      const url = `${origin}/artboards/sets/${set.id}/${area.id}.html`
      const response = await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 })
      if (!response?.ok()) throw new Error(`Could not open artboard ${area.id}`)
      await page.evaluate(async () => {
        await document.fonts.ready
        await Promise.all(Array.from(document.images, (image) => image.decode()))
      })
      if (failures.size) throw new Error(`Artboard ${area.name} has missing or blocked resources: ${[...failures].join(", ")}`)
      // Capture exactly the set viewport, independently of body/document overflow.
      return await action(page)
    } finally { await page.close() }
  }
  return {
    render(set: ScreenshotSet, area: ScreenshotArea, scale = 1): Promise<Buffer> {
      return withArtboard(set, area, scale, async page => Buffer.from(await page.screenshot({ type: "png", fullPage: false })))
    },
    annotationContext(set: ScreenshotSet, area: ScreenshotArea, point: { x: number; y: number }): Promise<ArtworkAnnotationContext> {
      return withArtboard(set, area, 1, page => page.evaluate(inspectArtworkTarget, point))
    },
    async close() {
      try { await browser.close() } finally {
        server.closeAllConnections()
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
      }
    },
  }
}

export async function renderScreenshotSets(options: RenderOptions): Promise<RenderResult> {
  if (!Number.isFinite(options.scale) || options.scale <= 0 || options.scale > 1) throw new Error("Render scale must be greater than 0 and at most 1")
  if (options.area && options.sets.length !== 1) throw new Error("--area can only be used when rendering one set")
  const selections = options.sets.map((set) => ({ set, areas: selectAreas(set, options.area) }))
  const outputDirectory = path.resolve(options.outputDirectory)
  const root = await realpath(options.store.root)
  if (await resolveFuturePath(outputDirectory) === root) {
    throw new Error("Render output must not overlap project source files")
  }
  // --clean must never delete the project or its source folders.
  for (const { set } of selections) {
    const target = path.join(outputDirectory, exportPath(set))
    await assertNoOutputSymlinks(target, outputDirectory)
    const resolvedTarget = await resolveFuturePath(target)
    const relative = path.relative(resolvedTarget, root)
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)) ||
      ["sets", "assets"].some((name) => { const source = path.join(root, name); return resolvedTarget === source || resolvedTarget.startsWith(`${source}${path.sep}`) })) {
      throw new Error("Render output must not overlap project source files")
    }
  }
  const renderer = await createBrowserRenderer(options.store, options.chrome)
  const files: RenderedFile[] = []
  try {
    for (const { set, areas } of selections) {
      const directory = path.join(outputDirectory, exportPath(set))
      if (options.clean) await rm(directory, { recursive: true, force: true })
      await mkdir(directory, { recursive: true })
      const manifestPath = path.join(directory, "manifest.json")
      await assertNoOutputSymlinks(manifestPath, outputDirectory)
      await writeFile(manifestPath, JSON.stringify({ pageId: set.pageId, locale: set.locale, specId: set.specId, scale: options.scale, previewOnly: options.scale !== 1 }, null, 2))
      for (const { area, index } of areas) {
        const filename = `${String(index + 1).padStart(2, "0")}-${safeFileNamePart(area.name, `screenshot-${index + 1}`)}.png`
        const target = path.join(directory, filename)
        await assertNoOutputSymlinks(target, outputDirectory)
        await writeFile(target, await renderer.render(set, area, options.scale))
        files.push({ areaId: area.id, setId: set.id, path: target, width: Math.max(1, Math.round(set.canvas.width * options.scale)), height: Math.max(1, Math.round(set.canvas.height * options.scale)) })
      }
    }
    return { files, outputDirectory }
  } finally { await renderer.close() }
}

function selectAreas(set: ScreenshotSet, selector?: string): Array<{ area: ScreenshotArea; index: number }> {
  if (!selector) return set.areas.map((area, index) => ({ area, index }))
  const index = /^\d+$/.test(selector) ? Number(selector) - 1 : set.areas.findIndex((area) => area.id === selector || area.name === selector)
  const area = set.areas[index]
  if (!area) throw new Error(`Set ${set.id} has no area matching ${selector}`)
  return [{ area, index }]
}
function safeFileNamePart(value: string, fallback: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || fallback
}

async function resolveFuturePath(target: string): Promise<string> {
  try { return await realpath(target) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    return path.join(await resolveFuturePath(path.dirname(target)), path.basename(target))
  }
}

async function assertNoOutputSymlinks(target: string, boundary: string): Promise<void> {
  // Inspect the requested output root and every descendant. Ancestors above it
  // may include OS-managed aliases such as /tmp and /var on macOS.
  let current = target
  while (true) {
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error("Render output cannot overwrite symbolic links")
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    if (current === boundary) return
    current = path.dirname(current)
  }
}
