import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header
      className={cn(
        "shrink-0 border-b bg-background px-6 pt-6 lg:px-8",
        !children && "pb-6",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-full flex-1 basis-64">
          {typeof title === "string" ? (
            <h1 className="text-2xl font-semibold tracking-tight">
              {title}
            </h1>
          ) : (
            title
          )}
          {description && (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {children}
    </header>
  )
}
