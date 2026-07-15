# Appshot

Appshot is a local-first TypeScript CLI for managing app store screenshots. This
repository contains the smallest usable foundation: a CLI, a local file store,
and a React + shadcn/ui-style workspace.

## Start developing

```bash
npm install
npm run dev
```

The development command runs the CLI against this directory at
`http://localhost:4173`. The CLI process restarts when server-side TypeScript
changes, while Vite hot-reloads frontend changes.

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
└── screenshots/
    ├── home.png
    └── settings.png
```

The browser UI reads and writes only these local files. There is no account,
database, cloud service, or remote backend.

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
