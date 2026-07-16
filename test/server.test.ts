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

test("local API streams project file changes to an open preview", async () => {
  const projectDirectory = await mkdtemp(path.join(tmpdir(), "storeshot-server-events-test-"))
  const service = await startServer({
    host: "127.0.0.1",
    port: 0,
    packageRoot: process.cwd(),
    projectDirectory,
    useVite: false,
  })
  const controller = new AbortController()

  try {
    const response = await fetch(`http://127.0.0.1:${service.port}/api/events`, { signal: controller.signal })
    assert.equal(response.status, 200)
    assert.ok(response.body)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    await readEventUntil(reader, decoder, "event: ready")

    await writeFile(path.join(projectDirectory, "storeshot.json"), `${JSON.stringify({ version: 1, appName: "Changed", platforms: ["ios"] }, null, 2)}\n`)
    const event = await readEventUntil(reader, decoder, "event: project")
    assert.match(event, /"config"/)
  } finally {
    controller.abort()
    await service.close()
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

async function readEventUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  pattern: string,
): Promise<string> {
  let contents = ""
  const timeout = AbortSignal.timeout(5_000)
  while (!contents.includes(pattern)) {
    const result = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => timeout.addEventListener("abort", () => reject(new Error(`Timed out waiting for ${pattern}`)), { once: true })),
    ])
    if (result.done) throw new Error(`Event stream ended before ${pattern}`)
    contents += decoder.decode(result.value, { stream: true })
  }
  return contents
}
