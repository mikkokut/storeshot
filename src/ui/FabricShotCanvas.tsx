import { useEffect, useRef } from "react"
import { Canvas as FabricCanvas, FabricImage, Rect, Textbox, type FabricObject } from "fabric"

import type { Asset, CanvasElement, ScreenshotArea, TextElement } from "../shared"

export const SHOT_DISPLAY_WIDTH = 348

const CONTROL_COLOR = "#1683ff"

interface FabricShotCanvasProps {
  active: boolean
  area: ScreenshotArea
  assetLookup: Map<string, Asset>
  canvasSize: { width: number; height: number }
  selectedElementId: string | null
  onActivate: () => void
  onChange: (element: CanvasElement) => void
  onSelect: (elementId: string | null) => void
}

interface CanvasCallbacks {
  active: boolean
  onActivate: () => void
  onChange: (element: CanvasElement) => void
  onSelect: (elementId: string | null) => void
}

export function FabricShotCanvas({
  active,
  area,
  assetLookup,
  canvasSize,
  selectedElementId,
  onActivate,
  onChange,
  onSelect,
}: FabricShotCanvasProps) {
  const canvasElement = useRef<HTMLCanvasElement>(null)
  const fabricCanvas = useRef<FabricCanvas | null>(null)
  const objectsById = useRef(new Map<string, FabricObject>())
  const idsByObject = useRef(new WeakMap<FabricObject, string>())
  const areaRef = useRef(area)
  const syncVersion = useRef(0)
  const callbacks = useRef<CanvasCallbacks>({ active, onActivate, onChange, onSelect })
  const scale = SHOT_DISPLAY_WIDTH / canvasSize.width
  const displayHeight = Math.round(canvasSize.height * scale)

  areaRef.current = area
  callbacks.current = { active, onActivate, onChange, onSelect }

  useEffect(() => {
    const element = canvasElement.current
    if (!element) return

    const canvas = new FabricCanvas(element, {
      width: SHOT_DISPLAY_WIDTH,
      height: displayHeight,
      backgroundColor: areaRef.current.background,
      centeredRotation: true,
      preserveObjectStacking: true,
      selection: true,
      selectionBorderColor: CONTROL_COLOR,
      selectionColor: "rgba(22, 131, 255, 0.08)",
      selectionLineWidth: 1,
      uniformScaling: true,
    })
    fabricCanvas.current = canvas

    const selectTarget = (target?: FabricObject) => {
      callbacks.current.onActivate()
      callbacks.current.onSelect(target ? idsByObject.current.get(target) ?? null : null)
    }

    const emitChange = (target: FabricObject) => {
      const id = idsByObject.current.get(target)
      const elementValue = areaRef.current.elements.find((candidate) => candidate.id === id)
      if (elementValue) callbacks.current.onChange(readElement(target, elementValue, scale))
    }

    canvas.on("mouse:down", ({ target }) => selectTarget(target))
    canvas.on("selection:created", ({ selected }) => selectTarget(selected?.[0]))
    canvas.on("selection:updated", ({ selected }) => selectTarget(selected?.[0]))
    canvas.on("selection:cleared", () => {
      if (callbacks.current.active) callbacks.current.onSelect(null)
    })
    canvas.on("object:modified", ({ target }) => emitChange(target))
    canvas.on("text:changed", ({ target }) => emitChange(target))
    canvas.on("text:editing:exited", ({ target }) => emitChange(target))

    return () => {
      syncVersion.current += 1
      objectsById.current.clear()
      fabricCanvas.current = null
      void canvas.dispose()
    }
  }, [displayHeight, scale])

  useEffect(() => {
    const currentCanvas = fabricCanvas.current
    if (!currentCanvas) return
    const canvas: FabricCanvas = currentCanvas
    const version = ++syncVersion.current

    async function syncObjects() {
      const wantedIds = new Set(area.elements.map((element) => element.id))
      for (const [id, object] of objectsById.current) {
        if (!wantedIds.has(id)) {
          canvas.remove(object)
          objectsById.current.delete(id)
        }
      }

      for (const element of area.elements) {
        let object = objectsById.current.get(element.id)
        const asset = element.type === "image" ? assetLookup.get(element.assetId) : undefined

        if (object && !objectMatchesElement(object, element)) {
          canvas.remove(object)
          objectsById.current.delete(element.id)
          object = undefined
        }

        if (!object) {
          object = await createObject(element, asset)
          if (version !== syncVersion.current || fabricCanvas.current !== canvas) return
          configureControls(object)
          objectsById.current.set(element.id, object)
          idsByObject.current.set(object, element.id)
          canvas.add(object)
        }

        if (!(object instanceof Textbox && object.isEditing)) {
          applyElement(object, element, scale)
        }
      }

      if (version !== syncVersion.current || fabricCanvas.current !== canvas) return
      area.elements.forEach((element, index) => {
        const object = objectsById.current.get(element.id)
        if (object) canvas.moveObjectTo(object, index)
      })
      canvas.backgroundColor = area.background
      canvas.requestRenderAll()
    }

    void syncObjects()
  }, [area, assetLookup, scale])

  useEffect(() => {
    const canvas = fabricCanvas.current
    if (!canvas) return
    if (!active || !selectedElementId) {
      canvas.discardActiveObject()
    } else {
      const selected = objectsById.current.get(selectedElementId)
      if (selected && canvas.getActiveObject() !== selected) canvas.setActiveObject(selected)
    }
    canvas.requestRenderAll()
  }, [active, selectedElementId, area.elements])

  return (
    <div
      className="overflow-hidden bg-white shadow-xl ring-1 ring-black/10"
      style={{ width: SHOT_DISPLAY_WIDTH, height: displayHeight }}
    >
      <canvas ref={canvasElement} aria-label={`${area.name} editable canvas`} />
    </div>
  )
}

