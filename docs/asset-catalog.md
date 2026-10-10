# Shipped assets and local imports

StoreShot ships a searchable, offline catalog of individual device frames,
laurels, lines, and decorative images. Install only the assets your artwork needs:

```bash
storeshot asset search "iphone 17" --kind mockup --platform iphone --json
storeshot asset show frameup-free-iphone-17-pro --json
storeshot -C ./screenshots asset import frameup-free-iphone-17-pro tabler-sparkles --json
storeshot -C ./screenshots asset installed --json
storeshot -C ./screenshots asset inspect other/frameup-free-iphone-17-pro.svg --json
```

Search matches all supplied words against IDs, names, tags, authors, platform,
and style, with exact ID, name, or tag matches ranked first. Checksums are excluded
from text matching: pass a complete 64-digit SHA-256 hash, optionally prefixed
with `sha256:`, as the query for exact checksum lookup. `search` and `show` work without a project. With a project,
they include local installation matches. `search --installed` selects assets
whose current catalog image bytes are present locally. Use `show` for complete
metadata, including image dimensions, screen geometry, source and license.

## Local files and checksums

Imports normally create `assets/other/<catalog-id>.<extension>`. Their original
metadata is saved in `assets/.storeshot-imports.json`, with license texts in
`assets/.licenses/`. Copy the complete `assets/` directory when sharing a project.
The image is an ordinary local file and appears in the workspace's Other assets.
Imported files and metadata remain usable independently of later catalog changes.

Every asset checksum is `sha256:<hex>`, computed from the exact image bytes.
It does not hash filenames or metadata. `asset list --json` exposes checksums
for normal local assets. `asset installed` and `asset inspect` recognize matching
images anywhere under `assets/`, including nested folders, manual copies, and
renamed files. Hidden files and symbolic links are excluded from matching.
Multiple catalog entries can match the same image bytes; their IDs and geometry
remain distinct, and inspection returns all matches rather than guessing one.

Importing again reuses an existing matching file, even if renamed, and ensures
its metadata and license are installed. A different file at the default target
is preserved unless you pass `--replace`. Multiple requested IDs are resolved
before installation, but each asset is installed independently; a later conflict
can leave earlier imports installed. Retrying is safe.

`asset installed --json` returns current catalog matches plus saved import
versions. Each version reports matching paths, modified files, and missing
original paths. A renamed file may have both a checksum match and a missing
original path. `inspect` exposes saved metadata even if an asset has disappeared
from the current catalog, and marks metadata associated with changed bytes as
`modified: true`. `validate` warns about modified or missing imports. Saved
geometry describes the imported version; review it before using modified images.

## Rendering device frames

A mockup's `width` and `height` are the unscaled frame's coordinate space.
For `screen.kind: "rect"`, position a screenshot at `x`, `y`, with the screen's
`width`, `height`, and `cornerRadius`. Draw the transparent frame above it. Scale
the enclosing composition to scale the screenshot and frame together.

Example using illustrative geometry (substitute the values from `asset show`):

```html
<div class="device">
  <img class="screen" src="../../assets/screenshots/home.png" alt="">
  <img class="frame" src="../../assets/other/frameup-free-iphone-17-pro.svg" alt="">
</div>
<style>
.device { position: relative; width: 462px; height: 978px; }
.screen { position: absolute; left: 11px; top: 11px; width: 440px;
  height: 956px; border-radius: 55px; object-fit: cover; }
.frame { position: absolute; inset: 0; width: 100%; height: 100%; }
</style>
```

For `screen.kind: "projective"`, `transform` is a 3×3 matrix mapping normalized
screenshot coordinates `(u,v)` to normalized frame coordinates. Divide the first
two transformed components by the third, then multiply by frame width/height.
`sourceCornerRadius.x/y` are normalized radii in the source screenshot plane.
To use CSS with a 1px × 1px screenshot element, `transform-origin: 0 0`, and a
frame of size `W × H`, convert matrix `m` to:

```text
matrix3d(
  m00*W, m10*H, 0, m20,
  m01*W, m11*H, 0, m21,
  0,     0,     1, 0,
  m02*W, m12*H, 0, m22
)
```

Apply source clipping before the perspective transform, then overlay the frame.
The catalog validates finite, invertible transforms that do not cross infinity.

## Maintaining the catalog

The repository's `catalog/` directory is shipped directly in the npm package;
it is independent of the browser UI. `catalog/catalog.json` contains a version
and an `assets` array. Each entry is one independently installable image:

```json
{
  "id": "example-phone",
  "kind": "mockup",
  "name": "Example phone",
  "description": "Front, black",
  "tags": ["phone", "black"],
  "file": "files/example-phone.svg",
  "width": 462,
  "height": 978,
  "platform": "iphone",
  "style": "standard",
  "screen": { "kind": "rect", "x": 11, "y": 11, "width": 440,
    "height": 956, "cornerRadius": 55 },
  "author": "Example Studio",
  "license": { "name": "MIT", "file": "licenses/example.txt" },
  "source": { "url": "https://example.com/frames", "revision": "source revision" }
}
```

1. Add the image under `catalog/files/` and its complete license under
   `catalog/licenses/`. Source-oriented subfolders are optional file organization.
2. Add an entry with a unique lowercase/hyphenated ID. Supported kinds are
   `mockup`, `decor`, `lines`, and `laurels`. Other kinds omit screen geometry.
   Image formats are SVG, PNG, JPEG, and WebP. Paths stay within `catalog/`.
3. Run `npm run check:catalog`. It checks IDs, referenced files, licenses,
   dimensions, geometry, and orphaned files. Checksums are calculated from bytes,
   so contributors do not maintain a separate hash index.
4. Run `npm run check` before handing off a catalog change.

To refresh FrameUp Free from an existing upstream checkout:
`node scripts/import-frameup-free.mjs /path/to/FrameUp-Free`, followed by
`npm run check:catalog`. The importer updates individual catalog entries and
records the upstream revision. Remove obsolete unreferenced images if reported.
Preserve existing IDs when updating an image so installed snapshots can be
compared with its current version. Images with identical bytes are allowed.
