import { Circle, FabricImage, Group, Line, Rect, Textbox, filters, loadSVGFromURL, util, type FabricObject } from "fabric"

import { builtInArtworkById } from "../artwork"
import type { DeviceMockup } from "../device-mockups"
import type { CanvasElementBounds } from "../group-elements"
import { DEFAULT_TEXT_LINE_HEIGHT_RATIO, type Asset, type CanvasElement, type GroupElement } from "../shared"
import { renderDeviceMockup } from "./device-mockup-renderer"

export async function createFabricObject(
  element: CanvasElement,
  assetLookup: Map<string, Asset>,
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

  if (element.type === "shape") {
    if (element.shape === "circle") return new Circle({ lockScalingFlip: true, radius: 0.5 })
    if (element.shape === "line") return new Line([0, 0, 1, 1], { lockScalingFlip: true })
    return new Rect({ lockScalingFlip: true })
  }

  if (element.type === "group") {
    const children = await Promise.all(element.children.map(async (child) => {
      const object = await createFabricObject(child, assetLookup, mockupLookup)
      applyCanvasElement(object, child, 1)
      return object
    }))
    return withSourceKey(new Group(children, {
      fill: "transparent",
      lockScalingFlip: true,
      objectCaching: false,
      stroke: null,
      strokeWidth: 0,
    }), elementSourceKey(element, assetLookup))
  }

  const asset = assetForElement(element, assetLookup)
  try {
    if (element.type === "mockup") {
      if (!asset) return withSourceKey(missingImagePlaceholder(), elementSourceKey(element, assetLookup))
      const mockup = mockupLookup.get(element.mockupId)
      if (!mockup) return withSourceKey(missingImagePlaceholder(), elementSourceKey(element, assetLookup))
      const composite = await renderDeviceMockup(mockup, asset.url)
      return withSourceKey(new FabricImage(composite, {
        imageSmoothing: true,
        lockScalingFlip: true,
      }), elementSourceKey(element, assetLookup))
    }

    if (element.type !== "image") return withSourceKey(missingImagePlaceholder(), elementSourceKey(element, assetLookup))
    const definition = element.source.kind === "builtin" ? builtInArtworkById(element.source.id) : undefined
    const sourceUrl = definition?.url ?? asset?.url
    if (!sourceUrl) return withSourceKey(missingImagePlaceholder(), elementSourceKey(element, assetLookup))

    if (definition || asset?.name.toLowerCase().endsWith(".svg")) {
      const loaded = await loadSVGFromURL(sourceUrl)
      const objects = loaded.objects.filter((object): object is FabricObject => object !== null)
      if (objects.length === 0) return withSourceKey(missingImagePlaceholder(), elementSourceKey(element, assetLookup))
      const graphic = util.groupSVGElements(objects, loaded.options)
      graphic.set({ lockScalingFlip: true })
      if (element.fill) applyGraphicColor(graphic, element.fill)
      return withSourceKey(graphic, elementSourceKey(element, assetLookup))
    }

    const image = await FabricImage.fromURL(sourceUrl, { crossOrigin: "anonymous" }, {
      imageSmoothing: true,
      lockScalingFlip: true,
    })
    if (element.fill) {
      image.filters = [new filters.BlendColor({ color: element.fill, mode: "tint", alpha: 1 })]
      image.applyFilters()
    }
    return withSourceKey(image, elementSourceKey(element, assetLookup))
  } catch {
    return withSourceKey(missingImagePlaceholder(), elementSourceKey(element, assetLookup))
  }
}

export function fabricObjectMatchesElement(
  object: FabricObject,
  element: CanvasElement,
  assetLookup: Map<string, Asset>,
): boolean {
  if (element.type === "text") return object instanceof Textbox
  if (element.type === "group") return object instanceof Group && sourceKeyForObject(object) === elementSourceKey(element, assetLookup)
  if (element.type === "shape") {
    if (element.shape === "circle") return object instanceof Circle
    if (element.shape === "line") return object instanceof Line
    return object instanceof Rect && !(object instanceof FabricImage)
  }
  return (object instanceof FabricImage || object instanceof Group || object instanceof Rect)
    && sourceKeyForObject(object) === elementSourceKey(element, assetLookup)
}

