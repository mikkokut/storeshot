# StoreShot

StoreShot is a local-first, agent-native CLI and visual editor for creating
App Store screenshots. Run it in a folder, edit screenshot sets in the browser,
and keep the complete project as ordinary assets and JSON files that humans,
scripts, and AI coding agents can all inspect and change.

> **Pre-release:** StoreShot is currently at `0.1.0`. It is under active
> development, changes quickly, and does not yet promise backward compatibility.
> It supports Apple App Store screenshots today; Google Play support is planned.

StoreShot is already used in production for the iOS app
[Lokimaps](https://www.lokimaps.com/).

## Why StoreShot?

Many existing screenshot tools were designed as closed, manual design silos.
Their project data is difficult to inspect, version, automate, or hand to an AI
agent, which makes routine localization and release work unnecessarily awkward.

StoreShot keeps the workflow open and file-based. The visual editor is useful
for hands-on design, while the same project can be reviewed, generated, or
updated by an agent through normal filesystem tools. There is no account,
database, hosted project, or remote backend.

## What it can do

- Organize raw screenshots, brand artwork, logos, and reusable image assets.
- Create ordered screenshot sets for a locale and Apple device family.
- Arrange text, shapes, images, recolorable artwork, and device mockups on a
  free-form canvas.
- Use undo/redo, copy/paste, alignment guides, layers, keyboard movement, and
  canvas zoom.
- Export an entire set as full-resolution PNG files in a ZIP archive.
- Import portable device-mockup bundles with explicit frame geometry and license
  metadata.
- Persist everything inside the selected project directory.

## Quick start

StoreShot requires Node.js 22.12 or newer.

```bash
npm install --global storeshot
mkdir app-store-screenshots
storeshot dev app-store-screenshots
```

The command opens a local workspace at `http://127.0.0.1:4173`. To use a
different port or avoid opening the browser:

```bash
storeshot dev ./app-store-screenshots --port 4174 --no-open
```

The default server is bound to the loopback interface. Be deliberate when using
`--host` to expose it to another interface.

## Project format

StoreShot creates a transparent, portable project structure:

```text
app-store-screenshots/
├── storeshot.json
├── assets/
│   ├── screenshots/
│   ├── brand/
│   ├── logos/
│   └── other/
├── mockup-bundles/
│   └── my-device-frames/
│       ├── storeshot-mockups.json
│       ├── LICENSE
│       └── assets/
└── sets/
    ├── english-iphone-a1b2c3d4.json
    └── finnish-iphone-e5f6g7h8.json
```

Each set stores its locale, device, output dimensions, ordered screenshots, and
canvas layers. StoreShot only serves files inside the selected project boundary.
Project assets and imported bundles remain subject to their own licenses.

The editor can load fonts from [Bunny Fonts](https://fonts.bunny.net/) on demand.
The project itself remains local, but selecting a hosted font requires a network
request to Bunny Fonts.

## Device mockups

The built-in Apple frames come from the MIT-licensed
[FrameUp Free](https://github.com/amirmun99/FrameUp-Free) project. StoreShot also
supports project-local bundles and lets users import all or selected frames.

See the [mockup bundle format](docs/mockup-bundles.md) for the manifest and
geometry specification.

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
| `npm run storeshot -- dev <dir> --no-open` | Run the unbuilt CLI against another folder |
| `npm run typecheck` | Type-check the project |
| `npm run build` | Build the CLI and browser UI |
| `npm run licenses` | Regenerate bundled dependency license texts |
| `npm run check` | Run license, type, and production-build validation |

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
