import { createContext, useContext, useEffect, useEffectEvent, useRef, useState, type FormEvent, type ReactNode } from "react"
import { CircleAlert, CircleCheck, Copy, ListTodo, MessageSquarePlus, Trash2 } from "lucide-react"
import { assetSpec, DEVICE_LABELS } from "../app-store"
import type { ArtworkAnnotationContext, ScreenshotArea, ScreenshotSet, StoreShotProject } from "../shared"
import { annotationPrompt, annotationTarget, isTypingTarget, readAnnotations, type AnnotationTarget, type ScreenshotAnnotation } from "@/annotation-prompt"
import { appStoreLocale } from "@/app-store-locales"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { request } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const MAC = /Mac|iPhone|iPad/.test(navigator.platform)
const COPY_SHORTCUT = MAC
  ? { label: "⌘⇧C", keys: "Meta+Shift+C" }
  : { label: "Ctrl+Shift+C", keys: "Control+Shift+C" }

interface AnnotationContextValue {
  active: boolean
  queue: ScreenshotAnnotation[]
  toggle: () => void
  remove: (id: string) => void
  copyPrompt: () => Promise<void>
  open: boolean
  setOpen: (open: boolean) => void
  copying: boolean
  copyFailed: boolean
  storageUnavailable: boolean
  handleShortcut: (event: KeyboardEvent) => void
  begin: (set: ScreenshotSet, area: ScreenshotArea, point?: AnnotationTarget["point"], selectedText?: string) => void
}
const AnnotationContext = createContext<AnnotationContextValue | null>(null)
export const useAnnotations = () => useContext(AnnotationContext)

/** Human-readable context for a screenshot; stable IDs stay in the copied prompt. */
function screenshotContext(item: AnnotationTarget) {
  const spec = assetSpec(item.specId)
  return [
    item.pageName,
    appStoreLocale(item.locale).name,
    spec && spec.device !== "creative" ? DEVICE_LABELS[spec.device] : item.device,
  ].join(" · ")
}

