/**
 * @file Home page: the slideshow of prints, the vignette and the rain.
 *
 * The hero shows eight prints painted in code (js/scenes.js). Each one is
 * developed through the photo lab's own render pipeline, then "develops" on
 * screen over the previous one every few seconds. Prints are prepared ahead
 * of time in idle moments and cached, so a change of print is just a copy.
 *
 * The cat-and-camera vignette above the print blinks, swishes its tail and
 * fires the camera's flash as each new print develops.
 *
 * One pause button stops the slideshow, the rain and the vignette (anything
 * that moves on its own for more than 5 seconds needs a pause control). With
 * reduced motion turned on, they all start paused.
 */

import { render } from './pipeline.js';
import { createState } from './state.js';
import {
  paintLibrary, paintStudyWindow, paintCloister, paintSpires,
  paintCandleDesk, paintGraveyard, paintObservatory, paintGallery,
} from './scenes.js';
import { createRain } from './rain.js';
import './fresh.js';

const SEED = 1957;
const INTERVAL = 8000; // ms each print stays up

/** The prints, in order. `print` overrides the lab's default effect settings. */
const SCENES = [
  { name: 'Library at midnight', tone: 'slate', paint: paintLibrary,
    print: { tone: { contrast: 18 }, mono: { amount: 72 }, grain: { amount: 22, size: 2 } } },
  { name: 'Rain on the study window', tone: 'sepia', paint: paintStudyWindow,
    print: { tone: { contrast: 16 }, mono: { amount: 70 }, grain: { amount: 24, size: 2 } } },
  { name: 'The cloister', tone: 'moss', paint: paintCloister,
    print: { tone: { contrast: 20 }, mono: { amount: 74 }, grain: { amount: 22, size: 2 } } },
  { name: 'Spires at dusk', tone: 'brass', paint: paintSpires,
    print: { tone: { contrast: 16 }, mono: { amount: 68 }, grain: { amount: 24, size: 2 } } },
  { name: 'Candlelit desk', tone: 'oxblood', paint: paintCandleDesk,
    print: { tone: { contrast: 14 }, mono: { amount: 70 }, grain: { amount: 26, size: 2 } } },
  { name: 'Misty graveyard avenue', tone: 'slate', paint: paintGraveyard,
    print: { tone: { contrast: 22 }, mono: { amount: 78 }, grain: { amount: 20, size: 2 } } },
  { name: 'The old observatory', tone: 'sepia', paint: paintObservatory,
    print: { tone: { contrast: 18 }, mono: { amount: 76 }, grain: { amount: 28, size: 2.5 } } },
  { name: 'Portrait gallery', tone: 'moss', paint: paintGallery,
    print: { tone: { contrast: 16 }, mono: { amount: 72 }, grain: { amount: 24, size: 2 } } },
];

/** Plate numbers for the captions. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 250));

const els = {
  frame: document.querySelector('.print-frame'),
  layers: [...document.querySelectorAll('.print-frame canvas')], // two, stacked
  caption: document.getElementById('print-caption'),
  dots: document.getElementById('print-dots'),
  motion: document.getElementById('motion-toggle'),
  vignette: document.querySelector('.vignette'),
};

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

/* ---------- Prints ---------- */

// Paint at the frame's real pixel width (2000 max) in 16:10, which covers
// both the 21:9 desktop crop and the 4:5 phone crop (object-fit: cover).
const width = Math.round(Math.min(2000, Math.max(1000, els.frame.clientWidth * Math.min(2, devicePixelRatio || 1))));
const height = Math.round(width * 0.625);
const cache = [];

/** Paint and develop print `i` once; later calls return the cached result. */
function developed(i) {
  if (!cache[i]) {
    const raw = SCENES[i].paint(width, height);
    const out = document.createElement('canvas');
    render(raw, printState(SCENES[i].print), out);
    if (i === 0) paintThumb(raw);
    cache[i] = out;
  }
  return cache[i];
}

/** The photo lab card's thumbnail: the library's lamp and desk, visibly "edited". */
function paintThumb(source) {
  const canvas = document.getElementById('thumb');
  const crop = document.createElement('canvas');
  crop.width = 800;
  crop.height = 600;
  const sh = source.height * 0.5;
  const sw = sh * (4 / 3);
  crop.getContext('2d').drawImage(source, source.width * 0.5 - sw / 2, source.height * 0.25, sw, sh, 0, 0, 800, 600);
  render(crop, printState({
    tone: { contrast: 30 },
    mono: { amount: 70 },
    glitch: { enabled: true, slices: 9, shift: 35, split: 45 },
    scanlines: { enabled: true, density: 150, opacity: 22 },
    grain: { amount: 30, size: 2 },
  }), canvas);
}

/* ---------- Slideshow ---------- */

let current = -1;
let front = 0;      // which of the two layers is on top
let playing = !reduceMotion.matches;
let timer = 0;
const dots = [];

/** Develop print `i` on top of the one showing now. */
function show(i) {
  if (i === current) return;
  const print = developed(i);
  const next = els.layers[1 - front];
  const prev = els.layers[front];

  next.width = print.width;
  next.height = print.height;
  next.getContext('2d').drawImage(print, 0, 0);
  next.classList.remove('develop');
  void next.offsetWidth; // restart the animation
  next.style.zIndex = '2';
  prev.style.zIndex = '1';
  next.classList.add('develop');
  // Keep the old print underneath until the new one has fully developed
  if (current < 0 || reduceMotion.matches) prev.classList.remove('develop');
  else next.addEventListener('animationend', () => prev.classList.remove('develop'), { once: true });

  fire();
  front = 1 - front;
  current = i;
  els.caption.textContent = `Plate ${ROMAN[i]} — ${SCENES[i].name}. Generated and developed in your browser by Ashframe.`;
  dots.forEach((dot, k) => dot.setAttribute('aria-current', String(k === i)));

  idle(() => developed((i + 1) % SCENES.length)); // get the next one ready
  schedule();
}

/** The camera's flash bulb goes off for every print after the first, unless paused. */
function fire() {
  if (!(playing && !reduceMotion.matches && current >= 0)) return;
  els.vignette.classList.remove('fire');
  void els.vignette.getBoundingClientRect(); // restart the animation
  els.vignette.classList.add('fire');
}

function schedule() {
  clearTimeout(timer);
  if (playing && !document.hidden) {
    timer = setTimeout(() => show((current + 1) % SCENES.length), INTERVAL);
  }
}

function buildDots() {
  SCENES.forEach((scene, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'print-dot';
    dot.style.setProperty('--tone', `var(--${scene.tone})`);
    dot.setAttribute('aria-label', `Show ${scene.name}`);
    dot.addEventListener('click', () => show(i));
    dots.push(dot);
    els.dots.append(dot);
  });
}

/* ---------- Motion: slideshow + rain ---------- */

const ICONS = {
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="6" width="3" height="12" fill="currentColor"/><rect x="14" y="6" width="3" height="12" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
};

const rain = createRain(document.getElementById('rain'));

function setPlaying(on) {
  playing = on;
  els.motion.innerHTML = on ? ICONS.pause : ICONS.play;
  els.motion.setAttribute('aria-label', on ? 'Pause the slideshow, rain and cat' : 'Play the slideshow, rain and cat');
  els.motion.title = els.motion.getAttribute('aria-label');
  els.vignette.classList.toggle('paused', !on);
  if (on) rain.play();
  else rain.pause();
  schedule();
}

/* ---------- Start ---------- */

buildDots();
show(0);
setPlaying(playing);
els.motion.addEventListener('click', () => setPlaying(!playing));
document.addEventListener('visibilitychange', schedule);
