# Order — design spec

The fourth tool. Select decides **which** frames are in; Order decides **what sequence they appear in
and what shape each slide takes**. They are deliberately separate: selecting wants a grid and a
yes/no reflex, sequencing wants a filmstrip you drag. Lightroom split Survey from Compare for the same
reason.

Status: **spec, not yet built.** Select shipped in 0.4.0; this is next.

Tal's framing, 2026-08-23: *"similarly to the selector tool, we can work together on arranging the
selected photos into posts — which should be stacked on top of each other, who on top of who, in
which order, which gets pano splitted — the kind of thing you would do before actually asking me to
do the actual layout step. Kind of planning-before-action."* So Order produces **the plan that
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

Order is entered **on demand**, and the tooling should say when it is worth entering:

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

## Open questions

- **Does the assistant propose an order at all when it has no strong opinion**, or hand over an
  unordered tray? A weak proposal may anchor the person unhelpfully; an empty tray may just be work.
- **Should composite proposals be pre-applied or pre-*offered*?** Dashed-and-applied is fewer clicks;
  offered-but-not-applied is more honest about what the assistant actually decided.
- **Do rejected slides go back to Select**, reopening that pass, or are they simply dropped with the
  reason recorded? The first is more correct and more disruptive.
