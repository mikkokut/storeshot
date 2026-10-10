import { createHash } from "node:crypto"
import { lstat, readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { parseCatalogAsset, safeAssetPath, type CatalogAsset, type CatalogKind, type AssetImport, type CatalogInstallation } from "./asset-catalog-types.js"
import { readImageMetadata } from "./image-metadata.js"

export function assetChecksum(contents: Buffer): string {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`
}

/** All catalog paths are package-relative and checked component by component. */
export async function readCatalogFile(packageRoot: string, relative: string): Promise<Buffer> {
  if (!safeAssetPath(relative)) throw new Error("Invalid catalog file path")
  let current = path.join(packageRoot, "catalog")
  const root = await lstat(current)
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("Catalog must be a regular directory")
  const parts = relative.split("/")
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part)
    const metadata = await lstat(current)
    if (metadata.isSymbolicLink() || (index === parts.length - 1 ? !metadata.isFile() : !metadata.isDirectory())) throw new Error("Catalog files must remain inside the package")
  }
  return readFile(current)
}

export async function loadAssetCatalog(packageRoot: string): Promise<CatalogAsset[]> {
  const value = JSON.parse((await readCatalogFile(packageRoot, "catalog.json")).toString("utf8"))
  if (value.version !== 1 || !Array.isArray(value.assets)) throw new Error("Unsupported asset catalog")
  const ids = new Set<string>()
  const definitions = value.assets.map((input: unknown) => {
    const entry = parseCatalogAsset(input)
    if (ids.has(entry.id)) throw new Error(`Duplicate catalog asset id: ${entry.id}`)
    ids.add(entry.id)
    return entry
  }) as ReturnType<typeof parseCatalogAsset>[]
  const licenses = new Map<string, Promise<Buffer>>()
  return Promise.all(definitions.map(async entry => {
    let license = licenses.get(entry.license.file)
    if (!license) { license = readCatalogFile(packageRoot, entry.license.file); licenses.set(entry.license.file, license) }
    const [contents, licenseText] = await Promise.all([readCatalogFile(packageRoot, entry.file), license])
    if (!licenseText.length) throw new Error(`Empty license for ${entry.id}`)
    const dimensions = readImageMetadata(contents)
    if (!dimensions || Math.abs(dimensions.width - entry.width) > 1 || Math.abs(dimensions.height - entry.height) > 1) throw new Error(`Catalog dimensions do not match the image: ${entry.id}`)
    return { ...entry, checksum: assetChecksum(contents) }
  }))
}

export function searchAssetCatalog(assets: CatalogAsset[], options: { query?: string; kind?: CatalogKind; platform?: string }): CatalogAsset[] {
  const query = (options.query ?? "").trim().toLowerCase()
  const checksum = /^(?:sha256:)?[a-f0-9]{64}$/.test(query) ? `sha256:${query.replace(/^sha256:/, "")}` : undefined
  const words = query.split(/\s+/).filter(Boolean)
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  const exactMatch = (asset: CatalogAsset) => [asset.id, asset.name, ...asset.tags].some(value => normalize(value) === normalize(query))
  return assets.filter(asset => {
    if (options.kind && asset.kind !== options.kind || options.platform && asset.platform !== options.platform) return false
    if (checksum) return asset.checksum === checksum
    const haystack = [asset.id, asset.name, asset.description, asset.author, asset.platform, asset.style, ...asset.tags].join(" ").toLowerCase()
    return words.every(word => haystack.includes(word))
  }).sort((a, b) => Number(exactMatch(b)) - Number(exactMatch(a)) || a.id.localeCompare(b.id))
}

export interface LocalAssetFile { path: string; checksum: string }
/** Includes manually copied and nested files, skips metadata and symlinks. */
export async function scanLocalAssetFiles(assetsPath: string): Promise<LocalAssetFile[]> {
  const root = await lstat(assetsPath)
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("Assets must be a regular project directory")
  const result: LocalAssetFile[] = []
  async function scan(relative: string): Promise<void> {
    const entries = await readdir(path.join(assetsPath, relative), { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue
      const file = relative ? `${relative}/${entry.name}` : entry.name
      if (!safeAssetPath(file)) continue
      if (entry.isDirectory()) await scan(file)
      else if (entry.isFile() && /\.(png|jpe?g|webp|svg)$/i.test(entry.name)) result.push({ path: file, checksum: assetChecksum(await readFile(path.join(assetsPath, file))) })
    }
  }
  await scan("")
  return result
}

export function catalogInstallation(asset: CatalogAsset, files: LocalAssetFile[], imports: AssetImport[]): CatalogInstallation {
  const receipts = imports.filter(entry => entry.asset.id === asset.id)
  const paths = [...new Set(receipts.flatMap(entry => entry.paths))]
  return {
    matches: files.filter(file => file.checksum === asset.checksum).map(file => file.path),
    modified: paths.filter(p => { const file = files.find(f => f.path === p); return file && !receipts.some(r => r.paths.includes(p) && r.asset.checksum === file.checksum) }),
    missing: paths.filter(p => !files.some(file => file.path === p)),
  }
}
