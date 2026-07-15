import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Copy,
  Image as ImageIcon,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Plus,
  Square,
  Trash2,
  Type,
} from "lucide-react"

import { messageFor, request } from "@/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type {
  Asset,
  AssetCategory,
  CanvasElement,
  ImageElement,
  ScreenshotArea,
  ScreenshotSet,
  ShapeElement,
  TextElement,
} from "../shared"
import { FabricShotCanvas } from "./FabricShotCanvas"

interface SetEditorProps {
  assets: Record<AssetCategory, Asset[]>
  set: ScreenshotSet
  onDelete: () => void
  onOpenAssets: () => void
  onSetChange: (set: ScreenshotSet) => void
}

export function SetEditor({ assets, set, onDelete, onOpenAssets, onSetChange }: SetEditorProps) {
  const [workingSet, setWorkingSet] = useState(set)
  const [selectedAreaId, setSelectedAreaId] = useState(set.areas[0].id)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved")
  const [error, setError] = useState<string | null>(null)
  const currentSet = useRef(set)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistRevision = useRef(0)

  useEffect(() => {
    currentSet.current = set
    setWorkingSet(set)
    setSelectedAreaId(set.areas[0].id)
    setSelectedElementId(null)
  }, [set.id])

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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
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
  }, [selectedArea.id, selectedElementId])

  function setDraft(next: ScreenshotSet) {
    currentSet.current = next
    setWorkingSet(next)
  }

  function schedulePersist(next: ScreenshotSet) {
    if (persistTimer.current) clearTimeout(persistTimer.current)
    setSaveState("saving")
    persistTimer.current = setTimeout(() => {
      persistTimer.current = null
      void persist(next)
    }, 350)
  }

  async function persist(next = currentSet.current) {
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

  function updateArea(areaId: string, update: (area: ScreenshotArea) => ScreenshotArea): ScreenshotSet {
    const next = {
      ...currentSet.current,
      areas: currentSet.current.areas.map((area) => area.id === areaId ? update(area) : area),
    }
    setDraft(next)
    return next
  }

  function updateElement(areaId: string, elementId: string, update: (element: CanvasElement) => CanvasElement): ScreenshotSet {
    return updateArea(areaId, (area) => ({
      ...area,
      elements: area.elements.map((element) => element.id === elementId ? update(element) : element),
    }))
  }

  function updateSelectedElement(change: Partial<CanvasElement>) {
    if (!selectedElement) return
    updateElement(selectedArea.id, selectedElement.id, (element) => ({ ...element, ...change } as CanvasElement))
  }

  function changeElementFromCanvas(areaId: string, element: CanvasElement) {
    const next = updateElement(areaId, element.id, () => element)
    setSelectedAreaId(areaId)
    setSelectedElementId(element.id)
    schedulePersist(next)
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

  async function deleteSet() {
    if (!window.confirm(`Delete the set “${workingSet.name}”?`)) return
    await request(`/api/sets/${workingSet.id}`, { method: "DELETE" })
    onDelete()
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-[68px] shrink-0 items-center justify-between gap-4 border-b px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-semibold">{workingSet.name}</h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{workingSet.locale}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{workingSet.device} · {workingSet.canvas.width} × {workingSet.canvas.height} px</p>
        </div>
        <div className="flex items-center gap-2">
          <SaveState state={saveState} />
          <Button size="sm" variant="outline" onClick={() => addText()}><Type className="size-4" />Text</Button>
          <Button size="sm" variant="outline" onClick={() => addShape()}><Square className="size-4" />Shape</Button>
          <Button size="sm" onClick={addArea}><Plus className="size-4" />Add screenshot</Button>
        </div>
      </header>

      {error && <div className="shrink-0 border-b bg-destructive/10 px-5 py-2 text-sm text-destructive">{error}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_304px]">
        <main
          className="overflow-auto bg-[#eeeeef]"
          style={{ backgroundImage: "radial-gradient(#d2d2d5 0.75px, transparent 0.75px)", backgroundSize: "16px 16px" }}
          onClick={() => setSelectedElementId(null)}
        >
          <div className="flex min-w-max items-start gap-7 p-7 pb-12">
            {workingSet.areas.map((area, index) => {
              const active = area.id === selectedArea.id
              return (
                <article className="shrink-0" key={area.id}>
                  <div className="mb-2 flex h-8 items-center justify-center gap-0.5 text-muted-foreground">
                    <ToolbarButton label="Add text" onClick={() => addText(area.id)}><Type className="size-4" /></ToolbarButton>
                    <ToolbarButton label="Add rectangle" onClick={() => addShape(area.id)}><Square className="size-4" /></ToolbarButton>
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
        </main>

        <aside className="min-h-0 overflow-auto border-l bg-background">
          {selectedElement ? (
            <>
              <InspectorSection title={elementTitle(selectedElement)}>
                <div className="flex items-center rounded-lg border bg-muted/20 p-1">
                  <InspectorAction label="Duplicate layer" onClick={duplicateElement}><Copy className="size-4" /></InspectorAction>
                  <InspectorAction label="Send backward" disabled={selectedElementIndex === 0} onClick={() => moveElementLayer(-1)}><ArrowDown className="size-4" /></InspectorAction>
                  <InspectorAction label="Bring forward" disabled={selectedElementIndex === selectedArea.elements.length - 1} onClick={() => moveElementLayer(1)}><ArrowUp className="size-4" /></InspectorAction>
                  <InspectorAction className="ml-auto text-destructive hover:text-destructive" label="Delete layer" onClick={deleteElement}><Trash2 className="size-4" /></InspectorAction>
                </div>

                {selectedElement.type === "text" && (
                  <TextInspector
                    element={selectedElement}
                    update={(change) => updateSelectedElement(change)}
                    persist={() => void persist()}
                  />
                )}
                {selectedElement.type === "image" && <ImageInspector element={selectedElement} asset={assetLookup.get(selectedElement.assetId)} />}
                {selectedElement.type === "shape" && (
                  <ShapeInspector
                    element={selectedElement}
                    update={(change) => updateSelectedElement(change)}
                    persist={() => void persist()}
                  />
                )}

                <GeometryInspector element={selectedElement} update={updateSelectedElement} persist={() => void persist()} />
                <OpacityInspector element={selectedElement} update={updateSelectedElement} persist={() => void persist()} />
              </InspectorSection>
            </>
          ) : (
            <InspectorSection title={`Screenshot ${workingSet.areas.findIndex((area) => area.id === selectedArea.id) + 1}`}>
              <Field label="Name">
                <Input value={selectedArea.name} onChange={(event) => updateArea(selectedArea.id, (area) => ({ ...area, name: event.target.value }))} onBlur={() => void persist()} />
              </Field>
              <Field label="Background">
                <div className="flex gap-2">
                  <input
                    aria-label="Screenshot background color"
                    className="h-9 w-11 rounded-md border bg-background p-1"
                    type="color"
                    value={selectedArea.background}
                    onChange={(event) => updateArea(selectedArea.id, (area) => ({ ...area, background: event.target.value }))}
                    onBlur={() => void persist()}
                  />
                  <Input value={selectedArea.background} onChange={(event) => updateArea(selectedArea.id, (area) => ({ ...area, background: event.target.value }))} onBlur={() => void persist()} />
                </div>
              </Field>
              <p className="text-xs leading-relaxed text-muted-foreground">Select an object to edit its properties. Drag handles resize and rotate; double-click text to edit it on the canvas.</p>
            </InspectorSection>
          )}

          <InspectorSection title="Layers">
            {selectedArea.elements.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">No layers yet</p>
            ) : (
              <div className="space-y-1">
                {[...selectedArea.elements].reverse().map((element) => (
                  <button
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                      element.id === selectedElementId && "bg-muted font-medium",
                    )}
                    key={element.id}
                    type="button"
                    onClick={() => setSelectedElementId(element.id)}
                  >
                    <LayerIcon element={element} />
                    <span className="min-w-0 flex-1 truncate">{elementLabel(element, assetLookup)}</span>
                  </button>
                ))}
              </div>
            )}
          </InspectorSection>

          <InspectorSection title="Assets">
            {allAssets.length === 0 ? (
              <button className="w-full rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground hover:bg-muted/40" type="button" onClick={onOpenAssets}>
                <ImagePlus className="mx-auto mb-2 size-4" />Add assets to the catalog
              </button>
            ) : (
              <>
                <p className="mb-2 text-xs text-muted-foreground">Click an asset to add it to this screenshot.</p>
                <div className="grid grid-cols-3 gap-2">
                  {allAssets.slice(0, 12).map((asset) => (
                    <button className="aspect-square overflow-hidden rounded-md border bg-muted outline-none hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-ring" key={asset.id} title={`Place ${asset.name}`} type="button" onClick={() => void placeAsset(asset)}>
                      <img className="h-full w-full object-contain" src={asset.url} alt={asset.name} />
                    </button>
                  ))}
                </div>
                <Button className="mt-3 w-full" size="sm" variant="outline" onClick={onOpenAssets}>Open asset catalog</Button>
              </>
            )}
          </InspectorSection>

          <InspectorSection title="Set details">
            <Field label="Name"><Input value={workingSet.name} onChange={(event) => setDraft({ ...workingSet, name: event.target.value })} onBlur={() => void persist()} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Locale"><Input value={workingSet.locale} onChange={(event) => setDraft({ ...workingSet, locale: event.target.value })} onBlur={() => void persist()} /></Field>
              <Field label="Device"><Input value={workingSet.device} onChange={(event) => setDraft({ ...workingSet, device: event.target.value })} onBlur={() => void persist()} /></Field>
            </div>
            <Button className="w-full text-destructive hover:text-destructive" size="sm" variant="ghost" onClick={() => void deleteSet()}>
              <Trash2 className="size-4" />Delete set
            </Button>
          </InspectorSection>
        </aside>
      </div>
    </div>
  )
}

function TextInspector({ element, update, persist }: {
  element: TextElement
  update: (change: Partial<TextElement>) => void
  persist: () => void
}) {
  return (
    <>
      <Field label="Text">
        <textarea className="min-h-20 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={element.text} onChange={(event) => update({ text: event.target.value })} onBlur={persist} />
      </Field>
      <Field label="Font">
        <select className={selectClassName} value={element.fontFamily} onChange={(event) => { update({ fontFamily: event.target.value }); setTimeout(persist) }}>
          <option value="Geist Variable">Geist</option>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="Times New Roman">Times New Roman</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Font size" min={1} value={element.fontSize} onChange={(fontSize) => update({ fontSize })} onBlur={persist} />
        <Field label="Weight">
          <select className={selectClassName} value={element.fontWeight} onChange={(event) => { update({ fontWeight: Number(event.target.value) as TextElement["fontWeight"] }); setTimeout(persist) }}>
            <option value={400}>Regular</option><option value={600}>Semibold</option><option value={700}>Bold</option><option value={800}>Extra bold</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Color"><input className="h-9 w-full rounded-md border bg-background p-1" type="color" value={element.color} onChange={(event) => update({ color: event.target.value })} onBlur={persist} /></Field>
        <Field label="Align">
          <select className={selectClassName} value={element.textAlign} onChange={(event) => { update({ textAlign: event.target.value as TextElement["textAlign"] }); setTimeout(persist) }}>
            <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
          </select>
        </Field>
      </div>
    </>
  )
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
      <Field label="Fill"><input className="h-9 w-full rounded-md border bg-background p-1" type="color" value={element.fill} onChange={(event) => update({ fill: event.target.value })} onBlur={persist} /></Field>
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
  return (
    <Field label={`Opacity · ${percentage}%`}>
      <input
        aria-label="Layer opacity"
        className="w-full accent-foreground"
        max={100}
        min={0}
        type="range"
        value={percentage}
        onChange={(event) => update({ opacity: Number(event.target.value) / 100 })}
        onBlur={persist}
        onPointerUp={persist}
      />
    </Field>
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
  return <label className="block space-y-1.5"><span className="text-xs font-medium">{label}</span>{children}</label>
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3 border-b p-4"><h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>{children}</section>
}

function ToolbarButton({ label, disabled, children, onClick }: { label: string; disabled?: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button aria-label={label} className="grid size-8 place-items-center rounded-md outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30" disabled={disabled} title={label} type="button" onClick={onClick}>{children}</button>
}

function InspectorAction({ label, className, disabled, children, onClick }: { label: string; className?: string; disabled?: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button aria-label={label} className={cn("grid size-8 place-items-center rounded-md outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30", className)} disabled={disabled} title={label} type="button" onClick={onClick}>{children}</button>
}

function SaveState({ state }: { state: "saved" | "saving" | "error" }) {
  return (
    <span className={cn("mr-1 flex items-center gap-1.5 text-xs text-muted-foreground", state === "error" && "text-destructive")}>
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

const selectClassName = "h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
