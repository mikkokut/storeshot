import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  clean: true,
  sourcemap: true,
  external: ["puppeteer-core", "vite"],
  banner: {
    js: "#!/usr/bin/env node",
  },
})
