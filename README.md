# Write it in the sand — HH Goa 2026 Builder ID

Format B (Builder ID Card) for the Hacker House Goa 2026 shortlisting task.

You stand on a beach at sunset. As you type, your details appear **scratched
into the wet sand** in front of you. A wave rushes in and takes them. A second
wave comes back — and leaves your builder ID card lying on the sand.

---

## Running it

Pure static files. No build step, no npm, no install, no backend.

```bash
python3 -m http.server 8777
```

Then open <http://localhost:8777>.

---

## How it works

| File | Does |
|---|---|
| `js/art.js` | Vector primitives in the event's illustration style — sun, palms, wave lines, hills. |
| `js/scene.js` | The beach. Canvas 2D at device resolution, parallax layers, the wave and card choreography. |
| `js/card.js` | Draws the shareable PNG on a 2D canvas (1080×1350) and the 1200×630 link-preview variant. |
| `js/imageio.js` | Photo intake: HEIC, EXIF rotation, attention-based square crop. |
| `js/titles.js` | Builder-title generator, seeded by name so a card is reproducible. |
| `js/share.js` | Download + the two routes to X. |
| `js/main.js` | The four acts and all the wiring. |
| `card-test.html` | Dev harness — renders the card in isolation. Not part of the experience. |

### Why it is flat vector, not 3D

The first build put the beach on 3D planes. It looked pixelated, and the
reason is structural: a textured ground plane viewed at a grazing angle
aliases no matter how much you fight it, and procedural shader noise cannot
imitate flat vector art. The event's artwork *is* flat vector, so the scene
is drawn as paths on a Canvas 2D surface at `devicePixelRatio`. It is crisp
at any resolution, and there is nothing left to shimmer.

Depth still reads, from three things: parallax between layers (sky drifts
least, palms most), each act sliding the whole composition vertically — the
flat equivalent of pitching a camera down — and the card squashing up off
the sand to face you. Static layers are cached to offscreen canvases and
blitted with an offset, so a full frame costs almost nothing.

### The writing

Drawn in Caveat, then squashed vertically so it lies on the sand: a light
trench with a brighter lip offset just above it, which reads as carved rather
than painted on. The block auto-scales so its widest line spans the writable
width — a three-letter name owns the sand as much as a long one. The wave's
leading edge drives the dissolve, so the letters go as the foam reaches them
rather than fading out uniformly.

### Handling real photos

The task called out portrait, landscape, off-centre and uncropped inputs.

- **HEIC** — Safari decodes natively. Elsewhere a decoder is lazily fetched
  *only* when a file fails to decode, so the common JPG/PNG path downloads nothing.
- **Rotation** — `createImageBitmap(file, { imageOrientation: 'from-image' })`,
  so phone portraits don't come out sideways.
- **Cropping** — a 64px thumbnail is scored for edge energy and the square is
  centred on that centroid, biased upward on portraits where faces sit high.
  An off-centre subject stays in frame.

---

## Share to X

The brief asks for a pre-filled caption, and for the link preview to show the
real graphic **if you share via link rather than direct image attach**. On
mobile we do the direct attach, so there is no link and no preview to get
wrong — which is why there is no backend.

1. **Mobile share sheet** — `navigator.share({ files })`. The X app opens with
   the PNG genuinely attached and the caption pre-filled. This is the direct
   image attach branch, and it is where nearly all traffic lands.
2. **Download + intent** — desktop only. The PNG saves and the composer opens
   with the caption ready. X's web intent cannot attach an image from a web
   page; no client-side trick changes that, with or without a server.

Route 1 needs a **secure context**, so the site must be served over HTTPS.
Every host below gives you that free.

Caption: `<builder title>. Built for Hacker House Goa 2026. 🌊 #FrameInGoa`

---

## Deploying

It is a folder of static files, so anything works and all of it is free.

**Netlify Drop** — <https://app.netlify.com/drop>. Drag the folder onto the
page. You get an HTTPS URL in about ten seconds, no account, no CLI, no Node.
Easiest path to a shareable link.

**Cloudflare Pages / GitHub Pages / Vercel** — also fine; they just want an
account and a repo first.

Nothing to configure: no build command, no output directory, no env vars.

---

## Notes and limits

- **Timing.** The full sequence is ~9s. It can be skipped with a tap at any
  point, which jumps straight to the finished card.
- **Sequence progress is wall-clock**, not summed frame deltas — a
  backgrounded tab stops firing `requestAnimationFrame`, and delta-summing
  would strand the user mid-animation with no card.
- **No login, no gate, no backend.** One pass, start to finish, and nothing
  to keep running or pay for.
- **Accessibility.** `prefers-reduced-motion` collapses the transitions; the
  acts announce through a live region. The experience is inherently visual,
  but the card itself is a normal downloadable image.
- **Brand.** The palette was sampled from the event's own hero artwork —
  `#036735` green, white sand, `#FEE101` yellow, `#FF0080` pink, `#00301A`
  outlines — with Imbue and Victor Mono for type. Fonts are vendored, so
  there are no runtime CDN dependencies. The only third-party JS is the HEIC
  decoder, and it is fetched lazily — never on the JPG/PNG path. The `गोवा`
  and `2:47 PM Studio` marks are the event's own.
