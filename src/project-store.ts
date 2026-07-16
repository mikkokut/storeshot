import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { access, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  MOCKUP_BUNDLE_FILENAME,
  bundleAssetPaths,
  emptyDeviceMockupCatalog,
  isSafeBundlePath,
  mergeDeviceMockupCatalogs,
  parseMockupBundleManifest,
  resolveMockupBundle,
  type DeviceMockupCatalog,
  type MockupBundleManifest,
} from "./device-mockups.js"
import { detectScreenshotDeviceType, readImageMetadata } from "./image-metadata.js"
import { cloneScreenshotArea } from "./screenshot-area.js"

import {
  ASSET_CATEGORIES,
  type StoreShotConfig,
  type StoreShotProject,
  type Asset,
  type AssetCategory,
  type CanvasElement,
  type CreateSetInput,
  type FontWeight,
  type ImageElementSource,
  type ScreenshotArea,
  type ScreenshotSet,
  SCREENSHOT_DEVICE_TYPES,
  type ScreenshotDeviceType,
  type UpdateAssetMetadataInput,
  type UpdateSetMetadataInput,
} from "./shared.js"

export const CONFIG_FILENAME = "storeshot.json"
export const ASSETS_DIRECTORY = "assets"
export const SETS_DIRECTORY = "sets"
export const ASSET_METADATA_FILENAME = ".storeshot-metadata.json"
export const MOCKUP_BUNDLES_DIRECTORY = "mockup-bundles"
const MOCKUP_IMPORTS_DIRECTORY = ".imports"

const supportedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"])
const supportedMockupBundleExtensions = new Set([".jpeg", ".jpg", ".md", ".png", ".svg", ".txt", ".webp"])
const safeIdentifierPattern = /^[a-z0-9][a-z0-9-]*$/
const hexColorPattern = /^#[0-9a-f]{6}$/i

export class ProjectStore {
  readonly root: string
  readonly configPath: string
  readonly assetsPath: string
  readonly setsPath: string
  readonly mockupBundlesPath: string
  readonly mockupImportsPath: string
  private readonly operations = new Map<string, Promise<void>>()
  private readonly assetHashes = new Map<string, { hash: string; mtimeMs: number; size: number }>()

