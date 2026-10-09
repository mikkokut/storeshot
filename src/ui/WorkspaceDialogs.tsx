import { useState } from "react"
import { Copy, Languages, Plus, Trash2 } from "lucide-react"
import { request, messageFor } from "@/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import type { StoreShotProject, ProductPage } from "../shared"

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
  const [source, setSource] = useState(sourcePageId ?? "blank")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function create() {
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
          kind: "custom",
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size={sourcePageId ? "sm" : "icon-sm"}
            aria-label={
              sourcePageId ? "Duplicate product page" : "Add product page"
            }
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
      <DialogContent className="p-6">
        <DialogHeader>
          <DialogTitle>New product page</DialogTitle>
          <DialogDescription>
            Create a page for a new audience or idea. Start blank or copy
            existing artwork.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="page-name">Page name</FieldLabel>
          <Input
            id="page-name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Focus on collaboration"
          />
        </Field>
        <Choice
          label="Start with"
          value={source}
          onChange={setSource}
          options={[
            { value: "blank", label: "Blank page" },
            ...project.config.pages.map((page) => ({
              value: page.id,
              label: page.name,
            })),
          ]}
        />
        <p className="text-xs text-muted-foreground">
          Copies are independent. Only compatible iPhone, iPad and creative
          assets are copied.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button disabled={busy || !name.trim()} onClick={() => void create()}>
          {busy ? "Creating…" : "Create product page"}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

export function LanguageDialog({
  page,
  locale,
  onChange,
}: {
  page: ProductPage
  locale: string
  onChange: (project: StoreShotProject, locale: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState("fi")
  const [source, setSource] = useState(locale)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function create() {
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
      setOpen(false)
    } catch (error) {
      setError(messageFor(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Languages />
        Add language
      </DialogTrigger>
      <DialogContent className="p-6">
        <DialogHeader>
          <DialogTitle>Add a localization</DialogTitle>
          <DialogDescription>
            Copy a language’s artwork as a starting point, then translate the
            text and replace localized screenshots.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="new-locale">Language</FieldLabel>
          <LocalePicker
            id="new-locale"
            value={target}
            onValueChange={setTarget}
          />
        </Field>
        <Choice
          label="Copy artwork from"
          value={source}
          onChange={setSource}
          options={[
            { value: "blank", label: "Start empty" },
            ...page.localizations.map((code) => ({ value: code, label: code })),
          ]}
        />
        {page.localizations.includes(target) && (
          <p className="text-sm text-muted-foreground">
            This language already exists.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          disabled={busy || page.localizations.includes(target)}
          onClick={() => void create()}
        >
          {busy ? "Copying…" : "Add language"}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

export function RemovePageDialog({
  page,
  onChange,
}: {
  page: ProductPage
  onChange: (project: StoreShotProject, pageId?: string) => void
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
      onChange(project, "default")
      setOpen(false)
    } catch (error) {
      setError(messageFor(error))
    } finally {
      setBusy(false)
    }
  }
  if (page.kind === "default") return null
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Delete product page"
        title="Delete page"
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
              collections. Source artwork files remain on disk. Other pages are
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
              {busy ? "Removing…" : "Remove page"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
