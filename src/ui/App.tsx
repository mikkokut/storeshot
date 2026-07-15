import { lazy, Suspense, useEffect, useState, type FormEvent } from "react"
import { FolderOpen, Image, LayoutGrid, LoaderCircle, MonitorSmartphone, Plus, Settings2 } from "lucide-react"

import { AssetsView } from "@/AssetsView"
import { CreateSetForm } from "@/CreateSetForm"
import { request, messageFor } from "@/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { AppshotProject, ScreenshotSet } from "../shared"

const SetEditor = lazy(async () => {
  const module = await import("@/SetEditor")
  return { default: module.SetEditor }
})

type Page = "overview" | "assets" | "new-set" | string

export function App() {
  const [project, setProject] = useState<AppshotProject | null>(null)
  const [page, setPage] = useState<Page>("overview")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void refresh()
  }, [])

  async function refresh() {
    try {
      const nextProject = await request<AppshotProject>("/api/project")
      setProject(nextProject)
      setError(null)
    } catch (nextError) {
      setError(messageFor(nextError))
    }
  }

  function updateSet(set: ScreenshotSet) {
    setProject((current) => current && ({ ...current, sets: current.sets.map((item) => item.id === set.id ? set : item) }))
  }

  function createdSet(set: ScreenshotSet) {
    setProject((current) => current && ({ ...current, sets: [...current.sets, set] }))
    setPage(set.id)
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

  const selectedSet = project.sets.find((set) => set.id === page)
  const assetCount = Object.values(project.assets).reduce((total, assets) => total + assets.length, 0)

  return (
    <div className="flex h-screen min-h-[640px] flex-col overflow-hidden bg-muted/30">
      <header className="shrink-0 border-b bg-background">
        <div className="flex h-16 items-center justify-between px-5">
          <button className="flex items-center gap-3 text-left" type="button" onClick={() => setPage("overview")}>
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <MonitorSmartphone className="size-5" />
            </span>
            <span>
              <span className="block font-semibold leading-tight">Appshot</span>
              <span className="block text-xs text-muted-foreground">{project.config.appName}</span>
            </span>
          </button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-emerald-500" />
            Saved locally
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r bg-background p-3">
          <nav className="space-y-1">
            <SidebarButton active={page === "overview"} icon={LayoutGrid} label="Screenshot sets" onClick={() => setPage("overview")} />
            <SidebarButton active={page === "assets"} icon={Image} label="Asset catalog" badge={assetCount} onClick={() => setPage("assets")} />
          </nav>

          <div className="mt-5 flex items-center justify-between px-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sets</p>
            <Button aria-label="New screenshot set" size="icon" variant="ghost" onClick={() => setPage("new-set")}>
              <Plus className="size-4" />
            </Button>
          </div>
          <div className="mt-1 min-h-0 flex-1 space-y-1 overflow-auto">
            {project.sets.length === 0 ? (
              <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">No sets yet. Create one for each language and device.</p>
            ) : project.sets.map((set) => (
              <button
                className={cn(
                  "w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted",
                  page === set.id && "bg-muted",
                )}
                key={set.id}
                type="button"
                onClick={() => setPage(set.id)}
              >
                <span className="block truncate text-sm font-medium">{set.name}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{set.locale} · {set.device}</span>
              </button>
            ))}
          </div>

          <div className="border-t px-2 pt-3 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <FolderOpen className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 break-all">{project.directory}</span>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {page === "overview" && <Overview project={project} onNewSet={() => setPage("new-set")} onOpenSet={setPage} onProjectChange={setProject} />}
          {page === "assets" && <AssetsView project={project} onProjectChange={setProject} />}
          {page === "new-set" && <CreateSetForm onCancel={() => setPage("overview")} onCreate={createdSet} />}
          {selectedSet && (
            <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground"><LoaderCircle className="mr-2 inline size-4 animate-spin" />Opening editor…</div>}>
              <SetEditor
                assets={project.assets}
                set={selectedSet}
                onDelete={async () => {
                  await refresh()
                  setPage("overview")
                }}
                onOpenAssets={() => setPage("assets")}
                onSetChange={updateSet}
              />
            </Suspense>
          )}
        </main>
      </div>
    </div>
  )
}

function SidebarButton({ active, icon: Icon, label, badge, onClick }: {
  active: boolean
  icon: typeof LayoutGrid
  label: string
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted", active && "bg-muted")}
      type="button"
      onClick={onClick}
    >
      <Icon className="size-4 text-muted-foreground" />
      <span>{label}</span>
      {badge !== undefined && <span className="ml-auto rounded-full bg-muted-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">{badge}</span>}
    </button>
  )
}

function Overview({ project, onNewSet, onOpenSet, onProjectChange }: {
  project: AppshotProject
  onNewSet: () => void
  onOpenSet: (id: string) => void
  onProjectChange: (project: AppshotProject) => void
}) {
  const [appName, setAppName] = useState(project.config.appName)
  const [busy, setBusy] = useState(false)

  async function saveProject(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await request("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...project.config, appName }),
      })
      onProjectChange({ ...project, config: { ...project.config, appName } })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-7xl space-y-8 p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Workspace</p>
            <h1 className="text-2xl font-semibold tracking-tight">Screenshot sets</h1>
            <p className="mt-1 text-sm text-muted-foreground">One editable set for every language and device combination.</p>
          </div>
          <Button onClick={onNewSet}><Plus className="size-4" />New set</Button>
        </div>

        {project.sets.length === 0 ? (
          <button
            className="grid min-h-72 w-full place-items-center rounded-xl border border-dashed bg-muted/10 text-center transition-colors outline-none hover:bg-muted/30 focus-visible:border-foreground/40"
            type="button"
            onClick={onNewSet}
          >
            <span className="space-y-3">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary text-primary-foreground"><Plus className="size-5" /></span>
              <span className="block text-sm font-semibold">Create your first screenshot set</span>
              <span className="block text-xs text-muted-foreground">For example: English · iPhone</span>
            </span>
          </button>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {project.sets.map((set) => (
              <button className="rounded-xl border bg-background p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md" key={set.id} type="button" onClick={() => onOpenSet(set.id)}>
                <div className="mb-7 flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-lg bg-muted"><MonitorSmartphone className="size-5 text-muted-foreground" /></span>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{set.areas.length} area{set.areas.length === 1 ? "" : "s"}</span>
                </div>
                <p className="font-semibold">{set.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{set.locale} · {set.device}</p>
                <p className="mt-4 text-xs text-muted-foreground">{set.canvas.width} × {set.canvas.height} px</p>
              </button>
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><Settings2 className="size-4" /><CardTitle>Project settings</CardTitle></div>
            <CardDescription>Stored in appshot.json</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex max-w-lg items-end gap-3" onSubmit={saveProject}>
              <label className="flex-1 space-y-2"><span className="text-sm font-medium">App name</span><Input value={appName} onChange={(event) => setAppName(event.target.value)} /></label>
              <Button disabled={busy || !appName.trim()} type="submit">Save</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
