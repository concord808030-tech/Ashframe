/**
 * @file The home page prints: five scenes painted procedurally on a canvas.
 *
 * Each painter returns an unprocessed colour canvas with a faint cast;
 * home.js then develops it through the photo lab's render pipeline (tone,
 * B&W mix, grain). Nothing is downloaded: every print is drawn from code with
 * a fixed seed, so every visitor sees the same five pictures.
 *
 * Painters scale with the canvas size; sizes are fractions of w and h.
 */

import { mulberry32 } from './rng.js';

/** Base seed: every visitor sees the same prints. Each scene offsets it. */
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
export function paintArctic(w, h) {
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


/* ---------- Shared bits for the other scenes ---------- */

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

function verticalGradient(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([at, color]) => g.addColorStop(at, color));
  return g;
}

/** Darkened corners, like an enlarger lens. */
function vignette(ctx, w, h, strength) {
  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, w * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/** A band of fog: transparent above, `color` at `y`, fading below. */
function fogBand(ctx, w, y, above, below, color, alpha) {
  const g = ctx.createLinearGradient(0, y - above, 0, y + below);
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(above / (above + below), `rgba(${color},${alpha})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, y - above, w, above + below);
}

/**
 * Mirror everything above `line` into the water below it, with each row
 * nudged sideways at random (a faint swell). `stretch` > 1 elongates the
 * reflection, which turns point lights into long streaks.
 */
function mirrorWater(ctx, canvas, w, h, line, rand, { blur = 1.2, stretch = 1, swell = 0.012 } = {}) {
  const above = document.createElement('canvas');
  above.width = w;
  above.height = line;
  const actx = above.getContext('2d');
  if ('filter' in actx) actx.filter = `blur(${blur}px)`;
  actx.drawImage(canvas, 0, 0);
  let drift = 0;
  for (let y = line; y < h; y++) {
    const d = y - line;
    drift = drift * 0.82 + (rand() - 0.5) * (0.4 + d * swell);
    const srcY = Math.max(0, line - 1 - d / stretch);
    ctx.drawImage(above, 0, srcY, w, 1, drift * 3, y, w, 1);
  }
}

/* ---------- Seascape ---------- */

/**
 * A long-exposure seascape: half sky, half sea, a horizon wrapped in mist.
 * In the spirit of Hiroshi Sugimoto's seascapes.
 */
export function paintSeascape(w, h) {
  const rand = mulberry32(SEED + 1);
  const [canvas, ctx] = makeCanvas(w, h);
  const horizon = Math.round(h * 0.52);

  ctx.fillStyle = verticalGradient(ctx, 0, horizon, [[0, '#56636e'], [0.6, '#b7bdc1'], [1, '#e8e4dd']]);
  ctx.fillRect(0, 0, w, horizon);
  ctx.fillStyle = verticalGradient(ctx, horizon, h, [[0, '#9aa2a7'], [0.35, '#5b656b'], [1, '#1b2124']]);
  ctx.fillRect(0, horizon, w, h - horizon);

  // Smoothed-out water: soft horizontal streaks, bolder up close. Drawn
  // sharp on their own layer, then blurred once (a filter per streak is slow).
  const [streaks, sctx] = makeCanvas(w, h);
  for (let i = 0; i < 900; i++) {
    const t = Math.pow(rand(), 1.8);
    const y = horizon + 2 + t * (h - horizon);
    const len = w * (0.04 + rand() * 0.5);
    sctx.globalAlpha = 0.025 + rand() * 0.06;
    sctx.fillStyle = rand() > 0.45 ? '#ffffff' : '#000000';
    sctx.fillRect(rand() * w - len * 0.25, y, len, Math.max(1, (0.5 + t * 3) * (h / 900)));
  }
  ctx.save();
  if ('filter' in ctx) ctx.filter = `blur(${Math.max(1, w / 1600)}px)`;
  ctx.drawImage(streaks, 0, 0);
  ctx.restore();

  fogBand(ctx, w, horizon - h * 0.01, h * 0.07, h * 0.05, '240,238,234', 0.6);
  ctx.fillStyle = 'rgba(40,46,50,0.18)';
  ctx.fillRect(0, horizon, w, Math.max(1, h / 1000));
  vignette(ctx, w, h, 0.32);
  return canvas;
}

/* ---------- Mountain fog ---------- */

/** Ridge after ridge receding into fog, like an ink-wash painting. */
export function paintMountainFog(w, h) {
  const rand = mulberry32(SEED + 2);
  const [canvas, ctx] = makeCanvas(w, h);

  ctx.fillStyle = verticalGradient(ctx, 0, h, [[0, '#aeb7bd'], [0.55, '#e3e4e1'], [1, '#efede8']]);
  ctx.fillRect(0, 0, w, h);

  // A pale sun behind the haze
  const sx = w * 0.32, sy = h * 0.27, sr = h * 0.055;
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 7);
  glow.addColorStop(0, 'rgba(255,250,240,0.7)');
  glow.addColorStop(1, 'rgba(255,250,240,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,252,246,0.9)';
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();

  const layers = 6;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1); // 0 = farthest
    const base = h * (0.46 + t * 0.44);
    const amp = h * (0.1 + t * 0.12);
    const ridge = ridgeLine(w, rand, 0.56 - t * 0.06);
    const shade = mix([196, 203, 207], [22, 27, 30], Math.pow(t, 1.15));
    ctx.fillStyle = rgb(shade);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x < w; x += 2) ctx.lineTo(x, base - ridge[x] * amp);
    ctx.lineTo(w, base - ridge[w - 1] * amp);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    // Fog pooling in the valley in front of this ridge
    if (i < layers - 1) fogBand(ctx, w, base, amp * 0.6, h * 0.06, '236,237,234', 0.75 - t * 0.25);
  }

  // A few birds crossing the sky
  ctx.strokeStyle = 'rgba(30,34,38,0.7)';
  ctx.lineWidth = Math.max(1, h / 700);
  for (let i = 0; i < 6; i++) {
    const bx = w * (0.55 + rand() * 0.25);
    const by = h * (0.14 + rand() * 0.14);
    const s = h * (0.006 + rand() * 0.006);
    ctx.beginPath();
    ctx.moveTo(bx - s, by - s * 0.4);
    ctx.quadraticCurveTo(bx - s * 0.4, by - s * 0.7, bx, by);
    ctx.quadraticCurveTo(bx + s * 0.4, by - s * 0.7, bx + s, by - s * 0.4);
    ctx.stroke();
  }

  vignette(ctx, w, h, 0.25);
  return canvas;
}

/* ---------- Pine forest ---------- */

/** One pine: overlapping tiers of branches narrowing to a spire. */
function pine(ctx, x, ground, height, width, rand) {
  const tiers = 7;
  ctx.beginPath();
  for (let k = 0; k < tiers; k++) {
    const f = k / tiers; // 0 = lowest tier
    const bottom = ground - height * (0.1 + 0.82 * f);
    const top = Math.max(ground - height, bottom - height * 0.26);
    const half = width * 0.5 * (1 - f * 0.85) * (0.85 + rand() * 0.3);
    const droop = height * 0.03;
    ctx.moveTo(x - half, bottom + droop);
    ctx.quadraticCurveTo(x - half * 0.4, bottom - droop * 0.5, x, top);
    ctx.quadraticCurveTo(x + half * 0.4, bottom - droop * 0.5, x + half, bottom + droop);
    ctx.closePath();
  }
  ctx.fill();
  ctx.fillRect(x - width * 0.025, ground - height * 0.12, width * 0.05, height * 0.12);
}

/** Rows of pines fading into winter fog. */
export function paintPineForest(w, h) {
  const rand = mulberry32(SEED + 3);
  const [canvas, ctx] = makeCanvas(w, h);

  ctx.fillStyle = verticalGradient(ctx, 0, h, [[0, '#c9cfd2'], [0.6, '#eceeed'], [1, '#f3f2ee']]);
  ctx.fillRect(0, 0, w, h);

  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1); // 0 = farthest
    const ground = h * (0.62 + t * 0.34);
    const shade = mix([186, 193, 196], [16, 20, 19], Math.pow(t, 1.05));
    ctx.fillStyle = rgb(shade);

    // The slope the trees stand on
    const hill = ridgeLine(w, rand, 0.4);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x < w; x += 4) ctx.lineTo(x, ground - hill[x] * h * 0.04);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Trees: smaller, denser and paler in the distance
    const spacing = w * (0.012 + t * t * 0.09); // the front row is sparse
    for (let x = -spacing * rand(); x < w + spacing; x += spacing * (0.4 + rand() * 1.4)) {
      if (t > 0.6 && rand() < 0.3) continue; // gaps in the nearest rows
      const tall = h * (0.09 + t * 0.4) * (0.6 + rand() * 0.6);
      const gy = ground - hill[clamp(x | 0, 0, w - 1)] * h * 0.04 + h * 0.01;
      pine(ctx, x, gy, tall, tall * (0.28 + rand() * 0.08), rand);
    }
    if (i < layers - 1) fogBand(ctx, w, ground, h * 0.12, h * 0.05, '238,239,237', 0.8 - t * 0.2);
  }

  // Falling snow, close to the lens
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 260; i++) {
    const r = Math.max(0.6, rand() * rand() * h * 0.004);
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }

  vignette(ctx, w, h, 0.3);
  return canvas;
}

/* ---------- Harbour at night ---------- */

/** A skyline across the water at night, moonlit, lit windows, rain. */
export function paintHarbourNight(w, h) {
  const rand = mulberry32(SEED + 4);
  const [canvas, ctx] = makeCanvas(w, h);
  const water = Math.round(h * 0.64);

  ctx.fillStyle = verticalGradient(ctx, 0, water, [[0, '#0b0f12'], [0.7, '#20262b'], [1, '#353a3e']]);
  ctx.fillRect(0, 0, w, water);

  // Moon and its halo in the drizzle
  const mx = w * 0.76, my = h * 0.2, mr = h * 0.045;
  const halo = ctx.createRadialGradient(mx, my, mr, mx, my, mr * 9);
  halo.addColorStop(0, 'rgba(225,230,235,0.35)');
  halo.addColorStop(1, 'rgba(225,230,235,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, water);
  ctx.fillStyle = '#e9ecee';
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, Math.PI * 2);
  ctx.fill();

  const cell = Math.max(2, h / 170); // window grid unit
  const skyline = (far) => {
    let x = -w * 0.01;
    while (x < w) {
      const bw = w * (0.022 + rand() * 0.05) * (far ? 0.8 : 1);
      const centre = 1 - Math.abs(x / w - 0.42) * 1.1; // taller toward the middle
      const bh = h * (far ? 0.12 : 0.06) + h * (far ? 0.28 : 0.24) * Math.pow(rand(), 1.6) * Math.max(0.25, centre);
      const top = water - bh;
      ctx.fillStyle = far ? '#2c3237' : rgb(mix([14, 17, 20], [30, 35, 39], rand()));
      ctx.fillRect(x, top, bw, bh);
      if (!far && rand() < 0.25) ctx.fillRect(x + bw * 0.45, top - h * 0.04, Math.max(1, cell * 0.3), h * 0.04); // antenna
      // Lit windows (a warm sand tone that survives the B&W mix as a hint)
      for (let wy = top + cell * 1.5; wy < water - cell * 2; wy += cell * 2.2) {
        for (let wx = x + cell; wx < x + bw - cell; wx += cell * 1.8) {
          if (rand() < (far ? 0.12 : 0.28)) {
            ctx.fillStyle = `rgba(255,224,170,${far ? 0.35 : 0.55 + rand() * 0.4})`;
            ctx.fillRect(wx, wy, cell, cell * 1.2);
          }
        }
      }
      x += bw + rand() * w * 0.004;
    }
  };
  skyline(true);
  fogBand(ctx, w, water - h * 0.05, h * 0.08, h * 0.05, '60,66,72', 0.55);
  skyline(false);

  // Water: stretched reflections turn every window into a streak of light
  mirrorWater(ctx, canvas, w, h, water, rand, { blur: 2, stretch: 2.6, swell: 0.003 });
  ctx.fillStyle = verticalGradient(ctx, water, h, [[0, 'rgba(8,10,12,0.1)'], [1, 'rgba(4,5,6,0.6)']]);
  ctx.fillRect(0, water, w, h - water);
  ctx.fillStyle = 'rgba(200,205,210,0.35)';
  ctx.fillRect(0, water, w, Math.max(1, h / 900));

  // Rain across the whole frame
  ctx.lineCap = 'round';
  for (let i = 0; i < 1600; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const len = h * (0.015 + rand() * 0.035);
    ctx.strokeStyle = `rgba(220,226,230,${0.06 + rand() * 0.14})`;
    ctx.lineWidth = Math.max(0.6, rand() * h / 900);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * 0.18, y + len);
    ctx.stroke();
  }

  vignette(ctx, w, h, 0.45);
  return canvas;
}
