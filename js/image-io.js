/**
 * @file Getting pixels in and out: decoding, scaling, encoding, downloading.
 *
 * Nothing here touches the network. Files are read from the user's disk and
 * results are handed back through a local object URL.
 */

const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const ACCEPTED = new Set(Object.values(TYPES));

/**
 * Whether Ashframe can open this file (JPG, PNG or WebP). Falls back to the
 * file extension because some systems report an empty MIME type.
 *
 * @param {File} file
 * @returns {boolean}
 */
export function isAccepted(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  return ACCEPTED.has(file.type || TYPES[ext]);
}

/**
 * Decode a file into something drawable, honouring EXIF orientation so
 * phone photos aren't sideways.
 *
 * @param {File} file
 * @returns {Promise<ImageBitmap | HTMLImageElement>}
 * @throws If the browser can't decode the image.
 */
export async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older engines reject the options bag; fall back to an <img>.
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } finally {
      URL.revokeObjectURL(url);
    }
    return img;
  }
}

/**
 * Intrinsic pixel size of an image, bitmap or canvas.
 *
 * @param {ImageBitmap | HTMLImageElement | HTMLCanvasElement} source
 * @returns {{width: number, height: number}}
 */
export function sizeOf(source) {
  return {
    width: source.naturalWidth || source.width,
    height: source.naturalHeight || source.height,
  };
}

/**
 * Scale a size down (never up) so its long side is at most `max`,
 * keeping the aspect ratio.
 *
 * @param {{width: number, height: number}} size
 * @param {number} max
 * @returns {{width: number, height: number}}
 */
export function fit({ width, height }, max) {
  const s = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * s)),
    height: Math.max(1, Math.round(height * s)),
  };
}

/**
 * Copy `source` into a new canvas no larger than `max` on its long side.
 * Used for both the preview copy (1400px) and the export copy (4000px).
 *
 * @param {ImageBitmap | HTMLImageElement | HTMLCanvasElement} source
 * @param {number} max
 * @returns {HTMLCanvasElement}
 */
export function scaledCanvas(source, max) {
  const { width, height } = fit(sizeOf(source), max);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/**
 * Promise wrapper around canvas.toBlob().
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} type  MIME type, e.g. "image/png".
 * @param {number} [quality]  0..1, used by JPEG and WebP only.
 * @returns {Promise<Blob>}
 * @throws If encoding fails (e.g. the canvas is too large for the browser).
 */
export function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Encoding failed'))),
      type,
      quality,
    );
  });
}

/**
 * Save a blob to the user's Downloads folder via a temporary local link.
 *
 * @param {Blob} blob
 * @param {string} filename
 */
export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // Revoke later: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
