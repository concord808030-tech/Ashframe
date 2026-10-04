/**
 * @file Effect definitions and editor state.
 *
 * EFFECTS is the single source of truth for every effect's controls:
 * main.js builds the panel from it, and createState() reads its defaults.
 * Adding a slider here is all it takes to get a working control; the effect
 * function then receives the value under the same `id`.
 */

import { randomSeed } from './rng.js';

/**
 * @typedef {object} ParamDef
 * @property {string} id      Key passed to the effect function.
 * @property {string} label   Text shown in the panel.
 * @property {number} min
 * @property {number} max
 * @property {number} step
 * @property {number} value   Default value (also the reset value).
 * @property {string} [unit]  Suffix shown in the readout, e.g. "%".
 */

/**
 * @typedef {object} EffectDef
 * @property {string} id        Must match a key in the pipeline ORDER list.
 * @property {string} label     Panel heading.
 * @property {boolean} enabled  Whether the effect starts switched on.
 * @property {ParamDef[]} params
 */

/**
 * @typedef {object} EffectState
 * @property {boolean} enabled
 * @property {Record<string, number>} params  Current value per ParamDef id.
 */

/**
 * @typedef {object} State
 * @property {number} seed  Drives grain and glitch randomness (see rng.js).
 * @property {Record<string, EffectState>} effects
 */

/**
 * Panel order. Processing order is separate and lives in pipeline.js.
 * @type {EffectDef[]}
 */
export const EFFECTS = [
  {
    id: 'tone',
    label: 'Tone',
    enabled: true,
    params: [
      { id: 'brightness', label: 'Brightness', min: -100, max: 100, step: 1, value: 0 },
      { id: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, value: 12 },
    ],
  },
  {
    id: 'mono',
    label: 'Black & White',
    enabled: true,
    params: [
      { id: 'amount', label: 'Mix', min: 0, max: 100, step: 1, value: 100, unit: '%' },
    ],
  },
  {
    id: 'grain',
    label: 'Film Grain',
    enabled: true,
    params: [
      { id: 'amount', label: 'Amount', min: 0, max: 100, step: 1, value: 22 },
      { id: 'size', label: 'Size', min: 1, max: 10, step: 0.5, value: 2 },
    ],
  },
  {
    id: 'scanlines',
    label: 'Scanlines',
    enabled: false,
    params: [
      { id: 'density', label: 'Lines', min: 40, max: 600, step: 10, value: 240 },
      { id: 'opacity', label: 'Opacity', min: 0, max: 100, step: 1, value: 35, unit: '%' },
      { id: 'thickness', label: 'Thickness', min: 10, max: 90, step: 1, value: 50, unit: '%' },
    ],
  },
  {
    id: 'glitch',
    label: 'Glitch',
    enabled: false,
    params: [
      { id: 'slices', label: 'Slices', min: 0, max: 40, step: 1, value: 10 },
      { id: 'shift', label: 'Shift', min: 0, max: 100, step: 1, value: 30 },
      { id: 'split', label: 'Channel split', min: 0, max: 100, step: 1, value: 15 },
    ],
  },
];

/**
 * Default state for one effect, used on startup and by the reset buttons.
 *
 * @param {EffectDef} def
 * @returns {EffectState}
 */
export function defaultEffect(def) {
  const params = {};
  for (const p of def.params) params[p.id] = p.value;
  return { enabled: def.enabled, params };
}

/**
 * Fresh editor state: every effect at its defaults, plus a random seed.
 *
 * @returns {State}
 */
export function createState() {
  const effects = {};
  for (const def of EFFECTS) effects[def.id] = defaultEffect(def);
  return { seed: randomSeed(), effects };
}
