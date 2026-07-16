import { useEffect, useLayoutEffect, useRef } from "react"
import { Canvas as FabricCanvas, Line, Point, Rect, Textbox, type FabricObject } from "fabric"

import type { DeviceMockup } from "../device-mockups"
import type { Asset, CanvasElement, ScreenshotArea, TextElement } from "../shared"
import { loadBunnyFont } from "./bunny-fonts"
import { calculateCenterSnap } from "./canvas-snapping"
import { applyCanvasElement as applyElement, assetForElement, createFabricObject as createObject, fabricObjectMatchesElement as objectMatchesElement, sourceKeyForObject } from "./fabric-elements"

const CONTROL_COLOR = "#1683ff"
const SHOT_DISPLAY_LONG_EDGE = 754
const SNAP_THRESHOLD = 6
const SELECTION_MARGIN = 18
const SELECTION_VIEWPORT_BUFFER = 96
const OUTSIDE_SELECTION_OPACITY = 0.24

interface SelectionBounds {
  bottom: number
  left: number
  right: number
  top: number
}

interface SelectionViewport {
  expanded: boolean
  height: number
  left: number
  top: number
  width: number
}

interface SelectionGhost {
  elementId: string
  object: FabricObject
  sourceKey: string
}

interface FabricShotCanvasProps {
  active: boolean
  area: ScreenshotArea
  assetLookup: Map<string, Asset>
  mockupLookup: Map<string, DeviceMockup>
  canvasSize: { width: number; height: number }
  continuousPreview: boolean
  selectedElementId: string | null
  zoom: number
  onActivate: () => void
  onChange: (element: CanvasElement) => void
  onContextMenu: (elementId: string | null) => void
  onSelect: (elementId: string | null) => void
}

interface CanvasCallbacks {
  active: boolean
  onActivate: () => void
  onChange: (element: CanvasElement) => void
  onContextMenu: (elementId: string | null) => void
  onSelect: (elementId: string | null) => void
}

