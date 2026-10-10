import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import test from "node:test"
import { assetChecksum, catalogInstallation, loadAssetCatalog, readCatalogFile, scanLocalAssetFiles, searchAssetCatalog } from "../src/asset-catalog.js"
import { parseCatalogAsset, type CatalogAsset } from "../src/asset-catalog-types.js"
import { ASSET_IMPORTS_FILENAME, ProjectStore } from "../src/project-store.js"
import { readArtboardResource } from "../src/artboard-files.js"
import { validateProject } from "../src/validation.js"

const root = process.cwd()
const catalog = await loadAssetCatalog(root)
const frame = catalog.find(asset => asset.id === "frameup-free-iphone-17-pro")!
const image = await readCatalogFile(root, frame.file)
const license = await readCatalogFile(root, frame.license.file)
async function withStore(run: (store: ProjectStore) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-catalog-"))
  try { const store = new ProjectStore(directory); await store.initialize(); await run(store) }
  finally { await rm(directory, { recursive: true, force: true }) }
}

test("catalog searches all artwork and exposes checksums and screen geometry", () => {
  assert.ok(catalog.length >= 126)
  assert.ok(catalog.some(asset => asset.kind === "laurels"))
  assert.ok(catalog.some(asset => asset.kind === "lines"))
  assert.ok(catalog.some(asset => asset.kind === "decor"))
  const results = searchAssetCatalog(catalog, { query: "iphone 17", kind: "mockup", platform: "iphone" })
  assert.ok(results.some(asset => asset.id === frame.id))
  assert.ok(results.every(asset => asset.platform === "iphone"))
  assert.deepEqual(searchAssetCatalog(catalog, { query: frame.checksum }).map(asset => asset.checksum), [frame.checksum])
  assert.equal(frame.checksum, assetChecksum(image))
  assert.equal(frame.screen?.kind, "rect")
})

test("catalog text search ignores checksum fragments and ranks exact model names first", () => {
  const unrelated = { ...frame, id: "a-iphone-11-pro", name: "iPhone 11 Pro", tags: [], description: "", checksum: `sha256:${"17".repeat(32)}` }
  const variant = { ...unrelated, id: "b-iphone-17-pro-max", name: "iPhone 17 Pro Max" }
  const exact = { ...unrelated, id: "z-iphone-17-pro", name: "iPhone 17 Pro" }
  const assets = [unrelated, variant, exact]
  assert.deepEqual(searchAssetCatalog(assets, { query: "iphone 17 pro" }).map(asset => asset.id), [exact.id, variant.id])
  assert.deepEqual(searchAssetCatalog([unrelated], { query: unrelated.checksum }), [unrelated])
  assert.deepEqual(searchAssetCatalog([unrelated], { query: unrelated.checksum.slice(7) }), [unrelated])
  assert.deepEqual(searchAssetCatalog([unrelated], { query: unrelated.checksum.slice(0, 20) }), [])
  assert.deepEqual(searchAssetCatalog([unrelated], { query: unrelated.checksum, kind: "laurels" }), [])
})

test("catalog validates image paths and both rectangular and perspective geometry", async () => {
  assert.throws(() => parseCatalogAsset({ ...frame, file: "../private.svg" }), /relative path/)
  assert.throws(() => parseCatalogAsset({ ...frame, screen: { kind: "rect", x: 1, y: 1, width: frame.width, height: frame.height, cornerRadius: 0 } }), /bounds/)
  const perspective = { kind: "projective", transform: [[.8, .1, .05], [.1, .8, .05], [.1, .1, 1]], sourceCornerRadius: { x: .05, y: .03 } }
  assert.deepEqual(parseCatalogAsset({ ...frame, screen: perspective }).screen, perspective)
  assert.throws(() => parseCatalogAsset({ ...frame, screen: { ...perspective, transform: [[0, 0, 0], [0, 0, 0], [0, 0, 1]] } }), /singular/)
  assert.throws(() => parseCatalogAsset({ ...frame, screen: { ...perspective, transform: [[1, 0, 0], [0, 1, 0], [-2, 0, 1]] } }), /infinity/)
  await assert.rejects(readCatalogFile(root, "../package.json"), /Invalid/)
})

test("imports save bytes, licenses and geometry, and repeated imports reuse them", async () => {
  await withStore(async store => {
    const first = await store.importCatalogAsset(frame, image, license)
    assert.equal(first.reused, false)
    const second = await store.importCatalogAsset(frame, image, license)
    assert.equal(second.reused, true)
    assert.equal(second.path, first.path)
    assert.deepEqual(await readFile(path.join(store.root, first.path)), image)
    assert.deepEqual(await readFile(path.join(store.root, first.licensePath)), license)
    const imports = await store.readAssetImports()
    assert.equal(imports.length, 1)
    assert.deepEqual(imports[0].asset.screen, frame.screen)
    assert.equal((await store.listAssets()).other[0].checksum, frame.checksum)
    assert.deepEqual((await readArtboardResource(store.root, first.path)).body, image)
    assert.equal((await validateProject(store.root)).report.ok, true)
  })
})

