import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { ProjectStore } from "../src/project-store.js"
import { validateProject } from "../src/validation.js"

test("page validation scopes readiness while retaining project device requirements and shared errors", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-page-validation-"))
  try {
    const store = new ProjectStore(directory)
    await store.initialize()
    const first = await store.createSet({ name: "Phone", locale: "en-US", specId: "iphone", device: "iPhone", width: 1206, height: 2622 })
    const page = await store.createPage({ name: "All devices" })
    await store.createSet({ name: "Phone", pageId: page.id, locale: "en-US", specId: "iphone", device: "iPhone", width: 1206, height: 2622 })
    await store.createSet({ name: "Tablet", pageId: page.id, locale: "en-US", specId: "ipad", device: "iPad", width: 2064, height: 2752 })
    const all = await validateProject(directory)
    assert.ok(all.report.warnings.some(issue => issue.path === `${first.pageId}/en-US`))
    const scoped = await validateProject(directory, { pageId: page.id })
    assert.equal(scoped.report.pageId, page.id)
    assert.equal(scoped.report.summary.sets, 2)
    assert.deepEqual(scoped.report.warnings, [])
    const missing = await validateProject(directory, { pageId: first.pageId })
    assert.ok(missing.report.warnings.some(issue => issue.code === "appStore.missing" && issue.message.includes("iPad")))
    const unknown = await validateProject(directory, { pageId: "does-not-exist" })
    assert.equal(unknown.report.ok, false)
    assert.ok(unknown.report.errors.some(issue => issue.code === "page.unknown"))
    await writeFile(path.join(store.assetsPath, "screenshots", "broken.png"), "not an image")
    assert.equal((await validateProject(directory, { pageId: page.id })).report.ok, false)
    await rm(path.join(store.setsPath, first.id, `${first.areas[0].id}.html`))
    assert.ok((await validateProject(directory, { pageId: page.id })).report.errors.some(issue => issue.code === "set.invalid"))
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("project validation checks schema versions and cross-file references", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-validation-test-"))
  try {
    const store = new ProjectStore(directory)
    await store.initialize()
    const set = await store.createSet({ name: "English iPhone", locale: "en-US", device: "iPhone", width: 1320, height: 2868 })

    const valid = await validateProject(directory)
    assert.equal(valid.report.ok, true)
    assert.deepEqual(valid.report.errors, [])

    const metadata = path.join(store.setsPath, set.id, `${set.areas[0].id}.json`)
    await rm(metadata)
    const missingMetadata = await validateProject(directory)
    assert.equal(missingMetadata.report.ok, false)
    assert.ok(missingMetadata.report.errors.some((issue) => issue.path === `sets/${set.id}/index.json`))
    await writeFile(metadata, JSON.stringify({ name: "Restored" }))
    await rm(path.join(store.setsPath, set.id, `${set.areas[0].id}.html`))
    const missingReference = await validateProject(directory)
    assert.equal(missingReference.report.ok, false)
    assert.ok(missingReference.report.errors.some((issue) => issue.code === "set.invalid"))

    await writeFile(store.configPath, JSON.stringify({ version: 99, appName: "Example", platforms: ["ios"] }))
    const invalidVersion = await validateProject(directory)
    assert.ok(invalidVersion.report.errors.some((issue) => issue.code === "config.invalid" && issue.message.includes("version")))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
