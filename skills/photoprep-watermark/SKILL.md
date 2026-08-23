---
name: photoprep-watermark
description: Batch-watermark photos with photoprep's Watermark tool - load a queue, get a live preview and independent placement per image, then export at full source resolution. Use this whenever someone wants their logo or mark added to photos before posting, asks to "watermark these", "add my logo", "brand these shots", "sign my photos", wants a mark placed consistently across a shoot, or has freshly composed frames that need marking before upload. Also use it as a safety net to check whether frames that should carry a mark actually do. It owns marking only - stacking, panorama splits and cropping are photoprep-layout.
---

# Watermarking a batch

Watermarking is mechanically simple and easy to get wrong in ways that are expensive to undo: a
double mark, a mark cropped off by the platform, a mark that vanishes into a bright sky, or the same
logo repeated across every tile of what was supposed to read as one panorama. This skill is mostly
about avoiding those.

## Decide before you open the tool

**Should these be marked at all?** A person's own work usually yes; content posted in someone else's
voice — a collaboration, a repost, a client's asset — usually not. Ask if it isn't obvious; marking
someone else's post is a real embarrassment.

**Is it already marked?** **Look at the image to find out.** Read the file, or crop a bottom corner
and read that, and see the mark for yourself. Edge-detection heuristics — including the tool's own ⚠︎
hint — guess, and a double mark cannot be removed afterwards. Set an already-marked image's mark to
**None** rather than adding a second.

Many people export twice: clean originals in one folder, marked copies in a subfolder beside them.
Feed this tool the **clean** ones. **If you can't find an un-marked version, ask** — don't guess.

**A panorama split gets ONE mark.** A wide photo sliced across several slides is *one image*, so
repeating the mark on every tile advertises that it was cut up. Set every tile to **None** except one
— the last tile, bottom-right, unless that corner is bright or busy. Stacks and solo frames each get
their own single mark.

**Crop to the platform's ratio BEFORE marking, not after.** If a frame is taller than the platform
accepts, the platform crops it on upload — arbitrarily, and possibly straight through the mark you
just placed. Measure (`sips -g pixelWidth -g pixelHeight`), and send anything out of ratio through
`photoprep-layout` first.

## Running it

```bash
npx photoprep --no-open --review &     # prints "PORT <n>" then a URL carrying ?t=<token>
```

`--review` reports the person's approvals, rejections and notes back to you — pass it whenever you're
driving on their behalf.

Bring your own marks rather than the bundled samples:

```bash
npx photoprep --config /path/to/watermarks.json --assets /path/to/assets
```

`--assets` points at the **parent** of the folder the config's `basePath` names. Keeping a brand in
its own repository and injecting it this way means the tool stays brand-neutral and the marks stay
versioned wherever they belong.

Open `<base>/watermark/?t=<token>` and wait for `window.__ready === true` (and
`window.__configLoaded === true` if you passed a config).

**Prefer opening the folder over staging copies:**

```js
await window.__openFolder('/path/to/shoot');   // loads every photo; exports land beside the source
```

This matches how people already organise a shoot, and avoids copying full-resolution files anywhere.
A dropped file carries no path — a drop gives the page bytes and a name, never a location — so only
an *opened* folder can export beside its originals.

Otherwise, queue explicitly:

```js
await window.__addImages([{ id: 'a', name: 'a.jpg', url: '/work/a.jpg',
  suggest: { on: true, id: 'my-mark', anchor: 'br', sizePct: 25, op: 0.55 } }]);
window.__setDest('/absolute/output/dir');
```

## Sizing behaves like Lightroom

Marks are auto-trimmed of transparent padding on load, so **`sizePct` is the visible logo's width as
a percentage of the image width**, and inset is measured from the logo's real edge. Without trimming,
a PNG with a 30% transparent margin renders "25%" as a much smaller, corner-shy mark than asked for —
which is exactly the confusing result the trim exists to prevent.

## Let the person review

Open with your best suggestion already applied, then hand it over. They step through the queue,
drag marks (which snap), adjust anchor, inset, size and opacity, use ◐ to auto-pick by contrast
against the patch the mark actually sits on, and "⇊ Apply this placement to all" to propagate.

**Don't silently finalise a batch.** Placement depends on what's underneath the mark in each frame,
which is precisely the thing only a person looking at it can judge.

On export, `window.__result` gives `{ items: [{ id, src, mark, on, saved, changed, deltas, dup,
comment, approved }], format }`. `changed` and `deltas` record how their final choice differed from
your suggestion — worth logging, because repeated nudges in the same direction are a better default
than the one you started with.

## Quality

Every image exports at its **own native resolution** — never downscaled. Format follows the source:
JPEG at q95 (visually lossless) by default, PNG when true lossless matters. Feed originals, not
resized copies.

## Clean up

Stop the server (`pkill -f 'photoprep/bin/cli.js'`) and clear staged sources and scratch from
photoprep's user directory. Keep the delivered files and any learning log you're maintaining.
