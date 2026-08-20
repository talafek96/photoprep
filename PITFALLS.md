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
