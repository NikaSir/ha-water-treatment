# Water Treatment brand

`icon.svg` is the canonical source. `icon.png` is its 256 × 256 RGBA export.
The white filter contour and blue tile remain visible on light and dark surfaces.
The Home Assistant sidebar uses the matching native `mdi:filter-outline` glyph.

## Source and license

The filter contour is the unmodified `filter-outline` path from
[Pictogrammers Material Design Icons](https://github.com/Templarian/MaterialDesign/blob/2424e748e0cc63ab7b9c095a099b9fe239b737c0/svg/filter-outline.svg),
pinned to commit `2424e748e0cc63ab7b9c095a099b9fe239b737c0`.

The [upstream license](https://github.com/Templarian/MaterialDesign/blob/2424e748e0cc63ab7b9c095a099b9fe239b737c0/LICENSE)
distributes these icons under Apache 2.0. Its notice and the Apache 2.0 license
text are included in [LICENSE](LICENSE).

Changes to the presentation: the original 24 × 24 glyph is scaled and translated,
filled white, and placed on a blue rounded tile. No glyph geometry is changed.

## Raster export

With `sharp` available to Node.js, run from the repository root:

```javascript
const sharp = require("sharp");
const brand = "custom_components/water_treatment/brand";
sharp(brand + "/icon.svg")
  .resize(256, 256)
  .ensureAlpha()
  .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
  .toFile(brand + "/icon.png");
```

Keep transparent corners and four RGBA channels. Export from the SVG whenever
the source changes; do not edit the PNG independently.
