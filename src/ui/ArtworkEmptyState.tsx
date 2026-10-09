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
    <div className="flex min-h-[380px] flex-col items-center justify-center rounded-2xl border border-dashed bg-background/70 px-6 py-12 text-center">
      <div aria-hidden className="relative mb-7 flex h-24 w-36 items-center justify-center">
        <div className="absolute h-20 w-14 -translate-x-8 -rotate-12 rounded-lg border bg-muted/40" />
        <div className="absolute h-20 w-14 translate-x-8 rotate-12 rounded-lg border bg-muted/40" />
        <div className="relative grid h-24 w-[70px] place-items-center rounded-xl border bg-background shadow-sm">
          <ImagePlus className="size-7 stroke-[1.3] text-muted-foreground" />
        </div>
      </div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      {metadata && <p className="mt-3 text-xs text-muted-foreground">{metadata}</p>}
      <div className="mt-6">{actions}</div>
      {footer && <p className="mt-3 text-xs text-muted-foreground">{footer}</p>}
    </div>
  )
}
