'use strict';
// S20: the aquarium's small canvas engine, forked from Pixel Agents 1.6.0 (MIT).
//
// Upstream: pixel-agents-hq/pixel-agents, tag v1.6.0, commit 4dd14d612fd37d89ffbbc977959f572395c4eec8
// (npm `pixel-agents@1.6.0`). Licence: MIT, Copyright (c) 2026 Pablo De Lucca; the full text is in
// LICENSES/MIT-pixel-agents.txt and THIRD-PARTY-NOTICES.md names this file. Record:
// docs/decisions/OSS-pixel-agents.md.
//
// What was taken, ported from TypeScript to plain JavaScript (Mako's renderer has no build step):
//   * the sprite format: a sprite is a grid of rows of colour strings, '' for transparent
//     (webview-ui/src/office/types.ts, SpriteData);
//   * getCachedSprite: draw a sprite once per zoom level onto an offscreen canvas and reuse it
//     (webview-ui/src/office/sprites/spriteCache.ts);
//   * getOutlineSprite: the 1 px outline around a sprite, used for the selected creature (same file);
//   * startGameLoop: requestAnimationFrame with a capped time step and pixel-crisp drawing
//     (webview-ui/src/office/engine/gameLoop.ts, MAX_DELTA_TIME_SEC from constants.ts);
//   * blinkGap, startBlink and tickBlink: each character blinks on its own skewed random clock
//     (webview-ui/src/office/engine/blink.ts, BLINK_* from constants.ts).
// What Mako changed: the caches take a `doc` (so tests can pass a fake one) instead of the global
// document; the game loop takes injectable frame functions, reports a failed frame or redraw
// through `onError` instead of throwing out of requestAnimationFrame, and can be paused and resumed; the
// outline colour is a parameter. Nothing else from Pixel Agents is in Mako: no server, no hooks, no
// office, no React UI, no character art.
//
// Dual browser-<script> / CommonJS module, like ui-tokens.js: the pure parts are unit-tested in plain
// node (aquarium.test.js).

