'use strict';
// S66: the 1.1 UI's colour tokens (docs/DESIGN-BRIEF-1.1.md section 3.1). Each tab sets its own
// surface colours once, on the app root; components use only the token names (as CSS custom
// properties `--mk-<name>`), never raw values. `ui-tokens.test.js` checks the contrast rules from
// the brief, so a token change can't quietly break them.
//
// Two values differ from the brief's tables, both as the brief itself directs:
//   * `status-held` is `#986bff`, not `#9466ff`: the brief's value is 4.39:1 on the brain tab's
//     `surface-raised` and 4.33:1 on the aquarium's, below WCAG AA's 4.5:1 for text, and the brief
//     says S66 "lightens #9466ff just enough to pass, keeping its hue". `#986bff` is the first step
//     (HLS lightness +0.005 per step, same hue and saturation) that reaches 4.5:1 on every tab's
//     `surface` and `surface-raised` (lowest: 4.54:1). Its luminance (0.244) stays below
//     `status-needs` (0.283), so it still reads darker than red, blue and grey.
//   * the control room's `line-strong` is `#6e6e78`, not `#62626c` (the brief's note under 3.1).

(function publish(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ccUiTokens = api;
})(typeof window !== 'undefined' ? window : globalThis, function factory() {
  const TAB_IDS = Object.freeze(['brain', 'control', 'aquarium']);

  const TAB_TOKENS = Object.freeze({
    brain: Object.freeze({
      'surface': '#0a1530', 'surface-sunken': '#071026', 'surface-raised': '#111e3d',
      'surface-hover': '#18284d', 'line': '#22325a', 'line-strong': '#5a71b3',
      'ink': '#f2f5fb', 'ink-muted': '#9aa8c7', 'ink-faint': '#8796ba',
      'accent-ink': '#8ea9ff', 'focus': '#a9bcff',
    }),
    control: Object.freeze({
      'surface': '#0a0a0b', 'surface-sunken': '#050506', 'surface-raised': '#141417',
      'surface-hover': '#1d1d21', 'line': '#26262b', 'line-strong': '#6e6e78',
      'ink': '#efeff1', 'ink-muted': '#9a9aa3', 'ink-faint': '#85858f',
      'accent-ink': '#8ea9ff', 'focus': '#a9bcff',
    }),
    aquarium: Object.freeze({
      'surface': '#05191a', 'surface-sunken': '#031213', 'surface-raised': '#0b2426',
      'surface-hover': '#103033', 'line': '#1b3b3d', 'line-strong': '#4f8588',
      'ink': '#eaf5f3', 'ink-muted': '#93b5b0', 'ink-faint': '#7fa39e',
      'accent-ink': '#86d9ff', 'focus': '#9fe6ff',
    }),
  });

  const SHARED_TOKENS = Object.freeze({
    'accent': '#3f65f4', 'on-accent': '#ffffff',
    'status-needs': '#f2606b', 'status-working': '#6fa8ff', 'status-ended': '#3fc98a',
    'status-held': '#986bff', 'status-idle': '#8796ba',
    'composer': '#22190b', 'composer-line': '#8a6a2a', 'composer-ink': '#f0c060',
    'composer-placeholder': '#c2b08e',
    'emblem-1': '#6d7cff', 'emblem-2': '#ff9d5c', 'emblem-3': '#49e0a8', 'emblem-4': '#e879c9',
    'emblem-5': '#ffd65c', 'emblem-6': '#5cc8ff', 'emblem-7': '#ff8a7a', 'emblem-8': '#b5e655',
    'emblem-ink': '#0b1020',
    'shadow-float': '0 14px 36px rgba(0,0,0,0.5)',
  });

  const STATUS_TOKENS = Object.freeze(['status-needs', 'status-working', 'status-ended', 'status-held', 'status-idle']);

  function isTab(id) { return TAB_IDS.includes(id); }

  // Every token for one tab: its own surface set plus the shared ones. An unknown tab is refused,
  // never silently mapped to another tab's colours.
  function tokensFor(tab) {
    if (!isTab(tab)) throw new Error(`ui-tokens: unknown tab "${tab}"`);
    return Object.assign({}, TAB_TOKENS[tab], SHARED_TOKENS);
  }

  // Set the tab's tokens on the app root (`document.documentElement`) as `--mk-*` custom
  // properties, and mark the root with `data-mako-tab` so tab-specific CSS can key off it.
  function applyTabTokens(rootEl, tab) {
    const tokens = tokensFor(tab);
    for (const [name, value] of Object.entries(tokens)) rootEl.style.setProperty(`--mk-${name}`, value);
    rootEl.setAttribute('data-mako-tab', tab);
    return tokens;
  }

  // Take every --mk-* token off the root again (the old layout keeps its own themes).
  function clearTabTokens(rootEl) {
    for (const name of Object.keys(Object.assign({}, TAB_TOKENS.brain, SHARED_TOKENS))) rootEl.style.removeProperty(`--mk-${name}`);
    rootEl.removeAttribute('data-mako-tab');
  }

  // WCAG 2 relative luminance and contrast ratio (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance).
  function luminance(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) throw new Error(`ui-tokens: not a #rrggbb colour: ${hex}`);
    const channels = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }
  function contrast(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  return { TAB_IDS, TAB_TOKENS, SHARED_TOKENS, STATUS_TOKENS, isTab, tokensFor, applyTabTokens, clearTabTokens, luminance, contrast };
});
