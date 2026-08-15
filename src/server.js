'use strict';
// The one photoprep server. Serves the tool pages and gives them the few things a browser cannot do
// for itself: write a full-resolution export straight to disk, open a native folder dialog, and
// remember the user's brand and defaults between sessions.
//
// Serving over http (rather than opening the HTML as a file://) is what keeps the canvas untainted,
// which is what makes export work at all.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pickDir } = require('./pickdir');
const P = require('./paths');

const PKG = path.join(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.avif': 'image/avif',
};
const SAFE_NAME = /^[\w.\- ]+\.(png|jpe?g|webp)$/i;
const DEFAULT_IDLE_MS = 8 * 60 * 60 * 1000;   // a GUI app may sit open all day; the AI-driven case exits with the run

function createServer(opts = {}) {
  const dirs = P.ensure();
  const webRoot = opts.webRoot || path.join(PKG, 'web');
  const assetsDir = P.brandAssetsDir(opts.assetsDir);
  const configPath = P.brandConfigPath(opts.configPath);
  const workDir = opts.workDir || path.join(dirs.root, 'work');
  const outDir = opts.outDir || dirs.out;
  const feedbackDir = path.join(dirs.root, 'feedback');
  const idleMs = opts.idleMs != null ? opts.idleMs : Number(process.env.PHOTOPREP_IDLE_MS || DEFAULT_IDLE_MS);
  // Opt-in (`--review`): surfaces the approve / reject / note-to-assistant workflow and lets the page
  // report what the person actually decided. Off by default — someone using photoprep on their own has
  // nobody to report to, and the extra controls would just be noise.
  const review = opts.review != null ? !!opts.review : process.env.PHOTOPREP_REVIEW === '1';
  const token = opts.token || crypto.randomBytes(16).toString('hex');
  for (const d of [workDir, outDir, feedbackDir]) fs.mkdirSync(d, { recursive: true });

  const mounts = [
    { prefix: '/assets/', dir: assetsDir },
    { prefix: '/work/', dir: workDir },
    { prefix: '/', dir: webRoot },
  ];

  let idleTimer;
  const bumpIdle = () => {
    clearTimeout(idleTimer);
    if (!idleMs) return;
    idleTimer = setTimeout(() => { try { server.close(); } catch (_) {} process.exit(0); }, idleMs);
    if (idleTimer.unref) idleTimer.unref();
  };

  const send = (res, code, body, type) => {
    res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  };
  const json = (res, obj, code) => send(res, code || 200, JSON.stringify(obj), TYPES['.json']);
  const body = (req, cb) => { const c = []; req.on('data', b => c.push(b)); req.on('end', () => cb(Buffer.concat(c))); };

  // The write routes can put bytes anywhere on disk, so they must only answer OUR page. A cross-origin
  // fetch omits the cookie and carries a foreign Origin, so any other site open in the same browser is
  // refused — without the page needing to pass a token around itself.
  const cookieOf = req => {
    const m = /(?:^|;\s*)pp_token=([a-f0-9]+)/.exec(req.headers.cookie || '');
    return m && m[1];
  };
  const authed = (req, url) => {
    const origin = req.headers.origin;
    if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return false;
    const given = cookieOf(req) || url.searchParams.get('t') || req.headers['x-photoprep-token'];
    return given === token;
  };

  const serveFile = (res, full, setCookie) => {
    fs.readFile(full, (err, buf) => {
      if (err) return send(res, 404, 'not found');
      const headers = {
        'Content-Type': TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      };
      if (setCookie) headers['Set-Cookie'] = 'pp_token=' + token + '; Path=/; SameSite=Strict; Max-Age=86400';
      res.writeHead(200, headers);
      res.end(buf);
    });
  };

  const server = http.createServer((req, res) => {
    bumpIdle();
    const url = new URL(req.url, 'http://127.0.0.1');
    const route = decodeURIComponent(url.pathname);
    const needsAuth = ['/save', '/feedback', '/save-defaults', '/pickdir'].includes(route);
    if (needsAuth && !authed(req, url)) return send(res, 403, 'forbidden');

    // --- who am I: lets a caller confirm the server is photoprep and which brand it loaded ---
    if (route === '/health') {
      return json(res, { ok: true, app: 'photoprep', review, configPath, assetsDir, outDir, workDir });
    }

    // --- switches the page reads at boot ---
    if (route === '/runtime.json') return json(res, { review });

    // --- write a full-resolution export: POST /save?name=foo.jpg[&dir=/abs][&onExist=rename|overwrite] ---
    if (req.method === 'POST' && route === '/save') {
      // Reject a name that isn't already a bare filename rather than quietly basename()-ing it — a
      // caller asking to write '../x.png' has a bug worth surfacing, not a path worth guessing at.
      const name = (url.searchParams.get('name') || '').trim();
      if (name !== path.basename(name) || !SAFE_NAME.test(name)) return send(res, 400, 'bad name');
      let target = outDir;
      const rawDir = (url.searchParams.get('dir') || '').trim();
      if (rawDir) {
        // Test the RAW value: expanding first would resolve a relative path against the server's cwd,
        // which is never what the caller meant.
        if (!rawDir.startsWith('~') && !path.isAbsolute(rawDir)) return send(res, 400, 'dir must be absolute');
        target = P.expand(rawDir);
      }
      const overwrite = url.searchParams.get('onExist') === 'overwrite';
      return body(req, buf => {
        fs.mkdir(target, { recursive: true }, mkErr => {
          if (mkErr) return json(res, { ok: false, error: 'mkdir: ' + mkErr.message }, 500);
          let finalName = name;
          if (!overwrite) {
            const dot = name.lastIndexOf('.');
            const base = dot >= 0 ? name.slice(0, dot) : name;
            const ext = dot >= 0 ? name.slice(dot) : '';
            let i = 1;
            while (fs.existsSync(path.join(target, finalName))) finalName = base + '_' + (i++) + ext;
          }
          const dest = path.join(target, finalName);
          fs.writeFile(dest, buf, err => err
            ? json(res, { ok: false, error: 'write failed' }, 500)
            : json(res, { ok: true, path: dest, name: finalName, renamed: finalName !== name, bytes: buf.length }));
        });
      });
    }

    // --- native folder dialog: GET /pickdir?start=<abs path> ---
    if (req.method === 'GET' && route === '/pickdir') {
      return pickDir(P.expand(url.searchParams.get('start')), r => json(res, r));
    }

    // --- the page's export report, kept on disk so an assistant can read the run afterwards ---
    if (req.method === 'POST' && route === '/feedback') {
      if (!review) return json(res, { ok: false, disabled: true }, 404);
      let name = path.basename(url.searchParams.get('name') || '');
      if (!/^[\w.\-]+\.json$/i.test(name)) name = 'feedback_' + Date.now() + '.json';
      return body(req, buf => fs.writeFile(path.join(feedbackDir, name), buf, err => err
        ? json(res, { ok: false }, 500)
        : json(res, { ok: true, path: path.join(feedbackDir, name) })));
    }

    // --- persist placement defaults into the USER's brand config, never into the installed package ---
    if (req.method === 'POST' && route === '/save-defaults') {
      return body(req, buf => {
        try {
          const incoming = JSON.parse(buf.toString() || '{}');
          const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          const allow = ['anchor', 'insetX', 'insetY', 'sizePct', 'opacity', 'format', 'quality'];
          cfg.defaults = cfg.defaults || {};
          for (const k of allow) if (incoming[k] != null) cfg.defaults[k] = incoming[k];
          // An unwritable config means we're running off the bundled default — fork it into the user dir.
          const dest = configPath.startsWith(PKG) ? path.join(dirs.config, 'watermarks.json') : configPath;
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, JSON.stringify(cfg, null, 2) + '\n');
          json(res, { ok: true, defaults: cfg.defaults, path: dest });
        } catch (e) {
          json(res, { ok: false, error: String(e) }, 500);
        }
      });
    }

    // --- the active brand config, wherever it actually lives ---
    if (req.method === 'GET' && route === '/config/watermarks.json') return serveFile(res, configPath, false);

    // --- static ---
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    let rel = route === '/' ? '/index.html' : route;
    if (rel.endsWith('/')) rel += 'index.html';
    for (const m of mounts) {
      if (!rel.startsWith(m.prefix)) continue;
      const full = path.resolve(m.dir, '.' + rel.slice(m.prefix.length - 1));
      if (full !== m.dir && !full.startsWith(m.dir + path.sep)) return send(res, 403, 'forbidden');
      if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) continue;
      return serveFile(res, full, path.extname(full).toLowerCase() === '.html');
    }
    return send(res, 404, 'not found');
  });

  function listen(port, host) {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port == null ? 0 : port, host || '127.0.0.1', () => {
        bumpIdle();
        const actual = server.address().port;
        resolve({ port: actual, token, url: 'http://127.0.0.1:' + actual + '/' });
      });
    });
  }

  return { server, listen, token, paths: { webRoot, assetsDir, configPath, workDir, outDir, feedbackDir } };
}

module.exports = { createServer };
