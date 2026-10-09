import { lstat, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { builtInArtworkById } from "./artwork.js"
import {
  MOCKUP_BUNDLE_FILENAME,
  parseMockupBundleManifest,
  resolveMockupBundle,
  type DeviceMockup,
} from "./device-mockups.js"
import { flattenCanvasElements } from "./element-tree.js"
import { canvasElementsBounds } from "./legacy-geometry.js"
import { parseLegacyScreenshotSet } from "./legacy-project.js"
import { resolvePackagePublicDirectory } from "./package-assets.js"
import { MigrationLayout } from "./migration-layout.js"
import { defaultConfig, inferSpec, assetSpec } from "./app-store.js"
import { parseStoreShotConfig } from "./app-store-config.js"
import { ProjectStore, parseScreenshotSet } from "./project-store.js"
import type { CanvasElement, LegacyScreenshotSet } from "./legacy-types.js"
import type { ScreenshotSet } from "./shared.js"

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
const cssString = (value: string) =>
  JSON.stringify(value).replaceAll("<", "\\3c ")

export interface MigrationResult {
  migrated: string[]
  skipped: string[]
  backups: string[]
  warnings: string[]
}

/** Preflight every conversion before replacing any original manifest. Backups are never overwritten. */
export async function migrateProject(
  directory: string,
  packageRoot: string,
): Promise<MigrationResult> {
  const store = new ProjectStore(directory)
  const configMetadata = await lstat(store.configPath)
  if (!configMetadata.isFile() || configMetadata.isSymbolicLink())
    throw new Error("storeshot.json must be a regular file")
  const originalConfig = await readFile(store.configPath, "utf8")
  const oldConfig = JSON.parse(originalConfig)
  if (oldConfig.version !== 1 && oldConfig.version !== 2)
    throw new Error("Unsupported project version")
  if (
    oldConfig.version === 1 &&
    (typeof oldConfig.appName !== "string" ||
      !Array.isArray(oldConfig.platforms))
  )
    throw new Error("Invalid legacy project")
  const config =
    oldConfig.version === 2 ? parseStoreShotConfig(oldConfig) : defaultConfig()
  const defaultPage = config.pages.find((page) => page.id === "default")!
  const occupied = new Set<string>()
  const setsMetadata = await lstat(store.setsPath)
  if (!setsMetadata.isDirectory() || setsMetadata.isSymbolicLink())
    throw new Error("sets must be a regular project directory")
  const entries = await readdir(store.setsPath, { withFileTypes: true })
  const plans: Array<{
    set: ScreenshotSet
    original: string
    target: string
    backup: string
  }> = []
  const result: MigrationResult = {
    migrated: [],
    skipped: [],
    backups: [],
    warnings: [],
  }
  if (oldConfig.platforms?.includes("android"))
    result.warnings.push(
      "Android artwork is preserved as unassigned artwork. StoreShot now targets the Apple App Store.",
    )
  // Reserve every current destination before processing legacy files, regardless
  // of filename order. Slots belong to a page as well as a language.
  const documents = []
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (!entry.name.endsWith(".json")) continue
    if (!entry.isFile() || entry.isSymbolicLink())
      throw new Error(`Set ${entry.name} must be a regular file`)
    const target = path.join(store.setsPath, entry.name)
    const original = await readFile(target, "utf8")
    const value = JSON.parse(original)
    if (value.version === 3) {
      const current = await store.readSet(entry.name.slice(0, -5))
      occupied.add(`${current.pageId}/${current.locale}/${current.specId}`)
      const page = config.pages.find((page) => page.id === current.pageId)
      if (!page)
        throw new Error(`Set ${current.id} references a missing product page`)
      if (!page.localizations.includes(current.locale))
        page.localizations.push(current.locale)
      result.skipped.push(entry.name)
    } else documents.push({ entry, target, original, value })
  }
  const publicDirectory = await resolvePackagePublicDirectory(packageRoot)
  const layout = new MigrationLayout()
  try {
    for (const { entry, target, original, value } of documents) {
      const legacy =
        value.version === 2 ? undefined : parseLegacyScreenshotSet(value)
      const id = legacy?.id ?? value.id
      if (`${id}.json` !== entry.name)
        throw new Error(`Set filename does not match id: ${entry.name}`)
      const backup = `${target}.v${value.version}.bak`
      await mustNotExist(backup)
      if (legacy) await mustNotExist(path.join(store.setsPath, id))
      const set = legacy
        ? await convertLegacySet(legacy, store, publicDirectory, layout)
        : await store.readLegacyHtmlSet(id)
      let specId = inferSpec(set.canvas.width, set.canvas.height, set.device)
      const spec = assetSpec(specId)
      if (
        occupied.has(`${set.pageId}/${set.locale}/${specId}`) ||
        (spec && set.areas.length > spec.maxCount) ||
        /android/i.test(set.device)
      )
        specId = "unassigned"
      if (specId === "unassigned")
        result.warnings.push(
          `${set.name}: preserved as unassigned artwork; choose an App Store destination after reviewing it.`,
        )
      occupied.add(`${set.pageId}/${set.locale}/${specId}`)
      if (!defaultPage.localizations.includes(set.locale))
        defaultPage.localizations.push(set.locale)
      set.specId = specId
      parseScreenshotSet(set)
      plans.push({ set, original, target, backup })
    }
  } finally {
    await layout.close()
  }
  const nextConfig = parseStoreShotConfig(config)
  if (JSON.stringify(nextConfig) !== JSON.stringify(oldConfig)) {
    const backup = `${store.configPath}.v${oldConfig.version}.bak`
    await mustNotExist(backup)
    await writeFile(backup, originalConfig, { flag: "wx" })
    result.backups.push(backup)
    await store.writeConfig(nextConfig)
  }
  for (const plan of plans) {
    await writeFile(plan.backup, plan.original, { flag: "wx" })
    try {
      await store.writeMigratedSet(plan.set)
    } catch (error) {
      // The old manifest is still intact unless the final atomic rename succeeded.
      // Keep the backup for recovery even when a write is interrupted.
      throw new Error(
        `Migration stopped at ${plan.set.id}; original saved in ${plan.backup}`,
        { cause: error },
      )
    }
    result.migrated.push(plan.set.id)
    result.backups.push(plan.backup)
  }
  return result
}

