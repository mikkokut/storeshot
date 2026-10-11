# Project model and CLI operations

Read this before structural work: creating or copying pages, languages, or
collections; adding, ordering, or removing screenshots; validating; rendering.
Every command accepts `-C <project-dir>` to select the project, and `--json` for
machine-readable output. A failed command exits nonzero; with `--json` it prints
`{ "ok": false, "error": { "message" } }`.

Contents: layout · concepts and invariants · destinations · languages ·
inspect · captures · pages and collections · artboards · operations without
commands · validate · render · live workspace.

## Layout

```text
storeshot.json                    { version: 2, pages: [{ id, name, store, localizations }] }
assets/screenshots|brand|other/   Shared images, stylesheets, fonts (category folders)
assets/.storeshot-imports.json    Catalog import metadata (keep when copying projects)
assets/.licenses/                 Imported asset licenses (keep)
sets/<set-id>/index.json          One collection: pageId, locale, specId, canvas, ordered areas
sets/<set-id>/<area-id>[-slug].json   { "name": "..." } for one screenshot
sets/<set-id>/<area-id>[-slug].html   That screenshot's complete HTML document
renders/                          Generated PNGs (safe to regenerate)
```

## Concepts and invariants

- **Product page:** an independent set of artwork, such as the main listing or a
  campaign variant. All pages have the same capabilities. Discover page IDs with
  `page list --json`; never assume a fixed ID. Local pages never create or publish
  anything in App Store Connect.
- **Collection (set):** the images for one `(pageId, locale, specId)` slot. Only
  one collection can occupy a slot. Set IDs are folder names (`<name-slug>-<8 hex>`
  when created by the CLI). Renaming the folder renames the set; no JSON edit is
  needed.
- **Artboard (area):** one image. Its ID comes from its filename stem: a
  lowercase letter or digit, then lowercase letters, digits, or hyphens. `index`
  is reserved. New IDs are 8 hex characters, optionally followed by a slug:
  `a1b2c3d4-home.html` and `a1b2c3d4-home.json` are area `a1b2c3d4`. Keep exactly
  one matching `.html`/`.json` pair per ID. The order of `index.json`'s `areas`
  array is the screenshot order. Files not listed there are ignored and are not
  exported.
- **Required devices are project-wide.** Any collection for a device (iPhone,
  iPad, Watch, Mac, TV, Vision) makes that device's required destination expected
  in every language of every page. Missing slots produce validation warnings.
- **Copies are independent; `assets/` is shared.** Copying a page or language
  duplicates the set folders (including any set-local files) but keeps
  references into `assets/`. Editing a shared stylesheet or image affects every
  collection that uses it. This is useful for a consistent system and risky for
  per-language changes.
- **Artboard sandbox.** JavaScript, iframes, and remote images are blocked.
  Remote stylesheets and fonts load; local fonts are more reproducible. Local
  resources must be under `sets/` or `assets/`, must not have dot-prefixed path
  segments, and cannot be symlinks. Allowed types are `.css`, `.png`, `.jpg`,
  `.jpeg`, `.webp`, `.svg`, `.woff`, `.woff2`, `.ttf`, and `.otf`. Data URLs work.
  Relative URLs resolve from the HTML file, so artboards reach assets via
  `../../assets/...`. URLs inside a stylesheet resolve from the stylesheet.

## Destinations

Use these IDs with `set create --spec`. Check `storeshot specs --json` and
`set create --help` against the installed release rather than treating this
table as permanent. `specs` lists every accepted size, including legacy sizes
that existing artwork may use; the creation choices are narrower. Let
`set create` choose the canvas and read its result before composing artwork.

