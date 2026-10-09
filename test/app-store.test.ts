import assert from "node:assert/strict"
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
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
  specsForPage,
  CREATION_SPECS,
  creationSize,
  creationSpecsForPage,
  readinessIssues,
} from "../src/app-store.js"
import { parseStoreShotConfig } from "../src/app-store-config.js"
import { ProjectStore } from "../src/project-store.js"
import { migrateProject } from "../src/migrate.js"

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
      const spec = specsForPage((await store.readConfig()).pages[0]).find(
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
      ["iphone", "ipad", "watch", "mac"],
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
test("PPO treatment copies exclude Mac and Watch, and a fourth treatment leaves config unchanged", async () =>
  fixture(async (store) => {
    for (const device of ["iphone", "ipad", "watch", "mac"]) {
      const spec = specsForPage((await store.readConfig()).pages[0]).find(
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
    await store.preparePage("default", "en-US")
    const first = await store.createPage({
      name: "A",
      kind: "treatment",
      testName: "Messaging",
      sourcePageId: "default",
    })
    assert.deepEqual(
      (await store.listSets())
        .filter((set) => set.pageId === first.id)
        .map((set) => set.specId),
      ["iphone", "ipad"],
    )
    await store.createPage({
      name: "B",
      kind: "treatment",
      testId: first.testId,
    })
    await store.createPage({
      name: "C",
      kind: "treatment",
      testId: first.testId,
    })
    const before = await store.readConfig()
    await assert.rejects(
      store.createPage({ name: "D", kind: "treatment", testId: first.testId }),
      /three/,
    )
    assert.deepEqual(await store.readConfig(), before)
    await assert.rejects(
      store.createSet({
        pageId: first.id,
        specId: "mac",
        name: "Mac",
        locale: "en-US",
        device: "Mac",
        width: 2880,
        height: 1800,
      }),
      /not enabled/,
    )
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
test("config rejects invalid hierarchy, missing test references, and excess custom pages", () => {
  const config = defaultConfig()
  assert.throws(() => parseStoreShotConfig({ ...config, pages: [] }), /default/)
  assert.throws(
    () =>
      parseStoreShotConfig({
        ...config,
        pages: [
          ...config.pages,
          {
            id: "treatment",
            name: "A",
            kind: "treatment",
            localizations: ["en-US"],
            testId: "missing",
          },
        ],
      }),
    /missing test/,
  )
  assert.throws(
    () =>
      parseStoreShotConfig({
        ...config,
        pages: [
          ...config.pages,
          ...Array.from({ length: 71 }, (_, i) => ({
            id: `custom-${i}`,
            name: `Page ${i}`,
            kind: "custom",
            localizations: ["en-US"],
          })),
        ],
      }),
    /70/,
  )
})
test("v2 HTML migration preserves file bytes, backs up manifests, marks ambiguous assets, and is idempotent", async () =>
  fixture(async (store) => {
    const oldConfig = {
      version: 1,
      appName: "Legacy",
      platforms: ["ios", "android"],
    }
    await writeFile(store.configPath, JSON.stringify(oldConfig))
    const timestamp = new Date().toISOString()
    const html =
      '<html lang="fi"><link rel="stylesheet" href="style.css"><h1>Hei!</h1></html>'
    for (const id of ["first", "second"]) {
      await mkdir(path.join(store.setsPath, id))
      await writeFile(path.join(store.setsPath, id, "image.html"), html)
      await writeFile(
        path.join(store.setsPath, id, "style.css"),
        "body{background:blue}",
      )
      await writeFile(
        path.join(store.setsPath, `${id}.json`),
        JSON.stringify({
          version: 2,
          id,
          name: id,
          locale: "fi",
          device: "iPhone",
          canvas: { width: 1206, height: 2622 },
          areas: [{ id: "image", name: "One", file: `${id}/image.html` }],
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      )
    }
    const result = await migrateProject(store.root, process.cwd())
    assert.equal(result.migrated.length, 2)
    assert.equal(result.backups.length, 3)
    assert.ok(result.warnings.some((warning) => warning.includes("Android")))
    assert.equal((await store.readSet("first")).specId, "iphone")
    assert.equal((await store.readSet("second")).specId, "unassigned")
    assert.equal((await store.readSet("first")).areas[0].html, html)
    assert.equal(
      await readFile(path.join(store.setsPath, "first/style.css"), "utf8"),
      "body{background:blue}",
    )
    assert.deepEqual(
      (await migrateProject(store.root, process.cwd())).migrated,
      [],
    )
    assert.deepEqual(
      JSON.parse(await readFile(`${store.configPath}.v1.bak`, "utf8")),
      oldConfig,
    )
  }))
test("migration rejects symlinked legacy HTML and leaves config and manifests untouched", async () =>
  fixture(async (store) => {
    const [set] = await store.preparePage("default", "en-US")
    const filename = path.join(store.setsPath, `${set.id}.json`)
    const old = { ...JSON.parse(await readFile(filename, "utf8")), version: 2 }
    await writeFile(filename, JSON.stringify(old))
    const file = path.join(store.setsPath, set.id, `${set.areas[0].id}.html`)
    await rm(file)
    await symlink(store.configPath, file)
    const before = await readFile(store.configPath, "utf8")
    await assert.rejects(
      migrateProject(store.root, process.cwd()),
      /regular|symbolic/,
    )
    assert.equal(await readFile(store.configPath, "utf8"), before)
    assert.deepEqual(JSON.parse(await readFile(filename, "utf8")), old)
  }))

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
    assert.equal(
      prepared.some((set) => set.specId.startsWith("iphone-duo")),
      false,
    )
    assert.equal(iphone.areas.length, 1)
    assert.match(iphone.areas[0].html, /phone.svg/)
    assert.doesNotMatch(iphone.areas[0].html, /duo.svg/)
    await store.localizePage("default", { locale: "fi" })
    const localized = await store.preparePage("default", "fi")
    assert.doesNotMatch(localized[0].areas[0].html, /phone.svg/)
  }))

test("removing a treatment removes its collections and empty test but preserves artwork and other pages", async () =>
  fixture(async (store) => {
    await store.preparePage("default", "en-US")
    const treatment = await store.createPage({
      name: "A",
      kind: "treatment",
      testName: "Test",
      sourcePageId: "default",
    })
    await store.renamePage(treatment.id, "Benefit first")
    assert.equal(
      (await store.readConfig()).pages.find((page) => page.id === treatment.id)
        ?.name,
      "Benefit first",
    )
    const copy = (await store.listSets()).find(
      (set) => set.pageId === treatment.id,
    )!
    await store.deletePage(treatment.id)
    assert.equal((await store.listSets()).length, 1)
    assert.equal((await store.readConfig()).tests.length, 0)
    assert.ok(
      await readFile(
        path.join(store.setsPath, copy.id, `${copy.areas[0].id}.html`),
        "utf8",
      ),
    )
    await assert.rejects(store.deletePage("default"), /cannot be removed/)
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
    const page = await store.createPage({ name: "Campaign", kind: "custom" })
    assert.deepEqual(page.localizations, [])
    await assert.rejects(
      store.createSet({
        name: "Mac",
        device: "Mac",
        locale: "fi",
        pageId: page.id,
        specId: "mac",
        width: 2880,
        height: 1800,
      }),
      /not enabled/,
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
      ["ipad", [2064, 2752]],
      ["watch", [422, 514]],
      ["mac", [2880, 1800]],
      ["tv", [3840, 2160]],
      ["vision", [3840, 2160]],
    ],
  )
  assert.equal(
    creationSpecsForPage({
      id: "campaign",
      name: "Campaign",
      kind: "custom",
      localizations: [],
    }).some((spec) => spec.id === "mac"),
    false,
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
      store.createPage({ name: "Campaign", kind: "custom" }),
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

test("mixed-version migration reserves current slots before legacy filenames and respects page scope", async () =>
  fixture(async (store) => {
    await store.createSet({
      name: "Zulu",
      device: "iPhone",
      locale: "en-US",
      specId: "iphone",
      width: 1206,
      height: 2622,
    })
    const custom = await store.createPage({ name: "Campaign", kind: "custom" })
    await store.createSet({
      name: "Zulu iPad",
      device: "iPad",
      pageId: custom.id,
      locale: "en-US",
      specId: "ipad",
      width: 2064,
      height: 2752,
    })
    for (const [id, width, height] of [
      ["alpha-phone", 1206, 2622],
      ["alpha-ipad", 2064, 2752],
    ] as const) {
      await mkdir(path.join(store.setsPath, id))
      await writeFile(
        path.join(store.setsPath, id, "image.html"),
        "<h1>Original</h1>",
      )
      await writeFile(
        path.join(store.setsPath, `${id}.json`),
        JSON.stringify({
          version: 2,
          id,
          name: id,
          device: id,
          locale: "en-US",
          canvas: { width, height },
          areas: [{ id: "image", name: "One", file: `${id}/image.html` }],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      )
    }
    await migrateProject(store.root, process.cwd())
    assert.equal((await store.readSet("alpha-phone")).specId, "unassigned")
    assert.equal((await store.readSet("alpha-ipad")).specId, "ipad")
    assert.equal(
      readinessIssues(await store.readConfig(), await store.listSets()).some(
        (issue) => issue.code === "duplicate",
      ),
      false,
    )
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
