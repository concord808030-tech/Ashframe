# Architecture

How Ashframe works under the hood, for anyone reading or changing the code.

Ashframe is a static site: plain HTML, CSS and JavaScript ES modules. There is no build step, framework or dependency, and no server code. GitHub Pages serves the files as they are.

## Pages

| URL | File | What it is |
| --- | --- | --- |
| `/` | `index.html` + `css/home.css` + `js/home.js` | Home page: the title, a cat-and-camera vignette, a slideshow of eight prints painted in code, rain in the background, and the list of tools. |
| `/lab/` | `lab/index.html` + `css/lab.css` + `js/lab.js` | The photo lab editor. |

Every page also loads `css/base.css`, the shared design system. Pages in subfolders reference shared files with `../`. GitHub Pages serves `/Ashframe/` as the site root, so absolute paths like `/css/...` would break. Always use relative paths.

### Adding a tool

1. Create `<tool>/index.html`. Load `../css/base.css` plus the tool's own CSS and JS.
2. On the home page, turn the next "Unexposed" frame in `index.html` into a link to the tool. Give it a `--tone` swatch from the academia tones in `base.css`.
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

index.html ──► js/home.js ──► js/scenes.js       eight procedural scenes
                   │
                   ├───────► js/pipeline.js     the same render() develops each print
                   └───────► js/rain.js         background rain

every page ──► js/fresh.js ──► sw.js           revalidate assets after a deploy
```

| File | Responsibility |
| --- | --- |
| `js/lab.js` | Builds the panel, holds the loaded image, schedules preview renders, runs the export. |
| `js/home.js` | Runs the slideshow. It develops each scene through `render()`, prepares the next one in idle time and caches it, and drives the pause button for both the slideshow and the rain. It also fires the vignette's camera flash and paints the photo lab thumbnail (a crop of the library scene, edited). |
| `js/scenes.js` | Eight painters of dark academia scenes (library at midnight, rain on the study window, the cloister, spires at dusk, candlelit desk, misty graveyard avenue, the old observatory, portrait gallery). Each returns an unprocessed canvas, uses a fixed seed and scales to any size. |
| `js/rain.js` | Rain on a fixed canvas behind the page (`z-index: -1`), in the `--ink` colour. It stops when paused or when the tab is hidden. |
| `js/fresh.js`, `sw.js` | Registers a root service worker that refetches same-origin CSS, modules and images with `cache: 'no-cache'` (a cheap 304 when unchanged). GitHub Pages sends `max-age=600` and a normal reload only revalidates the HTML, so without it a deploy could show new HTML with stale CSS and JS for up to 10 minutes. It caches nothing. |
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

The image never leaves the browser. There are no external requests, fonts or analytics. The only `fetch` is in `sw.js`, which re-requests the site's own files.

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
- Text uses only `--ink` or `--muted`. Both meet the 4.5:1 contrast ratio on every background, on the dark palette. `--faint` and the academia tones are for decoration only, never for text. Switched-off effects dim the sliders, not the text.
- The panel is `visibility: hidden` until `lab.js` has built it (`.panel.ready`). This prevents a layout shift on load.
- On touch screens (`pointer: coarse`), text is larger and every control is at least 44px tall.
- Everything works from the keyboard. Space/Enter on Compare, or the `\` key anywhere, shows the original.
- `prefers-reduced-motion: reduce` turns off every animation, transition and page morph, in one rule at the end of `base.css`.

## Design system

Direction: dark academia. Everything visual comes from tokens on `:root` in `css/base.css`. The site is dark only: there is no light mode, no theme toggle and no `data-theme`. (A leftover `ashframe-theme` value in `localStorage` is ignored.)

- **Neutrals:** `--paper` (walnut black), `--ink` (candle cream), `--backdrop` (behind photos), `--surface`, `--line`, `--muted` and `--faint`. They are warm and tinted, not pure black and white.
- **Academia tones:** `--oxblood`, `--moss`, `--brass`, `--slate` and `--sepia`. This is the "slight colour". It appears only as small swatches, one per tool and one per effect (the `tone` field in `EFFECTS`), as the print dots, in the export progress bar and in thin brass hairlines. Never use it for text or large fills.
- **Type:** two self-hosted families in `assets/fonts/`, both SIL OFL. Cormorant Garamond (a serif, upright and italic) is for display type, headings and the print captions. Hanken Grotesk is for the UI. Use sentence case everywhere, with no all-caps labels.
- **Atmosphere:** `body::before` is a fixed vignette and `body::after` a fixed paper grain (an inline SVG noise tile), both behind the content. The rain canvas sits above them.
- **Shape:** photos have sharp corners, while controls are soft (pill buttons, round slider thumbs).
- **Logo:** `assets/brand/logo.svg` is a cat seal. The `icon-*.png` files and `apple-touch-icon.png` are PNG renders of it, used for the favicon, the lab header logo and the empty tool frame. It is temporary art: regenerate the PNGs at the same sizes with Pillow if it changes.
- **Vignette:** the home hero has an inline SVG of a black cat on three books beside a bellows camera. The cat's blink and tail loops run continuously. The camera's flash fires each time a new print develops, but not for the first print, not while paused and not under reduced motion. `home.js` toggles the `.fire` class for the flash and `.paused` (from the pause button) to freeze the loops.
- **Prints:** eight code-painted scenes (captioned "Plate I" to "Plate VIII"). The sepia tone is applied by a CSS `filter` on the home frame only, so the lab and exports are unaffected. A fleuron (inline SVG) divides the hero from the tools list.
- **Motion:** there are few, deliberate moments.
  - The `.develop` reveal plays when a photo appears, like a print emerging in the developer tray. It's used for each print in the home slideshow (every 8 seconds, each one over the last) and for each photo loaded in the lab.
  - The vignette's blink and tail loops, and its flash as each new print develops.
  - Rain falls behind the home page.
  - The slideshow, rain and vignette move on their own for more than 5 seconds, so one button pauses all of them (WCAG 2.2.2). With reduced motion on, they start paused.
  - The page morphs from home to the lab (`@view-transition`, with `view-transition-name: frame` on both photo areas). Browsers without support simply navigate normally.
  - The export progress bar shows while an export runs.
  - Everything else is a short response to input (hover, switch, thumb press).
