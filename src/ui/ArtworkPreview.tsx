import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react"
import { MessageSquarePlus } from "lucide-react"
import { svgTextCaret, visibleSelectionBounds, type ArtworkCaret } from "@/artwork-selection"
import { useAnnotations } from "@/PromptAnnotations"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent } from "@/components/ui/popover"
import { assetSpec } from "../app-store"
import { cn } from "@/lib/utils"
import type { ScreenshotArea, ScreenshotSet } from "../shared"

type PreviewState = "loading" | "updated" | "ready"
interface SelectedArtworkText {
  text: string
  range: Range
  frame: HTMLIFrameElement
}

/** Keep the last loaded artwork visible while its changed revision loads behind it. */
export function ArtworkPreview({ set, area, scale, frameClassName, children }: {
  set: ScreenshotSet
  area: ScreenshotArea
  scale: number
  frameClassName: string
  children?: ReactNode
}) {
  const annotations = useAnnotations()
  const selectable = assetSpec(set.specId)?.kind === "screenshots"
  const annotating = annotations?.active && selectable
  const [selection, setSelection] = useState<SelectedArtworkText | null>(null)
  const markers = annotations?.queue.flatMap((item, index) =>
    item.setId === set.id && item.areaId === area.id ? [{ id: item.id, number: index + 1, point: item.point }] : [],
  ) ?? []
  const revision = area.previewRevision ?? "initial"
  const [loaded, setLoaded] = useState(revision)
  const [updated, setUpdated] = useState(false)
  const latest = useRef(revision)
  latest.current = revision
  const loading = loaded !== revision
  const state: PreviewState = loading ? "loading" : updated ? "updated" : "ready"
  useEffect(() => {
    if (!updated) return
    const timer = setTimeout(() => setUpdated(false), 2200)
    return () => clearTimeout(timer)
  }, [updated, loaded])
  useEffect(() => {
    dismiss()
  }, [revision, scale])
  function dismissSelection() {
    selection?.frame.contentDocument?.getSelection()?.removeAllRanges()
    setSelection(null)
  }
  const dismiss = useEffectEvent(dismissSelection)
  useEffect(() => {
    if (!selection) return
    const update = () => {
      if (!visibleSelectionBounds(selection.range, selection.frame)) dismiss()
    }
    const outside = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest('[data-artwork-selection-action]')) dismiss()
    }
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    window.addEventListener("pointerdown", outside, true)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
      window.removeEventListener("pointerdown", outside, true)
    }
  }, [selection])
  function selectionBounds() {
    return selection ? visibleSelectionBounds(selection.range, selection.frame) ?? new DOMRect() : new DOMRect()
  }
  return (
    <div className="w-full" data-preview-state={state}>
      <div
        className={cn(
          "relative overflow-hidden",
          frameClassName,
          annotating && "cursor-crosshair outline-2 outline-offset-2 outline-primary/15 transition-[outline-color] hover:outline-primary/70 focus-visible:outline-primary/70",
        )}
        style={{ width: set.canvas.width * scale, height: set.canvas.height * scale }}
        role={annotating ? "button" : undefined}
        tabIndex={annotating ? 0 : undefined}
        aria-label={annotating ? `Comment on ${area.name}` : undefined}
        onClickCapture={event => {
          if (!annotating) return
          const bounds = event.currentTarget.getBoundingClientRect()
          annotations?.begin(set, area, {
            x: Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)),
            y: Math.max(0, Math.min(100, (event.clientY - bounds.top) / bounds.height * 100)),
          })
        }}
        onKeyDown={event => {
          if (!annotating || !["Enter", " "].includes(event.key)) return
          event.preventDefault()
          annotations?.begin(set, area)
        }}
      >
        {[...new Set([loaded, revision])].map(value => (
          <PreviewFrame
            key={value}
            set={set}
            area={area}
            revision={value}
            scale={scale}
            visible={value === loaded}
            selectable={selectable}
            annotating={!!annotating}
            onSelection={setSelection}
            onClick={point => { setSelection(null); annotations?.begin(set, area, point) }}
            onShortcut={event => annotations?.handleShortcut(event)}
            onLoad={() => {
              if (value !== latest.current || value === loaded) return
              setLoaded(value)
              setUpdated(true)
            }}
          />
        ))}
        {markers.map(marker => (
          <span
            key={marker.id}
            aria-hidden
            className="pointer-events-none absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-neutral-900 text-xs font-semibold text-white tabular-nums shadow-md ring-2 ring-white"
            style={{
              left: `clamp(14px, ${marker.point?.x ?? 50}%, calc(100% - 14px))`,
              top: `clamp(14px, ${marker.point?.y ?? 50}%, calc(100% - 14px))`,
            }}
          >
            {marker.number}
          </span>
        ))}
      </div>
      {selection && (
        <Popover open onOpenChange={open => { if (!open) dismissSelection() }}>
          <PopoverContent data-artwork-selection-action anchor={{ getBoundingClientRect: selectionBounds, contextElement: selection.frame }} initialFocus={false} finalFocus={false} sideOffset={8} className="w-auto gap-0 p-1">
            <Button variant="ghost" size="sm" onClick={() => {
              const rect = selection.range.getBoundingClientRect()
              annotations?.begin(set, area, {
                x: Math.max(0, Math.min(100, (rect.left + rect.width / 2) / set.canvas.width * 100)),
                y: Math.max(0, Math.min(100, (rect.top + rect.height / 2) / set.canvas.height * 100)),
              }, selection.text)
              selection.frame.contentDocument?.getSelection()?.removeAllRanges()
              setSelection(null)
            }}>
              <MessageSquarePlus aria-hidden /> Annotate
            </Button>
          </PopoverContent>
        </Popover>
      )}
      {children}
      <div className="flex h-6 min-w-0 items-center overflow-hidden pt-1">
        <PreviewStatus state={state} />
        <span role="status" className="sr-only">{state === "updated" ? `${area.name} updated` : ""}</span>
      </div>
    </div>
  )
}

