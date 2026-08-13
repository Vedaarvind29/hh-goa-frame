/* ============================================================
   Builder ID card renderer
   Draws the shareable PNG on a 2D canvas. The same canvas is what
   the wave delivers onto the sand, so what the user sees in the
   scene is exactly the file they download.
   ============================================================ */

const W = 1080, H = 1350;          // 4:5 — reads well in the X timeline

const C = {
  green:     '#0B6839',
  greenDeep: '#075029',
  greenLine: '#0a5c33',
  yellow:    '#FEE101',
  pink:      '#FF0080',
  cream:     '#FFFBE8',
  sand:      '#E3C08D',
  sandDeep:  '#D0A86B',
  ink:       '#06331d',
};

/* ---------- asset preload ---------- */
let assets = null;
export function preloadCardAssets(){
  if (assets) return assets;
  const load = src => new Promise(res => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);        // degrade rather than break the card
    img.src = src;
  });
  assets = Promise.all([
    load('assets/brand/goa_hindi.svg'),
    load('assets/brand/2-47.svg'),
    document.fonts.ready,
  ]).then(([goa, studio]) => ({ goa, studio }));
  return assets;
}

/* ---------- text helpers ---------- */

/** Shrink until it fits. Returns the size actually used. */
function fitText(ctx, text, maxWidth, startSize, family, weight = 800){
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  } while (size > 12);
  return size;
}

/** Split a name onto at most two lines, breaking at a space. */
function nameLines(name){
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts;
  // Longest sensible first line that still leaves a second.
  if (parts.length === 2) return parts;
  const mid = Math.ceil(parts.length / 2);
  return [parts.slice(0, mid).join(' '), parts.slice(mid).join(' ')];
}

