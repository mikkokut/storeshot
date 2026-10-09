import { useMemo, useState } from "react"
import {
  ArrowUpRight,
  Download,
  LoaderCircle,
  Monitor,
  Smartphone,
  Tablet,
  Tv,
  Watch,
  Glasses,
} from "lucide-react"
import { ArtworkViewer } from "@/ArtworkViewer"
import { PageTitle } from "@/PageTitle"
import { ArtworkEmptyState } from "@/ArtworkEmptyState"
import { request, messageFor } from "@/api"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Choice, CreateSetDialog } from "@/CreateSetForm"
import {
  LanguageDialog,
  PageDialog,
  RemovePageDialog,
} from "@/WorkspaceDialogs"
import { appStoreLocale } from "@/app-store-locales"
import {
  ASSET_SPECS,
  DEVICE_LABELS,
  assetSpec,
  creationSpecsForPage,
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
  onChange: (project: StoreShotProject, pageId?: string) => void
  onNavigate: (path: string) => void
}
const DEVICE_TABS: {
  id: AppDevice
  title: string
  subtitle?: string
  icon: typeof Smartphone
}[] = [
  {
    id: "iphone",
    title: "iPhone with Dynamic Island",
    subtitle: "(medium display)",
    icon: Smartphone,
  },
  { id: "ipad", title: "iPad", subtitle: '13" display', icon: Tablet },
  { id: "watch", title: "Apple Watch", icon: Watch },
  { id: "mac", title: "Mac", icon: Monitor },
  { id: "tv", title: "Apple TV", icon: Tv },
  { id: "vision", title: "Apple Vision Pro", icon: Glasses },
]

export function ProductPageWorkspace({
  project,
  page,
  onChange,
  onNavigate,
}: WorkspaceProps) {
  const [viewingId, setViewingId] = useState<string | null>(null)
  const viewing = project.sets.find(
    (set) => set.id === viewingId && set.pageId === page.id,
  )
  const [language, setLanguage] = useState(page.localizations[0] ?? "")
  const locale = page.localizations.includes(language)
    ? language
    : (page.localizations[0] ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const collections = project.sets.filter(
    (set) => set.pageId === page.id && set.locale === locale,
  )
  const specs = creationSpecsForPage(page)
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
  async function created(set: ScreenshotSet) {
    setLanguage(set.locale)
    onChange(await request<StoreShotProject>("/api/project"))
  }
  const preserved = collections.filter(
    (set) => !specs.some((spec) => spec.id === set.specId),
  )
  return (
    <Tabs defaultValue="screenshots" className="h-full">
      <header className="border-b bg-background px-8 pt-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-full">
            <p className="text-xs text-muted-foreground">Product Page</p>
            <PageTitle key={page.id} page={page} onChange={onChange} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RemovePageDialog key={page.id} page={page} onChange={onChange} />
            <PageDialog
              project={project}
              sourcePageId={page.id}
              onChange={onChange}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={
                busy || !project.sets.some((set) => set.pageId === page.id)
              }
              onClick={() => void exportPage()}
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <Download />}
              Export all languages
            </Button>
          </div>
        </div>
        <div className="my-5 flex flex-wrap items-end gap-3">
          {locale ? (
            <>
              <div className="w-64">
                <Choice
                  label="Localization"
                  value={locale}
                  onChange={setLanguage}
                  options={page.localizations.map((code) => ({
                    value: code,
                    label: appStoreLocale(code).name,
                  }))}
                />
              </div>
              <LanguageDialog
                key={`${page.id}/${locale}`}
                page={page}
                locale={locale}
                onChange={(project, locale) => {
                  onChange(project)
                  setLanguage(locale)
                }}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Choose a language when creating your first screenshot or artwork.
            </p>
          )}
        </div>
        <TabsList aria-label="Asset type">
          <TabsTrigger value="screenshots">Screenshots</TabsTrigger>
          <TabsTrigger value="creative">
            Header &amp; Search Results
          </TabsTrigger>
        </TabsList>
      </header>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <TabsContent value="screenshots" className="overflow-auto p-8">
        <DeviceArtwork
          key={page.id}
          project={project}
          page={page}
          locale={locale}
          collections={collections}
          onCreate={created}
          onView={setViewingId}
          onNavigate={onNavigate}
        />
        {preserved.length > 0 && (
          <details className="mt-8 rounded-xl border bg-background p-5">
            <summary className="cursor-pointer text-sm font-medium">
              Additional artwork · {preserved.length}
            </summary>
            <div className="mt-4 space-y-3">
              {preserved.map((set) => (
                <div
                  key={set.id}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-sm">
                    {set.name} · {set.canvas.width} × {set.canvas.height}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setViewingId(set.id)}
                  >
                    View artwork
                  </Button>
                </div>
              ))}
            </div>
          </details>
        )}
      </TabsContent>
      <TabsContent value="creative" className="overflow-auto p-8">
        <Tabs defaultValue="header">
          <TabsList aria-label="Creative placement">
            <TabsTrigger value="header">Header</TabsTrigger>
            <TabsTrigger value="search-results">Search Results</TabsTrigger>
            <TabsTrigger value="universal">Universal Creative</TabsTrigger>
          </TabsList>
          {ASSET_SPECS.filter((spec) => spec.device === "creative").map(
            (spec) => (
              <TabsContent key={spec.id} value={spec.id} className="pt-7">
                <ArtworkSlot
                  spec={spec}
                  set={collections.find((set) => set.specId === spec.id)}
                  page={page}
                  locale={locale}
                  project={project}
                  onCreate={created}
                  onView={setViewingId}
                  onNavigate={onNavigate}
                  available={specs.includes(spec)}
                />
              </TabsContent>
            ),
          )}
        </Tabs>
      </TabsContent>
      {viewing && (
        <ArtworkViewer
          set={viewing}
          project={project}
          onClose={() => setViewingId(null)}
        />
      )}
    </Tabs>
  )
}

