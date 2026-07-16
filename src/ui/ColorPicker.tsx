import { Check, Pipette } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const PALETTE_COLORS = [
  "#ffffff", "#f4f4f5", "#d4d4d8", "#a1a1aa", "#71717a", "#3f3f46", "#18181b", "#09090b",
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#7c3aed",
] as const

interface ColorPickerProps {
  value: string
  usedColors?: string[]
  label: string
  compact?: boolean
  className?: string
  onValueChange: (color: string) => void
  onValueCommit?: (color: string) => void
}

export function ColorPicker({
  value,
  usedColors = [],
  label,
  compact = false,
  className,
  onValueChange,
  onValueCommit,
}: ColorPickerProps) {
  const normalizedValue = normalizeHex(value) ?? "#000000"
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(normalizedValue)
  const committedColor = useRef(normalizedValue)
  const documentColors = useMemo(() => uniqueColors(usedColors), [usedColors])
  const draftColor = normalizeHex(draft)

  useEffect(() => {
    if (!open) setDraft(normalizedValue)
  }, [normalizedValue, open])

  function previewDraft(nextDraft: string) {
    setDraft(nextDraft)
    const color = normalizeHex(nextDraft)
    if (color) onValueChange(color)
  }

  function commitDraft() {
    const color = normalizeHex(draft)
    if (!color) {
      setDraft(committedColor.current)
      onValueChange(committedColor.current)
      return
    }
    setDraft(color)
    onValueChange(color)
    commitColor(color)
  }

  function selectColor(color: string) {
    setDraft(color)
    onValueChange(color)
  }

  function commitColor(color: string) {
    if (color === committedColor.current) return
    committedColor.current = color
    onValueCommit?.(color)
  }

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      committedColor.current = normalizedValue
      setDraft(normalizedValue)
    } else if (open) {
      const color = normalizeHex(draft)
      if (color) {
        onValueChange(color)
        commitColor(color)
      } else {
        setDraft(committedColor.current)
        onValueChange(committedColor.current)
      }
    }
    setOpen(nextOpen)
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger
        render={(
          <Button
            aria-label={`${label}: ${normalizedValue}`}
            className={cn(
              "justify-start font-mono font-normal uppercase",
              compact ? "w-16 px-1.5" : "w-full",
              className,
            )}
            size={compact ? "xs" : "default"}
            type="button"
            variant="outline"
          />
        )}
      >
        <ColorSwatch color={normalizedValue} className={compact ? "size-3.5" : "size-4"} />
        {!compact && <span>{normalizedValue}</span>}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 gap-3 p-3"
        sideOffset={6}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div>
          <p className="text-xs font-medium">Document colors</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Colors already used in this set</p>
        </div>
        {documentColors.length > 0 ? (
          <ScrollArea className="max-h-24">
            <div className="grid grid-cols-8 gap-1.5 pr-2">
              {documentColors.map((color) => (
                <ColorButton color={color} key={color} selected={color === normalizedValue} onClick={() => selectColor(color)} />
              ))}
            </div>
          </ScrollArea>
        ) : (
          <p className="rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">No colors used yet</p>
        )}

        <Separator />

        <div>
          <p className="mb-2 text-xs font-medium">Palette</p>
          <div className="grid grid-cols-8 gap-1.5">
            {PALETTE_COLORS.map((color) => (
              <ColorButton color={color} key={color} selected={color === normalizedValue} onClick={() => selectColor(color)} />
            ))}
          </div>
        </div>

        <Separator />

        <div>
          <p className="mb-2 text-xs font-medium">Custom color</p>
          <div className="flex gap-2">
            <label
              className="relative grid size-8 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg border border-input bg-background outline-none focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
              title="Open system color picker"
            >
              <ColorSwatch color={draftColor ?? normalizedValue} className="absolute inset-0 size-full rounded-none border-0" />
              <Pipette className="relative size-4 text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.8)]" />
              <input
                aria-label="Open system color picker"
                className="absolute inset-0 cursor-pointer opacity-0"
                type="color"
                value={draftColor ?? normalizedValue}
                onBlur={commitDraft}
                onChange={(event) => {
                  previewDraft(event.target.value)
                  commitColor(event.target.value)
                }}
                onInput={(event) => previewDraft(event.currentTarget.value)}
              />
            </label>
            <Input
              aria-label={`${label} hex value`}
              aria-invalid={!draftColor}
              className="font-mono uppercase"
              maxLength={7}
              spellCheck={false}
              value={draft}
              onBlur={commitDraft}
              onChange={(event) => previewDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  commitDraft()
                  setOpen(false)
                }
                if (event.key === "Escape") {
                  event.preventDefault()
                  setDraft(committedColor.current)
                  onValueChange(committedColor.current)
                  setOpen(false)
                }
              }}
            />
          </div>
          {!draftColor && <p className="mt-1.5 text-[11px] text-destructive">Enter a 3 or 6 digit hex color.</p>}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ColorButton({ color, selected, onClick }: { color: string; selected: boolean; onClick: () => void }) {
  return (
    <Button
      aria-label={`Use ${color}`}
      aria-pressed={selected}
      className="relative size-7 rounded-md p-0"
      title={color.toUpperCase()}
      type="button"
      variant="outline"
      onClick={onClick}
    >
      <ColorSwatch color={color} className="absolute inset-0 size-full rounded-[calc(var(--radius-md)-1px)] border-0" />
      {selected && <Check className={cn("relative size-3.5 drop-shadow-[0_1px_2px_rgb(0_0_0/0.7)]", readableForeground(color))} />}
    </Button>
  )
}

function ColorSwatch({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden="true" className={cn("shrink-0 rounded border border-black/15", className)} style={{ backgroundColor: color }} />
}

function normalizeHex(value: string): string | null {
  const hex = value.trim().replace(/^#/, "")
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex.split("").map((character) => character.repeat(2)).join("")}`.toLowerCase()
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`
  return null
}

function uniqueColors(colors: string[]): string[] {
  const unique = new Set<string>()
  for (const value of colors) {
    const color = normalizeHex(value)
    if (color) unique.add(color)
  }
  return [...unique]
}

function readableForeground(color: string): string {
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)
  return (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? "text-black" : "text-white"
}
