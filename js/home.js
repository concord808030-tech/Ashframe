/**
 * @file Home page: paints the hero "print" and the photo lab thumbnail.
 *
 * There are no image files. An arctic fjord (low sun, snow-capped peaks, a
 * glacier front, still water with a mirror reflection and drifting ice) is
 * painted procedurally, then developed through the same render pipeline the
 * photo lab uses. The page demonstrates the product with nothing to download.
 */

import { render } from './pipeline.js';
import { createState } from './state.js';
import { mulberry32 } from './rng.js';

/** Fixed seed so every visitor sees the same print. */
const SEED = 1957;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/**
 * 1D fractal ridge line by midpoint displacement, sampled to `w` points and
 * normalised to 0..1. Lower roughness = smoother skyline.
 */
function ridgeLine(w, rand, roughness) {
  const n = 1025;
  const a = new Float32Array(n);
  a[0] = rand();
  a[n - 1] = rand();
  for (let step = n - 1, scale = 1; step > 1; step /= 2, scale *= roughness) {
    const half = step / 2;
    for (let i = half; i < n; i += step) {
      a[i] = (a[i - half] + a[i + half]) / 2 + (rand() * 2 - 1) * scale * 0.5;
    }
  }
  let lo = Infinity, hi = -Infinity;
  for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const out = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const f = (x / (w - 1)) * (n - 1);
    const i = Math.min(n - 2, f | 0);
    out[x] = (a[i] + (a[i + 1] - a[i]) * (f - i) - lo) / (hi - lo);
  }
  return out;
}

/** Moving average, used to light slopes by their broad shape instead of every pixel. */
function smooth(arr, radius) {
  const n = arr.length;
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + arr[i];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - radius);
    const b = Math.min(n, i + radius + 1);
    out[i] = (pre[b] - pre[a]) / (b - a);
  }
  return out;
}

/** Sum of gaussian bumps: shapes where the big peaks stand. */
const envelope = (x, bumps) =>
  bumps.reduce((s, [at, width, amp]) => s + amp * Math.exp(-(((x - at) / width) ** 2)), 0);

/**
 * Draw a mountain range column by column. Faces turned toward the sun (on
 * the right) are lit snow; faces turned away fall into blue-grey shadow;
 * the base fades into dark rock.
 */
function drawRange(ctx, heights, base, { lit, shade, rock, snowline }) {
  const w = heights.length;
  // Light comes from the broad slope (a smoothed skyline), so faces read as
  // big lit and shadowed planes instead of per-pixel stripes.
  const broad = smooth(heights, 14);
  for (let x = 0; x < w; x++) {
    const top = base - heights[x];
    if (heights[x] < 1) continue;
    const rise = (broad[Math.min(w - 1, x + 6)] - broad[Math.max(0, x - 6)]) / 12;
    const light = clamp(0.5 - rise * 1.6, 0.06, 1);
    const snow = mix(shade, lit, light);
    const g = ctx.createLinearGradient(0, top, 0, base);
    g.addColorStop(0, rgb(snow));
    g.addColorStop(snowline, rgb(mix(snow, rock, 0.35)));
    g.addColorStop(1, rgb(rock));
    ctx.fillStyle = g;
    ctx.fillRect(x, top, 1.5, base - top);
  }
}

/**
 * Paint the unprocessed fjord with a faint cold cast. Most of the colour is
 * removed later by the B&W mix; what remains is the page's "slight colour".
 *
 * @param {number} w
 * @param {number} h
 * @returns {HTMLCanvasElement}
 */