export function FabricShotCanvas({
  active,
  area,
  assetLookup,
  mockupLookup,
  canvasSize,
  continuousPreview,
  selectedElementId,
  zoom,
  onActivate,
  onChange,
  onContextMenu,
  onSelect,
}: FabricShotCanvasProps) {
  const canvasElement = useRef<HTMLCanvasElement>(null)
  const fabricCanvas = useRef<FabricCanvas | null>(null)
  const selectionGhost = useRef<SelectionGhost | null>(null)
  const selectionViewportState = useRef<{ key: string | null; viewport: SelectionViewport } | null>(null)
  const objectsById = useRef(new Map<string, FabricObject>())
  const idsByObject = useRef(new WeakMap<FabricObject, string>())
  const areaRef = useRef(area)
  const syncVersion = useRef(0)
  const callbacks = useRef<CanvasCallbacks>({ active, onActivate, onChange, onContextMenu, onSelect })
  const naturalScale = SHOT_DISPLAY_LONG_EDGE / Math.max(canvasSize.width, canvasSize.height)
  const displayWidth = Math.max(1, Math.round(canvasSize.width * naturalScale * zoom))
  const scale = displayWidth / canvasSize.width
  const displayHeight = Math.round(canvasSize.height * scale)
  const selectedElement = active ? area.elements.find((element) => element.id === selectedElementId) : undefined
  const selectionViewportKey = isImageElement(selectedElement)
    ? `${area.id}:${selectedElement.id}:${displayWidth}x${displayHeight}`
    : null
  const selectionBounds = isImageElement(selectedElement) ? getSelectionBounds(selectedElement, scale) : null
  const normalViewport = getNormalViewport(displayWidth, displayHeight)
  const previousViewport = selectionViewportState.current
  if (!selectionViewportKey || !selectionBounds) {
    selectionViewportState.current = { key: null, viewport: normalViewport }
  } else if (!previousViewport || previousViewport.key !== selectionViewportKey) {
    selectionViewportState.current = {
      key: selectionViewportKey,
      viewport: viewportContains(normalViewport, selectionBounds)
        ? normalViewport
        : expandSelectionViewport(normalViewport, selectionBounds),
    }
  } else if (!viewportContains(previousViewport.viewport, selectionBounds)) {
    selectionViewportState.current = {
      key: selectionViewportKey,
      viewport: expandSelectionViewport(previousViewport.viewport, selectionBounds),
    }
  }
  const selectionViewport = selectionViewportState.current!.viewport

  areaRef.current = area
  callbacks.current = { active, onActivate, onChange, onContextMenu, onSelect }

  useLayoutEffect(() => {
    const element = canvasElement.current
    if (!element) return

    const canvas = new FabricCanvas(element, {
      width: normalViewport.width,
      height: normalViewport.height,
      centeredRotation: true,
      preserveObjectStacking: true,
      selection: true,
      selectionBorderColor: CONTROL_COLOR,
      selectionColor: "rgba(22, 131, 255, 0.08)",
      selectionLineWidth: 1,
      stopContextMenu: false,
      uniformScaling: true,
    })
    applySelectionViewport(canvas, element, normalViewport)
    fabricCanvas.current = canvas
    let horizontalGuide: Line | null = null
    let verticalGuide: Line | null = null

    const clearGuides = () => {
      if (horizontalGuide) canvas.remove(horizontalGuide)
      if (verticalGuide) canvas.remove(verticalGuide)
      horizontalGuide = null
      verticalGuide = null
      canvas.requestRenderAll()
    }

    const updateGuides = (showHorizontal: boolean, showVertical: boolean) => {
      if (showHorizontal && !horizontalGuide) {
        horizontalGuide = createGuide([0, displayHeight / 2, displayWidth, displayHeight / 2])
        canvas.add(horizontalGuide)
      } else if (!showHorizontal && horizontalGuide) {
        canvas.remove(horizontalGuide)
        horizontalGuide = null
      }

      if (showVertical && !verticalGuide) {
        verticalGuide = createGuide([displayWidth / 2, 0, displayWidth / 2, displayHeight])
        canvas.add(verticalGuide)
      } else if (!showVertical && verticalGuide) {
        canvas.remove(verticalGuide)
        verticalGuide = null
      }

      if (horizontalGuide) canvas.bringObjectToFront(horizontalGuide)
      if (verticalGuide) canvas.bringObjectToFront(verticalGuide)
      canvas.requestRenderAll()
    }

    const selectTarget = (target?: FabricObject) => {
      callbacks.current.onActivate()
      callbacks.current.onSelect(target ? idsByObject.current.get(target) ?? null : null)
    }

    const emitChange = (target: FabricObject) => {
      const id = idsByObject.current.get(target)
      const elementValue = areaRef.current.elements.find((candidate) => candidate.id === id)
      if (elementValue) callbacks.current.onChange(readElement(target, elementValue, scale))
    }

    const syncSelectionGhost = (target: FabricObject) => {
      const ghost = selectionGhost.current?.object
      if (!ghost) return
      syncSelectionGhostTransform(ghost, target)
    }

    canvas.on("mouse:down", ({ target }) => selectTarget(target))
    canvas.on("selection:cleared", () => {
      clearGuides()
    })
    canvas.on("contextmenu", ({ target }) => {
      const elementId = target ? idsByObject.current.get(target) ?? null : null
      if (target && elementId) {
        canvas.setActiveObject(target)
        selectTarget(target)
        canvas.requestRenderAll()
      }
      callbacks.current.onContextMenu(elementId)
    })
    canvas.on("object:moving", ({ target }) => {
      const objectCenter = target.getCenterPoint()
      const canvasCenter = new Point(displayWidth / 2, displayHeight / 2)
      const snap = calculateCenterSnap(objectCenter, canvasCenter, SNAP_THRESHOLD)

      if (snap.horizontal || snap.vertical) {
        target.setPositionByOrigin(new Point(snap.x, snap.y), "center", "center")
        target.setCoords()
      }
      syncSelectionGhost(target)
      updateGuides(snap.horizontal, snap.vertical)
    })
    canvas.on("object:rotating", ({ target }) => syncSelectionGhost(target))
    canvas.on("object:scaling", ({ target }) => syncSelectionGhost(target))
    canvas.on("object:modified", ({ target }) => {
      clearGuides()
      emitChange(target)
    })
    canvas.on("mouse:up", clearGuides)
    canvas.on("text:changed", ({ target }) => emitChange(target))
    canvas.on("text:editing:exited", ({ target }) => emitChange(target))

    return () => {
      syncVersion.current += 1
      selectionGhost.current = null
      objectsById.current.clear()
      fabricCanvas.current = null
      void canvas.dispose()
    }
  }, [displayHeight, displayWidth, scale])

  useLayoutEffect(() => {
    const canvas = fabricCanvas.current
    const element = canvasElement.current
    if (!canvas || !element) return

    const ghostState = selectionGhost.current
    if (ghostState && (!selectionViewport.expanded || ghostState.elementId !== selectedElementId)) {
      canvas.remove(ghostState.object)
      ghostState.object.dispose()
      selectionGhost.current = null
    }

    for (const object of objectsById.current.values()) {
      applyShotClip(object, selectionViewport.expanded, displayWidth, displayHeight)
    }
    applySelectionViewport(canvas, element, selectionViewport)
    canvas.requestRenderAll()
  }, [displayHeight, displayWidth, selectedElementId, selectionViewport.expanded, selectionViewport.height, selectionViewport.left, selectionViewport.top, selectionViewport.width])

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
        const asset = assetForElement(element, assetLookup)

        if (object && !objectMatchesElement(object, element, asset)) {
          canvas.remove(object)
          objectsById.current.delete(element.id)
          object = undefined
        }

        if (!object) {
          object = await createObject(element, asset, mockupLookup)
          if (version !== syncVersion.current || fabricCanvas.current !== canvas) return
          configureControls(object, element)
          objectsById.current.set(element.id, object)
          idsByObject.current.set(object, element.id)
          canvas.add(object)
        }

        if (!(object instanceof Textbox && object.isEditing)) {
          applyElement(object, element, scale)
        }
        applyShotClip(object, selectionViewport.expanded, displayWidth, displayHeight)

        if (element.type === "text" && object instanceof Textbox) {
          const textObject = object
          void loadBunnyFont(element.fontFamily, element.fontWeight)
            .then(() => {
              if (version !== syncVersion.current || fabricCanvas.current !== canvas) return
              const currentElement = areaRef.current.elements.find((candidate) => candidate.id === element.id)
              if (!currentElement || currentElement.type !== "text") return
              applyElement(textObject, currentElement, scale)
              canvas.requestRenderAll()
            })
            .catch(() => undefined)
        }
      }

      if (version !== syncVersion.current || fabricCanvas.current !== canvas) return
      area.elements.forEach((element, index) => {
        const object = objectsById.current.get(element.id)
        if (object) canvas.moveObjectTo(object, index)
      })
      if (active && selectedElementId) {
        const selected = objectsById.current.get(selectedElementId)
        const selectedElement = area.elements.find((element) => element.id === selectedElementId)
        if (selected) {
          canvas.setActiveObject(selected)
          if (selectionViewport.expanded && isImageElement(selectedElement)) {
            const sourceKey = sourceKeyForObject(selected) ?? selectedElement.type
            let ghostState = selectionGhost.current
            if (ghostState && (ghostState.elementId !== selectedElement.id || ghostState.sourceKey !== sourceKey)) {
              canvas.remove(ghostState.object)
              ghostState.object.dispose()
              selectionGhost.current = null
              ghostState = null
            }

            if (!ghostState) {
              const ghost = await selected.clone()
              if (version !== syncVersion.current || fabricCanvas.current !== canvas) {
                ghost.dispose()
                return
              }
              ghost.set({
                clipPath: createShotClip(displayWidth, displayHeight, true),
                evented: false,
                excludeFromExport: true,
                objectCaching: false,
                opacity: Math.min(selected.opacity ?? 1, OUTSIDE_SELECTION_OPACITY),
                selectable: false,
              })
              ghostState = { elementId: selectedElement.id, object: ghost, sourceKey }
              selectionGhost.current = ghostState
              canvas.add(ghost)
            } else {
              syncSelectionGhostTransform(ghostState.object, selected)
            }
            canvas.moveObjectTo(ghostState.object, 0)
            canvas.setActiveObject(selected)
          }
        }
      }
      if (!selectionViewport.expanded || !isImageElement(selectedElement)) {
        const ghostState = selectionGhost.current
        if (ghostState) {
          canvas.remove(ghostState.object)
          ghostState.object.dispose()
          selectionGhost.current = null
        }
      }
      canvas.requestRenderAll()
    }

    void syncObjects()
  }, [active, area, assetLookup, displayHeight, displayWidth, mockupLookup, scale, selectedElementId, selectionViewport.expanded])

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
      className={continuousPreview ? "relative bg-white" : "relative bg-white shadow-xl ring-1 ring-black/10"}
      style={{ width: displayWidth, height: displayHeight, backgroundColor: area.background }}
    >
      <canvas ref={canvasElement} aria-label={`${area.name} editable canvas`} />
    </div>
  )
}

