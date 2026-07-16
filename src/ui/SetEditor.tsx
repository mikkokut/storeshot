import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronsDown,
  ChevronsUp,
  Columns2,
  Copy,
  Download,
  Image as ImageIcon,
  ImagePlus,
  LoaderCircle,
  Minus,
  Plus,
  Redo2,
  Smartphone,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react"

import { messageFor, request } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Field as ShadcnField, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { builtInArtworkById, type BuiltInArtworkDefinition } from "../artwork"
import { deviceMockupById, type DeviceMockup, type DeviceMockupCatalog, type DevicePlatform } from "../device-mockups"
import type {
  Asset,
  AssetCategory,
  CanvasElement,
  DeviceMockupElement,
  FontWeight,
  ImageElement,
  ScreenshotArea,
  ScreenshotSet,
  ShapeElement,
  TextElement,
} from "../shared"
import { DEFAULT_TEXT_LINE_HEIGHT_RATIO } from "../shared"
import { ArtworkPicker } from "./ArtworkPicker"
import { FabricShotCanvas } from "./FabricShotCanvas"
import { BunnyFontPicker, closestFontWeight } from "./BunnyFontPicker"
import { ColorPicker } from "./ColorPicker"
import { DeviceMockupPicker } from "./DeviceMockupPicker"
import { exportScreenshotSet } from "./export-set"
import { useMockupCatalog } from "./MockupCatalogContext"
import { FONT_WEIGHTS, getBunnyFontCatalog, LOCAL_FONT_FAMILY, loadBunnyFont } from "./bunny-fonts"
import { cloneCanvasElement, cloneScreenshotArea } from "../screenshot-area"

interface SetEditorProps {
  assets: Record<AssetCategory, Asset[]>
  set: ScreenshotSet
  onOpenAssets: () => void
  onSetChange: (set: ScreenshotSet) => void
}

interface ObjectContextMenuState {
  areaId: string
  elementId: string
}

interface EditorSnapshot {
  areas: ScreenshotArea[]
  selectedAreaId: string
  selectedElementId: string | null
}

interface EditorHistory {
  past: EditorSnapshot[]
  future: EditorSnapshot[]
}

type EditorClipboard =
  | { kind: "area"; area: ScreenshotArea; pasteCount: number; token: string }
  | { kind: "element"; element: CanvasElement; pasteCount: number; token: string }

type CanvasElementChange = Partial<DeviceMockupElement> | Partial<ImageElement> | Partial<ShapeElement> | Partial<TextElement>

const HISTORY_LIMIT = 100
const NUDGE_DISTANCE = 1
const LARGE_NUDGE_DISTANCE = 10
const MIN_CANVAS_ZOOM = 0.25
const MAX_CANVAS_ZOOM = 2
const CANVAS_ZOOM_STEP = 0.25
const APP_CLIPBOARD_MIME = "application/x-storeshot"
let editorClipboard: EditorClipboard | null = null

