import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { ScreenshotArea, ScreenshotSet } from "../shared"

type PreviewState = "loading" | "updated" | "ready"

/** Keep the last loaded artwork visible while its changed revision loads behind it. */
export function ArtworkPreview({ set, area, scale, frameClassName, children, decorative = false }: {
  set: ScreenshotSet
  area: ScreenshotArea
  scale: number
  frameClassName: string
  children?: ReactNode
  decorative?: boolean
}) {
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
  return (
    <div className="w-full" data-preview-state={state}>
      <div className={`relative overflow-hidden ${frameClassName}`} style={{ width: set.canvas.width * scale, height: set.canvas.height * scale }}>
      {[...new Set([loaded, revision])].map(value => (
        <iframe
          key={value}
          aria-hidden={decorative || value !== loaded}
          title={area.name}
          tabIndex={-1}
          sandbox=""
          src={`/artboards/sets/${set.id}/${area.id}.html?revision=${value}`}
          className="absolute top-0 left-0 block border-0 bg-white pointer-events-none"
          style={{
            width: set.canvas.width,
            height: set.canvas.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            opacity: value === loaded ? 1 : 0,
          }}
          onLoad={() => {
            if (value !== latest.current || value === loaded) return
            setLoaded(value)
            setUpdated(true)
          }}
        />
      ))}
      </div>
      {children}
      <div className="flex h-6 min-w-0 items-center overflow-hidden pt-1">
        <PreviewStatus state={state} />
        <span role="status" className="sr-only">
          {state === "updated" ? `${area.name} updated` : ""}
        </span>
      </div>
    </div>
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
