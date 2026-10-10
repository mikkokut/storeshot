---
name: storeshot
description: Create or edit App Store screenshots with the StoreShot CLI, including HTML/CSS artwork, catalog asset discovery and imports, product pages, localization, live previews, and PNG exports. Use when the user wants App Store screenshot artwork; not for developing the StoreShot application itself or capturing arbitrary browser screenshots.
---

# StoreShot

Create editable, local screenshot projects and inspect the actual rendered artwork. Use the installed CLI for project operations and edit HTML/CSS for design work.

## Start the live workspace

1. Identify the screenshot project folder, existing artwork, source app captures, target languages, and intended devices from the request and files. Ask only for missing inputs that affect the result. Keep screenshot artwork in a dedicated folder.
2. Check `storeshot --version` and `storeshot --help`. If unavailable, install with `npm install --global storeshot` (Node.js 22.12+). Check subcommand `--help` before using unfamiliar options and use the installed CLI's supported commands and file formats.
3. For a new project, run `storeshot init ./screenshots`. For an existing project, inspect it before changing anything. All examples below use `./screenshots`; substitute the actual project path.
4. Start `storeshot dev ./screenshots` in a persistent terminal session. It opens the user's browser; share the URL printed by the server. Use `--port 4174` if needed, or `--no-open` if opening the URL yourself. Keep the server running during edits and handoff so the user can review. Reuse an existing server only after verifying its project folder.

The workspace watches project files and updates previews on save, including edits made by the agent. The user can browse product pages and click a screenshot for the fullscreen collection viewer while you work. Edit through files and CLI commands; browser automation is optional for inspection.

## Understand the project

```text
storeshot.json                 Product pages and their languages
assets/                       Shared captures, branding, fonts, and imported artwork
assets/.storeshot-imports.json Saved catalog metadata (created on import)
assets/.licenses/             Imported asset license texts
sets/<set-id>/index.json      Collection destination, canvas, ordered area IDs
sets/<set-id>/<area-id>.json   Screenshot metadata (name)
sets/<set-id>/<area-id>.html   One screenshot composition
```

- A product page is an independent set of artwork, for example a main listing or a campaign variation. All pages have the same capabilities. Local pages do not create or publish App Store Connect pages.
- Within a page, each language has collections for device/display screenshot destinations and optional creative placements. One **set/collection** occupies one `(pageId, locale, specId)` slot; its ordered **areas/artboards** are the individual images. Use separate collections for separate display destinations.
- Languages have independent HTML and ordering, with no implicit fallback or automatic translation. Copying a page or language creates independent compositions, but references into `assets/` remain shared. Changing a shared image or stylesheet can affect multiple collections.
- Set IDs come from folder names. Rename a set folder without editing its JSON, then use the new folder name in CLI commands. Screenshot IDs pair matching `.json` and `.html` filenames; paths and IDs are not repeated inside disk metadata. IDs start with a lowercase letter or number and use lowercase letters, numbers, or hyphens; `index` is reserved for the set manifest.
- New screenshot IDs are eight hexadecimal characters. You can append a descriptive slug to both filenames: `a1b2c3d4-home-screen.json` and `a1b2c3d4-home-screen.html` still use area ID `a1b2c3d4` in `index.json`. Rename the suffix on both files together without editing JSON; CLI saves preserve the suffix. Keep exactly one matching stem per ID, since ambiguous filenames fail validation.
- Inspect IDs and supported destinations rather than guessing them:

```bash
storeshot -C ./screenshots status --json
storeshot -C ./screenshots page list --json
storeshot -C ./screenshots specs --json
storeshot -C ./screenshots asset list --json
storeshot -C ./screenshots set show SET_ID
```

`-C` selects the project for each command. `--json` returns machine-readable results with `ok`; failures exit nonzero. `set show` without `--json` prints the hydrated document; with `--json`, extract its `set` field before feeding it to `set write`.

## Create, copy, and localize

Use IDs returned by commands in place of the uppercase tokens:

```bash
storeshot -C ./screenshots asset add ./captures/home.png --category screenshots
storeshot -C ./screenshots page create --name "Main listing"
storeshot -C ./screenshots set create --name "English iPhone" --page PAGE_ID --locale en-US --spec iphone
storeshot -C ./screenshots page prepare PAGE_ID --locale en-US
storeshot -C ./screenshots page localize PAGE_ID --locale fi --from en-US
storeshot -C ./screenshots page create --name "Travel campaign" --source PAGE_ID
```

