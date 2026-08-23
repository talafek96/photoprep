# Select — design spec

The third tool, alongside Layout and Watermark. Where those two *transform* images, Select decides
**which images make the cut** — and, more importantly, it is the channel through which a person and an
assistant argue about that decision without either of them writing an essay.

Status: **spec, not yet built.** Ordering is deliberately out of scope here; it is its own tool with
its own document (`docs/order-tool.md`).

## The problem it solves

An assistant proposes a selection out of a large shoot folder. Today the only way it can hand that
over is a folder of copies, and the only way feedback comes back is a per-image boolean plus one free
text note. That is far too thin, and it fails in a specific, repeatable way:

- The person only ever sees what was **kept**. Noticing that a good frame was *cut* requires
  remembering the frame exists — so cuts go unaudited and good images quietly disappear.
- The assistant's reasoning lives in chat prose, far from the pixels, and scrolls away.
- "This whole set is too food-heavy" and "this one specific frame is soft" arrive through the same
  single field, so the assistant has to guess the scope.
- An override carries no signal. The person fixes the selection by hand and nothing is learned, so
  the same mistake returns next session.

Every one of those is a **communication** failure, not a photography failure. Select exists to make
disagreement cheap, precise, and reusable.

## Non-goals

- **Not a culling app.** It is not competing with Photo Mechanic or Lightroom for a 3,000-frame
  wedding. It reviews tens of candidates for one post.
- **No ordering, not even a hint of it.** No slide numbers, no positions, no sequence. That is the
  Order tool's entire job (`docs/order-tool.md`), and it cannot be done honestly here anyway: a slide
  is not a file, since a stack is two sources becoming one slide and a pano split is one source
  becoming several. A position badge on a Select tile would be a lie as soon as either exists. This
  already leaked in once as a `#2` corner badge and was removed.
- **No star ratings, no colour labels.** Narrative Select's own documentation concedes ratings
  "don't carry any inherent meaning"; the best-worst-scaling literature documents scale-region bias
  and annotator drift. For a carousel, the ranking *is* the running order — which is the Order tool's
  job, not this one's.
- **No multi-reviewer machinery.** Threads, @mentions, approval-calculation rules and stage locking
  all exist to reconcile several humans. There is one human.
- **No drawn annotations.** The actionable verbs here are keep / cut / recrop / swap. None of them
  needs an arrow drawn on the image.
- **No trained taste model.** Vendors quote a 2,500–5,000 image floor for personal-style training, and
  taste does not belong in this repo anyway (see the brand-neutrality split in `CLAUDE.md`).

## The four states

Every candidate is in exactly one state, and each has a colour that is legible at a glance across a
full grid.

| State | Colour | Meaning |
|---|---|---|
| **Selected** | 🟢 green | In the post. |
| **Maybe** | 🟠 orange | Unresolved. Not a soft yes and not a soft no — see below. |
| **Rejected** | 🔴 red | Out, deliberately. Carries a reason. |
| **Untouched** | ⚪ grey | Nobody acted on it. The rest of the pool. |

**The whole pool renders, not just the proposal.** The assistant's picks arrive green, its deliberate
cuts arrive red with a reason, and every remaining candidate sits grey. This is the single most
important layout decision in the tool: auditing the rejects has to be as cheap as reviewing the picks,
or the person ends up re-culling everything by hand and the tool is worthless.

### Maybe is a message, not a verdict

**Maybe does not mean "include it" or "exclude it". It means "reconsider this."**

It is how the person hands a frame back to the assistant along with their comments, and the assistant
returns a *revised proposal* rather than shipping or dropping it. A commit containing Maybes is
explicitly an unfinished conversation — the assistant is expected to respond to it, not resolve it
unilaterally.

This makes Maybe the highest-value signal in the tool. "I was unsure, and here's why" carries far more
information than a clean yes or no.

### The confidence machine

Negative feedback demotes; removing it restores; a manual click ends the automation for good.

