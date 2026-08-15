'use strict';
// Small helpers both tools used identically before the extraction. Plain globals, no module system —
// the tools are single-file canvas apps and a build step would be the only thing they're missing.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const clamp01 = v => clamp(v, 0, 1);

// Wire a row of buttons that behave as one setting: clicking one lights it and clears its siblings.
function seg(id, attr, cb) {
  const box = document.getElementById(id);
  if (!box) return;
  box.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      box.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      cb(b.dataset[attr]);
    };
  });
}

const rng = (id, cb) => { const el = document.getElementById(id); if (el) el.oninput = function () { cb(this.value); }; };
const txt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

// A transient message in an existing status line, restoring whatever was there before.
function makeToast(elId) {
  return t => {
    const el = document.getElementById(elId);
    if (!el) return;
    const prev = el.textContent;
    el.textContent = t;
    setTimeout(() => { if (el.textContent === t) el.textContent = prev; }, 2200);
  };
}

function fileToImg(file, cb) {
  const u = URL.createObjectURL(file), im = new Image();
  im.onload = () => { cb(im, file.name); URL.revokeObjectURL(u); };
  im.src = u;
}

function urlToImg(url, cb) {
  const im = new Image();
  im.onload = () => cb(im);
  im.src = url;
}

// A drop target that also opens a file dialog when clicked. `multiple` decides which of the two
// call shapes the callback gets: (img, name) per file, or one file only.
function wireDrop(el, cb, multiple) {
  if (!el) return;
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('hot'); });
  el.addEventListener('dragleave', () => el.classList.remove('hot'));
  el.addEventListener('drop', e => {
    e.preventDefault();
    el.classList.remove('hot');
    const files = [...e.dataTransfer.files];
    if (multiple) files.forEach(f => fileToImg(f, cb));
    else if (files[0]) fileToImg(files[0], cb);
  });
  el.addEventListener('click', () => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = 'image/*';
    if (multiple) i.multiple = true;
    i.onchange = () => {
      if (multiple) [...i.files].forEach(f => fileToImg(f, cb));
      else if (i.files[0]) fileToImg(i.files[0], cb);
    };
    i.click();
  });
}
