import { useEffect, useRef, useState } from "react"
import { FolderOpen, ImagePlus, LoaderCircle, MonitorSmartphone, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { AppshotProject } from "../shared"

export function App() {
  const [project, setProject] = useState<AppshotProject | null>(null)
  const [appName, setAppName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void refresh()
  }, [])

  async function refresh() {
    try {
      const nextProject = await request<AppshotProject>("/api/project")
      setProject(nextProject)
      setAppName(nextProject.config.appName)
      setError(null)
    } catch (nextError) {
      setError(messageFor(nextError))
    }
  }

  async function saveConfig(event: React.FormEvent) {
    event.preventDefault()
    if (!project) return

    setBusy(true)
    try {
      await request("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...project.config, appName }),
      })
      await refresh()
    } catch (nextError) {
      setError(messageFor(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function uploadScreenshot(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setBusy(true)
    try {
      await request(`/api/screenshots?filename=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      })
      await refresh()
    } catch (nextError) {
      setError(messageFor(nextError))
    } finally {
      event.target.value = ""
      setBusy(false)
    }
  }

  async function removeScreenshot(name: string) {
    setBusy(true)
    try {
      await request(`/api/screenshots/${encodeURIComponent(name)}`, { method: "DELETE" })
      await refresh()
    } catch (nextError) {
      setError(messageFor(nextError))
    } finally {
      setBusy(false)
    }
  }

  if (!project) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          {error ?? "Opening local project…"}
        </div>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <MonitorSmartphone className="size-5" />
            </div>
            <div>
              <p className="font-semibold leading-tight">Appshot</p>
              <p className="text-xs text-muted-foreground">Local screenshot workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-emerald-500" />
            Local only
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Project</CardTitle>
            <CardDescription>Stored in appshot.json</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={saveConfig}>
              <label className="block space-y-2">
                <span className="text-sm font-medium">App name</span>
                <Input value={appName} onChange={(event) => setAppName(event.target.value)} />
              </label>
              <div className="space-y-2">
                <span className="text-sm font-medium">Platform</span>
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">iOS</div>
              </div>
              <Button className="w-full" disabled={busy || !appName.trim()} type="submit">
                Save configuration
              </Button>
            </form>
            <div className="mt-5 flex items-start gap-2 border-t pt-4 text-xs text-muted-foreground">
              <FolderOpen className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 break-all">{project.directory}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1.5">
              <CardTitle>Screenshots</CardTitle>
              <CardDescription>
                {project.screenshots.length === 0
                  ? "Add the first screenshot to this project."
                  : `${project.screenshots.length} local asset${project.screenshots.length === 1 ? "" : "s"}`}
              </CardDescription>
            </div>
            <Input
              ref={fileInput}
              className="hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={uploadScreenshot}
            />
            <Button disabled={busy} onClick={() => fileInput.current?.click()}>
              <ImagePlus className="size-4" />
              Add screenshot
            </Button>
          </CardHeader>
          <CardContent>
            {error && <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

            {project.screenshots.length === 0 ? (
              <button
                className="grid min-h-80 w-full place-items-center rounded-lg border border-dashed bg-muted/20 text-center transition-colors hover:bg-muted/40"
                type="button"
                onClick={() => fileInput.current?.click()}
              >
                <span className="space-y-3">
                  <span className="mx-auto grid size-12 place-items-center rounded-full border bg-background shadow-sm">
                    <ImagePlus className="size-5 text-muted-foreground" />
                  </span>
                  <span className="block text-sm font-medium">Choose a PNG, JPEG, or WebP image</span>
                  <span className="block text-xs text-muted-foreground">Files stay in the screenshots folder.</span>
                </span>
              </button>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {project.screenshots.map((screenshot) => (
                  <article className="group overflow-hidden rounded-lg border bg-background" key={screenshot.name}>
                    <div className="grid aspect-[9/16] place-items-center overflow-hidden bg-muted">
                      <img className="h-full w-full object-contain" src={screenshot.url} alt={screenshot.name} />
                    </div>
                    <div className="flex items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" title={screenshot.name}>{screenshot.name}</p>
                        <p className="text-xs text-muted-foreground">{formatBytes(screenshot.size)}</p>
                      </div>
                      <Button
                        aria-label={`Delete ${screenshot.name}`}
                        disabled={busy}
                        size="icon"
                        variant="ghost"
                        onClick={() => removeScreenshot(screenshot.name)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

async function request<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const value = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(value?.error ?? `Request failed with status ${response.status}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong"
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}
