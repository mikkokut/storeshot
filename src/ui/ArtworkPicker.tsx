import { useState } from "react"
import { Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ARTWORK_CATEGORIES,
  artworkCategoryLabel,
  BUILT_IN_ARTWORK,
  type ArtworkCategory,
  type BuiltInArtworkDefinition,
} from "../artwork"

export function ArtworkPicker({ open, onClose, onSelect }: {
  open: boolean
  onClose: () => void
  onSelect: (artwork: BuiltInArtworkDefinition) => void
}) {
  const [category, setCategory] = useState<ArtworkCategory>(ARTWORK_CATEGORIES[0])
  if (!open) return null

  const visibleArtwork = BUILT_IN_ARTWORK.filter((artwork) => artwork.category === category)

  return (
    <div className="absolute left-12 top-0 flex max-h-[min(620px,calc(100vh-110px))] w-72 flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl">
      <div className="flex shrink-0 items-start justify-between border-b px-3 py-2.5">
        <div>
          <p className="text-sm font-semibold">Add artwork</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Reusable MIT-licensed vectors</p>
        </div>
        <Button aria-label="Close artwork picker" size="icon-xs" type="button" variant="ghost" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="flex shrink-0 gap-1 border-b p-2">
        {ARTWORK_CATEGORIES.map((item) => (
          <Button
            aria-pressed={category === item}
            className="h-7 px-2.5 text-xs"
            key={item}
            size="sm"
            type="button"
            variant={category === item ? "secondary" : "ghost"}
            onClick={() => setCategory(item)}
          >
            {artworkCategoryLabel(item)}
          </Button>
        ))}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-3 gap-2 p-3">
          {visibleArtwork.map((artwork) => (
            <Button
              aria-label={`Add ${artwork.name}`}
              className="group aspect-square h-auto overflow-hidden p-2 text-foreground"
              key={artwork.id}
              title={`${artwork.name} · ${artwork.attribution} · ${artwork.license}`}
              type="button"
              variant="outline"
              onClick={() => onSelect(artwork)}
            >
              <span
                aria-hidden="true"
                className="size-full bg-current transition-transform group-hover:scale-105"
                style={{
                  maskImage: `url(${artwork.url})`,
                  maskPosition: "center",
                  maskRepeat: "no-repeat",
                  maskSize: "contain",
                  WebkitMaskImage: `url(${artwork.url})`,
                  WebkitMaskPosition: "center",
                  WebkitMaskRepeat: "no-repeat",
                  WebkitMaskSize: "contain",
                }}
              />
            </Button>
          ))}
        </div>
      </ScrollArea>

      <div className="flex shrink-0 items-center gap-2 border-t px-3 py-2 text-[10px] text-muted-foreground">
        <Sparkles className="size-3.5" />
        Tabler Icons · MIT. All artwork can be recolored.
      </div>
    </div>
  )
}
