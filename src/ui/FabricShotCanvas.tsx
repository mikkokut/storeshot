import { useEffect, useLayoutEffect, useRef } from "react"
import { ActiveSelection, Canvas as FabricCanvas, Line, Point, Rect, Textbox, type FabricObject } from "fabric"

import type { DeviceMockup } from "../device-mockups"
import { flattenCanvasElements } from "../element-tree"
import type { Asset, CanvasElement, ScreenshotArea, TextElement } from "../shared"
import { loadBunnyFont } from "./bunny-fonts"
import { calculateCenterSnap } from "./canvas-snapping"
import { applyCanvasElement as applyElement, createFabricObject as createObject, fabricObjectMatchesElement as objectMatchesElement, sourceKeyForObject } from "./fabric-elements"

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
  selectedElementIds: string[]
  zoom: number
  onActivate: () => void
  onChange: (elements: CanvasElement[]) => void
  onContextMenu: (elementId: string | null) => void
  onSelectMany: (elementIds: string[]) => void
}

interface CanvasCallbacks {
  active: boolean
  onActivate: () => void
  onChange: (elements: CanvasElement[]) => void
  onContextMenu: (elementId: string | null) => void
  onSelectMany: (elementIds: string[]) => void
}

export function FabricShotCanvas({
  active,
  area,
  assetLookup,
  mockupLookup,
  canvasSize,
  continuousPreview,
  selectedElementId,
  selectedElementIds,
  zoom,
  onActivate,
  onChange,
  onContextMenu,
  onSelectMany,
}: FabricShotCanvasProps) {
  const canvasElement = useRef<HTMLCanvasElement>(null)
  const fabricCanvas = useRef<FabricCanvas | null>(null)
  const selectionGhost = useRef<SelectionGhost | null>(null)
  const selectionViewportState = useRef<{ key: string | null; viewport: SelectionViewport } | null>(null)
  const syncingActiveSelection = useRef(false)
  const objectsById = useRef(new Map<string, FabricObject>())
  const idsByObject = useRef(new WeakMap<FabricObject, string>())
  const areaRef = useRef(area)
  const syncVersion = useRef(0)
  const callbacks = useRef<CanvasCallbacks>({ active, onActivate, onChange, onContextMenu, onSelectMany })
  const naturalScale = SHOT_DISPLAY_LONG_EDGE / Math.max(canvasSize.width, canvasSize.height)
  const displayWidth = Math.max(1, Math.round(canvasSize.width * naturalScale * zoom))
  const scale = displayWidth / canvasSize.width
  const displayHeight = Math.round(canvasSize.height * scale)
  const selectedElement = active && selectedElementIds.length === 1
    ? area.elements.find((element) => element.id === selectedElementId)
    : undefined
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
  callbacks.current = { active, onActivate, onChange, onContextMenu, onSelectMany }

  useLayoutEffect(() => {
    const element = canvasElement.current
    if (!element) return

    const canvas = new FabricCanvas(element, {
      width: normalViewport.width,
      height: normalViewport.height,
      centeredRotation: true,
      preserveObjectStacking: true,
      selection: true,
      selectionKey: "shiftKey",
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

    const selectTargets = (targets: FabricObject[]) => {
      const ids = targets
        .flatMap((target) => target instanceof ActiveSelection ? target.getObjects() : [target])
        .flatMap((target) => {
          const id = idsByObject.current.get(target)
          return id ? [id] : []
        })
      if (ids.length > 0) {
        callbacks.current.onActivate()
        callbacks.current.onSelectMany(ids)
      }
    }

    const readChange = (target: FabricObject) => {
      const id = idsByObject.current.get(target)
      const elementValue = areaRef.current.elements.find((candidate) => candidate.id === id)
      return elementValue ? readElement(target, elementValue, scale) : null
    }

    const emitChanges = (target: FabricObject) => {
      if (target instanceof ActiveSelection) {
        const selectedObjects = target.getObjects()
        queueMicrotask(() => {
          if (fabricCanvas.current !== canvas) return
          if (canvas.getActiveObject() === target) {
            syncingActiveSelection.current = true
            try {
              canvas.discardActiveObject()
            } finally {
              syncingActiveSelection.current = false
            }
          }
          const changes = selectedObjects.map(readChange).filter((element): element is CanvasElement => element !== null)
          if (changes.length > 0) callbacks.current.onChange(changes)
        })
        return
      }
      const change = readChange(target)
      if (change) callbacks.current.onChange([change])
    }

    const syncSelectionGhost = (target: FabricObject) => {
      const ghost = selectionGhost.current?.object
      if (!ghost) return
      syncSelectionGhostTransform(ghost, target)
    }

    canvas.on("mouse:down", () => callbacks.current.onActivate())
    canvas.on("selection:created", () => {
      if (!syncingActiveSelection.current) selectTargets(canvas.getActiveObjects())
    })
    canvas.on("selection:updated", () => {
      if (!syncingActiveSelection.current) selectTargets(canvas.getActiveObjects())
    })
    canvas.on("selection:cleared", () => {
      clearGuides()
      if (!syncingActiveSelection.current) {
        callbacks.current.onActivate()
        callbacks.current.onSelectMany([])
      }
    })
    canvas.on("contextmenu", ({ target }) => {
      const elementId = target ? idsByObject.current.get(target) ?? null : null
      if (target && elementId) {
        canvas.setActiveObject(target)
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
      emitChanges(target)
    })
    canvas.on("mouse:up", clearGuides)
    canvas.on("text:changed", ({ target }) => emitChanges(target))
    canvas.on("text:editing:exited", ({ target }) => emitChanges(target))

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
    const updateActiveSelection = (update: () => void) => {
      syncingActiveSelection.current = true
      try {
        update()
      } finally {
        syncingActiveSelection.current = false
      }
    }

    async function syncObjects() {
      if (canvas.getActiveObject() instanceof ActiveSelection) {
        updateActiveSelection(() => canvas.discardActiveObject())
      }
      const nestedTextElements = flattenCanvasElements(area.elements).filter((element): element is TextElement => element.type === "text")
      await Promise.all(nestedTextElements.map((element) => loadBunnyFont(element.fontFamily, element.fontWeight).catch(() => undefined)))
      if (version !== syncVersion.current || fabricCanvas.current !== canvas) return
      const wantedIds = new Set(area.elements.map((element) => element.id))
      for (const [id, object] of objectsById.current) {
        if (!wantedIds.has(id)) {
          canvas.remove(object)
          objectsById.current.delete(id)
        }
      }

      for (const element of area.elements) {
        let object = objectsById.current.get(element.id)
        if (object && !objectMatchesElement(object, element, assetLookup)) {
          canvas.remove(object)
          objectsById.current.delete(element.id)
          object = undefined
        }

        if (!object) {
          object = await createObject(element, assetLookup, mockupLookup)
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
      }

      if (version !== syncVersion.current || fabricCanvas.current !== canvas) return
      area.elements.forEach((element, index) => {
        const object = objectsById.current.get(element.id)
        if (object) canvas.moveObjectTo(object, index)
      })
      updateActiveSelection(() => syncActiveSelection(canvas, active ? selectedElementIds : [], objectsById.current))
      if (active && selectedElementId && selectedElementIds.length === 1) {
        const selected = objectsById.current.get(selectedElementId)
        const selectedElement = area.elements.find((element) => element.id === selectedElementId)
        if (selected) {
          updateActiveSelection(() => canvas.setActiveObject(selected))
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
            updateActiveSelection(() => canvas.setActiveObject(selected))
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
  }, [active, area, assetLookup, displayHeight, displayWidth, mockupLookup, scale, selectedElementId, selectedElementIds, selectionViewport.expanded])

  return (
    <div
      className={continuousPreview ? "relative bg-white" : "relative bg-white shadow-xl ring-1 ring-black/10"}
      style={{ width: displayWidth, height: displayHeight, backgroundColor: area.background }}
    >
      <canvas ref={canvasElement} aria-label={`${area.name} editable canvas`} />
    </div>
  )
}

function syncActiveSelection(canvas: FabricCanvas, selectedIds: string[], objectsById: Map<string, FabricObject>) {
  const selectedObjects = selectedIds.flatMap((id) => {
    const object = objectsById.get(id)
    return object ? [object] : []
  })
  const currentObjects = canvas.getActiveObjects()
  if (sameObjects(currentObjects, selectedObjects)) return

  canvas.discardActiveObject()
  if (selectedObjects.length === 1) {
    canvas.setActiveObject(selectedObjects[0])
  } else if (selectedObjects.length > 1) {
    const selection = new ActiveSelection(selectedObjects, { canvas })
    selection.set({
      borderColor: CONTROL_COLOR,
      borderScaleFactor: 1.25,
      cornerColor: "#ffffff",
      cornerSize: 10,
      cornerStrokeColor: CONTROL_COLOR,
      cornerStyle: "circle",
      lockScalingFlip: true,
      transparentCorners: false,
    })
    canvas.setActiveObject(selection)
  }
}

function sameObjects(current: FabricObject[], selected: FabricObject[]): boolean {
  if (current.length !== selected.length) return false
  const currentSet = new Set(current)
  return selected.every((object) => currentSet.has(object))
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
  if (element.type === "group" || element.type === "mockup" || (element.type === "shape" && element.shape === "circle")) {
    object.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false })
  }
  if (element.type === "group" || (element.type === "shape" && element.shape === "circle")) object.set({ lockUniScaling: true })
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
