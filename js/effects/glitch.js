/**
 * Digital glitch: displaced horizontal slices plus an RGB channel split.
 *
 * Slices: picks `slices` random horizontal bands (position and height are
 * relative to image height) and shifts each sideways, wrapping around the
 * edge. Shifts are relative to width (max 25% at shift = 100).
 *
 * Channel split: the red channel is sampled from the right and blue from the
 * left (max 2% of width), giving the classic chromatic fringe. At 100% B&W
 * mix it becomes a faint ghosted edge; lower the mix to see it in colour.
 *
 * @param {ImageData} img  Edited in place.
 * @param {{slices: number, shift: number, split: number}} params
 *   slices: band count; shift and split: 0..100 strength.
 * @param {() => number} rand  Seeded PRNG (see rng.js).
 */
export function glitch(img, { slices, shift, split }, rand) {
  const { width: w, height: h, data: d } = img;
  const rowBytes = w * 4;

  if (slices && shift) {
    // Read from an untouched copy so overlapping slices don't compound.
    const src = new Uint8ClampedArray(d);
    const maxShift = (shift / 100) * w * 0.25;
    for (let s = 0; s < slices; s++) {
      // Always draw exactly three random numbers per slice. Raising the slice
      // count then adds new slices without moving the existing ones, and the
      // layout is identical at any resolution.
      const y0 = Math.floor(rand() * h);
      const r = rand();
      // r*r skews toward thin slices, with the occasional thick one.
      const sliceH = Math.max(1, Math.round(h * (0.004 + r * r * 0.08)));
      const dx = Math.round((rand() * 2 - 1) * maxShift);
      if (!dx) continue;
      const y1 = Math.min(h, y0 + sliceH);
      for (let y = y0; y < y1; y++) {
        const base = y * rowBytes;
        for (let x = 0; x < w; x++) {
          const sx = (((x - dx) % w) + w) % w; // wrap around the edges
          const si = base + sx * 4;
          const di = base + x * 4;
          d[di] = src[si];
          d[di + 1] = src[si + 1];
          d[di + 2] = src[si + 2];
        }
      }
    }
  }

  const off = Math.round((split / 100) * w * 0.02);
  if (off) {
    // Green stays put; red and blue are sampled from either side, clamped at the edges.
    const src = new Uint8ClampedArray(d);
    const last = w - 1;
    for (let y = 0; y < h; y++) {
      const base = y * rowBytes;
      for (let x = 0; x < w; x++) {
        const rx = x + off > last ? last : x + off;
        const bx = x - off < 0 ? 0 : x - off;
        d[base + x * 4] = src[base + rx * 4];
        d[base + x * 4 + 2] = src[base + bx * 4 + 2];
      }
    }
  }
}
