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
    if (err) return done({ ok: false, unavailable: true, error: 'Could not open the Windows folder dialog: ' + (err.message || err) });
    const p = String(stdout).trim();
    if (!p) return done({ ok: false, canceled: true });
    translate ? translate(p, done) : done({ ok: true, path: p });
  });
}

// Windows paths, translated to Linux ones without asking wslpath — because wslpath refuses the UNC
// form (\\wsl.localhost\<distro>\...) the dialog hands back whenever the chosen folder is inside WSL
// itself, which is where a WSL user's photos usually live. Losing that case silently is what made
// "choose a folder" look like it did nothing at all.
function wslToLinux(winPath) {
  const w = String(winPath).replace(/\//g, '\\');
  const unc = w.match(/^\\\\wsl(?:\.localhost|\$)\\([^\\]+)\\?(.*)$/i);
  if (unc) {
    const here = process.env.WSL_DISTRO_NAME || '';
    // Another distro's filesystem isn't mounted here, so a path into it would fail at write time.
    if (here && unc[1].toLowerCase() !== here.toLowerCase()) return { other: unc[1] };
    return { path: '/' + unc[2].replace(/\\/g, '/') };
  }
  const drive = w.match(/^([A-Za-z]):\\?(.*)$/);
  if (drive) return { path: '/mnt/' + drive[1].toLowerCase() + (drive[2] ? '/' + drive[2].replace(/\\/g, '/') : '') };
  return {};
}

// The dialog runs on the Windows side and returns a Windows path, which the Linux-side /save cannot
// write to. Ask wslpath, then fall back to translating it here; either way the answer only counts if
// it names a directory that actually exists.
function pickWSL(loc, done) {
  let winStart = '';
  try { winStart = String(require('child_process').execFileSync('wslpath', ['-w', loc], { timeout: 5000 })).trim(); } catch (_) { /* optional */ }
  const isDir = p => { try { return !!p && fs.statSync(p).isDirectory(); } catch (_) { return false; } };
  pickWindows(winStart, done, (winPath, cb) => {
    run('wslpath', ['-u', winPath], (err, stdout) => {
      const p = String(stdout || '').trim();
      if (!err && isDir(p)) return cb({ ok: true, path: p });
      const t = wslToLinux(winPath);
      if (t.other) return cb({ ok: false, unavailable: true, error: winPath + ' is in the ' + t.other + ' distribution, which this one cannot write to. Choose a folder in ' + (process.env.WSL_DISTRO_NAME || 'this distribution') + ' or on a Windows drive.' });
      if (isDir(t.path)) return cb({ ok: true, path: t.path });
      cb({ ok: false, unavailable: true, error: 'Chose ' + winPath + ', but this WSL distribution has no such folder' + (t.path ? ' (tried ' + t.path + ')' : '') + '.' });
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
      done({ ok: false, unavailable: true, error: 'No folder dialog available — install zenity or kdialog, or type the path.' });
    });
  });
}

function pickDir(start, done) {
  const loc = nearestExisting(start);
  if (process.platform === 'darwin') return pickDarwin(loc, done);
  if (process.platform === 'win32') return pickWindows(loc, done, null);
  if (isWSL()) return pickWSL(loc, done);
  if (process.platform === 'linux') return pickLinux(loc, done);
  done({ ok: false, unavailable: true, error: 'No folder dialog on ' + process.platform + ' — type the path instead.' });
}

module.exports = { pickDir, isWSL, nearestExisting, wslToLinux };
