interface Composition {
  headline: string
  image?: string
  background: string
  locale: string
  fullBleed?: boolean
}
const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
/** A starting composition; the generated HTML is edited directly. */
export function createArtboardHtml(
  width: number,
  height: number,
  options?: Partial<Composition>,
): string {
  const composition: Composition = {
    headline: "Your headline",
    background: "#245f4a",
    locale: "en-US",
    ...options,
  }
  const landscape = width > height
  const headline = escapeHtml(composition.headline)
  const background = /^#[0-9a-f]{6}$/i.test(composition.background)
    ? composition.background
    : "#245f4a"
  const image = composition.image
    ? `<img alt="" src="${escapeHtml(composition.image)}">`
    : ""
  return `<!doctype html>
<html lang="${escapeHtml(composition.locale)}" dir="${/^(ar|he|ur)(-|$)/.test(composition.locale) ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${headline || "App Store artwork"}</title>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
body { background: ${background}; color: white; font-family: Arial, sans-serif; }
h1 { position: absolute; top: ${landscape ? "25%" : "7%"}; left: 7%; width: ${landscape && image ? "40%" : "86%"}; margin: 0; font-size: ${Math.max(24, Math.round(Math.min(width, height) * 0.08))}px; line-height: 1.08; text-align: center; text-wrap: balance; }
img { position: absolute; object-fit: contain; ${composition.fullBleed ? "inset:0;width:100%;height:100%" : landscape ? "left:54%;top:7%;width:39%;height:86%" : "left:8%;top:28%;width:84%;height:66%"}; }
</style>
</head>
<body>
${composition.fullBleed ? "" : `<h1>${headline}</h1>`}
${image}
</body>
</html>
`
}

/** Opaque-origin sandbox: project documents cannot execute scripts or access the editor. */
export const ARTBOARD_CSP =
  "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline' 'self' https: http:; font-src 'self' data: https: http:; base-uri 'none'; form-action 'none'; frame-src 'none'"
