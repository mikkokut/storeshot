# Third-party notices

StoreShot is MIT-licensed, but the packages and assets listed here are not
relicensed as part of StoreShot. They remain available under their respective
licenses.

`THIRD_PARTY_LICENSES.txt` contains the complete license texts for packages whose
code, styles, icons, or fonts are included in the distributable CLI or browser
bundle. `package-lock.json` records the complete dependency graph and SPDX license
expressions; `npm run check:licenses` rejects missing or unreviewed expressions.

## Redistributed assets

### FrameUp Free device mockups

StoreShot includes Apple device frame assets and screen geometry from
[amirmun99/FrameUp-Free](https://github.com/amirmun99/FrameUp-Free), Copyright
(c) 2026 9OneFour, under the MIT License.

The source revision, attribution, and complete license are retained in
`src/ui/public/mockup-bundles/frameup-free/` and shipped with the browser UI.

### Tabler Icons artwork

StoreShot includes selected vector artwork from
[Tabler Icons](https://github.com/tabler/tabler-icons), Copyright (c) 2020-2026
Paweł Kuna, under the MIT License.

The selected source files, upstream revision, attribution, and complete license
are retained in `src/ui/public/artwork/tabler/` and shipped with the browser UI.

### CC0 laurel artwork

StoreShot includes three laurel vectors obtained from Wikimedia Commons, plus a
wide pair derived from the single branch. They are dedicated to the public
domain under CC0 1.0:

- [Steren-Laurel.svg](https://commons.wikimedia.org/wiki/File:Steren-Laurel.svg)
  by Steren
- [Greek Roman Laurel wreath vector.svg](https://commons.wikimedia.org/wiki/File:Greek_Roman_Laurel_wreath_vector.svg)
  by Dalovar
- [Laurel-right.svg](https://commons.wikimedia.org/wiki/File:Laurel-right.svg)
  by Leki, based on work by Indolences; also used for StoreShot's wide pair

The source links, authorship, and complete CC0 1.0 legal text are retained in
`src/ui/public/artwork/cc0-laurels/` and shipped with the browser UI.

### Geist

StoreShot self-hosts the Geist variable font through
[`@fontsource-variable/geist`](https://fontsource.org/fonts/geist) in the UI and
the official [Geist font repository](https://github.com/vercel/geist-font) in
the CLI renderer. Geist is Copyright 2024 The Geist Project Authors and licensed
under the SIL Open Font License 1.1.

The complete OFL text is shipped at
`src/ui/public/licenses/geist-OFL-1.1.txt`.

### node-canvas

CLI PNG rendering uses
[`canvas`](https://github.com/Automattic/node-canvas), Copyright (c) 2010
LearnBoost and contributors and Copyright (c) 2014 Automattic, Inc and
contributors, under the MIT License. The upstream license text is reproduced in
`THIRD_PARTY_LICENSES.txt`.

## Hosted fonts

The editor can fetch a font catalog and selected font files from
[Bunny Fonts](https://fonts.bunny.net/) at runtime. These fonts are not included
in the StoreShot source or npm package. Each family retains its own license;
users should review the family page before redistributing font files or using a
font where attribution is required.

## Direct package licenses

Versions are pinned by `package-lock.json`. Links below point to the package or
upstream project where its license and authorship information are maintained.

### Runtime and distributed UI

| Package | License |
| --- | --- |
| [`@base-ui/react`](https://www.npmjs.com/package/@base-ui/react) | MIT |
| [`@fontsource-variable/geist`](https://www.npmjs.com/package/@fontsource-variable/geist) | OFL-1.1 |
| [`commander`](https://www.npmjs.com/package/commander) | MIT |
| [`fabric`](https://www.npmjs.com/package/fabric) | MIT |
| [`open`](https://www.npmjs.com/package/open) | MIT |
| [`react-resizable-panels`](https://www.npmjs.com/package/react-resizable-panels) | MIT |
| [`tw-animate-css`](https://www.npmjs.com/package/tw-animate-css) | MIT |

### Build and frontend source

| Package | License |
| --- | --- |
| [`@tailwindcss/vite`](https://www.npmjs.com/package/@tailwindcss/vite) | MIT |
| [`@types/node`](https://www.npmjs.com/package/@types/node) | MIT |
| [`@types/react`](https://www.npmjs.com/package/@types/react) | MIT |
| [`@types/react-dom`](https://www.npmjs.com/package/@types/react-dom) | MIT |
| [`@vitejs/plugin-react`](https://www.npmjs.com/package/@vitejs/plugin-react) | MIT |
| [`class-variance-authority`](https://www.npmjs.com/package/class-variance-authority) | Apache-2.0 |
| [`clsx`](https://www.npmjs.com/package/clsx) | MIT |
| [`lucide-react`](https://www.npmjs.com/package/lucide-react) | ISC |
| [`react`](https://www.npmjs.com/package/react) | MIT |
| [`react-dom`](https://www.npmjs.com/package/react-dom) | MIT |
| [`shadcn`](https://www.npmjs.com/package/shadcn) | MIT |
| [`tailwind-merge`](https://www.npmjs.com/package/tailwind-merge) | MIT |
| [`tailwindcss`](https://www.npmjs.com/package/tailwindcss) | MIT |
| [`tsup`](https://www.npmjs.com/package/tsup) | MIT |
| [`tsx`](https://www.npmjs.com/package/tsx) | MIT |
| [`typescript`](https://www.npmjs.com/package/typescript) | Apache-2.0 |
| [`vite`](https://www.npmjs.com/package/vite) | MIT |

## User-provided content

StoreShot's license does not grant rights to screenshots, fonts, artwork, or
mockup bundles imported by a user. Project owners are responsible for ensuring
they have permission to use and distribute their own content.
