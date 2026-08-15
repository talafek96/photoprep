'use strict';
// Parse-check every inline <script> in the pages. They never go through a bundler, so a typo would
// otherwise only surface as a blank page in someone's browser.
const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..', 'web');
let failures = 0, checked = 0;

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walk(p) : (e.name.endsWith('.html') ? [p] : []);
});

for (const file of walk(WEB)) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(WEB, file);

  // inline scripts (no src=)
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  blocks.forEach((m, i) => {
    checked++;
    try { new Function(m[1]); } catch (e) {
      console.log('  FAIL ' + rel + ' inline script #' + i + ': ' + e.message);
      failures++;
    }
  });

  // every local asset a page references should exist
  for (const m of html.matchAll(/(?:src|href)="(\/[^"?#]+)/g)) {
    const target = path.join(WEB, m[1]);
    const alt = path.join(__dirname, '..', m[1]);           // /assets/... is served from the brand dir
    if (!fs.existsSync(target) && !fs.existsSync(alt) && !m[1].startsWith('/assets/')) {
      console.log('  FAIL ' + rel + ' references missing ' + m[1]);
      failures++;
    }
  }
  console.log('  ok   ' + rel + ' (' + blocks.length + ' inline block(s))');
}

console.log(failures ? '\n' + failures + ' problem(s) in ' + checked + ' script block(s)' : '\nall pages parse');
process.exit(failures ? 1 : 0);