/** Script-disabled frames expose DOM access only for selectable screenshot previews. */
function PreviewFrame({ set, area, revision, scale, visible, selectable, annotating, onSelection, onClick, onShortcut, onLoad }: {
  set: ScreenshotSet
  area: ScreenshotArea
  revision: string
  scale: number
  visible: boolean
  selectable: boolean
  annotating: boolean
  onSelection: (selection: SelectedArtworkText | null) => void
  onClick: (point: { x: number; y: number }) => void
  onShortcut: (event: KeyboardEvent) => void
  onLoad: () => void
}) {
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null)
  const [document, setDocument] = useState<Document | null>(null)
  const selected = useEffectEvent(() => {
    const selection = document?.getSelection()
    if (!frame || !selection || !selection.rangeCount || selection.isCollapsed || !selection.toString().trim()) {
      onSelection(null)
      return false
    }
    window.dispatchEvent(new CustomEvent("storeshot:selection-owner", { detail: document }))
    onSelection({ text: selection.toString().trim(), range: selection.getRangeAt(0).cloneRange(), frame })
    return true
  })
  const clicked = useEffectEvent((event: MouseEvent) => {
    if ((event.target as Element | null)?.closest("a, button, input, select, textarea")) event.preventDefault()
    if (!document?.getSelection()?.isCollapsed) return
    onSelection(null)
    if (annotating) onClick({ x: event.clientX / set.canvas.width * 100, y: event.clientY / set.canvas.height * 100 })
  })
  const shortcut = useEffectEvent(onShortcut)
  useEffect(() => {
    if (!document || !selectable || !visible) return
    const style = document.createElement("style")
    style.textContent = "html, body { cursor: " + (annotating ? "crosshair" : "auto") + "; } body, body * { user-select: text !important; -webkit-user-select: text !important; } svg, img { pointer-events: none !important; } svg text, svg tspan { pointer-events: auto !important; }"
    document.head.append(style)
    let dragging = false
    let svgDrag: { text: Element; anchor: ArtworkCaret } | null = null
    let moved = false
    const clear = () => {
      dragging = false
      svgDrag = null
      document.getSelection()?.removeAllRanges()
      onSelection(null)
    }
    const otherOwner = (event: Event) => {
      if ((event as CustomEvent<Document>).detail !== document) clear()
    }
    const updateSvg = (event: PointerEvent) => {
      if (!svgDrag) return
      const caret = svgTextCaret(svgDrag.text, event.clientX, event.clientY)
      if (!caret) return
      document.getSelection()?.setBaseAndExtent(svgDrag.anchor.node, svgDrag.anchor.offset, caret.node, caret.offset)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      dragging = true
      moved = false
      window.dispatchEvent(new CustomEvent("storeshot:selection-owner", { detail: document }))
      onSelection(null)
      const text = (event.target as Element | null)?.closest("svg text")
      const anchor = text && svgTextCaret(text, event.clientX, event.clientY)
      if (text && anchor) {
        svgDrag = { text, anchor }
        const target = event.target as Element
        target.setPointerCapture(event.pointerId)
        frame?.contentWindow?.focus()
        updateSvg(event)
      }
    }
    const onMouseDown = (event: MouseEvent) => { if (svgDrag) event.preventDefault() }
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return
      moved = true
      updateSvg(event)
    }
    const onPointerUp = () => { if (!dragging) return; dragging = false; svgDrag = null; selected() }
    const onSelectionChange = () => { if (!dragging) selected() }
    const onDocumentClick = (event: MouseEvent) => { if (!moved) clicked(event) }
    const onDoubleClick = (event: MouseEvent) => {
      const text = (event.target as Element | null)?.closest("svg text")
      const caret = text && svgTextCaret(text, event.clientX, event.clientY)
      if (!caret) return
      const words = new Intl.Segmenter(undefined, { granularity: "word" }).segment(caret.node.data)
      const word = words.containing(Math.min(caret.offset, caret.node.length - 1))
      if (!word) return
      document.getSelection()?.setBaseAndExtent(caret.node, word.index, caret.node, word.index + word.segment.length)
      selected()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear()
      shortcut(event)
    }
    window.addEventListener("storeshot:selection-owner", otherOwner)
    document.addEventListener("pointermove", onPointerMove)
    document.addEventListener("mousedown", onMouseDown)
    window.addEventListener("pointerup", onPointerUp)
    document.addEventListener("selectionchange", onSelectionChange)
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("pointerup", onPointerUp)
    document.addEventListener("click", onDocumentClick)
    document.addEventListener("dblclick", onDoubleClick)
    document.addEventListener("pointercancel", clear)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      style.remove()
      document.getSelection()?.removeAllRanges()
      window.removeEventListener("storeshot:selection-owner", otherOwner)
      document.removeEventListener("pointermove", onPointerMove)
      document.removeEventListener("mousedown", onMouseDown)
      window.removeEventListener("pointerup", onPointerUp)
      document.removeEventListener("selectionchange", onSelectionChange)
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("pointerup", onPointerUp)
      document.removeEventListener("click", onDocumentClick)
      document.removeEventListener("dblclick", onDoubleClick)
      document.removeEventListener("pointercancel", clear)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [document, selectable, visible, annotating])
  return (
    <iframe
      ref={setFrame}
      aria-hidden={!visible}
      title={area.name}
      tabIndex={selectable && visible ? 0 : -1}
      sandbox={selectable ? "allow-same-origin" : ""}
      src={`/artboards/sets/${set.id}/${area.id}.html?revision=${encodeURIComponent(revision)}${selectable ? "&preview=selectable" : ""}`}
      className={cn("absolute top-0 left-0 block border-0 bg-white", (!selectable || !visible || !document) && "pointer-events-none")}
      style={{ width: set.canvas.width, height: set.canvas.height, transform: `scale(${scale})`, transformOrigin: "top left", opacity: visible ? 1 : 0 }}
      onLoad={event => {
        if (selectable) {
          try { setDocument(event.currentTarget.contentDocument) } catch { /* An older preview server keeps its opaque sandbox. */ }
        }
        onLoad()
      }}
    />
  )
}

