import { exportPath, readinessIssues } from "../app-store"
import type { ScreenshotSet, StoreShotProject } from "../shared"
import { createZipArchive, safeFileNamePart, type ZipFile } from "./zip"

async function collectionFiles(set: ScreenshotSet): Promise<ZipFile[]> {
  const files: ZipFile[] = []
  for (const [index, area] of set.areas.entries()) {
    const response = await fetch(`/api/sets/${set.id}/areas/${area.id}/png`, {
      method: "POST",
    })
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      throw new Error(error.error ?? `Export failed (${response.status})`)
    }
    files.push({
      data: await response.blob(),
      name: `${exportPath(set)}/${String(index + 1).padStart(2, "0")}-${safeFileNamePart(area.name, "image")}.png`,
    })
  }
  return files
}
async function download(files: ZipFile[], name: string): Promise<void> {
  const url = URL.createObjectURL(await createZipArchive(files))
  const link = document.createElement("a")
  link.href = url
  link.download = `${safeFileNamePart(name, "app-store-assets")}.zip`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function exportCollections(
  project: StoreShotProject,
  sets: ScreenshotSet[],
): Promise<void> {
  const files: ZipFile[] = []
  for (const set of sets) files.push(...(await collectionFiles(set)))
  const pageIds = new Set(sets.map((set) => set.pageId))
  const manifest = {
    store: "app-store",
    scale: 1,
    pages: project.config.pages.filter((page) => pageIds.has(page.id)),
    issues: readinessIssues(project.config, project.sets).filter(
      (issue) => issue.pageId && pageIds.has(issue.pageId),
    ),
    collections: sets.map((set) => ({
      id: set.id,
      pageId: set.pageId,
      locale: set.locale,
      specification: set.specId,
      canvas: set.canvas,
      directory: exportPath(set),
    })),
  }
  files.push({
    name: "manifest.json",
    data: new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json",
    }),
  })
  await download(files, `${project.directory.split(/[\\/]/).pop()}-app-store`)
}
