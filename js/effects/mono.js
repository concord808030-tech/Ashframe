/**
 * Black & white conversion.
 *
 * Uses perceived luminance (Rec. 709 weights: green counts most, blue least)
 * rather than a plain average, so skies and skin tones keep their relative
 * brightness. `amount` blends between the colour image and full monochrome.
 *
 * @param {ImageData} img  Edited in place.
 * @param {{amount: number}} params  0 = original colour, 100 = fully mono.
 */
export function mono(img, { amount }) {
  const m = amount / 100;
  if (!m) return;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    d[i] = r + (l - r) * m;
    d[i + 1] = g + (l - g) * m;
    d[i + 2] = b + (l - b) * m;
  }
}
