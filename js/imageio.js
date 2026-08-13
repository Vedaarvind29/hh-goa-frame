/* ============================================================
   Photo intake
   Real photos, not pre-cropped ones: portrait, landscape, phone
   HEIC, off-centre subjects. We normalise everything to a square
   bitmap with the subject actually in frame.
   ============================================================ */

const HEIC_RE = /\.(heic|heif)$/i;

/* ---------- HEIC fallback -------------------------------------------------
   Safari decodes HEIC natively. Chrome/Firefox do not, so we lazily pull in
   a decoder ONLY when we actually meet a file we cannot read. Nothing is
   downloaded for the common jpg/png path. */
let heicLoader = null;
function loadHeicDecoder(){
  if (heicLoader) return heicLoader;
  heicLoader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/heic2any.min.js';
    s.onload  = () => resolve(window.heic2any);
    s.onerror = () => {
      // Vendored copy missing — try the CDN before giving up.
      const c = document.createElement('script');
      c.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
      c.onload  = () => resolve(window.heic2any);
      c.onerror = () => reject(new Error('heic-decoder-unavailable'));
      document.head.appendChild(c);
    };
    document.head.appendChild(s);
  });
  return heicLoader;
}

/**
 * Decode any user file to an ImageBitmap, EXIF rotation already applied.
 * @param {File|Blob} file
 * @returns {Promise<ImageBitmap>}
 */
export async function decodeImage(file){
  // `from-image` makes the browser honour EXIF orientation, so phone
  // portraits don't come out sideways.
  const opts = { imageOrientation: 'from-image' };

  try {
    return await createImageBitmap(file, opts);
  } catch (err){
    const looksHeic = HEIC_RE.test(file.name || '') ||
                      /heic|heif/i.test(file.type || '');
    if (!looksHeic) throw new Error('unreadable-image');

    const heic2any = await loadHeicDecoder();
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    const blob = Array.isArray(out) ? out[0] : out;
    return await createImageBitmap(blob, opts);
  }
}

/* ---------- attention crop ------------------------------------------------
   Pick the square that actually contains the subject.

   Two signals, cheaply:
     1. edge energy  — where the detail is (an off-centre subject against
                       flat sand/sky moves the centroid onto the subject)
     2. portrait bias — on tall images, faces sit high, so we pull the
                        window upward

   Runs on a 64px thumbnail, so it costs well under a millisecond. */
function attentionCentre(bitmap){
  const N = 64;
  const c = new OffscreenCanvas(N, N);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bitmap, 0, 0, N, N);
  const px = g.getImageData(0, 0, N, N).data;

  // luminance
  const lum = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++){
    lum[i] = (px[i*4] * 0.299 + px[i*4+1] * 0.587 + px[i*4+2] * 0.114) / 255;
  }

  // Sobel-ish gradient magnitude → weight
  let sumW = 0, sumX = 0, sumY = 0;
  for (let y = 1; y < N-1; y++){
    for (let x = 1; x < N-1; x++){
      const i = y*N + x;
      const gx = lum[i+1] - lum[i-1];
      const gy = lum[i+N] - lum[i-N];
      let w = Math.hypot(gx, gy);
      w *= w;                                  // favour strong edges
      sumW += w; sumX += w * x; sumY += w * y;
    }
  }

  if (sumW < 1e-4) return { cx: 0.5, cy: 0.5 };  // flat image, just centre it
  return { cx: (sumX / sumW) / N, cy: (sumY / sumW) / N };
}

/**
 * Normalise any photo to a centred square canvas.
 * @param {ImageBitmap} bitmap
 * @param {number} size output edge in px
 * @returns {HTMLCanvasElement}
 */
export function squareCrop(bitmap, size = 720){
  const { width: w, height: h } = bitmap;
  const edge = Math.min(w, h);

  let { cx, cy } = attentionCentre(bitmap);

  if (h > w){
    // Portrait: faces live in the upper half. Pull the window up, but stay
    // anchored to where the detail actually is.
    const headroom = 0.36;
    cy = cy * 0.45 + headroom * 0.55;
  } else if (w > h){
    // Landscape: horizontal position matters, vertical barely does.
    cy = cy * 0.35 + 0.5 * 0.65;
  }

  // Convert normalised centre to a legal top-left, clamped inside the image.
  const sx = Math.max(0, Math.min(w - edge, cx * w - edge / 2));
  const sy = Math.max(0, Math.min(h - edge, cy * h - edge / 2));

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, edge, edge, 0, 0, size, size);
  return canvas;
}

/**
 * Full intake: file → square canvas ready for the card.
 * @param {File} file
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function preparePhoto(file){
  const bitmap = await decodeImage(file);
  const square = squareCrop(bitmap, 720);
  bitmap.close?.();
  return square;
}