function roundRect(ctx, x, y, w, h, r){
  // arcTo goes haywire when the radius exceeds half the shorter side —
  // a "999" pill radius has to be clamped, not passed through.
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

/* ---------- brand motifs ---------- */

/** The scalloped wave line used all over the HH Goa artwork. */
function waveLine(ctx, y, amp, wavelength, color, lineWidth, phase = 0){
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let x = -wavelength; x < W + wavelength; x += wavelength){
    const x0 = x + phase;
    ctx.moveTo(x0, y);
    ctx.quadraticCurveTo(x0 + wavelength * 0.25, y - amp, x0 + wavelength * 0.5, y);
    ctx.quadraticCurveTo(x0 + wavelength * 0.75, y + amp, x0 + wavelength,       y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Sun disc with the radiating strokes from the hero art. */
function sun(ctx, cx, cy, r, color, rayColor){
  ctx.save();
  ctx.strokeStyle = rayColor;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++){
    const a = (i / 16) * Math.PI * 2 + 0.2;
    const inner = r * 1.22, outer = r * (i % 2 ? 1.42 : 1.62);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Outlined palm, matching the line-art in the event illustrations. */
function palm(ctx, x, groundY, height, color, lw = 5, flip = false){
  ctx.save();
  ctx.translate(x, groundY);
  if (flip) ctx.scale(-1, 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // trunk — a long shallow arc
  const topX = height * 0.30, topY = -height;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(height * 0.06, -height * 0.55, topX, topY);
  ctx.stroke();

  // fronds — enough of them, and enough leaflets, to read as a palm rather
  // than a few stray scratches
  const fronds = [[-1.30, 0.62], [-0.92, 0.92], [-0.42, 1.08], [0.10, 1.10],
                  [0.62, 0.95], [1.05, 0.66]];
  for (const [dir, lift] of fronds){
    const len = height * 0.46 * lift;
    const ex = topX + dir * len;
    const ey = topY + (0.34 - lift * 0.28) * len;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(topX + dir * len * 0.5, topY - len * 0.44, ex, ey);
    ctx.stroke();

    ctx.lineWidth = lw * 0.62;
    for (let t = 0.20; t < 0.97; t += 0.105){
      // point on the frond's curve
      const u = 1 - t;
      const bx = u*u*topX + 2*u*t*(topX + dir*len*0.5) + t*t*ex;
      const by = u*u*topY + 2*u*t*(topY - len*0.44)   + t*t*ey;
      const sz = len * 0.20 * Math.sin(t * Math.PI) + len * 0.05;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + dir * sz * 0.55, by + sz);
      ctx.stroke();
    }
    ctx.lineWidth = lw;
  }
  ctx.restore();
}

/** Printed-paper grain, so the card matches the textured brand artwork. */
function grain(ctx, alpha = 0.05){
  const n = 220;
  const tile = document.createElement('canvas');
  tile.width = tile.height = n;
  const tg = tile.getContext('2d');
  const img = tg.createImageData(n, n);
  for (let i = 0; i < n * n; i++){
    const v = 128 + (Math.random() - 0.5) * 255;
    img.data[i*4] = img.data[i*4+1] = img.data[i*4+2] = v;
    img.data[i*4+3] = 255;
  }
  tg.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'overlay';
  const pat = ctx.createPattern(tile, 'repeat');
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/* ============================================================
   Main renderer
   ============================================================ */

/**
 * @param {object} data
 * @param {HTMLCanvasElement} data.photo  square photo canvas
 * @param {string} data.name
 * @param {string} data.role
 * @param {string} data.stack
 * @param {string} data.title  builder title
 * @param {HTMLCanvasElement} [target] reuse an existing canvas
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderCard(data, target){
  const { goa, studio } = await preloadCardAssets();

  const canvas = target || document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const IMBUE = '"Imbue", Georgia, serif';
  const MONO  = '"Victor Mono", monospace';

  const name  = (data.name  || 'BUILDER').trim();
  const role  = (data.role  || '').trim();
  const stack = (data.stack || '').trim();
  const title = (data.title || '').trim();

  /* ── background ─────────────────────────────────────────── */
  ctx.fillStyle = C.green;
  ctx.fillRect(0, 0, W, H);

  // soft vertical lift so the card doesn't read flat
  const lift = ctx.createLinearGradient(0, 0, 0, H);
  lift.addColorStop(0,   'rgba(255,255,255,0.07)');
  lift.addColorStop(0.5, 'rgba(255,255,255,0)');
  lift.addColorStop(1,   'rgba(0,0,0,0.16)');
  ctx.fillStyle = lift;
  ctx.fillRect(0, 0, W, H);

  /* ── horizon band: sun, sea, sand ───────────────────────── */
  const horizonY = H * 0.805;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, horizonY);
  ctx.clip();
  sun(ctx, W * 0.76, horizonY - 74, 92, C.yellow, 'rgba(254,225,1,0.55)');
  ctx.restore();

  // sea — scalloped lines, the brand's shorthand for water
  waveLine(ctx, horizonY - 40, 8,  128, 'rgba(255,251,232,0.28)', 4, 20);
  waveLine(ctx, horizonY - 18, 10, 150, 'rgba(255,251,232,0.40)', 4.5, -60);

  // wet sand edge
  const sandTop = horizonY + 6;
  ctx.fillStyle = C.sand;
  ctx.beginPath();
  ctx.moveTo(0, sandTop + 26);
  for (let x = 0; x <= W; x += 120){
    ctx.quadraticCurveTo(x + 30, sandTop + 6, x + 60, sandTop + 20);
    ctx.quadraticCurveTo(x + 90, sandTop + 34, x + 120, sandTop + 20);
  }
  ctx.lineTo(W, H); ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  // foam line riding the sand edge
  ctx.save();
  ctx.strokeStyle = C.cream;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, sandTop + 26);
  for (let x = 0; x <= W; x += 120){
    ctx.quadraticCurveTo(x + 30, sandTop + 6, x + 60, sandTop + 20);
    ctx.quadraticCurveTo(x + 90, sandTop + 34, x + 120, sandTop + 20);
  }
  ctx.stroke();
  ctx.restore();

  // palms flanking the horizon, drawn behind the sand so they root into it
  // Kept short enough that the crowns stay inside the band between the
  // stack line and the sea — a taller palm collides with the text.
  palm(ctx, W * 0.075, horizonY + 6, 196, 'rgba(255,251,232,0.34)', 5.5);
  palm(ctx, W * 0.950, horizonY + 16, 162, 'rgba(255,251,232,0.26)', 5, true);

  /* ── top rail ───────────────────────────────────────────── */
  const PAD = 74;

  if (studio){
    const sw = 96, sh = sw * (studio.height / studio.width);
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.drawImage(studio, PAD, 66, sw, sh);
    ctx.restore();
  }

  ctx.font = `500 21px ${MONO}`;
  ctx.fillStyle = 'rgba(255,251,232,0.72)';
  ctx.textAlign = 'right';
  ctx.fillText('28–31 OCT 2026', W - PAD, 96);
  ctx.font = `500 17px ${MONO}`;
  ctx.fillStyle = 'rgba(254,225,1,0.85)';
  ctx.fillText('GOA, INDIA', W - PAD, 124);
  ctx.textAlign = 'left';

  // hairline under the rail
  ctx.strokeStyle = 'rgba(255,251,232,0.20)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, 168); ctx.lineTo(W - PAD, 168);
  ctx.stroke();

  /* ── the lockup ─────────────────────────────────────────── */
  const lockY = 244;
  const LOCK = 88;
  ctx.fillStyle = C.cream;
  ctx.font = `400 ${LOCK}px ${IMBUE}`;
  ctx.textBaseline = 'alphabetic';
  const hackerW = ctx.measureText('HACKER').width;
  ctx.fillText('HACKER', PAD, lockY);

  const gs = 84;
  ctx.save();
  ctx.translate(PAD + hackerW + 16 + gs / 2, lockY - 32);
  ctx.rotate(-0.10);
  if (goa) ctx.drawImage(goa, -gs / 2, -gs / 2, gs, gs);
  ctx.restore();

  ctx.fillStyle = C.cream;
  ctx.font = `400 ${LOCK}px ${IMBUE}`;
  ctx.fillText('HOUSE', PAD + hackerW + 16 + gs + 16, lockY);

  /* ── photo ──────────────────────────────────────────────── */
  const PH = 306;
  const px = PAD, py = lockY + 46;

  // drop shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.42)';
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = C.cream;
  roundRect(ctx, px, py, PH, PH, 26);
  ctx.fill();
  ctx.restore();

  // photo inset inside a cream mount
  const inset = 9;
  ctx.save();
  roundRect(ctx, px + inset, py + inset, PH - inset*2, PH - inset*2, 18);
  ctx.clip();
  if (data.photo){
    ctx.drawImage(data.photo, px + inset, py + inset, PH - inset*2, PH - inset*2);
  } else {
    ctx.fillStyle = C.greenDeep;
    ctx.fillRect(px + inset, py + inset, PH - inset*2, PH - inset*2);
  }
  ctx.restore();

  /* ── name block, right of the photo ─────────────────────── */
  const tx = px + PH + 32;
  const tw = W - PAD - tx;

  const lines = nameLines(name.toUpperCase());
  let nameSize = lines.length > 1 ? 78 : 92;
  for (const l of lines) nameSize = Math.min(nameSize, fitText(ctx, l, tw, nameSize, IMBUE, 800));

  ctx.fillStyle = C.cream;
  ctx.font = `800 ${nameSize}px ${IMBUE}`;
  let ny = py + nameSize * 0.80;
  for (const l of lines){
    ctx.fillText(l, tx, ny);
    ny += nameSize * 0.84;
  }

  // role pill, sitting under the name inside the photo's band
  if (role){
    ctx.font = `700 26px ${IMBUE}`;
    const rw = ctx.measureText(role.toUpperCase()).width;
    const pillH = 46, pillW = Math.min(rw + 44, tw);
    const ry = Math.min(ny - nameSize * 0.84 + nameSize * 0.34, py + PH - pillH);
    ctx.fillStyle = C.pink;
    roundRect(ctx, tx, ry, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(role.toUpperCase(), tx + pillW / 2, ry + pillH * 0.70);
    ctx.textAlign = 'left';
  }

  /* ── labelled blocks below the photo ────────────────────────
     A running cursor, so a two-line name or a long title can never
     collide with the block beneath it. */
  let cy = py + PH + 62;

  const label = (text) => {
    ctx.font = `500 17px ${MONO}`;
    ctx.fillStyle = 'rgba(254,225,1,0.85)';
    ctx.fillText(text, PAD, cy);
    cy += 14;
  };

  label('BUILDER TITLE');
  const tSize = fitText(ctx, title.toUpperCase(), W - PAD * 2, 78, IMBUE, 800);
  ctx.font = `800 ${tSize}px ${IMBUE}`;
  ctx.fillStyle = C.yellow;
  cy += tSize * 0.72;
  ctx.fillText(title.toUpperCase(), PAD, cy);
  cy += 46;

  if (stack){
    label('STACK');
    const sSize = fitText(ctx, stack, W - PAD * 2, 29, MONO, 500);
    ctx.font = `500 ${sSize}px ${MONO}`;
    ctx.fillStyle = 'rgba(255,251,232,0.92)';
    cy += sSize * 0.95;
    ctx.fillText(stack, PAD, cy);
  }

  /* ── गोवा stamp, straddling the waterline ───────────────── */
  if (goa){
    const gs = 168;
    ctx.save();
    ctx.translate(W - PAD - gs * 0.42, horizonY - 6);
    ctx.rotate(-0.13);
    ctx.shadowColor = 'rgba(0,0,0,0.30)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.drawImage(goa, -gs / 2, -gs / 2, gs, gs);
    ctx.restore();
  }

  /* ── ticket perforation above the footer ────────────────── */
  ctx.save();
  ctx.strokeStyle = 'rgba(6,51,29,0.28)';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 12]);
  ctx.beginPath();
  ctx.moveTo(PAD, H - 128);
  ctx.lineTo(W - PAD, H - 128);
  ctx.stroke();
  ctx.restore();

  /* ── footer on the sand ─────────────────────────────────── */
  const fy = H - 78;

  ctx.font = `700 27px ${IMBUE}`;
  ctx.fillStyle = C.ink;
  ctx.globalAlpha = 0.85;
  ctx.fillText('HACKER HOUSE GOA 2026', PAD, fy);
  ctx.globalAlpha = 1;

  /* ── finishing ──────────────────────────────────────────── */
  grain(ctx, 0.045);

  // inner keyline, like a printed credential
  ctx.strokeStyle = 'rgba(255,251,232,0.16)';
  ctx.lineWidth = 2;
  roundRect(ctx, 18, 18, W - 36, H - 36, 26);
  ctx.stroke();

  return canvas;
}

export const CARD_SIZE = { W, H };
