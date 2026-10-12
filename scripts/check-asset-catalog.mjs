import { readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadAssetCatalog } from "../src/asset-catalog.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const assets = await loadAssetCatalog(root)
const referenced = new Set(assets.flatMap(asset => [asset.file, asset.license.file]))
async function checkFiles(relative) {
  for (const entry of await readdir(path.join(root, "catalog", relative), { withFileTypes: true })) {
    const file = `${relative}/${entry.name}`
    if (entry.isSymbolicLink()) throw new Error(`Catalog cannot contain symbolic links: ${file}`)
    if (entry.isDirectory()) await checkFiles(file)
    else if (!referenced.has(file)) throw new Error(`Unreferenced catalog file: ${file}`)
  }
}
await checkFiles("files")
await checkFiles("licenses")
console.log(`Validated ${assets.length} catalog assets, their geometry, image dimensions, and licenses.`)