| Workspace display name | Spec ID | Canvas | Notes |
| --- | --- | --- | --- |
| iPhone · Dynamic Island, medium | `iphone` | 1206 × 2622 | Required for iPhone apps |
| iPad · 13-inch display | `ipad` | 2064 × 2752 | Required for iPad apps |
| Apple Watch | `watch` | 422 × 514 | Every Watch collection reuses the first one's size |
| Mac | `mac` | 2880 × 1800 | 16:10 landscape |
| Apple TV | `tv` | 3840 × 2160 | |
| Apple Vision Pro | `vision` | 3840 × 2160 | |
| iPhone Duo · Outer display | `iphone-duo-outer` | 1398 × 2034 | Upcoming (April 2027, iOS 27.1 SDK); create only when wanted |
| iPhone Duo · Inner display | `iphone-duo-inner` | 2007 × 2853 | Upcoming, as above |
| Product Page Header | `header` | 3840 × 1646 | Optional creative, iOS/iPadOS 27+, 1 image |
| Search Results | `search-results` | 3840 × 2560 | Optional creative, 3:2, 1 image |
| Universal Creative | `universal` | 5244 × 2950 | One image usable for both Header and Search Results |

Screenshot destinations hold 1–10 images. Creative placements hold exactly one.
App Store Connect scales the required sizes down for smaller displays.

## Languages

Locale codes must be App Store localizations: `ar-SA bn ca zh-Hans zh-Hant hr cs
da nl-NL en-AU en-CA en-GB en-US fi fr-FR fr-CA de-DE el gu he hi hu id it ja kn ko
ms ml mr no or pl pt-BR pt-PT pa ro ru sk sl es-MX es-ES sv ta te th tr uk ur vi`.
Map the user's language names to these codes (for example, German → `de-DE`,
Spanish for Latin America → `es-MX`) without asking. There is no fallback
between languages and no automatic translation.

## Inspect

```bash
storeshot -C DIR status --json      # pages + languages, readiness issues, sets (id, locale, canvas, count)
storeshot -C DIR page list --json   # { pages }
storeshot -C DIR set show SET_ID    # hydrated document; with --json it is wrapped in { set, path }
storeshot -C DIR asset list --json  # local assets with dimensions and checksums
```

`status` does not show each set's `pageId`/`specId`; read `sets/*/index.json`
for those. `set list --json` returns full documents, including all HTML, which
is large.

## Captures and other local files

```bash
storeshot -C DIR asset add ./captures/*.png --category screenshots
storeshot -C DIR asset add ./brand/logo.svg --category brand
storeshot -C DIR asset set-device screenshots/home.png ipad   # or iphone|mac|watch|auto
```

`asset add` copies files using their basename, rejects names that already
exist (pass `--replace` only when replacing is intended), and accepts PNG,
JPEG, WebP, and SVG. Convert HEIC first, for example with `sips -s format png`
on macOS. Short kebab-case filenames keep HTML references simple; encode spaces
as `%20` otherwise. StoreShot classifies device from capture dimensions. Use
`set-device` only when that guess is wrong. You can also place stylesheets and
fonts directly under `assets/other/`.

`asset remove ID... --yes` refuses assets that HTML references directly, unless
you pass `--force`. Check CSS `url()` references yourself before removing.

## Pages and collections

```bash
storeshot -C DIR set create --name "English iPhone" --page PAGE_ID --locale en-US --spec iphone --json
storeshot -C DIR page prepare PAGE_ID --locale en-US --json
storeshot -C DIR page localize PAGE_ID --locale de-DE --from en-US
storeshot -C DIR page create --name "Travel campaign" --source PAGE_ID --json
storeshot -C DIR set update SET_ID --name "..." [--locale L] [--page P] [--spec S]
storeshot -C DIR set duplicate SET_ID
storeshot -C DIR set delete SET_ID --yes
```

- `set create` adds the locale to the page if it is missing. It creates one blank
  white artboard named "Screenshot 1" at the destination's canvas. Its template
  sets the exact canvas size, zero margins, border-box sizing, system fonts,
  `line-height: 1.5`, and `img, svg { display: block; max-width: 100% }`. Replace
  the template or override it. `--page` defaults to the first page. The JSON
  result includes the new set and its area ID.
- `page prepare` fills missing *required* slots for the devices implied by
  existing artwork and capture dimensions (iPhone if neither exists). It never
  replaces anything. For the page's first language, it places up to 10 matching
  captures as plain, fitted artboards named after the files. Other languages get
  blank drafts. The result is a starting point, not finished design. It never
  creates Duo or creative slots.
- `page localize --from` copies all of that language's collections into the new
  language; the text stays untranslated. Without `--from`, it only adds an empty
  language. It fails if the page already has that language.
