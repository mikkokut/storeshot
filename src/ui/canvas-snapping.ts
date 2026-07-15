interface PointLike {
  x: number
  y: number
}

export interface CenterSnap {
  horizontal: boolean
  vertical: boolean
  x: number
  y: number
}

export function calculateCenterSnap(objectCenter: PointLike, canvasCenter: PointLike, threshold: number): CenterSnap {
  const horizontal = Math.abs(objectCenter.y - canvasCenter.y) <= threshold
  const vertical = Math.abs(objectCenter.x - canvasCenter.x) <= threshold
  return {
    horizontal,
    vertical,
    x: vertical ? canvasCenter.x : objectCenter.x,
    y: horizontal ? canvasCenter.y : objectCenter.y,
  }
}
