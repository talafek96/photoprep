# Pitfalls

Things that have gone wrong here once, written down so they don't go wrong twice. Each entry is a
trap that looked like correct usage at the time — the fix is cheap, but only if you already know.

## Editing a draft GitHub Release drops its tag

**Never `PATCH` a draft release without resending `tag_name`.**

```bash
# Wrong — silently unbinds the tag
gh api -X PATCH repos/OWNER/REPO/releases/$ID -f body=@notes.md

# Right — tag_name goes with every edit
gh api -X PATCH repos/OWNER/REPO/releases/$ID -f tag_name=v1.2.3 -f body=@notes.md
```

A draft release never binds to its tag. GitHub holds `tag_name` as *intent* and resolves it only
when you publish, which is why a draft's `html_url` reads `.../releases/tag/untagged-<hash>` even
when the tag is already pushed and correct. That placeholder is normal and not worth chasing.

The trap is that the update endpoint is not a partial update for drafts. Omit `tag_name` and GitHub
does not keep the existing one — it backfills the placeholder slug, so a release that pointed at
`v1.2.3` now points at `untagged-<hash>`. Nothing warns you, and the API returns `200`.

Publishing then creates a **real tag from that placeholder name**, at the default branch's head
rather than at the commit you released, and fires `release.published` with it. `release.yml`
refuses the tag on its first check, so nothing reaches npm — but you are left with a junk tag on the
remote and a published release pointing nowhere useful.

Recovering does not need a re-tag or a version bump. The commit and the `vX.Y.Z` tag from
`scripts/release.mjs` were never wrong, only the release's pointer to them:

```bash
gh api -X PATCH repos/OWNER/REPO/releases/$ID -f tag_name=vX.Y.Z -F draft=true   # unpublish
gh api -X PATCH repos/OWNER/REPO/releases/$ID -F draft=false                     # fires the event again
git push origin :refs/tags/untagged-<hash>                                       # drop the junk tag
```

Toggling `draft` back to `false` re-fires `release.published`, so the release workflow runs again on
the right tag. Editing the body of an already-published release is safe — the tag exists by then,
and `tag_name` is no longer intent.

## Auto grid rows stretch when the grid has a definite height

**A grid whose height comes from its parent will size `auto` rows by dividing that height, not by
their content — silently clipping every item.**

```css
/* Wrong — every row came out ~114px and cut the captions off */
#sheet { display:grid; grid-template-columns:repeat(auto-fill,minmax(184px,1fr)); align-content:start; }

/* Right */
#sheet { display:grid; grid-template-columns:repeat(auto-fill,minmax(184px,1fr));
         grid-auto-rows:max-content; }
```

The sheet sits in a `grid-template-rows:auto 1fr auto` parent, so it has a *definite* height. Rows
then get stretched to fill it. `align-content:start` does not prevent this — it positions the row
box, it does not change how the tracks were sized — so the computed `grid-template-rows` reads back
as a suspiciously fractional `114.039px` while `scrollHeight` reports the true 281px.

The trap is that the obvious fixes make it look like an aspect-ratio problem and send you in
circles. Neither `aspect-ratio:4/5` nor `padding-top:125%` on the child works, because both resolve
against a containing block the grid has not sized yet, so track sizing measures the box as zero.
Swapping one for the other changes nothing. `grid-auto-rows:max-content` is the actual fix; a fixed
pixel height on the image box is worth having anyway, so mixed orientations give uniform rows.

## A border-trail overlay that animates perfectly and paints nothing

**Two independent traps stack here, and both fail silently with correct-looking computed styles.**

```css
/* Wrong — the photo paints over the light, and the clip erases what's left */
.tile .trail { position:absolute; overflow:hidden; padding:3px;
               mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
               mask-composite:exclude; }

/* Right */
.tile .trail { position:absolute; z-index:4; padding:3px;
               mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
               mask-composite:exclude; }
```

**1. Paint order.** The overlay and the image are positioned siblings at `z-index:auto`, so they
paint in DOM order. Putting the overlay first in the markup — the natural place for a background
layer — means the image paints *over* it. It needs an explicit `z-index`.

**2. `overflow:hidden` versus a ring mask.** `overflow` clips descendants to the **padding box**,
while the `content-box EXCLUDE border-box` ring mask reveals only the **padding band**, which lies
outside that box. The two regions do not intersect, so everything inside is erased. The mask alone
already confines the light to the band; adding `overflow:hidden` to "keep it tidy" deletes it.

What makes this expensive is that every diagnostic looks healthy: `getAnimations()` reports the
animation running, `offset-distance` interpolates across samples, `opacity` is 1, and the computed
`mask-composite` reads `exclude`. Nothing points at the two properties actually responsible.

Also worth knowing while building one: `mix-blend-mode` inside a masked element has no backdrop to
composite against, so `plus-lighter` silently does nothing. And prefer `offset-path` over a rotating
`conic-gradient` — conic sweeps *angularly from the centre*, so on a tall rectangle the bright arc
crawls the long edges and races the short ones. It animates; it just never reads as travel.

## Drag-to-pan on an `<img>` starts a file drag instead

**An `<img>` is natively draggable, so a press-and-move begins an HTML5 drag - ghost image and all -
and your pointer handler never runs.**

```css
/* Right */
#stage img { -webkit-user-drag:none; user-select:none; -webkit-user-select:none; }
```
```js
stage.addEventListener('dragstart', e => e.preventDefault());   // Firefox ignores -webkit-user-drag
stage.addEventListener('pointerdown', e => { e.preventDefault(); /* ... */ });
```

Nothing errors and `pointerdown` does fire, so the bug looks like broken pan logic rather than the
browser claiming the gesture. `-webkit-user-drag` alone is not enough - it is non-standard and
unsupported in Firefox - so cancel `dragstart` as well, and `preventDefault()` the `pointerdown`
to stop the text-selection drag on whatever sits behind the image.

## `setPointerCapture` retargets `pointerup`, so "did they click that element?" is wrong

**After capture, `pointerup.target` is the capturing element — never the child the press landed on.**

```js
// Wrong — a click squarely on the image reports the stage and reads as "clicked outside"
st.addEventListener('pointerdown', e => st.setPointerCapture(e.pointerId));
st.addEventListener('pointerup',   e => { if (e.target === st) closeOverlay(); });

// Right — record where the press STARTED
let downOnPhoto = false;
st.addEventListener('pointerdown', e => { downOnPhoto = (e.target === img); st.setPointerCapture(e.pointerId); });
st.addEventListener('pointerup',   () => { if (!downOnPhoto) closeOverlay(); });
```

Capture exists so a drag keeps receiving events after the pointer leaves the element, which is
exactly why it rewrites the target. The trap is that it makes hit-testing on `pointerup` silently
wrong in only *some* cases, so it looks like a flaky bug rather than a wrong reading.

It also defeats the obvious test. Dispatching a synthetic `pointerup` on the child **passes**, because
nothing simulated the capture — the assertion confirms a behaviour the real browser never produces.
Synthetic pointer tests must send `pointerup` to the capturing element to mean anything.
