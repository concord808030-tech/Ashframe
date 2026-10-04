# Architecture

How Ashframe works under the hood, for anyone reading or changing the code.

Ashframe is a static site: plain HTML, CSS and JavaScript ES modules. There is no build step, framework or dependency, and no server code. GitHub Pages serves the files as they are.

## Pages

| URL | File | What it is |
| --- | --- | --- |
| `/` | `index.html` + `css/home.css` + `js/home.js` | Home page: the title, a slideshow of five prints painted in code, rain in the background, and the list of tools. |
| `/lab/` | `lab/index.html` + `css/lab.css` + `js/lab.js` | The photo lab editor. |

Every page also loads `css/base.css`, the shared design system. Pages in subfolders reference shared files with `../`. GitHub Pages serves `/Ashframe/` as the site root, so absolute paths like `/css/...` would break. Always use relative paths.

### Adding a tool

1. Create `<tool>/index.html`. Load `../css/base.css` plus the tool's own CSS and JS.
2. On the home page, turn the next "Unexposed" frame in `index.html` into a link to the tool. Give it a `--tone` swatch from the film tones in `base.css`.
3. Reuse `js/pipeline.js`, `js/image-io.js` and the effects where they fit. They know nothing about any page.

## Modules

```
lab/index.html ──► js/lab.js ──► js/state.js     effect definitions, defaults
                       │
                       ├───────► js/image-io.js  decode, scale, encode, download
                       │
                       └───────► js/pipeline.js  render(): runs the effects
                                     │
                                     ├─► js/rng.js         seeded random numbers
                                     └─► js/effects/*.js   one file per effect

index.html ──► js/home.js ──► js/scenes.js       five procedural scenes
                   │
                   ├───────► js/pipeline.js     the same render() develops each print
                   └───────► js/rain.js         background rain

every page ──► js/theme.js                       light/dark toggle
```

| File | Responsibility |
| --- | --- |
| `js/lab.js` | Builds the panel, holds the loaded image, schedules preview renders, runs the export. |
| `js/home.js` | Runs the slideshow. It develops each scene through `render()`, prepares the next one in idle time and caches it, and drives the pause button for both the slideshow and the rain. It also paints the photo lab thumbnail. |
| `js/scenes.js` | Five painters (arctic fjord, seascape, mountain fog, pine forest, harbour at night). Each returns an unprocessed canvas, uses a fixed seed and scales to any size. |
| `js/rain.js` | Rain on a fixed canvas behind the page (`z-index: -1`), in the current `--ink` colour. It stops when paused or when the tab is hidden. |
| `js/theme.js` | The light/dark toggle: saves the choice, sets `data-theme` on `<html>`, keeps `theme-color` in sync and fires a `themechange` event. |
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

- With all five effects on, a preview render takes roughly 70–80ms at 1400px on a typical laptop. Lower `PREVIEW_MAX` in `lab.js` to trade quality for speed.
- An export at 4000px takes about 1 second and runs on the main thread. If that becomes a problem, the next step is moving `render()` into a Web Worker with `OffscreenCanvas`. The effects are pure functions, so they can move unchanged.
- `getContext('2d', { willReadFrequently: true })` keeps the canvas on the CPU, which makes repeated `getImageData` calls fast.
- After export, the large canvases are shrunk to 0×0 so the browser frees their memory right away.

## Accessibility & motion

- Lighthouse scores 100 for accessibility on mobile and desktop. Keep it there.
- Every slider has a `<label>`. Its formatted value (e.g. "35%") goes in `aria-valuetext`. The visible `<output>` readout is `aria-hidden`, so screen readers don't announce the value twice.
- Effect toggles use `role="switch"`, and each effect section is a `role="group"` named by its title.
- The status bar is the page's only `aria-live` region.
- Text uses only `--ink` or `--muted`. Both meet the 4.5:1 contrast ratio on every background, in light and dark mode. `--faint` and the film tones are for decoration only, never for text. Switched-off effects dim the sliders, not the text.
- The panel is `visibility: hidden` until `lab.js` has built it (`.panel.ready`). This prevents a layout shift on load.
- On touch screens (`pointer: coarse`), text is larger and every control is at least 44px tall.
- Everything works from the keyboard. Space/Enter on Compare, or the `\` key anywhere, shows the original.
- `prefers-reduced-motion: reduce` turns off every animation, transition and page morph, in one rule at the end of `base.css`.

## Design system

Everything visual comes from tokens on `:root` in `css/base.css`. Dark mode only redefines those tokens.

- **Theme:** the device setting decides until the user presses the toggle. After that, `data-theme="light|dark"` on `<html>` wins, and the choice is saved in `localStorage` under `ashframe-theme`. Every page has a one-line inline script in `<head>` that applies the saved choice before first paint. The dark tokens are written twice in `base.css`, once for `[data-theme="dark"]` and once for the system setting when no choice is saved. Keep the two blocks identical.

- **Neutrals:** `--paper` (white or black), `--ink`, `--backdrop` (behind photos), `--surface`, `--line`, `--muted` and `--faint`. These use true white and true black, not tinted off-whites.
- **Film tones:** `--mist`, `--sage`, `--rose`, `--sand` and `--lilac`. This is the "slight colour". It appears only as small swatches, one per tool and one per effect (the `tone` field in `EFFECTS`), and in the export progress bar. Never use it for text or large fills.
- **Type:** one family, Hanken Grotesk, self-hosted in `assets/fonts/`. Use sentence case everywhere, with no all-caps labels. The home wordmark is the only display type.
- **Shape:** photos have sharp corners, while controls are soft (pill buttons, round slider thumbs).
- **Mascot:** an original line-art character drawn with Gemini, stored in `assets/brand/`.
  - `mascot.png` is the full illustration on the home page.
  - `icon-*.png` is her face in a disc, used for the favicon, the lab header logo and the empty tool frame. `apple-touch-icon.png` is the iPhone home-screen icon.
  - The light art is kept as a print, black ink on opaque white, and only the paper outside her silhouette is transparent.
  - In dark mode the mascot has its own artwork, `mascot-dark.png`. Both images are in the page; the `.for-light` and `.for-dark` classes in `base.css` show the one that matches the theme, toggle included. (`<picture>` can't follow the toggle, since its media query only sees the device setting.) It's white line art derived from the light original: thin strokes become white, and the solid hair stays black with a white outline and shine. It has the same pixel size as `mascot.png`, so nothing moves when the theme changes. A simple CSS colour inversion would turn her into a photo negative, which is why dark mode uses separate art.
  - The icon uses the same white-disc version in both themes for now. A dark icon can be added later the same way, as `icon-dark-*.png` at the same sizes.
- **Motion:** there are few, deliberate moments.
  - The `.develop` reveal plays when a photo appears, like a print emerging in the developer tray. It's used for each print in the home slideshow (every 8 seconds, each one over the last) and for each photo loaded in the lab.
  - Rain falls behind the home page.
  - The slideshow and rain move on their own for more than 5 seconds, so one button pauses both (WCAG 2.2.2). With reduced motion on, they start paused.
  - The page morphs from home to the lab (`@view-transition`, with `view-transition-name: frame` on both photo areas). Browsers without support simply navigate normally.
  - The export progress bar shows while an export runs.
  - Everything else is a short response to input (hover, switch, thumb press).
