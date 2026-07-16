export const MOCKUP_BUNDLE_FILENAME = "storeshot-mockups.json"
export const MOCKUP_BUNDLE_FORMAT = "storeshot-mockup-bundle"

export interface Point {
  x: number
  y: number
}

export type DevicePlatform = "iphone" | "ipad" | "mac" | "watch"
export type DeviceMockupStyle =
  | "3d"
  | "colored"
  | "colored-3d"
  | "handheld"
  | "handheld-dim"
  | "handheld-silhouette"
  | "handheld-styles"
  | "standard"
  | "textured"

export type ProjectiveTransform = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
]

export interface RectMockupScreen {
  kind: "rect"
  x: number
  y: number
  width: number
  height: number
  cornerRadius: number
}

export interface PerspectiveMockupScreen {
  kind: "projective"
  /** Maps normalized screenshot coordinates into normalized frame coordinates. */
  transform: ProjectiveTransform
  /** Elliptical source-image corner radius, normalized to the screenshot plane. */
  sourceCornerRadius: Point
}

export type MockupScreen = PerspectiveMockupScreen | RectMockupScreen

export interface MockupBundleLicense {
  name: string
  url?: string
  file?: string
}

export interface MockupBundleSource {
  name?: string
  url: string
  revision?: string
}

/** Portable, folder-based StoreShot device mockup definition. */
export interface MockupBundleEntry {
  id: string
  groupId: string
  groupName: string
  name: string
  description: string
  platform: DevicePlatform
  style: DeviceMockupStyle
  frame: string
  thumbnail?: string
  width: number
  height: number
  screen: MockupScreen
}

export interface MockupBundleManifest {
  format: typeof MOCKUP_BUNDLE_FORMAT
  version: 1
  id: string
  name: string
  author: string
  license: MockupBundleLicense
  source?: MockupBundleSource
  mockups: MockupBundleEntry[]
}

interface DeviceMockupBase {
  id: string
  bundleId: string
  groupId: string
  name: string
  description: string
  platform: DevicePlatform
  style: DeviceMockupStyle
  frameUrl: string
  thumbnailUrl: string
  width: number
  height: number
}

export interface DeviceMockup extends DeviceMockupBase {
  screen: MockupScreen
}

export interface DeviceMockupGroup {
  id: string
  bundleId: string
  name: string
  platform: DevicePlatform
  style: DeviceMockupStyle
  thumbnailUrl: string
  count: number
}

export interface MockupBundleSummary {
  id: string
  name: string
  author: string
  license: MockupBundleLicense
  source?: MockupBundleSource
  mockupCount: number
  origin: "built-in" | "project"
}

export interface DeviceMockupCatalog {
  bundles: MockupBundleSummary[]
  groups: DeviceMockupGroup[]
  mockups: DeviceMockup[]
}

const identifierPattern = /^[a-z0-9][a-z0-9-]*$/
const styles = new Set<DeviceMockupStyle>([
  "3d",
  "colored",
  "colored-3d",
  "handheld",
  "handheld-dim",
  "handheld-silhouette",
  "handheld-styles",
  "standard",
  "textured",
])
const platforms = new Set<DevicePlatform>(["iphone", "ipad", "mac", "watch"])
const frameExtensions = new Set([".jpeg", ".jpg", ".png", ".svg", ".webp"])

export function emptyDeviceMockupCatalog(): DeviceMockupCatalog {
  return { bundles: [], groups: [], mockups: [] }
}

export function parseMockupBundleManifest(value: unknown): MockupBundleManifest {
  if (!isRecord(value)) throw new Error(`${MOCKUP_BUNDLE_FILENAME} must contain a JSON object`)
  if (value.format !== MOCKUP_BUNDLE_FORMAT || value.version !== 1) {
    throw new Error("Unsupported StoreShot mockup bundle format")
  }
  if (!Array.isArray(value.mockups) || value.mockups.length === 0) {
    throw new Error("A mockup bundle must contain at least one mockup")
  }

  const id = readIdentifier(value.id, "Bundle id")
  const mockups = value.mockups.map(parseMockupEntry)
  const entryIds = new Set<string>()
  for (const mockup of mockups) {
    if (entryIds.has(mockup.id)) throw new Error(`Duplicate mockup id: ${mockup.id}`)
    entryIds.add(mockup.id)
  }

  return {
    format: MOCKUP_BUNDLE_FORMAT,
    version: 1,
    id,
    name: readString(value.name, "Bundle name"),
    author: readString(value.author, "Bundle author"),
    license: parseLicense(value.license),
    ...(value.source === undefined ? {} : { source: parseSource(value.source) }),
    mockups,
  }
}

