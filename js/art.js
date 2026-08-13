/* ============================================================
   Vector drawing primitives, in the HH Goa illustration style.

   Everything here is paths — no textures, no noise, no shaders.
   That is the whole point: the event artwork is flat vector, so
   it stays crisp at any resolution, and there is no grazing-angle
   plane to alias.
   ============================================================ */

export const C = {
  sky:     '#036735',
  sea:     '#04713C',
  seaFar:  '#0A7A42',
  hill:    '#0E7A45',
  hillFar: '#2E9558',
  line:    '#00301A',
  frond:   '#2E9558',
  frondHi: '#5EB773',
  white:   '#FFFFFF',
  cream:   '#F6F8F2',
  sand:    '#FFFFFF',
  sandLo:  '#B4C2B0',   // writing groove on white sand — needs real contrast
  sandHi:  '#FFFFFF',
  yellow:  '#FEE101',
  pink:    '#FF0080',
};

/* ---------- helpers ---------- */

export function ease(t){ return t < 0 ? 0 : t > 1 ? 1 : t; }
export const easeOutCubic  = t => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
export const easeOutBack = t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * A soft wavy horizontal edge — the shape their sea and foam use everywhere.
 * Emits a path from x0 to x1 at height y, then you close it yourself.
 */
export function wavyEdge(ctx, x0, x1, y, amp, wavelength, phase = 0){
  ctx.lineTo(x0, y + Math.sin(phase) * amp);
  const step = wavelength / 2;
  let flip = 1;
  for (let x = x0; x < x1; x += step){
    const nx = Math.min(x + step, x1);
    const cx = (x + nx) / 2;
    ctx.quadraticCurveTo(cx, y + flip * amp, nx, y + Math.sin((nx / wavelength) * Math.PI * 2 + phase) * amp * 0.35);
    flip *= -1;
  }
}

/** Thin drawn wave line, like the white squiggles on their sea. */
export function waveStroke(ctx, x0, x1, y, amp, wavelength, phase, width, color){
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 2){
    const yy = y + Math.sin((x / wavelength) * Math.PI * 2 + phase) * amp;
    if (x === x0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
  }
  ctx.stroke();
  ctx.restore();
}

/* ---------- sun ---------- */

/**
 * Yellow disc with long fine rays, sitting on the horizon.
 * Theirs are thin, straight, and generously spaced — not a starburst.
 */
