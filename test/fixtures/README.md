# Migration visual reference

`migration-reference.png` was exported from `migration-v1.json` by the original
StoreShot Fabric 7.4 browser renderer in Chrome on macOS. The artwork is a small
synthetic path owned by this test; no customer project data is included.

The fixture covers automatic text wrapping, explicit line breaks/line spacing,
SVG geometry with viewBox padding, recoloring, rotation, opacity and flipping.
The pixel comparison tolerates small platform rasterization differences while
catching layout regressions. Do not regenerate the reference with the new HTML
renderer: it deliberately records the legacy appearance.