- `page create --source` copies every collection of the source page into a new
  page with the same languages. Without `--source`, the new page is empty.
- `set update --spec/--page` reassigns a collection without resizing it.
- `set duplicate` puts its copy on a *new* page named "<set name> copy". It is
  not a language copy.
- `set delete` removes only `index.json`. The artboard files stay on disk for
  recovery.

## Artboards

- **Edit:** write the `.html` file directly. The preview updates on save.
- **Add:** create `<id>-<slug>.html` and `<id>-<slug>.json` (`{ "name": "Home screen" }`)
  in the set folder, then append the ID to `index.json` `areas`.
- **Reorder:** reorder the `areas` array.
- **Rename:** edit the `.json` name. The name becomes the export filename
  (`NN-<name>.png`). You can rename the slug on both files at once; no array edit
  is needed.
- **Remove from the sequence:** drop the ID from `areas`. Delete the two files
  too if the user wants them gone.
- **Whole-collection rewrite:** `set show SET_ID > /tmp/set.json`, edit it, then
  `set write SET_ID --file /tmp/set.json --json` (or `--file -` for stdin). The
  document's `id` must match. Areas are `{ id, name, html }`. The write checks the
  destination's size and image count, preserves filename slugs, and leaves
  dropped artboards' files on disk.

## Operations without a CLI command

The workspace UI can rename pages, remove languages, and remove pages. To do
these yourself, edit the files:

- **Rename a page:** change its `name` in `storeshot.json`.
- **Remove a language from a page:** `set delete --yes` each collection with that
  `pageId` and `locale`, then remove the code from the page's `localizations`.
- **Remove a page:** delete its collections the same way, then remove the page
  entry.

Run `validate` afterward.

## Validate

```bash
storeshot -C DIR validate --json                 # whole project
storeshot -C DIR validate --page PAGE_ID --json  # one page's readiness + shared checks
storeshot -C DIR validate --strict --json        # warnings also fail
```

Validation checks schemas, IDs, file pairs, canvas sizes, destinations, slot
collisions, image counts, locales, Watch size consistency, and modified or missing
catalog imports. Missing required slots are warnings. It does **not** check
HTML/CSS references or visual quality; rendering detects missing resources.
Passing validation says nothing about Apple's review.

## Render

```bash
storeshot -C DIR render --set SET_ID --area 2 --scale 0.5 --output /tmp/storeshot-preview --json
storeshot -C DIR render --page PAGE_ID --clean --json     # all languages of a page, full size
storeshot -C DIR render --locale de-DE --json             # one language across pages
storeshot -C DIR render --json                            # everything
```

- `--set` can be repeated. `--area` (ID, exact name, or 1-based position) works
  only with a single set. `--scale` must be greater than 0 and at most 1; the
  layout always uses the full canvas.
- Output path: `<output or DIR/renders>/<page>/<locale>/<spec>/<set>/NN-<name>.png`,
  plus `manifest.json` (`scale`, `previewOnly`). The output must not be the
  project root or inside `sets/` or `assets/`. Keep previews in a separate
  output directory so they never mix with finals.
- `--clean` deletes the selected sets' previous output folders first, which
  removes stale files after reordering or renaming. It never touches the source.
- `render` validates the whole project first and refuses to run on errors.
  Warnings are returned with the result. It fails if an artboard requests a
  missing or blocked resource. The result lists `render.files[]` with `path`,
  `width`, and `height`.
- It needs Google Chrome; for another Chromium browser, use `--chrome PATH` or
  `STORESHOT_CHROME`. JavaScript is disabled during capture. Rendering waits for
  fonts and images.

## Live workspace

`storeshot dev [DIR] [--port 4173] [--no-open]` initializes `DIR` if needed and
serves the workspace at `http://127.0.0.1:<port>`. With `--json`, it prints
`{ ok, url, directory }`. It runs until stopped and watches `storeshot.json`,
`sets/`, and `assets/`, so agent edits appear without a restart. It fails if the
port is in use. `GET /api/project` on a running server returns its `directory`.
The workspace offers preview zoom, per-language review, PNG/ZIP export, and
annotation: users click or select text, comment, and copy a prompt for you.
Creating screenshots and languages happens only through you.