async function mustNotExist(target: string): Promise<void> {
  try {
    await lstat(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
  throw new Error(
    `Migration would overwrite ${target}; move it aside before retrying`,
  )
}

export async function convertLegacySet(
  set: LegacyScreenshotSet,
  store: ProjectStore,
  publicDirectory: string,
  layout: MigrationLayout,
): Promise<ScreenshotSet> {
  const mockups = new Map<string, DeviceMockup>()
  const allElements = set.areas.flatMap((area) =>
    flattenCanvasElements(area.elements),
  )
  for (const element of allElements) {
    if (element.type !== "mockup" || mockups.has(element.mockupId)) continue
    const [bundleId] = element.mockupId.split("/")
    const builtInDirectory = path.join(
      publicDirectory,
      "mockup-bundles",
      bundleId,
    )
    const manifest =
      bundleId === "frameup-free"
        ? parseMockupBundleManifest(
            JSON.parse(
              await readFile(
                path.join(builtInDirectory, MOCKUP_BUNDLE_FILENAME),
                "utf8",
              ),
            ),
          )
        : await store.readMockupBundleManifest(bundleId)
    const mockup = resolveMockupBundle(manifest, "", "project").mockups.find(
      (candidate) => candidate.id === element.mockupId,
    )
    const entry = manifest.mockups.find(
      (candidate) => `${bundleId}/${candidate.id}` === element.mockupId,
    )
    if (!mockup || !entry)
      throw new Error(`Missing mockup: ${element.mockupId}`)
    const frame =
      bundleId === "frameup-free"
        ? path.join(builtInDirectory, entry.frame)
        : await store.resolveExistingMockupBundleFile(bundleId, entry.frame)
    mockups.set(element.mockupId, { ...mockup, frameUrl: await dataUrl(frame) })
  }
  const fontLinks = migrationFontLinks(allElements)
  await layout.loadFonts(fontLinks)
  const asset = async (id: string) => {
    const [category, ...names] = id.split("/")
    if (names.length !== 1) throw new Error(`Invalid asset id ${id}`)
    await store.resolveExistingAsset(category, names[0])
    return `../../assets/${encodeURIComponent(category)}/${encodeURIComponent(names[0])}`
  }
  async function render(element: CanvasElement): Promise<string> {
    const e = element
    const style = `position:absolute;left:${e.x}px;top:${e.y}px;width:${e.width}px;height:${e.height}px;opacity:${e.opacity};transform-origin:0 0;transform:rotate(${e.rotation}deg);`
    let inside = ""
    if (e.type === "text") {
      const family = browserFontFamily(e.fontFamily)
      const lines = await layout.textLines(e, family, !isSystemFont(family))
      const lineHeight = (e.lineHeight ?? e.fontSize * 1.05) * 1.13
      const baseline = e.fontSize * 1.13 * (1 - 0.222)
      const x =
        e.textAlign === "center"
          ? e.width / 2
          : e.textAlign === "right"
            ? e.width
            : 0
      const anchor =
        e.textAlign === "center"
          ? "middle"
          : e.textAlign === "right"
            ? "end"
            : "start"
      inside = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style="overflow:visible"><text fill="${escape(e.color)}" text-anchor="${anchor}" style="font-family:${escape(cssString(family))},sans-serif;font-size:${e.fontSize}px;font-weight:${e.fontWeight};white-space:pre">${lines.map((line, index) => `<tspan x="${x}" y="${baseline + index * lineHeight}">${escape(line)}</tspan>`).join("")}</text></svg>`
    }
    if (e.type === "shape") {
      const attributes = `fill="${escape(e.fill)}" stroke="${escape(e.stroke)}" stroke-width="${e.strokeWidth}"`
      const shape =
        e.shape === "line"
          ? `<line x1="0" y1="0" x2="${e.width}" y2="${e.height}" ${attributes}/>`
          : e.shape === "circle"
            ? `<ellipse cx="${e.width / 2}" cy="${e.height / 2}" rx="${e.width / 2}" ry="${e.height / 2}" ${attributes}/>`
            : `<rect width="${e.width}" height="${e.height}" rx="${e.cornerRadius}" ${attributes}/>`
      inside = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style="overflow:visible">${shape}</svg>`
    }
    if (e.type === "image") {
      let source: string
      let svg: string | undefined
      if (e.source.kind === "asset") {
        source = await asset(e.source.assetId)
        if (e.source.assetId.toLowerCase().endsWith(".svg")) {
          const [category, filename] = e.source.assetId.split("/")
          svg = await readFile(
            await store.resolveExistingAsset(category, filename),
            "utf8",
          )
        }
      } else {
        const artwork = builtInArtworkById(e.source.id)
        if (!artwork) throw new Error(`Missing artwork ${e.source.id}`)
        const filename = path.join(
          publicDirectory,
          artwork.url.replace(/^\//, ""),
        )
        svg = await readFile(filename, "utf8")
        source = ""
      }
      // The old renderer stretched images and SVG geometry to the layer bounds, regardless of fit.
      inside = svg
        ? await layout.normalizeSvg(svg, e.fill)
        : e.fill
          ? `<div style="width:100%;height:100%;background:${escape(e.fill)};mask:url(${escape(cssString(source))}) 0 0 / 100% 100% no-repeat"></div>`
          : `<img alt="" src="${escape(source)}" style="width:100%;height:100%;object-fit:fill">`
    }
    if (e.type === "mockup") {
      const mockup = mockups.get(e.mockupId)!
      const screen = mockup.screen
      const source = await asset(e.assetId)
      let screenStyle: string
      if (screen.kind === "rect") {
        screenStyle = `left:${screen.x}px;top:${screen.y}px;width:${screen.width}px;height:${screen.height}px;border-radius:${screen.cornerRadius}px`
      } else {
        const m = screen.transform,
          w = mockup.width,
          h = mockup.height
        const matrix = [
          m[0][0] * w,
          m[1][0] * h,
          0,
          m[2][0],
          m[0][1] * w,
          m[1][1] * h,
          0,
          m[2][1],
          0,
          0,
          1,
          0,
          m[0][2] * w,
          m[1][2] * h,
          0,
          m[2][2],
        ]
        screenStyle = `left:0;top:0;width:1px;height:1px;transform-origin:0 0;transform:matrix3d(${matrix.join(",")});border-radius:${screen.sourceCornerRadius.x * 100}% / ${screen.sourceCornerRadius.y * 100}%`
      }
      // Fabric first rasterized the frame at its intrinsic size, then enlarged it.
      // A half-pixel native filter approximates that sampling while keeping the source image editable.
      const sampling =
        Math.max(e.width / mockup.width, e.height / mockup.height) > 1
          ? "filter:blur(0.5px);"
          : ""
      inside = `<div style="${sampling}width:${mockup.width}px;height:${mockup.height}px;transform-origin:0 0;transform:scale(${e.width / mockup.width},${e.height / mockup.height});position:relative"><img alt="" src="${escape(source)}" style="position:absolute;${screenStyle}"><img alt="" src="${escape(mockup.frameUrl)}" style="position:absolute;inset:0;width:100%;height:100%"></div>`
    }
    if (e.type === "group") {
      const bounds = canvasElementsBounds(e.children)
      const w = Math.max(1, bounds.right - bounds.left),
        h = Math.max(1, bounds.bottom - bounds.top)
      inside = `<div style="position:absolute;transform-origin:0 0;transform:scale(${e.width / w},${e.height / h})"><div style="position:absolute;left:${-bounds.left}px;top:${-bounds.top}px">${(await Promise.all(e.children.map(render))).join("\n")}</div></div>`
    }
    return `<div data-layer="${escape(e.id)}" style="${style}"><div style="width:100%;height:100%;transform:scale(${e.flipX ? -1 : 1},${e.flipY ? -1 : 1})">${inside}</div></div>`
  }
  const areas = await Promise.all(
    set.areas.map(async (area) => ({
      id: area.id,
      name: area.name,
      html: `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escape(area.name)}</title>${fontLinks}<style>\n*{box-sizing:border-box}html,body{margin:0;width:${set.canvas.width}px;height:${set.canvas.height}px;overflow:hidden}body{position:relative;background:${area.background}}\n</style></head><body>\n${(await Promise.all(area.elements.map(render))).join("\n")}\n</body></html>\n`,
    })),
  )
  return { ...set, version: 3, pageId: "default", specId: "unassigned", areas }
}

async function dataUrl(filename: string): Promise<string> {
  const extension = path.extname(filename).toLowerCase()
  const mime =
    extension === ".svg"
      ? "image/svg+xml"
      : extension === ".ttf"
        ? "font/ttf"
        : extension === ".webp"
          ? "image/webp"
          : [".jpg", ".jpeg"].includes(extension)
            ? "image/jpeg"
            : "image/png"
  return `data:${mime};base64,${(await readFile(filename)).toString("base64")}`
}

function browserFontFamily(family: string): string {
  return family === "Geist Variable" ? "Geist" : family
}

export function migrationFontLinks(allElements: CanvasElement[]): string {
  const fonts = new Set<string>()
  for (const element of allElements) {
    if (element.type !== "text") continue
    const family = browserFontFamily(element.fontFamily)
    if (isSystemFont(family)) continue
    fonts.add(family)
  }
  // Normal CSS links keep the HTML small and let browsers handle caching and loading.
  return [...fonts]
    .map((family) => {
      const query = `${family.toLowerCase().replaceAll(" ", "-")}:100,200,300,400,500,600,700,800,900`
      return `<link rel="stylesheet" href="https://fonts.bunny.net/css?family=${escape(encodeURIComponent(query))}&amp;display=swap">`
    })
    .join("\n")
}

function isSystemFont(family: string): boolean {
  return [
    "arial",
    "georgia",
    "times new roman",
    "sans-serif",
    "serif",
    "monospace",
  ].includes(family.toLowerCase())
}
