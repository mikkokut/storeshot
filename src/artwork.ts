export const ARTWORK_CATEGORIES = ["decor", "lines", "laurels"] as const

export type ArtworkCategory = (typeof ARTWORK_CATEGORIES)[number]

export interface BuiltInArtworkDefinition {
  id: string
  name: string
  category: ArtworkCategory
  url: string
  width: number
  height: number
  attribution: string
  license: "MIT"
}

const TABLER_ATTRIBUTION = "Tabler Icons"

export const BUILT_IN_ARTWORK: BuiltInArtworkDefinition[] = [
  { id: "tabler-grid-pattern", name: "Grid pattern", category: "decor", url: "/artwork/tabler/filled/grid-pattern.svg", width: 24, height: 24, attribution: TABLER_ATTRIBUTION, license: "MIT" },
  { id: "tabler-sparkles", name: "Sparkles", category: "decor", url: "/artwork/tabler/filled/sparkles.svg", width: 24, height: 24, attribution: TABLER_ATTRIBUTION, license: "MIT" },
  { id: "tabler-stars", name: "Stars", category: "decor", url: "/artwork/tabler/filled/stars.svg", width: 24, height: 24, attribution: TABLER_ATTRIBUTION, license: "MIT" },
  { id: "tabler-scribble", name: "Scribble", category: "lines", url: "/artwork/tabler/outline/scribble.svg", width: 24, height: 24, attribution: TABLER_ATTRIBUTION, license: "MIT" },
  { id: "tabler-underline", name: "Underline", category: "lines", url: "/artwork/tabler/outline/underline.svg", width: 24, height: 24, attribution: TABLER_ATTRIBUTION, license: "MIT" },
  { id: "tabler-laurel-wreath", name: "Laurel wreath", category: "laurels", url: "/artwork/tabler/filled/laurel-wreath.svg", width: 24, height: 24, attribution: TABLER_ATTRIBUTION, license: "MIT" },
  { id: "tabler-laurel-wreath-1", name: "Laurel wreath 1", category: "laurels", url: "/artwork/tabler/filled/laurel-wreath-1.svg", width: 24, height: 24, attribution: TABLER_ATTRIBUTION, license: "MIT" },
  { id: "tabler-laurel-wreath-2", name: "Laurel wreath 2", category: "laurels", url: "/artwork/tabler/filled/laurel-wreath-2.svg", width: 24, height: 24, attribution: TABLER_ATTRIBUTION, license: "MIT" },
  { id: "tabler-laurel-wreath-3", name: "Laurel wreath 3", category: "laurels", url: "/artwork/tabler/filled/laurel-wreath-3.svg", width: 24, height: 24, attribution: TABLER_ATTRIBUTION, license: "MIT" },
]

const artworkById = new Map(BUILT_IN_ARTWORK.map((artwork) => [artwork.id, artwork]))

export function builtInArtworkById(id: string): BuiltInArtworkDefinition | undefined {
  return artworkById.get(id)
}

export function artworkCategoryLabel(category: ArtworkCategory): string {
  return { decor: "Decor", lines: "Lines", laurels: "Laurels" }[category]
}
