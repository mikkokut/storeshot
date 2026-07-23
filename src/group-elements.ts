import type { CanvasElement, GroupElement } from "./shared.js"

export interface CanvasElementBounds {
  bottom: number
  left: number
  right: number
  top: number
}

export function groupCanvasElements(
  elements: CanvasElement[],
  idFactory: () => string = () => globalThis.crypto.randomUUID(),
  renderedBounds?: CanvasElementBounds,
): GroupElement {
  if (elements.length < 2) throw new Error("At least two elements are required to create a group")
  const bounds = renderedBounds ?? canvasElementsBounds(elements)
  return {
    id: `element-${idFactory()}`,
    type: "group",
    children: elements.map((element) => ({
      ...structuredClone(element),
      x: element.x - bounds.left,
      y: element.y - bounds.top,
    })),
    x: bounds.left,
    y: bounds.top,
    width: Math.max(1, bounds.right - bounds.left),
    height: Math.max(1, bounds.bottom - bounds.top),
    rotation: 0,
    opacity: 1,
  }
}

export function ungroupCanvasElement(group: GroupElement): CanvasElement[] {
  const bounds = canvasElementsBounds(group.children)
  const naturalWidth = Math.max(1, bounds.right - bounds.left)
  const naturalHeight = Math.max(1, bounds.bottom - bounds.top)
  const scaleX = group.width / naturalWidth
  const scaleY = group.height / naturalHeight
  const groupRotation = rotationMatrix(group.rotation)
  const groupLinear = multiplyMatrices(
    groupRotation,
    scaleMatrix(group.flipX ? -scaleX : scaleX, group.flipY ? -scaleY : scaleY),
  )
  const groupCenter = addPoints(
    { x: group.x, y: group.y },
    transformPoint(groupRotation, { x: group.width / 2, y: group.height / 2 }),
  )
  const naturalCenter = {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2,
  }

  return group.children.map((source) => {
    const child = structuredClone(source)
    const childRotation = rotationMatrix(child.rotation)
    const childCenter = addPoints(
      { x: child.x, y: child.y },
      transformPoint(childRotation, { x: child.width / 2, y: child.height / 2 }),
    )
    const transformedCenter = addPoints(
      groupCenter,
      transformPoint(groupLinear, subtractPoints(childCenter, naturalCenter)),
    )
    const childLinear = multiplyMatrices(
      childRotation,
      scaleMatrix(child.flipX ? -1 : 1, child.flipY ? -1 : 1),
    )
    const transform = decomposeMatrix(multiplyMatrices(groupLinear, childLinear))
    const width = child.width * transform.scaleX
    const height = child.height * transform.scaleY
    const outputRotation = rotationMatrix(transform.rotation)
    const outputOrigin = subtractPoints(
      transformedCenter,
      transformPoint(outputRotation, { x: width / 2, y: height / 2 }),
    )
    return scaleElementStyle({
      ...child,
      x: outputOrigin.x,
      y: outputOrigin.y,
      width,
      height,
      rotation: transform.rotation,
      opacity: child.opacity * group.opacity,
      flipX: transform.flipX,
      flipY: transform.flipY,
    }, transform.scaleX, transform.scaleY)
  })
}

interface Point {
  x: number
  y: number
}

interface Matrix {
  a: number
  b: number
  c: number
  d: number
}

function rotationMatrix(degrees: number): Matrix {
  const radians = degrees * Math.PI / 180
  return {
    a: Math.cos(radians),
    b: Math.sin(radians),
    c: -Math.sin(radians),
    d: Math.cos(radians),
  }
}

function scaleMatrix(scaleX: number, scaleY: number): Matrix {
  return { a: scaleX, b: 0, c: 0, d: scaleY }
}

function multiplyMatrices(left: Matrix, right: Matrix): Matrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
  }
}

function transformPoint(matrix: Matrix, point: Point): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y,
    y: matrix.b * point.x + matrix.d * point.y,
  }
}

function addPoints(left: Point, right: Point): Point {
  return { x: left.x + right.x, y: left.y + right.y }
}

function subtractPoints(left: Point, right: Point): Point {
  return { x: left.x - right.x, y: left.y - right.y }
}

function decomposeMatrix(matrix: Matrix): {
  flipX: boolean
  flipY: boolean
  rotation: number
  scaleX: number
  scaleY: number
} {
  const scaleX = Math.hypot(matrix.a, matrix.b)
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  const scaleY = scaleX === 0 ? Math.hypot(matrix.c, matrix.d) : Math.abs(determinant) / scaleX
  return {
    flipX: false,
    flipY: determinant < 0,
    rotation: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI,
    scaleX,
    scaleY,
  }
}

function scaleElementStyle(element: CanvasElement, scaleX: number, scaleY: number): CanvasElement {
  const paintScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2
  if (element.type === "shape") {
    return {
      ...element,
      cornerRadius: element.cornerRadius * Math.min(Math.abs(scaleX), Math.abs(scaleY)),
      strokeWidth: element.strokeWidth * paintScale,
    }
  }
  if (element.type === "text") {
    return {
      ...element,
      fontSize: element.fontSize * Math.abs(scaleY),
      lineHeight: element.lineHeight === undefined ? undefined : element.lineHeight * Math.abs(scaleY),
    }
  }
  return element
}

function canvasElementsBounds(elements: CanvasElement[]): CanvasElementBounds {
  return elements.reduce<CanvasElementBounds>((bounds, element) => {
    const elementBounds = rotatedElementBounds(element)
    return {
      bottom: Math.max(bounds.bottom, elementBounds.bottom),
      left: Math.min(bounds.left, elementBounds.left),
      right: Math.max(bounds.right, elementBounds.right),
      top: Math.min(bounds.top, elementBounds.top),
    }
  }, { bottom: -Infinity, left: Infinity, right: -Infinity, top: Infinity })
}

function rotatedElementBounds(element: CanvasElement): CanvasElementBounds {
  const paintExpansion = element.type === "shape" ? element.strokeWidth : 0
  const angle = element.rotation * Math.PI / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const corners = [
    [0, 0],
    [element.width + paintExpansion, 0],
    [0, element.height + paintExpansion],
    [element.width + paintExpansion, element.height + paintExpansion],
  ].map(([x, y]) => ({
    x: element.x + x * cosine - y * sine,
    y: element.y + x * sine + y * cosine,
  }))
  return {
    bottom: Math.max(...corners.map((point) => point.y)),
    left: Math.min(...corners.map((point) => point.x)),
    right: Math.max(...corners.map((point) => point.x)),
    top: Math.min(...corners.map((point) => point.y)),
  }
}
