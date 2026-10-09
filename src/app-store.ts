import { APP_STORE_LOCALES } from "./app-store-locales.js"
import type {
  AppDevice,
  ProductPage,
  ScreenshotSet,
  StoreShotConfig,
} from "./shared.js"

export const APPLE_SPECS_CHECKED = "2026-10-09"
export const SCREENSHOT_SPEC_URL =
  "https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/"
export const CREATIVE_SPEC_URL =
  "https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications/"
export const DEVICE_LABELS: Record<AppDevice, string> = {
  iphone: "iPhone",
  ipad: "iPad",
  "iphone-duo": "iPhone Duo",
  watch: "Apple Watch",
  mac: "Mac",
  tv: "Apple TV",
  vision: "Apple Vision Pro",
}
export interface AssetSpec {
  id: string
  name: string
  device: AppDevice | "creative"
  kind: "screenshots" | "header" | "search-results" | "universal"
  sizes: readonly (readonly [number, number])[]
  rotate: boolean
  requirement: "required" | "optional" | "upcoming"
  guidance: string
  maxCount: number
}
const screenshot = (
  id: string,
  name: string,
  device: AppDevice,
  sizes: AssetSpec["sizes"],
  requirement: AssetSpec["requirement"] = "optional",
  guidance = "Optional size override. App Store Connect can scale your required screenshots.",
  rotate = true,
): AssetSpec => ({
  id,
  name,
  device,
  sizes,
  requirement,
  guidance,
  rotate,
  kind: "screenshots",
  maxCount: 10,
})
export const ASSET_SPECS: AssetSpec[] = [
  screenshot(
    "iphone",
    "iPhone · Dynamic Island, medium",
    "iphone",
    [
      [1206, 2622],
      [1179, 2556],
    ],
    "required",
    "Required iPhone size. Lead with your strongest features and show your app in use.",
  ),
  screenshot("iphone-large", "iPhone · Dynamic Island, large", "iphone", [
    [1320, 2868],
    [1290, 2796],
    [1260, 2736],
  ]),
  screenshot("iphone-face-large", "iPhone · Face ID, large", "iphone", [
    [1284, 2778],
    [1242, 2688],
  ]),
  screenshot("iphone-face-medium", "iPhone · Face ID, medium", "iphone", [
    [1170, 2532],
    [1125, 2436],
    [1080, 2340],
  ]),
  screenshot("iphone-home-large", "iPhone · Home button, large", "iphone", [
    [1242, 2208],
  ]),
  screenshot("iphone-home-medium", "iPhone · Home button, medium", "iphone", [
    [750, 1334],
  ]),
  screenshot(
    "iphone-duo-outer",
    "iPhone Duo · Outer display",
    "iphone-duo",
    [[1398, 2034]],
    "upcoming",
    "Design for this display, then check the inner layout.",
  ),
  screenshot(
    "iphone-duo-inner",
    "iPhone Duo · Inner display",
    "iphone-duo",
    [[2007, 2853]],
    "upcoming",
    "Show how your app uses the expanded display.",
  ),
  screenshot(
    "ipad",
    "iPad · 13-inch display",
    "ipad",
    [
      [2064, 2752],
      [2048, 2732],
    ],
    "required",
    "Required for iPad apps. Smaller iPad sizes can use scaled screenshots.",
  ),
  screenshot("ipad-11", "iPad · 11-inch display", "ipad", [
    [1668, 2420],
    [1668, 2388],
    [1640, 2360],
    [1488, 2266],
  ]),
  screenshot("ipad-10", "iPad · 10.5-inch display", "ipad", [[1668, 2224]]),
  screenshot(
    "watch",
    "Apple Watch",
    "watch",
    [
      [422, 514],
      [410, 502],
      [416, 496],
      [396, 484],
      [368, 448],
      [312, 390],
    ],
    "required",
    "Use the same Apple Watch screenshot dimensions across every localization.",
    false,
  ),
  screenshot(
    "mac",
    "Mac",
    "mac",
    [
      [2880, 1800],
      [2560, 1600],
      [1440, 900],
      [1280, 800],
    ],
    "required",
    "Required for Mac apps. Use a 16:10 landscape composition.",
    false,
  ),
  screenshot(
    "tv",
    "Apple TV",
    "tv",
    [
      [3840, 2160],
      [1920, 1080],
    ],
    "required",
    "Required for Apple TV apps.",
    false,
  ),
  screenshot(
    "vision",
    "Apple Vision Pro",
    "vision",
    [[3840, 2160]],
    "required",
    "Required for Apple Vision Pro apps.",
    false,
  ),
  {
    id: "header",
    name: "Product Page Header",
    device: "creative",
    kind: "header",
    sizes: [[3840, 1646]],
    rotate: false,
    requirement: "optional",
    maxCount: 1,
    guidance:
      "Optional for iOS / iPadOS 27+. Communicate one clear idea. Keep the focal point centered and check cropping in App Store Connect.",
  },
  {
    id: "search-results",
    name: "Search Results",
    device: "creative",
    kind: "search-results",
    sizes: [
      [3840, 2560],
      [1920, 1280],
    ],
    rotate: false,
    requirement: "optional",
    maxCount: 1,
    guidance:
      "Optional for iOS / iPadOS 27+. Make your app’s purpose obvious at a glance. Accepted 3:2 sizes range from 1920 × 1280 to 3840 × 2560.",
  },
  {
    id: "universal",
    name: "Universal Creative",
    device: "creative",
    kind: "universal",
    sizes: [[5244, 2950]],
    rotate: false,
    requirement: "optional",
    maxCount: 1,
    guidance:
      "One PNG for both Header and Search Results. Choose “Use header asset in search results” in App Store Connect. Review both crops there.",
  },
]
/** Current creation choices; the full catalog remains available for stored artwork. */
export const CREATION_SPECS = ASSET_SPECS.filter(
  (spec) => spec.kind !== "screenshots" || spec.requirement === "required",
)

