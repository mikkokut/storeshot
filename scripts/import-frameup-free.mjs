import { execFileSync } from "node:child_process"
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

const sourceRoot = path.resolve(process.argv[2] ?? "/private/tmp/frameup-free")
const outputRoot = path.resolve("catalog")
const deviceModule = await import(pathToFileURL(path.join(sourceRoot, "src/lib/devices.ts")).href)
const revision = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()

const appleDevices = deviceModule.devices.filter((device) => (
  /^(iphone|ipad|macbook|imac|pro-display|thunderbolt)/.test(device.id)
))

await mkdir(path.join(outputRoot, "files/frameup-free"), { recursive: true })

const copiedAssets = new Set()
const mockups = []
for (const device of appleDevices) {
  const sourceAsset = device.assetPath.light.replace(/^\//, "")
  const assetName = path.basename(sourceAsset)
  if (!copiedAssets.has(assetName)) {
    copiedAssets.add(assetName)
    await copyFile(
      path.join(sourceRoot, "public", sourceAsset),
      path.join(outputRoot, "files/frameup-free", assetName),
    )
  }

  const groupId = deviceGroupId(device)
  const groupName = productName(groupId)
  mockups.push({
    id: `frameup-free-${device.id}`,
    kind: "mockup",
    tags: [groupId, groupName],
    name: device.name,
    description: mockupDescription(device, groupName),
    platform: platformFor(device.category),
    style: "standard",
    file: `files/frameup-free/${assetName}`,
    width: device.width,
    height: device.height,
    screen: {
      kind: "rect",
      x: device.screenBounds.x,
      y: device.screenBounds.y,
      width: device.screenBounds.width,
      height: device.screenBounds.height,
      cornerRadius: device.cornerRadius,
    },
  })
}

const catalogPath = path.join(outputRoot, "catalog.json")
const catalog = JSON.parse(await readFile(catalogPath, "utf8"))
const entries = mockups.map(asset => ({
  ...asset,
  author: "9OneFour",
  license: { name: "MIT", url: "https://github.com/amirmun99/FrameUp-Free/blob/main/LICENSE", file: "licenses/frameup-free.txt" },
  source: { name: "amirmun99/FrameUp-Free", url: "https://github.com/amirmun99/FrameUp-Free", revision },
}))
catalog.assets = [...catalog.assets.filter(asset => !asset.id.startsWith("frameup-free-")), ...entries]
await mkdir(path.join(outputRoot, "licenses"), { recursive: true })
await copyFile(path.join(sourceRoot, "LICENSE"), path.join(outputRoot, "licenses/frameup-free.txt"))
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`)

console.log(`Imported ${mockups.length} Apple mockups and ${copiedAssets.size} assets from FrameUp Free.`)

function platformFor(category) {
  if (category === "phone") return "iphone"
  if (category === "tablet") return "ipad"
  return "mac"
}

function deviceGroupId(device) {
  if (device.noCutoutOf) return device.noCutoutOf
  const patterns = [
    "iphone-17-pro-max", "iphone-17-pro", "iphone-16-pro-max", "iphone-16-pro",
    "iphone-15-pro-max", "iphone-15-pro", "iphone-14-pro-max", "iphone-14-pro",
    "iphone-13-pro-max", "iphone-13-pro", "iphone-11-pro-max", "iphone-11-pro",
    "iphone-11", "iphone-xs-max", "iphone-xs", "iphone-xr", "iphone-x",
    "iphone-8-plus", "iphone-8", "iphone-7-plus", "iphone-7", "iphone-6s-plus",
    "iphone-6s", "iphone-5s", "iphone-5c", "iphone-se",
    "ipad-pro-13", "ipad-pro-11", "ipad-air", "ipad-mini", "ipad",
    "macbook-pro-15", "macbook-pro-13", "macbook-air-13", "macbook",
    "imac-retina", "imac-pro", "imac", "pro-display-xdr", "thunderbolt-display",
  ]
  return patterns.find((pattern) => device.id === pattern || device.id.startsWith(`${pattern}-`)) ?? device.id
}

function productName(id) {
  return id
    .split("-")
    .map((part) => ({
      iphone: "iPhone",
      ipad: "iPad",
      macbook: "MacBook",
      imac: "iMac",
      se: "SE",
      x: "X",
      xr: "XR",
      xs: "XS",
      xdr: "XDR",
    })[part] ?? (part.length <= 3 && /^[0-9]+$/.test(part) ? part : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join(" ")
}

function mockupDescription(device, groupName) {
  if (device.noCutoutOf) return "No cutout"
  const suffix = device.name.startsWith(groupName) ? device.name.slice(groupName.length).trim() : ""
  return suffix || "Standard"
}
