import { lazy, Suspense, useEffect, useRef, useState } from "react"
import {
  ArrowUpRight,
  Images,
  LayoutDashboard,
  LayoutTemplate,
  LoaderCircle,
  Smartphone,
} from "lucide-react"
import { request, messageFor } from "@/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { ArtworkViewer } from "@/ArtworkViewer"
import { ProductPageWorkspace } from "@/ProductPageWorkspace"
import { PageDialog } from "@/WorkspaceDialogs"
import { appStoreLocale } from "@/app-store-locales"
import { cn } from "@/lib/utils"
import {
  APPLE_SPECS_CHECKED,
  CREATIVE_SPEC_URL,
  SCREENSHOT_SPEC_URL,
  readinessIssues,
} from "../app-store"
import type { StoreShotProject } from "../shared"

const AssetsView = lazy(async () => ({
  default: (await import("@/AssetsView")).AssetsView,
}))

export function App() {
  const [project, setProject] = useState<StoreShotProject | null>(null)
  const [path, setPath] = useState(window.location.pathname)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    async function refresh() {
      const id = ++requestId.current
      try {
        const value = await request<StoreShotProject>("/api/project")
        if (active && id === requestId.current) {
          setProject(value)
          setError(null)
        }
      } catch (error) {
        if (active && id === requestId.current) setError(messageFor(error))
      }
    }
    void refresh()
    const events = new EventSource("/api/events")
    const changed = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void refresh(), 120)
    }
    events.addEventListener("project", changed)
    events.addEventListener("ready", changed)
    const popped = () => setPath(window.location.pathname)
    window.addEventListener("popstate", popped)
    return () => {
      active = false
      clearTimeout(timer)
      events.close()
      window.removeEventListener("popstate", popped)
    }
  }, [])
  function navigate(path: string) {
    window.history.pushState(null, "", path)
    setPath(path)
  }
  function changed(project: StoreShotProject, pageId?: string) {
    ++requestId.current
    setProject(project)
    if (pageId) navigate(`/pages/${pageId}`)
  }
  if (!project)
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="max-w-lg p-8 text-sm">
          {error ? (
            <p role="alert">{error}</p>
          ) : (
            <>
              <LoaderCircle className="mr-2 inline size-4 animate-spin" />
              Opening App Store workspace…
            </>
          )}
        </div>
      </main>
    )
  const collection = path.startsWith("/sets/")
    ? project.sets.find((set) => set.id === path.split("/")[2])
    : undefined
  const page = project.config.pages.find(
    (page) => page.id === (collection?.pageId ?? path.split("/")[2]),
  )
  const overview = path === "/" || (!page && path !== "/assets")
  const nav = (
    label: string,
    destination: string,
    active: boolean,
    icon: React.ReactNode,
  ) => (
    <Button
      key={destination}
      className={cn(
        "h-auto w-full justify-start gap-2.5 px-3 py-2.5 text-left",
        active && "bg-muted font-semibold",
      )}
      variant="ghost"
      aria-current={active ? "page" : undefined}
      onClick={() => navigate(destination)}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Button>
  )
  return (
    <div className="flex h-screen min-h-[600px] bg-muted/25">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel
          defaultSize={255}
          minSize={215}
          maxSize={360}
          groupResizeBehavior="preserve-pixel-size"
        >
          <aside className="flex h-full flex-col border-r bg-background">
            <div className="flex h-20 items-center gap-3 border-b px-5">
              <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
                <Smartphone className="size-5" />
              </span>
              <div className="min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">
                  StoreShot · App Store
                </span>
                <p className="truncate font-semibold">
                  {project.directory.split(/[\\/]/).pop()}
                </p>
              </div>
            </div>
            <nav
              className="min-h-0 flex-1 space-y-6 overflow-auto p-3"
              aria-label="App Store workspace"
            >
              <div>
                {nav(
                  "Overview",
                  "/",
                  overview,
                  <LayoutDashboard className="size-4" />,
                )}
                {nav(
                  "Asset Library",
                  "/assets",
                  path === "/assets",
                  <Images className="size-4" />,
                )}
              </div>
              <div>
                <div className="flex items-center justify-between pl-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Product Pages
                  </p>
                  <PageDialog project={project} onChange={changed} />
                </div>
                {project.config.pages.map((item) =>
                  nav(
                    item.name,
                    `/pages/${item.id}`,
                    page?.id === item.id,
                    <LayoutTemplate className="size-4" />,
                  ),
                )}
              </div>
            </nav>
          </aside>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize navigation" />
        <ResizablePanel minSize={550}>
          <main className="flex h-full min-w-0 flex-col">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {overview && <Overview project={project} onNavigate={navigate} />}
            {path === "/assets" && (
              <Suspense fallback={<Loading />}>
                <AssetsView project={project} onProjectChange={changed} />
              </Suspense>
            )}
            {page && (
              <ProductPageWorkspace
                key={page.id}
                project={project}
                page={page}
                onChange={changed}
                onNavigate={navigate}
              />
            )}
            {page && collection && (
              <ArtworkViewer
                key={collection.id}
                set={collection}
                project={project}
                onClose={() => navigate(`/pages/${page.id}`)}
              />
            )}
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
function Loading() {
  return (
    <div className="grid h-full place-items-center">
      <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

function Overview({
  project,
  onNavigate,
}: {
  project: StoreShotProject
  onNavigate: (path: string) => void
}) {
  const issues = readinessIssues(project.config, project.sets)
  const missing = issues.filter((issue) => issue.code === "missing").length
  return (
    <section className="overflow-auto p-8 lg:p-10">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        App Store workspace
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Every page. Every language.
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Prepare your screenshots and creative assets in one place. Start with
        your default page, then adapt the story for a new audience or test a
        different approach.
      </p>
      <div className="my-8 grid grid-cols-3 gap-4">
        {[
          [project.config.pages.length, "Product pages"],
          [
            new Set(project.config.pages.flatMap((page) => page.localizations))
              .size,
            "Languages",
          ],
          [missing, "Missing required slots"],
        ].map(([count, label]) => (
          <div key={label} className="rounded-xl border bg-background p-5">
            <p className="text-3xl font-semibold tracking-tight">{count}</p>
            <p className="mt-1 text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-background">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="font-semibold">Asset coverage</h2>
          <Badge variant="secondary">Local artwork</Badge>
        </div>
        {project.config.pages.map((page) => (
          <div key={page.id} className="border-b px-6 py-5 last:border-0">
            <Button
              variant="link"
              className="h-auto p-0 font-semibold"
              onClick={() => onNavigate(`/pages/${page.id}`)}
            >
              {page.name}
              <ArrowUpRight className="size-4" />
            </Button>
            <div className="mt-3 flex flex-wrap gap-2">
              {page.localizations.map((locale) => {
                const pageIssues = issues.filter(
                  (issue) =>
                    issue.pageId === page.id && issue.locale === locale,
                )
                return (
                  <span
                    key={locale}
                    className="rounded-md border bg-muted/25 px-3 py-1.5 text-xs"
                  >
                    <span className="font-medium">
                      {appStoreLocale(locale).name}
                    </span>
                    <span className="ml-2 text-muted-foreground">
                      {pageIssues.length
                        ? `${pageIssues.length} missing or invalid`
                        : project.sets.some(
                              (set) =>
                                set.pageId === page.id && set.locale === locale,
                            )
                          ? "Assets prepared"
                          : "No artwork yet"}
                    </span>
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-background p-6">
          <h2 className="font-semibold">Required display sizes</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Create one composition size for iPhone and one for iPad if your app
            supports it. App Store Connect scales these screenshots for smaller
            displays.
          </p>
        </div>
        <div className="rounded-xl border bg-background p-6">
          <h2 className="font-semibold">Header & Search Results</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Create dedicated artwork or a universal creative for both
            placements. These optional assets appear on iOS and iPadOS 27 and
            later.
          </p>
        </div>
      </div>
      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        Apple specifications checked {APPLE_SPECS_CHECKED}.{" "}
        <a
          className="underline"
          href={SCREENSHOT_SPEC_URL}
          target="_blank"
          rel="noreferrer"
        >
          Screenshot specifications
        </a>{" "}
        ·{" "}
        <a
          className="underline"
          href={CREATIVE_SPEC_URL}
          target="_blank"
          rel="noreferrer"
        >
          Creative specifications
        </a>
        . StoreShot prepares still images locally; submission, video previews,
        app icons and live experiment results are managed in App Store Connect.
      </p>
    </section>
  )
}