export function resolveMockupBundle(
  manifest: MockupBundleManifest,
  baseUrl: string,
  origin: MockupBundleSummary["origin"],
): DeviceMockupCatalog {
  const bundlePrefix = `${manifest.id}/`
  const mockups: DeviceMockup[] = manifest.mockups.map((entry) => ({
    ...entry,
    id: `${bundlePrefix}${entry.id}`,
    bundleId: manifest.id,
    groupId: `${bundlePrefix}${entry.groupId}`,
    frameUrl: `${baseUrl}${encodeBundlePath(entry.frame)}`,
    thumbnailUrl: `${baseUrl}${encodeBundlePath(entry.thumbnail ?? entry.frame)}`,
  }))

  const groupEntries = new Map<string, DeviceMockup[]>()
  for (const mockup of mockups) {
    const entries = groupEntries.get(mockup.groupId) ?? []
    entries.push(mockup)
    groupEntries.set(mockup.groupId, entries)
  }

  return {
    bundles: [{
      id: manifest.id,
      name: manifest.name,
      author: manifest.author,
      license: manifest.license,
      ...(manifest.source ? { source: manifest.source } : {}),
      mockupCount: mockups.length,
      origin,
    }],
    groups: [...groupEntries.entries()].map(([id, entries]) => ({
      id,
      bundleId: manifest.id,
      name: manifest.mockups.find((entry) => `${bundlePrefix}${entry.groupId}` === id)?.groupName ?? entries[0].name,
      platform: entries[0].platform,
      style: entries[0].style,
      thumbnailUrl: entries[0].thumbnailUrl,
      count: entries.length,
    })),
    mockups,
  }
}

export function mergeDeviceMockupCatalogs(...catalogs: DeviceMockupCatalog[]): DeviceMockupCatalog {
  const result = emptyDeviceMockupCatalog()
  const bundleIds = new Set<string>()
  const groupIds = new Set<string>()
  const mockupIds = new Set<string>()

  for (const catalog of catalogs) {
    for (const bundle of catalog.bundles) {
      if (bundleIds.has(bundle.id)) continue
      bundleIds.add(bundle.id)
      result.bundles.push(bundle)
    }
    for (const group of catalog.groups) {
      if (groupIds.has(group.id)) continue
      groupIds.add(group.id)
      result.groups.push(group)
    }
    for (const mockup of catalog.mockups) {
      if (mockupIds.has(mockup.id)) continue
      mockupIds.add(mockup.id)
      result.mockups.push(mockup)
    }
  }
  return result
}

export function deviceMockupById(catalog: DeviceMockupCatalog, id: string): DeviceMockup | undefined {
  return catalog.mockups.find((mockup) => mockup.id === id)
}

export function bundleAssetPaths(manifest: MockupBundleManifest): string[] {
  const paths = new Set<string>()
  if (manifest.license.file) paths.add(manifest.license.file)
  for (const mockup of manifest.mockups) {
    paths.add(mockup.frame)
    if (mockup.thumbnail) paths.add(mockup.thumbnail)
  }
  return [...paths]
}

export function isSafeBundlePath(value: string): boolean {
  if (!value || value.startsWith("/") || value.includes("\\")) return false
  const parts = value.split("/")
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..")
}