```
                    negative tag or negative free text
        ┌──────────┐ ──────────────────────────────► ┌──────────┐
        │ SELECTED │                                 │  MAYBE   │
        │  green   │ ◄────────────────────────────── │  orange  │
        └──────────┘   last negative signal removed  └──────────┘
              │                                            │
              └───────── person clicks any state ──────────┘
                                   │
                                   ▼
                       🔒 MANUAL LOCK — automatic
                          transitions never touch
                          this frame again
```

Rules:

1. **Auto-demote applies only to frames the assistant selected.** A negative tag on an already-rejected
   frame changes nothing; it just sharpens the recorded reason.
2. **Symmetry.** Positive tags/text on a frame the assistant *rejected* promote it to Maybe — the
   person is signalling "you were wrong to cut this" without having to fully adopt it yet.
3. **Restoration is exact.** Clearing the last negative signal returns the frame to its pre-demotion
   state, not to a default.
4. **One manual state click locks the frame permanently.** Tag and untag freely afterwards; the
   automation is done with that frame. The lock is **visible on the tile** so it is always obvious
   which states are the person's and which are still automatic.
5. The lock is per-frame and persists for the session's report.

## Feedback: tags propose, prose overrides

**The assistant proposes the tags; the person confirms or overrides.** This is the inversion that
matters. Composing a critique is work; picking one is not. Critique-based recommender research
(Chen & Pu, and the dynamic-critiquing line behind it) consistently finds system-suggested critiques
outperform asking the user to author their own — and Frame.io users spontaneously invent `#hashtag`
vocabularies on top of free text, which is the same finding from the field.

So each tile carries:

- **2–4 candidate chips the assistant thinks are likely** for *that* frame — `near-dup of #3`,
  `soft`, `off-theme`, `weak expression`, `too many like this`, `not cover material`. One click.
- **A free-text box, always available.** Never tags alone: structured codes and prose capture largely
  *different* content, so tags-only loses the substance and prose-only loses comparability between
  sessions. Both, always.
- **A custom chip** the person can type once and reuse across the set, so a repeated complaint doesn't
  need retyping.

### Comment scope

One comment box with a **scope toggle**: *this frame* / *the whole set*, defaulting to frame. Copied
from Frame.io's timestamp toggle, which solves exactly this with one switch rather than two UIs. The
report records `scope` so "too food-heavy" never gets misread as a note about whichever frame happened
to be focused.

## The assistant's reasoning

**Default to no prose at all.** The `class` tag carries the reason nine times out of ten and reads at a
glance. A one-line `why` appears only when the tag genuinely doesn't explain the call, and is
**hard-capped at ~60 characters** so it cannot grow into a paragraph nobody reads.

```
class: "near-dup"   why: "weaker light than #4"     ← earns its line
class: "soft"       why: (none)                     ← tag says it all
```

Rendered as a small corner badge; the sentence sits under the thumbnail, one line, ellipsised.

## Sorting

The sheet's order is a lens, not data. Six of them:

| Sort | Why it exists |
|---|---|
| **My order** | the assistant's sequence — the default, so its reasoning is legible |
| **Name** | original filenames, for cross-referencing against a folder |
| **Date** | capture time from EXIF when the caller supplies it, falling back to file mtime from `/list` |
| **State** | Maybe first, then Keep, Not picked, Cut — the things wanting attention at the top |
| **Your score** | highest first (below) |
| **Group** | near-duplicate clusters together, so a cluster is judged as a cluster |

## Groups, targets and scores

Two ways to say "these belong together, now choose between them".

**A group** is a named cluster. It can come from either side: the assistant sends one per candidate
(`group: 'kasaneiwa-sunset'`), or the person makes their own — ⌘-click to gather frames, ⇧-click for a
range, ⌘A for everything on screen, then name it in the selection bar. Groups appear as chips above the
sheet showing `chosen/total`, and clicking one filters to it. The chip records **who** set the target,
because "I suggest 2" and "you asked me for 2" are different statements.

