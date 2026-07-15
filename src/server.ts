import { createReadStream } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import path from "node:path"

import type { ViteDevServer } from "vite"

import { AssetNameConflictError, DuplicateAssetError, ProjectStore } from "./project-store.js"
import type { AppshotConfig, AssetCategory, CreateSetInput, ScreenshotSet } from "./shared.js"

const MAX_REQUEST_BYTES = 25 * 1024 * 1024

interface StartServerOptions {
  host: string
  port: number
  packageRoot: string
  projectDirectory: string
  useVite: boolean
}

export async function startServer(options: StartServerOptions) {
  const store = new ProjectStore(options.projectDirectory)
  await store.initialize()

  let vite: ViteDevServer | undefined
  if (options.useVite) {
    const { createServer: createViteServer } = await import("vite")
    vite = await createViteServer({
      configFile: path.join(options.packageRoot, "vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa",
    })
  }

  const server = createServer(async (request, response) => {
    try {
      if (await handleApiRequest(request, response, store)) return
      if (vite) {
        vite.middlewares(request, response)
        return
      }
      await serveBuiltFrontend(request, response, path.join(options.packageRoot, "dist/ui"))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error"
      if (!response.headersSent) sendJson(response, 500, { error: message })
      else response.end()
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(options.port, options.host, resolve)
  })

  return {
    store,
    close: async () => {
      await vite?.close()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  store: ProjectStore,
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://localhost")

  if (request.method === "GET" && url.pathname === "/api/project") {
    sendJson(response, 200, await store.readProject())
    return true
  }

  if (request.method === "PATCH" && url.pathname === "/api/config") {
    const config = await store.writeConfig((await readJsonBody(request)) as AppshotConfig)
    sendJson(response, 200, config)
    return true
  }

  if (request.method === "POST" && url.pathname === "/api/assets") {
    const category = url.searchParams.get("category")
    const filename = url.searchParams.get("filename")
    if (!category || !filename) {
      sendJson(response, 400, { error: "A category and filename are required" })
      return true
    }
    try {
      await store.addAsset(category, filename, await readBody(request))
    } catch (error) {
      if (error instanceof DuplicateAssetError) {
        sendJson(response, 409, { error: error.message, code: "DUPLICATE_ASSET" })
        return true
      }
      if (error instanceof AssetNameConflictError) {
        sendJson(response, 409, { error: error.message, code: "ASSET_NAME_CONFLICT" })
        return true
      }
      throw error
    }
    sendJson(response, 201, await store.readProject())
    return true
  }

  const assetMatch = url.pathname.match(/^\/api\/assets\/([^/]+)\/([^/]+)$/)
  if (assetMatch) {
    const category = decodeURIComponent(assetMatch[1]) as AssetCategory
    const filename = decodeURIComponent(assetMatch[2])
    const target = store.resolveAsset(category, filename)

    if (request.method === "GET") {
      const metadata = await stat(target)
      response.writeHead(200, {
        "Content-Type": contentTypeFor(target),
        "Content-Length": metadata.size,
        "Cache-Control": "no-store",
      })
      createReadStream(target).pipe(response)
      return true
    }

    if (request.method === "DELETE") {
      await store.deleteAsset(category, filename)
      response.writeHead(204).end()
      return true
    }
  }

  if (request.method === "POST" && url.pathname === "/api/sets") {
    const set = await store.createSet((await readJsonBody(request)) as CreateSetInput)
    sendJson(response, 201, set)
    return true
  }

  const setMatch = url.pathname.match(/^\/api\/sets\/([^/]+)$/)
  if (setMatch) {
    const id = decodeURIComponent(setMatch[1])
    if (request.method === "PUT") {
      const set = await store.writeSet(id, (await readJsonBody(request)) as ScreenshotSet)
      sendJson(response, 200, set)
      return true
    }
    if (request.method === "DELETE") {
      await store.deleteSet(id)
      response.writeHead(204).end()
      return true
    }
  }

  if (url.pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "Not found" })
    return true
  }
  return false
}

async function serveBuiltFrontend(request: IncomingMessage, response: ServerResponse, uiDirectory: string) {
  const url = new URL(request.url ?? "/", "http://localhost")
  const relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1))
  const candidate = path.resolve(uiDirectory, relativePath)
  const safeRoot = `${path.resolve(uiDirectory)}${path.sep}`
  const target = candidate.startsWith(safeRoot) ? candidate : path.join(uiDirectory, "index.html")

  try {
    const metadata = await stat(target)
    if (!metadata.isFile()) throw new Error("Not a file")
    const body = await readFile(target)
    response.writeHead(200, { "Content-Type": contentTypeFor(target), "Content-Length": body.length })
    response.end(body)
  } catch {
    const body = await readFile(path.join(uiDirectory, "index.html"))
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    response.end(body)
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const body = await readBody(request)
  try {
    return JSON.parse(body.toString("utf8"))
  } catch {
    throw new Error("Request body must be valid JSON")
  }
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_REQUEST_BYTES) throw new Error("Request is larger than 25 MB")
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  })
  response.end(body)
}

function contentTypeFor(filename: string): string {
  switch (path.extname(filename).toLowerCase()) {
    case ".html": return "text/html; charset=utf-8"
    case ".js": return "text/javascript; charset=utf-8"
    case ".css": return "text/css; charset=utf-8"
    case ".png": return "image/png"
    case ".jpg":
    case ".jpeg": return "image/jpeg"
    case ".webp": return "image/webp"
    default: return "application/octet-stream"
  }
}
