# Ashframe

**A darkroom in your browser.**

Ashframe is a growing set of open-source photo tools that run entirely on your device. The first is the **Photo lab**, for black-and-white, film grain, scanline and glitch looks. Drop in a photo, push the sliders, watch the preview update live, and export. Everything happens in an HTML canvas, and your images are never uploaded anywhere.

The home page lists the available tools. More will be added over time.

**[Live demo →](https://concord808030-tech.github.io/Ashframe/)**

---

## Features

- **Private by design.** All processing is local, with no server, no analytics and no external requests.
- **Formats:** open JPG, PNG and WebP (drag & drop, file picker or paste). Export to PNG, JPEG or WebP.
- **Live preview:** you edit a scaled-down copy (max 1400 px) so the sliders stay responsive.
- **Full-resolution export,** capped at 4000 px on the long side.
- **Consistent results:** effect sizes scale with the image, and grain and glitch use a seeded random generator. The export keeps the same look and layout as the preview.
- **Compare:** hold the Compare button (or the `\` key) to see the original.
- **Reseed:** pick a new random layout for grain and glitch.
- **Elegant black and white UI:** follows your device's light or dark mode, with a toggle to choose yourself. The home page cycles through five prints painted in code, each developing like a darkroom print, with soft rain in the background. You can pause both with one button.
- **Accessible:** Lighthouse scores 100. It's keyboard-friendly, works with screen readers, has touch-sized controls on phones, and respects `prefers-reduced-motion`.
- **No build step:** plain HTML, CSS and JavaScript (ES modules).

### Effects

| Effect | Controls |
| --- | --- |
| Tone | Brightness, contrast |
| Black & White | Mix (luminance-based, Rec. 709) |
| Film Grain | Amount, size (midtone-weighted monochrome noise) |
| Scanlines | Line count, opacity, thickness |
| Glitch | Slice count, shift, RGB channel split |

Every effect has an on/off toggle and a reset button. Double-click any slider to reset it.

Processing order: tone → glitch → B&W → scanlines → grain.

## Run locally

ES modules don't load from `file://`, so serve the folder with any static server:

```sh
# Python 3 (on Windows use `py` instead of `python`)
python -m http.server 8000
# or Node
npx serve .
```

Then open <http://localhost:8000> for the home page, or <http://localhost:8000/lab/> for the photo lab.

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, then **`main`** and **`/ (root)`**.
4. After a minute the site is live at `https://<your-username>.github.io/Ashframe/`. If you deploy a fork, update the demo link above.

The empty `.nojekyll` file tells Pages to serve the files as they are.

## Project structure

```
index.html            home page (title + tool list)
lab/index.html        the photo lab
css/base.css          shared design system: tokens, type, buttons, dark mode
css/home.css          home page styles
css/lab.css           photo lab styles
js/home.js            home page slideshow, rain and pause control
js/scenes.js          the five procedural prints
js/rain.js            background rain
js/theme.js           light/dark toggle (both pages)
js/lab.js             photo lab UI wiring, preview loop, export
js/state.js           effect definitions and defaults
js/pipeline.js        shared render pipeline (preview + export)
js/image-io.js        decoding, scaling, encoding, download
js/rng.js             seeded PRNG
js/effects/*.js       one module per effect
assets/brand/         mascot and icons (favicon, Apple touch icon)
assets/fonts/         Hanken Grotesk (self-hosted, SIL Open Font License)
docs/ARCHITECTURE.md  how it works, and how to write an effect
```

To add an effect, write a function `(imageData, params, rand) => void` in `js/effects/`. Then register it in `ORDER` in `js/pipeline.js` and add its sliders to `EFFECTS` in `js/state.js`. The panel builds itself from those definitions. See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the full walkthrough.

## Contributing

Pull requests are welcome. Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** first: no dependencies, no network requests, and the export must match the preview.

Personal files are kept out of git. Test photos go in `/samples/`, `/test-images/` or `/private/`, which are ignored. The `.gitignore` also excludes AI-assistant folders (`.claude/`, `.codex/`, `.cursor/`, …), editor settings, OS clutter and common secret files.

## License

See [LICENSE](LICENSE).
