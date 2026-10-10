# StoreShot

StoreShot is a local-first CLI and live preview workspace for creating App Store
screenshots and creative assets, organized around App Store Connect. Each artboard is an ordinary HTML file with CSS. Edit files with
your editor or coding agent, watch the browser preview update on save, and render
full-resolution PNGs with headless Chrome.

> **Pre-release:** StoreShot is under active development, changes quickly, and
> does not yet promise backward compatibility. It supports Apple App Store
> screenshots today; Google Play support is planned.

StoreShot is already used in production for the iOS app
[Lokimaps](https://www.lokimaps.com/).

## Why StoreShot?

The project is a folder of HTML, JSON metadata, and assets. Browser-native layout
supports CSS Grid, Flexbox, typography, transforms, and SVG without a canvas layer
model. There is no account, database, hosted project, or remote backend.

## What it can do

- Organize product pages with independent languages and artwork for every device.
- Prepare required device screenshots at one fixed size for iPhone, iPad, Apple Watch, Mac, Apple TV, and Vision Pro.
- Create Product Page Header, Search Results, and Universal Creative images with Apple’s accepted dimensions.
- Copy artwork into another language or audience variation as independent compositions.
- See missing required slots, invalid dimensions, and Watch consistency issues before upload.
- Compose artwork in HTML/CSS with your editor or agent; click a screenshot to review the full collection in a fullscreen viewer.
- Export ordered PNGs grouped by page, language, and destination, with an export manifest.

StoreShot prepares **still images** locally. Uploading/submitting to Apple, running
live experiments, analytics, app previews (video), and app icons remain in App Store
Connect or Apple’s authoring tools.

See [App Store workspace architecture and Apple references](docs/app-store-workspace.md)
for the model, specifications, and workflow.

## Quick start

StoreShot requires Node.js 22.12 or newer. PNG export also requires Google Chrome
or Chromium. Set `STORESHOT_CHROME=/path/to/chrome` for a nonstandard installation;
the CLI also accepts `render --chrome /path/to/chrome`. Chrome is not downloaded
by npm install.

```bash
npm install --global storeshot
mkdir app-store-screenshots
storeshot init app-store-screenshots
storeshot dev app-store-screenshots
```

The command opens a local workspace at `http://127.0.0.1:4173`. To use a
different port or avoid opening the browser:

```bash
storeshot dev ./app-store-screenshots --port 4174 --no-open
```

The default server is bound to the loopback interface. Be deliberate when using
`--host` to expose it to another interface.

## CLI and AI agents

StoreShot supports the full screenshot workflow without requiring browser
automation. Commands can inspect the project, create and update sets, manage
assets, validate project structure, and render real PNG previews or final
output. Global `-C/--project` selects the project and `--json` provides stable
machine-readable results.

```bash
storeshot -C ./app-store-screenshots status --json
storeshot -C ./app-store-screenshots validate --json
storeshot -C ./app-store-screenshots set show <set-id>
storeshot -C ./app-store-screenshots render --set <set-id> --scale 0.25 --json
```

When `storeshot dev` is open, CLI and direct filesystem changes are streamed to
the browser so the selected set and preview update in realtime. See the
[CLI and agent workflow](docs/cli.md) for the complete command surface and a
recommended inspect-edit-validate-render loop.

## Project format

StoreShot creates a transparent, portable project structure:

```text
app-store-screenshots/
├── storeshot.json
├── assets/
│   ├── screenshots/
│   ├── brand/
│   ├── other/
│   ├── .storeshot-imports.json   # Created when importing catalog assets
│   └── .licenses/
└── sets/
    └── english-iphone-a1b2c3d4/
        ├── index.json
        ├── area-one.json
        ├── area-one.html
        ├── area-two.json
        └── area-two.html
```

CLI renders are written to `renders/<page>/<locale>/<spec>/<collection-id>/` by default. They are generated
output; teams can commit or ignore them according to their release workflow.

The version 2 project config stores product pages and their languages. New pages start without a language; choose one when creating the first screenshot
or artwork. Device destinations are selected per collection. Each version 3 collection manifest stores its `pageId`,
`specId`, locale, pixel dimensions, and
ordered artboard IDs. Each artboard has its own `<area-id>.json` metadata and
`<area-id>.html` composition. The set ID comes from its folder name; rename the
folder without changing JSON. New screenshot IDs are eight characters; an optional
slug makes filenames descriptive, for example `a1b2c3d4-home-screen.json` and
`a1b2c3d4-home-screen.html`. Renaming that suffix on both files preserves the ID
and needs no JSON edits. File paths are inferred from these IDs. The HTML files are the source of truth; there
is no embedded layer JSON. Reference assets from an artboard with paths such as
`../../assets/screenshots/home.png`. Inline CSS is encouraged; local CSS, SVG,
and fonts also work. Put fonts in `assets/other/` and use `@font-face`.

Previews and exports render static HTML/CSS. External HTTP/HTTPS stylesheets and
fonts are supported from any provider, including ordinary Bunny Fonts links:

```html
<link rel="stylesheet" href="https://fonts.bunny.net/css?family=geist:400,700&display=swap">
<style>body { font-family: 'Geist', sans-serif; }</style>
```

Scripts, nested frames, and remote images remain blocked. Keep images in the
project or embed them as data URLs. Hosted fonts need network access when uncached.
The renderer waits for images and fonts before capturing the set's exact viewport.
Use local fonts for consistent typography across machines.

## Shipped assets

Search and import individual device frames, laurels, lines, and decorative images:

```bash
storeshot asset search "iphone 17" --kind mockup --json
storeshot asset show frameup-free-iphone-17-pro --json
storeshot -C ./screenshots asset import frameup-free-iphone-17-pro
storeshot -C ./screenshots asset installed --json
storeshot -C ./screenshots asset inspect other/frameup-free-iphone-17-pro.svg --json
```

Imports are ordinary images under `assets/other/`, with locally saved geometry,
source attribution, and licenses. SHA-256 matching identifies existing copies
regardless of filenames and reports changed imports. Frames come from the
MIT-licensed FrameUp Free project. See [the asset catalog](docs/asset-catalog.md)
for rendering geometry, checksum behavior, and adding new shipped assets.

## Develop from source

From a checkout of this repository or your fork:

```bash
npm ci
npm run dev
```

`npm run dev` starts the CLI in watch mode against the ignored `playground/`
project and serves the React UI with Vite hot reload.

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the development CLI and UI against `playground/` |
| `npm run dev:website` | Preview the static website with Vite hot reload |
| `npm run storeshot -- dev <dir> --no-open` | Run the unbuilt CLI against another folder |
| `npm run typecheck` | Type-check the project |
| `npm run build` | Build the CLI and browser UI |
| `npm run licenses` | Regenerate bundled dependency license texts |
| `npm run check` | Run license and catalog checks, type-checks, tests, and production builds |

The repository also includes `AGENTS.md` and project-local Codex configuration
for agent-assisted development.

Maintainers can follow the [release guide](docs/releasing.md) to publish a new
version through npm trusted publishing and GitHub Actions.

## Contributing and security

StoreShot is early software, and focused issues and pull requests are welcome.
Read [CONTRIBUTING.md](CONTRIBUTING.md) before making a substantial change. Please
report vulnerabilities according to [SECURITY.md](SECURITY.md), not in a public
issue.

## License

StoreShot is released under the [MIT License](LICENSE).

Third-party packages, fonts, icons, and device frames retain their own licenses.
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
[THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt) for attribution and license
details. StoreShot is not affiliated with or endorsed by Apple Inc. Apple,
App Store, iPhone, iPad, Apple Watch, and Mac are trademarks of Apple Inc.
