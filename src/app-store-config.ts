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
  if (value.version !== 2 || value.store !== "app-store")
    throw new Error("Unsupported storeshot.json version; run storeshot migrate")
  if (!Array.isArray(value.tests) || !Array.isArray(value.pages))
    throw new Error("pages and tests must be arrays")
  const tests = value.tests.map((test) => {
    if (!record(test)) throw new Error("Invalid optimization test")
    return {
      id: identifier(test.id, "Test id"),
      name: nonempty(test.name, "Test name"),
    }
  })
  if (new Set(tests.map((test) => test.id)).size !== tests.length)
    throw new Error("Duplicate test id")
  const pages = value.pages.map((page): ProductPage => {
    if (
      !record(page) ||
      !["default", "custom", "treatment"].includes(String(page.kind))
    )
      throw new Error("Invalid product page")
    if (!Array.isArray(page.localizations))
      throw new Error("Product page localizations must be an array")
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
    const kind = page.kind as ProductPage["kind"]
    if (kind === "treatment" && !tests.some((test) => test.id === page.testId))
      throw new Error("Treatment references a missing test")
    if (kind !== "treatment" && page.testId !== undefined)
      throw new Error("Only treatments belong to optimization tests")
    return {
      id: identifier(page.id, "Page id"),
      name: nonempty(page.name, "Page name"),
      kind,
      localizations,
      ...(kind === "treatment" ? { testId: String(page.testId) } : {}),
    }
  })
  if (new Set(pages.map((page) => page.id)).size !== pages.length)
    throw new Error("Duplicate product page id")
  if (
    pages.filter((page) => page.kind === "default").length !== 1 ||
    !pages.some((page) => page.id === "default" && page.kind === "default")
  )
    throw new Error(
      "Exactly one default product page is required, with id default",
    )
  if (pages.filter((page) => page.kind === "custom").length > 70)
    throw new Error("App Store Connect supports up to 70 custom product pages")
  for (const test of tests)
    if (pages.filter((page) => page.testId === test.id).length > 3)
      throw new Error("An optimization test supports up to three treatments")
  return {
    version: 2,
    store: "app-store",
    pages,
    tests,
  }
}
