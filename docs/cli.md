# CLI and agent workflow

StoreShot's CLI is designed for both interactive shell use and coding agents.
It keeps the complete source project in ordinary JSON and image files, while
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
storeshot init ./app-store-screenshots --app-name "Example App" --platform ios
storeshot -C ./app-store-screenshots status --json
storeshot dev ./app-store-screenshots
```

An open `dev` workspace watches `storeshot.json`, `sets/`, `assets/`, and
`mockup-bundles/`. CLI changes and direct filesystem edits are streamed to the
browser, so an open set and its preview update without restarting the server.

## Recommended agent loop

An agent can inspect, change, validate, and render a screenshot without needing
to drive the visual editor:

```bash
# 1. Discover project state and stable set ids.
storeshot -C ./screenshots status --json

# 2. Read the complete source document for one set.
storeshot -C ./screenshots set show english-iphone-a1b2c3d4

# 3. Edit the JSON with normal filesystem tools, then validate and save it.
storeshot -C ./screenshots set write english-iphone-a1b2c3d4 \
  --file /tmp/english-iphone.json --json

# 4. Check schemas and all cross-file references.
storeshot -C ./screenshots validate --json

# 5. Render a quick preview for one screenshot area.
storeshot -C ./screenshots render --set english-iphone-a1b2c3d4 \
  --area 1 --scale 0.25 --json

# 6. Render final full-resolution PNGs.
storeshot -C ./screenshots render --set english-iphone-a1b2c3d4 --clean
```

`set write --file -` accepts JSON from standard input. Agents may also edit a
file under `sets/` directly; `validate` applies the same document parser and
semantic checks either way. `set write` additionally performs an atomic write
and refreshes `updatedAt`; run `validate` afterward for cross-file checks.

## Validation

`validate` checks more than JSON syntax:

- project, config, and set schema versions;
- regular-file and project-directory expectations;
- set filename and id agreement;
- duplicate set, area, and element ids;
- asset, built-in artwork, and device-mockup references;
- supported image metadata;
- locale and timestamp plausibility; and
- text font family and weight values.

Warnings do not fail validation by default. Use `--strict` in CI when warnings
should also produce a non-zero exit status.

## Rendering

`render` uses Fabric's Node canvas adapter and the same set/element model as the
browser editor. It writes one PNG per screenshot area under
`<project>/renders/<set-id>/` by default.

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

The bundled Geist font, Arial, Georgia, and Times New Roman render locally.
For other fonts, the CLI downloads the exact family, weight, and required
Unicode subsets from Bunny Fonts before rendering. Downloaded WOFF files are
cached in the operating system's temporary directory for subsequent renders.
The first render of a Bunny font therefore requires network access; later
renders can reuse the cached font file.

## Config, set, and asset commands

Common structured edits do not require hand-editing JSON:

```bash
storeshot -C ./screenshots config get
storeshot -C ./screenshots config set --app-name "Example App" --platform ios android

storeshot -C ./screenshots set list --json
storeshot -C ./screenshots set create --name "Finnish iPhone" \
  --locale fi-FI --preset iphone
storeshot -C ./screenshots set update <id> --name "Finnish App Store"
storeshot -C ./screenshots set duplicate <id>
storeshot -C ./screenshots set delete <id> --yes

storeshot -C ./screenshots asset list --json
storeshot -C ./screenshots asset add ./captures/home.png \
  --category screenshots
storeshot -C ./screenshots asset set-device screenshots/home.png iphone
storeshot -C ./screenshots asset remove brand/old-logo.svg --yes
```

Asset replacement requires `--replace`. Removing a referenced asset is blocked
unless `--force` is explicit. Set and asset deletion require `--yes`, which
makes destructive intent visible in agent transcripts and shell history.

Use `storeshot <command> --help` for the complete option list.
