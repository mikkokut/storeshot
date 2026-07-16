import type { DetectedScreenshotDeviceType } from "./shared.js"

export interface ImageMetadata {
  width: number
  height: number
}

export function readImageMetadata(contents: Buffer): ImageMetadata | undefined {
  return readPngMetadata(contents) ?? readJpegMetadata(contents) ?? readWebpMetadata(contents) ?? readSvgMetadata(contents)
}

function readSvgMetadata(contents: Buffer): ImageMetadata | undefined {
  const source = contents.subarray(0, 64 * 1024).toString("utf8")
  const svg = source.match(/<svg\b[^>]*>/i)?.[0]
  if (!svg) return undefined

  const width = readSvgLength(svg, "width")
  const height = readSvgLength(svg, "height")
  if (width && height) return validDimensions(width, height)

  const viewBox = svg.match(/\bviewBox\s*=\s*["']\s*([-+\d.e]+)[\s,]+([-+\d.e]+)[\s,]+([-+\d.e]+)[\s,]+([-+\d.e]+)\s*["']/i)
  if (!viewBox) return undefined
  return validDimensions(Number(viewBox[3]), Number(viewBox[4]))
}

function readSvgLength(svg: string, attribute: "height" | "width"): number | undefined {
  const match = svg.match(new RegExp(`\\b${attribute}\\s*=\\s*["']\\s*([-+\\d.e]+)`, "i"))
  const value = match ? Number(match[1]) : NaN
  return Number.isFinite(value) && value > 0 ? value : undefined
}

export function detectScreenshotDeviceType(width: number, height: number): DetectedScreenshotDeviceType {
  const shortSide = Math.min(width, height)
  const longSide = Math.max(width, height)
  const ratio = longSide / shortSide
  const dimensions = `${shortSide}x${longSide}`

  if (WATCH_SCREENSHOT_DIMENSIONS.has(dimensions)) return "watch"
  if (IPAD_SCREENSHOT_DIMENSIONS.has(dimensions)) return "ipad"
  if (IPHONE_SCREENSHOT_DIMENSIONS.has(dimensions) && (height > width || longSide >= 2_200)) return "iphone"
  if (longSide <= 700 && ratio <= 1.4) return "watch"
  if (shortSide >= 1_400 && ratio >= 1.25 && ratio <= 1.45) return "ipad"
  if (height > width && ratio >= 1.65) return "iphone"
  if (width > height && ratio >= 1.45) return "mac"
  if (shortSide >= 1_000 && ratio >= 1.25 && ratio <= 1.45) return "ipad"
  return "unknown"
}

const IPHONE_SCREENSHOT_DIMENSIONS = new Set([
  "640x1136", "750x1334", "828x1792", "1080x1920", "1125x2436", "1170x2532",
  "1179x2556", "1206x2622", "1242x2208", "1242x2688", "1284x2778", "1290x2796", "1320x2868",
])
const IPAD_SCREENSHOT_DIMENSIONS = new Set([
  "1536x2048", "1668x2224", "1668x2388", "2048x2732", "2064x2752",
])
const WATCH_SCREENSHOT_DIMENSIONS = new Set([
  "368x448", "396x484", "416x496", "422x514",
])

function readPngMetadata(contents: Buffer): ImageMetadata | undefined {
  if (contents.length < 24 || contents.toString("ascii", 1, 4) !== "PNG") return undefined
  return validDimensions(contents.readUInt32BE(16), contents.readUInt32BE(20))
}

function readJpegMetadata(contents: Buffer): ImageMetadata | undefined {
  if (contents.length < 4 || contents[0] !== 0xff || contents[1] !== 0xd8) return undefined
  let offset = 2
  while (offset + 8 < contents.length) {
    if (contents[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = contents[offset + 1]
    offset += 2
    if (marker === 0xd8 || marker === 0xd9) continue
    if (offset + 2 > contents.length) return undefined
    const length = contents.readUInt16BE(offset)
    if (length < 2 || offset + length > contents.length) return undefined
    if (isJpegStartOfFrame(marker) && length >= 7) {
      return validDimensions(contents.readUInt16BE(offset + 5), contents.readUInt16BE(offset + 3))
    }
    offset += length
  }
  return undefined
}

function isJpegStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
}

function readWebpMetadata(contents: Buffer): ImageMetadata | undefined {
  if (contents.length < 30 || contents.toString("ascii", 0, 4) !== "RIFF" || contents.toString("ascii", 8, 12) !== "WEBP") return undefined
  const type = contents.toString("ascii", 12, 16)
  if (type === "VP8X") {
    return validDimensions(readUInt24LE(contents, 24) + 1, readUInt24LE(contents, 27) + 1)
  }
  if (type === "VP8 " && contents.length >= 30 && contents[23] === 0x9d && contents[24] === 0x01 && contents[25] === 0x2a) {
    return validDimensions(contents.readUInt16LE(26) & 0x3fff, contents.readUInt16LE(28) & 0x3fff)
  }
  if (type === "VP8L" && contents.length >= 25 && contents[20] === 0x2f) {
    const bits = contents.readUInt32LE(21)
    return validDimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1)
  }
  return undefined
}

function readUInt24LE(contents: Buffer, offset: number): number {
  return contents[offset] | (contents[offset + 1] << 8) | (contents[offset + 2] << 16)
}

function validDimensions(width: number, height: number): ImageMetadata | undefined {
  return width > 0 && height > 0 ? { width, height } : undefined
}
