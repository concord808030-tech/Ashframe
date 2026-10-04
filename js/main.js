/**
 * @file App entry point: builds the control panel and wires up the UI.
 *
 * Flow:
 *   1. The user opens, drops or pastes an image. loadFile() decodes it once
 *      and keeps two copies: `original` (full size) and `preview` (max 1400px).
 *   2. Every slider change updates `state` and calls requestRender(), which
 *      redraws the preview at most once per animation frame.
 *   3. Export scales `original` to max 4000px, runs the same render() over
 *      it, encodes the result and downloads it.
 */

import { EFFECTS, createState, defaultEffect } from './state.js';
import { render } from './pipeline.js';
import { randomSeed } from './rng.js';
import {
  isAccepted, decode, sizeOf, fit, scaledCanvas, canvasToBlob, download,
} from './image-io.js';

/** Long-side cap for the live preview. Lower = faster sliders. */
const PREVIEW_MAX = 1400;
/** Long-side cap for exported files. */
const EXPORT_MAX = 4000;
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

const $ = (id) => document.getElementById(id);
const els = {
  wordmark: $('wordmark'),
  open: $('open'),
  compare: $('compare'),
  export: $('export'),
  file: $('file'),
  stage: $('stage'),
  drop: $('drop'),
  view: $('view'),
  readout: $('readout'),
  effects: $('effects'),
  format: $('format'),
  quality: $('quality'),
  qualityOut: $('quality-out'),
  qualityRow: $('quality-row'),
  exportSize: $('export-size'),
  reseed: $('reseed'),
  resetAll: $('reset-all'),
  status: $('status'),
};

const state = createState();
let original = null;   // decoded full-resolution image
let preview = null;    // downscaled source canvas used for live editing
let baseName = 'image'; // original filename without extension, for the export name
let comparing = false; // true while Compare is held
let busy = false;      // true while an export is running
let queued = false;    // true if a preview render is already scheduled

/* ---------- Controls ---------- */

const controls = {}; // effectId -> { section, toggle, inputs: { paramId: { input, output, def } } }

/** Text for a slider's readout, e.g. "12", "2.5" or "35%". */
function formatValue(def, v) {
  const n = Number.isInteger(def.step) ? v : v.toFixed(1);
  return def.unit ? `${n}${def.unit}` : String(n);
}

/**
 * Generate one panel section per effect from the EFFECTS definitions:
 * a header with an on/off switch and a reset button, then one labelled
 * slider + readout per parameter.
 */
function buildControls() {
  for (const fx of EFFECTS) {
    const section = document.createElement('section');
    section.className = 'fx';
    section.dataset.fx = fx.id;

    const head = document.createElement('div');
    head.className = 'fx-head';

    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'toggle';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.id = `${fx.id}-on`;
    const title = document.createElement('span');
    title.className = 'fx-title';
    title.textContent = fx.label;
    toggleLabel.append(toggle, title);

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'mini';
    reset.textContent = 'Reset';
    reset.setAttribute('aria-label', `Reset ${fx.label}`);

    head.append(toggleLabel, reset);
    section.append(head);

    const inputs = {};
    for (const p of fx.params) {
      const id = `${fx.id}-${p.id}`;
      const row = document.createElement('div');
      row.className = 'ctl';
      row.innerHTML = `
        <div class="ctl-row">
          <label for="${id}">${p.label}</label>
          <output for="${id}"></output>
        </div>
        <input type="range" id="${id}" min="${p.min}" max="${p.max}" step="${p.step}">`;
      const input = row.querySelector('input');
      const output = row.querySelector('output');
      input.title = 'Double-click to reset';

      input.addEventListener('input', () => {
        state.effects[fx.id].params[p.id] = Number(input.value);
        output.value = formatValue(p, Number(input.value));
        requestRender();
      });
      input.addEventListener('dblclick', () => {
        setParam(fx.id, p.id, p.value);
        requestRender();
      });

      inputs[p.id] = { input, output, def: p };
      section.append(row);
    }

    toggle.addEventListener('change', () => {
      state.effects[fx.id].enabled = toggle.checked;
      section.classList.toggle('off', !toggle.checked);
      requestRender();
    });
    reset.addEventListener('click', () => {
      resetEffect(fx);
      requestRender();
    });

    controls[fx.id] = { section, toggle, inputs };
    els.effects.append(section);
  }
  syncControls();
}

