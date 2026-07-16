import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { loadBunnyFont, selectWoffUrls } from "../src/node-fonts.js"

const STYLESHEET = `
/* latin */
@font-face {
  font-family: 'Example Serif';
  font-style: normal;
  font-weight: 700;
  src: url(https://fonts.bunny.net/example/files/example-latin-700-normal.woff2) format('woff2'), url(https://fonts.bunny.net/example/files/example-latin-700-normal.woff) format('woff');
  unicode-range: U+0000-00FF;
}
/* cyrillic */
@font-face {
  font-family: 'Example Serif';
  font-style: normal;
  font-weight: 700;
  src: url(https://fonts.bunny.net/example/files/example-cyrillic-700-normal.woff) format('woff');
  unicode-range: U+0400-045F;
}
`

test("Bunny font loader caches and registers the required WOFF Unicode subsets", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-font-test-"))
  const requested: string[] = []
  const registered: Array<{ filename: string; family: string; weight?: string }> = []
  const fontContents = "test-woff-contents"
  const request = { family: "Example Serif", text: "Hello", weight: 700 as const }
  try {
    await loadBunnyFont(request, {
      cacheDirectory: directory,
      fetch: (async (input) => {
        const url = String(input)
        requested.push(url)
        return new Response(url.includes("/css?") ? STYLESHEET : fontContents)
      }) as typeof fetch,
      register: ((filename: string, face: { family: string; weight?: string }) => {
        registered.push({ filename, family: face.family, weight: face.weight })
      }) as never,
    })

    assert.equal(requested.length, 2)
    assert.match(requested[0], /^https:\/\/fonts\.bunny\.net\/css\?family=Example\+Serif%3A100%2C200%2C300%2C400%2C500%2C600%2C700%2C800%2C900/)
    assert.equal(requested[1], "https://fonts.bunny.net/example/files/example-latin-700-normal.woff")
    assert.equal(await readFile(registered[0].filename, "utf8"), fontContents)
    assert.deepEqual(registered.map(({ family, weight }) => ({ family, weight })), [{ family: "Example Serif", weight: "700" }])

    await loadBunnyFont(request, {
      cacheDirectory: directory,
      fetch: (async (input) => {
        requested.push(String(input))
        return new Response(STYLESHEET)
      }) as typeof fetch,
      register: (() => undefined) as never,
    })
    assert.equal(requested.length, 3, "the stylesheet is refreshed but the cached font is reused")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("Bunny stylesheet selection includes every subset needed by mixed-script text", () => {
  assert.deepEqual(selectWoffUrls(STYLESHEET, {
    family: "Example Serif",
    text: "Hello Привет",
    weight: 700,
  }), [
    "https://fonts.bunny.net/example/files/example-latin-700-normal.woff",
    "https://fonts.bunny.net/example/files/example-cyrillic-700-normal.woff",
  ])
})

test("Bunny stylesheet selection uses the closest available weight", () => {
  const regularOnly = STYLESHEET
    .replaceAll("font-weight: 700", "font-weight: 400")
    .replaceAll("-700-normal", "-400-normal")
  assert.deepEqual(selectWoffUrls(regularOnly, {
    family: "Example Serif",
    text: "Hello",
    weight: 700,
  }), ["https://fonts.bunny.net/example/files/example-latin-400-normal.woff"])
})
