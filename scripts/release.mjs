#!/usr/bin/env node
/**
 * Cut a release: bump the version, tag it on `main`, push, then draft the GitHub Release.
 *
 *   node scripts/release.mjs patch          # 0.1.0 -> 0.1.1
 *   node scripts/release.mjs minor          # 0.1.1 -> 0.2.0
 *   node scripts/release.mjs major          # 0.2.0 -> 1.0.0
 *   node scripts/release.mjs 1.4.2          # an exact version
 *   node scripts/release.mjs minor --dry-run
 *
 * **Everything is driven by git.** The tag is the release, and package.json is bumped in the same
 * commit the tag points at, so the manifest and the tag can never disagree — CI refuses to publish
 * if they ever do. npm has no equivalent of deriving the version at build time, so instead of two
 * artifacts kept loosely in agreement there is one commit that carries both.
 *
 * **Pushing does not publish.** Publishing is triggered by a GitHub *Release*, so this leaves a
 * **draft** one for you to read and press the button on. A tag is cheap and gets created for all
 * sorts of reasons; publishing a Release is unambiguous and nobody does it by accident.
 *
 * Everything is checked before anything is pushed, and the local side is done first so a failure
 * leaves nothing published to undo.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE_BRANCH = 'main';
const REMOTE = 'origin';
const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const TAG = /^v(\d+\.\d+\.\d+)$/;

class Refused extends Error {}

const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch (e) {
    throw new Refused(`git ${args.join(' ')} failed: ${(e.stderr || '').trim() || 'no detail'}`);
  }
};
const gitQuiet = (...args) => { try { return git(...args); } catch { return ''; } };

const root = (() => {
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(); }
  catch { throw new Refused('not inside a git repository'); }
})();

const pkgPath = join(root, 'package.json');
const pluginPath = join(root, '.claude-plugin', 'plugin.json');
const readPkg = () => JSON.parse(readFileSync(pkgPath, 'utf8'));

const parse = text => {
  const m = VERSION.exec(String(text).trim());
  if (!m) throw new Refused(`${text} is not a MAJOR.MINOR.PATCH version`);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
};
const show = v => `${v.major}.${v.minor}.${v.patch}`;
const rank = v => v.major * 1e12 + v.minor * 1e6 + v.patch;
const bump = (v, level) =>
  level === 'major' ? { major: v.major + 1, minor: 0, patch: 0 }
  : level === 'minor' ? { major: v.major, minor: v.minor + 1, patch: 0 }
  : { major: v.major, minor: v.minor, patch: v.patch + 1 };

// The highest released version, read from the tags — they are what the release workflow trusts.
// package.json is considered too, so a manifest that somehow ran ahead can't be released backwards.
function currentVersion() {
  const tagged = git('tag', '--list', 'v*').split('\n')
    .map(l => TAG.exec(l.trim())).filter(Boolean).map(m => parse(m[1]));
  const manifest = (() => { try { return parse(readPkg().version); } catch { return null; } })();
  const all = [...tagged, ...(manifest ? [manifest] : [])];
  return all.length ? all.reduce((a, b) => (rank(b) > rank(a) ? b : a)) : null;
}

function checkPreconditions() {
  if (git('status', '--porcelain')) {
    throw new Refused(
      'the working tree has uncommitted changes. A release is built from a commit, so what is on '
      + 'disk right now would not be what ships. Commit or stash first.');
  }
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch !== SOURCE_BRANCH) {
    throw new Refused(`on ${branch}, but a release is cut from ${SOURCE_BRANCH}.`);
  }
  gitQuiet('fetch', '--quiet', REMOTE, '--tags');
  const local = git('rev-parse', SOURCE_BRANCH);
  const remote = gitQuiet('rev-parse', `${REMOTE}/${SOURCE_BRANCH}`);
  if (remote && local !== remote) {
    throw new Refused(
      `${SOURCE_BRANCH} and ${REMOTE}/${SOURCE_BRANCH} point at different commits. Release from `
      + `what is pushed, not from what is local: push or pull ${SOURCE_BRANCH} first.`);
  }
  return local;
}

function runGate() {
  // The workflow re-runs the whole gate on the tagged commit; this is here so a broken release is
  // refused in the second it takes locally, rather than after a tag, a push and a draft Release.
  process.stdout.write('  gate      running tests… ');
  try {
    execFileSync('npm', ['test'], { cwd: root, stdio: 'pipe' });
    console.log('passed');
  } catch (e) {
    console.log('FAILED\n');
    process.stdout.write(String(e.stdout || '').split('\n').slice(-25).join('\n'));
    throw new Refused('the test suite fails on this commit. A release is not cut from red.');
  }
}

function draftRelease(tag, version) {
  const slug = gitQuiet('remote', 'get-url', REMOTE)
    .replace(/^(git@github\.com:|https:\/\/github\.com\/)/, '').replace(/\.git$/, '');
  try {
    const out = execFileSync('gh',
      ['release', 'create', tag, '--draft', '--title', `photoprep ${version}`, '--generate-notes'],
      { cwd: root, encoding: 'utf8' });
    return `Draft Release ready — review it and press Publish to ship:\n  ${out.trim()}`;
  } catch (e) {
    const detail = (e.stderr || '').trim() || 'gh not installed';
    const url = slug ? `https://github.com/${slug}/releases/new?tag=${tag}` : 'GitHub';
    return `tag pushed, but drafting the Release failed (${detail}).\n  Publish one by hand: ${url}`;
  }
}

function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const level = argv.find(a => !a.startsWith('-'));
  if (!level) {
    console.error('usage: node scripts/release.mjs <major|minor|patch|X.Y.Z> [--dry-run]');
    return 2;
  }

  const commit = checkPreconditions();
  const current = currentVersion();
  let next;
  if (['major', 'minor', 'patch'].includes(level)) {
    next = bump(current || { major: 0, minor: 0, patch: 0 }, level);
  } else {
    next = parse(level);
    if (current && rank(next) <= rank(current)) {
      throw new Refused(`${show(next)} is not after the current version ${show(current)}`);
    }
  }

  const tag = `v${show(next)}`;
  if (git('tag', '--list', tag)) {
    throw new Refused(`${tag} already exists. A published version is never re-cut.`);
  }

  console.log(`  from      ${SOURCE_BRANCH} at ${commit.slice(0, 9)} — ${git('log', '-1', '--format=%s', commit)}`);
  console.log(`  version   ${current ? show(current) : 'none yet'} -> ${show(next)}`);
  console.log(`  commit    package.json bumped, committed as "release: photoprep ${tag}"`);
  console.log(`  tag       ${tag}`);
  console.log(`  push      ${REMOTE} ${SOURCE_BRANCH} + ${tag}`);

  if (dryRun) { console.log('\n  --dry-run: nothing was changed.'); return 0; }

  runGate();

  // Local first: bump, commit, tag. Nothing has left the machine yet.
  const pkg = readPkg();
  pkg.version = show(next);
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  git('add', 'package.json');
  // The plugin manifest carries the same version, and a test asserts they agree — so bump it in the
  // same commit rather than leaving a manifest that quietly claims an older release.
  try {
    const manifest = JSON.parse(readFileSync(pluginPath, 'utf8'));
    manifest.version = show(next);
    writeFileSync(pluginPath, JSON.stringify(manifest, null, 2) + '\n');
    git('add', '.claude-plugin/plugin.json');
  } catch { /* no plugin manifest in this checkout; nothing to keep in step */ }
  git('commit', '--message', `release: photoprep ${tag}`);
  git('tag', '--annotate', tag, '--message', `photoprep ${show(next)}`);

  try {
    git('push', REMOTE, SOURCE_BRANCH);
    git('push', REMOTE, `refs/tags/${tag}`);
  } catch (e) {
    // Roll back so a retry isn't blocked by wreckage from this attempt.
    gitQuiet('tag', '--delete', tag);
    gitQuiet('reset', '--hard', commit);
    throw new Refused(`${e.message}\n  Rolled back the local bump and tag; nothing was published.`);
  }

  console.log(`\n  pushed. ${draftRelease(tag, show(next))}`);
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  if (e instanceof Refused) { console.error(`release refused: ${e.message}`); process.exitCode = 1; }
  else throw e;
}
