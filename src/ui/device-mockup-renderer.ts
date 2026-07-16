import type { DeviceMockup, Point, ProjectiveTransform } from "../device-mockups"

export async function renderDeviceMockup(mockup: DeviceMockup, screenshotUrl: string): Promise<HTMLCanvasElement> {
  const [frame, screenshot] = await Promise.all([
    loadImage(mockup.frameUrl),
    loadImage(screenshotUrl),
  ])
  const canvas = document.createElement("canvas")
  canvas.width = mockup.width
  canvas.height = mockup.height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas rendering is unavailable")

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"

  if (mockup.screen.kind === "rect") {
    const screen = mockup.screen
    context.save()
    context.beginPath()
    context.roundRect(screen.x, screen.y, screen.width, screen.height, screen.cornerRadius)
    context.clip()
    context.drawImage(screenshot, screen.x, screen.y, screen.width, screen.height)
    context.restore()
  } else {
    const maskedScreenshot = maskRoundedScreenshot(screenshot, mockup.screen.sourceCornerRadius)
    drawProjectiveImage(context, maskedScreenshot, mockup.screen.transform, mockup.width, mockup.height)
  }

  context.drawImage(frame, 0, 0, mockup.width, mockup.height)
  return canvas
}

function maskRoundedScreenshot(image: HTMLImageElement, radius: Point): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas rendering is unavailable")

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  context.beginPath()
  context.roundRect(0, 0, canvas.width, canvas.height, {
    x: canvas.width * radius.x,
    y: canvas.height * radius.y,
  })
  context.clip()
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = "anonymous"
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load ${url}`))
    image.src = url
  })
}

function drawProjectiveImage(
  context: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  transform: ProjectiveTransform,
  frameWidth: number,
  frameHeight: number,
) {
  const columns = Math.max(12, Math.ceil(frameWidth / 64))
  const rows = Math.max(20, Math.ceil(frameHeight / 64))

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const u0 = column / columns
      const u1 = (column + 1) / columns
      const v0 = row / rows
      const v1 = (row + 1) / rows
      const destination00 = projectPoint(transform, frameWidth, frameHeight, u0, v0)
      const destination10 = projectPoint(transform, frameWidth, frameHeight, u1, v0)
      const destination11 = projectPoint(transform, frameWidth, frameHeight, u1, v1)
      const destination01 = projectPoint(transform, frameWidth, frameHeight, u0, v1)
      const source00 = sourcePoint(image, u0, v0)
      const source10 = sourcePoint(image, u1, v0)
      const source11 = sourcePoint(image, u1, v1)
      const source01 = sourcePoint(image, u0, v1)

      drawImageTriangle(context, image, [source00, source10, source11], [destination00, destination10, destination11])
      drawImageTriangle(context, image, [source00, source11, source01], [destination00, destination11, destination01])
    }
  }
}

function drawImageTriangle(
  context: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  source: [Point, Point, Point],
  destination: [Point, Point, Point],
) {
  const [source0, source1, source2] = source
  const [destination0, destination1, destination2] = destination
  const denominator = source0.x * (source1.y - source2.y)
    + source1.x * (source2.y - source0.y)
    + source2.x * (source0.y - source1.y)
  if (Math.abs(denominator) < Number.EPSILON) return

  const a = (destination0.x * (source1.y - source2.y)
    + destination1.x * (source2.y - source0.y)
    + destination2.x * (source0.y - source1.y)) / denominator
  const b = (destination0.y * (source1.y - source2.y)
    + destination1.y * (source2.y - source0.y)
    + destination2.y * (source0.y - source1.y)) / denominator
  const c = (destination0.x * (source2.x - source1.x)
    + destination1.x * (source0.x - source2.x)
    + destination2.x * (source1.x - source0.x)) / denominator
  const d = (destination0.y * (source2.x - source1.x)
    + destination1.y * (source0.x - source2.x)
    + destination2.y * (source1.x - source0.x)) / denominator
  const e = (destination0.x * (source1.x * source2.y - source2.x * source1.y)
    + destination1.x * (source2.x * source0.y - source0.x * source2.y)
    + destination2.x * (source0.x * source1.y - source1.x * source0.y)) / denominator
  const f = (destination0.y * (source1.x * source2.y - source2.x * source1.y)
    + destination1.y * (source2.x * source0.y - source0.x * source2.y)
    + destination2.y * (source0.x * source1.y - source1.x * source0.y)) / denominator

  context.save()
  const expanded = expandTriangle(destination, 0.75)
  context.beginPath()
  context.moveTo(expanded[0].x, expanded[0].y)
  context.lineTo(expanded[1].x, expanded[1].y)
  context.lineTo(expanded[2].x, expanded[2].y)
  context.closePath()
  context.clip()
  context.setTransform(a, b, c, d, e, f)
  context.drawImage(image, 0, 0)
  context.restore()
}

function projectPoint(
  transform: ProjectiveTransform,
  frameWidth: number,
  frameHeight: number,
  u: number,
  v: number,
): Point {
  const denominator = transform[2][0] * u + transform[2][1] * v + transform[2][2]
  return {
    x: frameWidth * (transform[0][0] * u + transform[0][1] * v + transform[0][2]) / denominator,
    y: frameHeight * (transform[1][0] * u + transform[1][1] * v + transform[1][2]) / denominator,
  }
}

function sourcePoint(image: HTMLCanvasElement, u: number, v: number): Point {
  return { x: image.width * u, y: image.height * v }
}

function expandTriangle(points: [Point, Point, Point], amount: number): [Point, Point, Point] {
  const center = {
    x: (points[0].x + points[1].x + points[2].x) / 3,
    y: (points[0].y + points[1].y + points[2].y) / 3,
  }
  return points.map((point) => {
    const length = Math.max(1, distance(center, point))
    const scale = (length + amount) / length
    return {
      x: center.x + (point.x - center.x) * scale,
      y: center.y + (point.y - center.y) * scale,
    }
  }) as [Point, Point, Point]
}

function distance(first: Point, second: Point): number {
  return Math.hypot(second.x - first.x, second.y - first.y)
}
