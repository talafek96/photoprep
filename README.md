# photoprep

Get photos ready to post — frame them, mark them, done.

Two small tools that run locally in your browser:

- **Layout** — stack two landscape photos into one portrait frame, or split a panorama into slices
  that scroll like one wide shot. Exports clean, at full resolution.
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

Both tools expose automation hooks on `window`, so an assistant can set a job up and hand the
browser to a person for the judgement calls:

```js
// layout
await window.__loadCandidates([
  { name: 'hero', mode: 'stack', panels: { 0: '/work/a.jpg', 1: '/work/b.jpg' } },
  { name: 'pano', mode: 'split', image: '/work/wide.jpg', n: 2 },
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
