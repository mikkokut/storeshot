import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { access, mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  ASSET_CATEGORIES,
  type AppshotConfig,
  type AppshotProject,
  type Asset,
  type AssetCategory,
  type CanvasElement,
  type CreateSetInput,
  type ScreenshotArea,
  type ScreenshotSet,
} from "./shared.js"

export const CONFIG_FILENAME = "appshot.json"
export const ASSETS_DIRECTORY = "assets"
export const SETS_DIRECTORY = "sets"

const supportedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"])
const safeIdentifierPattern = /^[a-z0-9][a-z0-9-]*$/
const hexColorPattern = /^#[0-9a-f]{6}$/i

export class ProjectStore {
  readonly root: string
  readonly configPath: string
  readonly assetsPath: string
  readonly setsPath: string

  constructor(directory: string) {
    this.root = path.resolve(directory)
    this.configPath = path.join(this.root, CONFIG_FILENAME)
    this.assetsPath = path.join(this.root, ASSETS_DIRECTORY)
    this.setsPath = path.join(this.root, SETS_DIRECTORY)
  }

  async initialize(): Promise<void> {
    await mkdir(this.setsPath, { recursive: true })
    await Promise.all(
      ASSET_CATEGORIES.map((category) => mkdir(path.join(this.assetsPath, category), { recursive: true })),
    )

    try {
      await access(this.configPath, constants.F_OK)
    } catch {
      await this.writeConfig({
        version: 1,
        appName: path.basename(this.root),
        platforms: ["ios"],
      })
    }
  }

  async readProject(): Promise<AppshotProject> {
    const [config, assets, sets] = await Promise.all([this.readConfig(), this.listAssets(), this.listSets()])
    return { directory: this.root, config, assets, sets }
  }

  async readConfig(): Promise<AppshotConfig> {
    const value: unknown = JSON.parse(await readFile(this.configPath, "utf8"))
    return parseConfig(value)
  }

  async writeConfig(config: AppshotConfig): Promise<AppshotConfig> {
    const value = parseConfig(config)
    await writeJson(this.configPath, value)
    return value
  }

  async listAssets(): Promise<Record<AssetCategory, Asset[]>> {
    const entries = await Promise.all(
      ASSET_CATEGORIES.map(async (category) => [category, await this.listAssetsInCategory(category)] as const),
    )
    return Object.fromEntries(entries) as Record<AssetCategory, Asset[]>
  }

  async deleteAsset(category: AssetCategory, filename: string): Promise<void> {
    await unlink(this.resolveAsset(category, filename))
  }

  async addAsset(category: string, filename: string, contents: Buffer): Promise<void> {
    const target = this.resolveAsset(category, filename)
    const incomingHash = hash(contents)

    for (const assetCategory of ASSET_CATEGORIES) {
      const directory = path.join(this.assetsPath, assetCategory)
      const entries = await readdir(directory, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile() || !supportedExtensions.has(path.extname(entry.name).toLowerCase())) continue
        const existing = await readFile(path.join(directory, entry.name))
        if (hash(existing) === incomingHash) {
          throw new DuplicateAssetError(`${assetCategory}/${entry.name}`)
        }
      }
    }

    await writeFile(target, contents, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") throw new AssetNameConflictError(filename, category)
      throw error
    })
  }

  resolveAsset(category: string, filename: string): string {
    if (!isAssetCategory(category)) throw new Error("Unsupported asset category")

    const safeName = path.basename(filename)
    const extension = path.extname(safeName).toLowerCase()
    if (safeName !== filename || !supportedExtensions.has(extension)) {
      throw new Error("Unsupported asset filename")
    }

    return path.join(this.assetsPath, category, safeName)
  }

  async listSets(): Promise<ScreenshotSet[]> {
    const entries = await readdir(this.setsPath, { withFileTypes: true })
    const sets = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && path.extname(entry.name) === ".json")
        .map(async (entry) => parseSet(JSON.parse(await readFile(path.join(this.setsPath, entry.name), "utf8")))),
    )
    return sets.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async createSet(input: CreateSetInput): Promise<ScreenshotSet> {
    const value = parseCreateSetInput(input)
    const now = new Date().toISOString()
    const id = `${slugify(value.name)}-${randomUUID().slice(0, 8)}`
    const areaId = `area-${randomUUID()}`
    const set: ScreenshotSet = {
      version: 1,
      id,
      name: value.name,
      locale: value.locale,
      device: value.device,
      canvas: { width: value.width, height: value.height },
      areas: [
        {
          id: areaId,
          name: "Screenshot 1",
          background: "#245f4a",
          elements: [
            {
              id: `element-${randomUUID()}`,
              type: "text",
              text: "Your headline",
              x: Math.round(value.width * 0.08),
              y: Math.round(value.height * 0.07),
              width: Math.round(value.width * 0.84),
              height: Math.round(value.height * 0.2),
              rotation: 0,
              fontSize: Math.max(48, Math.round(value.width * 0.09)),
              fontWeight: 700,
              color: "#ffffff",
              textAlign: "center",
            },
          ],
        },
      ],
      createdAt: now,
      updatedAt: now,
    }
    await writeJson(this.resolveSet(id), set)
    return set
  }

  async writeSet(id: string, set: ScreenshotSet): Promise<ScreenshotSet> {
    if (id !== set.id) throw new Error("Set id cannot be changed")
    const value = parseSet({ ...set, updatedAt: new Date().toISOString() })
    await writeJson(this.resolveSet(id), value)
    return value
  }

  async deleteSet(id: string): Promise<void> {
    await unlink(this.resolveSet(id))
  }

  private async listAssetsInCategory(category: AssetCategory): Promise<Asset[]> {
    const directory = path.join(this.assetsPath, category)
    const entries = await readdir(directory, { withFileTypes: true })
    const files = entries
      .filter((entry) => entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name))

    return Promise.all(
      files.map(async (file) => {
        const metadata = await stat(path.join(directory, file.name))
        return {
          id: `${category}/${file.name}`,
          category,
          name: file.name,
          url: `/api/assets/${category}/${encodeURIComponent(file.name)}`,
          size: metadata.size,
          modifiedAt: metadata.mtime.toISOString(),
        }
      }),
    )
  }

  private resolveSet(id: string): string {
    if (!safeIdentifierPattern.test(id)) throw new Error("Unsupported set id")
    return path.join(this.setsPath, `${id}.json`)
  }
}

