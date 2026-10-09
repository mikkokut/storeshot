import { useId, useRef, useState } from "react"
import { Check, LoaderCircle, Pencil, X } from "lucide-react"
import { request, messageFor } from "@/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ProductPage, StoreShotProject } from "../shared"

export function PageTitle({
  page,
  onChange,
}: {
  page: ProductPage
  onChange: (project: StoreShotProject) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(page.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saving = useRef(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const errorId = useId()

  function finish() {
    setError(null)
    setEditing(false)
    requestAnimationFrame(() => trigger.current?.focus())
  }

  async function save() {
    if (saving.current) return
    const title = name.trim()
    if (!title) {
      setError("Enter a page title.")
      return
    }
    if (title === page.name) {
      finish()
      return
    }
    saving.current = true
    setBusy(true)
    setError(null)
    try {
      onChange(
        await request<StoreShotProject>(`/api/pages/${page.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: title }),
        }),
      )
      finish()
    } catch (error) {
      setError(messageFor(error))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return (
    <div className="mt-1">
      {editing ? (
        <form
          className="flex max-w-full items-center gap-1 text-2xl font-semibold tracking-tight"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !saving.current) {
              event.preventDefault()
              event.stopPropagation()
              finish()
            }
          }}
        >
          <Input
            aria-label="Product page title"
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            className="h-9 w-72 text-2xl font-semibold tracking-tight md:text-2xl"
            value={name}
            disabled={busy}
            onChange={(event) => {
              setName(event.target.value)
              setError(null)
            }}
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            aria-label="Save page title"
            disabled={busy}
          >
            {busy ? <LoaderCircle className="animate-spin" /> : <Check />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel title editing"
            disabled={busy}
            onClick={finish}
          >
            <X />
          </Button>
        </form>
      ) : (
        <h1 className="text-2xl font-semibold tracking-tight">
          <Button
            ref={trigger}
            variant="ghost"
            aria-label={`Edit page title: ${page.name}`}
            title="Edit page title"
            className="h-auto max-w-full justify-start gap-2 px-0 py-0 text-left text-2xl font-semibold tracking-tight whitespace-normal"
            onClick={() => {
              setName(page.name)
              setError(null)
              setEditing(true)
            }}
          >
            <span className="min-w-0 break-words">{page.name}</span>
            <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </h1>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
