import assert from "node:assert/strict"
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import {
  acceptsSize,
  assetSpec,
  defaultConfig,
  exportPath,
  ASSET_SPECS,
  CREATION_SPECS,
  creationSize,
  readinessIssues,
} from "../src/app-store.js"
import { parseStoreShotConfig } from "../src/app-store-config.js"
import { ProjectStore } from "../src/project-store.js"

async function fixture(run: (store: ProjectStore) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), "storeshot-app-store-"))
  try {
    const store = new ProjectStore(root)
    await store.initialize()
    await run(store)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
test("Apple dimensions include Duo, creative placements, orientations and 3:2 ranges", () => {
  for (const [id, w, h] of [
    ["iphone", 1206, 2622],
    ["iphone-duo-inner", 2007, 2853],
    ["iphone-duo-outer", 1398, 2034],
    ["header", 3840, 1646],
    ["universal", 5244, 2950],
    ["search-results", 3000, 2000],
  ] as const)
    assert.equal(acceptsSize(assetSpec(id)!, w, h), true)
  assert.equal(acceptsSize(assetSpec("iphone")!, 2622, 1206), true)
  assert.equal(acceptsSize(assetSpec("watch")!, 514, 422), false)
  assert.equal(acceptsSize(assetSpec("search-results")!, 3841, 2560), false)
  assert.equal(acceptsSize(assetSpec("search-results")!, 2000, 1500), false)
  assert.equal(acceptsSize(assetSpec("header")!, 1646, 3840), false)
})
test("prepare creates each required slot once, and preserves edited artwork", async () =>
  fixture(async (store) => {
    for (const device of ["iphone", "ipad", "iphone-duo", "watch", "mac"]) {
      const spec = ASSET_SPECS.find(
        (spec) => spec.device === device,
      )!
      const [width, height] = spec.sizes[0]
      await store.addAsset(
        "screenshots",
        `${device}.svg`,
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`,
        ),
      )
    }
    const sets = await store.preparePage("default", "en-US")
    assert.deepEqual(
      sets.map((set) => set.specId),
      ["iphone", "iphone-duo-outer", "iphone-duo-inner", "ipad", "watch", "mac"],
    )
    assert.equal((await store.preparePage("default", "en-US")).length, 0)
    const project = await store.readProject()
    assert.equal(
      readinessIssues(project.config, project.sets).filter(
        (issue) => issue.code === "missing",
      ).length,
      0,
    )
  }))
test("language copies keep resources independent when source HTML changes", async () =>
  fixture(async (store) => {
    const [source] = await store.preparePage("default", "en-US")
    await writeFile(
      path.join(store.setsPath, source.id, "style.css"),
      "body{background:red}",
    )
    await store.localizePage("default", { locale: "fi", sourceLocale: "en-US" })
    const copy = (await store.listSets()).find((set) => set.locale === "fi")!
    assert.notEqual(copy.id, source.id)
    assert.equal(copy.sourceLocale, "en-US")
    assert.equal(
      await readFile(path.join(store.setsPath, copy.id, "style.css"), "utf8"),
      "body{background:red}",
    )
    await writeFile(
      path.join(store.setsPath, source.id, `${source.areas[0].id}.html`),
      "<h1>Changed externally</h1>",
    )
    assert.notEqual(
      (await store.readSet(copy.id)).areas[0].html,
      "<h1>Changed externally</h1>",
    )
    await assert.rejects(
      store.localizePage("default", { locale: "fi" }),
      /already/,
    )
    await assert.rejects(
      store.localizePage("default", { locale: "zz-QQ" }),
      /supported/,
    )
    assert.match(exportPath(copy), /^default\/fi\/iphone\//)
  }))
test("pages create, copy and localize artwork for every device", async () =>
  fixture(async (store) => {
    const page = await store.createPage({ name: "All devices" })
    for (const spec of CREATION_SPECS) {
      const [width, height] = creationSize(spec)
      await store.createSet({
        pageId: page.id,
        specId: spec.id,
        name: spec.name,
        locale: "en-US",
        device: spec.name,
        width,
        height,
      })
    }
    const ids = CREATION_SPECS.map((spec) => spec.id).sort()
    const copied = await store.createPage({
      name: "All devices copy",

      sourcePageId: page.id,
    })
    await store.localizePage(page.id, { locale: "fi", sourceLocale: "en-US" })
    const project = await store.readProject()
    for (const [pageId, locale] of [[page.id, "en-US"], [page.id, "fi"], [copied.id, "en-US"]]) {
      assert.deepEqual(
        project.sets.filter((set) => set.pageId === pageId && set.locale === locale)
          .map((set) => set.specId).sort(),
        ids,
      )
    }
    assert.equal(readinessIssues(project.config, project.sets).length, 0)
    const watch = project.sets.find((set) => set.pageId === page.id && set.specId === "watch")!
    const duplicate = await store.duplicateSet(watch.id)
    assert.equal(duplicate.specId, "watch")
    assert.notEqual(duplicate.pageId, page.id)
  }))
test("destination writes reject concurrent duplicates, invalid dimensions, and inconsistent Watch sizes", async () =>
  fixture(async (store) => {
    const input = {
      name: "iPhone",
      locale: "en-US",
      device: "iPhone",
      specId: "iphone",
      width: 1206,
      height: 2622,
    }
    const results = await Promise.allSettled([
      store.createSet(input),
      store.createSet(input),
    ])
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    )
    await assert.rejects(
      store.createSet({ ...input, width: 1205 }),
      /dimensions/,
    )
    await store.createSet({
      ...input,
      specId: "watch",
      width: 422,
      height: 514,
    })
    await assert.rejects(
      store.createSet({
        ...input,
        locale: "fi",
        specId: "watch",
        width: 410,
        height: 502,
      }),
      /must match/,
    )
    const header = await store.createSet({
      ...input,
      specId: "header",
      width: 3840,
      height: 1646,
    })
    await assert.rejects(
      store.addArea(header.id, { ...header.areas[0], id: "second" }),
      /at most 1/,
    )
  }))
test("config stores the store only on pages", async () =>
  fixture(async (store) => {
    const config = defaultConfig()
    assert.equal("store" in config, false)
    assert.deepEqual(parseStoreShotConfig(config), config)
    assert.equal("store" in JSON.parse(await readFile(store.configPath, "utf8")), false)
  }))
test("pages persist their store and reject unavailable stores without changing config", async () =>
  fixture(async (store) => {
    const config = defaultConfig()
    const page = await store.createPage({ name: "Store page", store: "app-store" })
    assert.equal(page.store, "app-store")
    const copied = await store.createPage({ name: "Copy", sourcePageId: page.id })
    assert.equal(copied.store, "app-store")
    const saved = JSON.parse(await readFile(store.configPath, "utf8"))
    assert.ok(saved.pages.every((entry: { store: string }) => entry.store === "app-store"))
    const before = await readFile(store.configPath, "utf8")
    await assert.rejects(
      store.createPage({ name: "Later", store: "play-store" }),
      /Google Play is coming later/,
    )
    assert.equal(await readFile(store.configPath, "utf8"), before)
    assert.throws(() => parseStoreShotConfig({
      ...config,
      pages: [{ ...config.pages[0], store: "unknown" }],
    }), /Only App Store/)
  }))
test("config accepts ordinary pages without a default page or page kinds and rejects duplicate ids", () => {
  const config = defaultConfig()
  assert.deepEqual(parseStoreShotConfig({ ...config, pages: [] }).pages, [])
  assert.throws(() => parseStoreShotConfig({ ...config, pages: [config.pages[0], config.pages[0]] }), /Duplicate product page/)
  const pages = Array.from({ length: 75 }, (_, i) => ({ id: `page-${i}`, name: `Page ${i}`, store: "app-store", localizations: [] }))
  assert.equal(parseStoreShotConfig({ ...config, pages }).pages.length, 75)
})
test("preparation uses device-matched source screenshots only in the page’s first language", async () =>
  fixture(async (store) => {
    await store.addAsset(
      "screenshots",
      "phone.svg",
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1206" height="2622"></svg>',
      ),
    )
    await store.addAsset(
      "screenshots",
      "duo.svg",
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="2007" height="2853"></svg>',
      ),
    )
    const prepared = await store.preparePage("default", "en-US")
    const iphone = prepared.find((set) => set.specId === "iphone")!
    assert.deepEqual(
      prepared.filter((set) => set.specId.startsWith("iphone-duo")).map((set) => set.specId),
      ["iphone-duo-outer", "iphone-duo-inner"],
    )
    for (const set of prepared.filter((set) => set.specId.startsWith("iphone-duo"))) {
      assert.match(set.areas[0].html, /duo.svg/)
      assert.doesNotMatch(set.areas[0].html, /phone.svg/)
    }
    assert.equal(iphone.areas.length, 1)
    assert.match(iphone.areas[0].html, /phone.svg/)
    assert.doesNotMatch(iphone.areas[0].html, /duo.svg/)
    await store.localizePage("default", { locale: "fi" })
    const localized = await store.preparePage("default", "fi")
    assert.doesNotMatch(localized[0].areas[0].html, /phone.svg/)
  }))

test("removing a page language removes only its collections and supports removing the last language", async () =>
  fixture(async (store) => {
    const page = await store.createPage({ name: "Languages" })
    for (const specId of ["iphone", "watch", "header"]) {
      const spec = assetSpec(specId)!
      const [width, height] = creationSize(spec)
      await store.createSet({ pageId: page.id, specId, locale: "en-US", name: spec.name, device: spec.name, width, height })
    }
    await store.localizePage(page.id, { locale: "fi", sourceLocale: "en-US" })
    const copy = await store.createPage({ name: "Other page", sourcePageId: page.id })
    const before = await store.listSets()
    const removed = before.filter((set) => set.pageId === page.id && set.locale === "fi")
    await store.removePageLanguage(page.id, "fi")
    assert.deepEqual((await store.listSets()).map((set) => set.id).sort(),
      before.filter((set) => !removed.includes(set)).map((set) => set.id).sort())
    const config = await store.readConfig()
    assert.deepEqual(config.pages.find((entry) => entry.id === page.id)?.localizations, ["en-US"])
    assert.deepEqual(config.pages.find((entry) => entry.id === copy.id)?.localizations, ["en-US", "fi"])
    for (const set of removed) {
      assert.equal(await readFile(path.join(store.setsPath, set.id, `${set.areas[0].id}.html`), "utf8"), set.areas[0].html)
    }
    await assert.rejects(store.removePageLanguage(page.id, "fi"), /Unknown page language/)
    await assert.rejects(store.removePageLanguage("missing", "en-US"), /Unknown product page/)
    await store.removePageLanguage(page.id, "en-US")
    assert.deepEqual((await store.readConfig()).pages.find((entry) => entry.id === page.id)?.localizations, [])
    assert.ok(!(await store.listSets()).some((set) => set.pageId === page.id))
    await store.localizePage(page.id, { locale: "fi" })
    assert.deepEqual((await store.readConfig()).pages.find((entry) => entry.id === page.id)?.localizations, ["fi"])
  }))
test("any page can be removed, including the initial and last page, preserving source artwork", async () =>
  fixture(async (store) => {
    await store.preparePage("default", "en-US")
    const page = await store.createPage({
      name: "A",
      sourcePageId: "default",
    })
    await store.renamePage(page.id, "Benefit first")
    assert.equal(
      (await store.readConfig()).pages.find((entry) => entry.id === page.id)
        ?.name,
      "Benefit first",
    )
    const copy = (await store.listSets()).find(
      (set) => set.pageId === page.id,
    )!
    await store.deletePage(page.id)
    assert.equal((await store.listSets()).length, 1)
    assert.ok(
      await readFile(
        path.join(store.setsPath, copy.id, `${copy.areas[0].id}.html`),
        "utf8",
      ),
    )
    await store.deletePage("default")
    assert.deepEqual((await store.readConfig()).pages, [])
    assert.deepEqual(await store.listSets(), [])
    await assert.rejects(store.createSet({ name: "No page", device: "iPhone", locale: "en-US", specId: "iphone", width: 1206, height: 2622 }), /Create a product page/)
    const replacement = await store.createPage({ name: "Replacement" })
    const set = await store.createSet({ name: "Phone", device: "iPhone", locale: "en-US", specId: "iphone", width: 1206, height: 2622 })
    assert.equal(set.pageId, replacement.id)
  }))

test("first artwork defines its language without app settings or device setup", async () =>
  fixture(async (store) => {
    assert.deepEqual((await store.readConfig()).pages[0].localizations, [])
    assert.deepEqual(readinessIssues(await store.readConfig(), []), [])
    const config = await store.readConfig()
    assert.equal("appName" in config, false)
    assert.equal("primaryLocale" in config, false)
    assert.equal("devices" in config, false)
    assert.equal("platforms" in config, false)
    const set = await store.createSet({
      name: "iPad",
      device: "iPad",
      locale: "fi",
      pageId: "default",
      specId: "ipad",
      width: 2064,
      height: 2752,
    })
    assert.equal(set.specId, "ipad")
    assert.deepEqual((await store.readConfig()).pages[0].localizations, ["fi"])
    const before = await store.readConfig()
    await assert.rejects(
      store.createSet({
        name: "Mac",
        device: "Mac",
        locale: "de-DE",
        specId: "mac",
        width: 123,
        height: 456,
      }),
      /dimensions/,
    )
    assert.deepEqual(await store.readConfig(), before)
    const header = await store.createSet({
      name: "Header",
      device: "Header",
      locale: "fi",
      specId: "header",
      width: 3840,
      height: 1646,
    })
    assert.equal(header.specId, "header")
  }))

test("creative artwork can define the first language and blank pages have no implicit language", async () =>
  fixture(async (store) => {
    const header = await store.createSet({
      name: "Header",
      device: "Header",
      locale: "ja",
      specId: "header",
      width: 3840,
      height: 1646,
    })
    assert.equal(header.locale, "ja")
    assert.deepEqual((await store.readConfig()).pages[0].localizations, ["ja"])
    assert.deepEqual(
      readinessIssues(await store.readConfig(), await store.listSets()),
      [],
    )
    const page = await store.createPage({ name: "Campaign" })
    assert.deepEqual(page.localizations, [])
    await assert.rejects(
      store.createSet({
        name: "Mac",
        device: "Mac",
        locale: "fi",
        pageId: page.id,
        specId: "mac",
        width: 2879,
        height: 1800,
      }),
      /dimensions/,
    )
    assert.deepEqual(
      (await store.readConfig()).pages.find((entry) => entry.id === page.id)
        ?.localizations,
      [],
    )
    await store.createSet({
      name: "Phone",
      device: "iPhone",
      locale: "de-DE",
      pageId: page.id,
      specId: "iphone",
      width: 1206,
      height: 2622,
    })
    assert.deepEqual(
      (await store.readConfig()).pages.find((entry) => entry.id === page.id)
        ?.localizations,
      ["de-DE"],
    )
  }))

test("creation offers only current required displays at one fixed size while the schema retains alternatives", () => {
  assert.deepEqual(
    CREATION_SPECS.filter((spec) => spec.kind === "screenshots").map((spec) => [
      spec.id,
      creationSize(spec),
    ]),
    [
      ["iphone", [1206, 2622]],
      ["iphone-duo-outer", [1398, 2034]],
      ["iphone-duo-inner", [2007, 2853]],
      ["ipad", [2064, 2752]],
      ["watch", [422, 514]],
      ["mac", [2880, 1800]],
      ["tv", [3840, 2160]],
      ["vision", [3840, 2160]],
    ],
  )
  assert.equal(
    CREATION_SPECS.some((spec) => spec.id === "mac"),
    true,
  )
  assert.equal(creationSize(assetSpec("search-results")!)[0], 3840)
  assert.equal(acceptsSize(assetSpec("iphone")!, 1179, 2556), true)
  assert.equal(acceptsSize(assetSpec("iphone")!, 2622, 1206), true)
  assert.equal(acceptsSize(assetSpec("iphone-large")!, 1320, 2868), true)
  assert.equal(acceptsSize(assetSpec("iphone-duo-outer")!, 1398, 2034), true)
  assert.equal(acceptsSize(assetSpec("iphone-duo-inner")!, 2007, 2853), true)
})

test("stored alternate dimensions remain editable and Watch creation keeps localization dimensions consistent", async () =>
  fixture(async (store) => {
    const set = await store.createSet({
      name: "Existing Watch",
      device: "Watch",
      locale: "en-US",
      specId: "watch",
      width: 410,
      height: 502,
    })
    assert.deepEqual(creationSize(assetSpec("watch")!, [set]), [410, 502])
    const [localized] = await store.preparePage("default", "fi")
    assert.deepEqual(localized.canvas, { width: 410, height: 502 })
    const stored = await store.readSet(set.id)
    await store.writeSet(set.id, { ...stored, name: "Edited Watch" })
    assert.deepEqual((await store.readSet(set.id)).canvas, {
      width: 410,
      height: 502,
    })
  }))

test("concurrent page and collection changes preserve both config updates", async () =>
  fixture(async (store) => {
    const [page] = await Promise.all([
      store.createPage({ name: "Campaign" }),
      store.createSet({
        name: "Phone",
        device: "iPhone",
        locale: "fi",
        specId: "iphone",
        width: 1206,
        height: 2622,
      }),
      store.renamePage("default", "Main page"),
    ])
    const config = await store.readConfig()
    assert.ok(config.pages.some((entry) => entry.id === page.id))
    assert.equal(config.pages[0].name, "Main page")
    assert.deepEqual(config.pages[0].localizations, ["fi"])
    assert.deepEqual(readinessIssues(config, await store.listSets()), [])
  }))

test("rejected metadata changes do not add a localization", async () =>
  fixture(async (store) => {
    const set = await store.createSet({
      name: "Phone",
      device: "iPhone",
      locale: "en-US",
      specId: "iphone",
      width: 1206,
      height: 2622,
    })
    const before = await store.readConfig()
    await assert.rejects(
      store.updateSetMetadata(set.id, {
        name: set.name,
        device: set.device,
        locale: "fi",
        specId: "ipad",
      }),
      /dimensions/,
    )
    assert.deepEqual(await store.readConfig(), before)
    assert.deepEqual(await store.readSet(set.id), set)
  }))

test("preparation uses exact TV dimensions and honors screenshot device overrides", async () =>
  fixture(async (store) => {
    await store.addAsset(
      "screenshots",
      "tv.svg",
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2160"></svg>',
      ),
    )
    await store.addAsset(
      "screenshots",
      "custom.svg",
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"></svg>',
      ),
    )
    await store.updateAssetMetadata("screenshots", "custom.svg", {
      deviceType: "ipad",
    })
    const prepared = await store.preparePage("default", "en-US")
    assert.match(
      prepared.find((set) => set.specId === "tv")!.areas[0].html,
      /tv.svg/,
    )
    assert.match(
      prepared.find((set) => set.specId === "ipad")!.areas[0].html,
      /custom.svg/,
    )
  }))
