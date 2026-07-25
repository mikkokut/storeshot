import assert from "node:assert/strict"
import test from "node:test"

import { config, StaticCanvas } from "fabric/node"

import { createExportCanvasOptions } from "../src/ui/export-canvas.js"

test("export canvas keeps App Store dimensions on high-density displays", async () => {
  const originalDevicePixelRatio = config.devicePixelRatio
  config.configure({ devicePixelRatio: 2 })

  const canvas = new StaticCanvas(undefined, createExportCanvasOptions(
    { width: 1290, height: 2796 },
    "#ffffff",
  ))

  try {
    const element = canvas.getElement()
    assert.equal(canvas.getRetinaScaling(), 1)
    assert.equal(element.width, 1290)
    assert.equal(element.height, 2796)
  } finally {
    await canvas.dispose()
    config.configure({ devicePixelRatio: originalDevicePixelRatio })
  }
})
