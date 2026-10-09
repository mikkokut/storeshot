import type { CanvasElement, FontWeight, ImageElementSource, LegacyScreenshotArea, LegacyScreenshotSet } from "./legacy-types.js"
const safeIdentifierPattern = /^[a-z0-9][a-z0-9-]*$/
const hexColorPattern = /^#[0-9a-f]{6}$/i
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }

export function parseLegacyScreenshotSet(value: unknown): LegacyScreenshotSet {
  if (!isRecord(value)) throw new Error("Set file must contain an object")
  if (value.version !== 1) throw new Error("Unsupported set file version")

  const id = readString(value.id, "Set id")
  if (!safeIdentifierPattern.test(id)) throw new Error("Set id is invalid")
  if (!isRecord(value.canvas)) throw new Error("Set canvas is invalid")
  if (!Array.isArray(value.areas) || value.areas.length === 0) throw new Error("A set needs at least one screenshot area")

  return {
    version: 1,
    id,
    name: readString(value.name, "Set name"),
    locale: readString(value.locale, "Locale"),
    device: readString(value.device, "Device"),
    canvas: {
      width: readDimension(value.canvas.width, "Canvas width"),
      height: readDimension(value.canvas.height, "Canvas height"),
    },
    areas: value.areas.map(parseArea),
    createdAt: readString(value.createdAt, "Created time"),
    updatedAt: readString(value.updatedAt, "Updated time"),
  }
}

function parseArea(value: unknown): LegacyScreenshotArea {
  if (!isRecord(value)) throw new Error("Screenshot area is invalid")
  const background = readString(value.background, "Area background")
  if (!hexColorPattern.test(background)) throw new Error("Area background must be a hex color")
  if (!Array.isArray(value.elements)) throw new Error("Area elements must be an array")
  return {
    id: readString(value.id, "Area id"),
    name: readString(value.name, "Area name"),
    background,
    elements: value.elements.map(parseElement),
  }
}

function parseImageSource(value: unknown, legacyAssetId?: unknown): ImageElementSource {
  if (isRecord(value)) {
    if (value.kind === "builtin") return { kind: "builtin", id: readString(value.id, "Built-in artwork id") }
    if (value.kind === "asset") return { kind: "asset", assetId: readString(value.assetId, "Asset id") }
    throw new Error("Image source type is invalid")
  }
  if (legacyAssetId !== undefined) return { kind: "asset", assetId: readString(legacyAssetId, "Asset id") }
  throw new Error("Image source is invalid")
}

function parseElement(value: unknown): CanvasElement {
  if (!isRecord(value)) throw new Error("Canvas element is invalid")
  const base = {
    id: readString(value.id, "Element id"),
    x: readNumber(value.x, "Element x"),
    y: readNumber(value.y, "Element y"),
    width: readDimension(value.width, "Element width"),
    height: readDimension(value.height, "Element height"),
    rotation: readNumber(value.rotation, "Element rotation"),
    opacity: readOptionalRange(value.opacity, 1, 0, 1, "Element opacity"),
    flipX: readOptionalBoolean(value.flipX, false, "Element horizontal flip"),
    flipY: readOptionalBoolean(value.flipY, false, "Element vertical flip"),
  }

  if (value.type === "image") {
    if (value.fit !== "contain" && value.fit !== "cover") throw new Error("Image fit is invalid")
    const source = parseImageSource(value.source, value.assetId)
    const fill = value.fill === undefined ? undefined : readString(value.fill, "Image fill")
    if (fill !== undefined && !hexColorPattern.test(fill)) throw new Error("Image fill must be a hex color")
    return { ...base, type: "image", source, fit: value.fit, ...(fill === undefined ? {} : { fill }) }
  }

  if (value.type === "mockup") {
    return {
      ...base,
      type: "mockup",
      mockupId: readString(value.mockupId, "Device mockup id"),
      assetId: readString(value.assetId, "Asset id"),
    }
  }

  if (value.type === "element") {
    const source = parseImageSource(value.source)
    const fill = value.fill === undefined ? undefined : readString(value.fill, "Image fill")
    if (fill !== undefined && !hexColorPattern.test(fill)) throw new Error("Image fill must be a hex color")
    return {
      ...base,
      type: "image",
      source,
      fit: "contain",
      ...(fill === undefined ? {} : { fill }),
    }
  }

  if (value.type === "text") {
    const fontWeight = Number(value.fontWeight)
    if (!Number.isInteger(fontWeight) || fontWeight < 100 || fontWeight > 900 || fontWeight % 100 !== 0) {
      throw new Error("Text weight is invalid")
    }
    if (value.textAlign !== "left" && value.textAlign !== "center" && value.textAlign !== "right") {
      throw new Error("Text alignment is invalid")
    }
    const color = readString(value.color, "Text color")
    if (!hexColorPattern.test(color)) throw new Error("Text color must be a hex color")
    const lineHeight = value.lineHeight === undefined
      ? undefined
      : readDimension(value.lineHeight, "Text line height")
    return {
      ...base,
      type: "text",
      text: typeof value.text === "string" ? value.text : "",
      fontFamily: readOptionalString(value.fontFamily, "Geist Variable"),
      fontSize: readDimension(value.fontSize, "Font size"),
      fontWeight: fontWeight as FontWeight,
      ...(lineHeight === undefined ? {} : { lineHeight }),
      color,
      textAlign: value.textAlign,
    }
  }

  if (value.type === "shape") {
    if (value.shape !== "circle" && value.shape !== "line" && value.shape !== "rectangle") {
      throw new Error("Shape type is invalid")
    }
    const fill = readString(value.fill, "Shape fill")
    if (!hexColorPattern.test(fill)) throw new Error("Shape fill must be a hex color")
    const stroke = readOptionalString(value.stroke, fill)
    if (!hexColorPattern.test(stroke)) throw new Error("Shape stroke must be a hex color")
    return {
      ...base,
      type: "shape",
      shape: value.shape,
      fill,
      stroke,
      strokeWidth: readOptionalRange(value.strokeWidth, 0, 0, 10_000, "Shape stroke width"),
      cornerRadius: readOptionalRange(value.cornerRadius, 0, 0, 10_000, "Shape corner radius"),
    }
  }

  if (value.type === "group") {
    if (!Array.isArray(value.children) || value.children.length < 2) {
      throw new Error("Group must contain at least two elements")
    }
    return {
      ...base,
      type: "group",
      children: value.children.map(parseElement),
    }
  }

  throw new Error("Unsupported canvas element type")
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

function readOptionalRange(value: unknown, fallback: number, min: number, max: number, name: string): number {
  if (value === undefined) return fallback
  const result = readNumber(value, name)
  if (result < min || result > max) throw new Error(`${name} is outside the supported range`)
  return result
}

function readOptionalBoolean(value: unknown, fallback: boolean, name: string): boolean {
  if (value === undefined) return fallback
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean`)
  return value
}

function readOptionalString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function readDimension(value: unknown, name: string): number {
  const result = readNumber(value, name)
  if (result <= 0 || result > 20_000) throw new Error(`${name} is outside the supported range`)
  return result
}
