import { createHash } from "node:crypto"
import { readArtboardResource } from "./artboard-files.js"
import type { StoreShotProject } from "./shared.js"

/** Content revisions include only resources used by each artboard, never project metadata. */
export async function addPreviewRevisions(project: StoreShotProject): Promise<void> {
  const assets = new Map(Object.values(project.assets).flat().map(asset => [`assets/${asset.id}`, asset.checksum]))
  const resources = new Map<string, Promise<{ checksum: string; text?: string }>>()
  function resource(relative: string) {
    let pending = resources.get(relative)
    if (!pending) {
      pending = (async () => {
        const checksum = assets.get(relative)
        if (checksum && !/\.(css|svg|html)$/i.test(relative)) return { checksum }
        try {
          const file = await readArtboardResource(project.directory, relative)
          return { checksum: checksum ?? digest(file.body), text: /\.(css|svg|html)$/i.test(relative) ? file.body.toString("utf8") : undefined }
        } catch {
          return { checksum: "missing" }
        }
      })()
      resources.set(relative, pending)
    }
    return pending
  }
  await Promise.all(project.sets.flatMap(set => set.areas.map(async area => {
    const dependencies = new Map<string, string>()
    async function visit(text: string, base: string): Promise<void> {
      for (const reference of localReferences(text)) {
        let relative: string
        try {
          const url = new URL(reference, `http://storeshot.local/artboards/${base}`)
          if (url.origin !== "http://storeshot.local" || !url.pathname.startsWith("/artboards/")) continue
          relative = decodeURIComponent(url.pathname.slice("/artboards/".length))
        } catch { continue }
        if (dependencies.has(relative)) continue
        dependencies.set(relative, "pending")
        const value = await resource(relative)
        dependencies.set(relative, value.checksum)
        if (value.text) await visit(value.text, relative)
      }
    }
    await visit(area.html, `sets/${set.id}/${area.id}.html`)
    area.previewRevision = digest(JSON.stringify([area.html, set.canvas, [...dependencies].sort(([a], [b]) => a.localeCompare(b))]))
  })))
}

function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20)
}

function localReferences(text: string): string[] {
  const references: string[] = []
  const attributes = /\b(?:src|href|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
  const css = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)|@import\s+(?:"([^"]*)"|'([^']*)')/gi
  const srcsets = /\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
  for (const pattern of [attributes, css]) {
    for (const match of text.matchAll(pattern)) references.push(match.slice(1).find(value => value !== undefined) ?? "")
  }
  for (const match of text.matchAll(srcsets)) {
    for (const candidate of (match[1] ?? match[2]).split(",")) references.push(candidate.trim().split(/\s+/)[0])
  }
  return references.map(reference => reference.replaceAll("&amp;", "&")).filter(reference => reference && !reference.startsWith("#") && !/^(?:data|https?):/i.test(reference))
}
