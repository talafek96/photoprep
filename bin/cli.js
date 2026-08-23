#!/usr/bin/env node
'use strict';
// photoprep — start the local app.
//
//   photoprep                     open the home screen
//   photoprep select <folder>     go straight to choosing which frames make the cut
//   photoprep layout              go straight to the framing tool
//   photoprep watermark <folder>  go straight to watermarking, staged from a folder
//
// Options:
//   --config <file>   brand config to use (default: the user's, else the bundled neutral one)
//   --assets <dir>    folder holding the mark images the config refers to
//   --port <n>        fixed port (default: an unused one)
//   --no-open         start the server but don't launch a browser  [for automation]
//   --review          turn on the approve / reject / note-to-assistant workflow, so whoever drove
//                     the tool can read back what you changed and why  [for AI-assisted runs]
//   --idle <minutes>  exit after this long with no requests (0 = never)
const { createServer } = require('../src/server');
const { openBrowser } = require('../src/open-browser');
const P = require('../src/paths');

const TOOLS = ['select', 'layout', 'watermark', 'settings'];

function parse(argv) {
  const o = { tool: '', folder: '', open: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-open') o.open = false;
    else if (a === '--review') o.review = true;
    else if (a === '--config') o.configPath = argv[++i];
    else if (a === '--assets') o.assetsDir = argv[++i];
    else if (a === '--port') o.port = Number(argv[++i]);
    else if (a === '--idle') o.idleMs = Number(argv[++i]) * 60 * 1000;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('-')) { console.error('unknown option: ' + a); process.exit(2); }
    else if (!o.tool && TOOLS.includes(a)) o.tool = a;
    else if (!o.folder) o.folder = a;
  }
  return o;
}

async function main() {
  const o = parse(process.argv.slice(2));
  if (o.help) {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('\n').slice(2, 17).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
    return;
  }
  const app = createServer(o);
  const { port, token, url } = await app.listen(o.port);
  const target = url + (o.tool ? o.tool + '/' : '') + '?t=' + token + (o.folder ? '&folder=' + encodeURIComponent(P.expand(o.folder)) : '');

  // Machine-readable first line, so an automation driver can pick up the port without parsing prose.
  console.log('PORT ' + port);
  console.log('photoprep ready — ' + target);
  if (o.open) console.log('  (if a page doesn\'t appear, paste that URL into your browser)');
  console.log('brand config: ' + app.paths.configPath);
  console.log('exports default to: ' + app.paths.outDir);
  if (o.review) console.log('review mode: ON — approve/reject + notes are reported back to ' + app.paths.feedbackDir);

  if (o.open) {
    openBrowser(target, err => {
      if (err) console.log('\nCouldn\'t open a browser automatically — open the URL above yourself.');
      else console.log('\nOpened in your browser. Leave this window running; close it when you\'re done.');
    });
  }
}

main().catch(err => { console.error(String(err && err.stack || err)); process.exit(1); });
