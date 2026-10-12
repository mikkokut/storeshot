/** A DOM caret found from rendered glyphs, including transformed SVG text. */
export interface ArtworkCaret { node: Text; offset: number }

/** Chromium's native SVG caret hit testing can choose an overlapping artwork layer. */
export function svgTextCaret(text: Element, x: number, y: number): ArtworkCaret | null {
  const document = text.ownerDocument
  const walker = document.createTreeWalker(text, 4 /* SHOW_TEXT */)
  const range = document.createRange()
  let nearest: ArtworkCaret | null = null
  let distance = Infinity
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue
    const rtl = document.defaultView?.getComputedStyle(node.parentElement!).direction === "rtl"
    for (let index = 0; index < node.textContent.length; index++) {
      range.setStart(node, index)
      range.setEnd(node, index + 1)
      const rect = range.getBoundingClientRect()
      if (!rect.width || !rect.height) continue
      const dy = Math.max(rect.top - y, 0, y - rect.bottom)
      const edges: [number, number][] = [[rect.left, index + (rtl ? 1 : 0)], [rect.right, index + (rtl ? 0 : 1)]]
      for (const [edge, offset] of edges) {
        const score = (edge - x) ** 2 + dy ** 2
        if (score < distance) {
          distance = score
          nearest = { node: node as Text, offset }
        }
      }
    }
  }
  return nearest
}

/** Clip the live range to the iframe and every scrolling ancestor. */
export function visibleSelectionBounds(range: Range, frame: HTMLIFrameElement): DOMRect | null {
  if (!frame.isConnected || !range.startContainer.isConnected) return null
  const rect = range.getBoundingClientRect()
  const bounds = frame.getBoundingClientRect()
  const sx = bounds.width / frame.clientWidth
  const sy = bounds.height / frame.clientHeight
  let left = Math.max(bounds.left, bounds.left + rect.left * sx, 0)
  let top = Math.max(bounds.top, bounds.top + rect.top * sy, 0)
  let right = Math.min(bounds.right, bounds.left + rect.right * sx, window.innerWidth)
  let bottom = Math.min(bounds.bottom, bounds.top + rect.bottom * sy, window.innerHeight)
  for (let parent = frame.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent)
    const clip = parent.getBoundingClientRect()
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
      left = Math.max(left, clip.left)
      right = Math.min(right, clip.right)
    }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
      top = Math.max(top, clip.top)
      bottom = Math.min(bottom, clip.bottom)
    }
  }
  return right > left && bottom > top ? new DOMRect(left, top, right - left, bottom - top) : null
}
