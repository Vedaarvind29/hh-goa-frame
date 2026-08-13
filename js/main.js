/* ============================================================
   Orchestration — the four acts
     0 arrival · 1 write · 2/3 the sea · 4 result
   ============================================================ */

import { createScene }        from './scene.js';
import { builderTitle }       from './titles.js';
import { preparePhoto }       from './imageio.js';
import { renderCard, preloadCardAssets } from './card.js';
import { shareToX, download } from './share.js';

/* ── keyboard-aware viewport height ─────────────────────────
   Android Chrome doesn't shrink the layout viewport when the on-screen
   keyboard opens — it overlays the keyboard on top instead — so anything
   sized off the plain layout viewport (everything here uses
   position:fixed + a height driven by this custom property) stays pinned
   to the pre-keyboard height, and the field you're typing into can end up
   hidden behind the keyboard. visualViewport.height DOES shrink correctly
   when the keyboard opens, on both platforms, so feeding it back as a CSS
   custom property is what lets the fixed layers actually respond. iOS
   Safari already handled this natively, so this is a no-op improvement
   there, not a platform-specific patch. */
function syncAppHeight(){
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${h}px`);
}
syncAppHeight();
window.visualViewport?.addEventListener('resize', syncAppHeight);
window.addEventListener('resize', syncAppHeight);

const $ = id => document.getElementById(id);

const el = {
  scene:    $('scene'),
  acts:     { intro: $('act-intro'), form: $('act-form'), wash: $('act-wash'), result: $('act-result') },
  begin:    $('btn-begin'),
  hint:     $('intro-hint'),

  photoWrap: $('photo-drop'),
  photoIn:   $('input-photo'),
  photoImg:  $('photo-preview'),
  photoEmpty:$('photo-empty'),
  photoHint: $('photo-hint'),

  name:   $('input-name'),
  role:   $('input-role'),
  stack:  $('input-stack'),
  title:  $('builder-title'),
  reroll: $('btn-reroll'),
  summon: $('btn-summon'),
  req:    $('sheet-req'),

  washline: $('washline'),
  skip:     $('btn-skip'),
  download: $('btn-download'),
  share:    $('btn-share'),
  again:    $('btn-again'),
  sr:       $('sr-status'),
};

const state = {
  photo: null,        // square canvas
  roll: 0,
  title: '',
  card: null,         // rendered card canvas
  busy: false,
};

const scene = createScene(el.scene);
preloadCardAssets();

/* ── act switching ───────────────────────────────────────── */
let current = 'intro';
function show(next){
  const from = el.acts[current], to = el.acts[next];
  if (from === to) return;
  from.classList.remove('is-active');
  setTimeout(() => { from.hidden = true; }, 420);
  to.hidden = false;
  // Force a style flush rather than waiting on rAF — a throttled or
  // backgrounded tab never fires it, and the panel would stay invisible.
  void to.offsetWidth;
  to.classList.add('is-active');
  current = next;

  scene.setFocus({ form: 'write', wash: 'wash', result: 'result' }[next] || 'intro');
  syncPan();
}

/**
 * Keep the beach — and the sand writing on it — out from behind the UI.
 * Measures the real panel each time, rather than assuming a fixed size:
 * a bottom sheet's actual height depends on font rendering and device, and
 * its content (a long generated title can wrap to two lines) can change
 * that height while the user is still typing.
 */
function syncPan(){
  const panel = el.acts[current]?.querySelector('.sheet, .result');
  if (!panel || current === 'wash'){ scene.setPan(0.5, 1); scene.setPanelTop(null); return; }

  const r = panel.getBoundingClientRect();
  const sideways = r.height < innerHeight * 0.92 && r.width < innerWidth * 0.8;
  if (!sideways){
    // Full-width bottom sheet: nothing to dodge sideways, but the writing
    // must stay entirely above the sheet's real top edge.
    scene.setPan(0.5, 1);
    scene.setPanelTop(r.top);
    return;
  }

  // Side panel: nothing to dodge vertically, but the writing is squeezed
  // into whichever side has more room.
  const leftGap  = r.left;
  const rightGap = innerWidth - r.right;
  const onLeft   = leftGap >= rightGap;
  const gap      = onLeft ? leftGap : rightGap;
  const centre   = onLeft ? gap / 2 : innerWidth - gap / 2;

  scene.setPan(centre / innerWidth, gap / innerWidth);
  scene.setPanelTop(null);
}

addEventListener('resize', syncPan);

// React to the panel's own size changes too — not just the viewport's.
// A long builder title wrapping to a second line grows the sheet without
// firing a window resize, and the writing has to react to that live.
const panelObserver = new ResizeObserver(syncPan);
for (const key of ['form', 'result']){
  const panel = el.acts[key]?.querySelector('.sheet, .result');
  if (panel) panelObserver.observe(panel);
}

function say(msg){ el.sr.textContent = msg; }

/* ── toast ───────────────────────────────────────────────── */
let toastEl, toastTimer;
function toast(msg, ms = 3400){
  if (!toastEl){
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  requestAnimationFrame(() => toastEl.classList.add('is-in'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-in'), ms);
  say(msg);
}

/* ── ACT 0 ───────────────────────────────────────────────── */
el.begin.addEventListener('click', () => {
  show('form');
  setTimeout(() => el.name.focus({ preventScroll: true }), 500);
});

// hide the drag hint once they've had a go
let hintDone = false;
el.scene.addEventListener('pointerdown', () => {
  if (hintDone) return;
  hintDone = true;
  el.hint.style.transition = 'opacity .6s';
  el.hint.style.opacity = '0';
}, { once: true });

/* ── ACT 1 · live sand writing ───────────────────────────── */
function syncSand(){
  scene.setText(
    el.name.value.trim(),
    el.role.value.trim(),
    el.stack.value.trim()
  );
}

function syncTitle(){
  state.title = builderTitle(
    el.name.value || 'builder',
    `${el.role.value} ${el.stack.value}`,
    state.roll
  );
  el.title.textContent = state.title;
}

function syncReady(){
  const ok = !!state.photo && el.name.value.trim().length >= 2;
  el.summon.disabled = !ok;
  el.req.textContent = ok
    ? 'The sea is ready when you are'
    : 'Add a photo and a name to continue';
  el.req.classList.toggle('is-ready', ok);
}

let sandTimer;
for (const input of [el.name, el.role, el.stack]){
  input.addEventListener('input', () => {
    // Redrawing a 2048px canvas on every keystroke is wasteful; coalesce.
    clearTimeout(sandTimer);
    sandTimer = setTimeout(syncSand, 45);
    syncTitle();
    syncReady();
  });
}

el.reroll.addEventListener('click', () => {
  state.roll++;
  syncTitle();
  el.reroll.classList.add('is-rolling');
  setTimeout(() => el.reroll.classList.remove('is-rolling'), 520);
});

/* ── photo intake ────────────────────────────────────────── */
/* No spinner. Decode + crop is a few milliseconds for JPG/PNG, and flashing
   a loader for that reads as slower than doing nothing at all. */
async function takePhoto(file){
  if (!file) return;
  try {
    const square = await preparePhoto(file);
    state.photo = square;
    el.photoImg.src = square.toDataURL('image/jpeg', 0.9);
    el.photoImg.hidden = false;
    el.photoEmpty.hidden = true;
    el.photoWrap.classList.add('is-filled');
    el.photoHint.innerHTML = 'Looking good.<br>Tap to change.';
    say('Photo added');
  } catch (err){
    const msg = err?.message === 'heic-decoder-unavailable'
      ? "Couldn't read that HEIC here — try a JPG, or use Safari."
      : "Couldn't read that image. Try a JPG or PNG.";
    toast(msg);
  } finally {
    syncReady();
  }
}

el.photoIn.addEventListener('change', e => takePhoto(e.target.files[0]));

// drag & drop on desktop
for (const type of ['dragenter', 'dragover']){
  el.photoWrap.addEventListener(type, e => {
    e.preventDefault(); el.photoWrap.classList.add('is-drag');
  });
}
for (const type of ['dragleave', 'drop']){
  el.photoWrap.addEventListener(type, e => {
    e.preventDefault(); el.photoWrap.classList.remove('is-drag');
  });
}
el.photoWrap.addEventListener('drop', e => takePhoto(e.dataTransfer.files[0]));

// paste a screenshot straight in
window.addEventListener('paste', e => {
  if (current !== 'form') return;
  const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
  if (item) takePhoto(item.getAsFile());
});

/* ── ACT 2/3 · the sea ───────────────────────────────────── */
const WASH_LINES = [
  'The sea takes it back.',
  'Everything here is temporary.',
  'Wait for the second wave.',
];

let skipped = false;
el.skip.addEventListener('click', () => { skipped = true; scene.skip(); });

function washline(text){
  if (skipped) return Promise.resolve();      // don't hold up a skipped run
  el.washline.classList.remove('is-in');
  return new Promise(resolve => {
    setTimeout(() => {
      el.washline.textContent = text;
      el.washline.classList.add('is-in');
      resolve();
    }, 420);
  });
}

el.summon.addEventListener('click', async () => {
  if (state.busy) return;
  state.busy = true;
  el.summon.disabled = true;

  // Blur so the mobile keyboard drops before the animation starts.
  document.activeElement?.blur?.();
  skipped = false;

  const meta = {
    photo: state.photo,
    name:  el.name.value.trim(),
    role:  el.role.value.trim(),
    stack: el.stack.value.trim(),
    title: state.title,
  };

  show('wash');

  // Render the card while the first wave is running — by the time the
  // second wave arrives it is already done, so nothing ever waits on us.
  const cardPromise = renderCard(meta).then(canvas => {
    state.card = canvas;
    return canvas;
  });

  try {
    await washline(WASH_LINES[0]);
    await scene.wash();

    await washline(WASH_LINES[1]);
    if (!skipped) await new Promise(r => setTimeout(r, 550));

    await washline(WASH_LINES[2]);

    const card = await cardPromise;

    el.washline.classList.remove('is-in');
    await scene.deliver(card);

    show('result');
    say('Your builder card is ready to download or share.');
  } catch (err){
    // Never strand the user staring at the sea — hand them back the form.
    console.error('card sequence failed', err);
    el.washline.classList.remove('is-in');
    await scene.reset();
    show('form');
    toast('Something went wrong making that card. Try again?');
  } finally {
    state.busy = false;
    syncReady();
  }
});

/* ── ACT 4 · output ──────────────────────────────────────── */
el.download.addEventListener('click', async () => {
  if (!state.card) return;
  await download(state.card, el.name.value);
  toast('Saved to your device');
});

el.share.addEventListener('click', async () => {
  if (!state.card) return;
  el.share.disabled = true;
  try {
    const route = await shareToX(state.card, {
      name: el.name.value.trim(),
      title: state.title,
    });
    if (route === 'downloaded'){
      toast('Card saved — attach it to the post we just opened');
    }
  } catch {
    toast("Couldn't open X. Download the card and post it manually.");
  } finally {
    el.share.disabled = false;
  }
});

el.again.addEventListener('click', async () => {
  await scene.reset();
  state.card = null;
  show('form');
  syncSand();
});

/* ── boot ────────────────────────────────────────────────── */
syncTitle();
syncReady();

// Warm the fonts so the very first sand-write is already in Caveat.
document.fonts.load('700 210px "Caveat"').then(syncSand);
