/**
 * Monochrome film grain.
 *
 * Builds a grid of random values (one per grain "cell") and samples it with
 * bilinear interpolation, so grains are soft blobs rather than hard squares.
 * Cell size is relative to the image's long side, so the grain looks the
 * same in the preview and the export. The cell is clamped to at least 1px,
 * so very fine grain can look slightly coarser in the small preview. The
 * same offset goes to R, G and B, so the grain never adds colour.
 *
 * Grain is strongest in the midtones and fades towards pure black and white,
 * as with real film.
 *
 * @param {ImageData} img  Edited in place.
 * @param {{amount: number, size: number}} params
 *   amount: 0..100 strength; size: 1..10, larger means coarser grain.
 * @param {() => number} rand  Seeded PRNG (see rng.js).
 */
export function grain(img, { amount, size }, rand) {
  if (!amount) return;
  const { width: w, height: h, data: d } = img;
  // At size 1, a 2000px image gets 1px grain and a 4000px image gets 2px grain.
  const cell = Math.max(1, (size * Math.max(w, h)) / 2000);
  // +2 so the bilinear lookup at the right and bottom edges stays in bounds.
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;

  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = (rand() + rand() + rand() - 1.5) / 1.5; // roughly gaussian, [-1, 1]
  }

  // Precompute horizontal sample positions once.
  const ix = new Int32Array(w);
  const fx = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const gx = x / cell;
    ix[x] = gx | 0;
    fx[x] = gx - ix[x];
  }

  const strength = (amount / 100) * 80;
  let i = 0;
  for (let y = 0; y < h; y++) {
    const gy = y / cell;
    const iy = gy | 0;
    const ty = gy - iy;
    const row0 = iy * gw;
    const row1 = row0 + gw;
    for (let x = 0; x < w; x++, i += 4) {
      const a = row0 + ix[x];
      const b = row1 + ix[x];
      const tx = fx[x];
      const top = grid[a] + (grid[a + 1] - grid[a]) * tx;
      const bot = grid[b] + (grid[b + 1] - grid[b]) * tx;
      const n = top + (bot - top) * ty;

      // l is luminance mapped to -1..1. The weight runs from 1.0 at mid-grey
      // down to 0.4 at pure black or white.
      const l = (d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722 - 128) / 128;
      const v = n * strength * (0.4 + 0.6 * (1 - l * l));
      d[i] += v;
      d[i + 1] += v;
      d[i + 2] += v;
    }
  }
}
