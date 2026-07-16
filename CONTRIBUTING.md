# Contributing to StoreShot

Thank you for helping improve StoreShot. The project is in active development,
so small, focused changes with a clear user benefit are easiest to review.

## Before you start

- Search existing issues before opening a new one.
- For a bug, include the StoreShot version, Node.js version, operating system,
  reproduction steps, and the smallest safe example project you can share.
- For a substantial feature or architecture change, open an issue first so the
  approach and scope can be agreed before implementation.
- Never attach private screenshots, signing material, tokens, or proprietary
  mockup assets to an issue.

## Development setup

StoreShot requires Node.js 22.12 or newer and npm.

```bash
npm ci
npm run dev
```

The development command uses the ignored `playground/` directory. To test a
different project without opening the browser:

```bash
npm run storeshot -- dev /tmp/storeshot-project --no-open
```

## Project principles

- Keep StoreShot local-first and folder-based. Do not introduce accounts, a
  remote backend, or a database without prior agreement.
- Treat the directory passed to `storeshot dev` as a strict filesystem boundary.
- Keep Node-only code out of the browser bundle and browser-only code out of the
  CLI runtime.
- Prefer readable types and direct solutions over compatibility layers or clever
  abstractions. The `0.x` format may evolve when a cleaner design warrants it.
- Prefer the existing source-owned shadcn/Base UI components for interactive UI.
- Do not commit `dist/`, `node_modules/`, `playground/` contents, or local
  `mockup-bundles/` and `element-bundles/` archives.

## Licensing new dependencies and assets

Every new dependency and redistributed asset must have a license that permits
its intended use and distribution.

- Add package dependencies through npm so `package-lock.json` records their SPDX
  license metadata.
- Run `npm run licenses` after changing a package whose code or assets are
  included in StoreShot's distributable output.
- Preserve upstream copyright notices and license files for bundled artwork,
  fonts, and mockups.
- Record an asset's source URL and exact revision in its local README or manifest.
- Do not add assets copied from commercial products or websites without explicit
  redistribution permission.

Update `THIRD_PARTY_NOTICES.md` when attribution changes.

## Validation and pull requests

Run the full gate before opening a pull request:

```bash
npm run check
```

For UI changes, also exercise the affected workflow in the browser. Keep commits
focused, explain user-visible behavior in the pull request, and call out project
format changes explicitly.

By submitting a contribution, you agree that it may be distributed under the
project's MIT License.
