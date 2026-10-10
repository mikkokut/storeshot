import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import type { IncomingMessage, ServerResponse } from "node:http"
import { ProjectStore } from "./project-store.js"
import { ARTBOARD_CSP } from "./html-artboard.js"

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
}

export async function readArtboardResource(root: string, relative: string): Promise<{ body: Buffer; type: string }> {
  let parts = relative.split("/")
  if (!["sets", "assets"].includes(parts[0]) || parts.some((part) => !part || part === "." || part === ".." || part.includes("\\") || part.startsWith("."))) {
    throw new Error("Invalid artboard resource path")
  }
  const type = types[path.extname(relative).toLowerCase()]
  if (!type) throw new Error("Unsupported artboard resource type")
  // Preview/export URLs use the stable area ID even after a descriptive suffix is renamed.
  if (parts.length === 3 && parts[0] === "sets" && path.extname(parts[2]) === ".html") {
    const filename = await new ProjectStore(root).resolveAreaHtmlFile(parts[1], parts[2].slice(0, -5))
    parts = path.relative(root, filename).split(path.sep)
  }
  const boundary = await realpath(root)
  let target = root
  for (const part of parts) {
    target = path.join(target, part)
    if ((await lstat(target)).isSymbolicLink()) throw new Error("Artboard resources cannot be symbolic links")
  }
  const resolved = await realpath(target)
  if (!resolved.startsWith(`${boundary}${path.sep}`) || !(await lstat(resolved)).isFile()) throw new Error("Artboard resource is outside the project")
  return { body: await readFile(resolved), type }
}

export async function serveArtboardResource(request: IncomingMessage, response: ServerResponse, root: string): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://localhost")
  if (!url.pathname.startsWith("/artboards/")) return false
  if (request.method !== "GET") { response.writeHead(405).end(); return true }
  try {
    const { body, type } = await readArtboardResource(root, decodeURIComponent(url.pathname.slice("/artboards/".length)))
    response.writeHead(200, {
      "Content-Type": type, "Content-Length": body.length, "Cache-Control": "no-store",
      "Content-Security-Policy": ARTBOARD_CSP, "X-Content-Type-Options": "nosniff",
      // Sandboxed frames have an opaque origin. Font and CSS-mask loading needs CORS.
      "Access-Control-Allow-Origin": "*",
    }).end(body)
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain" }).end("Artboard resource not found")
  }
  return true
}
