/* ============================================================
   Download + share

   Always the same hand-off, on every device: the X compose tab opens
   with the caption and hashtags already typed in, and the PNG lands in
   Downloads a beat later. The only step left for the user is drag the
   file in and hit post.

   This used to branch on navigator.share()/canShare() first, preferring
   the OS-level share sheet when a browser claimed to support it. In
   practice that was the wrong preference: canShare({files}) answering
   "yes" only means the OS CAN pass a file to *something* — on desktop
   Safari/macOS that something is AirDrop, Messages, Notes, whatever
   extensions happen to be installed. X is essentially never among them
   unless the native X app is installed and has registered itself as a
   share target. The user ends up in a share sheet with no path to X at
   all, looking like the button did nothing. The web intent below always
   goes to X specifically, so it's the only route this button takes now.

   window.open() runs synchronously, before any await — canvas.toBlob()
   in the download is genuinely async, and if the tab opened after that
   await it would land outside the click handler's "trusted user
   gesture" window and most browsers silently eat it as a popup.
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
 * Opens the X compose tab with the caption ready, then downloads the card.
 * @returns {Promise<'downloaded'>}
 */
export async function shareToX(cardCanvas, meta){
  const text = caption(meta);

  // Open first, synchronously — see the file header for why.
  openIntent(text);

  // The download gets its own macrotask rather than firing in the same
  // breath as the tab — Safari-family browsers generally permit only ONE
  // "new window or file download" per user gesture, and two actions back
  // to back tend to have the second one silently dropped. Giving it a
  // beat of its own measurably improves the odds both land.
  await delay(300);
  await download(cardCanvas, meta.name);
  return 'downloaded';
}
