import { FabricImage, Group, Rect, Textbox, filters, loadSVGFromURL, util, type FabricObject } from "fabric"

import { builtInArtworkById } from "../artwork"
import type { DeviceMockup } from "../device-mockups"
import { DEFAULT_TEXT_LINE_HEIGHT_RATIO, type Asset, type CanvasElement } from "../shared"
import { renderDeviceMockup } from "./device-mockup-renderer"

export async function createFabricObject(
  element: CanvasElement,
  asset: Asset | undefined,
  mockupLookup: Map<string, DeviceMockup>,
): Promise<FabricObject> {
  if (element.type === "text") {
    return new Textbox(element.text, {
      editable: true,
      lockScalingFlip: true,
      minWidth: 24,
      splitByGrapheme: false,
    })
  }

  if (element.type === "shape") return new Rect({ lockScalingFlip: true })

  try {
    if (element.type === "mockup") {
      if (!asset) return withSourceKey(missingImagePlaceholder(), elementSourceKey(element))
      const mockup = mockupLookup.get(element.mockupId)
      if (!mockup) return withSourceKey(missingImagePlaceholder(), elementSourceKey(element, asset))
      const composite = await renderDeviceMockup(mockup, asset.url)
      return withSourceKey(new FabricImage(composite, {
        imageSmoothing: true,
        lockScalingFlip: true,
      }), elementSourceKey(element, asset))
    }

    if (element.type !== "image") return withSourceKey(missingImagePlaceholder(), elementSourceKey(element))
    const definition = element.source.kind === "builtin" ? builtInArtworkById(element.source.id) : undefined
    const sourceUrl = definition?.url ?? asset?.url
    if (!sourceUrl) return withSourceKey(missingImagePlaceholder(), elementSourceKey(element, asset))

    if (definition || asset?.name.toLowerCase().endsWith(".svg")) {
      const loaded = await loadSVGFromURL(sourceUrl)
      const objects = loaded.objects.filter((object): object is FabricObject => object !== null)
      if (objects.length === 0) return withSourceKey(missingImagePlaceholder(), elementSourceKey(element, asset))
      const graphic = util.groupSVGElements(objects, loaded.options)
      graphic.set({ lockScalingFlip: true })
      if (element.fill) applyGraphicColor(graphic, element.fill)
      return withSourceKey(graphic, elementSourceKey(element, asset))
    }

    const image = await FabricImage.fromURL(sourceUrl, { crossOrigin: "anonymous" }, {
      imageSmoothing: true,
      lockScalingFlip: true,
    })
    if (element.fill) {
      image.filters = [new filters.BlendColor({ color: element.fill, mode: "tint", alpha: 1 })]
      image.applyFilters()
    }
    return withSourceKey(image, elementSourceKey(element, asset))
  } catch {
    return withSourceKey(missingImagePlaceholder(), elementSourceKey(element, asset))
  }
}

export function fabricObjectMatchesElement(object: FabricObject, element: CanvasElement, asset?: Asset): boolean {
  if (element.type === "text") return object instanceof Textbox
  if (element.type === "shape") return object instanceof Rect && !(object instanceof FabricImage)
  return (object instanceof FabricImage || object instanceof Group || object instanceof Rect)
    && sourceKeyForObject(object) === elementSourceKey(element, asset)
}

export function sourceKeyForObject(object: FabricObject): string | undefined {
  return (object as SourcedFabricObject).storeshotSourceKey
}

export function assetForElement(element: CanvasElement, assetLookup: Map<string, Asset>): Asset | undefined {
  if (element.type === "mockup") return assetLookup.get(element.assetId)
  if (element.type === "image" && element.source.kind === "asset") return assetLookup.get(element.source.assetId)
  return undefined
}

export function applyCanvasElement(object: FabricObject, element: CanvasElement, scale: number): void {
  object.set({
    angle: element.rotation,
    left: element.x * scale,
    opacity: element.opacity,
    originX: "left",
    originY: "top",
    top: element.y * scale,
  })

  if (element.type === "text" && object instanceof Textbox) {
    object.set({
      fill: element.color,
      fontFamily: element.fontFamily,
      fontSize: element.fontSize * scale,
      fontWeight: element.fontWeight,
      lineHeight: element.lineHeight === undefined
        ? DEFAULT_TEXT_LINE_HEIGHT_RATIO
        : element.lineHeight / element.fontSize,
      scaleX: 1,
      scaleY: 1,
      strokeWidth: 0,
      text: element.text,
      textAlign: element.textAlign,
      width: Math.max(24, element.width * scale),
    })
    object.initDimensions()
  } else if (element.type === "shape" && object instanceof Rect) {
    object.set({
      fill: element.fill,
      height: element.height * scale,
      rx: element.cornerRadius * scale,
      ry: element.cornerRadius * scale,
      scaleX: 1,
      scaleY: 1,
      strokeWidth: 0,
      width: element.width * scale,
    })
  } else {
    object.set({
      scaleX: (element.width * scale) / Math.max(1, object.width),
      scaleY: (element.height * scale) / Math.max(1, object.height),
    })
  }
  object.setCoords()
}

type SourcedFabricObject = FabricObject & { storeshotSourceKey?: string }

function withSourceKey<T extends FabricObject>(object: T, sourceKey: string): T {
  (object as SourcedFabricObject).storeshotSourceKey = sourceKey
  return object
}

function elementSourceKey(element: CanvasElement, asset?: Asset): string {
  if (element.type === "mockup") return `mockup:${element.mockupId}:${asset?.url ?? element.assetId}`
  if (element.type === "image") {
    return element.source.kind === "builtin"
      ? `image:builtin:${element.source.id}:${element.fill ?? "source"}`
      : `image:asset:${asset?.url ?? element.source.assetId}:${element.fill ?? "source"}`
  }
  return element.type
}

function applyGraphicColor(object: FabricObject, color: string): void {
  if (object instanceof Group) {
    object.getObjects().forEach((child) => applyGraphicColor(child, color))
  } else {
    const fill = typeof object.fill === "string" && !isTransparentPaint(object.fill) ? color : object.fill
    const stroke = typeof object.stroke === "string" && !isTransparentPaint(object.stroke) ? color : object.stroke
    object.set({ fill, stroke })
  }
  object.dirty = true
}

function isTransparentPaint(value: string): boolean {
  const normalized = value.trim().toLowerCase().replaceAll(" ", "")
  return normalized === "none" || normalized === "transparent" || normalized === "rgba(0,0,0,0)"
}

function missingImagePlaceholder(): Rect {
  return new Rect({
    fill: "rgba(0, 0, 0, 0.08)",
    stroke: "rgba(255, 255, 255, 0.8)",
    strokeDashArray: [8, 6],
    lockScalingFlip: true,
  })
}