/**
 * Quiet status line beneath the artwork. It stays mounted so it can fade out,
 * and waits briefly before showing “Updating” so quick refreshes only confirm.
 */
function PreviewStatus({ state }: { state: PreviewState }) {
  const loading = state === "loading"
  return (
    <span
      aria-hidden
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-[11px] leading-none font-medium whitespace-nowrap text-muted-foreground select-none",
        "transition-[opacity,translate] ease-out",
        state === "ready" ? "translate-y-0.5 opacity-0 duration-500" : "translate-y-0 opacity-100 duration-200",
        loading && "delay-150",
      )}
    >
      <svg viewBox="0 0 16 16" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="size-3.5 shrink-0">
        <circle
          cx="8"
          cy="8"
          r="6.25"
          className={cn(
            "transition-[fill,stroke] duration-300",
            loading
              ? "fill-transparent stroke-muted-foreground/25"
              : "fill-emerald-500/12 stroke-emerald-500/30 dark:fill-emerald-400/15 dark:stroke-emerald-400/30",
          )}
        />
        <circle
          cx="8"
          cy="8"
          r="6.25"
          pathLength={1}
          strokeDasharray="0.28 1"
          className={cn(
            "origin-center stroke-muted-foreground transition-opacity duration-150 [transform-box:fill-box]",
            state !== "ready" && "animate-[spin_1.1s_linear_infinite] motion-reduce:animate-none",
            loading ? "opacity-100" : "opacity-0",
          )}
        />
        <path
          d="M5.4 8.3 7.15 10l3.45-3.8"
          pathLength={1}
          strokeDasharray={1}
          className={cn(
            "stroke-emerald-600 dark:stroke-emerald-400",
            loading ? "transition-none" : "transition-[stroke-dashoffset] delay-100 duration-300 ease-out",
          )}
          style={{ strokeDashoffset: loading ? 1 : 0 }}
        />
      </svg>
      <span className="truncate">{loading ? "Updating…" : "Updated"}</span>
    </span>
  )
}
