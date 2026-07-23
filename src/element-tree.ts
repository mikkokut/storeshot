import type { CanvasElement } from "./shared.js"

export function flattenCanvasElements(elements: CanvasElement[]): CanvasElement[] {
  return elements.flatMap((element) => element.type === "group"
    ? [element, ...flattenCanvasElements(element.children)]
    : [element])
}