function getSelectionBounds(selectedElement: CanvasElement, scale: number): SelectionBounds {
  const bounds = getRotatedElementBounds(selectedElement, scale)
  return {
    bottom: Math.ceil(bounds.bottom + SELECTION_MARGIN),
    left: Math.floor(bounds.left - SELECTION_MARGIN),
    right: Math.ceil(bounds.right + SELECTION_MARGIN),
    top: Math.floor(bounds.top - SELECTION_MARGIN),
  }
}

function getNormalViewport(displayWidth: number, displayHeight: number): SelectionViewport {
  return { expanded: false, height: displayHeight, left: 0, top: 0, width: displayWidth }
}

function applySelectionViewport(canvas: FabricCanvas, element: HTMLCanvasElement, viewport: SelectionViewport) {
  canvas.setDimensions({ height: viewport.height, width: viewport.width })
  canvas.setViewportTransform([1, 0, 0, 1, -viewport.left, -viewport.top])

  const canvasContainer = element.parentElement
  if (!canvasContainer) return
  canvasContainer.style.left = `${viewport.left}px`
  canvasContainer.style.position = "absolute"
  canvasContainer.style.top = `${viewport.top}px`
  canvasContainer.style.zIndex = viewport.expanded ? "30" : "0"
}

function viewportContains(viewport: SelectionViewport, bounds: SelectionBounds): boolean {
  return bounds.left >= viewport.left
    && bounds.top >= viewport.top
    && bounds.right <= viewport.left + viewport.width
    && bounds.bottom <= viewport.top + viewport.height
}

