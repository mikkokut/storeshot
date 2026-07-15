# Appshot repository guide

## Project overview

Appshot is a local-first TypeScript CLI for managing app store screenshots.
Running `appshot dev` serves a React workspace for the selected directory. All
project data remains in `appshot.json` and `screenshots/`; do not introduce a
remote backend, account system, or database unless the user explicitly asks for
one.

## Development commands

- Install exact dependencies with `npm ci`.
- Start the watch-mode CLI and Vite UI with `npm run dev`.
- Run the unbuilt CLI against another folder with
  `npm run appshot -- dev /path/to/project --no-open`.
- Type-check with `npm run typecheck`.
- Build the CLI and frontend with `npm run build`.
- Run the full validation gate with `npm run check`.

Use Node.js 22.12 or newer and npm. Keep `package-lock.json` synchronized with
`package.json`.

## Repository map

- `src/cli.ts` defines the `appshot` command and its options.
- `src/server.ts` contains the local HTTP service and file-backed API.
- `src/project-store.ts` owns `appshot.json` and screenshot asset access.
- `src/shared.ts` contains types shared by the CLI service and UI.
- `src/ui/` contains the Vite, React, Tailwind CSS, and shadcn-style frontend.
- `src/ui/components/ui/` contains source-owned shadcn UI primitives.

## Implementation expectations

- The project is under active development. Changes do not need to be backward
  compatible; prefer clean architecture and maintainable code over preserving
  legacy behavior or interfaces.
- Keep the product local-first and folder-based.
- Treat the directory passed to `appshot dev` as the project boundary. Prevent
  path traversal and do not expose unrelated filesystem contents.
- Keep Node-only code out of the browser bundle and browser-only code out of
  the CLI runtime.
- Preserve strict TypeScript and shared request/response types.
- Prefer small source-owned shadcn components over adding a large UI framework.
- Avoid new production dependencies when a small Node or browser API is enough.
- Never commit generated `dist/`, `node_modules/`, local `appshot.json`, or the
  local `screenshots/` test folder.

## Verification

Run `npm run check` after code or configuration changes. For behavior that
touches the local service, also smoke-test the relevant API or run
`npm run appshot -- dev <temporary-directory> --no-open`. For meaningful UI
changes, verify the rendered page in a browser in addition to building it.

Keep commits focused. Do not commit or push unless the user requests it.
