import { useEffect, useId, useMemo, useRef, useState } from "react"
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
  Copy,
  Image as ImageIcon,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Plus,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react"

import { messageFor, request } from "@/api"
import { Button } from "@/components/ui/button"
import { Field as ShadcnField, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type {
  Asset,
  AssetCategory,
  CanvasElement,
  FontWeight,
  ImageElement,
  ScreenshotArea,
  ScreenshotSet,
  ShapeElement,
  TextElement,
} from "../shared"
import { DEFAULT_TEXT_LINE_HEIGHT_RATIO } from "../shared"
import { FabricShotCanvas } from "./FabricShotCanvas"
import { BunnyFontPicker, closestFontWeight } from "./BunnyFontPicker"
import { FONT_WEIGHTS, getBunnyFontCatalog, LOCAL_FONT_FAMILY, loadBunnyFont } from "./bunny-fonts"

interface SetEditorProps {
  assets: Record<AssetCategory, Asset[]>
  set: ScreenshotSet
  onOpenAssets: () => void
  onSetChange: (set: ScreenshotSet) => void
}

interface ObjectContextMenuState {
  areaId: string
  elementId: string
  x: number
  y: number
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

type CanvasElementChange = Partial<ImageElement> | Partial<ShapeElement> | Partial<TextElement>

const HISTORY_LIMIT = 100
const APP_CLIPBOARD_MIME = "application/x-appshot"
let editorClipboard: EditorClipboard | null = null

export function SetEditor({ assets, set, onOpenAssets, onSetChange }: SetEditorProps) {
  const [workingSet, setWorkingSet] = useState(set)
  const [selectedAreaId, setSelectedAreaId] = useState(set.areas[0].id)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<ObjectContextMenuState | null>(null)
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved")
  const [error, setError] = useState<string | null>(null)
  const [, setHistoryRevision] = useState(0)
  const currentSet = useRef(set)
  const selectedAreaIdRef = useRef(selectedAreaId)
  const selectedElementIdRef = useRef(selectedElementId)
  const history = useRef<EditorHistory>({ past: [], future: [] })
  const historyGroup = useRef<string | null>(null)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistRevision = useRef(0)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const assetPickerRef = useRef<HTMLDivElement>(null)

  selectedAreaIdRef.current = selectedAreaId
  selectedElementIdRef.current = selectedElementId

  useEffect(() => {
    currentSet.current = set
    setWorkingSet(set)
    setSelectedAreaId(set.areas[0].id)
    setSelectedElementId(null)
    setAssetPickerOpen(false)
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
  const assetLookup = useMemo(() => new Map(allAssets.map((asset) => [asset.id, asset])), [allAssets])
  const selectedArea = workingSet.areas.find((area) => area.id === selectedAreaId) ?? workingSet.areas[0]
  const selectedElement = selectedArea.elements.find((element) => element.id === selectedElementId) ?? null
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
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    const focusFrame = requestAnimationFrame(() => {
      contextMenuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus()
    })
    window.addEventListener("blur", close)
    window.addEventListener("pointerdown", close)
    window.addEventListener("resize", close)
    window.addEventListener("scroll", close, true)
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      cancelAnimationFrame(focusFrame)
      window.removeEventListener("blur", close)
      window.removeEventListener("pointerdown", close)
      window.removeEventListener("resize", close)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [contextMenu])

  useEffect(() => {
    if (!assetPickerOpen) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!assetPickerRef.current?.contains(event.target as Node)) setAssetPickerOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAssetPickerOpen(false)
    }
    window.addEventListener("pointerdown", closeOnOutsideClick)
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsideClick)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [assetPickerOpen])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase()
      const commandKey = event.metaKey || event.ctrlKey
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
        ...structuredClone(source),
        id: `element-${crypto.randomUUID()}`,
        x: clamp(source.x + offset, 0, Math.max(0, currentSet.current.canvas.width - source.width)),
        y: clamp(source.y + offset, 0, Math.max(0, currentSet.current.canvas.height - source.height)),
      }
      addElement(targetArea.id, copy)
      return
    }

    const source = editorClipboard.area
    const sourceIndex = currentSet.current.areas.findIndex((area) => area.id === targetArea.id)
    const copy: ScreenshotArea = {
      ...structuredClone(source),
      id: `area-${crypto.randomUUID()}`,
      name: editorClipboard.pasteCount === 1
        ? `${source.name} copy`
        : `${source.name} copy ${editorClipboard.pasteCount}`,
      elements: source.elements.map((element) => ({
        ...structuredClone(element),
        id: `element-${crypto.randomUUID()}`,
      })),
    }
    const areas = [...currentSet.current.areas]
    areas.splice(sourceIndex + 1, 0, copy)
    const next = { ...currentSet.current, areas }
    setDraft(next)
    setSelectedAreaId(copy.id)
    setSelectedElementId(null)
    setAssetPickerOpen(false)
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

  async function persist(next = currentSet.current) {
    closeHistoryGroup()
    if (persistTimer.current) {
      clearTimeout(persistTimer.current)
      persistTimer.current = null
    }
    const revision = ++persistRevision.current
    setSaveState("saving")
    setError(null)
    try {
      const saved = await request<ScreenshotSet>(`/api/sets/${next.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
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
    const area: ScreenshotArea = {
      ...structuredClone(source),
      id: `area-${crypto.randomUUID()}`,
      name: `${source.name} copy`,
      elements: source.elements.map((element) => ({
        ...structuredClone(element),
        id: `element-${crypto.randomUUID()}`,
      })),
    }
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

  function deleteArea(areaId: string) {
    if (currentSet.current.areas.length === 1) return
    if (!window.confirm("Delete this screenshot area?")) return
    const index = currentSet.current.areas.findIndex((area) => area.id === areaId)
    const areas = currentSet.current.areas.filter((area) => area.id !== areaId)
    const next = { ...currentSet.current, areas }
    setDraft(next)
    setSelectedAreaId(areas[Math.min(index, areas.length - 1)].id)
    setSelectedElementId(null)
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
    void persist(next)
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
      assetId: asset.id,
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
    const copy: CanvasElement = {
      ...structuredClone(selectedElement),
      id: `element-${crypto.randomUUID()}`,
      x: selectedElement.x + Math.round(workingSet.canvas.width * 0.025),
      y: selectedElement.y + Math.round(workingSet.canvas.width * 0.025),
    }
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-[68px] shrink-0 items-center gap-4 border-b px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-lg font-semibold">{workingSet.name}</h1>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{workingSet.locale}</span>
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
      </header>

      {error && <div className="shrink-0 border-b bg-destructive/10 px-5 py-2 text-sm text-destructive">{error}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px]">
        <main className="relative min-h-0 overflow-hidden bg-[#eeeeef]">
          <div className="absolute left-3 top-3 z-20" ref={assetPickerRef}>
            <div className="flex flex-col gap-1 rounded-lg border bg-background/95 p-1 shadow-md backdrop-blur-sm">
              <CanvasToolButton label="Add text to selected screenshot" onClick={() => addText()}><Type className="size-4" /></CanvasToolButton>
              <CanvasToolButton label="Add rectangle to selected screenshot" onClick={() => addShape()}><Square className="size-4" /></CanvasToolButton>
              <CanvasToolButton active={assetPickerOpen} label="Add image from assets" onClick={() => setAssetPickerOpen((open) => !open)}><ImageIcon className="size-4" /></CanvasToolButton>
              <span className="mx-1 my-0.5 h-px bg-border" />
              <CanvasToolButton label="Add screenshot" onClick={addArea}><Plus className="size-4" /></CanvasToolButton>
            </div>

            {assetPickerOpen && (
              <div className="absolute left-12 top-0 flex max-h-[min(520px,calc(100vh-110px))] w-64 flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl">
                <div className="flex shrink-0 items-start justify-between border-b px-3 py-2.5">
                  <div>
                    <p className="text-sm font-semibold">Add image</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Place an asset on this screenshot</p>
                  </div>
                  <button aria-label="Close asset picker" className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" type="button" onClick={() => setAssetPickerOpen(false)}><X className="size-3.5" /></button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-2.5">
                  {allAssets.length === 0 ? (
                    <button className="w-full rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground hover:bg-muted/40" type="button" onClick={onOpenAssets}>
                      <ImagePlus className="mx-auto mb-2 size-5" />Add assets to the catalog
                    </button>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {allAssets.map((asset) => (
                        <button className="group aspect-square overflow-hidden rounded-lg border bg-muted/40 outline-none hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring" key={asset.id} title={`Place ${asset.name}`} type="button" onClick={() => void placeAsset(asset)}>
                          <img className="h-full w-full object-contain transition-transform group-hover:scale-[1.03]" src={asset.url} alt={asset.name} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="shrink-0 border-t p-2.5">
                  <Button className="w-full" size="sm" variant="ghost" onClick={onOpenAssets}>Open asset catalog</Button>
                </div>
              </div>
            )}
          </div>

          <div
            className="h-full overflow-auto"
            style={{ backgroundImage: "radial-gradient(#d2d2d5 0.75px, transparent 0.75px)", backgroundSize: "16px 16px" }}
            onClick={() => {
              setSelectedElementId(null)
            }}
          >
            <div className="flex min-w-max items-start gap-7 pb-12 pl-20 pr-7 pt-7">
              {workingSet.areas.map((area, index) => {
                const active = area.id === selectedArea.id
                return (
                  <article className="shrink-0" key={area.id}>
                    <div className="mb-2 flex h-8 items-center justify-center gap-0.5 text-muted-foreground">
                      <ToolbarButton label="Duplicate screenshot" onClick={() => duplicateArea(area.id)}><Copy className="size-4" /></ToolbarButton>
                      <ToolbarButton label="Delete screenshot" disabled={workingSet.areas.length === 1} onClick={() => deleteArea(area.id)}><Trash2 className="size-4" /></ToolbarButton>
                      <ToolbarButton label="Move screenshot left" disabled={index === 0} onClick={() => moveArea(area.id, -1)}><ArrowLeft className="size-4" /></ToolbarButton>
                      <ToolbarButton label="Move screenshot right" disabled={index === workingSet.areas.length - 1} onClick={() => moveArea(area.id, 1)}><ArrowRight className="size-4" /></ToolbarButton>
                    </div>

                    <div
                      className={cn("transition-shadow", active && "ring-2 ring-[#1683ff] ring-offset-2 ring-offset-[#eeeeef]")}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <FabricShotCanvas
                        active={active}
                        area={area}
                        assetLookup={assetLookup}
                        canvasSize={workingSet.canvas}
                        selectedElementId={active ? selectedElementId : null}
                        onActivate={() => setSelectedAreaId(area.id)}
                        onChange={(element) => changeElementFromCanvas(area.id, element)}
                        onContextMenu={(elementId, position) => {
                          if (!elementId) {
                            setContextMenu(null)
                            return
                          }
                          setSelectedAreaId(area.id)
                          setSelectedElementId(elementId)
                          setContextMenu({ areaId: area.id, elementId, ...position })
                        }}
                        onSelect={(elementId) => {
                          setSelectedAreaId(area.id)
                          setSelectedElementId(elementId)
                        }}
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>#{index + 1} · {area.name}</span>
                      <span>{workingSet.canvas.width} × {workingSet.canvas.height}</span>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </main>

        <aside className="flex min-h-0 flex-col border-l bg-background">
          <section className="flex max-h-[40%] min-h-[116px] shrink-0 flex-col border-b">
            <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Layers</h2>
              <span className="text-[11px] tabular-nums text-muted-foreground">{selectedArea.elements.length}</span>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="px-2 pb-3">
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
                        <span className="min-w-0 flex-1 truncate text-left">{elementLabel(element, assetLookup)}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </section>

          <ScrollArea className="min-h-0 flex-1">
            <div>
              {selectedElement ? (
                <InspectorSection title={elementTitle(selectedElement)}>
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
                      preview={previewSelectedElement}
                      cancelPreview={cancelSelectedElementPreview}
                      update={updateSelectedElement}
                      persist={() => void persist()}
                    />
                  )}
                  {selectedElement.type === "image" && <ImageInspector element={selectedElement} asset={assetLookup.get(selectedElement.assetId)} />}
                  {selectedElement.type === "shape" && (
                    <ShapeInspector element={selectedElement} update={updateSelectedElement} persist={() => void persist()} />
                  )}

                  <GeometryInspector element={selectedElement} update={updateSelectedElement} persist={() => void persist()} />
                  <OpacityInspector element={selectedElement} update={updateSelectedElement} persist={() => void persist()} />
                </InspectorSection>
              ) : (
                <InspectorSection title={`Screenshot ${workingSet.areas.findIndex((area) => area.id === selectedArea.id) + 1}`}>
                  <Field label="Name">
                    <Input value={selectedArea.name} onChange={(event) => updateArea(selectedArea.id, (area) => ({ ...area, name: event.target.value }), `area:${selectedArea.id}`)} onBlur={() => void persist()} />
                  </Field>
                  <Field label="Background">
                    <div className="flex gap-2">
                      <Input
                        aria-label="Screenshot background color"
                        className="w-11 shrink-0 p-1"
                        type="color"
                        value={selectedArea.background}
                        onChange={(event) => updateArea(selectedArea.id, (area) => ({ ...area, background: event.target.value }), `area:${selectedArea.id}`)}
                        onBlur={() => void persist()}
                      />
                      <Input value={selectedArea.background} onChange={(event) => updateArea(selectedArea.id, (area) => ({ ...area, background: event.target.value }), `area:${selectedArea.id}`)} onBlur={() => void persist()} />
                    </div>
                  </Field>
                  <p className="text-xs leading-relaxed text-muted-foreground">Select an object to edit it. Drag to move, use the handles to resize, or double-click text to edit.</p>
                </InspectorSection>
              )}

            </div>
          </ScrollArea>
        </aside>
      </div>

      {contextMenu && contextArea && contextElement && (
        <ObjectContextMenu
          areaLength={contextArea.elements.length}
          element={contextElement}
          elementIndex={contextElementIndex}
          menuRef={contextMenuRef}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onMove={moveContextElement}
          onUpdate={updateContextElement}
        />
      )}
    </div>
  )
}

function ObjectContextMenu({
  areaLength,
  element,
  elementIndex,
  menuRef,
  position,
  onMove,
  onUpdate,
}: {
  areaLength: number
  element: CanvasElement
  elementIndex: number
  menuRef: React.RefObject<HTMLDivElement | null>
  position: { x: number; y: number }
  onMove: (targetIndex: number) => void
  onUpdate: (change: CanvasElementChange) => void
}) {
  const left = Math.max(8, Math.min(position.x, window.innerWidth - 248))
  const top = Math.max(8, Math.min(position.y, window.innerHeight - 360))

  return (
    <div
      aria-label="Object actions"
      className="fixed z-50 w-60 overflow-hidden rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-xl"
      ref={menuRef}
      role="menu"
      style={{ left, top }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{elementTitle(element)}</div>
      <ContextMenuItem disabled={elementIndex === areaLength - 1} label="Bring to front" onClick={() => onMove(areaLength - 1)}><ChevronsUp className="size-4" /></ContextMenuItem>
      <ContextMenuItem disabled={elementIndex === areaLength - 1} label="Bring forward" onClick={() => onMove(elementIndex + 1)}><ArrowUp className="size-4" /></ContextMenuItem>
      <ContextMenuItem disabled={elementIndex === 0} label="Send backward" onClick={() => onMove(elementIndex - 1)}><ArrowDown className="size-4" /></ContextMenuItem>
      <ContextMenuItem disabled={elementIndex === 0} label="Send to back" onClick={() => onMove(0)}><ChevronsDown className="size-4" /></ContextMenuItem>

      {element.type === "text" && (
        <div className="mt-1 border-t px-2 pb-2 pt-2">
          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Text alignment</p>
          <div className="grid grid-cols-3 rounded-md border bg-muted/30 p-0.5">
            <ContextAttributeButton active={element.textAlign === "left"} label="Align left" onClick={() => onUpdate({ textAlign: "left" })}><AlignLeft className="size-4" /></ContextAttributeButton>
            <ContextAttributeButton active={element.textAlign === "center"} label="Align center" onClick={() => onUpdate({ textAlign: "center" })}><AlignCenter className="size-4" /></ContextAttributeButton>
            <ContextAttributeButton active={element.textAlign === "right"} label="Align right" onClick={() => onUpdate({ textAlign: "right" })}><AlignRight className="size-4" /></ContextAttributeButton>
          </div>
          <label className="mt-2 flex items-center justify-between text-xs">
            <span>Text color</span>
            <input className="h-7 w-10 rounded border bg-background p-1" type="color" value={element.color} onChange={(event) => onUpdate({ color: event.target.value })} />
          </label>
        </div>
      )}

      {element.type === "shape" && (
        <div className="mt-1 space-y-2 border-t px-2 pb-2 pt-2">
          <label className="flex items-center justify-between text-xs">
            <span>Fill color</span>
            <input className="h-7 w-10 rounded border bg-background p-1" type="color" value={element.fill} onChange={(event) => onUpdate({ fill: event.target.value })} />
          </label>
          <label className="flex items-center justify-between gap-3 text-xs">
            <span>Corner radius</span>
            <input className="h-7 w-20 rounded-md border bg-background px-2 text-right outline-none focus-visible:ring-2 focus-visible:ring-ring" min={0} type="number" value={Math.round(element.cornerRadius)} onChange={(event) => onUpdate({ cornerRadius: Math.max(0, Number(event.target.value)) })} />
          </label>
        </div>
      )}

      <label className="mt-1 block border-t px-2 pb-2 pt-2 text-xs">
        <span className="mb-1.5 flex items-center justify-between"><span>Opacity</span><span className="text-muted-foreground">{Math.round(element.opacity * 100)}%</span></span>
        <input className="w-full accent-foreground" max={100} min={0} type="range" value={Math.round(element.opacity * 100)} onChange={(event) => onUpdate({ opacity: Number(event.target.value) / 100 })} />
      </label>
    </div>
  )
}

function ContextMenuItem({ label, disabled, children, onClick }: { label: string; disabled?: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-40" disabled={disabled} role="menuitem" type="button" onClick={onClick}>
      {children}<span>{label}</span>
    </button>
  )
}

function ContextAttributeButton({ active, label, children, onClick }: { active: boolean; label: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <button aria-label={label} aria-pressed={active} className={cn("grid h-7 place-items-center rounded outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring", active && "bg-background shadow-sm")} title={label} type="button" onClick={onClick}>
      {children}
    </button>
  )
}

function TextInspector({ element, preview, cancelPreview, update, persist }: {
  element: TextElement
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
        <Field label="Color"><Input className="p-1" type="color" value={element.color} onChange={(event) => update({ color: event.target.value })} onBlur={persist} /></Field>
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

function ImageInspector({ element, asset }: { element: ImageElement; asset?: Asset }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-2">
      {asset ? <img className="size-10 rounded object-contain" src={asset.url} alt="" /> : <Layers3 className="size-4" />}
      <span className="min-w-0 flex-1 truncate text-xs">{asset?.name ?? `Missing asset: ${element.assetId}`}</span>
    </div>
  )
}

function ShapeInspector({ element, update, persist }: {
  element: ShapeElement
  update: (change: Partial<ShapeElement>) => void
  persist: () => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Fill"><Input className="p-1" type="color" value={element.fill} onChange={(event) => update({ fill: event.target.value })} onBlur={persist} /></Field>
      <NumberField label="Corner radius" min={0} value={element.cornerRadius} onChange={(cornerRadius) => update({ cornerRadius })} onBlur={persist} />
    </div>
  )
}

function GeometryInspector({ element, update, persist }: {
  element: CanvasElement
  update: (change: Partial<CanvasElement>) => void
  persist: () => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">Position and size</p>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={Math.round(element.x)} onChange={(x) => update({ x })} onBlur={persist} />
        <NumberField label="Y" value={Math.round(element.y)} onChange={(y) => update({ y })} onBlur={persist} />
        <NumberField label="Width" min={1} value={Math.round(element.width)} onChange={(width) => update({ width })} onBlur={persist} />
        {element.type !== "text" && <NumberField label="Height" min={1} value={Math.round(element.height)} onChange={(height) => update({ height })} onBlur={persist} />}
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
  return <Field label={label}><Input min={min} type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} onBlur={onBlur} /></Field>
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

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3 border-b p-4"><h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>{children}</section>
}

function ToolbarButton({ label, disabled, children, onClick }: { label: string; disabled?: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button aria-label={label} className="grid size-8 place-items-center rounded-md outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30" disabled={disabled} title={label} type="button" onClick={onClick}>{children}</button>
}

function CanvasToolButton({ active, label, children, onClick }: { active?: boolean; label: string; children: React.ReactNode; onClick: () => void }) {
  return <button aria-label={label} aria-pressed={active} className={cn("grid size-9 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", active && "bg-muted text-foreground")} title={label} type="button" onClick={onClick}>{children}</button>
}

function InspectorAction({ label, className, disabled, children, onClick }: { label: string; className?: string; disabled?: boolean; children: React.ReactNode; onClick: () => void }) {
  return <Button aria-label={label} className={className} disabled={disabled} size="icon" title={label} type="button" variant="ghost" onClick={onClick}>{children}</Button>
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
  return <Square className="size-3.5 text-muted-foreground" />
}

function elementLabel(element: CanvasElement, assets: Map<string, Asset>): string {
  if (element.type === "text") return element.text.trim().split("\n")[0] || "Text"
  if (element.type === "image") return assets.get(element.assetId)?.name ?? "Image"
  return "Rectangle"
}

function elementTitle(element: CanvasElement): string {
  if (element.type === "text") return "Text layer"
  if (element.type === "image") return "Image layer"
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function clipboardLabel(clipboard: EditorClipboard): string {
  if (clipboard.kind === "area") return clipboard.area.name
  if (clipboard.element.type === "text") return clipboard.element.text
  if (clipboard.element.type === "image") return "Appshot image layer"
  return "Appshot rectangle layer"
}
