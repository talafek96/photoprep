# photoprep

Three browser tools (Select, Layout, Watermark) served by a local Node CLI. No runtime
dependencies, and none get added without asking.

Select and the planned Order tool have design specs in `docs/` — read the relevant one before
changing either. They record *why* the four verdict states exist, why Maybe is a message rather
than a decision, and which features were deliberately rejected, so those don't get re-litigated or
quietly re-added.

## The plugin

`skills/` plus `.claude-plugin/plugin.json` ship this repo as a Claude Code plugin. Those skills are
**generic on purpose** — good practice for these tools, never one person's preferences — because they
are installed by strangers whose taste you don't know. `test/plugin.js` checks the manifest and every
skill's front matter, since a malformed skill fails silently: it simply never triggers.

Keep a skill in step with the tool it drives. A skill describing an option that no longer exists is
worse than no skill, because it is followed confidently.

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
