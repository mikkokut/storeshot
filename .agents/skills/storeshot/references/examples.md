# Example gallery

Open [the overview](../assets/examples/overview.jpg) first, then only the preview
and source relevant to the requested design. These five artboards distill two
visual families into four distinct techniques. The previews are already rendered;
no CLI or browser is needed to compare their layouts.

All screens use the same abstract gray block SVG. There are no app logos,
generated app interfaces, product names, or real award claims. The example copy
is illustrative. Adapt colors, fonts, copy, geometry, and captures to the user's
app rather than treating these as fixed templates.

## Choose an example

| Example | Features and techniques | When useful |
| --- | --- | --- |
| [Soft gradient shell](../assets/examples/previews/soft-shell.jpg) | Two layered vertical gradients blended horizontally with a CSS mask; a pale gradient device rim; layered shadows; centered headline; rounded screen clipping. A CSS shell supplies the whole device treatment. | Quiet, minimal compositions in which the capture should dominate without a photographic hardware frame. |
| [Cropped device stack](../assets/examples/previews/cropped-stack.jpg) | A device exits the top edge; two overlapping devices enter from below; a headline occupies the gap. Explicit stacking order puts a compact activity card above the front device. Canvas overflow performs intentional cropping. | Showing continuity, multiple states, or a feature that lives outside the main app screen. |
| [Floating notification cards](../assets/examples/previews/floating-cards.jpg) | A central device anchors three independent cards. Translucent fills, inset shadows, simple geometric icons, and explicit z-index establish depth. A contrasting callout extends beyond the right edge. | Explaining alerts, reminders, or supplementary benefits while keeping marketing text editable outside the raw capture. |
| [Panorama left](../assets/examples/previews/panorama-left.jpg) + [right](../assets/examples/previews/panorama-right.jpg) | A wide tablet crosses the seam into the next artboard and overlaps a portrait tablet there. Identical device geometry and a one-canvas-width offset preserve continuity. Two recolorable SVG laurel masks bracket generic highlights. | A two-image sequence presenting landscape and portrait content, or a larger composition that benefits from adjacent screenshots. Keep both images and their ordering. |

Only one soft-shell shot is included: its original variations mostly changed
screen content and gradient strength. Additional award-phone, large-tablet,
tablet-card, and plain wearable shots would repeat techniques above or show only
a raw screen. Both panorama halves are necessary to explain the seam.

## Editable source

The two folders are independent, complete StoreShot projects:

- [Soft gradient project](../assets/examples/soft-gradient/storeshot.json):
  [artboard](../assets/examples/soft-gradient/sets/phone/soft-shell.html) and
  [stylesheet](../assets/examples/soft-gradient/assets/other/composition.css).
- [Bold overlap project](../assets/examples/bold-overlap/storeshot.json):
  [cropped stack](../assets/examples/bold-overlap/sets/phone/cropped-stack.html),
  [floating cards](../assets/examples/bold-overlap/sets/phone/floating-cards.html),
  [panorama left](../assets/examples/bold-overlap/sets/tablet/panorama-left.html),
  [panorama right](../assets/examples/bold-overlap/sets/tablet/panorama-right.html),
  and [shared stylesheet](../assets/examples/bold-overlap/assets/other/composition.css).

Each project carries its own screen SVG, local variable font, and font license.
Keep the license with the font when copying. The font deliberately replaces the
reference typography with a consistent local face. No network resources or
catalog installation are needed. The laurel is a standalone decorative SVG,
recolored via CSS `mask`; the labels intentionally make no award claim.

## Reuse and adapt

1. Inspect the saved preview and selected HTML/CSS. Use only the technique needed;
   do not load every example for an unrelated artwork edit.
2. For a new scratch project, copy the entire chosen project folder to the user's
   screenshot directory. Work on the copy, leaving the skill assets intact.
   Run `storeshot init ./screenshots` on the copy to create its empty asset
   categories before validation or rendering. For an existing project, create a
   destination collection with the CLI, then
   adapt selected HTML and copy its required resources under new project-local
   names. Preserve that collection's page, locale, destination, and canvas.
   Do not overwrite an existing `storeshot.json` with an example's config.
3. Replace `assets/screenshots/placeholder.svg` references with real captures or
   the placeholders requested by the user. The supplied SVG intentionally uses
   `preserveAspectRatio="none"` so its abstract blocks fill arbitrary openings;
   this is not a recommendation to stretch real screenshots. Match capture and
   opening aspect ratios, using contain or an intentional crop.
4. Customize the headline and callouts. Keep shared styles local to the intended
   collection family. Fonts are declared locally and precede system fallbacks.
5. Render the adapted project and inspect it. Bundled previews document the
   examples; they cannot validate changes made for a new app.

Phone canvases are 1206 × 2622 and tablet canvases are 2064 × 2752. The sources
retain smaller design coordinate spaces with uniform parent scaling: phone
layouts use a 600px-wide stage, tablets 1285px. Compute the stage height from
the canvas aspect ratio when changing dimensions. Avoid editing only the output
canvas or introducing different horizontal and vertical scale factors.

For the panorama, the wide device's x position is 92 on the left and -1193 on
the right: exactly a 1285-unit offset. Width, height, top, clipping, placeholder,
and background are shared. Preserve this relationship when adapting both halves.

## Preview files and refreshing them

The five JPEG previews use quality 80: phones are 603 × 1311 (scale 0.5), tablets
516 × 688 (scale 0.25). The overview places them together at smaller sizes for
selection. They are design references, not upload-ready exports or substitutes
for full-resolution typography review.

If an example changes, copy its project to a temporary directory, then regenerate
PNGs with the installed CLI before converting to JPEG using an available image
tool. For example, from a copied bold project:

```bash
storeshot -C ./example-copy validate --strict --json
storeshot -C ./example-copy render --set phone --scale 0.5 --output ./preview-png --json
storeshot -C ./example-copy render --set tablet --scale 0.25 --output ./preview-png --json
```

Refresh the corresponding saved previews and overview together and visually
inspect them. Keep generated full-resolution output out of the distributed skill.
