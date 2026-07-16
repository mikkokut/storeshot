import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full aria-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "relative z-20 flex w-px items-center justify-center bg-transparent ring-offset-background [--resize-line:1px] before:absolute before:inset-y-0 before:right-0 before:w-[var(--resize-line)] before:bg-border before:transition-[width,height,background-color] data-[separator=active]:[--resize-line:2px] data-[separator=active]:before:bg-ring/70 data-[separator=hover]:[--resize-line:2px] data-[separator=hover]:before:bg-muted-foreground/35 focus-visible:[--resize-line:2px] focus-visible:outline-hidden focus-visible:before:bg-ring/70 aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:before:inset-x-0 aria-[orientation=horizontal]:before:inset-y-auto aria-[orientation=horizontal]:before:bottom-0 aria-[orientation=horizontal]:before:h-[var(--resize-line)] aria-[orientation=horizontal]:before:w-full [&[aria-orientation=horizontal]>div]:rotate-90",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-6 w-1 shrink-0 rounded-lg bg-border" />
      )}
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
