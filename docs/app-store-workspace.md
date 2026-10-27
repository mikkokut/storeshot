# App Store workspace

StoreShot targets the Apple App Store. An app is a local project folder; there are
no accounts, remote services, or implicit App Store Connect uploads.

## Hierarchy

```text
Project
├── Asset Library (shared source images)
└── Product Pages
    └── Page → language
        ├── Screenshots → device/display → ordered images
        └── Header / Search Results / Universal Creative → image
```

Pages are records in `storeshot.json` (version 2), each with an id, name, store,
and languages. Every page behaves the same: all device and creative destinations
are available, artwork can be copied independently, and any page can be removed,
including the initial or last page. There are no page kinds, optimization tests,
protected default pages, or local page-count limits.

Each collection has `sets/<set-id>/index.json` (version 3), referencing its page,
language, stable `specId`, and ordered artboard IDs. Each artboard has its own
`<area-id>.json` metadata and matching `<area-id>.html` composition. Folder and
file names define IDs and paths; renaming a set folder needs no JSON edits. “Set” remains a CLI
and storage term. Copies have independent collection files and resources; shared
`assets/` references remain shared. There is no implicit language fallback.

New pages offer a Store selector with App Store enabled and **Google Play — coming
later** disabled. The selected store is saved on each page as `store: "app-store"`;
the project config has no root-level store.

## Workflow

1. Open the project folder in Codex, Claude Code, or another coding agent.
   Overview lists your product pages and explains the process. Open a page;
   empty device and creative slots offer a short suggested prompt for the
   StoreShot skill and selected destination. Copy it and send it to your agent.
2. Share your app captures, brand assets, target audience, and visual direction.
   Source images can also be uploaded to Asset Library.
3. Ask the agent to create screenshots in your first language using the CLI, then
   compose the artwork in HTML/CSS. Every device and creative destination is
   available without app settings. The CLI `page prepare` command derives
   destinations from existing artwork and source image dimensions (iPhone when
   neither exists), and can populate them from matching source images for the
   page’s first language.
4. Keep the workspace open: file changes update the preview automatically. Use
   the minus, plus, and reset controls to adjust preview zoom from 50–300%.
   Previews start at 150%, and reset returns to that size; export dimensions stay
   unchanged. Review artwork directly on the page. Ask your agent to refine the
   design or reorder the images.
   Screenshot corners follow App Store Connect's device masks, including Duo's
   asymmetric outer display and Watch model differences. The mask scales with
   preview zoom; artwork and PNG exports retain their full rectangular canvas.
   See [preview measurements](app-store-preview.md) for the inspected values.
5. Ask your agent to add optional creative artwork or localize an existing
   language with `page localize`, then translate and review the copy and layout.
   Screenshot and language creation are handled by the agent through the CLI;
   the workspace has no creation buttons for these operations.
6. Review languages under each device or creative tab. The remove action beside
   each language heading removes that language and its collections from the page
   after confirmation. Other pages, languages, and source assets are preserved.
7. Export your artwork; PNGs are organized by page, language, and destination.
8. Preview cropping and submit in App Store Connect. Run experiments there.

Coverage derives devices from existing screenshot artwork and reports missing or invalid destinations, while exports remain available for
iterative previews. A file existing is not proof of finished artwork or Apple approval.
There is no manual review checklist or status to maintain.

## Current Apple specifications

Duo handling verified **2026-10-27**; other specifications verified **2026-10-11** against Apple's [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).
Creation uses one default size per currently required or upcoming device. Size and orientation
selectors are omitted. The data schema and validation catalog retain alternative
published dimensions, orientations, and display destinations for future support.

| Destination | Default export size | Requirement |
| --- | --- | --- |
| iPhone, Dynamic Island medium | 1206 × 2622 | Required for iPhone |
| iPhone Duo | 1398 × 2034 default; also 2007 × 2853, either orientation | Required from April 2027 for apps using iOS 27.1 SDK or later |
| iPad, 13-inch | 2064 × 2752 | Required if supported |
| Apple Watch | 422 × 514 | Required if supported; consistent size across languages |
| Mac | 2880 × 1800 | Required if supported; 16:10 |
| Apple TV / Vision Pro | 3840 × 2160 | Required if supported |

