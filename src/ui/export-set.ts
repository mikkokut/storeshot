import type { Asset, ScreenshotSet } from "../shared"
import type { DeviceMockup } from "../device-mockups"
import { renderScreenshotArea } from "./canvas-renderer"
import { createZipArchive, safeFileNamePart, type ZipFile } from "./zip"

export interface ExportProgress {
  completed: number
  total: number
}

export async function exportScreenshotSet(
  set: ScreenshotSet,
  assetLookup: Map<string, Asset>,
  mockupLookup: Map<string, DeviceMockup>,
  onProgress?: (progress: ExportProgress) => void,
): Promise<void> {
  const files: ZipFile[] = []

  for (const [index, area] of set.areas.entries()) {
    const data = await renderScreenshotArea(area, assetLookup, mockupLookup, set.canvas)
    files.push({
      data,
      name: `${String(index + 1).padStart(2, "0")}-${safeFileNamePart(area.name, `screenshot-${index + 1}`)}.png`,
    })
    onProgress?.({ completed: index + 1, total: set.areas.length })
  }

  const archive = await createZipArchive(files)
  downloadBlob(archive, `${safeFileNamePart(set.name, "screenshot-set")}.zip`)
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