/** Set a parameter in state and update its slider and readout to match. */
function setParam(fxId, paramId, value) {
  const c = controls[fxId].inputs[paramId];
  state.effects[fxId].params[paramId] = value;
  c.input.value = value;
  c.output.value = formatValue(c.def, value);
}

/** Push the whole `state` into the panel (after resets). */
function syncControls() {
  for (const fx of EFFECTS) {
    const s = state.effects[fx.id];
    const c = controls[fx.id];
    c.toggle.checked = s.enabled;
    c.section.classList.toggle('off', !s.enabled);
    for (const p of fx.params) setParam(fx.id, p.id, s.params[p.id]);
  }
}

function resetEffect(fx) {
  state.effects[fx.id] = defaultEffect(fx);
  syncControls();
}

/* ---------- Rendering ---------- */

/**
 * Schedule a preview redraw on the next animation frame. Many slider events
 * in one frame collapse into a single render, so dragging stays smooth.
 */
function requestRender() {
  if (!preview || queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    draw();
  });
}

/** Paint the preview canvas: the untouched preview while comparing, else the processed one. */
function draw() {
  if (comparing) {
    const ctx = els.view.getContext('2d', { willReadFrequently: true });
    els.view.width = preview.width;
    els.view.height = preview.height;
    ctx.drawImage(preview, 0, 0);
  } else {
    render(preview, state, els.view);
  }
}

function setComparing(on) {
  if (!preview || comparing === on) return;
  comparing = on;
  els.compare.setAttribute('aria-pressed', String(on));
  els.stage.classList.toggle('comparing', on);
  requestRender();
}

/* ---------- Loading ---------- */

/** Update the status bar. It's an aria-live region, so screen readers announce it. */
function setStatus(text) {
  els.status.textContent = text;
}

/** Brief glitch on the wordmark when an image loads (CSS disables it for reduced motion). */
function flicker() {
  els.wordmark.classList.remove('flicker');
  void els.wordmark.offsetWidth; // restart the animation
  els.wordmark.classList.add('flicker');
}

/**
 * Validate and decode a file, build the preview copy and show it.
 * The file is read locally and never leaves the browser.
 *
 * @param {File | undefined} file
 */
async function loadFile(file) {
  if (!file) return;
  if (!isAccepted(file)) {
    setStatus('UNSUPPORTED FILE · USE JPG, PNG OR WEBP');
    return;
  }
  setStatus('DECODING…');
  try {
    const img = await decode(file);
    if (original && original.close) original.close(); // free the previous ImageBitmap
    original = img;
    preview = scaledCanvas(original, PREVIEW_MAX);
    baseName = file.name.replace(/\.[^.]+$/, '') || 'image';

    const full = sizeOf(original);
    const out = fit(full, EXPORT_MAX);
    els.readout.textContent = `${full.width}×${full.height} · preview ${preview.width}×${preview.height}`;
    els.exportSize.textContent = `Export: ${out.width}×${out.height} px (max ${EXPORT_MAX} on the long side).`;

    els.drop.hidden = true;
    els.view.hidden = false;
    els.readout.hidden = false;
    els.compare.disabled = false;
    els.export.disabled = false;
    els.stage.classList.add('loaded');

    draw();
    flicker();
    setStatus(`LOADED ${baseName.toUpperCase()} · ${full.width}×${full.height}`);
  } catch (err) {
    console.error(err);
    setStatus('COULD NOT DECODE IMAGE');
  }
}

