# Designing App Store screenshots

Read this when planning a new sequence, localizing, or reviewing renders. It
covers decisions specific to App Store screenshots. Build the result with the
[compositing recipes](compositing.md) and the [example gallery](examples.md).
For Apple's guidance and the roles of Header, Search Results, and Universal
artwork, read [Apple's artwork guidance](apple-guidance.md).

## Plan the story

- Before choosing layouts, list the app's real benefits, using evidence from
  the code, metadata, and captures. Lead with what the app is for and why
  someone would choose it.
- Order images by importance. The first images carry most of the listing,
  because search results and the product page show them first. Use as many
  images as there are strong messages, up to 10; don't pad.
- Give each image one message: a short benefit headline, plus an optional
  supporting line, paired with the capture that proves it. Make the headline
  readable at thumbnail size. Write in the app's own voice, and use the user's
  copy verbatim when they supply it.
- For creative placements (header, search results, universal), communicate
  one clear idea and keep the focal point centered. App Store Connect crops these
  placements; tell the user to check the crops there.

## Build a visual system

- Put the system in one shared stylesheet under `assets/other/`: palette, type
  scale, margins, headline position, background treatment, and device scale.
  Each artboard's HTML then holds only its content and per-image adjustments.
  Changing the stylesheet updates every image that uses it, including other
  languages.
- Derive the palette and mood from the app icon, accent colors, brand assets,
  and the captures themselves. Without brand input, choose a confident direction
  that suits the app's category, rather than asking for one.
- Keep headline placement, margins, and device scale consistent, and vary the
  composition deliberately: a hero, a cropped close-up, overlapping states, a
  feature callout, or a panorama pair. A sequence should read as one family.
- Use local fonts under `assets/other/` (`.woff2`, `.woff`, `.ttf`, `.otf`) with
  their licenses. Use fonts the user provides or openly licensed faces. A
  remote stylesheet such as Google Fonts or Bunny Fonts also works, but local
  files render more reproducibly. See
  [local typography](compositing.md#local-typography).
- Keep critical text and UI away from the canvas edges. Store layouts may round
  corners or crop thumbnails.

## Use captures faithfully

- Show captures at their native aspect ratio. Fit the device opening to the
  capture rather than stretching it, and crop only with intent (for example, a
  zoomed close-up of one feature).
- Don't alter what the app shows. You may crop, scale, frame, and overlay
  separate callouts. Flag captures that contain personal data, debug UI, or
  placeholder content instead of quietly using them.
- Match device to destination: iPad captures for iPad, Mac captures for Mac.
  Don't put phone captures inside tablet frames.
- Floating cards, simplified widgets, or notification mockups are acceptable
  marketing elements when they faithfully represent real features. Keep them as
  editable HTML, separate from the raw capture.
- If no captures exist, design the layout with an obviously generic placeholder,
  such as the gallery's `placeholder.svg`. Tell the user which screens are still
  needed. Never draw a convincing fake app screen.

## Localize with care

- Translate all visible text: headlines, sublines, callouts, and the `alt`
  attributes of images. Adapt idioms rather than translating word for word,
  and keep the meaning. Use the user's translations verbatim when supplied;
  label your own as unreviewed.
- Prefer localized captures, for example captures named per locale under
  `assets/screenshots/`. If there are none, keep the source-language captures
  and say so.
- Set `<html lang="…">`. Use `dir="rtl"` for Arabic, Hebrew, and Urdu, and
  mirror layouts where direction matters.
- Check glyph coverage. A Latin display font will fall back, often badly, for
  CJK, Arabic, Hebrew, Devanagari, Thai, and other scripts. Add a suitable
  local fallback face for those languages.
- Re-check each language's wrapping. German, Finnish, and other languages often
  run 30%+ longer, and CJK needs different line breaking. Adjust that language's
  HTML (its files are independent) or add a per-language class. Don't shrink the
  shared type scale for everyone.

## Review checklist

Inspect every rendered image, not just the first. Fix problems before showing
work or handing off.

- **Text:** nothing clipped or overflowing; no awkward breaks, orphans, or
  hyphenation; the intended font and weight are actually used (compare the
  letterforms); no missing-glyph boxes; readable in a 0.25-scale render.
- **Captures:** real, sharp, not stretched, and on the right device. They sit
  flush in the frame opening, with no gaps or bleed at the corners. Nothing
  important is hidden behind overlays.
- **System:** consistent margins, headline position, and device scale across the
  sequence. Panorama halves line up at the seam, and each half also stands alone.
- **Contrast:** headline and callout text is clearly legible against the
  background.
- **Truthfulness:** every claim and callout matches a real feature. Any
  placeholders are obvious and reported.
- **Output:** final PNGs are scale 1, at the destination's exact dimensions,
  with an intentional opaque background.
