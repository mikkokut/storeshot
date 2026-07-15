export interface AppshotConfig {
  version: 1
  appName: string
  platforms: Array<"ios" | "android">
}

export interface ScreenshotAsset {
  name: string
  url: string
  size: number
  modifiedAt: string
}

export interface AppshotProject {
  directory: string
  config: AppshotConfig
  screenshots: ScreenshotAsset[]
}
