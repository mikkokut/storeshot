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

export interface ProductPage {
  id: string
  name: string
  kind: "default" | "custom" | "treatment"
  testId?: string
  localizations: string[]
}

export interface OptimizationTest {
  id: string
  name: string
}

export interface StoreShotConfig {
  version: 2
  store: "app-store"
  pages: ProductPage[]
  tests: OptimizationTest[]
}

export interface CreatePageInput {
  name: string
  kind: "custom" | "treatment"
  testId?: string
  testName?: string
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

/** The HTML is hydrated from sets/<set-id>/<area-id>.html by ProjectStore. */
export interface ScreenshotArea {
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
