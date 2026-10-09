import { readinessIssues } from "./app-store.js"
import { lstat, readFile, readdir } from "node:fs/promises"
import path from "node:path"

import {
  MOCKUP_BUNDLE_FILENAME,
  mergeDeviceMockupCatalogs,
  parseMockupBundleManifest,
  resolveMockupBundle,
  type DeviceMockupCatalog,
} from "./device-mockups.js"
import { resolvePackagePublicDirectory } from "./package-assets.js"
import {
  ASSETS_DIRECTORY,
  CONFIG_FILENAME,
  MOCKUP_BUNDLES_DIRECTORY,
  ProjectStore,
  SETS_DIRECTORY,
  parseStoreShotConfig,
} from "./project-store.js"
import type { Asset, AssetCategory, ScreenshotSet, StoreShotConfig } from "./shared.js"

export type ValidationSeverity = "error" | "warning"

export interface ValidationIssue {
  severity: ValidationSeverity
  code: string
  path: string
  message: string
}

export interface ValidationReport {
  ok: boolean
  directory: string
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  summary: {
    assets: number
    sets: number
    screenshots: number
    areas: number
  }
}

export interface ProjectValidation {
  report: ValidationReport
  config?: StoreShotConfig
  assets?: Record<AssetCategory, Asset[]>
  sets: ScreenshotSet[]
  mockupCatalog?: DeviceMockupCatalog
}

export async function validateProject(directory: string, packageRoot: string): Promise<ProjectValidation> {
  const root = path.resolve(directory)
  const issues: ValidationIssue[] = []
  const store = new ProjectStore(root)
  let config: StoreShotConfig | undefined
  let assets: Record<AssetCategory, Asset[]> | undefined
  let mockupCatalog: DeviceMockupCatalog | undefined
  const sets: ScreenshotSet[] = []

  if (!await checkDirectory(root, ".", issues)) return validationResult(root, issues, sets)

  const configPath = path.join(root, CONFIG_FILENAME)
  try {
    config = parseStoreShotConfig(JSON.parse(await readRegularFile(configPath, root)))
  } catch (error) {
    issues.push(issue("error", "config.invalid", CONFIG_FILENAME, messageFor(error)))
  }

  const assetsReady = await checkDirectory(path.join(root, ASSETS_DIRECTORY), ASSETS_DIRECTORY, issues)
  const setsReady = await checkDirectory(path.join(root, SETS_DIRECTORY), SETS_DIRECTORY, issues)
  const mockupsReady = await checkDirectory(path.join(root, MOCKUP_BUNDLES_DIRECTORY), MOCKUP_BUNDLES_DIRECTORY, issues)

  if (setsReady) {
    const entries = await readdir(store.setsPath, { withFileTypes: true })
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.name.endsWith(".json")) continue
      const relativePath = `${SETS_DIRECTORY}/${entry.name}`
      if (!entry.isFile() || entry.isSymbolicLink()) {
        issues.push(issue("error", "set.notRegularFile", relativePath, "Set documents must be regular JSON files"))
        continue
      }
      try {
        const set = await store.readSet(entry.name.slice(0, -5))
        sets.push(set)
        if (entry.name !== `${set.id}.json`) {
          issues.push(issue("error", "set.filenameMismatch", relativePath, `Set id ${set.id} must be stored in ${set.id}.json`))
        }
      } catch (error) {
        issues.push(issue("error", "set.invalid", relativePath, messageFor(error)))
      }
    }
  }

  if (assetsReady) {
    try {
      assets = await store.listAssets()
      for (const asset of Object.values(assets).flat()) {
        if (!asset.width || !asset.height) {
          issues.push(issue("error", "asset.invalidImage", `${ASSETS_DIRECTORY}/${asset.id}`, "Asset is not a valid supported image"))
        }
      }
    } catch (error) {
      issues.push(issue("error", "assets.invalid", ASSETS_DIRECTORY, messageFor(error)))
    }
  }

  if (mockupsReady) {
    try {
      const [builtInCatalog, projectCatalog] = await Promise.all([
        loadBuiltInMockupCatalog(packageRoot),
        store.listMockupCatalog(),
      ])
      mockupCatalog = mergeDeviceMockupCatalogs(builtInCatalog, projectCatalog)
    } catch (error) {
      issues.push(issue("error", "mockups.invalid", MOCKUP_BUNDLES_DIRECTORY, messageFor(error)))
    }
  }

  validateSetSemantics(sets, issues)
  if (config) for (const entry of readinessIssues(config, sets)) {
    issues.push(issue(["page", "dimensions", "count", "duplicate", "watch-size"].includes(entry.code) ? "error" : "warning", `appStore.${entry.code}`, entry.setId ? `sets/${entry.setId}.json` : `${entry.pageId}/${entry.locale}`, entry.message))
  }
  return validationResult(root, issues, sets, config, assets, mockupCatalog)
}

