import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  clean: true,
  sourcemap: true,
  external: ["canvas", "fabric", "fabric/node", "vite"],
  banner: {
    js: "#!/usr/bin/env node",
  },
})
