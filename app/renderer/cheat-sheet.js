((global) => {
  'use strict';
  // S19: the control room's cheat sheet (docs/DESIGN-BRIEF-1.1.md 5.1). A "?" button opens a modal
  // <dialog> listing the non-sensitive key bindings, read from S66's one shortcut list
  // (shell-nav.js SHORTCUTS) every time it opens, so it never drifts from what the keys do.
  //
  // Spoken phrases: the matching phrases come with the Composer (S51); until then the sheet says so.
  // Sensitive phrases never appear here: they stay in Blue's password manager. This module takes
  // only the shortcut list it is given and adds no phrase of its own.
  //
  // IIFE, like the other renderer modules: classic <script> files share one global scope.

  const MAX_ROWS = 64;
  const PHRASES_NOTE = 'Spoken phrases come with the Composer (S51). Sensitive phrases stay in your password manager and never appear here.';

  function el(doc, tag, opts) {
    const n = doc.createElement(tag);
    if (opts && opts.className) n.className = opts.className;
    if (opts && opts.text !== undefined) n.textContent = opts.text;
    if (opts && opts.attrs) for (const k of Object.keys(opts.attrs)) n.setAttribute(k, opts.attrs[k]);
    return n;
  }

  // Keeps only well-formed rows ({ keys, action, scope } strings); anything else is dropped.
  function cleanRows(shortcuts) {
    if (!Array.isArray(shortcuts)) return [];
    return shortcuts
      .filter((s) => s && typeof s.keys === 'string' && typeof s.action === 'string')
      .slice(0, MAX_ROWS)
      .map((s) => ({ keys: s.keys, action: s.action, scope: typeof s.scope === 'string' ? s.scope : '' }));
  }

  /**
   * deps: { doc, buttonHost, dialogHost, getShortcuts() -> rows, log(line) }
   * Returns { open(), close(), isOpen(), button, dialog }.
   */
  function createCheatSheet(deps) {
    if (!deps || !deps.doc || !deps.buttonHost || !deps.dialogHost) throw new Error('cheat-sheet: host-missing');
    if (typeof deps.getShortcuts !== 'function') throw new Error('cheat-sheet: shortcuts-missing');
    const { doc } = deps;
    const log = typeof deps.log === 'function' ? deps.log : () => {};

    const button = el(doc, 'button', {
      className: 'mk-btn mk-cheat-open', text: '?',
      attrs: { type: 'button', id: 'makoCheatSheetOpen', 'aria-label': 'Cheat sheet: keys and phrases', title: 'Cheat sheet: keys and phrases', 'aria-haspopup': 'dialog' },
    });
    const dialog = el(doc, 'dialog', { className: 'mk-cheat', attrs: { id: 'makoCheatSheet', 'aria-labelledby': 'makoCheatSheetTitle' } });
    const title = el(doc, 'h2', { className: 'mk-cheat-title', text: 'Cheat sheet', attrs: { id: 'makoCheatSheetTitle' } });
    const body = el(doc, 'div', { className: 'mk-cheat-body' });
    const closeBtn = el(doc, 'button', { className: 'mk-btn', text: 'Close', attrs: { type: 'button', id: 'makoCheatSheetClose', 'aria-keyshortcuts': 'Escape' } });
    dialog.appendChild(title);
    dialog.appendChild(body);
    dialog.appendChild(closeBtn);
    deps.buttonHost.appendChild(button);
    deps.dialogHost.appendChild(dialog);

    function fill() {
      while (body.firstChild) body.removeChild(body.firstChild);
      let rows;
      try { rows = cleanRows(deps.getShortcuts()); } catch { rows = null; }
      if (!rows || !rows.length) {
        log('[cheat-sheet] the shortcut list could not be read (list-missing)\n');
        body.appendChild(el(doc, 'p', { className: 'mk-meta', text: 'The shortcut list could not be read. See Logs.' }));
      } else {
        const table = el(doc, 'table', { className: 'mk-shortcuts', attrs: { id: 'makoCheatSheetKeys' } });
        const head = el(doc, 'thead');
        const hr = el(doc, 'tr');
        for (const h of ['Keys', 'Does', 'Where']) hr.appendChild(el(doc, 'th', { text: h, attrs: { scope: 'col' } }));
        head.appendChild(hr);
        table.appendChild(head);
        const tb = el(doc, 'tbody');
        for (const r of rows) {
          const tr = el(doc, 'tr');
          const kd = el(doc, 'td');
          kd.appendChild(el(doc, 'kbd', { className: 'mk-kbd', text: r.keys }));
          tr.appendChild(kd);
          tr.appendChild(el(doc, 'td', { text: r.action }));
          tr.appendChild(el(doc, 'td', { className: 'mk-meta', text: r.scope }));
          tb.appendChild(tr);
        }
        table.appendChild(tb);
        body.appendChild(table);
      }
      body.appendChild(el(doc, 'p', { className: 'mk-meta mk-cheat-phrases', text: PHRASES_NOTE }));
    }

    let opener = null;
    function open() {
      fill();
      opener = doc.activeElement || null;
      try {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
      } catch {
        log('[cheat-sheet] could not open (open-failed)\n');
        return false;
      }
      try { closeBtn.focus(); } catch { /* focus is cosmetic */ }
      return true;
    }
    function close() {
      if (typeof dialog.close === 'function') { try { dialog.close(); } catch { /* already closed */ } }
      dialog.removeAttribute('open');
      return true;
    }
    function isOpen() { return dialog.open === true || dialog.getAttribute('open') !== null; }

    button.addEventListener('click', () => { open(); });
    closeBtn.addEventListener('click', () => { close(); });
    // Native Esc closes a modal dialog; give focus back to what opened it either way.
    dialog.addEventListener('close', () => {
      if (opener && typeof opener.focus === 'function') { try { opener.focus(); } catch { /* gone */ } }
      opener = null;
    });

    return { open, close, isOpen, button, dialog };
  }

  const api = { MAX_ROWS, PHRASES_NOTE, cleanRows, createCheatSheet };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.ccCheatSheet = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis);
