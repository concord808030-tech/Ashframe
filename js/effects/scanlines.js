/**
 * CRT-style horizontal scanlines.
 *
 * `density` is the number of lines over the full image height, so the
 * pattern scales with resolution. Each pixel row is darkened by exactly the
 * fraction of it covered by a dark band (an analytic box filter). Without
 * that, lines thinner than a pixel in the small preview would turn into
 * moiré instead of looking like the export.
 *
 * @param {ImageData} img  Edited in place.
 * @param {{density: number, opacity: number, thickness: number}} params
 *   density: lines across the image height; opacity: 0..100 darkness of a
 *   line; thickness: 10..90 percent of each period that is dark.
 */
export function scanlines(img, { density, opacity, thickness }) {
  const o = opacity / 100;
  if (!o) return;
  const { width: w, height: h, data: d } = img;
  const period = h / density;
  const band = (thickness / 100) * period;

  // Total dark height between y = 0 and y = x. The coverage of row y is
  // covered(y + 1) - covered(y).
  const covered = (x) => {
    const k = Math.floor(x / period);
    return k * band + Math.min(x - k * period, band);
  };

  const rowBytes = w * 4;
  for (let y = 0; y < h; y++) {
    const m = 1 - o * (covered(y + 1) - covered(y));
    if (m >= 1) continue;
    const end = (y + 1) * rowBytes;
    for (let i = y * rowBytes; i < end; i += 4) {
      d[i] *= m;
      d[i + 1] *= m;
      d[i + 2] *= m;
    }
  }
}
