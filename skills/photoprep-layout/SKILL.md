---
name: photoprep-layout
description: Frame photos for a portrait-first feed using photoprep's Layout tool - stack two landscapes into one 4:5 frame, slice a wide shot into panorama tiles that scroll as one image across a carousel, or crop a frame to the ratio a platform actually accepts. Use this whenever horizontal photos need to hold their own on Instagram or a similar feed, whenever someone says their landscape shots "look tiny" or "get cropped weirdly", when a panorama should be split across slides, when a carousel is over the slide limit and needs composing rather than cutting, or when exports are the wrong aspect ratio and are being cropped on upload. Exports clean frames at full resolution and never watermarks - that is photoprep-watermark.
---

# Framing photos for a portrait-first feed

Feeds are built for portrait. A 3:2 landscape uploaded as-is renders at roughly half the height of
the frames around it, so a genuinely good horizontal photo gets scrolled past. Layout fixes that
three ways, and choosing between them is the judgement this skill exists for.

```
  STACK      two landscapes  ──►  one 4:5 frame      the default rescue for horizontals
  PANO SPLIT one wide shot   ──►  N × 4:5 tiles      the reader scrolls THROUGH the image, bigger
  CROP       one photo       ──►  the frame ratio    slices = 1; a plain crop with pan and zoom
```

## Picks are not slides

This is the arithmetic people get wrong, and it's why a selection "too big to post" usually isn't.
A **stack** turns 2 picks into 1 slide. A **pano split** turns 1 pick into N. So when a set lands over
the platform's slide limit, count the *slides* before proposing any cuts — pairing the landscapes
frequently solves the count and the too-many-horizontals problem in one move.

## Choosing a treatment

- **Stack two** when neither landscape is strong enough to carry a slide alone, and the pair belongs
  together. **Pair by tone as well as shape**: a dark interior and a bright vista are both landscape
  and still make a bad stack, because the seam reads as an error rather than a composition. Same
  place, same light, same moment — that's a stack.
- **Pano split** a genuinely wide, genuinely strong frame — one where the eye wants to travel. A
  normal 3:2 splits into **2** tiles; only a truly stitched panorama justifies more. Splitting a photo
  that doesn't reward scrolling just spends two slides on one picture.
- **Post solo** when the frame is strong enough that shrinking it is the only cost. Not every
  landscape needs rescuing, and a forced stack is worse than a small photo.
- **Crop to ratio (slices = 1)** for anything the platform would otherwise crop itself. Instagram's
  tallest portrait is 4:5, so a 2:3 export gets cropped on upload — arbitrarily, and possibly through
  a watermark near an edge. **Measure, don't eyeball**: `sips -g pixelWidth -g pixelHeight <file>`,
  and look for width/height ≈ 0.80.

**Verify orientation from pixels before proposing anything.** A tall full-scene shot often "feels"
wide; stacking and splitting only apply to true landscapes, and a wrong call here wastes the
person's time in the tool.

## Sources: use un-watermarked originals

Stacking an already-marked photo bakes a watermark inside a panel, and a pano split of a marked frame
repeats the mark on every tile. Frame the clean file first, mark the finished frame afterwards.

**To tell whether a source is already marked, look at it** — read the file, or a bottom-corner crop,
and see for yourself. Heuristics guess; your eyes don't. If you can't find an un-marked version,
**ask rather than guess** — an unwanted double mark is unfixable without re-exporting.

## Running it

```bash
npx photoprep --no-open --review &     # prints "PORT <n>" then a URL carrying ?t=<token>
```

`--review` turns on the approve / reject / note-back workflow — pass it whenever you are driving the
tool on someone's behalf, since it is the only way their rejections and notes reach you.

Open `<base>/layout/?t=<token>`, wait for `window.__ready === true`, then queue the whole job at once:

```js
await window.__loadCandidates([
  { name: 'ridge-stack', mode: 'stack', panels: { 0: '/work/a.jpg', 1: '/work/b.jpg' } },
  { name: 'bay-pano',    mode: 'split', image: '/work/wide.jpg', n: 2 },
  { name: 'portrait-crop', mode: 'split', image: '/work/tall.jpg', n: 1 },   // n:1 = crop to ratio
]);
window.__setDest('/absolute/output/dir');
```

Better for a whole shoot: `await window.__openFolder('/path/to/shoot')` loads every photo and turns
on writing beside the source, so a batch gathered from several folders doesn't collapse into one.

Then **hand the browser over**. Panning, zooming and where a stack's seam sits are judgement calls
made against real pixels — a hand or a foot is easy to clip, and only the person looking at it knows
what matters in the frame. Queue the work, explain each candidate, and let them compose.

`window.__result` reports `{ mode, saved, out, format, quality, dest, renamed, dims }`.

## Composing aids worth mentioning

- **Overlays** — thirds, grid, golden, diagonal, triangle, spiral. `O` cycles, `Shift+O` rotates. In
  pano mode the overlay applies to the **individual slice**, so each future slide is composed on its
  own. Never exported.
- **Carousel preview** (`▣`) — a fake post you can swipe, with panos expanded into their tiles in
  scroll order. This is the only honest way to judge whether a split lands, because a panorama that
  reads fine as a grid can fall apart as a swipe.

## Export

Full **native source resolution**, never downscaled — the preview is downscaled for smooth panning,
the export is not. JPEG with a quality slider, or PNG for true lossless. Existing files are
auto-renamed (`_1`, `_2`) by default rather than clobbered.

## Then watermark

Layout exports **clean frames by design**. If the result should carry a mark, hand it to
`photoprep-watermark` — and for a pano split, mark **only one tile**, or the panorama reads as a
strip of separate photos rather than one image.

## Clean up

Stop the server (`pkill -f 'photoprep/bin/cli.js'`) and remove staged sources and scratch from
photoprep's user directory. Keep the delivered frames.
