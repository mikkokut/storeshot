import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { ProjectStore } from "../src/project-store.js"
import { validateProject } from "../src/validation.js"

test("project validation checks schema versions and cross-file references", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-validation-test-"))
  try {
    const store = new ProjectStore(directory)
    await store.initialize()
    const set = await store.createSet({ name: "English iPhone", locale: "en-US", device: "iPhone", width: 1320, height: 2868 })

    const valid = await validateProject(directory, process.cwd())
    assert.equal(valid.report.ok, true)
    assert.deepEqual(valid.report.errors, [])

    set.areas[0].elements.push({
      id: "element-missing-asset",
      type: "image",
      source: { kind: "asset", assetId: "brand/missing.png" },
      fit: "contain",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
    })
    await store.writeSet(set.id, set)
    const missingReference = await validateProject(directory, process.cwd())
    assert.equal(missingReference.report.ok, false)
    assert.ok(missingReference.report.errors.some((issue) => issue.code === "reference.asset"))

    await writeFile(store.configPath, JSON.stringify({ version: 2, appName: "Example", platforms: ["ios"] }))
    const invalidVersion = await validateProject(directory, process.cwd())
    assert.ok(invalidVersion.report.errors.some((issue) => issue.code === "config.invalid" && issue.message.includes("version")))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
