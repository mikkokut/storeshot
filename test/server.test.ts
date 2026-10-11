import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import { request as httpRequest } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"
import puppeteer, { type Browser } from "puppeteer-core"
import { readImageMetadata } from "../src/image-metadata.js"

import { startServer } from "../src/server.js"

test("PNG requests share Chrome across languages and concurrent exports, recover from launch failure, and close on shutdown", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-server-png-"))
  const launch = puppeteer.launch.bind(puppeteer)
  let browser: Browser | undefined
  let attempts = 0
  const launchMock = t.mock.method(puppeteer, "launch", async (...args: Parameters<typeof launch>) => {
    if (++attempts === 1) throw new Error("Temporary launch failure")
    browser = await launch(...args)
    return browser
  })
  const service = await startServer({ host: "127.0.0.1", port: 0, packageRoot: process.cwd(), projectDirectory: directory, useVite: false })
  try {
    assert.equal(launchMock.mock.callCount(), 0)
    const sets = await Promise.all(["en-US", "fi"].map((locale) => service.store.createSet({ name: locale, locale, device: "Phone", width: 400, height: 800 })))
    const png = (set: typeof sets[number]) => fetch(`http://127.0.0.1:${service.port}/api/sets/${set.id}/areas/${set.areas[0].id}/png`, { method: "POST" })
    assert.equal((await png(sets[0])).status, 400)
    const results = await Promise.all(sets.map(png))
    for (const response of results) {
      assert.equal(response.status, 200)
      assert.equal(response.headers.get("content-type"), "image/png")
      assert.deepEqual(readImageMetadata(Buffer.from(await response.arrayBuffer())), { width: 400, height: 800 })
    }
    assert.equal(launchMock.mock.callCount(), 2)
    const baselinePages = (await browser!.pages()).length
    const htmlPath = path.join(service.store.setsPath, sets[0].id, `${sets[0].areas[0].id}.html`)
    await writeFile(htmlPath, '<img src="../../assets/brand/missing.png">')
    assert.equal((await png(sets[0])).status, 400)
    await writeFile(htmlPath, sets[0].areas[0].html)
    assert.equal((await png(sets[0])).status, 200)
    assert.equal((await browser!.pages()).length, baselinePages)
    assert.equal(launchMock.mock.callCount(), 2)
  } finally {
    await service.close()
    assert.equal(browser?.connected, false)
    await rm(directory, { recursive: true, force: true })
  }
})

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
    const selectable = await fetch(`${url}?preview=selectable`)
    assert.match(selectable.headers.get("content-security-policy") ?? "", /^sandbox allow-same-origin;/)
    assert.doesNotMatch(selectable.headers.get("content-security-policy") ?? "", /allow-scripts/)
    assert.doesNotMatch(response.headers.get("content-security-policy") ?? "", /allow-same-origin/)
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
    const pageId = (await service.store.readConfig()).pages[0].id
    const prepared = await post(`/api/pages/${pageId}/prepare`, { locale: "en-US" })
    assert.equal(prepared.status, 200)
    const project = await prepared.json() as { sets: { specId: string }[] }
    assert.equal(project.sets[0].specId, "iphone")
    assert.equal((await post(`/api/pages/${pageId}/localizations`, { locale: "fi", sourceLocale: "en-US" })).status, 200)
    assert.equal((await post(`/api/pages/${pageId}/localizations`, { locale: "fi" })).status, 400)
    const copy = await post("/api/pages", { name: "Campaign", sourcePageId: pageId })
    assert.equal(copy.status, 201)
    const body = await copy.json() as { page: { localizations: string[] }; project: { sets: unknown[] } }
    assert.deepEqual(body.page.localizations,["en-US","fi"])
    assert.equal(body.project.sets.length,4)
    const status = await fetch(`${base}/api/app-store`).then((response)=>response.json()) as { issues: {code:string}[] }
    assert.equal(status.issues.length,0)
    assert.equal((await post(`/api/pages/${pageId}/prepare`, { locale: "../escape" })).status,400)
    const removed = await fetch(`${base}/api/pages/${pageId}/localizations/fi`, { method: "DELETE" })
    assert.equal(removed.status, 200)
    const remaining = await removed.json() as { config: { pages: { id: string; localizations: string[] }[] }; sets: { pageId: string; locale: string }[] }
    assert.deepEqual(remaining.config.pages.find((page) => page.id === pageId)?.localizations, ["en-US"])
    assert.ok(!remaining.sets.some((set) => set.pageId === pageId && set.locale === "fi"))
    assert.equal(remaining.sets.length, 3)
    assert.equal((await fetch(`${base}/api/pages/${pageId}/localizations/fi`, { method: "DELETE" })).status, 400)
    assert.equal((await fetch(`${base}/api/pages/missing/localizations/fi`, { method: "DELETE" })).status, 400)
  } finally { await service.close(); await rm(directory,{recursive:true,force:true}) }
})

