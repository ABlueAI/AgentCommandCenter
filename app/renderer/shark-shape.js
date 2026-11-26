'use strict';
// S18: the shark's shape file (docs/DESIGN-BRIEF-1.1.md section 7) and the shark's state clock.
//
// The shape is swappable data, `app/assets/shark/shark-shape-B3.json`, format `mako-shark-shape/1`.
// This module checks a shape file strictly before anything draws it: a bad or missing file is
// refused with a reason, shown and logged, and the last good shape stays in use (never silent).
//
// It also holds the shark's clock: the four states and no others (idle, listening, thinking,
// speaking), the frame-rate modes (30 fps by default), pause and resume, "hidden means stopped"
// and reduced motion. The renderer (Three.js, a later step of S18) is handed to it as `draw`, so
// every rule here is tested in plain node without a GPU.
//
// Dual browser-<script> / CommonJS module; tested in plain node (shark-shape.test.js).

(function publish(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ccSharkShape = api;
})(typeof window !== 'undefined' ? window : globalThis, function factory() {
  const FORMAT = 'mako-shark-shape/1';
  const MAX_BYTES = 64 * 1024;
  const FIN_KEYS = Object.freeze(['dorsalLead', 'dorsalTrail', 'upperLead', 'upperTrail', 'lowerLead', 'lowerTrail', 'pelvicLead', 'pelvicTrail', 'd2Lead', 'd2Trail', 'analLead', 'analTrail']);
  const STATES = Object.freeze(['idle', 'listening', 'thinking', 'speaking']);
  const FRAME_RATES = Object.freeze(['30', '60', '120', '144', 'max', 'auto']);
  const DEFAULT_FRAME_RATE = '30';

  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const inRange = (v, lo, hi) => fin(v) && v >= lo && v <= hi;
  function fail(reason) { return { ok: false, reason }; }

  /**
   * Check one parsed shape file. Returns { ok: true, shape } (the `shape` object, frozen deep) or
   * { ok: false, reason } with a short fixed reason that never echoes the file's content.
   */
  function validateShape(doc) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return fail('not-an-object');
    if (doc.format !== FORMAT) return fail('wrong-format');
    const s = doc.shape;
    if (!s || typeof s !== 'object') return fail('shape-missing');
    if (typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{1,20}$/.test(s.id)) return fail('bad-id');
    const b = s.body;
    if (!b || !Array.isArray(b.s) || !Array.isArray(b.top) || !Array.isArray(b.bot) || !Array.isArray(b.wr)) return fail('body-missing');
    const n = b.s.length;
    if (n < 3 || n > 200 || b.top.length !== n || b.bot.length !== n || b.wr.length !== n) return fail('body-lengths');
    if (b.s[0] !== 0 || b.s[n - 1] !== 1) return fail('body-ends');
    for (let i = 0; i < n; i++) {
      if (!inRange(b.s[i], 0, 1) || (i > 0 && !(b.s[i] > b.s[i - 1]))) return fail('body-s-order');
      if (!inRange(b.top[i], 0, 0.5) || !inRange(b.bot[i], 0, 0.5)) return fail('body-depth');
      if (!inRange(b.wr[i], 0, 3)) return fail('body-width');
    }
    if (!s.eye || !inRange(s.eye.s, 0, 1) || !fin(s.eye.th) || !inRange(s.eye.r, 0, 0.1)) return fail('eye');
    if (!s.mouth || !inRange(s.mouth.front, 0, 1) || !inRange(s.mouth.corner, 0, 1) || !inRange(s.mouth.spread, 0, 2)) return fail('mouth');
    if (!s.gills || !Array.isArray(s.gills.s) || s.gills.s.length > 10 || !s.gills.s.every((v) => inRange(v, 0, 1)) || !Array.isArray(s.gills.th) || s.gills.th.length !== 2 || !s.gills.th.every(fin)) return fail('gills');
    const p = s.pectoral;
    if (!p || !inRange(p.s0, 0, 1) || !inRange(p.s1, 0, 1) || !(p.s1 > p.s0) || !inRange(p.h, -0.5, 0.5) || !inRange(p.length, 0, 1) || !inRange(p.broad, 0, 0.5)
      || !Array.isArray(p.dir) || p.dir.length !== 3 || !p.dir.every((v) => inRange(v, -1, 1))) return fail('pectoral');
    if (!s.fins || typeof s.fins !== 'object') return fail('fins-missing');
    for (const k of FIN_KEYS) {
      const edge = s.fins[k];
      if (!Array.isArray(edge) || edge.length < 2 || edge.length > 64) return fail('fin-edge');
      for (const pt of edge) if (!Array.isArray(pt) || pt.length !== 2 || !inRange(pt[0], -0.1, 1.5) || !inRange(pt[1], -1, 1)) return fail('fin-point');
    }
    if (!inRange(s.tailThick, 0, 0.2)) return fail('tail');
    return { ok: true, shape: deepFreeze(JSON.parse(JSON.stringify(s))) };
  }

  function deepFreeze(o) {
    if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
    return o;
  }

  /** Parse and check the file's text. Over 64 KB, not JSON or not a valid shape: refused. */
  function parseShape(text) {
    if (typeof text !== 'string') return fail('not-text');
    if (text.length > MAX_BYTES) return fail('too-large');
    let doc;
    try { doc = JSON.parse(text); } catch { return fail('not-json'); }
    return validateShape(doc);
  }

  /**
   * Load a shape file through `readText()` (a Promise of the file's text). On any failure the
   * last good shape stays in use, and the result says so: { ok, shape, reason?, fellBack }.
   * `shape` is null only when there has never been a good one.
   */
  function createShapeLoader(deps) {
    const d = deps || {};
    const log = typeof d.log === 'function' ? d.log : () => {};
    let lastGood = null;
    async function load(readText) {
      let res;
      try { res = parseShape(await readText()); } catch { res = fail('missing'); }
      if (res.ok) { lastGood = res.shape; return { ok: true, shape: res.shape, fellBack: false }; }
      log(`[shark] REFUSED: shape file ${res.reason}; ${lastGood ? `keeping the last good shape (${lastGood.id})` : 'no shape to draw'}\n`);
      return { ok: false, reason: res.reason, shape: lastGood, fellBack: lastGood !== null };
    }
    return { load, lastGood: () => lastGood };
  }

  // ---- the shark's clock ----------------------------------------------------------------------

  function frameInterval(mode) {
    if (mode === 'max' || mode === 'auto') return 0; // every animation frame the display gives
    const fps = Number(mode);
    return fps > 0 ? 1000 / fps : 1000 / 30;
  }

  /**
   * The clock that drives the renderer.
   * deps: { draw({ state, t, dt, voice, motion }), requestFrame(cb), cancelFrame(id), now(),
   *         isHidden(), prefersReducedMotion(), log }
   * Rules (brief 3.6 and 7): only the four states; 30 fps by default; nothing is drawn while
   * paused or hidden; under reduced motion one still frame is drawn per state change (it holds
   * still and keeps its glow) and the clock stops.
   */
  function createSharkClock(deps) {
    const d = deps || {};
    if (typeof d.draw !== 'function' || typeof d.requestFrame !== 'function' || typeof d.cancelFrame !== 'function') throw new Error('shark-clock: deps-missing');
    const now = typeof d.now === 'function' ? d.now : () => Date.now();
    const hidden = typeof d.isHidden === 'function' ? d.isHidden : () => false;
    const reduced = typeof d.prefersReducedMotion === 'function' ? d.prefersReducedMotion : () => false;
    const log = typeof d.log === 'function' ? d.log : () => {};
    const st = { state: 'idle', mode: DEFAULT_FRAME_RATE, paused: false, frameId: null, last: null, t: 0, voice: 0, frames: 0, stateSince: now() };

    function drawOnce(dt) {
      st.frames += 1;
      d.draw({ state: st.state, t: st.t, dt, voice: st.voice, motion: !reduced(), stateFor: now() - st.stateSince });
    }
    function tick() {
      st.frameId = null;
      if (st.paused || hidden()) { st.last = null; return; }
      if (reduced()) { st.last = null; drawOnce(0); return; }
      const t = now();
      const gap = frameInterval(st.mode);
      if (st.last === null || t - st.last >= gap - 1) {
        const dt = st.last === null ? 0 : Math.min(t - st.last, 250);
        st.last = t;
        st.t += dt;
        drawOnce(dt);
      }
      schedule();
    }
    function schedule() { if (st.frameId === null && !st.paused && !hidden()) st.frameId = d.requestFrame(tick); }
    function stop() { if (st.frameId !== null) { d.cancelFrame(st.frameId); st.frameId = null; } st.last = null; }

    function setState(next) {
      if (!STATES.includes(next)) { log('[shark] REFUSED: unknown state; the shark keeps its state\n'); return false; }
      if (next !== st.state) { st.state = next; st.stateSince = now(); if (next !== 'speaking') st.voice = 0; }
      schedule();
      return true;
    }
    function setVoiceLevel(v) { st.voice = st.state === 'speaking' && fin(v) ? Math.max(0, Math.min(1, v)) : 0; }
    function setFrameRate(mode) {
      if (!FRAME_RATES.includes(String(mode))) { log('[shark] REFUSED: unknown frame rate; keeping the current one\n'); return false; }
      st.mode = String(mode); return true;
    }
    function pause() { st.paused = true; stop(); }
    function resume() { st.paused = false; schedule(); }
    // Called on visibilitychange and when the brain tab is shown or hidden.
    function visibilityChanged() { if (hidden()) stop(); else schedule(); }

    return {
      setState, setVoiceLevel, setFrameRate, pause, resume, visibilityChanged, start: schedule,
      state: () => ({ state: st.state, mode: st.mode, paused: st.paused, running: st.frameId !== null, frames: st.frames, voice: st.voice }),
    };
  }

  return { FORMAT, MAX_BYTES, FIN_KEYS, STATES, FRAME_RATES, DEFAULT_FRAME_RATE, validateShape, parseShape, createShapeLoader, frameInterval, createSharkClock };
});
