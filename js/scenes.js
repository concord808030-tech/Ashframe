/**
 * @file The home page prints: eight dark academia scenes painted on a canvas.
 *
 * Each painter returns an unprocessed colour canvas with a faint warm cast
 * (lamplight, stone, night); home.js then develops it through the photo lab's
 * render pipeline (tone, B&W mix, grain). Nothing is downloaded: every print
 * is drawn from code with a fixed seed, so every visitor sees the same eight
 * pictures.
 *
 * Painters scale with the canvas size; sizes are fractions of w and h. The
 * interiors use a small one-point perspective (world X right, Y up, z into
 * the picture), which keeps the geometry readable as plain numbers.
 */

import { mulberry32 } from './rng.js';

/** Base seed: every visitor sees the same prints. Each scene offsets it. */
const SEED = 1957;

/** The warm cast every scene starts from. */
const LAMP = [232, 196, 138];  // #e8c48a, lamplight and candlelight
const STONE = [90, 80, 72];    // #5a5048
const NIGHT = [28, 34, 48];    // #1c2230

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const shade = (c, k) => c.map((v) => Math.round(clamp(v * k, 0, 255)));
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/* ---------- Shared helpers ---------- */

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

function linearGradient(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([at, color]) => g.addColorStop(at, color));
  return g;
}

const verticalGradient = (ctx, y0, y1, stops) => linearGradient(ctx, 0, y0, 0, y1, stops);

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
  const p = above / (above + below);
  // Eased in and out, so the densest line doesn't show as a crease
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(p * 0.55, `rgba(${color},${alpha * 0.7})`);
  g.addColorStop(p, `rgba(${color},${alpha})`);
  g.addColorStop(p + (1 - p) * 0.45, `rgba(${color},${alpha * 0.7})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, y - above, w, above + below);
}

/**
 * Radial light: `color` ('r,g,b' or [r, g, b]) at alpha `a`, gone by radius r.
 * `add` blends it with 'screen' (light that only ever brightens); `sx`/`sy`
 * stretch it into an ellipse, such as a pool of light on a floor.
 */
function glow(ctx, x, y, r, color, a, { add = false, sx = 1, sy = 1 } = {}) {
  ctx.save();
  if (add) ctx.globalCompositeOperation = 'screen';
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, `rgba(${color},${a})`);
  g.addColorStop(0.25, `rgba(${color},${a * 0.45})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}

