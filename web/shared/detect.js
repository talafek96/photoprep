'use strict';
// Guess whether an image already carries a watermark, by looking for a corner with far more edge
// detail than the middle of the frame — which is what a logo sitting on smooth sky or water looks
// like numerically.
//
// This is a HINT, not a verdict: it misfires on busy corners and misses marks over detailed subjects.
// Both tools show it as a dismissible warning, never as an automatic decision.
function detectWatermark(img) {
  const c = document.createElement('canvas'), n = 200;
  c.width = n; c.height = n;
  const g = c.getContext('2d', { willReadFrequently: true });

  function edge(sx, sy, sw, sh) {
    g.clearRect(0, 0, n, n);
    g.drawImage(img, sx, sy, sw, sh, 0, 0, n, n);
    const d = g.getImageData(0, 0, n, n).data;
    let e = 0;
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        const i = (y * n + x) * 4, r = (y * n + x + 1) * 4, dn = ((y + 1) * n + x) * 4;
        e += Math.abs(d[i] - d[r]) + Math.abs(d[i] - d[dn]);
      }
    }
    return e / (n * n);
  }

  const W = img.width, H = img.height, cw = W * 0.42, ch = H * 0.22;
  const corners = {
    br: edge(W - cw, H - ch, cw, ch), bl: edge(0, H - ch, cw, ch),
    tr: edge(W - cw, 0, cw, ch), tl: edge(0, 0, cw, ch),
  };
  const mid = edge(W * 0.29, H * 0.39, cw, ch);

  let best = 'br', bv = -1;
  for (const k in corners) if (corners[k] > bv) { bv = corners[k]; best = k; }
  return { likely: bv / (mid + 1e-6) > 1.6 && bv > 14, corner: best, score: +(bv / (mid + 1e-6)).toFixed(2) };
}
