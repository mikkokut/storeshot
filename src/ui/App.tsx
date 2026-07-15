import { lazy, Suspense, useEffect, useId, useState, type FormEvent } from "react"
import { FolderOpen, Image, LoaderCircle, MonitorSmartphone, Plus, Settings, Trash2, type LucideIcon } from "lucide-react"

import { AssetsView } from "@/AssetsView"
import { CreateSetForm } from "@/CreateSetForm"
import { request, messageFor } from "@/api"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { AppshotProject, ScreenshotSet, UpdateSetMetadataInput } from "../shared"

const SetEditor = lazy(async () => {
  const module = await import("@/SetEditor")
  return { default: module.SetEditor }
})

type AppRoute =
  | { kind: "assets" }
  | { kind: "new-set" }
  | { kind: "set"; setId: string }
  | { kind: "unknown" }

export function App() {
  const [project, setProject] = useState<AppshotProject | null>(null)
  const [pathname, setPathname] = useState(() => window.location.pathname)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname)
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  useEffect(() => {
    if (!project) return
    const canonicalPath = canonicalProjectPath(pathname, project)
    if (canonicalPath === pathname) return
    window.history.replaceState(null, "", canonicalPath)
    setPathname(canonicalPath)
  }, [pathname, project])

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
    navigate(setPath(set.id))
  }

  function navigate(nextPath: string, replace = false) {
    if (nextPath === pathname) return
    window.history[replace ? "replaceState" : "pushState"](null, "", nextPath)
    setPathname(nextPath)
  }

  async function saveSetMetadata(id: string, input: UpdateSetMetadataInput) {
    const saved = await request<ScreenshotSet>(`/api/sets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    updateSet(saved)
  }

  async function deleteSet(id: string) {
    if (!project) return
    await request(`/api/sets/${id}`, { method: "DELETE" })
    const remainingSets = project.sets.filter((set) => set.id !== id)
    setProject((current) => current && ({ ...current, sets: current.sets.filter((set) => set.id !== id) }))
    const currentRoute = routeFromPath(pathname)
    if (currentRoute.kind === "set" && currentRoute.setId === id) {
      navigate(defaultPath(remainingSets), true)
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

  const activePath = canonicalProjectPath(pathname, project)
  const route = routeFromPath(activePath)
  const selectedSet = route.kind === "set" ? project.sets.find((set) => set.id === route.setId) : undefined
  const assetCount = Object.values(project.assets).reduce((total, assets) => total + assets.length, 0)

  return (
    <div className="flex h-screen min-h-[640px] flex-col overflow-hidden bg-muted/30">
      <header className="shrink-0 border-b bg-background">
        <div className="flex h-16 items-center justify-between px-5">
          <button className="flex items-center gap-3 text-left" type="button" onClick={() => navigate(defaultPath(project.sets))}>
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
            <SidebarButton active={route.kind === "assets"} icon={Image} label="Asset catalog" badge={assetCount} onClick={() => navigate("/assets")} />
          </nav>

          <div className="mt-5 flex items-center justify-between px-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sets</p>
            <Button aria-label="New screenshot set" size="icon" variant="ghost" onClick={() => navigate("/sets/new")}>
              <Plus className="size-4" />
            </Button>
          </div>
          <div className="mt-1 min-h-0 flex-1 space-y-1 overflow-auto">
            {project.sets.length === 0 ? (
              <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">No sets yet. Create one for each language and device.</p>
            ) : project.sets.map((set) => (
              <div
                className={cn(
                  "group flex w-full items-center rounded-lg transition-colors hover:bg-muted",
                  selectedSet?.id === set.id && "bg-muted",
                )}
                key={set.id}
              >
                <button className="min-w-0 flex-1 px-3 py-2.5 text-left" type="button" onClick={() => navigate(setPath(set.id))}>
                  <span className="block truncate text-sm font-medium">{set.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{set.locale} · {set.device}</span>
                </button>
                <SetSettingsPopover set={set} onDelete={deleteSet} onSave={saveSetMetadata} />
              </div>
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
          {route.kind === "assets" && <AssetsView project={project} onProjectChange={setProject} />}
          {route.kind === "new-set" && <CreateSetForm onCancel={() => navigate(project.sets[0] ? setPath(project.sets[0].id) : "/assets")} onCreate={createdSet} />}
          {selectedSet && (
            <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground"><LoaderCircle className="mr-2 inline size-4 animate-spin" />Opening editor…</div>}>
              <SetEditor
                assets={project.assets}
                set={selectedSet}
                onOpenAssets={() => navigate("/assets")}
                onSetChange={updateSet}
              />
            </Suspense>
          )}
        </main>
      </div>
    </div>
  )
}

function SetSettingsPopover({ set, onDelete, onSave }: {
  set: ScreenshotSet
  onDelete: (id: string) => Promise<void>
  onSave: (id: string, input: UpdateSetMetadataInput) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(set.name)
  const [locale, setLocale] = useState(set.locale)
  const [device, setDevice] = useState(set.device)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameId = useId()
  const localeId = useId()
  const deviceId = useId()

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      setName(set.name)
      setLocale(set.locale)
      setDevice(set.device)
      setError(null)
    }
    setOpen(nextOpen)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave(set.id, { name: name.trim(), locale: locale.trim(), device: device.trim() })
      setOpen(false)
    } catch (nextError) {
      setError(messageFor(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the set “${set.name}”?`)) return
    setBusy(true)
    setError(null)
    try {
      await onDelete(set.id)
      setOpen(false)
    } catch (nextError) {
      setError(messageFor(nextError))
      setBusy(false)
    }
  }

  const valid = name.trim() && locale.trim() && device.trim()

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger
        render={
          <Button
            aria-label={`Settings for ${set.name}`}
            className="mr-1 text-muted-foreground opacity-60 group-hover:opacity-100 aria-expanded:opacity-100 focus-visible:opacity-100"
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <Settings className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-4 p-4" side="right" sideOffset={8}>
        <PopoverHeader>
          <PopoverTitle>Set settings</PopoverTitle>
          <PopoverDescription>Language and device details for this screenshot set.</PopoverDescription>
        </PopoverHeader>
        <form className="space-y-3" onSubmit={save}>
          <Field className="gap-1.5">
            <FieldLabel htmlFor={nameId}>Name</FieldLabel>
            <Input autoFocus id={nameId} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field className="gap-1.5">
              <FieldLabel htmlFor={localeId}>Locale</FieldLabel>
              <Input id={localeId} value={locale} onChange={(event) => setLocale(event.target.value)} />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel htmlFor={deviceId}>Device</FieldLabel>
              <Input id={deviceId} value={device} onChange={(event) => setDevice(event.target.value)} />
            </Field>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button disabled={busy} size="sm" type="button" variant="destructive" onClick={() => void remove()}>
              <Trash2 className="size-3.5" />Delete
            </Button>
            <Button disabled={busy || !valid} size="sm" type="submit">{busy ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function SidebarButton({ active, icon: Icon, label, badge, onClick }: {
  active: boolean
  icon: LucideIcon
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

function routeFromPath(pathname: string): AppRoute {
  const normalizedPath = normalizePath(pathname)
  if (normalizedPath === "/assets") return { kind: "assets" }
  if (normalizedPath === "/sets/new") return { kind: "new-set" }
  const setMatch = normalizedPath.match(/^\/sets\/([^/]+)$/)
  if (!setMatch) return { kind: "unknown" }
  try {
    return { kind: "set", setId: decodeURIComponent(setMatch[1]) }
  } catch {
    return { kind: "unknown" }
  }
}

function canonicalProjectPath(pathname: string, project: AppshotProject): string {
  const route = routeFromPath(pathname)
  if (route.kind === "assets") return "/assets"
  if (route.kind === "new-set") return "/sets/new"
  if (route.kind === "set" && project.sets.some((set) => set.id === route.setId)) return setPath(route.setId)
  return defaultPath(project.sets)
}

function defaultPath(sets: ScreenshotSet[]): string {
  return sets[0] ? setPath(sets[0].id) : "/sets/new"
}

function setPath(id: string): string {
  return `/sets/${encodeURIComponent(id)}`
}

function normalizePath(pathname: string): string {
  if (pathname === "/") return pathname
  return pathname.replace(/\/+$/, "") || "/"
}
