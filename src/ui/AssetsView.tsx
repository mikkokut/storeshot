import { useRef, useState, type ChangeEvent, type DragEvent } from "react"
import { BadgeCheck, ChevronDown, CircleHelp, Eye, Image, ImagePlus, Monitor, Palette, Shapes, Smartphone, Tablet, Trash2, Upload, Watch as WatchIcon } from "lucide-react"

import { formatBytes, messageFor, request, RequestError } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  ASSET_CATEGORIES,
  SCREENSHOT_DEVICE_TYPES,
  type StoreShotProject,
  type Asset,
  type AssetCategory,
  type DetectedScreenshotDeviceType,
  type ScreenshotDeviceType,
} from "../shared"

interface AssetsViewProps {
  project: StoreShotProject
  onProjectChange: (project: StoreShotProject) => void
}

const categoryDetails: Record<AssetCategory, { label: string; description: string; icon: typeof Image }> = {
  screenshots: { label: "Raw screenshots", description: "Unframed captures from your app", icon: Image },
  brand: { label: "Brand assets", description: "Photography, illustrations, and artwork", icon: Palette },
  logos: { label: "Logos", description: "App marks and partner logos", icon: BadgeCheck },
  other: { label: "Other", description: "Reusable supporting imagery", icon: Shapes },
}

const supportedAssetPattern = /\.(png|jpe?g|webp|svg)$/i
const deviceTypeLabels: Record<ScreenshotDeviceType, string> = {
  iphone: "iPhone",
  ipad: "iPad",
  mac: "Mac",
  watch: "Watch",
}
const screenshotGroupOrder: DetectedScreenshotDeviceType[] = ["iphone", "ipad", "mac", "watch", "unknown"]
const screenshotPreviewAspectRatios: Record<DetectedScreenshotDeviceType, string> = {
  iphone: "1290 / 2796",
  ipad: "3 / 4",
  mac: "16 / 10",
  watch: "422 / 514",
  unknown: "4 / 3",
}

