import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { migrateProject, migrationFontLinks } from "../src/migrate.js"
import { ProjectStore } from "../src/project-store.js"
import type { LegacyScreenshotSet, TextElement } from "../src/legacy-types.js"

const text: TextElement = { id: "headline", type: "text", x: 10, y: 20, width: 300, height: 80, rotation: 15, opacity: .8, flipX: true, text: '<Hello & world>', fontFamily: "Arial", fontSize: 40, fontWeight: 700, color: "#ffffff", textAlign: "center" }
function legacy(): LegacyScreenshotSet {
  return { version: 1, id: "test-set", name: "Test", locale: "en-US", device: "iPhone", canvas: { width: 400, height: 800 }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), areas: [{ id: "area-one", name: "One", background: "#112233", elements: [text, { id: "shape", type: "shape", x: 50, y: 120, width: 80, height: 80, rotation: 0, opacity: 1, shape: "circle", fill: "#ff0000", stroke: "#ffffff", strokeWidth: 2, cornerRadius: 0 }] }] }
}

test("migration creates editable HTML, preserves originals and can be rerun", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-migrate-"))
  try {
    const store = new ProjectStore(directory)
    await store.initialize()
    const original = JSON.stringify(legacy())
    const file = path.join(store.setsPath, "test-set.json")
    await writeFile(file, original)
    await assert.rejects(store.readSet("test-set"), /migrate/)
    const result = await migrateProject(directory, process.cwd())
    assert.deepEqual(result.migrated, ["test-set"])
    assert.equal(await readFile(`${file}.v1.bak`, "utf8"), original)
    const set = await store.readSet("test-set")
    assert.equal(set.version, 3)
    assert.match(set.areas[0].html, /&lt;Hello &amp;<\/tspan><tspan[^>]*>world&gt;/)
    assert.match(set.areas[0].html, /rotate\(15deg\)/)
    assert.match(set.areas[0].html, /<ellipse/)
    assert.equal(set.areas[0].html, await readFile(path.join(store.setsPath, "test-set/area-one.html"), "utf8"))
    assert.deepEqual((await migrateProject(directory, process.cwd())).migrated, [])
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("migration preflight failures leave all legacy documents untouched", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-migrate-failure-"))
  try {
    const store = new ProjectStore(directory)
    await store.initialize()
    const original = JSON.stringify(legacy())
    const file = path.join(store.setsPath, "test-set.json")
    await writeFile(file, original)
    await writeFile(path.join(store.setsPath, "broken.json"), JSON.stringify({ ...legacy(), id: "broken", areas: [{ ...legacy().areas[0], elements: [{ ...text, type: "unknown" }] }] }))
    await assert.rejects(migrateProject(directory, process.cwd()), /Unsupported/)
    assert.equal(await readFile(file, "utf8"), original)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("migration preserves groups, artwork, local assets, fonts and perspective mockups", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-migrate-graphics-"))
  try {
    const store = new ProjectStore(directory)
    await store.initialize()
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="200"><rect width="100" height="200" fill="blue"/></svg>')
    await store.addAsset("screenshots", "screen.svg", svg)
    const manifest = {
      format: "storeshot-mockup-bundle", version: 1, id: "custom", name: "Custom", author: "Tests", license: { name: "MIT" },
      mockups: [{ id: "phone", groupId: "phone", groupName: "Phone", name: "Phone", description: "Perspective", platform: "iphone", style: "3d", frame: "frame.svg", width: 100, height: 200,
        screen: { kind: "projective", transform: [[.8, .1, .05], [.1, .8, .05], [.1, .1, 1]], sourceCornerRadius: { x: .05, y: .03 } } }],
    }
    await store.writeMockupBundleImportFile("import-test", "custom", "frame.svg", svg)
    await store.commitMockupBundleImport("import-test", "custom", manifest)
    const original = legacy()
    original.areas[0].elements = [
      { ...text, fontFamily: "Arial" },
      { id: "artwork", type: "image", source: { kind: "builtin", id: "tabler-sparkles" }, fit: "contain", x: 300, y: 500, width: 50, height: 50, rotation: 0, opacity: 1 },
      { id: "group", type: "group", x: 20, y: 100, width: 200, height: 400, rotation: 20, opacity: .9, flipY: true, children: [
        { id: "phone", type: "mockup", mockupId: "custom/phone", assetId: "screenshots/screen.svg", x: 0, y: 0, width: 100, height: 200, rotation: 0, opacity: 1 },
        { id: "image", type: "image", source: { kind: "asset", assetId: "screenshots/screen.svg" }, fit: "contain", fill: "#ff0000", x: 120, y: 0, width: 100, height: 200, rotation: 0, opacity: 1 },
      ] },
    ]
    await writeFile(path.join(store.setsPath, `${original.id}.json`), JSON.stringify(original))
    await migrateProject(directory, process.cwd())
    const converted = await store.readSet(original.id)
    const html = converted.areas[0].html
    assert.match(html, /matrix3d\(/)

    assert.doesNotMatch(html, /data:font|@font-face/)
    assert.match(html, /data:image\/svg\+xml;base64,/)
    assert.match(html, /\.\.\/\.\.\/assets\/screenshots\/screen.svg/)
    assert.match(html, /fill: rgb\(255, 0, 0\)|fill: #ff0000|fill: red/)
    assert.match(html, /data-layer="group"/)
    assert.match(html, /scale\(1,-1\)/)
    const { renderScreenshotSets } = await import("../src/node-renderer.js")
    // The integration render remains offline; remote font loading has its own controlled test.
    const offline = { ...converted, areas: converted.areas.map((area) => ({ ...area, html: area.html.replace(/<link[^>]+>/g, "") })) }
    await store.writeSet(offline.id, offline)
    const result = await renderScreenshotSets({ store, sets: [offline], outputDirectory: path.join(directory, "renders"), clean: false, scale: .5 })
    assert.equal(result.files.length, 1)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("migration requests available weights so a missing synthetic weight cannot drop a font", () => {
  const links = migrationFontLinks([{ ...text, fontFamily: "Kaushan Script", fontWeight: 700 }, { ...text, fontFamily: "Geist Variable" }])
  assert.match(links, /kaushan-script%3A100%2C200%2C300%2C400%2C500%2C600%2C700%2C800%2C900/)
  assert.match(links, /geist%3A/)
  assert.doesNotMatch(links, /Geist.Variable|data:font/)
})
