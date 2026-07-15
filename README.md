# Appshot

Appshot is a local-first TypeScript CLI for creating and managing app store
screenshots. It combines a reusable asset catalog with language/device-specific
screenshot sets and an editable multi-area canvas.

## Start developing

```bash
npm install
npm run dev
```

The development command runs the CLI against the ignored `playground/` folder
at `http://localhost:4173`. The CLI process restarts when server-side TypeScript
changes, while Vite hot-reloads frontend changes. Appshot-managed files never
pollute the CLI repository root.

To exercise the command against a separate project folder:

```bash
npm run appshot -- dev /path/to/my-screenshot-project --no-open
```

Or build and link the real executable:

```bash
npm run build
npm link
appshot dev /path/to/my-screenshot-project
```

## Local project format

Running `appshot dev` creates these files in the selected directory:

```text
my-screenshot-project/
├── appshot.json
├── assets/
│   ├── screenshots/
│   │   ├── home.png
│   │   └── settings.png
│   ├── brand/
│   ├── logos/
│   └── other/
└── sets/
    ├── english-iphone-a1b2c3d4.json
    └── finnish-iphone-e5f6g7h8.json
```

Each set describes one language/device combination, its output dimensions, its
ordered screenshot areas, and the text/image layers placed on those areas. The
browser UI reads and writes only these local files. There is no account,
database, cloud service, or remote backend.

## Current editor features

- Asset catalog categories for raw screenshots, brand artwork, logos, and other
  reusable images
- Separate screenshot sets per locale and device
- Multiple ordered App Store screenshot areas in each set
- Editable area names and background colors
- Movable text and image layers with pixel-based geometry
- Text content, size, weight, color, alignment, and image-fit controls
- Automatic persistence to readable JSON files

## Commands

```text
appshot dev [directory] [--port 4173] [--host 127.0.0.1] [--no-open]
```

Useful project scripts:

- `npm run dev` — watch the CLI and serve the frontend with Vite HMR
- `npm run appshot -- ...` — run the unbuilt CLI directly
- `npm run typecheck` — check all TypeScript
- `npm run build` — build the executable and static frontend
- `npm run check` — typecheck and build

## Codex development environment

The repository includes shared Codex setup:

- `AGENTS.md` documents the architecture, commands, and verification rules.
- `.codex/config.toml` applies conservative repository-scoped permissions when
  the project is trusted.
- `.codex/environments/environment.toml` installs dependencies and builds new
  worktrees, and adds **Run Appshot**, **Check**, and **Build** actions to the
  Codex desktop app.

Trust the project when Codex prompts you so that its project-local configuration
and actions can load.