function paintArctic(w, h) {
  const rand = mulberry32(SEED);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const shore = Math.round(h * 0.6); // waterline
  const sunX = w * 0.7;
  const sunY = shore - h * 0.13;

  // Sky: cold steel overhead, pale and faintly warm near the horizon
  const sky = ctx.createLinearGradient(0, 0, 0, shore);
  sky.addColorStop(0, '#3e4b57');
  sky.addColorStop(0.55, '#a9b4bd');
  sky.addColorStop(1, '#e8e4dd');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, shore);

  // Low sun and its glow
  const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, w * 0.32);
  glow.addColorStop(0, 'rgba(255,246,232,0.95)');
  glow.addColorStop(0.05, 'rgba(255,240,222,0.7)');
  glow.addColorStop(0.35, 'rgba(240,226,210,0.18)');
  glow.addColorStop(1, 'rgba(240,226,210,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, shore);

  // Far range: low, pale, softened by distance
  const far = ridgeLine(w, rand, 0.5);
  const farH = new Float32Array(w);
  for (let x = 0; x < w; x++) farH[x] = h * (0.05 + 0.1 * far[x]) * (0.6 + envelope(x / w, [[0.2, 0.25, 0.6], [0.85, 0.2, 0.5]]));
  drawRange(ctx, farH, shore, { lit: [214, 220, 225], shade: [160, 172, 182], rock: [150, 160, 168], snowline: 0.7 });

  const haze = ctx.createLinearGradient(0, shore - h * 0.2, 0, shore);
  haze.addColorStop(0, 'rgba(226,228,228,0)');
  haze.addColorStop(1, 'rgba(226,228,228,0.75)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, shore - h * 0.2, w, h * 0.2);

  // Main range: sharp ridged peaks, the tallest just left of the sun
  const main = ridgeLine(w, rand, 0.52);
  const mainH = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const ridged = 1 - Math.abs(main[x] * 2 - 1); // folds the line into sharp crests
    const env = envelope(x / w, [[0.58, 0.13, 1], [0.36, 0.1, 0.62], [0.9, 0.12, 0.45]]);
    mainH[x] = h * 0.4 * env * (0.45 + 0.55 * ridged);
  }
  drawRange(ctx, mainH, shore, { lit: [246, 247, 248], shade: [104, 120, 136], rock: [44, 52, 60], snowline: 0.55 });

  // Gullies: thin dark streaks running down the slopes
  ctx.save();
  for (let i = 0; i < 420; i++) {
    const x = rand() * w;
    const top = shore - mainH[x | 0];
    const len = (shore - top) * (0.15 + rand() * 0.6);
    const y = top + (shore - top) * rand() * 0.4 + 6;
    ctx.globalAlpha = 0.05 + rand() * 0.12;
    ctx.strokeStyle = '#1c242b';
    ctx.lineWidth = 0.6 + rand() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * len * 0.25, Math.min(shore, y + len));
    ctx.stroke();
  }
  ctx.restore();

  // Snow ledges: short strokes that follow the slope, breaking up the
  // vertical structure so the faces read as rock and snow
  const broadMain = smooth(mainH, 14);
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 1400; i++) {
    const x = rand() * w;
    const xi = x | 0;
    const height = mainH[xi];
    if (height < h * 0.04) continue;
    const top = shore - height;
    const y = top + 4 + Math.pow(rand(), 1.6) * height * 0.75;
    const slope = (broadMain[Math.min(w - 1, xi + 6)] - broadMain[Math.max(0, xi - 6)]) / 12;
    const len = 6 + rand() * 26;
    const dy = -slope * len * 0.8; // run along the slope, downhill
    const lit = slope < 0;
    ctx.globalAlpha = lit ? 0.18 + rand() * 0.3 : 0.08 + rand() * 0.14;
    ctx.strokeStyle = lit ? '#ffffff' : '#1e2830';
    ctx.lineWidth = 0.8 + rand() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + dy);
    ctx.stroke();
  }
  ctx.restore();

  // Mist pooling at the foot of the mountains
  const footMist = ctx.createLinearGradient(0, shore - h * 0.07, 0, shore);
  footMist.addColorStop(0, 'rgba(232,234,234,0)');
  footMist.addColorStop(1, 'rgba(232,234,234,0.6)');
  ctx.fillStyle = footMist;
  ctx.fillRect(0, shore - h * 0.07, w, h * 0.07);

  // Glacier front on the left: a flat ice shelf ending in a fractured cliff
  const shelfEnd = w * 0.34;
  const shelfTop = shore - h * 0.045;
  for (let x = 0; x < shelfEnd; x++) {
    const t = x / shelfEnd;
    const top = shelfTop + Math.sin(x * 0.013) * 3 + Math.sin(x * 0.051) * 1.5 + t * t * h * 0.03;
    const face = ctx.createLinearGradient(0, top, 0, shore);
    face.addColorStop(0, '#fbfcfc');
    face.addColorStop(0.12, '#dfe5ea');
    face.addColorStop(1, '#8796a3');
    ctx.fillStyle = face;
    ctx.fillRect(x, top, 1.5, shore - top);
  }
  ctx.save();
  for (let i = 0; i < 260; i++) {
    const x = rand() * shelfEnd;
    ctx.globalAlpha = 0.08 + rand() * 0.18;
    ctx.fillStyle = rand() > 0.3 ? '#4b5966' : '#ffffff';
    ctx.fillRect(x, shelfTop + h * 0.01 + rand() * h * 0.01, 1 + rand() * 2, h * (0.01 + rand() * 0.03));
  }
  ctx.restore();

  // Water: a glassy mirror of everything above the shoreline. Each row is
  // nudged sideways a little at random, more toward the viewer, which reads
  // as a faint swell rather than a zig-zag pattern.
  const above = document.createElement('canvas');
  above.width = w;
  above.height = shore;
  const actx = above.getContext('2d');
  if ('filter' in actx) actx.filter = 'blur(1.2px)';
  actx.drawImage(canvas, 0, 0);
  let drift = 0;
  for (let y = shore; y < h; y++) {
    const d = y - shore;
    drift = drift * 0.82 + (rand() - 0.5) * (0.4 + d * 0.012);
    ctx.drawImage(above, 0, Math.max(0, shore - 1 - d), w, 1, drift * 3, y, w, 1);
  }
  const deep = ctx.createLinearGradient(0, shore, 0, h);
  deep.addColorStop(0, 'rgba(24,34,42,0.18)');
  deep.addColorStop(0.5, 'rgba(18,26,32,0.45)');
  deep.addColorStop(1, 'rgba(10,14,18,0.78)');
  ctx.fillStyle = deep;
  ctx.fillRect(0, shore, w, h - shore);

  // Sun glitter on the water, directly below the sun
  ctx.save();
  for (let i = 0; i < 260; i++) {
    const t = Math.pow(rand(), 1.4);
    const y = shore + 3 + t * (h - shore) * 0.6;
    const spread = 30 + t * w * 0.08;
    const x = sunX + (rand() - 0.5) * spread * 2;
    ctx.globalAlpha = (1 - t) * (0.25 + rand() * 0.45);
    ctx.fillStyle = '#fff8ec';
    ctx.fillRect(x, y, 6 + rand() * 40 * (1 - t * 0.5), 1 + t * 2);
  }
  ctx.restore();

  // Bright seam where the water meets the shore
  ctx.fillStyle = 'rgba(255,252,246,0.55)';
  ctx.fillRect(0, shore, w, Math.max(1, h / 900));

  // Drifting ice floes, larger and lower as they come toward the viewer
  const floes = [];
  for (let i = 0; i < 11; i++) {
    const t = Math.pow(rand(), 0.9);
    floes.push({
      t,
      x: rand() * w,
      y: shore + (0.1 + t * 0.82) * (h - shore),
      r: w * (0.008 + t * 0.05),
      pts: Array.from({ length: 10 }, () => 0.55 + rand() * 0.5),
      rot: rand() * Math.PI,
    });
  }
  floes.sort((a, b) => a.y - b.y); // far ones first
  for (const f of floes) {
    // Smooth, irregular outline: a curve through the midpoints of a jittered ring
    const ring = f.pts.map((k, i) => {
      const a = f.rot + (i / f.pts.length) * Math.PI * 2;
      return [f.x + Math.cos(a) * f.r * k, f.y + Math.sin(a) * f.r * k * 0.2]; // flattened by perspective
    });
    const path = new Path2D();
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length];
      const mx = (p[0] + q[0]) / 2;
      const my = (p[1] + q[1]) / 2;
      i ? path.quadraticCurveTo(p[0], p[1], mx, my) : path.moveTo(mx, my);
    });
    path.quadraticCurveTo(ring[0][0], ring[0][1], (ring[0][0] + ring[1][0]) / 2, (ring[0][1] + ring[1][1]) / 2);
    const thick = 1.5 + f.t * f.r * 0.07;
    // Soft dark reflection, then the floe's blue-grey side, then its snowy top
    ctx.save();
    ctx.translate(0, thick * 2.2);
    if ('filter' in ctx) ctx.filter = 'blur(2px)';
    ctx.fillStyle = 'rgba(8,12,16,0.3)';
    ctx.fill(path);
    ctx.filter = 'none';
    ctx.translate(0, -thick * 1.2);
    ctx.fillStyle = '#7d8c98';
    ctx.fill(path);
    ctx.restore();
    const top = ctx.createLinearGradient(f.x - f.r, f.y, f.x + f.r, f.y);
    top.addColorStop(0, '#d9e0e5');
    top.addColorStop(0.6, '#f6f8f9');
    top.addColorStop(1, '#ffffff');
    ctx.fillStyle = top;
    ctx.fill(path);
  }

  // Gentle vignette, like an enlarger lens
  const vig = ctx.createRadialGradient(w / 2, h * 0.5, h * 0.25, w / 2, h * 0.5, w * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  return canvas;
}