/** Stroke a straight line between two [x, y] points. */
function line(ctx, [x0, y0], [x1, y1]) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** Fill an ellipse. */
function oval(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Trace a closed polygon of [x, y] points as the current path. */
function trace(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** Fill a polygon of [x, y] points. */
function poly(ctx, style, pts) {
  ctx.fillStyle = style;
  trace(ctx, pts);
  ctx.fill();
}

/** One-point perspective: world (X, Y, z) → screen [x, y]; s is the scale at z = 1. */
const perspective = (vx, vy, s) => (X, Y, z) => [vx + (X * s) / z, vy - (Y * s) / z];

/** Corners of a level rectangle (floor, ceiling) at height Y, seen through P. */
const flat = (P, Y, x0, x1, z0, z1) => [P(x0, Y, z0), P(x1, Y, z0), P(x1, Y, z1), P(x0, Y, z1)];

/** Corners of an upright rectangle on the wall at X, seen through P. */
const wall = (P, X, y0, y1, z0, z1) => [P(X, y0, z0), P(X, y1, z0), P(X, y1, z1), P(X, y0, z1)];

/**
 * A gradient along a receding plane, coloured by depth: `at(z)` is the
 * screen point at depth z and `color(z)` its colour.
 */
function depthGradient(ctx, at, near, far, color) {
  const [ax, ay] = at(near);
  const [bx, by] = at(far);
  const g = ctx.createLinearGradient(ax, ay, bx, by);
  const len2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
  for (let i = 0; i <= 10; i++) {
    const z = near * Math.pow(far / near, i / 10);
    const [px, py] = at(z);
    g.addColorStop(clamp(((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2, 0, 1), color(z));
  }
  return g;
}

/**
 * Add a pointed (gothic) arch to the current path: left edge x, bottom y,
 * width w, total height h. Two circular arcs of radius 0.8 × w meet at the
 * point. `closed: false` leaves the bottom open (for stroking a rib), and
 * `map` lets a caller lay the arch on a receding wall.
 */
function arch(ctx, x, y, w, h, closed = true, map = (px, py) => [px, py]) {
  const R = w * 0.8;
  const meet = Math.acos((w / 2 - R) / R); // angle where the two arcs meet
  const full = R * Math.sin(meet);
  const rise = Math.min(h, full);
  const spring = y - h + rise;
  const squash = rise / full;
  const pts = [[x, y], [x, spring]];
  const n = 14;
  for (let i = 1; i <= n; i++) {
    const a = Math.PI - ((Math.PI - meet) * i) / n;
    pts.push([x + R + R * Math.cos(a), spring - R * Math.sin(a) * squash]);
  }
  for (let i = n - 1; i >= 0; i--) {
    const a = Math.PI - ((Math.PI - meet) * i) / n;
    pts.push([x + w - R - R * Math.cos(a), spring - R * Math.sin(a) * squash]);
  }
  pts.push([x + w, y]);
  pts.forEach(([px, py], i) => {
    const [sx, sy] = map(px, py);
    if (i) ctx.lineTo(sx, sy);
    else ctx.moveTo(sx, sy);
  });
  if (closed) ctx.closePath();
}

/** Stars over the top `h` rows: mostly faint pinpricks, a few bright with a halo. */
function starfield(ctx, w, h, n, rand) {
  const unit = w / 1600;
  for (let i = 0; i < n; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const m = Math.pow(rand(), 5); // brightness: most stars are faint
    const r = Math.max(0.7, (0.5 + m * 2.2) * unit);
    if (m > 0.6) glow(ctx, x, y, r * 5, '220,225,235', 0.3 * m);
    ctx.fillStyle = `rgba(236,234,226,${0.3 + m * 0.7})`;
    ctx.fillRect(x - r / 2, y - r / 2, r, r);
  }
}

/** A bare winter tree, in the current strokeStyle: branches forking 7 times. */
function bareTree(ctx, x, ground, height, rand) {
  ctx.lineCap = 'round';
  const grow = (x0, y0, angle, len, width, depth) => {
    const x1 = x0 + Math.sin(angle) * len;
    const y1 = y0 - Math.cos(angle) * len;
    ctx.lineWidth = Math.max(0.6, width);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo((x0 + x1) / 2 + (rand() - 0.5) * len * 0.25, (y0 + y1) / 2, x1, y1);
    ctx.stroke();
    if (depth === 0) return;
    const spread = 0.3 + rand() * 0.35;
    const lean = (rand() - 0.5) * 0.35 - angle * 0.15; // branches drift back upward
    for (const side of [-1, 1]) {
      grow(x1, y1, angle + side * spread + lean, len * (0.66 + rand() * 0.16), width * 0.66, depth - 1);
    }
  };
  grow(x, ground, (rand() - 0.5) * 0.12, height * 0.36, height * 0.035, 7);
}

/* ---------- I. Library at midnight ---------- */

/** Shelves receding down an aisle, a rolling ladder and a green-shaded lamp on a desk. */
export function paintLibrary(w, h) {
  const rand = mulberry32(SEED + 1);
  const [canvas, ctx] = makeCanvas(w, h);
  const s = w * 0.5;
  const P = perspective(w * 0.5, h * 0.44, s);
  const FLOOR = -0.62, TOP = 1.62, CEIL = 1.9, NEAR = 0.6, FAR = 8;
  const lamp = [0.14, 0.12, 2.35]; // the bulb, in world units
  const light = (X, Y, z) => 1 / (1 + ((X - lamp[0]) ** 2 + (Y - lamp[1]) ** 2 + (z - lamp[2]) ** 2) * 1.6);
  const lit = (c, X, Y, z) => rgb(shade(c, 0.2 + 2.2 * light(X, Y, z) + Math.max(0, z - 5) * 0.08));

  ctx.fillStyle = '#15110e';
  ctx.fillRect(0, 0, w, h);

  // The end wall, with a tall moonlit window at the end of the aisle
  poly(ctx, '#2c2621', [P(-1, FLOOR, FAR), P(1, FLOOR, FAR), P(1, CEIL, FAR), P(-1, CEIL, FAR)]);
  const [wx0, wy0] = P(-0.3, -0.05, FAR);
  const [wx1, wy1] = P(0.3, 1.4, FAR);
  glow(ctx, (wx0 + wx1) / 2, (wy0 + wy1) / 2, (wx1 - wx0) * 3, '150,160,172', 0.4);
  ctx.fillStyle = '#b4b9bc';
  ctx.beginPath(); arch(ctx, wx0, wy0, wx1 - wx0, wy0 - wy1); ctx.fill();
  ctx.fillStyle = '#2c2621';
  ctx.fillRect((wx0 + wx1) / 2 - w * 0.002, wy1, w * 0.004, wy0 - wy1);
  ctx.fillRect(wx0, wy0 - (wy0 - wy1) * 0.45, wx1 - wx0, w * 0.003);

  // Ceiling with beams, the walls above the shelves, the floorboards
  poly(ctx, '#0f0c0a', flat(P, CEIL, -1, 1, NEAR, FAR));
  ctx.strokeStyle = '#070605';
  for (let z = 1.2; z < FAR; z += 1.1) {
    ctx.lineWidth = (0.1 * s) / z;
    line(ctx, P(-1, CEIL, z), P(1, CEIL, z));
  }
  for (const side of [-1, 1]) {
    poly(ctx, depthGradient(ctx, (z) => P(side, TOP, z), NEAR, FAR, (z) => lit([70, 56, 46], side, TOP, z)), wall(P, side, TOP, CEIL, NEAR, FAR));
  }
  poly(ctx, depthGradient(ctx, (z) => P(0, FLOOR, z), NEAR, FAR, (z) => lit([72, 54, 40], 0, FLOOR, z)), flat(P, FLOOR, -1, 1, NEAR, FAR));
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = Math.max(1, w / 1400);
  for (let X = -1; X <= 1; X += 0.125) {
    line(ctx, P(X, FLOOR, NEAR), P(X, FLOOR, FAR));
  }

  // Shelves: rows of spines, lit by the lamp, fading into the dark
  const SPINES = [[92, 34, 28], [54, 64, 44], [38, 44, 62], [112, 84, 52], [70, 50, 38], [128, 112, 88]];
  const rows = 9, gap = (TOP - FLOOR - 0.1) / rows;
  for (const side of [-1, 1]) {
    poly(ctx, '#0b0907', wall(P, side, FLOOR, TOP, NEAR, FAR));
    for (let r = 0; r < rows; r++) {
      const y0 = FLOOR + 0.1 + r * gap;
      for (let z = NEAR; z < FAR;) {
        const dz = 0.03 + rand() * 0.035;
        const tall = gap * (0.6 + rand() * 0.32);
        const base = SPINES[(rand() * SPINES.length) | 0];
        const k = 0.7 + rand() * 0.5;
        if (rand() > 0.05) {
          poly(ctx, lit(shade(base, k), side, y0 + tall / 2, z), wall(P, side, y0, y0 + tall, z, z + dz));
        }
        z += dz;
      }
      poly(ctx, depthGradient(ctx, (z) => P(side, y0, z), NEAR, FAR, (z) => lit([120, 90, 64], side, y0, z)), wall(P, side, y0 - 0.035, y0, NEAR, FAR));
    }
    for (let z = 1; z < FAR; z += 1.25) {
      poly(ctx, lit([84, 64, 46], side, 0.3, z), wall(P, side, FLOOR, TOP, z, z + 0.07));
    }
  }

  // The reading table, its lamp and an open book
  const Yt = -0.14, z0 = 1.95, z1 = 2.75;
  poly(ctx, lit([62, 42, 28], 0, Yt, 2.3), flat(P, Yt, -0.48, 0.48, z0, z1));
  for (const X of [-0.45, 0.45]) {
    const [lx, ly] = P(X, Yt, z0 + 0.03);
    ctx.fillStyle = '#1c140e';
    ctx.fillRect(lx - (0.02 * s) / z0, ly, (0.04 * s) / z0, P(X, FLOOR, z0)[1] - ly);
  }
  poly(ctx, '#2a1d14', [P(-0.48, Yt, z0), P(0.48, Yt, z0), P(0.48, Yt - 0.06, z0), P(-0.48, Yt - 0.06, z0)]);
  glow(ctx, ...P(lamp[0], Yt, lamp[2]), (0.6 * s) / lamp[2], LAMP, 0.7, { add: true, sy: 0.32 });
  poly(ctx, '#efe2c4', [P(-0.36, Yt, 2.12), P(-0.17, Yt + 0.02, 2.1), P(-0.17, Yt + 0.02, 2.42), P(-0.36, Yt, 2.4)]);
  poly(ctx, '#ddcca8', [P(-0.17, Yt + 0.02, 2.1), P(0.02, Yt, 2.12), P(0.02, Yt, 2.4), P(-0.17, Yt + 0.02, 2.42)]);

  const [bx, by] = P(lamp[0], Yt, lamp[2]);
  const [sx, sy] = P(lamp[0], Yt + 0.24, lamp[2]);
  const sw = (0.24 * s) / lamp[2], sh = (0.075 * s) / lamp[2];
  glow(ctx, sx, sy + sh * 0.6, sw * 1.1, LAMP, 0.95);
  ctx.fillStyle = '#3a2e1c';
  ctx.fillRect(bx - sw * 0.02, sy, sw * 0.04, by - sy);
  oval(ctx, bx, by, sw * 0.22, sw * 0.05);
  ctx.fillStyle = verticalGradient(ctx, sy - sh / 2, sy + sh / 2, [[0, '#3f6a48'], [1, '#1d3524']]);
  ctx.beginPath();
  ctx.moveTo(sx - sw / 2, sy + sh / 2);
  ctx.lineTo(sx - sw * 0.4, sy - sh * 0.25);
  ctx.quadraticCurveTo(sx, sy - sh * 0.8, sx + sw * 0.4, sy - sh * 0.25);
  ctx.lineTo(sx + sw / 2, sy + sh / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,236,190,0.9)';
  ctx.fillRect(sx - sw / 2, sy + sh / 2 - sh * 0.12, sw, sh * 0.14);

  // A rolling ladder leaning on the right-hand shelves, on its brass rail
  poly(ctx, '#6e5a3c', wall(P, 1, TOP + 0.03, TOP + 0.06, NEAR, FAR));
  const rail = (z) => [P(0.6, FLOOR, z), P(0.98, TOP + 0.05, z + 0.1)];
  const rails = [rail(1.55), rail(1.85)];
  ctx.strokeStyle = lit([120, 92, 62], 0.8, 0.4, 1.7);
  ctx.lineCap = 'butt';
  for (const [a, b] of rails) {
    ctx.lineWidth = (0.035 * s) / 1.6;
    line(ctx, a, b);
  }
  ctx.lineWidth = (0.02 * s) / 1.7;
  for (let k = 1; k < 11; k++) {
    const t = k / 11;
    const at = ([a, b]) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    line(ctx, at(rails[0]), at(rails[1]));
  }

  // The lamp warms the whole aisle a little; dust hangs in the moonlight
  glow(ctx, sx, sy + sh, w * 0.42, LAMP, 0.22, { add: true });
  glow(ctx, w * 0.5, h * 0.42, w * 0.12, '160,168,178', 0.12);
  vignette(ctx, w, h, 0.5);
  return canvas;
}

/* ---------- II. Rain on the study window ---------- */

/** A gothic window from inside: tracery, rain on the glass, spires in the mist, a candle. */
export function paintStudyWindow(w, h) {
  const rand = mulberry32(SEED + 2);
  const [canvas, ctx] = makeCanvas(w, h);
  const u = h / 1000;
  const wx = w * 0.33, ww = w * 0.34, top = h * 0.13, sill = h * 0.8;
  const splay = w * 0.05;

  ctx.fillStyle = verticalGradient(ctx, 0, h, [[0, '#1b1714'], [1, '#2a221c']]);
  ctx.fillRect(0, 0, w, h);

  // The deep stone reveal around the glass, catching the candle from below
  ctx.fillStyle = verticalGradient(ctx, top, sill, [[0, '#2c2722'], [0.7, rgb(STONE)], [1, '#8a7560']]);
  ctx.beginPath(); arch(ctx, wx - splay, sill + h * 0.02, ww + splay * 2, sill - top + h * 0.08); ctx.fill();

  // Heavy curtains drawn back either side, gathered at a tie-back
  for (const side of [-1, 1]) {
    const edge = side < 0 ? wx - splay * 0.7 : wx + ww + splay * 0.7;
    const outer = side < 0 ? 0 : w;
    ctx.fillStyle = linearGradient(ctx, outer, 0, edge, 0, Array.from({ length: 15 }, (_, i) => [i / 14, i % 2 ? '#4a2620' : '#170c0a']));
    ctx.beginPath();
    ctx.moveTo(outer, 0);
    ctx.lineTo(edge, 0);
    ctx.quadraticCurveTo(edge, h * 0.45, edge - side * w * 0.05, h * 0.62);
    ctx.quadraticCurveTo(edge - side * w * 0.02, h * 0.8, edge + side * w * 0.01, h);
    ctx.lineTo(outer, h);
    ctx.fill();
  }

  // Outside, clipped to the glass: dusk mist and faint college spires
  ctx.save();
  ctx.beginPath(); arch(ctx, wx, sill, ww, sill - top); ctx.clip();
  ctx.fillStyle = verticalGradient(ctx, top, sill, [[0, '#434b54'], [0.65, '#80878a'], [1, '#999891']]);
  ctx.fillRect(wx, top, ww, sill - top);
  for (const [far, color] of [[true, '#686e73'], [false, '#4c5155']]) {
    ctx.fillStyle = color;
    const ground = sill - h * (far ? 0.2 : 0.12);
    let x = wx - ww * 0.05;
    while (x < wx + ww) {
      const bw = ww * (0.08 + rand() * 0.12);
      const bh = h * (far ? 0.06 : 0.05) + rand() * h * 0.08;
      ctx.fillRect(x, ground - bh, bw, bh + h);
      if (rand() < 0.45) { // a spire
        ctx.beginPath();
        ctx.moveTo(x + bw * 0.25, ground - bh);
        ctx.lineTo(x + bw * 0.5, ground - bh - h * (0.1 + rand() * 0.14));
        ctx.lineTo(x + bw * 0.75, ground - bh);
        ctx.fill();
      } else { // pinnacles
        for (const f of [0.08, 0.92]) ctx.fillRect(x + bw * f - u * 3, ground - bh - h * 0.03, u * 6, h * 0.03);
      }
      x += bw + ww * 0.03 * rand();
    }
    fogBand(ctx, w, ground - h * 0.02, h * 0.08, h * 0.12, '150,152,150', far ? 0.6 : 0.45);
  }

  // Rain: runs down the glass, then beads with a bright edge
  ctx.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    let x = wx + rand() * ww;
    let y = top + rand() * (sill - top) * 0.8;
    const len = h * (0.08 + rand() * 0.35);
    ctx.strokeStyle = `rgba(225,230,230,${0.12 + rand() * 0.15})`;
    ctx.lineWidth = u * (1 + rand() * 2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let d = 0; d < len; d += h * 0.01) {
      x += (rand() - 0.5) * u * 4;
      y += h * 0.01;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 700; i++) {
    const x = wx + rand() * ww, y = top + rand() * (sill - top);
    const r = u * (1 + Math.pow(rand(), 3) * 6);
    ctx.fillStyle = 'rgba(30,34,38,0.35)';
    oval(ctx, x, y + r * 0.2, r, r * 1.15);
    ctx.fillStyle = 'rgba(235,238,236,0.6)';
    ctx.fillRect(x - r * 0.35, y - r * 0.5, r * 0.45, r * 0.45);
  }

  // Leaded diamond panes
  ctx.strokeStyle = 'rgba(28,26,24,0.55)';
  ctx.lineWidth = Math.max(1, u * 1.6);
  const pane = ww / 9;
  for (let k = -12; k < 24; k++) {
    for (const dir of [-1, 1]) {
      line(ctx, [wx + k * pane, sill], [wx + k * pane + dir * (sill - top) * 0.55, top]);
    }
  }
  ctx.restore();

  // Tracery: two lancets under an oculus with a quatrefoil, a transom, in dark stone
  const rise = ww * 0.742, lanSpring = top + rise + h * 0.06;
  ctx.strokeStyle = '#1d1915';
  ctx.lineWidth = ww * 0.03;
  ctx.lineJoin = 'round';
  ctx.beginPath(); arch(ctx, wx, sill, ww, sill - top, false); ctx.stroke();
  for (const i of [0, 1]) {
    ctx.beginPath(); arch(ctx, wx + (i * ww) / 2, sill, ww / 2, sill - lanSpring + ww * 0.371, false); ctx.stroke();
  }
  const ox = wx + ww / 2, oy = top + rise * 0.42, orad = ww * 0.12;
  ctx.beginPath(); ctx.arc(ox, oy, orad, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = ww * 0.014;
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    ctx.beginPath(); ctx.arc(ox + Math.cos(a) * orad * 0.45, oy + Math.sin(a) * orad * 0.45, orad * 0.42, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.lineWidth = ww * 0.02;
  line(ctx, [wx, h * 0.6], [wx + ww, h * 0.6]);

  // The sill and a candle burning on it
  const cx = w * 0.56, cTop = sill - h * 0.15, cw = w * 0.016;
  poly(ctx, '#7a6754', [[wx - splay - w * 0.03, sill], [wx + ww + splay + w * 0.03, sill],
    [wx + ww + splay + w * 0.05, sill + h * 0.04], [wx - splay - w * 0.05, sill + h * 0.04]]);
  ctx.fillStyle = '#2e251d';
  ctx.fillRect(wx - splay - w * 0.05, sill + h * 0.04, ww + splay * 2 + w * 0.1, h * 0.03);
  glow(ctx, cx, cTop - h * 0.03, h * 0.75, LAMP, 0.4, { add: true });
  glow(ctx, cx + w * 0.02, cTop - h * 0.1, h * 0.05, LAMP, 0.35, { add: true }); // reflected in the glass
  ctx.fillStyle = verticalGradient(ctx, sill - h * 0.012, sill + h * 0.012, [[0, '#d2aa6c'], [1, '#5a4228']]);
  oval(ctx, cx, sill, cw * 2.6, h * 0.012);
  ctx.fillStyle = linearGradient(ctx, cx - cw / 2, 0, cx + cw / 2, 0, [[0, '#e9dcc0'], [1, '#9c8b70']]);
  ctx.fillRect(cx - cw / 2, cTop, cw, sill - cTop);
  ctx.fillRect(cx - cw / 2 - u * 2, cTop + h * 0.01, u * 4, h * 0.04); // a drip
  drawFlame(ctx, cx, cTop - h * 0.004, h * 0.05);

  vignette(ctx, w, h, 0.5);
  return canvas;
}

/** A candle flame: a bright teardrop with a hot core, base at (x, y). */
function drawFlame(ctx, x, y, size) {
  glow(ctx, x, y - size * 0.45, size * 1.6, '255,226,170', 0.85);
  ctx.fillStyle = '#fff6df';
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.bezierCurveTo(x + size * 0.32, y - size * 0.45, x + size * 0.22, y, x, y);
  ctx.bezierCurveTo(x - size * 0.22, y, x - size * 0.32, y - size * 0.45, x, y - size);
  ctx.fill();
  ctx.strokeStyle = '#1a120c';
  ctx.lineWidth = Math.max(1, size * 0.05);
  line(ctx, [x, y + size * 0.05], [x, y - size * 0.15]);
}

/* ---------- III. The cloister ---------- */

/** A stone arcade receding into fog, with one lantern hanging halfway down. */
export function paintCloister(w, h) {
  const rand = mulberry32(SEED + 3);
  const [canvas, ctx] = makeCanvas(w, h);
  const s = w * 0.42;
  const P = perspective(w * 0.5, h * 0.54, s);
  const FLOOR = -0.72, SILL = -0.36, SPRING = 0.5, ROOF = 2.3, NEAR = 0.6, END = 12.5;
  const FOG = [98, 96, 92];
  const fogAt = (z) => clamp(1 - Math.exp(-(z - 0.8) * 0.15), 0, 1);
  const stone = (c, z) => rgb(mix(c, FOG, fogAt(z)));
  const bays = [];
  for (let z = 1.3; z < END - 0.6; z += 1.15) bays.push(z);

  ctx.fillStyle = '#14110e';
  ctx.fillRect(0, 0, w, h);

  // Vault, walls and floor, paling with distance
  poly(ctx, depthGradient(ctx, (z) => P(0, ROOF, z), NEAR, END, (z) => stone([22, 19, 16], z)), flat(P, ROOF, -1, 1, NEAR, END));
  for (const side of [-1, 1]) {
    const tone = side < 0 ? [52, 46, 40] : [40, 35, 31];
    poly(ctx, depthGradient(ctx, (z) => P(side, 0, z), NEAR, END, (z) => stone(tone, z)), wall(P, side, FLOOR, ROOF, NEAR, END));
  }
  poly(ctx, depthGradient(ctx, (z) => P(0, FLOOR, z), NEAR, END, (z) => stone([64, 58, 52], z)), flat(P, FLOOR, -1, 1, NEAR, END));
  poly(ctx, stone([60, 54, 48], END), [P(-1, FLOOR, END), P(1, FLOOR, END), P(1, ROOF, END), P(-1, ROOF, END)]);
  const [dx0, dy0] = P(-0.5, FLOOR, END);
  ctx.fillStyle = '#8e8b84';
  ctx.beginPath(); arch(ctx, dx0, dy0, (1 * s) / END, (1.9 * s) / END); ctx.fill();

  // Flagstones
  ctx.strokeStyle = 'rgba(10,8,6,0.35)';
  ctx.lineWidth = Math.max(1, w / 1500);
  for (let X = -1; X <= 1; X += 0.4) line(ctx, P(X, FLOOR, NEAR), P(X, FLOOR, END));
  for (let z = NEAR; z < END; z += 0.35 + rand() * 0.2) line(ctx, P(-1, FLOOR, z), P(1, FLOOR, z));

  // Open arches onto the misty garth, and the light they lay on the floor
  bays.forEach((za, i) => {
    const zb = bays[i + 1] ?? END;
    const o0 = za + 0.24, o1 = zb - 0.04;
    ctx.fillStyle = rgb(mix([168, 168, 162], FOG, fogAt(za) * 0.5));
    ctx.beginPath(); arch(ctx, o0, -SILL, o1 - o0, SPRING - SILL + (o1 - o0) * 0.742, true, (zz, ny) => P(-1, -ny, zz)); ctx.fill();
    poly(ctx, `rgba(190,190,184,${0.14 * (1 - fogAt(za))})`,
      [P(-1, FLOOR, o0), P(-1, FLOOR, o1), P(0.5, FLOOR, o1 + 0.5), P(0.5, FLOOR, o0 + 0.5)]);
  });

  // Piers and the ribs between them, far to near
  for (let i = bays.length - 1; i >= 0; i--) {
    const z = bays[i];
    const k = s / z;
    for (const side of [-1, 1]) {
      const [fx0, fy0] = P(side, FLOOR, z);
      const [fx1, fy1] = P(side * 0.82, SPRING, z);
      ctx.fillStyle = stone([74, 66, 58], z);
      ctx.fillRect(Math.min(fx0, fx1), fy1, Math.abs(fx1 - fx0), fy0 - fy1);
      poly(ctx, stone([104, 96, 86], z), wall(P, side * 0.82, FLOOR, SPRING, z, z + 0.24));
      ctx.fillStyle = stone([96, 88, 78], z);
      ctx.fillRect(Math.min(fx0, fx1) - 0.03 * k, fy1 - 0.05 * k, Math.abs(fx1 - fx0) + 0.06 * k, 0.07 * k); // capital
    }
    const [rx0, ry] = P(-0.91, SPRING, z);
    const [rx1] = P(0.91, SPRING, z);
    ctx.strokeStyle = stone([66, 58, 50], z);
    ctx.lineWidth = 0.17 * k;
    ctx.beginPath(); arch(ctx, rx0, ry, rx1 - rx0, (rx1 - rx0) * 0.742, false); ctx.stroke();
    ctx.strokeStyle = stone([110, 100, 90], z);
    ctx.lineWidth = 0.03 * k;
    ctx.beginPath(); arch(ctx, rx0 + 0.07 * k, ry, rx1 - rx0 - 0.14 * k, (rx1 - rx0 - 0.14 * k) * 0.742, false); ctx.stroke();
  }

  // The lantern, hanging from the fourth rib
  const zl = bays[3] + 0.02;
  const k = s / zl;
  const [lx, ly] = P(0, 0.85, zl);
  ctx.strokeStyle = '#141210';
  ctx.lineWidth = Math.max(1, 0.012 * k);
  line(ctx, [lx, P(0, 1.83, zl)[1]], [lx, ly - 0.14 * k]);
  glow(ctx, lx, ly, 3 * k, LAMP, 0.75, { add: true });
  glow(ctx, ...P(0, FLOOR, zl), 1.6 * k, LAMP, 0.55, { add: true, sy: 0.25 });
  ctx.fillStyle = '#ffe9bf';
  ctx.fillRect(lx - 0.055 * k, ly - 0.1 * k, 0.11 * k, 0.2 * k);
  poly(ctx, '#16120e', [[lx - 0.09 * k, ly - 0.1 * k], [lx + 0.09 * k, ly - 0.1 * k], [lx, ly - 0.17 * k]]);
  ctx.fillRect(lx - 0.075 * k, ly + 0.1 * k, 0.15 * k, 0.03 * k);
  ctx.fillRect(lx - 0.006 * k, ly - 0.1 * k, 0.012 * k, 0.2 * k);

  for (const z of [7, 3.5, 2]) glow(ctx, ...P(0, FLOOR + 0.1, z), (1.3 * s) / z, '120,118,112', 0.35, { sy: 0.12 }); // low fog
  vignette(ctx, w, h, 0.5);
  return canvas;
}

/* ---------- IV. Spires at dusk ---------- */

/** A college skyline against the last light, bare trees, rooks and mist on the lawn. */
export function paintSpires(w, h) {
  const rand = mulberry32(SEED + 4);
  const [canvas, ctx] = makeCanvas(w, h);
  const base = h * 0.7;
  const u = w / 1000;

  ctx.fillStyle = verticalGradient(ctx, 0, base, [[0, '#232733'], [0.5, '#555761'], [0.85, '#a3917e'], [1, '#c4ae92']]);
  ctx.fillRect(0, 0, w, base);
  glow(ctx, w * 0.5, base, w * 0.5, '222,176,120', 0.35);

  // Far roofs in the haze
  ctx.fillStyle = '#6a666a';
  for (let x = 0; x < w;) {
    const bw = w * (0.03 + rand() * 0.06);
    const bh = h * (0.03 + rand() * 0.05);
    ctx.fillRect(x, base - bh, bw + 1, bh);
    if (rand() < 0.4) ctx.fillRect(x + bw * 0.4, base - bh - h * 0.04, u * 5, h * 0.04);
    x += bw;
  }
  fogBand(ctx, w, base - h * 0.03, h * 0.06, h * 0.04, '168,156,144', 0.5);

  // The college in silhouette
  const ink = '#141317';
  const pin = (x, y, pw, ph) => poly(ctx, ink, [[x - pw / 2, y], [x, y - ph], [x + pw / 2, y]]);
  const block = (x0, x1, top) => { ctx.fillStyle = ink; ctx.fillRect(w * x0, h * top, w * (x1 - x0), base - h * top + 1); };
  const lit = (x0, x1, y0, y1, chance) => {
    for (let y = h * y0; y < h * y1; y += h * 0.03) {
      for (let x = w * x0 + u * 6; x < w * x1 - u * 6; x += u * 14) {
        if (rand() < chance) { ctx.fillStyle = `rgba(232,196,138,${0.5 + rand() * 0.4})`; ctx.fillRect(x, y, u * 5, h * 0.014); }
      }
    }
  };

  // Chapel tower and spire, centre
  block(0.472, 0.528, 0.37);
  poly(ctx, ink, [[w * 0.476, h * 0.37], [w * 0.5, h * 0.05], [w * 0.524, h * 0.37]]);
  for (const x of [0.472, 0.528]) pin(w * x, h * 0.372, u * 9, h * 0.07);
  ctx.fillStyle = '#4a4148';
  for (const x of [0.482, 0.504]) { ctx.beginPath(); arch(ctx, w * x, h * 0.46, w * 0.014, h * 0.06); ctx.fill(); }
  ctx.strokeStyle = ink;
  ctx.lineWidth = u * 2;
  ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.05); ctx.lineTo(w * 0.5, h * 0.02); ctx.stroke();
  // Chapel nave with buttress pinnacles and lit lancets (evensong)
  block(0.528, 0.74, 0.55);
  poly(ctx, ink, [[w * 0.528, h * 0.551], [w * 0.536, h * 0.5], [w * 0.732, h * 0.5], [w * 0.74, h * 0.551]]);
  for (let x = 0.535; x < 0.74; x += 0.0295) pin(w * x, h * 0.552, u * 7, h * 0.075);
  ctx.fillStyle = 'rgba(214,170,110,0.75)';
  for (let x = 0.543; x < 0.725; x += 0.0295) { ctx.beginPath(); arch(ctx, w * x, h * 0.66, w * 0.012, h * 0.085); ctx.fill(); }
  // Hall to the left with a little lantern on its roof
  block(0.3, 0.472, 0.575);
  poly(ctx, ink, [[w * 0.3, h * 0.576], [w * 0.315, h * 0.52], [w * 0.457, h * 0.52], [w * 0.472, h * 0.576]]);
  block(0.378, 0.394, 0.47);
  ctx.beginPath(); ctx.ellipse(w * 0.386, h * 0.47, w * 0.009, h * 0.02, 0, Math.PI, 0); ctx.fill();
  lit(0.31, 0.46, 0.6, 0.68, 0.25);
  // Gate tower with four turrets
  block(0.26, 0.3, 0.63);
  block(0.17, 0.26, 0.41);
  for (const x of [0.17, 0.196, 0.234, 0.26]) {
    block(x - 0.007, x + 0.007, 0.36);
    ctx.beginPath(); ctx.ellipse(w * x, h * 0.36, w * 0.009, h * 0.022, 0, Math.PI, 0); ctx.fill();
    pin(w * x, h * 0.34, u * 3, h * 0.03);
  }
  lit(0.18, 0.25, 0.45, 0.6, 0.2);
  // Ranges either side, and a second tower to the right
  block(0, 0.17, 0.6);
  for (let x = 0.02; x < 0.17; x += 0.05) block(x, x + 0.012, 0.56);
  lit(0, 0.17, 0.62, 0.68, 0.2);
  block(0.74, 1, 0.585);
  block(0.83, 0.885, 0.42);
  for (const x of [0.83, 0.857, 0.885]) pin(w * x, h * 0.422, u * 8, h * 0.06);
  lit(0.745, 1, 0.61, 0.68, 0.2);

  // The quad lawn, a gravel path to the chapel door, mist lying over both
  ctx.fillStyle = verticalGradient(ctx, base, h, [[0, '#3a3934'], [1, '#0f0f0d']]);
  ctx.fillRect(0, base, w, h - base);
  poly(ctx, 'rgba(120,114,104,0.6)', [[w * 0.36, h], [w * 0.5, h], [w * 0.503, base], [w * 0.497, base]]);
  fogBand(ctx, w, base, h * 0.1, h * 0.06, '150,144,138', 0.6);
  fogBand(ctx, w, base + h * 0.07, h * 0.05, h * 0.1, '150,144,138', 0.35);

  // Bare trees framing the quad, and rooks wheeling home
  ctx.strokeStyle = '#0c0c0e';
  bareTree(ctx, w * 0.09, h * 1.02, h * 0.85, rand);
  bareTree(ctx, w * 0.93, h * 1.02, h * 0.75, rand);
  ctx.strokeStyle = ink;
  ctx.lineCap = 'round';
  for (let i = 0; i < 18; i++) {
    const x = w * (0.56 + rand() * 0.3), y = h * (0.08 + rand() * 0.22);
    const sz = w * (0.004 + rand() * 0.006), flap = 0.2 + rand() * 0.6;
    ctx.lineWidth = sz * 0.35;
    ctx.beginPath();
    ctx.moveTo(x - sz, y - sz * flap);
    ctx.quadraticCurveTo(x - sz * 0.4, y - sz * 0.5, x, y);
    ctx.quadraticCurveTo(x + sz * 0.4, y - sz * 0.5, x + sz, y - sz * flap);
    ctx.stroke();
  }

  vignette(ctx, w, h, 0.5);
  return canvas;
}

/* ---------- V. Candlelit desk ---------- */

/** A still life: open book, dripping candle, ink pot and quill, a stack of books, glasses. */
export function paintCandleDesk(w, h) {
  const rand = mulberry32(SEED + 5);
  const [canvas, ctx] = makeCanvas(w, h);
  const desk = h * 0.6;
  const cx = w * 0.6, cBase = h * 0.74, cTop = h * 0.44, cw = w * 0.024;

  ctx.fillStyle = verticalGradient(ctx, 0, desk, [[0, '#17120f'], [1, '#2a211a']]);
  ctx.fillRect(0, 0, w, desk);
  ctx.fillStyle = verticalGradient(ctx, desk, h, [[0, '#3a2a1e'], [1, '#1d140e']]);
  ctx.fillRect(0, desk, w, h - desk);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = Math.max(1, h / 900);
  for (let i = 0; i < 40; i++) { // wood grain
    const y = desk + Math.pow(rand(), 0.8) * (h - desk);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.3, y + (rand() - 0.5) * h * 0.02, w * 0.7, y + (rand() - 0.5) * h * 0.02, w, y);
    ctx.stroke();
  }
  glow(ctx, cx, cTop, h * 0.9, LAMP, 0.32, { add: true });
  glow(ctx, cx, cBase, w * 0.4, LAMP, 0.35, { add: true, sy: 0.3 });

  // A stack of worn books behind the candle, spines out
  let y = h * 0.7;
  for (let i = 0; i < 5; i++) {
    const t = h * (0.038 + rand() * 0.025);
    const bw = w * (0.17 + rand() * 0.05);
    const x = w * 0.66 + (rand() - 0.5) * w * 0.025;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + w * 0.008, y - t + h * 0.006, bw, t);
    ctx.fillStyle = rgb(shade([[96, 34, 28], [50, 60, 40], [104, 78, 50], [40, 44, 60]][i % 4], 1.3 - i * 0.08));
    ctx.beginPath(); ctx.roundRect(x, y - t, bw, t, t * 0.2); ctx.fill();
    ctx.fillStyle = 'rgba(214,180,110,0.55)';
    for (const f of [0.15, 0.8]) ctx.fillRect(x + bw * f, y - t + t * 0.15, w * 0.004, t * 0.7);
    ctx.fillStyle = 'rgba(255,240,210,0.12)';
    ctx.fillRect(x, y - t, bw, t * 0.25);
    y -= t;
  }

  // The open book, its pages curving up from the spine, lines of text
  const bx = w * 0.4, back = h * 0.7, front = h * 0.88;
  poly(ctx, '#2a1810', [[bx - w * 0.19, front + h * 0.012], [bx + w * 0.19, front + h * 0.012], [bx + w * 0.15, back + h * 0.01], [bx - w * 0.15, back + h * 0.01]]);
  for (const side of [-1, 1]) {
    ctx.fillStyle = linearGradient(ctx, bx, 0, bx + side * w * 0.18, 0, [[0, '#8e7c5e'], [0.25, '#d9c9a6'], [1, side > 0 ? '#e6d8b8' : '#c9b893']]);
    ctx.beginPath();
    ctx.moveTo(bx, front);
    ctx.quadraticCurveTo(bx + side * w * 0.06, front - h * 0.02, bx + side * w * 0.18, front);
    ctx.lineTo(bx + side * w * 0.145, back);
    ctx.quadraticCurveTo(bx + side * w * 0.05, back - h * 0.02, bx, back + h * 0.005);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,44,30,0.35)';
    ctx.lineWidth = Math.max(1, h / 1000);
    for (let r = 1; r < 13; r++) {
      const f = r / 13;
      const yy = back + (front - back) * f - h * 0.012 * (1 - f);
      const reach = w * (0.145 + 0.035 * f);
      line(ctx, [bx + side * w * 0.025, yy], [bx + side * (reach - w * 0.02) * (0.75 + rand() * 0.25), yy]);
    }
  }

  // Ink pot and quill on the left
  const ix = w * 0.17, iy = h * 0.75;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  oval(ctx, ix - w * 0.03, iy, w * 0.06, h * 0.015);
  ctx.fillStyle = linearGradient(ctx, ix - w * 0.04, 0, ix + w * 0.04, 0, [[0, '#0c0e10'], [1, '#3c4246']]);
  ctx.beginPath(); ctx.roundRect(ix - w * 0.04, iy - h * 0.09, w * 0.08, h * 0.09, w * 0.012); ctx.fill();
  ctx.fillRect(ix - w * 0.018, iy - h * 0.115, w * 0.036, h * 0.03);
  ctx.fillStyle = 'rgba(255,230,190,0.75)';
  ctx.fillRect(ix + w * 0.022, iy - h * 0.08, w * 0.006, h * 0.06);
  ctx.strokeStyle = '#d8cfbf';
  ctx.lineWidth = w * 0.0025;
  ctx.beginPath();
  ctx.moveTo(ix - w * 0.005, iy - h * 0.1);
  ctx.quadraticCurveTo(ix + w * 0.03, iy - h * 0.3, ix + w * 0.1, iy - h * 0.48);
  ctx.stroke();
  ctx.fillStyle = 'rgba(226,218,204,0.92)';
  ctx.beginPath();
  ctx.moveTo(ix + w * 0.005, iy - h * 0.16);
  ctx.bezierCurveTo(ix - w * 0.02, iy - h * 0.3, ix + w * 0.05, iy - h * 0.46, ix + w * 0.1, iy - h * 0.48);
  ctx.bezierCurveTo(ix + w * 0.08, iy - h * 0.38, ix + w * 0.05, iy - h * 0.24, ix + w * 0.005, iy - h * 0.16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,110,96,0.5)';
  ctx.lineWidth = Math.max(1, w / 1600);
  for (let k = 1; k < 14; k++) { // barbs
    const t = k / 14;
    const qx = ix - w * 0.005 + (w * 0.105) * t * t, qy = iy - h * 0.1 - h * 0.38 * t;
    ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(qx - w * 0.018, qy + h * 0.02); ctx.stroke();
  }

  // The candle in its brass holder, wax running down
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  oval(ctx, cx + w * 0.05, cBase + h * 0.01, w * 0.08, h * 0.014);
  ctx.fillStyle = verticalGradient(ctx, cBase - h * 0.02, cBase + h * 0.02, [[0, '#c9a066'], [1, '#4a3520']]);
  oval(ctx, cx, cBase, w * 0.055, h * 0.018);
  ctx.fillRect(cx - cw * 0.9, cBase - h * 0.035, cw * 1.8, h * 0.035);
  ctx.fillStyle = linearGradient(ctx, cx - cw / 2, 0, cx + cw / 2, 0, [[0, '#f0e4c8'], [0.6, '#d4c4a2'], [1, '#8e7e62']]);
  ctx.fillRect(cx - cw / 2, cTop, cw, cBase - cTop - h * 0.03);
  for (let i = 0; i < 4; i++) {
    const dx = cx - cw / 2 + cw * (0.1 + rand() * 0.8), len = h * (0.03 + rand() * 0.12), dw = cw * (0.15 + rand() * 0.15);
    ctx.beginPath(); ctx.roundRect(dx - dw / 2, cTop - h * 0.004, dw, len, dw / 2); ctx.fill();
  }
  oval(ctx, cx, cTop, cw / 2, h * 0.006);
  drawFlame(ctx, cx, cTop - h * 0.006, h * 0.075);

  // Round reading glasses folded in front
  const gx = w * 0.68, gy = h * 0.9, gr = w * 0.032;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  for (const d of [-1, 1]) { oval(ctx, gx + d * gr * 1.25 + w * 0.02, gy + h * 0.012, gr, gr * 0.45); }
  ctx.strokeStyle = '#0e0c0a';
  ctx.lineWidth = w * 0.003;
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(gx + d * gr * 1.25, gy, gr, gr * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gx + d * gr * 2.2, gy - gr * 0.2); ctx.lineTo(gx + d * gr * 2.5, gy - gr * 0.9); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(gx, gy, gr * 0.3, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,240,215,0.7)';
  ctx.lineWidth = w * 0.0018;
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(gx + d * gr * 1.25, gy, gr * 0.7, gr * 0.32, 0, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke(); }

  vignette(ctx, w, h, 0.5);
  return canvas;
}

/* ---------- VI. Misty graveyard avenue ---------- */

/** An avenue of bare trees fading into fog, headstones, an iron gate, a lamp far off. */
export function paintGraveyard(w, h) {
  const rand = mulberry32(SEED + 6);
  const [canvas, ctx] = makeCanvas(w, h);
  const s = w * 0.42;
  const P = perspective(w * 0.5, h * 0.52, s);
  const G = -0.75, NEAR = 0.6, FAR = 40;
  const FOG = [178, 176, 168];
  const fogAt = (z) => clamp(1 - Math.exp(-(z - 0.9) * 0.2), 0, 1);
  const ink = (c, z) => rgb(mix(c, FOG, fogAt(z)));

  ctx.fillStyle = verticalGradient(ctx, 0, h * 0.52, [[0, '#6f7072'], [1, rgb(FOG)]]);
  ctx.fillRect(0, 0, w, h * 0.6);
  poly(ctx, depthGradient(ctx, (z) => P(0, G, z), NEAR, FAR, (z) => ink([40, 40, 34], z)), flat(P, G, -40, 40, NEAR, FAR));
  poly(ctx, depthGradient(ctx, (z) => P(0, G, z), NEAR, FAR, (z) => ink([92, 88, 80], z)), flat(P, G, -0.4, 0.4, NEAR, FAR)); // path

  // Everything that stands, sorted far to near so nearer things overlap
  const items = [];
  for (let k = 0; k < 10; k++) {
    for (const side of [-1, 1]) items.push({ kind: 'tree', X: side * (1.1 + rand() * 0.2), z: 1.2 * Math.pow(1.36, k) * (0.95 + rand() * 0.1) });
  }
  for (let i = 0; i < 50; i++) {
    items.push({ kind: 'stone', X: (rand() < 0.5 ? -1 : 1) * (0.65 + rand() * 2.6), z: 1.5 + Math.pow(rand(), 1.4) * 16,
      lean: (rand() - 0.5) * 0.35, tall: 0.4 + rand() * 0.4, cross: rand() < 0.2 });
  }
  items.push({ kind: 'gate', X: 0, z: 4.6 }, { kind: 'lamp', X: 0.3, z: 10 });
  items.sort((a, b) => b.z - a.z);

  let lamp;
  for (const it of items) {
    const [x, y] = P(it.X, G, it.z);
    const k = s / it.z;
    if (it.kind === 'tree') {
      ctx.strokeStyle = ink([22, 22, 20], it.z);
      bareTree(ctx, x, y, 2.6 * k, rand);
    } else if (it.kind === 'stone') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(it.lean);
      ctx.fillStyle = ink([54, 52, 48], it.z);
      const t = it.tall * k, half = 0.14 * k;
      if (it.cross) {
        ctx.fillRect(-half * 0.3, -t * 1.2, half * 0.6, t * 1.2);
        ctx.fillRect(-half, -t * 0.95, half * 2, half * 0.55);
      } else {
        ctx.beginPath();
        ctx.moveTo(-half, 0);
        ctx.lineTo(-half, -t + half);
        ctx.arc(0, -t + half, half, Math.PI, 0);
        ctx.lineTo(half, 0);
        ctx.fill();
      }
      ctx.restore();
    } else if (it.kind === 'gate') {
      ctx.fillStyle = ctx.strokeStyle = ink([20, 20, 20], it.z);
      ctx.lineWidth = Math.max(1, 0.025 * k);
      for (const side of [-1, 1]) {
        for (let X = 0.75; X < 4; X += 0.13) { // railings with spear tips
          const [bx] = P(side * X, G, it.z);
          ctx.fillRect(bx - 0.0125 * k, y - 1.15 * k, 0.025 * k, 1.15 * k);
          poly(ctx, ctx.fillStyle, [[bx - 0.035 * k, y - 1.15 * k], [bx, y - 1.27 * k], [bx + 0.035 * k, y - 1.15 * k]]);
        }
        const [ex] = P(side * 4, G, it.z);
        ctx.fillRect(Math.min(x + side * 0.7 * k, ex), y - 1.02 * k, Math.abs(ex - x - side * 0.7 * k), 0.035 * k);
        ctx.fillRect(Math.min(x + side * 0.7 * k, ex), y - 0.2 * k, Math.abs(ex - x - side * 0.7 * k), 0.035 * k);
        const px = x + side * 0.58 * k; // stone gate pier with a cap
        ctx.fillStyle = ink([46, 44, 40], it.z);
        ctx.fillRect(px - 0.13 * k, y - 1.7 * k, 0.26 * k, 1.7 * k);
        ctx.fillRect(px - 0.17 * k, y - 1.78 * k, 0.34 * k, 0.1 * k);
        ctx.beginPath(); ctx.arc(px, y - 1.85 * k, 0.09 * k, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = ink([20, 20, 20], it.z);
      }
      for (const ry of [0.4, 0.28]) { // the iron arch over the gateway
        ctx.beginPath(); ctx.ellipse(x, y - 1.7 * k, 0.45 * k, ry * k, 0, Math.PI, 0); ctx.stroke();
      }
    } else {
      ctx.fillStyle = ink([20, 20, 20], it.z);
      ctx.fillRect(x - 0.02 * k, y - 2.2 * k, 0.04 * k, 2.2 * k);
      lamp = [x, y - 2.3 * k, k];
    }
  }

  // Ground mist, then the lamp burning through it
  fogBand(ctx, w, P(0, G, 8)[1], h * 0.04, h * 0.05, '190,188,180', 0.45);
  fogBand(ctx, w, P(0, G, 3)[1], h * 0.05, h * 0.08, '180,178,170', 0.25);
  glow(ctx, lamp[0], lamp[1], w * 0.2, LAMP, 0.35, { add: true });
  glow(ctx, lamp[0], lamp[1], 0.6 * lamp[2], '255,236,200', 0.9, { add: true });
  ctx.fillStyle = '#fff1d2';
  ctx.fillRect(lamp[0] - 0.08 * lamp[2], lamp[1] - 0.12 * lamp[2], 0.16 * lamp[2], 0.2 * lamp[2]);

  vignette(ctx, w, h, 0.5);
  return canvas;
}

/* ---------- VII. The old observatory ---------- */

/** A domed observatory on a hill under the stars, slit open, telescope out, a lit window. */
export function paintObservatory(w, h) {
  const rand = mulberry32(SEED + 7);
  const [canvas, ctx] = makeCanvas(w, h);
  const u = w / 1000;

  const sky = verticalGradient(ctx, 0, h * 0.8, [[0, '#121722'], [0.5, rgb(NIGHT)], [1, '#55555a']]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.save(); // a faint band of the Milky Way
  ctx.translate(w * 0.5, h * 0.3);
  ctx.rotate(-0.42);
  glow(ctx, 0, 0, w * 0.6, '180,186,200', 0.16, { sy: 0.12 });
  ctx.restore();
  starfield(ctx, w, h * 0.8, 900, rand);
  for (let i = 0; i < 1200; i++) { // dust of the Milky Way
    const t = rand();
    const off = (rand() + rand() + rand() - 1.5) * h * 0.09;
    ctx.fillStyle = `rgba(220,224,232,${0.15 + rand() * 0.3})`;
    ctx.fillRect(w * t, h * (0.52 - t * 0.44) + off, u * 0.9, u * 0.9);
  }

  // A crescent moon, low on the left, lighting the dome from that side
  const mx = w * 0.17, my = h * 0.22, mr = h * 0.04;
  ctx.fillStyle = '#ece8dc';
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = sky;
  ctx.beginPath(); ctx.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.92, 0, Math.PI * 2); ctx.fill();
  glow(ctx, mx, my, mr * 6, '220,222,214', 0.22);

  // Hills: a far range, then the near hill the observatory stands on
  ctx.fillStyle = '#2c313c';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.7);
  ctx.bezierCurveTo(w * 0.25, h * 0.62, w * 0.6, h * 0.74, w, h * 0.64);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();
  fogBand(ctx, w, h * 0.72, h * 0.05, h * 0.04, '90,92,100', 0.35);
  ctx.fillStyle = verticalGradient(ctx, h * 0.6, h, [[0, '#262930'], [1, '#101114']]);
  ctx.beginPath();
  ctx.moveTo(0, h * 0.86);
  ctx.bezierCurveTo(w * 0.25, h * 0.8, w * 0.38, h * 0.62, w * 0.5, h * 0.62);
  ctx.bezierCurveTo(w * 0.64, h * 0.62, w * 0.78, h * 0.78, w, h * 0.82);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,146,136,0.35)'; // the path up
  ctx.lineWidth = u * 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.36, h);
  ctx.bezierCurveTo(w * 0.52, h * 0.86, w * 0.4, h * 0.72, w * 0.49, h * 0.635);
  ctx.stroke();
  ctx.strokeStyle = '#08090b';
  bareTree(ctx, w * 0.7, h * 0.7, h * 0.22, rand);

  // The drum, lit from the moon's side
  const ox = w * 0.5, base = h * 0.63, drumTop = h * 0.48, half = w * 0.082;
  ctx.fillStyle = linearGradient(ctx, ox - half, 0, ox + half, 0, [[0, '#6a6660'], [1, '#1c1c20']]);
  ctx.fillRect(ox - half, drumTop, half * 2, base - drumTop);
  ctx.fillStyle = '#121216';
  ctx.beginPath(); arch(ctx, ox + half * 0.3, base, half * 0.32, (base - drumTop) * 0.6); ctx.fill(); // door
  ctx.fillStyle = '#e8c48a';
  ctx.beginPath(); arch(ctx, ox - half * 0.55, drumTop + (base - drumTop) * 0.62, half * 0.26, (base - drumTop) * 0.42); ctx.fill();
  glow(ctx, ox - half * 0.42, drumTop + (base - drumTop) * 0.45, half * 1.1, LAMP, 0.5, { add: true });
  ctx.fillStyle = '#2a2826';
  ctx.fillRect(ox - half * 1.06, drumTop - h * 0.008, half * 2.12, h * 0.012);

  // The dome, its slit open and the telescope peeking out
  const r = half * 1.02;
  const dome = ctx.createRadialGradient(ox - r * 0.45, drumTop - r * 0.6, r * 0.1, ox, drumTop, r * 1.15);
  dome.addColorStop(0, '#b8b6b0');
  dome.addColorStop(0.6, '#55555a');
  dome.addColorStop(1, '#1a1b20');
  ctx.fillStyle = dome;
  ctx.beginPath(); ctx.arc(ox, drumTop - h * 0.008, r, Math.PI, 0); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(ox, drumTop - h * 0.008, r, Math.PI, 0); ctx.clip();
  ctx.strokeStyle = 'rgba(10,10,12,0.35)';
  ctx.lineWidth = u * 1.5;
  for (const f of [-0.7, -0.35, 0.35, 0.7]) { ctx.beginPath(); ctx.ellipse(ox, drumTop, Math.abs(f) * r, r, 0, Math.PI, f < 0 ? Math.PI * 1.5 : Math.PI * 2); ctx.stroke(); }
  poly(ctx, '#0b0c10', [[ox + r * 0.04, drumTop], [ox + r * 0.2, drumTop - r * 1.05], [ox + r * 0.4, drumTop - r * 1.05], [ox + r * 0.28, drumTop]]);
  ctx.restore();
  ctx.save();
  ctx.translate(ox + r * 0.2, drumTop - r * 0.45);
  ctx.rotate(0.62);
  ctx.fillStyle = '#8e8a84';
  ctx.fillRect(-r * 0.07, -r * 1.05, r * 0.14, r * 1.05);
  ctx.fillStyle = '#2a2a2e';
  ctx.fillRect(-r * 0.09, -r * 1.12, r * 0.18, r * 0.2);
  ctx.restore();

  vignette(ctx, w, h, 0.5);
  return canvas;
}

