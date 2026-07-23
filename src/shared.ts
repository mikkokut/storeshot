export const ASSET_CATEGORIES = ["screenshots", "brand", "other"] as const

export type AssetCategory = (typeof ASSET_CATEGORIES)[number]

export const SCREENSHOT_DEVICE_TYPES = ["iphone", "ipad", "mac", "watch"] as const
export type ScreenshotDeviceType = (typeof SCREENSHOT_DEVICE_TYPES)[number]
export type DetectedScreenshotDeviceType = ScreenshotDeviceType | "unknown"

export interface StoreShotConfig {
  version: 1
  appName: string
  platforms: Array<"ios" | "android">
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
  /** The effective type used for mockup recommendations. */
  deviceType?: DetectedScreenshotDeviceType
}

export interface UpdateAssetMetadataInput {
  deviceType: ScreenshotDeviceType | null
}

interface CanvasElementBase {
  id: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  /** Mirrors the layer around its vertical axis. */
  flipX?: boolean
  /** Mirrors the layer around its horizontal axis. */
  flipY?: boolean
}

export type ImageElementSource =
  | { kind: "builtin"; id: string }
  | { kind: "asset"; assetId: string }

/** A project image or built-in vector artwork placed on a screenshot. */
export interface ImageElement extends CanvasElementBase {
  type: "image"
  source: ImageElementSource
  fit: "contain" | "cover"
  /** Replaces the visible pixels while preserving their alpha. Omit to use the source colors. */
  fill?: string
}

export interface DeviceMockupElement extends CanvasElementBase {
  type: "mockup"
  mockupId: string
  assetId: string
}

export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
export const DEFAULT_TEXT_LINE_HEIGHT_RATIO = 1.05

export interface TextElement extends CanvasElementBase {
  type: "text"
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: FontWeight
  /** Absolute line height in canvas pixels. When omitted, the renderer derives it from the font size. */
  lineHeight?: number
  color: string
  textAlign: "left" | "center" | "right"
}

export interface ShapeElement extends CanvasElementBase {
  type: "shape"
  shape: "circle" | "line" | "rectangle"
  fill: string
  stroke: string
  strokeWidth: number
  cornerRadius: number
}

export interface GroupElement extends CanvasElementBase {
  type: "group"
  children: CanvasElement[]
}

export type CanvasElement = DeviceMockupElement | GroupElement | ImageElement | ShapeElement | TextElement

export interface ScreenshotArea {
  id: string
  name: string
  background: string
  elements: CanvasElement[]
}

export interface ScreenshotSet {
  version: 1
  id: string
  name: string
  locale: string
  device: string
  canvas: {
    width: number
    height: number
  }
  areas: ScreenshotArea[]
  createdAt: string
  updatedAt: string
}

export interface CreateSetInput {
  name: string
  locale: string
  device: string
  width: number
  height: number
}

export interface UpdateSetMetadataInput {
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
