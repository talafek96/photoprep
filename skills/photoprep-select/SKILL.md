---
name: photoprep-select
description: Narrow a folder of photos down to the ones worth posting by putting a reviewable proposal in front of the person - every frame you looked at, what you'd keep, what you'd cut and a one-line reason for each - then read back their verdicts, notes and scores. Use this whenever someone hands over a batch of photos and wants the good ones picked out: "which of these should I post", "pick the best shots", "I have 200 photos from this trip", "too many near-identical frames", "help me choose between these", "cull these", "split this dump into separate posts". Reach for it instead of listing filenames in chat, and reach for it again when they push back on a selection you made. This decides WHICH photos; framing and watermarking are photoprep-layout and photoprep-watermark.
---

# Choosing which photos make the cut

Selecting photos is a judgement call that belongs to the person whose photos they are — but it is
also tedious, which is why they asked. The way to be useful is not to decide for them and not to make
them decide alone: **propose, and make disagreeing cheap.**

A list of filenames in chat can't be argued with. photoprep's Select tool shows every frame you
looked at — kept and cut alike — with your reason on each, and hands back what they changed. That
diff is the point: it tells you where your taste was wrong, so the next proposal is better.

> Selection only. This tool has no notion of ordering, deliberately — sequencing wants a board you
> drag, judging wants a grid and a yes/no reflex, and mixing them makes both worse. Ordering is
> `photoprep-sort`.

## Look at every frame before you propose anything

You cannot justify a cut you haven't seen. Originals are large, so downscale into a throwaway folder
and view those:

```bash
mkdir -p /tmp/thumbs && for f in "<dir>"/*.jpg; do sips -Z 900 "$f" --out "/tmp/thumbs/$(basename "$f")"; done
```

(`sips` ships with macOS; `magick "$f" -resize 900x900 …` elsewhere.)

Then **re-open your shortlist at full size before ranking it.** Frames that look interchangeable at
thumbnail size often aren't, and a ranking made at 640px will be wrong in ways you can't see.

Check orientation from pixels rather than by eye — `sips -g pixelWidth -g pixelHeight <file>` — since
a tall full-scene shot frequently "feels" wide, and it decides what's possible later.

## Start the tool

```bash
npx photoprep --no-open --review &      # prints "PORT <n>" then a URL carrying ?t=<token>
```

`--review` is what makes the person's notes come back to you; without it the tool reports nothing.
Open `<base>/select/?t=<token>` in a browser and wait for `window.__ready === true`.

**Serve photos from where they live.** `fetch('/list?dir=<absolute dir>')` lists a folder and marks
it readable, after which each file is available at `/file?path=<url-encoded absolute path>`. Copying
full-resolution originals into a staging folder is slow and leaves litter.

For a quick manual run with no proposal at all, `photoprep select <folder>` opens straight onto a
folder with everything as *not picked*.

## Build the proposal

```js
window.__loadSelection({
  setPrompt: '46 frames from four locations, 20 picked. Targets are suggestions only.',
  groups: {
    'harbour': { label: 'Harbour', target: 3, mode: 'upto' },     // mode: 'upto' | 'exactly'
    'ridge':   { label: 'Ridge',   target: 5, mode: 'upto' },
  },
  candidates: [{
    id:    'DSC_0421.jpg',                 // stable and unique; ids come back in the report
    name:  '0421',                         // short label on the tile
    url:   '/file?path=' + encodeURIComponent(absolutePath),
    group: 'harbour',                      // or groups: ['harbour','blue-hour'] for several
    date:  1701504444000,                  // file mtime, so "sort by date" is the real shoot order
    verdict: 'selected',                   // 'selected' | 'rejected' | 'untouched'
    why:   '≈ 0419, better light on the hull',   // ONE line, capped at 60 chars
    alternates: [{ id: 'DSC_0419.jpg', name: '0419', url: '…' }],
    chips: [                               // optional; sensible defaults otherwise
      { id:'near-dup', t:'near-duplicate', sign:-1 },
      { id:'love-it',  t:'love this one',  sign:+1 },
    ],
  }],
});
```

Large payloads are better written to a file and evaluated from there than inlined as a huge string.

### The rules the tool is built around

Break these and the feedback quietly stops being useful — nothing fails loudly.

1. **Send the whole set, not your shortlist.** Every frame you looked at, and every group complete: a
   group labelled "Harbour" holds all 14 harbour frames, not the 3 you were torn between. A person
   cannot overrule a decision they cannot see, and pre-narrowing turns their choice back into your
   decision. Before sending, assert that every candidate has a group and each group's count matches
   the real number in that category.
2. **Never send `maybe` yourself.** It is theirs to set, and it means *reconsider this* — a question
   pointed back at you, not a soft yes or a soft no.
3. **`why` is a reason, not a caption.** They can see what's in the frame. "≈ 0419, weaker light"
   earns its line; "boat at sunset" wastes it. One line, and long ones get truncated.
4. **`alternates` are honest about being your own A/B.** Attach the frame you compared against;
   `[` `]` swaps it in and the report tells you they preferred the other one.
5. **Targets are advisory.** They say what you'd suggest. The tool never enforces them and neither
   should you — a selection that goes over the target is an answer, not an error.

Group by something **complete and checkable**: a location, a subject, a shoot folder, a time window.
Never by "the ones I was deciding between".

## Hand over, and then stop

Say what they're looking at and what deserves attention — the cuts, the untouched pile, the frames
with alternates — then wait. **Don't drive the page while they're in it.** Synthetic keystrokes hit
real bindings; `Enter` commits the review.

## Read the result

On commit `window.__result` is populated, and under `--review` the same JSON is written to
`feedback/` in photoprep's user directory, so it survives the page being closed.

**Read the diff first.** The final list tells you what to build; the diff tells you what you got
wrong, and only one of those makes you better next time.

| Field | What it tells you |
|---|---|
| `diff.added` | they kept something you cut — your bar was too high there |
| `diff.removed` | they cut something you picked |
| `diff.demoted` / `promoted` | moved to `maybe`, with a `cause` (`tag:near-dup`, `note`, `manual`) |
| `diff.swapped` | they preferred an alternate over your pick |
| `frames[id].tags` / `.text` | their reason on a single frame |
| `setNotes[]` | a comment about **several frames together** |
| `setComment` | a critique of the whole set |
| `groups[].ranked` | 1–10 scores, ranked **within** each group |
| `added[]` | frames they put on the sheet themselves, with paths |

Three things worth handling deliberately:

- **`maybe` is a question.** Answer each one with a recommendation rather than silently including or
  dropping it. That's the whole reason the state exists.
- **`setNotes` carries the best feedback**, because selection critiques are usually about
  *relationships* — "these three are the same moment", "too many like this". Respond to the group;
  don't apply the note to each frame separately.
- **Scores only compare inside their group.** A 7 in one group and a 7 in another are not the same
  claim, which is why the tool never ranks them against each other. Don't either.

## Report back with a conclusion

Say what changed and what you concluded from it. If the selection is now larger than the platform
allows, remember that **picks are not slides** — pairing two landscapes into one frame turns 2 picks
into 1 slide, so composing often beats cutting. Deciding which pairs up is `photoprep-sort`;
building the frames afterwards is `photoprep-layout`.

## Clean up

Stop the server (`pkill -f 'photoprep/bin/cli.js'`) and delete any scratch payload. Keep the feedback
JSON — it is the record of what they actually wanted.
