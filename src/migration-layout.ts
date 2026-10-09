import type { Browser, Page } from "puppeteer-core"
import { launchChrome } from "./node-renderer.js"
import type { TextElement } from "./legacy-types.js"

/** Native SVG/DOM measurements used only while converting legacy layer geometry. */
export class MigrationLayout {
  private browser?: Browser
  private page?: Page
  private readonly svgCache = new Map<string, Promise<string>>()

  private async document(): Promise<Page> {
    if (!this.browser) this.browser = await launchChrome()
    if (!this.page) {
      this.page = await this.browser.newPage()
      await this.page.setJavaScriptEnabled(false)
    }
    return this.page
  }

  async loadFonts(fontLinks: string): Promise<void> {
    const page = await this.document()
    await page.setContent(`<meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline' https: http:;font-src data: https: http:">${fontLinks}<body></body>`, { waitUntil: "load", timeout: 30_000 })
  }

  async textLines(element: TextElement, family: string, hosted: boolean): Promise<string[]> {
    const page = await this.document()
    return page.evaluate(async ({ element, family, hosted }) => {
      const loaded = await document.fonts.load(`${element.fontWeight} ${element.fontSize}px ${JSON.stringify(family)}`, element.text || "M")
      if (hosted && !loaded.length) throw new Error(`Could not load migration font ${family}; check the font family and network connection`)
      await document.fonts.ready
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
      const text = document.createElementNS(svg.namespaceURI, "text") as SVGTextElement
      text.setAttribute("style", `font-family:${JSON.stringify(family)};font-size:${element.fontSize}px;font-weight:${element.fontWeight};white-space:pre`)
      svg.append(text)
      document.body.append(svg)
      // Fabric's Textbox wraps at whitespace; preserve repeated spaces as well.
      const lines: string[] = []
      for (const paragraph of element.text.split(/\r?\n/)) {
        let line = ""
        let started = false
        for (const word of paragraph.split(/[ \t\r]/)) {
          const candidate = started ? `${line} ${word}` : word
          text.textContent = candidate
          if (started && text.getComputedTextLength() > Math.max(24, element.width)) { lines.push(line); line = word }
          else line = candidate
          started = true
        }
        lines.push(line)
      }
      svg.remove()
      return lines
    }, { element, family, hosted })
  }

  normalizeSvg(source: string, fill?: string): Promise<string> {
    const key = `${fill ?? ""}\n${source}`
    let result = this.svgCache.get(key)
    if (!result) {
      result = this.measureSvg(source, fill)
      this.svgCache.set(key, result)
    }
    return result
  }

  private async measureSvg(source: string, fill?: string): Promise<string> {
    const page = await this.document()
    return page.evaluate(({ source, fill }) => {
      const parsed = new DOMParser().parseFromString(source, "image/svg+xml")
      if (parsed.querySelector("parsererror")) throw new Error("Invalid SVG artwork")
      const root = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement
      document.body.append(root)
      const shapes = [...root.querySelectorAll<SVGGraphicsElement>("path,rect,circle,ellipse,line,polyline,polygon,text,image")].filter((shape) => !shape.closest("defs,clipPath,mask,symbol"))
      const rootMatrix = root.getCTM()!
      const boxes = shapes.map((shape) => {
        const box = shape.getBBox()
        const style = getComputedStyle(shape)
        const strokeWidth = parseFloat(style.strokeWidth) || 0
        const matrix = rootMatrix.inverse().multiply(shape.getCTM()!)
        const points = [[box.x - strokeWidth / 2, box.y - strokeWidth / 2], [box.x + box.width + strokeWidth / 2, box.y - strokeWidth / 2], [box.x - strokeWidth / 2, box.y + box.height + strokeWidth / 2], [box.x + box.width + strokeWidth / 2, box.y + box.height + strokeWidth / 2]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix))
        if (fill) {
          // Fabric represents SVG fill="none" as an empty string, which its tint helper recolored.
          if (style.fill !== "transparent" && style.fill !== "rgba(0, 0, 0, 0)") shape.style.fill = fill
          if (style.stroke !== "none" && style.stroke !== "transparent") shape.style.stroke = fill
        }
        return { left: Math.min(...points.map((p) => p.x)), top: Math.min(...points.map((p) => p.y)), right: Math.max(...points.map((p) => p.x)), bottom: Math.max(...points.map((p) => p.y)), strokeX: strokeWidth * Math.hypot(matrix.a, matrix.c), strokeY: strokeWidth * Math.hypot(matrix.b, matrix.d) }
      })
      if (!boxes.length) { root.remove(); throw new Error("SVG artwork contains no geometry") }
      const left = Math.min(...boxes.map((box) => box.left)), top = Math.min(...boxes.map((box) => box.top))
      let width = Math.max(...boxes.map((box) => box.right)) - left
      let height = Math.max(...boxes.map((box) => box.bottom)) - top
      // Fabric gives a single path its geometry size; groups include child stroke extents.
      if (boxes.length === 1) { width -= boxes[0].strokeX; height -= boxes[0].strokeY }
      root.setAttribute("viewBox", `${left} ${top} ${Math.max(1, width)} ${Math.max(1, height)}`)
      root.setAttribute("width", "100%")
      root.setAttribute("height", "100%")
      root.setAttribute("preserveAspectRatio", "none")
      root.style.overflow = "visible"
      const result = new XMLSerializer().serializeToString(root)
      root.remove()
      return result
    }, { source, fill })
  }

  async close(): Promise<void> { await this.browser?.close() }
}
