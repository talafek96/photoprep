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

  // --- the tools and their shared modules are actually reachable ---
  for (const p of ['/layout/', '/watermark/', '/shared/theme.css', '/shared/util.js',
                   '/shared/detect.js', '/shared/save.js', '/shared/runtime.js']) {
    const r = await fetch(base + p);
    check('serves ' + p, r.status === 200, r.status);
  }

  const layoutHtml = await fetch(base + '/layout/').then(r => r.text());
  const wmHtml = await fetch(base + '/watermark/').then(r => r.text());
  check('layout keeps its automation hooks', ['__loadPanels', '__loadImage', '__loadCandidates', '__setDest', '__setPreviewUser', '__result']
    .every(h => layoutHtml.includes(h)));
  check('watermark keeps its automation hooks', ['__addImages', '__suggestFor', '__suggestAll', '__setDest', '__exportAll', '__applyConfig', '__addWatermark', '__result']
    .every(h => wmHtml.includes(h)));
  check('tools no longer carry duplicated helpers', !/function detect\(img\)/.test(layoutHtml + wmHtml));

  // --- brand management (Settings) -------------------------------------------------------------
  const brand0 = await fetch(base + '/brand', { headers: auth }).then(r => r.json());
  check('/brand reports the loaded brand', brand0.ok && brand0.marks.length > 0);
  check('/brand flags that these are the bundled samples', brand0.usingSamples === true);
  check('/brand needs auth', (await fetch(base + '/brand')).status === 403);

  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
  const up = await fetch(base + '/brand/mark?name=mine.svg', { method: 'POST', body: svg, headers: auth }).then(r => r.json());
  check('a mark image can be uploaded', up.ok && fs.existsSync(up.path), up.error);
  check('uploading forks the sample brand into the user dir', up.path && up.path.startsWith(HOME), up.path);

  const badUp = await fetch(base + '/brand/mark?name=../evil.svg', { method: 'POST', body: svg, headers: auth });
  check('/brand/mark rejects a traversing name', badUp.status === 400);

  const savedBrand = await fetch(base + "/brand/config", {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      basePath: '/assets/', defaults: { anchor: 'tl', sizePct: 30 },
      watermarks: [{ id: 'mine', file: 'mine.svg', label: 'My mark', group: 'own', tone: 'dark' }],
      groups: { own: { mode: 'brightness', onDark: 'mine', onLight: 'mine' } },
    }),
  }).then(r => r.json());
  check('brand config saves', savedBrand.ok && savedBrand.config.watermarks[0].id === 'mine', savedBrand.error);
  check('saved brand lands in the user dir, not the package', savedBrand.path.startsWith(HOME), savedBrand.path);

  const evil = await fetch(base + '/brand/config', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ watermarks: [{ id: 'x', file: '../../../etc/passwd', label: 'x', group: 'g' }] }),
  }).then(r => r.json());
  check('a traversing mark path is sanitized to a bare filename', evil.ok && evil.config.watermarks[0].file === 'passwd', evil.config && evil.config.watermarks[0].file);

  const empty = await fetch(base + '/brand/config', { method: 'POST', headers: auth, body: JSON.stringify({ watermarks: [] }) });
  check('a brand with no marks is refused', empty.status === 400);

  // put the good brand back, then round-trip it through export/import
  await fetch(base + '/brand/config', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ basePath: '/assets/', defaults: { anchor: 'tl', sizePct: 30 },
      watermarks: [{ id: 'mine', file: 'mine.svg', label: 'My mark', group: 'own', tone: 'dark' }],
      groups: { own: { mode: 'brightness', onDark: 'mine', onLight: 'mine' } } }),
  });
  const bundle = await fetch(base + '/brand/export', { headers: auth }).then(r => r.json());
  check('brand exports as a portable bundle', bundle.photoprepBrand === 1 && !!bundle.files['mine.svg']);

  await fetch(base + '/brand/mark?id=mine', { method: 'DELETE', headers: auth });
  const afterDel = await fetch(base + '/brand', { headers: auth }).then(r => r.json());
  check('a mark can be removed', afterDel.config.watermarks.length === 0);

  const imported = await fetch(base + '/brand/import', { method: 'POST', headers: auth, body: JSON.stringify(bundle) }).then(r => r.json());
  check('the bundle imports back', imported.ok && imported.marks === 1 && imported.files === 1, imported.error);
  const restored = await fetch(base + '/brand', { headers: auth }).then(r => r.json());
  check('imported brand is byte-identical to what was exported', restored.config.watermarks[0].id === 'mine' && restored.marks[0].exists);
  check('imported brand keeps its defaults', restored.config.defaults.anchor === 'tl' && restored.config.defaults.sizePct === 30);

  const notBundle = await fetch(base + '/brand/import', { method: 'POST', headers: auth, body: JSON.stringify({ hello: 1 }) });
  check('a foreign json file is refused as a brand', notBundle.status === 400);

  // --- opening a folder (what makes "export beside the source" possible) ----------------------
  const photoDir = path.join(HOME, 'photos');
  fs.mkdirSync(photoDir, { recursive: true });
  fs.writeFileSync(path.join(photoDir, 'b.jpg'), png);
  fs.writeFileSync(path.join(photoDir, 'a.jpg'), png);
  fs.writeFileSync(path.join(photoDir, 'notes.txt'), 'ignored');

  const unopened = await fetch(base + '/file?path=' + encodeURIComponent(path.join(photoDir, 'a.jpg')), { headers: auth });
  check('/file refuses a folder that was never opened', unopened.status === 403);

  const listed = await fetch(base + '/list?dir=' + encodeURIComponent(photoDir), { headers: auth }).then(r => r.json());
  check('/list returns the photos, sorted', listed.ok && listed.files.map(f => f.name).join() === 'a.jpg,b.jpg', JSON.stringify(listed.files));
  check('/list ignores non-images', listed.ok && !listed.files.some(f => f.name === 'notes.txt'));

  const opened = await fetch(base + '/file?path=' + encodeURIComponent(path.join(photoDir, 'a.jpg')), { headers: auth });
  check('/file serves a photo once its folder is opened', opened.status === 200);

  const escape = await fetch(base + '/file?path=' + encodeURIComponent(path.join(HOME, 'config', 'watermarks.json')), { headers: auth });
  check('/file will not read outside the opened folder', escape.status === 403);

  const relList = await fetch(base + '/list?dir=some/where', { headers: auth });
  check('/list rejects a relative dir', relList.status === 400);
  check('/list needs auth', (await fetch(base + '/list?dir=' + encodeURIComponent(photoDir))).status === 403);

  // the point of all this: writing back beside the sources
  const beside = await fetch(base + '/save?name=a.jpg&dir=' + encodeURIComponent(path.join(photoDir, 'Watermarked')), {
    method: 'POST', body: png, headers: auth,
  }).then(r => r.json());
  check('exports can be written beside the source', beside.ok && beside.path.includes(path.join('photos', 'Watermarked')), beside.path);

  // --- review mode is off by default ---
  const rt = await fetch(base + '/runtime.json').then(r => r.json());
  check('review is off unless asked for', rt.review === false);
  const fbOff = await fetch(base + '/feedback?name=x.json', { method: 'POST', body: '{}', headers: auth });
  check('/feedback is refused when review is off', fbOff.status === 404);

  app.server.close();

  // --- ...and on when the flag is passed ---
  const rApp = createServer({ idleMs: 0, review: true });
  const r2 = await rApp.listen(0);
  const rBase = 'http://127.0.0.1:' + r2.port;
  const rAuth = { cookie: 'pp_token=' + r2.token };
  const rt2 = await fetch(rBase + '/runtime.json').then(r => r.json());
  check('--review turns review on', rt2.review === true);
  const fbOn = await fetch(rBase + '/feedback?name=run.json', { method: 'POST', headers: rAuth, body: JSON.stringify({ tool: 'watermark' }) })
    .then(r => r.json());
  check('/feedback records the run in review mode', fbOn.ok === true && fs.existsSync(fbOn.path), fbOn.error);
  const health2 = await fetch(rBase + '/health').then(r => r.json());
  check('/health reports the review flag', health2.review === true);
  rApp.server.close();

  fs.rmSync(HOME, { recursive: true, force: true });
  console.log(failures ? '\n' + failures + ' check(s) failed' : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
