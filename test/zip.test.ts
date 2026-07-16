import assert from "node:assert/strict"
import test from "node:test"

import { createZipArchive, safeFileNamePart } from "../src/ui/zip.js"

test("ZIP export writes standard headers and UTF-8 file names", async () => {
  const archive = await createZipArchive([
    { name: "01-kuva.png", data: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }) },
  ])
  const bytes = new Uint8Array(await archive.arrayBuffer())
  const view = new DataView(bytes.buffer)
  assert.equal(view.getUint32(0, true), 0x04034b50)
  assert.equal(view.getUint32(bytes.byteLength - 22, true), 0x06054b50)
  assert.match(new TextDecoder().decode(bytes), /01-kuva\.png/)
})

test("export file names are normalized and always have a fallback", () => {
  assert.equal(safeFileNamePart("  Näyttö / 1  ", "fallback"), "Naytto-1")
  assert.equal(safeFileNamePart("✨", "fallback"), "fallback")
})
