import { useState } from "react"
import { Plus } from "lucide-react"
import { request, messageFor } from "@/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { creationSize, type AssetSpec } from "../app-store"
import type { ScreenshotSet } from "../shared"

export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        value={value}
        onValueChange={(value) => {
          if (value) onChange(value)
        }}
      >
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue>
            {options.find((option) => option.value === value)?.label ?? value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
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
  async function create() {
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus />
        {label}
      </DialogTrigger>
      <DialogContent className="p-6">
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
            />
          </Field>
        )}
        <p className="text-sm">
          Export size: {width} × {height} px.
          {spec.id === "watch" && sets.some((set) => set.specId === "watch")
            ? " Matches your other Apple Watch screenshots."
            : spec.id === "iphone" || spec.id === "ipad"
              ? " App Store Connect scales these for smaller displays."
              : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          {selectedLocale} · {width} × {height} px · PNG export
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button disabled={busy} onClick={() => void create()}>
          {busy ? "Creating…" : "Create artwork"}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
