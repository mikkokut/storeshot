import type { CanvasElement } from "./legacy-types.js"

export interface CanvasElementBounds {
  bottom: number
  left: number
  right: number
  top: number
}

export function canvasElementsBounds(
  elements: CanvasElement[],
): CanvasElementBounds {
  return elements.reduce<CanvasElementBounds>(
    (bounds, element) => {
      const elementBounds = rotatedElementBounds(element)
      return {
        bottom: Math.max(bounds.bottom, elementBounds.bottom),
        left: Math.min(bounds.left, elementBounds.left),
        right: Math.max(bounds.right, elementBounds.right),
        top: Math.min(bounds.top, elementBounds.top),
      }
    },
    { bottom: -Infinity, left: Infinity, right: -Infinity, top: Infinity },
  )
}

function rotatedElementBounds(element: CanvasElement): CanvasElementBounds {
  const paintExpansion = element.type === "shape" ? element.strokeWidth : 0
  const angle = (element.rotation * Math.PI) / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const corners = [
    [0, 0],
    [element.width + paintExpansion, 0],
    [0, element.height + paintExpansion],
    [element.width + paintExpansion, element.height + paintExpansion],
  ].map(([x, y]) => ({
    x: element.x + x * cosine - y * sine,
    y: element.y + x * sine + y * cosine,
  }))
  return {
    bottom: Math.max(...corners.map((point) => point.y)),
    left: Math.min(...corners.map((point) => point.x)),
    right: Math.max(...corners.map((point) => point.x)),
    top: Math.min(...corners.map((point) => point.y)),
  }
}
