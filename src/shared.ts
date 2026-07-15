export const ASSET_CATEGORIES = ["screenshots", "brand", "logos", "other"] as const

export type AssetCategory = (typeof ASSET_CATEGORIES)[number]

export interface AppshotConfig {
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
}

interface CanvasElementBase {
  id: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
}

export interface ImageElement extends CanvasElementBase {
  type: "image"
  assetId: string
  fit: "contain" | "cover"
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
  shape: "rectangle"
  fill: string
  cornerRadius: number
}

export type CanvasElement = ImageElement | ShapeElement | TextElement

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

export interface AppshotProject {
  directory: string
  config: AppshotConfig
  assets: Record<AssetCategory, Asset[]>
  sets: ScreenshotSet[]
}