export function sun(ctx, cx, cy, r, t = 0){
  ctx.save();

  // rays first, so the disc sits cleanly on top
  ctx.strokeStyle = C.yellow;
  ctx.lineCap = 'butt';
  const N = 18;
  for (let i = 0; i < N; i++){
    const a = -Math.PI + (i / (N - 1)) * Math.PI;   // upper half only
    const long = i % 2 === 0;
    const breathe = 1 + Math.sin(t * 0.9 + i) * 0.02;
    const inner = r * 1.20;
    const outer = r * (long ? 1.95 : 1.52) * breathe;
    ctx.lineWidth = long ? 3.2 : 2.6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    ctx.stroke();
  }

  ctx.fillStyle = C.yellow;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** Flat yellow lozenges below the sun — their reflection shorthand. */
export function sunReflection(ctx, cx, y0, r, rows, t){
  ctx.save();
  ctx.fillStyle = C.yellow;
  for (let i = 0; i < rows; i++){
    const p = i / rows;
    const y = y0 + i * (r * 0.20);
    const drift = Math.sin(t * 0.7 + i * 0.8) * r * 0.05;
    const w = r * (0.95 - p * 0.55) * (0.8 + Math.sin(t * 0.5 + i) * 0.12);
    const h = r * 0.055;
    ctx.beginPath();
    ctx.ellipse(cx + drift, y, Math.max(w, 4), h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ---------- palms ---------- */

/**
 * One filled frond in local space: spine along +x, drooping via `bend`.
 * Many fine leaflets rather than a few big teeth — the coarse version
 * reads as a spiky conifer, not a palm.
 */
function frondPath(ctx, len, spread, bend){
  // Few, broad leaflets. Many fine ones read as a fern; the event's palms
  // have chunky leaves with deep V-notches cut into them.
  const N = 11;
  // Each leaflet tip is pulled BACK toward the base. Perpendicular tips
  // read as a sawtooth; swept-back ones read as a palm.
  const sweep = len * 0.085;

  // taper: widest just past the middle, tapering to a point
  const width = t => Math.pow(Math.sin(Math.pow(t, 0.8) * Math.PI), 0.72) * spread;
  const spine = t => bend * t * t * len;

  // Notches are shallow: they cut a little under a third into the leaf, so
  // it stays a broad solid shape with a toothed edge rather than a comb.
  const NOTCH = 0.70;

  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let i = 1; i <= N; i++){
    const t = i / N;
    const x = len * t, y = spine(t), s = width(t);
    ctx.lineTo(x - sweep, y - s);          // leaflet tip, swept back
    ctx.lineTo(x, y - s * NOTCH);          // shallow notch
  }
  ctx.lineTo(len * 1.02, spine(1.02));
  for (let i = N; i >= 1; i--){
    const t = i / N;
    const x = len * t, y = spine(t), s = width(t);
    ctx.lineTo(x, y + s * NOTCH);
    ctx.lineTo(x - sweep, y + s);
  }
  ctx.closePath();
}

/**
 * A palm in their style: long curved trunk with a lighter inner stripe,
 * and a crown of filled serrated fronds outlined in dark green.
 *
 * @param {number} h   trunk height in px
 * @param {number} lean horizontal lean of the crown, +right
 * @param {number} sway animated sway in radians
 */
export function palm(ctx, x, groundY, h, lean, sway, scale = 1){
  ctx.save();
  ctx.translate(x, groundY);
  ctx.scale(scale, scale);

  const topX = lean * h, topY = -h;

  // trunk
  ctx.strokeStyle = C.line;
  ctx.lineCap = 'round';
  ctx.lineWidth = h * 0.055;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(lean * h * 0.18, -h * 0.55, topX, topY);
  ctx.stroke();

  ctx.strokeStyle = C.frondHi;
  ctx.lineWidth = h * 0.028;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(lean * h * 0.18, -h * 0.55, topX, topY);
  ctx.stroke();

  // crown
  ctx.translate(topX, topY);
  ctx.rotate(sway);

  // Back fronds first in the darker fill, front fronds lighter — that
  // little bit of layering is what stops the crown reading as a flat blob.
  // Short fronds on a tall trunk: the crown frames the corner instead of
  // filling the screen, which is how the event artwork uses its palms.
  const fronds = [
    { a: -2.62, l: 0.30, s: 0.080, b: 0.34, back: true },
    { a: -2.05, l: 0.35, s: 0.090, b: 0.28, back: true },
    { a: -1.57, l: 0.32, s: 0.085, b: 0.36, back: true },
    { a: -1.05, l: 0.34, s: 0.090, b: 0.28 },
    { a: -0.48, l: 0.31, s: 0.082, b: 0.34 },
    { a:  0.10, l: 0.29, s: 0.076, b: 0.40 },
    { a: -3.05, l: 0.26, s: 0.070, b: 0.40 },
  ];

  for (const f of fronds){
    ctx.save();
    ctx.rotate(f.a);
    frondPath(ctx, h * f.l, h * f.s, f.b);
    ctx.fillStyle = f.back ? C.frond : C.frondHi;
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = Math.max(1.1, h * 0.008);
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  // coconuts
  ctx.fillStyle = C.line;
  for (const [dx, dy] of [[-6, 6], [6, 9], [0, 13]]){
    ctx.beginPath();
    ctx.arc(dx * (h / 300), dy * (h / 300), h * 0.018, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/* ---------- beach furniture (small brand touches) ---------- */

export function umbrella(ctx, x, y, r, tilt = -0.12){
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = r * 0.055;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.10, -r * 0.95); ctx.stroke();

  ctx.translate(r * 0.10, -r * 0.95);
  ctx.rotate(tilt);
  const seg = 6;
  for (let i = 0; i < seg; i++){
    const a0 = Math.PI + (i / seg) * Math.PI;
    const a1 = Math.PI + ((i + 1) / seg) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r * 0.62, a0, a1);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? C.yellow : C.pink;
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = r * 0.028;
    ctx.stroke();
  }
  ctx.restore();
}

export function deckChair(ctx, x, y, s, flip = false){
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = s * 0.07;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.fillStyle = C.frond;
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, -s * 0.10);
  ctx.lineTo(s * 0.05, -s * 0.10);
  ctx.lineTo(s * 0.42, -s * 0.72);
  ctx.lineTo(-s * 0.10, -s * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-s * 0.50, -s * 0.10); ctx.lineTo(-s * 0.34, 0);
  ctx.moveTo(s * 0.02, -s * 0.10);  ctx.lineTo(s * 0.16, 0);
  ctx.stroke();
  ctx.restore();
}

/* ---------- distant hills ---------- */

export function hills(ctx, x0, x1, baseY, seed, color, height){
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x0, baseY);
  const span = x1 - x0;
  for (let x = x0; x <= x1; x += 8){
    const p = (x - x0) / span;
    const y = baseY - height * (
      0.55 * Math.sin(p * 3.1 + seed) +
      0.30 * Math.sin(p * 7.3 + seed * 2.1) +
      0.18 * Math.sin(p * 13.0 + seed * 0.7) + 0.75
    ) * 0.5;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(x1, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
