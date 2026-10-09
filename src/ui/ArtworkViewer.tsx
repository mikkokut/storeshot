import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ScreenshotSet, StoreShotProject } from "../shared"

export function ArtworkViewer({
  set,
  project,
  onClose,
}: {
  set: ScreenshotSet
  project: StoreShotProject
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
  const stamp = useMemo(() => Date.now(), [project])
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none">
        <header className="shrink-0 border-b bg-background px-6 py-4 pr-16">
          <DialogTitle>{set.name}</DialogTitle>
          <DialogDescription className="mt-1">
            {set.areas.length} {set.areas.length === 1 ? "image" : "images"} ·{" "}
            {set.canvas.width} × {set.canvas.height} px
          </DialogDescription>
        </header>
        <div
          ref={setViewport}
          className="min-h-0 flex-1 overflow-auto bg-muted/25 p-6"
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
                <figcaption className="mb-3 text-sm text-muted-foreground">
                  {String(index + 1).padStart(2, "0")} · {area.name}
                </figcaption>
                <div
                  className="overflow-hidden bg-white"
                  style={{
                    width: set.canvas.width * scale,
                    height: set.canvas.height * scale,
                  }}
                >
                  <iframe
                    title={area.name}
                    tabIndex={-1}
                    sandbox=""
                    src={`/artboards/sets/${set.id}/${area.id}.html?revision=${stamp}`}
                    className="block border-0 bg-white pointer-events-none"
                    style={{
                      width: set.canvas.width,
                      height: set.canvas.height,
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                    }}
                  />
                </div>
              </figure>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
