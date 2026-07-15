import path from "node:path"
import { fileURLToPath } from "node:url"

import { Command, Option } from "commander"
import open from "open"

import { startServer } from "./server.js"

const sourceFile = fileURLToPath(import.meta.url)
const packageRoot = path.resolve(path.dirname(sourceFile), "..")
const isSourceExecution = path.extname(sourceFile) === ".ts"

const program = new Command()
  .name("appshot")
  .description("Manage app store screenshots locally")
  .version("0.0.1")

program
  .command("dev")
  .description("Open an Appshot workspace for a local directory")
  .argument("[directory]", "project directory", ".")
  .addOption(new Option("-p, --port <port>", "local server port").default("4173"))
  .addOption(new Option("--host <host>", "local server host").default("127.0.0.1"))
  .option("--no-open", "do not open a browser")
  .action(async (directory: string, options: { port: string; host: string; open: boolean }) => {
    const port = Number(options.port)
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error("Port must be an integer between 1 and 65535")
    }

    const projectDirectory = path.resolve(directory)
    const service = await startServer({
      host: options.host,
      port,
      packageRoot,
      projectDirectory,
      useVite: isSourceExecution,
    })
    const url = `http://${options.host}:${port}`

    console.log(`\n  Appshot is ready at ${url}`)
    console.log(`  Project: ${service.store.root}\n`)

    if (options.open) await open(url)

    const shutdown = async () => {
      await service.close()
      process.exit(0)
    }
    process.once("SIGINT", shutdown)
    process.once("SIGTERM", shutdown)
  })

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`appshot: ${message}`)
  process.exitCode = 1
})
