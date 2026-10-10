import type { StoreShotConfig, ProductPage } from "./shared.js"

export function identifier(value: unknown, label: string): string {
  const result = nonempty(value, label)
  if (!/^[a-z0-9][a-z0-9-]*$/.test(result))
    throw new Error(`${label} is invalid`)
  return result
}
export function nonempty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${label} must be a non-empty string`)
  return value.trim()
}
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
export function parseStoreShotConfig(value: unknown): StoreShotConfig {
  if (!record(value))
    throw new Error("storeshot.json must contain a JSON object")
  if (value.version !== 2)
    throw new Error("Unsupported storeshot.json version")
  if (!Array.isArray(value.pages)) throw new Error("pages must be an array")
  const pages = value.pages.map((page): ProductPage => {
    if (!record(page)) throw new Error("Invalid product page")
    if (!Array.isArray(page.localizations))
      throw new Error("Product page localizations must be an array")
    const store = page.store
    if (store !== "app-store")
      throw new Error("Only App Store product pages are available; Google Play is coming later")
    const localizations = [
      ...new Set(
        page.localizations.map((locale) => {
          const code = nonempty(locale, "Locale")
          if (!/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(code))
            throw new Error("Invalid locale")
          return code
        }),
      ),
    ]
    return {
      id: identifier(page.id, "Page id"),
      name: nonempty(page.name, "Page name"),
      store,
      localizations,
    }
  })
  if (new Set(pages.map((page) => page.id)).size !== pages.length)
    throw new Error("Duplicate product page id")
  return {
    version: 2,
    pages,
  }
}
