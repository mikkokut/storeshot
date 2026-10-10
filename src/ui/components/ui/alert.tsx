import type { ComponentProps } from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative grid w-full gap-1 border text-sm has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2.5 has-[>svg]:[&>[data-slot=alert-title]]:col-start-2 has-[>svg]:[&>[data-slot=alert-description]]:col-start-2 [&>svg]:mt-0.5 [&>svg]:size-4",
  {
    variants: {
      variant: {
        default: "border-border bg-background text-foreground",
        muted: "border-border bg-muted/60 text-foreground [&>svg]:text-muted-foreground",
        destructive: "border-destructive/20 bg-destructive/5 text-destructive",
      },
      layout: {
        inline: "rounded-lg px-3.5 py-2.5",
        banner: "shrink-0 rounded-none border-x-0 border-t-0 px-6 py-2.5 lg:px-8",
      },
    },
    defaultVariants: { variant: "default", layout: "inline" },
  },
)

function Alert({ className, variant, layout, ...props }: ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant, layout }), className)} {...props} />
}

function AlertTitle({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("font-medium leading-none", className)} {...props} />
}

function AlertDescription({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("text-sm leading-relaxed [&_p]:leading-relaxed", className)} {...props} />
}

export { Alert, AlertDescription, AlertTitle }
