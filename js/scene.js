/* ============================================================
   The beach — flat vector, drawn at device resolution.

   Depth comes from parallax between layers and from the card
   squashing up off the sand, not from a perspective camera. That
   is deliberate: the event artwork is flat vector, and a textured
   ground plane viewed at a grazing angle can only ever alias.

   Static layers (sky, sun, hills, palms) are cached to offscreen
   canvases and blitted with an offset, so a full redraw costs
   almost nothing and the animation stays at frame rate.
   ============================================================ */

import {
  C, lerp, easeOutCubic, easeInOutCubic,
  sun, sunReflection, palm, hills, waveStroke, umbrella, deckChair,
} from './art.js';

const CAVEAT = '"Caveat", cursive';

export function createScene(canvas){
  const ctx = canvas.getContext('2d', { alpha: false });

  let W = 0, H = 0, dpr = 1;
  let layout = null;
  let sky = null, palmL = null, palmR = null;      // cached layers

  /* ── animation state ───────────────────────────────────── */
  let raf = 0, t0 = performance.now(), time = 0;
  let anim = null, skipping = false;

  // wave front, 0 = at the shoreline, 1 = fully up the beach
  let swash = 0, swashIdle = true;
  let wet = 0;                                     // how far the sand stayed wet

  // parallax
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  let panFrac = 0.5, pan = 0, panTarget = 0;

  /* How much of the writing has to dodge the UI. `panFree` is the fraction
     of viewport width still open beside a side panel (1 = nothing in the
     way). `panelTop` is the screen-space Y of a bottom sheet's top edge —
     the writing must stay entirely above it. Both are measured from the
     real DOM by main.js, not guessed, because the panel's actual height
     depends on font rendering and content and varies by device. */
  let panFree = 1;
  let panelTop = 1e6;      // "no panel" until told otherwise

  // sand writing
  let text = { name: '', role: '', stack: '' };
  let textAlpha = 1;

  /* Each act slides the whole composition vertically. Shifting it up pushes
     the sea into a thin band at the top and gives the sand — and the writing
     on it — the room the form sheet would otherwise cover. This is the flat
     equivalent of pitching a camera down. Values are fractions of height. */
  const FOCUS_DY = { intro: 0, write: 0.32, wash: 0.26, result: 0.12 };
  let dy = 0, dyTarget = 0;

  /* Palms are pulled toward the centre on screens with nothing else
     competing for that space (the intro — a bare corner sliver read as
     barely there on a phone), and pushed back out toward the edges once
     the sand-writing needs the full width to itself. 0 = at the edge
     (their original framing position), 1 = pulled fully in. */
  const FOCUS_PALM = { intro: 1, write: 0, wash: 0, result: 0.4 };
  // The app boots straight into 'intro' — main.js's setFocus() only fires
  // on a show() transition INTO an act, and there is never a transition
  // into 'intro' since it's already on screen at load. Defaulting both
  // values to FOCUS_PALM.intro (not 0) is what actually makes the pulled-in
  // framing apply on first paint, rather than only after some later act.
  let palmPull = FOCUS_PALM.intro, palmPullTarget = FOCUS_PALM.intro;

  // the card
  const card = {
    img: null, on: false,
    x: 0, y: 0, scale: 1, squash: 0, rot: 0, alpha: 0,
  };

  /* ── layout ────────────────────────────────────────────── */
  function computeLayout(){
    const tall = H / W > 1.2;
    const horizon = H * (tall ? 0.34 : 0.40);
    const shore   = horizon + H * (tall ? 0.13 : 0.16);
    return {
      horizon,
      shore,                                   // top of the sand
      sunR:  Math.min(W, H) * (tall ? 0.115 : 0.095),
      sunX:  W * 0.54,
    };
  }

  /* ── cached layers ─────────────────────────────────────── */
  function makeLayer(w, h, draw){
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * dpr));
    c.height = Math.max(1, Math.ceil(h * dpr));
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    draw(g, w, h);
    return c;
  }

  function buildLayers(){
    const L = layout;
    const pad = 60;                                    // room for parallax drift

    sky = makeLayer(W + pad * 2, H + pad * 2, (g) => {
      g.translate(pad, pad);

      // sky
      g.fillStyle = C.sky;
      g.fillRect(-pad, -pad, W + pad * 2, L.horizon + pad);

      // sun + rays sit on the horizon
      sun(g, L.sunX, L.horizon - L.sunR * 0.04, L.sunR, 0);

      // headlands, far then near
      hills(g, -pad, W + pad, L.horizon, 1.7, C.hillFar, L.sunR * 0.55);
      hills(g, -pad, W + pad, L.horizon, 4.2, C.hill,    L.sunR * 0.38);

      // sea
      g.fillStyle = C.sea;
      g.fillRect(-pad, L.horizon, W + pad * 2, L.shore - L.horizon + 2);
    });

    // One viewport-sized layer PER palm — not one shared canvas — so each
    // side can be nudged toward the centre independently at draw time (see
    // palmPull). Positioned exactly as before within their own canvas: far
    // enough out that on 'write' the fronds only intrude from the corners
    // and never reach the middle, where the writing lives.
    palmL = makeLayer(W + pad * 2, H + pad * 2, (g) => {
      g.translate(pad, pad);
      palm(g, -W * 0.42, H * 1.04, H * 0.52, 0.22, 0);
    });
    palmR = makeLayer(W + pad * 2, H + pad * 2, (g) => {
      g.translate(pad, pad);
      palm(g, W * 1.42, H * 1.06, H * 0.44, -0.22, 0);
    });
  }

  /* ── resize ────────────────────────────────────────────── */
  function resize(){
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout = computeLayout();
    buildLayers();
  }

  /* ── sand writing ──────────────────────────────────────── */
  /**
   * Drawn flat, then squashed vertically. That reads as lying on the
   * ground the same way their flat illustration implies depth, and it
   * stays perfectly crisp — no perspective sampling involved.
   *
   * The block must land ENTIRELY inside whatever space main.js reports as
   * free — never guessed from a fixed fraction of the screen. A bottom
   * sheet's real height depends on font rendering and device, so a static
   * writeY clipped lines on some phones while looking fine on others.
   * Both width (panFree, a side panel) and height (panelTop, a bottom
   * sheet) are measured live from the DOM and can shrink the text; the
   * block is never allowed to run under the UI.
   */
  function drawWriting(g){
    if (textAlpha <= 0.01) return;
    const L = layout;
    const lines = [];
    if (text.name)  lines.push({ s: text.name,  size: 1.00, w: 700 });
    if (text.role)  lines.push({ s: text.role,  size: 0.58, w: 400 });
    if (text.stack) lines.push({ s: text.stack, size: 0.44, w: 400 });
    if (!lines.length) return;

    const base = Math.min(W, H) * 0.115;
    const LINE_STEP = 1.10;                    // gap above + below each line

    // ---- width: shrink so the widest line spans the free width ----
    const bandWidth = W * panFree * 0.86;
    let widest = 0;
    for (const l of lines){
      g.font = `${l.w} ${base * l.size}px ${CAVEAT}`;
      widest = Math.max(widest, g.measureText(l.s).width);
    }
    let fit = widest > 0 ? Math.min(bandWidth / widest, 1.9) : 1;

    // ---- height: the whole block, squash included, must fit between the
    // shore and the panel's real top edge — shrink further if it doesn't ----
    const topMargin = Math.max(14, H * 0.02);
    const bottomMargin = Math.max(18, H * 0.025);
    const contentTop = L.shore + topMargin;
    // panelTop is a screen-space Y from getBoundingClientRect(); this block
    // draws inside ctx.translate(0, -dy), so screen_y = content_y - dy.
    const contentBottom = Math.max(contentTop + 40, panelTop + dy - bottomMargin);
    const bandHeight = contentBottom - contentTop;   // may be enormous when unconstrained

    const squashedHeight =
      lines.reduce((s, l) => s + base * l.size * fit * LINE_STEP, 0) * 0.62;
    if (squashedHeight > bandHeight){
      // Floored, not zeroed: past this point a sliver under the sheet reads
      // better than text too small to make out at all.
      fit *= Math.max(0.30, bandHeight / squashedHeight);
    }

    // For centring only, cap how far down the band is allowed to reach.
    // With no bottom sheet (a side panel, or no panel at all) bandHeight is
    // the ~1e6 "unconstrained" sentinel, and centring on half of that would
    // park the text hundreds of thousands of pixels below the fold.
    const centerBand = Math.min(bandHeight, (H - contentTop) * 0.62);
    const centerY = Math.min(contentTop + centerBand / 2, contentBottom - 20);

    g.save();
    g.globalAlpha = textAlpha;
    g.translate(W * panFrac + pan * 0.15, centerY);
    g.scale(1, 0.62);                          // lying on the sand
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';

    let y = -lines.reduce((a, l) => a + base * l.size * fit * LINE_STEP, 0) / 2;
    for (const l of lines){
      const size = base * l.size * fit;
      y += size * 0.55;
      g.font = `${l.w} ${size}px ${CAVEAT}`;

      // trench, then a bright lip just above it — reads as carved
      g.fillStyle = C.sandLo;
      g.fillText(l.s, 0, y);
      g.strokeStyle = C.sandLo;
      g.lineWidth = size * 0.05;
      g.strokeText(l.s, 0, y);

      g.fillStyle = C.sandHi;
      g.fillText(l.s, 0, y - size * 0.055);

      g.fillStyle = C.sandLo;
      g.globalAlpha = textAlpha * 0.55;
      g.fillText(l.s, 0, y);
      g.globalAlpha = textAlpha;

      y += size * 0.55;
    }
    g.restore();
  }

  /* ── the sea's drawn wave lines ────────────────────────── */
  function drawSeaLines(g){
    const L = layout;
    const band = L.shore - L.horizon;
    const rows = 5;
    for (let i = 0; i < rows; i++){
      const p = (i + 1) / (rows + 1);
      const y = L.horizon + band * p * p;              // bunched near horizon
      const amp = 1.2 + p * 4.5;
      const wl  = W * (0.16 + p * 0.16);
      const a   = 0.30 + p * 0.55;
      g.globalAlpha = a;
      waveStroke(g, -20, W + 20, y, amp, wl, time * (0.5 + p * 0.6) + i, 1.4 + p * 2.0, C.white);
    }
    g.globalAlpha = 1;
  }

  /* ── swash: the sheet of water running up the beach ────── */
  function drawSwash(g){
    const L = layout;
    // Even at full reach the water is a band near the shoreline, not a flood
    // over the whole beach — running it to the bottom turns the sand green.
    const reach = L.shore + (H - L.shore) * 0.60;
    const y = lerp(L.shore - 6, reach, swash);
    const amp = Math.max(4, (H - L.shore) * 0.022);
    const wl  = W * 0.30;

    // wet sand left behind, fading as it drains
    if (wet > 0.01){
      const wy = lerp(L.shore - 6, reach, wet);
      g.save();
      g.globalAlpha = 0.09 * Math.min(1, wet * 2.2);
      g.fillStyle = C.hill;
      g.beginPath();
      g.moveTo(-20, L.shore - 20);
      g.lineTo(W + 20, L.shore - 20);
      for (let x = W + 20; x >= -20; x -= 6){
        g.lineTo(x, wy + Math.sin((x / wl) * Math.PI * 2 + time * 0.6) * amp);
      }
      g.closePath();
      g.fill();
      g.restore();
    }

    if (swash <= 0.001) return;

    // the water sheet
    g.save();
    g.fillStyle = C.sea;
    g.globalAlpha = 0.34;
    g.beginPath();
    g.moveTo(-20, L.shore - 24);
    g.lineTo(W + 20, L.shore - 24);
    for (let x = W + 20; x >= -20; x -= 6){
      g.lineTo(x, y + Math.sin((x / wl) * Math.PI * 2 + time * 1.4) * amp);
    }
    g.closePath();
    g.fill();
    g.restore();

    // foam edge — the signature scalloped white line
    g.save();
    g.strokeStyle = C.white;
    g.lineWidth = Math.max(2.5, H * 0.005);
    g.lineCap = 'round';
    g.beginPath();
    for (let x = -20; x <= W + 20; x += 4){
      const yy = y + Math.sin((x / wl) * Math.PI * 2 + time * 1.4) * amp;
      if (x === -20) g.moveTo(x, yy); else g.lineTo(x, yy);
    }
    g.stroke();

    // lacy second line just behind it
    g.globalAlpha = 0.5;
    g.lineWidth = Math.max(1.5, H * 0.003);
    g.beginPath();
    for (let x = -20; x <= W + 20; x += 4){
      const yy = y - amp * 1.9 + Math.sin((x / (wl * 0.6)) * Math.PI * 2 - time * 1.1) * amp * 0.7;
      if (x === -20) g.moveTo(x, yy); else g.lineTo(x, yy);
    }
    g.stroke();
    g.restore();
  }

  /* ── the card ──────────────────────────────────────────── */
  function drawCard(g){
    if (!card.on || !card.img || card.alpha <= 0.01) return;
    const img = card.img;
    const targetH = H * 0.52;
    const s = (targetH / img.height) * card.scale;
    const w = img.width * s, h = img.height * s;

    g.save();
    g.globalAlpha = card.alpha;
    g.translate(card.x, card.y);
    g.rotate(card.rot);
    g.scale(1, Math.max(0.02, card.squash));

    // contact shadow
    g.save();
    g.globalAlpha = card.alpha * 0.28 * (1 - card.squash * 0.6);
    g.fillStyle = '#00301A';
    g.beginPath();
    g.ellipse(0, h * 0.48, w * 0.52, h * 0.06, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    g.shadowColor = 'rgba(0,32,16,0.35)';
    g.shadowBlur = 30 * card.squash;
    g.shadowOffsetY = 14 * card.squash;
    g.drawImage(img, -w / 2, -h / 2, w, h);
    g.restore();
  }

  /* ── frame ─────────────────────────────────────────────── */
  function frame(now){
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - t0) / 1000, 0.05);
    t0 = now;
    time += dt;

    if (anim) anim();

    // idle swash breathing at the shoreline
    if (swashIdle){
      const target = 0.05 + Math.sin(time * 0.5) * 0.045;
      swash += (target - swash) * 0.04;
    }
    wet = Math.max(wet - dt * 0.30, swash);

    // parallax + act framing easing
    look.x += (look.tx - look.x) * 0.06;
    look.y += (look.ty - look.y) * 0.06;
    panTarget = (panFrac - 0.5) * W;
    pan += (panTarget - pan) * 0.07;
    dy += (dyTarget - dy) * 0.11;
    palmPull += (palmPullTarget - palmPull) * 0.09;

    const L = layout;
    const px = look.x * 26, py = look.y * 14;

    ctx.fillStyle = C.sand;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(0, -dy);

    // sky / sun / sea, drifting least
    ctx.drawImage(sky, -60 + px * 0.30, -60 + py * 0.30,
                  sky.width / dpr, sky.height / dpr);

    sunReflection(ctx, L.sunX + px * 0.30, L.horizon + L.sunR * 0.12,
                  L.sunR, 7, time);
    drawSeaLines(ctx);

    // the shoreline: white sand with a wavy top edge
    ctx.save();
    ctx.fillStyle = C.sand;
    ctx.beginPath();
    // extends past the bottom by `dy` so the shifted composition still
    // covers the full viewport
    ctx.moveTo(-20, H + 20 + dy);
    ctx.lineTo(-20, L.shore);
    const amp = Math.max(4, H * 0.010), wl = W * 0.34;
    for (let x = -20; x <= W + 20; x += 6){
      ctx.lineTo(x, L.shore + Math.sin((x / wl) * Math.PI * 2 + time * 0.35) * amp);
    }
    ctx.lineTo(W + 20 + dy, H + 20 + dy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    drawSwash(ctx);
    drawWriting(ctx);
    ctx.restore();

    // Palms take only part of the act shift. They are tall objects at the
    // frame edges — moving them the full amount marches them into the
    // middle of the composition.
    ctx.save();
    ctx.translate(0, -dy * 0.42);
    const palmBaseX = -60 + px * 1.6, palmBaseY = -60 + py * 0.7;
    const palmNudge = palmPull * W * 0.16;   // toward centre, per side
    ctx.drawImage(palmL, palmBaseX + palmNudge, palmBaseY,
                  palmL.width / dpr, palmL.height / dpr);
    ctx.drawImage(palmR, palmBaseX - palmNudge, palmBaseY,
                  palmR.width / dpr, palmR.height / dpr);
    ctx.restore();

    drawCard(ctx);
  }

  /* ── input ─────────────────────────────────────────────── */
  let dragging = false, lastX = 0, lastY = 0;
  const onDown = e => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
  const onMove = e => {
    if (dragging){
      look.tx = Math.max(-1, Math.min(1, look.tx + (e.clientX - lastX) * 0.004));
      look.ty = Math.max(-1, Math.min(1, look.ty + (e.clientY - lastY) * 0.003));
      lastX = e.clientX; lastY = e.clientY;
    } else if (e.pointerType === 'mouse'){
      look.tx = (e.clientX / W - 0.5) * 1.4;
      look.ty = (e.clientY / H - 0.5) * 0.8;
    }
  };
  const onUp = () => { dragging = false; };
  const onTilt = e => {
    if (e.gamma == null) return;
    look.tx = Math.max(-1, Math.min(1, -e.gamma / 45));
    look.ty = Math.max(-1, Math.min(1, ((e.beta ?? 45) - 45) / 45));
  };

  canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
  addEventListener('deviceorientation', onTilt);
  addEventListener('resize', resize);

  resize();
  raf = requestAnimationFrame(frame);

  /* ── sequencing ────────────────────────────────────────── */
  function sequence(dur, fn){
    return new Promise(resolve => {
      if (skipping){ fn(1); resolve(); return; }
      const start = performance.now();
      const step = () => {
        const p = skipping ? 1
                : Math.min((performance.now() - start) / (dur * 1000), 1);
        fn(p);
        if (p >= 1){ anim = null; resolve(); return true; }
        return false;
      };
      anim = step;
      // If rAF is throttled (backgrounded tab) finish on a timer so the
      // promise chain still completes and the user gets their card.
      setTimeout(() => { if (anim === step) step(); }, dur * 1000 + 250);
    });
  }

  return {
    setFocus(mode){
      dyTarget = (FOCUS_DY[mode] ?? 0) * H;
      palmPullTarget = FOCUS_PALM[mode] ?? 0;
    },

    /**
     * @param {number} centreFrac  where the beach content should centre, 0..1
     * @param {number} [freeFrac]  fraction of viewport width still open
     *                             beside a side panel (1 = nothing in the way)
     */
    setPan(centreFrac, freeFrac = 1){
      panFrac = Math.max(0.12, Math.min(0.88, centreFrac));
      panFree = Math.max(0.30, Math.min(1, freeFrac));
    },

    /** Screen-space Y of a bottom sheet's top edge; writing stays above it.
     *  Pass null/omit to say "no panel", i.e. nothing to dodge. */
    setPanelTop(px){ panelTop = (px == null) ? 1e6 : px; },

    setText(name, role, stack){
      text = { name, role, stack };
      textAlpha = 1;
    },

    skip(){ skipping = true; },

    /* ACT 2 — the sea takes it */
    async wash(){
      skipping = false;
      swashIdle = false;

      await sequence(1.6, p => {
        const e = easeOutCubic(p);
        swash = lerp(0.05, 1, e);
        // the writing dissolves as the foam actually reaches it
        textAlpha = 1 - Math.max(0, Math.min(1, (swash - 0.34) / 0.26));
      });

      await sequence(0.30, () => { textAlpha = 0; });

      text = { name: '', role: '', stack: '' };

      await sequence(1.5, p => { swash = lerp(1, 0, easeInOutCubic(p)); });
    },

    /* ACT 3 — the sea brings the card back */
    async deliver(cardCanvas){
      card.img = cardCanvas;
      card.on = true;
      const L = layout;
      const restY = L.shore + (H - L.shore) * 0.52;

      // second wave arrives carrying it
      await sequence(1.8, p => {
        const e = easeOutCubic(p);
        swash = lerp(0, 1, e);
        card.alpha  = Math.min(1, p * 2.4);
        card.x      = W * panFrac + Math.sin(p * 4.2) * W * 0.02;
        card.y      = lerp(L.shore + (H - L.shore) * 0.10, restY, e);
        card.squash = 0.14;
        card.scale  = 0.92;
        card.rot    = Math.sin(p * 3.4) * 0.05;
      });

      // water pulls back, leaving it on the sand
      await sequence(1.3, p => {
        const e = easeInOutCubic(p);
        swash = lerp(1, 0.08, e);
        card.rot = lerp(card.rot, -0.03, e * 0.5);
      });

      // and it lifts to face you
      await sequence(1.0, p => {
        const e = easeOutCubic(p);
        card.squash = lerp(0.14, 1, e);
        card.scale  = lerp(0.92, 1, e);
        card.y      = lerp(restY, H * 0.42, e);
        card.rot    = lerp(-0.03, -0.012, e);
      });

      swashIdle = true;
      skipping = false;
    },

    refreshCard(){ /* the canvas is drawn each frame; nothing to invalidate */ },

    async reset(){
      anim = null; skipping = false;
      card.on = false; card.alpha = 0; card.squash = 0;
      text = { name: '', role: '', stack: '' };
      textAlpha = 1;
      swash = 0.05; wet = 0; swashIdle = true;
    },

    dispose(){
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      removeEventListener('pointercancel', onUp);
      removeEventListener('deviceorientation', onTilt);
      canvas.removeEventListener('pointerdown', onDown);
    },
  };
}