async function createObject(element: CanvasElement, asset?: Asset): Promise<FabricObject> {
  if (element.type === "text") {
    return new Textbox(element.text, {
      editable: true,
      lockScalingFlip: true,
      minWidth: 24,
      splitByGrapheme: false,
    })
  }

  if (element.type === "shape") {
    return new Rect({ lockScalingFlip: true })
  }

  if (!asset) {
    return missingImagePlaceholder()
  }

  try {
    return await FabricImage.fromURL(asset.url, { crossOrigin: "anonymous" }, {
      imageSmoothing: true,
      lockScalingFlip: true,
    })
  } catch {
    return missingImagePlaceholder()
  }
}

function objectMatchesElement(object: FabricObject, element: CanvasElement): boolean {
  if (element.type === "text") return object instanceof Textbox
  if (element.type === "shape") return object instanceof Rect && !(object instanceof FabricImage)
  return object instanceof FabricImage || object instanceof Rect
}

function missingImagePlaceholder(): Rect {
  return new Rect({
    fill: "rgba(0, 0, 0, 0.08)",
    stroke: "rgba(255, 255, 255, 0.8)",
    strokeDashArray: [8, 6],
    lockScalingFlip: true,
  })
}

function configureControls(object: FabricObject) {
  object.set({
    borderColor: CONTROL_COLOR,
    borderScaleFactor: 1.25,
    cornerColor: "#ffffff",
    cornerSize: 10,
    cornerStrokeColor: CONTROL_COLOR,
    cornerStyle: "circle",
    lockScalingFlip: true,
    padding: 0,
    transparentCorners: false,
  })
}

function applyElement(object: FabricObject, element: CanvasElement, scale: number) {
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
      lineHeight: 1.05,
      scaleX: 1,
      scaleY: 1,
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

function readElement(object: FabricObject, element: CanvasElement, scale: number): CanvasElement {
  const base = {
    ...element,
    x: round((object.left ?? 0) / scale),
    y: round((object.top ?? 0) / scale),
    width: round(object.getScaledWidth() / scale),
    height: round(object.getScaledHeight() / scale),
    rotation: round(object.angle ?? 0),
    opacity: round(object.opacity ?? 1, 3),
  }

  if (element.type === "text" && object instanceof Textbox) {
    return {
      ...base,
      type: "text",
      text: object.text,
      fontFamily: object.fontFamily,
      fontSize: round(element.fontSize * Math.abs(object.scaleY), 2),
      fontWeight: normalizeFontWeight(object.fontWeight),
      color: typeof object.fill === "string" ? object.fill : element.color,
      textAlign: normalizeTextAlign(object.textAlign),
    }
  }

  return base
}

function normalizeFontWeight(value: TextElement["fontWeight"] | string | number): TextElement["fontWeight"] {
  const numeric = Number(value)
  if (numeric === 400 || numeric === 600 || numeric === 700 || numeric === 800) return numeric
  return 400
}

function normalizeTextAlign(value: string): TextElement["textAlign"] {
  return value === "left" || value === "right" ? value : "center"
}

function round(value: number, precision = 1): number {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}
