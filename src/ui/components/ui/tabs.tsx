import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cn } from "@/lib/utils"

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
}: TabsPrimitive.List.Props & { variant?: "default" | "icon" }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("flex gap-6", variant === "icon" && "min-w-max gap-0 border-b", className)}
      {...props}
    />
  )
}
export function TabsTrigger({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.Tab.Props & { variant?: "default" | "icon" }) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-11 items-center justify-center border-b-2 border-transparent bg-transparent text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-active:border-primary data-active:font-semibold data-active:text-foreground",
        variant === "icon" && "h-22 shrink-0 gap-3 px-5 pb-5 text-left first:pl-0 after:absolute after:top-2 after:right-0 after:h-9 after:w-px after:bg-border last:after:hidden",
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