function parseMockupEntry(value: unknown): MockupBundleEntry {
  if (!isRecord(value)) throw new Error("Mockup entry must be an object")
  const platform = readString(value.platform, "Mockup platform") as DevicePlatform
  const style = readString(value.style, "Mockup style") as DeviceMockupStyle
  if (!platforms.has(platform)) throw new Error(`Unsupported mockup platform: ${platform}`)
  if (!styles.has(style)) throw new Error(`Unsupported mockup style: ${style}`)
  const frame = readFramePath(value.frame, "Mockup frame")
  const thumbnail = value.thumbnail === undefined ? undefined : readFramePath(value.thumbnail, "Mockup thumbnail")
  return {
    id: readIdentifier(value.id, "Mockup id"),
    groupId: readIdentifier(value.groupId, "Mockup group id"),
    groupName: readString(value.groupName, "Mockup group name"),
    name: readString(value.name, "Mockup name"),
    description: readString(value.description, "Mockup description"),
    platform,
    style,
    frame,
    ...(thumbnail ? { thumbnail } : {}),
    width: readDimension(value.width, "Mockup width"),
    height: readDimension(value.height, "Mockup height"),
    screen: parseScreen(value.screen),
  }
}

function parseScreen(value: unknown): MockupScreen {
  if (!isRecord(value)) throw new Error("Mockup screen must be an object")
  if (value.kind === "rect") {
    return {
      kind: "rect",
      x: readNumber(value.x, "Screen x"),
      y: readNumber(value.y, "Screen y"),
      width: readDimension(value.width, "Screen width"),
      height: readDimension(value.height, "Screen height"),
      cornerRadius: readNonNegative(value.cornerRadius, "Screen corner radius"),
    }
  }
  if (value.kind === "projective") {
    if (!Array.isArray(value.transform) || value.transform.length !== 3) throw new Error("Projective transform must have three rows")
    const transform = value.transform.map((row) => {
      if (!Array.isArray(row) || row.length !== 3) throw new Error("Each projective transform row must have three numbers")
      return row.map((entry) => readNumber(entry, "Projective transform value")) as [number, number, number]
    }) as [
      [number, number, number],
      [number, number, number],
      [number, number, number],
    ]
    if (!isRecord(value.sourceCornerRadius)) throw new Error("Projective source corner radius must be an object")
    return {
      kind: "projective",
      transform,
      sourceCornerRadius: {
        x: readNonNegative(value.sourceCornerRadius.x, "Source corner radius x"),
        y: readNonNegative(value.sourceCornerRadius.y, "Source corner radius y"),
      },
    }
  }
  throw new Error("Unsupported mockup screen geometry")
}

function parseLicense(value: unknown): MockupBundleLicense {
  if (!isRecord(value)) throw new Error("Bundle license must be an object")
  const file = value.file === undefined ? undefined : readBundlePath(value.file, "License file")
  return {
    name: readString(value.name, "License name"),
    ...(value.url === undefined ? {} : { url: readString(value.url, "License URL") }),
    ...(file ? { file } : {}),
  }
}

function parseSource(value: unknown): MockupBundleSource {
  if (!isRecord(value)) throw new Error("Bundle source must be an object")
  return {
    ...(value.name === undefined ? {} : { name: readString(value.name, "Source name") }),
    url: readString(value.url, "Source URL"),
    ...(value.revision === undefined ? {} : { revision: readString(value.revision, "Source revision") }),
  }
}

function readFramePath(value: unknown, name: string): string {
  const result = readBundlePath(value, name)
  const extensionIndex = result.lastIndexOf(".")
  const extension = extensionIndex >= 0 ? result.slice(extensionIndex).toLowerCase() : ""
  if (!frameExtensions.has(extension)) throw new Error(`${name} has an unsupported file type`)
  return result
}

function readBundlePath(value: unknown, name: string): string {
  const result = readString(value, name)
  if (!isSafeBundlePath(result)) throw new Error(`${name} must be a relative path inside the bundle`)
  return result
}

function readIdentifier(value: unknown, name: string): string {
  const result = readString(value, name)
  if (!identifierPattern.test(result)) throw new Error(`${name} must use lowercase letters, numbers, and hyphens`)
  return result
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

function readNonNegative(value: unknown, name: string): number {
  const result = readNumber(value, name)
  if (result < 0 || result > 20_000) throw new Error(`${name} is outside the supported range`)
  return result
}

function encodeBundlePath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
