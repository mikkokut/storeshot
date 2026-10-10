import { useState } from "react"
import { LoaderCircle, Plus } from "lucide-react"
import { request, messageFor } from "@/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LocalePicker } from "@/LocalePicker"
import { appStoreLocale } from "@/app-store-locales"
import { creationSize, type AssetSpec } from "../app-store"
import type { ScreenshotSet } from "../shared"

export function Choice({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string
  value: string
  options: { value: string; label: string; disabled?: boolean }[]
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        disabled={disabled}
        value={value}
        onValueChange={(value) => {
          if (value) onChange(value)
        }}
      >
        <SelectTrigger
          aria-label={label}
          className="w-full"
        >
          <SelectValue>
            {options.find((option) => option.value === value)?.label ?? value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
export function CreateSetDialog({
  spec,
  pageId,
  locale,
  onCreate,
  sets,
  label = "Create",
}: {
  spec: AssetSpec
  pageId: string
  locale: string
  onCreate: (set: ScreenshotSet) => void | Promise<void>
  label?: string
  sets: ScreenshotSet[]
}) {
  const [open, setOpen] = useState(false)
  const [language, setLanguage] = useState(locale || "en-US")
  const selectedLocale = locale || language
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [width, height] = creationSize(spec, sets)
  const isScreenshot = spec.kind === "screenshots"
  async function create() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const set = await request<ScreenshotSet>("/api/sets", {
        method: "POST",
        body: JSON.stringify({
          pageId,
          locale: selectedLocale,
          specId: spec.id,
          name: spec.name,
          device: spec.name,
          width,
          height,
        }),
      })
      await onCreate(set)
      setOpen(false)
    } catch (error) {
      setError(messageFor(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (busy) return
      setError(null)
      setOpen(next)
    }}>
      <DialogTrigger render={<Button />}>
        <Plus />
        {label}
      </DialogTrigger>
      <DialogContent
        render={
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
          />
        }
      >
        <DialogHeader>
          <DialogTitle>{spec.name}</DialogTitle>
          <DialogDescription>{spec.guidance}</DialogDescription>
        </DialogHeader>
        {!locale && (
          <Field>
            <FieldLabel htmlFor="artwork-language">Language</FieldLabel>
            <LocalePicker
              id="artwork-language"
              value={language}
              onValueChange={setLanguage}
              disabled={busy}
            />
          </Field>
        )}
        <div className="rounded-xl bg-muted/60 px-4 py-3 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
            <dt className="text-muted-foreground">Language</dt>
            <dd className="text-right">
              {appStoreLocale(selectedLocale).name}
            </dd>
            <dt className="text-muted-foreground">Export size</dt>
            <dd className="text-right tabular-nums">
              {width} × {height} px
            </dd>
            <dt className="text-muted-foreground">Format</dt>
            <dd className="text-right">PNG</dd>
          </dl>
          {(spec.id === "watch" && sets.some((set) => set.specId === "watch")) ||
          spec.id === "iphone" ||
          spec.id === "ipad" ? (
            <p className="mt-3 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
              {spec.id === "watch"
                ? "Matches your other Apple Watch screenshots."
                : "App Store Connect scales these for smaller displays."}
            </p>
          ) : null}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>
            Cancel
          </DialogClose>
          <Button type="submit" disabled={busy}>
            {busy && <LoaderCircle className="animate-spin" />}
            {busy
              ? "Creating…"
              : isScreenshot
                ? "Create screenshots"
                : "Create artwork"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