**A target** turns that into a question: `{ target: 2, mode: 'upto' }` or `{ target: 1, mode: 'exactly' }`
— "out of these six, no more than two" / "out of these three, exactly one". The chip shows `max 2`,
`pick 1`, or `✓ 1` when met, and colours amber under / red over.

**A group the assistant sends MUST be complete.** Every frame that belongs to the group's category
has to be in it, and every candidate should belong to a group. A group presents itself as "here is the
set, choose from it" — so a group holding only the two frames the assistant had already shortlisted is
a lie about what the choice was. That defeats the whole point of the tool, which exists because
pre-filtered proposals hide the frames worth arguing about.

Group by something *complete and checkable*: a location, a subject, a time window. **Never group by
"the ones I was deciding between"** — that shortlist is exactly what the person is meant to audit.
Near-duplicate pairs belong in `alternates` on the pick instead, which is honest about being the
assistant's own A/B.

A cheap assertion before sending: every candidate has a `group`, and each group's size matches the
number of candidates in that category.

**Right-click a group chip** for everything else it can do: filter to it, select all its frames, sort
it by score, set or change its target, rename it, or delete it. Deleting removes only the *grouping* —
the photos stay on the sheet — but it also discards the scores given inside that group, since a score
was a statement about that set and means nothing once the set is gone. That is worth a confirmation,
so it asks before throwing scores away.

**A target is only ever a suggestion.** It never blocks the commit, never caps what can be selected,
and being over it is not an error — the badge simply stops looking met. A hard cap that refuses to
commit would be a dialog standing in front of a judgement call, and the judgement is the person's.
Only a *met* target earns a positive mark; over and under both read as neutral information.

**A frame can belong to several groups at once** — a location and a cross-cutting theme, say — and it
carries a **separate score in each**, because a score is only ever a claim relative to one set. The
same frame can be a 7 among everything shot at Kasaneiwa and a 3 among the best sunsets of the trip;
both are true and neither is the frame's "rating".

Consequences that follow, and that the UI has to honour:
- The tile badge shows the score for **the group currently in view**, with `+n` when others exist.
- Digits score against the group you have filtered to. With no filter and several groups, the panel
  makes you pick which one — otherwise a keypress is ambiguous.
- Sorting by score ranks *inside* the filtered group, or keeps groups together and ranks within each.
- Grouping a selection **adds** a group rather than replacing; Ungroup removes only the one in view.
- Removing a frame from a group drops that group's score with it, since the score was a statement
  about that set and means nothing outside it.

