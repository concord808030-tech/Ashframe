/**
 * @file Quiet rain falling behind the home page content.
 *
 * A fixed full-viewport canvas behind everything (z-index -1). Opaque
 * surfaces like the photo frame sit above it, so the rain shows only in
 * the margins and behind text. Drops are thin slanted strokes in the
 * current --ink colour at low opacity, so they follow the theme.
 *
 * It costs almost nothing: ~1 drop per 9000 px², pixel ratio capped at 2,
 * and it stops entirely while the tab is hidden or motion is paused.
 */

const WIND = -0.18;       // horizontal drift per unit of fall (slants down-left)
const DENSITY = 1 / 9000; // drops per CSS pixel²

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {{ play(): void, pause(): void }}
 */
export function createRain(canvas) {
  const ctx = canvas.getContext('2d');
  let drops = [];
  let w = 0;
  let h = 0;
  let color = '0,0,0';
  let running = false;
  let frame = 0;
  let last = 0;

  const spawn = (anywhere) => {
    const z = Math.random(); // depth: far drops are shorter, slower and fainter
    return {
      x: Math.random() * (w + h * Math.abs(WIND)),
      y: anywhere ? Math.random() * h : -30 - Math.random() * h * 0.3,
      len: 8 + z * 22,
      speed: 380 + z * 620, // px per second
      alpha: 0.05 + z * 0.13,
      width: 0.6 + z * 0.6,
    };
  };

  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    w = innerWidth;
    h = innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Keep existing drops (phones fire resize while scrolling as the address
    // bar hides); only top up or trim to the new density.
    const count = Math.round(w * h * DENSITY);
    while (drops.length < count) drops.push(spawn(true));
    drops.length = count;
    draw(0); // resizing clears the canvas; redraw straight away
  }

  function readColor() {
    // --ink is a hex colour from base.css (#000000 or #f2f2f2)
    const hex = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim().slice(1);
    const n = parseInt(hex.length === 3 ? hex.replace(/./g, '$&$&') : hex, 16);
    color = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
    if (!running) draw(0);
  }

  function draw(dt) {
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    for (const d of drops) {
      d.y += d.speed * dt;
      d.x += d.speed * dt * WIND;
      if (d.y - d.len > h) Object.assign(d, spawn(false));
      ctx.strokeStyle = `rgba(${color},${d.alpha})`;
      ctx.lineWidth = d.width;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.len * WIND, d.y - d.len);
      ctx.stroke();
    }
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); // clamp after tab switches
    last = now;
    draw(dt);
    frame = requestAnimationFrame(tick);
  }

  function play() {
    if (running || document.hidden) return;
    running = true;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(frame);
  }

  let wanted = false; // what the pause control asked for
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (wanted) play();
  });
  document.addEventListener('themechange', readColor);
  addEventListener('resize', resize);

  readColor();
  resize();

  return {
    play() {
      wanted = true;
      play();
    },
    pause() {
      wanted = false;
      stop();
    },
  };
}
