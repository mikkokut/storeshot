import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { DuplicateAssetError, ProjectStore } from "../src/project-store.js"

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

    assert.deepEqual(project.config.pages[0].localizations, [])
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
    for (const filename of ["../phone.png", "folder\\phone.png", ".phone.png", "C:phone.png"])
      await assert.rejects(store.addAsset("screenshots", filename, png(100, 100)), /Unsupported asset filename/)
  })
})

test("set writes and metadata updates are serialized without losing canvas changes", async () => {
  await withStore(async (store) => {
    const created = await store.createSet({ name: "English iPhone", locale: "en-US", device: "iPhone", width: 1290, height: 2796 })
    const canvasUpdate = structuredClone(created)
    canvasUpdate.areas[0].html = "<!doctype html><body style=\"background:#112233\">Updated</body>"

    await Promise.all([
      store.writeSet(created.id, canvasUpdate),
      store.updateSetMetadata(created.id, { name: "Finnish iPhone", locale: "fi", device: "iPhone" }),
    ])

    const saved = (await store.listSets()).find((set) => set.id === created.id)
    assert.equal(saved?.name, "Finnish iPhone")
    assert.equal(saved?.locale, "fi")
    assert.equal(saved?.areas[0].html, canvasUpdate.areas[0].html)
  })
})

test("artboard HTML is canonical on disk and survives metadata changes", async () => {
  await withStore(async (store) => {
    const set = await store.createSet({ name: "HTML", locale: "en-US", device: "iPhone", width: 400, height: 800 })
    const filename = path.join(store.setsPath, set.id, `${set.areas[0].id}.html`)
    const html = '<!doctype html><style>body{display:grid;background:red}</style><body>Hello</body>'
    await writeFile(filename, html)
    const updated = await store.updateSetMetadata(set.id, { name: "Renamed", locale: "fi", device: "iPhone" })
    assert.equal(updated.areas[0].html, html)
    const manifest = JSON.parse(await readFile(path.join(store.setsPath, set.id, "index.json"), "utf8"))
    assert.equal(manifest.version, 3)
    assert.deepEqual(manifest.areas, [set.areas[0].id])
    assert.equal(manifest.id, undefined)
    assert.deepEqual(JSON.parse(await readFile(path.join(store.setsPath, set.id, `${set.areas[0].id}.json`), "utf8")), { name: "Screenshot 1" })
    await assert.rejects(store.writeSet(set.id, { ...set, areas: [{ ...set.areas[0], id: "../escape" }] }), /area id/)
    await assert.rejects(store.writeSet(set.id, { ...set, areas: [set.areas[0], set.areas[0]] }), /duplicate/)
    await rm(filename)
    await symlink(store.configPath, filename)
    await assert.rejects(store.readSet(set.id), /regular files/)
  })
})