**A score** is 1–10 per frame — a slider in the panel, or just press a digit (`0` is ten, `` ` ``
clears). **The control does not appear for a frame in no group**, because a score with nothing to be
relative to is a number about nothing. The group being scored is **whichever one is filtered**, always
— anything else would mean a digit press sometimes wrote to a group the person was not looking at. It is deliberately *not* a global star rating: the evidence against those (scale-region bias,
annotator drift between sessions) is about absolute quality judgements made in isolation. A score
inside a small group is a different question — "these five are from the same moment, rank them" has a
real answer — and combined with a target it lets the person hand the choice back: *score these six,
keep the top two*.

The score control appears in two places — the side panel and the loupe's note card — painted by one
function from one piece of state, because a frame's quality is judged while looking at it properly,
not from a thumbnail. Inside the loupe the digits are taken by the zoom presets, so there it is a
slider rather than a keypress.

Scores ride in the report **inside their group** — `groups[].ranked` is the ordered list for that
group — which is the only actionable form. A bare cross-group list of numbers is not comparable, so
`window.__scores()` returns them keyed by group too.

## The pool is not closed

What the assistant loads is a *proposal*, and a proposal must never be the boundary of what can be
chosen. The person may know about a frame it never saw — a reference shot to stack against a
recreation, something from a different day, a photo from another shoot entirely.

**`+ add photos`** opens a native folder dialog, lists it, and puts every image on the sheet as
**Not picked** in its own group. Added frames are marked `+ yours`, and the report carries them in an
`added[]` array with their absolute paths, which is what makes them usable downstream.

Files can also be **dragged straight onto the sheet**. A dropped file gives the page bytes and a name
but never a path, so it cannot be referenced later — which makes it a trap rather than a feature
unless something is done about it. Two things are:

1. **It might already be on disk.** Every folder the sheet has seen is remembered, and a dropped file
   is matched against them on name and byte length. A hit means the existing path is adopted and
   **nothing is written** — re-saving a photo the person already owns is exactly the wrong move, and
   it is the common case when someone drags the same reference in twice.
2. **Otherwise, ask.** A native folder dialog opens at `dropDir` (the caller's suggestion, usually the
   shoot folder), and the file is written where the person chose. Asked once per drop, not per file.
   **Where a file lands is never a surprise.**

Dropping while a group is filtered adds the frame to *that* group, so "put this reference alongside
these" is one gesture.

Recovering the path matters more than it looks: candidates arrive as `/file?path=…` urls, so the real
path is parsed back out of the url on load. Without it the sheet knows no folders, and step 1 above
silently never matches.

## Multi-selection

⌘-click gathers frames, ⇧-click takes a range **across what is currently visible** (so a range
respects the active sort and filter), ⌘A takes everything on screen, `esc` clears. ⌘-clicking after a
plain click folds in the frame already focused, as Finder and Lightroom do.

With a selection live, a bar appears offering: group them (with an optional target), keep / maybe /
cut them all, score them all, ungroup. The verdict **keys** apply to the selection too, so ⇧-clicking
a run of near-duplicates and pressing `X` once cuts the run.

The selection mark is the **accent** colour, never a verdict colour — "I have these highlighted" must
not read as "these are keeps".

## Alternates in place

The assistant knows which near-duplicate cluster each pick came from. It ships the losers *with* the
frame, and one keypress cycles them in situ.

This is the highest-quality preference data the system will ever get, at zero extra ceremony: every
swap records `{ chosen: B, assistant_proposed: A }` — a clean pairwise comparison, produced as a side
effect of the person doing normal work. It is far better than synthesising comparison questions to ask;
the RLHF-from-preferences literature finds uncertainty-driven query selection can actively *hurt*, so
questions that fall out of the edit beat questions invented to interrogate.

Tiles with alternates show a count badge (`1/3`). `[` and `]` cycle.

## Fullscreen loupe

Non-negotiable, and the assistant needs it as much as the person does — judging a 92-frame set from
640px thumbnails is how good frames get mis-ranked in the first place.

- `Space` or click the thumbnail → fullscreen, fit-to-window.
- Scroll / pinch to zoom, drag to pan, `0` resets, `1` jumps to 100%.
- `←` `→` move between frames **without leaving fullscreen** — state and tags stay editable there.
- `Esc` back to the grid, scrolled to the frame you were on.

## Keyboard

Stolen wholesale so there is nothing to learn. Speed here comes from *no render delay*, not clever UI —
Photo Mechanic's legendary responsiveness is preloading plus key-repeat, so the next and previous
full-size images are always preloaded.

| Key | Action |
|---|---|
| `P` | Selected |
| `M` | Maybe |
| `X` | Rejected |
| `U` | back to Untouched |
| `Space` | fullscreen loupe |
| `←` `→` | previous / next frame |
| `[` `]` | cycle alternates |
| `C` | focus the comment box |
| `F` | cycle filter (all / selected / maybe / rejected / untouched) |
| `Enter` | commit |

## Filters

A bar across the top: `all · selected · maybe · rejected · untouched · has-comment · has-alternates`,
each with a live count. Auditing the cuts must be **one keypress**.

## Automation surface

Consistent with the other tools (`__ready`, `__result`, …):

```js
window.__loadSelection({
  candidates: [
    { id, name, url,
      verdict: 'selected' | 'rejected' | 'untouched',
      class:   'near-dup' | 'soft' | 'off-theme' | ... ,   // optional
      why:     'weaker light than #4',                      // optional, <= 60 chars
      chips:   ['near-dup of #3', 'too many like this'],    // assistant-proposed critiques
      alternates: [{ id, name, url }],                      // the cluster losers
      confidence: 0.6                                       // optional; marks a 60/40 call
    }
  ],
  setPrompt: 'Nine slides, one day. Cuts are mostly near-duplicates.'
})

window.__result  // → see below
```

## Surviving a reload

A review is a long sitting, and losing it to a refresh, a crash or the local server restarting is not
an acceptable failure — all three happen. The whole session is mirrored to `localStorage` on every
change and restored on boot: the spec that was loaded, plus every verdict, tag, note, score, group,
lock and alternate swap made since, along with the active filter and sort.

The page restores **on its own**, without the assistant re-sending anything — which matters, because
the assistant may not be around when the person hits reload.

`__clearSaved()` throws the saved review away.

## The report

```jsonc
{
  "proposed":  { "selected": ["a","b"], "rejected": ["c"], "untouched": ["d"] },
  "final":     { "selected": ["a","d"], "maybe": ["b"], "rejected": ["c"] },
  "diff": {
    "added":    ["d"],                       // person pulled it in
    "removed":  [],
    "demoted":  [{ "id": "b", "to": "maybe", "cause": "tag:too-many-like-this" }],
    "swapped":  [{ "slot": "a", "chosen": "a2", "proposed": "a" }]
  },
  "setComment": "too food-heavy, and stop preferring the wide over the vertical",
  "frames": {
    "b": { "tags": ["too many like this"], "text": "", "locked": false },
    "d": { "tags": ["you missed this"],    "text": "best frame at this stop", "locked": true }
  }
}
```

The **diff is the product**. An override is feedback; the person should never have to also explain it
in prose.

A copy lands in the feedback directory under `--review`, as Layout and Watermark already do, so it
survives the page being closed.

## Learning loop

The consuming project (for this repo's primary user, `insta-buddy`) appends each report to a
`selection-choices.jsonl`, mirroring the existing watermark learning log, and distils repeated
same-direction signals into durable rules. The rule grammar borrows Aftershoot's Adjust-Profile
semantics, which is the clearest UX answer to "correct an AI's taste without retraining it":

- **always-offset** — "crop 5% tighter than proposed"
- **fixed** — "never a food frame in slot 1"
- **disabled** — "stop suggesting stacking for street landscapes"

Three rounds of the same correction should end with the assistant never making that proposal again,
without a fourth round of being told.

## Prior art

| Borrowed | From | What specifically |
|---|---|---|
| Explanations that are *relative*, hover-short / click-long | Narrative Select | Its hexagons say "there are better images in this scene", not "this image is bad" |
| Named reject buckets so nothing vanishes | Aftershoot | Duplicates / Closed Eyes / Blurry / Warnings — "you won't miss a single image" |
| Scope toggle in one box | Frame.io | The timestamp toggle: general comment vs anchored, one switch |
| Verdicts richer than yes/no | Ziflow | "Approved with changes" = minor fix, don't resend |
| Notes hanging off a curated pick | Pixieset | Favourite lists with per-favourite notes and a selection limit |
| System-suggested critiques | Chen & Pu (UMUAI 2012), dynamic critiquing | The system proposes the critique; the user picks |
| Tags **and** prose, never one alone | Seinen et al. (JMIR 2025) | Structured codes and free text capture mostly different content |
| Preloading as the actual speed mechanism | Photo Mechanic | No render delay; hold-the-arrow navigation |
| Rule-layer taste correction | Aftershoot Adjust Profile | AI-correction / fixed / disabled per parameter |

## Build order

1. Grid with all four states, the whole pool visible, filters and counts.
2. Fullscreen loupe with zoom/pan.
3. Tags + free text + scope toggle.
4. Confidence machine with the manual lock.
5. Alternates cycling.
6. Report + diff + feedback-dir copy.
