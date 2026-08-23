'use strict';
// Start the CLI the way a person does, and check it actually serves. Deliberately separate from
// smoke.js, which drives the server in-process: this is the path where a bad shebang, a broken
// require, or a platform-specific path bug shows up.
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'photoprep-cli-'));
const CLI = path.join(__dirname, '..', 'bin', 'cli.js');

let failures = 0;
const check = (name, cond, extra) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond || extra == null ? '' : '  → ' + extra));
  if (!cond) failures++;
};

// --no-open so CI never tries to launch a browser; --idle 0 so it can't outlive the test.
const child = spawn(process.execPath, [CLI, '--no-open', '--port', '0', '--idle', '0'], {
  env: { ...process.env, PHOTOPREP_HOME: HOME },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let out = '', done = false, probing = false;
const finish = code => {
  if (done) return;
  done = true;
  try { child.kill(); } catch (_) {}
  fs.rmSync(HOME, { recursive: true, force: true });
  console.log(failures ? '\n' + failures + ' check(s) failed' : '\nCLI works');
  process.exit(code != null ? code : (failures ? 1 : 0));
};

child.stderr.on('data', d => { out += d; });
child.stdout.on('data', async d => {
  out += d;
  const m = /PORT (\d+)/.exec(out);
  // Set the guard synchronously: the first await below yields, and a second stdout chunk would
  // otherwise start a duplicate run of every check.
  if (!m || done || probing) return;
  probing = true;

  const base = 'http://127.0.0.1:' + m[1];
  try {
    const health = await fetch(base + '/health').then(r => r.json());
    check('CLI starts and answers /health', health.ok === true && health.app === 'photoprep');
    check('CLI prints a URL carrying the write token', /\?t=[a-f0-9]{8,}/.test(out), out.split('\n')[1]);
    check('review is off unless --review is passed', health.review === false);
    check('user directory is created under PHOTOPREP_HOME', health.outDir.startsWith(HOME), health.outDir);

    for (const p of ['/', '/select/', '/sort/', '/layout/', '/watermark/', '/settings/']) {
      const r = await fetch(base + p);
      check('CLI serves ' + p, r.status === 200, r.status);
    }
  } catch (e) {
    check('CLI reachable', false, String(e));
  }
  finish();
});

child.on('error', e => { check('CLI spawns', false, String(e)); finish(1); });
setTimeout(() => { check('CLI started within 20s', false, out.slice(0, 300)); finish(1); }, 20000).unref?.();
