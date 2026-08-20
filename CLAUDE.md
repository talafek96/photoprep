# photoprep

Two browser tools (Layout, Watermark) served by a local Node CLI. No runtime dependencies, and
none get added without asking.

## Pitfalls

@PITFALLS.md

The import above loads that file every session, so read it before touching releases, the folder
picker, or anything else it covers — it records traps that already cost time here once.

**Keep it current.** When you fix a bug whose cause was non-obvious — something that looked like
correct usage, failed silently, or sent you down a wrong path — add an entry as part of the same
change. An entry earns its place only if it would have saved that time. State what looks correct
but isn't, why the failure is silent, and the copy-pasteable fix. Bugs whose cause is evident from
the code or the error message do not belong there.

## Releases

`node scripts/release.mjs <major|minor|patch>` bumps `package.json`, tags that commit on `main` and
pushes both, then drafts the GitHub Release. Publishing that draft is what triggers npm — never a
tag push. Do not tag, bump, or publish by hand; the workflow refuses anything the script didn't cut.