function expandSelectionViewport(viewport: SelectionViewport, bounds: SelectionBounds): SelectionViewport {
  const left = Math.min(viewport.left, bounds.left - SELECTION_VIEWPORT_BUFFER)
  const top = Math.min(viewport.top, bounds.top - SELECTION_VIEWPORT_BUFFER)
  const right = Math.max(viewport.left + viewport.width, bounds.right + SELECTION_VIEWPORT_BUFFER)
  const bottom = Math.max(viewport.top + viewport.height, bounds.bottom + SELECTION_VIEWPORT_BUFFER)
  return { expanded: true, height: bottom - top, left, top, width: right - left }
}

function getRotatedElementBounds(element: CanvasElement, scale: number) {
  const left = element.x * scale
  const top = element.y * scale
  const width = element.width * scale
  const height = element.height * scale
  const angle = element.rotation * Math.PI / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ].map((point) => ({
    x: left + point.x * cosine - point.y * sine,
    y: top + point.x * sine + point.y * cosine,
  }))

  return {
    bottom: Math.max(...corners.map((point) => point.y)),
    left: Math.min(...corners.map((point) => point.x)),
    right: Math.max(...corners.map((point) => point.x)),
    top: Math.min(...corners.map((point) => point.y)),
  }
}

function isImageElement(element: CanvasElement | undefined): element is Extract<CanvasElement, { type: "image" | "mockup" }> {
  return element?.type === "image" || element?.type === "mockup"
}

