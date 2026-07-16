import type { CanvasElement, ScreenshotArea } from "./shared.js"

export type IdFactory = () => string

interface CloneElementOptions {
  idFactory?: IdFactory
  offsetX?: number
  offsetY?: number
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
  return {
    ...structuredClone(element),
    id: `element-${idFactory()}`,
    x: element.x + offsetX,
    y: element.y + offsetY,
  }
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