function DeviceArtwork({
  project,
  page,
  locale,
  collections,
  onCreate,
  onNavigate,
  onView,
}: {
  project: StoreShotProject
  page: ProductPage
  locale: string
  collections: ScreenshotSet[]
  onCreate: (set: ScreenshotSet) => Promise<void>
  onNavigate: (path: string) => void
  onView: (id: string) => void
}) {
  const [device, setDevice] = useState<AppDevice>(
    project.sets.flatMap((set) => {
      const spec = assetSpec(set.specId)
      return set.pageId === page.id &&
        spec?.requirement === "required" &&
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
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList aria-label="Screenshot device" variant="icon">
          {DEVICE_TABS.map(({ id, title, subtitle, icon: Icon }) => (
            <TabsTrigger key={id} value={id} variant="icon">
              <Icon aria-hidden className="size-8 shrink-0 stroke-[1.3]" />
              <span className="text-sm leading-5">
                {title}
                {subtitle && (
                  <span className="block font-normal text-muted-foreground">
                    {subtitle}
                  </span>
                )}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {DEVICE_TABS.map(({ id }) => {
        const selected = ASSET_SPECS.find(
          (spec) => spec.device === id && spec.requirement === "required",
        )!
        const available =
          page.kind === "default" ||
          ["iphone", "ipad", "iphone-duo"].includes(id)
        return (
          <TabsContent key={id} value={id} className="pt-7">
            <ArtworkSlot
              spec={selected}
              set={collections.find((set) => set.specId === selected.id)}
              page={page}
              locale={locale}
              project={project}
              onCreate={onCreate}
              onView={onView}
              onNavigate={onNavigate}
              available={available}
            />
          </TabsContent>
        )
      })}
    </Tabs>
  )
}

function ArtworkSlot({
  spec,
  set,
  page,
  locale,
  project,
  onCreate,
  onNavigate,
  onView,
  available,
}: {
  spec: AssetSpec
  set?: ScreenshotSet
  page: ProductPage
  locale: string
  project: StoreShotProject
  onCreate: (set: ScreenshotSet) => Promise<void>
  onNavigate: (path: string) => void
  onView: (id: string) => void
  available: boolean
}) {
  const isScreenshot = spec.kind === "screenshots"
  const name =
    spec.device === "creative" ? spec.name : DEVICE_LABELS[spec.device]
  const create = (
    <CreateSetDialog
      key={`${page.id}/${locale}/${spec.id}`}
      spec={spec}
      pageId={page.id}
      locale={locale}
      sets={project.sets}
      onCreate={onCreate}
      label={`Create ${name}${isScreenshot ? " screenshots" : " artwork"}`}
    />
  )
  if (!set)
    return (
      <ArtworkEmptyState
        title={
          available
            ? `No ${name} ${isScreenshot ? "screenshots" : "artwork"} yet`
            : `${name} artwork lives on your default page`
        }
        description={
          available
            ? isScreenshot
              ? `Create the first composition${locale ? ` for ${appStoreLocale(locale).name}` : " and choose its language"}. Add your app imagery, tell its story, and export at the right size.`
              : spec.guidance
            : "Custom product pages and optimization treatments support iPhone and iPad artwork. Use your default page for this device."
        }
        metadata={
          available
            ? `${spec.sizes[0].join(" × ")} px · ${isScreenshot ? "1–10 screenshots" : "1 PNG image"}`
            : undefined
        }
        actions={
          available ? (
            create
          ) : (
            <Button
              variant="outline"
              onClick={() => onNavigate("/pages/default")}
            >
              Open default product page
              <ArrowUpRight />
            </Button>
          )
        }
        footer={
          available && isScreenshot
            ? "Source images are available from your Asset Library."
            : undefined
        }
      />
    )
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{spec.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {set.areas.length} {isScreenshot ? "screenshots" : "image"} ·{" "}
            {set.canvas.width} × {set.canvas.height} px ·{" "}
            {appStoreLocale(locale).name}
          </p>
        </div>
      </div>
      <ArtworkStrip
        set={set}
        revision={project}
        onOpen={() => onView(set.id)}
      />
    </div>
  )
}

function ArtworkStrip({
  set,
  revision,
  onOpen,
}: {
  set: ScreenshotSet
  revision: StoreShotProject
  onOpen: () => void
}) {
  const stamp = useMemo(() => Date.now(), [revision])
  const scale = Math.min(380 / set.canvas.height, 660 / set.canvas.width, 1)
  return (
    <div className="flex gap-5 overflow-x-auto pb-4">
      {set.areas.map((area, index) => (
        <button
          type="button"
          key={area.id}
          aria-label={`Open ${area.name}`}
          className="group shrink-0 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onOpen}
        >
          <div
            className="overflow-hidden rounded-xl bg-white ring-1 ring-black/10 transition-shadow group-hover:shadow-md"
            style={{
              width: set.canvas.width * scale,
              height: set.canvas.height * scale,
            }}
          >
            <iframe
              key={`${area.id}-${stamp}`}
              aria-hidden
              title={area.name}
              tabIndex={-1}
              sandbox=""
              src={`/artboards/sets/${set.id}/${area.id}.html?revision=${stamp}`}
              style={{
                width: set.canvas.width,
                height: set.canvas.height,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                border: 0,
                pointerEvents: "none",
              }}
            />
          </div>
          <p className="mt-3 max-w-64 truncate text-xs text-muted-foreground">
            {String(index + 1).padStart(2, "0")} · {area.name}
          </p>
        </button>
      ))}
    </div>
  )
}
