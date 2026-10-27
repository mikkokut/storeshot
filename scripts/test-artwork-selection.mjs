// Run after npm run build:ui: node --import tsx scripts/test-artwork-selection.mjs
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import { startServer } from '../src/server.ts'

const directory = await mkdtemp(path.join(tmpdir(), 'storeshot-selection-'))
const service = await startServer({ host: '127.0.0.1', port: 0, projectDirectory: directory, packageRoot: process.cwd(), useVite: false })
let browser
try {
  const set = await service.store.createSet({ name: 'Selection', locale: 'en-US', device: 'iPhone', specId: 'iphone', width: 1206, height: 2622 })
  await service.store.writeSet(set.id, { ...set, areas: Array.from({ length: 6 }, (_, i) => ({
    ...set.areas[0], id: `selection-${i}`, name: `Screenshot ${i + 1}`,
    html: `<style>html,body{margin:0;width:1206px;height:2622px}svg{position:absolute;inset:0;width:1206px;height:2622px}h1{position:absolute;top:500px;left:100px;font:64px Arial}</style>
      <svg viewBox="0 0 1206 2622"><g transform="translate(603 250) scale(.94)"><text font-family="Arial" font-size="100"><tspan x="-350" y="0">Explore nearby ${i}</tspan><tspan x="-350" y="120">Find your route</tspan></text></g></svg>
      <svg viewBox="0 0 1206 2622"><rect x="0" y="800" width="1206" height="1700" fill="#ddd"/></svg><h1>Native HTML text</h1>`,
  })) })
  browser = await puppeteer.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage()
  page.setDefaultTimeout(8000)
  await page.setViewport({ width: 1536, height: 1100 })
  await page.goto(`http://127.0.0.1:${service.port}/pages/${set.pageId}`)
  await page.waitForFunction(() => [...document.querySelectorAll('main iframe')].length === 6 && [...document.querySelectorAll('main iframe')].every(f => f.contentDocument?.querySelector('tspan') && getComputedStyle(f).pointerEvents === 'auto'))
  async function previewCorners() {
    return page.$$eval('main iframe', frames => frames.map(frame => {
      const style = getComputedStyle(frame.parentElement)
      return {
        height: frame.parentElement.getBoundingClientRect().height,
        radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(parseFloat),
      }
    }))
  }
  function assertCorners(measured, referenceHeight, expected) {
    expected.forEach((radius, index) => assert.ok(Math.abs(measured.radii[index] / measured.height - radius / referenceHeight) < 0.000001, `Corner ${index} matches App Store Connect at every zoom`))
  }
  ;(await previewCorners()).forEach(measured => assertCorners(measured, 240, [12, 12, 12, 12]))
  const frames = await page.$$('main iframe')
  async function checkQueueLayout() {
    const measure = () => page.evaluate(() => {
      const annotate = document.querySelector('button[aria-keyshortcuts="A"]')
      return [...annotate.parentElement.querySelectorAll('button')].map(el => {
        const rect = el.getBoundingClientRect()
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      })
    })
    const before = await measure()
    await page.click('[data-slot="popover-trigger"]')
    await page.waitForSelector('[data-slot="popover-content"]')
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.deepEqual(await measure(), before, 'Opening Prompt queue keeps sidebar buttons in place')
    await page.keyboard.press('Escape')
    await page.waitForSelector('[data-slot="popover-content"]', { hidden: true })
    assert.deepEqual(await measure(), before, 'Closing Prompt queue keeps sidebar buttons in place')
  }
  await checkQueueLayout()
  async function drag(index, selector = 'tspan') {
    const element = frames[index]
    await element.scrollIntoView()
    const frame = await element.contentFrame()
    const rect = await frame.$eval(selector, el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
    const box = await element.boundingBox()
    const scale = box.width / 1206
    const x = box.x + (rect.x + 2) * scale
    const y = box.y + (rect.y + rect.height / 2) * scale
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + (rect.width - 4) * scale, y, { steps: 12 })
    assert.equal(await page.$('[data-artwork-selection-action]'), null, 'No action popup during drag')
    await page.mouse.up()
    await page.waitForSelector('[data-artwork-selection-action]')
    return frame.evaluate(() => getSelection().toString())
  }
  for (let i = 0; i < 4; i++) {
    assert.equal(await drag(i), `Explore nearby ${i}`)
    const selected = await page.evaluate(() => [...document.querySelectorAll('main iframe')].map(f => f.contentDocument.getSelection().toString()).filter(Boolean))
    assert.deepEqual(selected, [`Explore nearby ${i}`], 'Switching frames clears previous native ranges')
  }
  const before = await page.$eval('[data-artwork-selection-action]', el => el.getBoundingClientRect().x)
  await page.evaluate(() => {
    let el = document.querySelectorAll('main iframe')[3].parentElement
    while (el && !(el.scrollWidth > el.clientWidth && getComputedStyle(el).overflowX === 'auto')) el = el.parentElement
    el.scrollLeft += 60
  })
  await page.waitForFunction(previous => {
    const popup = document.querySelector('[data-artwork-selection-action]')
    return popup && popup.getBoundingClientRect().x < previous - 40
  }, {}, before)
  assert.equal(await (await frames[3].contentFrame()).evaluate(() => getSelection().toString()), 'Explore nearby 3')
  await page.mouse.click(1400, 100)
  await page.waitForFunction(() => !document.querySelector('[data-artwork-selection-action]'))
  assert.equal(await (await frames[3].contentFrame()).evaluate(() => getSelection().toString()), '')
  assert.equal(await drag(0), 'Explore nearby 0')
  await page.evaluate(() => {
    let el = document.querySelector('main iframe').parentElement
    while (el && !(el.scrollWidth > el.clientWidth && getComputedStyle(el).overflowX === 'auto')) el = el.parentElement
    el.scrollLeft = el.scrollWidth
  })
  await page.waitForFunction(() => !document.querySelector('[data-artwork-selection-action]'))
  assert.equal(await (await frames[0].contentFrame()).evaluate(() => getSelection().toString()), '', 'Fully clipped text clears its highlight')
  assert.equal(await drag(0, 'h1'), 'Native HTML text')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Shift')
  assert.equal(await page.$('[data-artwork-selection-action]'), null, 'Dismissed selections do not reopen on keyup')
  await frames[0].scrollIntoView()
  const doubleClickBox = await frames[0].boundingBox()
  const wordBox = await (await frames[0].contentFrame()).$eval('tspan', el => { const r = el.getBoundingClientRect(); return { x: r.x + 80, y: r.y + r.height / 2 } })
  await page.mouse.click(doubleClickBox.x + wordBox.x * doubleClickBox.width / 1206, doubleClickBox.y + wordBox.y * doubleClickBox.width / 1206, { count: 2 })
  await page.waitForSelector('[data-artwork-selection-action]')
  assert.ok(await (await frames[0].contentFrame()).evaluate(() => getSelection().toString().trim()), 'Double-click selects an SVG word')
  assert.equal(await drag(1), 'Explore nearby 1')
  const contextResponse = page.waitForResponse(response => response.url().endsWith('/annotation-context'))
  await page.click('[data-artwork-selection-action] button')
  await page.waitForSelector('textarea[aria-label="Comment"]')
  assert.equal(await page.$eval('blockquote', el => el.textContent), 'Explore nearby 1')
  assert.equal((await contextResponse).status(), 200)
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Comment', 'Selection popover must not steal focus back from the comment field')
  await page.keyboard.type('Shorten this headline.')
  assert.equal(await page.$eval('textarea[aria-label="Comment"]', el => el.value), 'Shorten this headline.', 'Comments can be typed immediately without clicking the field')
  await page.keyboard.down('Shift')
  await page.keyboard.press('Enter')
  await page.keyboard.up('Shift')
  await page.keyboard.type('Keep the map.')
  assert.equal(await page.$eval('textarea[aria-label="Comment"]', el => el.value), 'Shorten this headline.\nKeep the map.', 'Shift+Enter inserts a newline without submitting')
  await page.$eval('textarea[aria-label="Comment"]', el => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })))
  assert.ok(await page.$('textarea[aria-label="Comment"]'), 'IME confirmation must not submit')
  await page.keyboard.press('Enter')
  await page.waitForSelector('textarea[aria-label="Comment"]', { hidden: true })
  const comments = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('storeshot:annotations:')).flatMap(key => JSON.parse(localStorage.getItem(key))).map(note => note.comment))
  assert.deepEqual(comments, ['Shorten this headline.\nKeep the map.'], 'Enter submits the multiline annotation to the queue')
  await checkQueueLayout()
  await page.click('button[aria-keyshortcuts="A"]')
  await page.waitForFunction(() => document.querySelector('button[aria-keyshortcuts="A"]').getAttribute('aria-pressed') === 'true')
  await frames[1].evaluate(el => el.contentWindow.focus())
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => document.querySelector('button[aria-keyshortcuts="A"]').getAttribute('aria-pressed') === 'false')
  await page.click('button[aria-keyshortcuts="A"]')
  const clickContext = page.waitForResponse(response => response.url().endsWith('/annotation-context'))
  const shotBox = await frames[1].boundingBox()
  await page.mouse.click(shotBox.x + shotBox.width * .8, shotBox.y + shotBox.height * .8)
  await page.waitForSelector('textarea[aria-label="Comment"]')
  await clickContext
  await page.keyboard.press('Escape')
  await page.waitForSelector('textarea[aria-label="Comment"]', { hidden: true })
  assert.equal(await page.$eval('button[aria-keyshortcuts="A"]', el => el.getAttribute('aria-pressed')), 'false', 'Escape in the comment dialog also exits annotation mode')
  const duo = await service.store.createSet({ name: 'Duo', locale: 'en-US', device: 'iPhone Duo', specId: 'iphone-duo', width: 1398, height: 2034 })
  const duoSizes = [[1398, 2034], [2034, 1398], [2007, 2853], [2853, 2007]]
  await service.store.writeSet(duo.id, { ...duo, areas: duoSizes.map(([width, height], index) => ({
    id: `duo-${index}`, name: `Duo ${index}`, canvas: { width, height },
    html: `<style>html,body{margin:0;width:${width}px;height:${height}px;background:#ecf3ff;font-family:Arial;box-sizing:border-box}body{padding:7%}h1{font-size:80px;line-height:1.05;margin:0 0 4%}p{font-size:42px;margin:0;color:#304d76}.app{height:65%;margin-top:8%;border:6px solid #304d76;border-radius:40px;background:repeating-linear-gradient(135deg,#a9c7ec 0 100px,#cddff5 100px 200px)}</style><h1>Duo ${index}</h1><p>${index < 2 ? 'Outer display' : 'Inner display'} · ${width > height ? 'Landscape' : 'Portrait'}</p><div class="app"></div>`,
  })) })
  await page.reload()
  await page.waitForFunction(() => [...document.querySelectorAll('[role="tab"]')].some(el => el.textContent.includes('iPhone Duo')))
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find(el => el.textContent.includes('iPhone Duo')).click())
  await page.waitForFunction(() => [...document.querySelectorAll('main iframe')].length === 4 && [...document.querySelectorAll('main iframe')].every(f => f.contentDocument?.querySelector('h1')))
  assert.deepEqual(await page.$$eval('main iframe', frames => frames.map(frame => [frame.offsetWidth, frame.offsetHeight])), duoSizes, 'One Duo strip previews all four accepted sizes in order')
  assert.equal(await page.evaluate(() => document.querySelector('main').textContent.includes('Outer display')), false, 'Duo has no separate outer display slot')
  const duoMasks = [[240, [4, 21, 21, 4]], [165, [4, 4, 21, 21]], [240, [21, 21, 21, 21]], [240, [21, 21, 21, 21]]]
  ;(await previewCorners()).forEach((measured, index) => assertCorners(measured, ...duoMasks[index]))
  const initialMasks = await previewCorners()
  await page.click('button[aria-label="Zoom in"]')
  const zoomedMasks = await previewCorners()
  zoomedMasks.forEach((measured, index) => {
    assertCorners(measured, ...duoMasks[index])
    assert.ok(measured.radii[0] > initialMasks[index].radii[0], 'Zoom scales the mask with the artwork')
  })
  await page.click('button[aria-label="Reset zoom"]')

  const pngResponse = await page.evaluate(async id => {
    const response = await fetch(`/api/sets/${id}/areas/duo-3/png`, { method: 'POST' })
    const blob = await response.blob()
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    context.drawImage(bitmap, 0, 0)
    const corner = [...context.getImageData(0, 0, 1, 1).data]
    bitmap.close()
    const view = new DataView(bytes.buffer)
    return { status: response.status, width: view.getUint32(16), height: view.getUint32(20), corner }
  }, duo.id)
  assert.deepEqual(pngResponse, { status: 200, width: 2853, height: 2007, corner: [236, 243, 255, 255] }, 'Service PNG keeps full dimensions and opaque, unmasked artwork corners')
  await page.setViewport({ width: 1800, height: 1000 })
  await page.click('button[aria-label="Zoom out"]')
  await page.click('button[aria-label="Zoom out"]')
  await page.click('button[aria-label="Zoom out"]')
  await page.screenshot({ path: '/tmp/storeshot-duo-workspace.png', fullPage: true })
  const deviceMasks = [
    ['iPad', 'ipad', 2064, 2752, 240, 3],
    ['Apple Watch', 'watch', 422, 514, 214, 38],
    ['Mac', 'mac', 2880, 1800, 215, 3],
    ['Apple TV', 'tv', 3840, 2160, 215, 3],
    ['Apple Vision Pro', 'vision', 3840, 2160, 215, 3],
  ]
  const deviceSetIds = new Map()
  for (const [device, specId, width, height] of deviceMasks) {
    const created = await service.store.createSet({ name: device, device, specId, locale: 'en-US', width, height })
    deviceSetIds.set(specId, created.id)
  }
  await page.reload()
  for (const [device, specId, width, height, referenceHeight, radius] of deviceMasks) {
    await page.waitForFunction(label => [...document.querySelectorAll('[role="tab"]')].some(el => el.textContent.trim().startsWith(label)), {}, device)
    await page.evaluate(label => [...document.querySelectorAll('[role="tab"]')].find(el => el.textContent.trim().startsWith(label)).click(), device)
    await page.waitForFunction(id => {
      const frames = [...document.querySelectorAll('main iframe')]
      return frames.length === 1 && frames[0].getAttribute('src').includes(`/sets/${id}/`)
    }, {}, deviceSetIds.get(specId))
    assertCorners((await previewCorners())[0], referenceHeight, [radius, radius, radius, radius])
  }
  console.log('Passed device masks for iPhone, all Duo orientations, iPad, Watch, Mac, TV, and Vision Pro; zoom scales corners; exports retain opaque rectangular corners.')
  console.log('Passed one Duo strip with mixed display sizes, orientations, and service PNG export.')
  console.log('Passed native SVG/HTML drags, drag timing, frame ownership, scroll tracking, outside dismissal, Escape, and annotation context.')
} finally {
  await browser?.close()
  await service.close()
  await rm(directory, { recursive: true, force: true })
}
