# App Store Connect screenshot previews

StoreShot clips screenshot previews with App Store Connect's device corner masks.
The same mask is used in the device tabs and Additional artwork, and scales with
the image when zooming. Per-image Duo dimensions select the appropriate mask.
The HTML artwork and exported PNGs remain full rectangles with opaque corners;
do not bake the preview mask into compositions.

## Measurements

Inspected in Chrome on **2026-10-27**. iPhone, iPad, and Duo were measured from
computed styles on the version page and Media Manager. The remaining profiles
and Duo's other orientations were read from the shared static preview components
already loaded by that same app. No other app or platform setup was needed.

Radii below are CSS pixels at Apple's reference thumbnail size, in top-left,
top-right, bottom-right, bottom-left order. A single value applies to all corners.
StoreShot scales these values by its displayed image height divided by the
reference height. These are circular CSS `border-radius` corners, not a device
frame or a custom superellipse.

| Destination | Reference size (width × height) | Radius |
| --- | --- | --- |
| iPhone Dynamic Island / Face ID, medium and large, portrait | 111 × 240 | 12 |
| Same iPhones, landscape | 240 × 111 | 12 |
| iPhone Home Button, large, portrait | 122 × 218 | 3 |
| iPhone Home Button, medium, portrait | 116 × 207 | 3 |
| iPhone Duo outer, 1398 × 2034 | 165 × 240 | 4, 21, 21, 4 |
| iPhone Duo outer, 2034 × 1398 | 240 × 165 | 4, 4, 21, 21 |
| iPhone Duo inner, 2007 × 2853 | 175 × 240 | 21 |
| iPhone Duo inner, 2853 × 2007 | 329 × 240 | 21 |
| iPad 13-inch, portrait | 180 × 240 | 3 |
| iPad 11-inch / 10.5-inch, portrait | 172 × 229 | 3 |
| Watch Ultra family, 422 × 514 or 410 × 502 | 174 × 214 | 38 |
| Watch Series 10–12, 416 × 496 | 174 × 214 | 32 |
| Watch Series 7–9, 396 × 484 | 174 × 213 | 28 |
| Watch Series 4–6 / SE, 368 × 448 | 174 × 213 | 28 |
| Watch Series 1–3, 312 × 390 | 174 × 218 | 4 |
| Mac | 343 × 215 | 3 |
| Apple TV / Vision Pro | 382 × 215 | 3 |

Home Button iPhone and iPad landscape previews swap the reference width and
height and keep the radius. Duo uses the explicit orientation entries above.
Unassigned destinations and unsupported Duo/Watch dimensions remain square.
Creative artwork keeps its separate presentation.

The reference sizes describe Apple's thumbnail layout, not export dimensions.
Some Apple thumbnail proportions differ slightly from the uploaded image. StoreShot
preserves the artwork's aspect ratio while matching the corner treatment.

## Rechecking the values

On an accessible [App Store Connect](https://appstoreconnect.apple.com/) version
page, inspect the thumbnail image and its wrappers with Chrome's computed styles.
Check the current placement component rather than the older legacy media manager:
the legacy Watch masks have different values.

The inspected shared component was
[5b5fe36f.44242360.js](https://appstoreconnect.apple.com/partials/asc-maison/js/5b5fe36f.44242360.js),
whose device size/mask tables define the Watch and iPhone profiles and a 3 px
default for iPad, Mac, TV, and Vision Pro. Its Duo extension was
[eb2762c8.12f6ac71.js](https://appstoreconnect.apple.com/partials/asc-maison/js/eb2762c8.12f6ac71.js).
These versioned URLs may require a signed-in Chrome session and will change with
Apple's deployments. Reinspect the resources loaded by the current page rather
than assuming these filenames stay current.

Update `src/ui/app-store-preview.ts` and its tests together after remeasurement.
This local presentation model does not reproduce the App Store product page,
device chrome, or Header/Search Results cropping; review the final assets in
App Store Connect before submission.