async function loadBuiltInMockupCatalog(packageRoot: string): Promise<DeviceMockupCatalog> {
  const publicDirectory = await resolvePackagePublicDirectory(packageRoot)
  const bundleDirectory = path.join(publicDirectory, "mockup-bundles/frameup-free")
  const manifest = parseMockupBundleManifest(JSON.parse(await readRegularFile(
    path.join(bundleDirectory, MOCKUP_BUNDLE_FILENAME),
    bundleDirectory,
  )))
  return resolveMockupBundle(manifest, "/mockup-bundles/frameup-free/", "built-in")
}

function validateSetSemantics(
  sets: ScreenshotSet[],
  issues: ValidationIssue[],
): void {
  const setIds = new Set<string>()

  for (const set of sets) {
    const setPath = `${SETS_DIRECTORY}/${set.id}.json`
    if (setIds.has(set.id)) issues.push(issue("error", "set.duplicateId", setPath, `Duplicate set id: ${set.id}`))
    setIds.add(set.id)

    try {
      Intl.getCanonicalLocales(set.locale)
    } catch {
      issues.push(issue("warning", "set.locale", setPath, `${set.locale} is not a recognized locale identifier`))
    }
    if (!isIsoTimestamp(set.createdAt)) issues.push(issue("warning", "set.createdAt", setPath, "createdAt should be an ISO 8601 timestamp"))
    if (!isIsoTimestamp(set.updatedAt)) issues.push(issue("warning", "set.updatedAt", setPath, "updatedAt should be an ISO 8601 timestamp"))
    if (set.areas.length > 10) issues.push(issue("warning", "set.areaCount", setPath, "Apple App Store sets normally contain at most 10 screenshots"))

    const ids = new Set<string>()
    for (const area of set.areas) {
      if (ids.has(area.id)) issues.push(issue("error", "set.duplicateObjectId", setPath, `Duplicate area or element id: ${area.id}`))
      ids.add(area.id)

    }
  }
}

async function checkDirectory(directory: string, displayPath: string, issues: ValidationIssue[]): Promise<boolean> {
  try {
    const metadata = await lstat(directory)
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("must be a regular directory")
    return true
  } catch (error) {
    issues.push(issue("error", "project.directory", displayPath, messageFor(error)))
    return false
  }
}

async function readRegularFile(filename: string, boundary: string): Promise<string> {
  const metadata = await lstat(filename)
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("must be a regular file")
  const relative = path.relative(boundary, filename)
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("is outside the project boundary")
  return readFile(filename, "utf8")
}

function validationResult(
  directory: string,
  issues: ValidationIssue[],
  sets: ScreenshotSet[],
  config?: StoreShotConfig,
  assets?: Record<AssetCategory, Asset[]>,
  mockupCatalog?: DeviceMockupCatalog,
): ProjectValidation {
  const errors = issues.filter((entry) => entry.severity === "error")
  const warnings = issues.filter((entry) => entry.severity === "warning")
  const allAssets = Object.values(assets ?? {}).flat()
  return {
    report: {
      ok: errors.length === 0,
      directory,
      errors,
      warnings,
      summary: {
        assets: allAssets.length,
        sets: sets.length,
        screenshots: assets?.screenshots.length ?? 0,
        areas: sets.reduce((total, set) => total + set.areas.length, 0),
      },
    },
    ...(config ? { config } : {}),
    ...(assets ? { assets } : {}),
    sets,
    ...(mockupCatalog ? { mockupCatalog } : {}),
  }
}

function issue(severity: ValidationSeverity, code: string, issuePath: string, message: string): ValidationIssue {
  return { severity, code, path: issuePath, message }
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isIsoTimestamp(value: string): boolean {
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.toISOString() === value
}
