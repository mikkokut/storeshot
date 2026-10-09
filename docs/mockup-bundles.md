# StoreShot mockup bundles

A mockup bundle is a normal folder. StoreShot deliberately uses an inspectable
manifest plus ordinary image files instead of a custom binary archive or a ZIP
dependency.

```text
my-device-frames/
├── storeshot-mockups.json
├── LICENSE
└── assets/
    ├── iphone-front.svg
    └── iphone-angle.webp
```

Place the complete bundle in the project's `mockup-bundles/<bundle-id>/`
folder, including its license. HTML artboards can reference frame images with
relative URLs such as `../../mockup-bundles/<bundle-id>/assets/iphone-front.svg`.
Use CSS positioning, clipping, and transforms to place screenshots behind frames.

The manifest remains useful for geometry and attribution. The `migrate` command
reads it to convert legacy device layers into HTML/CSS automatically, including
perspective screens. The preview workspace does not include a frame picker.

## Manifest

`storeshot-mockups.json` uses format version 1:

```json
{
  "format": "storeshot-mockup-bundle",
  "version": 1,
  "id": "example-apple-frames",
  "name": "Example Apple Frames",
  "author": "Example Studio",
  "license": {
    "name": "MIT",
    "url": "https://example.com/license",
    "file": "LICENSE"
  },
  "source": {
    "name": "example/frames",
    "url": "https://example.com/frames",
    "revision": "0123456789abcdef"
  },
  "mockups": [
    {
      "id": "iphone-front",
      "groupId": "iphone-example",
      "groupName": "iPhone Example",
      "name": "iPhone Example",
      "description": "Front · Black",
      "platform": "iphone",
      "style": "standard",
      "frame": "assets/iphone-front.svg",
      "width": 462,
      "height": 978,
      "screen": {
        "kind": "rect",
        "x": 11,
        "y": 11,
        "width": 440,
        "height": 956,
        "cornerRadius": 55
      }
    }
  ]
}
```

All identifiers use lowercase letters, numbers, and hyphens. Asset and license
paths are relative to the bundle root and cannot contain parent-directory
segments. Supported frame formats are SVG, PNG, JPEG, and WebP. `thumbnail` is
optional and defaults to the frame asset.

Installed mockup IDs are namespaced as `<bundle-id>/<mockup-id>`, so unrelated
bundles can safely use the same local mockup names.

## Screen geometry

The usual `rect` geometry places the screenshot into an axis-aligned rounded
rectangle before drawing the transparent frame above it.

Perspective frames can use a normalized 3×3 homography:

```json
{
  "kind": "projective",
  "transform": [
    [0.62, -0.08, 0.20],
    [0.04, 0.73, 0.12],
    [0.02, -0.01, 1]
  ],
  "sourceCornerRadius": { "x": 0.08, "y": 0.04 }
}
```

The transform maps normalized screenshot coordinates `(u, v)` into normalized
frame coordinates. This makes matrices independent of the source screenshot
resolution while the frame's `width` and `height` define its output coordinate
space.

## Licensing

Bundle authors should include a license file when redistribution is allowed and
record the source URL and revision. StoreShot preserves that metadata when only
a subset of a bundle is imported. Importing a bundle does not grant rights to
its assets; users remain responsible for following the bundle's license.
