import { lazy, Suspense, useEffect, useId, useState, type FormEvent } from "react"
import { Copy, FolderOpen, Image, LoaderCircle, MonitorSmartphone, Settings, Trash2, type LucideIcon } from "lucide-react"

import { CreateSetDialog } from "@/CreateSetForm"
import { request, messageFor } from "@/api"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DEVICE_PRESETS, deviceName, type DeviceName } from "@/device-presets"
import { LocalePicker } from "@/LocalePicker"
import { cn } from "@/lib/utils"
import type { StoreShotProject, ScreenshotSet, UpdateSetMetadataInput } from "../shared"

const SetEditor = lazy(async () => {
  const module = await import("@/SetEditor")
  return { default: module.SetEditor }
})

const AssetsView = lazy(async () => {
  const module = await import("@/AssetsView")
  return { default: module.AssetsView }
})

type AppRoute =
  | { kind: "assets" }
  | { kind: "set"; setId: string }
  | { kind: "unknown" }

export function App() {
  const [project, setProject] = useState<StoreShotProject | null>(null)
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
      const nextProject = await request<StoreShotProject>("/api/project")
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

  async function duplicateSet(id: string) {
    const duplicate = await request<ScreenshotSet>(`/api/sets/${id}/duplicate`, { method: "POST" })
    setProject((current) => current && ({ ...current, sets: [...current.sets, duplicate] }))
    navigate(setPath(duplicate.id))
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
      <ResizablePanelGroup className="min-h-0 flex-1" id="storeshot-shell" orientation="horizontal">
        <ResizablePanel
          defaultSize={256}
          groupResizeBehavior="preserve-pixel-size"
          id="project-sidebar"
          maxSize={420}
          minSize={200}
        >
        <aside className="flex h-full min-w-0 flex-col bg-background p-3">
          <div className="-mx-3 -mt-3 mb-3 flex h-[68px] shrink-0 items-center border-b px-5">
            <Button className="h-auto min-w-0 justify-start gap-3 p-0 text-left hover:bg-transparent" type="button" variant="ghost" onClick={() => navigate(defaultPath(project.sets))}>
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                <MonitorSmartphone className="size-5" />
              </span>
              <span className="truncate font-semibold leading-tight">{project.config.appName.trim() || "StoreShot"}</span>
            </Button>
          </div>

          <nav className="space-y-1">
            <SidebarButton active={route.kind === "assets"} icon={Image} label="Asset catalog" badge={assetCount} onClick={() => navigate("/assets")} />
          </nav>

          <div className="mt-5 flex items-center justify-between px-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sets</p>
            <CreateSetDialog onCreate={createdSet} />
          </div>
          <div className="mt-1 min-h-0 flex-1 space-y-1 overflow-auto">
            {project.sets.length === 0 ? (
              <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">No sets yet. Create one for each language and device.</p>
            ) : project.sets.map((set) => (
              <div
                className={cn(
                  "flex w-full items-center rounded-lg transition-colors hover:bg-muted",
                  selectedSet?.id === set.id && "bg-muted",
                )}
                key={set.id}
              >
                <Button className="h-auto min-w-0 flex-1 justify-start px-3 py-2.5 text-left whitespace-normal hover:bg-transparent" type="button" variant="ghost" onClick={() => navigate(setPath(set.id))}>
                  <span className="block truncate text-sm font-medium">{set.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{set.locale} · {set.device}</span>
                </Button>
                <SetDuplicateButton set={set} onDuplicate={duplicateSet} />
                <SetSettingsPopover set={set} onDelete={deleteSet} onSave={saveSetMetadata} />
              </div>
            ))}
          </div>

          <div className="-mx-3 border-t px-5 pt-3 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <FolderOpen className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 break-all">{project.directory}</span>
            </div>
          </div>
        </aside>
        </ResizablePanel>

        <ResizableHandle aria-label="Resize project sidebar" />

        <ResizablePanel id="project-workspace" minSize={520}>
        <main className="h-full min-w-0">
          {route.kind === "assets" && (
            <Suspense fallback={<WorkspaceLoader label="Opening asset catalog…" />}>
              <AssetsView project={project} onProjectChange={setProject} />
            </Suspense>
          )}
          {selectedSet && (
            <Suspense fallback={<WorkspaceLoader label="Opening editor…" />}>
              <SetEditor
                assets={project.assets}
                set={selectedSet}
                onOpenAssets={() => navigate("/assets")}
                onSetChange={updateSet}
              />
            </Suspense>
          )}
        </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

function WorkspaceLoader({ label }: { label: string }) {
  return <div className="grid h-full place-items-center text-sm text-muted-foreground"><span><LoaderCircle className="mr-2 inline size-4 animate-spin" />{label}</span></div>
}

function SetDuplicateButton({ set, onDuplicate }: {
  set: ScreenshotSet
  onDuplicate: (id: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function duplicate() {
    setBusy(true)
    try {
      await onDuplicate(set.id)
    } catch (error) {
      setError(messageFor(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        aria-label={`Duplicate ${set.name}`}
        className="text-muted-foreground hover:text-foreground focus-visible:text-foreground"
        disabled={busy}
        size="icon-sm"
        title={`Duplicate ${set.name}`}
        type="button"
        variant="ghost"
        onClick={() => void duplicate()}
      >
        {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}
      </Button>
      <AlertDialog open={Boolean(error)} onOpenChange={(open) => { if (!open) setError(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Could not duplicate set</AlertDialogTitle>
            <AlertDialogDescription>{error}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button />}>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
  const [device, setDevice] = useState<DeviceName>(() => deviceName(set.device))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const nameId = useId()
  const localeId = useId()
  const deviceId = useId()

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      setName(set.name)
      setLocale(set.locale)
      setDevice(deviceName(set.device))
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
    setBusy(true)
    setError(null)
    try {
      await onDelete(set.id)
      setConfirmingDelete(false)
      setOpen(false)
    } catch (nextError) {
      setError(messageFor(nextError))
      setBusy(false)
    }
  }

  const valid = name.trim() && locale.trim() && device.trim()

  return (
    <>
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger
        render={
          <Button
            aria-label={`Settings for ${set.name}`}
            className="mr-1 text-muted-foreground hover:text-foreground aria-expanded:text-foreground focus-visible:text-foreground"
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
              <LocalePicker id={localeId} value={locale} onValueChange={setLocale} />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel htmlFor={deviceId}>Device</FieldLabel>
              <Select value={device} onValueChange={(value) => setDevice(value as DeviceName)}>
                <SelectTrigger className="w-full" id={deviceId}>
                  <SelectValue>{device}</SelectValue>
                </SelectTrigger>
                <SelectContent align="start">
                  {DEVICE_PRESETS.map((preset) => (
                    <SelectItem key={preset.device} value={preset.device}>{preset.device}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {error && <FieldError className="text-xs">{error}</FieldError>}
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button disabled={busy} size="sm" type="button" variant="destructive" onClick={() => setConfirmingDelete(true)}>
              <Trash2 className="size-3.5" />Delete
            </Button>
            <Button disabled={busy || !valid} size="sm" type="submit">{busy ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
    <AlertDialog open={confirmingDelete} onOpenChange={(nextOpen) => { if (!busy) setConfirmingDelete(nextOpen) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{set.name}”?</AlertDialogTitle>
          <AlertDialogDescription>This removes the set and its local screenshot document. Assets in the catalog are kept.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel render={<Button disabled={busy} variant="outline" />}>Cancel</AlertDialogCancel>
          <Button disabled={busy} variant="destructive" onClick={() => void remove()}>{busy ? "Deleting…" : "Delete set"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
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
    <Button
      aria-pressed={active}
      className="h-auto w-full justify-start gap-3 px-3 py-2 text-sm"
      type="button"
      variant={active ? "secondary" : "ghost"}
      onClick={onClick}
    >
      <Icon className="size-4 text-muted-foreground" />
      <span>{label}</span>
      {badge !== undefined && <Badge className="ml-auto" variant="secondary">{badge}</Badge>}
    </Button>
  )
}

function routeFromPath(pathname: string): AppRoute {
  const normalizedPath = normalizePath(pathname)
  if (normalizedPath === "/assets") return { kind: "assets" }
  const setMatch = normalizedPath.match(/^\/sets\/([^/]+)$/)
  if (!setMatch) return { kind: "unknown" }
  try {
    return { kind: "set", setId: decodeURIComponent(setMatch[1]) }
  } catch {
    return { kind: "unknown" }
  }
}

function canonicalProjectPath(pathname: string, project: StoreShotProject): string {
  const route = routeFromPath(pathname)
  if (route.kind === "assets") return "/assets"
  if (route.kind === "set" && project.sets.some((set) => set.id === route.setId)) return setPath(route.setId)
  return defaultPath(project.sets)
}

function defaultPath(sets: ScreenshotSet[]): string {
  return sets[0] ? setPath(sets[0].id) : "/assets"
}

function setPath(id: string): string {
  return `/sets/${encodeURIComponent(id)}`
}

function normalizePath(pathname: string): string {
  if (pathname === "/") return pathname
  return pathname.replace(/\/+$/, "") || "/"
}