export function AnnotationProvider({ project, children }: { project: StoreShotProject; children: ReactNode }) {
  const storageKey = `storeshot:annotations:v1:${project.directory}`
  const [queue, setQueue] = useState<ScreenshotAnnotation[]>(() => {
    try { return readAnnotations(localStorage.getItem(storageKey)) } catch { return [] }
  })
  const [active, setActive] = useState(false)
  const [target, setTarget] = useState<AnnotationTarget | null>(null)
  const [comment, setComment] = useState("")
  const [capturing, setCapturing] = useState(false)
  const captureRequest = useRef(0)
  const [open, setOpenState] = useState(false)
  const [copying, setCopying] = useState(false)
  const copyingRef = useRef(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [storageUnavailable, setStorageUnavailable] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(queue))
      setStorageUnavailable(false)
    } catch {
      setStorageUnavailable(true)
    }
  }, [queue, storageKey])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  function setOpen(value: boolean) {
    setOpenState(value)
    if (!value) setCopyFailed(false)
  }
  async function copyPrompt() {
    if (!queue.length || copyingRef.current) return
    const copied = queue
    copyingRef.current = true
    setCopying(true)
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(annotationPrompt(project.directory, copied.map(item => ({
        ...item,
        htmlPath: project.sets.find(set => set.id === item.setId)?.areas.find(area => area.id === item.areaId)?.htmlPath ?? item.htmlPath,
      }))))
      const ids = new Set(copied.map(item => item.id))
      setQueue(current => current.filter(item => !ids.has(item.id)))
      setOpenState(false)
      setNotice("Prompt copied. Paste it into your coding agent.")
    } catch {
      setCopyFailed(true)
      setOpenState(true)
    } finally {
      copyingRef.current = false
      setCopying(false)
    }
  }
  function begin(set: ScreenshotSet, area: ScreenshotArea, point?: AnnotationTarget["point"], selectedText?: string) {
    const page = project.config.pages.find(page => page.id === set.pageId)
    if ((!active && !selectedText?.trim()) || !page || assetSpec(set.specId)?.kind !== "screenshots") return
    const selected = { ...annotationTarget(page, set, area, point), ...(selectedText ? { selectedText } : {}) }
    setTarget(selected)
    const requestId = ++captureRequest.current
    setCapturing(!!point)
    if (point) {
      void request<ArtworkAnnotationContext>(`/api/sets/${encodeURIComponent(set.id)}/areas/${encodeURIComponent(area.id)}/annotation-context`, {
        method: "POST", body: JSON.stringify(point), signal: AbortSignal.timeout(8000),
      }).then(context => {
        setTarget(current => current === selected ? { ...current, context } : current)
      }).catch(() => {
        // The file and clicked point remain usable if Chrome/context capture fails.
      }).finally(() => { if (captureRequest.current === requestId) setCapturing(false) })
    }
    setComment("")
    setOpen(false)
  }
  function addComment(event: FormEvent) {
    event.preventDefault()
    const text = comment.trim()
    if (!target || !text || capturing) return
    setQueue(current => [...current, { ...target, id: crypto.randomUUID(), comment: text }])
    setTarget(null)
    setNotice(null)
  }

  function handleShortcut(event: KeyboardEvent) {
    if (event.key === "Escape" && !event.isComposing) {
      setActive(false)
      return
    }
    if (event.defaultPrevented || event.repeat || event.isComposing || isTypingTarget(event.target) || target) return
    const key = event.key.toLowerCase()
    if (key === "a" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      event.preventDefault()
      setActive(value => !value)
    }
    const copyModifier = MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
    if (key === "c" && event.shiftKey && !event.altKey && copyModifier && queue.length) {
      event.preventDefault()
      void copyPrompt()
    }
  }
  const keydown = useEffectEvent(handleShortcut)
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keydown(event)
    window.addEventListener("keydown", listener, true)
    return () => window.removeEventListener("keydown", listener, true)
  }, [])

  const context: AnnotationContextValue = {
    active, queue, begin, handleShortcut, open, setOpen, copying, copyFailed, storageUnavailable, copyPrompt,
    toggle: () => { setActive(value => !value); setNotice(null) },
    remove: id => setQueue(current => current.filter(item => item.id !== id)),
  }

  return (
    <AnnotationContext value={context}>
      {children}
      {active && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
          <Alert role="status" className="w-fit max-w-sm rounded-xl bg-popover text-popover-foreground shadow-lg">
            <MessageSquarePlus aria-hidden />
            <AlertTitle>Annotating</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              Click a screenshot to add a comment. Press <Kbd>Esc</Kbd> to finish.
            </AlertDescription>
          </Alert>
        </div>
      )}
      <div role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4">
        {notice && (
          <p className="flex items-center gap-2 rounded-xl bg-popover px-3.5 py-2.5 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 animate-in fade-in-0 slide-in-from-bottom-2">
            <CircleCheck aria-hidden className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            {notice}
          </p>
        )}
      </div>
      {target && (
        <Dialog open onOpenChange={value => { if (!value) setTarget(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Comment on {target.areaName}</DialogTitle>
              <DialogDescription>{screenshotContext(target)}</DialogDescription>
            </DialogHeader>
            {target.selectedText && (
              <blockquote className="max-h-32 overflow-auto border-l-2 pl-3 text-sm text-muted-foreground whitespace-pre-wrap">{target.selectedText}</blockquote>
            )}
            <form className="grid gap-5" onSubmit={addComment}>
              <div className="grid gap-2">
                <Textarea
                  aria-label="Comment"
                  autoFocus
                  value={comment}
                  onChange={event => setComment(event.target.value)}
                  onKeyDown={event => {
                    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return
                    event.preventDefault()
                    if (!event.repeat) event.currentTarget.form?.requestSubmit()
                  }}
                  placeholder="What should change?"
                  className="min-h-28"
                />
                <p className="text-xs text-muted-foreground">
                  <Kbd>Enter</Kbd> to add · <Kbd>Shift + Enter</Kbd> for a new line
                </p>
              </div>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
                <Button type="submit" disabled={!comment.trim() || capturing}>{capturing ? "Capturing target…" : "Add to queue"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </AnnotationContext>
  )
}

const sidebarItem = "h-8 w-full justify-start gap-2.5 px-2.5 text-left font-normal text-sidebar-foreground/80 shadow-none hover:bg-sidebar-accent/60 hover:text-sidebar-foreground aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-foreground [&_svg]:text-muted-foreground"
const sidebarKbd = "ml-auto bg-sidebar-accent"

export function AnnotationSidebar() {
  const annotations = useAnnotations()
  if (!annotations) return null
  const { active, queue, toggle, remove, open, setOpen, copying, copyFailed, storageUnavailable, copyPrompt } = annotations
  return (
    <div className="shrink-0 space-y-0.5 border-t px-2.5 py-3">
      <Button
        variant="ghost"
        aria-pressed={active}
        aria-keyshortcuts="A"
        className={cn(sidebarItem, active && "bg-background font-medium text-sidebar-foreground shadow-xs ring-1 ring-foreground/10 hover:bg-background [&_svg]:text-sidebar-foreground")}
        onClick={toggle}
      >
        <MessageSquarePlus />
        <span className="truncate">Annotate</span>
        <Kbd className={sidebarKbd}>A</Kbd>
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button variant="ghost" className={sidebarItem} />}>
          <ListTodo />
          <span className="truncate">Prompt queue</span>
          {queue.length > 0 && (
            <Badge variant="outline" className="ml-auto min-w-5 px-1.5">
              {queue.length}
              <span className="sr-only">{queue.length === 1 ? "comment" : "comments"}</span>
            </Badge>
          )}
        </PopoverTrigger>
        <PopoverContent side="right" align="end" sideOffset={12} className="w-88">
          <PopoverHeader>
            <PopoverTitle>Prompt queue</PopoverTitle>
            <PopoverDescription>
              {queue.length
                ? "Copy your comments as one prompt for your coding agent. Copied comments leave the queue."
                : "No comments yet. Turn on Annotate, then click a screenshot."}
            </PopoverDescription>
          </PopoverHeader>
          {queue.length > 0 && (
            <>
              <ol className="-mx-4 max-h-[min(50dvh,24rem)] divide-y overflow-y-auto border-y px-4">
                {queue.map((item, index) => (
                  <li key={item.id} className="flex items-start gap-3 py-3">
                    <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground tabular-nums">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-xs font-medium">{item.areaName}</p>
                      <p className="mt-0.5 break-words text-[11px] leading-relaxed text-muted-foreground">{screenshotContext(item)}</p>
                      <p className="mt-1.5 text-sm leading-relaxed break-words whitespace-pre-wrap">{item.comment}</p>
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="-mt-1 -mr-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remove comment ${index + 1}`}
                      title="Remove"
                      onClick={() => remove(item.id)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ol>
              <div className="grid gap-3">
                {copyFailed && (
                  <p role="alert" className="flex gap-2 text-[13px] leading-relaxed text-destructive">
                    <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    Couldn’t copy to the clipboard. Your comments are still here, so try again.
                  </p>
                )}
                {storageUnavailable && (
                  <p className="flex gap-2 text-[13px] leading-relaxed text-muted-foreground">
                    <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    This browser can’t save comments. Copy them before you close the tab.
                  </p>
                )}
                <Button className="w-full" disabled={copying} aria-keyshortcuts={COPY_SHORTCUT.keys} onClick={() => void copyPrompt()}>
                  <Copy />
                  {copying ? "Copying…" : "Copy prompt"}
                  <Kbd className="ml-1 bg-primary-foreground/15 text-primary-foreground">{COPY_SHORTCUT.label}</Kbd>
                </Button>
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>
      {queue.length > 0 && (
        <p className="flex h-7 items-center px-2.5 text-xs text-muted-foreground">
          Copy prompt
          <Kbd className={sidebarKbd}>{COPY_SHORTCUT.label}</Kbd>
        </p>
      )}
    </div>
  )
}
