'use strict';
// Open a URL in whatever the user considers their browser.
//
// Under WSL the Linux side usually has no browser at all — the one the person is looking at is on the
// Windows side, and it can reach the Linux server through localhost, so we hand the URL to Windows.
const os = require('os');
const { execFile } = require('child_process');

const isWSL = () => process.platform === 'linux' && /microsoft/i.test(os.release());

function openBrowser(url, done) {
  const cb = done || (() => {});
  const tries = [];

  if (process.platform === 'darwin') tries.push(['open', [url]]);
  else if (process.platform === 'win32') tries.push(['cmd', ['/c', 'start', '', url]]);
  else if (isWSL()) {
    // wslview (wslu) is the polite option; falling back to powershell, which is always present.
    tries.push(['wslview', [url]]);
    tries.push(['powershell.exe', ['-NoProfile', '-Command', 'Start-Process', '"' + url + '"']]);
  } else {
    tries.push(['xdg-open', [url]]);
    tries.push(['gio', ['open', url]]);
  }

  (function next(i) {
    if (i >= tries.length) return cb(new Error('could not open a browser'));
    execFile(tries[i][0], tries[i][1], err => (err ? next(i + 1) : cb(null, tries[i][0])));
  })(0);
}

module.exports = { openBrowser, isWSL };
