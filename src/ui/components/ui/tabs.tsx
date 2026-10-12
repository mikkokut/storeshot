import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cn } from "@/lib/utils"

type TabsVariant = "default" | "segmented" | "icon"

export function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col", className)}
      {...props}
    />
  )
}
export function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & { variant?: TabsVariant }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        "flex",
        variant === "default" && "gap-6",
        variant === "segmented" &&
          "inline-flex h-8 w-fit items-center gap-0.5 rounded-lg bg-muted p-0.5",
        variant === "icon" &&
          "w-fit min-w-max gap-1 rounded-xl bg-muted p-1",
        className,
      )}
      {...props}
    />
  )
}
export function TabsTrigger({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.Tab.Props & { variant?: TabsVariant }) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-[color,background-color,box-shadow] select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-active:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0",
        variant === "default" &&
          "h-11 gap-2 rounded-t-sm border-b-2 border-transparent data-active:border-foreground",
        variant === "segmented" &&
          "h-7 gap-1.5 rounded-md px-3 text-[13px] data-active:bg-background data-active:shadow-xs data-active:ring-1 data-active:ring-foreground/5",
        variant === "icon" &&
          "h-12 justify-start gap-2.5 rounded-lg px-3 text-left hover:bg-background/60 data-active:bg-background data-active:shadow-xs data-active:ring-1 data-active:ring-foreground/5",
        className,
      )}
      {...props}
    />
  )
}
export function TabsContent({
  className,
  ...props
}: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("min-h-0 flex-1 outline-none", className)}
      {...props}
    />
  )
}
