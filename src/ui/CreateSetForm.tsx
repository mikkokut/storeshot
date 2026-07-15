import { useState, type FormEvent } from "react"
import { ArrowLeft, MonitorSmartphone } from "lucide-react"

import { request, messageFor } from "@/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { ScreenshotSet } from "../shared"

interface CreateSetFormProps {
  onCancel: () => void
  onCreate: (set: ScreenshotSet) => void
}

export function CreateSetForm({ onCancel, onCreate }: CreateSetFormProps) {
  const [name, setName] = useState("English iPhone")
  const [locale, setLocale] = useState("en-US")
  const [device, setDevice] = useState("iPhone")
  const [width, setWidth] = useState(1290)
  const [height, setHeight] = useState(2796)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const set = await request<ScreenshotSet>("/api/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, locale, device, width, height }),
      })
      onCreate(set)
    } catch (nextError) {
      setError(messageFor(nextError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-8">
      <Button className="mb-6" variant="ghost" onClick={onCancel}>
        <ArrowLeft className="size-4" />
        Back to sets
      </Button>
      <Card>
        <CardHeader>
          <div className="mb-3 grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            <MonitorSmartphone className="size-5" />
          </div>
          <CardTitle>Create a screenshot set</CardTitle>
          <CardDescription>
            A set contains the ordered screenshots for one language and device combination.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={submit}>
            <Field label="Set name">
              <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Language / locale">
                <Input value={locale} onChange={(event) => setLocale(event.target.value)} placeholder="en-US" />
              </Field>
              <Field label="Device">
                <Input value={device} onChange={(event) => setDevice(event.target.value)} placeholder="iPhone" />
              </Field>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Screenshot dimensions</p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <Input
                  aria-label="Canvas width"
                  type="number"
                  min={1}
                  value={width}
                  onChange={(event) => setWidth(Number(event.target.value))}
                />
                <span className="text-sm text-muted-foreground">×</span>
                <Input
                  aria-label="Canvas height"
                  type="number"
                  min={1}
                  value={height}
                  onChange={(event) => setHeight(Number(event.target.value))}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                The reference size is 1290 × 2796 px. Every area in this set uses the same size.
              </p>
            </div>
            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2 border-t pt-5">
              <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
              <Button disabled={busy || !name.trim() || !locale.trim() || !device.trim()} type="submit">
                {busy ? "Creating…" : "Create set"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}
