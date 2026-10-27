# StoreShot

**Let your coding agent make your App Store screenshots.**

StoreShot gives Codex, Claude Code, or any other coding agent a place to design,
review, and export App Store screenshots. Describe what you want and share your
app captures. Your agent builds the artwork and you watch it appear in a live
preview. When it's ready, export PNGs at the sizes Apple accepts.

It's free, open source, and runs entirely on your machine.

StoreShot supports the Apple App Store today; Google Play support is planned.

StoreShot is already used in production for the iOS app
[Lokimaps](https://www.lokimaps.com/).

## Why StoreShot?

Screenshots go stale fast. You rename a button and dozens of images across
devices and languages are out of date. Redoing them by hand in a design tool is
the kind of chore that gets put off for months.

With StoreShot, your agent does that work. Every screenshot is a small web page,
so anything your agent can write in HTML and CSS can end up on your product page.
Ask for a change in plain language. The artwork is plain files in a folder, so
the next update starts from where you left off.

## What you get

### Your agent does the design work

- **Start with one prompt.** Every empty device or creative slot has a suggested
  prompt. Copy it, paste it into your agent, and add your captures and ideas.
- **The StoreShot skill teaches your agent the workflow.** It creates
  screenshots, checks the results, and renders previews, so you don't need to
  explain the details.
- **Changes appear as they happen.** Keep the workspace open while your agent
  works and every edit shows up in the preview right away.

### Feedback without explaining where

- **Point at what to change.** Turn on annotation mode, click any part of a
  screenshot, and write what should change. You can also select text and
  comment on it.
- **Send feedback in one batch.** Comments collect in a prompt queue. One click
  copies them as a single prompt that tells your agent exactly which screenshot
  and element you meant.

### Ready for App Store Connect

- **The right sizes, without looking them up.** Create artwork for iPhone, iPad,
  Apple Watch, Mac, Apple TV, and Vision Pro at the sizes Apple currently
  requires. Prepare iPhone Duo artwork in one ordered collection that can mix
  outer and inner display screenshots, with a shared limit of 10 images.
- **More than screenshots.** Create Product Page Header, Search Results, and
  Universal Creative images at Apple's accepted dimensions.
- **Find problems before you upload.** StoreShot flags missing required devices,
  wrong dimensions, and inconsistent Apple Watch sizes.
- **Organized exports.** Download ordered PNGs grouped by product page,
  language, and device, ready to drop into App Store Connect.

### Every language and audience

- **Localize in a sentence.** Ask your agent to copy a finished language and
  translate it. Each language is its own composition, so you can adjust any
  layout that doesn't fit.
- **Custom product pages.** Create separate pages for different audiences or
  campaigns, each with its own languages and artwork.

### Polish included

- **Device frames and decorations.** A built-in catalog includes iPhone and iPad
  frames, award laurels, lines, and decorative shapes your agent can search and
  add.
- **Any font, any layout.** Use your own brand fonts or hosted fonts, along with
  gradients, overlapping phones, callouts, and anything else a browser can
  render.

### Yours, and local

- **No account, no subscription, no upload.** Your project is a folder on your
  machine. Put it in Git, share it with your team, or open it with any editor.
- **Nothing to lock you in.** The artwork is ordinary HTML, CSS, and image files.

## What StoreShot doesn't do

StoreShot makes still images. You still use App Store Connect to upload and
submit them, run product page experiments, and view analytics. App preview
videos and app icons are made elsewhere.

## Get started

You'll need Node.js 22.12 or newer and Google Chrome or Chromium for PNG export.

```bash
npm install --global storeshot
npx skills add "$(npm root -g)/storeshot/.agents/skills/storeshot" --global
storeshot init app-store-screenshots
storeshot dev app-store-screenshots
```

The skill installer lets you choose your coding agents and installs the skill
bundled with your CLI. Re-run it after updating StoreShot. See the
[skill installation guide](docs/cli.md#install-the-agent-skill) for project-local
installation and PowerShell commands.

Your workspace opens in the browser. Next, open the project folder in your
coding agent. Copy the suggested prompt from any empty slot, share your app
captures, and let the agent go.

If Chrome is installed somewhere unusual, set
`STORESHOT_CHROME=/path/to/chrome`.

## Learn more

- [App Store workspace](docs/app-store-workspace.md): how pages, languages,
  and devices fit together, plus Apple's current specifications
- [CLI and agent workflow](docs/cli.md): every command, for agents, scripts,
  and power users
- [Asset catalog](docs/asset-catalog.md): device frames, decorations, and how
  imports work

## Develop from source

```bash
npm ci
npm run dev
```

`npm run dev` runs the CLI and UI with hot reload against the ignored
`playground/` project. Run `npm run check` before submitting a change. See
[CONTRIBUTING.md](CONTRIBUTING.md) for details and the
[release guide](docs/releasing.md) for publishing.

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