test("checksum matching recognizes nested manual copies and renamed imports", async () => {
  await withStore(async store => {
    await mkdir(path.join(store.assetsPath, "brand/nested"))
    const relative = "brand/nested/my-phone.svg"
    await writeFile(path.join(store.assetsPath, relative), image)
    const imported = await store.importCatalogAsset(frame, image, license)
    assert.equal(imported.reused, true)
    assert.equal(imported.path, `assets/${relative}`)
    await rename(path.join(store.assetsPath, relative), path.join(store.assetsPath, "brand/nested/renamed.svg"))
    const state = catalogInstallation(frame, await scanLocalAssetFiles(store.assetsPath), await store.readAssetImports())
    assert.deepEqual(state.matches, ["brand/nested/renamed.svg"])
    assert.deepEqual(state.missing, [relative])
    assert.equal((await store.importCatalogAsset(frame, image, license)).path, "assets/brand/nested/renamed.svg")
    assert.equal((await validateProject(store.root)).report.warnings.length, 0)
  })
})

test("modified imports retain original geometry and require explicit replacement", async () => {
  await withStore(async store => {
    const imported = await store.importCatalogAsset(frame, image, license)
    const changed = Buffer.from(image.toString().replace("<svg", '<svg data-edited="true"'))
    await writeFile(path.join(store.root, imported.path), changed)
    const state = catalogInstallation(frame, await scanLocalAssetFiles(store.assetsPath), await store.readAssetImports())
    assert.deepEqual(state.modified, [imported.path.slice(7)])
    await assert.rejects(store.importCatalogAsset(frame, image, license), /--replace/)
    assert.deepEqual(await readFile(path.join(store.root, imported.path)), changed)
    assert.equal((await validateProject(store.root)).report.warnings[0].code, "asset.modifiedImport")
    assert.equal((await store.importCatalogAsset(frame, image, license, { replace: true })).replaced, true)
    assert.equal((await validateProject(store.root)).report.warnings.length, 0)
  })
})

test("catalog version changes do not discard saved import snapshots", async () => {
  await withStore(async store => {
    await store.importCatalogAsset(frame, image, license)
    const nextImage = Buffer.from(image.toString().replace("<svg", '<svg data-revision="next"'))
    const next: CatalogAsset = { ...frame, checksum: assetChecksum(nextImage), description: "New version" }
    await store.importCatalogAsset(next, nextImage, license, { replace: true })
    const imports = await store.readAssetImports()
    assert.equal(imports.length, 2)
    assert.equal(imports[0].asset.checksum, frame.checksum)
    assert.equal(imports[1].asset.description, "New version")
    assert.equal((await validateProject(store.root)).report.warnings.length, 0)
  })
})

test("imports reject symlink write targets and corrupt receipts, and scanners skip symlinks", async () => {
  await withStore(async store => {
    await symlink(path.join(root, "catalog", frame.file), path.join(store.assetsPath, "other", `${frame.id}.svg`))
    assert.deepEqual(await scanLocalAssetFiles(store.assetsPath), [])
    await assert.rejects(store.importCatalogAsset(frame, image, license), /regular files/)
    await rm(path.join(store.assetsPath, "other", `${frame.id}.svg`))
    await symlink(path.join(root, "package.json"), path.join(store.assetsPath, ASSET_IMPORTS_FILENAME))
    await assert.rejects(store.importCatalogAsset(frame, image, license), /regular files/)
    await rm(path.join(store.assetsPath, ASSET_IMPORTS_FILENAME))
    await writeFile(path.join(store.assetsPath, ASSET_IMPORTS_FILENAME), '{"version":99,"imports":[]}')
    await assert.rejects(store.importCatalogAsset(frame, image, license), /Unsupported/)
    await assert.rejects(store.importCatalogAsset({ ...frame, checksum: `sha256:${"0".repeat(64)}` }, image, license), /checksum changed/)
  })
})

test("asset CLI supports offline discovery, import, inspection, status, and missing IDs", async () => {
  await withStore(async store => {
    const cli = async (...args: string[]) => {
      const result = await promisify(execFile)(process.execPath, ["--import", import.meta.resolve("tsx"), path.join(root, "src/cli.ts"), ...args, "--json"], { cwd: tmpdir(), maxBuffer: 8 * 1024 * 1024 })
      return JSON.parse(result.stdout)
    }
    assert.ok((await cli("asset", "search", "iphone 17", "--kind", "mockup")).assets.length)
    assert.deepEqual((await cli("asset", "show", frame.id)).asset.screen, frame.screen)
    const imported = await cli("-C", store.root, "asset", "import", frame.id)
    assert.equal(imported.assets[0].reused, false)
    assert.equal((await cli("-C", store.root, "asset", "inspect", imported.assets[0].path.slice(7))).asset.imports[0].modified, false)
    assert.ok((await cli("-C", store.root, "asset", "installed")).assets.some((asset: CatalogAsset) => asset.id === frame.id))
    assert.equal((await cli("-C", store.root, "asset", "search", "--installed")).assets.length, 1)
    await assert.rejects(cli("-C", store.root, "asset", "import", "not-an-asset"), /Unknown catalog asset/)
  })
})

test("local service serves imported frames through both asset and artboard routes", async () => {
  await withStore(async store => {
    const imported = await store.importCatalogAsset(frame, image, license)
    const { startServer } = await import("../src/server.js")
    const service = await startServer({ host: "127.0.0.1", port: 0, packageRoot: root, projectDirectory: store.root, useVite: false })
    try {
      const base = `http://127.0.0.1:${service.port}`
      const project = await (await fetch(`${base}/api/project`)).json()
      assert.equal(project.assets.other[0].checksum, frame.checksum)
      const response = await fetch(`${base}/artboards/${imported.path}`)
      assert.equal(response.status, 200)
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), image)
      assert.equal((await fetch(`${base}${project.assets.other[0].url}`)).status, 200)
    } finally { await service.close() }
  })
})
