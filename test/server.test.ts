import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { startServer } from "../src/server.js"

test("local API returns typed client errors and hides unexpected failures", async () => {
  const projectDirectory = await mkdtemp(path.join(tmpdir(), "storeshot-server-test-"))
  const service = await startServer({
    host: "127.0.0.1",
    port: 0,
    packageRoot: process.cwd(),
    projectDirectory,
    useVite: false,
  })
  const baseUrl = `http://127.0.0.1:${service.port}`

  try {
    assert.equal((await fetch(`${baseUrl}/api/project`)).status, 200)

    const crossOrigin = await fetch(`${baseUrl}/api/project`, { headers: { Origin: "https://example.com" } })
    assert.equal(crossOrigin.status, 403)

    const wrongType = await fetch(`${baseUrl}/api/sets`, { method: "POST", body: "{}" })
    assert.equal(wrongType.status, 415)

    const malformed = await fetch(`${baseUrl}/api/sets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    })
    assert.equal(malformed.status, 400)

    const missing = await fetch(`${baseUrl}/api/assets/screenshots/missing.png`)
    assert.equal(missing.status, 404)

    await writeFile(path.join(projectDirectory, "storeshot.json"), "{")
    const originalConsoleError = console.error
    console.error = () => undefined
    try {
      const unexpected = await fetch(`${baseUrl}/api/project`)
      assert.equal(unexpected.status, 500)
      assert.deepEqual(await unexpected.json(), { error: "StoreShot could not complete the request" })
    } finally {
      console.error = originalConsoleError
    }
  } finally {
    await service.close()
    await rm(projectDirectory, { recursive: true, force: true })
  }
})