(function publish(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ccAquariumEngine = api;
})(typeof window !== 'undefined' ? window : globalThis, function factory() {
  // constants.ts
  const MAX_DELTA_TIME_SEC = 0.1;
  const BLINK_SHUT_SEC = Object.freeze([0.1, 0.17]);
  const BLINK_GAP_MIN_SEC = 1.5;
  const BLINK_GAP_MEAN_SEC = 3.5;
  const BLINK_GAP_MAX_SEC = 11;
  const BLINK_FOCUS_STRETCH = 1.5;
  const BLINK_DOUBLE_CHANCE = 0.15;
  const BLINK_DOUBLE_GAP_SEC = Object.freeze([0.15, 0.3]);

  // ---- spriteCache.ts --------------------------------------------------------------------------
  const zoomCaches = new Map();
  const outlineCache = new WeakMap();

  /** A 1 px outline sprite (2 px larger in each dimension) around every opaque pixel. */
  function getOutlineSprite(sprite, colour) {
    const c = colour || '#FFFFFF';
    let byColour = outlineCache.get(sprite);
    if (!byColour) { byColour = new Map(); outlineCache.set(sprite, byColour); }
    const cached = byColour.get(c);
    if (cached) return cached;
    const rows = sprite.length;
    const cols = sprite[0].length;
    const outline = [];
    for (let r = 0; r < rows + 2; r++) outline.push(new Array(cols + 2).fill(''));
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        if (sprite[r][col] === '') continue;
        const er = r + 1;
        const ec = col + 1;
        if (outline[er - 1][ec] === '') outline[er - 1][ec] = c;
        if (outline[er + 1][ec] === '') outline[er + 1][ec] = c;
        if (outline[er][ec - 1] === '') outline[er][ec - 1] = c;
        if (outline[er][ec + 1] === '') outline[er][ec + 1] = c;
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        if (sprite[r][col] !== '') outline[r + 1][col + 1] = '';
      }
    }
    byColour.set(c, outline);
    return outline;
  }

  /** The sprite drawn at `zoom` on an offscreen canvas, drawn once and then reused. */
  function getCachedSprite(doc, sprite, zoom) {
    let cache = zoomCaches.get(zoom);
    if (!cache) { cache = new WeakMap(); zoomCaches.set(zoom, cache); }
    const cached = cache.get(sprite);
    if (cached) return cached;
    const rows = sprite.length;
    const cols = sprite[0].length;
    const canvas = doc.createElement('canvas');
    canvas.width = cols * zoom;
    canvas.height = rows * zoom;
    const ctx = canvas.getContext('2d');
    if (!ctx) { const e = new Error('no-2d-context'); e.kind = 'no-2d-context'; throw e; }
    ctx.imageSmoothingEnabled = false;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const colour = sprite[r][col];
        if (colour === '') continue;
        ctx.fillStyle = colour;
        ctx.fillRect(col * zoom, r * zoom, zoom, zoom);
      }
    }
    cache.set(sprite, canvas);
    return canvas;
  }

  // ---- gameLoop.ts -----------------------------------------------------------------------------
  // update(dt) then render(ctx) once per frame; dt is in seconds and capped, so a frame after a long
  // pause doesn't jump. Mako adds pause and resume (a hidden tab draws nothing) and onError: an
  // exception in a frame stops the loop and is reported once, never thrown into the browser's frame
  // callback where nobody would see it.
  function startGameLoop(canvas, callbacks, frames) {
    const ctx = canvas.getContext('2d');
    if (!ctx) { const e = new Error('no-2d-context'); e.kind = 'no-2d-context'; throw e; }
    ctx.imageSmoothingEnabled = false;
    const request = (frames && frames.request) || ((cb) => requestAnimationFrame(cb));
    const cancel = (frames && frames.cancel) || ((id) => cancelAnimationFrame(id));
    let lastTime = 0;
    let rafId = 0;
    let stopped = false;
    let paused = false;
    let drawn = 0;
    // A failed update or draw stops the loop and is reported once, from a frame or a redraw alike.
    const failed = (e) => {
      stopped = true;
      if (rafId) cancel(rafId);
      rafId = 0;
      if (typeof callbacks.onError === 'function') callbacks.onError(e && typeof e.kind === 'string' ? e.kind : 'frame-failed');
    };
    const frame = (time) => {
      rafId = 0;
      if (stopped || paused) return;
      const dt = lastTime === 0 ? 0 : Math.min((time - lastTime) / 1000, MAX_DELTA_TIME_SEC);
      lastTime = time;
      try {
        callbacks.update(dt);
        ctx.imageSmoothingEnabled = false;
        callbacks.render(ctx);
        drawn++;
      } catch (e) {
        failed(e);
        return;
      }
      rafId = request(frame);
    };
    rafId = request(frame);
    return {
      stop: () => { stopped = true; if (rafId) cancel(rafId); rafId = 0; },
      pause: () => { if (stopped || paused) return; paused = true; if (rafId) cancel(rafId); rafId = 0; },
      resume: () => {
        if (stopped || !paused) return;
        paused = false;
        lastTime = 0; // the first frame back advances nothing
        rafId = request(frame);
      },
      redraw: () => {
        if (stopped) return;
        try {
          ctx.imageSmoothingEnabled = false;
          callbacks.render(ctx);
        } catch (e) {
          failed(e);
        }
      },
      state: () => ({ stopped, paused, frames: drawn }),
    };
  }

  // ---- blink.ts --------------------------------------------------------------------------------
  const between = (range, rand) => range[0] + rand() * (range[1] - range[0]);
  /** The wait before the next blink: a floor, then an exponential wait, capped. */
  function blinkGap(focused, rand) {
    const r = rand || Math.random;
    const wait = -Math.log(1 - r()) * BLINK_GAP_MEAN_SEC;
    const gap = Math.min(BLINK_GAP_MIN_SEC + wait, BLINK_GAP_MAX_SEC);
    return focused ? gap * BLINK_FOCUS_STRETCH : gap;
  }
  /** A fresh clock, its first blink anywhere in a normal gap (so new creatures are out of step). */
  function startBlink(rand) {
    const r = rand || Math.random;
    return { blinkIn: r() * blinkGap(false, r), blinkShut: 0 };
  }
  /** Advance a blink clock by dt seconds; returns whether the eyes are shut. */
  function tickBlink(b, dt, focused, rand) {
    const r = rand || Math.random;
    if (b.blinkShut > 0) {
      b.blinkShut = Math.max(0, b.blinkShut - dt);
      return b.blinkShut > 0;
    }
    b.blinkIn -= dt;
    if (b.blinkIn > 0) return false;
    b.blinkShut = between(BLINK_SHUT_SEC, r);
    b.blinkIn = r() < BLINK_DOUBLE_CHANCE ? between(BLINK_DOUBLE_GAP_SEC, r) : blinkGap(focused, r);
    return true;
  }

  return {
    MAX_DELTA_TIME_SEC, BLINK_GAP_MIN_SEC, BLINK_GAP_MAX_SEC, BLINK_FOCUS_STRETCH,
    getOutlineSprite, getCachedSprite, startGameLoop, blinkGap, startBlink, tickBlink,
  };
});
