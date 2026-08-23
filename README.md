# photoprep

Get photos ready to post — frame them, mark them, done.

Three small tools that run locally in your browser:

- **Select** — decide which frames make the cut. Shows what was left out and why, not just what was
  kept, so nothing good disappears quietly. Mark the ones you're unsure about, tag what's wrong,
  and swap in the frame that wasn't picked.
- **Layout** — stack two landscape photos into one portrait frame, split a panorama into slices
  that scroll like one wide shot, or just crop one photo to the frame ratio. Exports clean, at full
  resolution.
- **Watermark** — put your mark on one photo or a whole batch. Nine-point placement, drag to
  position, and it auto-picks the variant of your logo that stays legible on each photo.

Nothing is uploaded anywhere. It's a local server and your own browser; your photos never leave
your machine.

## Run it

**If you'd rather not use a terminal:** download this repo, then double-click
`launchers/Photoprep.command` (macOS), `launchers/Photoprep.bat` (Windows) or
`launchers/Photoprep.desktop` (Linux). Your browser opens and you're in. Keep the little window
open while you work.

**From a terminal:**

```bash
npx photoprep                    # opens the home screen
npx photoprep watermark          # straight to a tool
npx photoprep --no-open          # start the server, don't launch a browser
```

You need [Node.js](https://nodejs.org) 18 or newer. That's the only requirement — photoprep has no
dependencies of its own.

## Your own watermarks

Open **Settings** from the home screen and drop your logo in. PNG with a transparent background
works best. A few things worth knowing:

- **Kits** group variants of the same logo — say a dark version and a light one. The watermark tool
  picks the best variant *within* a kit for each photo, and never mixes kits.
- **Sizes are measured on the visible logo**, not the image file. Marks are auto-trimmed of
  transparent padding on load, so "25%" means the logo itself is 25% of the photo's width, matching
  what Lightroom's size slider does.
- **Export your brand** to a single file to back it up or set up another machine in one step.

Your marks and settings live outside the install, so upgrading never touches them:

| | |
|---|---|
| macOS | `~/Library/Application Support/photoprep/` |
| Linux / WSL | `~/.config/photoprep/` |
| Windows | `%APPDATA%\photoprep\` |

## Driving it from a script or an AI assistant

### Claude Code plugin

If you use Claude Code, install the plugin and Claude gets skills for all three tools — when to reach
for each, the automation hooks, and the judgement calls worth handing back to you rather than
guessing at:

```
/plugin marketplace add talafek96/photoprep
/plugin install photoprep@photoprep
```

The skills are generic — they carry good practice for these tools, not anyone's personal taste. They
live in `skills/` and are readable on their own if you'd rather adapt them than install them.


All three tools expose automation hooks on `window`, so an assistant can set a job up and hand the
browser to a person for the judgement calls:

```js
// select
await window.__loadSelection({
  setPrompt: 'Day 3 — 46 frames from four locations, 20 picked.',
  candidates: [
    { id: 'a.jpg', name: 'a', url: '/file?path=...', group: 'angel-road', date: 1701504444000,
      verdict: 'selected',                 // selected | rejected | untouched
      why: 'the lagoon and the sandbar',   // ONE line. Shown under the frame. Say why, not what.
      alternates: [{ id: 'b.jpg', url: '…' }] },   // frames you compared it against
  ],
  groups: { 'angel-road': { label: 'Angel Road', target: 3, mode: 'upto' } },
});
window.__result;   // null until they commit — see "Reading a selection back"
// layout
await window.__loadCandidates([
  { name: 'hero', mode: 'stack', panels: { 0: '/work/a.jpg', 1: '/work/b.jpg' } },
  { name: 'pano', mode: 'split', image: '/work/wide.jpg', n: 2 },
  { name: 'crop', mode: 'split', image: '/work/tall.jpg', n: 1 },   // n:1 = crop to the frame ratio
]);
window.__setDest('/absolute/output/dir');
// watermark
await window.__addImages([{ id: 'a', name: 'a.jpg', url: '/work/a.jpg',
                            suggest: { on: true, id: 'my-mark', anchor: 'br', sizePct: 25, op: 0.55 } }]);
await window.__exportAll();
window.__result;   // what was written, and what the person changed
```

Stage full-resolution sources in the `work/` folder of the user directory above; they're served at
`/work/<name>`. Writes are authorised by the token in the URL the CLI prints.

Better for a whole shoot — open the folder itself, so exports can land beside the originals:

```js
await window.__openFolder('/path/to/shoot');   // loads every photo and turns beside-source on
await window.__openFolder('/path/to/day-two'); // open as many folders as you like
window.__setBesideName('marked-for-ig');       // override the subfolder name
window.__setBeside(false);                     // …or send everything to the destination folder instead
```

**Beside source** is a mode, not a one-off: with it on, each export is written into a subfolder next
to *the photo it came from*, so a batch gathered from several folders doesn't collapse into one.
Photos that were dropped rather than opened carry no path — a drop gives the page bytes and a name,
never a location — so those fall back to the destination folder.

The subfolder is named after the tool on purpose, so it can never collide with a `Watermarked`
folder you keep your own exports in. It's one path segment — separators are stripped, so the name
can't escape the source folder.

### Reading a selection back

When the person commits, `window.__result` is populated (and `--review` writes the same JSON to
`feedback/`). **Read the diff, not the final list** — the list tells you what to build, the diff
tells you what you got wrong:

```jsonc
{
  "final":  { "selected": [...], "maybe": [...], "rejected": [...], "untouched": [...] },
  "diff": {
    "added":    ["c.jpg"],                       // they kept something you cut
    "removed":  ["d.jpg"],                       // they cut something you picked
    "demoted":  [{ "id": "a.jpg", "to": "maybe", "cause": "tag:near-dup" }],
    "promoted": [], "swapped": []                // swapped = they preferred an alternate
  },
  "frames":     { "a.jpg": { "state": "maybe", "tags": ["near-dup"], "text": "…", "scores": {…} } },
  "setNotes":   [{ "text": "all three are the same overlook", "frames": ["a.jpg","b.jpg","c.jpg"] }],
  "setComment": "I picked 24, which is probably too many",
  "groups":     [{ "name": "angel-road", "chosen": 3, "target": 3, "status": "met", "ranked": [...] }]
}
```

Four rules the tool assumes you are following. Break them and the feedback stops being useful:

1. **Send the whole set, not your shortlist.** Every frame you looked at, including the ones you
   cut. A person cannot overrule a decision they cannot see, and a group labelled "Angel Road" that
   holds 2 of the location's 8 frames is a decision dressed up as a choice. Assert before sending:
   every candidate is in a group, and each group's count matches reality.
2. **`maybe` is a message, not a verdict.** It means *reconsider this* — it comes back to you as a
   question. Never send frames as `maybe` yourself; it is theirs to set. Anything returned as
   `maybe` needs an answer from you, not a silent decision either way.
3. **`why` is one line, and it is a reason.** "≈ 100736, weaker light" — not a description of the
   photo, which they can see.
4. **Targets are advisory.** `target` says what you'd suggest; the tool never enforces it and
   neither should you. A commit that goes over is an answer, not an error.

`setNotes` — comments about several frames *together* — is where the most useful feedback lives,
because selection critiques are usually about relationships ("too many like this", "these three are
the same moment"). Handle them as a group, not by applying the note to each frame.

### Review mode

```bash
photoprep --review
```

Adds an approve / reject / note-to-assistant control to each item, and writes a report of every
export to `feedback/` in the user directory. It exists so an assistant that set up a batch can read
back what the person actually changed and why. It's **off by default** — on your own, there's nobody
to report to, and `/feedback` refuses writes unless the flag is set.

Point it at a brand kept somewhere else — useful when your marks are versioned in another repo:

```bash
photoprep --config /path/to/watermarks.json --assets /path/to/assets
```

## Development

```bash
npm test          # server contract, CLI startup, page parsing — no dependencies, no browser
```

CI runs the same tests on macOS, Windows and Linux against Node 20 and 22.

## Releasing

Everything is driven by git. The release script bumps `package.json`, tags that exact commit, and
pushes both, so the manifest and the tag can never disagree:

```bash
node scripts/release.mjs patch --dry-run   # say what would happen, change nothing
node scripts/release.mjs minor             # bump, tag, push, and draft the GitHub Release
```

**Pushing does not publish.** The tag leaves a *draft* GitHub Release; publishing that Release is
what triggers `release.yml`, which re-runs the whole gate on the tagged commit, refuses anything not
contained in `main` or whose `package.json` disagrees with the tag, and only then publishes — over
OIDC, with provenance, and with no npm token stored anywhere.

## License

Apache-2.0
