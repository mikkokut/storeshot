import { cache as fabricCache } from "fabric"

import type { FontWeight } from "../shared"

export const FONT_WEIGHTS: FontWeight[] = [100, 200, 300, 400, 500, 600, 700, 800, 900]
export const LOCAL_FONT_FAMILY = "Geist Variable"

export interface BunnyFont {
  category: string
  familyName: string
  id: string
  weights: FontWeight[]
}

interface BunnyFontResponse {
  category?: unknown
  familyName?: unknown
  weights?: unknown
}

let catalogPromise: Promise<BunnyFont[]> | null = null
const stylesheetPromises = new Map<string, Promise<void>>()
const previewRequestedFamilies = new Set<string>()
const previewQueue = new Map<string, BunnyFont>()
let previewQueueTimer: ReturnType<typeof setTimeout> | undefined

export function getBunnyFontCatalog(): Promise<BunnyFont[]> {
  catalogPromise ??= fetch("https://fonts.bunny.net/list")
    .then((response) => {
      if (!response.ok) throw new Error(`Bunny Fonts returned ${response.status}`)
      return response.json() as Promise<Record<string, BunnyFontResponse>>
    })
    .then((catalog) => Object.entries(catalog)
      .flatMap(([id, value]): BunnyFont[] => {
        if (typeof value.familyName !== "string" || typeof value.category !== "string" || !Array.isArray(value.weights)) return []
        const weights = value.weights.filter(isFontWeight)
        return weights.length > 0 ? [{ id, familyName: value.familyName, category: value.category, weights }] : []
      })
      .sort((left, right) => left.familyName.localeCompare(right.familyName)))
    .catch((error) => {
      catalogPromise = null
      throw error
    })
  return catalogPromise
}

export async function loadBunnyFont(familyName: string, weight: FontWeight): Promise<void> {
  if (isLocalFont(familyName)) return

  let stylesheetPromise = stylesheetPromises.get(familyName)
  if (!stylesheetPromise) {
    stylesheetPromise = new Promise<void>((resolve, reject) => {
      const url = new URL("https://fonts.bunny.net/css")
      url.searchParams.set("family", `${familyName}:${FONT_WEIGHTS.join(",")}`)
      url.searchParams.set("display", "swap")

      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = url.toString()
      link.dataset.storeshotBunnyFont = familyName
      link.addEventListener("load", () => resolve(), { once: true })
      link.addEventListener("error", () => reject(new Error(`Could not load ${familyName}`)), { once: true })
      document.head.append(link)
    }).catch((error) => {
      stylesheetPromises.delete(familyName)
      throw error
    })
    stylesheetPromises.set(familyName, stylesheetPromise)
  }

  await stylesheetPromise
  await document.fonts.load(`${weight} 16px ${JSON.stringify(familyName)}`)
  fabricCache.clearFontCache(familyName)
}

export async function loadBunnyFontPreviews(fonts: BunnyFont[]): Promise<void> {
  const pendingFonts = fonts.filter((font) => !isLocalFont(font.familyName) && !previewRequestedFamilies.has(font.familyName))
  if (pendingFonts.length === 0) return
  pendingFonts.forEach((font) => previewRequestedFamilies.add(font.familyName))

  const familyQuery = pendingFonts
    .map((font) => `${font.familyName}:${closestWeight(font.weights, 400)}`)
    .join("|")
  const url = new URL("https://fonts.bunny.net/css")
  url.searchParams.set("family", familyQuery)
  url.searchParams.set("display", "swap")

  try {
    await new Promise<void>((resolve, reject) => {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = url.toString()
      link.dataset.storeshotBunnyFontPreview = ""
      link.addEventListener("load", () => resolve(), { once: true })
      link.addEventListener("error", () => reject(new Error("Could not load font previews")), { once: true })
      document.head.append(link)
    })
    await Promise.all(pendingFonts.map((font) => document.fonts.load(`${closestWeight(font.weights, 400)} 18px ${JSON.stringify(font.familyName)}`)))
  } catch (error) {
    pendingFonts.forEach((font) => previewRequestedFamilies.delete(font.familyName))
    throw error
  }
}

export function queueBunnyFontPreview(font: BunnyFont): void {
  if (isLocalFont(font.familyName) || previewRequestedFamilies.has(font.familyName)) return

  previewQueue.set(font.familyName, font)
  if (previewQueueTimer) return

  previewQueueTimer = setTimeout(() => {
    previewQueueTimer = undefined
    const fonts = [...previewQueue.values()]
    previewQueue.clear()
    void loadBunnyFontPreviews(fonts).catch(() => undefined)
  }, 50)
}

export function isFontWeight(value: unknown): value is FontWeight {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 900 && value % 100 === 0
}

function isLocalFont(familyName: string): boolean {
  return familyName === LOCAL_FONT_FAMILY || familyName === "Arial" || familyName === "Georgia" || familyName === "Times New Roman"
}

function closestWeight(weights: FontWeight[], target: FontWeight): FontWeight {
  return weights.reduce((closest, weight) => Math.abs(weight - target) < Math.abs(closest - target) ? weight : closest, weights[0] ?? 400)
}