Create only the needed pages and collections; inspect existing pages before creating another. `set create` selects the destination's fixed canvas size. `page prepare` optionally fills missing required slots without replacing existing artwork; it infers devices from artwork/source images, defaulting to iPhone. It can use matching source images for the first language, but its output is a draft. Select other intended devices explicitly with `set create --spec`.

`page localize --from` copies artwork, **not translated text**. Translate headlines and use localized app captures where available; update HTML `lang`/`dir`, check font glyph coverage, and reflow longer or right-to-left text. `set duplicate` creates its copy on a new page; it is not the language-copy command.

## Discover and import catalog assets

StoreShot ships an offline catalog of individual device frames and decorative artwork. Check `storeshot asset --help` for `search`, `show`, `import`, `inspect`, and `installed` before using this workflow; an older installed release may lack them. Use the supported CLI version rather than inventing commands or copying package-internal paths.

```bash
# Discover frames or decorations; search/show work without a project.
storeshot asset search "iphone 17" --kind mockup --platform iphone --json
storeshot asset search --kind laurels --json
storeshot asset show CATALOG_ID --json

# Install selected IDs into the chosen project.
storeshot -C ./screenshots asset import CATALOG_ID --json

# Reuse and inspect existing local copies.
storeshot -C ./screenshots asset installed --json
storeshot -C ./screenshots asset search --installed --kind mockup --json
storeshot -C ./screenshots asset inspect other/FILENAME.svg --json
```

Use IDs from search results; a catalog ID and a local asset path are different inputs. Search matches all quoted query words against names, IDs, descriptions, tags, authors, device platform, and style; exact ID/name/tag matches rank first. For checksum lookup, pass the complete 64-digit SHA-256 hash, optionally prefixed with `sha256:`, as the query. Hash fragments do not participate in text search. Kinds are `mockup`, `decor`, `lines`, and `laurels`; platforms are `iphone`, `ipad`, `mac`, and `watch`. Omit filters to broaden discovery. Import accepts multiple IDs in one command. Use `asset add SOURCE_FILE --category screenshots` for user-supplied app captures.

Read `show` before choosing a frame: it returns image dimensions, screen position/geometry, source attribution, license, and SHA-256 checksum. Read the import result's `assets[].path` for the actual project-relative file location. Prefix it with `../../` when referencing it from an artboard. Imports normally go under `assets/other/`, but reuse a checksum-identical existing file wherever it is found under `assets/`, including renamed files and nested manual copies.

Repeated imports reuse matching bytes and preserve metadata and licenses locally. A different file at the default destination requires `--replace`; use it only when replacement is intended. Multi-asset imports complete individually, so inspect results after a failure and safely retry remaining IDs. Keep `assets/.storeshot-imports.json` and `assets/.licenses/` when sharing or copying projects.

For existing artwork, use `inspect` to read the saved metadata for the actual local file. `installed` reports current matches, modified files, missing original paths, and saved versions. Review alignment before using geometry associated with modified bytes. For exact JSON field meanings and rectangular/perspective composition, read [asset geometry and import results](references/assets.md).

## Compose in HTML/CSS

Read the collection manifest and existing HTML before editing. Keep its canvas dimensions and destination consistent. Use a complete static HTML document, inline or local CSS, and an opaque background. Lay out at the manifest's full pixel dimensions, for example `html, body { margin: 0; width: 1206px; height: 2622px; overflow: hidden; }` **only for a canvas of that size**. Flexbox, Grid, absolute positioning, transforms, and SVG work normally.

For device treatments, floating cards, or artwork spanning adjacent screenshots, read [compositing recipes](references/compositing.md). Choose a CSS shell when the reference uses a simple border/gradient; use catalog geometry when a physical device frame matters. The recipes are editable starting points, not required layouts.

