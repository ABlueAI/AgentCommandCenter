'use strict';
// S66: the repo emblem rail (docs/DESIGN-BRIEF-1.1.md sections 1, 3.4 and 8). A narrow rail of round
// emblems, one per repo, down the left of the three-tab layout: the repo's first letter on one of
// the eight emblem colours (a stable choice per repo name), a red "needs you" dot that S19 sets, and
// a click that switches to that repo. Repo names are untrusted (folder names), so they reach the DOM
// only as text and attribute values on fixed attribute names.
//
// Dual browser-<script> / CommonJS module; the pure parts are tested in plain node
// (emblem-rail.test.js), the DOM in the shell's Electron harness.

(function publish(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ccEmblemRail = api;
})(typeof window !== 'undefined' ? window : globalThis, function factory() {
  const SLOTS = 8;

  // FNV-1a over the name's UTF-16 code units: the same repo always gets the same colour slot (1-8).
  function colourSlot(name) {
    let h = 0x811c9dc5;
    const s = String(name || '');
    for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return (h % SLOTS) + 1;
  }

  // The emblem's letter: the first letter or digit of the name, upper-cased; "?" when there is none.
  function emblemLetter(name) {
    const m = /[\p{L}\p{N}]/u.exec(String(name || ''));
    return m ? m[0].toLocaleUpperCase() : '?';
  }

  /**
   * deps: { doc, host (the rail element), onSelect(repoValue), log(line) }
   * Returns { render(repos, selectedValue), setNeedsYou(repoValue, on) }.
   * repos: [{ value, name }] (value is the repo picker's option value).
   */
  function createEmblemRail(deps) {
    const { doc, host } = deps;
    if (!host) throw new Error('emblem-rail: the rail element is missing');
    const log = typeof deps.log === 'function' ? deps.log : () => {};
    const needs = new Set();
    let current = { repos: [], selected: '' };

    host.setAttribute('role', 'navigation');
    host.setAttribute('aria-label', 'Repos');
    const list = doc.createElement('ul');
    list.className = 'mk-rail-list';
    host.appendChild(list);

    function render(repos, selected) {
      current = { repos: Array.isArray(repos) ? repos.slice(0, 64) : [], selected: selected || '' };
      while (list.firstChild) list.removeChild(list.firstChild);
      for (const r of current.repos) {
        const li = doc.createElement('li');
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = `mk-emblem mk-emblem-${colourSlot(r.name)}`;
        b.textContent = emblemLetter(r.name);
        const label = needs.has(r.value) ? `${r.name}, needs you` : r.name;
        b.setAttribute('aria-label', label);
        b.setAttribute('title', label);
        b.setAttribute('aria-current', r.value === current.selected ? 'true' : 'false');
        if (needs.has(r.value)) {
          const dot = doc.createElement('span');
          dot.className = 'mk-emblem-dot';
          dot.setAttribute('aria-hidden', 'true');
          b.appendChild(dot);
        }
        b.addEventListener('click', () => {
          try { deps.onSelect(r.value); }
          catch { log('[shell] switching repo from the emblem rail failed: select-failed\n'); }
        });
        li.appendChild(b);
        list.appendChild(li);
      }
    }

    function setNeedsYou(value, on) {
      if (on) needs.add(value); else needs.delete(value);
      render(current.repos, current.selected);
    }

    return { render, setNeedsYou };
  }

  return { SLOTS, colourSlot, emblemLetter, createEmblemRail };
});
