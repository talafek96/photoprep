'use strict';
// Smoke test for the server contract. Runs on every platform in CI — no browser, no dependencies.
// Uses a throwaway PHOTOPREP_HOME so a developer's real brand config is never touched.
const os = require('os');
const fs = require('fs');
const path = require('path');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'photoprep-test-'));
process.env.PHOTOPREP_HOME = HOME;

const { createServer } = require('../src/server');

let failures = 0;
const check = (name, cond, extra) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond || extra == null ? '' : '  → ' + extra));
  if (!cond) failures++;
};

(async () => {
  const app = createServer({ idleMs: 0 });
  const { port, token } = await app.listen(0);
  const base = 'http://127.0.0.1:' + port;
  const auth = { cookie: 'pp_token=' + token };

  const health = await fetch(base + '/health').then(r => r.json());
  check('/health identifies the app', health.ok === true && health.app === 'photoprep');

  const home = await fetch(base + '/');
  check('/ serves the home page', home.status === 200);
  check('html response mints the session cookie', /pp_token=/.test(home.headers.get('set-cookie') || ''));

  const cfg = await fetch(base + '/config/watermarks.json').then(r => r.json());
  check('brand config is served', Array.isArray(cfg.watermarks) && cfg.watermarks.length > 0);

  const mark = await fetch(base + '/assets/' + cfg.watermarks[0].file);
  check('mark images resolve from the assets mount', mark.status === 200);

  const png = Buffer.from('89504e470d0a1a0a', 'hex');   // header only; the route never decodes it
  const noAuth = await fetch(base + '/save?name=blocked.png', { method: 'POST', body: png });
  check('/save refuses an unauthenticated write', noAuth.status === 403);

  const foreign = await fetch(base + '/save?name=blocked.png', {
    method: 'POST', body: png, headers: Object.assign({ origin: 'https://evil.example' }, auth),
  });
  check('/save refuses a cross-origin write', foreign.status === 403);

  const outDir = path.join(HOME, 'exports');
  const saved = await fetch(base + '/save?name=shot.png&dir=' + encodeURIComponent(outDir), {
    method: 'POST', body: png, headers: auth,
  }).then(r => r.json());
  check('/save writes to an absolute dir', saved.ok === true && fs.existsSync(saved.path), saved.error);

  const again = await fetch(base + '/save?name=shot.png&dir=' + encodeURIComponent(outDir), {
    method: 'POST', body: png, headers: auth,
  }).then(r => r.json());
  check('/save auto-renames instead of clobbering', again.ok && again.renamed && again.name === 'shot_1.png', again.name);

  const badName = await fetch(base + '/save?name=../escape.png', { method: 'POST', body: png, headers: auth });
  check('/save rejects a traversing filename', badName.status === 400);

  const relDir = await fetch(base + '/save?name=x.png&dir=relative/path', { method: 'POST', body: png, headers: auth });
  check('/save rejects a relative dir', relDir.status === 400);

  const traversal = await fetch(base + '/../package.json');
  check('static mount blocks traversal', traversal.status === 403 || traversal.status === 404, traversal.status);

  const defs = await fetch(base + '/save-defaults', {
    method: 'POST', headers: auth, body: JSON.stringify({ sizePct: 33, anchor: 'tl', nope: 'ignored' }),
  }).then(r => r.json());
  check('/save-defaults persists into the user config', defs.ok && defs.defaults.sizePct === 33 && defs.defaults.anchor === 'tl');
  check('/save-defaults never writes inside the package', defs.path && defs.path.startsWith(HOME), defs.path);
  check('/save-defaults drops unknown keys', defs.ok && defs.defaults.nope === undefined);

  const persisted = JSON.parse(fs.readFileSync(path.join(HOME, 'config', 'watermarks.json'), 'utf8'));
  check('the persisted config reloads with the new default', persisted.defaults.sizePct === 33);

  app.server.close();
  fs.rmSync(HOME, { recursive: true, force: true });
  console.log(failures ? '\n' + failures + ' check(s) failed' : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