/* ---------- VIII. Portrait gallery ---------- */

/** A long gallery of gilt-framed portraits, parquet underfoot, a tall window at the end. */
export function paintGallery(w, h) {
  const rand = mulberry32(SEED + 8);
  const [canvas, ctx] = makeCanvas(w, h);
  const s = w * 0.5;
  const P = perspective(w * 0.5, h * 0.46, s);
  const FLOOR = -0.62, CEIL = 1.4, DADO = -0.08, NEAR = 0.6, FAR = 9;
  const toEnd = (z) => Math.pow(z / FAR, 1.4); // things brighten toward the window
  const lit = (c, z, gain = 1) => rgb(shade(c, 0.5 + gain * 1.1 * toEnd(z)));

  ctx.fillStyle = '#120e0b';
  ctx.fillRect(0, 0, w, h);

  // The end wall and its tall window of light
  poly(ctx, '#3a3029', [P(-1, FLOOR, FAR), P(1, FLOOR, FAR), P(1, CEIL, FAR), P(-1, CEIL, FAR)]);
  const [wx0, wy0] = P(-0.38, -0.32, FAR);
  const [wx1, wy1] = P(0.38, 1.22, FAR);
  ctx.fillStyle = '#f0ebdf';
  ctx.beginPath(); arch(ctx, wx0, wy0, wx1 - wx0, wy0 - wy1); ctx.fill();
  ctx.fillStyle = '#3a3029';
  const bar = Math.max(1, w * 0.0025);
  for (const f of [1 / 3, 2 / 3]) ctx.fillRect(wx0 + (wx1 - wx0) * f - bar / 2, wy1, bar, wy0 - wy1);
  for (const f of [0.35, 0.62, 0.85]) ctx.fillRect(wx0, wy1 + (wy0 - wy1) * f, wx1 - wx0, bar);

  // Ceiling, walls with a dado rail and panelling, parquet floor
  poly(ctx, depthGradient(ctx, (z) => P(0, CEIL, z), NEAR, FAR, (z) => lit([44, 36, 30], z)), flat(P, CEIL, -1, 1, NEAR, FAR));
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  for (let z = 1; z < FAR; z += 0.9) {
    ctx.lineWidth = (0.05 * s) / z;
    line(ctx, P(-1, CEIL, z), P(1, CEIL, z));
  }
  for (const side of [-1, 1]) {
    poly(ctx, depthGradient(ctx, (z) => P(side, 0.6, z), NEAR, FAR, (z) => lit([70, 40, 34], z)), wall(P, side, DADO, CEIL, NEAR, FAR));
    poly(ctx, depthGradient(ctx, (z) => P(side, -0.3, z), NEAR, FAR, (z) => lit([62, 46, 34], z)), wall(P, side, FLOOR, DADO, NEAR, FAR));
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1, w / 1400);
    for (let z = 0.8; z < FAR; z += 0.6) { // panels
      trace(ctx, wall(P, side, FLOOR + 0.08, DADO - 0.08, z + 0.06, z + 0.54));
      ctx.stroke();
    }
    poly(ctx, depthGradient(ctx, (z) => P(side, DADO, z), NEAR, FAR, (z) => lit([120, 96, 66], z)), wall(P, side, DADO - 0.04, DADO, NEAR, FAR));
  }
  poly(ctx, depthGradient(ctx, (z) => P(0, FLOOR, z), NEAR, FAR, (z) => lit([104, 74, 48], z, 1.3)), flat(P, FLOOR, -1, 1, NEAR, FAR));
  ctx.strokeStyle = 'rgba(20,12,6,0.4)';
  ctx.lineWidth = Math.max(1, w / 1500);
  for (let X = -1; X <= 1; X += 0.1) {
    line(ctx, P(X, FLOOR, NEAR), P(X, FLOOR, FAR));
    for (let z = NEAR + rand() * 0.4; z < FAR; z += 0.4) line(ctx, P(X, FLOOR, z), P(X + 0.1, FLOOR, z)); // joints
  }
  // The window's reflection on the polished floor
  glow(ctx, ...P(0, FLOOR, 3.2), h * 0.42, '236,226,206', 0.3, { add: true, sx: 0.35 });

  // Portraits in gilt frames down both walls: dark ovals, faces just suggested
  const ovalOn = (style, side, zc, Yc, rz, rY) => poly(ctx, style,
    Array.from({ length: 24 }, (_, i) => P(side, Yc + Math.sin((i * Math.PI) / 12) * rY, zc + Math.cos((i * Math.PI) / 12) * rz)));
  for (const side of [-1, 1]) {
    for (let zc = 1.5 + (side > 0 ? 0.35 : 0); zc < FAR - 0.5; zc += 1.3) {
      const fw = 0.32 + rand() * 0.08, fh = 0.36 + rand() * 0.1, Yc = 0.38 + rand() * 0.05;
      const rect = (dz, dY) => wall(P, side, Yc - fh + dY, Yc + fh - dY, zc - fw + dz, zc + fw - dz);
      poly(ctx, 'rgba(0,0,0,0.4)', rect(-0.03, -0.05).map(([x, y]) => [x, y + h * 0.006]));
      poly(ctx, lit([196, 156, 84], zc, 1.4), rect(0, 0));
      poly(ctx, lit([96, 70, 34], zc), rect(0.05, 0.05));
      poly(ctx, '#17120e', rect(0.075, 0.075));
      ovalOn(lit([84, 64, 46], zc), side, zc, Yc, fw * 0.75, fh * 0.82);
      ovalOn(lit([20, 16, 14], zc), side, zc, Yc - fh * 0.56, fw * 0.48, fh * 0.3); // shoulders
      ovalOn(lit([196, 164, 132], zc), side, zc, Yc + fh * 0.12, fw * 0.27, fh * 0.25); // face
    }
  }

  // Light pouring in from the window
  glow(ctx, (wx0 + wx1) / 2, (wy0 + wy1) / 2, w * 0.3, '236,228,210', 0.35, { add: true });
  vignette(ctx, w, h, 0.5);
  return canvas;
}
