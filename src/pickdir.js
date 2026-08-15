'use strict';
// Native "choose a folder" dialog, per platform.
//
// Why not the browser's showDirectoryPicker()? Two reasons: it cannot be opened AT a path the user has
// already typed (its startIn takes a handle or a well-known name, never a path), and it yields a handle
// rather than a real absolute path — which the /save route needs in order to write full-res exports.
// Every branch resolves to: {ok:true, path} | {ok:false, canceled} | {ok:false, unavailable}
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const isWSL = () => process.platform === 'linux' && /microsoft/i.test(os.release());

// A half-typed path should still land somewhere sensible: walk up to the nearest directory that exists.
function nearestExisting(start) {
  let p = start && path.isAbsolute(start) ? path.resolve(start) : '';
  while (p && p !== path.dirname(p)) {
    try { if (fs.statSync(p).isDirectory()) return p; } catch (_) { /* keep walking up */ }
    p = path.dirname(p);
  }
  const pics = path.join(os.homedir(), 'Pictures');
  return fs.existsSync(pics) ? pics : os.homedir();
}

const run = (cmd, args, cb) => execFile(cmd, args, { timeout: 5 * 60 * 1000, maxBuffer: 1 << 20 }, cb);

function pickDarwin(loc, done) {
  const script = 'set d to choose folder with prompt "Choose folder" default location POSIX file ' + JSON.stringify(loc);
  run('osascript', ['-e', 'activate', '-e', script, '-e', 'POSIX path of d'], (err, stdout, stderr) => {
    if (err) return done({ ok: false, canceled: /-128/.test(String(stderr) + String(err)) });
    const p = String(stdout).trim().replace(/\/$/, '');
    done(p ? { ok: true, path: p } : { ok: false, canceled: true });
  });
}

// Windows (and WSL, which shells out to the Windows-side PowerShell): WinForms folder browser.
function pickWindows(loc, done, translate) {
  const start = loc ? loc.replace(/'/g, "''") : '';
  const ps = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
    start ? "$d.SelectedPath = '" + start + "'" : '',
    "if ($d.ShowDialog() -eq 'OK') { [Console]::Out.Write($d.SelectedPath) }",
  ].filter(Boolean).join('; ');
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', ps], (err, stdout) => {
    if (err) return done({ ok: false, unavailable: true });
    const p = String(stdout).trim();
    if (!p) return done({ ok: false, canceled: true });
    translate ? translate(p, done) : done({ ok: true, path: p });
  });
}

// The dialog runs on the Windows side and returns C:\..., which the Linux-side /save cannot write to.
function pickWSL(loc, done) {
  let winStart = '';
  try { winStart = String(require('child_process').execFileSync('wslpath', ['-w', loc], { timeout: 5000 })).trim(); } catch (_) { /* optional */ }
  pickWindows(winStart, done, (winPath, cb) => {
    run('wslpath', ['-u', winPath], (err, stdout) => {
      const p = String(stdout || '').trim();
      cb(err || !p ? { ok: false, unavailable: true } : { ok: true, path: p });
    });
  });
}

function pickLinux(loc, done) {
  run('zenity', ['--file-selection', '--directory', '--title=Choose folder', '--filename=' + loc + '/'], (err, stdout) => {
    const p = String(stdout || '').trim();
    if (!err && p) return done({ ok: true, path: p });
    run('kdialog', ['--getexistingdirectory', loc], (e2, out2) => {
      const q = String(out2 || '').trim();
      if (!e2 && q) return done({ ok: true, path: q });
      // Both dialogs missing (headless, or neither toolkit installed) → the UI falls back to a typed path.
      done({ ok: false, unavailable: true });
    });
  });
}

function pickDir(start, done) {
  const loc = nearestExisting(start);
  if (process.platform === 'darwin') return pickDarwin(loc, done);
  if (process.platform === 'win32') return pickWindows(loc, done, null);
  if (isWSL()) return pickWSL(loc, done);
  if (process.platform === 'linux') return pickLinux(loc, done);
  done({ ok: false, unavailable: true });
}

module.exports = { pickDir, isWSL, nearestExisting };
