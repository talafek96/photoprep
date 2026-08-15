'use strict';
// Where photoprep keeps a user's own stuff (brand marks, saved defaults, recent folders).
//
// This lives OUTSIDE the installed package on purpose: `npx photoprep` may fetch a fresh copy of the
// package on every run, so anything written inside the install directory would be lost on upgrade.
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP = 'photoprep';

function userDir() {
  if (process.env.PHOTOPREP_HOME) return path.resolve(process.env.PHOTOPREP_HOME);
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', APP);
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), APP);
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), APP);
}

const dirs = () => {
  const root = userDir();
  return { root, assets: path.join(root, 'assets'), config: path.join(root, 'config'), out: path.join(root, 'out') };
};

function ensure() {
  const d = dirs();
  for (const p of [d.root, d.assets, d.config, d.out]) fs.mkdirSync(p, { recursive: true });
  return d;
}

// Expand a leading ~ and resolve. Returns '' for empty input so callers can treat it as "not set".
function expand(p) {
  const s = String(p || '').trim();
  if (!s) return '';
  if (s === '~') return os.homedir();
  if (s.startsWith('~/') || s.startsWith('~\\')) return path.join(os.homedir(), s.slice(2));
  return path.resolve(s);
}

// The brand config in use: the user's own if present, else the neutral one bundled with the package.
// Callers pass an explicit override (--config) to point at a brand kept in another repo.
function brandConfigPath(override) {
  if (override) return expand(override);
  const mine = path.join(dirs().config, 'watermarks.json');
  if (fs.existsSync(mine)) return mine;
  return path.join(__dirname, '..', 'config', 'default-watermarks.json');
}

// Likewise for the mark images the config's `file` entries resolve against.
function brandAssetsDir(override) {
  if (override) return expand(override);
  const mine = dirs().assets;
  try {
    if (fs.readdirSync(mine).some(f => /\.(png|webp|svg)$/i.test(f))) return mine;
  } catch (_) { /* not created yet */ }
  return path.join(__dirname, '..', 'assets', 'samples');
}

module.exports = { APP, userDir, dirs, ensure, expand, brandConfigPath, brandAssetsDir };
