# Apple's App Store artwork guidance

Read this when planning store artwork, choosing creative placements, or checking
the result against Apple's guidance. Verified against the linked Apple pages on
**2026-10-11**. Recheck them before advising on changing requirements or availability.
Use [project and CLI operations](project-and-cli.md) for StoreShot commands;
Apple's documentation governs submission requirements.

## What each asset does

| Asset | Purpose and design emphasis |
| --- | --- |
| Screenshots | Demonstrate the app in use. Sequence strong features into a clear story. |
| Product Page Header | Introduce the brand, seasonal theme, or new content when someone reaches the product page. Keep one clear idea suited to a first-time visitor. |
| Search Results | Help someone discovering the app understand its purpose at a glance. Show relevant interface, content, or gameplay. |
| Universal Creative | One source image usable for both Header and Search Results, with composition that survives both placement crops. |

Apple explains these purposes in [App Store asset best practices](https://developer.apple.com/app-store/asset-best-practices/).
Header and Search Results creatives are optional organic placements, appear on
iOS/iPadOS 27 and later, and are separate from screenshots, app previews, and
editorial artwork.
Universal reuse is a placement option, not an additional visible slot. See
[Manage your App Store assets](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-your-app-store-assets).

## Essential design guidance

Apple recommends:

- Represent actual functionality; avoid unverifiable claims and unrelated imagery.
- Omit prices, discounts, website URLs, copyright symbols, other marketplace
  branding, and Apple's own recognition badges or claims, even when earned.
- Use a clear focal point, short purposeful text, and legible key elements.
  Keep focal artwork centered for changing crops and orientations.
- Make the asset family visually consistent and localize text.
- Choose inclusive imagery suitable for a 4+ audience even when the app's rating
  is higher.

These are condensed from [Apple's best practices](https://developer.apple.com/app-store/asset-best-practices/),
which also provides downloadable placement templates. Use those templates for
crop guidance; do not invent a universal pixel-safe margin.

## Image facts that affect composition

| Creative image | Apple's accepted dimensions | StoreShot destination |
| --- | --- | --- |
| Dedicated Header | 3840 × 1646, 21:9 | `header` |
| Dedicated Search Results | 3:2, from 1920 × 1280 through 3840 × 2560 | `search-results` creates 3840 × 2560 |
| Universal | 5244 × 2950, 16:9 | `universal` |

Dedicated images accept JPEG or PNG; the universal image requires PNG. Images
must have no transparency or alpha channel. Apple also accepts videos for
dedicated placements; StoreShot produces still images. Source:
[Creative assets specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications/).

Screenshots require 1–10 images per device size, without transparency. Apple's
current required iPhone destination is Dynamic Island medium; iPad apps also
need the 13-inch destination. Other platforms have their own sizes. Use the
installed CLI's specs and creation result rather than resizing artwork by eye.
Recheck upcoming device requirements when applicable. Source:
[Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).

## How to apply this in StoreShot

The following are practical design recommendations, not additional Apple rules:

- Finish the requested screenshot sequence first. Add creative artwork when the
  brief calls for it; explain its purpose in everyday terms rather than asking
  the user to pick a specification ID.
- Prefer a universal composition when one message works in both contexts.
  Design separate assets when search needs a more direct demonstration and the
  header benefits from a broader brand or seasonal story.
- Adapt the composition to each placement. Do not stretch a portrait screenshot
  into a banner or assume a centered subject alone guarantees every crop works.
- Keep screenshot coverage intact: an optional creative does not replace a
  required device screenshot collection.

## Placement and final review

App Store Connect's **Header and Search Results** tab assigns the artwork.
The **Use header asset in search results** option is available for universal
creatives. Its Preview tool shows both placements across devices, orientations,
and languages; StoreShot's local canvas preview cannot reproduce all those crops.

Creative assets require Apple's review. Asset Library supports standalone
submission, and approved creatives can update an already-live version without
a new app version. StoreShot exports files; it does not assign placements,
submit assets, or run product page optimization experiments. Source:
[Manage your App Store assets](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-your-app-store-assets).
