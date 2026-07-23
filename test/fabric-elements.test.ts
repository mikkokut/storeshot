import assert from "node:assert/strict"
import test from "node:test"

import { createFabricObject, fabricObjectMatchesElement } from "../src/ui/fabric-elements.js"
import type { Asset, GroupElement, ImageElement } from "../src/shared.js"

test("a group object is invalidated when a nested asset URL changes", async () => {
  const image: ImageElement = {
    id: "element-image",
    type: "image",
    source: { kind: "asset", assetId: "asset-image" },
    fit: "contain",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
  }
  const group: GroupElement = {
    id: "element-group",
    type: "group",
    children: [image],
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
  }
  const original: Asset = {
    id: "asset-image",
    category: "screenshots",
    modifiedAt: "2026-07-20T00:00:00.000Z",
    name: "original.png",
    size: 1024,
    url: "/api/assets/asset-image?revision=1",
  }
  const replacement: Asset = {
    ...original,
    modifiedAt: "2026-07-21T00:00:00.000Z",
    name: "replacement.png",
    url: "/api/assets/asset-image?revision=2",
  }
  const object = await createFabricObject(group, new Map([[original.id, original]]), new Map())

  assert.equal(fabricObjectMatchesElement(object, group, new Map([[original.id, original]])), true)
  assert.equal(fabricObjectMatchesElement(object, group, new Map([[replacement.id, replacement]])), false)
  object.dispose()
})