/**
 * Editor state for a print: start from the lab's defaults, then override.
 * @param {Record<string, {enabled?: boolean} & Record<string, number|boolean>>} overrides
 */
function printState(overrides) {
  const state = createState();
  state.seed = SEED;
  for (const [id, o] of Object.entries(overrides)) {
    const fx = state.effects[id];
    if ('enabled' in o) fx.enabled = o.enabled;
    for (const [k, v] of Object.entries(o)) if (k !== 'enabled') fx.params[k] = v;
  }
  return state;
}

function developHero(source) {
  const canvas = document.getElementById('print');
  render(source, printState({
    tone: { contrast: 18 },
    mono: { amount: 72 },      // keep a trace of the cold cast and the warm sun
    grain: { amount: 22, size: 2 },
  }), canvas);
  canvas.classList.add('develop');
}

/** The photo lab's thumbnail: the same scene, visibly "edited". */
function paintThumb(source) {
  const canvas = document.getElementById('thumb');
  // Crop around the peak and the sun at 4:3
  const crop = document.createElement('canvas');
  crop.width = 800;
  crop.height = 600;
  const sh = source.height * 0.62;
  const sw = sh * (4 / 3);
  crop.getContext('2d').drawImage(source, source.width * 0.42, source.height * 0.22, sw, sh, 0, 0, 800, 600);

  render(crop, printState({
    tone: { contrast: 30 },
    mono: { amount: 70 },
    glitch: { enabled: true, slices: 9, shift: 35, split: 45 },
    scanlines: { enabled: true, density: 150, opacity: 22 },
    grain: { amount: 30, size: 2 },
  }), canvas);
}

function main() {
  // 2000px wide is plenty for a full-width hero; height chosen so both the
  // 21:9 desktop crop and the 4:5 phone crop (object-fit: cover) work.
  const scene = paintArctic(2000, 1250);
  developHero(scene);
  paintThumb(scene);
}

main();