export function SetEditor({ assets, set, onOpenAssets, onSetChange }: SetEditorProps) {
  const { catalog: mockupCatalog } = useMockupCatalog()
  const [workingSet, setWorkingSet] = useState(set)
  const [selectedAreaId, setSelectedAreaId] = useState(set.areas[0].id)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [devicePickerOpen, setDevicePickerOpen] = useState(false)
  const [artworkPickerOpen, setArtworkPickerOpen] = useState(false)
  const [mockupCatalogOpen, setMockupCatalogOpen] = useState(false)
  const [pendingMockupId, setPendingMockupId] = useState("")
  const [pendingMockupAssetId, setPendingMockupAssetId] = useState<string | null>(assets.screenshots[0]?.id ?? null)
  const [contextMenu, setContextMenu] = useState<ObjectContextMenuState | null>(null)
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved")
  const [exportProgress, setExportProgress] = useState<{ completed: number; total: number } | null>(null)
  const [continuousPreview, setContinuousPreview] = useState(false)
  const [canvasZoom, setCanvasZoom] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [areaPendingDeletionId, setAreaPendingDeletionId] = useState<string | null>(null)
  const [, setHistoryRevision] = useState(0)
  const currentSet = useRef(set)
  const selectedAreaIdRef = useRef(selectedAreaId)
  const selectedElementIdRef = useRef(selectedElementId)
  const history = useRef<EditorHistory>({ past: [], future: [] })
  const historyGroup = useRef<string | null>(null)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistRevision = useRef(0)
  const persistQueue = useRef<Promise<void>>(Promise.resolve())
  const assetPickerRef = useRef<HTMLDivElement>(null)

  selectedAreaIdRef.current = selectedAreaId
  selectedElementIdRef.current = selectedElementId

  useEffect(() => {
    currentSet.current = set
    setWorkingSet(set)
    setSelectedAreaId(set.areas[0].id)
    setSelectedElementId(null)
    setAssetPickerOpen(false)
    setDevicePickerOpen(false)
    setArtworkPickerOpen(false)
    setMockupCatalogOpen(false)
    setContinuousPreview(false)
    setCanvasZoom(1)
    history.current = { past: [], future: [] }
    historyGroup.current = null
    setHistoryRevision((revision) => revision + 1)
  }, [set.id])

  useEffect(() => {
    setWorkingSet((current) => {
      const next = {
        ...current,
        name: set.name,
        locale: set.locale,
        device: set.device,
        updatedAt: set.updatedAt,
      }
      currentSet.current = next
      return next
    })
  }, [set.name, set.locale, set.device, set.updatedAt])

  useEffect(() => () => {
    if (persistTimer.current) clearTimeout(persistTimer.current)
  }, [])

  const allAssets = useMemo(() => Object.values(assets).flat(), [assets])
  const screenshotAssets = assets.screenshots
  const assetLookup = useMemo(() => new Map(allAssets.map((asset) => [asset.id, asset])), [allAssets])
  const mockupLookup = useMemo(() => new Map(mockupCatalog.mockups.map((mockup) => [mockup.id, mockup])), [mockupCatalog.mockups])
  const documentColors = useMemo(() => colorsUsedInSet(workingSet), [workingSet])
  const selectedArea = workingSet.areas.find((area) => area.id === selectedAreaId) ?? workingSet.areas[0]
  const selectedElement = selectedArea.elements.find((element) => element.id === selectedElementId) ?? null
  const pendingMockup = deviceMockupById(mockupCatalog, pendingMockupId) ?? mockupCatalog.mockups[0]
  const pendingScreenshotGroups = partitionScreenshots(screenshotAssets, pendingMockup?.platform)
  const selectedElementIndex = selectedElement
    ? selectedArea.elements.findIndex((element) => element.id === selectedElement.id)
    : -1
  const contextArea = contextMenu ? workingSet.areas.find((area) => area.id === contextMenu.areaId) : undefined
  const contextElement = contextArea?.elements.find((element) => element.id === contextMenu?.elementId)
  const contextElementIndex = contextElement && contextArea
    ? contextArea.elements.findIndex((element) => element.id === contextElement.id)
    : -1
  const canUndo = history.current.past.length > 0
  const canRedo = history.current.future.length > 0

  useEffect(() => {
    if (!screenshotAssets.some((asset) => asset.id === pendingMockupAssetId)) {
      setPendingMockupAssetId(screenshotAssets[0]?.id ?? null)
    }
  }, [pendingMockupAssetId, screenshotAssets])

  useEffect(() => {
    if (!pendingMockup && mockupCatalog.mockups[0]) setPendingMockupId(mockupCatalog.mockups[0].id)
  }, [mockupCatalog.mockups, pendingMockup])

  useEffect(() => {
    if ((!assetPickerOpen && !devicePickerOpen && !artworkPickerOpen) || mockupCatalogOpen) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!assetPickerRef.current?.contains(event.target as Node)) {
        setAssetPickerOpen(false)
        setDevicePickerOpen(false)
        setArtworkPickerOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAssetPickerOpen(false)
        setDevicePickerOpen(false)
        setArtworkPickerOpen(false)
      }
    }
    window.addEventListener("pointerdown", closeOnOutsideClick)
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsideClick)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [assetPickerOpen, devicePickerOpen, artworkPickerOpen, mockupCatalogOpen])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase()
      const commandKey = event.metaKey || event.ctrlKey
      if (!isEditableTarget(event.target) && commandKey && !event.altKey && (key === "+" || key === "=" || key === "-" || key === "0")) {
        event.preventDefault()
        setCanvasZoom((current) => key === "0" ? 1 : clampCanvasZoom(current + (key === "-" ? -CANVAS_ZOOM_STEP : CANVAS_ZOOM_STEP)))
        return
      }
      if (!isEditableTarget(event.target) && commandKey && !event.altKey && key === "z") {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (!isEditableTarget(event.target) && event.ctrlKey && !event.metaKey && !event.altKey && key === "y") {
        event.preventDefault()
        redo()
        return
      }
      if (!selectedElementId || isEditableTarget(event.target)) return
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault()
        deleteElement()
      } else if (!commandKey && !event.altKey && isArrowKey(event.key)) {
        event.preventDefault()
        const distance = event.shiftKey ? LARGE_NUDGE_DISTANCE : NUDGE_DISTANCE
        nudgeSelectedElement(
          event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0,
          event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0,
        )
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault()
        duplicateElement()
      } else if (event.key === "Escape") {
        setSelectedElementId(null)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedArea.id, selectedElementId, workingSet])

  useEffect(() => {
    function handleCopy(event: ClipboardEvent) {
      if (isEditableTarget(event.target)) return
      const clipboard = copySelection()
      event.clipboardData?.setData(APP_CLIPBOARD_MIME, clipboard.token)
      event.clipboardData?.setData("text/plain", clipboardLabel(clipboard))
      event.preventDefault()
    }

    function handlePaste(event: ClipboardEvent) {
      if (isEditableTarget(event.target) || !editorClipboard) return
      if (event.clipboardData?.getData(APP_CLIPBOARD_MIME) !== editorClipboard.token) return
      event.preventDefault()
      pasteSelection()
    }

    window.addEventListener("copy", handleCopy)
    window.addEventListener("paste", handlePaste)
    return () => {
      window.removeEventListener("copy", handleCopy)
      window.removeEventListener("paste", handlePaste)
    }
  }, [workingSet])

  function captureSnapshot(): EditorSnapshot {
    return {
      areas: structuredClone(currentSet.current.areas),
      selectedAreaId: selectedAreaIdRef.current,
      selectedElementId: selectedElementIdRef.current,
    }
  }

  function recordHistory(groupKey?: string) {
    if (groupKey && historyGroup.current === groupKey) return
    const past = [...history.current.past, captureSnapshot()].slice(-HISTORY_LIMIT)
    history.current = { past, future: [] }
    historyGroup.current = groupKey ?? null
    setHistoryRevision((revision) => revision + 1)
  }

  function closeHistoryGroup() {
    historyGroup.current = null
  }

  function restoreSnapshot(snapshot: EditorSnapshot) {
    const next = { ...currentSet.current, areas: structuredClone(snapshot.areas) }
    const selectedArea = next.areas.find((area) => area.id === snapshot.selectedAreaId) ?? next.areas[0]
    const selectedElementId = selectedArea.elements.some((element) => element.id === snapshot.selectedElementId)
      ? snapshot.selectedElementId
      : null
    setDraft(next, undefined, false)
    setSelectedAreaId(selectedArea.id)
    setSelectedElementId(selectedElementId)
    setAssetPickerOpen(false)
    setDevicePickerOpen(false)
    setContextMenu(null)
    void persist(next)
  }

  function undo() {
    const previous = history.current.past.at(-1)
    if (!previous) return
    const past = history.current.past.slice(0, -1)
    const future = [...history.current.future, captureSnapshot()].slice(-HISTORY_LIMIT)
    history.current = { past, future }
    closeHistoryGroup()
    setHistoryRevision((revision) => revision + 1)
    restoreSnapshot(previous)
  }

  function redo() {
    const nextSnapshot = history.current.future.at(-1)
    if (!nextSnapshot) return
    const past = [...history.current.past, captureSnapshot()].slice(-HISTORY_LIMIT)
    const future = history.current.future.slice(0, -1)
    history.current = { past, future }
    closeHistoryGroup()
    setHistoryRevision((revision) => revision + 1)
    restoreSnapshot(nextSnapshot)
  }

  function copySelection(): EditorClipboard {
    const area = currentSet.current.areas.find((candidate) => candidate.id === selectedAreaIdRef.current)
      ?? currentSet.current.areas[0]
    const element = area.elements.find((candidate) => candidate.id === selectedElementIdRef.current)
    editorClipboard = element
      ? { kind: "element", element: structuredClone(element), pasteCount: 0, token: crypto.randomUUID() }
      : { kind: "area", area: structuredClone(area), pasteCount: 0, token: crypto.randomUUID() }
    return editorClipboard
  }

  function pasteSelection() {
    if (!editorClipboard) return
    const targetArea = currentSet.current.areas.find((area) => area.id === selectedAreaIdRef.current)
      ?? currentSet.current.areas[0]
    editorClipboard.pasteCount += 1

    if (editorClipboard.kind === "element") {
      const source = editorClipboard.element
      const offset = Math.round(currentSet.current.canvas.width * 0.025 * editorClipboard.pasteCount)
      const copy: CanvasElement = {
        ...cloneCanvasElement(source),
        x: clamp(source.x + offset, 0, Math.max(0, currentSet.current.canvas.width - source.width)),
        y: clamp(source.y + offset, 0, Math.max(0, currentSet.current.canvas.height - source.height)),
      }
      addElement(targetArea.id, copy)
      return
    }

    const source = editorClipboard.area
    const sourceIndex = currentSet.current.areas.findIndex((area) => area.id === targetArea.id)
    const copy = cloneScreenshotArea(source, {
      name: editorClipboard.pasteCount === 1
        ? `${source.name} copy`
        : `${source.name} copy ${editorClipboard.pasteCount}`,
    })
    const areas = [...currentSet.current.areas]
    areas.splice(sourceIndex + 1, 0, copy)
    const next = { ...currentSet.current, areas }
    setDraft(next)
    setSelectedAreaId(copy.id)
    setSelectedElementId(null)
    setAssetPickerOpen(false)
    setDevicePickerOpen(false)
    setContextMenu(null)
    void persist(next)
  }

  function setDraft(next: ScreenshotSet, historyGroupKey?: string, record = true) {
    if (record && historyGroupKey !== undefined) recordHistory(historyGroupKey)
    else if (record && next !== currentSet.current) recordHistory()
    currentSet.current = next
    setWorkingSet(next)
  }

  function schedulePersist() {
    if (persistTimer.current) clearTimeout(persistTimer.current)
    setSaveState("saving")
    persistTimer.current = setTimeout(() => {
      persistTimer.current = null
      void persist()
    }, 350)
  }

  function persist(next = currentSet.current): Promise<void> {
    closeHistoryGroup()
    if (persistTimer.current) {
      clearTimeout(persistTimer.current)
      persistTimer.current = null
    }
    const revision = ++persistRevision.current
    const payload = structuredClone(next)
    setSaveState("saving")
    setError(null)
    const operation = persistQueue.current.catch(() => undefined).then(async () => {
      try {
        const saved = await request<ScreenshotSet>(`/api/sets/${payload.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (currentSet.current === next) {
          currentSet.current = saved
          setWorkingSet(saved)
          onSetChange(saved)
        }
        if (revision === persistRevision.current) setSaveState("saved")
      } catch (nextError) {
        if (revision === persistRevision.current) {
          setError(messageFor(nextError))
          setSaveState("error")
        }
      }
    })
    persistQueue.current = operation
    return operation
  }

  async function persistMockupSelection(elementId: string) {
    await persist()
    const area = currentSet.current.areas.find((candidate) => candidate.id === selectedAreaIdRef.current)
    if (area?.elements.some((element) => element.id === elementId)) setSelectedElementId(elementId)
  }

  function updateArea(areaId: string, update: (area: ScreenshotArea) => ScreenshotArea, historyGroupKey?: string): ScreenshotSet {
    const next = {
      ...currentSet.current,
      areas: currentSet.current.areas.map((area) => area.id === areaId ? update(area) : area),
    }
    setDraft(next, historyGroupKey)
    return next
  }

  function updateElement(areaId: string, elementId: string, update: (element: CanvasElement) => CanvasElement, historyGroupKey?: string): ScreenshotSet {
    return updateArea(areaId, (area) => ({
      ...area,
      elements: area.elements.map((element) => element.id === elementId ? update(element) : element),
    }), historyGroupKey)
  }

  function updateSelectedElement(change: Partial<CanvasElement>) {
    if (!selectedElement) return
    updateElement(
      selectedArea.id,
      selectedElement.id,
      (element) => ({ ...element, ...change } as CanvasElement),
      `inspector:${selectedArea.id}:${selectedElement.id}`,
    )
  }

  function nudgeSelectedElement(deltaX: number, deltaY: number) {
    const areaId = selectedAreaIdRef.current
    const elementId = selectedElementIdRef.current
    if (!elementId) return
    updateElement(
      areaId,
      elementId,
      (element) => ({ ...element, x: element.x + deltaX, y: element.y + deltaY }),
      `keyboard:nudge:${areaId}:${elementId}`,
    )
    schedulePersist()
  }

  function updateSelectedMockup(change: Partial<DeviceMockupElement>) {
    if (!selectedElement || selectedElement.type !== "mockup") return
    const elementId = selectedElement.id
    updateSelectedElement(change)
    requestAnimationFrame(() => {
      const area = currentSet.current.areas.find((candidate) => candidate.id === selectedAreaIdRef.current)
      if (area?.elements.some((element) => element.id === elementId)) setSelectedElementId(elementId)
    })
  }

  function previewSelectedElement(change: Partial<CanvasElement>) {
    if (!selectedElement) return
    const areaId = selectedArea.id
    const elementId = selectedElement.id
    setWorkingSet((current) => ({
      ...current,
      areas: current.areas.map((area) => area.id === areaId ? {
        ...area,
        elements: area.elements.map((element) => element.id === elementId ? { ...element, ...change } as CanvasElement : element),
      } : area),
    }))
  }

  function cancelSelectedElementPreview() {
    if (!selectedElementId) return
    const committedElement = currentSet.current.areas
      .find((area) => area.id === selectedArea.id)
      ?.elements.find((element) => element.id === selectedElementId)
    if (!committedElement) return
    setWorkingSet((current) => ({
      ...current,
      areas: current.areas.map((area) => area.id === selectedArea.id ? {
        ...area,
        elements: area.elements.map((element) => element.id === selectedElementId ? committedElement : element),
      } : area),
    }))
  }

  function changeElementFromCanvas(areaId: string, element: CanvasElement) {
    updateElement(areaId, element.id, () => element, `canvas:${areaId}:${element.id}`)
    setSelectedAreaId(areaId)
    setSelectedElementId(element.id)
    schedulePersist()
  }

  function addArea() {
    const sourceIndex = currentSet.current.areas.findIndex((area) => area.id === selectedAreaId)
    const nextNumber = currentSet.current.areas.length + 1
    const area: ScreenshotArea = {
      id: `area-${crypto.randomUUID()}`,
      name: `Screenshot ${nextNumber}`,
      background: selectedArea.background,
      elements: [],
    }
    const areas = [...currentSet.current.areas]
    areas.splice(sourceIndex + 1, 0, area)
    const next = { ...currentSet.current, areas }
    setDraft(next)
    setSelectedAreaId(area.id)
    setSelectedElementId(null)
    void persist(next)
  }

  function duplicateArea(areaId: string) {
    const index = currentSet.current.areas.findIndex((area) => area.id === areaId)
    const source = currentSet.current.areas[index]
    const area = cloneScreenshotArea(source, { name: `${source.name} copy` })
    const areas = [...currentSet.current.areas]
    areas.splice(index + 1, 0, area)
    const next = { ...currentSet.current, areas }
    setDraft(next)
    setSelectedAreaId(area.id)
    setSelectedElementId(null)
    void persist(next)
  }

  function moveArea(areaId: string, offset: number) {
    const index = currentSet.current.areas.findIndex((area) => area.id === areaId)
    const target = index + offset
    if (target < 0 || target >= currentSet.current.areas.length) return
    const areas = [...currentSet.current.areas]
    const [area] = areas.splice(index, 1)
    areas.splice(target, 0, area)
    const next = { ...currentSet.current, areas }
    setDraft(next)
    void persist(next)
  }

  function renameArea(areaId: string, name: string) {
    const currentArea = currentSet.current.areas.find((area) => area.id === areaId)
    if (!currentArea || currentArea.name === name) return
    const next = updateArea(areaId, (area) => ({ ...area, name }))
    void persist(next)
  }

  function deleteArea(areaId: string) {
    if (currentSet.current.areas.length === 1) return
    const index = currentSet.current.areas.findIndex((area) => area.id === areaId)
    const areas = currentSet.current.areas.filter((area) => area.id !== areaId)
    const next = { ...currentSet.current, areas }
    setDraft(next)
    setSelectedAreaId(areas[Math.min(index, areas.length - 1)].id)
    setSelectedElementId(null)
    setAreaPendingDeletionId(null)
    void persist(next)
  }

  function addText(areaId = selectedArea.id) {
    const element: TextElement = {
      id: `element-${crypto.randomUUID()}`,
      type: "text",
      text: "Double-click to edit",
      x: Math.round(workingSet.canvas.width * 0.1),
      y: Math.round(workingSet.canvas.height * 0.08),
      width: Math.round(workingSet.canvas.width * 0.8),
      height: Math.round(workingSet.canvas.height * 0.1),
      rotation: 0,
      opacity: 1,
      fontFamily: "Geist Variable",
      fontSize: Math.max(48, Math.round(workingSet.canvas.width * 0.08)),
      fontWeight: 700,
      color: "#ffffff",
      textAlign: "center",
    }
    addElement(areaId, element)
  }

  function addShape(areaId = selectedArea.id) {
    const element: ShapeElement = {
      id: `element-${crypto.randomUUID()}`,
      type: "shape",
      shape: "rectangle",
      x: Math.round(workingSet.canvas.width * 0.2),
      y: Math.round(workingSet.canvas.height * 0.3),
      width: Math.round(workingSet.canvas.width * 0.6),
      height: Math.round(workingSet.canvas.height * 0.2),
      rotation: 0,
      opacity: 1,
      fill: "#ffffff",
      cornerRadius: Math.round(workingSet.canvas.width * 0.025),
    }
    addElement(areaId, element)
  }

  function addElement(areaId: string, element: CanvasElement) {
    const next = updateArea(areaId, (area) => ({ ...area, elements: [...area.elements, element] }))
    setSelectedAreaId(areaId)
    setSelectedElementId(element.id)
    setAssetPickerOpen(false)
    setDevicePickerOpen(false)
    setArtworkPickerOpen(false)
    void persist(next)
  }

  function placeBuiltInArtwork(definition: BuiltInArtworkDefinition) {
    const maxWidth = workingSet.canvas.width * 0.58
    const maxHeight = workingSet.canvas.height * 0.28
    const graphicScale = Math.min(maxWidth / definition.width, maxHeight / definition.height)
    const width = Math.round(definition.width * graphicScale)
    const height = Math.round(definition.height * graphicScale)
    const element: ImageElement = {
      id: `element-${crypto.randomUUID()}`,
      type: "image",
      source: { kind: "builtin", id: definition.id },
      x: Math.round((workingSet.canvas.width - width) / 2),
      y: Math.round(workingSet.canvas.height * 0.12),
      width,
      height,
      rotation: 0,
      opacity: 1,
      fit: "contain",
      fill: "#ffffff",
    }
    addElement(selectedArea.id, element)
  }

  async function placeAsset(asset: Asset) {
    const areaId = selectedArea.id
    const maxWidth = workingSet.canvas.width * 0.82
    const maxHeight = workingSet.canvas.height * 0.72
    const dimensions = await imageDimensions(asset.url)
    const imageScale = Math.min(maxWidth / dimensions.width, maxHeight / dimensions.height)
    const width = Math.round(dimensions.width * imageScale)
    const height = Math.round(dimensions.height * imageScale)
    const element: ImageElement = {
      id: `element-${crypto.randomUUID()}`,
      type: "image",
      source: { kind: "asset", assetId: asset.id },
      x: Math.round((workingSet.canvas.width - width) / 2),
      y: Math.round((workingSet.canvas.height - height) / 2),
      width,
      height,
      rotation: 0,
      opacity: 1,
      fit: "contain",
    }
    addElement(areaId, element)
  }

  function placeDeviceMockup(mockup: DeviceMockup, assetId: string) {
    const asset = assetLookup.get(assetId)
    if (!asset) {
      setError("The selected screenshot is no longer available in the asset catalog.")
      return
    }
    const maxWidth = workingSet.canvas.width * 0.82
    const maxHeight = workingSet.canvas.height * 0.76
    const mockupScale = Math.min(maxWidth / mockup.width, maxHeight / mockup.height)
    const width = Math.round(mockup.width * mockupScale)
    const height = Math.round(mockup.height * mockupScale)
    const element: DeviceMockupElement = {
      id: `element-${crypto.randomUUID()}`,
      type: "mockup",
      mockupId: mockup.id,
      assetId,
      x: Math.round((workingSet.canvas.width - width) / 2),
      y: Math.round((workingSet.canvas.height - height) / 2),
      width,
      height,
      rotation: 0,
      opacity: 1,
    }
    addElement(selectedArea.id, element)
  }

  function deleteElement() {
    if (!selectedElementId) return
    const next = updateArea(selectedArea.id, (area) => ({
      ...area,
      elements: area.elements.filter((element) => element.id !== selectedElementId),
    }))
    setSelectedElementId(null)
    void persist(next)
  }

  function duplicateElement() {
    if (!selectedElement) return
    const copy = cloneCanvasElement(selectedElement, {
      offsetX: Math.round(workingSet.canvas.width * 0.025),
      offsetY: Math.round(workingSet.canvas.width * 0.025),
    })
    const next = updateArea(selectedArea.id, (area) => {
      const elements = [...area.elements]
      elements.splice(selectedElementIndex + 1, 0, copy)
      return { ...area, elements }
    })
    setSelectedElementId(copy.id)
    void persist(next)
  }

  function moveElementLayer(offset: number) {
    if (!selectedElement) return
    const target = selectedElementIndex + offset
    if (target < 0 || target >= selectedArea.elements.length) return
    const next = updateArea(selectedArea.id, (area) => {
      const elements = [...area.elements]
      const [element] = elements.splice(selectedElementIndex, 1)
      elements.splice(target, 0, element)
      return { ...area, elements }
    })
    void persist(next)
  }

  function moveContextElement(targetIndex: number) {
    if (!contextMenu) return
    const area = currentSet.current.areas.find((candidate) => candidate.id === contextMenu.areaId)
    if (!area) return
    const sourceIndex = area.elements.findIndex((element) => element.id === contextMenu.elementId)
    const target = Math.min(Math.max(targetIndex, 0), area.elements.length - 1)
    if (sourceIndex < 0 || sourceIndex === target) return
    const next = updateArea(area.id, (currentArea) => {
      const elements = [...currentArea.elements]
      const [element] = elements.splice(sourceIndex, 1)
      elements.splice(target, 0, element)
      return { ...currentArea, elements }
    })
    void persist(next)
  }

  function updateContextElement(change: CanvasElementChange) {
    if (!contextMenu) return
    updateElement(
      contextMenu.areaId,
      contextMenu.elementId,
      (element) => ({ ...element, ...change } as CanvasElement),
      `context:${contextMenu.areaId}:${contextMenu.elementId}`,
    )
    schedulePersist()
  }

  async function exportSet() {
    if (exportProgress) return
    setError(null)
    setExportProgress({ completed: 0, total: workingSet.areas.length })
    try {
      await exportScreenshotSet(workingSet, assetLookup, mockupLookup, setExportProgress)
    } catch (exportError) {
      setError(`Export failed: ${messageFor(exportError)}`)
    } finally {
      setExportProgress(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-[68px] shrink-0 items-center gap-4 border-b px-5">
        <div className="flex min-w-0 items-center gap-5">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-lg font-semibold">{workingSet.name}</h1>
              <Badge variant="secondary">{workingSet.locale}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{workingSet.device} · {workingSet.canvas.width} × {workingSet.canvas.height} px</p>
          </div>
          <div className="flex shrink-0 items-center rounded-lg border bg-background p-0.5">
            <Button aria-label="Undo" disabled={!canUndo} size="icon-sm" title="Undo (Command/Ctrl Z)" variant="ghost" onClick={undo}>
              <Undo2 className="size-4" />
            </Button>
            <Button aria-label="Redo" disabled={!canRedo} size="icon-sm" title="Redo (Command/Ctrl Shift Z)" variant="ghost" onClick={redo}>
              <Redo2 className="size-4" />
            </Button>
          </div>
          <SaveState state={saveState} />
        </div>
        <Button className="ml-auto" disabled={exportProgress !== null} onClick={() => void exportSet()}>
          {exportProgress ? <LoaderCircle className="animate-spin" /> : <Download />}
          {exportProgress ? `Exporting ${exportProgress.completed}/${exportProgress.total}` : "Export"}
        </Button>
      </header>

      {error && <Alert className="shrink-0 rounded-none border-x-0 border-t-0 px-5 py-2" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <ResizablePanelGroup className="min-h-0 flex-1" id="set-editor-shell" orientation="horizontal">
        <ResizablePanel id="set-canvas" minSize={420}>
        <main className="relative h-full min-h-0 overflow-hidden bg-[#eeeeef]">
          <div className="absolute left-3 top-3 z-20" ref={assetPickerRef}>
            <div className="flex flex-col gap-1 rounded-lg border bg-background/95 p-1 shadow-md backdrop-blur-sm">
              <CanvasToolButton label="Add text to selected screenshot" onClick={() => addText()}><Type className="size-4" /></CanvasToolButton>
              <CanvasToolButton label="Add rectangle to selected screenshot" onClick={() => addShape()}><Square className="size-4" /></CanvasToolButton>
              <CanvasToolButton active={artworkPickerOpen} label="Add built-in artwork" onClick={() => {
                setAssetPickerOpen(false)
                setDevicePickerOpen(false)
                setArtworkPickerOpen((open) => !open)
              }}><Sparkles className="size-4" /></CanvasToolButton>
              <CanvasToolButton active={assetPickerOpen} label="Add image from assets" onClick={() => {
                setDevicePickerOpen(false)
                setArtworkPickerOpen(false)
                setAssetPickerOpen((open) => !open)
              }}><ImageIcon className="size-4" /></CanvasToolButton>
              <CanvasToolButton active={devicePickerOpen} label="Add device mockup" onClick={() => {
                setAssetPickerOpen(false)
                setArtworkPickerOpen(false)
                if (!devicePickerOpen && pendingMockup) {
                  const current = screenshotAssets.find((asset) => asset.id === pendingMockupAssetId)
                  const preferred = screenshotAssets.find((asset) => asset.deviceType === pendingMockup.platform)
                  if (preferred && current?.deviceType !== pendingMockup.platform) setPendingMockupAssetId(preferred.id)
                }
                setDevicePickerOpen((open) => !open)
              }}><Smartphone className="size-4" /></CanvasToolButton>
              <span className="mx-1 my-0.5 h-px bg-border" />
              <CanvasToolButton label="Add screenshot" onClick={addArea}><Plus className="size-4" /></CanvasToolButton>
            </div>

            <ArtworkPicker
              open={artworkPickerOpen}
              onClose={() => setArtworkPickerOpen(false)}
              onSelect={placeBuiltInArtwork}
            />

            {assetPickerOpen && (
              <div className="absolute left-12 top-0 flex max-h-[min(520px,calc(100vh-160px))] w-64 flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl">
                <div className="flex shrink-0 items-start justify-between border-b px-3 py-2.5">
                  <div>
                    <p className="text-sm font-semibold">Add image</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Place an asset on this screenshot</p>
                  </div>
                  <Button aria-label="Close asset picker" className="text-muted-foreground" size="icon-sm" type="button" variant="ghost" onClick={() => setAssetPickerOpen(false)}><X className="size-3.5" /></Button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-2.5">
                  {allAssets.length === 0 ? (
                    <Button className="h-auto w-full flex-col border-dashed p-5 text-center text-xs whitespace-normal text-muted-foreground" type="button" variant="outline" onClick={onOpenAssets}>
                      <ImagePlus className="mx-auto mb-2 size-5" />Add assets to the catalog
                    </Button>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {allAssets.map((asset) => (
                        <Button className="group aspect-square h-auto overflow-hidden rounded-lg bg-muted/40 p-0 hover:border-foreground/30" key={asset.id} title={`Place ${asset.name}`} type="button" variant="outline" onClick={() => void placeAsset(asset)}>
                          <img className="h-full w-full object-contain transition-transform group-hover:scale-[1.03]" src={asset.url} alt={asset.name} />
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="shrink-0 border-t p-2.5">
                  <Button className="w-full" size="sm" variant="ghost" onClick={onOpenAssets}>Open asset catalog</Button>
                </div>
              </div>
            )}

            {devicePickerOpen && (
              <div className="absolute left-12 top-0 flex max-h-[min(620px,calc(100vh-160px))] w-72 flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl">
                <div className="flex shrink-0 items-start justify-between border-b px-3 py-2.5">
                  <div>
                    <p className="text-sm font-semibold">Add device mockup</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Choose a frame and its screenshot</p>
                  </div>
                  <Button aria-label="Close device picker" size="icon-xs" type="button" variant="ghost" onClick={() => setDevicePickerOpen(false)}>
                    <X className="size-3.5" />
                  </Button>
                </div>
                <ScrollArea className="min-h-0 flex-1 overflow-hidden">
                  <div className="space-y-4 p-3">
                    <div>
                      <p className="mb-2 text-xs font-medium">Frame</p>
                      {pendingMockup ? (
                        <Button className="h-auto w-full justify-start gap-3 overflow-hidden p-2 text-left" type="button" variant="outline" onClick={() => setMockupCatalogOpen(true)}>
                          <span className="grid size-16 shrink-0 place-items-center rounded-md bg-muted/60 p-1.5">
                            <img alt="" className="max-h-full max-w-full object-contain" src={pendingMockup.thumbnailUrl} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">{pendingMockup.name}</span>
                            <span className="mt-1 block truncate text-[10px] text-muted-foreground">{pendingMockup.description}</span>
                            <span className="mt-2 block text-[10px] font-medium">Browse {mockupCatalog.mockups.length} frames</span>
                          </span>
                        </Button>
                      ) : (
                        <Button className="h-auto w-full justify-start p-4 text-xs" type="button" variant="outline" onClick={() => setMockupCatalogOpen(true)}>
                          No device frames available. Import a mockup bundle.
                        </Button>
                      )}
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-medium">Screenshot</p>
                      {screenshotAssets.length === 0 ? (
                        <Button className="h-auto w-full flex-col border-dashed p-5 text-center text-xs whitespace-normal text-muted-foreground" type="button" variant="outline" onClick={onOpenAssets}>
                          <ImagePlus className="mx-auto mb-2 size-5" />Add raw screenshots first
                        </Button>
                      ) : (
                        <div className="space-y-3">
                          {pendingMockup && pendingScreenshotGroups.recommended.length > 0 && (
                            <ScreenshotChoiceGroup
                              assets={pendingScreenshotGroups.recommended}
                              label={`Recommended · ${devicePlatformLabel(pendingMockup.platform)}`}
                              selectedId={pendingMockupAssetId}
                              onSelect={setPendingMockupAssetId}
                            />
                          )}
                          {pendingScreenshotGroups.other.length > 0 && (
                            <ScreenshotChoiceGroup
                              assets={pendingScreenshotGroups.other}
                              label={pendingScreenshotGroups.recommended.length > 0 ? "Other screenshots" : "Screenshots"}
                              selectedId={pendingMockupAssetId}
                              onSelect={setPendingMockupAssetId}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </ScrollArea>
                <div className="relative z-10 shrink-0 border-t bg-popover p-3">
                  <Button
                    className="w-full"
                    disabled={!pendingMockup || !pendingMockupAssetId}
                    size="sm"
                    type="button"
                    onClick={() => {
                      if (pendingMockup && pendingMockupAssetId) placeDeviceMockup(pendingMockup, pendingMockupAssetId)
                    }}
                  >
                    Add mockup
                  </Button>
                </div>
              </div>
            )}
            <DeviceMockupPicker
              open={mockupCatalogOpen}
              value={pendingMockupId}
              onOpenChange={setMockupCatalogOpen}
              onValueChange={(mockupId) => {
                setPendingMockupId(mockupId)
                const platform = deviceMockupById(mockupCatalog, mockupId)?.platform
                const current = screenshotAssets.find((asset) => asset.id === pendingMockupAssetId)
                const preferred = platform && screenshotAssets.find((asset) => asset.deviceType === platform)
                if (preferred && current?.deviceType !== platform) setPendingMockupAssetId(preferred.id)
              }}
            />
          </div>

          <div
            className="h-full overflow-auto"
            style={{ backgroundImage: "radial-gradient(#d2d2d5 0.75px, transparent 0.75px)", backgroundSize: "16px 16px" }}
            onPointerDown={() => setSelectedElementId(null)}
          >
            <div
              className="flex min-w-max items-start pb-12 pl-20 pr-7 pt-7"
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) setSelectedElementId(null)
                event.stopPropagation()
              }}
            >
              {workingSet.areas.map((area, index) => {
                const active = area.id === selectedArea.id
                return (
                  <Fragment key={area.id}>
                    {index > 0 && (
                      <div className={cn("relative shrink-0 self-stretch transition-[width]", continuousPreview ? "w-0" : "w-7")}>
                        <Button
                          aria-label={continuousPreview ? "Separate screenshots" : "Preview screenshots side by side"}
                          aria-pressed={continuousPreview}
                          className="group/seam absolute inset-y-0 left-1/2 z-30 h-full w-7 -translate-x-1/2 rounded-none border-0 bg-transparent p-0 shadow-none hover:bg-transparent dark:hover:bg-transparent active:translate-y-0"
                          size="icon-xs"
                          title={continuousPreview ? "Return to spaced screenshots" : "Snap screenshots side by side"}
                          variant="ghost"
                          onClick={() => setContinuousPreview((enabled) => !enabled)}
                        >
                          <span className={cn(
                            "absolute top-1 grid size-6 place-items-center rounded-md text-muted-foreground/45 transition-colors group-hover/seam:bg-background/80 group-hover/seam:text-muted-foreground group-focus-visible/seam:bg-background/80 group-focus-visible/seam:text-foreground",
                            continuousPreview && "bg-background/60 text-muted-foreground/70",
                          )}>
                            <Columns2 className="size-3.5" />
                          </span>
                        </Button>
                      </div>
                    )}
                    <article className="shrink-0">
                      <div className="mb-2 flex h-8 items-center justify-center gap-0.5 text-muted-foreground">
                        <ToolbarButton label="Duplicate screenshot" onClick={() => duplicateArea(area.id)}><Copy className="size-4" /></ToolbarButton>
                        <ToolbarButton label="Delete screenshot" disabled={workingSet.areas.length === 1} onClick={() => setAreaPendingDeletionId(area.id)}><Trash2 className="size-4" /></ToolbarButton>
                        <ToolbarButton label="Move screenshot left" disabled={index === 0} onClick={() => moveArea(area.id, -1)}><ArrowLeft className="size-4" /></ToolbarButton>
                        <ToolbarButton label="Move screenshot right" disabled={index === workingSet.areas.length - 1} onClick={() => moveArea(area.id, 1)}><ArrowRight className="size-4" /></ToolbarButton>
                      </div>

                      <ContextMenu
                        onOpenChange={(open) => {
                          if (!open && contextMenu?.areaId === area.id) setContextMenu(null)
                        }}
                      >
                        <ContextMenuTrigger
                          render={(
                            <div
                              className={cn("transition-shadow", active && !continuousPreview && "ring-2 ring-[#1683ff] ring-offset-2 ring-offset-[#eeeeef]")}
                              onClick={(event) => event.stopPropagation()}
                            />
                          )}
                        >
                          <FabricShotCanvas
                            active={active}
                            area={area}
                            assetLookup={assetLookup}
                            mockupLookup={mockupLookup}
                            canvasSize={workingSet.canvas}
                            continuousPreview={continuousPreview}
                            zoom={canvasZoom}
                            selectedElementId={active ? selectedElementId : null}
                            onActivate={() => setSelectedAreaId(area.id)}
                            onChange={(element) => changeElementFromCanvas(area.id, element)}
                            onContextMenu={(elementId) => {
                              if (!elementId) {
                                setContextMenu(null)
                                return
                              }
                              setSelectedAreaId(area.id)
                              setSelectedElementId(elementId)
                              setContextMenu({ areaId: area.id, elementId })
                            }}
                            onSelect={(elementId) => {
                              setSelectedAreaId(area.id)
                              setSelectedElementId(elementId)
                            }}
                          />
                        </ContextMenuTrigger>
                        {contextMenu?.areaId === area.id && contextArea && contextElement && (
                          <ObjectContextMenu
                            areaLength={contextArea.elements.length}
                            element={contextElement}
                            elementIndex={contextElementIndex}
                            usedColors={documentColors}
                            onMove={moveContextElement}
                            onUpdate={updateContextElement}
                          />
                        )}
                      </ContextMenu>

                      <ScreenshotFooter
                        area={area}
                        canvasSize={workingSet.canvas}
                        index={index}
                        onActivate={() => setSelectedAreaId(area.id)}
                        onRename={(name) => renameArea(area.id, name)}
                      />
                    </article>
                  </Fragment>
                )
              })}
            </div>
          </div>

          <div className="absolute bottom-3 right-3 z-40 flex items-center rounded-lg border bg-background/95 p-0.5 shadow-md backdrop-blur-sm">
            <Button
              aria-label="Zoom out"
              disabled={canvasZoom <= MIN_CANVAS_ZOOM}
              size="icon-sm"
              title="Zoom out (Command/Ctrl −)"
              variant="ghost"
              onClick={() => setCanvasZoom((current) => clampCanvasZoom(current - CANVAS_ZOOM_STEP))}
            >
              <Minus className="size-4" />
            </Button>
            <Button
              aria-label={`Reset zoom to 100%, currently ${Math.round(canvasZoom * 100)}%`}
              className="min-w-14 px-2 tabular-nums"
              size="sm"
              title="Reset zoom (Command/Ctrl 0)"
              variant="ghost"
              onClick={() => setCanvasZoom(1)}
            >
              {Math.round(canvasZoom * 100)}%
            </Button>
            <Button
              aria-label="Zoom in"
              disabled={canvasZoom >= MAX_CANVAS_ZOOM}
              size="icon-sm"
              title="Zoom in (Command/Ctrl +)"
              variant="ghost"
              onClick={() => setCanvasZoom((current) => clampCanvasZoom(current + CANVAS_ZOOM_STEP))}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </main>
        </ResizablePanel>

        <ResizableHandle aria-label="Resize editor sidebar" />

        <ResizablePanel
          defaultSize={300}
          groupResizeBehavior="preserve-pixel-size"
          id="editor-sidebar"
          maxSize={520}
          minSize={260}
        >
        <aside className="h-full min-h-0 bg-background">
          <ResizablePanelGroup id="editor-sidebar-sections" orientation="vertical">
          <ResizablePanel defaultSize="38" id="layers-panel" maxSize="70" minSize={116}>
          <section className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Layers</h2>
              <span className="text-[11px] tabular-nums text-muted-foreground">{selectedArea.elements.length}</span>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="px-2 pb-3 pt-1">
                {selectedArea.elements.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">No layers yet</p>
                ) : (
                  <div className="space-y-0.5">
                    {[...selectedArea.elements].reverse().map((element) => (
                      <Button
                        aria-pressed={element.id === selectedElementId}
                        className="w-full justify-start px-2 text-xs"
                        key={element.id}
                        size="default"
                        type="button"
                        variant={element.id === selectedElementId ? "secondary" : "ghost"}
                        onClick={() => setSelectedElementId(element.id)}
                      >
                        <LayerIcon element={element} />
                        <span className="min-w-0 flex-1 truncate text-left">{elementLabel(element, assetLookup, mockupCatalog)}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </section>
          </ResizablePanel>

          <ResizableHandle aria-label="Resize layers panel" />

          <ResizablePanel id="inspector-panel" minSize={180}>
          <ScrollArea className="h-full min-h-0">
            <div>
              {selectedElement ? (
                <InspectorSection key={selectedElement.id} title={elementTitle(selectedElement)}>
                  <div className="flex items-center rounded-lg border bg-muted/20 p-1">
                    <InspectorAction label="Duplicate layer" onClick={duplicateElement}><Copy className="size-4" /></InspectorAction>
                    <InspectorAction label="Send backward" disabled={selectedElementIndex === 0} onClick={() => moveElementLayer(-1)}><ArrowDown className="size-4" /></InspectorAction>
                    <InspectorAction label="Bring forward" disabled={selectedElementIndex === selectedArea.elements.length - 1} onClick={() => moveElementLayer(1)}><ArrowUp className="size-4" /></InspectorAction>
                    <Separator className="mx-1 ml-auto h-5" orientation="vertical" />
                    <InspectorAction className="text-destructive hover:text-destructive" label="Delete layer" onClick={deleteElement}><Trash2 className="size-4" /></InspectorAction>
                  </div>

                  {selectedElement.type === "text" && (
                    <TextInspector
                      element={selectedElement}
                      usedColors={documentColors}
                      preview={previewSelectedElement}
                      cancelPreview={cancelSelectedElementPreview}
                      update={updateSelectedElement}
                      persist={() => void persist()}
                    />
                  )}
                  {selectedElement.type === "image" && (
                    <ImageInspector
                      element={selectedElement}
                      assetLookup={assetLookup}
                      usedColors={documentColors}
                      update={updateSelectedElement}
                      persist={() => void persist()}
                    />
                  )}
                  {selectedElement.type === "mockup" && (
                    <DeviceMockupInspector
                      element={selectedElement}
                      screenshots={screenshotAssets}
                      update={updateSelectedMockup}
                      persist={() => void persistMockupSelection(selectedElement.id)}
                    />
                  )}
                  {selectedElement.type === "shape" && (
                    <ShapeInspector element={selectedElement} usedColors={documentColors} update={updateSelectedElement} persist={() => void persist()} />
                  )}

                  <GeometryInspector element={selectedElement} update={updateSelectedElement} persist={() => void persist()} />
                  <OpacityInspector element={selectedElement} update={updateSelectedElement} persist={() => void persist()} />
                </InspectorSection>
              ) : (
                <InspectorSection
                  key={selectedArea.id}
                  action={(
                    <Button
                      aria-label="Delete screenshot"
                      className="text-destructive hover:text-destructive"
                      disabled={workingSet.areas.length === 1}
                      size="icon-xs"
                      title={workingSet.areas.length === 1 ? "A set must contain at least one screenshot" : "Delete this screenshot"}
                      type="button"
                      variant="ghost"
                      onClick={() => setAreaPendingDeletionId(selectedArea.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                  title={`Screenshot ${workingSet.areas.findIndex((area) => area.id === selectedArea.id) + 1}`}
                >
                  <Field label="Name">
                    <Input value={selectedArea.name} onChange={(event) => updateArea(selectedArea.id, (area) => ({ ...area, name: event.target.value }), `area:${selectedArea.id}`)} onBlur={() => void persist()} />
                  </Field>
                  <Field label="Background">
                    <ColorPicker
                      label="Screenshot background color"
                      usedColors={documentColors}
                      value={selectedArea.background}
                      onValueChange={(background) => updateArea(selectedArea.id, (area) => ({ ...area, background }), `area:${selectedArea.id}`)}
                      onValueCommit={() => void persist()}
                    />
                  </Field>
                  <p className="text-xs leading-relaxed text-muted-foreground">Select an object to edit it. Drag to move, use the handles to resize, or double-click text to edit.</p>
                </InspectorSection>
              )}

            </div>
          </ScrollArea>
          </ResizablePanel>
          </ResizablePanelGroup>
        </aside>
        </ResizablePanel>
      </ResizablePanelGroup>

      <AlertDialog open={Boolean(areaPendingDeletionId)} onOpenChange={(open) => { if (!open) setAreaPendingDeletionId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this screenshot?</AlertDialogTitle>
            <AlertDialogDescription>The screenshot and all of its layers will be removed from this set. Catalog assets are kept.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="outline" />}>Cancel</AlertDialogCancel>
            <Button disabled={!areaPendingDeletionId} variant="destructive" onClick={() => { if (areaPendingDeletionId) deleteArea(areaPendingDeletionId) }}>Delete screenshot</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}

function ObjectContextMenu({
  areaLength,
  element,
  elementIndex,
  usedColors,
  onMove,
  onUpdate,
}: {
  areaLength: number
  element: CanvasElement
  elementIndex: number
  usedColors: string[]
  onMove: (targetIndex: number) => void
  onUpdate: (change: CanvasElementChange) => void
}) {
  const opacity = Math.round(element.opacity * 100)

  return (
    <ContextMenuContent
      aria-label="Object actions"
      className="w-60 p-1.5"
      sideOffset={4}
    >
      <ContextMenuGroup>
        <ContextMenuLabel className="px-2 py-1.5 text-[11px] uppercase tracking-wider">{elementTitle(element)}</ContextMenuLabel>
        <ContextMenuItem className="h-8 gap-2 px-2 text-xs" disabled={elementIndex === areaLength - 1} onClick={() => onMove(areaLength - 1)}><ChevronsUp />Bring to front</ContextMenuItem>
        <ContextMenuItem className="h-8 gap-2 px-2 text-xs" disabled={elementIndex === areaLength - 1} onClick={() => onMove(elementIndex + 1)}><ArrowUp />Bring forward</ContextMenuItem>
        <ContextMenuItem className="h-8 gap-2 px-2 text-xs" disabled={elementIndex === 0} onClick={() => onMove(elementIndex - 1)}><ArrowDown />Send backward</ContextMenuItem>
        <ContextMenuItem className="h-8 gap-2 px-2 text-xs" disabled={elementIndex === 0} onClick={() => onMove(0)}><ChevronsDown />Send to back</ContextMenuItem>
      </ContextMenuGroup>

      {element.type === "text" && (
        <>
          <ContextMenuSub>
            <ContextMenuSubTrigger className="h-8 gap-2 px-2 text-xs">
              {element.textAlign === "left" ? <AlignLeft /> : element.textAlign === "right" ? <AlignRight /> : <AlignCenter />}
              Text alignment
              <ContextMenuShortcut className="mr-3 normal-case tracking-normal">{textAlignLabel(element.textAlign)}</ContextMenuShortcut>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-40 p-1.5">
              <ContextMenuRadioGroup value={element.textAlign} onValueChange={(textAlign) => onUpdate({ textAlign: textAlign as TextElement["textAlign"] })}>
                <ContextMenuRadioItem className="h-8 gap-2 px-2 text-xs" value="left"><AlignLeft />Left</ContextMenuRadioItem>
                <ContextMenuRadioItem className="h-8 gap-2 px-2 text-xs" value="center"><AlignCenter />Center</ContextMenuRadioItem>
                <ContextMenuRadioItem className="h-8 gap-2 px-2 text-xs" value="right"><AlignRight />Right</ContextMenuRadioItem>
              </ContextMenuRadioGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <div className="flex items-center justify-between px-2 py-1 text-xs">
            <span>Text color</span>
            <ColorPicker compact label="Text color" usedColors={usedColors} value={element.color} onValueChange={(color) => onUpdate({ color })} />
          </div>
        </>
      )}

      {element.type === "shape" && (
        <>
          <ContextMenuSeparator />
          <div className="flex items-center justify-between px-2 py-1 text-xs">
            <span>Fill color</span>
            <ColorPicker compact label="Fill color" usedColors={usedColors} value={element.fill} onValueChange={(fill) => onUpdate({ fill })} />
          </div>
          <label className="flex items-center justify-between gap-3 px-2 py-1 text-xs">
            <span>Corner radius</span>
            <Input className="h-7 w-20 text-right text-xs" min={0} type="number" value={Math.round(element.cornerRadius)} onChange={(event) => onUpdate({ cornerRadius: Math.max(0, Number(event.target.value)) })} />
          </label>
        </>
      )}

      <ContextMenuSeparator />
      <div className="space-y-2 px-2 pb-2 pt-1.5 text-xs" onKeyDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span>Opacity</span>
          <span className="tabular-nums text-muted-foreground">{opacity}%</span>
        </div>
        <Slider aria-label="Opacity" max={100} min={0} value={[opacity]} onValueChange={(value) => onUpdate({ opacity: (typeof value === "number" ? value : value[0]) / 100 })} />
      </div>
    </ContextMenuContent>
  )
}

function TextInspector({ element, usedColors, preview, cancelPreview, update, persist }: {
  element: TextElement
  usedColors: string[]
  preview: (change: Partial<TextElement>) => void
  cancelPreview: () => void
  update: (change: Partial<TextElement>) => void
  persist: () => void
}) {
  const [fontWeights, setFontWeights] = useState<FontWeight[]>(FONT_WEIGHTS)

  useEffect(() => {
    let cancelled = false
    if (element.fontFamily === LOCAL_FONT_FAMILY) {
      setFontWeights([400, 600, 700, 800])
      return
    }
    void getBunnyFontCatalog()
      .then((fonts) => {
        const font = fonts.find((candidate) => candidate.familyName === element.fontFamily)
        if (!cancelled) setFontWeights(font?.weights ?? FONT_WEIGHTS)
      })
      .catch(() => {
        if (!cancelled) setFontWeights(FONT_WEIGHTS)
      })
    return () => {
      cancelled = true
    }
  }, [element.fontFamily])

  const selectableWeights = fontWeights.includes(element.fontWeight)
    ? fontWeights
    : [...fontWeights, element.fontWeight].sort((left, right) => left - right)

  return (
    <>
      <Field label="Text">
        <Textarea className="min-h-20 resize-y" value={element.text} onChange={(event) => update({ text: event.target.value })} onBlur={persist} />
      </Field>
      <Field label="Font">
        <BunnyFontPicker
          value={element.fontFamily}
          onCancel={cancelPreview}
          onPreview={(font) => {
            const fontWeight = closestFontWeight(font.weights, element.fontWeight)
            setFontWeights(font.weights)
            preview({ fontFamily: font.familyName, fontWeight })
            void loadBunnyFont(font.familyName, fontWeight).catch(() => undefined)
          }}
          onSelect={(font) => {
            const fontWeight = closestFontWeight(font.weights, element.fontWeight)
            setFontWeights(font.weights)
            update({ fontFamily: font.familyName, fontWeight })
            void loadBunnyFont(font.familyName, fontWeight).catch(() => undefined)
            setTimeout(persist)
          }}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Font size" min={1} value={element.fontSize} onChange={(fontSize) => update({ fontSize })} onBlur={persist} />
        <Field label="Weight">
          <Select
            value={element.fontWeight}
            onValueChange={(fontWeight) => {
              if (fontWeight === null) return
              update({ fontWeight })
              setTimeout(persist)
            }}
          >
            <SelectTrigger className="w-full"><SelectValue>{fontWeightLabel(element.fontWeight)}</SelectValue></SelectTrigger>
            <SelectContent>
              {selectableWeights.map((weight) => <SelectItem key={weight} value={weight}>{fontWeightLabel(weight)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Color">
          <ColorPicker label="Text color" usedColors={usedColors} value={element.color} onValueChange={(color) => update({ color })} onValueCommit={persist} />
        </Field>
        <Field label="Align">
          <Select
            value={element.textAlign}
            onValueChange={(textAlign) => {
              if (textAlign === null) return
              update({ textAlign })
              setTimeout(persist)
            }}
          >
            <SelectTrigger className="w-full"><SelectValue>{textAlignLabel(element.textAlign)}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Center</SelectItem>
              <SelectItem value="right">Right</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Line height">
        <InputGroup>
          <InputGroupInput
            aria-label="Line height in pixels"
            min={1}
            placeholder={String(Math.round(element.fontSize * DEFAULT_TEXT_LINE_HEIGHT_RATIO))}
            step={1}
            type="number"
            value={element.lineHeight ?? ""}
            onBlur={persist}
            onChange={(event) => {
              const lineHeight = event.target.value === "" ? undefined : Math.max(1, Number(event.target.value))
              update({ lineHeight })
            }}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>px</InputGroupText>
            <InputGroupButton
              aria-label="Use automatic line height"
              aria-pressed={element.lineHeight === undefined}
              variant={element.lineHeight === undefined ? "secondary" : "ghost"}
              onClick={() => {
                update({ lineHeight: undefined })
                setTimeout(persist)
              }}
            >
              Auto
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
    </>
  )
}

function fontWeightLabel(weight: FontWeight): string {
  if (weight === 400) return "Regular"
  if (weight === 600) return "Semibold"
  if (weight === 700) return "Bold"
  if (weight === 800) return "Extra bold"
  if (weight === 900) return "Black"
  return String(weight)
}

function textAlignLabel(textAlign: TextElement["textAlign"]): string {
  return textAlign[0].toUpperCase() + textAlign.slice(1)
}

function ScreenshotChoiceGroup({ assets, label, selectedId, onSelect }: {
  assets: Asset[]
  label: string
  selectedId: string | null
  onSelect: (assetId: string) => void
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        {assets.map((asset) => (
          <Button
            aria-label={`Use ${asset.name}`}
            aria-pressed={selectedId === asset.id}
            className={cn(
              "relative aspect-square h-auto overflow-hidden rounded-lg bg-muted/40 p-0 hover:border-foreground/30 active:translate-y-0",
              selectedId === asset.id && "border-foreground ring-1 ring-foreground",
            )}
            key={asset.id}
            title={`${asset.name} · ${asset.deviceType === "unknown" || !asset.deviceType ? "Unknown device" : devicePlatformLabel(asset.deviceType)}`}
            type="button"
            variant="outline"
            onClick={() => onSelect(asset.id)}
          >
            <img alt="" className="h-full w-full object-cover" src={asset.url} />
          </Button>
        ))}
      </div>
    </div>
  )
}

function ScreenshotSelectItem({ asset }: { asset: Asset }) {
  return (
    <SelectItem value={asset.id}>
      <img alt="" className="size-7 rounded bg-muted object-cover" src={asset.url} />
      <span className="max-w-48 truncate text-xs">{asset.name}</span>
    </SelectItem>
  )
}

function partitionScreenshots(screenshots: Asset[], platform?: DevicePlatform) {
  if (!platform) return { recommended: [], other: screenshots }
  return {
    recommended: screenshots.filter((asset) => asset.deviceType === platform),
    other: screenshots.filter((asset) => asset.deviceType !== platform),
  }
}

function devicePlatformLabel(platform: DevicePlatform): string {
  return { iphone: "iPhone", ipad: "iPad", mac: "Mac", watch: "Watch" }[platform]
}

function ImageInspector({ element, assetLookup, usedColors, update, persist }: {
  element: ImageElement
  assetLookup: Map<string, Asset>
  usedColors: string[]
  update: (change: Partial<ImageElement>) => void
  persist: () => void
}) {
  const definition = element.source.kind === "builtin" ? builtInArtworkById(element.source.id) : undefined
  const asset = element.source.kind === "asset" ? assetLookup.get(element.source.assetId) : undefined
  const name = definition?.name ?? asset?.name ?? "Missing image"
  const previewUrl = definition?.url ?? asset?.url

  function toggleColorize() {
    update({ fill: element.fill ? undefined : "#ffffff" })
    persist()
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border p-2">
        <span className="grid size-10 shrink-0 place-items-center rounded bg-muted/50 p-1.5">
          {previewUrl ? (
            element.fill ? (
              <span
                aria-hidden="true"
                className="size-full bg-current"
                style={{
                  color: element.fill ?? "#000000",
                  maskImage: `url(${previewUrl})`,
                  maskPosition: "center",
                  maskRepeat: "no-repeat",
                  maskSize: "contain",
                  WebkitMaskImage: `url(${previewUrl})`,
                  WebkitMaskPosition: "center",
                  WebkitMaskRepeat: "no-repeat",
                  WebkitMaskSize: "contain",
                }}
              />
            ) : <img alt="" className="size-full object-contain" src={previewUrl} />
          ) : <Sparkles className="size-4 text-muted-foreground" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs">{name}</span>
          {definition && <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{definition.attribution} · {definition.license}</span>}
        </span>
      </div>
      <Field label="Color">
        <div className="flex items-center gap-2">
          <Button aria-pressed={Boolean(element.fill)} size="sm" type="button" variant="outline" onClick={toggleColorize}>
            {element.fill ? "Use original" : "Colorize"}
          </Button>
          {element.fill && (
            <ColorPicker
              className="min-w-0 flex-1"
              label="Image fill color"
              usedColors={usedColors}
              value={element.fill}
              onValueChange={(fill) => update({ fill })}
              onValueCommit={persist}
            />
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">Colorizing replaces visible pixels while preserving transparency.</p>
      </Field>
    </>
  )
}

function DeviceMockupInspector({ element, screenshots, update, persist }: {
  element: DeviceMockupElement
  screenshots: Asset[]
  update: (change: Partial<DeviceMockupElement>) => void
  persist: () => void
}) {
  const { catalog } = useMockupCatalog()
  const [pickerOpen, setPickerOpen] = useState(false)
  const mockup = deviceMockupById(catalog, element.mockupId)
  const screenshot = screenshots.find((asset) => asset.id === element.assetId)
  const screenshotGroups = partitionScreenshots(screenshots, mockup?.platform)

  function changeMockup(mockupId: string) {
    const nextMockup = deviceMockupById(catalog, mockupId)
    if (!nextMockup) return
    const height = Math.round(element.width * nextMockup.height / nextMockup.width)
    update({
      mockupId,
      height,
      y: Math.round(element.y + (element.height - height) / 2),
    })
    setTimeout(persist)
  }

  return (
    <>
      <Field label="Frame">
        <Button className="h-auto w-full justify-start gap-2 p-2 text-left" type="button" variant="outline" onClick={() => setPickerOpen(true)}>
          {mockup ? <img alt="" className="size-12 rounded bg-muted object-contain" src={mockup.thumbnailUrl} /> : <Smartphone className="size-4" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">{mockup?.name ?? "Missing frame"}</span>
            {mockup && <span className="block truncate text-[10px] text-muted-foreground">{mockup.description}</span>}
          </span>
          <span className="text-[10px] text-muted-foreground">Change</span>
        </Button>
      </Field>
      <DeviceMockupPicker open={pickerOpen} value={element.mockupId} onOpenChange={setPickerOpen} onValueChange={changeMockup} />

      <Field label="Screenshot">
        <Select
          value={element.assetId}
          onValueChange={(assetId) => {
            if (assetId === null) return
            update({ assetId })
            setTimeout(persist)
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue>{screenshot?.name ?? "Missing screenshot"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {screenshotGroups.recommended.length > 0 && (
              <SelectGroup>
                <SelectLabel>Recommended · {mockup ? devicePlatformLabel(mockup.platform) : "Device"}</SelectLabel>
                {screenshotGroups.recommended.map((asset) => <ScreenshotSelectItem asset={asset} key={asset.id} />)}
              </SelectGroup>
            )}
            {screenshotGroups.other.length > 0 && (
              <SelectGroup>
                <SelectLabel>{screenshotGroups.recommended.length > 0 ? "Other screenshots" : "Screenshots"}</SelectLabel>
                {screenshotGroups.other.map((asset) => <ScreenshotSelectItem asset={asset} key={asset.id} />)}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      </Field>
    </>
  )
}

function ShapeInspector({ element, usedColors, update, persist }: {
  element: ShapeElement
  usedColors: string[]
  update: (change: Partial<ShapeElement>) => void
  persist: () => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Fill"><ColorPicker label="Shape fill color" usedColors={usedColors} value={element.fill} onValueChange={(fill) => update({ fill })} onValueCommit={persist} /></Field>
      <NumberField label="Corner radius" min={0} value={element.cornerRadius} onChange={(cornerRadius) => update({ cornerRadius })} onBlur={persist} />
    </div>
  )
}

function GeometryInspector({ element, update, persist }: {
  element: CanvasElement
  update: (change: Partial<CanvasElement>) => void
  persist: () => void
}) {
  const { catalog } = useMockupCatalog()
  const mockup = element.type === "mockup" ? deviceMockupById(catalog, element.mockupId) : undefined

  function updateWidth(width: number) {
    update(mockup
      ? { width, height: Math.max(1, Math.round(width * mockup.height / mockup.width)) }
      : { width })
  }

  function updateHeight(height: number) {
    update(mockup
      ? { width: Math.max(1, Math.round(height * mockup.width / mockup.height)), height }
      : { height })
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">Position and size</p>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={Math.round(element.x)} onChange={(x) => update({ x })} onBlur={persist} />
        <NumberField label="Y" value={Math.round(element.y)} onChange={(y) => update({ y })} onBlur={persist} />
        <NumberField label="Width" min={1} value={Math.round(element.width)} onChange={updateWidth} onBlur={persist} />
        {element.type !== "text" && <NumberField label="Height" min={1} value={Math.round(element.height)} onChange={updateHeight} onBlur={persist} />}
        <NumberField label="Rotation" value={Math.round(element.rotation)} onChange={(rotation) => update({ rotation })} onBlur={persist} />
      </div>
    </div>
  )
}

function OpacityInspector({ element, update, persist }: {
  element: CanvasElement
  update: (change: Partial<CanvasElement>) => void
  persist: () => void
}) {
  const percentage = Math.round(element.opacity * 100)
  const labelId = useId()
  return (
    <ShadcnField aria-labelledby={labelId} className="gap-1.5">
      <FieldLabel className="text-xs" id={labelId}>Opacity · {percentage}%</FieldLabel>
      <Slider
        aria-labelledby={labelId}
        max={100}
        min={0}
        value={[percentage]}
        onValueChange={(value) => update({ opacity: (typeof value === "number" ? value : value[0]) / 100 })}
        onValueCommitted={persist}
      />
    </ShadcnField>
  )
}

function NumberField({ label, value, min, onChange, onBlur }: {
  label: string
  value: number
  min?: number
  onChange: (value: number) => void
  onBlur: () => void
}) {
  const inputId = useId()
  const [draft, setDraft] = useState(String(value))

  useEffect(() => setDraft(String(value)), [value])

  function applyDraft(): boolean {
    if (draft.trim() === "") return false
    const next = Number(draft)
    if (!Number.isFinite(next) || (min !== undefined && next < min)) return false
    onChange(next)
    return true
  }

  function commit() {
    if (!applyDraft()) setDraft(String(value))
    onBlur()
  }

  return (
    <ShadcnField className="gap-1.5">
      <FieldLabel className="text-xs" htmlFor={inputId}>{label}</FieldLabel>
      <Input
        id={inputId}
        min={min}
        type="number"
        value={draft}
        onBlur={commit}
        onChange={(event) => {
          const nextDraft = event.target.value
          setDraft(nextDraft)
          const next = Number(nextDraft)
          if (nextDraft.trim() !== "" && Number.isFinite(next) && (min === undefined || next >= min)) onChange(next)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
          if (event.key === "Escape") {
            setDraft(String(value))
            event.currentTarget.blur()
          }
        }}
      />
    </ShadcnField>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const labelId = useId()
  return (
    <ShadcnField aria-labelledby={labelId} className="gap-1.5">
      <FieldLabel className="text-xs" id={labelId}>{label}</FieldLabel>
      {children}
    </ShadcnField>
  )
}

function InspectorSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-b p-4">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function colorsUsedInSet(set: ScreenshotSet): string[] {
  const colors: string[] = []
  for (const area of set.areas) {
    colors.push(area.background)
    for (const element of area.elements) {
      if (element.type === "text") colors.push(element.color)
      if (element.type === "shape") colors.push(element.fill)
      if (element.type === "image" && element.fill) colors.push(element.fill)
    }
  }
  return colors
}

function ToolbarButton({ label, disabled, children, onClick }: { label: string; disabled?: boolean; children: React.ReactNode; onClick: () => void }) {
  return <Button aria-label={label} className="hover:bg-black/5" disabled={disabled} size="icon" title={label} type="button" variant="ghost" onClick={onClick}>{children}</Button>
}

function CanvasToolButton({ active, label, children, onClick }: { active?: boolean; label: string; children: React.ReactNode; onClick: () => void }) {
  return <Button aria-label={label} aria-pressed={active} className="text-muted-foreground" size="icon-lg" title={label} type="button" variant={active ? "secondary" : "ghost"} onClick={onClick}>{children}</Button>
}

function InspectorAction({ label, className, disabled, children, onClick }: { label: string; className?: string; disabled?: boolean; children: React.ReactNode; onClick: () => void }) {
  return <Button aria-label={label} className={className} disabled={disabled} size="icon" title={label} type="button" variant="ghost" onClick={onClick}>{children}</Button>
}

function ScreenshotFooter({ area, canvasSize, index, onActivate, onRename }: {
  area: ScreenshotArea
  canvasSize: { width: number; height: number }
  index: number
  onActivate: () => void
  onRename: (name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(area.name)
  const cancelRename = useRef(false)

  useEffect(() => {
    if (!editing) setDraft(area.name)
  }, [area.name, editing])

  function beginRename() {
    cancelRename.current = false
    setDraft(area.name)
    setEditing(true)
    onActivate()
  }

  function finishRename() {
    if (cancelRename.current) {
      cancelRename.current = false
      setEditing(false)
      setDraft(area.name)
      return
    }
    const name = draft.trim()
    setEditing(false)
    setDraft(name || area.name)
    if (name) onRename(name)
  }

  if (editing) {
    return (
      <div className="mt-2 flex min-h-6 items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
          <span className="shrink-0">#{index + 1} ·</span>
          <Input
            autoFocus
            aria-label={`Screenshot ${index + 1} name`}
            className="h-6 w-40 px-1.5 py-0 text-xs"
            value={draft}
            onBlur={finishRename}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                event.currentTarget.blur()
              } else if (event.key === "Escape") {
                event.preventDefault()
                cancelRename.current = true
                setEditing(false)
                setDraft(area.name)
              }
            }}
          />
        </div>
        <span className="shrink-0">{canvasSize.width} × {canvasSize.height}</span>
      </div>
    )
  }

  return (
    <Button
      aria-label={`Select screenshot ${index + 1}`}
      className="-mx-1 mt-2 h-auto min-h-6 w-[calc(100%+0.5rem)] cursor-default justify-between gap-3 rounded px-1 py-0.5 text-xs font-normal whitespace-normal text-muted-foreground hover:bg-transparent hover:text-muted-foreground active:translate-y-0"
      type="button"
      variant="ghost"
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "F2") {
          event.preventDefault()
          beginRename()
        }
      }}
    >
      <span
        className="min-w-0 truncate"
        title="Double-click to rename"
        onDoubleClick={(event) => {
          event.stopPropagation()
          beginRename()
        }}
      >
        #{index + 1} · {area.name}
      </span>
      <span className="shrink-0">{canvasSize.width} × {canvasSize.height}</span>
    </Button>
  )
}

function SaveState({ state }: { state: "saved" | "saving" | "error" }) {
  return (
    <span className={cn("mr-1 flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground", state === "error" && "text-destructive")}>
      {state === "saving" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      {state === "saving" ? "Saving" : state === "error" ? "Not saved" : "Saved"}
    </span>
  )
}

function LayerIcon({ element }: { element: CanvasElement }) {
  if (element.type === "text") return <Type className="size-3.5 text-muted-foreground" />
  if (element.type === "image") return <ImageIcon className="size-3.5 text-muted-foreground" />
  if (element.type === "mockup") return <Smartphone className="size-3.5 text-muted-foreground" />
  return <Square className="size-3.5 text-muted-foreground" />
}

function elementLabel(element: CanvasElement, assets: Map<string, Asset>, catalog: DeviceMockupCatalog): string {
  if (element.type === "text") return element.text.trim().split("\n")[0] || "Text"
  if (element.type === "image") {
    return element.source.kind === "builtin"
      ? builtInArtworkById(element.source.id)?.name ?? "Artwork"
      : assets.get(element.source.assetId)?.name ?? "Image"
  }
  if (element.type === "mockup") return deviceMockupById(catalog, element.mockupId)?.name ?? "Device mockup"
  return "Rectangle"
}

function elementTitle(element: CanvasElement): string {
  if (element.type === "text") return "Text layer"
  if (element.type === "image") return "Image layer"
  if (element.type === "mockup") return "Device mockup"
  return "Rectangle layer"
}

async function imageDimensions(url: string): Promise<{ width: number; height: number }> {
  const image = new window.Image()
  image.src = url
  try {
    await image.decode()
    return { width: image.naturalWidth || 1, height: image.naturalHeight || 1 }
  } catch {
    return { width: 1, height: 1 }
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
}

function isArrowKey(key: string): key is "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp" {
  return key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp"
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function clampCanvasZoom(zoom: number): number {
  return clamp(Math.round(zoom * 100) / 100, MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM)
}

function clipboardLabel(clipboard: EditorClipboard): string {
  if (clipboard.kind === "area") return clipboard.area.name
  if (clipboard.element.type === "text") return clipboard.element.text
  if (clipboard.element.type === "image") return "StoreShot image layer"
  if (clipboard.element.type === "mockup") return "StoreShot device mockup layer"
  return "StoreShot rectangle layer"
}
