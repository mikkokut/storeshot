import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises"
import path from "node:path"

import { assetChecksum, scanLocalAssetFiles } from "./asset-catalog.js"
import { parseAssetImports, parseCatalogSnapshot, safeAssetPath, type AssetImport, type CatalogAsset } from "./asset-catalog-types.js"
import {
  detectScreenshotDeviceType,
  readImageMetadata,
} from "./image-metadata.js"
import {
  assetSpec,
  defaultConfig,
  inferSpec,
  acceptsSize,
  CREATION_SPECS,
  creationSize,
} from "./app-store.js"
import { parseStoreShotConfig, identifier } from "./app-store-config.js"
import { APP_STORE_LOCALES } from "./app-store-locales.js"
export { parseStoreShotConfig } from "./app-store-config.js"
import { addPreviewRevisions } from "./preview-revisions.js"
import { createArtboardHtml } from "./html-artboard.js"

import {
  ASSET_CATEGORIES,
  areaCanvas,
  type StoreShotConfig,
  type StoreShotProject,
  type Asset,
  type AssetCategory,
  type CreateSetInput,
  type CreatePageInput,
  type LocalizePageInput,
  type ProductPage,
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
export const ASSET_IMPORTS_FILENAME = ".storeshot-imports.json"
const supportedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"])
const safeIdentifierPattern = /^[a-z0-9][a-z0-9-]*$/

export class ProjectStore {
  readonly root: string
  readonly configPath: string
  readonly assetsPath: string
  readonly setsPath: string
  private readonly operations = new Map<string, Promise<void>>()
  private readonly assetHashes = new Map<
    string,
    { hash: string; mtimeMs: number; size: number }
  >()

  constructor(directory: string) {
    this.root = path.resolve(directory)
    this.configPath = path.join(this.root, CONFIG_FILENAME)
    this.assetsPath = path.join(this.root, ASSETS_DIRECTORY)
    this.setsPath = path.join(this.root, SETS_DIRECTORY)

  }

  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true })
    await this.assertManagedDirectory(this.root)
    await this.ensureManagedDirectory(this.assetsPath, this.root)
    await this.ensureManagedDirectory(this.setsPath, this.root)
    for (const category of ASSET_CATEGORIES) {
      await this.ensureManagedDirectory(
        path.join(this.assetsPath, category),
        this.assetsPath,
      )
    }

    try {
      await access(this.configPath, constants.F_OK)
    } catch {
      await this.writeConfigUnlocked(defaultConfig())
    }
  }

  async readProject(): Promise<StoreShotProject> {
    return this.runExclusive("workspace-mutation", async () => {
      const [config, assets, sets] = await Promise.all([
        this.readConfig(),
        this.listAssets(),
        this.listSets(),
      ])
      const project = { directory: this.root, config, assets, sets }
      await addPreviewRevisions(project)
      return project
    })
  }

  // Page, localization and collection changes share one queue so their read/write
  // sequences cannot overwrite each other. Internal helpers run within that operation.
  async writeConfig(config: StoreShotConfig): Promise<StoreShotConfig> {
    return this.runExclusive("workspace-mutation", () =>
      this.writeConfigUnlocked(config),
    )
  }

  async createSet(input: CreateSetInput): Promise<ScreenshotSet> {
    return this.runExclusive("workspace-mutation", () =>
      this.createSetUnlocked(input),
    )
  }

  async duplicateSet(id: string): Promise<ScreenshotSet> {
    return this.runExclusive("workspace-mutation", () =>
      this.duplicateSetUnlocked(id),
    )
  }

  async createPage(input: CreatePageInput): Promise<ProductPage> {
    return this.runExclusive("workspace-mutation", () =>
      this.createPageUnlocked(input),
    )
  }

  async localizePage(pageId: string, input: LocalizePageInput): Promise<void> {
    return this.runExclusive("workspace-mutation", () =>
      this.localizePageUnlocked(pageId, input),
    )
  }

  async removePageLanguage(pageId: string, locale: string): Promise<void> {
    return this.runExclusive("workspace-mutation", () =>
      this.removePageLanguageUnlocked(pageId, locale),
    )
  }

  async renamePage(pageId: string, name: string): Promise<void> {
    return this.runExclusive("workspace-mutation", () =>
      this.renamePageUnlocked(pageId, name),
    )
  }

  async deletePage(pageId: string): Promise<void> {
    return this.runExclusive("workspace-mutation", () =>
      this.deletePageUnlocked(pageId),
    )
  }

  async preparePage(pageId: string, locale: string): Promise<ScreenshotSet[]> {
    return this.runExclusive("workspace-mutation", () =>
      this.preparePageUnlocked(pageId, locale),
    )
  }

  async writeSet(id: string, set: ScreenshotSet): Promise<ScreenshotSet> {
    return this.runExclusive("workspace-mutation", () =>
      this.writeSetUnlocked(id, set),
    )
  }

  async addArea(id: string, area: unknown): Promise<ScreenshotSet> {
    return this.runExclusive("workspace-mutation", () =>
      this.addAreaUnlocked(id, area),
    )
  }

  async updateSetMetadata(
    id: string,
    input: UpdateSetMetadataInput,
  ): Promise<ScreenshotSet> {
    return this.runExclusive("workspace-mutation", () =>
      this.updateSetMetadataUnlocked(id, input),
    )
  }

  async deleteSet(id: string): Promise<void> {
    return this.runExclusive("workspace-mutation", () =>
      this.deleteSetUnlocked(id),
    )
  }

  async readConfig(): Promise<StoreShotConfig> {
    const value: unknown = JSON.parse(
      await this.readManagedFile(this.configPath, this.root, "utf8"),
    )
    return parseStoreShotConfig(value)
  }

  private async writeConfigUnlocked(
    config: StoreShotConfig,
  ): Promise<StoreShotConfig> {
    const value = parseStoreShotConfig(config)
    await this.assertSafeWriteTarget(this.configPath, this.root)
    await writeJson(this.configPath, value)
    return value
  }

  async listAssets(): Promise<Record<AssetCategory, Asset[]>> {
    const entries = await Promise.all(
      ASSET_CATEGORIES.map(
        async (category) =>
          [category, await this.listAssetsInCategory(category)] as const,
      ),
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

  async updateAssetMetadata(
    category: AssetCategory,
    filename: string,
    input: UpdateAssetMetadataInput,
  ): Promise<void> {
    await this.resolveExistingAsset(category, filename)
    if (category !== "screenshots")
      throw new Error("Device type can only be set for raw screenshots")
    const deviceType = input.deviceType
    if (deviceType !== null && !SCREENSHOT_DEVICE_TYPES.includes(deviceType))
      throw new Error("Unsupported screenshot device type")
    await this.updateAssetMetadataFile((metadata) => {
      const id = `${category}/${filename}`
      if (deviceType === null) delete metadata[id]
      else metadata[id] = { deviceType }
    })
  }

  async addAsset(
    category: string,
    filename: string,
    contents: Buffer,
  ): Promise<{ replaced: boolean }> {
    const target = this.resolveAsset(category, filename)
    assertValidImage(filename, contents)
    return this.runExclusive("asset-catalog", async () => {
      await this.assertSafeWriteTarget(target, path.dirname(target))
      const incomingHash = hash(contents)
      const replaced = await access(target, constants.F_OK)
        .then(() => true)
        .catch(() => false)

      for (const assetCategory of ASSET_CATEGORIES) {
        const directory = path.join(this.assetsPath, assetCategory)
        const entries = await readdir(directory, { withFileTypes: true })
        for (const entry of entries) {
          if (
            !entry.isFile() ||
            !supportedExtensions.has(path.extname(entry.name).toLowerCase())
          )
            continue
          const existingPath = path.join(directory, entry.name)
          if (existingPath === target) continue
          if (
            (await this.hashAsset(existingPath, directory)) === incomingHash
          ) {
            throw new DuplicateAssetError(`${assetCategory}/${entry.name}`)
          }
        }
      }

      await writeFileAtomically(target, contents)
      const metadata = await stat(target)
      this.assetHashes.set(target, {
        hash: incomingHash,
        mtimeMs: metadata.mtimeMs,
        size: metadata.size,
      })
      return { replaced }
    })
  }

  resolveAsset(category: string, filename: string): string {
    if (!isAssetCategory(category))
      throw new Error("Unsupported asset category")

    const safeName = path.basename(filename)
    const extension = path.extname(safeName).toLowerCase()
    if (safeName !== filename || !safeAssetPath(filename) || !supportedExtensions.has(extension)) {
      throw new Error("Unsupported asset filename")
    }

    return path.join(this.assetsPath, category, safeName)
  }

  async resolveExistingAsset(
    category: string,
    filename: string,
  ): Promise<string> {
    const target = this.resolveAsset(category, filename)
    await this.assertManagedDirectory(path.dirname(target))
    await this.assertRegularFile(target)
    const resolved = await realpath(target)
    await this.assertContained(resolved, path.join(this.assetsPath, category))
    return resolved
  }

  async listSets(): Promise<ScreenshotSet[]> {
    await this.assertManagedDirectory(this.setsPath)
    const entries = await readdir(this.setsPath, { withFileTypes: true })
    const sets: ScreenshotSet[] = []
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue
      if (entry.isSymbolicLink()) throw new Error("Set directories cannot be symbolic links")
      if (!entry.isDirectory()) continue
      try {
        await lstat(this.resolveSet(entry.name))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue
        throw error
      }
      sets.push(await this.readSet(entry.name))
    }
    return sets.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  private async createSetUnlocked(
    input: CreateSetInput,
  ): Promise<ScreenshotSet> {
    const value = parseCreateSetInput(input)
    const config = await this.readConfig()
    const pageId = value.pageId ?? config.pages[0]?.id
    if (!pageId) throw new Error("Create a product page before adding artwork")
    const now = new Date().toISOString()
    const id = `${slugify(value.name)}-${randomUUID().slice(0, 8)}`
    const areaId = randomUUID().slice(0, 8)
    const set: ScreenshotSet = {
      version: 3,
      id,
      name: value.name,
      locale: value.locale,
      device: value.device,
      pageId,
      specId:
        value.specId ?? inferSpec(value.width, value.height, value.device),
      canvas: { width: value.width, height: value.height },
      areas: [
        {
          id: areaId,
          name: "Screenshot 1",
          html: createArtboardHtml(value.width, value.height, {
            locale: value.locale,
          }),
        },
      ],
      createdAt: now,
      updatedAt: now,
    }
    const collection = parseScreenshotSet(set)
    await this.validateDestination(collection, true)
    const target = this.resolveSet(id)
    await this.assertSafeWriteTarget(target, this.setsPath)
    await this.ensurePageLocale(collection.pageId, collection.locale)
    await this.persistSet(target, collection)
    return collection
  }

  private async duplicateSetUnlocked(id: string): Promise<ScreenshotSet> {
    const source = await this.readSet(id)
    const page = await this.createPageUnlocked({
      name: `${source.name} copy`,
    })
    try {
      return await this.cloneCollection(
        source,
        page.id,
        source.locale,
        `${source.name} copy`,
      )
    } catch (error) {
      await this.deletePageUnlocked(page.id)
      throw error
    }
  }

  private async cloneCollection(
    source: ScreenshotSet,
    pageId: string,
    locale: string,
    name = source.name,
  ): Promise<ScreenshotSet> {
    const now = new Date().toISOString()
    const copy: ScreenshotSet = {
      ...structuredClone(source),
      id: `${slugify(name)}-${randomUUID().slice(0, 8)}`,
      name,
      pageId,
      locale,
      ...(locale !== source.locale ? { sourceLocale: source.locale } : {}),
      areas: source.areas.map((area) => ({ ...area })),
      createdAt: now,
      updatedAt: now,
    }
    try {
      await this.validateDestination(copy, true)
      await this.ensurePageLocale(pageId, locale)
      await this.copySetResources(
        path.join(this.setsPath, source.id),
        path.join(this.setsPath, copy.id),
      )
      return await this.writeSetUnlocked(copy.id, copy)
    } catch (error) {
      await this.discardNewCollection(copy.id)
      throw error
    }
  }

  private async ensurePageLocale(
    pageId: string,
    locale: string,
  ): Promise<void> {
    await this.runExclusive(this.configPath, async () => {
      const config = await this.readConfig()
      const page = config.pages.find((page) => page.id === pageId)
      if (!page) throw new Error("Unknown product page")
      if (page.localizations.includes(locale)) return
      if (!APP_STORE_LOCALES.some((entry) => entry.code === locale))
        throw new Error("Choose a supported App Store language")
      page.localizations.push(locale)
      await this.assertSafeWriteTarget(this.configPath, this.root)
      await writeJson(this.configPath, parseStoreShotConfig(config))
    })
  }

  private async validateDestination(
    set: ScreenshotSet,
    creating = false,
  ): Promise<void> {
    const config = await this.readConfig()
    const page = config.pages.find((page) => page.id === set.pageId)
    if (!page || (!creating && !page.localizations.includes(set.locale)))
      throw new Error("Unknown product page or language")
    const spec = assetSpec(set.specId)
    if (!spec) {
      if (set.specId !== "unassigned")
        throw new Error("Unknown App Store specification")
      return // Preserve imported artwork without claiming it is upload-ready.
    }
    if (set.areas.some((area) => area.canvas !== undefined) && spec.id !== "iphone-duo")
      throw new Error("Per-image canvas dimensions are only supported for iPhone Duo")
    if (!acceptsSize(spec, set.canvas.width, set.canvas.height) || set.areas.some((area) => {
      const canvas = areaCanvas(set, area)
      return !acceptsSize(spec, canvas.width, canvas.height)
    }))
      throw new Error("Unsupported App Store asset dimensions")
    if (set.areas.length > spec.maxCount)
      throw new Error(`This destination allows at most ${spec.maxCount} images`)
    const others = (await this.listSets()).filter(
      (other) => other.id !== set.id,
    )
    if (
      others.some(
        (other) =>
          other.pageId === set.pageId &&
          other.locale === set.locale &&
          other.specId === set.specId,
      )
    )
      throw new Error("This page and language already have this asset slot")
    if (
      spec.id === "watch" &&
      others.some(
        (other) =>
          other.specId === "watch" &&
          (other.canvas.width !== set.canvas.width ||
            other.canvas.height !== set.canvas.height),
      )
    )
      throw new Error(
        "Apple Watch dimensions must match across all localizations",
      )
  }

  private async createPageUnlocked(
    input: CreatePageInput,
  ): Promise<ProductPage> {
    const config = await this.readConfig()
    const name = readString(input.name, "Page name")
    const source = input.sourcePageId
      ? config.pages.find((page) => page.id === input.sourcePageId)
      : undefined
    if (input.sourcePageId && !source) throw new Error("Unknown source page")
    const store = input.store ?? source?.store ?? "app-store"
    if (store !== "app-store")
      throw new Error("Only App Store product pages are available; Google Play is coming later")
    const page: ProductPage = {
      id: `page-${randomUUID().slice(0, 8)}`,
      name,
      store,
      localizations: [...(source?.localizations ?? [])],
    }
    config.pages.push(page)
    parseStoreShotConfig(config)
    const collections = source
      ? (await this.listSets()).filter(
          (set) => set.pageId === source.id,
        )
      : []
    const previous = await this.readConfig()
    const copies: ScreenshotSet[] = []
    await this.writeConfigUnlocked(config)
    try {
      for (const collection of collections)
        copies.push(
          await this.cloneCollection(collection, page.id, collection.locale),
        )
    } catch (error) {
      for (const copy of copies) await this.discardNewCollection(copy.id)
      await this.writeConfigUnlocked(previous)
      throw error
    }
    return page
  }

  private async localizePageUnlocked(
    pageId: string,
    input: LocalizePageInput,
  ): Promise<void> {
    if (!APP_STORE_LOCALES.some((locale) => locale.code === input.locale))
      throw new Error("Choose a supported App Store language")
    const config = await this.readConfig()
    const page = config.pages.find((page) => page.id === pageId)
    if (!page) throw new Error("Unknown product page")
    if (page.localizations.includes(input.locale))
      throw new Error("This page already has this language")
    if (input.sourceLocale && !page.localizations.includes(input.sourceLocale))
      throw new Error("Unknown source language")
    const collections = input.sourceLocale
      ? (await this.listSets()).filter(
          (set) => set.pageId === pageId && set.locale === input.sourceLocale,
        )
      : []
    await this.ensurePageLocale(pageId, input.locale)
    const copies: ScreenshotSet[] = []
    try {
      for (const collection of collections)
        copies.push(
          await this.cloneCollection(collection, pageId, input.locale),
        )
    } catch (error) {
      for (const copy of copies) await this.discardNewCollection(copy.id)
      await this.writeConfigUnlocked(config)
      throw error
    }
  }

  private async renamePageUnlocked(
    pageId: string,
    name: string,
  ): Promise<void> {
    const config = await this.readConfig()
    const page = config.pages.find((page) => page.id === pageId)
    if (!page) throw new Error("Unknown product page")
    page.name = readString(name, "Page name")
    await this.writeConfigUnlocked(config)
  }

  private async removePageLanguageUnlocked(pageId: string, locale: string): Promise<void> {
    const config = await this.readConfig()
    const page = config.pages.find((page) => page.id === pageId)
    if (!page) throw new Error("Unknown product page")
    if (!page.localizations.includes(locale)) throw new Error("Unknown page language")
    const sets = (await this.listSets()).filter(
      (set) => set.pageId === pageId && set.locale === locale,
    )
    page.localizations = page.localizations.filter((code) => code !== locale)
    try {
      for (const set of sets) await this.deleteSetUnlocked(set.id)
      await this.writeConfigUnlocked(config)
    } catch (error) {
      for (const set of sets) await this.restoreSet(set)
      throw error
    }
  }

  private async deletePageUnlocked(pageId: string): Promise<void> {
    const config = await this.readConfig()
    const page = config.pages.find((page) => page.id === pageId)
    if (!page) throw new Error("Unknown product page")
    const sets = (await this.listSets()).filter((set) => set.pageId === pageId)
    const next = {
      ...config,
      pages: config.pages.filter((page) => page.id !== pageId),
    }
    try {
      for (const set of sets) await this.deleteSetUnlocked(set.id)
      await this.writeConfigUnlocked(next)
    } catch (error) {
      for (const set of sets) await this.restoreSet(set)
      throw error
    }
  }

  private async preparePageUnlocked(
    pageId: string,
    locale: string,
  ): Promise<ScreenshotSet[]> {
    const config = await this.readConfig()
    const page = config.pages.find((page) => page.id === pageId)
    if (!page) throw new Error("Unknown product page")
    if (!APP_STORE_LOCALES.some((entry) => entry.code === locale))
      throw new Error("Choose a supported App Store language")
    const existing = await this.listSets()
    const created: ScreenshotSet[] = []
    const sourceAssets = (await this.listAssets()).screenshots
    const assets =
      !page.localizations.length || locale === page.localizations[0]
        ? sourceAssets
        : []
    const sourceDevice = (asset: Asset) => {
      if (asset.deviceTypeOverride) return asset.deviceTypeOverride
      const spec = assetSpec(inferSpec(asset.width ?? 0, asset.height ?? 0))
      return spec && spec.device !== "creative" ? spec.device : asset.deviceType
    }
    const devices = new Set([
      ...existing.flatMap((set) => {
        const spec = assetSpec(set.specId)
        return spec && spec.device !== "creative" ? [spec.device] : []
      }),
      ...sourceAssets.map(sourceDevice),
    ])
    if (
      !CREATION_SPECS.some(
        (spec) => spec.device !== "creative" && spec.requirement === "required" && devices.has(spec.device),
      )
    )
      devices.add("iphone")
    try {
      for (const spec of CREATION_SPECS.filter(
        (spec) =>
          spec.device !== "creative" &&
          devices.has(spec.device) &&
          spec.requirement === "required",
      )) {
        if (
          existing.some(
            (set) =>
              set.pageId === pageId &&
              set.locale === locale &&
              set.specId === spec.id,
          )
        )
          continue
        const [width, height] = creationSize(spec, existing)
        const collection = await this.createSetUnlocked({
          pageId,
          locale,
          specId: spec.id,
          name: spec.name,
          device: spec.name,
          width,
          height,
        })
        created.push(collection)
        const captures = assets
          .filter((asset) => sourceDevice(asset) === spec.device)
          .slice(0, spec.maxCount)
        if (captures.length) {
          collection.areas = captures.map((asset) => ({
            id: randomUUID().slice(0, 8),
            name: asset.name.replace(/\.[^.]+$/, ""),
            html: createArtboardHtml(width, height, {
              locale,
              image: `../../assets/${asset.id.split("/").map(encodeURIComponent).join("/")}`,
            }),
          }))
          await this.writeSetUnlocked(collection.id, collection)
        }
      }
    } catch (error) {
      for (const set of created) await this.discardNewCollection(set.id)
      await this.writeConfigUnlocked(config)
      throw error
    }
    return created
  }

  private async copySetResources(
    source: string,
    target: string,
  ): Promise<void> {
    await this.assertManagedDirectory(source)
    await this.ensureManagedDirectory(target, this.setsPath)
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (entry.isSymbolicLink())
        throw new Error("Set resources cannot be symbolic links")
      if (entry.name.startsWith(".")) continue
      // Publish the copied collection only after its resources and metadata are complete.
      if (entry.name === "index.json" && path.dirname(source) === this.setsPath) continue
      const from = path.join(source, entry.name)
      const to = path.join(target, entry.name)
      if (entry.isDirectory()) await this.copySetResources(from, to)
      else if (entry.isFile()) {
        await this.assertSafeWriteTarget(to, target)
        await writeFileAtomically(to, await this.readManagedFile(from, source))
      }
    }
  }

  private async writeSetUnlocked(
    id: string,
    set: ScreenshotSet,
  ): Promise<ScreenshotSet> {
    if (id !== set.id) throw new Error("Set id cannot be changed")
    const target = this.resolveSet(id)
    const value = parseScreenshotSet({
      ...set,
      updatedAt: new Date().toISOString(),
    })
    await this.validateDestination(value)
    await this.assertSafeWriteTarget(target, this.setsPath)
    await this.persistSet(target, value)
    return value
  }

  private async addAreaUnlocked(
    id: string,
    area: unknown,
  ): Promise<ScreenshotSet> {
    const target = this.resolveSet(id)
    const current = await this.readSet(id)
    const value = parseScreenshotSet({
      ...current,
      areas: [...current.areas, area],
      updatedAt: new Date().toISOString(),
    })
    await this.validateDestination(value)
    await this.assertSafeWriteTarget(target, this.setsPath)
    await this.persistSet(target, value)
    return value
  }

  private async updateSetMetadataUnlocked(
    id: string,
    input: UpdateSetMetadataInput,
  ): Promise<ScreenshotSet> {
    const metadata = parseSetMetadataInput(input)
    const target = this.resolveSet(id)
    const current = await this.readSet(id)
    const value = parseScreenshotSet({
      ...current,
      ...metadata,
      updatedAt: new Date().toISOString(),
    })
    await this.assertSafeWriteTarget(target, this.setsPath)
    await this.validateDestination(value, true)
    await this.ensurePageLocale(value.pageId, value.locale)
    await this.persistManifest(target, value)
    return value
  }

  private async deleteSetUnlocked(id: string): Promise<void> {
    const target = this.resolveSet(id)
    await this.assertManagedDirectory(path.dirname(target))
    await this.assertRegularFile(target)
    await unlink(target)
  }

  /** Rollbacks discard only newly created folders; user deletions retain artwork. */
  private async discardNewCollection(id: string): Promise<void> {
    const target = this.resolveSet(id)
    await this.assertManagedDirectory(this.setsPath)
    await rm(path.dirname(target), { recursive: true, force: true })
  }

  async readAssetImports(): Promise<AssetImport[]> {
    try {
      return parseAssetImports(JSON.parse(await this.readManagedFile(path.join(this.assetsPath, ASSET_IMPORTS_FILENAME), this.assetsPath, "utf8")))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
      throw error
    }
  }

  async importCatalogAsset(
    input: CatalogAsset,
    contents: Buffer,
    license: Buffer,
    options: { replace?: boolean } = {},
  ): Promise<{ id: string; path: string; checksum: string; reused: boolean; replaced: boolean; licensePath: string }> {
    const asset = parseCatalogSnapshot(input)
    if (assetChecksum(contents) !== asset.checksum) throw new Error(`Catalog checksum changed: ${asset.id}`)
    assertValidImage(asset.file, contents)
    if (!license.length) throw new Error("An asset license is required")
    return this.runExclusive("asset-catalog", async () => {
      const imports = await this.readAssetImports()
      const files = await scanLocalAssetFiles(this.assetsPath)
      const match = files.find(file => file.checksum === asset.checksum)
      const id = match?.path ?? `other/${asset.id}${path.extname(asset.file).toLowerCase()}`
      const target = path.join(this.assetsPath, id)
      const metadataTarget = path.join(this.assetsPath, ASSET_IMPORTS_FILENAME)
      await this.assertSafeWriteTarget(metadataTarget, this.assetsPath)
      const old = files.find(file => file.path === id)
      if (!match && old && !options.replace) throw new Error(`${id} has different contents; pass --replace to overwrite it`)
      const licenseDirectory = path.join(this.assetsPath, ".licenses")
      await this.ensureManagedDirectory(licenseDirectory, this.assetsPath)
      const licensePath = `.licenses/${hash(license)}.txt`
      const licenseTarget = path.join(this.assetsPath, licensePath)
      await this.assertSafeWriteTarget(licenseTarget, licenseDirectory)
      if (!match) await this.assertSafeWriteTarget(target, path.dirname(target))
      const previous = imports.find(entry => entry.asset.id === asset.id && entry.asset.checksum === asset.checksum)
      const receipt: AssetImport = { asset, paths: [...new Set([...(previous?.paths ?? []), id])], licensePath }
      const next = imports.filter(entry => entry !== previous)
      next.push(receipt)
      await writeFileAtomically(licenseTarget, license)
      const backup = !match && old ? await this.readManagedFile(target, path.dirname(target)) : undefined
      if (!match) await writeFileAtomically(target, contents)
      try {
        await writeJson(metadataTarget, { version: 1, imports: next })
      } catch (error) {
        if (!match) {
          if (backup) await writeFileAtomically(target, backup)
          else await unlink(target)
        }
        throw error
      }
      this.assetHashes.delete(target)
      return { id: asset.id, path: `assets/${id}`, checksum: asset.checksum, reused: !!match, replaced: !match && !!old, licensePath: `assets/${licensePath}` }
    })
  }

  private async listAssetsInCategory(
    category: AssetCategory,
  ): Promise<Asset[]> {
    const directory = path.join(this.assetsPath, category)
    const entries = await readdir(directory, { withFileTypes: true })
    const files = entries
      .filter(
        (entry) =>
          entry.isFile() &&
          supportedExtensions.has(path.extname(entry.name).toLowerCase()),
      )
      .sort((a, b) => a.name.localeCompare(b.name))

    const assetMetadata = await this.readAssetMetadata()
    return Promise.all(
      files.map(async (file) => {
        const filename = path.join(directory, file.name)
        const [metadata, contents] = await Promise.all([
          stat(filename),
          this.readManagedFile(filename, directory),
        ])
        const dimensions = readImageMetadata(contents)
        const detectedDeviceType =
          category === "screenshots" && dimensions
            ? detectScreenshotDeviceType(dimensions.width, dimensions.height)
            : undefined
        const deviceTypeOverride =
          assetMetadata[`${category}/${file.name}`]?.deviceType
        return {
          id: `${category}/${file.name}`,
          category,
          name: file.name,
          url: `/api/assets/${category}/${encodeURIComponent(file.name)}?v=${Math.trunc(metadata.mtimeMs)}`,
          size: metadata.size,
          checksum: assetChecksum(contents),
          modifiedAt: metadata.mtime.toISOString(),
          ...(dimensions ?? {}),
          ...(detectedDeviceType
            ? {
                detectedDeviceType,
                deviceTypeOverride,
                deviceType: deviceTypeOverride ?? detectedDeviceType,
              }
            : {}),
        }
      }),
    )
  }

  private async readAssetMetadata(): Promise<AssetMetadata> {
    const target = path.join(this.assetsPath, ASSET_METADATA_FILENAME)
    try {
      const value: unknown = JSON.parse(
        await this.readManagedFile(target, this.assetsPath, "utf8"),
      )
      if (!isRecord(value) || value.version !== 1 || !isRecord(value.assets))
        return {}
      return Object.fromEntries(
        Object.entries(value.assets).flatMap(([id, entry]) => {
          if (
            !isRecord(entry) ||
            !SCREENSHOT_DEVICE_TYPES.includes(
              entry.deviceType as ScreenshotDeviceType,
            )
          )
            return []
          return [
            [id, { deviceType: entry.deviceType as ScreenshotDeviceType }],
          ]
        }),
      )
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

  private async updateAssetMetadataFile(
    update: (metadata: AssetMetadata) => void,
  ): Promise<void> {
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
    if (
      cached &&
      cached.mtimeMs === metadata.mtimeMs &&
      cached.size === metadata.size
    )
      return cached.hash
    const value = hash(await this.readManagedFile(filename, boundary))
    this.assetHashes.set(filename, {
      hash: value,
      mtimeMs: metadata.mtimeMs,
      size: metadata.size,
    })
    return value
  }

  /** Resolve a stable area ID to its optional descriptive filename suffix. */
  async resolveAreaHtmlFile(setId: string, areaId: string): Promise<string> {
    this.resolveSet(setId)
    await this.assertManagedDirectory(this.setsPath)
    if (!safeIdentifierPattern.test(areaId) || areaId === "index") throw new Error("Invalid area id")
    const directory = path.join(this.setsPath, setId)
    await this.assertManagedDirectory(directory)
    const manifest = JSON.parse(await this.readManagedFile(this.resolveSet(setId), directory, "utf8"))
    const ids = Array.isArray(manifest?.areas) ? manifest.areas.filter((id: unknown): id is string => typeof id === "string") : []
    const stem = await this.areaFileStem(directory, areaId, ids)
    return path.join(directory, `${stem}.html`)
  }

  private async areaFileStem(directory: string, id: string, ids: string[]): Promise<string> {
    const entries = await readdir(directory)
    const stems = new Set(entries.flatMap((filename) => {
      const extension = path.extname(filename)
      if (extension !== ".json" && extension !== ".html") return []
      const stem = filename.slice(0, -extension.length)
      // A longer area ID can share this prefix; its files are not descriptive suffixes.
      if (ids.some(other => other !== id && other.startsWith(`${id}-`) && (stem === other || stem.startsWith(`${other}-`)))) return []
      if (stem === id || (stem.startsWith(`${id}-`) && safeIdentifierPattern.test(stem))) return [stem]
      return []
    }))
    if (stems.size > 1) throw new Error(`Ambiguous filenames for area ${id}; JSON and HTML must use one matching stem`)
    return [...stems][0] ?? id
  }

  async readSet(id: string): Promise<ScreenshotSet> {
    const directory = path.join(this.setsPath, id)
    const target = this.resolveSet(id)
    if (!safeIdentifierPattern.test(id)) throw new Error("Unsupported set id")
    await this.assertManagedDirectory(this.setsPath)
    await this.assertManagedDirectory(directory)
    const manifest = JSON.parse(
      await this.readManagedFile(target, directory, "utf8"),
    )
    if (manifest.version !== 3)
      throw new Error("Unsupported set file version")
    if (!Array.isArray(manifest.areas))
      throw new Error("Set areas must be an array")
    const areaIds = manifest.areas.map((entry: unknown): string => {
      if (typeof entry !== "string" || !safeIdentifierPattern.test(entry) || entry === "index")
        throw new Error("Invalid area id")
      return entry
    })
    const areas = await Promise.all(
      areaIds.map(async (areaId: string) => {
        const stem = await this.areaFileStem(directory, areaId, areaIds)
        const metadata = JSON.parse(
          await this.readManagedFile(path.join(directory, `${stem}.json`), directory, "utf8"),
        )
        if (!isRecord(metadata)) throw new Error("Invalid artboard metadata")
        const html = await this.readManagedFile(path.join(directory, `${stem}.html`), directory, "utf8")
        return { id: areaId, name: metadata.name, ...(metadata.canvas !== undefined ? { canvas: metadata.canvas } : {}), html, htmlPath: `sets/${id}/${stem}.html` }
      }),
    )
    const result = parseScreenshotSet({
      ...manifest,
      id,
      areas,
    })
    result.areas.forEach((area, index) => { area.htmlPath = areas[index].htmlPath })
    return result
  }

  /** Restore deleted collections if a page or language update fails. */
  private async restoreSet(set: ScreenshotSet): Promise<void> {
    const value = parseScreenshotSet(set)
    const target = this.resolveSet(value.id)
    await this.assertSafeWriteTarget(target, this.setsPath)
    await this.persistSet(target, value)
  }

  private async persistSet(
    target: string,
    value: ScreenshotSet,
  ): Promise<void> {
    const directory = path.join(this.setsPath, value.id)
    await this.ensureManagedDirectory(directory, this.setsPath)
    // Validate all targets before writing any content. Removed artboards remain recoverable on disk.
    await this.assertSafeWriteTarget(target, directory)
    const ids = value.areas.map(area => area.id)
    const files = await Promise.all(value.areas.map(async (area) => ({ area, stem: await this.areaFileStem(directory, area.id, ids) })))
    for (const { stem } of files) {
      await this.assertSafeWriteTarget(path.join(directory, `${stem}.html`), directory)
      await this.assertSafeWriteTarget(path.join(directory, `${stem}.json`), directory)
    }
    for (const { area, stem } of files)
      await writeFileAtomically(path.join(directory, `${stem}.html`), area.html)
    await this.persistManifest(target, value)
  }

  private async persistManifest(
    target: string,
    value: ScreenshotSet,
  ): Promise<void> {
    const directory = path.join(this.setsPath, value.id)
    // Metadata-only edits preserve hand-edited HTML and descriptive filenames.
    const ids = value.areas.map(area => area.id)
    const files = await Promise.all(value.areas.map(async (area) => ({ area, stem: await this.areaFileStem(directory, area.id, ids) })))
    for (const { stem } of files)
      await this.assertSafeWriteTarget(path.join(directory, `${stem}.json`), directory)
    await this.assertSafeWriteTarget(target, directory)
    for (const { area, stem } of files)
      await writeJson(path.join(directory, `${stem}.json`), { name: area.name, ...(area.canvas ? { canvas: area.canvas } : {}) })
    const { id: _id, areas, ...metadata } = value
    await writeJson(target, { ...metadata, areas: areas.map((area) => area.id) })
  }

  private async runExclusive<T>(
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.operations.get(key) ?? Promise.resolve()
    const result = previous.catch(() => undefined).then(operation)
    const tail = result.then(
      () => undefined,
      () => undefined,
    )
    this.operations.set(key, tail)
    try {
      return await result
    } finally {
      if (this.operations.get(key) === tail) this.operations.delete(key)
    }
  }

  private async assertManagedDirectory(directory: string): Promise<void> {
    const relative = path.relative(this.root, directory)
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      throw new Error("Directory is outside the project boundary")
    let current = this.root
    for (const segment of ["", ...relative.split(path.sep).filter(Boolean)]) {
      current = path.join(current, segment)
      const metadata = await lstat(current)
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error(
          `${path.relative(this.root, current) || "."} must be a regular project directory`,
        )
      }
    }
    await this.assertContained(await realpath(directory), this.root, true)
  }

  private async ensureManagedDirectory(
    directory: string,
    boundary: string,
  ): Promise<void> {
    await this.assertManagedDirectory(boundary)
    const relative = path.relative(boundary, directory)
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error("Directory is outside the project boundary")
    let current = boundary
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, segment)
      try {
        await mkdir(current)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      }
      const metadata = await lstat(current)
      if (!metadata.isDirectory() || metadata.isSymbolicLink())
        throw new Error("Project directories cannot be symbolic links")
    }
    await this.assertContained(await realpath(directory), boundary, true)
  }

  private async assertSafeWriteTarget(
    target: string,
    boundary: string,
  ): Promise<void> {
    await this.assertManagedDirectory(boundary)
    const relative = path.relative(boundary, target)
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error("File is outside the project boundary")
    let parent = boundary
    for (const segment of path.dirname(relative).split(path.sep).filter((part) => part !== ".")) {
      parent = path.join(parent, segment)
      try {
        await this.assertManagedDirectory(parent)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") break
        throw error
      }
    }
    try {
      const metadata = await lstat(target)
      if (metadata.isSymbolicLink() || !metadata.isFile())
        throw new Error("Project files must be regular files")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }

  private async readManagedFile(
    filename: string,
    boundary: string,
  ): Promise<Buffer>
  private async readManagedFile(
    filename: string,
    boundary: string,
    encoding: BufferEncoding,
  ): Promise<string>
  private async readManagedFile(
    filename: string,
    boundary: string,
    encoding?: BufferEncoding,
  ): Promise<Buffer | string> {
    await this.assertManagedDirectory(boundary)
    await this.assertRegularFile(filename)
    await this.assertContained(await realpath(filename), boundary)
    return encoding ? readFile(filename, encoding) : readFile(filename)
  }

  private async assertRegularFile(filename: string): Promise<void> {
    const metadata = await lstat(filename)
    if (!metadata.isFile() || metadata.isSymbolicLink())
      throw new Error("Project files must be regular files")
  }

  private async assertContained(
    candidate: string,
    boundary: string,
    allowEqual = false,
  ): Promise<void> {
    const resolvedBoundary = await realpath(boundary)
    if (
      (allowEqual && candidate === resolvedBoundary) ||
      candidate.startsWith(`${resolvedBoundary}${path.sep}`)
    )
      return
    throw new Error("File is outside the project boundary")
  }

  private resolveSet(id: string): string {
    if (!safeIdentifierPattern.test(id)) throw new Error("Unsupported set id")
    return path.join(this.setsPath, id, "index.json")
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

function parseCreateSetInput(value: unknown): CreateSetInput {
  if (!isRecord(value)) throw new Error("Set details must be an object")
  return {
    ...(value.pageId !== undefined
      ? { pageId: identifier(value.pageId, "Page id") }
      : {}),
    ...(value.specId !== undefined
      ? { specId: identifier(value.specId, "Specification id") }
      : {}),
    name: readString(value.name, "Set name"),
    locale: readString(value.locale, "Locale"),
    device: readString(value.device, "Device"),
    width: readPixelDimension(value.width, "Canvas width"),
    height: readPixelDimension(value.height, "Canvas height"),
  }
}

function parseSetMetadataInput(value: unknown): UpdateSetMetadataInput {
  if (!isRecord(value)) throw new Error("Set settings must be an object")
  return {
    ...(value.pageId !== undefined
      ? { pageId: identifier(value.pageId, "Page id") }
      : {}),
    ...(value.specId !== undefined
      ? { specId: identifier(value.specId, "Specification id") }
      : {}),
    name: readString(value.name, "Set name"),
    locale: readString(value.locale, "Locale"),
    device: readString(value.device, "Device"),
  }
}

export function parseScreenshotSet(value: unknown): ScreenshotSet {
  if (!isRecord(value)) throw new Error("Set file must contain an object")
  if (value.version !== 3)
    throw new Error("Unsupported set file version")
  const id = readString(value.id, "Set id")
  if (!safeIdentifierPattern.test(id)) throw new Error("Set id is invalid")
  if (!isRecord(value.canvas)) throw new Error("Set canvas is invalid")
  if (!Array.isArray(value.areas) || !value.areas.length)
    throw new Error("A set needs at least one screenshot area")
  const ids = new Set<string>()
  const areas = value.areas.map((area): ScreenshotArea => {
    if (!isRecord(area)) throw new Error("Invalid artboard")
    const areaId = readString(area.id, "Area id")
    if (!safeIdentifierPattern.test(areaId) || areaId === "index" || ids.has(areaId))
      throw new Error("Invalid or duplicate area id")
    ids.add(areaId)
    if (typeof area.html !== "string" || !area.html.trim())
      throw new Error("Artboard HTML must be a non-empty string")
    if (Buffer.byteLength(area.html) > 20 * 1024 * 1024)
      throw new Error("Artboard HTML exceeds 20 MiB")
    if (area.canvas !== undefined && !isRecord(area.canvas))
      throw new Error("Artboard canvas is invalid")
    return {
      ...(isRecord(area.canvas) ? { canvas: {
        width: readPixelDimension(area.canvas.width, "Artboard canvas width"),
        height: readPixelDimension(area.canvas.height, "Artboard canvas height"),
      } } : {}),
      id: areaId,
      name: readString(area.name, "Area name"),
      html: area.html,
    }
  })
  return {
    version: 3,
    id,
    areas,
    pageId: identifier(value.pageId, "Page id"),
    specId: identifier(value.specId, "Specification id"),
    ...(typeof value.sourceLocale === "string"
      ? { sourceLocale: readString(value.sourceLocale, "Source locale") }
      : {}),
    name: readString(value.name, "Set name"),
    locale: readString(value.locale, "Locale"),
    device: readString(value.device, "Device"),
    canvas: {
      width: readPixelDimension(value.canvas.width, "Canvas width"),
      height: readPixelDimension(value.canvas.height, "Canvas height"),
    },
    createdAt: readString(value.createdAt, "Created time"),
    updatedAt: readString(value.updatedAt, "Updated time"),
  }
}

function readString(value: unknown, name: string): string {
  const result = typeof value === "string" ? value.trim() : ""
  if (!result) throw new Error(`${name} must be a non-empty string`)
  return result
}

function readNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${name} must be a number`)
  return value
}

function readPixelDimension(value: unknown, name: string): number {
  const result = readNumber(value, name)
  if (!Number.isInteger(result) || result <= 0 || result > 20_000)
    throw new Error(`${name} is outside the supported range`)
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

async function writeFileAtomically(
  filename: string,
  contents: Buffer | string,
): Promise<void> {
  const temporary = path.join(
    path.dirname(filename),
    `.${path.basename(filename)}.${randomUUID()}.tmp`,
  )
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
  if (!isImageFile(filename) || !readImageMetadata(contents))
    throw new Error("The uploaded file is not a valid supported image")
}
