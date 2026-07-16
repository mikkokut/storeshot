import { StaticCanvas } from "fabric"

import type { DeviceMockup } from "../device-mockups"
import type { Asset, ScreenshotArea, TextElement } from "../shared"
import { loadBunnyFont } from "./bunny-fonts"
import { applyCanvasElement, assetForElement, createFabricObject } from "./fabric-elements"

export async function renderScreenshotArea(
  area: ScreenshotArea,
  assetLookup: Map<string, Asset>,
  mockupLookup: Map<string, DeviceMockup>,
  canvasSize: { width: number; height: number },
): Promise<Blob> {
  const canvasElement = document.createElement("canvas")
  const canvas = new StaticCanvas(canvasElement, {
    width: canvasSize.width,
    height: canvasSize.height,
    backgroundColor: area.background,
    renderOnAddRemove: false,
  })

  try {
    const textElements = area.elements.filter((element): element is TextElement => element.type === "text")
    await Promise.all(textElements.map((element) => loadBunnyFont(element.fontFamily, element.fontWeight)))

    for (const element of area.elements) {
      const asset = assetForElement(element, assetLookup)
      const object = await createFabricObject(element, asset, mockupLookup)
      applyCanvasElement(object, element, 1)
      object.set({ evented: false, selectable: false })
      canvas.add(object)
    }

    canvas.renderAll()
    return await canvasToBlob(canvasElement)
  } finally {
    canvas.dispose()
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error("The browser could not render this screenshot"))
    }, "image/png")
  })
}
