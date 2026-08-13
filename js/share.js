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

/**
 * @returns {Promise<'shared'|'downloaded'>} which route was taken
 */
export async function shareToX(cardCanvas, meta){
  const text = caption(meta);
  const filename = `hh-goa-2026-${slug(meta.name)}.png`;

  // Decide the route with a placeholder file of the right MIME type — a
  // real blob isn't needed to answer "would you accept a PNG at all", and
  // getting one is the async step we need to stay ahead of.
  const canNativeShare = !!(
    navigator.canShare && navigator.share &&
    navigator.canShare({ files: [new File([], filename, { type: 'image/png' })] })
  );

  if (!canNativeShare){
    // Desktop: open the tab NOW, synchronously, while we're still inside
    // the click — then let the download run alongside it.
    openIntent(text);
    await download(cardCanvas, meta.name);
    return 'downloaded';
  }

  // Mobile: the share sheet attaches the real file directly.
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
    await download(cardCanvas, meta.name);
    return 'downloaded';
  }
}
