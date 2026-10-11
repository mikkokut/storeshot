import { lazy, Suspense, useEffect, useRef, useState } from "react"
import {
  ChevronRight,
  CircleAlert,
  Images,
  LayoutDashboard,
  LayoutTemplate,
  LoaderCircle,
  Search,
  Smartphone,
} from "lucide-react"
import { request, messageFor } from "@/api"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { ArtworkViewer } from "@/ArtworkViewer"
import { PageHeader } from "@/PageHeader"
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
const ProductPageWorkspace = lazy(async () => ({
  default: (await import("@/ProductPageWorkspace")).ProductPageWorkspace,
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
  function changed(project: StoreShotProject, pageId?: string | null) {
    ++requestId.current
    setProject(project)
    if (pageId !== undefined) navigate(pageId ? `/pages/${pageId}` : "/")
  }
  if (!project)
    return (
      <main className="grid min-h-dvh place-items-center bg-sidebar p-8">
        {error ? (
          <div
            role="alert"
            className="w-full max-w-sm rounded-2xl border bg-background p-6 text-center shadow-xs"
          >
            <span className="mx-auto mb-4 grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
              <CircleAlert className="size-5" />
            </span>
            <h1 className="font-semibold">Can’t open this workspace</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {error}
            </p>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Make sure <code className="font-mono">storeshot dev</code> is
              still running, then reload this page.
            </p>
          </div>
        ) : (
          <p
            role="status"
            className="flex items-center gap-2.5 text-sm text-muted-foreground"
          >
            <LoaderCircle className="size-4 animate-spin" />
            Opening App Store workspace…
          </p>
        )}
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
        "h-8 w-full justify-start gap-2.5 px-2.5 text-left font-normal text-sidebar-foreground/80 shadow-none hover:bg-sidebar-accent/60 hover:text-sidebar-foreground [&_svg]:text-muted-foreground",
        active &&
          "bg-sidebar-accent font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent [&_svg]:text-sidebar-accent-foreground",
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
    <div className="flex h-dvh overflow-hidden bg-background">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel
          defaultSize={255}
          minSize={215}
          maxSize={360}
          groupResizeBehavior="preserve-pixel-size"
        >
          <aside className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
            <div className="flex h-16 shrink-0 items-center gap-3 px-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-primary text-primary-foreground shadow-xs">
                <Smartphone className="size-4" />
              </span>
              <span className="text-sm font-semibold tracking-tight">StoreShot</span>
            </div>
            <nav
              className="min-h-0 flex-1 space-y-5 overflow-auto px-2.5 pt-1 pb-4"
              aria-label="App Store workspace"
            >
              <div className="space-y-0.5">
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
              <div className="space-y-0.5">
                <div className="flex h-7 items-center justify-between pr-0.5 pl-2.5">
                  <p className="text-xs font-medium text-muted-foreground">
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
              <Alert variant="destructive" layout="banner">
                <CircleAlert />
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
              <Suspense fallback={<Loading />}>
                <ProductPageWorkspace
                  key={page.id}
                  project={project}
                  page={page}
                  onChange={changed}
                />
              </Suspense>
            )}
            {page && collection && (
              <ArtworkViewer
                key={collection.id}
                set={collection}
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
    <div role="status" className="grid h-full place-items-center">
      <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      <span className="sr-only">Loading…</span>
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
  const stats = [
    ["Product pages", project.config.pages.length],
    [
      "Languages",
      new Set(project.config.pages.flatMap((page) => page.localizations)).size,
    ],
    ["Missing required slots", missing],
  ] as const
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        eyebrow="App Store workspace"
        title="Every page. Every language."
        description="Prepare your screenshots and creative assets in one place. Create product pages to explore different audiences and ideas."
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="max-w-5xl space-y-6 p-6 lg:p-8">
          <dl className="grid grid-cols-3 gap-3">
            {stats.map(([label, count]) => (
              <div key={label} className="rounded-xl border bg-card px-5 py-4">
                <dt className="truncate text-[13px] text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
                  {count}
                </dd>
              </div>
            ))}
          </dl>
          <section
            aria-labelledby="asset-coverage"
            className="rounded-xl border bg-card"
          >
            <div className={cn("px-5 py-4", project.config.pages.length > 0 && "border-b")}>
              <h2 id="asset-coverage" className="text-sm font-semibold">
                Asset coverage
              </h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Readiness of each localization, stored as local artwork.
              </p>
            </div>
            <ul className="divide-y">
              {project.config.pages.map((page) => (
                <li key={page.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <Button
                      variant="link"
                      className="h-auto min-w-0 gap-1 p-0 font-semibold text-foreground shadow-none"
                      onClick={() => onNavigate(`/pages/${page.id}`)}
                    >
                      <span className="truncate">{page.name}</span>
                      <ChevronRight className="text-muted-foreground" />
                    </Button>
                  </div>
                  {page.localizations.length ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {page.localizations.map((locale) => {
                        const pageIssues = issues.filter(
                          (issue) =>
                            issue.pageId === page.id && issue.locale === locale,
                        )
                        const prepared = project.sets.some(
                          (set) =>
                            set.pageId === page.id && set.locale === locale,
                        )
                        return (
                          <li
                            key={locale}
                            className="inline-flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-[13px]"
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "size-1.5 shrink-0 rounded-full",
                                pageIssues.length
                                  ? "bg-amber-500"
                                  : prepared
                                    ? "bg-emerald-500"
                                    : "bg-muted-foreground/40",
                              )}
                            />
                            <span className="font-medium">
                              {appStoreLocale(locale).name}
                            </span>
                            <span className="text-muted-foreground">
                              {pageIssues.length
                                ? `${pageIssues.length} missing or invalid`
                                : prepared
                                  ? "Assets prepared"
                                  : "No artwork yet"}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="mt-1.5 text-[13px] text-muted-foreground">
                      No languages yet.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <div className="grid gap-3 lg:grid-cols-2">
            {[
              {
                icon: Smartphone,
                title: "Required display sizes",
                body: "Create one composition size for iPhone and one for iPad if your app supports it. App Store Connect scales these screenshots for smaller displays.",
              },
              {
                icon: Search,
                title: "Header & Search Results",
                body: "Create dedicated artwork or a universal creative for both placements. These optional assets appear on iOS and iPadOS 27 and later.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <section
                key={title}
                className="flex gap-4 rounded-xl border bg-card p-5"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">{title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </section>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Apple specifications checked {APPLE_SPECS_CHECKED}.{" "}
            <a
              className="font-medium text-foreground/80 underline underline-offset-4 hover:text-foreground"
              href={SCREENSHOT_SPEC_URL}
              target="_blank"
              rel="noreferrer"
            >
              Screenshot specifications
            </a>{" "}
            ·{" "}
            <a
              className="font-medium text-foreground/80 underline underline-offset-4 hover:text-foreground"
              href={CREATIVE_SPEC_URL}
              target="_blank"
              rel="noreferrer"
            >
              Creative specifications
            </a>
            . StoreShot prepares still images locally; submission, video
            previews, app icons and live experiment results are managed in App
            Store Connect.
          </p>
        </div>
      </div>
    </section>
  )
}