  constructor(directory: string) {
    this.root = path.resolve(directory)
    this.configPath = path.join(this.root, CONFIG_FILENAME)
    this.assetsPath = path.join(this.root, ASSETS_DIRECTORY)
    this.setsPath = path.join(this.root, SETS_DIRECTORY)
    this.mockupBundlesPath = path.join(this.root, MOCKUP_BUNDLES_DIRECTORY)
    this.mockupImportsPath = path.join(this.mockupBundlesPath, MOCKUP_IMPORTS_DIRECTORY)
  }

  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true })
    await this.assertManagedDirectory(this.root)
    await this.ensureManagedDirectory(this.assetsPath, this.root)
    await this.ensureManagedDirectory(this.setsPath, this.root)
    await this.ensureManagedDirectory(this.mockupBundlesPath, this.root)
    await rm(this.mockupImportsPath, { recursive: true, force: true })
    await this.ensureManagedDirectory(this.mockupImportsPath, this.mockupBundlesPath)
    for (const category of ASSET_CATEGORIES) {
      await this.ensureManagedDirectory(path.join(this.assetsPath, category), this.assetsPath)
    }

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

  async readProject(): Promise<StoreShotProject> {
    const [config, assets, sets] = await Promise.all([this.readConfig(), this.listAssets(), this.listSets()])
    return { directory: this.root, config, assets, sets }
  }

  async readConfig(): Promise<StoreShotConfig> {
    const value: unknown = JSON.parse(await this.readManagedFile(this.configPath, this.root, "utf8"))
    return parseConfig(value)
  }

  async writeConfig(config: StoreShotConfig): Promise<StoreShotConfig> {
    const value = parseConfig(config)
    await this.runExclusive(this.configPath, async () => {
      await this.assertSafeWriteTarget(this.configPath, this.root)
      await writeJson(this.configPath, value)
    })
    return value
  }

  async listAssets(): Promise<Record<AssetCategory, Asset[]>> {
    const entries = await Promise.all(
      ASSET_CATEGORIES.map(async (category) => [category, await this.listAssetsInCategory(category)] as const),
    )
    return Object.fromEntries(entries) as Record<AssetCategory, Asset[]>
  }

  async deleteAsset(category: AssetCategory, filename: string): Promise<void> {
    const target = await this.resolveExistingAsset(category, filename)
    await this.runExclusive(target, async () => unlink(target))
    this.assetHashes.delete(target)
    await this.updateAssetMetadataFile((metadata) => {
      delete metadata[`${category}/${filename}`]
    })
  }

  async updateAssetMetadata(category: AssetCategory, filename: string, input: UpdateAssetMetadataInput): Promise<void> {
    await this.resolveExistingAsset(category, filename)
    if (category !== "screenshots") throw new Error("Device type can only be set for raw screenshots")
    const deviceType = input.deviceType
    if (deviceType !== null && !SCREENSHOT_DEVICE_TYPES.includes(deviceType)) throw new Error("Unsupported screenshot device type")
    await this.updateAssetMetadataFile((metadata) => {
      const id = `${category}/${filename}`
      if (deviceType === null) delete metadata[id]
      else metadata[id] = { deviceType }
    })
  }

  async addAsset(category: string, filename: string, contents: Buffer): Promise<{ replaced: boolean }> {
    const target = this.resolveAsset(category, filename)
    assertValidImage(filename, contents)
    return this.runExclusive("asset-catalog", async () => {
      await this.assertSafeWriteTarget(target, path.dirname(target))
      const incomingHash = hash(contents)
      const replaced = await access(target, constants.F_OK).then(() => true).catch(() => false)

      for (const assetCategory of ASSET_CATEGORIES) {
        const directory = path.join(this.assetsPath, assetCategory)
        const entries = await readdir(directory, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isFile() || !supportedExtensions.has(path.extname(entry.name).toLowerCase())) continue
          const existingPath = path.join(directory, entry.name)
          if (existingPath === target) continue
          if (await this.hashAsset(existingPath, directory) === incomingHash) {
            throw new DuplicateAssetError(`${assetCategory}/${entry.name}`)
          }
        }
      }

      await writeFileAtomically(target, contents)
      const metadata = await stat(target)
      this.assetHashes.set(target, { hash: incomingHash, mtimeMs: metadata.mtimeMs, size: metadata.size })
      return { replaced }
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

  async resolveExistingAsset(category: string, filename: string): Promise<string> {
    const target = this.resolveAsset(category, filename)
    await this.assertRegularFile(target)
    const resolved = await realpath(target)
    await this.assertContained(resolved, path.join(this.assetsPath, category))
    return resolved
  }

  async listSets(): Promise<ScreenshotSet[]> {
    const entries = await readdir(this.setsPath, { withFileTypes: true })
    const sets = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && path.extname(entry.name) === ".json")
        .map(async (entry) => parseSet(JSON.parse(await this.readManagedFile(path.join(this.setsPath, entry.name), this.setsPath, "utf8")))),
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
              opacity: 1,
              fontFamily: "Geist Variable",
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
    const target = this.resolveSet(id)
    await this.runExclusive(target, async () => {
      await this.assertSafeWriteTarget(target, this.setsPath)
      await writeJson(target, set)
    })
    return set
  }

  async duplicateSet(id: string): Promise<ScreenshotSet> {
    const source = await this.readSet(id)
    const existingSets = await this.listSets()
    const name = duplicateName(source.name, existingSets.map((set) => set.name))
    const now = new Date().toISOString()
    const duplicate: ScreenshotSet = {
      ...structuredClone(source),
      id: `${slugify(name)}-${randomUUID().slice(0, 8)}`,
      name,
      areas: source.areas.map((area) => cloneScreenshotArea(area, { idFactory: randomUUID })),
      createdAt: now,
      updatedAt: now,
    }
    const target = this.resolveSet(duplicate.id)
    await this.runExclusive(target, async () => {
      await this.assertSafeWriteTarget(target, this.setsPath)
      await writeJson(target, duplicate)
    })
    return duplicate
  }

  async writeSet(id: string, set: ScreenshotSet): Promise<ScreenshotSet> {
    if (id !== set.id) throw new Error("Set id cannot be changed")
    const target = this.resolveSet(id)
    return this.runExclusive(target, async () => {
      const value = parseSet({ ...set, updatedAt: new Date().toISOString() })
      await this.assertSafeWriteTarget(target, this.setsPath)
      await writeJson(target, value)
      return value
    })
  }

  async updateSetMetadata(id: string, input: UpdateSetMetadataInput): Promise<ScreenshotSet> {
    const metadata = parseSetMetadataInput(input)
    const target = this.resolveSet(id)
    return this.runExclusive(target, async () => {
      const current = parseSet(JSON.parse(await this.readManagedFile(target, this.setsPath, "utf8")))
      const value = parseSet({ ...current, ...metadata, updatedAt: new Date().toISOString() })
      await writeJson(target, value)
      return value
    })
  }

  async deleteSet(id: string): Promise<void> {
    const target = this.resolveSet(id)
    await this.runExclusive(target, async () => {
      await this.assertRegularFile(target)
      await unlink(target)
    })
  }

  async listMockupCatalog(): Promise<DeviceMockupCatalog> {
    const entries = await readdir(this.mockupBundlesPath, { withFileTypes: true })
    const catalogs = (await Promise.all(entries
      .filter((entry) => entry.isDirectory() && safeIdentifierPattern.test(entry.name))
      .map(async (entry) => {
        const manifestPath = path.join(this.mockupBundlesPath, entry.name, MOCKUP_BUNDLE_FILENAME)
        let contents: string
        try {
          contents = await this.readManagedFile(manifestPath, path.dirname(manifestPath), "utf8")
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
          throw error
        }
        const manifest = parseMockupBundleManifest(JSON.parse(contents))
        if (manifest.id !== entry.name) throw new Error(`Mockup bundle folder ${entry.name} does not match manifest id ${manifest.id}`)
        return resolveMockupBundle(
          manifest,
          `/api/mockup-bundle-files/${encodeURIComponent(manifest.id)}/`,
          "project",
        )
      }))).filter((catalog): catalog is DeviceMockupCatalog => catalog !== undefined)
    return catalogs.length > 0 ? mergeDeviceMockupCatalogs(...catalogs) : emptyDeviceMockupCatalog()
  }

  async writeMockupBundleManifest(bundleId: string, input: unknown): Promise<MockupBundleManifest> {
    if (!safeIdentifierPattern.test(bundleId)) throw new Error("Unsupported mockup bundle id")
    if (bundleId === "frameup-free") throw new Error("frameup-free is reserved for StoreShot's built-in bundle")
    const manifest = parseMockupBundleManifest(input)
    if (manifest.id !== bundleId) throw new Error("Mockup bundle id cannot be changed")
    const bundleDirectory = path.join(this.mockupBundlesPath, bundleId)
    await this.ensureManagedDirectory(bundleDirectory, this.mockupBundlesPath)
    await Promise.all(bundleAssetPaths(manifest).map(async (relativePath) => {
      await this.resolveExistingMockupBundleFile(bundleId, relativePath)
    }))
    const manifestPath = path.join(bundleDirectory, MOCKUP_BUNDLE_FILENAME)
    await this.runExclusive(manifestPath, async () => writeJson(manifestPath, manifest))
    return manifest
  }

  async writeMockupBundleFile(bundleId: string, relativePath: string, contents: Buffer): Promise<void> {
    if (bundleId === "frameup-free") throw new Error("frameup-free is reserved for StoreShot's built-in bundle")
    const target = this.resolveMockupBundleFile(bundleId, relativePath)
    if (isImageFile(relativePath)) assertValidImage(relativePath, contents)
    await this.ensureManagedDirectory(path.dirname(target), this.mockupBundlesPath)
    await this.assertSafeWriteTarget(target, path.dirname(target))
    await this.runExclusive(target, async () => writeFileAtomically(target, contents))
  }

  async writeMockupBundleImportFile(importId: string, bundleId: string, relativePath: string, contents: Buffer): Promise<void> {
    this.assertMockupImportId(importId)
    this.resolveMockupBundleFile(bundleId, relativePath)
    if (isImageFile(relativePath)) assertValidImage(relativePath, contents)
    const bundleDirectory = path.join(this.mockupImportsPath, importId, bundleId)
    const target = path.resolve(bundleDirectory, relativePath)
    if (!target.startsWith(`${bundleDirectory}${path.sep}`)) throw new Error("Mockup bundle file is outside the import")
    await this.ensureManagedDirectory(path.dirname(target), this.mockupImportsPath)
    await this.assertSafeWriteTarget(target, path.dirname(target))
    await this.runExclusive(target, async () => writeFileAtomically(target, contents))
  }

  async commitMockupBundleImport(importId: string, bundleId: string, input: unknown): Promise<MockupBundleManifest> {
    this.assertMockupImportId(importId)
    if (!safeIdentifierPattern.test(bundleId)) throw new Error("Unsupported mockup bundle id")
    if (bundleId === "frameup-free") throw new Error("frameup-free is reserved for StoreShot's built-in bundle")
    const manifest = parseMockupBundleManifest(input)
    if (manifest.id !== bundleId) throw new Error("Mockup bundle id cannot be changed")

    const importDirectory = path.join(this.mockupImportsPath, importId)
    const stagedBundle = path.join(importDirectory, bundleId)
    await this.assertManagedDirectory(stagedBundle)
    await Promise.all(bundleAssetPaths(manifest).map(async (relativePath) => {
      const target = path.resolve(stagedBundle, relativePath)
      if (!target.startsWith(`${stagedBundle}${path.sep}`)) throw new Error("Mockup bundle file is outside the import")
      await this.readManagedFile(target, stagedBundle)
    }))
    await writeJson(path.join(stagedBundle, MOCKUP_BUNDLE_FILENAME), manifest)

    const finalBundle = path.join(this.mockupBundlesPath, bundleId)
    const backupBundle = path.join(this.mockupBundlesPath, `.${bundleId}.${randomUUID()}.backup`)
    await this.runExclusive(`mockup-bundle:${bundleId}`, async () => {
      let hasBackup = false
      try {
        const metadata = await lstat(finalBundle)
        if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("Mockup bundle must be a regular directory")
        await rename(finalBundle, backupBundle)
        hasBackup = true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }

      try {
        await rename(stagedBundle, finalBundle)
      } catch (error) {
        if (hasBackup) await rename(backupBundle, finalBundle)
        throw error
      }
      if (hasBackup) await rm(backupBundle, { recursive: true, force: true }).catch(() => undefined)
      await rm(importDirectory, { recursive: true, force: true }).catch(() => undefined)
    })
    return manifest
  }

  async discardMockupBundleImport(importId: string): Promise<void> {
    this.assertMockupImportId(importId)
    const target = path.join(this.mockupImportsPath, importId)
    const relative = path.relative(this.mockupImportsPath, target)
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Mockup import is outside the project boundary")
    await rm(target, { recursive: true, force: true })
  }

  resolveMockupBundleFile(bundleId: string, relativePath: string): string {
    if (!safeIdentifierPattern.test(bundleId)) throw new Error("Unsupported mockup bundle id")
    if (!isSafeBundlePath(relativePath) || relativePath === MOCKUP_BUNDLE_FILENAME) {
      throw new Error("Unsupported mockup bundle file path")
    }
    const extension = path.extname(relativePath).toLowerCase()
    if (path.basename(relativePath) !== "LICENSE" && !supportedMockupBundleExtensions.has(extension)) {
      throw new Error("Unsupported mockup bundle file type")
    }
    const bundleRoot = path.join(this.mockupBundlesPath, bundleId)
    const target = path.resolve(bundleRoot, relativePath)
    if (!target.startsWith(`${bundleRoot}${path.sep}`)) throw new Error("Mockup bundle file is outside the bundle")
    return target
  }

  async resolveExistingMockupBundleFile(bundleId: string, relativePath: string): Promise<string> {
    const bundleRoot = await realpath(path.join(this.mockupBundlesPath, bundleId))
    await this.assertContained(bundleRoot, this.mockupBundlesPath)
    await this.assertRegularFile(this.resolveMockupBundleFile(bundleId, relativePath))
    const target = await realpath(this.resolveMockupBundleFile(bundleId, relativePath))
    if (!target.startsWith(`${bundleRoot}${path.sep}`)) throw new Error("Mockup bundle file is outside the bundle")
    return target
  }

  private async listAssetsInCategory(category: AssetCategory): Promise<Asset[]> {
    const directory = path.join(this.assetsPath, category)
    const entries = await readdir(directory, { withFileTypes: true })
    const files = entries
      .filter((entry) => entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name))

    const assetMetadata = await this.readAssetMetadata()
    return Promise.all(
      files.map(async (file) => {
        const filename = path.join(directory, file.name)
        const [metadata, contents] = await Promise.all([stat(filename), this.readManagedFile(filename, directory)])
        const dimensions = readImageMetadata(contents)
        const detectedDeviceType = category === "screenshots" && dimensions
          ? detectScreenshotDeviceType(dimensions.width, dimensions.height)
          : undefined
        const deviceTypeOverride = assetMetadata[`${category}/${file.name}`]?.deviceType
        return {
          id: `${category}/${file.name}`,
          category,
          name: file.name,
          url: `/api/assets/${category}/${encodeURIComponent(file.name)}?v=${Math.trunc(metadata.mtimeMs)}`,
          size: metadata.size,
          modifiedAt: metadata.mtime.toISOString(),
          ...(dimensions ?? {}),
          ...(detectedDeviceType ? {
            detectedDeviceType,
            deviceTypeOverride,
            deviceType: deviceTypeOverride ?? detectedDeviceType,
          } : {}),
        }
      }),
    )
  }

  private async readAssetMetadata(): Promise<AssetMetadata> {
    const target = path.join(this.assetsPath, ASSET_METADATA_FILENAME)
    try {
      const value: unknown = JSON.parse(await this.readManagedFile(target, this.assetsPath, "utf8"))
      if (!isRecord(value) || value.version !== 1 || !isRecord(value.assets)) return {}
      return Object.fromEntries(Object.entries(value.assets).flatMap(([id, entry]) => {
        if (!isRecord(entry) || !SCREENSHOT_DEVICE_TYPES.includes(entry.deviceType as ScreenshotDeviceType)) return []
        return [[id, { deviceType: entry.deviceType as ScreenshotDeviceType }]]
      }))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}
      throw error
    }
  }

  private async writeAssetMetadata(assets: AssetMetadata): Promise<void> {
    const target = path.join(this.assetsPath, ASSET_METADATA_FILENAME)
    await this.assertSafeWriteTarget(target, this.assetsPath)
    await writeJson(target, { version: 1, assets })
  }

  private async updateAssetMetadataFile(update: (metadata: AssetMetadata) => void): Promise<void> {
    const target = path.join(this.assetsPath, ASSET_METADATA_FILENAME)
    await this.runExclusive(target, async () => {
      const metadata = await this.readAssetMetadata()
      update(metadata)
      await this.writeAssetMetadata(metadata)
    })
  }

  private async hashAsset(filename: string, boundary: string): Promise<string> {
    const metadata = await stat(filename)
    const cached = this.assetHashes.get(filename)
    if (cached && cached.mtimeMs === metadata.mtimeMs && cached.size === metadata.size) return cached.hash
    const value = hash(await this.readManagedFile(filename, boundary))
    this.assetHashes.set(filename, { hash: value, mtimeMs: metadata.mtimeMs, size: metadata.size })
    return value
  }

  private async readSet(id: string): Promise<ScreenshotSet> {
    const target = this.resolveSet(id)
    return parseSet(JSON.parse(await this.readManagedFile(target, this.setsPath, "utf8")))
  }

  private async runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.operations.get(key) ?? Promise.resolve()
    const result = previous.catch(() => undefined).then(operation)
    const tail = result.then(() => undefined, () => undefined)
    this.operations.set(key, tail)
    try {
      return await result
    } finally {
      if (this.operations.get(key) === tail) this.operations.delete(key)
    }
  }

  private async assertManagedDirectory(directory: string): Promise<void> {
    const metadata = await lstat(directory)
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(`${path.relative(this.root, directory) || "."} must be a regular project directory`)
    }
    await this.assertContained(await realpath(directory), this.root, true)
  }

  private async ensureManagedDirectory(directory: string, boundary: string): Promise<void> {
    await this.assertManagedDirectory(boundary)
    const relative = path.relative(boundary, directory)
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Directory is outside the project boundary")
    let current = boundary
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, segment)
      try {
        await mkdir(current)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      }
      const metadata = await lstat(current)
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("Project directories cannot be symbolic links")
    }
    await this.assertContained(await realpath(directory), boundary, true)
  }

  private async assertSafeWriteTarget(target: string, boundary: string): Promise<void> {
    await this.assertManagedDirectory(boundary)
    const relative = path.relative(boundary, target)
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("File is outside the project boundary")
    try {
      const metadata = await lstat(target)
      if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error("Project files must be regular files")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }

  private async readManagedFile(filename: string, boundary: string): Promise<Buffer>
  private async readManagedFile(filename: string, boundary: string, encoding: BufferEncoding): Promise<string>
  private async readManagedFile(filename: string, boundary: string, encoding?: BufferEncoding): Promise<Buffer | string> {
    await this.assertRegularFile(filename)
    await this.assertContained(await realpath(filename), boundary)
    return encoding ? readFile(filename, encoding) : readFile(filename)
  }

  private async assertRegularFile(filename: string): Promise<void> {
    const metadata = await lstat(filename)
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Project files must be regular files")
  }

  private async assertContained(candidate: string, boundary: string, allowEqual = false): Promise<void> {
    const resolvedBoundary = await realpath(boundary)
    if ((allowEqual && candidate === resolvedBoundary) || candidate.startsWith(`${resolvedBoundary}${path.sep}`)) return
    throw new Error("File is outside the project boundary")
  }

  private assertMockupImportId(importId: string): void {
    if (!safeIdentifierPattern.test(importId)) throw new Error("Unsupported mockup import id")
  }

  private resolveSet(id: string): string {
    if (!safeIdentifierPattern.test(id)) throw new Error("Unsupported set id")
    return path.join(this.setsPath, `${id}.json`)
  }
}

