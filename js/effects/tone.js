/**
 * Brightness and contrast.
 *
 * Each channel value goes through a 256-entry lookup table, computed once per
 * render, so the per-pixel cost is three array reads.
 *
 * Contrast pivots around mid-grey (128):
 * -100 flattens everything to grey, 0 is untouched, +100 triples the slope.
 * Brightness shifts everything by up to ±128 levels.
 *
 * @param {ImageData} img  Edited in place.
 * @param {{brightness: number, contrast: number}} params  Both -100..100.
 */
export function tone(img, { brightness, contrast }) {
  if (!brightness && !contrast) return;
  const c = contrast / 100;
  const factor = c >= 0 ? 1 + c * 2 : 1 + c;
  const offset = brightness * 1.28;
  // Uint8ClampedArray rounds and clamps to 0..255 for us.
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = (i - 128) * factor + 128 + offset;

  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i]];
    d[i + 1] = lut[d[i + 1]];
    d[i + 2] = lut[d[i + 2]];
  }
}
