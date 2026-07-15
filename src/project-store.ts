import { constants } from "node:fs"
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"

import type { AppshotConfig, AppshotProject, ScreenshotAsset } from "./shared.js"

export const CONFIG_FILENAME = "appshot.json"
export const SCREENSHOTS_DIRECTORY = "screenshots"

const supportedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"])

export class ProjectStore {
  readonly root: string
  readonly configPath: string
  readonly screenshotsPath: string

  constructor(directory: string) {
    this.root = path.resolve(directory)
    this.configPath = path.join(this.root, CONFIG_FILENAME)
    this.screenshotsPath = path.join(this.root, SCREENSHOTS_DIRECTORY)
  }

  async initialize(): Promise<void> {
    await mkdir(this.screenshotsPath, { recursive: true })

    try {
      await access(this.configPath, constants.F_OK)
    } catch {
      await this.writeConfig({
        version: 1,
        appName: path.basename(this.root),
        platforms: ["ios"],
      })
    }
  }

  async readProject(): Promise<AppshotProject> {
    return {
      directory: this.root,
      config: await this.readConfig(),
      screenshots: await this.listScreenshots(),
    }
  }

  async readConfig(): Promise<AppshotConfig> {
    const value: unknown = JSON.parse(await readFile(this.configPath, "utf8"))
    return parseConfig(value)
  }

  async writeConfig(config: AppshotConfig): Promise<AppshotConfig> {
    const value = parseConfig(config)
    await writeFile(this.configPath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
    return value
  }

  async listScreenshots(): Promise<ScreenshotAsset[]> {
    const entries = await readdir(this.screenshotsPath, { withFileTypes: true })
    const files = entries
      .filter((entry) => entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name))

    return Promise.all(
      files.map(async (file) => {
        const metadata = await stat(path.join(this.screenshotsPath, file.name))
        return {
          name: file.name,
          url: `/api/screenshots/${encodeURIComponent(file.name)}`,
          size: metadata.size,
          modifiedAt: metadata.mtime.toISOString(),
        }
      }),
    )
  }

  resolveScreenshot(filename: string): string {
    const safeName = path.basename(filename)
    const extension = path.extname(safeName).toLowerCase()

    if (safeName !== filename || !supportedExtensions.has(extension)) {
      throw new Error("Unsupported screenshot filename")
    }

    return path.join(this.screenshotsPath, safeName)
  }
}

function parseConfig(value: unknown): AppshotConfig {
  if (!isRecord(value)) {
    throw new Error("appshot.json must contain a JSON object")
  }

  const appName = typeof value.appName === "string" ? value.appName.trim() : ""
  if (!appName) {
    throw new Error("appName must be a non-empty string")
  }

  const platforms = Array.isArray(value.platforms)
    ? value.platforms.filter((platform): platform is "ios" | "android" => platform === "ios" || platform === "android")
    : []

  if (platforms.length === 0) {
    throw new Error("platforms must include ios or android")
  }

  return {
    version: 1,
    appName,
    platforms: [...new Set(platforms)],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
