interface ArtboardOptions {
  image?: string
  locale?: string
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")

/** A blank, self-contained canvas for direct HTML/CSS editing. */
export function createArtboardHtml(
  width: number,
  height: number,
  options: ArtboardOptions = {},
): string {
  const locale = options.locale ?? "en-US"
  const image = options.image
    ? `<img class="source-image" alt="" src="${escapeHtml(options.image)}">`
    : ""
  return `<!doctype html>
<html lang="${escapeHtml(locale)}" dir="${/^(ar|he|ur)(-|$)/.test(locale) ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>App Store artwork</title>
<style>
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
body { background: #fff; color: #111; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.5; }
img, svg { display: block; max-width: 100%; }
${image ? ".source-image { width: 100%; height: 100%; object-fit: contain; }\n" : ""}</style>
</head>
<body>
${image}
</body>
</html>
`
}

/** Opaque-origin sandbox: project documents cannot execute scripts or access the editor. */
export const ARTBOARD_CSP =
  "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline' 'self' https: http:; font-src 'self' data: https: http:; base-uri 'none'; form-action 'none'; frame-src 'none'"
