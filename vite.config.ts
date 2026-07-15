import path from "node:path"
import { fileURLToPath } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: path.join(root, "src/ui"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.join(root, "src/ui"),
    },
  },
  build: {
    outDir: path.join(root, "dist/ui"),
    emptyOutDir: true,
  },
})
