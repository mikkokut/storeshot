import { access, readFile } from "node:fs/promises"
import path from "node:path"
import { Command, Option } from "commander"
import { CATALOG_KINDS, safeAssetPath, type CatalogKind, type CatalogAsset } from "./asset-catalog-types.js"
import { loadAssetCatalog, readCatalogFile, searchAssetCatalog, scanLocalAssetFiles, catalogInstallation } from "./asset-catalog.js"
import { ProjectStore } from "./project-store.js"
import { readImageMetadata } from "./image-metadata.js"

interface Context {
  packageRoot: string
  projectDirectory: () => string
  openProject: () => Promise<ProjectStore>
  emit: (human: string, json: unknown) => void
}

export function registerAssetCatalogCommands(command: Command, context: Context): void {
  async function localState(required = false) {
    if (required) await context.openProject()
    const store = new ProjectStore(context.projectDirectory())
    try { await access(store.configPath) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && !required) return undefined
      throw error
    }
    const [files, imports] = await Promise.all([scanLocalAssetFiles(store.assetsPath), store.readAssetImports()])
    return { store, files, imports }
  }
  command.command("search")
    .description("Search shipped assets by name, tags, or device; works without a project")
    .argument("[query]", "search words (quote multiple words)")
    .addOption(new Option("--kind <kind>", "asset kind").choices([...CATALOG_KINDS]))
    .addOption(new Option("--platform <platform>", "device platform").choices(["iphone", "ipad", "mac", "watch"]))
    .option("--installed", "only show assets whose current checksum is present locally")
    .action(async (query: string | undefined, options: { kind?: CatalogKind; platform?: string; installed?: boolean }) => {
      const [catalog, local] = await Promise.all([loadAssetCatalog(context.packageRoot), localState(!!options.installed)])
      const assets = searchAssetCatalog(catalog, { query, ...options }).map(asset => ({ ...asset, ...(local ? { installation: catalogInstallation(asset, local.files, local.imports) } : {}) })).filter(asset => !options.installed || asset.installation?.matches.length)
      context.emit(assets.length ? assets.map(asset => `${asset.id}\t${asset.kind}\t${asset.width}x${asset.height}\t${asset.name}${asset.installation?.matches.length ? `\tinstalled: ${asset.installation.matches.join(", ")}` : ""}`).join("\n") : "No matching assets", { ok: true, assets })
    })
  command.command("show")
    .description("Show a shipped asset's dimensions, screen geometry, license, and SHA-256 checksum")
    .argument("<id>", "catalog asset id from asset search")
    .action(async (id: string) => {
      const [catalog, local] = await Promise.all([loadAssetCatalog(context.packageRoot), localState()])
      const asset = requireAsset(catalog, id)
      const result = { ...asset, ...(local ? { installation: catalogInstallation(asset, local.files, local.imports) } : {}) }
      context.emit(JSON.stringify(result, null, 2), { ok: true, asset: result })
    })
  command.command("import")
    .description("Install individual catalog assets, preserving their geometry and license locally")
    .argument("<ids...>", "catalog asset ids")
    .option("--replace", "replace a different file at the default destination")
    .action(async (ids: string[], options: { replace?: boolean }) => {
      const store = await context.openProject()
      const catalog = await loadAssetCatalog(context.packageRoot)
      const selected = [...new Set(ids)].map(id => requireAsset(catalog, id))
      // Resolve every requested asset before making the first project change.
      const inputs = await Promise.all(selected.map(async asset => ({ asset, contents: await readCatalogFile(context.packageRoot, asset.file), license: await readCatalogFile(context.packageRoot, asset.license.file) })))
      const assets = []
      for (const { asset, contents, license } of inputs) assets.push(await store.importCatalogAsset(asset, contents, license, options))
      context.emit(assets.map(asset => `${asset.reused ? "Reused" : asset.replaced ? "Replaced" : "Imported"} ${asset.path}\n  ${asset.checksum}`).join("\n"), { ok: true, assets })
    })
  command.command("inspect")
    .description("Inspect a local file, its catalog matches, and saved import geometry")
    .argument("<path>", "path relative to assets/, such as other/frameup-free-iphone-17-pro.svg")
    .action(async (relative: string) => {
      if (!safeAssetPath(relative)) throw new Error("Invalid local asset path")
      const local = (await localState(true))!
      const file = local.files.find(file => file.path === relative)
      if (!file) throw new Error(`Local asset not found: ${relative}`)
      const catalog = await loadAssetCatalog(context.packageRoot)
      const imports = local.imports.filter(entry => entry.asset.checksum === file.checksum || entry.paths.includes(relative)).map(entry => ({ ...entry, modified: entry.asset.checksum !== file.checksum }))
      const asset = { ...file, ...readImageMetadata(await readFile(path.join(local.store.assetsPath, relative))), catalogMatches: catalog.filter(asset => asset.checksum === file.checksum), imports }
      context.emit(JSON.stringify(asset, null, 2), { ok: true, asset })
    })
  command.command("installed")
    .description("Identify current, modified, missing, and previously imported asset versions")
    .action(async () => {
      const local = (await localState(true))!
      const catalog = await loadAssetCatalog(context.packageRoot)
      const assets = catalog.map(asset => ({ ...asset, installation: catalogInstallation(asset, local.files, local.imports) })).filter(asset => asset.installation.matches.length || local.imports.some(entry => entry.asset.id === asset.id))
      const imports = local.imports.map(entry => ({ ...entry, currentCatalogChecksum: catalog.find(asset => asset.id === entry.asset.id)?.checksum, installation: catalogInstallation(entry.asset, local.files, local.imports) }))
      const human = [
        ...assets.map(asset => `${asset.id}\t${asset.installation.matches.length ? "installed" : "current version absent"}\t${asset.installation.matches.join(", ")}`),
        ...imports.flatMap(entry => [
          ...entry.installation.modified.map(p => `Modified: ${p} (${entry.asset.id})`),
          ...entry.installation.missing.map(p => `Missing original path: ${p} (${entry.asset.id})`),
          ...(entry.currentCatalogChecksum !== entry.asset.checksum && entry.installation.matches.length ? [`Previous catalog version: ${entry.asset.id}\t${entry.installation.matches.join(", ")}`] : []),
        ]),
      ].join("\n")
      context.emit(human || "No catalog assets installed", { ok: true, assets, imports })
    })
}
function requireAsset(catalog: CatalogAsset[], id: string): CatalogAsset {
  const asset = catalog.find(asset => asset.id === id)
  if (!asset) throw new Error(`Unknown catalog asset: ${id}; use asset search`)
  return asset
}
