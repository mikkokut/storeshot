import { access } from "node:fs/promises"
import path from "node:path"

export async function resolvePackagePublicDirectory(packageRoot: string): Promise<string> {
  const candidates = [
    path.join(packageRoot, "dist/ui"),
    path.join(packageRoot, "src/ui/public"),
  ]
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next development or packaged location.
    }
  }
  throw new Error("StoreShot's bundled rendering assets could not be found")
}
