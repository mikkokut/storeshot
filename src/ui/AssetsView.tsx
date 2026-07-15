import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent } from "react"
import { BadgeCheck, Eye, Image, ImagePlus, Palette, Shapes, Trash2, Upload, X } from "lucide-react"

import { formatBytes, messageFor, request, RequestError } from "@/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { ASSET_CATEGORIES, type AppshotProject, type Asset, type AssetCategory } from "../shared"

interface AssetsViewProps {
  project: AppshotProject
  onProjectChange: (project: AppshotProject) => void
}

const categoryDetails: Record<AssetCategory, { label: string; description: string; icon: typeof Image }> = {
  screenshots: { label: "Raw screenshots", description: "Unframed captures from your app", icon: Image },
  brand: { label: "Brand assets", description: "Photography, illustrations, and artwork", icon: Palette },
  logos: { label: "Logos", description: "App marks and partner logos", icon: BadgeCheck },
  other: { label: "Other", description: "Reusable supporting imagery", icon: Shapes },
}

const supportedAssetPattern = /\.(png|jpe?g|webp)$/i

export function AssetsView({ project, onProjectChange }: AssetsViewProps) {
  const [category, setCategory] = useState<AssetCategory>("screenshots")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<Asset | null>(null)
  const dragDepth = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const assets = project.assets[category]

  useEffect(() => {
    if (!preview) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setPreview(null)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [preview])

  async function uploadAssets(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""
    await uploadFiles(files)
  }

  async function uploadFiles(candidates: File[]) {
    if (candidates.length === 0) return
    const files = candidates.filter((file) => supportedAssetPattern.test(file.name))
    const unsupported = candidates.length - files.length
    setBusy(true)
    setError(null)
    setNotice(null)
    let added = 0
    let duplicates = 0
    const failures: string[] = []
    try {
      let nextProject = project
      for (const file of files) {
        try {
          nextProject = await request<AppshotProject>(
            `/api/assets?category=${category}&filename=${encodeURIComponent(file.name)}`,
            { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file },
          )
          added += 1
        } catch (nextError) {
          if (nextError instanceof RequestError && nextError.code === "DUPLICATE_ASSET") duplicates += 1
          else failures.push(`${file.name}: ${messageFor(nextError)}`)
        }
      }
      if (added > 0) onProjectChange(nextProject)
      const summary = [
        added > 0 ? `Added ${added} ${added === 1 ? "asset" : "assets"}.` : "",
        duplicates > 0 ? `Skipped ${duplicates} ${duplicates === 1 ? "duplicate" : "duplicates"}.` : "",
        unsupported > 0 ? `Ignored ${unsupported} unsupported ${unsupported === 1 ? "file" : "files"}.` : "",
      ].filter(Boolean).join(" ")
      if (summary) setNotice(summary)
      if (failures.length > 0) setError(failures.join(" "))
    } finally {
      setBusy(false)
    }
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (busy) return
    try {
      await uploadFiles(await filesFromDrop(event.dataTransfer))
    } catch (nextError) {
      setError(messageFor(nextError))
    }
  }

  async function deleteAsset(filename: string) {
    if (!window.confirm(`Delete ${filename} from the asset catalog?`)) return
    setBusy(true)
    try {
      await request(`/api/assets/${category}/${encodeURIComponent(filename)}`, { method: "DELETE" })
      const nextProject = await request<AppshotProject>("/api/project")
      onProjectChange(nextProject)
    } catch (nextError) {
      setError(messageFor(nextError))
    } finally {
      setBusy(false)
    }
  }

  function closePreviewFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) setPreview(null)
  }

  return (
    <div
      className="relative h-full overflow-auto"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="mx-auto max-w-7xl space-y-6 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Project library</p>
            <h1 className="text-2xl font-semibold tracking-tight">Asset catalog</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Source files stay reusable and separate from the final screenshot sets.
            </p>
          </div>
          <input
            ref={fileInput}
            className="hidden"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            onChange={uploadAssets}
          />
          <Button disabled={busy} onClick={() => fileInput.current?.click()}>
            <Upload className="size-4" />
            Add to {categoryDetails[category].label.toLowerCase()}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ASSET_CATEGORIES.map((item) => {
            const details = categoryDetails[item]
            const Icon = details.icon
            const selected = category === item
            return (
              <button
                aria-pressed={selected}
                className={cn(
                  "rounded-xl border bg-card p-4 text-left transition-colors outline-none hover:border-foreground/20 hover:bg-muted/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected && "border-foreground/50 bg-muted/40 hover:border-foreground/50 hover:bg-muted/40",
                )}
                key={item}
                type="button"
                onClick={() => setCategory(item)}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className={cn("grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground", selected && "bg-foreground text-background")}>
                    <Icon className="size-4" />
                  </span>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{project.assets[item].length}</span>
                </div>
                <p className="text-sm font-semibold">{details.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{details.description}</p>
              </button>
            )
          })}
        </div>

        {notice && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{notice}</p>}
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <Card className="relative overflow-hidden">
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center border-2 border-dashed border-primary bg-background/90 backdrop-blur-sm">
              <div className="text-center">
                <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Upload className="size-5" />
                </span>
                <p className="font-semibold">Drop files or folders here</p>
                <p className="mt-1 text-sm text-muted-foreground">Supported images will be added to {categoryDetails[category].label.toLowerCase()}.</p>
              </div>
            </div>
          )}
          <CardHeader>
            <CardTitle>{categoryDetails[category].label}</CardTitle>
            <CardDescription>{categoryDetails[category].description}. Add files or drop a folder; PNG, JPEG, and WebP up to 25 MB.</CardDescription>
          </CardHeader>
          <CardContent>
            {assets.length === 0 ? (
              <button
                className="grid min-h-72 w-full place-items-center rounded-xl border border-dashed bg-muted/20 text-center transition-colors hover:bg-muted/40"
                type="button"
                onClick={() => fileInput.current?.click()}
              >
                <span className="space-y-3">
                  <span className="mx-auto grid size-12 place-items-center rounded-full border bg-background shadow-sm">
                    <ImagePlus className="size-5 text-muted-foreground" />
                  </span>
                  <span className="block text-sm font-medium">Add your first {categoryDetails[category].label.toLowerCase()}</span>
                  <span className="block text-xs text-muted-foreground">Choose files or drop files and folders anywhere on this page.</span>
                </span>
              </button>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {assets.map((asset) => (
                  <article className="group overflow-hidden rounded-xl border bg-background" key={asset.id}>
                    <button
                      aria-label={`Preview ${asset.name}`}
                      className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden bg-[linear-gradient(45deg,#f4f4f5_25%,transparent_25%),linear-gradient(-45deg,#f4f4f5_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f4f4f5_75%),linear-gradient(-45deg,transparent_75%,#f4f4f5_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      type="button"
                      onClick={() => setPreview(asset)}
                    >
                      <img className="h-full w-full object-contain" src={asset.url} alt={asset.name} />
                      <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100 group-focus-within:bg-black/20 group-focus-within:opacity-100">
                        <span className="grid size-10 place-items-center rounded-full bg-background/90 shadow-sm">
                          <Eye className="size-4" />
                        </span>
                      </span>
                    </button>
                    <div className="flex items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" title={asset.name}>{asset.name}</p>
                        <p className="text-xs text-muted-foreground">{formatBytes(asset.size)}</p>
                      </div>
                      <Button
                        aria-label={`Delete ${asset.name}`}
                        disabled={busy}
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteAsset(asset.name)}
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
      </div>
      {preview && (
        <div
          aria-labelledby="asset-preview-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex flex-col bg-black/85 p-4 backdrop-blur-sm"
          role="dialog"
          onMouseDown={closePreviewFromBackdrop}
        >
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 rounded-t-xl bg-background px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold" id="asset-preview-title">{preview.name}</h2>
              <p className="text-xs text-muted-foreground">{categoryDetails[preview.category].label} · {formatBytes(preview.size)}</p>
            </div>
            <Button aria-label="Close preview" size="icon" variant="ghost" onClick={() => setPreview(null)}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="relative mx-auto min-h-0 w-full max-w-7xl flex-1 overflow-hidden rounded-b-xl border-t border-white/10 bg-black/40 p-4">
            <img
              className="absolute object-contain"
              style={{ inset: "1rem", width: "calc(100% - 2rem)", height: "calc(100% - 2rem)" }}
              src={preview.url}
              alt={preview.name}
            />
          </div>
        </div>
      )}
    </div>
  )
}

async function filesFromDrop(dataTransfer: DataTransfer): Promise<File[]> {
  const entries = Array.from(dataTransfer.items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry))

  if (entries.length === 0) return Array.from(dataTransfer.files)
  const nested = await Promise.all(entries.map(filesFromEntry))
  return nested.flat()
}

async function filesFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry
    return [await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject))]
  }
  if (!entry.isDirectory) return []

  const reader = (entry as FileSystemDirectoryEntry).createReader()
  const children: FileSystemEntry[] = []
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (batch.length === 0) break
    children.push(...batch)
  }
  return (await Promise.all(children.map(filesFromEntry))).flat()
}