/* ---------- Export ---------- */

/**
 * Render the full-resolution image (capped at EXPORT_MAX) with the current
 * settings and seed, then download it in the chosen format.
 *
 * This runs on the main thread, so the page pauses for about a second on
 * large images. The button and status bar show that it's working.
 */
async function exportImage() {
  if (!original || busy) return;
  busy = true;
  els.export.disabled = true;
  els.export.textContent = 'Working…';
  setStatus('EXPORTING…');
  // Let the status paint before the heavy synchronous work starts.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

  let source = null;
  const out = document.createElement('canvas');
  try {
    source = scaledCanvas(original, EXPORT_MAX);
    render(source, state, out);
    const type = els.format.value;
    const quality = Number(els.quality.value) / 100;
    const blob = await canvasToBlob(out, type, quality);
    download(blob, `ashframe-${baseName}.${EXTENSIONS[type]}`);
    setStatus(`EXPORTED ${out.width}×${out.height} ${EXTENSIONS[type].toUpperCase()}`);
  } catch (err) {
    console.error(err);
    setStatus('EXPORT FAILED');
  } finally {
    // Release the large backing stores right away.
    if (source) source.width = source.height = 0;
    out.width = out.height = 0;
    busy = false;
    els.export.disabled = false;
    els.export.textContent = 'Export';
  }
}

/* ---------- Events ---------- */

/** Attach all event listeners: file input, drag & drop, paste, compare, export, reset. */
function bindEvents() {
  const openPicker = () => els.file.click();
  els.open.addEventListener('click', openPicker);
  els.drop.addEventListener('click', openPicker);
  els.file.addEventListener('change', () => {
    loadFile(els.file.files[0]);
    els.file.value = ''; // allow re-opening the same file
  });

  // Drag & drop anywhere on the stage; block the browser from navigating elsewhere.
  // dragenter/dragleave also fire for child elements; count depth so the
  // highlight only clears when the pointer really leaves the stage.
  let depth = 0;
  els.stage.addEventListener('dragenter', (e) => {
    e.preventDefault();
    depth++;
    els.stage.classList.add('dragging');
  });
  els.stage.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (!depth) els.stage.classList.remove('dragging');
  });
  els.stage.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    els.stage.classList.remove('dragging');
    loadFile(e.dataTransfer.files[0]);
  });
  for (const type of ['dragover', 'drop']) {
    window.addEventListener(type, (e) => e.preventDefault());
  }

  // Paste an image from the clipboard.
  window.addEventListener('paste', (e) => {
    const item = [...e.clipboardData.files].find(isAccepted);
    if (item) loadFile(item);
  });

  // Compare: hold the button or the backslash key.
  els.compare.addEventListener('pointerdown', (e) => {
    els.compare.setPointerCapture(e.pointerId);
    setComparing(true);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    els.compare.addEventListener(type, () => setComparing(false));
  }
  els.compare.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) setComparing(true);
  });
  els.compare.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') setComparing(false);
  });
  els.compare.addEventListener('blur', () => setComparing(false));
  window.addEventListener('keydown', (e) => {
    if (e.key === '\\' && !e.repeat) setComparing(true);
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === '\\') setComparing(false);
  });

  els.export.addEventListener('click', exportImage);

  els.format.addEventListener('change', () => {
    els.qualityRow.hidden = els.format.value === 'image/png';
  });
  els.quality.addEventListener('input', () => {
    els.qualityOut.value = els.quality.value;
  });

  els.reseed.addEventListener('click', () => {
    state.seed = randomSeed();
    requestRender();
    setStatus(`SEED ${state.seed.toString(16).toUpperCase().padStart(8, '0')}`);
  });
  els.resetAll.addEventListener('click', () => {
    for (const fx of EFFECTS) state.effects[fx.id] = defaultEffect(fx);
    syncControls();
    requestRender();
    setStatus('RESET');
  });
}

buildControls();
bindEvents();
