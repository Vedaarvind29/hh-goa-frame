/* ============================================================
   Download + share

   Two routes to X, best available first:
     1. Mobile share sheet with the file attached → the real image goes
        straight into the tweet, caption pre-filled. Nothing left to do.
     2. Desktop → X's composer can't accept an attached image from a web
        page, so we hand over both halves of the job in one click: the
        intent tab opens with the caption and hashtags already typed in,
        and the PNG lands in Downloads a beat later. The only step left
        for the user is drag the file in and hit post.

   Route selection is decided SYNCHRONOUSLY, before any await, using a
   placeholder File to probe navigator.canShare(). That matters: if the
   intent tab is opened after an await (canvas.toBlob() is genuinely
   async), it lands outside the click handler's "trusted user gesture"
   window and most browsers silently eat it as a popup. Deciding the
   route first and opening the tab as the very next synchronous line
   keeps it inside that window.

   Route 1 needs a secure context, so deploy over HTTPS — any static host
   gives you that for free.
   ============================================================ */

const HASHTAG = '#FrameInGoa';

export function caption({ name, title }){
  const who = title ? `${title}.` : '';
  return `${who} Built for Hacker House Goa 2026. 🌊\n\n${HASHTAG}`;
}

function slug(s){
  return (s || 'builder').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'builder';
}

export function canvasToBlob(canvas, type = 'image/png', quality){
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

/** Save the PNG to the device. */
export async function download(canvas, name){
  const blob = await canvasToBlob(canvas);
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hh-goa-2026-${slug(name)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function openIntent(text){
  const q = new URLSearchParams({ text });
  window.open(`https://x.com/intent/post?${q}`, '_blank', 'noopener');
}

const delay = ms => new Promise(r => setTimeout(r, ms));

/**
 * @returns {Promise<'shared'|'downloaded'>} which route was taken
 */
export async function shareToX(cardCanvas, meta){
  const text = caption(meta);
  const filename = `hh-goa-2026-${slug(meta.name)}.png`;

  // Decide the route with a placeholder file of the right MIME type — a
  // real blob isn't needed to answer "would you accept a PNG at all", and
  // getting one is the async step we need to stay ahead of.
  //
  // Wrapped in try/catch: canShare() is meant to never throw, but a couple
  // of WebKit versions have been seen throwing on an empty File rather
  // than just returning false. If it does, treat native share as
  // unavailable instead of losing the whole action.
  let canNativeShare = false;
  try {
    canNativeShare = !!(
      navigator.canShare && navigator.share &&
      navigator.canShare({ files: [new File([], filename, { type: 'image/png' })] })
    );
  } catch { /* treat as unsupported */ }

  if (!canNativeShare){
    // Desktop, or a mobile browser without file-share support: open the
    // tab NOW, synchronously, while still inside the click. The download
    // gets its own macrotask via a short delay rather than firing in the
    // same breath — Safari-family browsers generally permit only ONE
    // "new window or file download" per user gesture, and two such
    // actions back to back tend to have the second one silently dropped.
    // Giving it a beat of its own measurably improves the odds both land.
    openIntent(text);
    await delay(300);
    await download(cardCanvas, meta.name);
    return 'downloaded';
  }

  // Mobile with real file-share support: the share sheet attaches the
  // file directly, no separate download needed.
  try {
    const blob = await canvasToBlob(cardCanvas);
    const file = new File([blob], filename, { type: 'image/png' });
    await navigator.share({ files: [file], text });
    return 'shared';
  } catch (err){
    if (err?.name === 'AbortError') return 'shared';   // user dismissed; not an error
    // canShare said yes but the share itself failed for some other reason
    // (rare, but seen on a few Android WebViews) — don't strand the user
    // with neither the post nor the image; fall back to the same hand-off
    // desktop gets.
    openIntent(text);
    await delay(300);
    await download(cardCanvas, meta.name);
    return 'downloaded';
  }
}
