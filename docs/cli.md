# CLI and agent workflow

StoreShot's CLI is designed for both interactive shell use and coding agents.
It keeps the complete source project in ordinary HTML, JSON, and image files, while
providing validated commands for the operations where stable behavior and
machine-readable results are useful.

## Selecting a project

Commands use the current directory by default. Use the global `-C` option to
work on another project without changing directories:

```bash
storeshot -C ./app-store-screenshots status
storeshot -C ./app-store-screenshots validate --json
```

`--json` can be placed before or after a subcommand. Successful results contain
`"ok": true`; command failures use a non-zero exit status and write a JSON error
when `--json` is enabled.

## Project lifecycle

Initialize a project explicitly, or let `dev` initialize the selected empty
directory:

```bash
storeshot init ./app-store-screenshots
storeshot -C ./app-store-screenshots status --json
storeshot dev ./app-store-screenshots
```

An open `dev` workspace watches `storeshot.json`, `sets/`, and `assets/`. CLI changes and direct filesystem edits are streamed to the
browser, so an open set and its preview update without restarting the server.

## Recommended agent loop

An agent can inspect, change, validate, and render a screenshot without needing
to drive the browser workspace:

```bash
# 1. Discover project state and stable set ids.
storeshot -C ./screenshots status --json

# 2. Read the complete source document for one set.
storeshot -C ./screenshots set show english-iphone-a1b2c3d4

# 3. Edit sets/<set-id>/<area-id>.html directly, or replace the hydrated
#    set document from "set show" (areas contain html strings).
storeshot -C ./screenshots set write english-iphone-a1b2c3d4 \
  --file /tmp/english-iphone.json --json

# 4. Check schemas and artboard file references.
storeshot -C ./screenshots validate --json

# 5. Render a quick preview for one screenshot area.
storeshot -C ./screenshots render --set english-iphone-a1b2c3d4 \
  --area 1 --scale 0.25 --json

# 6. Render final full-resolution PNGs.
storeshot -C ./screenshots render --set english-iphone-a1b2c3d4 --clean
```

`set show` returns a hydrated JSON document with each area's `html` string.
`set write --file -` accepts that shape from stdin; `--file <path>` accepts a
JSON file. It saves HTML files and the manifest, refreshing `updatedAt`.
For everyday design edits, edit HTML files directly. Each collection lives in
`sets/<set-id>/`. Its `index.json` stores metadata and ordered area IDs:

```json
{
  "version": 3,
  "pageId": "default",
  "specId": "iphone",
  "name": "English iPhone",
  "locale": "en-US",
  "device": "iPhone",
  "canvas": { "width": 1206, "height": 2622 },
  "areas": ["hero"],
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

Each screenshot has `sets/<set-id>/<area-id>.json` (for example,
`{ "name": "Hero" }`) and a matching `<area-id>.html`. Neither JSON document stores
file paths or its own ID: the set ID comes from the folder name and the screenshot
ID comes from its filenames. Newly created screenshot IDs are eight hexadecimal
characters. An optional descriptive slug can follow the ID: `a1b2c3d4-home-screen.json`
and `a1b2c3d4-home-screen.html` still belong to area `a1b2c3d4`. Rename the suffix on
both files together without editing the order array; metadata and artwork edits
preserve that suffix. Use one matching filename stem per ID; ambiguous pairs fail
validation. Rename a set folder without editing its contents;
use the new folder name with CLI commands. IDs must start with a lowercase letter or number and contain only lowercase
letters, numbers, or hyphens; `index` is reserved and cannot be a screenshot ID.

Add a screenshot by creating both files and adding its ID to `index.json`'s
`areas` array. Reorder screenshots by reordering that array, or use `set write`
to save a complete collection document.
Relative resource paths resolve from each HTML file. Shared resources under
`assets/` remain usable when duplicating sets. Deleting a set removes its
`index.json`; its screenshot files and resources are retained for recovery.

## Shipped asset catalog

```bash
storeshot asset search "iphone 17" --kind mockup --platform iphone --json
storeshot asset show frameup-free-iphone-17-pro --json
storeshot -C ./screenshots asset import frameup-free-iphone-17-pro tabler-sparkles --json
storeshot -C ./screenshots asset installed --json
storeshot -C ./screenshots asset inspect other/frameup-free-iphone-17-pro.svg --json
```

Search and show work without a project. Imports reuse files with matching
SHA-256 checksums, save geometry and license information locally, and require
`--replace` to overwrite different contents at the default target. `asset list`
includes local checksums; `installed` and `inspect` also recognize renamed or
manually copied files in nested asset folders. See [asset catalog](asset-catalog.md)
for metadata, geometry, and installation status semantics.

## Validation

`validate` checks schema versions, regular files and directories, set ids,
unique area ids, dimensions, artboard file existence, supported image metadata,
and locale/timestamp plausibility. App Store checks include missing required
slots, unknown destinations, slot collisions, Apple dimensions,
image counts, and consistent Watch dimensions across localizations. It does not parse arbitrary HTML/CSS resource
references; `render` checks the resources actually requested by Chrome and fails
on missing resources. Review rendered output for browser layout differences.

Warnings do not fail validation by default. Use `--strict` in CI when warnings
should also produce a non-zero exit status.

Use `validate --page PAGE_ID --json` to report one page's collection semantics
and App Store readiness. Device requirements still derive from the whole project;
other pages' readiness warnings are omitted. Shared config/assets and structural
errors (including unreadable collections on other pages) remain checked. JSON
includes `pageId`; set/area counts cover the selected page and asset counts remain
project-wide. An unknown page fails validation. Omit `--page` for the complete
project report; `--strict` works with either scope. Rendering continues to validate
the whole project.

## Rendering

`render` captures HTML artboards with headless Chrome, using the same files
shown in the browser workspace. It writes one PNG per screenshot area under
`<project>/renders/<page-id>/<locale>/<spec-id>/<collection-id>/` by default.

```bash
# Render every set at full resolution.
storeshot -C ./screenshots render

