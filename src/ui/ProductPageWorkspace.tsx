import { useState } from "react"
import {
  ChevronRight,
  CircleAlert,
  Columns2,
  Download,
  LoaderCircle,
  Monitor,
  Minus,
  Plus,
  Minimize2,
  Smartphone,
  Tablet,
  Tv,
  Watch,
  Glasses,
} from "lucide-react"
import { ArtworkPreview } from "@/ArtworkPreview"
import { PageHeader } from "@/PageHeader"
import { PageTitle } from "@/PageTitle"
import { ArtworkEmptyState } from "@/ArtworkEmptyState"
import { messageFor } from "@/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { AgentPrompt } from "@/AgentPrompt"
import {
  RemoveLanguageDialog,
  PageDialog,
  RemovePageDialog,
} from "@/WorkspaceDialogs"
import { appStoreLocale } from "@/app-store-locales"
import {
  ASSET_SPECS,
  DEVICE_LABELS,
  assetSpec,
  CREATION_SPECS,
  type AssetSpec,
} from "../app-store"
import type {
  AppDevice,
  ProductPage,
  ScreenshotSet,
  StoreShotProject,
} from "../shared"

interface WorkspaceProps {
  project: StoreShotProject
  page: ProductPage
  onChange: (project: StoreShotProject, pageId?: string | null) => void
}
const DEFAULT_PREVIEW_ZOOM = 150

