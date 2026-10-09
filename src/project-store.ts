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
import {
  detectScreenshotDeviceType,
  readImageMetadata,
} from "./image-metadata.js"
import {
  assetSpec,
  defaultConfig,
  inferSpec,
  acceptsSize,
  specsForPage,
  creationSpecsForPage,
  creationSize,
} from "./app-store.js"
import { parseStoreShotConfig, identifier } from "./app-store-config.js"
import { APP_STORE_LOCALES } from "./app-store-locales.js"
export { parseStoreShotConfig } from "./app-store-config.js"
import { createArtboardHtml } from "./html-artboard.js"

import {
  ASSET_CATEGORIES,
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
export const MOCKUP_BUNDLES_DIRECTORY = "mockup-bundles"
const MOCKUP_IMPORTS_DIRECTORY = ".imports"

const supportedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"])
const supportedMockupBundleExtensions = new Set([
  ".jpeg",
  ".jpg",
  ".md",
  ".png",
  ".svg",
  ".txt",
  ".webp",
])
const safeIdentifierPattern = /^[a-z0-9][a-z0-9-]*$/

export class ProjectStore {
  readonly root: string
  readonly configPath: string
  readonly assetsPath: string
  readonly setsPath: string
  readonly mockupBundlesPath: string
  readonly mockupImportsPath: string
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
    this.mockupBundlesPath = path.join(this.root, MOCKUP_BUNDLES_DIRECTORY)
    this.mockupImportsPath = path.join(
      this.mockupBundlesPath,
      MOCKUP_IMPORTS_DIRECTORY,
    )
  }

  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true })
    await this.assertManagedDirectory(this.root)
    await this.ensureManagedDirectory(this.assetsPath, this.root)
    await this.ensureManagedDirectory(this.setsPath, this.root)
    await this.ensureManagedDirectory(this.mockupBundlesPath, this.root)
    await rm(this.mockupImportsPath, { recursive: true, force: true })
    await this.ensureManagedDirectory(
      this.mockupImportsPath,
      this.mockupBundlesPath,
    )
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
      return { directory: this.root, config, assets, sets }
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
    if (safeName !== filename || !supportedExtensions.has(extension)) {
      throw new Error("Unsupported asset filename")
    }

    return path.join(this.assetsPath, category, safeName)
  }

  async resolveExistingAsset(
    category: string,
    filename: string,
  ): Promise<string> {
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
        .filter(
          (entry) => entry.isFile() && path.extname(entry.name) === ".json",
        )
        .map(async (entry) => this.readSet(entry.name.slice(0, -5))),
    )
    return sets.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  private async createSetUnlocked(
    input: CreateSetInput,
  ): Promise<ScreenshotSet> {
    const value = parseCreateSetInput(input)
    const now = new Date().toISOString()
    const id = `${slugify(value.name)}-${randomUUID().slice(0, 8)}`
    const areaId = `area-${randomUUID()}`
    const set: ScreenshotSet = {
      version: 3,
      id,
      name: value.name,
      locale: value.locale,
      device: value.device,
      pageId: value.pageId ?? "default",
      specId:
        value.specId ?? inferSpec(value.width, value.height, value.device),
      canvas: { width: value.width, height: value.height },
      areas: [
        {
          id: areaId,
          name: "Screenshot 1",
          html: createArtboardHtml(value.width, value.height, {
            locale: value.locale,
            fullBleed: value.specId === "watch",
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
    if (
      !specsForPage({
        id: "copy",
        name: "Copy",
        kind: "custom",
        localizations: [source.locale],
      }).some((spec) => spec.id === source.specId)
    )
      throw new Error(
        "Only compatible iPhone, iPad and creative collections can be copied to a custom product page",
      )
    const page = await this.createPageUnlocked({
      name: `${source.name} copy`,
      kind: "custom",
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
    await this.ensurePageLocale(pageId, locale)
    await this.copySetResources(
      path.join(this.setsPath, source.id),
      path.join(this.setsPath, copy.id),
    )
    return this.writeSetUnlocked(copy.id, copy)
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
    if (!specsForPage(page).includes(spec))
      throw new Error("This destination is not enabled for the product page")
    if (!acceptsSize(spec, set.canvas.width, set.canvas.height))
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
    if (input.kind !== "custom" && input.kind !== "treatment")
      throw new Error("Choose a custom page or optimization treatment")
    const name = readString(input.name, "Page name")
    const source = input.sourcePageId
      ? config.pages.find((page) => page.id === input.sourcePageId)
      : undefined
    if (input.sourcePageId && !source) throw new Error("Unknown source page")
    let testId = input.testId
    if (input.kind === "treatment" && !testId) {
      const testName = readString(input.testName, "Test name")
      testId = `test-${randomUUID().slice(0, 8)}`
      config.tests.push({ id: testId, name: testName })
    }
    const page: ProductPage = {
      id: `${input.kind}-${randomUUID().slice(0, 8)}`,
      name,
      kind: input.kind,
      localizations: [...(source?.localizations ?? [])],
      ...(input.kind === "treatment" ? { testId } : {}),
    }
    config.pages.push(page)
    parseStoreShotConfig(config)
    const collections = source
      ? (await this.listSets()).filter(
          (set) =>
            set.pageId === source.id &&
            specsForPage(page).some((spec) => spec.id === set.specId),
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
      for (const copy of copies) await this.deleteSetUnlocked(copy.id)
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
      for (const copy of copies) await this.deleteSetUnlocked(copy.id)
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

  private async deletePageUnlocked(pageId: string): Promise<void> {
    const config = await this.readConfig()
    const page = config.pages.find((page) => page.id === pageId)
    if (!page) throw new Error("Unknown product page")
    if (page.kind === "default")
      throw new Error("The default product page cannot be removed")
    const sets = (await this.listSets()).filter((set) => set.pageId === pageId)
    const next = {
      ...config,
      pages: config.pages.filter((page) => page.id !== pageId),
    }
    next.tests = config.tests.filter((test) =>
      next.pages.some((page) => page.testId === test.id),
    )
    try {
      for (const set of sets) await this.deleteSetUnlocked(set.id)
      await this.writeConfigUnlocked(next)
    } catch (error) {
      for (const set of sets) await this.writeMigratedSet(set)
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
      !creationSpecsForPage(page).some(
        (spec) => spec.device !== "creative" && devices.has(spec.device),
      )
    )
      devices.add("iphone")
    try {
      for (const spec of creationSpecsForPage(page).filter(
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
            id: `area-${randomUUID()}`,
            name: asset.name.replace(/\.[^.]+$/, ""),
            html: createArtboardHtml(width, height, {
              locale,
              image: `../../assets/${asset.id.split("/").map(encodeURIComponent).join("/")}`,
              fullBleed: spec.id === "watch",
            }),
          }))
          await this.writeSetUnlocked(collection.id, collection)
        }
      }
    } catch (error) {
      for (const set of created) await this.deleteSetUnlocked(set.id)
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
    await this.assertRegularFile(target)
    await unlink(target)
  }

  async readMockupBundleManifest(id: string): Promise<MockupBundleManifest> {
    if (!safeIdentifierPattern.test(id))
      throw new Error("Invalid mockup bundle id")
    const directory = path.join(this.mockupBundlesPath, id)
    const manifest = parseMockupBundleManifest(
      JSON.parse(
        await this.readManagedFile(
          path.join(directory, MOCKUP_BUNDLE_FILENAME),
          directory,
          "utf8",
        ),
      ),
    )
    if (manifest.id !== id)
      throw new Error("Mockup bundle folder does not match manifest id")
    return manifest
  }

  async listMockupCatalog(): Promise<DeviceMockupCatalog> {
    const entries = await readdir(this.mockupBundlesPath, {
      withFileTypes: true,
    })
    const catalogs = (
      await Promise.all(
        entries
          .filter(
            (entry) =>
              entry.isDirectory() && safeIdentifierPattern.test(entry.name),
          )
          .map(async (entry) => {
            const manifestPath = path.join(
              this.mockupBundlesPath,
              entry.name,
              MOCKUP_BUNDLE_FILENAME,
            )
            let contents: string
            try {
              contents = await this.readManagedFile(
                manifestPath,
                path.dirname(manifestPath),
                "utf8",
              )
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "ENOENT")
                return undefined
              throw error
            }
            const manifest = parseMockupBundleManifest(JSON.parse(contents))
            if (manifest.id !== entry.name)
              throw new Error(
                `Mockup bundle folder ${entry.name} does not match manifest id ${manifest.id}`,
              )
            return resolveMockupBundle(
              manifest,
              `/api/mockup-bundle-files/${encodeURIComponent(manifest.id)}/`,
              "project",
            )
          }),
      )
    ).filter((catalog): catalog is DeviceMockupCatalog => catalog !== undefined)
    return catalogs.length > 0
      ? mergeDeviceMockupCatalogs(...catalogs)
      : emptyDeviceMockupCatalog()
  }

  async writeMockupBundleManifest(
    bundleId: string,
    input: unknown,
  ): Promise<MockupBundleManifest> {
    if (!safeIdentifierPattern.test(bundleId))
      throw new Error("Unsupported mockup bundle id")
    if (bundleId === "frameup-free")
      throw new Error(
        "frameup-free is reserved for StoreShot's built-in bundle",
      )
    const manifest = parseMockupBundleManifest(input)
    if (manifest.id !== bundleId)
      throw new Error("Mockup bundle id cannot be changed")
    const bundleDirectory = path.join(this.mockupBundlesPath, bundleId)
    await this.ensureManagedDirectory(bundleDirectory, this.mockupBundlesPath)
    await Promise.all(
      bundleAssetPaths(manifest).map(async (relativePath) => {
        await this.resolveExistingMockupBundleFile(bundleId, relativePath)
      }),
    )
    const manifestPath = path.join(bundleDirectory, MOCKUP_BUNDLE_FILENAME)
    await this.runExclusive(manifestPath, async () =>
      writeJson(manifestPath, manifest),
    )
    return manifest
  }

  async writeMockupBundleFile(
    bundleId: string,
    relativePath: string,
    contents: Buffer,
  ): Promise<void> {
    if (bundleId === "frameup-free")
      throw new Error(
        "frameup-free is reserved for StoreShot's built-in bundle",
      )
    const target = this.resolveMockupBundleFile(bundleId, relativePath)
    if (isImageFile(relativePath)) assertValidImage(relativePath, contents)
    await this.ensureManagedDirectory(
      path.dirname(target),
      this.mockupBundlesPath,
    )
    await this.assertSafeWriteTarget(target, path.dirname(target))
    await this.runExclusive(target, async () =>
      writeFileAtomically(target, contents),
    )
  }

  async writeMockupBundleImportFile(
    importId: string,
    bundleId: string,
    relativePath: string,
    contents: Buffer,
  ): Promise<void> {
    this.assertMockupImportId(importId)
    this.resolveMockupBundleFile(bundleId, relativePath)
    if (isImageFile(relativePath)) assertValidImage(relativePath, contents)
    const bundleDirectory = path.join(
      this.mockupImportsPath,
      importId,
      bundleId,
    )
    const target = path.resolve(bundleDirectory, relativePath)
    if (!target.startsWith(`${bundleDirectory}${path.sep}`))
      throw new Error("Mockup bundle file is outside the import")
    await this.ensureManagedDirectory(
      path.dirname(target),
      this.mockupImportsPath,
    )
    await this.assertSafeWriteTarget(target, path.dirname(target))
    await this.runExclusive(target, async () =>
      writeFileAtomically(target, contents),
    )
  }

  async commitMockupBundleImport(
    importId: string,
    bundleId: string,
    input: unknown,
  ): Promise<MockupBundleManifest> {
    this.assertMockupImportId(importId)
    if (!safeIdentifierPattern.test(bundleId))
      throw new Error("Unsupported mockup bundle id")
    if (bundleId === "frameup-free")
      throw new Error(
        "frameup-free is reserved for StoreShot's built-in bundle",
      )
    const manifest = parseMockupBundleManifest(input)
    if (manifest.id !== bundleId)
      throw new Error("Mockup bundle id cannot be changed")

    const importDirectory = path.join(this.mockupImportsPath, importId)
    const stagedBundle = path.join(importDirectory, bundleId)
    await this.assertManagedDirectory(stagedBundle)
    await Promise.all(
      bundleAssetPaths(manifest).map(async (relativePath) => {
        const target = path.resolve(stagedBundle, relativePath)
        if (!target.startsWith(`${stagedBundle}${path.sep}`))
          throw new Error("Mockup bundle file is outside the import")
        await this.readManagedFile(target, stagedBundle)
      }),
    )
    await writeJson(path.join(stagedBundle, MOCKUP_BUNDLE_FILENAME), manifest)

    const finalBundle = path.join(this.mockupBundlesPath, bundleId)
    const backupBundle = path.join(
      this.mockupBundlesPath,
      `.${bundleId}.${randomUUID()}.backup`,
    )
    await this.runExclusive(`mockup-bundle:${bundleId}`, async () => {
      let hasBackup = false
      try {
        const metadata = await lstat(finalBundle)
        if (!metadata.isDirectory() || metadata.isSymbolicLink())
          throw new Error("Mockup bundle must be a regular directory")
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
      if (hasBackup)
        await rm(backupBundle, { recursive: true, force: true }).catch(
          () => undefined,
        )
      await rm(importDirectory, { recursive: true, force: true }).catch(
        () => undefined,
      )
    })
    return manifest
  }

  async discardMockupBundleImport(importId: string): Promise<void> {
    this.assertMockupImportId(importId)
    const target = path.join(this.mockupImportsPath, importId)
    const relative = path.relative(this.mockupImportsPath, target)
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error("Mockup import is outside the project boundary")
    await rm(target, { recursive: true, force: true })
  }

  resolveMockupBundleFile(bundleId: string, relativePath: string): string {
    if (!safeIdentifierPattern.test(bundleId))
      throw new Error("Unsupported mockup bundle id")
    if (
      !isSafeBundlePath(relativePath) ||
      relativePath === MOCKUP_BUNDLE_FILENAME
    ) {
      throw new Error("Unsupported mockup bundle file path")
    }
    const extension = path.extname(relativePath).toLowerCase()
    if (
      path.basename(relativePath) !== "LICENSE" &&
      !supportedMockupBundleExtensions.has(extension)
    ) {
      throw new Error("Unsupported mockup bundle file type")
    }
    const bundleRoot = path.join(this.mockupBundlesPath, bundleId)
    const target = path.resolve(bundleRoot, relativePath)
    if (!target.startsWith(`${bundleRoot}${path.sep}`))
      throw new Error("Mockup bundle file is outside the bundle")
    return target
  }

  async resolveExistingMockupBundleFile(
    bundleId: string,
    relativePath: string,
  ): Promise<string> {
    const bundleRoot = await realpath(
      path.join(this.mockupBundlesPath, bundleId),
    )
    await this.assertContained(bundleRoot, this.mockupBundlesPath)
    await this.assertRegularFile(
      this.resolveMockupBundleFile(bundleId, relativePath),
    )
    const target = await realpath(
      this.resolveMockupBundleFile(bundleId, relativePath),
    )
    if (!target.startsWith(`${bundleRoot}${path.sep}`))
      throw new Error("Mockup bundle file is outside the bundle")
    return target
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

  async readSet(id: string): Promise<ScreenshotSet> {
    return this.readManifestSet(id, false)
  }

  async readLegacyHtmlSet(id: string): Promise<ScreenshotSet> {
    return this.readManifestSet(id, true)
  }

  private async readManifestSet(
    id: string,
    legacy: boolean,
  ): Promise<ScreenshotSet> {
    const target = this.resolveSet(id)
    const manifest = JSON.parse(
      await this.readManagedFile(target, this.setsPath, "utf8"),
    )
    if (manifest.version !== (legacy ? 2 : 3))
      throw new Error("Unsupported set file version; run storeshot migrate")
    if (manifest.id !== id)
      throw new Error("Set filename does not match its id")
    if (!Array.isArray(manifest.areas))
      throw new Error("Set areas must be an array")
    await this.assertManagedDirectory(path.join(this.setsPath, id))
    const areas = await Promise.all(
      manifest.areas.map(
        async (area: { id: string; name: string; file: string }) => {
          if (
            !safeIdentifierPattern.test(area.id) ||
            area.file !== `${id}/${area.id}.html`
          )
            throw new Error("Invalid artboard file path")
          const html = await this.readManagedFile(
            path.join(this.setsPath, area.file),
            path.join(this.setsPath, id),
            "utf8",
          )
          return { id: area.id, name: area.name, html }
        },
      ),
    )
    const result = parseScreenshotSet({
      ...manifest,
      ...(legacy
        ? { version: 3, pageId: "default", specId: "unassigned" }
        : {}),
      areas,
    })
    return result
  }

  /** Migration preflights the entire project before writing mixed-version manifests. */
  async writeMigratedSet(set: ScreenshotSet): Promise<void> {
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
    for (const area of value.areas)
      await this.assertSafeWriteTarget(
        path.join(directory, `${area.id}.html`),
        directory,
      )
    for (const area of value.areas)
      await writeFileAtomically(
        path.join(directory, `${area.id}.html`),
        area.html,
      )
    await this.persistManifest(target, value)
  }

  private async persistManifest(
    target: string,
    value: ScreenshotSet,
  ): Promise<void> {
    await writeJson(target, {
      ...value,
      areas: value.areas.map(({ id, name }) => ({
        id,
        name,
        file: `${value.id}/${id}.html`,
      })),
    })
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
    const metadata = await lstat(directory)
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(
        `${path.relative(this.root, directory) || "."} must be a regular project directory`,
      )
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

  private assertMockupImportId(importId: string): void {
    if (!safeIdentifierPattern.test(importId))
      throw new Error("Unsupported mockup import id")
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
    throw new Error("Unsupported set file version; run storeshot migrate")
  const id = readString(value.id, "Set id")
  if (!safeIdentifierPattern.test(id)) throw new Error("Set id is invalid")
  if (!isRecord(value.canvas)) throw new Error("Set canvas is invalid")
  if (!Array.isArray(value.areas) || !value.areas.length)
    throw new Error("A set needs at least one screenshot area")
  const ids = new Set<string>()
  const areas = value.areas.map((area): ScreenshotArea => {
    if (!isRecord(area)) throw new Error("Invalid artboard")
    const areaId = readString(area.id, "Area id")
    if (!safeIdentifierPattern.test(areaId) || ids.has(areaId))
      throw new Error("Invalid or duplicate area id")
    ids.add(areaId)
    if (typeof area.html !== "string" || !area.html.trim())
      throw new Error("Artboard HTML must be a non-empty string")
    if (Buffer.byteLength(area.html) > 20 * 1024 * 1024)
      throw new Error("Artboard HTML exceeds 20 MiB")
    return {
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
