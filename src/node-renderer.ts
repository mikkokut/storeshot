import { readFile, readdir, mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"

import { createCanvas, loadImage, type Canvas, type Image as CanvasImage } from "canvas"
import {
  Circle,
  FabricImage,
  Group,
  Line,
  Rect,
  StaticCanvas,
  Textbox,
  filters,
  loadSVGFromString,
  util,
  type FabricObject,
} from "fabric/node"

import { builtInArtworkById } from "./artwork.js"
import {
  MOCKUP_BUNDLE_FILENAME,
  parseMockupBundleManifest,
  resolveMockupBundle,
  type DeviceMockup,
  type Point,
  type ProjectiveTransform,
} from "./device-mockups.js"
import { resolvePackagePublicDirectory } from "./package-assets.js"
import { registerScreenshotSetFonts } from "./node-fonts.js"
import { ProjectStore } from "./project-store.js"
import { DEFAULT_TEXT_LINE_HEIGHT_RATIO, type CanvasElement, type ScreenshotArea, type ScreenshotSet } from "./shared.js"

export interface RenderOptions {
  clean: boolean
  outputDirectory: string
  packageRoot: string
  scale: number
  sets: ScreenshotSet[]
  store: ProjectStore
  area?: string
}

export interface RenderedFile {
  areaId: string
  height: number
  path: string
  setId: string
  width: number
}

export interface RenderResult {
  files: RenderedFile[]
  outputDirectory: string
}

interface RenderResources {
  assetSources: Map<string, string>
  mockups: Map<string, DeviceMockup>
  publicDirectory: string
}

interface RequiredResources {
  assets: Set<string>
  mockups: Set<string>
}

export async function renderScreenshotSets(options: RenderOptions): Promise<RenderResult> {
  if (!Number.isFinite(options.scale) || options.scale <= 0 || options.scale > 1) {
    throw new Error("Render scale must be greater than 0 and at most 1")
  }
  if (options.area && options.sets.length !== 1) throw new Error("--area can only be used when rendering one set")

  const selections = options.sets.map((set) => ({ set, areas: selectAreas(set, options.area) }))
  const selectedSets = selections.map(({ set, areas }) => ({
    ...set,
    areas: areas.map(({ area }) => area),
  }))
  await registerScreenshotSetFonts(options.packageRoot, selectedSets)
  const resources = await loadRenderResources(options.store, options.packageRoot, requiredResources(selectedSets))
  const outputDirectory = path.resolve(options.outputDirectory)
  const files: RenderedFile[] = []

  for (const { set, areas: selectedAreas } of selections) {
    const setDirectory = path.join(outputDirectory, set.id)
    if (options.clean) await rm(setDirectory, { recursive: true, force: true })
    await mkdir(setDirectory, { recursive: true })
    for (const { area, index } of selectedAreas) {
      const outputPath = path.join(setDirectory, `${String(index + 1).padStart(2, "0")}-${safeFileNamePart(area.name, `screenshot-${index + 1}`)}.png`)
      const data = await renderArea(area, set, resources, options.scale)
      await writeFile(outputPath, data)
      files.push({
        areaId: area.id,
        height: Math.round(set.canvas.height * options.scale),
        path: outputPath,
        setId: set.id,
        width: Math.round(set.canvas.width * options.scale),
      })
    }
  }

  return { files, outputDirectory }
}

async function renderArea(
  area: ScreenshotArea,
  set: ScreenshotSet,
  resources: RenderResources,
  scale: number,
): Promise<Buffer> {
  const width = Math.max(1, Math.round(set.canvas.width * scale))
  const height = Math.max(1, Math.round(set.canvas.height * scale))
  const canvas = new StaticCanvas(undefined, {
    width,
    height,
    backgroundColor: area.background,
    renderOnAddRemove: false,
  })

  try {
    for (const element of area.elements) {
      const object = await createFabricObject(element, resources)
      applyCanvasElement(object, element, scale)
      object.set({ evented: false, selectable: false })
      canvas.add(object)
    }
    canvas.renderAll()
    return canvas.getNodeCanvas().toBuffer("image/png")
  } finally {
    canvas.dispose()
  }
}

async function createFabricObject(element: CanvasElement, resources: RenderResources): Promise<FabricObject> {
  if (element.type === "text") return new Textbox(element.text, { editable: false, lockScalingFlip: true, minWidth: 24 })
  if (element.type === "shape") {
    if (element.shape === "circle") return new Circle({ lockScalingFlip: true, radius: 0.5 })
    if (element.shape === "line") return new Line([0, 0, 1, 1], { lockScalingFlip: true })
    return new Rect({ lockScalingFlip: true })
  }

  if (element.type === "mockup") {
    const screenshot = resources.assetSources.get(element.assetId)
    const mockup = resources.mockups.get(element.mockupId)
    if (!screenshot) throw new Error(`Missing asset ${element.assetId}`)
    if (!mockup) throw new Error(`Missing mockup ${element.mockupId}`)
    return renderDeviceMockup(mockup, screenshot)
  }

  const source = element.source.kind === "builtin"
    ? await builtInArtworkSource(element.source.id, resources.publicDirectory)
    : resources.assetSources.get(element.source.assetId)
  if (!source) throw new Error(`Missing image source for element ${element.id}`)

  let object: FabricObject
  if (source.startsWith("data:image/svg+xml")) {
    const svg = Buffer.from(source.slice(source.indexOf(",") + 1), "base64").toString("utf8")
    const loaded = await loadSVGFromString(svg)
    const objects = loaded.objects.filter((candidate): candidate is FabricObject => candidate !== null)
    if (objects.length === 0) throw new Error(`SVG source for element ${element.id} is empty`)
    object = util.groupSVGElements(objects, loaded.options)
    object.set({ lockScalingFlip: true })
  } else {
    object = await FabricImage.fromURL(source, {}, { imageSmoothing: true, lockScalingFlip: true })
  }

  if (element.fill) applyGraphicColor(object, element.fill)
  return object
}

function applyCanvasElement(object: FabricObject, element: CanvasElement, scale: number): void {
  object.set({
    angle: element.rotation,
    left: element.x * scale,
    opacity: element.opacity,
    originX: "left",
    originY: "top",
    top: element.y * scale,
  })

  if (element.type === "text" && object instanceof Textbox) {
    object.set({
      fill: element.color,
      fontFamily: element.fontFamily,
      fontSize: element.fontSize * scale,
      fontWeight: element.fontWeight,
      lineHeight: element.lineHeight === undefined ? DEFAULT_TEXT_LINE_HEIGHT_RATIO : element.lineHeight / element.fontSize,
      scaleX: 1,
      scaleY: 1,
      strokeWidth: 0,
      text: element.text,
      textAlign: element.textAlign,
      width: Math.max(24, element.width * scale),
    })
    object.initDimensions()
  } else if (element.type === "shape") {
    object.set({
      fill: element.fill,
      scaleX: element.shape === "rectangle" ? 1 : element.width * scale,
      scaleY: element.shape === "rectangle" ? 1 : element.height * scale,
      stroke: element.stroke,
      strokeUniform: true,
      strokeWidth: element.strokeWidth * scale,
    })
    if (element.shape === "rectangle" && object instanceof Rect) {
      object.set({
        height: element.height * scale,
        rx: element.cornerRadius * scale,
        ry: element.cornerRadius * scale,
        width: element.width * scale,
      })
    }
  } else {
    object.set({
      scaleX: (element.width * scale) / Math.max(1, object.width),
      scaleY: (element.height * scale) / Math.max(1, object.height),
    })
  }
  object.setCoords()
}

async function loadRenderResources(store: ProjectStore, packageRoot: string, required: RequiredResources): Promise<RenderResources> {
  const [project, publicDirectory] = await Promise.all([
    store.readProject(),
    resolvePackagePublicDirectory(packageRoot),
  ])
  const assetSources = new Map<string, string>()
  await Promise.all(Object.values(project.assets).flat().filter((asset) => required.assets.has(asset.id)).map(async (asset) => {
    const filename = await store.resolveExistingAsset(asset.category, asset.name)
    assetSources.set(asset.id, dataUrl(filename, await readFile(filename)))
  }))

  const mockups = new Map<string, DeviceMockup>()
  await loadMockupBundle(
    path.join(publicDirectory, "mockup-bundles/frameup-free"),
    "built-in",
    mockups,
    required.mockups,
  )

  const entries = await readdir(store.mockupBundlesPath, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue
    if (![...required.mockups].some((mockupId) => mockupId.startsWith(`${entry.name}/`))) continue
    await loadMockupBundle(path.join(store.mockupBundlesPath, entry.name), "project", mockups, required.mockups, store)
  }

  return { assetSources, mockups, publicDirectory }
}

async function loadMockupBundle(
  directory: string,
  origin: "built-in" | "project",
  target: Map<string, DeviceMockup>,
  requiredMockups: Set<string>,
  store?: ProjectStore,
): Promise<void> {
  const manifest = parseMockupBundleManifest(JSON.parse(await readFile(path.join(directory, MOCKUP_BUNDLE_FILENAME), "utf8")))
  const catalog = resolveMockupBundle(manifest, "", origin)
  for (const mockup of catalog.mockups) {
    if (!requiredMockups.has(mockup.id)) continue
    const entry = manifest.mockups.find((candidate) => `${manifest.id}/${candidate.id}` === mockup.id)
    if (!entry) continue
    const framePath = store
      ? await store.resolveExistingMockupBundleFile(manifest.id, entry.frame)
      : path.join(directory, entry.frame)
    target.set(mockup.id, { ...mockup, frameUrl: dataUrl(framePath, await readFile(framePath)) })
  }
}

async function builtInArtworkSource(id: string, publicDirectory: string): Promise<string | undefined> {
  const artwork = builtInArtworkById(id)
  if (!artwork) return undefined
  const filename = path.join(publicDirectory, artwork.url.replace(/^\//, ""))
  return dataUrl(filename, await readFile(filename))
}

async function renderDeviceMockup(mockup: DeviceMockup, screenshotUrl: string): Promise<FabricImage> {
  const [frame, screenshot] = await Promise.all([
    loadImage(mockup.frameUrl),
    loadImage(screenshotUrl),
  ])
  const canvas = createCanvas(mockup.width, mockup.height)
  const context = canvas.getContext("2d")
  context.imageSmoothingEnabled = true

  if (mockup.screen.kind === "rect") {
    const screen = mockup.screen
    context.save()
    context.beginPath()
    context.roundRect(screen.x, screen.y, screen.width, screen.height, screen.cornerRadius)
    context.clip()
    context.drawImage(screenshot, screen.x, screen.y, screen.width, screen.height)
    context.restore()
  } else {
    const masked = maskRoundedScreenshot(screenshot, mockup.screen.sourceCornerRadius)
    drawProjectiveImage(context, masked, mockup.screen.transform, mockup.width, mockup.height)
  }

  context.drawImage(frame, 0, 0, mockup.width, mockup.height)
  return new FabricImage(canvas as unknown as HTMLCanvasElement, { imageSmoothing: true, lockScalingFlip: true })
}

function maskRoundedScreenshot(image: CanvasImage, radius: Point): Canvas {
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext("2d")
  context.imageSmoothingEnabled = true
  context.beginPath()
  roundedRectPath(context, canvas.width, canvas.height, canvas.width * radius.x, canvas.height * radius.y)
  context.clip()
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

function roundedRectPath(
  context: ReturnType<Canvas["getContext"]>,
  width: number,
  height: number,
  radiusX: number,
  radiusY: number,
): void {
  const rx = Math.min(Math.max(0, radiusX), width / 2)
  const ry = Math.min(Math.max(0, radiusY), height / 2)
  if (rx === 0 || ry === 0) {
    context.rect(0, 0, width, height)
    return
  }
  context.moveTo(rx, 0)
  context.lineTo(width - rx, 0)
  context.ellipse(width - rx, ry, rx, ry, 0, -Math.PI / 2, 0)
  context.lineTo(width, height - ry)
  context.ellipse(width - rx, height - ry, rx, ry, 0, 0, Math.PI / 2)
  context.lineTo(rx, height)
  context.ellipse(rx, height - ry, rx, ry, 0, Math.PI / 2, Math.PI)
  context.lineTo(0, ry)
  context.ellipse(rx, ry, rx, ry, 0, Math.PI, Math.PI * 1.5)
  context.closePath()
}

function requiredResources(sets: ScreenshotSet[]): RequiredResources {
  const assets = new Set<string>()
  const mockups = new Set<string>()
  for (const set of sets) {
    for (const area of set.areas) {
      for (const element of area.elements) {
        if (element.type === "mockup") {
          assets.add(element.assetId)
          mockups.add(element.mockupId)
        } else if (element.type === "image" && element.source.kind === "asset") {
          assets.add(element.source.assetId)
        }
      }
    }
  }
  return { assets, mockups }
}

function drawProjectiveImage(
  context: ReturnType<Canvas["getContext"]>,
  image: Canvas,
  transform: ProjectiveTransform,
  frameWidth: number,
  frameHeight: number,
): void {
  const columns = Math.max(12, Math.ceil(frameWidth / 64))
  const rows = Math.max(20, Math.ceil(frameHeight / 64))
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const u0 = column / columns
      const u1 = (column + 1) / columns
      const v0 = row / rows
      const v1 = (row + 1) / rows
      const destination00 = projectPoint(transform, frameWidth, frameHeight, u0, v0)
      const destination10 = projectPoint(transform, frameWidth, frameHeight, u1, v0)
      const destination11 = projectPoint(transform, frameWidth, frameHeight, u1, v1)
      const destination01 = projectPoint(transform, frameWidth, frameHeight, u0, v1)
      const source00 = sourcePoint(image, u0, v0)
      const source10 = sourcePoint(image, u1, v0)
      const source11 = sourcePoint(image, u1, v1)
      const source01 = sourcePoint(image, u0, v1)
      drawImageTriangle(context, image, [source00, source10, source11], [destination00, destination10, destination11])
      drawImageTriangle(context, image, [source00, source11, source01], [destination00, destination11, destination01])
    }
  }
}

function drawImageTriangle(
  context: ReturnType<Canvas["getContext"]>,
  image: Canvas,
  source: [Point, Point, Point],
  destination: [Point, Point, Point],
): void {
  const [source0, source1, source2] = source
  const [destination0, destination1, destination2] = destination
  const denominator = source0.x * (source1.y - source2.y) + source1.x * (source2.y - source0.y) + source2.x * (source0.y - source1.y)
  if (Math.abs(denominator) < Number.EPSILON) return
  const a = (destination0.x * (source1.y - source2.y) + destination1.x * (source2.y - source0.y) + destination2.x * (source0.y - source1.y)) / denominator
  const b = (destination0.y * (source1.y - source2.y) + destination1.y * (source2.y - source0.y) + destination2.y * (source0.y - source1.y)) / denominator
  const c = (destination0.x * (source2.x - source1.x) + destination1.x * (source0.x - source2.x) + destination2.x * (source1.x - source0.x)) / denominator
  const d = (destination0.y * (source2.x - source1.x) + destination1.y * (source0.x - source2.x) + destination2.y * (source1.x - source0.x)) / denominator
  const e = (destination0.x * (source1.x * source2.y - source2.x * source1.y) + destination1.x * (source2.x * source0.y - source0.x * source2.y) + destination2.x * (source0.x * source1.y - source1.x * source0.y)) / denominator
  const f = (destination0.y * (source1.x * source2.y - source2.x * source1.y) + destination1.y * (source2.x * source0.y - source0.x * source2.y) + destination2.y * (source0.x * source1.y - source1.x * source0.y)) / denominator
  context.save()
  const expanded = expandTriangle(destination, 0.75)
  context.beginPath()
  context.moveTo(expanded[0].x, expanded[0].y)
  context.lineTo(expanded[1].x, expanded[1].y)
  context.lineTo(expanded[2].x, expanded[2].y)
  context.closePath()
  context.clip()
  context.setTransform(a, b, c, d, e, f)
  context.drawImage(image, 0, 0)
  context.restore()
}

function projectPoint(transform: ProjectiveTransform, width: number, height: number, u: number, v: number): Point {
  const denominator = transform[2][0] * u + transform[2][1] * v + transform[2][2]
  return {
    x: width * (transform[0][0] * u + transform[0][1] * v + transform[0][2]) / denominator,
    y: height * (transform[1][0] * u + transform[1][1] * v + transform[1][2]) / denominator,
  }
}

function sourcePoint(image: Canvas, u: number, v: number): Point {
  return { x: image.width * u, y: image.height * v }
}

function expandTriangle(points: [Point, Point, Point], amount: number): [Point, Point, Point] {
  const center = {
    x: (points[0].x + points[1].x + points[2].x) / 3,
    y: (points[0].y + points[1].y + points[2].y) / 3,
  }
  return points.map((point) => {
    const length = Math.max(1, Math.hypot(point.x - center.x, point.y - center.y))
    const scale = (length + amount) / length
    return { x: center.x + (point.x - center.x) * scale, y: center.y + (point.y - center.y) * scale }
  }) as [Point, Point, Point]
}

function applyGraphicColor(object: FabricObject, color: string): void {
  if (object instanceof Group) object.getObjects().forEach((child) => applyGraphicColor(child, color))
  else if (object instanceof FabricImage) {
    object.filters = [new filters.BlendColor({ color, mode: "tint", alpha: 1 })]
    object.applyFilters()
  } else {
    object.set({
      fill: typeof object.fill === "string" && !isTransparentPaint(object.fill) ? color : object.fill,
      stroke: typeof object.stroke === "string" && !isTransparentPaint(object.stroke) ? color : object.stroke,
    })
  }
  object.dirty = true
}

function selectAreas(set: ScreenshotSet, selector?: string): Array<{ area: ScreenshotArea; index: number }> {
  if (!selector) return set.areas.map((area, index) => ({ area, index }))
  const numericIndex = /^\d+$/.test(selector) ? Number(selector) - 1 : -1
  const index = numericIndex >= 0
    ? numericIndex
    : set.areas.findIndex((area) => area.id === selector || area.name === selector)
  const area = set.areas[index]
  if (!area) throw new Error(`Set ${set.id} has no area matching ${selector}`)
  return [{ area, index }]
}

function dataUrl(filename: string, contents: Buffer): string {
  const extension = path.extname(filename).toLowerCase()
  const mime = extension === ".svg" ? "image/svg+xml"
    : extension === ".jpg" || extension === ".jpeg" ? "image/jpeg"
      : extension === ".webp" ? "image/webp"
        : "image/png"
  return `data:${mime};base64,${contents.toString("base64")}`
}

function safeFileNamePart(value: string, fallback: string): string {
  const normalized = value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || fallback
}

function isTransparentPaint(value: string): boolean {
  const normalized = value.trim().toLowerCase().replaceAll(" ", "")
  return normalized === "none" || normalized === "transparent" || normalized === "rgba(0,0,0,0)"
}
