import assert from "node:assert/strict"
import test from "node:test"

import { calculateCenterSnap } from "../src/ui/canvas-snapping.js"

test("center snapping independently applies horizontal and vertical guides", () => {
  assert.deepEqual(
    calculateCenterSnap({ x: 98, y: 140 }, { x: 100, y: 100 }, 3),
    { horizontal: false, vertical: true, x: 100, y: 140 },
  )
  assert.deepEqual(
    calculateCenterSnap({ x: 140, y: 101 }, { x: 100, y: 100 }, 3),
    { horizontal: true, vertical: false, x: 140, y: 100 },
  )
  assert.deepEqual(
    calculateCenterSnap({ x: 99, y: 102 }, { x: 100, y: 100 }, 3),
    { horizontal: true, vertical: true, x: 100, y: 100 },
  )
})
