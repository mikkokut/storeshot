import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { createCanvas, loadImage } from "canvas"

import { readImageMetadata } from "../src/image-metadata.js"
import { groupCanvasElements } from "../src/group-elements.js"
import { renderScreenshotSets } from "../src/node-renderer.js"
import { ProjectStore } from "../src/project-store.js"
import type { ShapeElement } from "../src/shared.js"

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
    set.areas[0].elements.push(groupCanvasElements([
      {
        id: "element-group-circle",
        type: "shape",
        shape: "circle",
        x: 680,
        y: 120,
        width: 180,
        height: 180,
        rotation: 0,
        opacity: 1,
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 8,
        cornerRadius: 0,
      },
      {
        id: "element-group-line",
        type: "shape",
        shape: "line",
        x: 680,
        y: 340,
        width: 360,
        height: 1,
        rotation: 0,
        opacity: 1,
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 8,
        cornerRadius: 0,
      },
    ], () => "render-group"))
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

test("Node renderer preserves shape rendering when layers are grouped", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-group-render-test-"))
  try {
    const store = new ProjectStore(directory)
    await store.initialize()
    const set = await store.createSet({ name: "Grouping", locale: "en-US", device: "iPhone", width: 1320, height: 2868 })
    const shapes: ShapeElement[] = [
      {
        id: "element-rectangle",
        type: "shape",
        shape: "rectangle",
        x: 264,
        y: 860,
        width: 792,
        height: 574,
        rotation: 0,
        opacity: 1,
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 5,
        cornerRadius: 33,
      },
      {
        id: "element-circle",
        type: "shape",
        shape: "circle",
        x: 422,
        y: 860,
        width: 475,
        height: 475,
        rotation: 0,
        opacity: 1,
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 5,
        cornerRadius: 0,
      },
    ]
    set.areas = [
      { id: "area-ungrouped", name: "Ungrouped", background: "#245f4a", elements: structuredClone(shapes) },
      { id: "area-grouped", name: "Grouped", background: "#245f4a", elements: [groupCanvasElements(shapes, () => "group")] },
    ]
    const result = await renderScreenshotSets({
      clean: false,
      outputDirectory: path.join(directory, "renders"),
      packageRoot: process.cwd(),
      scale: 0.25,
      sets: [set],
      store,
    })
    const ungrouped = result.files.find((file) => file.areaId === "area-ungrouped")
    const grouped = result.files.find((file) => file.areaId === "area-grouped")
    assert.ok(ungrouped)
    assert.ok(grouped)
    const difference = await pixelDifference(await readFile(grouped.path), await readFile(ungrouped.path))
    assert.deepEqual(difference, { changedPixels: 0, meanChannelDelta: 0 })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

async function pixelDifference(first: Buffer, second: Buffer): Promise<{ changedPixels: number; meanChannelDelta: number }> {
  const [firstImage, secondImage] = await Promise.all([loadImage(first), loadImage(second)])
  assert.equal(firstImage.width, secondImage.width)
  assert.equal(firstImage.height, secondImage.height)
  const canvas = createCanvas(firstImage.width, firstImage.height)
  const context = canvas.getContext("2d")
  context.drawImage(firstImage, 0, 0)
  const firstPixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(secondImage, 0, 0)
  const secondPixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  let changedPixels = 0
  let totalChannelDelta = 0
  for (let index = 0; index < firstPixels.length; index += 4) {
    const delta = Math.abs(firstPixels[index] - secondPixels[index])
      + Math.abs(firstPixels[index + 1] - secondPixels[index + 1])
      + Math.abs(firstPixels[index + 2] - secondPixels[index + 2])
      + Math.abs(firstPixels[index + 3] - secondPixels[index + 3])
    if (delta > 0) changedPixels += 1
    totalChannelDelta += delta
  }
  return {
    changedPixels,
    meanChannelDelta: totalChannelDelta / firstPixels.length,
  }
}
