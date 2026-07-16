# StoreShot repository guide

## Project overview

StoreShot is a local-first TypeScript CLI for managing app store screenshots.
Running `storeshot dev` serves a React workspace for the selected directory. All
project data remains in `storeshot.json`, `assets/`, and `sets/`; do not introduce
a remote backend, account system, or database unless the user explicitly asks
for one.

## Development commands

- Install exact dependencies with `npm ci`.
- Start the watch-mode CLI and Vite UI against the ignored `playground/`
  project with `npm run dev`.
- Run the unbuilt CLI against another folder with
  `npm run storeshot -- dev /path/to/project --no-open`.
- Type-check with `npm run typecheck`.
- Build the CLI and frontend with `npm run build`.
- Run the full validation gate with `npm run check`.

Use Node.js 22.12 or newer and npm. Keep `package-lock.json` synchronized with
`package.json`.

## Repository map

- `src/cli.ts` defines the `storeshot` command and its options.
- `src/server.ts` contains the local HTTP service and file-backed API.
- `src/project-store.ts` owns `storeshot.json`, the asset catalog, and screenshot
  set documents.
- `src/shared.ts` contains types shared by the CLI service and UI.
- `src/ui/` contains the Vite, React, Tailwind CSS, and shadcn-style frontend.
- `src/ui/components/ui/` contains source-owned shadcn UI primitives.

## Implementation expectations

- The project is under active development. Changes do not need to be backward
  compatible; prefer clean architecture and maintainable code over preserving
  legacy behavior or interfaces.
- Keep the product local-first and folder-based.
- Treat the directory passed to `storeshot dev` as the project boundary. Prevent
  path traversal and do not expose unrelated filesystem contents.
- Keep Node-only code out of the browser bundle and browser-only code out of
  the CLI runtime.
- Preserve strict TypeScript and shared request/response types.
- Prefer source-owned shadcn components over completely custom UI controls.
  Before building an interactive control, check whether the shadcn registry has
  a suitable primitive and use it when practical. Keep components aligned with
  this project's Nova style and Base UI foundation; use native or custom
  controls only when shadcn has no appropriate equivalent.
- Avoid new production dependencies when a small Node or browser API is enough.
- Never commit generated `dist/`, `node_modules/`, or files inside the local
  `playground/` project. The root `mockup-bundles/` directory is also an ignored
  local archive and must not be committed; distributable built-in bundles live
  under `src/ui/public/mockup-bundles/`. Keep `playground/.gitkeep` so fresh
  checkouts have the expected development target.

## Commit and release guidance

Release Please generates versions and changelog entries from commits on `main`.
Before creating or proposing a commit, follow the official
[Release Please commit guidance](https://github.com/googleapis/release-please#how-should-i-write-my-commits)
and these repository rules:

- Use Conventional Commit subjects in the form `type(optional-scope): summary`.
  Keep the summary concise, imperative, and meaningful to users.
- Use `fix:` for a user-visible bug fix; it requests a SemVer patch release.
- Use `feat:` for a user-visible feature; it requests a SemVer minor release.
- Use `deps:` for a dependency update that should be included in a release.
- Use `type!:` or a `BREAKING CHANGE:` footer for a breaking change. Examples
  include `feat!:` and `refactor!:`. While StoreShot is below `1.0.0`, the
  Release Please configuration converts breaking releases into minor bumps.
- Use non-releasing types such as `docs:`, `test:`, `ci:`, `build:`, `chore:`,
  and `refactor:` when the change should not itself trigger a release. Adding
  `!` still marks any type as breaking and therefore releasable.
- Prefer one focused commit per user-facing change. For pull requests, prefer a
  squash merge and make the squash title the intended Conventional Commit so
  intermediate development commits do not pollute the changelog.
- If one squash commit must describe multiple releasable changes, add additional
  Conventional Commit messages as footers at the bottom of the commit message,
  as documented by Release Please.
- Add a `Release-As: X.Y.Z` footer only when the user explicitly requests that
  exact next version. Do not infer or force an exact release version.
- Release Please owns `package.json` and `package-lock.json` version bumps,
  released `CHANGELOG.md` sections, release tags, and GitHub Releases. Do not run
  `npm version`, manually create release tags, or hand-edit a released changelog
  section unless the user explicitly asks for a release-recovery operation.

Examples:

```text
fix(server): reject paths outside the project
feat(editor): add Android screenshot sets
docs: explain custom mockup bundles
feat!: replace the project document schema
```

## Verification

Run `npm run check` after code or configuration changes. For behavior that
touches the local service, also smoke-test the relevant API or run
`npm run storeshot -- dev <temporary-directory> --no-open`. For meaningful UI
changes, verify the rendered page in a browser in addition to building it.

Keep commits focused. Do not commit or push unless the user requests it.