test("annotation context identifies the rendered element without running artwork scripts", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-annotation-context-"))
  const service = await startServer({ host: "127.0.0.1", port: 0, packageRoot: process.cwd(), projectDirectory: directory, useVite: false })
  try {
    const set = await service.store.createSet({ name: "Annotations", locale: "en-US", device: "iPhone", specId: "iphone", width: 1206, height: 2622 })
    const area = set.areas[0]
    await service.store.writeSet(set.id, { ...set, areas: [{ ...area, html: `<style>html,body{margin:0;width:1206px;height:2622px}h1{position:absolute;left:80px;top:100px;width:700px;height:100px;margin:0}</style><h1 id="headline">Explore nearby</h1><script>document.querySelector('h1').textContent='SCRIPT EXECUTED'</script>` }] })
    const url = `http://127.0.0.1:${service.port}/api/sets/${set.id}/areas/${area.id}/annotation-context`
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ x: 10, y: 5 }) })
    assert.equal(response.status, 200)
    const context = await response.json()
    assert.equal(context.target, "Explore nearby")
    assert.equal(context.role, "heading")
    assert.equal(context.selector, "#headline")
    assert.equal(context.path, "html > body > h1")
    assert.deepEqual(context.rect, { x: 80, y: 100, width: 700, height: 100 })
    assert.deepEqual([context.x, context.y, context.width, context.height], [121, 131, 1206, 2622])
    const invalid = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ x: -1, y: 10 }) })
    assert.equal(invalid.status, 400)
    const creative = await service.store.createSet({ name: "Header", locale: "en-US", specId: "header", device: "Header", width: 3840, height: 1646 })
    assert.equal((await fetch(`http://127.0.0.1:${service.port}/api/sets/${creative.id}/areas/${creative.areas[0].id}/annotation-context`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ x: 10, y: 5 }) })).status, 400)
  } finally {
    await service.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test("selectable previews expose text to the editor while artwork scripts stay blocked", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-selectable-preview-"))
  const service = await startServer({ host: "127.0.0.1", port: 0, packageRoot: process.cwd(), projectDirectory: directory, useVite: false })
  let browser: Browser | undefined
  try {
    const set = await service.store.createSet({ name: "Selectable", locale: "en-US", device: "iPhone", specId: "iphone", width: 1206, height: 2622 })
    const area = set.areas[0]
    await service.store.writeSet(set.id, { ...set, areas: [{ ...area, html: '<h1>Explore nearby</h1><script>parent.document.body.dataset.compromised="script";document.querySelector("h1").textContent="Executed"</script><img src="missing.png" onerror="parent.document.body.dataset.compromised=\'handler\'">' }] })
    const base = `http://127.0.0.1:${service.port}`
    browser = await puppeteer.launch({ headless: true, channel: "chrome" })
    const page = await browser.newPage()
    // Establish an HTML editor origin before embedding the selectable artwork.
    await page.goto(`${base}/`)
    await page.setContent(`<iframe sandbox="allow-same-origin" src="${base}/artboards/sets/${set.id}/${area.id}.html?preview=selectable"></iframe>`)
    await page.waitForFunction(() => !!document.querySelector("iframe")?.contentDocument?.querySelector("h1"))
    const result = await page.evaluate(() => {
      const frame = document.querySelector("iframe")!
      const artwork = frame.contentDocument!
      const range = artwork.createRange()
      range.selectNodeContents(artwork.querySelector("h1")!)
      const selection = artwork.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      return { selected: selection.toString(), compromised: document.body.dataset.compromised ?? null, sandbox: frame.getAttribute("sandbox") }
    })
    assert.deepEqual(result, { selected: "Explore nearby", compromised: null, sandbox: "allow-same-origin" })
    const exported = await fetch(`${base}/artboards/sets/${set.id}/${area.id}.html`)
    assert.doesNotMatch(exported.headers.get("content-security-policy") ?? "", /allow-same-origin|allow-scripts/)
  } finally {
    await browser?.close()
    await service.close()
    await rm(directory, { recursive: true, force: true })
  }
})
