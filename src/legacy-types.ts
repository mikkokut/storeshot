/** Version 1 layer types, used only to migrate legacy projects. */
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
  { kind: "builtin"; id: string } | { kind: "asset"; assetId: string }

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

export type CanvasElement =
  DeviceMockupElement | GroupElement | ImageElement | ShapeElement | TextElement

export interface LegacyScreenshotArea {
  id: string
  name: string
  background: string
  elements: CanvasElement[]
}

export interface LegacyScreenshotSet {
  version: 1
  id: string
  name: string
  locale: string
  device: string
  canvas: {
    width: number
    height: number
  }
  areas: LegacyScreenshotArea[]
  createdAt: string
  updatedAt: string
}