export async function renderedCanvasElementsBounds(
  elements: CanvasElement[],
  assetLookup: Map<string, Asset>,
  mockupLookup: Map<string, DeviceMockup>,
): Promise<CanvasElementBounds> {
  const objects = await Promise.all(elements.map(async (element) => {
    const object = await createFabricObject(element, assetLookup, mockupLookup)
    applyCanvasElement(object, element, 1)
    return object
  }))
  try {
    return objects.reduce<CanvasElementBounds>((bounds, object) => {
      const rectangle = object.getBoundingRect()
      return {
        bottom: Math.max(bounds.bottom, rectangle.top + rectangle.height),
        left: Math.min(bounds.left, rectangle.left),
        right: Math.max(bounds.right, rectangle.left + rectangle.width),
        top: Math.min(bounds.top, rectangle.top),
      }
    }, { bottom: -Infinity, left: Infinity, right: -Infinity, top: Infinity })
  } finally {
    objects.forEach((object) => object.dispose())
  }
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
    flipX: element.flipX ?? false,
    flipY: element.flipY ?? false,
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
  } else if (element.type === "shape") {
    object.set({
      fill: element.fill,
      scaleX: element.shape === "rectangle" ? 1 : element.width * scale,
      scaleY: element.shape === "rectangle" ? 1 : element.height * scale,
      stroke: element.stroke,
      strokeUniform: true,
      strokeWidth: element.strokeWidth * scale,
    })
    if (element.shape === "rectangle" && object instanceof Rect) {
      object.set({
        height: element.height * scale,
        rx: element.cornerRadius * scale,
        ry: element.cornerRadius * scale,
        width: element.width * scale,
      })
    }
  } else {
    const scaleX = (element.width * scale) / Math.max(1, object.width)
    const scaleY = (element.height * scale) / Math.max(1, object.height)
    object.set({ scaleX, scaleY })
    if (element.type === "group" && object instanceof Group) applyGroupPaintScale(object, element, scaleX, scaleY)
  }
  object.setCoords()
}

function applyGroupPaintScale(object: Group, element: GroupElement, parentScaleX: number, parentScaleY: number): void {
  object.getObjects().forEach((childObject, index) => {
    const child = element.children[index]
    if (!child) return
    if (child.type === "shape") {
      const center = childObject.getRelativeCenterPoint()
      childObject.set({
        strokeUniform: true,
        strokeWidth: child.strokeWidth * (Math.abs(parentScaleX) + Math.abs(parentScaleY)) / 2,
      })
      childObject.setPositionByOrigin(center, "center", "center")
      childObject.setCoords()
    } else if (child.type === "group" && childObject instanceof Group) {
      applyGroupPaintScale(
        childObject,
        child,
        parentScaleX * Math.abs(childObject.scaleX),
        parentScaleY * Math.abs(childObject.scaleY),
      )
    }
    childObject.dirty = true
  })
  object.dirty = true
}

type SourcedFabricObject = FabricObject & { storeshotSourceKey?: string }

function withSourceKey<T extends FabricObject>(object: T, sourceKey: string): T {
  (object as SourcedFabricObject).storeshotSourceKey = sourceKey
  return object
}

function elementSourceKey(element: CanvasElement, assetLookup: Map<string, Asset>): string {
  const asset = assetForElement(element, assetLookup)
  if (element.type === "group") {
    const childSources = element.children.map((child) => elementSourceKey(child, assetLookup))
    return `group:${element.id}:${JSON.stringify(element.children)}:${JSON.stringify(childSources)}`
  }
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
