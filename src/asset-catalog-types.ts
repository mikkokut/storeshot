/** Public, browser-safe asset metadata. Coordinates refer to the unscaled image. */
export const CATALOG_KINDS = ["mockup", "decor", "lines", "laurels"] as const
export type CatalogKind = (typeof CATALOG_KINDS)[number]
export type ScreenGeometry = {
  kind: "rect"
  x: number
  y: number
  width: number
  height: number
  cornerRadius: number
} | {
  kind: "projective"
  /** Maps normalized screenshot (u,v) coordinates to normalized image coordinates. */
  transform: [[number, number, number], [number, number, number], [number, number, number]]
  sourceCornerRadius: { x: number; y: number }
}
export interface CatalogAssetDefinition {
  id: string
  kind: CatalogKind
  name: string
  description: string
  tags: string[]
  file: string
  width: number
  height: number
  author: string
  license: { name: string; file: string; url?: string }
  source?: { name?: string; url: string; revision?: string }
  platform?: "iphone" | "ipad" | "mac" | "watch"
  style?: string
  screen?: ScreenGeometry
}
export interface CatalogAsset extends CatalogAssetDefinition {
  /** SHA-256 of the image bytes, independent of its name and metadata. */
  checksum: string
}
export interface AssetImport {
  asset: CatalogAsset
  /** Paths relative to assets/, including the category. */
  paths: string[]
  licensePath: string
}
export interface CatalogInstallation {
  matches: string[]
  modified: string[]
  missing: string[]
}

export function safeAssetPath(value: string): boolean {
  return !!value && !value.includes("\\") && value.split("/").every(part => !!part && !part.startsWith(".") && !part.includes(":"))
}
export function parseCatalogAsset(input: unknown): CatalogAssetDefinition {
  const value = record(input, "Asset")
  const id = string(value.id, "Asset id")
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error("Asset id must use lowercase letters, numbers, and hyphens")
  const kind = string(value.kind, "Asset kind") as CatalogKind
  if (!CATALOG_KINDS.includes(kind)) throw new Error(`Unsupported asset kind: ${kind}`)
  const file = relativePath(value.file, "Asset file")
  if (!/\.(png|jpe?g|webp|svg)$/i.test(file)) throw new Error("Unsupported catalog image type")
  const width = dimension(value.width, "Asset width"), height = dimension(value.height, "Asset height")
  const license = record(value.license, "Asset license")
  const source = value.source === undefined ? undefined : record(value.source, "Asset source")
  if (!Array.isArray(value.tags) || !value.tags.every(tag => typeof tag === "string")) throw new Error("Asset tags must be strings")
  const platform = value.platform as CatalogAssetDefinition["platform"]
  if (platform !== undefined && !["iphone", "ipad", "mac", "watch"].includes(platform)) throw new Error("Unsupported asset platform")
  if (kind === "mockup" && (!platform || !value.screen)) throw new Error("Mockups require a platform and screen geometry")
  if (kind !== "mockup" && value.screen !== undefined) throw new Error("Only mockups have screen geometry")
  return {
    id, kind, file, width, height,
    name: string(value.name, "Asset name"), description: string(value.description, "Asset description"),
    tags: value.tags as string[], author: string(value.author, "Asset author"),
    license: { name: string(license.name, "License name"), file: relativePath(license.file, "License file"), ...(license.url === undefined ? {} : { url: string(license.url, "License URL") }) },
    ...(source ? { source: { url: string(source.url, "Source URL"), ...(source.name === undefined ? {} : { name: string(source.name, "Source name") }), ...(source.revision === undefined ? {} : { revision: string(source.revision, "Source revision") }) } } : {}),
    ...(platform ? { platform } : {}), ...(value.style === undefined ? {} : { style: string(value.style, "Asset style") }),
    ...(value.screen === undefined ? {} : { screen: parseScreen(value.screen, width, height) }),
  }
}
export function parseCatalogSnapshot(input: unknown): CatalogAsset {
  const value = record(input, "Catalog asset")
  const checksum = string(value.checksum, "Asset checksum")
  if (!/^sha256:[a-f0-9]{64}$/.test(checksum)) throw new Error("Invalid asset checksum")
  return { ...parseCatalogAsset(value), checksum }
}
export function parseAssetImports(input: unknown): AssetImport[] {
  const value = record(input, "Asset imports")
  if (value.version !== 1 || !Array.isArray(value.imports)) throw new Error("Unsupported asset import metadata")
  return value.imports.map(input => {
    const entry = record(input, "Asset import")
    if (!Array.isArray(entry.paths) || !entry.paths.length) throw new Error("Asset import paths are required")
    const licensePath = string(entry.licensePath, "Installed license")
    if (!/^\.licenses\/[a-f0-9]{64}\.txt$/.test(licensePath)) throw new Error("Invalid installed license path")
    return { asset: parseCatalogSnapshot(entry.asset), paths: entry.paths.map(p => relativePath(p, "Installed asset path")), licensePath }
  })
}
function parseScreen(input: unknown, width: number, height: number): ScreenGeometry {
  const value = record(input, "Screen")
  if (value.kind === "rect") {
    const x = nonnegative(value.x, "Screen x"), y = nonnegative(value.y, "Screen y")
    const w = dimension(value.width, "Screen width"), h = dimension(value.height, "Screen height")
    const cornerRadius = nonnegative(value.cornerRadius, "Screen corner radius")
    if (x + w > width + .01 || y + h > height + .01 || cornerRadius > Math.min(w, h) / 2) throw new Error("Screen is outside the image bounds")
    return { kind: "rect", x, y, width: w, height: h, cornerRadius }
  }
  if (value.kind !== "projective" || !Array.isArray(value.transform) || value.transform.length !== 3) throw new Error("Invalid screen geometry")
  const transform = value.transform.map(row => {
    if (!Array.isArray(row) || row.length !== 3) throw new Error("Projective transform must be a 3 by 3 matrix")
    return row.map(n => number(n, "Transform value"))
  }) as [[number, number, number], [number, number, number], [number, number, number]]
  const m = transform
  const det = m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0])
  const denominators = [m[2][2], m[2][0]+m[2][2], m[2][1]+m[2][2], m[2][0]+m[2][1]+m[2][2]]
  if (Math.abs(det) < 1e-12 || !denominators.every(n => n > 1e-12) && !denominators.every(n => n < -1e-12)) throw new Error("Projective transform is singular or crosses infinity")
  const radius = record(value.sourceCornerRadius, "Source corner radius")
  const x = nonnegative(radius.x, "Source radius x"), y = nonnegative(radius.y, "Source radius y")
  if (x > .5 || y > .5) throw new Error("Source corner radius must be normalized between 0 and 0.5")
  return { kind: "projective", transform: m, sourceCornerRadius: { x, y } }
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`)
  return value.trim()
}
function relativePath(value: unknown, label: string): string {
  const result = string(value, label)
  if (!safeAssetPath(result)) throw new Error(`${label} must be a safe relative path`)
  return result
}
function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite`)
  return value
}
function nonnegative(value: unknown, label: string): number {
  const result = number(value, label)
  if (result < 0) throw new Error(`${label} must be nonnegative`)
  return result
}
function dimension(value: unknown, label: string): number {
  const result = number(value, label)
  if (result <= 0 || result > 20000) throw new Error(`${label} must be between 0 and 20000`)
  return result
}