const DEVICE_TABS: {
  id: AppDevice
  title: string
  subtitle?: string
  icon: typeof Smartphone
}[] = [
  {
    id: "iphone",
    title: "iPhone",
    subtitle: "Dynamic Island, medium",
    icon: Smartphone,
  },
  { id: "iphone-duo", title: "iPhone Duo", subtitle: "Outer & inner displays", icon: Columns2 },
  { id: "ipad", title: "iPad", subtitle: "13-inch display", icon: Tablet },
  { id: "watch", title: "Apple Watch", icon: Watch },
  { id: "mac", title: "Mac", icon: Monitor },
  { id: "tv", title: "Apple TV", icon: Tv },
  { id: "vision", title: "Apple Vision Pro", icon: Glasses },
]
export function ProductPageWorkspace({
  project,
  page,
  onChange,
}: WorkspaceProps) {
  const [zoom, setZoom] = useState(DEFAULT_PREVIEW_ZOOM)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const collections = project.sets.filter(
    (set) => set.pageId === page.id,
  )
  const specs = CREATION_SPECS
  async function exportPage() {
    setBusy(true)
    setError(null)
    try {
      const { exportCollections } = await import("@/export-set")
      await exportCollections(
        project,
        project.sets.filter((set) => set.pageId === page.id),
      )
    } catch (error) {
      setError(messageFor(error))
    } finally {
      setBusy(false)
    }
  }
  const preserved = collections.filter(
    (set) => !specs.some((spec) => spec.id === set.specId),
  )
  return (
    <Tabs defaultValue="screenshots" className="relative min-h-0 flex-1">
      <PageHeader
        title={<PageTitle key={page.id} page={page} onChange={onChange} />}
        actions={
          <>
            <RemovePageDialog key={page.id} page={page} onChange={onChange} />
            <PageDialog
              project={project}
              sourcePageId={page.id}
              onChange={onChange}
            />
            <Button
              variant="outline"
              disabled={
                busy || !project.sets.some((set) => set.pageId === page.id)
              }
              onClick={() => void exportPage()}
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <Download />}
              Export all languages
            </Button>
          </>
        }
      >
        <div className="mt-4">
          <TabsList aria-label="Asset type" className="-mb-px">
            <TabsTrigger value="screenshots">Screenshots</TabsTrigger>
            <TabsTrigger value="creative">
              Header &amp; Search Results
            </TabsTrigger>
          </TabsList>
        </div>
      </PageHeader>
      {error && (
        <Alert variant="destructive" layout="banner">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {collections.length > 0 && (
        <p className="border-b px-6 py-3 text-sm text-muted-foreground lg:px-8">
          To add screenshots or languages, ask your agent to update this project.
          Keep StoreShot open to review changes as they arrive.
        </p>
      )}
      <TabsContent value="screenshots" className="overflow-auto p-6 pb-24 lg:p-8 lg:pb-24">
        <DeviceArtwork
          key={page.id}
          project={project}
          page={page}
          collections={collections}
          onChange={onChange}
          zoom={zoom}
        />
        {preserved.length > 0 && (
          <details className="group mt-8 rounded-xl border bg-card">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
              Additional artwork
              <Badge variant="secondary">{preserved.length}</Badge>
            </summary>
            <ul className="divide-y border-t">
              {preserved.map((set) => (
                <li
                  key={set.id}
                  className="space-y-4 p-4"
                >
                  <span className="min-w-0 truncate text-sm">
                    {set.name}
                    <span className="ml-2 text-muted-foreground tabular-nums">
                      {set.canvas.width} × {set.canvas.height}
                    </span>
                  </span>
                  <ArtworkStrip set={set} zoom={zoom} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </TabsContent>
      <TabsContent value="creative" className="overflow-auto p-6 pb-24 lg:p-8 lg:pb-24">
        <Tabs defaultValue="header">
          <TabsList aria-label="Creative placement" variant="segmented">
            <TabsTrigger value="header" variant="segmented">
              Header
            </TabsTrigger>
            <TabsTrigger value="search-results" variant="segmented">
              Search Results
            </TabsTrigger>
            <TabsTrigger value="universal" variant="segmented">
              Universal Creative
            </TabsTrigger>
          </TabsList>
          {ASSET_SPECS.filter((spec) => spec.device === "creative").map(
            (spec) => (
              <TabsContent key={spec.id} value={spec.id} className="pt-6">
                <ArtworkLanguages
                  specs={[spec]}
                  collections={collections}
                  onChange={onChange}
                  page={page}
                  zoom={zoom}
                />
              </TabsContent>
            ),
          )}
        </Tabs>
      </TabsContent>
      {collections.some((set) => set.areas.length > 0) && (
        <div
          role="group"
          aria-label="Preview zoom"
          className="absolute right-6 bottom-5 z-20 flex items-center gap-1 rounded-xl border bg-background p-1.5 shadow-md lg:right-8"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={zoom <= 50}
            onClick={() => setZoom((value) => Math.max(50, value - 25))}
          >
            <Minus aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Reset zoom"
            title="Reset zoom"
            disabled={zoom === DEFAULT_PREVIEW_ZOOM}
            onClick={() => setZoom(DEFAULT_PREVIEW_ZOOM)}
          >
            <Minimize2 aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={zoom >= 300}
            onClick={() => setZoom((value) => Math.min(300, value + 25))}
          >
            <Plus aria-hidden />
          </Button>
        </div>
      )}
    </Tabs>
  )
}

function DeviceArtwork({
  project,
  page,
  collections,
  onChange,
  zoom,
}: {
  project: StoreShotProject
  page: ProductPage
  collections: ScreenshotSet[]
  onChange: (project: StoreShotProject) => void
  zoom: number
}) {
  const [device, setDevice] = useState<AppDevice>(
    project.sets.flatMap((set) => {
      const spec = assetSpec(set.specId)
      return set.pageId === page.id &&
        spec && spec.requirement !== "optional" &&
        spec.device !== "creative"
        ? [spec.device]
        : []
    })[0] ?? "iphone",
  )
  return (
    <Tabs
      value={device}
      onValueChange={(value) => setDevice(value as AppDevice)}
    >
      <div className="-m-1 overflow-x-auto p-1">
        <TabsList aria-label="Screenshot device" variant="icon">
          {DEVICE_TABS.map(({ id, title, subtitle, icon: Icon }) => (
            <TabsTrigger key={id} value={id} variant="icon">
              <Icon aria-hidden className="size-5 stroke-[1.5]" />
              <span className="text-[13px] leading-tight">
                {title}
                {subtitle && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    {subtitle}
                  </span>
                )}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {DEVICE_TABS.map(({ id }) => {
        const selected = CREATION_SPECS.filter((spec) => spec.device === id)
        return (
          <TabsContent key={id} value={id} className="pt-6">
            <ArtworkLanguages
              specs={selected}
              collections={collections}
              onChange={onChange}
              page={page}
              zoom={zoom}
            />
          </TabsContent>
        )
      })}
    </Tabs>
  )
}

function ArtworkLanguages({
  specs,
  collections,
  page,
  onChange,
  ...props
}: {
  specs: AssetSpec[]
  collections: ScreenshotSet[]
  page: ProductPage
  onChange: (project: StoreShotProject) => void
  zoom: number
}) {
  const locales = page.localizations.length ? page.localizations : [""]
  return (
    <div className="space-y-10">
      {locales.map((locale) => (
        <section key={locale} aria-label={locale ? appStoreLocale(locale).name : "Artwork"}>
          {locale && (
            <div className="mb-5 flex items-center gap-2">
              <h2 className="flex items-baseline gap-2 text-lg font-semibold tracking-tight">
                {appStoreLocale(locale).name}
                <span className="text-xs font-normal tracking-normal text-muted-foreground">{locale}</span>
              </h2>
              <RemoveLanguageDialog page={page} locale={locale} onChange={onChange} />
            </div>
          )}
          <div className="space-y-8">
            {specs.map((spec) => (
              <ArtworkSlot
                key={spec.id}
                spec={spec}
                set={collections.find((set) => set.specId === spec.id && set.locale === locale)}
                page={page}
                locale={locale}
                {...props}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function ArtworkSlot({
  spec,
  set,
  page,
  locale,
  zoom,
}: {
  spec: AssetSpec
  set?: ScreenshotSet
  page: ProductPage
  locale: string
  zoom: number
}) {
  const isScreenshot = spec.kind === "screenshots"
  const name =
    spec.device === "creative" || spec.device === "iphone-duo"
      ? spec.name
      : DEVICE_LABELS[spec.device]
  if (!set)
    return (
      <ArtworkEmptyState
        title={`No ${name} ${isScreenshot ? "screenshots" : "artwork"} yet`}
        description={`Ask your agent to design ${name} ${isScreenshot ? "screenshots" : "artwork"}${locale ? ` in ${appStoreLocale(locale).name}` : " in your first language"}. Your preview updates as it saves changes.`}
        metadata={`${spec.sizes[0].join(" × ")} px · ${isScreenshot ? "1–10 screenshots" : "1 PNG image"}`}
        actions={
          <AgentPrompt
            page={page}
            spec={spec}
            locale={locale}
          />
        }
        footer={spec.requirement === "upcoming" ? spec.guidance : undefined}
      />
    )
  return (
    <div>
      {spec.device === "iphone-duo" && (
        <h3 className="mb-5 text-sm font-medium">
          {spec.id === "iphone-duo-outer" ? "Outer display" : "Inner display"}
        </h3>
      )}
      <ArtworkStrip
        set={set}
        zoom={zoom}
      />
    </div>
  )
}

function ArtworkStrip({
  set,
  zoom,
}: {
  set: ScreenshotSet
  zoom: number
}) {
  const scale = Math.min(380 / set.canvas.height, 660 / set.canvas.width, 1) * zoom / 100
  return (
    <div className="-m-1 flex gap-5 overflow-x-auto p-1 pb-4">
      {set.areas.map((area, index) => (
        <figure
          key={area.id}
          className="min-w-0 shrink-0"
          style={{ width: set.canvas.width * scale }}
        >
          <ArtworkPreview
            set={set}
            area={area}
            scale={scale}
            frameClassName="rounded-xl bg-white shadow-xs ring-1 ring-black/10"
          >
          <figcaption className="mt-2.5 truncate text-[13px]" title={area.name}>
            <span className="mr-1.5 text-muted-foreground tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            {area.name}
          </figcaption>
          </ArtworkPreview>
        </figure>
      ))}
    </div>
  )
}
