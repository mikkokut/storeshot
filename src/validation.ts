import { scanLocalAssetFiles, catalogInstallation } from "./asset-catalog.js"
import { readinessIssues } from "./app-store.js"
import { lstat, readFile, readdir } from "node:fs/promises"
import path from "node:path"

import {
  ASSETS_DIRECTORY,
  CONFIG_FILENAME,
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
  pageId?: string
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
}

export async function validateProject(directory: string, options: { pageId?: string } = {}): Promise<ProjectValidation> {
  const root = path.resolve(directory)
  const issues: ValidationIssue[] = []
  const store = new ProjectStore(root)
  let config: StoreShotConfig | undefined
  let assets: Record<AssetCategory, Asset[]> | undefined
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

  if (setsReady) {
    const entries = await readdir(store.setsPath, { withFileTypes: true })
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name.startsWith(".")) continue
      const relativePath = `${SETS_DIRECTORY}/${entry.name}/index.json`
      if (entry.isSymbolicLink()) {
        issues.push(issue("error", "set.notRegularFile", relativePath, "Set directories cannot be symbolic links"))
        continue
      }
      if (!entry.isDirectory()) continue
      try {
        await lstat(path.join(store.setsPath, entry.name, "index.json"))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue
        throw error
      }
      try {
        sets.push(await store.readSet(entry.name))
      } catch (error) {
        issues.push(issue("error", "set.invalid", relativePath, messageFor(error)))
      }
    }
  }

  if (assetsReady) {
    try {
      assets = await store.listAssets()
      const imports = await store.readAssetImports()
      for (const entry of imports) {
        const licensePath = path.join(store.assetsPath, entry.licensePath)
        try {
          if (!(await readRegularFile(licensePath, store.assetsPath)).trim()) throw new Error("must not be empty")
        } catch (error) {
          issues.push(issue("error", "asset.invalidImportLicense", `assets/${entry.licensePath}`, `License for imported ${entry.asset.id} ${messageFor(error)}`))
        }
      }
      if (imports.length) {
        const files = await scanLocalAssetFiles(store.assetsPath)
        for (const entry of new Map(imports.map(entry => [entry.asset.id, entry])).values()) {
          const versions = imports.filter(version => version.asset.id === entry.asset.id)
          const state = catalogInstallation(entry.asset, files, imports)
          for (const file of state.modified) issues.push(issue("warning", "asset.modifiedImport", `assets/${file}`, `Contents differ from imported ${entry.asset.id}; saved geometry describes the original image`))
          if (!files.some(file => versions.some(version => version.asset.checksum === file.checksum)) && !state.modified.length) issues.push(issue("warning", "asset.missingImport", `assets/${entry.paths[0]}`, `Imported ${entry.asset.id} is missing`))
        }
      }
      for (const asset of Object.values(assets).flat()) {
        if (!asset.width || !asset.height) {
          issues.push(issue("error", "asset.invalidImage", `${ASSETS_DIRECTORY}/${asset.id}`, "Asset is not a valid supported image"))
        }
      }
    } catch (error) {
      issues.push(issue("error", "assets.invalid", ASSETS_DIRECTORY, messageFor(error)))
    }
  }

  const selectedSets = options.pageId === undefined ? sets : sets.filter(set => set.pageId === options.pageId)
  if (options.pageId !== undefined && config && !config.pages.some(page => page.id === options.pageId)) {
    issues.push(issue("error", "page.unknown", CONFIG_FILENAME, `Unknown product page: ${options.pageId}`))
  }
  validateSetSemantics(selectedSets, issues)
  if (config) for (const entry of readinessIssues(config, sets)) {
    if (options.pageId !== undefined && entry.pageId !== options.pageId) continue
    issues.push(issue(["page", "dimensions", "count", "duplicate", "watch-size"].includes(entry.code) ? "error" : "warning", `appStore.${entry.code}`, entry.setId ? `sets/${entry.setId}/index.json` : `${entry.pageId}/${entry.locale}`, entry.message))
  }
  const result = validationResult(root, issues, selectedSets, config, assets)
  if (options.pageId !== undefined) result.report.pageId = options.pageId
  return result
}

function validateSetSemantics(
  sets: ScreenshotSet[],
  issues: ValidationIssue[],
): void {
  const setIds = new Set<string>()

  for (const set of sets) {
    const setPath = `${SETS_DIRECTORY}/${set.id}/index.json`
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
  const relative = path.relative(boundary, filename)
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("is outside the project boundary")
  let current = boundary
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part)
    if ((await lstat(current)).isSymbolicLink()) throw new Error("must not use symbolic links")
  }
  if (!(await lstat(filename)).isFile()) throw new Error("must be a regular file")
  return readFile(filename, "utf8")
}

function validationResult(
  directory: string,
  issues: ValidationIssue[],
  sets: ScreenshotSet[],
  config?: StoreShotConfig,
  assets?: Record<AssetCategory, Asset[]>,
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
