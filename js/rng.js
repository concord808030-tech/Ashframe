/**
 * @file Seeded randomness.
 *
 * Grain and glitch need random numbers, but the export must look like the
 * preview. Instead of Math.random(), each effect gets a deterministic stream
 * derived from the session seed (`state.seed`), so the same seed always gives
 * the same slices and the same noise pattern.
 */

/**
 * Create a mulberry32 PRNG: tiny, fast and good enough for visual noise.
 *
 * @param {number} seed 32-bit unsigned integer.
 * @returns {() => number} Function returning floats in [0, 1).
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a hash of a string. XORed with the session seed so every effect gets
 * its own independent stream: changing glitch settings never reshuffles grain.
 *
 * @param {string} str
 * @returns {number} 32-bit unsigned integer.
 */
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A fresh random seed for a new session or the "Reseed" button.
 *
 * @returns {number} 32-bit unsigned integer.
 */
export function randomSeed() {
  return (Math.random() * 4294967296) >>> 0;
}
