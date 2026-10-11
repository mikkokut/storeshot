export const ASSET_CATEGORIES = ["screenshots", "brand", "other"] as const

export type AssetCategory = (typeof ASSET_CATEGORIES)[number]

export const SCREENSHOT_DEVICE_TYPES = [
  "iphone",
  "ipad",
  "mac",
  "watch",
] as const
export type ScreenshotDeviceType = (typeof SCREENSHOT_DEVICE_TYPES)[number]
export type DetectedScreenshotDeviceType = ScreenshotDeviceType | "unknown"

export const APP_DEVICES = [
  "iphone",
  "ipad",
  "iphone-duo",
  "watch",
  "mac",
  "tv",
  "vision",
] as const
export type AppDevice = (typeof APP_DEVICES)[number]

export type PageStore = "app-store" | "play-store"

export interface ProductPage {
  id: string
  name: string
  store: PageStore
  localizations: string[]
}

export interface StoreShotConfig {
  version: 2
  pages: ProductPage[]
}

export interface CreatePageInput {
  name: string
  store?: PageStore
  sourcePageId?: string
}

export interface LocalizePageInput {
  locale: string
  sourceLocale?: string
}

export interface Asset {
  id: string
  category: AssetCategory
  name: string
  url: string
  size: number
  modifiedAt: string
  checksum: string
  width?: number
  height?: number
  /** The dimension-based classification before a user override is applied. */
  detectedDeviceType?: DetectedScreenshotDeviceType
  /** An explicit local catalog override. */
  deviceTypeOverride?: ScreenshotDeviceType
  /** The effective type used to group source screenshots and prepare artwork. */
  deviceType?: DetectedScreenshotDeviceType
}

export interface UpdateAssetMetadataInput {
  deviceType: ScreenshotDeviceType | null
}

export interface CreateSetInput {
  pageId?: string
  specId?: string
  name: string
  locale: string
  device: string
  width: number
  height: number
}

export interface UpdateSetMetadataInput {
  pageId?: string
  specId?: string
  name: string
  locale: string
  device: string
}

export interface StoreShotProject {
  directory: string
  config: StoreShotConfig
  assets: Record<AssetCategory, Asset[]>
  sets: ScreenshotSet[]
}

/** Metadata and HTML are hydrated from sets/<set-id>/<area-id>[-slug].{json,html}. */
export interface ScreenshotArea {
  /** Derived for live previews; never persisted in the collection document. */
  previewRevision?: string
  id: string
  name: string
  html: string
}

export interface ScreenshotSet {
  id: string
  name: string
  locale: string
  device: string
  canvas: { width: number; height: number }
  createdAt: string
  updatedAt: string
  version: 3
  pageId: string
  specId: string
  sourceLocale?: string
  areas: ScreenshotArea[]
}
