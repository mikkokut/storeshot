import { constants } from "node:fs"
import { access, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { Command, Option } from "commander"
import open from "open"

import { ASSET_CATEGORIES, SCREENSHOT_DEVICE_TYPES, type AssetCategory, type ScreenshotDeviceType, type ScreenshotSet } from "./shared.js"
import { CONFIG_FILENAME, ProjectStore, parseScreenshotSet } from "./project-store.js"
import { startServer } from "./server.js"
import { validateProject, type ValidationReport } from "./validation.js"

const sourceFile = fileURLToPath(import.meta.url)
const packageRoot = path.resolve(path.dirname(sourceFile), "..")
const isSourceExecution = path.extname(sourceFile) === ".ts"

const DEVICE_PRESETS = {
  iphone: { device: "iPhone", width: 1320, height: 2868 },
  ipad: { device: "iPad", width: 2064, height: 2752 },
  watch: { device: "Apple Watch", width: 422, height: 514 },
  mac: { device: "Mac", width: 2880, height: 1800 },
} as const

interface GlobalOptions {
  json: boolean
  project: string
}

export function createCli(): Command {
  const program = new Command()
    .name("storeshot")
    .description("Manage app store screenshots locally")
    .version("0.1.0")
    .option("-C, --project <directory>", "project directory", ".")
    .option("--json", "write machine-readable JSON")
    .showSuggestionAfterError()
    .addHelpText("after", `
Agent workflow:
  storeshot -C ./screenshots status --json
  storeshot -C ./screenshots validate --json
  storeshot -C ./screenshots set show <id>
  storeshot -C ./screenshots render --set <id> --scale 0.25 --json

Complex canvas edits can be written as complete set JSON documents with
"set write", or edited directly in sets/ and checked with "validate".`)

  program
    .command("init")
    .description("Initialize a StoreShot project")
    .argument("[directory]", "project directory")
    .option("--app-name <name>", "application name")
    .option("--platform <platform...>", "ios, android, or both")
    .action(async (directory: string | undefined, options: { appName?: string; platform?: string[] }) => {
      const target = path.resolve(directory ?? projectDirectory(program))
      const configPath = path.join(target, CONFIG_FILENAME)
      const created = !await fileExists(configPath)
      const store = new ProjectStore(target)
      await store.initialize()
      const current = await store.readConfig()
      const platforms = options.platform ? parsePlatforms(options.platform) : current.platforms
      const config = options.appName || options.platform
        ? await store.writeConfig({ ...current, appName: options.appName ?? current.appName, platforms })
        : current
      emit(program, `Initialized ${store.root}\nConfig: ${store.configPath}`, { ok: true, created, directory: store.root, config })
    })

  program
    .command("status")
    .alias("inspect")
    .description("Summarize the project for a human or agent")
    .action(async () => {
      const store = await openProject(program)
      const project = await store.readProject()
      const assets = Object.values(project.assets).flat()
      const value = {
        ok: true,
        project: {
          directory: project.directory,
          configPath: store.configPath,
          appName: project.config.appName,
          platforms: project.config.platforms,
        },
        summary: {
          assets: assets.length,
          screenshots: project.assets.screenshots.length,
          sets: project.sets.length,
          areas: project.sets.reduce((total, set) => total + set.areas.length, 0),
        },
        sets: project.sets.map((set) => ({
          id: set.id,
          name: set.name,
          locale: set.locale,
          device: set.device,
          canvas: set.canvas,
          areas: set.areas.length,
          path: path.join(store.setsPath, `${set.id}.json`),
        })),
      }
      const lines = [
        `${project.config.appName} — ${project.directory}`,
        `${value.summary.sets} sets, ${value.summary.areas} screenshots, ${value.summary.assets} assets`,
        ...value.sets.map((set) => `  ${set.id}  ${set.locale} · ${set.device} · ${set.areas} screenshots`),
      ]
      emit(program, lines.join("\n"), value)
    })

  program
    .command("validate")
    .description("Validate project files and cross-references")
    .option("--strict", "treat warnings as failures")
    .action(async (options: { strict?: boolean }) => {
      const validation = await validateProject(projectDirectory(program), packageRoot)
      const failed = !validation.report.ok || Boolean(options.strict && validation.report.warnings.length > 0)
      emit(program, formatValidation(validation.report), { ...validation.report, ok: !failed })
      if (failed) process.exitCode = 1
    })

  program
    .command("render")
    .description("Render screenshot sets to PNG files")
    .option("--set <id>", "render one set (repeatable)", collect, [])
    .option("--area <id-or-number>", "render one area by id, exact name, or 1-based number")
    .option("-o, --output <directory>", "output directory (default: <project>/renders)")
    .option("--scale <scale>", "render scale from 0 to 1", "1")
    .option("--clean", "remove each selected set's existing output directory first")
    .action(async (options: { set: string[]; area?: string; output?: string; scale: string; clean?: boolean }) => {
      const directory = projectDirectory(program)
      const validation = await validateProject(directory, packageRoot)
      if (!validation.report.ok || !validation.assets) {
        emit(program, formatValidation(validation.report), { ...validation.report, ok: false })
        process.exitCode = 1
        return
      }
      const selectedSets = options.set.length === 0
        ? validation.sets
        : options.set.map((id) => {
          const set = validation.sets.find((candidate) => candidate.id === id)
          if (!set) throw new Error(`Unknown set id: ${id}`)
          return set
        })
      if (selectedSets.length === 0) throw new Error("The project has no screenshot sets to render")
      const scale = parseNumber(options.scale, "Scale")
      const store = await openProject(program)
      const { renderScreenshotSets } = await import("./node-renderer.js")
      const result = await renderScreenshotSets({
        clean: Boolean(options.clean),
        outputDirectory: path.resolve(options.output ?? path.join(directory, "renders")),
        packageRoot,
        scale,
        sets: selectedSets,
        store,
        ...(options.area ? { area: options.area } : {}),
      })
      emit(
        program,
        [`Rendered ${result.files.length} PNG file${result.files.length === 1 ? "" : "s"} to ${result.outputDirectory}`, ...result.files.map((file) => `  ${file.path}`)].join("\n"),
        { ok: true, render: result, warnings: validation.report.warnings },
      )
    })

  configureConfigCommands(program)
  configureSetCommands(program)
  configureAssetCommands(program)
  configureDevCommand(program)
  return program
}

function configureConfigCommands(program: Command): void {
  const config = program.command("config").description("Inspect or update storeshot.json")

  config.command("get").description("Print the project configuration").action(async () => {
    const store = await openProject(program)
    const value = await store.readConfig()
    emitDocument(program, value, { ok: true, config: value })
  })

  config
    .command("set")
    .description("Update project configuration")
    .option("--app-name <name>", "application name")
    .option("--platform <platform...>", "ios, android, or both")
    .action(async (options: { appName?: string; platform?: string[] }) => {
      if (!options.appName && !options.platform) throw new Error("Provide --app-name or --platform")
      const store = await openProject(program)
      const current = await store.readConfig()
      const value = await store.writeConfig({
        ...current,
        appName: options.appName ?? current.appName,
        platforms: options.platform ? parsePlatforms(options.platform) : current.platforms,
      })
      emit(program, `Updated ${store.configPath}`, { ok: true, config: value })
    })
}

function configureSetCommands(program: Command): void {
  const set = program.command("set").alias("sets").description("Create, inspect, edit, duplicate, or delete screenshot sets")

  set.command("list").description("List screenshot sets").action(async () => {
    const store = await openProject(program)
    const sets = await store.listSets()
    emit(
      program,
      sets.length === 0 ? "No screenshot sets" : sets.map((value) => `${value.id}\t${value.locale}\t${value.device}\t${value.name}`).join("\n"),
      { ok: true, sets },
    )
  })

  set.command("show").description("Print one complete set document").argument("<id>", "set id").action(async (id: string) => {
    const store = await openProject(program)
    const value = await store.readSet(id)
    emitDocument(program, value, { ok: true, set: value, path: path.join(store.setsPath, `${id}.json`) })
  })

  set
    .command("create")
    .description("Create a screenshot set")
    .requiredOption("--name <name>", "set name")
    .requiredOption("--locale <locale>", "locale identifier")
    .addOption(new Option("--preset <preset>", "iphone, ipad, watch, or mac").choices(Object.keys(DEVICE_PRESETS)).default("iphone"))
    .option("--device <name>", "device label")
    .option("--width <pixels>", "custom canvas width")
    .option("--height <pixels>", "custom canvas height")
    .action(async (options: { name: string; locale: string; preset: keyof typeof DEVICE_PRESETS; device?: string; width?: string; height?: string }) => {
      if ((options.width && !options.height) || (!options.width && options.height)) throw new Error("Provide both --width and --height")
      const preset = DEVICE_PRESETS[options.preset]
      const store = await openProject(program)
      const value = await store.createSet({
        name: options.name,
        locale: options.locale,
        device: options.device ?? preset.device,
        width: options.width ? parseInteger(options.width, "Canvas width") : preset.width,
        height: options.height ? parseInteger(options.height, "Canvas height") : preset.height,
      })
      emit(program, `Created ${value.id} at ${path.join(store.setsPath, `${value.id}.json`)}`, { ok: true, set: value })
    })

  set
    .command("update")
    .description("Update common set metadata")
    .argument("<id>", "set id")
    .option("--name <name>", "set name")
    .option("--locale <locale>", "locale identifier")
    .option("--device <name>", "device label")
    .action(async (id: string, options: { name?: string; locale?: string; device?: string }) => {
      if (!options.name && !options.locale && !options.device) throw new Error("Provide --name, --locale, or --device")
      const store = await openProject(program)
      const current = await store.readSet(id)
      const value = await store.updateSetMetadata(id, {
        name: options.name ?? current.name,
        locale: options.locale ?? current.locale,
        device: options.device ?? current.device,
      })
      emit(program, `Updated ${id}`, { ok: true, set: value })
    })

  set
    .command("write")
    .description("Replace a complete set document with schema-validated JSON")
    .argument("<id>", "set id")
    .requiredOption("--file <file>", "JSON file, or - for stdin")
    .action(async (id: string, options: { file: string }) => {
      const input = options.file === "-" ? await readStandardInput() : await readFile(path.resolve(options.file), "utf8")
      let document: unknown
      try {
        document = JSON.parse(input)
      } catch {
        throw new Error("Set input must be valid JSON")
      }
      const value = parseScreenshotSet(document)
      if (value.id !== id) throw new Error(`Set input id ${value.id} does not match ${id}`)
      const store = await openProject(program)
      const saved = await store.writeSet(id, value)
      emit(program, `Wrote ${path.join(store.setsPath, `${id}.json`)}`, { ok: true, set: saved })
    })

  set.command("duplicate").description("Duplicate a set with fresh object ids").argument("<id>", "set id").action(async (id: string) => {
    const store = await openProject(program)
    const value = await store.duplicateSet(id)
    emit(program, `Created duplicate ${value.id}`, { ok: true, set: value })
  })

  set
    .command("delete")
    .description("Delete a screenshot set")
    .argument("<id>", "set id")
    .requiredOption("--yes", "confirm deletion")
    .action(async (id: string) => {
      const store = await openProject(program)
      await store.deleteSet(id)
      emit(program, `Deleted ${id}`, { ok: true, deleted: id })
    })
}

function configureAssetCommands(program: Command): void {
  const asset = program.command("asset").alias("assets").description("List, add, classify, or remove project assets")

  asset
    .command("list")
    .description("List project assets")
    .addOption(new Option("--category <category>", "filter by category").choices([...ASSET_CATEGORIES]))
    .action(async (options: { category?: AssetCategory }) => {
      const store = await openProject(program)
      const catalog = await store.listAssets()
      const assets = options.category ? catalog[options.category] : Object.values(catalog).flat()
      emit(
        program,
        assets.length === 0 ? "No assets" : assets.map((value) => `${value.id}\t${value.width ?? "?"}x${value.height ?? "?"}\t${value.size} bytes`).join("\n"),
        { ok: true, assets },
      )
    })

  asset
    .command("add")
    .description("Copy image files into the project asset catalog")
    .argument("<files...>", "image files")
    .addOption(new Option("--category <category>", "asset category").choices([...ASSET_CATEGORIES]).default("screenshots"))
    .option("--replace", "allow replacement of an existing same-name asset")
    .action(async (files: string[], options: { category: AssetCategory; replace?: boolean }) => {
      const store = await openProject(program)
      const added: Array<{ id: string; replaced: boolean }> = []
      for (const source of files) {
        const filename = path.basename(source)
        const target = store.resolveAsset(options.category, filename)
        if (!options.replace && await fileExists(target)) throw new Error(`${options.category}/${filename} already exists; pass --replace to overwrite it`)
        const result = await store.addAsset(options.category, filename, await readFile(path.resolve(source)))
        added.push({ id: `${options.category}/${filename}`, replaced: result.replaced })
      }
      emit(program, added.map((entry) => `${entry.replaced ? "Replaced" : "Added"} ${entry.id}`).join("\n"), { ok: true, assets: added })
    })

  asset
    .command("set-device")
    .description("Override or clear raw screenshot device classification")
    .argument("<id>", "asset id such as screenshots/home.png")
    .argument("<device>", "iphone, ipad, mac, watch, or auto")
    .action(async (id: string, device: ScreenshotDeviceType | "auto") => {
      if (device !== "auto" && !SCREENSHOT_DEVICE_TYPES.includes(device)) throw new Error("Device must be iphone, ipad, mac, watch, or auto")
      const { category, filename } = parseAssetId(id)
      const store = await openProject(program)
      await store.updateAssetMetadata(category, filename, { deviceType: device === "auto" ? null : device })
      emit(program, `Updated ${id}`, { ok: true, assetId: id, deviceType: device === "auto" ? null : device })
    })

  asset
    .command("remove")
    .description("Delete assets that are not referenced by screenshot sets")
    .argument("<ids...>", "asset ids")
    .requiredOption("--yes", "confirm deletion")
    .option("--force", "delete even when a set references the asset")
    .action(async (ids: string[], options: { force?: boolean }) => {
      const store = await openProject(program)
      const sets = await store.listSets()
      for (const id of ids) {
        const references = assetReferences(id, sets)
        if (references.length > 0 && !options.force) throw new Error(`${id} is referenced by ${references.join(", ")}; pass --force to delete it anyway`)
      }
      for (const id of ids) {
        const { category, filename } = parseAssetId(id)
        await store.deleteAsset(category, filename)
      }
      emit(program, ids.map((id) => `Deleted ${id}`).join("\n"), { ok: true, deleted: ids })
    })
}

function configureDevCommand(program: Command): void {
  program
    .command("dev")
    .description("Open a live StoreShot workspace for a local directory")
    .argument("[directory]", "project directory")
    .addOption(new Option("-p, --port <port>", "local server port").default("4173"))
    .addOption(new Option("--host <host>", "local server host").default("127.0.0.1"))
    .option("--no-open", "do not open a browser")
    .action(async (directory: string | undefined, options: { port: string; host: string; open: boolean }) => {
      const port = parseInteger(options.port, "Port")
      if (port > 65_535) throw new Error("Port must be an integer between 1 and 65535")
      const projectDirectory = path.resolve(directory ?? globalOptions(program).project)
      const service = await startServer({ host: options.host, port, packageRoot, projectDirectory, useVite: isSourceExecution })
      const url = `http://${options.host}:${service.port}`
      if (globalOptions(program).json) console.log(JSON.stringify({ ok: true, url, directory: service.store.root }))
      else console.log(`\n  StoreShot is ready at ${url}\n  Project: ${service.store.root}\n  Filesystem changes refresh the preview automatically.\n`)
      if (options.open) await open(url)
      const shutdown = async () => {
        await service.close()
        process.exit(0)
      }
      process.once("SIGINT", shutdown)
      process.once("SIGTERM", shutdown)
    })
}

async function openProject(program: Command): Promise<ProjectStore> {
  const store = new ProjectStore(projectDirectory(program))
  try {
    await access(store.configPath, constants.R_OK)
  } catch {
    throw new Error(`No StoreShot project found at ${store.root}; run storeshot init first`)
  }
  await store.readConfig()
  return store
}

function globalOptions(program: Command): GlobalOptions {
  return program.opts() as GlobalOptions
}

function projectDirectory(program: Command): string {
  return path.resolve(globalOptions(program).project)
}

function emit(program: Command, human: string, json: unknown): void {
  console.log(globalOptions(program).json ? JSON.stringify(json, null, 2) : human)
}

function emitDocument(program: Command, document: unknown, json: unknown): void {
  console.log(JSON.stringify(globalOptions(program).json ? json : document, null, 2))
}

function formatValidation(report: ValidationReport): string {
  const lines = [
    report.ok ? `Valid StoreShot project: ${report.directory}` : `Invalid StoreShot project: ${report.directory}`,
    `${report.summary.sets} sets, ${report.summary.areas} screenshots, ${report.summary.assets} assets`,
  ]
  for (const entry of [...report.errors, ...report.warnings]) {
    lines.push(`${entry.severity === "error" ? "error" : "warning"} [${entry.code}] ${entry.path}: ${entry.message}`)
  }
  return lines.join("\n")
}

function parsePlatforms(values: string[]): Array<"ios" | "android"> {
  const platforms = [...new Set(values.flatMap((value) => value.split(",")).map((value) => value.trim().toLowerCase()))]
  if (platforms.length === 0 || platforms.some((value) => value !== "ios" && value !== "android")) {
    throw new Error("Platforms must be ios, android, or both")
  }
  return platforms as Array<"ios" | "android">
}

function parseInteger(value: string, name: string): number {
  const result = Number(value)
  if (!Number.isInteger(result) || result <= 0) throw new Error(`${name} must be a positive integer`)
  return result
}

function parseNumber(value: string, name: string): number {
  const result = Number(value)
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`)
  return result
}

function parseAssetId(id: string): { category: AssetCategory; filename: string } {
  const separator = id.indexOf("/")
  const category = id.slice(0, separator) as AssetCategory
  const filename = id.slice(separator + 1)
  if (separator < 1 || !ASSET_CATEGORIES.includes(category) || !filename || filename.includes("/")) throw new Error(`Invalid asset id: ${id}`)
  return { category, filename }
}

function assetReferences(assetId: string, sets: ScreenshotSet[]): string[] {
  return sets.flatMap((set) => set.areas.some((area) => area.elements.some((element) =>
    (element.type === "mockup" && element.assetId === assetId)
    || (element.type === "image" && element.source.kind === "asset" && element.source.assetId === assetId),
  )) ? [set.id] : [])
}

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString("utf8")
}

async function fileExists(filename: string): Promise<boolean> {
  return access(filename, constants.F_OK).then(() => true).catch(() => false)
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}

const program = createCli()
program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  if (globalOptions(program).json) console.error(JSON.stringify({ ok: false, error: { message } }, null, 2))
  else console.error(`storeshot: ${message}`)
  process.exitCode = 1
})