export class DuplicateAssetError extends Error {
  constructor(readonly existingAssetId: string) {
    super(`This file is already in the asset catalog as ${existingAssetId}`)
  }
}

export class AssetNameConflictError extends Error {
  constructor(filename: string, category: string) {
    super(`An asset named ${filename} already exists in ${category}`)
  }
}

function hash(contents: Buffer): string {
  return createHash("sha256").update(contents).digest("hex")
}

function parseConfig(value: unknown): AppshotConfig {
  if (!isRecord(value)) throw new Error("appshot.json must contain a JSON object")

  const appName = readString(value.appName, "appName")
  const platforms = Array.isArray(value.platforms)
    ? value.platforms.filter((platform): platform is "ios" | "android" => platform === "ios" || platform === "android")
    : []
  if (platforms.length === 0) throw new Error("platforms must include ios or android")

  return { version: 1, appName, platforms: [...new Set(platforms)] }
}

function parseCreateSetInput(value: unknown): CreateSetInput {
  if (!isRecord(value)) throw new Error("Set details must be an object")
  return {
    name: readString(value.name, "Set name"),
    locale: readString(value.locale, "Locale"),
    device: readString(value.device, "Device"),
    width: readDimension(value.width, "Canvas width"),
    height: readDimension(value.height, "Canvas height"),
  }
}

function parseSet(value: unknown): ScreenshotSet {
  if (!isRecord(value)) throw new Error("Set file must contain an object")

  const id = readString(value.id, "Set id")
  if (!safeIdentifierPattern.test(id)) throw new Error("Set id is invalid")
  if (!isRecord(value.canvas)) throw new Error("Set canvas is invalid")
  if (!Array.isArray(value.areas) || value.areas.length === 0) throw new Error("A set needs at least one screenshot area")

  return {
    version: 1,
    id,
    name: readString(value.name, "Set name"),
    locale: readString(value.locale, "Locale"),
    device: readString(value.device, "Device"),
    canvas: {
      width: readDimension(value.canvas.width, "Canvas width"),
      height: readDimension(value.canvas.height, "Canvas height"),
    },
    areas: value.areas.map(parseArea),
    createdAt: readString(value.createdAt, "Created time"),
    updatedAt: readString(value.updatedAt, "Updated time"),
  }
}

function parseArea(value: unknown): ScreenshotArea {
  if (!isRecord(value)) throw new Error("Screenshot area is invalid")
  const background = readString(value.background, "Area background")
  if (!hexColorPattern.test(background)) throw new Error("Area background must be a hex color")
  if (!Array.isArray(value.elements)) throw new Error("Area elements must be an array")
  return {
    id: readString(value.id, "Area id"),
    name: readString(value.name, "Area name"),
    background,
    elements: value.elements.map(parseElement),
  }
}

function parseElement(value: unknown): CanvasElement {
  if (!isRecord(value)) throw new Error("Canvas element is invalid")
  const base = {
    id: readString(value.id, "Element id"),
    x: readNumber(value.x, "Element x"),
    y: readNumber(value.y, "Element y"),
    width: readDimension(value.width, "Element width"),
    height: readDimension(value.height, "Element height"),
    rotation: readNumber(value.rotation, "Element rotation"),
  }

  if (value.type === "image") {
    if (value.fit !== "contain" && value.fit !== "cover") throw new Error("Image fit is invalid")
    return { ...base, type: "image", assetId: readString(value.assetId, "Asset id"), fit: value.fit }
  }

  if (value.type === "text") {
    if (![400, 600, 700, 800].includes(Number(value.fontWeight))) throw new Error("Text weight is invalid")
    if (value.textAlign !== "left" && value.textAlign !== "center" && value.textAlign !== "right") {
      throw new Error("Text alignment is invalid")
    }
    const color = readString(value.color, "Text color")
    if (!hexColorPattern.test(color)) throw new Error("Text color must be a hex color")
    return {
      ...base,
      type: "text",
      text: typeof value.text === "string" ? value.text : "",
      fontSize: readDimension(value.fontSize, "Font size"),
      fontWeight: Number(value.fontWeight) as 400 | 600 | 700 | 800,
      color,
      textAlign: value.textAlign,
    }
  }

  throw new Error("Unsupported canvas element type")
}

function readString(value: unknown, name: string): string {
  const result = typeof value === "string" ? value.trim() : ""
  if (!result) throw new Error(`${name} must be a non-empty string`)
  return result
}

function readNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be a number`)
  return value
}

function readDimension(value: unknown, name: string): number {
  const result = readNumber(value, name)
  if (result <= 0 || result > 20_000) throw new Error(`${name} is outside the supported range`)
  return result
}

function isAssetCategory(value: string): value is AssetCategory {
  return ASSET_CATEGORIES.includes(value as AssetCategory)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function slugify(value: string): string {
  const result = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return result || "set"
}

async function writeJson(filename: string, value: unknown): Promise<void> {
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}
