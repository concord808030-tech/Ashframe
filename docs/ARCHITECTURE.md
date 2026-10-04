# Architecture

How Ashframe works under the hood, for anyone reading or changing the code.

Ashframe is a static site: plain HTML, CSS and JavaScript ES modules. There is no build step, framework or dependency, and no server code. GitHub Pages serves the files as they are.

## Modules

```
index.html ──► js/main.js ──► js/state.js     effect definitions, defaults
                   │
                   ├────────► js/image-io.js  decode, scale, encode, download
                   │
                   └────────► js/pipeline.js  render(): runs the effects
                                  │
                                  ├─► js/rng.js         seeded random numbers
                                  └─► js/effects/*.js   one file per effect
```

| File | Responsibility |
| --- | --- |
| `js/main.js` | Builds the panel, holds the loaded image, schedules preview renders, runs the export. The only module that touches the DOM. |
| `js/state.js` | `EFFECTS` (every effect's sliders and defaults) and `createState()`. |
| `js/pipeline.js` | `render(source, state, target)`. Draws the source and applies the enabled effects in a fixed order. |
| `js/effects/*.js` | Pure pixel functions. They don't know about the DOM or the UI. |
| `js/image-io.js` | File validation, decoding (with EXIF rotation), scaling, `toBlob`, download. |
| `js/rng.js` | `mulberry32` PRNG, string hash, random seed. |

## Data flow

1. **Load.** `loadFile()` decodes the file once into `original` (full size). It also makes `preview`, a copy scaled to at most **1400px** on its long side.
2. **Edit.** Each slider writes into `state` and calls `requestRender()`. That schedules one `render(preview, state, view)` on the next animation frame, so fast dragging never queues up extra work.
3. **Compare.** While Compare is held, the untouched `preview` is drawn instead.
4. **Export.** `exportImage()` scales `original` to at most **4000px** and runs the same `render()` with the same `state`. It then encodes the result (PNG, JPEG or WebP) and downloads it.

The image never leaves the browser. There are no `fetch` calls, no external fonts and no analytics.

## Why the export matches the preview

The preview and the export run the same code at different sizes. Two rules keep them looking the same.

- **Sizes are relative.** Effects never use fixed pixel sizes. Scanline count is measured against image height. Glitch shift and channel split are fractions of the width. Grain cell size scales with the long side.
- **Randomness is seeded.** `state.seed` drives everything random. Each effect gets its own stream (`seed XOR hash(effectId)`), so changing glitch settings never reshuffles the grain. The glitch effect always draws exactly three random numbers per slice, which keeps the slice layout identical at any resolution.

One known gap: grain cells are clamped to at least 1px. At the smallest grain sizes, the preview grain can look a little coarser than the export.

## Processing order

```
tone → glitch → black & white → scanlines → grain
```

- **Tone** comes first, so contrast acts on the original colours.
- **Glitch** comes before black & white, so its RGB split can still show colour when the B&W mix is below 100%.
- **Scanlines** and **grain** come last, like texture on a final print. Grain added after scanlines also breaks up the bands a little.

The order is the `ORDER` array in `js/pipeline.js`.

## Writing an effect

An effect is a function with this signature:

```js
/**
 * @param {ImageData} img            edit img.data (RGBA bytes) in place
 * @param {object} params            current slider values, keyed by param id
 * @param {() => number} rand        seeded PRNG in [0, 1)
 */
export function myEffect(img, params, rand) { … }
```

Rules:

- Edit `img.data` in place. Leave alpha (every 4th byte) alone.
- Return early when the settings make it a no-op, e.g. `amount === 0`.
- Express sizes as fractions of `img.width` / `img.height`, never as fixed pixels.
- Use only `rand()`, never `Math.random()`, or the export won't match the preview.
- Call `rand()` the same number of times regardless of image size.
- If you need to read the original pixels while writing, copy them first: `new Uint8ClampedArray(img.data)`.

To register it:

1. Add the file to `js/effects/`.
2. Import it in `js/pipeline.js` and add `['myEffect', myEffect]` to `ORDER` at the right place.
3. Add an entry to `EFFECTS` in `js/state.js` with the same `id`, a label, `enabled`, and its `params` (min, max, step, default). The panel builds itself from this.

## Performance notes

- With all five effects on, a preview render takes roughly 70–80ms at 1400px on a typical laptop. Lower `PREVIEW_MAX` in `main.js` to trade quality for speed.
- An export at 4000px takes about 1 second and runs on the main thread. If that becomes a problem, the next step is moving `render()` into a Web Worker with `OffscreenCanvas`. The effects are pure functions, so they can move unchanged.
- `getContext('2d', { willReadFrequently: true })` keeps the canvas on the CPU, which makes repeated `getImageData` calls fast.
- After export, the large canvases are shrunk to 0×0 so the browser frees their memory right away.

## Accessibility & motion

- Every slider has a `<label>` and a live `<output>`. The status bar is an `aria-live` region.
- Everything works from the keyboard. Space/Enter on Compare, or the `\` key anywhere, shows the original.
- `prefers-reduced-motion: reduce` turns off every CSS animation and transition: the wordmark glitch, the blinking cursor and hover fades.
