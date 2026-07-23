import assert from "node:assert/strict"
import test from "node:test"

import { groupCanvasElements, ungroupCanvasElement } from "../src/group-elements.js"
import type { GroupElement, ShapeElement } from "../src/shared.js"

const rectangle: ShapeElement = {
  id: "element-rectangle",
  type: "shape",
  shape: "rectangle",
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  rotation: 0,
  opacity: 1,
  fill: "#ffffff",
  stroke: "#000000",
  strokeWidth: 2,
  cornerRadius: 4,
}

const circle: ShapeElement = {
  ...rectangle,
  id: "element-circle",
  shape: "circle",
  x: 200,
  y: 100,
  width: 40,
  height: 40,
  cornerRadius: 0,
}

test("groupCanvasElements stores children in group-local coordinates", () => {
  const group = groupCanvasElements([rectangle, circle], () => "group")

  assert.equal(group.id, "element-group")
  assert.deepEqual({ x: group.x, y: group.y, width: group.width, height: group.height }, { x: 10, y: 20, width: 232, height: 122 })
  assert.deepEqual(group.children.map(({ id, x, y }) => ({ id, x, y })), [
    { id: "element-rectangle", x: 0, y: 0 },
    { id: "element-circle", x: 190, y: 80 },
  ])
})

test("groupCanvasElements can use bounds measured by the renderer", () => {
  const group = groupCanvasElements([rectangle, circle], () => "group", {
    bottom: 150,
    left: 5,
    right: 250,
    top: 15,
  })

  assert.deepEqual({ x: group.x, y: group.y, width: group.width, height: group.height }, { x: 5, y: 15, width: 245, height: 135 })
  assert.deepEqual(group.children.map(({ id, x, y }) => ({ id, x, y })), [
    { id: "element-rectangle", x: 5, y: 5 },
    { id: "element-circle", x: 195, y: 85 },
  ])
})

test("ungroupCanvasElement applies group movement and scaling to its children", () => {
  const group = groupCanvasElements([rectangle, circle], () => "group")
  group.x = 110
  group.y = 220
  group.width = 464
  group.height = 244
  const children = ungroupCanvasElement(group)

  assert.deepEqual(children.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })), [
    { id: "element-rectangle", x: 110, y: 220, width: 200, height: 100 },
    { id: "element-circle", x: 490, y: 380, width: 80, height: 80 },
  ])
  assert.equal(children[0].type === "shape" && children[0].strokeWidth, 4)
  assert.equal(children[0].type === "shape" && children[0].cornerRadius, 8)
})

test("ungroupCanvasElement preserves rotated child geometry through a flipped group", () => {
  const rotatedChild: ShapeElement = {
    ...rectangle,
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    rotation: 30,
    strokeWidth: 0,
  }
  const boundsChild: ShapeElement = {
    ...rectangle,
    id: "element-bounds",
    x: -20,
    y: 0,
    width: 140,
    height: 100,
    strokeWidth: 0,
  }
  const group: GroupElement = {
    id: "element-group",
    type: "group",
    children: [rotatedChild, boundsChild],
    x: 200,
    y: 300,
    width: 140,
    height: 100,
    rotation: 0,
    opacity: 1,
    flipX: true,
  }

  const [child] = ungroupCanvasElement(group)
  assert.ok(child)
  assert.ok(Math.abs(child.x - 340) < 1e-9)
  assert.ok(Math.abs(child.y - 334.6410161513775) < 1e-9)
  assert.ok(Math.abs(child.rotation - 150) < 1e-9)
  assert.equal(child.flipX, false)
  assert.equal(child.flipY, true)
  assert.equal(child.width, 100)
  assert.equal(child.height, 40)
})
