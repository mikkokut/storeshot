# App Store workspace

StoreShot targets the Apple App Store. An app is a local project folder; there are
no accounts, remote services, or implicit App Store Connect uploads.

## Hierarchy

```text
App
├── Asset Library (shared source images)
├── Default Product Page
│   └── Localization
│       ├── Screenshots → display specification → ordered images
│       └── Header / Search Results / Universal Creative → image
└── Product Pages → page → localization → compatible asset slots
```

Pages and tests are first-class records in `storeshot.json` (version 2). A page owns
its languages. Each collection in `sets/` (version 3) references a page, language,
and a stable `specId`; the ordered artboards remain ordinary HTML files. “Set” remains
a low-level CLI/storage term; the UI leads with destinations, pages, and languages.

All pages appear together under Product Pages. Optimization treatments are created
through the CLI; the UI can preview their artwork alongside other pages. Use its add button to create a blank
page or copy an existing page’s artwork. The default page offers the currently required Apple device
destinations. Additional pages target
compatible iPhone/iPad/Duo and creative assets. They never implicitly modify the
default page. One test owns up to three treatments; the default page is its baseline.
Copies are independent files, including collection-local CSS/resources. Shared
`assets/` references deliberately remain shared. There is no implicit locale fallback:
explicit language coverage makes untranslated work visible.

## Workflow

1. Upload source screenshots to Asset Library.
2. Open Default Product Page and choose a device or creative artwork tab. Choose the
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
6. Copy a language for translation, or duplicate a product page.
7. Export your artwork; PNGs are organized by page, language, and destination.
8. Preview cropping and submit in App Store Connect. Run experiments there.

Coverage derives devices from existing screenshot artwork and reports missing or invalid destinations, while exports remain available for
iterative previews. A file existing is not proof of finished artwork or Apple approval.
There is no manual review checklist or status to maintain.

## Current Apple specifications

Verified **2026-10-09** against Apple's [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).
Creation uses one fixed size per currently required device. Size and orientation
selectors are omitted. The data schema and validation catalog retain alternative
published dimensions, orientations, and display destinations for future support.

| Destination | Default export size | Requirement |
| --- | --- | --- |
| iPhone, Dynamic Island medium | 1206 × 2622 | Required for iPhone |
| iPad, 13-inch | 2064 × 2752 | Required if supported |
| Apple Watch | 422 × 514 | Required if supported; consistent size across languages |
| Mac | 2880 × 1800 | Required if supported; 16:10 |
| Apple TV / Vision Pro | 3840 × 2160 | Required if supported |

Screenshots accept 1–10 images per display size. Exported PNGs have an opaque
background. App Store Connect scales required screenshots for smaller displays;
StoreShot does not currently offer optional display overrides.

Apple's [creative specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications/)
define Header at 3840 × 1646, Search Results at 3:2 from 1920 × 1280 through
3840 × 2560, and Universal Creative at 5244 × 2950 (PNG). These optional placements
are for iOS/iPadOS 27+. StoreShot prepares one still image per creative collection.
A universal export can be reused for both placements in App Store Connect.

The current Apple screenshot page has mixed legacy scaling notes alongside its new
“Required device sizes” section. StoreShot follows the explicit medium Dynamic Island
requirement. Optional larger iPhone and smaller iPad display slots remain in the
validation catalog for existing artwork, with no new-creation controls. Duo has
separate outer (1398 × 2034) and inner (2007 × 2853) destinations in the catalog;
these upcoming destinations remain in the catalog, so creation does not offer them yet.

## Apple workflow and design references

- [Manage App Store assets](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-your-app-store-assets): Apple's Asset Library and placement workflow, including universal reuse.
- [Custom Product Pages](https://developer.apple.com/help/app-store-connect/create-custom-product-pages/configure-multiple-product-page-versions): up to 70 localizable pages, distinct URLs and campaign metadata.
- [Product Page Optimization](https://developer.apple.com/help/app-store-connect/create-product-page-optimization-tests/overview-of-product-page-optimization): up to three treatments; iOS/iPadOS, not custom pages or Watch pages.
- [Asset best practices](https://developer.apple.com/app-store/asset-best-practices/): lead with actual app value, sequence strong features first, use short localized copy, and center key artwork for different crops. Apple also describes testing header visuals.

The UI deliberately does not pretend to run tests, publish pages, or report Apple
approval. Video previews, icons, promotional text, keywords, deep links, submission,
and analytics are managed externally. Numeric crop-safe areas are not invented;
use Apple's templates and App Store Connect preview for final placement checks.

## Migration and recovery

`storeshot migrate` upgrades version 1 configs and version 1/2 collections. It preflights
all input, preserves original JSON in versioned backups, keeps HTML and resource files,
and assigns compatible dimensions to default-page slots. Unsupported dimensions,
duplicate slots, and Android artwork are retained as unassigned drafts. Migration
never rescales artwork or guesses that an old variation was an Apple-approved custom
page. Assign those destinations in the UI after reviewing them.

Backups are never overwritten. Conversion is not a multi-file transaction: if interrupted,
use the reported backup to recover the affected manifest, move its partially generated
HTML folder aside only for a layer conversion, and retry. Keep config backups until
reviewing the migrated workspace.
