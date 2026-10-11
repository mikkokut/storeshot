import assert from "node:assert/strict"
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { readImageMetadata } from "../src/image-metadata.js"
import { launchChrome, renderScreenshotSets } from "../src/node-renderer.js"
import { createArtboardHtml } from "../src/html-artboard.js"
import { ProjectStore } from "../src/project-store.js"

test("new artboards render blank with neutral CSS and optional captures fit without cropping", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-blank-artboard-"))
  const browser = await launchChrome()
  try {
    const store = new ProjectStore(directory)
    await store.initialize()
    const set = await store.createSet({ name: "Blank", locale: "en-US", device: "Phone", width: 400, height: 800 })
    const saved = await store.readSet(set.id)
    const page = await browser.newPage()
    await page.setViewport({ width: 400, height: 800 })
    await page.setContent(saved.areas[0].html)
    assert.deepEqual(await page.evaluate(() => {
      const style = getComputedStyle(document.body)
      return {
        children: document.body.children.length,
        text: document.body.textContent?.trim(),
        width: document.body.offsetWidth,
        height: document.body.offsetHeight,
        background: style.backgroundColor,
        margin: style.margin,
        padding: style.padding,
        boxSizing: style.boxSizing,
        pseudoBoxSizing: getComputedStyle(document.body, "::before").boxSizing,
        overflow: style.overflow,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      }
    }), {
      children: 0, text: "", width: 400, height: 800,
      background: "rgb(255, 255, 255)", margin: "0px", padding: "0px",
      boxSizing: "border-box", pseudoBoxSizing: "border-box", overflow: "hidden",
      scrollWidth: 400, scrollHeight: 800,
    })
    const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="blue"/></svg>')}`
    await page.setContent(createArtboardHtml(400, 800, { locale: "ar-SA", image }))
    assert.deepEqual(await page.evaluate(async () => {
      const capture = document.querySelector("img")!
      await capture.decode()
      return {
        direction: document.documentElement.dir,
        text: document.body.textContent?.trim(),
        width: capture.offsetWidth,
        height: capture.offsetHeight,
        objectFit: getComputedStyle(capture).objectFit,
        naturalWidth: capture.naturalWidth,
        naturalHeight: capture.naturalHeight,
      }
    }), {
      direction: "rtl", text: "", width: 400, height: 800,
      objectFit: "contain", naturalWidth: 200, naturalHeight: 100,
    })
  } finally {
    await browser.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test("Chrome renders canonical HTML, local CSS and images at the requested size", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-render-test-"))
  try {
    const store = new ProjectStore(directory)
    await store.initialize()
    const set = await store.createSet({ name: "HTML", locale: "en-US", device: "iPhone", width: 400, height: 800 })
    const dir = path.join(store.setsPath, set.id)
    await writeFile(path.join(dir, "style.css"), "body{margin:0;background:rgb(12,34,56)}h1{color:white;font:40px Arial}")
    await store.addAsset("brand", "logo.svg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="red"/></svg>'))
    // Deliberately leave the in-memory HTML stale to prove the file is authoritative.
    await writeFile(path.join(dir, `${set.areas[0].id}.html`), '<!doctype html><link rel="stylesheet" href="style.css"><h1>Native HTML</h1><img src="../../assets/brand/logo.svg">')
    for (const extension of ["json", "html"])
      await rename(path.join(dir, `${set.areas[0].id}.${extension}`), path.join(dir, `${set.areas[0].id}-native-html.${extension}`))
    const options = { clean: false, outputDirectory: path.join(directory, "renders"), scale: .5, sets: [set], store }
    const result = await renderScreenshotSets(options)
    assert.equal(result.files.length, 1)
    assert.deepEqual(readImageMetadata(await readFile(result.files[0].path)), { width: 200, height: 400 })
    assert.equal(result.files[0].width, 200)
    await assert.rejects(renderScreenshotSets({ ...options, scale: 0 }), /scale/)
    await assert.rejects(renderScreenshotSets({ ...options, area: "missing" }), /no area/)
    await assert.rejects(renderScreenshotSets({ ...options, clean: true, outputDirectory: store.setsPath }), /source files/)
    await writeFile(path.join(dir, `${set.areas[0].id}-native-html.html`), '<img src="../../assets/brand/missing.png">')
    await assert.rejects(renderScreenshotSets(options), /missing|decode|EncodingError/i)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("previews and Chrome exports load CSS and fonts from another origin", async () => {
  const { createServer } = await import("node:http")
  const { startServer } = await import("../src/server.js")
  const { launchChrome } = await import("../src/node-renderer.js")
  const font = await readFile(path.join(process.cwd(), "node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2"))
  const requests: string[] = []
  let missingFont = false
  const remote = createServer((request, response) => {
    requests.push(request.url ?? "")
    response.setHeader("Access-Control-Allow-Origin", "*")
    if (request.url === "/style.css") {
      response.writeHead(200, { "Content-Type": "text/css" }).end('@font-face{font-family:Remote;src:url("/font.woff2")}body{font-family:Remote}')
    } else if (request.url === "/font.woff2" && !missingFont) {
      response.writeHead(200, { "Content-Type": "font/woff2" }).end(font)
    } else response.writeHead(404).end()
  })
  await new Promise<void>((resolve) => remote.listen(0, "127.0.0.1", resolve))
  const remoteOrigin = `http://127.0.0.1:${(remote.address() as import("node:net").AddressInfo).port}`
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-remote-font-"))
  const service = await startServer({ host: "127.0.0.1", port: 0, packageRoot: process.cwd(), projectDirectory: directory, useVite: false })
  try {
    const set = await service.store.createSet({ name: "Fonts", locale: "en-US", device: "Phone", width: 400, height: 800 })
    set.areas[0].html = `<!doctype html><link rel="stylesheet" href="${remoteOrigin}/style.css"><body>Remote font</body>`
    await service.store.writeSet(set.id, set)
    const options = { store: service.store, sets: [set], outputDirectory: path.join(directory, "renders"), clean: false, scale: 1 }
    await renderScreenshotSets(options)
    assert.ok(requests.includes("/style.css"))
    assert.ok(requests.includes("/font.woff2"))
    requests.length = 0
    const browser = await launchChrome()
    try {
      const page = await browser.newPage()
      await page.setContent(`<iframe sandbox src="http://127.0.0.1:${service.port}/artboards/sets/${set.id}/${set.areas[0].id}.html"></iframe>`)
      const frame = page.frames().find((frame) => frame.url().includes("/artboards/"))!
      assert.equal(await frame.evaluate(async () => { await document.fonts.ready; return document.fonts.check("16px Remote") }), true)
      assert.ok(requests.includes("/font.woff2"))
    } finally { await browser.close() }
    missingFont = true
    await assert.rejects(renderScreenshotSets(options), /missing or blocked resources/)
  } finally {
    await service.close()
    remote.closeAllConnections()
    await new Promise<void>((resolve) => remote.close(() => resolve()))
    await rm(directory, { recursive: true, force: true })
  }
})
