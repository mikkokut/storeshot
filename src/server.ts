import { createReadStream } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import path from "node:path"

import type { ViteDevServer } from "vite"

import { DuplicateAssetError, ProjectStore } from "./project-store.js"
import type { StoreShotConfig, AssetCategory, CreateSetInput, ScreenshotSet, UpdateAssetMetadataInput, UpdateSetMetadataInput } from "./shared.js"

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
      if ((request.url ?? "").startsWith("/api/")) assertAllowedBrowserRequest(request, options.host)
      if (await handleApiRequest(request, response, store)) return
      if (vite) {
        vite.middlewares(request, response)
        return
      }
      await serveBuiltFrontend(request, response, path.join(options.packageRoot, "dist/ui"))
    } catch (error) {
      const failure = httpFailureFor(error, request)
      if (failure.status >= 500) console.error(error)
      if (!response.headersSent) sendJson(response, failure.status, { error: failure.message, ...(failure.code ? { code: failure.code } : {}) })
      else response.end()
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(options.port, options.host, resolve)
  })

  return {
    store,
    port: (server.address() as AddressInfo).port,
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

  if (request.method === "GET" && url.pathname === "/api/mockup-bundles") {
    sendJson(response, 200, await store.listMockupCatalog())
    return true
  }

  const mockupBundleImportFileMatch = url.pathname.match(/^\/api\/mockup-bundle-imports\/([^/]+)\/([^/]+)\/files\/(.+)$/)
  if (request.method === "PUT" && mockupBundleImportFileMatch) {
    const importId = decodeURIComponent(mockupBundleImportFileMatch[1])
    const bundleId = decodeURIComponent(mockupBundleImportFileMatch[2])
    const relativePath = mockupBundleImportFileMatch[3].split("/").map(decodeURIComponent).join("/")
    await store.writeMockupBundleImportFile(importId, bundleId, relativePath, await readBody(request))
    response.writeHead(204).end()
    return true
  }

  const mockupBundleImportMatch = url.pathname.match(/^\/api\/mockup-bundle-imports\/([^/]+)\/([^/]+)$/)
  if (request.method === "PUT" && mockupBundleImportMatch) {
    const importId = decodeURIComponent(mockupBundleImportMatch[1])
    const bundleId = decodeURIComponent(mockupBundleImportMatch[2])
    await store.commitMockupBundleImport(importId, bundleId, await readJsonBody(request))
    sendJson(response, 200, await store.listMockupCatalog())
    return true
  }

  const mockupBundleImportDiscardMatch = url.pathname.match(/^\/api\/mockup-bundle-imports\/([^/]+)$/)
  if (request.method === "DELETE" && mockupBundleImportDiscardMatch) {
    await store.discardMockupBundleImport(decodeURIComponent(mockupBundleImportDiscardMatch[1]))
    response.writeHead(204).end()
    return true
  }

  const mockupBundleMatch = url.pathname.match(/^\/api\/mockup-bundles\/([^/]+)$/)
  if (request.method === "PUT" && mockupBundleMatch) {
    const bundleId = decodeURIComponent(mockupBundleMatch[1])
    await store.writeMockupBundleManifest(bundleId, await readJsonBody(request))
    sendJson(response, 200, await store.listMockupCatalog())
    return true
  }

  const mockupBundleFileMatch = url.pathname.match(/^\/api\/mockup-bundle-files\/([^/]+)\/(.+)$/)
  if (mockupBundleFileMatch) {
    const bundleId = decodeURIComponent(mockupBundleFileMatch[1])
    const relativePath = mockupBundleFileMatch[2].split("/").map(decodeURIComponent).join("/")
    if (request.method === "PUT") {
      await store.writeMockupBundleFile(bundleId, relativePath, await readBody(request))
      response.writeHead(204).end()
      return true
    }
    if (request.method === "GET") {
      const target = await store.resolveExistingMockupBundleFile(bundleId, relativePath)
      const metadata = await stat(target)
      response.writeHead(200, {
        "Content-Type": contentTypeFor(target),
        "Content-Length": metadata.size,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...(path.extname(target).toLowerCase() === ".svg" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
      })
      createReadStream(target).pipe(response)
      return true
    }
  }

  if (request.method === "PATCH" && url.pathname === "/api/config") {
    const config = await store.writeConfig((await readJsonBody(request)) as StoreShotConfig)
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
    let replaced = false
    try {
      const result = await store.addAsset(category, filename, await readBody(request))
      replaced = result.replaced
    } catch (error) {
      if (error instanceof DuplicateAssetError) {
        sendJson(response, 409, { error: error.message, code: "DUPLICATE_ASSET" })
        return true
      }
      throw error
    }
    sendJson(response, replaced ? 200 : 201, { replaced })
    return true
  }

  const assetMatch = url.pathname.match(/^\/api\/assets\/([^/]+)\/([^/]+)$/)
  if (assetMatch) {
    const category = decodeURIComponent(assetMatch[1]) as AssetCategory
    const filename = decodeURIComponent(assetMatch[2])
    if (request.method === "GET") {
      const target = await store.resolveExistingAsset(category, filename)
      const metadata = await stat(target)
      response.writeHead(200, {
        "Content-Type": contentTypeFor(target),
        "Content-Length": metadata.size,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...(path.extname(target).toLowerCase() === ".svg" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
      })
      createReadStream(target).pipe(response)
      return true
    }

    if (request.method === "DELETE") {
      await store.deleteAsset(category, filename)
      response.writeHead(204).end()
      return true
    }

    if (request.method === "PATCH") {
      await store.updateAssetMetadata(category, filename, (await readJsonBody(request)) as UpdateAssetMetadataInput)
      sendJson(response, 200, await store.readProject())
      return true
    }
  }

  if (request.method === "POST" && url.pathname === "/api/sets") {
    const set = await store.createSet((await readJsonBody(request)) as CreateSetInput)
    sendJson(response, 201, set)
    return true
  }

  const duplicateSetMatch = url.pathname.match(/^\/api\/sets\/([^/]+)\/duplicate$/)
  if (request.method === "POST" && duplicateSetMatch) {
    const set = await store.duplicateSet(decodeURIComponent(duplicateSetMatch[1]))
    sendJson(response, 201, set)
    return true
  }

  const setMatch = url.pathname.match(/^\/api\/sets\/([^/]+)$/)
  if (setMatch) {
    const id = decodeURIComponent(setMatch[1])
    if (request.method === "PATCH") {
      const set = await store.updateSetMetadata(id, (await readJsonBody(request)) as UpdateSetMetadataInput)
      sendJson(response, 200, set)
      return true
    }
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
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase()
  if (contentType !== "application/json") throw new HttpError(415, "Request body must use application/json")
  const body = await readBody(request)
  try {
    return JSON.parse(body.toString("utf8"))
  } catch {
    throw new HttpError(400, "Request body must be valid JSON")
  }
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_REQUEST_BYTES) throw new HttpError(413, "Request is larger than 25 MB")
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) {
    super(message)
  }
}

function assertAllowedBrowserRequest(request: IncomingMessage, configuredHost: string): void {
  const host = request.headers.host
  if (!host) throw new HttpError(400, "A Host header is required")

  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    throw new HttpError(400, "The Host header is invalid")
  }
  const configuredHostname = normalizedHostname(configuredHost)
  if (!isLoopbackHostname(hostUrl.hostname) && hostUrl.hostname !== configuredHostname) {
    throw new HttpError(403, "This StoreShot server does not accept requests for that host")
  }

  const origin = request.headers.origin
  if (!origin) return
  let originUrl: URL
  try {
    originUrl = new URL(origin)
  } catch {
    throw new HttpError(403, "The request origin is invalid")
  }
  if ((originUrl.protocol !== "http:" && originUrl.protocol !== "https:") || originUrl.host !== host) {
    throw new HttpError(403, "Cross-origin API requests are not allowed")
  }
}

function normalizedHostname(host: string): string {
  try {
    return new URL(`http://${host}`).hostname
  } catch {
    return host.replace(/^\[|\]$/g, "")
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
}

function httpFailureFor(error: unknown, request: IncomingMessage): HttpError {
  if (error instanceof HttpError) return error
  if (error instanceof DuplicateAssetError) return new HttpError(409, error.message, "DUPLICATE_ASSET")
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (code === "ENOENT") return new HttpError(404, "The requested project file was not found")
  if (code === "EACCES" || code === "EPERM") return new HttpError(403, "StoreShot cannot access that project file")
  if (isMutation(request) && error instanceof Error && !code) return new HttpError(400, error.message)
  return new HttpError(500, "StoreShot could not complete the request")
}

function isMutation(request: IncomingMessage): boolean {
  return request.method === "POST" || request.method === "PUT" || request.method === "PATCH" || request.method === "DELETE"
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
    case ".svg": return "image/svg+xml"
    case ".md":
    case ".txt": return "text/plain; charset=utf-8"
    default: return "application/octet-stream"
  }
}
