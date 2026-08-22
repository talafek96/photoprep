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
