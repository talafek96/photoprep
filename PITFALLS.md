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

## A card sized by its text, not by the photo it holds

**A flex item with no width is sized by its widest child — and a one-line filename is usually wider
than the image above it.**

```css
/* Wrong - the footer decides how wide the card is, so the photo floats in a pool of black,
   and split tiles stop touching, which is exactly what makes a panorama read as one image. */
.card .name { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* Right - the card is exactly as wide as its media; the footer clips to fit. */
el.style.width = (tiles * TILE_W + 2) + 'px';   /* +2: box-sizing:border-box eats the 1px borders */
.card .ft { min-width:0; }                      /* without this the ellipsis never engages */
```

`text-overflow:ellipsis` reads like it caps the width. It does not — it only takes effect once
something else constrains the box, and `min-width:auto` on a flex child means nothing does. So the
layout looks *almost* right, which is worse than looking broken: the seams between adjacent tiles
open by a few pixels and the failure gets blamed on the gap or the border.

## A finished CSS animation with `fill-mode: both` overrides every inline `transform` you write

**Animations sit above inline styles in the cascade, and `both` keeps the final keyframe applied
forever — so a one-off entrance animation silently disables transform-based drag and FLIP.**

```css
/* Wrong - after .34s this card's transform is pinned to `none`, permanently */
.card { animation: cardIn .34s var(--ease-out) both; }
@keyframes cardIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:none } }

/* Right - `translate` is an independent property, so it composes with `transform` instead of
   competing with it, and the entrance can keep its fill mode */
@keyframes cardIn { from { opacity:0; translate:0 8px } to { opacity:1; translate:none } }
```

Nothing errors, `el.style.transform` reads back exactly what you set, and `getComputedStyle` reports
the animation's value — so the element is provably "supposed to" be at the new position while sitting
visibly at the old one. It looks like broken drag maths, and you will rewrite the geometry twice
before suspecting a decorative fade. The same trap hits FLIP, spring animations, and anything else
that positions by writing `transform` to an element that once animated in.

## A drag decision that moves the layout it reads will oscillate

**Hit-testing the board you just rearranged is a limit cycle, and it is the single most common bug in
drag-and-drop reordering.** SortableJS names it *swap glitching*; react-beautiful-dnd's source calls
the same loop `goto 1 (boom)`; dnd-kit has open issues for it years on.

The shape: the pointer enters a zone → the code opens a gap → the gap moves the cards → the pointer
is now in a different card's zone → it opens a different gap → repeat, forever, without the hand
moving at all.

Three defences, all of which this repo's Sort board needs:

```js
// 1. hit-test a FROZEN layout, projected arithmetically - never re-measure the live DOM
DRAG.slots = project(idsWithoutTheDraggedOne, geo);   // computed once, at drag start

// 2. asymmetric thresholds: leaving costs less ground than entering
const edge = alreadyArmed ? 0.15 : 0.25;

// 3. a travel lock: having committed to a target, require the HAND to move before switching
if (Math.hypot(x - lockX, y - lockY) < 10) want = current;
```

And the structural one: **do not reflow the board when arming a drop-into target.** Closing the gap
to say "this is not a reorder" moves every card after it by a full slot, which is far larger than any
jitter threshold can absorb. Say it without moving anything — dim the gap instead.

The libraries that project layouts arithmetically (react-beautiful-dnd, Framer Motion) do not have
this bug class. The ones that re-measure the mutated DOM (SortableJS, dnd-kit) ship three or four
mitigations each and still have open reports.

## `scale` is applied BEFORE `transform`, so it scales the position too

**The independent `translate` / `rotate` / `scale` properties compose in a fixed order — translate,
rotate, scale, then `transform` — all about `transform-origin`. So an element positioned by
`transform` and scaled by the `scale` property does not stay where it was put.**

```js
// Wrong - the ghost follows the pointer, but tucking it to 26% moves it to roughly a quarter of
// the distance to the cursor. It looks like the drag maths is off by a factor you can't find.
el.style.transform = `translate3d(${x}px,${y}px,0)`;   // rewritten every frame, no transition
el.style.scale = tucked ? '0.26' : '1';                // transitioned
```

The composite is `origin + s·(translate + p − origin)`, so the translation is multiplied by `s`.

The fix is two elements: a wrapper that carries the **position** (rewritten per frame, never
transitioned) and a child that carries the **scale** (transitioned). Splitting them is also the only
way to animate one without lagging the other — a transition on the positioning `transform` makes the
element trail the pointer.

This bites specifically because splitting position and scale across the two properties is the
*documented* fix for a different problem (an animation's `transform` fighting an inline one), so it
reads as the careful thing to do.

## A stage that centres its child fights the transform that positions it

**If an element is positioned entirely by `transform`, its parent must not lay it out.** A stage with
`place-items:center` (or auto margins, or flex centring) adds a layout offset *on top of* the
translate — so the content sits off-centre by half the free space while every number in the model
reads as perfectly centred.

```css
/* Wrong - grid centres the image, THEN the transform translates it from there */
#stage { display:grid; place-items:center; }
#stage img { transform-origin:0 0; }        /* transform: translate(x,y) scale(s) */

/* Right - the stage is only a positioning context; the transform owns the position */
#stage { display:block; position:relative; }
#stage img { position:absolute; left:0; top:0; transform-origin:0 0; }
```

What makes it hard to see: it is invisible in any axis where the content overflows the stage (there
is no free space to centre within), so a portrait photo in a wide viewer looks wrong horizontally and
correct vertically — which reads as a bug in the horizontal maths. And logging the model is no help,
because the model is right; only `getBoundingClientRect()` on the real element shows it. Measure the
gap on BOTH sides and compare, rather than checking the computed offset against the container.

## Re-inserting a DOM node restarts its CSS animations

**`appendChild` / `insertBefore` on a node that is ALREADY a child detaches and re-attaches it, and
re-attaching restarts every CSS animation on that element.** So the innocent-looking "put them all in
order" pass replays every card's entrance animation, and a board of twenty flashes as one.

```js
// Wrong - touches every node, so every card re-enters on any reorder
items.forEach(it => container.appendChild(nodeFor(it)));

// Right - the standard minimal-move walk: only insert a node that is not already where it belongs
let cursor = container.firstChild;
items.forEach(it => {
  const el = nodeFor(it);
  if (el === cursor) { cursor = el.nextSibling; return; }
  container.insertBefore(el, cursor);
});
```

Worth a belt-and-braces too: retire the entrance animation once it has run
(`el.addEventListener('animationend', () => el.style.animation = 'none', {once:true})`), so no future
move of the node can replay it however it happens.

The symptom is described as "everything reloaded" or "the images flickered", which sends you looking
at image loading and caching — but nothing reloaded, and a network panel showing zero requests is the
clue that it is the animations restarting rather than the content.
