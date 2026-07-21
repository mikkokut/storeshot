import { useEffect, useMemo, useRef, useState } from "react"
import { Check, FolderUp, LoaderCircle, PackageOpen } from "lucide-react"

import { messageFor, request } from "@/api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
  MOCKUP_BUNDLE_FILENAME,
  bundleAssetPaths,
  parseMockupBundleManifest,
  type DeviceMockupCatalog,
  type MockupBundleManifest,
} from "../device-mockups"
import { useMockupCatalog } from "./MockupCatalogContext"

interface PendingBundle {
  files: Map<string, File>
  manifest: MockupBundleManifest
}

export function MockupBundleImporter({ onImported }: { onImported: (firstMockupId: string, catalog: DeviceMockupCatalog) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { refresh } = useMockupCatalog()
  const [pending, setPending] = useState<PendingBundle | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const previewUrls = useMemo(() => {
    const urls = new Map<string, string>()
    if (!pending) return urls
    for (const mockup of pending.manifest.mockups) {
      const preview = pending.files.get(mockup.frame) ?? (mockup.thumbnail ? pending.files.get(mockup.thumbnail) : undefined)
      if (preview) urls.set(mockup.id, URL.createObjectURL(preview))
    }
    return urls
  }, [pending])

  useEffect(() => {
    inputRef.current?.setAttribute("webkitdirectory", "")
  }, [])

  useEffect(() => () => {
    for (const url of previewUrls.values()) URL.revokeObjectURL(url)
  }, [previewUrls])

  async function chooseFolder(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    try {
      const entries = [...files]
      const manifestFile = entries
        .filter((file) => relativeFilePath(file).endsWith(`/${MOCKUP_BUNDLE_FILENAME}`) || file.name === MOCKUP_BUNDLE_FILENAME)
        .sort((first, second) => relativeFilePath(first).length - relativeFilePath(second).length)[0]
      if (!manifestFile) throw new Error(`Choose a folder containing ${MOCKUP_BUNDLE_FILENAME}`)
      const manifestPath = relativeFilePath(manifestFile)
      const rootPrefix = manifestPath.slice(0, manifestPath.length - MOCKUP_BUNDLE_FILENAME.length)
      const manifest = parseMockupBundleManifest(JSON.parse(await manifestFile.text()))
      const fileMap = new Map(entries.flatMap((file) => {
        const relativePath = relativeFilePath(file)
        return relativePath.startsWith(rootPrefix) ? [[relativePath.slice(rootPrefix.length), file] as const] : []
      }))
      setPending({ files: fileMap, manifest })
      setSelectedIds(new Set(manifest.mockups.map((mockup) => mockup.id)))
      setProgress({ completed: 0, total: 0 })
    } catch (nextError) {
      setError(messageFor(nextError))
    } finally {
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  function toggleMockup(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function importSelected() {
    if (!pending || selectedIds.size === 0) return
    const importId = crypto.randomUUID()
    setBusy(true)
    setError(null)
    try {
      const manifest: MockupBundleManifest = {
        ...pending.manifest,
        mockups: pending.manifest.mockups.filter((mockup) => selectedIds.has(mockup.id)),
      }
      const paths = bundleAssetPaths(manifest)
      const missing = paths.filter((relativePath) => !pending.files.has(relativePath))
      if (missing.length > 0) throw new Error(`Bundle is missing ${missing[0]}`)
      setProgress({ completed: 0, total: paths.length + 1 })
      for (const [index, relativePath] of paths.entries()) {
        await request(`/api/mockup-bundle-imports/${encodeURIComponent(importId)}/${encodeURIComponent(manifest.id)}/files/${encodeBundlePath(relativePath)}`, {
          method: "PUT",
          body: pending.files.get(relativePath),
        })
        setProgress({ completed: index + 1, total: paths.length + 1 })
      }
      await request(`/api/mockup-bundle-imports/${encodeURIComponent(importId)}/${encodeURIComponent(manifest.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manifest),
      })
      setProgress({ completed: paths.length + 1, total: paths.length + 1 })
      const catalog = await refresh()
      setPending(null)
      onImported(`${manifest.id}/${manifest.mockups[0].id}`, catalog)
    } catch (nextError) {
      await request(`/api/mockup-bundle-imports/${encodeURIComponent(importId)}`, { method: "DELETE" }).catch(() => undefined)
      setError(messageFor(nextError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        hidden
        multiple
        ref={inputRef}
        type="file"
        onChange={(event) => void chooseFolder(event.target.files)}
      />
      <Button size="sm" type="button" variant="outline" onClick={() => inputRef.current?.click()}>
        <FolderUp />
        Import bundle
      </Button>
      {error && !pending && <span className="max-w-64 text-xs text-destructive">{error}</span>}

      <Dialog open={pending !== null} onOpenChange={(open) => !open && !busy && setPending(null)}>
        <DialogContent className="grid h-[min(840px,calc(100vh-2rem))] max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4 pr-14">
            <DialogTitle>Import {pending?.manifest.name ?? "mockup bundle"}</DialogTitle>
            <DialogDescription>
              Choose the frames to copy into this StoreShot project. The bundle license and source information stay with the imported files.
            </DialogDescription>
          </DialogHeader>

          {pending && (
            <div className="flex min-h-0 flex-col">
              <div className="flex shrink-0 items-center gap-3 border-b px-5 py-3">
                <span className="grid size-9 place-items-center rounded-lg bg-muted"><PackageOpen className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{pending.manifest.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {pending.manifest.author} · {pending.manifest.license.name} · {pending.manifest.mockups.length} mockups
                  </p>
                </div>
                <Button size="sm" type="button" variant="ghost" onClick={() => setSelectedIds(new Set(pending.manifest.mockups.map((mockup) => mockup.id)))}>Select all</Button>
                <Button size="sm" type="button" variant="ghost" onClick={() => setSelectedIds(new Set())}>None</Button>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="grid grid-cols-2 gap-2 p-4 md:grid-cols-3">
                  {pending.manifest.mockups.map((mockup) => {
                    const selected = selectedIds.has(mockup.id)
                    const previewUrl = previewUrls.get(mockup.id)
                    return (
                      <Button
                        aria-pressed={selected}
                        className={cn(
                          "relative h-auto flex-col items-stretch justify-start gap-0 overflow-hidden p-0 text-left",
                          selected && "border-foreground ring-1 ring-foreground",
                        )}
                        key={mockup.id}
                        type="button"
                        variant="outline"
                        onClick={() => toggleMockup(mockup.id)}
                      >
                        <span className="relative aspect-[4/3] overflow-hidden bg-muted/40">
                          <span className="absolute inset-3">
                            {previewUrl && <img alt="" className="absolute inset-0 size-full object-contain" loading="lazy" src={previewUrl} />}
                          </span>
                        </span>
                        <span className="min-w-0 border-t px-3 py-2">
                          <span className="block truncate text-xs font-medium">{mockup.name}</span>
                          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{mockup.description}</span>
                        </span>
                        {selected && <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-foreground text-background"><Check className="size-3" /></span>}
                      </Button>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          <div className="flex items-center gap-2 border-t px-5 py-4">
            <div className="mr-auto text-xs text-muted-foreground">
              {error ? <span className="text-destructive">{error}</span> : busy ? `Copying ${progress.completed}/${progress.total} files…` : `${selectedIds.size} selected`}
            </div>
            <Button disabled={busy} type="button" variant="outline" onClick={() => setPending(null)}>Cancel</Button>
            <Button disabled={busy || selectedIds.size === 0} type="button" onClick={() => void importSelected()}>
              {busy && <LoaderCircle className="animate-spin" />}
              Import {selectedIds.size} mockup{selectedIds.size === 1 ? "" : "s"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function relativeFilePath(file: File): string {
  return file.webkitRelativePath || file.name
}

function encodeBundlePath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/")
}