/** One default size per destination, with Watch consistency across languages. */
export function creationSize(
  spec: AssetSpec,
  sets: ScreenshotSet[] = [],
): readonly [number, number] {
  const watch =
    spec.id === "watch" ? sets.find((set) => set.specId === "watch") : undefined
  return watch ? [watch.canvas.width, watch.canvas.height] : spec.sizes[0]
}

export function creationSpecsForPage(page: ProductPage): AssetSpec[] {
  return specsForPage(page).filter((spec) => CREATION_SPECS.includes(spec))
}

export function assetSpec(id: string): AssetSpec | undefined {
  return ASSET_SPECS.find((spec) => spec.id === id)
}
export function acceptsSize(
  spec: AssetSpec,
  width: number,
  height: number,
): boolean {
  if (
    spec.id === "search-results" &&
    width >= 1920 &&
    width <= 3840 &&
    height >= 1280 &&
    height <= 2560 &&
    width * 2 === height * 3
  )
    return true
  return spec.sizes.some(
    ([w, h]) =>
      (width === w && height === h) ||
      (spec.rotate && width === h && height === w),
  )
}
export function inferSpec(width: number, height: number, device = ""): string {
  const candidates = ASSET_SPECS.filter((spec) =>
    acceptsSize(spec, width, height),
  )
  return (
    candidates.find(
      (spec) =>
        spec.device !== "creative" &&
        DEVICE_LABELS[spec.device].toLowerCase() === device.toLowerCase(),
    )?.id ??
    candidates[0]?.id ??
    "unassigned"
  )
}
export function specsForPage(page: ProductPage): AssetSpec[] {
  return ASSET_SPECS.filter((spec) => {
    if (spec.device === "creative") return true
    if (
      page.kind !== "default" &&
      !["iphone", "ipad", "iphone-duo"].includes(spec.device)
    )
      return false
    return true
  })
}
export function defaultConfig(): StoreShotConfig {
  return {
    version: 2,
    store: "app-store",
    pages: [
      {
        id: "default",
        name: "Default Product Page",
        kind: "default",
        localizations: [],
      },
    ],
    tests: [],
  }
}
export interface ReadinessIssue {
  code: string
  message: string
  setId?: string
  pageId?: string
  locale?: string
}
/** Asset preparation checks, never a claim that Apple has approved the content. */
export function readinessIssues(
  config: StoreShotConfig,
  sets: ScreenshotSet[],
): ReadinessIssue[] {
  const issues: ReadinessIssue[] = []
  const slots = new Set<string>()
  const watchSizes = new Set(
    sets
      .filter((set) => set.specId === "watch")
      .map((set) => `${set.canvas.width}x${set.canvas.height}`),
  )
  for (const set of sets) {
    const page = config.pages.find((page) => page.id === set.pageId)
    const spec = assetSpec(set.specId)
    const add = (code: string, message: string) =>
      issues.push({
        code,
        message,
        setId: set.id,
        pageId: set.pageId,
        locale: set.locale,
      })
    if (!page) add("page", "Collection references a missing product page.")
    else {
      if (!page.localizations.includes(set.locale))
        add("locale", "Add this language to the product page.")
      if (spec && !specsForPage(page).includes(spec))
        add(
          "destination",
          "This asset destination is not enabled for this product page.",
        )
    }
    if (!spec)
      add(
        "unassigned",
        "Assign an App Store asset specification; the original dimensions are preserved.",
      )
    else {
      if (!acceptsSize(spec, set.canvas.width, set.canvas.height))
        add("dimensions", `${spec.name} has unsupported dimensions.`)
      if (set.areas.length < 1 || set.areas.length > spec.maxCount)
        add("count", `${spec.name} needs 1–${spec.maxCount} images.`)
      const key = `${set.pageId}/${set.locale}/${set.specId}`
      if (slots.has(key))
        add(
          "duplicate",
          "More than one collection occupies this page, language and asset slot.",
        )
      slots.add(key)
    }
    if (!APP_STORE_LOCALES.some((locale) => locale.code === set.locale))
      add(
        "locale",
        "This language code is not an App Store localization; assign a supported language.",
      )
    if (set.specId === "watch" && watchSizes.size > 1)
      add(
        "watch-size",
        "Apple Watch dimensions must match across all localizations.",
      )
  }
  const devices = new Set(
    sets.flatMap((set) => {
      const spec = assetSpec(set.specId)
      return spec && spec.device !== "creative" ? [spec.device] : []
    }),
  )
  for (const page of config.pages)
    for (const locale of page.localizations) {
      for (const spec of specsForPage(page).filter(
        (spec) =>
          spec.requirement === "required" &&
          spec.device !== "creative" &&
          devices.has(spec.device),
      )) {
        if (
          !sets.some(
            (set) =>
              set.pageId === page.id &&
              set.locale === locale &&
              set.specId === spec.id,
          )
        ) {
          issues.push({
            code: "missing",
            message: `Missing ${spec.name} screenshots.`,
            pageId: page.id,
            locale,
          })
        }
      }
    }
  return issues
}
export function exportPath(set: ScreenshotSet): string {
  // Identifiers are validated before persistence; sanitize again for archive paths.
  const segment = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-")
  return [set.pageId, set.locale, set.specId, set.id].map(segment).join("/")
}
