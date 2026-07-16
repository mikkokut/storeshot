import { execFileSync } from "node:child_process"
import { copyFile, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

const sourceRoot = path.resolve(process.argv[2] ?? "/private/tmp/frameup-free")
const outputRoot = path.resolve("src/ui/public/mockup-bundles/frameup-free")
const deviceModule = await import(pathToFileURL(path.join(sourceRoot, "src/lib/devices.ts")).href)
const revision = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()

const appleDevices = deviceModule.devices.filter((device) => (
  /^(iphone|ipad|macbook|imac|pro-display|thunderbolt)/.test(device.id)
))

await mkdir(path.join(outputRoot, "assets"), { recursive: true })

const copiedAssets = new Set()
const mockups = []
for (const device of appleDevices) {
  const sourceAsset = device.assetPath.light.replace(/^\//, "")
  const assetName = path.basename(sourceAsset)
  if (!copiedAssets.has(assetName)) {
    copiedAssets.add(assetName)
    await copyFile(
      path.join(sourceRoot, "public", sourceAsset),
      path.join(outputRoot, "assets", assetName),
    )
  }

  const groupId = deviceGroupId(device)
  const groupName = productName(groupId)
  mockups.push({
    id: device.id,
    groupId,
    groupName,
    name: device.name,
    description: mockupDescription(device, groupName),
    platform: platformFor(device.category),
    style: "standard",
    frame: `assets/${assetName}`,
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

const manifest = {
  format: "storeshot-mockup-bundle",
  version: 1,
  id: "frameup-free",
  name: "FrameUp Free",
  author: "9OneFour",
  license: {
    name: "MIT",
    url: "https://github.com/amirmun99/FrameUp-Free/blob/main/LICENSE",
    file: "LICENSE",
  },
  source: {
    name: "amirmun99/FrameUp-Free",
    url: "https://github.com/amirmun99/FrameUp-Free",
    revision,
  },
  mockups,
}

await Promise.all([
  writeFile(path.join(outputRoot, "storeshot-mockups.json"), `${JSON.stringify(manifest, null, 2)}\n`),
  copyFile(path.join(sourceRoot, "LICENSE"), path.join(outputRoot, "LICENSE")),
  writeFile(path.join(outputRoot, "README.md"), `# FrameUp Free mockup bundle

Apple device frame assets and screen geometry imported from
[amirmun99/FrameUp-Free](https://github.com/amirmun99/FrameUp-Free) at revision
\`${revision}\`.

FrameUp Free is Copyright (c) 2026 9OneFour and is distributed under the MIT
License. The complete license is included in [LICENSE](./LICENSE).

The bundle uses StoreShot's portable folder format. Its
\`storeshot-mockups.json\` manifest contains the frame path and exact rectangular
screen geometry for every mockup.
`),
])

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