type AssetMetadata = Record<string, { deviceType: ScreenshotDeviceType }>

export class DuplicateAssetError extends Error {
  constructor(readonly existingAssetId: string) {
    super(`This file is already in the asset catalog as ${existingAssetId}`)
  }
}

function hash(contents: Buffer): string {
  return createHash("sha256").update(contents).digest("hex")
}

function parseConfig(value: unknown): StoreShotConfig {
  if (!isRecord(value)) throw new Error("storeshot.json must contain a JSON object")

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

function duplicateName(sourceName: string, existingNames: string[]): string {
  const names = new Set(existingNames.map((name) => name.toLocaleLowerCase()))
  const baseName = `${sourceName} copy`
  if (!names.has(baseName.toLocaleLowerCase())) return baseName

  let copyNumber = 2
  while (names.has(`${baseName} ${copyNumber}`.toLocaleLowerCase())) copyNumber += 1
  return `${baseName} ${copyNumber}`
}

function parseSetMetadataInput(value: unknown): UpdateSetMetadataInput {
  if (!isRecord(value)) throw new Error("Set settings must be an object")
  return {
    name: readString(value.name, "Set name"),
    locale: readString(value.locale, "Locale"),
    device: readString(value.device, "Device"),
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

function parseImageSource(value: unknown, legacyAssetId?: unknown): ImageElementSource {
  if (isRecord(value)) {
    if (value.kind === "builtin") return { kind: "builtin", id: readString(value.id, "Built-in artwork id") }
    if (value.kind === "asset") return { kind: "asset", assetId: readString(value.assetId, "Asset id") }
    throw new Error("Image source type is invalid")
  }
  if (legacyAssetId !== undefined) return { kind: "asset", assetId: readString(legacyAssetId, "Asset id") }
  throw new Error("Image source is invalid")
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
    opacity: readOptionalRange(value.opacity, 1, 0, 1, "Element opacity"),
  }

  if (value.type === "image") {
    if (value.fit !== "contain" && value.fit !== "cover") throw new Error("Image fit is invalid")
    const source = parseImageSource(value.source, value.assetId)
    const fill = value.fill === undefined ? undefined : readString(value.fill, "Image fill")
    if (fill !== undefined && !hexColorPattern.test(fill)) throw new Error("Image fill must be a hex color")
    return { ...base, type: "image", source, fit: value.fit, ...(fill === undefined ? {} : { fill }) }
  }

  if (value.type === "mockup") {
    return {
      ...base,
      type: "mockup",
      mockupId: readString(value.mockupId, "Device mockup id"),
      assetId: readString(value.assetId, "Asset id"),
    }
  }

  if (value.type === "element") {
    const source = parseImageSource(value.source)
    const fill = value.fill === undefined ? undefined : readString(value.fill, "Image fill")
    if (fill !== undefined && !hexColorPattern.test(fill)) throw new Error("Image fill must be a hex color")
    return {
      ...base,
      type: "image",
      source,
      fit: "contain",
      ...(fill === undefined ? {} : { fill }),
    }
  }

  if (value.type === "text") {
    const fontWeight = Number(value.fontWeight)
    if (!Number.isInteger(fontWeight) || fontWeight < 100 || fontWeight > 900 || fontWeight % 100 !== 0) {
      throw new Error("Text weight is invalid")
    }
    if (value.textAlign !== "left" && value.textAlign !== "center" && value.textAlign !== "right") {
      throw new Error("Text alignment is invalid")
    }
    const color = readString(value.color, "Text color")
    if (!hexColorPattern.test(color)) throw new Error("Text color must be a hex color")
    const lineHeight = value.lineHeight === undefined
      ? undefined
      : readDimension(value.lineHeight, "Text line height")
    return {
      ...base,
      type: "text",
      text: typeof value.text === "string" ? value.text : "",
      fontFamily: readOptionalString(value.fontFamily, "Geist Variable"),
      fontSize: readDimension(value.fontSize, "Font size"),
      fontWeight: fontWeight as FontWeight,
      ...(lineHeight === undefined ? {} : { lineHeight }),
      color,
      textAlign: value.textAlign,
    }
  }

  if (value.type === "shape") {
    if (value.shape !== "rectangle") throw new Error("Shape type is invalid")
    const fill = readString(value.fill, "Shape fill")
    if (!hexColorPattern.test(fill)) throw new Error("Shape fill must be a hex color")
    return {
      ...base,
      type: "shape",
      shape: value.shape,
      fill,
      cornerRadius: readOptionalRange(value.cornerRadius, 0, 0, 10_000, "Shape corner radius"),
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

function readOptionalRange(value: unknown, fallback: number, min: number, max: number, name: string): number {
  if (value === undefined) return fallback
  const result = readNumber(value, name)
  if (result < min || result > max) throw new Error(`${name} is outside the supported range`)
  return result
}

function readOptionalString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
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
  await writeFileAtomically(filename, `${JSON.stringify(value, null, 2)}\n`)
}

async function writeFileAtomically(filename: string, contents: Buffer | string): Promise<void> {
  const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, contents, { flag: "wx" })
    await rename(temporary, filename)
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error
    })
  }
}

function isImageFile(filename: string): boolean {
  return supportedExtensions.has(path.extname(filename).toLowerCase())
}

function assertValidImage(filename: string, contents: Buffer): void {
  if (!isImageFile(filename) || !readImageMetadata(contents)) throw new Error("The uploaded file is not a valid supported image")
}
