import assert from "node:assert/strict"
import test from "node:test"
import { previewBorderRadius } from "../src/ui/app-store-preview.js"

function corners(specId: string, width: number, height: number, displayedHeight: number): number[] {
  return previewBorderRadius(specId, { width, height }, displayedHeight / height)!.split(" ").map(parseFloat)
}

test("preview masks match App Store Connect's reference thumbnail sizes", () => {
  for (const spec of ["iphone", "iphone-large", "iphone-face-large", "iphone-face-medium"])
    assert.deepEqual(corners(spec, 1206, 2622, 240), [12, 12, 12, 12])
  assert.deepEqual(corners("iphone", 2622, 1206, 111), [12, 12, 12, 12])
  assert.deepEqual(corners("iphone-home-large", 1242, 2208, 218), [3, 3, 3, 3])
  assert.deepEqual(corners("iphone-home-medium", 1334, 750, 116), [3, 3, 3, 3])
  for (const [specId, width, height, referenceHeight] of [
    ["ipad", 2064, 2752, 240], ["ipad", 2752, 2064, 180],
    ["ipad-11", 1668, 2420, 229], ["ipad-10", 2224, 1668, 172],
    ["mac", 2880, 1800, 215], ["tv", 3840, 2160, 215], ["vision", 3840, 2160, 215],
  ] as const)
    assert.deepEqual(corners(specId, width, height, referenceHeight), [3, 3, 3, 3])
})

test("Duo masks use each image's exact size, including the landscape outer hinge edge", () => {
  assert.deepEqual(corners("iphone-duo", 1398, 2034, 240), [4, 21, 21, 4])
  assert.deepEqual(corners("iphone-duo", 2034, 1398, 165), [4, 4, 21, 21])
  assert.deepEqual(corners("iphone-duo", 2007, 2853, 240), [21, 21, 21, 21])
  assert.deepEqual(corners("iphone-duo", 2853, 2007, 240), [21, 21, 21, 21])
})

test("Watch masks distinguish Ultra, Series 10+, Series 4–9 and Series 3 dimensions", () => {
  for (const [width, height, referenceHeight, radius] of [
    [422, 514, 214, 38], [410, 502, 214, 38], [416, 496, 214, 32],
    [396, 484, 213, 28], [368, 448, 213, 28], [312, 390, 218, 4],
  ])
    assert.deepEqual(corners("watch", width, height, referenceHeight), [radius, radius, radius, radius])
})

test("corner masks scale proportionally with preview zoom and never guess unknown dimensions", () => {
  assert.deepEqual(corners("iphone-duo", 1398, 2034, 480), [8, 42, 42, 8])
  assert.deepEqual(corners("ipad", 2064, 2752, 120), [1.5, 1.5, 1.5, 1.5])
  assert.equal(previewBorderRadius("iphone-duo", { width: 1000, height: 1500 }, 1), "0px")
  assert.equal(previewBorderRadius("watch", { width: 1000, height: 1500 }, 1), "0px")
  assert.equal(previewBorderRadius("unassigned", { width: 1000, height: 1500 }, 1), "0px")
  assert.equal(previewBorderRadius("header", { width: 3840, height: 1646 }, 1), undefined)
})
