import type { CanvasElement, ScreenshotArea } from "./shared.js"

export type IdFactory = () => string

interface CloneElementOptions {
  idFactory?: IdFactory
  offsetX?: number
  offsetY?: number
}

interface DuplicateElementsResult {
  copies: CanvasElement[]
  elements: CanvasElement[]
}

interface CloneAreaOptions {
  idFactory?: IdFactory
  name?: string
}

const defaultIdFactory: IdFactory = () => globalThis.crypto.randomUUID()

export function cloneCanvasElement(
  element: CanvasElement,
  { idFactory = defaultIdFactory, offsetX = 0, offsetY = 0 }: CloneElementOptions = {},
): CanvasElement {
  const copy: CanvasElement = {
    ...structuredClone(element),
    id: `element-${idFactory()}`,
    x: element.x + offsetX,
    y: element.y + offsetY,
  }
  if (copy.type === "group" && element.type === "group") {
    copy.children = element.children.map((child) => cloneCanvasElement(child, { idFactory }))
  }
  return copy
}

export function cloneCanvasElements(elements: CanvasElement[], options: CloneElementOptions = {}): CanvasElement[] {
  return elements.map((element) => cloneCanvasElement(element, options))
}

export function duplicateSelectedCanvasElements(
  elements: CanvasElement[],
  selectedIds: Iterable<string>,
  options: CloneElementOptions = {},
): DuplicateElementsResult {
  const ids = new Set(selectedIds)
  const sources = elements.filter((element) => ids.has(element.id))
  if (sources.length === 0) return { copies: [], elements }
  const copies = cloneCanvasElements(sources, options)
  const topmostIndex = Math.max(...elements.flatMap((element, index) => ids.has(element.id) ? [index] : []))
  const nextElements = [...elements]
  nextElements.splice(topmostIndex + 1, 0, ...copies)
  return { copies, elements: nextElements }
}

export function cloneScreenshotArea(
  area: ScreenshotArea,
  { idFactory = defaultIdFactory, name = area.name }: CloneAreaOptions = {},
): ScreenshotArea {
  return {
    ...structuredClone(area),
    id: `area-${idFactory()}`,
    name,
    elements: area.elements.map((element) => cloneCanvasElement(element, { idFactory })),
  }
}
