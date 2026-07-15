import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Plus,
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
  TextElement,
} from "../shared"

const DISPLAY_WIDTH = 286

interface SetEditorProps {
  assets: Record<AssetCategory, Asset[]>
  set: ScreenshotSet
  onDelete: () => void
  onOpenAssets: () => void
  onSetChange: (set: ScreenshotSet) => void
}

interface DragState {
  areaId: string
  elementId: string
  startClientX: number
  startClientY: number
  originX: number
  originY: number
  canvasWidth: number
  canvasHeight: number
}

export function SetEditor({ assets, set, onDelete, onOpenAssets, onSetChange }: SetEditorProps) {
  const [workingSet, setWorkingSet] = useState(set)
  const [selectedAreaId, setSelectedAreaId] = useState(set.areas[0].id)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved")
  const [error, setError] = useState<string | null>(null)
  const currentSet = useRef(set)
  const drag = useRef<DragState | null>(null)

  useEffect(() => {
    currentSet.current = set
    setWorkingSet(set)
    setSelectedAreaId(set.areas[0].id)
    setSelectedElementId(null)
  }, [set.id])

  const allAssets = useMemo(() => Object.values(assets).flat(), [assets])
  const assetLookup = useMemo(() => new Map(allAssets.map((asset) => [asset.id, asset])), [allAssets])
  const selectedArea = workingSet.areas.find((area) => area.id === selectedAreaId) ?? workingSet.areas[0]
  const selectedElement = selectedArea.elements.find((element) => element.id === selectedElementId) ?? null

  function setDraft(next: ScreenshotSet) {
    currentSet.current = next
    setWorkingSet(next)
  }

  async function persist(next = currentSet.current) {
    setSaveState("saving")
    setError(null)
    try {
      const saved = await request<ScreenshotSet>(`/api/sets/${next.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      })
      currentSet.current = saved
      setWorkingSet(saved)
      onSetChange(saved)
      setSaveState("saved")
    } catch (nextError) {
      setError(messageFor(nextError))
      setSaveState("error")
    }
  }

  function updateArea(areaId: string, update: (area: ScreenshotArea) => ScreenshotArea): ScreenshotSet {
    const next = { ...currentSet.current, areas: currentSet.current.areas.map((area) => area.id === areaId ? update(area) : area) }
    setDraft(next)
    return next
  }

  function updateElement(areaId: string, elementId: string, update: (element: CanvasElement) => CanvasElement): ScreenshotSet {
    return updateArea(areaId, (area) => ({
      ...area,
      elements: area.elements.map((element) => element.id === elementId ? update(element) : element),
    }))
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
      elements: source.elements.map((element) => ({ ...structuredClone(element), id: `element-${crypto.randomUUID()}` })),
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
      text: "New text",
      x: Math.round(workingSet.canvas.width * 0.08),
      y: Math.round(workingSet.canvas.height * 0.08),
      width: Math.round(workingSet.canvas.width * 0.84),
      height: Math.round(workingSet.canvas.height * 0.16),
      rotation: 0,
      fontSize: Math.max(48, Math.round(workingSet.canvas.width * 0.08)),
      fontWeight: 700,
      color: "#ffffff",
      textAlign: "center",
    }
    const next = updateArea(areaId, (area) => ({ ...area, elements: [...area.elements, element] }))
    setSelectedAreaId(areaId)
    setSelectedElementId(element.id)
    void persist(next)
  }

  function placeAsset(asset: Asset) {
    const element: ImageElement = {
      id: `element-${crypto.randomUUID()}`,
      type: "image",
      assetId: asset.id,
      x: Math.round(workingSet.canvas.width * 0.1),
      y: Math.round(workingSet.canvas.height * 0.25),
      width: Math.round(workingSet.canvas.width * 0.8),
      height: Math.round(workingSet.canvas.height * 0.62),
      rotation: 0,
      fit: "contain",
    }
    const next = updateArea(selectedArea.id, (area) => ({ ...area, elements: [...area.elements, element] }))
    setSelectedElementId(element.id)
    void persist(next)
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

  function startDrag(event: ReactPointerEvent, areaId: string, element: CanvasElement) {
    event.stopPropagation()
    const canvas = event.currentTarget.parentElement
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      areaId,
      elementId: element.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: element.x,
      originY: element.y,
      canvasWidth: rect.width,
      canvasHeight: rect.height,
    }
    setSelectedAreaId(areaId)
    setSelectedElementId(element.id)
  }

  function continueDrag(event: ReactPointerEvent) {
    const state = drag.current
    if (!state) return
    updateElement(state.areaId, state.elementId, (element) => ({
      ...element,
      x: Math.round(clamp(state.originX + ((event.clientX - state.startClientX) / state.canvasWidth) * workingSet.canvas.width, 0, workingSet.canvas.width - element.width)),
      y: Math.round(clamp(state.originY + ((event.clientY - state.startClientY) / state.canvasHeight) * workingSet.canvas.height, 0, workingSet.canvas.height - element.height)),
    }))
  }

  function finishDrag() {
    if (!drag.current) return
    drag.current = null
    void persist()
  }

  async function deleteSet() {
    if (!window.confirm(`Delete the set “${workingSet.name}”?`)) return
    await request(`/api/sets/${workingSet.id}`, { method: "DELETE" })
    onDelete()
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-[72px] shrink-0 items-center justify-between border-b px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-semibold">{workingSet.name}</h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{workingSet.locale}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{workingSet.device} · {workingSet.canvas.width} × {workingSet.canvas.height} px</p>
        </div>
        <div className="flex items-center gap-2">
          <SaveState state={saveState} />
          <Button variant="outline" onClick={() => addText()}><Type className="size-4" />Add text</Button>
          <Button onClick={addArea}><Plus className="size-4" />Add screenshot</Button>
        </div>
      </div>

      {error && <div className="shrink-0 border-b bg-destructive/10 px-5 py-2 text-sm text-destructive">{error}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_292px]">
        <div
          className="overflow-auto bg-[#eeeeef]"
          style={{ backgroundImage: "radial-gradient(#d2d2d5 0.75px, transparent 0.75px)", backgroundSize: "16px 16px" }}
          onClick={() => setSelectedElementId(null)}
        >
          <div className="flex min-w-max items-start gap-5 p-7 pb-12">
            {workingSet.areas.map((area, index) => {
              const selected = area.id === selectedArea.id
              return (
                <article className="shrink-0" key={area.id}>
                  <div className="mb-2 flex h-8 items-center justify-center gap-0.5 text-muted-foreground">
                    <ToolbarButton label="Add text" onClick={() => addText(area.id)}><Type className="size-4" /></ToolbarButton>
                    <ToolbarButton label="Duplicate area" onClick={() => duplicateArea(area.id)}><Copy className="size-4" /></ToolbarButton>
                    <ToolbarButton label="Delete area" disabled={workingSet.areas.length === 1} onClick={() => deleteArea(area.id)}><Trash2 className="size-4" /></ToolbarButton>
                    <ToolbarButton label="Move left" disabled={index === 0} onClick={() => moveArea(area.id, -1)}><ArrowLeft className="size-4" /></ToolbarButton>
                    <ToolbarButton label="Move right" disabled={index === workingSet.areas.length - 1} onClick={() => moveArea(area.id, 1)}><ArrowRight className="size-4" /></ToolbarButton>
                  </div>

                  <div
                    className={cn(
                      "relative overflow-hidden bg-white shadow-lg ring-1 ring-black/10 transition-shadow",
                      selected && "ring-2 ring-blue-500",
                    )}
                    style={{ width: DISPLAY_WIDTH, aspectRatio: `${workingSet.canvas.width}/${workingSet.canvas.height}`, background: area.background }}
                    onClick={(event) => { event.stopPropagation(); setSelectedAreaId(area.id); setSelectedElementId(null) }}
                  >
                    {area.elements.map((element) => {
                      const isSelected = selected && selectedElementId === element.id
                      const asset = element.type === "image" ? assetLookup.get(element.assetId) : undefined
                      return (
                        <div
                          className={cn(
                            "absolute touch-none select-none overflow-hidden",
                            isSelected && "outline outline-2 outline-offset-1 outline-blue-400",
                          )}
                          key={element.id}
                          style={{
                            left: `${(element.x / workingSet.canvas.width) * 100}%`,
                            top: `${(element.y / workingSet.canvas.height) * 100}%`,
                            width: `${(element.width / workingSet.canvas.width) * 100}%`,
                            height: `${(element.height / workingSet.canvas.height) * 100}%`,
                            transform: `rotate(${element.rotation}deg)`,
                            cursor: drag.current?.elementId === element.id ? "grabbing" : "grab",
                          }}
                          onClick={(event) => { event.stopPropagation(); setSelectedAreaId(area.id); setSelectedElementId(element.id) }}
                          onPointerDown={(event) => startDrag(event, area.id, element)}
                          onPointerMove={continueDrag}
                          onPointerUp={finishDrag}
                          onPointerCancel={finishDrag}
                        >
                          {element.type === "text" ? (
                            <div
                              className="flex h-full w-full items-center whitespace-pre-wrap leading-[1.05]"
                              style={{
                                color: element.color,
                                fontSize: element.fontSize * (DISPLAY_WIDTH / workingSet.canvas.width),
                                fontWeight: element.fontWeight,
                                justifyContent: textJustification(element.textAlign),
                                textAlign: element.textAlign,
                              }}
                            >
                              {element.text}
                            </div>
                          ) : asset ? (
                            <img className="pointer-events-none h-full w-full" draggable={false} src={asset.url} alt="" style={{ objectFit: element.fit }} />
                          ) : (
                            <div className="grid h-full place-items-center border border-dashed border-white/60 bg-black/10 px-2 text-center text-[10px] text-white">Missing asset</div>
                          )}
                        </div>
                      )
                    })}
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

        <aside className="min-h-0 overflow-auto border-l bg-background">
          <InspectorSection title="Set">
            <Field label="Name">
              <Input value={workingSet.name} onChange={(event) => setDraft({ ...workingSet, name: event.target.value })} onBlur={() => persist()} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Locale"><Input value={workingSet.locale} onChange={(event) => setDraft({ ...workingSet, locale: event.target.value })} onBlur={() => persist()} /></Field>
              <Field label="Device"><Input value={workingSet.device} onChange={(event) => setDraft({ ...workingSet, device: event.target.value })} onBlur={() => persist()} /></Field>
            </div>
          </InspectorSection>

          <InspectorSection title={`Area ${workingSet.areas.findIndex((area) => area.id === selectedArea.id) + 1}`}>
            <Field label="Name">
              <Input value={selectedArea.name} onChange={(event) => updateArea(selectedArea.id, (area) => ({ ...area, name: event.target.value }))} onBlur={() => persist()} />
            </Field>
            <Field label="Background">
              <div className="flex gap-2">
                <input
                  aria-label="Area background color"
                  className="h-9 w-11 rounded-md border bg-background p-1"
                  type="color"
                  value={selectedArea.background}
                  onChange={(event) => updateArea(selectedArea.id, (area) => ({ ...area, background: event.target.value }))}
                  onBlur={() => persist()}
                />
                <Input value={selectedArea.background} onChange={(event) => updateArea(selectedArea.id, (area) => ({ ...area, background: event.target.value }))} onBlur={() => persist()} />
              </div>
            </Field>
          </InspectorSection>

          {selectedElement && (
            <InspectorSection title={selectedElement.type === "text" ? "Text layer" : "Image layer"}>
              {selectedElement.type === "text" ? (
                <TextInspector element={selectedElement} update={(change) => updateElement(selectedArea.id, selectedElement.id, (element) => ({ ...element, ...change } as TextElement))} persist={persist} />
              ) : (
                <ImageInspector element={selectedElement} asset={assetLookup.get(selectedElement.assetId)} update={(change) => updateElement(selectedArea.id, selectedElement.id, (element) => ({ ...element, ...change } as ImageElement))} persist={persist} />
              )}
              <GeometryInspector element={selectedElement} update={(change) => updateElement(selectedArea.id, selectedElement.id, (element) => ({ ...element, ...change } as CanvasElement))} persist={persist} />
              <Button className="w-full" variant="destructive" onClick={deleteElement}><Trash2 className="size-4" />Delete layer</Button>
            </InspectorSection>
          )}

          <InspectorSection title="Assets">
            {allAssets.length === 0 ? (
              <button className="w-full rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground hover:bg-muted/40" type="button" onClick={onOpenAssets}>
                <ImagePlus className="mx-auto mb-2 size-4" />Add assets to the catalog
              </button>
            ) : (
              <>
                <p className="mb-2 text-xs text-muted-foreground">Click an asset to place it in area {workingSet.areas.findIndex((area) => area.id === selectedArea.id) + 1}.</p>
                <div className="grid grid-cols-3 gap-2">
                  {allAssets.slice(0, 9).map((asset) => (
                    <button className="aspect-square overflow-hidden rounded-md border bg-muted hover:ring-2 hover:ring-primary" key={asset.id} title={`Place ${asset.name}`} type="button" onClick={() => placeAsset(asset)}>
                      <img className="h-full w-full object-contain" src={asset.url} alt={asset.name} />
                    </button>
                  ))}
                </div>
                <Button className="mt-3 w-full" variant="outline" onClick={onOpenAssets}>Open asset catalog</Button>
              </>
            )}
          </InspectorSection>

          <div className="p-4">
            <Button className="w-full text-destructive hover:text-destructive" variant="ghost" onClick={deleteSet}>
              <Trash2 className="size-4" />Delete set
            </Button>
          </div>
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
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Font size" value={element.fontSize} onChange={(fontSize) => update({ fontSize })} onBlur={persist} />
        <Field label="Weight">
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={element.fontWeight} onChange={(event) => { update({ fontWeight: Number(event.target.value) as TextElement["fontWeight"] }); setTimeout(persist) }}>
            <option value={400}>Regular</option><option value={600}>Semibold</option><option value={700}>Bold</option><option value={800}>Extra bold</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Color"><input className="h-9 w-full rounded-md border bg-background p-1" type="color" value={element.color} onChange={(event) => update({ color: event.target.value })} onBlur={persist} /></Field>
        <Field label="Align">
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={element.textAlign} onChange={(event) => { update({ textAlign: event.target.value as TextElement["textAlign"] }); setTimeout(persist) }}>
            <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
          </select>
        </Field>
      </div>
    </>
  )
}

function ImageInspector({ element, asset, update, persist }: {
  element: ImageElement
  asset?: Asset
  update: (change: Partial<ImageElement>) => void
  persist: () => void
}) {
  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border p-2">
        {asset ? <img className="size-10 rounded object-contain" src={asset.url} alt="" /> : <Layers3 className="size-4" />}
        <span className="min-w-0 truncate text-xs">{asset?.name ?? "Missing asset"}</span>
      </div>
      <Field label="Image fit">
        <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={element.fit} onChange={(event) => { update({ fit: event.target.value as ImageElement["fit"] }); setTimeout(persist) }}>
          <option value="contain">Contain</option><option value="cover">Cover</option>
        </select>
      </Field>
    </>
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
        <NumberField label="Width" value={Math.round(element.width)} onChange={(width) => update({ width })} onBlur={persist} />
        <NumberField label="Height" value={Math.round(element.height)} onChange={(height) => update({ height })} onBlur={persist} />
        <NumberField label="Rotation" value={Math.round(element.rotation)} onChange={(rotation) => update({ rotation })} onBlur={persist} />
      </div>
    </div>
  )
}

function NumberField({ label, value, onChange, onBlur }: { label: string; value: number; onChange: (value: number) => void; onBlur: () => void }) {
  return <Field label={label}><Input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} onBlur={onBlur} /></Field>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-xs font-medium">{label}</span>{children}</label>
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3 border-b p-4"><h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>{children}</section>
}

function ToolbarButton({ label, disabled, children, onClick }: { label: string; disabled?: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button aria-label={label} className="grid size-8 place-items-center rounded-md hover:bg-black/5 disabled:opacity-30" disabled={disabled} title={label} type="button" onClick={onClick}>{children}</button>
}

function SaveState({ state }: { state: "saved" | "saving" | "error" }) {
  return (
    <span className={cn("mr-1 flex items-center gap-1.5 text-xs text-muted-foreground", state === "error" && "text-destructive")}>
      {state === "saving" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      {state === "saving" ? "Saving" : state === "error" ? "Not saved" : "Saved"}
    </span>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function textJustification(align: TextElement["textAlign"]): "flex-start" | "center" | "flex-end" {
  if (align === "left") return "flex-start"
  if (align === "right") return "flex-end"
  return "center"
}
