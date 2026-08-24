---
name: photoprep-sort
description: Arrange already-chosen photos into the running order of a post - what opens, what closes, which landscapes pair into one frame, which wide shot scrolls as a panorama - by putting a proposed sequence in front of the person to drag, overturn and comment on. Use this whenever the photos are picked but the order is not: "what order should these go in", "arrange these into a post", "which one should be the cover", "these are all landscapes, how do I post them", "is this too many slides for one carousel", or right after a selection is finished. It produces the PLAN a framing tool then executes - pairings, stacking order, sequence, slice counts - so reach for it before any stacking or splitting is actually built. This decides SEQUENCE and SHAPE; choosing the photos is photoprep-select and building the frames is photoprep-layout.
---

# Arranging chosen photos into a post

A carousel is a little story, not a pile. The opener decides whether anyone swipes at all, the closer
decides what they remember, and the shape of each slide decides whether a photo lands or renders as a
postage stamp. Those are judgement calls that belong to the person whose photos they are — and they
are also tedious, which is why they asked.

So the job is the same as selecting: **propose, and make disagreeing cheap.** photoprep's Sort tool
shows the whole sequence as a board, with your reason on each slide, and hands back what they changed.

> Sequencing only. Sort decides pairings, order and slice counts. It does not crop, pan, zoom or
> export — that is `photoprep-layout`, where the framing is chosen against the real pixels. Planning
> and building are separate on purpose: it is much cheaper to overturn a pairing on a board than
> after someone has hand-framed it.

## A slide is not a file

This is the one thing to get right, because everything downstream follows from it:

```
  solo    one source  →  one slide
  stack   two sources →  one slide     (A over B, composed into a single 4:5 frame)
  split   one source  →  N slides      (a wide photo sliced into tiles that scroll as a panorama)
```

Two consequences that trip people up constantly:

- **Picks are not slides.** Twenty-four chosen frames with eight landscapes is not "four over the
  limit" — pair those landscapes and it is eighteen slides. Composing beats cutting, and it is the
  first thing to reach for when a set is over Instagram's twenty.
- **A split group is atomic.** Its tiles must stay adjacent and in order or the panorama stops
  reading as one photograph. The tool enforces this; do not try to model it as N separate slides.

## Before you propose anything

**Measure orientation from pixels, never by eye** — `sips -g pixelWidth -g pixelHeight <file>` on
macOS, `identify -format '%wx%h'` elsewhere. A tall full-scene shot frequently "feels" wide, and
orientation decides what can stack and what can split. Guessing it from a filename or a thumbnail is
how a portrait ends up proposed as half of a stack.

Look at the frames too. Pairing two landscapes into one 4:5 is a decision about **tone and subject**,
not just shape: two wides of the same walk belong together; a bright beach over a dark interior reads
as a mistake.

## Start the tool

```bash
npx photoprep --no-open --review &      # prints "PORT <n>" then a URL carrying ?t=<token>
```

`--review` is what makes their notes come back to you; without it the tool reports nothing. Open
`<base>/sort/?t=<token>` and wait for `window.__ready === true`.

**Serve photos from where they live.** `fetch('/list?dir=<absolute dir>')` lists a folder and marks it
readable, after which each file is at `/file?path=<url-encoded absolute path>`. Don't copy
full-resolution originals into a staging folder.

For a quick manual run with no proposal, `photoprep sort <folder>` opens straight onto a folder in
file order, unarranged.

## Build the proposal

```js
window.__loadOrder({
  setPrompt: 'One day on the island. 13 frames, 9 slides as proposed. Sunset closes.',
  slides: [
    { kind: 'solo',  sources: ['p_1815.jpg'],
      why: 'strongest portrait - it sets the day' },
    { kind: 'stack', sources: ['1007.jpg', '1010.jpg'],
      why: 'two wides of the same walk, better together', proposed: true },
    { kind: 'split', sources: ['1640.jpg'], n: 2,
      why: 'wide enough to scroll as a panorama', proposed: true },
  ],
  // sources may be listed once up front and referenced by id, or written inline on the slide
  sources: [
    { id: 'p_1815.jpg', name: '1815', url: '/file?path=' + encodeURIComponent(abs), group: 'ridge' },
  ],
});
```

