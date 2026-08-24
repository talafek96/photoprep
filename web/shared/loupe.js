'use strict';
/* The loupe: a fullscreen look at one thing, with zoom and pan.
 *
 * Extracted from Select, where all of this was learned the hard way, so that Sort can have the same
 * hands. Nothing here knows what it is showing - it is handed a STAGE and a CONTENT element with a
 * natural pixel size, and it does fit, zoom, pan and the input-device argument. What the content IS
 * (one photograph, or a composed slide made of several) belongs to the tool.
 *
 * The behaviours worth not re-deriving:
 *   - a bare wheel means opposite things on a mouse and a trackpad, and the browser fires the same
 *     event for both, so the device has to be inferred - and the guess must LATCH;
 *   - discrete jumps animate, continuous gestures never do;
 *   - a click on the empty space beside the content leaves, but a pan that ended there must not;
 *   - setPointerCapture retargets pointerup, so "did the press land on the content" has to be
 *     recorded at pointerdown.
 *
 * ONE REQUIREMENT ON THE CALLER'S CSS: the stage must not lay the content out. The content is
 * positioned entirely by the transform written here, from the stage's top-left, with
 * `transform-origin: 0 0`. A stage that also centres its child (`place-items:center`, auto margins,
 * flex centring) adds a layout offset on top of that translate, and the content then sits off-centre
 * by half the free space while every number in this file reads as perfectly centred.
 */
