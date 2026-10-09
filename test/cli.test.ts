import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { promisify } from "node:util"
import test from "node:test"

test("CLI reports the package version", async () => {
  const { version } = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  )
  const { stdout } = await promisify(execFile)(process.execPath, [
    "--import",
    "tsx",
    "src/cli.ts",
    "--version",
  ])
  assert.equal(stdout.trim(), version)
})