export function AssetsView({ project, onProjectChange }: AssetsViewProps) {
  const [category, setCategory] = useState<AssetCategory>("screenshots")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<Asset | null>(null)
  const [assetPendingDeletion, setAssetPendingDeletion] = useState<Asset | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())
  const dragDepth = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const assets = project.assets[category]
  const assetGroups = category === "screenshots"
    ? screenshotGroupOrder.map((deviceType) => ({
        id: deviceType,
        label: deviceType === "unknown" ? "Unknown device" : deviceTypeLabels[deviceType],
        assets: assets.filter((asset) => (asset.deviceType ?? "unknown") === deviceType),
      })).filter((group) => group.assets.length > 0)
    : [{ id: category, label: null, assets }]

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
    let replaced = 0
    let duplicates = 0
    const existingNames = new Set(project.assets[category].map((asset) => asset.name))
    const failures: string[] = []
    try {
      for (const file of files) {
        try {
          await request<{ replaced: boolean }>(
            `/api/assets?category=${category}&filename=${encodeURIComponent(file.name)}`,
            { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file },
          )
          if (existingNames.has(file.name)) replaced += 1
          else added += 1
          existingNames.add(file.name)
        } catch (nextError) {
          if (nextError instanceof RequestError && nextError.code === "DUPLICATE_ASSET") duplicates += 1
          else failures.push(`${file.name}: ${messageFor(nextError)}`)
        }
      }
      if (added > 0 || replaced > 0) onProjectChange(await request<StoreShotProject>("/api/project"))
      const summary = [
        added > 0 ? `Added ${added} ${added === 1 ? "asset" : "assets"}.` : "",
        replaced > 0 ? `Replaced ${replaced} ${replaced === 1 ? "asset" : "assets"}.` : "",
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

  async function deleteAsset(asset: Asset) {
    setBusy(true)
    try {
      await request(`/api/assets/${asset.category}/${encodeURIComponent(asset.name)}`, { method: "DELETE" })
      const nextProject = await request<StoreShotProject>("/api/project")
      onProjectChange(nextProject)
      setAssetPendingDeletion(null)
    } catch (nextError) {
      setError(messageFor(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function updateDeviceType(asset: Asset, value: "auto" | ScreenshotDeviceType) {
    setBusy(true)
    setError(null)
    try {
      const nextProject = await request<StoreShotProject>(
        `/api/assets/${asset.category}/${encodeURIComponent(asset.name)}`,
        { method: "PATCH", body: JSON.stringify({ deviceType: value === "auto" ? null : value }) },
      )
      onProjectChange(nextProject)
      setPreview((current) => current?.id === asset.id
        ? nextProject.assets.screenshots.find((item) => item.id === asset.id) ?? null
        : current)
    } catch (nextError) {
      setError(messageFor(nextError))
    } finally {
      setBusy(false)
    }
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
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={uploadAssets}
          />
          <Button disabled={busy} onClick={() => fileInput.current?.click()}>
            <Upload className="size-4" />
            Add to {categoryDetails[category].label.toLowerCase()}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {ASSET_CATEGORIES.map((item) => {
            const details = categoryDetails[item]
            const Icon = details.icon
            const selected = category === item
            return (
              <Button
                aria-pressed={selected}
                className={cn(
                  "h-11 w-full flex-row justify-start gap-2 rounded-lg px-2.5 text-left",
                  selected && "border-foreground/50 bg-muted/40 hover:border-foreground/50 hover:bg-muted/40",
                )}
                key={item}
                type="button"
                variant="outline"
                onClick={() => setCategory(item)}
              >
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground", selected && "bg-foreground text-background")}>
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{details.label}</span>
                <Badge className="h-5 px-1.5 text-[10px]" variant="secondary">{project.assets[item].length}</Badge>
              </Button>
            )
          })}
        </div>

        {notice && <Alert role="status" variant="muted"><AlertDescription>{notice}</AlertDescription></Alert>}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

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
            <CardDescription>{categoryDetails[category].description}. Add files or drop a folder; PNG, JPEG, WebP, and SVG up to 25 MB.</CardDescription>
          </CardHeader>
          <CardContent>
            {assets.length === 0 ? (
              <Button
                className="h-auto min-h-72 w-full flex-col gap-3 rounded-xl border-dashed bg-muted/20 text-center whitespace-normal hover:bg-muted/40"
                type="button"
                variant="outline"
                onClick={() => fileInput.current?.click()}
              >
                <span className="grid size-12 place-items-center rounded-full border bg-background shadow-sm">
                  <ImagePlus className="size-5 text-muted-foreground" />
                </span>
                <span className="text-sm font-medium">Add your first {categoryDetails[category].label.toLowerCase()}</span>
                <span className="text-xs text-muted-foreground">Choose files or drop files and folders anywhere on this page.</span>
              </Button>
            ) : (
              <div className="space-y-7">
                {assetGroups.map((group) => (
                  <section aria-labelledby={group.label ? `asset-group-${group.id}` : undefined} key={group.id}>
                    <Collapsible
                      open={!collapsedGroups.has(group.id)}
                      onOpenChange={(open) => setCollapsedGroups((current) => {
                        const next = new Set(current)
                        if (open) next.delete(group.id)
                        else next.add(group.id)
                        return next
                      })}
                    >
                      {group.label && (
                        <CollapsibleTrigger
                          className="mb-3 flex w-full items-center gap-2 rounded-md py-1 text-left outline-none hover:text-foreground/70 focus-visible:ring-2 focus-visible:ring-ring [&[data-panel-open]>svg]:rotate-180"
                          id={`asset-group-${group.id}`}
                        >
                          <span className="text-sm font-semibold">{group.label}</span>
                          <Badge className="h-5 px-2 text-[11px]" variant="secondary">{group.assets.length}</Badge>
                          <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform" />
                        </CollapsibleTrigger>
                      )}
                      <CollapsibleContent>
                        <div className={cn(
                          "grid gap-4",
                          category === "screenshots"
                            ? "grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]"
                            : "sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
                        )}>
                      {group.assets.map((asset) => (
                  <article className="group overflow-hidden rounded-xl border bg-background" key={asset.id}>
                    <Button
                      aria-label={`Preview ${asset.name}`}
                      className="relative grid h-auto w-full place-items-center overflow-hidden rounded-none bg-[linear-gradient(45deg,#f4f4f5_25%,transparent_25%),linear-gradient(-45deg,#f4f4f5_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f4f4f5_75%),linear-gradient(-45deg,transparent_75%,#f4f4f5_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px] p-0 hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:translate-y-0"
                      style={{ aspectRatio: category === "screenshots" ? screenshotPreviewAspectRatios[asset.deviceType ?? "unknown"] : "4 / 3" }}
                      type="button"
                      variant="ghost"
                      onClick={() => setPreview(asset)}
                    >
                      <img className="h-full w-full object-contain" src={asset.url} alt={asset.name} />
                      <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100 group-focus-within:bg-black/20 group-focus-within:opacity-100">
                        <span className="grid size-10 place-items-center rounded-full bg-background/90 shadow-sm">
                          <Eye className="size-4" />
                        </span>
                        <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-1 text-[10px] font-medium text-white shadow-sm backdrop-blur-sm">
                          {asset.width && asset.height ? `${asset.width} × ${asset.height} · ` : ""}{formatBytes(asset.size)}
                        </span>
                      </span>
                    </Button>
                    <div className="flex items-center justify-between gap-1.5 px-2 py-1.5">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium" title={asset.name}>{asset.name}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {category === "screenshots" && (
                        <Select
                          disabled={busy}
                          value={asset.deviceTypeOverride ?? "auto"}
                          onValueChange={(value) => {
                            if (value !== null) void updateDeviceType(asset, value as "auto" | ScreenshotDeviceType)
                          }}
                        >
                          <SelectTrigger
                            aria-label={`Device type for ${asset.name}`}
                            className="justify-center border-0 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground [&>svg:last-child]:hidden"
                            title={asset.deviceType && asset.deviceType !== "unknown" ? deviceTypeLabels[asset.deviceType] : "Unknown device"}
                            size="icon-xs"
                          >
                            <SelectValue>
                              <DeviceTypeIcon deviceType={asset.deviceType ?? "unknown"} />
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto · {asset.detectedDeviceType && asset.detectedDeviceType !== "unknown" ? deviceTypeLabels[asset.detectedDeviceType] : "Unknown"}</SelectItem>
                            {SCREENSHOT_DEVICE_TYPES.map((deviceType) => (
                              <SelectItem key={deviceType} value={deviceType}>{deviceTypeLabels[deviceType]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        )}
                        <Button
                          aria-label={`Delete ${asset.name}`}
                          className="text-muted-foreground hover:text-foreground"
                          disabled={busy}
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => setAssetPendingDeletion(asset)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </article>
                      ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </section>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null) }}>
        {preview && (
          <DialogContent className="h-[calc(100vh-2rem)] max-w-7xl grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0">
            <DialogHeader className="border-b px-4 py-3 pr-14">
              <DialogTitle className="truncate text-sm">{preview.name}</DialogTitle>
              <DialogDescription className="text-xs">{categoryDetails[preview.category].label} · {formatBytes(preview.size)}</DialogDescription>
            </DialogHeader>
            <div className="relative min-h-0 overflow-hidden bg-black/85 p-4">
              <img className="size-full object-contain" src={preview.url} alt={preview.name} />
            </div>
          </DialogContent>
        )}
      </Dialog>

      <AlertDialog open={Boolean(assetPendingDeletion)} onOpenChange={(open) => { if (!open && !busy) setAssetPendingDeletion(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this asset?</AlertDialogTitle>
            <AlertDialogDescription>
              {assetPendingDeletion?.name} will be removed from the local asset catalog. Existing canvas layers that use it will no longer render.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button disabled={busy} variant="outline" />}>Cancel</AlertDialogCancel>
            <Button disabled={busy || !assetPendingDeletion} variant="destructive" onClick={() => { if (assetPendingDeletion) void deleteAsset(assetPendingDeletion) }}>
              Delete asset
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function DeviceTypeIcon({ deviceType }: { deviceType: DetectedScreenshotDeviceType }) {
  const Icon = {
    iphone: Smartphone,
    ipad: Tablet,
    mac: Monitor,
    watch: WatchIcon,
    unknown: CircleHelp,
  }[deviceType]
  return <Icon className="size-3.5" />
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
