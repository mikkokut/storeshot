import { useRef, useState, type ChangeEvent, type DragEvent } from "react"
import { ChevronDown, CircleAlert, CircleCheck, CircleHelp, Eye, Image, Monitor, Palette, Shapes, Smartphone, Tablet, Trash2, Upload, Watch as WatchIcon } from "lucide-react"

import { formatBytes, messageFor, request, RequestError } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArtworkEmptyState } from "@/ArtworkEmptyState"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/PageHeader"
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
  brand: { label: "Brand assets", description: "Photography, logos, illustrations, and artwork", icon: Palette },
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
    if (busy || candidates.length === 0) return
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
    } catch (nextError) {
      setError(messageFor(nextError))
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
    if (busy) return
    setBusy(true)
    setError(null)
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
    <Tabs
      value={category}
      onValueChange={(value) => setCategory(value as AssetCategory)}
      className="relative min-h-0 w-full min-w-0 flex-1 overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        ref={fileInput}
        className="hidden"
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={uploadAssets}
      />
      <PageHeader
        eyebrow="Project library"
        title="Asset Library"
        description="Keep source images here to reuse across your screenshots and artwork."
        actions={(
          <Button disabled={busy} onClick={() => fileInput.current?.click()}>
            <Upload />
            Add to {categoryDetails[category].label.toLowerCase()}
          </Button>
        )}
      >
        <div className="mt-4 overflow-x-auto">
          <TabsList aria-label="Asset category" className="-mb-px">
            {ASSET_CATEGORIES.map((item) => {
              const { label, icon: Icon } = categoryDetails[item]
              return (
                <TabsTrigger key={item} value={item}>
                  <Icon aria-hidden className="size-4" />
                  {label}
                  <Badge variant="secondary" className="px-1.5">
                    {project.assets[item].length}
                  </Badge>
                </TabsTrigger>
              )
            })}
          </TabsList>
        </div>
      </PageHeader>

      {notice && (
        <Alert role="status" variant="muted" layout="banner">
          <CircleCheck />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" layout="banner">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-ring bg-background/90 backdrop-blur-sm">
          <div className="text-center">
            <span className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-primary text-primary-foreground">
              <Upload className="size-5" />
            </span>
            <p className="font-semibold">Drop files or folders</p>
            <p className="mt-1 text-sm text-muted-foreground">Supported images will be added to {categoryDetails[category].label.toLowerCase()}.</p>
          </div>
        </div>
      )}

      {ASSET_CATEGORIES.map((item) => (
        <TabsContent key={item} value={item} className="overflow-auto p-6 lg:p-8">
          {category === item && (
            <div>
              {assets.length === 0 ? (
                <ArtworkEmptyState
                  title={`No ${categoryDetails[category].label.toLowerCase()} yet`}
                  description={`${categoryDetails[category].description}. Add source images to use in your compositions.`}
                  metadata="PNG, JPEG, WebP, or SVG · Up to 25 MB per file"
                  actions={(
                    <Button disabled={busy} onClick={() => fileInput.current?.click()}>
                      <Upload />
                      Add {categoryDetails[category].label.toLowerCase()}
                    </Button>
                  )}
                  footer="Choose files or drop files and folders anywhere on this page."
                />
              ) : (
                <>
                  <div className="mb-5">
                    <h2 className="text-base font-semibold tracking-tight">{categoryDetails[category].label}</h2>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      <span className="tabular-nums">{assets.length}</span> {assets.length === 1 ? "image" : "images"} · {categoryDetails[category].description}
                    </p>
                  </div>
                  <div className="space-y-6">
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
                              className="-mx-2 mb-3 flex h-8 w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 [&[data-panel-open]>svg]:rotate-180"
                              id={`asset-group-${group.id}`}
                            >
                              <span className="text-sm font-medium">{group.label}</span>
                              <Badge className="px-1.5" variant="secondary">{group.assets.length}</Badge>
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
                                <article className="group min-w-0" key={asset.id}>
                                  <Button
                                    aria-label={`Preview ${asset.name}`}
                                    className="relative grid h-auto w-full place-items-center overflow-hidden rounded-xl bg-[linear-gradient(45deg,#f4f4f5_25%,transparent_25%),linear-gradient(-45deg,#f4f4f5_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f4f4f5_75%),linear-gradient(-45deg,transparent_75%,#f4f4f5_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px] p-0 shadow-xs ring-1 ring-black/10 transition-shadow hover:bg-transparent hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 active:translate-y-0"
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
                                  <div className="mt-2 flex items-center justify-between gap-1.5">
                                    <div className="min-w-0">
                                      <p className="truncate text-[13px]" title={asset.name}>{asset.name}</p>
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
                                            className="justify-center border-0 bg-transparent text-muted-foreground shadow-none hover:bg-muted hover:text-foreground [&>svg:last-child]:hidden"
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
                                        onClick={() => {
                                          setError(null)
                                          setAssetPendingDeletion(asset)
                                        }}
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
                  <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                    Add files or drop a folder. PNG, JPEG, WebP, and SVG up to 25 MB per file.
                  </p>
                </>
              )}
            </div>
          )}
        </TabsContent>
      ))}
      <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null) }}>
        {preview && (
          <DialogContent className="h-[calc(100dvh-2rem)] max-h-none max-w-7xl grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0">
            <DialogHeader className="gap-0.5 border-b px-5 py-3.5 pr-14">
              <DialogTitle className="truncate">{preview.name}</DialogTitle>
              <DialogDescription className="text-[13px] tabular-nums">
                {categoryDetails[preview.category].label}
                {preview.width && preview.height ? ` · ${preview.width} × ${preview.height} px` : ""} · {formatBytes(preview.size)}
              </DialogDescription>
            </DialogHeader>
            <div className="relative min-h-0 overflow-hidden bg-neutral-900 p-4">
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
              <span className="font-medium break-all text-foreground">{assetPendingDeletion?.name}</span> will be removed from the local Asset Library. Artwork using it will no longer render.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button disabled={busy} variant="outline" />}>Cancel</AlertDialogCancel>
            <Button disabled={busy || !assetPendingDeletion} variant="destructive" onClick={() => { if (assetPendingDeletion) void deleteAsset(assetPendingDeletion) }}>
              Delete asset
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
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
