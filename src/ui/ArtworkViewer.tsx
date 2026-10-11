import { useEffect, useState } from "react"
import { ArtworkPreview } from "@/ArtworkPreview"
import { appStoreLocale } from "@/app-store-locales"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ScreenshotSet } from "../shared"

export function ArtworkViewer({
  set,
  onClose,
}: {
  set: ScreenshotSet
  onClose: () => void
}) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const [bounds, setBounds] = useState({
    width: window.innerWidth,
    height: window.innerHeight - 80,
  })
  useEffect(() => {
    if (!viewport) return
    const update = () =>
      setBounds({ width: viewport.clientWidth, height: viewport.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [viewport])
  const scale = Math.min(
    1,
    Math.max(1, bounds.width - 48) / set.canvas.width,
    Math.max(1, bounds.height - 100) / set.canvas.height,
  )
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="top-0 left-0 flex h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0 ring-0">
        <header className="shrink-0 border-b bg-background px-6 py-4 pr-16">
          <DialogTitle>{set.name}</DialogTitle>
          <DialogDescription className="mt-0.5 text-[13px] tabular-nums">
            {set.areas.length} {set.areas.length === 1 ? "image" : "images"} ·{" "}
            {set.canvas.width} × {set.canvas.height} px ·{" "}
            {appStoreLocale(set.locale).name}
          </DialogDescription>
        </header>
        <div
          ref={setViewport}
          className="min-h-0 flex-1 overflow-auto bg-muted/60 p-6 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
          tabIndex={0}
          aria-label="Artwork preview"
        >
          <div className="flex w-max items-start gap-6">
            {set.areas.map((area, index) => (
              <figure
                key={area.id}
                className="shrink-0"
                style={{ width: set.canvas.width * scale }}
              >
                <figcaption className="mb-2.5 truncate text-[13px]">
                  <span className="mr-1.5 text-muted-foreground tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {area.name}
                </figcaption>
                <ArtworkPreview
                  set={set}
                  area={area}
                  scale={scale}
                  frameClassName="bg-white shadow-sm ring-1 ring-black/5"
                />
              </figure>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
