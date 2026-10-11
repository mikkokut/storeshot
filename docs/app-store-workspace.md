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

1. Upload source screenshots to Asset Library.
2. Open a product page and choose a device or creative artwork tab. Choose the
   language when creating the first screenshot or artwork. Every destination is
   available without app settings. Each device uses one fixed export size.
   The CLI `page prepare` command derives destinations from existing artwork and
   source image dimensions (iPhone when neither exists), and can populate them from
   matching source images for the page’s first language.
3. Update the collection’s HTML/CSS files on disk to compose artwork. Change the
   `areas` order in its JSON manifest to reorder images.
4. Click a screenshot to open the fullscreen viewer. All images in the collection appear
   fitted to the viewer; scroll horizontally to review them and close the dialog to return to the page.
5. Add optional creative artwork. Universal Creative can serve both placements.
6. Review all languages stacked under each device or creative artwork tab. Use
   **Add new language** at the bottom of the listing to start empty or copy artwork
   for translation, or duplicate a product page.
   The remove action beside each language heading removes that language and all
   its collections from the current page after confirmation. Other pages and
   languages are preserved, and source assets remain on disk. Removing the
   last language returns the page to its initial empty state.
7. Export your artwork; PNGs are organized by page, language, and destination.
8. Preview cropping and submit in App Store Connect. Run experiments there.

Coverage derives devices from existing screenshot artwork and reports missing or invalid destinations, while exports remain available for
iterative previews. A file existing is not proof of finished artwork or Apple approval.
There is no manual review checklist or status to maintain.

## Current Apple specifications

Verified **2026-10-11** against Apple's [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).
Creation uses one fixed size per currently required or upcoming device. Size and orientation
selectors are omitted. The data schema and validation catalog retain alternative
published dimensions, orientations, and display destinations for future support.

| Destination | Default export size | Requirement |
| --- | --- | --- |
| iPhone, Dynamic Island medium | 1206 × 2622 | Required for iPhone |
| iPhone Duo, outer display | 1398 × 2034 | Required from April 2027 for apps using iOS 27.1 SDK or later |
| iPhone Duo, inner display | 2007 × 2853 | Required from April 2027 for apps using iOS 27.1 SDK or later |
| iPad, 13-inch | 2064 × 2752 | Required if supported |
| Apple Watch | 422 × 514 | Required if supported; consistent size across languages |
| Mac | 2880 × 1800 | Required if supported; 16:10 |
| Apple TV / Vision Pro | 3840 × 2160 | Required if supported |

Screenshots accept 1–10 images per display size. Exported PNGs have an opaque
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
iPhone Duo tab offers separate outer (1398 × 2034) and inner (2007 × 2853)
display slots, each with its own creation control and artwork collection.
Duo slots are upcoming: `page prepare` does not create them, and readiness checks
do not require a counterpart. Create them explicitly to prepare future artwork.
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