Screenshots accept 1–10 images per destination. Exported PNGs have an opaque
background. App Store Connect scales required screenshots for smaller displays;
StoreShot does not currently offer optional display overrides.
Browser exports share one Chrome instance across images and languages; it starts
on the first PNG request and closes when the workspace server shuts down.

Apple's [creative specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications/)
define Header at 3840 × 1646, Search Results at 3:2 from 1920 × 1280 through
3840 × 2560, and Universal Creative at 5244 × 2950 (PNG). These optional placements
are for iOS/iPadOS 27+. StoreShot prepares one still image per creative collection.
A universal export can be reused for both placements in App Store Connect.

The current Apple screenshot page has mixed legacy scaling notes alongside its new
“Required device sizes” section. StoreShot follows the explicit medium Dynamic Island
requirement. Optional larger iPhone and smaller iPad display slots remain in the
validation catalog for existing artwork, with no new-creation controls. The
iPhone Duo tab offers one ordered collection per page and language, matching App
Store Connect's single Duo upload category. Its 1–10 image limit is shared across
outer (1398 × 2034) and inner (2007 × 2853) screenshots, including landscape
rotations. Create it explicitly with `set create --spec iphone-duo`.
Each artboard can set `"canvas": { "width": 2007, "height": 2853 }` in its
`<area-id>.json` metadata; omitted canvases inherit the collection default. Compose
the matching HTML at those dimensions. Previews, annotations, and PNG exports use
each image's dimensions. Localization preserves them and exports keep one ordered
Duo directory. `page prepare` does not create the upcoming Duo collection.
Their conditional requirement starts in April 2027 for apps using iOS 27.1 SDK or later;
StoreShot does not yet track the app's SDK version.

## Apple workflow and design references

- [Manage App Store assets](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-your-app-store-assets): Apple's Asset Library and placement workflow, including universal reuse.
- [Custom Product Pages](https://developer.apple.com/help/app-store-connect/create-custom-product-pages/configure-multiple-product-page-versions): up to 70 localizable pages, distinct URLs and campaign metadata.
- [Asset best practices](https://developer.apple.com/app-store/asset-best-practices/): lead with actual app value, sequence strong features first, use short localized copy, and center key artwork for different crops. Apple also describes testing header visuals.

The UI deliberately does not pretend to run tests, publish pages, or report Apple
approval. Video previews, icons, promotional text, keywords, deep links, submission,
and analytics are managed externally. Numeric crop-safe areas are not invented;
use Apple's templates and App Store Connect preview for final placement checks.

### Annotate screenshots

Turn on **Annotate** at the bottom of the sidebar, or press **A**, then click a
screenshot and describe what should change. A banner at the top stays visible
while you annotate. Press **Enter** to add your comment or **Shift+Enter** for a
new line. A numbered marker shows where you
clicked. Annotation works on screenshot previews, but not on source assets or
header artwork. Press **Esc** or **A** again to finish. You can also select text in a
screenshot and choose **Annotate** beneath the selection without turning on
annotation mode. The selected text is shown with your comment and included in
the copied prompt. Selecting another screenshot or clicking outside clears the
previous selection. The action follows the selected text as you scroll and
closes when that text leaves the visible preview.

Comments collect in **Prompt queue** below the button, where you can review or
remove them. **Copy prompt** combines them into one StoreShot skill prompt that
contains each artwork file path and comment. When you click an element, it also
includes the rendered target text, selector, DOM path, and artwork coordinates as
evidence separate from your instructions. If capture is unavailable, the file
and clicked position are still included. Paste it into your coding agent. Copied
comments leave the queue; if copying fails, every comment stays. The queue is
saved in this browser for each project and survives reloads.

Press **⌘⇧C** on macOS or **Ctrl+Shift+C** on other platforms to copy the prompt
without opening the queue. Shortcuts are ignored while you type in a field.
