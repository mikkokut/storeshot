export interface ZipFile {
  data: Blob
  name: string
}

export async function createZipArchive(files: ZipFile[]): Promise<Blob> {
  const localParts: BlobPart[] = []
  const centralParts: BlobPart[] = []
  let offset = 0

  for (const file of files) {
    const data = new Uint8Array(await file.data.arrayBuffer())
    const name = new TextEncoder().encode(file.name)
    const checksum = crc32(data)
    const { date, time } = dosDateTime(new Date())
    const localHeader = zipHeader(30)
    const localView = new DataView(localHeader.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0x0800, true)
    localView.setUint16(8, 0, true)
    localView.setUint16(10, time, true)
    localView.setUint16(12, date, true)
    localView.setUint32(14, checksum, true)
    localView.setUint32(18, data.byteLength, true)
    localView.setUint32(22, data.byteLength, true)
    localView.setUint16(26, name.byteLength, true)
    localParts.push(localHeader, name, data)

    const centralHeader = zipHeader(46)
    const centralView = new DataView(centralHeader.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, time, true)
    centralView.setUint16(14, date, true)
    centralView.setUint32(16, checksum, true)
    centralView.setUint32(20, data.byteLength, true)
    centralView.setUint32(24, data.byteLength, true)
    centralView.setUint16(28, name.byteLength, true)
    centralView.setUint32(42, offset, true)
    centralParts.push(centralHeader, name)

    offset += localHeader.byteLength + name.byteLength + data.byteLength
  }

  const centralSize = centralParts.reduce((size, part) => size + blobPartSize(part), 0)
  const end = zipHeader(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, files.length, true)
  endView.setUint16(10, files.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)

  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" })
}

export function safeFileNamePart(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || fallback
}

function zipHeader(size: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(size)
}

function blobPartSize(part: BlobPart): number {
  if (typeof part === "string") return new TextEncoder().encode(part).byteLength
  if (part instanceof Blob) return part.size
  return part.byteLength
}

function dosDateTime(value: Date): { date: number; time: number } {
  const year = Math.max(1980, value.getFullYear())
  return {
    date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
    time: (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2),
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let index = 0; index < 8; index += 1) crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  return crc >>> 0
})

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const value of data) crc = CRC_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
