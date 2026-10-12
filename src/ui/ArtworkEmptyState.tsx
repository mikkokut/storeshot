import type { ReactNode } from "react"
import { ImagePlus } from "lucide-react"

export function ArtworkEmptyState({
  title,
  description,
  metadata,
  actions,
  footer,
}: {
  title: string
  description: ReactNode
  metadata?: ReactNode
  actions: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-input bg-muted/30 px-6 py-12 text-center">
      <div aria-hidden className="relative mb-6 flex h-20 w-32 items-center justify-center">
        <div className="absolute h-16 w-12 -translate-x-7 -rotate-12 rounded-lg border bg-background/70" />
        <div className="absolute h-16 w-12 translate-x-7 rotate-12 rounded-lg border bg-background/70" />
        <div className="relative grid h-20 w-[60px] place-items-center rounded-xl border bg-background shadow-sm">
          <ImagePlus className="size-6 stroke-[1.5] text-muted-foreground" />
        </div>
      </div>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-pretty text-muted-foreground">{description}</p>
      {metadata && <p className="mt-3 text-xs text-muted-foreground tabular-nums">{metadata}</p>}
      <div className="mt-6 flex w-full flex-wrap justify-center gap-2">{actions}</div>
      {footer && <p className="mt-4 text-xs text-muted-foreground">{footer}</p>}
    </div>
  )
}
