import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { createCanvas } from "canvas"

import { readImageMetadata } from "../src/image-metadata.js"
import { renderScreenshotSets } from "../src/node-renderer.js"
import { ProjectStore } from "../src/project-store.js"

test("Node renderer writes scaled PNG previews with the browser document model", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-render-test-"))
  try {
    const store = new ProjectStore(directory)
    await store.initialize()
    const source = createCanvas(120, 240)
    const context = source.getContext("2d")
    context.fillStyle = "#3366ff"
    context.fillRect(0, 0, source.width, source.height)
    await store.addAsset("screenshots", "home.png", source.toBuffer("image/png"))
    await mkdir(path.join(store.mockupBundlesPath, "unrelated-incomplete-bundle"))
    const set = await store.createSet({ name: "English iPhone", locale: "en-US", device: "iPhone", width: 1320, height: 2868 })
    set.areas[0].elements.push({
      id: "element-device-mockup",
      type: "mockup",
      mockupId: "frameup-free/iphone-15-pro",
      assetId: "screenshots/home.png",
      x: 360,
      y: 650,
      width: 600,
      height: 1300,
      rotation: 0,
      opacity: 1,
    })
    set.areas[0].elements.push(
      {
        id: "element-circle",
        type: "shape",
        shape: "circle",
        x: 80,
        y: 100,
        width: 240,
        height: 240,
        rotation: 0,
        opacity: 1,
        fill: "#ffcc00",
        stroke: "#111111",
        strokeWidth: 12,
        cornerRadius: 0,
      },
      {
        id: "element-line",
        type: "shape",
        shape: "line",
        x: 80,
        y: 400,
        width: 520,
        height: 1,
        rotation: 0,
        opacity: 1,
        fill: "#ffffff",
        stroke: "#ff0066",
        strokeWidth: 16,
        cornerRadius: 0,
      },
      {
        id: "element-rectangle",
        type: "shape",
        shape: "rectangle",
        x: 80,
        y: 500,
        width: 420,
        height: 180,
        rotation: 0,
        opacity: 1,
        fill: "#22cc88",
        stroke: "#003322",
        strokeWidth: 10,
        cornerRadius: 24,
      },
    )
    const result = await renderScreenshotSets({
      clean: false,
      outputDirectory: path.join(directory, "renders"),
      packageRoot: process.cwd(),
      scale: 0.1,
      sets: [set],
      store,
    })

    assert.equal(result.files.length, 1)
    assert.deepEqual(readImageMetadata(await readFile(result.files[0].path)), { width: 132, height: 287 })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
