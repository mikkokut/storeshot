import { useEffect, useMemo, useRef, useState } from "react"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import type { FontWeight } from "../shared"
import {
  getBunnyFontCatalog,
  LOCAL_FONT_FAMILY,
  queueBunnyFontPreview,
  type BunnyFont,
} from "./bunny-fonts"

const INITIAL_BROWSE_COUNT = 120
const BROWSE_PAGE_SIZE = 120
const SEARCH_RESULT_LIMIT = 80
const LOCAL_FONT: BunnyFont = {
  category: "local",
  familyName: LOCAL_FONT_FAMILY,
  id: "appshot-geist",
  weights: [400, 600, 700, 800],
}

interface BunnyFontPickerProps {
  value: string
  onCancel: () => void
  onPreview: (font: BunnyFont) => void
  onSelect: (font: BunnyFont) => void
}

export function BunnyFontPicker({ value, onCancel, onPreview, onSelect }: BunnyFontPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [fonts, setFonts] = useState<BunnyFont[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [committedFamily, setCommittedFamily] = useState(value)
  const [browseCount, setBrowseCount] = useState(INITIAL_BROWSE_COUNT)
  const openRef = useRef(open)

  openRef.current = open

  useEffect(() => {
    let cancelled = false
    void getBunnyFontCatalog()
      .then((catalog) => {
        if (!cancelled) setFonts(catalog)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!openRef.current) setCommittedFamily(value)
  }, [value])

  const items = useMemo(() => {
    const catalog = [LOCAL_FONT, ...fonts]
    if (catalog.some((font) => font.familyName === committedFamily)) return catalog
    return [{ id: `saved-${committedFamily}`, familyName: committedFamily, category: "saved", weights: [400] as FontWeight[] }, ...catalog]
  }, [committedFamily, fonts])

  const displayedItems = useMemo(() => {
    if (query.trim()) return items

    const firstFonts = items.slice(0, browseCount)
    const selected = items.find((font) => font.familyName === committedFamily)
    return selected && !firstFonts.includes(selected) ? [selected, ...firstFonts] : firstFonts
  }, [browseCount, committedFamily, items, query])
  const selectedFont = items.find((font) => font.familyName === committedFamily) ?? items[0]

  return (
    <Combobox
      autoHighlight
      filter={(font, inputValue) => displayFontName(font.familyName).toLocaleLowerCase().includes(inputValue.trim().toLocaleLowerCase())}
      highlightItemOnHover
      isItemEqualToValue={(font, selected) => font.familyName === selected.familyName}
      itemToStringLabel={(font) => font.familyName === LOCAL_FONT_FAMILY ? "Geist" : font.familyName}
      items={displayedItems}
      limit={query.trim() ? SEARCH_RESULT_LIMIT : undefined}
      open={open}
      inputValue={open ? query : displayFontName(committedFamily)}
      value={selectedFont}
      onInputValueChange={(inputValue) => setQuery(inputValue)}
      onItemHighlighted={(font) => {
        if (font) onPreview(font)
      }}
      onOpenChange={(nextOpen, details) => {
        if (nextOpen) {
          setCommittedFamily(value)
          setQuery("")
          setBrowseCount(INITIAL_BROWSE_COUNT)
        } else if (details.reason !== "item-press") {
          onCancel()
          setQuery("")
        }
        setOpen(nextOpen)
      }}
      onValueChange={(font) => {
        if (!font) return
        setCommittedFamily(font.familyName)
        setQuery("")
        onSelect(font)
      }}
    >
      <ComboboxInput
        aria-label="Font family"
        className="w-full"
        placeholder={loading ? "Loading Bunny Fonts…" : "Search fonts…"}
        showClear={false}
      />
      <ComboboxContent align="end" className="w-[268px]">
        <ComboboxEmpty>{loading ? "Loading Bunny Fonts…" : error ? "Could not load Bunny Fonts." : "No matching fonts."}</ComboboxEmpty>
        <ComboboxList
          className="max-h-80 py-1"
          onScroll={(event) => {
            if (query.trim()) return
            const list = event.currentTarget
            if (list.scrollHeight - list.scrollTop - list.clientHeight > 160) return
            setBrowseCount((count) => Math.min(items.length, count + BROWSE_PAGE_SIZE))
          }}
        >
          {(font: BunnyFont) => (
            <ComboboxItem
              className="min-h-11 px-3 py-2 pr-9 text-lg"
              key={font.id}
              style={{ fontFamily: font.familyName, fontWeight: previewWeight(font) }}
              value={font}
            >
              <FontPreviewName font={font} />
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

function FontPreviewName({ font }: { font: BunnyFont }) {
  const previewRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const element = previewRef.current
    if (!element) return
    return observeFontPreview(element, font)
  }, [font])

  return <span className="truncate" ref={previewRef}>{displayFontName(font.familyName)}</span>
}

const observedFontPreviews = new WeakMap<Element, BunnyFont>()
let fontPreviewObserver: IntersectionObserver | undefined

function observeFontPreview(element: Element, font: BunnyFont): () => void {
  if (typeof IntersectionObserver === "undefined") {
    queueBunnyFontPreview(font)
    return () => undefined
  }

  observedFontPreviews.set(element, font)
  fontPreviewObserver ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const visibleFont = observedFontPreviews.get(entry.target)
      if (visibleFont) queueBunnyFontPreview(visibleFont)
      fontPreviewObserver?.unobserve(entry.target)
      observedFontPreviews.delete(entry.target)
    }
  })
  fontPreviewObserver.observe(element)

  return () => {
    fontPreviewObserver?.unobserve(element)
    observedFontPreviews.delete(element)
  }
}

function displayFontName(fontFamily: string): string {
  return fontFamily === LOCAL_FONT_FAMILY ? "Geist" : fontFamily
}

function previewWeight(font: BunnyFont): FontWeight {
  return closestFontWeight(font.weights, 400)
}

export function closestFontWeight(weights: FontWeight[], current: FontWeight): FontWeight {
  return weights.reduce((closest, weight) => Math.abs(weight - current) < Math.abs(closest - current) ? weight : closest, weights[0] ?? 400)
}
