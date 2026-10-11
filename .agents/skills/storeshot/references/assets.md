# Catalog assets: discovery, import, and geometry

Read this when using a bundled device frame, laurel, line, or decoration, when
interpreting installed-asset status, or when reusing an image whose name or
contents have changed.

## Find and import

StoreShot ships an offline catalog of individual images. If
`storeshot asset --help` lacks `search`, `show`, `import`, `inspect`, or
`installed`, the installed release predates the catalog. Never copy files from
the package's internal paths instead.

```bash
# Discover; search and show work without a project.
storeshot asset search "iphone 17" --kind mockup --platform iphone --json
storeshot asset search --kind laurels --json
storeshot asset show CATALOG_ID --json

# Install one or more IDs into the project.
storeshot -C DIR asset import CATALOG_ID OTHER_ID --json

# Reuse and inspect local copies.
storeshot -C DIR asset installed --json
storeshot -C DIR asset search --installed --kind mockup --json
storeshot -C DIR asset inspect other/FILENAME.svg --json
```

- **Search:** matches every quoted word against IDs, names, descriptions, tags,
  authors, platform, and style. Exact ID, name, or tag matches rank first. Omit
  filters to broaden a search.
- **Filters:** kinds are `mockup`, `decor`, `lines`, and `laurels`. Platforms
  are `iphone`, `ipad`, `mac`, and `watch`.
- **Checksum lookup:** pass a complete 64-digit SHA-256 hash, optionally
  prefixed with `sha256:`. Partial hashes do not match.
- **IDs vs paths:** catalog IDs and local asset paths are different inputs. Use
  IDs from search results.

Read `show` before choosing a frame. Its screen geometry must suit your
capture's aspect ratio. Laurels and decorations are generic artwork. Never
pair them with awards, ratings, or press quotes the user has not supplied.

Repeated imports reuse files with matching bytes. A different file at the
default destination needs `--replace`; pass it only when replacing is intended.
Each ID in a multi-ID import installs independently, so after a failure, check
the results and retry the remaining IDs. Keep `assets/.storeshot-imports.json`
and `assets/.licenses/` when sharing or copying the project.

## Choose metadata for the actual local image

`asset show CATALOG_ID --json` returns the current catalog definition in `asset`.
It includes `width`, `height`, `checksum`, license/source metadata, and `screen`
for device mockups. `file` is a package-internal path, not a project image URL.

`asset import CATALOG_ID --json` returns an `assets` array. Each result includes
`id`, `path`, `checksum`, `reused`, `replaced`, and `licensePath`. Use its `path`
exactly, because a matching existing image may have a different name, folder,
or extension from the default `assets/other/<catalog-id>.<extension>`. The path
is project-relative: an artboard references it as `../../<path>`, and
`asset inspect` takes it without the leading `assets/`.

`asset inspect LOCAL_PATH --json` expects a path relative to `assets/`, such as
`other/frameup-free-iphone-17-pro.svg`. Its `asset` contains the actual local
checksum and dimensions, `catalogMatches` for current definitions with matching
bytes, and `imports` for saved metadata snapshots. Each import has its definition
in `asset`, tracked `paths`, `licensePath`, and a `modified` flag. Prefer a saved
snapshot matching the intended catalog ID and actual checksum. If several
catalog IDs share identical image bytes, inspect their geometry and choose the
intended definition; checksum equality alone does not select one.

`asset installed --json` returns current catalog entries in `assets` and saved
versions in `imports`. Their `installation` objects expose:

- `matches`: local paths whose bytes equal the definition's checksum.
- `modified`: tracked paths with contents differing from saved imports.
- `missing`: tracked paths no longer present. A renamed file can have a matching
  checksum at its new location while the original path is listed as missing.

Checksums use `sha256:<hex>` and hash exact image bytes, not names or metadata.
Matching covers nested files under `assets/` but excludes hidden paths and
symbolic links. `asset search --installed` selects current catalog versions
present locally; use `installed` to inspect older saved versions too. Modified
files need a fresh geometry/alignment review; saved geometry describes original
bytes. A file that was both renamed and modified cannot be identified by its
original checksum alone.

## Rectangular device screens

Use the frame's `width` and `height` as the parent coordinate space. Position a
clipping container at `screen.x`, `screen.y`, with `screen.width`,
`screen.height`, `border-radius: screen.cornerRadius`, and `overflow: hidden`.
Put the app capture inside it, then overlay the frame with absolute positioning,
`inset: 0`, and `width: 100%; height: 100%`.

Use `object-fit: contain` to preserve the whole capture, or `cover` for an
intentional crop. Select an app capture with the intended screen aspect ratio.
Scale the complete device parent uniformly with `transform-origin: 0 0`; scaling
the frame alone will break alignment. Border radii belong in the original frame
coordinate space and scale with that parent.

For an artboard at `sets/SET_ID/AREA_ID.html`, a returned import path of
`assets/other/frameup-free-iphone-17-pro.svg` becomes:

```html
<img src="../../assets/other/frameup-free-iphone-17-pro.svg" alt="">
```

Use the returned path for PNG, JPEG, and WebP images in the same way. Decorative
assets have dimensions but no screen geometry; place them as ordinary local
images, preserving aspect ratio unless stretching is intentional.

## Perspective device screens

A `screen.kind: "projective"` definition supplies `screen.transform`, a
row-major 3×3 matrix (below, `mRC` is `transform[R][C]`). It maps normalized
screenshot coordinates `(u, v, 1)` to normalized frame coordinates. Divide the
first two transformed components by the third, then multiply by frame width `W`
and height `H`.

For CSS, give a screenshot wrapper a 1px × 1px source plane and
`transform-origin: 0 0`. Convert the matrix to the following column-major values,
substituting actual numbers before saving static HTML:

```text
matrix3d(
  m00*W, m10*H, 0, m20,
  m01*W, m11*H, 0, m21,
  0,     0,     1, 0,
  m02*W, m12*H, 0, m22
)
```

Clip the source plane before applying the transform. Its normalized
`sourceCornerRadius.x/y` become `border-radius: (x*100)% / (y*100)%`, with
`overflow: hidden`. Overlay the frame in the parent's original `W × H` space.
Render a preview and inspect the screen edges, corner clipping, and frame
alignment before exporting at full resolution.
