# Sort — design spec

The fourth tool. Select decides **which** frames are in; Sort decides **what sequence they appear in
and what shape each slide takes**. They are deliberately separate: selecting wants a grid and a
yes/no reflex, sequencing wants a filmstrip you drag. Lightroom split Survey from Compare for the same
reason.

Status: **built** — `web/sort/index.html`, shipped in 0.6.0. This document is both the spec and the
record of what was decided; the "Open questions" at the bottom are now answered, in place.

(It was called the Order tool while it was a spec. Renamed to **Sort** on the way in: "order" is both
a verb and a noun and collides with the report's own `order` field, and the CLI reads better as
`photoprep sort <folder>`.)

Framing that started it, 2026-08-23: *"similarly to the selector tool, we can work together on arranging the
selected photos into posts — which should be stacked on top of each other, who on top of who, in
which order, which gets pano splitted — the kind of thing you would do before actually asking me to
do the actual layout step. Kind of planning-before-action."* So Sort produces **the plan that
`layout` then executes**. It decides pairings, stacking order within a pair, sequence and split
counts; it does not do the framing, the pan/zoom or the export — those stay in `layout`, where the
crop is chosen against the real pixels.

## Why this is not a sortable list

The naive model — "an ordered array of files" — is wrong, and it is wrong in a way that breaks the
moment real work hits it. **A slide is not a file.** Three relationships exist:

```
  SOLO      one source  ─────────────►  one slide

  STACK     two sources ─────────────►  one slide
            ┌────────┐
            │   A    │      A over B, composed into a single 4:5 frame
            ├────────┤
            │   B    │
            └────────┘

  SPLIT     one source  ─────────────►  N slides
            ┌──────────────────────┐
            │      wide pano       │   sliced into tiles that must stay
            └──────────────────────┘   adjacent and in order, or the
              ↓        ↓        ↓      panorama stops reading as one image
            slide    slide    slide
```

So the ordering model is a list of **slides**, where a slide references one or more sources, and a
source may produce one or more slides. Consequences that must be designed for, not patched later:

- **A split group is atomic.** Dragging any tile moves the whole group. Tiles cannot be reordered
  *within* the group — that would scramble the panorama. They cannot be separated by another slide.
- **Composite decisions are themselves proposals** the person must be able to approve or overturn.
  "These two landscapes should be stacked" and "this wide shot should become two tiles" are
  suggestions with the same standing as "this should be slide 3", and they need the same
  accept / change / comment affordances.
- **Changing a composite changes the slide count**, which can push the post over Instagram's 20-slide
  limit. The tool must show that immediately rather than failing at export.
- **Slot 1 is special.** The cover is the only slide most people ever see. It has its own constraints
  (portrait reads larger in-feed; it should establish the theme) and deserves distinct visual
  treatment, not just "position 1".

## Non-goals

- Not a selection tool. Frames arrive already chosen. Removing one here is possible but is recorded as
  *feedback about the selection*, handed back rather than silently applied.
- No transitions, music, or video sequencing.
- No auto-ordering "optimiser". The assistant proposes an order with reasons; the person decides.
  A black-box shuffle button is unauditable and would not be trusted.

## When it runs

**Not every time.** Most sets have an obvious opener and closer and a middle that barely matters —
forcing a sequencing pass through those is friction for no gain.

Sort is entered **on demand**, and the tooling should say when it is worth entering:

- several frames are near-equally strong candidates for slot 1;
- the proposed order and the person's selection diverge a lot;
- the set contains composites, since those are the decisions most worth eyeballing;
- the person just asks.

Otherwise the assistant proposes a running order in prose, the person accepts, and no tool opens.

## Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  SET COMMENT                                  12 / 20 slides    ⚠ 4:5│
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┏━━━━━━━┓   ┌─────┐   ┌═════════════════┐   ┌─────┐   ┌─────┐     │
│   ┃ COVER ┃   │  2  │   ┃ 3 ─── 4  SPLIT ┃   │  5  │   │  6  │     │
│   ┃   1   ┃   │     │   ┃  ◄── atomic ──► ┃   │STACK│   │     │     │
│   ┗━━━━━━━┛   └─────┘   └═════════════════┘   └─────┘   └─────┘     │
│    portrait    solo       one pano, 2 tiles    A over B   solo       │
│                                                                      │
│         ▲ drag anywhere. split groups move as one.                   │
├──────────────────────────────────────────────────────────────────────┤
│  ▣ Preview as Instagram carousel        ↕ swap   ✂ unstack   ⧉ split │
└──────────────────────────────────────────────────────────────────────┘
```

**Everything is drag-first.** Dragging is the primary verb: reorder by dragging a slide, build a stack
by dragging one landscape onto another, break one by dragging its lower panel out. Buttons exist for
every drag action as a fallback, but the drag is the design.

### Slide cards

Each card shows the frame, its slot number, and its shape. Shape is communicated **structurally**, not
with a text label:

- **Solo** — a plain card.
- **Stack** — a card with a visible horizontal seam and both panels rendered. Dragging the seam adjusts
  the split point; dragging a panel out dissolves the stack back into two solo slides.
- **Split group** — cards joined by a continuous bracket, rendered as one wide image sliced across
  them, so it is immediately obvious they are one photograph. A slice count control (`2 · 3 · 4 · 5`)
  lives on the bracket.
- **Cover** — slot 1 gets a heavier frame and a label, because it is categorically different.

### Composite proposals

A composite the assistant proposed but the person has not yet ruled on renders **dashed**. Approving it
makes it solid. This means the person can see at a glance which structural decisions are still open,
which is the thing that is currently invisible.

Rejecting a composite offers the alternatives inline rather than just undoing: *stack with a different
partner* · *post solo* · *split into N instead*.

### Warnings, inline

- **Slide count** against the 20 limit, live, since composites change it.
- **Aspect** — any slide not yet 4:5 flagged, because Instagram will crop it arbitrarily otherwise.
- **Cover shape** — a landscape in slot 1 is flagged, not forbidden.
- **Adjacent near-duplicates** — two frames from the same cluster sitting next to each other, which is
  the most common ordering mistake.

None of these block export. They are advice with a visible reason, dismissible per-slide.

## Reasoning and comments

Same discipline as Select: **the tag carries the reason; prose only when the tag can't.** One line,
hard-capped, ellipsised. Every slide can carry the assistant's one-line rationale (`opens strong`,
`breaks up three portraits`, `closes on the best frame`) and the person's own comment.

Comment scope toggles between **this slide** and **the whole sequence**, exactly as in Select.

Set-level comments are where the genuinely useful ordering feedback lives — "too many food slides in a
row", "don't put the two sea views together", "the sunset should close" — because ordering critiques
are usually about *relationships*, not individual slides.

## Carousel preview

Reuse the existing Layout preview: a fake Instagram post, swipeable, with the split groups expanded
into their tiles in scroll order. This is the only honest way to judge whether a panorama split lands,
and the only way to feel the rhythm of the sequence rather than reading it as a grid.

`▣` toggles it; arrow keys and drag both work.

## Keyboard

| Key | Action |
|---|---|
| `←` `→` | move selection |
| `⌥←` `⌥→` | move the selected slide in the order |
| `1` | send to cover |
| `S` | stack with the next slide |
| `⇧S` | unstack |
| `/` | split into tiles (then `2`–`5` for count) |
| `C` | comment |
| `▣` / `V` | carousel preview |
| `Enter` | commit |

## Automation surface

```js
window.__loadOrder({
  slides: [
    { id: 's1', kind: 'solo',  sources: ['a'],      why: 'strongest frame, portrait' },
    { id: 's2', kind: 'stack', sources: ['b','c'],  why: 'two weak landscapes, better together',
      proposed: true },
    { id: 's3', kind: 'split', sources: ['d'], n: 2, why: 'wide enough to scroll',
      proposed: true }
  ],
  setPrompt: 'One day, 12 slides. Sunset closes.'
})
```

`proposed: true` renders dashed and awaits a ruling.

## The report

```jsonc
{
  "proposed": [ { "kind": "solo", "sources": ["a"] },
                { "kind": "stack", "sources": ["b","c"] } ],
  "final":    [ { "kind": "solo", "sources": ["a"] },
                { "kind": "solo", "sources": ["b"] },
                { "kind": "solo", "sources": ["c"] } ],
  "diff": {
    "moved":      [ { "id": "s4", "from": 4, "to": 2 } ],
    "composites": [ { "id": "s2", "was": "stack", "now": "solo×2",
                      "cause": "comment:they don't belong together" } ],
    "removed":    [ { "id": "s7", "cause": "tag:weak-frame" } ]
  },
  "setComment": "don't put the two sea views next to each other",
  "slides": { "s4": { "tags": ["wrong slot"], "text": "this should close" } }
}
```

Following `git range-diff`'s notation, the commit view shows two columns — proposed order on the left,
final on the right, position numbers on both sides, one glyph between: `=` unchanged, `↕` moved, `+`
added, `−` removed, `≠` composite changed. **A move gets its own colour class, not a delete plus an
add** — `--color-moved` exists because otherwise a reordering diff drowns in false churn.

## Prior art

| Borrowed | From | What specifically |
|---|---|---|
| Ordered-list diff notation | `git range-diff` | `left-pos glyph right-pos`, dual colouring |
| Moves as their own visual class | `git diff --color-moved=zebra` | A move is not delete+add |
| Survey vs Compare as separate modes | Lightroom Classic | Sequencing and judging want different ergonomics |
| Feel the sequence, don't read it | Layout's existing IG preview | Swipeable fake post, panos expanded |
| Scope toggle | Frame.io | Slide comment vs sequence comment, one switch |

## Decisions that were open, and how they were settled

- **Does the assistant propose an order at all when it has no strong opinion?** It always proposes.
  An unordered tray is not neutrality — it hands back the work that was asked for. The anchoring risk
  is real, and it is answered by *dashed* composites and a one-line reason on every slide rather than
  by withholding a sequence: it is much easier to argue with a claim than with an empty board.
- **Pre-applied or pre-offered composites?** Pre-applied, dashed until ruled on. Offered-but-not-built
  means the slide count and the visual rhythm are both wrong until every proposal is accepted — and
  the slide count is precisely the number that decides whether the post fits. Dashed carries the
  honesty that "offered" was meant to carry, without lying about the shape of the post.
- **Do rejected slides go back to Select?** No. They land on a shelf with the reason attached, and the
  reason is reported as feedback *about* the selection. Reopening the selection pass mid-sequence
  pulls the person out of the mode they are in — judging and sequencing want different heads — and
  the correct-but-disruptive option was the worse trade.

## What shipped, where it differs from the drawing above

- **A split group is ONE card containing N tiles**, not N cards under a bracket. Atomicity then needs
  no enforcement — there is nothing to drag apart — and each tile still carries its own slot number,
  so the Instagram positions stay visible. The tiles render the real slices of the real photograph,
  which is the only way to see whether the panorama reads.
- **The board wraps** rather than scrolling as one row. Twenty slides in a single row means the ending
  is off-screen while you judge the opening, and feeling the whole sequence at once is the point.
- **Moves are computed by longest common subsequence.** Comparing raw positions reports every slide
  after a change as "moved", which is the exact false churn `git diff --color-moved` exists to avoid.
  The LCS is what stayed put; everything else genuinely moved.
- **Drag onto the middle of a card to stack**, with a short hold and a visible target before it arms.
  Reordering and stacking are different verbs on the same gesture, so the tool says which one it is
  about to do before you let go, and only offers the stack when the pair could actually become one
  4:5 frame.
- **Solo frames sit at their real aspect inside the 4:5 slot**, letterboxed. A landscape therefore
  *looks* small on the board — which is the truth about how it will look in the feed, and the reason
  to stack it. That was worth more than a tidy grid of equal rectangles.