function applyShotClip(object: FabricObject, clipped: boolean, displayWidth: number, displayHeight: number) {
  const currentClip = object.clipPath as StoreShotClipPath | undefined
  if (!clipped) {
    if (currentClip) {
      object.set({ clipPath: undefined })
      object.dirty = true
    }
    return
  }
  if (
    currentClip?.storeshotClipWidth === displayWidth
    && currentClip.storeshotClipHeight === displayHeight
    && currentClip.storeshotClipInverted === false
  ) return
  object.set({ clipPath: createShotClip(displayWidth, displayHeight) })
  object.dirty = true
}

type StoreShotClipPath = Rect & { storeshotClipHeight?: number; storeshotClipInverted?: boolean; storeshotClipWidth?: number }

function createShotClip(displayWidth: number, displayHeight: number, inverted = false): Rect {
  const clip = new Rect({
    absolutePositioned: true,
    evented: false,
    fill: "#000000",
    height: displayHeight,
    inverted,
    left: 0,
    originX: "left",
    originY: "top",
    selectable: false,
    top: 0,
    width: displayWidth,
  })
  const storeshotClip = clip as StoreShotClipPath
  storeshotClip.storeshotClipHeight = displayHeight
  storeshotClip.storeshotClipInverted = inverted
  storeshotClip.storeshotClipWidth = displayWidth
  return clip
}

function syncSelectionGhostTransform(ghost: FabricObject, target: FabricObject) {
  ghost.set({
    angle: target.angle,
    flipX: target.flipX,
    flipY: target.flipY,
    left: target.left,
    opacity: Math.min(target.opacity ?? 1, OUTSIDE_SELECTION_OPACITY),
    scaleX: target.scaleX,
    scaleY: target.scaleY,
    skewX: target.skewX,
    skewY: target.skewY,
    top: target.top,
  })
  ghost.setCoords()
  ghost.dirty = true
}

function createGuide(points: [number, number, number, number]): Line {
  return new Line(points, {
    evented: false,
    excludeFromExport: true,
    objectCaching: false,
    selectable: false,
    stroke: CONTROL_COLOR,
    strokeDashArray: [4, 4],
    strokeWidth: 1,
  })
}

function configureControls(object: FabricObject, element: CanvasElement) {
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
  if (element.type === "mockup") {
    object.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false })
  }
}

function readElement(object: FabricObject, element: CanvasElement, scale: number): CanvasElement {
  const base = {
    ...element,
    x: round((object.left ?? 0) / scale),
    y: round((object.top ?? 0) / scale),
    width: round(object.width * Math.abs(object.scaleX) / scale),
    height: round(object.height * Math.abs(object.scaleY) / scale),
    rotation: round(object.angle ?? 0),
    opacity: round(object.opacity ?? 1, 3),
    flipX: object.flipX,
    flipY: object.flipY,
  }

  if (element.type === "text" && object instanceof Textbox) {
    return {
      ...base,
      type: "text",
      text: object.text,
      fontFamily: object.fontFamily,
      fontSize: round(element.fontSize * Math.abs(object.scaleY), 2),
      fontWeight: normalizeFontWeight(object.fontWeight),
      lineHeight: element.lineHeight === undefined
        ? undefined
        : round(element.lineHeight * Math.abs(object.scaleY), 2),
      color: typeof object.fill === "string" ? object.fill : element.color,
      textAlign: normalizeTextAlign(object.textAlign),
    }
  }

  return base
}

function normalizeFontWeight(value: TextElement["fontWeight"] | string | number): TextElement["fontWeight"] {
  const numeric = Number(value)
  if (Number.isInteger(numeric) && numeric >= 100 && numeric <= 900 && numeric % 100 === 0) return numeric as TextElement["fontWeight"]
  return 400
}

function normalizeTextAlign(value: string): TextElement["textAlign"] {
  return value === "left" || value === "right" ? value : "center"
}

function round(value: number, precision = 1): number {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}
