import { useState } from "react"
import { Copy, LoaderCircle, Plus, Trash2 } from "lucide-react"
import { request, messageFor } from "@/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Choice } from "@/CreateSetForm"
import { LocalePicker } from "@/LocalePicker"
import { APP_STORE_LOCALES, appStoreLocale } from "@/app-store-locales"
import type { StoreShotProject, ProductPage, PageStore } from "../shared"

export function PageDialog({
  project,
  onChange,
  sourcePageId,
}: {
  project: StoreShotProject
  onChange: (project: StoreShotProject, pageId?: string) => void
  sourcePageId?: string
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [store, setStore] = useState<PageStore>("app-store")
  const [source, setSource] = useState(sourcePageId ?? "blank")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function create() {
    if (busy || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const result = await request<{
        project: StoreShotProject
        page: ProductPage
      }>("/api/pages", {
        method: "POST",
        body: JSON.stringify({
          name,
          store,
          sourcePageId: source === "blank" ? undefined : source,
        }),
      })
      onChange(result.project, result.page.id)
      setOpen(false)
      setName("")
    } catch (error) {
      setError(messageFor(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (busy) return
      if (next) {
        setName("")
        setError(null)
        setSource(sourcePageId ?? "blank")
      }
      setOpen(next)
    }}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size={sourcePageId ? "default" : "icon-sm"}
            className={
              sourcePageId
                ? undefined
                : "text-muted-foreground hover:bg-sidebar-accent/60"
            }
            aria-label={sourcePageId ? undefined : "Add product page"}
            title={sourcePageId ? undefined : "Add product page"}
          />
        }
      >
        {sourcePageId ? (
          <>
            <Copy />
            Duplicate page
          </>
        ) : (
          <Plus />
        )}
      </DialogTrigger>
      <DialogContent
        render={
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
          />
        }
      >
        <DialogHeader>
          <DialogTitle>New product page</DialogTitle>
          <DialogDescription>
            Create a page for a new audience or idea. Start blank or copy
            existing artwork.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Choice
            label="Store"
            value={store}
            onChange={(value) => setStore(value as PageStore)}
            disabled={busy}
            options={[
              { value: "app-store", label: "App Store" },
              { value: "play-store", label: "Google Play — coming later", disabled: true },
            ]}
          />
          <Field>
            <FieldLabel htmlFor="page-name">Page name</FieldLabel>
            <Input
              id="page-name"
              name="name"
              required
              disabled={busy}
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Focus on collaboration"
            />
          </Field>
          <div className="grid gap-2">
            <Choice
              label="Start with"
              value={source}
              onChange={setSource}
              disabled={busy}
              options={[
                { value: "blank", label: "Blank page" },
                ...project.config.pages.map((page) => ({
                  value: page.id,
                  label: page.name,
                })),
              ]}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Copies are independent. Artwork for every device and creative
              placement is copied.
            </p>
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>
            Cancel
          </DialogClose>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy && <LoaderCircle className="animate-spin" />}
            {busy ? "Creating…" : "Create product page"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function LanguageDialog({
  page,
  locale,
  open,
  onOpenChange,
  onChange,
}: {
  page: ProductPage
  locale: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (project: StoreShotProject, locale: string) => void
}) {
  const [target, setTarget] = useState(() =>
    APP_STORE_LOCALES.find((entry) => !page.localizations.includes(entry.code))?.code ?? "",
  )
  const [source, setSource] = useState(locale)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function create() {
    if (busy || !target || page.localizations.includes(target)) return
    setBusy(true)
    setError(null)
    try {
      const project = await request<StoreShotProject>(
        `/api/pages/${page.id}/localizations`,
        {
          method: "POST",
          body: JSON.stringify({
            locale: target,
            sourceLocale: source === "blank" ? undefined : source,
          }),
        },
      )
      onChange(project, target)
      onOpenChange(false)
    } catch (error) {
      setError(messageFor(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (busy) return
      setError(null)
      onOpenChange(next)
    }}>
      <DialogContent
        render={
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
          />
        }
      >
        <DialogHeader>
          <DialogTitle>Add a localization</DialogTitle>
          <DialogDescription>
            Copy a language’s artwork as a starting point, then translate the
            text and replace localized screenshots.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="new-locale">Language</FieldLabel>
            <LocalePicker
              id="new-locale"
              value={target}
              onValueChange={setTarget}
              disabled={busy}
            />
            {page.localizations.includes(target) && (
              <p className="text-xs text-muted-foreground">
                This language already exists on this page.
              </p>
            )}
          </Field>
          <Choice
            label="Copy artwork from"
            value={source}
            onChange={setSource}
            disabled={busy}
            options={[
              { value: "blank", label: "Start empty" },
              ...page.localizations.map((code) => ({
                value: code,
                label: appStoreLocale(code).name,
              })),
            ]}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>
            Cancel
          </DialogClose>
          <Button
            type="submit"
            disabled={busy || !target || page.localizations.includes(target)}
          >
            {busy && <LoaderCircle className="animate-spin" />}
            {busy ? "Copying…" : "Add language"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RemoveLanguageDialog({
  page,
  locale,
  onChange,
}: {
  page: ProductPage
  locale: string
  onChange: (project: StoreShotProject) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const language = appStoreLocale(locale).name
  async function remove() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const project = await request<StoreShotProject>(
        `/api/pages/${encodeURIComponent(page.id)}/localizations/${encodeURIComponent(locale)}`,
        { method: "DELETE" },
      )
      onChange(project)
      setOpen(false)
    } catch (error) {
      setError(messageFor(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${language}`}
        title={`Remove ${language}`}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        <Trash2 />
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {language}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {language} and all of its screenshot and artwork collections
              from {page.name}. Source assets remain on disk. Other languages
              and pages are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="outline" disabled={busy} />}>
              Cancel
            </AlertDialogCancel>
            <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
              {busy && <LoaderCircle className="animate-spin" />}
              {busy ? "Removing…" : "Remove language"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function RemovePageDialog({
  page,
  onChange,
}: {
  page: ProductPage
  onChange: (project: StoreShotProject, pageId?: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function remove() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const project = await request<StoreShotProject>(`/api/pages/${page.id}`, {
        method: "DELETE",
      })
      onChange(project, project.config.pages[0]?.id ?? null)
      setOpen(false)
    } catch (error) {
      setError(messageFor(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button
        variant="ghost"
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        <Trash2 />
        Delete page
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {page.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the page and all of its screenshot and artwork
              collections. Source assets remain on disk. Other pages are
              unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              render={<Button variant="outline" disabled={busy} />}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy && <LoaderCircle className="animate-spin" />}
              {busy ? "Removing…" : "Remove page"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