# Render selected sets into another folder.
storeshot -C ./screenshots render --set english-iphone-a1b2c3d4 \
  --set finnish-iphone-e5f6g7h8 --output ./build/app-store

# Render one area by id, exact name, or 1-based position.
storeshot -C ./screenshots render --set english-iphone-a1b2c3d4 \
  --area hero-en --scale 0.25
```

`--scale` accepts a value greater than zero and at most one. `--clean` only
removes the selected set's generated output directory before rendering; source
project files are never removed.

Install Google Chrome, or point `STORESHOT_CHROME` / `render --chrome <path>`
at a Chromium executable. No browser is downloaded with the package. The UI's
Export all languages action uses the same renderer through the local service.

Use inline CSS, local or HTTP/HTTPS stylesheets, and local or hosted `@font-face`
URLs. Normal CSS links and `@import` work with Bunny Fonts or any other provider.
JavaScript and remote images are blocked; images and fonts finish loading before
capture. Font data URLs still work too. Output dimensions are rounded after
applying `--scale`; the page is laid out at the set's original dimensions.

## Config, set, and asset commands

Common structured edits do not require hand-editing JSON:

```bash
storeshot -C ./screenshots config get

storeshot -C ./screenshots set list --json
storeshot -C ./screenshots set create --name "Finnish iPhone" \
  --locale fi --preset iphone
storeshot -C ./screenshots set update <id> --name "Finnish App Store"
storeshot -C ./screenshots set duplicate <id>
storeshot -C ./screenshots set delete <id> --yes

storeshot -C ./screenshots asset list --json
storeshot -C ./screenshots asset add ./captures/home.png \
  --category screenshots
storeshot -C ./screenshots asset set-device screenshots/home.png iphone
storeshot -C ./screenshots asset remove brand/old-logo.svg --yes
```

Asset replacement requires `--replace`. Removing an asset directly referenced by its path in HTML is blocked
unless `--force` is explicit. References constructed through CSS or alternate
URL encodings are not exhaustively detected; check those before removal. Set and asset deletion require `--yes`, which
makes destructive intent visible in agent transcripts and shell history.

Use `storeshot <command> --help` for the complete option list.

## Product pages and languages

All pages behave the same and persist their selected store. `page create`
accepts `--store app-store` (the default); Google Play is coming later.

```bash
# Device destinations are selected when creating artwork.
storeshot -C ./screenshots specs --json
storeshot -C ./screenshots page prepare default --locale en-US

# Copy all device/creative collections into a language for translation review.
storeshot -C ./screenshots page localize default --locale fi --from en-US

# Copy artwork for all devices into independent product pages.
storeshot -C ./screenshots page create --name "Travel" --source default
storeshot -C ./screenshots page list --json

# Prepare optional creative artwork at a validated Apple size.
storeshot -C ./screenshots set create --name "Brand header" --locale en-US \
  --page default --spec header
storeshot -C ./screenshots set create --name "Universal campaign" --locale fi \
  --page default --spec universal

# Render one page across all languages, or one language across pages.
storeshot -C ./screenshots render --page default
storeshot -C ./screenshots render --locale fi
```

`page prepare` fills missing required screenshot slots without replacing existing
artwork. Creation uses one fixed size per required display, including both iPhone Duo
outer and inner displays, and omits optional display slots. Source images are used for the page’s first language;
other languages start with independent drafts. Standard iPhone compositions do not
reuse Duo captures. These are draft
compositions, not finished screenshots. Edit the HTML/CSS files to finish imagery and copy. `page localize` copies source files, never translates
text automatically. Copies record their source language.

`set` is the low-level collection command. One collection occupies one page/language/
specification slot. Without `--page`, new artwork uses the first page in the project; create a page first if the project has none. `set duplicate` places its independent copy on a new product page.
Use `set update --page PAGE_ID --spec SPEC_ID` or `set write` to reassign artwork without resizing it.
Unassigned artwork remains renderable, but does not satisfy App Store coverage.

A render below scale 1 is a preview, never an upload asset. Each output directory
includes `manifest.json` with scale and destination. Browser ZIPs include
`manifest.json` with destinations and technical validation issues. Missing required
slots are warnings so iterative rendering remains possible; `validate --strict`
requires resolving those warnings. There is no manual review checklist or review status.
