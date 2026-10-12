import assert from "node:assert/strict"
import { execFile, spawn } from "node:child_process"
import { once } from "node:events"
import { createServer, type AddressInfo } from "node:net"
import { mkdtemp, readFile, rename, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { ProjectStore } from "../src/project-store.js"
import { promisify } from "node:util"
import test from "node:test"

test("CLI dev prints reachable workspace URLs for IPv4 and IPv6", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-cli-host-"))
  try {
    for (const host of ["127.0.0.1", "::1"]) {
      const reservation = createServer()
      reservation.listen(0, host)
      await once(reservation, "listening")
      const port = (reservation.address() as AddressInfo).port
      await new Promise<void>((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()))
      const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", "dev", directory, "--host", host, "--port", String(port), "--no-open", "--json"], { stdio: ["ignore", "pipe", "pipe"] })
      const exited = once(child, "exit")
      let stderr = ""
      child.stderr.on("data", (chunk) => { stderr += chunk })
      try {
        const output = await new Promise<{ url: string }>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error(`CLI startup timed out: ${stderr}`)), 15_000)
          let stdout = ""
          child.stdout.on("data", (chunk) => {
            stdout += chunk
            const line = stdout.split("\n").find((line) => line.startsWith('{"ok":true,'))
            if (line) { clearTimeout(timeout); resolve(JSON.parse(line)) }
          })
          child.once("error", (error) => { clearTimeout(timeout); reject(error) })
          child.once("exit", () => { clearTimeout(timeout); reject(new Error(`CLI exited before startup: ${stderr}`)) })
        })
        assert.equal(output.url, `http://${host === "::1" ? "[::1]" : host}:${port}`)
        assert.equal((await fetch(`${output.url}/api/project`)).status, 200)
      } finally {
        child.kill("SIGTERM")
        await exited
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("CLI validates a selected page and rejects unknown pages with JSON and a failing exit status", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-cli-validation-"))
  try {
    const store = new ProjectStore(directory)
    await store.initialize()
    const page = await store.createPage({ name: "Empty draft" })
    const run = (id: string) => promisify(execFile)(process.execPath, ["--import", "tsx", "src/cli.ts", "-C", directory, "validate", "--page", id, "--strict", "--json"])
    const { stdout } = await run(page.id)
    assert.equal(JSON.parse(stdout).pageId, page.id)
    await assert.rejects(run("missing"), (error: unknown) => {
      const result = error as { code: number; stdout: string }
      assert.equal(result.code, 1)
      assert.equal(JSON.parse(result.stdout).ok, false)
      return true
    })
  } finally { await rm(directory, { recursive: true, force: true }) }
})

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

test("CLI argument errors remain machine-readable with --json", async () => {
  for (const args of [
    ["unknown", "--json"],
    ["set", "create", "--json"],
    ["--json", "asset", "search", "--kind", "invalid"],
    ["status", "--invalid", "--json"],
  ]) {
    await assert.rejects(promisify(execFile)(process.execPath, ["--import", "tsx", "src/cli.ts", ...args]), (error: unknown) => {
      const result = error as { code: number; stdout: string; stderr: string }
      assert.equal(result.code, 1)
      assert.equal(result.stdout, "")
      const failure = JSON.parse(result.stderr)
      assert.equal(failure.ok, false)
      assert.match(failure.error.message, /error:/)
      return true
    })
  }
})


test("CLI reports folder manifests and loads renamed set folders", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "storeshot-cli-layout-"))
  try {
    const store = new ProjectStore(directory)
    await store.initialize()
    const set = await store.createSet({ name: "CLI", locale: "en-US", device: "Phone", width: 400, height: 800 })
    await rename(path.join(store.setsPath, set.id), path.join(store.setsPath, "renamed"))
    const command = async (...args: string[]) => {
      const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", "src/cli.ts", "-C", directory, ...args, "--json"])
      return JSON.parse(stdout)
    }
    const shown = await command("set", "show", "renamed")
    assert.equal(shown.path, path.join(store.setsPath, "renamed", "index.json"))
    assert.equal(shown.set.id, "renamed")
    assert.equal(shown.set.areas[0].html, set.areas[0].html)
    const status = await command("status")
    assert.equal(status.sets[0].path, shown.path)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