test("duplicating a set gives copied artboards independent files", async () => {
  await withStore(async (store) => {
    const source = await store.createSet({ name: "English iPhone", locale: "en-US", device: "iPhone", width: 1290, height: 2796 })
    const duplicate = await store.duplicateSet(source.id)

    assert.notEqual(duplicate.id, source.id)
    assert.notEqual(duplicate.pageId, source.pageId)
    assert.equal(duplicate.areas[0].id, source.areas[0].id) // Stable relative HTML links in a separate collection folder.
    assert.equal(duplicate.areas[0].html, source.areas[0].html)
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

test("asset reads and mutations reject symlinked parent directories", async () => {
  await withStore(async (store) => {
    const outside = await mkdtemp(path.join(tmpdir(), "storeshot-outside-"))
    const contents = png(1290, 2796)
    try {
      await mkdir(path.join(outside, "screenshots"))
      const filename = path.join(outside, "screenshots/private.png")
      await writeFile(filename, contents)
      await rm(path.join(store.assetsPath, "screenshots"), { recursive: true })
      await symlink(path.join(outside, "screenshots"), path.join(store.assetsPath, "screenshots"))
      await assert.rejects(store.resolveExistingAsset("screenshots", "private.png"), /regular project directory/)
      await assert.rejects(store.deleteAsset("screenshots", "private.png"), /regular project directory/)
      await assert.rejects(store.updateAssetMetadata("screenshots", "private.png", { deviceType: "ipad" }), /regular project directory/)
      await rm(store.assetsPath, { recursive: true })
      await symlink(outside, store.assetsPath)
      await assert.rejects(store.resolveExistingAsset("screenshots", "private.png"), /regular project directory/)
      await assert.rejects(store.deleteAsset("screenshots", "private.png"), /regular project directory/)
      assert.deepEqual(await readFile(filename), contents)
    } finally { await rm(outside, { recursive: true, force: true }) }
  })
})

test("failed page and language copies restore config and remove partial folders", async () => {
  await withStore(async (store) => {
    const first = await store.createSet({ name: "Phone", locale: "en-US", device: "iPhone", width: 1206, height: 2622 })
    const second = await store.createSet({ name: "Tablet", locale: "en-US", device: "iPad", width: 2064, height: 2752 })
    const resource = path.join(store.setsPath, second.id, "linked.css")
    await symlink(store.configPath, resource)
    const config = await store.readConfig()
    const folders = (await readdir(store.setsPath)).sort()
    await assert.rejects(store.createPage({ name: "Copy", sourcePageId: first.pageId }), /symbolic links/)
    assert.deepEqual(await store.readConfig(), config)
    assert.deepEqual((await readdir(store.setsPath)).sort(), folders)
    await assert.rejects(store.localizePage(first.pageId, { locale: "fi", sourceLocale: "en-US" }), /symbolic links/)
    assert.deepEqual(await store.readConfig(), config)
    assert.deepEqual((await readdir(store.setsPath)).sort(), folders)
    assert.equal((await store.listSets()).length, 2)
  })
})

test("JSON writes do not leave temporary files behind", async () => {
  await withStore(async (store) => {
    await store.writeConfig(await store.readConfig())
    const set = await store.createSet({ name: "English Mac", locale: "en-US", device: "Mac", width: 2880, height: 1800 })
    await store.writeSet(set.id, set)
    const contents = await readFile(path.join(store.setsPath, set.id, "index.json"), "utf8")
    assert.equal(JSON.parse(contents).id, undefined)
  })
})


test("set folders can be renamed without editing metadata or screenshot files", async () => {
  await withStore(async (store) => {
    const source = await store.createSet({ name: "Rename", locale: "en-US", device: "iPhone", width: 400, height: 800 })
    const second = { id: "second", name: "Second", html: "<!doctype html><body>Second</body>" }
    await store.addArea(source.id, second)
    const directory = path.join(store.setsPath, source.id)
    const manifestPath = path.join(directory, "index.json")
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
    manifest.areas.reverse()
    await writeFile(manifestPath, JSON.stringify(manifest))
    await writeFile(path.join(directory, "second.json"), JSON.stringify({ name: "Edited directly" }))
    await rename(directory, path.join(store.setsPath, "renamed"))
    const [set] = await store.listSets()
    assert.equal(set.id, "renamed")
    assert.deepEqual(set.areas.map(({ id }) => id), ["second", source.areas[0].id])
    assert.equal(set.areas[0].name, "Edited directly")
    assert.equal(set.areas[0].html, second.html)
    await store.updateSetMetadata(set.id, { name: "Renamed", locale: "en-US", device: "iPhone" })
    assert.equal((await store.readSet(set.id)).areas[0].html, second.html)
    await store.deleteSet(set.id)
    assert.deepEqual(await store.listSets(), [])
    assert.equal(await readFile(path.join(store.setsPath, "renamed", "second.html"), "utf8"), second.html)
  })
})

test("screenshot metadata and set directories cannot escape through symbolic links", async () => {
  await withStore(async (store) => {
    const set = await store.createSet({ name: "Safe", locale: "en-US", device: "iPhone", width: 400, height: 800 })
    const metadata = path.join(store.setsPath, set.id, `${set.areas[0].id}.json`)
    await rm(metadata)
    await symlink(store.configPath, metadata)
    await assert.rejects(store.readSet(set.id), /regular files/)
    await assert.rejects(store.writeSet(set.id, set), /regular files/)
    await rm(metadata)
    await writeFile(metadata, JSON.stringify({ name: "Restored" }))
    await symlink(path.join(store.setsPath, set.id), path.join(store.setsPath, "linked"))
    await assert.rejects(store.readSet("linked"), /regular project directory/)
    await assert.rejects(store.writeSet("linked", { ...set, id: "linked" }), /regular project directory/)
    await assert.rejects(store.writeSet(set.id, { ...set, areas: [{ ...set.areas[0], id: "index" }] }), /area id/)
  })
})


test("short stable area IDs allow descriptive filename suffixes without changing JSON order", async () => {
  await withStore(async (store) => {
    const set = await store.createSet({ name: "Slugs", locale: "en-US", device: "iPhone", width: 400, height: 800 })
    const area = set.areas[0]
    assert.match(area.id, /^[0-9a-f]{8}$/)
    const directory = path.join(store.setsPath, set.id)
    const manifest = await readFile(path.join(directory, "index.json"), "utf8")
    for (const extension of ["json", "html"])
      await rename(path.join(directory, `${area.id}.${extension}`), path.join(directory, `${area.id}-home-screen.${extension}`))
    assert.equal((await store.readSet(set.id)).areas[0].id, area.id)
    assert.equal(await readFile(path.join(directory, "index.json"), "utf8"), manifest)
    const updated = { ...set, areas: [{ ...area, name: "Home screen", html: "<h1>Updated</h1>" }] }
    await store.writeSet(set.id, updated)
    assert.equal(await store.resolveAreaHtmlFile(set.id, area.id), path.join(directory, `${area.id}-home-screen.html`))
    assert.equal(await readFile(path.join(directory, `${area.id}-home-screen.html`), "utf8"), updated.areas[0].html)
    const copy = await store.duplicateSet(set.id)
    assert.equal((await store.readSet(copy.id)).areas[0].html, updated.areas[0].html)
    assert.equal(path.basename(await store.resolveAreaHtmlFile(copy.id, area.id)), `${area.id}-home-screen.html`)
    await writeFile(path.join(directory, `${area.id}-another.json`), JSON.stringify({ name: "Ambiguous" }))
    await assert.rejects(store.readSet(set.id), /Ambiguous filenames/)
    await assert.rejects(store.writeSet(set.id, updated), /Ambiguous filenames/)
  })
})

test("area IDs with a shared prefix keep their own files and descriptive suffixes", async () => {
  await withStore(async (store) => {
    const set = await store.createSet({ name: "Prefixes", locale: "en-US", device: "Phone", width: 400, height: 800 })
    const areas = [
      { id: "hero", name: "Hero", html: "<h1>Hero</h1>" },
      { id: "hero-detail", name: "Detail", html: "<h1>Detail</h1>" },
    ]
    await store.writeSet(set.id, { ...set, areas })
    const directory = path.join(store.setsPath, set.id)
    for (const area of areas) for (const extension of ["json", "html"])
      await rename(path.join(directory, `${area.id}.${extension}`), path.join(directory, `${area.id}-composition.${extension}`))
    assert.deepEqual((await store.readSet(set.id)).areas, areas)
    for (const area of areas)
      assert.equal(await store.resolveAreaHtmlFile(set.id, area.id), path.join(directory, `${area.id}-composition.html`))
    await store.updateSetMetadata(set.id, { name: "Renamed", locale: "en-US", device: "Phone" })
    assert.deepEqual((await store.readSet(set.id)).areas, areas)
    assert.deepEqual((await store.duplicateSet(set.id)).areas, areas)
  })
})

test("preview revisions track only artwork content and transitive local dependencies", async () => {
  await withStore(async (store, directory) => {
    const first = await store.createSet({ name: "First", locale: "en-US", device: "Phone", width: 400, height: 800 })
    const second = await store.createSet({ name: "Second", locale: "fi", device: "Phone", width: 400, height: 800 })
    const writeHtml = (set: typeof first, html: string) => writeFile(path.join(store.setsPath, set.id, `${set.areas[0].id}.html`), html)
    await writeFile(path.join(directory, "assets/other/shared.css"), '@import "nested.css"; body{color:red}')
    await writeFile(path.join(directory, "assets/other/nested.css"), '@import "shared.css"; body{background:url("image.svg")}')
    await writeFile(path.join(directory, "assets/other/image.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    await writeHtml(first, '<link rel="stylesheet" href="../../assets/other/shared.css"><h1>First</h1>')
    await writeHtml(second, '<img src="../../assets/other/missing.svg"><h1>Second</h1>')
    const revisions = async () => (await store.readProject()).sets.map(set => set.areas[0].previewRevision)
    const original = await revisions()
    assert.ok(original.every(Boolean))
    assert.deepEqual(await revisions(), original)
    await store.updateSetMetadata(first.id, { name: "Renamed", locale: "en-US", device: "Phone" })
    await writeFile(path.join(directory, "assets/other/unrelated.svg"), '<svg/>')
    assert.deepEqual(await revisions(), original, "metadata and unrelated assets do not reload previews")
    await writeHtml(first, '<link rel="stylesheet" href="../../assets/other/shared.css"><h1>Edited</h1>')
    const edited = await revisions()
    assert.notEqual(edited[0], original[0])
    assert.equal(edited[1], original[1])
    await writeFile(path.join(directory, "assets/other/nested.css"), '@import "shared.css"; body{background:blue}')
    const styled = await revisions()
    assert.notEqual(styled[0], edited[0], "nested stylesheet edits are included, with cycles handled")
    assert.equal(styled[1], edited[1])
    await writeFile(path.join(directory, "assets/other/missing.svg"), '<svg/>')
    const repaired = await revisions()
    assert.equal(repaired[0], styled[0])
    assert.notEqual(repaired[1], styled[1], "adding a missing dependency refreshes its preview")
    const sharedHtml = '<link rel="stylesheet" href="../../assets/other/shared.css">'
    await writeHtml(second, sharedHtml)
    const sharing = await revisions()
    await writeFile(path.join(directory, "assets/other/shared.css"), 'body{color:green}')
    const changed = await revisions()
    assert.notEqual(changed[0], sharing[0])
    assert.notEqual(changed[1], sharing[1], "shared styles refresh all dependent artwork")
    const disk = await store.readSet(first.id)
    assert.equal(disk.areas[0].previewRevision, undefined, "preview metadata is derived, not persisted")
  })
})
