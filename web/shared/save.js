'use strict';
// Everything about getting a finished canvas onto disk. Both tools did this identically.
//
// Two write paths exist because neither covers every case:
//   • the server's /save — takes a real absolute path, so it can write straight into a shoot folder
//   • the browser's File System Access handle — the fallback when no native dialog is available
const PPSave = {
  destDir: '',
  dirHandle: null,
  onExist: 'rename',       // 'rename' (never clobber) | 'overwrite'

  setDest(p) {
    this.destDir = String(p || '').trim();
    this.dirHandle = null;
    return this.destDir;
  },

  canvasBlob(canvas, fmt, quality) {
    const type = fmt === 'png' ? 'image/png' : 'image/jpeg';
    return new Promise(res => canvas.toBlob(res, type, fmt === 'png' ? undefined : quality));
  },

  // `dir` overrides the destination for this one write — how "beside the source" puts each export
  // next to the photo it came from, when a batch was gathered from more than one folder.
  saveBlob(name, blob, dir) {
    const to = dir || this.destDir;
    const u = '/save?name=' + encodeURIComponent(name)
      + (to ? '&dir=' + encodeURIComponent(to) : '')
      + '&onExist=' + this.onExist;
    return fetch(u, { method: 'POST', body: blob }).then(r => r.json()).catch(() => ({ ok: false }));
  },

  async fileExists(dir, name) {
    try { await dir.getFileHandle(name); return true; } catch (e) { return false; }
  },

  async writeHandle(dir, name, blob, mode) {
    let fn = name;
    if (mode !== 'overwrite') {
      const dot = name.lastIndexOf('.');
      const base = dot >= 0 ? name.slice(0, dot) : name;
      const ext = dot >= 0 ? name.slice(dot) : '';
      let i = 1;
      while (await this.fileExists(dir, fn)) { fn = base + '_' + (i++) + ext; }
    }
    const fh = await dir.getFileHandle(fn, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    return fn;
  },

  // One export → {saved, out, renamed, bytes}; saved is null if the write failed.
  async writeOne(fname, blob, dir) {
    // A browser directory handle names one folder and can't reach outside it, so an explicit
    // per-file destination has to go through the server.
    if (dir) {
      const r = await this.saveBlob(fname, blob, dir);
      return r.ok ? { saved: r.path, out: r.name || fname, renamed: !!r.renamed, bytes: r.bytes }
                  : { saved: null, error: r.error || 'write failed' };
    }
    if (this.dirHandle) {
      try {
        const fn = await this.writeHandle(this.dirHandle, fname, blob, this.onExist);
        return { saved: '[' + this.dirHandle.name + ']/' + fn, out: fn, renamed: fn !== fname, bytes: blob.size };
      } catch (e) { return { saved: null }; }
    }
    const r = await this.saveBlob(fname, blob);
    return r.ok ? { saved: r.path, out: r.name || fname, renamed: !!r.renamed, bytes: r.bytes } : { saved: null };
  },

  destLabel() {
    return this.dirHandle ? '[' + this.dirHandle.name + ']' : (this.destDir || '(default out folder)');
  },

  // Only reaches the server in review mode; otherwise there is no assistant waiting to read it.
  // NB: PPRuntime is a `const` at script top level, which is a lexical global and NOT a property of
  // `window` — testing window.PPRuntime here silently disabled every report.
  postFeedback(name, obj) {
    if (typeof PPRuntime === 'undefined' || !PPRuntime.review) return Promise.resolve(null);
    return fetch('/feedback?name=' + encodeURIComponent(name), { method: 'POST', body: JSON.stringify(obj) })
      .then(r => r.json()).catch(() => null);
  },

  // Destination row: native dialog first (it can open AT a typed path and returns a real absolute
  // path), browser picker second, typed path always.
  wireDestPicker({ inputId, btnId, noteId, idleNote, onPicked }) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    const note = document.getElementById(noteId);
    const idle = idleNote || 'Click Choose… for a folder picker, or type a path (absolute, ~ ok).';
    const self = this;

    if (input) {
      input.oninput = function () {
        self.destDir = this.value.trim();
        if (self.destDir) { self.dirHandle = null; if (note) note.textContent = 'Path: ' + self.destDir; }
      };
    }
    if (!btn) return;

    btn.onclick = async () => {
      btn.disabled = true;
      if (note) note.textContent = 'Waiting for the folder picker…';
      // Why the native dialog can fail is worth saying out loud: on WSL it hands back a Windows path
      // that may name no folder this side of the boundary, and a silent no-op there reads as a dead
      // button rather than as something the person can act on.
      let why = 'The folder picker did not return a path.';
      try {
        const typed = input ? input.value.trim() : '';
        const r = await fetch('/pickdir?start=' + encodeURIComponent(typed)).then(x => x.json());
        if (r.ok) {
          self.destDir = r.path;
          self.dirHandle = null;
          if (input) input.value = r.path;
          if (note) note.textContent = 'Path: ' + r.path;
          if (onPicked) onPicked(r.path);
          return;
        }
        if (r.canceled) { if (note) note.textContent = self.destDir ? ('Path: ' + self.destDir) : idle; return; }
        if (r.error) why = r.error;
      } catch (e) { why = 'Could not reach the folder picker — is photoprep still running?'; }
      finally { btn.disabled = false; }

      if (note) note.textContent = why;
      if (!window.showDirectoryPicker) return;
      try {
        const opts = { mode: 'readwrite' };
        if (self.dirHandle) opts.startIn = self.dirHandle;
        const h = await window.showDirectoryPicker(opts);
        self.dirHandle = h;
        self.destDir = '';
        if (input) input.value = '';
        if (note) note.textContent = 'Folder: ' + h.name + ' (picker)';
        if (onPicked) onPicked('[' + h.name + ']');
      } catch (e) { /* user dismissed it */ }
    };
  },
};
