import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import { request as httpRequest } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"

import { startServer } from "../src/server.js"

test("failed server startup releases its watcher and lets the CLI exit", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-server-startup-"))
  const service = await startServer({ host: "127.0.0.1", port: 0, packageRoot: process.cwd(), projectDirectory: directory, useVite: false })
  try {
    const source = `import { startServer } from './src/server.ts';
      try { await startServer(${JSON.stringify({ host: "127.0.0.1", port: service.port, packageRoot: process.cwd(), projectDirectory: directory, useVite: false })}) }
      catch (error) { console.error(error.code); process.exitCode = 1 }`
    await assert.rejects(promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "-e", source], { timeout: 10_000 }), (error: unknown) => {
      const failure = error as { code: number; killed: boolean; stderr: string }
      assert.equal(failure.code, 1)
      assert.equal(failure.killed, false)
      assert.match(failure.stderr, /EADDRINUSE/)
      return true
    })
  } finally {
    await service.close()
    await rm(directory, { recursive: true, force: true })
  }
})

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
    assert.equal((await fetch(`${baseUrl}/api/project`, { headers: { Origin: baseUrl } })).status, 200)
    assert.equal(await statusWithHost(`${baseUrl}/api/project`, `[::1]:${service.port}`), 200)
    assert.equal(await statusWithHost(`${baseUrl}/api/project`, "example.com"), 403)
    assert.equal((await fetch(`${baseUrl}/api/project`, { headers: { Origin: baseUrl.replace("http:", "https:") } })).status, 403)

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

function statusWithHost(url: string, host: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    httpRequest(url, { headers: { Host: host } }, (response) => {
      response.resume()
      resolve(response.statusCode)
    }).on("error", reject).end()
  })
}

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

    await writeFile(path.join(projectDirectory, "storeshot.json"), `${JSON.stringify({ version: 2, pages: [{ id: "changed", name: "Changed", store: "app-store", localizations: [] }] }, null, 2)}\n`)
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

test("artboard resources stay inside the project and disk HTML edits emit events", async () => {
  const projectDirectory = await mkdtemp(path.join(tmpdir(), "storeshot-artboard-api-"))
  const service = await startServer({ host: "127.0.0.1", port: 0, packageRoot: process.cwd(), projectDirectory, useVite: false })
  const controller = new AbortController()
  const base = `http://127.0.0.1:${service.port}`
  try {
    const set = await service.store.createSet({ name: "HTML", locale: "en-US", device: "Phone", width: 400, height: 800 })
    const url = `${base}/artboards/sets/${set.id}/${set.areas[0].id}.html`
    const response = await fetch(url)
    assert.equal(response.status, 200)
    assert.match(response.headers.get("content-security-policy") ?? "", /sandbox/)
    assert.equal(response.headers.get("cache-control"), "no-store")
    assert.equal((await fetch(url, { headers: { Origin: "https://example.com" } })).status, 403)
    assert.equal((await fetch(`${base}/artboards/storeshot.json`)).status, 404)
    assert.equal((await fetch(`${base}/artboards/sets/%2e%2e%2fstoreshot.json`)).status, 404)
    const { symlink } = await import("node:fs/promises")
    await symlink(service.store.configPath, path.join(service.store.setsPath, set.id, "linked.html"))
    assert.equal((await fetch(`${base}/artboards/sets/${set.id}/linked.html`)).status, 404)
    const events = await fetch(`${base}/api/events`, { signal: controller.signal })
    const reader = events.body!.getReader()
    const decoder = new TextDecoder()
    await readEventUntil(reader, decoder, "event: ready")
    const html = '<!doctype html><h1>Saved from disk</h1>'
    await writeFile(path.join(service.store.setsPath, set.id, `${set.areas[0].id}.html`), html)
    assert.match(await readEventUntil(reader, decoder, "event: project"), /"sets"/)
    assert.equal(await (await fetch(url)).text(), html)
    assert.equal((await service.store.readSet(set.id)).areas[0].html, html)
    await writeFile(path.join(service.store.setsPath, set.id, `${set.areas[0].id}.json`), JSON.stringify({ name: "Edited metadata" }))
    assert.match(await readEventUntil(reader, decoder, "event: project"), /"sets"/)
    for (const extension of ["json", "html"])
      await rename(path.join(service.store.setsPath, set.id, `${set.areas[0].id}.${extension}`), path.join(service.store.setsPath, set.id, `${set.areas[0].id}-home-screen.${extension}`))
    assert.equal(await (await fetch(url)).text(), html)
    await rename(path.join(service.store.setsPath, set.id), path.join(service.store.setsPath, "renamed"))
    assert.match(await readEventUntil(reader, decoder, "event: project"), /"sets"/)
    const project = await (await fetch(`${base}/api/project`)).json()
    assert.equal(project.sets[0].id, "renamed")
    assert.equal(project.sets[0].areas[0].name, "Edited metadata")
    assert.equal(await (await fetch(`${base}/artboards/sets/renamed/${set.areas[0].id}.html`)).text(), html)
  } finally {
    controller.abort()
    await service.close()
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("App Store API prepares, localizes and clones page collections with validation", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-pages-api-"))
  const service = await startServer({ host: "127.0.0.1", port: 0, projectDirectory: directory, packageRoot: process.cwd(), useVite: false })
  const base = `http://127.0.0.1:${service.port}`
  const post = (endpoint: string, body: unknown) => fetch(`${base}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  try {
    const prepared = await post("/api/pages/default/prepare", { locale: "en-US" })
    assert.equal(prepared.status, 200)
    const project = await prepared.json() as { sets: { specId: string }[] }
    assert.equal(project.sets[0].specId, "iphone")
    assert.equal((await post("/api/pages/default/localizations", { locale: "fi", sourceLocale: "en-US" })).status, 200)
    assert.equal((await post("/api/pages/default/localizations", { locale: "fi" })).status, 400)
    const copy = await post("/api/pages", { name: "Campaign", sourcePageId: "default" })
    assert.equal(copy.status, 201)
    const body = await copy.json() as { page: { localizations: string[] }; project: { sets: unknown[] } }
    assert.deepEqual(body.page.localizations,["en-US","fi"])
    assert.equal(body.project.sets.length,4)
    const status = await fetch(`${base}/api/app-store`).then((response)=>response.json()) as { issues: {code:string}[] }
    assert.equal(status.issues.length,0)
    assert.equal((await post("/api/pages/default/prepare", { locale: "../escape" })).status,400)
    const removed = await fetch(`${base}/api/pages/default/localizations/fi`, { method: "DELETE" })
    assert.equal(removed.status, 200)
    const remaining = await removed.json() as { config: { pages: { id: string; localizations: string[] }[] }; sets: { pageId: string; locale: string }[] }
    assert.deepEqual(remaining.config.pages.find((page) => page.id === "default")?.localizations, ["en-US"])
    assert.ok(!remaining.sets.some((set) => set.pageId === "default" && set.locale === "fi"))
    assert.equal(remaining.sets.length, 3)
    assert.equal((await fetch(`${base}/api/pages/default/localizations/fi`, { method: "DELETE" })).status, 400)
    assert.equal((await fetch(`${base}/api/pages/missing/localizations/fi`, { method: "DELETE" })).status, 400)
  } finally { await service.close(); await rm(directory,{recursive:true,force:true}) }
})
