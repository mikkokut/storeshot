import { useRef, useState, type ChangeEvent } from "react"
import { BadgeCheck, Image, ImagePlus, Palette, Shapes, Trash2, Upload } from "lucide-react"

import { formatBytes, messageFor, request } from "@/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { ASSET_CATEGORIES, type AppshotProject, type AssetCategory } from "../shared"

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

export function AssetsView({ project, onProjectChange }: AssetsViewProps) {
  const [category, setCategory] = useState<AssetCategory>("screenshots")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const assets = project.assets[category]

  async function uploadAssets(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) return
    setBusy(true)
    setError(null)
    try {
      let nextProject = project
      for (const file of files) {
        nextProject = await request<AppshotProject>(
          `/api/assets?category=${category}&filename=${encodeURIComponent(file.name)}`,
          { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file },
        )
      }
      onProjectChange(nextProject)
    } catch (nextError) {
      setError(messageFor(nextError))
    } finally {
      event.target.value = ""
      setBusy(false)
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

  return (
    <div className="h-full overflow-auto">
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
                className={cn(
                  "rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:border-foreground/20",
                  selected && "border-primary ring-1 ring-primary",
                )}
                key={item}
                type="button"
                onClick={() => setCategory(item)}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className={cn("grid size-9 place-items-center rounded-lg bg-muted", selected && "bg-primary text-primary-foreground")}>
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

        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <Card>
          <CardHeader>
            <CardTitle>{categoryDetails[category].label}</CardTitle>
            <CardDescription>{categoryDetails[category].description}. PNG, JPEG, and WebP up to 25 MB.</CardDescription>
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
                  <span className="block text-xs text-muted-foreground">These files can be placed in any screenshot area.</span>
                </span>
              </button>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {assets.map((asset) => (
                  <article className="group overflow-hidden rounded-xl border bg-background" key={asset.id}>
                    <div className="grid aspect-[4/3] place-items-center overflow-hidden bg-[linear-gradient(45deg,#f4f4f5_25%,transparent_25%),linear-gradient(-45deg,#f4f4f5_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f4f4f5_75%),linear-gradient(-45deg,transparent_75%,#f4f4f5_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]">
                      <img className="h-full w-full object-contain" src={asset.url} alt={asset.name} />
                    </div>
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
    </div>
  )
}
