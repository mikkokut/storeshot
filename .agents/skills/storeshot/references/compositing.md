# Compositing recipes

Adapt these fragments inside a complete static artboard document. Numbers are
illustrative, not device specifications. Use the collection's canvas size and
actual imported asset paths. Keep related styles in a project-local stylesheet
when several artboards share the treatment. URLs in CSS resolve relative to the
stylesheet file; URLs in inline styles resolve relative to the artboard HTML.

## CSS device shell

Use this for a stylized rounded border, gradient, or shadow. A catalog frame is
useful when the reference shows specific hardware details; a simple shell does
not need a device asset. Size the opening to the capture's aspect ratio to avoid
letterboxing. Use `cover` only when cropping is intentional; avoid stretching
real app captures with `fill`.

```html
<div class="shell">
  <img src="../../assets/screenshots/home.png" alt="App screen">
</div>
<style>
.shell {
  position: absolute; left: 153px; top: 520px; width: 900px;
  box-sizing: border-box; padding: 20px; border-radius: 90px;
  background: linear-gradient(150deg, #fff, #cce5ff);
  box-shadow: 0 24px 60px #183c6026;
}
.shell img {
  display: block; width: 100%; height: auto; border-radius: 70px;
}
</style>
```

## Catalog frame

Import the chosen frame, then obtain its dimensions and screen rectangle from
`asset show` or the matching saved `asset inspect` metadata. This example uses
illustrative values: replace all of them together. Scale the parent uniformly,
including its screen clipping and overlaid frame. The outer positioned wrapper
can handle placement/rotation independently of that scale.

```html
<div class="placement">
  <div class="device">
    <div class="opening">
      <img src="../../assets/screenshots/home.png" alt="App screen">
    </div>
    <img class="frame" src="../../assets/other/chosen-frame.svg" alt="">
  </div>
</div>
<style>
.placement { position: absolute; left: 150px; top: 500px; }
.device {
  position: relative; width: 462px; height: 978px;
  transform: scale(1.9); transform-origin: 0 0;
}
.opening {
  position: absolute; left: 11px; top: 11px; width: 440px; height: 956px;
  border-radius: 55px; overflow: hidden;
}
.opening img { display: block; width: 100%; height: 100%; object-fit: contain; }
.frame { position: absolute; inset: 0; width: 100%; height: 100%; }
</style>
```

For perspective frames use the matrix and source clipping described in
[asset geometry](assets.md#perspective-device-screens), rather than fitting a
rectangle by eye.

## Floating card

Keep a marketing callout separate from the raw capture so its text remains
editable. Position it in the artboard coordinate space above the device; put it
inside the device wrapper only when it should rotate/scale with that device.
Use user-supplied copy or clearly illustrative content for mockups.

```html
<aside class="callout"><strong>Plan your next trip</strong><p>Keep your route handy.</p></aside>
<style>
.callout {
  position: absolute; z-index: 2; left: 100px; top: 1400px; width: 800px;
  box-sizing: border-box; padding: 32px 40px; border-radius: 36px;
  background: #f5faff; color: #172c40; box-shadow: 0 16px 40px #102c4933;
  font-size: 36px; line-height: 1.25;
}
.callout p { margin: 12px 0 0; }
</style>
```

## Artwork continuing across adjacent screenshots

For two equal-sized canvases, duplicate one static scene into both artboards
and shift it horizontally by exactly one canvas width in the second. Keep the
scene markup/styles identical and the artboards adjacent in `index.json`.
For the illustrative 1206 × 2622 canvas below, scene width is 2412px. Replace
these dimensions for the actual collection. Keep per-artboard headlines outside
the scene if they should not travel with it.

```html
<!-- First artboard uses --offset:0px; second uses --offset:-1206px. -->
<div class="window" style="--offset:0px">
  <div class="scene">
    <img src="../../assets/screenshots/tablet.png" alt="App screen">
  </div>
</div>
<style>
.window { position: absolute; inset: 0; overflow: hidden; background: #009cff; }
.scene {
  position: absolute; width: 2412px; height: 2622px;
  transform: translateX(var(--offset));
}
.scene img { position: absolute; left: 700px; top: 600px; width: 1200px; height: auto; }
</style>
```

Inspect the two exports side by side to check the seam. A store carousel may add
gaps or show one image alone, so keep each image understandable independently.

## Local typography

This CSS assumes it is saved at `assets/other/composition.css`, next to the font
files. Reference it from an artboard with
`<link rel="stylesheet" href="../../assets/other/composition.css">`.
Substitute the actual local font filenames and weights.

```css
@font-face {
  font-family: "Campaign"; src: url("./campaign-regular.woff2") format("woff2");
  font-weight: 400; font-style: normal;
}
@font-face {
  font-family: "Campaign"; src: url("./campaign-bold.woff2") format("woff2");
  font-weight: 700; font-style: normal;
}
body { font-family: "Campaign", sans-serif; font-weight: 400; font-synthesis: none; }
h1 { font-weight: 700; font-size: 96px; line-height: 1.08; }
```

For a variable font, declare only its supported weight range, for example
`font-weight: 400 900`. Supply an italic face when needed. A missing weight may
use another available face even with synthesis disabled. System aliases before
the local family can bypass the downloaded font entirely. Font loading success
also does not guarantee glyph coverage: inspect the rendered text, especially
after localization, and choose an appropriate local fallback where necessary.
