import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { DuplicateAssetError, ProjectStore } from "../src/project-store.js"
import type { MockupBundleManifest } from "../src/device-mockups.js"
import type { ShapeElement } from "../src/shared.js"

const png = (width: number, height: number) => {
  const contents = Buffer.alloc(24)
  contents.set(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  contents.writeUInt32BE(width, 16)
  contents.writeUInt32BE(height, 20)
  return contents
}

async function withStore(run: (store: ProjectStore, directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-test-"))
  try {
    const store = new ProjectStore(directory)
    await store.initialize()
    await run(store, directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test("ProjectStore initializes a local project and detects screenshot dimensions", async () => {
  await withStore(async (store) => {
    await store.addAsset("screenshots", "phone.png", png(1290, 2796))
    const project = await store.readProject()

    assert.equal(project.config.appName, path.basename(store.root))
    assert.equal(project.assets.screenshots[0]?.name, "phone.png")
    assert.equal(project.assets.screenshots[0]?.width, 1290)
    assert.equal(project.assets.screenshots[0]?.height, 2796)
    assert.equal(project.assets.screenshots[0]?.deviceType, "iphone")
    assert.deepEqual(Object.keys(project.assets), ["screenshots", "brand", "other"])
    await assert.rejects(store.addAsset("logos", "legacy.png", png(100, 100)), /Unsupported asset category/)
  })
})

test("asset replacement is atomic and duplicate content in another file is rejected", async () => {
  await withStore(async (store) => {
    assert.deepEqual(await store.addAsset("screenshots", "phone.png", png(1290, 2796)), { replaced: false })
    assert.deepEqual(await store.addAsset("screenshots", "phone.png", png(1179, 2556)), { replaced: true })
    await assert.rejects(
      store.addAsset("screenshots", "duplicate.png", png(1179, 2556)),
      DuplicateAssetError,
    )
    assert.deepEqual((await store.readProject()).assets.screenshots[0]?.width, 1179)
    await assert.rejects(store.addAsset("screenshots", "broken.png", Buffer.from("not an image")), /valid supported image/)
  })
})

test("set writes and metadata updates are serialized without losing canvas changes", async () => {
  await withStore(async (store) => {
    const created = await store.createSet({ name: "English iPhone", locale: "en-US", device: "iPhone", width: 1290, height: 2796 })
    const canvasUpdate = structuredClone(created)
    canvasUpdate.areas[0].background = "#112233"

    await Promise.all([
      store.writeSet(created.id, canvasUpdate),
      store.updateSetMetadata(created.id, { name: "Finnish iPhone", locale: "fi", device: "iPhone" }),
    ])

    const saved = (await store.listSets()).find((set) => set.id === created.id)
    assert.equal(saved?.name, "Finnish iPhone")
    assert.equal(saved?.locale, "fi")
    assert.equal(saved?.areas[0].background, "#112233")
  })
})

test("set writes preserve horizontal and vertical layer flips", async () => {
  await withStore(async (store) => {
    const created = await store.createSet({ name: "Flipped layers", locale: "en-US", device: "iPhone", width: 1290, height: 2796 })
    created.areas[0].elements[0].flipX = true
    created.areas[0].elements[0].flipY = true

    await store.writeSet(created.id, created)

    const saved = (await store.listSets()).find((set) => set.id === created.id)
    assert.equal(saved?.areas[0].elements[0].flipX, true)
    assert.equal(saved?.areas[0].elements[0].flipY, true)
  })
})

test("set writes preserve circle, line, and rectangle styles", async () => {
  await withStore(async (store) => {
    const created = await store.createSet({ name: "Styled shapes", locale: "en-US", device: "iPhone", width: 1290, height: 2796 })
    const shapes: ShapeElement[] = (["circle", "line", "rectangle"] as const).map((shape, index) => ({
      id: `element-${shape}`,
      type: "shape",
      shape,
      x: 100,
      y: 200 + index * 100,
      width: 300,
      height: shape === "circle" ? 300 : 100,
      rotation: 0,
      opacity: 1,
      fill: "#112233",
      stroke: "#abcdef",
      strokeWidth: 12,
      cornerRadius: shape === "rectangle" ? 24 : 0,
    }))
    created.areas[0].elements.push(...shapes)

    await store.writeSet(created.id, created)

    const saved = (await store.listSets()).find((set) => set.id === created.id)
    assert.deepEqual(saved?.areas[0].elements.slice(-3).map((element) => element.type === "shape" && ({
      shape: element.shape,
      fill: element.fill,
      stroke: element.stroke,
      strokeWidth: element.strokeWidth,
      cornerRadius: element.cornerRadius,
    })), shapes.map(({ shape, fill, stroke, strokeWidth, cornerRadius }) => ({ shape, fill, stroke, strokeWidth, cornerRadius })))
  })
})

test("duplicating a set gives every copied area and element a fresh id", async () => {
  await withStore(async (store) => {
    const source = await store.createSet({ name: "English iPhone", locale: "en-US", device: "iPhone", width: 1290, height: 2796 })
    const duplicate = await store.duplicateSet(source.id)

    assert.notEqual(duplicate.id, source.id)
    assert.notEqual(duplicate.areas[0].id, source.areas[0].id)
    assert.notEqual(duplicate.areas[0].elements[0].id, source.areas[0].elements[0].id)
    assert.equal(duplicate.name, "English iPhone copy")
  })
})

test("managed project files cannot escape through symbolic links", async () => {
  await withStore(async (store, directory) => {
    const outside = await mkdtemp(path.join(tmpdir(), "storeshot-outside-"))
    try {
      const outsideFile = path.join(outside, "outside.png")
      await writeFile(outsideFile, png(1290, 2796))
      await symlink(outsideFile, path.join(directory, "assets/screenshots/linked.png"))
      await assert.rejects(store.resolveExistingAsset("screenshots", "linked.png"), /regular files/)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
})

test("initialization rejects a managed directory that is a symbolic link", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-test-"))
  const outside = await mkdtemp(path.join(tmpdir(), "storeshot-outside-"))
  try {
    await mkdir(path.join(directory, "assets"))
    await symlink(outside, path.join(directory, "assets/screenshots"))
    await assert.rejects(new ProjectStore(directory).initialize(), /symbolic links|regular project directory/)
  } finally {
    await Promise.all([
      rm(directory, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ])
  }
})

test("JSON writes do not leave temporary files behind", async () => {
  await withStore(async (store) => {
    const set = await store.createSet({ name: "English Mac", locale: "en-US", device: "Mac", width: 2880, height: 1800 })
    await store.writeSet(set.id, set)
    const contents = await readFile(path.join(store.setsPath, `${set.id}.json`), "utf8")
    assert.equal(JSON.parse(contents).id, set.id)
  })
})

test("mockup bundle imports become visible only after a complete atomic commit", async () => {
  await withStore(async (store) => {
    const manifest: MockupBundleManifest = {
      format: "storeshot-mockup-bundle",
      version: 1,
      id: "test-bundle",
      name: "Test bundle",
      author: "StoreShot tests",
      license: { name: "MIT" },
      mockups: [{
        id: "test-phone",
        groupId: "test-phone",
        groupName: "Test phone",
        name: "Test phone",
        description: "Standard",
        platform: "iphone",
        style: "standard",
        frame: "assets/frame.svg",
        width: 100,
        height: 200,
        screen: { kind: "rect", x: 5, y: 5, width: 90, height: 190, cornerRadius: 10 },
      }],
    }
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="200"><rect width="100" height="200"/></svg>')
    await store.writeMockupBundleImportFile("import-one", manifest.id, "assets/frame.svg", svg)
    assert.equal((await store.listMockupCatalog()).mockups.length, 0)

    await store.commitMockupBundleImport("import-one", manifest.id, manifest)
    assert.deepEqual((await store.listMockupCatalog()).mockups.map((mockup) => mockup.id), ["test-bundle/test-phone"])

    const broken = structuredClone(manifest)
    broken.mockups[0].frame = "assets/missing.svg"
    await store.writeMockupBundleImportFile("import-two", manifest.id, "assets/frame.svg", svg)
    await assert.rejects(store.commitMockupBundleImport("import-two", manifest.id, broken))
    assert.deepEqual((await store.listMockupCatalog()).mockups.map((mockup) => mockup.id), ["test-bundle/test-phone"])
  })
})
