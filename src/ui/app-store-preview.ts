import { assetSpec } from "../app-store"
import type { ScreenshotSet } from "../shared"

type Corners = readonly [number, number, number, number]
interface PreviewMask {
  /** App Store Connect thumbnail height, before StoreShot's preview zoom. */
  height: number
  corners: Corners
}

const uniform = (height: number, radius: number): PreviewMask => ({
  height, corners: [radius, radius, radius, radius],
})

/**
 * App Store Connect's current thumbnail masks, inspected 2026-10-27.
 * See docs/app-store-preview.md for the measurements and source definitions.
 * These are presentation styles only; never apply them to artwork or exports.
 */
function previewMask(specId: string, { width, height }: ScreenshotSet["canvas"]): PreviewMask | undefined {
  const landscape = width > height
  switch (specId) {
    case "iphone":
    case "iphone-large":
    case "iphone-face-large":
    case "iphone-face-medium":
      return uniform(landscape ? 111 : 240, 12)
    case "iphone-home-large":
      return uniform(landscape ? 122 : 218, 3)
    case "iphone-home-medium":
      return uniform(landscape ? 116 : 207, 3)
    case "iphone-duo":
      switch (`${width}x${height}`) {
        case "1398x2034": return { height: 240, corners: [4, 21, 21, 4] }
        case "2034x1398": return { height: 165, corners: [4, 4, 21, 21] }
        case "2007x2853":
        case "2853x2007": return uniform(240, 21)
        default: return undefined
      }
    case "ipad": return uniform(landscape ? 180 : 240, 3)
    case "ipad-11":
    case "ipad-10": return uniform(landscape ? 172 : 229, 3)
    case "watch":
      switch (`${width}x${height}`) {
        case "422x514":
        case "410x502": return uniform(214, 38)
        case "416x496": return uniform(214, 32)
        case "396x484":
        case "368x448": return uniform(213, 28)
        case "312x390": return uniform(218, 4)
        default: return undefined
      }
    case "mac":
    case "tv":
    case "vision": return uniform(215, 3)
    default: return undefined
  }
}

/** Circular CSS corner radii in TL, TR, BR, BL order, scaled with the image. */
export function previewBorderRadius(specId: string, canvas: ScreenshotSet["canvas"], scale: number): string | undefined {
  // Creative artwork keeps its existing presentation; unassigned images stay square.
  const spec = assetSpec(specId)
  if (spec?.kind !== "screenshots") return spec ? undefined : "0px"
  const mask = previewMask(specId, canvas)
  if (!mask) return "0px"
  const factor = canvas.height * scale / mask.height
  return mask.corners.map((radius) => `${radius * factor}px`).join(" ")
}
