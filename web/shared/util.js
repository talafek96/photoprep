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

/* ---------- wheel: what device, and how much zoom ----------
 *
 * The browser fires the SAME wheel event for a mouse wheel and a two-finger trackpad swipe, so the
 * device has to be inferred. The tells: a mouse wheel is coarse and quantised (deltaMode LINE/PAGE,
 * or a large whole-number deltaY) and never reports deltaX; a trackpad sends small fractional deltas
 * and drifts sideways. It is a heuristic - some Windows precision touchpads report coarse deltas
 * like a mouse - so tools that can should show what they decided and let it be pinned.
 *
 * Pure on purpose: the caller owns the latch. The guess must LATCH rather than be recomputed from
 * scratch each event, or one ambiguous scroll flips the zoom direction mid-gesture. Pass the
 * previous guess in, store what comes back.
 */
function wheelDevice(e, prev) {
  if (e.deltaMode !== 0) return 'mouse';
  if (e.deltaX !== 0 || !Number.isInteger(e.deltaY)) return 'trackpad';
  if (Math.abs(e.deltaY) >= 50) return 'mouse';
  return prev || 'trackpad';
}

/* How much to multiply a zoom by for one wheel event.
 *
 * exp() of the delta is what makes zooming feel even: it scales with how hard the device says you
 * scrolled, so a big mouse notch and a feather-light trackpad drift both land where you expect. A
 * fixed step per event (scale *= 1.06) is the version that feels violent and untunable, because a
 * trackpad sends a STREAM of small deltas and the full step is applied to every one of them.
 *
 * The sign comes from the hardware, not from a mode: two fingers up on a trackpad reports deltaY
 * POSITIVE (natural scrolling) and must zoom IN, while a mouse wheel rolled forward reports NEGATIVE
 * and must also zoom in. One formula cannot serve both.
 */
function wheelZoomFactor(e, guess, k) {
  const pinch = e.ctrlKey;                       // a trackpad pinch arrives as ctrl+wheel
  const rate = k != null ? k : (pinch ? 0.012 : 0.003);
  const dir = (!pinch && guess === 'trackpad') ? 1 : -1;
  return Math.exp(dir * e.deltaY * rate);
}
