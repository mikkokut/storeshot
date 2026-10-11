import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { appStoreLocale } from "@/app-store-locales"
import type { AssetSpec } from "../app-store"
import type { ProductPage } from "../shared"

export function AgentPrompt({
  page,
  spec,
  locale,
}: {
  page?: ProductPage
  spec?: AssetSpec
  locale?: string
}) {
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null)
  const [copyError, setCopyError] = useState(false)
  const destination = spec
    ? `${spec.name} ${spec.kind === "screenshots" ? "screenshots" : "artwork"}`
    : "App Store screenshots"
  const prompt = `Use the StoreShot skill to create ${destination}${page ? ` for the ${JSON.stringify(page.name)} product page` : " for my app"}${locale ? ` in ${appStoreLocale(locale).name} (${locale})` : ""}.`
  const copied = copiedPrompt === prompt

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopiedPrompt(prompt)
      setCopyError(false)
    } catch {
      setCopiedPrompt(null)
      setCopyError(true)
    }
  }

  return (
    <section
      aria-label="Work with your agent"
      className="w-full max-w-xl text-left"
    >
      <div className="rounded-xl border bg-muted/30 p-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Suggested prompt</p>
        <p className="select-text whitespace-pre-wrap break-words text-sm leading-relaxed">{prompt}</p>
        <div className="mt-3 flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => void copyPrompt()}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copied prompt" : "Copy prompt"}
          </Button>
          <span role="status" className="text-xs text-muted-foreground">
            {copyError ? "Select and copy the prompt above." : copied ? "Ready to paste into your agent." : ""}
          </span>
        </div>
      </div>
    </section>
  )
}
