import assert from "node:assert/strict"
import test from "node:test"

import { cloneCanvasElement, cloneScreenshotArea } from "../src/screenshot-area.js"
import type { ScreenshotArea, TextElement } from "../src/shared.js"

const element: TextElement = {
  id: "element-original",
  type: "text",
  text: "Headline",
  x: 10,
  y: 20,
  width: 300,
  height: 80,
  rotation: 0,
  opacity: 1,
  fontFamily: "Geist Variable",
  fontSize: 64,
  fontWeight: 700,
  color: "#ffffff",
  textAlign: "center",
}

test("cloneCanvasElement applies offsets without mutating the source", () => {
  const copy = cloneCanvasElement(element, { idFactory: () => "copy", offsetX: 4, offsetY: 6 })
  assert.equal(copy.id, "element-copy")
  assert.equal(copy.x, 14)
  assert.equal(copy.y, 26)
  assert.equal(element.x, 10)
})

test("cloneScreenshotArea replaces all nested ids", () => {
  const area: ScreenshotArea = { id: "area-original", name: "One", background: "#112233", elements: [element] }
  const ids = ["area-copy", "element-copy"]
  const copy = cloneScreenshotArea(area, { idFactory: () => ids.shift() ?? "unexpected", name: "One copy" })
  assert.equal(copy.id, "area-area-copy")
  assert.equal(copy.elements[0].id, "element-element-copy")
  assert.equal(copy.name, "One copy")
  assert.notEqual(copy.elements[0], area.elements[0])
})