| Field | Why it matters |
|---|---|
| `kind` + `sources` | the relationship, not just the files — `stack` takes exactly two, `split` exactly one |
| `n` | slices for a split (2–5). A normal 3:2 gives **2**; only a genuinely stitched panorama wants more |
| `why` | ONE line, capped at 70 chars, shown on the card |
| `proposed: true` | renders the card **dashed** and awaits a ruling |
| `group` on a source | frames from the same cluster; the tool flags two of them sitting adjacent |

### The rules the tool is built around

1. **Propose a real order, with a reason on every slide.** An unordered tray is not neutrality, it is
   handing back the work they asked you to do. If you have no opinion on the middle of a post, say so
   in `setPrompt` — but still put the strongest frame first and the closer last.
2. **Mark every structural decision `proposed: true`.** A stack or a split is a claim you are making
   about their photographs. Dashed means "I decided this, overturn me"; solid means settled. A
   composite that arrives solid is a decision smuggled past them.
3. **`why` is a reason, not a caption.** They can see the photo. "breaks up three portraits" earns
   its line; "sunset over the sea" wastes it.
4. **Never propose past the limit and hope.** Instagram takes 20 slides. Count before you load — a
   split of 4 costs four of them — and if you are over, propose the pairings that bring it under
   rather than dropping frames on your own.
5. **The cover is not just position 1.** It is the only slide most people ever see, it reads larger
   in the grid when it is portrait, and it should establish what the post is about. Choose it
   deliberately and say why.

## Hand over, and then stop

Say what they are looking at — how many slides, which decisions are still dashed, what the tool
flagged — and then wait. **Don't drive the page while they are in it.** Synthetic keystrokes hit real
bindings, and `Enter` ends the pass.

Worth telling them once: dragging does everything, and where you drop decides what it means — a
card's left or right **edge** puts the frame there in the order, its **middle** stacks the two, and
how high up you are picks which of the pair ends on top. `Space` opens the slide big — composed, so
a stack shows its seam and a split shows its real tiles — and the arrows walk the sequence from
there. `1` sends a slide to the cover, `S` stacks with the next, `/` splits, `V` opens a fake
Instagram carousel, and `Z` undoes.

The carousel preview is the part worth pointing at. A board tells you what is in the post; only a
swipe tells you how it reads, and it is the only honest way to judge whether a panorama split lands.

## Read the result

On commit `window.__result` is populated, and under `--review` the same JSON lands in `feedback/` in
photoprep's user directory, so it survives the page being closed.

| Field | What it tells you |
|---|---|
| `plan[]` | **what to build** — one entry per Instagram slide, in posting order |
| `diff.moved` | slides they actually reordered (a true move, not everything that shifted) |
| `diff.composites` | a stack or split they changed, with `was` / `now` and the cause |
| `takenOut[]` | frames they pulled out of the post, with their reason |
| `slides[id]` | tags and comments on one slide |
| `setComment` | the critique of the sequence as a whole |
| `slideCount` / `overLimit` | what the post actually costs |

Three things worth handling deliberately:

- **`setComment` carries the best feedback**, because ordering critiques are almost always about
  *relationships* — "don't put the two sea views together", "too many food slides in a row". Respond
  to the relationship; don't apply the note to one slide.
- **`takenOut` is feedback about the selection, not a re-selection.** The choosing pass stays
  committed. Report what came out and why, and let them decide whether the selection should reopen.
- **A changed composite is the most useful line in the report.** It says the same photographs,
  arranged differently — which is exactly where your taste was wrong.

## Then build it

`plan[]` is the input to `photoprep-layout`: each `stack` entry names the top and bottom source, each
`split` entry names the photo and its tile count, each `solo` passes through untouched. Build in slot
order so the exported filenames sort into the sequence that was approved.

## Clean up

Stop the server (`pkill -f 'photoprep/bin/cli.js'`) and delete any scratch payload. Keep the feedback
JSON — it is the record of the order they actually approved.
