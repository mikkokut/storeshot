import type { ArtworkAnnotationContext } from "./shared.js"

/** Runs in the isolated artwork renderer, without executing artwork scripts. */
export function inspectArtworkTarget(point: { x: number; y: number }): ArtworkAnnotationContext {
  const width = window.innerWidth
  const height = window.innerHeight
  const x = Math.min(width - 1, Math.max(0, width * point.x / 100))
  const y = Math.min(height - 1, Math.max(0, height * point.y / 100))
  const element = document.elementFromPoint(x, y)
  const result: ArtworkAnnotationContext = { x: Math.round(x), y: Math.round(y), width, height }
  if (!element) return result
  const text = element.getAttribute("aria-label") || element.getAttribute("alt") || (element as HTMLElement).innerText || element.textContent || ""
  result.target = text.replace(/\s+/g, " ").trim().slice(0, 300)
  result.role = element.getAttribute("role") || ({ IMG: "img", BUTTON: "button", A: "link", H1: "heading", H2: "heading", H3: "heading" } as Record<string, string>)[element.tagName]
  const selectors: string[] = []
  for (let node: Element | null = element; node; node = node.parentElement) {
    const tag = node.tagName.toLowerCase()
    if (node.id && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
      selectors.unshift(`#${CSS.escape(node.id)}`)
      break
    }
    const classes = Array.from(node.classList).slice(0, 3).map(value => `.${CSS.escape(value)}`).join("")
    const siblings = node.parentElement ? Array.from(node.parentElement.children).filter(item => item.tagName.toLowerCase() === tag) : []
    const index = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(node) + 1})` : ""
    selectors.unshift(`${tag}${classes}${index}`)
  }
  result.selector = selectors.join(" > ")
  const fullPath: string[] = []
  for (let node: Element | null = element; node; node = node.parentElement) fullPath.unshift(node.tagName.toLowerCase())
  result.path = fullPath.join(" > ")
  const rect = element.getBoundingClientRect()
  result.rect = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
  if (element instanceof HTMLImageElement) {
    const source = element.getAttribute("src")
    result.source = source?.startsWith("data:") ? "Embedded image" : source?.slice(0, 500)
  }
  return result
}
