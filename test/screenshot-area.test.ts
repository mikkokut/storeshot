import assert from "node:assert/strict"
import test from "node:test"

import { cloneCanvasElement, cloneScreenshotArea, duplicateSelectedCanvasElements } from "../src/screenshot-area.js"
import type { GroupElement, ScreenshotArea, TextElement } from "../src/shared.js"

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

test("cloneCanvasElement replaces ids inside groups", () => {
  const group: GroupElement = {
    id: "element-group",
    type: "group",
    children: [element],
    x: 10,
    y: 20,
    width: 300,
    height: 80,
    rotation: 0,
    opacity: 1,
  }
  const ids = ["group-copy", "child-copy"]
  const copy = cloneCanvasElement(group, { idFactory: () => ids.shift() ?? "unexpected" })

  assert.equal(copy.id, "element-group-copy")
  assert.equal(copy.type === "group" && copy.children[0].id, "element-child-copy")
})

test("duplicateSelectedCanvasElements copies the full selection in layer order", () => {
  const middle = { ...element, id: "element-middle", text: "Middle", x: 50 }
  const top = { ...element, id: "element-top", text: "Top", x: 100 }
  const ids = ["original-copy", "top-copy"]
  const result = duplicateSelectedCanvasElements(
    [element, middle, top],
    [top.id, element.id],
    { idFactory: () => ids.shift() ?? "unexpected", offsetX: 12, offsetY: 18 },
  )

  assert.deepEqual(result.copies.map(({ id, x, y }) => ({ id, x, y })), [
    { id: "element-original-copy", x: 22, y: 38 },
    { id: "element-top-copy", x: 112, y: 38 },
  ])
  assert.deepEqual(result.elements.map((candidate) => candidate.id), [
    element.id,
    middle.id,
    top.id,
    "element-original-copy",
    "element-top-copy",
  ])
})
