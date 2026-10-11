import { lazy, Suspense, useEffect, useRef, useState } from "react"
import {
  ChevronRight,
  CircleAlert,
  Images,
  LayoutDashboard,
  LayoutTemplate,
  LoaderCircle,
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
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Overview" />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="max-w-5xl space-y-8 p-6 lg:p-8">
          <section aria-labelledby="product-pages">
            <h2 id="product-pages" className="mb-3 text-sm font-semibold">Product pages</h2>
            {project.config.pages.length > 0 ? (
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {project.config.pages.map((page) => (
                  <li key={page.id}>
                    <Button
                      variant="ghost"
                      className="h-auto w-full justify-start gap-4 rounded-none px-5 py-4 text-left"
                      onClick={() => onNavigate(`/pages/${page.id}`)}
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <LayoutTemplate aria-hidden className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{page.name}</span>
                        <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">
                          {page.localizations.length
                            ? page.localizations.map((locale) => appStoreLocale(locale).name).join(" · ")
                            : "No artwork yet"}
                        </span>
                      </span>
                      <ChevronRight aria-hidden className="shrink-0 text-muted-foreground" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed p-6">
                <p className="text-sm font-medium">No product pages yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ask your coding agent to use the StoreShot skill to create a
                  product page and screenshots for your app.
                </p>
              </div>
            )}
          </section>
          <section aria-labelledby="how-it-works">
            <h2 id="how-it-works" className="mb-4 text-sm font-semibold">How it works</h2>
            <ol className="grid gap-5 lg:grid-cols-3">
              {[
                {
                  title: "Create with your agent",
                  description: "Ask Codex, Claude Code, or another agent to use the StoreShot skill. Share your app captures and design ideas to create screenshots or add languages.",
                },
                {
                  title: "Review and refine",
                  description: "Open a product page to review your screenshots. Changes appear live as your agent works. Ask it to refine the design and copy.",
                },
                {
                  title: "Export and upload",
                  description: "Export your finished screenshots as PNGs from the product page, then upload them to App Store Connect.",
                },
              ].map(({ title, description }, index) => (
                <li key={title} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-medium">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </section>
  )
}
