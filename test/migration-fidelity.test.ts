import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { migrateProject } from "../src/migrate.js"
import { launchChrome, renderScreenshotSets } from "../src/node-renderer.js"
import { ProjectStore } from "../src/project-store.js"

test("migrated text and tinted SVG geometry match the original Fabric reference", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-fidelity-"))
  try {
    const store = new ProjectStore(directory)
    await store.initialize()
    const fixture = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url))
    await store.addAsset("other", "artwork.svg", await fixture("migration-artwork.svg"))
    await writeFile(path.join(store.setsPath, "fidelity-regression.json"), await fixture("migration-v1.json"))
    await migrateProject(directory, process.cwd())
    const set = await store.readSet("fidelity-regression")
    const result = await renderScreenshotSets({ store, sets: [set], outputDirectory: path.join(directory, "renders"), clean: false, scale: 1 })
    const reference = await fixture("migration-reference.png")
    const actual = await readFile(result.files[0].path)
    const browser = await launchChrome()
    try {
      const page = await browser.newPage()
      // Canvas is only used to read PNG pixels in this test, never to render artboards.
      const difference = await page.evaluate(async (images) => {
        const pixels = await Promise.all(images.map(async (base64) => {
          const image = new Image()
          image.src = `data:image/png;base64,${base64}`
          await image.decode()
          const canvas = document.createElement("canvas")
          canvas.width = image.width; canvas.height = image.height
          const context = canvas.getContext("2d")!
          context.drawImage(image, 0, 0)
          return context.getImageData(0, 0, canvas.width, canvas.height).data
        }))
        if (pixels[0].length !== pixels[1].length) throw new Error("Export dimensions changed")
        let total = 0, changed = 0
        for (let i = 0; i < pixels[0].length; i += 4) {
          const delta = [0, 1, 2].map((channel) => Math.abs(pixels[0][i + channel] - pixels[1][i + channel]))
          total += delta.reduce((sum, value) => sum + value, 0)
          if (Math.max(...delta) > 16) changed++
        }
        return { mean: total / (pixels[0].length / 4 * 3), changed: changed / (pixels[0].length / 4) }
      }, [reference.toString("base64"), actual.toString("base64")])
      assert.ok(difference.mean < 2, `Mean RGB difference: ${difference.mean}/255`)
      assert.ok(difference.changed < .03, `Pixels differing by >16: ${difference.changed * 100}%`)
    } finally { await browser.close() }
  } finally { await rm(directory, { recursive: true, force: true }) }
})
