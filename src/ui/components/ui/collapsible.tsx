"use client"

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"

import { cn } from "@/lib/utils"

const Collapsible = CollapsiblePrimitive.Root

function CollapsibleTrigger({ className, ...props }: CollapsiblePrimitive.Trigger.Props) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" className={cn(className)} {...props} />
}

function CollapsibleContent({ className, ...props }: CollapsiblePrimitive.Panel.Props) {
  return <CollapsiblePrimitive.Panel data-slot="collapsible-content" className={cn(className)} {...props} />
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger }
