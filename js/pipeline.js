/**
 * @file The render pipeline shared by the live preview and the export.
 *
 * Every effect has the same signature:
 *
 *   (img: ImageData, params: object, rand: () => number) => void
 *
 * It edits `img.data` (RGBA bytes) in place and leaves alpha alone. Effects
 * must stay resolution-independent: express sizes as a fraction of the image
 * width/height, never in fixed pixels, so a 1400px preview and a 4000px export
 * look the same.
 */

import { mulberry32, hashString } from './rng.js';
import { tone } from './effects/tone.js';
import { glitch } from './effects/glitch.js';
import { mono } from './effects/mono.js';
import { scanlines } from './effects/scanlines.js';
import { grain } from './effects/grain.js';

// Processing order. Glitch runs before B&W so its channel split survives a
// partial mix; scanlines and grain sit on top like a final print.
const ORDER = [
  ['tone', tone],
  ['glitch', glitch],
  ['mono', mono],
  ['scanlines', scanlines],
  ['grain', grain],
];

/**
 * Draw `source` into `target` and apply every enabled effect.
 *
 * The target is resized to match the source. It is only reallocated when the
 * size changes, so repeated preview renders reuse the same canvas.
 *
 * @param {HTMLCanvasElement} source  Unprocessed pixels (preview or export size).
 * @param {import('./state.js').State} state
 * @param {HTMLCanvasElement} target  Canvas that receives the result.
 * @returns {HTMLCanvasElement} The target, for chaining.
 */
export function render(source, state, target) {
  const w = source.width;
  const h = source.height;
  if (target.width !== w) target.width = w;
  if (target.height !== h) target.height = h;

  const ctx = target.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0);

  const active = ORDER.filter(([id]) => state.effects[id].enabled);
  if (!active.length) return target;

  const img = ctx.getImageData(0, 0, w, h);
  for (const [id, fn] of active) {
    // Each effect gets its own stream, so tweaking one never reshuffles another.
    const rand = mulberry32(state.seed ^ hashString(id));
    fn(img, state.effects[id].params, rand);
  }
  ctx.putImageData(img, 0, 0);
  return target;
}
