export function createExportCanvasOptions(
  canvasSize: { width: number; height: number },
  backgroundColor: string,
) {
  return {
    width: canvasSize.width,
    height: canvasSize.height,
    backgroundColor,
    enableRetinaScaling: false,
    renderOnAddRemove: false,
  }
}
