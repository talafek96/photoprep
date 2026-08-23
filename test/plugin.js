'use strict';
// The plugin is a set of files a *different* program reads, so nothing here fails at runtime the way
// a broken require would - a skill with a malformed front matter block simply never triggers, and
// the first sign of trouble is an assistant that quietly doesn't know the tool exists. Hence a test.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let failed = 0;
const ok = m => console.log('  ok   ' + m);
const bad = m => { console.log('  FAIL ' + m); failed++; };

const manifestPath = path.join(root, '.claude-plugin', 'plugin.json');
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  ok('.claude-plugin/plugin.json parses');
} catch (e) {
  bad('.claude-plugin/plugin.json: ' + e.message);
}

if (manifest) {
  if (manifest.name) ok('manifest has a name (' + manifest.name + ')'); else bad('manifest needs a name');
  // The version people install is the git ref, not this field - but a manifest claiming a version
  // the package no longer is misleads anyone reading it.
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (manifest.version === pkg.version) ok('manifest version matches package.json (' + pkg.version + ')');
  else bad('manifest says ' + manifest.version + ', package.json says ' + pkg.version);
}

const skillsDir = path.join(root, 'skills');
const skills = fs.readdirSync(skillsDir).filter(d => fs.statSync(path.join(skillsDir, d)).isDirectory());
if (skills.length) ok(skills.length + ' skill(s) present'); else bad('no skills found');

for (const dir of skills) {
  const file = path.join(skillsDir, dir, 'SKILL.md');
  if (!fs.existsSync(file)) { bad(dir + '/SKILL.md missing'); continue; }
  const text = fs.readFileSync(file, 'utf8');

  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) { bad(dir + ': no front matter block'); continue; }

  // Deliberately not a YAML parser: the front matter is two flat keys, and taking on a dependency
  // to read them would break the repository's no-dependencies rule for no gain.
  const fields = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([a-z]+):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]] = kv[2];
  }

  if (fields.name === dir) ok(dir + ': name matches its directory');
  else bad(dir + ': name is "' + fields.name + '" but the directory is "' + dir + '"');

  // The description is the whole triggering mechanism - a skill with a thin one is installed and
  // never used, which looks identical to not shipping it.
  if (fields.description && fields.description.length > 120) ok(dir + ': description is substantial');
  else bad(dir + ': description is missing or too thin to trigger on');

  if (text.slice(m[0].length).trim().length > 400) ok(dir + ': has a body');
  else bad(dir + ': body is empty or near-empty');
}

console.log(failed ? '\n' + failed + ' plugin check(s) failed' : '\nplugin is well-formed');
process.exit(failed ? 1 : 0);