For complete worked layouts, consult the [example gallery](references/examples.md): a soft gradient shell, cropped device stack, floating cards, and a two-shot tablet panorama. Open its bundled overview and relevant JPEG previews first; they let you compare techniques without running StoreShot. Read only the matching example source, then adapt it in the user's project. Each example project is self-contained with generic screen placeholders and local fonts. Keep the skill originals intact, replace illustrative copy/screens as requested, and render the adapted artwork before handoff. Skip the gallery when the task does not benefit from these layouts.

- Reference captures relative to the artboard: `<img src="../../assets/screenshots/home.png">`. Keep resources inside the project. Use `object-fit: contain` to preserve app UI unless an intentional crop improves the composition.
- JavaScript, nested frames, and remote images are blocked. Use local images or embedded data URLs. HTTP/HTTPS stylesheets and fonts are supported, but local fonts under `assets/other/` with `@font-face` give more reproducible exports.
- Put the chosen local font first in `font-family`, ahead of `ui-rounded`, `system-ui`, or other system aliases. Declare the actual weight/style of each font file (or supported range for variable fonts), and use those weights explicitly. For reference matching, `font-synthesis: none` avoids fabricated bold/italic; supply the intended face rather than relying on synthesis. Check glyph coverage and rendered wrapping for each language: `document.fonts.ready` alone does not prove the intended font was selected. See the [local typography example](references/compositing.md#local-typography).
- For imported frames, use the saved screen geometry and actual local image path. Read [asset geometry and import results](references/assets.md) for clipping, scaling, and perspective transforms.
- Lead with a clear user benefit, use real supplied app captures, and give each image a focused message. Keep typography, margins, background, and device scale consistent across a sequence. Do not invent app functionality or treat draft placeholders as finished artwork.
- Add an image by choosing a unique short ID, creating `<area-id>[-slug].html` and matching `<area-id>[-slug].json` containing `{ "name": "Screenshot title" }` in the set folder, then adding its ID to `index.json`'s `areas` array (for example, `["a1b2c3d4", "e5f6a7b8"]`). Array order controls screenshot order; unlisted files will not export. Update the order array only when changing the ID itself.
- For structural edits, `set show SET_ID` → edit the hydrated JSON → `set write SET_ID --file /tmp/updated-set.json` saves HTML and metadata together. Hydrated areas contain `id`, `name`, and `html`; on disk, `index.json` lists area IDs and each area's JSON contains its name. Preserve unrelated fields and artwork.

## Validate, inspect, export

```bash
storeshot -C ./screenshots validate --json
# Focus readiness checks on one page while retaining shared project checks:
storeshot -C ./screenshots validate --page PAGE_ID --json
storeshot -C ./screenshots render --set SET_ID --area 1 --scale 0.25 --output ./preview-output --json
storeshot -C ./screenshots render --set SET_ID --scale 1 --clean --json
# Or export the complete page across languages:
storeshot -C ./screenshots render --page PAGE_ID --scale 1 --json
```

`--area` accepts an ID, exact name, or 1-based position. Render requires Chrome/Chromium; use `--chrome /path/to/chrome` or `STORESHOT_CHROME` for a nonstandard installation. npm does not install the browser. Rendering waits for fonts/images and reports missing requested resources. Schema validation alone cannot detect broken HTML/CSS resource references or visual defects.

Open the generated preview image, inspect it, and iterate. Check headline wrapping, clipping, real app content, frame alignment, contrast, and consistency. Review every changed language/destination and inspect full-resolution output for final typography. Use a separate preview output directory so reduced-size renders cannot overwrite final PNGs. Scales below 1 are previews, never upload assets.

Final PNGs default to `renders/<page-id>/<locale>/<spec-id>/<collection-id>/`, with `manifest.json` recording destination and scale. `--clean` removes selected generated output, not source artwork. Validate again before handoff; resolve relevant warnings or report remaining gaps. `validate --strict` also fails on warnings, including missing required slots. Technical validation does not imply Apple approval.

`validate --page` reports the selected page's readiness using project-wide device requirements. Shared assets/config and structural errors in any collection remain visible; it is not a complete project readiness report. Unknown page IDs fail. Check `validate --help` for support in the installed release.

Hand off the live workspace URL, edited destinations/languages, and final output paths; mention any missing captures, unfinished translations, or blocked renders. Upload/submission to App Store Connect is separate from creating screenshots.

For less common flags, consult `storeshot COMMAND --help`.