const PPLoupe = {
  /* opts:
   *   root      the overlay element (gets .on / .closing)
   *   stage     the scrolling/clipping box the content sits in
   *   content   the element that is transformed
   *   zoomEl    optional: element to write "fit" / "180%" into
   *   onClose   optional: called after the close animation finishes
   *   canClose  optional: () => boolean, veto for click-outside-to-close
   *   onInput   optional: called when the device guess or pin changes
   */
  create(opts) {
    const L = {
      root: opts.root,
      stage: opts.stage,
      content: opts.content,
      z: { scale:1, x:0, y:0, fit:1, natural:[0, 0] },
      input: 'auto',            // 'auto' | 'mouse' | 'trackpad' — an explicit pin overrides the sniff
      guess: 'trackpad',
      space: false,             // held: scrolling does the OTHER thing, for as long as you hold it
      closeT: null,
    };

    const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

    L.isOpen = () => L.root.classList.contains('on');

    L.setNatural = (w, h) => { L.z.natural = [w, h]; };

    // Clear the transform before loading something new. Without it, a content element whose size is
    // not yet known - a photo still downloading, or one that failed - inherits wherever the last one
    // was panned and zoomed to, and the loupe opens off-centre for reasons nothing on screen explains.
    L.reset = () => {
      L.z.natural = [0, 0];
      L.z.scale = 1; L.z.fit = 1; L.z.x = 0; L.z.y = 0;
      L.apply(false);
    };

    // `animate` is for DISCRETE jumps only - double-click, the 0 and 1 keys. Continuous input
    // (wheel, pinch, drag) must stay instant: a transition chasing a live gesture always lags behind
    // the finger, which reads as broken rather than smooth. Any such event also clears the
    // transition, so a jump still in flight is cancelled the moment you take over.
    L.apply = animate => {
      const c = L.content;
      c.style.transition = (animate && !reduce()) ? 'transform .42s cubic-bezier(.16,1,.3,1)' : 'none';
      c.style.transform = 'translate(' + L.z.x + 'px,' + L.z.y + 'px) scale(' + L.z.scale + ')';
      if (opts.zoomEl) {
        opts.zoomEl.textContent = Math.abs(L.z.scale - L.z.fit) < 0.001
          ? 'fit' : Math.round(L.z.scale * 100) + '%';
      }
    };

    L.fit = animate => {
      const [w, h] = L.z.natural;
      if (!w) return;
      const s = Math.min(L.stage.clientWidth / w, L.stage.clientHeight / h) * 0.94;
      L.z.fit = s; L.z.scale = s;
      L.z.x = (L.stage.clientWidth - w * s) / 2;
      L.z.y = (L.stage.clientHeight - h * s) / 2;
      L.apply(animate);
    };

    L.zoomAt = (cx, cy, factor, animate) => {
      const st = L.stage.getBoundingClientRect();
      const px = cx - st.left, py = cy - st.top;
      const ns = Math.min(12, Math.max(L.z.fit * 0.5, L.z.scale * factor));
      // keep the point under the cursor fixed
      L.z.x = px - (px - L.z.x) * (ns / L.z.scale);
      L.z.y = py - (py - L.z.y) * (ns / L.z.scale);
      L.z.scale = ns;
      L.apply(animate);
    };

    L.atFit = () => Math.abs(L.z.scale - L.z.fit) < 0.001;

    // Lightroom's zoom toggle: fit <-> 100%, about the centre of the stage.
    L.toggleZoom = () => {
      if (L.atFit()) {
        const r = L.stage.getBoundingClientRect();
        L.zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / L.z.scale, true);
      } else L.fit(true);
    };

    L.actual = () => {
      const r = L.stage.getBoundingClientRect();
      L.zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / L.z.scale, true);
    };

    // What the WHEEL does, which is the only thing anyone cares about — not what hardware it thinks
    // you have. A plain two-way switch: the three-state auto/mouse/trackpad cycle made you press it
    // twice to get back where you were and never showed which state was which.
    L.device = () => (L.input === 'auto' ? L.guess : L.input);
    // what a bare scroll does at this instant, with the space key taken into account
    L.zooms = () => (L.device() === 'mouse') !== !!L.space;
    L.toggleScrollMode = () => {
      L.input = L.device() === 'mouse' ? 'trackpad' : 'mouse';
      if (opts.onInput) opts.onInput(L);
      return L.input;
    };

    L.open = () => {
      L.root.classList.remove('closing');
      L.root.classList.add('on');
    };

    L.close = () => {
      if (!L.isOpen() || L.root.classList.contains('closing')) return;
      const done = () => {
        L.root.classList.remove('on', 'closing');
        L.space = false; L.stage.classList.remove('spaceHeld');
        L.closeT = null;
        if (opts.onClose) opts.onClose();
      };
      if (reduce()) return done();
      L.root.classList.add('closing');
      clearTimeout(L.closeT);
      L.closeT = setTimeout(done, 250);
    };

    /* --- input ------------------------------------------------------------------------------- */
    const st = L.stage;

    // A bare wheel means opposite things on the two devices, and the browser fires the SAME event
    // for both, so it has to be inferred:
    //   mouse    -> wheel = zoom, drag = pan          (a wheel is the natural zoom)
    //   trackpad -> pinch = zoom, two-finger = pan    (a two-finger scroll must not zoom)
    //   either   -> ctrl+wheel = zoom, drag = pan     (the universal desktop convention)
    //
    // The tells: a mouse wheel is coarse and quantised (deltaMode LINE/PAGE, or a large whole-number
    // deltaY) and never reports deltaX. A trackpad sends small fractional deltas and drifts
    // sideways. The guess LATCHES rather than being recomputed per event, so one ambiguous scroll
    // can't flip the behaviour mid-gesture. It is a heuristic - some Windows precision touchpads
    // report coarse deltas like a mouse - so the tool shows what it decided and lets you pin it.
    function sniff(e) {
      if (L.input !== 'auto') return L.input;
      if (e.deltaMode !== 0) { L.guess = 'mouse'; }
      else if (e.deltaX !== 0 || !Number.isInteger(e.deltaY)) { L.guess = 'trackpad'; }
      else if (Math.abs(e.deltaY) >= 50) { L.guess = 'mouse'; }
      if (opts.onInput) opts.onInput(L);
      return L.guess;
    }

    st.addEventListener('wheel', e => {
      e.preventDefault();
      const dev = sniff(e);
      // exp() keeps the zoom perceptually even regardless of how big a delta the device reports.
      //
      // The SIGN has to come from the hardware, not the mode. Two fingers up on a trackpad reports
      // deltaY POSITIVE (natural scrolling) and should zoom IN; a mouse wheel rolled forward reports
      // deltaY NEGATIVE and should also zoom in. One formula cannot serve both, so the sniffed
      // device picks the direction while the pin picks zoom-vs-pan.
      // Photoshop's hand tool, and the reason it has survived thirty years: the two things you want
      // from a scroll in a zoomed image are both wanted CONSTANTLY, and a mode you have to switch
      // makes you pay for the wrong guess every time. Holding space inverts whichever way round the
      // pair currently sits, for exactly as long as you hold it. S decides the resting state.
      const wantZoom = (dev === 'mouse') !== !!L.space;
      if (e.ctrlKey || wantZoom) {
        const k = e.ctrlKey ? 0.012 : 0.003;
        const dir = (!e.ctrlKey && L.guess === 'trackpad') ? 1 : -1;
        L.zoomAt(e.clientX, e.clientY, Math.exp(dir * e.deltaY * k));
      } else {
        L.z.x -= e.deltaX;
        L.z.y -= e.deltaY;
        L.apply();
      }
    }, { passive:false });

    // double-click toggles fit <-> 100% at the cursor, as in every image viewer
    st.addEventListener('dblclick', e => {
      e.preventDefault();
      if (L.atFit()) L.zoomAt(e.clientX, e.clientY, 1 / L.z.scale, true);
      else L.fit(true);
    });

    // -webkit-user-drag is not honoured everywhere (Firefox), so cancel the drag outright as well.
    st.addEventListener('dragstart', e => e.preventDefault());

    let drag = null, moved = 0, downOnContent = false;
    st.addEventListener('pointerdown', e => {
      e.preventDefault();
      drag = { x:e.clientX, y:e.clientY, ox:L.z.x, oy:L.z.y };
      moved = 0;
      // Where the press STARTED is the only reliable signal: setPointerCapture retargets pointerup
      // to the stage, so a click squarely on the content still reports the stage as its target and
      // would be read as "clicked outside".
      downOnContent = L.content.contains(e.target) || e.target === L.content;
      try { st.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      st.classList.add('drag');
    });
    st.addEventListener('pointermove', e => {
      if (!drag) return;
      moved = Math.max(moved, Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y));
      L.z.x = drag.ox + (e.clientX - drag.x);
      L.z.y = drag.oy + (e.clientY - drag.y);
      L.apply();
    });
    st.addEventListener('pointerup', () => {
      // Click the empty space around the content to leave. Two guards: the press must not have
      // started on the content, and it must not have moved (or a pan that ended off the edge would
      // dump you out).
      const wasClick = moved < 5 && !downOnContent;
      drag = null; st.classList.remove('drag');
      // canClose is asked on EVERY pointerup, not only on a click, because a tool's veto may be a
      // one-shot flag it needs to clear either way.
      const allowed = opts.canClose ? opts.canClose(wasClick) : true;
      if (wasClick && allowed) L.close();
    });
    st.addEventListener('pointercancel', () => { drag = null; st.classList.remove('drag'); });

    // Safari emits gesturestart/change instead of ctrl+wheel
    let gScale = 1;
    st.addEventListener('gesturestart', e => { e.preventDefault(); gScale = e.scale; }, { passive:false });
    st.addEventListener('gesturechange', e => {
      e.preventDefault();
      L.zoomAt(e.clientX, e.clientY, e.scale / gScale);
      gScale = e.scale;
    }, { passive:false });

    // Space is a HELD modifier, so it is tracked here rather than in either tool's key handler -
    // both need it, and neither should have to remember to clear it. A keyup that never arrives
    // (the window lost focus mid-hold) would otherwise leave scrolling inverted forever.
    const setSpace = on => {
      if (L.space === on) return;
      L.space = on;
      L.stage.classList.toggle('spaceHeld', on);
      if (opts.onInput) opts.onInput(L);
    };
    addEventListener('keydown', e => {
      if (e.key !== ' ' || !L.isOpen()) return;
      const t = e.target;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return;
      e.preventDefault();                       // or the page scrolls underneath
      setSpace(true);
    });
    addEventListener('keyup', e => { if (e.key === ' ') setSpace(false); });
    addEventListener('blur', () => setSpace(false));
    L.releaseSpace = () => setSpace(false);

    addEventListener('resize', () => { if (L.isOpen()) L.fit(false); });

    return L;
  },
};

window.__loupeLib = PPLoupe;
