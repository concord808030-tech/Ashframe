# Contributing to Ashframe

Thanks for helping out! Ashframe is deliberately small and dependency-free, so the guidelines are short.

## Ground rules

- **No build step, no dependencies.** Plain HTML, CSS and ES modules only. The repo must keep working when served as-is from GitHub Pages.
- **Images never leave the device.** No network requests, no external fonts or CDNs, no analytics.
- **Monochrome UI.** Greys only, sharp corners, minimal motion. Any new animation must be disabled under `prefers-reduced-motion`.
- **Preview = export.** Effects must be resolution-independent and use the seeded `rand()`. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#writing-an-effect).

## Run it locally

```sh
python -m http.server 8000   # on Windows: py -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` directly from disk won't work, because browsers block ES modules on `file://`.

## Before opening a pull request

Test by hand in at least one Chromium browser and Firefox:

- [ ] JPG, PNG and WebP all load (picker, drag & drop, paste).
- [ ] Every slider changes the preview, and every toggle switches its effect off cleanly.
- [ ] The exported file looks like the preview and is ≤ 4000px on the long side.
- [ ] No errors in the browser console.
- [ ] The layout works at about 400px wide.
- [ ] With reduced motion enabled in your OS settings, nothing animates.

## Code style

- 2-space indent, single quotes, semicolons, trailing commas in multi-line literals.
- Give every exported function a JSDoc comment that explains what it does and why.
- Keep effects pure: no DOM access inside `js/effects/`.

## Privacy

Don't commit personal photos. Test images go in `/samples/`, `/test-images/` or `/private/`, which are git-ignored. Exported `ashframe-*` files are ignored too. AI-assistant and editor config folders (`.claude/`, `.codex/`, `.cursor/`, `.vscode/`, …) are git-ignored as well.
