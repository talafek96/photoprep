#!/usr/bin/env node
'use strict';
// photoprep — start the local app.
//
//   photoprep                     open the home screen
//   photoprep layout              go straight to the framing tool
//   photoprep watermark <folder>  go straight to watermarking, staged from a folder
//
// Options:
//   --config <file>   brand config to use (default: the user's, else the bundled neutral one)
//   --assets <dir>    folder holding the mark images the config refers to
//   --port <n>        fixed port (default: an unused one)
//   --no-open         start the server but don't launch a browser  [for automation]
//   --idle <minutes>  exit after this long with no requests (0 = never)
const { createServer } = require('../src/server');
const P = require('../src/paths');

const TOOLS = ['layout', 'watermark'];

function parse(argv) {
  const o = { tool: '', folder: '', open: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-open') o.open = false;
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
    console.log(require('fs').readFileSync(__filename, 'utf8').split('\n').slice(2, 16).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
    return;
  }
  const app = createServer(o);
  const { port, token, url } = await app.listen(o.port);
  const target = url + (o.tool ? o.tool + '/' : '') + '?t=' + token + (o.folder ? '&folder=' + encodeURIComponent(P.expand(o.folder)) : '');

  // Machine-readable first line, so an automation driver can pick up the port without parsing prose.
  console.log('PORT ' + port);
  console.log('photoprep ready — ' + target);
  console.log('brand config: ' + app.paths.configPath);
  console.log('exports default to: ' + app.paths.outDir);
  if (o.open) console.log('(browser auto-launch lands in a later phase — open the URL above for now)');
}

main().catch(err => { console.error(String(err && err.stack || err)); process.exit(1); });
