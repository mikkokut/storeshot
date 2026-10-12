import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const root = fileURLToPath(new URL("../", import.meta.url))
const skillDirectory = ".agents/skills/storeshot"
const npmCli = process.env.npm_execpath
assert.ok(npmCli, "Run this check with npm run check:package.")

const { stdout } = await promisify(execFile)(
  process.execPath,
  [npmCli, "pack", "--dry-run", "--json", "--ignore-scripts"],
  { cwd: root, maxBuffer: 10 * 1024 * 1024 },
)
const packResult = JSON.parse(stdout)
const packed = Array.isArray(packResult) ? packResult[0] : Object.values(packResult)[0]
const packedFiles = new Set(packed.files.map((file) => file.path))

async function listFiles(directory) {
  const files = []
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const relativePath = `${directory}/${entry.name}`
    if (entry.isDirectory()) {
      files.push(...await listFiles(relativePath))
    } else {
      assert.ok(entry.isFile(), `Skill must contain regular files: ${relativePath}`)
      files.push(relativePath)
    }
  }
  return files
}

const skillFiles = await listFiles(skillDirectory)
assert.ok(skillFiles.includes(`${skillDirectory}/SKILL.md`), "Skill entry point is missing.")
for (const file of [...skillFiles, "dist/cli.js", "dist/ui/index.html"]) {
  assert.ok(packedFiles.has(file), `Missing from npm package: ${file}`)
}
for (const file of packedFiles) {
  assert.ok(
    !file.startsWith(".agents/") || file.startsWith(`${skillDirectory}/`),
    `Unexpected agent configuration in npm package: ${file}`,
  )
}

console.log(`Package includes CLI, UI, and all ${skillFiles.length} skill files.`)
