'use strict';
// S10 ONE-CLICK AUTHORITY, renderer side. PURE: no DOM, no IPC. app.js reads the toolbar's Authority
// selector through this and does the launch or the cloud hand-off itself.
//
// The renderer only picks a level NAME and sends it with pty-start. Main (app/authority-level.js)
// owns the level -> permission-mode table and refuses anything else, so this file is convenience,
// not the boundary. The level list here must match main's; authority-choice.test.js checks that.
//
// Maximum never launches a Claude pane locally: the launch is routed to a cloud session instead
// (claude.ai/code, opened through the vetted open-external path). Codex, Gemini, Video Scout and
// shell panes have no Claude permission mode, so they launch as before at any level.
//
// Whole file wrapped in an IIFE (the term-copy.js pattern): classic renderer <script> files share
// one global scope, so only `ccAuthorityChoice` is published.
(function (global) {
  const LEVELS = Object.freeze(['minimum', 'medium', 'high', 'maximum']);
  const DEFAULT_LEVEL = 'medium';
  const CLOUD_SESSION_URL = 'https://claude.ai/code';
  const LABELS = Object.freeze({
    minimum: 'Minimum · plan',
    medium: 'Medium · accept edits',
    high: 'High · auto',
    maximum: 'Maximum · cloud',
  });

  // A stored or selected value: a known level is kept; anything else falls back to the default and
  // says so (`fellBack`), so the caller can log it rather than change the level silently.
  function normalizeLevel(value) {
    if (typeof value === 'string' && LEVELS.includes(value)) return { level: value, fellBack: false };
    return { level: DEFAULT_LEVEL, fellBack: value !== undefined && value !== null };
  }

  // Is this launch a Claude agent (a role pane or a bare `claude` pane)? Video Scout is not.
  function isClaudeLaunch(opts) {
    const o = opts || {};
    if (o.videoScout === true || o.role === 'video-scout') return false;
    if (typeof o.role === 'string' && o.role) return true;
    return (o.cli || o.agent || null) === 'claude';
  }

  // 'cloud' when the launch must go to a cloud session instead of a local pane, else 'local'.
  function routeLaunch(opts, level) {
    return (level === 'maximum' && isClaudeLaunch(opts)) ? 'cloud' : 'local';
  }

  const api = { LEVELS, DEFAULT_LEVEL, CLOUD_SESSION_URL, LABELS, normalizeLevel, isClaudeLaunch, routeLaunch };
  global.ccAuthorityChoice = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
