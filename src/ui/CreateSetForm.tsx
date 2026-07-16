import { useEffect, useId, useState, type FormEvent } from "react"
import { MonitorSmartphone, Plus } from "lucide-react"

import { request, messageFor } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DEVICE_PRESETS, type DeviceName } from "@/device-presets"
import { LocalePicker } from "@/LocalePicker"
import type { ScreenshotSet } from "../shared"

interface CreateSetDialogProps {
  onCreate: (set: ScreenshotSet) => void
}

export function CreateSetDialog({ onCreate }: CreateSetDialogProps) {
  const [open, setOpen] = useState(false)
  const triggerId = useId()
  const nameId = useId()
  const localeId = useId()
  const deviceId = useId()
  const [name, setName] = useState("English iPhone")
  const [locale, setLocale] = useState("en-US")
  const [device, setDevice] = useState<DeviceName>("iPhone")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const preset = DEVICE_PRESETS.find((candidate) => candidate.device === device) ?? DEVICE_PRESETS[0]

  useEffect(() => {
    if (!open) return
    setName("English iPhone")
    setLocale("en-US")
    setDevice("iPhone")
    setError(null)
  }, [open])

  function changeDevice(nextDevice: DeviceName) {
    if (name === `English ${device}`) setName(`English ${nextDevice}`)
    setDevice(nextDevice)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const set = await request<ScreenshotSet>("/api/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, locale, device, width: preset.width, height: preset.height }),
      })
      onCreate(set)
      setOpen(false)
    } catch (nextError) {
      setError(messageFor(nextError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} triggerId={open ? triggerId : null} onOpenChange={setOpen}>
      <DialogTrigger
        id={triggerId}
        render={<Button aria-label="New screenshot set" size="icon" type="button" variant="ghost" />}
      >
        <Plus className="size-4" />
      </DialogTrigger>
      <DialogContent className="max-w-xl gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pr-14 pb-5">
          <div className="mb-2 grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
            <MonitorSmartphone className="size-5" />
          </div>
          <DialogTitle>Create a screenshot set</DialogTitle>
          <DialogDescription>
            A set contains the ordered screenshots for one language and device combination.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="space-y-5 px-6 pb-6">
            <Field>
              <FieldLabel htmlFor={nameId}>Set name</FieldLabel>
              <Input id={nameId} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={localeId}>Language / locale</FieldLabel>
                <LocalePicker id={localeId} value={locale} onValueChange={setLocale} />
              </Field>
              <Field>
                <FieldLabel htmlFor={deviceId}>Device</FieldLabel>
                <Select value={device} onValueChange={(value) => changeDevice(value as DeviceName)}>
                  <SelectTrigger className="w-full" id={deviceId}>
                    <SelectValue>{device}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start">
                    {DEVICE_PRESETS.map((option) => (
                      <SelectItem key={option.device} value={option.device}>{option.device}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel>Screenshot dimensions</FieldLabel>
              <div className="flex items-baseline justify-between rounded-lg border bg-muted/30 px-3 py-2">
                <span className="text-sm font-medium">{preset.width} × {preset.height} px</span>
                <span className="text-xs text-muted-foreground">{preset.width > preset.height ? "Landscape" : "Portrait"}</span>
              </div>
              <FieldDescription>
                Apple’s current highest-resolution accepted size for {device}. The dimensions are saved with this set.
              </FieldDescription>
            </Field>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          </div>
          <div className="flex justify-end gap-2 border-t bg-muted/30 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={busy || !name.trim() || !locale.trim() || !device.trim()} type="submit">
              {busy ? "Creating…" : "Create set"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
