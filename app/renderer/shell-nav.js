'use strict';
// S66: the shared navigation shell for the 1.1 UI (docs/DESIGN-BRIEF-1.1.md sections 1, 3 and 8).
//
// What this module owns:
//   * the layout choice: the three-tab layout (default) or the old layout, from the one switch
//     "Use the old layout" on the Settings page (brief question 13). It is saved with the app's
//     settings (`uiLayout`) and applies at once and after a restart. The `--classic-layout`
//     recovery flag is separate and untouched;
//   * the tablist (Brain, Control room, Aquarium) with the WAI-ARIA tabs keyboard pattern: arrow
//     keys move and select, Home and End jump. Each tab sets its colour set on the app root
//     (ui-tokens.js);
//   * the Ctrl K command palette, a dialog holding a combobox (WAI-ARIA combobox pattern): type to
//     filter, arrows to move, Enter runs, Esc closes and gives focus back;
//   * the one Settings page with sections;
//   * the one shortcut list every surface reads (the cheat sheet in S19 reads it too).
//
// Everything visible is built with createElement and textContent: repo names and other values
// reach the DOM only as text, never as HTML.
//
// Dual browser-<script> / CommonJS module: the pure parts are unit-tested in plain node
// (shell-nav.test.js), the DOM parts in a real Electron renderer (shell-nav-app-harness.js).

(function publish(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ccShellNav = api;
})(typeof window !== 'undefined' ? window : globalThis, function factory() {
  const TABS = Object.freeze([
    Object.freeze({ id: 'brain', label: 'Brain', hint: 'The Composer\'s stage' }),
    Object.freeze({ id: 'control', label: 'Control room', hint: 'Agents, panes and what they need from you' }),
    Object.freeze({ id: 'aquarium', label: 'Aquarium', hint: 'One creature per live pane' }),
  ]);
  const TAB_IDS = TABS.map((t) => t.id);
  const LAYOUTS = Object.freeze(['tabs', 'old']);
  const DEFAULT_LAYOUT = 'tabs';
  // Builder's reading: until S18 fills the brain tab, Mako opens on the control room, where today's
  // panes live, so merging S66 never lands Blue on a tab with nothing to do yet. A remembered tab wins.
  const DEFAULT_TAB = 'control';

  // The one shortcut list (brief 8: "one shortcut list"). Only keys that work today are listed;
  // later rows (S18's Ctrl Space push-to-talk, S19's needs-you jump key) add their own entries here.
  const SHORTCUTS = Object.freeze([
    Object.freeze({ keys: 'Ctrl K', action: 'Open the command palette', scope: 'Every tab, both layouts' }),
    Object.freeze({ keys: 'Esc', action: 'Close the palette or the Settings page', scope: 'While one is open' }),
    Object.freeze({ keys: 'Left / Right', action: 'Move between tabs', scope: 'Tab bar focused' }),
    Object.freeze({ keys: 'Home / End', action: 'First or last tab', scope: 'Tab bar focused' }),
    Object.freeze({ keys: 'Up / Down, Enter', action: 'Pick and run a palette command', scope: 'Palette open' }),
  ]);

  // The Settings page's sections (brief 8). Sections whose controls come with a later step say so
  // visibly instead of showing an empty box.
  const SETTINGS_SECTIONS = Object.freeze([
    Object.freeze({ id: 'layout', title: 'Layout' }),
    Object.freeze({ id: 'shortcuts', title: 'Shortcuts' }),
    Object.freeze({ id: 'shark', title: 'Shark', pending: 'The shark\'s look, colours and frame rate come with the brain tab (S18).' }),
    Object.freeze({ id: 'quiet', title: 'Quiet hours', pending: 'The quiet-hours switch comes with the top bar, in a later step of S66.' }),
    Object.freeze({ id: 'repos', title: 'Repos and emblems', pending: 'Repo emblems and their image upload come in a later step of S66.' }),
    Object.freeze({ id: 'voice', title: 'Voice', pending: 'Voice and speed are set in the control room\'s terminal bar for now.' }),
    Object.freeze({ id: 'keys', title: 'Keys', pending: 'Keys are stored from the banners at the top of the window for now.' }),
  ]);

  function normalizeLayout(value) {
    return LAYOUTS.includes(value) ? { layout: value, fellBack: false } : { layout: DEFAULT_LAYOUT, fellBack: value !== undefined && value !== null };
  }
  function normalizeTab(value) {
    return TAB_IDS.includes(value) ? { tab: value, fellBack: false } : { tab: DEFAULT_TAB, fellBack: value !== undefined && value !== null };
  }

  // WAI-ARIA tabs: Left and Right wrap around, Home and End jump. Anything else is not ours (null).
  function nextTabIndex(key, index, count) {
    if (!(count > 0)) return null;
    if (key === 'ArrowRight') return (index + 1) % count;
    if (key === 'ArrowLeft') return (index - 1 + count) % count;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    return null;
  }

  // Exactly Ctrl+K: no Shift, Alt or Meta, so Ctrl+Shift+K and friends still reach the terminal.
  function isPaletteChord(e) {
    return !!e && e.ctrlKey === true && !e.shiftKey && !e.altKey && !e.metaKey
      && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK');
  }

  // Rank palette commands against a query: label prefix, then a word in the label starting with
  // the query, then the query anywhere in the label or its group. Ties keep the given order.
  function rankCommands(commands, query) {
    const q = String(query || '').trim().toLowerCase();
    const scored = [];
    commands.forEach((c, i) => {
      const label = String(c.label).toLowerCase();
      const group = String(c.group || '').toLowerCase();
      let score;
      if (!q) score = 3;
      else if (label.startsWith(q)) score = 0;
      else if (label.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) score = 1;
      else if (label.includes(q) || group.includes(q)) score = 2;
      else return;
      scored.push({ c, i, score });
    });
    scored.sort((a, b) => a.score - b.score || a.i - b.i);
    return scored.map((s) => s.c);
  }

  // ---- DOM ---------------------------------------------------------------------------------------

  // A refusal carries a bounded reason code (never an exception message, path or state), the
  // same rule the Dockview bootstrap follows.
  function refusal(code) {
    const e = new Error(`shell-nav refused: ${code}`);
    e.code = code;
    return e;
  }
  function reasonOf(e) {
    return e && typeof e.code === 'string' && /^[a-z0-9-]{1,64}$/.test(e.code) ? e.code : 'unknown-error';
  }

  function h(doc, tag, opts, children) {
    const node = doc.createElement(tag);
    const o = opts || {};
    if (o.className) node.className = o.className;
    if (o.text !== undefined) node.textContent = String(o.text);
    if (o.attrs) for (const [k, v] of Object.entries(o.attrs)) node.setAttribute(k, String(v));
    for (const child of children || []) node.appendChild(child);
    return node;
  }

  /**
   * Build the shell into the page and wire it.
   * deps: {
   *   doc, win, tokens (ui-tokens api),
   *   settings: the stored settings object (uiLayout, uiTab),
   *   saveSettings(partial) -> Promise, log(line),
   *   controlPanel: the element holding today's layout (shown on the control room tab),
   *   extraCommands(): [{ id, label, group, run }] supplied by app.js (repos, old tabs, new agent),
   * }
   */
  function createShell(deps) {
    const { doc, win, tokens } = deps;
    const root = doc.documentElement;
    const log = typeof deps.log === 'function' ? deps.log : () => {};
    const save = (partial) => {
      let p;
      try { p = Promise.resolve(deps.saveSettings(partial)); }
      catch (e) { p = Promise.reject(e); }
      return p.catch(() => { log(`[shell] could not save settings (${Object.keys(partial).join(', ')}): save-failed\n`); });
    };

    const stored = deps.settings || {};
    const layoutChoice = normalizeLayout(stored.uiLayout);
    if (layoutChoice.fellBack) log('[shell] stored layout not recognised; using the three-tab layout\n');
    const tabChoice = normalizeTab(stored.uiTab);
    if (tabChoice.fellBack) log('[shell] stored tab not recognised; opening the control room\n');

    const state = { layout: layoutChoice.layout, tab: tabChoice.tab, view: 'tab', paletteOpen: false, returnFocus: null, activeIndex: 0, shown: [] };

    // -- header: scope stripe and tab bar ---------------------------------------------------------
    const header = doc.getElementById('makoShell');
    const views = doc.getElementById('makoViews');
    if (!header || !views) throw refusal('mount-missing');

    const stripe = h(doc, 'div', { className: 'mk-stripe', attrs: { id: 'makoScopeStripe' } });
    const stripeText = h(doc, 'span', { className: 'mk-stripe-text' });
    stripe.appendChild(stripeText);

    const tablist = h(doc, 'div', { className: 'mk-tablist', attrs: { role: 'tablist', 'aria-label': 'Mako tabs' } });
    const tabButtons = TABS.map((t) => h(doc, 'button', {
      className: 'mk-tab', text: t.label,
      attrs: { type: 'button', role: 'tab', id: `makoTab-${t.id}`, 'aria-controls': `makoPanel-${t.id}`, 'data-mako-tab': t.id, title: t.hint },
    }));
    tabButtons.forEach((b) => tablist.appendChild(b));

    const paletteButton = h(doc, 'button', {
      className: 'mk-btn mk-palette-open', text: 'Jump to a repo, agent or command',
      attrs: { type: 'button', id: 'makoPaletteOpen', 'aria-keyshortcuts': 'Control+K', 'aria-haspopup': 'dialog' },
    }, []);
    paletteButton.appendChild(h(doc, 'kbd', { className: 'mk-kbd', text: 'Ctrl K' }));
    const settingsButton = h(doc, 'button', { className: 'mk-btn', text: 'Settings', attrs: { type: 'button', id: 'makoSettingsOpen' } });

    const bar = h(doc, 'div', { className: 'mk-tabbar' }, [tablist, h(doc, 'span', { className: 'mk-spacer' }), paletteButton, settingsButton]);
    header.appendChild(stripe);
    header.appendChild(bar);

    // -- panels: brain and aquarium frames, the control room is today's layout ----------------------
    function framePanel(id, title, body) {
      return h(doc, 'section', {
        className: 'mk-panel mk-frame', attrs: { id: `makoPanel-${id}`, role: 'tabpanel', 'aria-labelledby': `makoTab-${id}`, tabindex: '0' },
      }, [h(doc, 'p', { className: 'mk-overline', text: title }), h(doc, 'p', { className: 'mk-frame-note', text: body })]);
    }
    const brainPanel = framePanel('brain', 'Brain', 'The Composer\'s stage (the shark, live task nodes and the conversation) is built by S18 on this frame. Your agents are in the control room tab.');
    const aquariumPanel = framePanel('aquarium', 'Aquarium', 'The aquarium (one creature per live pane) is built by S20 on this frame. Your agents are in the control room tab.');
    views.appendChild(brainPanel);
    views.appendChild(aquariumPanel);
    const controlPanel = deps.controlPanel;
    if (!controlPanel) throw refusal('control-panel-missing');
    controlPanel.setAttribute('id', controlPanel.getAttribute('id') || 'makoPanel-control');
    controlPanel.setAttribute('role', 'tabpanel');
    controlPanel.setAttribute('aria-labelledby', 'makoTab-control');
    tabButtons[1].setAttribute('aria-controls', controlPanel.getAttribute('id'));

    // -- Settings page ------------------------------------------------------------------------------
    const settingsPage = h(doc, 'section', { className: 'mk-settings', attrs: { id: 'makoSettings', role: 'region', 'aria-labelledby': 'makoSettingsTitle', hidden: '' } });
    const settingsHead = h(doc, 'div', { className: 'mk-settings-head' }, [
      h(doc, 'h2', { className: 'mk-title', text: 'Settings', attrs: { id: 'makoSettingsTitle', tabindex: '-1' } }),
      h(doc, 'span', { className: 'mk-spacer' }),
    ]);
    const settingsClose = h(doc, 'button', { className: 'mk-btn', text: 'Close settings', attrs: { type: 'button', id: 'makoSettingsClose', 'aria-keyshortcuts': 'Escape' } });
    settingsHead.appendChild(settingsClose);
    settingsPage.appendChild(settingsHead);
    const oldLayoutBox = h(doc, 'input', { attrs: { type: 'checkbox', id: 'makoOldLayout' } });
    const layoutStatus = h(doc, 'p', { className: 'mk-meta', attrs: { id: 'makoLayoutStatus', role: 'status', 'aria-live': 'polite' } });
    for (const section of SETTINGS_SECTIONS) {
      const sec = h(doc, 'section', { className: 'mk-settings-section', attrs: { id: `makoSettings-${section.id}`, 'aria-labelledby': `makoSettingsH-${section.id}` } });
      sec.appendChild(h(doc, 'h3', { className: 'mk-overline', text: section.title, attrs: { id: `makoSettingsH-${section.id}` } }));
      if (section.id === 'layout') {
        const label = h(doc, 'label', { className: 'mk-check', attrs: { for: 'makoOldLayout' } });
        label.appendChild(oldLayoutBox);
        label.appendChild(doc.createTextNode(' Use the old layout'));
        sec.appendChild(label);
        sec.appendChild(h(doc, 'p', { className: 'mk-meta', text: 'The old single-screen layout, with no tabs. It stays until the aquarium tab (S20) is done. Ctrl K and this page still work there.' }));
        sec.appendChild(layoutStatus);
      } else if (section.id === 'shortcuts') {
        sec.appendChild(buildShortcutTable(doc));
      } else {
        sec.appendChild(h(doc, 'p', { className: 'mk-meta mk-pending', text: section.pending }));
      }
      settingsPage.appendChild(sec);
    }
    views.appendChild(settingsPage);

    // -- palette ------------------------------------------------------------------------------------
    const paletteInput = h(doc, 'input', {
      className: 'mk-palette-input',
      attrs: {
        id: 'makoPaletteInput', type: 'text', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'makoPaletteList',
        'aria-autocomplete': 'list', 'aria-label': 'Jump to a repo, agent or command', placeholder: 'Jump to a repo, agent or command',
        autocomplete: 'off', spellcheck: 'false',
      },
    });
    const paletteList = h(doc, 'ul', { className: 'mk-palette-list', attrs: { id: 'makoPaletteList', role: 'listbox', 'aria-label': 'Commands' } });
    const paletteEmpty = h(doc, 'p', { className: 'mk-meta mk-palette-empty', text: 'No command matches.', attrs: { role: 'status', hidden: '' } });
    const palette = h(doc, 'div', { className: 'mk-palette', attrs: { id: 'makoPalette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Command palette' } },
      [paletteInput, paletteList, paletteEmpty]);
    const paletteBackdrop = h(doc, 'div', { className: 'mk-palette-backdrop', attrs: { id: 'makoPaletteBackdrop', hidden: '' } }, [palette]);
    doc.body.appendChild(paletteBackdrop);

    // -- behaviour ----------------------------------------------------------------------------------
    function render() {
      root.setAttribute('data-mako-layout', state.layout);
      root.setAttribute('data-mako-view', state.view);
      // The tab's colour set applies in the three-tab layout only; the old layout keeps its themes.
      if (state.layout === 'tabs') tokens.applyTabTokens(root, state.tab);
      else root.removeAttribute('data-mako-tab');
      header.hidden = state.layout !== 'tabs';
      tabButtons.forEach((b, i) => {
        const selected = TABS[i].id === state.tab;
        b.setAttribute('aria-selected', selected ? 'true' : 'false');
        b.setAttribute('tabindex', selected ? '0' : '-1');
      });
      const tabsLayout = state.layout === 'tabs';
      const onTab = state.view === 'tab';
      brainPanel.hidden = !(tabsLayout && onTab && state.tab === 'brain');
      aquariumPanel.hidden = !(tabsLayout && onTab && state.tab === 'aquarium');
      // Today's layout is the control room in the tab layout, and the whole app in the old one.
      controlPanel.hidden = !(onTab && (!tabsLayout || state.tab === 'control'));
      settingsPage.hidden = state.view !== 'settings';
      const tabInfo = TABS.find((t) => t.id === state.tab);
      stripeText.textContent = state.view === 'settings' ? 'Settings' : `${tabInfo.label} · ${tabInfo.hint}`;
      oldLayoutBox.checked = state.layout === 'old';
    }

    function emitChange() {
      try {
        win.dispatchEvent(new win.CustomEvent('mako-shell-change', { detail: { layout: state.layout, tab: state.tab, view: state.view } }));
      } catch { log('[shell] a change listener failed: listener-failed\n'); }
    }

    function setTab(tab, opts) {
      const n = normalizeTab(tab);
      if (n.fellBack) { log(`[shell] refused unknown tab "${String(tab).slice(0, 40)}"\n`); return false; }
      state.tab = n.tab;
      state.view = 'tab';
      render();
      if (opts && opts.focus) tabButtons[TAB_IDS.indexOf(n.tab)].focus();
      save({ uiTab: n.tab });
      emitChange();
      return true;
    }

    function setLayout(layout) {
      const n = normalizeLayout(layout);
      if (n.fellBack) { log(`[shell] refused unknown layout "${String(layout).slice(0, 40)}"\n`); return false; }
      state.layout = n.layout;
      render();
      layoutStatus.textContent = n.layout === 'old' ? 'Old layout on. Saved; it stays after a restart.' : 'Three-tab layout on. Saved; it stays after a restart.';
      save({ uiLayout: n.layout });
      emitChange();
      return true;
    }

    function openSettings() {
      closePalette({ restoreFocus: false });
      state.view = 'settings';
      render();
      emitChange();
      doc.getElementById('makoSettingsTitle').focus();
    }
    function closeSettings() {
      if (state.view !== 'settings') return;
      state.view = 'tab';
      render();
      emitChange();
      if (state.layout === 'tabs') tabButtons[TAB_IDS.indexOf(state.tab)].focus();
    }

    function commands() {
      const own = [];
      for (const t of TABS) own.push({ id: `tab:${t.id}`, label: `Go to ${t.label}`, group: 'Tabs', run: () => { if (state.layout !== 'tabs') setLayout('tabs'); setTab(t.id, { focus: true }); } });
      own.push({ id: 'settings', label: 'Open Settings', group: 'Mako', run: openSettings });
      own.push(state.layout === 'tabs'
        ? { id: 'layout:old', label: 'Use the old layout', group: 'Mako', run: () => setLayout('old') }
        : { id: 'layout:tabs', label: 'Use the three-tab layout', group: 'Mako', run: () => setLayout('tabs') });
      let extra = [];
      try { extra = typeof deps.extraCommands === 'function' ? deps.extraCommands() || [] : []; }
      catch { log('[shell] could not list app commands: commands-failed\n'); }
      return own.concat(extra.filter((c) => c && typeof c.label === 'string' && typeof c.run === 'function'));
    }

    function renderList() {
      state.shown = rankCommands(commands(), paletteInput.value);
      if (state.activeIndex >= state.shown.length) state.activeIndex = Math.max(0, state.shown.length - 1);
      while (paletteList.firstChild) paletteList.removeChild(paletteList.firstChild);
      state.shown.forEach((c, i) => {
        const li = h(doc, 'li', {
          className: 'mk-palette-option',
          attrs: { id: `makoPaletteOpt-${i}`, role: 'option', 'aria-selected': i === state.activeIndex ? 'true' : 'false' },
        }, [h(doc, 'span', { className: 'mk-palette-label', text: c.label }), h(doc, 'span', { className: 'mk-meta', text: c.group || '' })]);
        li.addEventListener('mousedown', (e) => { e.preventDefault(); });
        li.addEventListener('click', () => { state.activeIndex = i; runActive(); });
        paletteList.appendChild(li);
      });
      paletteEmpty.hidden = state.shown.length !== 0;
      if (state.shown.length) {
        paletteInput.setAttribute('aria-activedescendant', `makoPaletteOpt-${state.activeIndex}`);
        const active = doc.getElementById(`makoPaletteOpt-${state.activeIndex}`);
        if (active && typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'nearest' });
      } else paletteInput.removeAttribute('aria-activedescendant');
    }

    function openPalette() {
      if (state.paletteOpen) { paletteInput.focus(); return; }
      state.paletteOpen = true;
      state.returnFocus = doc.activeElement;
      paletteInput.value = '';
      state.activeIndex = 0;
      paletteBackdrop.hidden = false;
      renderList();
      paletteInput.focus();
    }
    function closePalette(opts) {
      if (!state.paletteOpen) return;
      state.paletteOpen = false;
      paletteBackdrop.hidden = true;
      const back = state.returnFocus;
      state.returnFocus = null;
      if ((!opts || opts.restoreFocus !== false) && back && typeof back.focus === 'function' && doc.contains(back)) back.focus();
    }
    function runActive() {
      const c = state.shown[state.activeIndex];
      if (!c) return;
      closePalette();
      try { c.run(); }
      catch { log(`[shell] command "${c.label}" failed: command-failed\n`); }
    }

    // Tablist keyboard (automatic activation).
    tablist.addEventListener('keydown', (e) => {
      const i = TAB_IDS.indexOf(state.tab);
      const next = nextTabIndex(e.key, i, TABS.length);
      if (next === null) return;
      e.preventDefault();
      setTab(TAB_IDS[next], { focus: true });
    });
    tabButtons.forEach((b, i) => b.addEventListener('click', () => setTab(TAB_IDS[i])));
    paletteButton.addEventListener('click', openPalette);
    settingsButton.addEventListener('click', openSettings);
    settingsClose.addEventListener('click', closeSettings);
    oldLayoutBox.addEventListener('change', () => setLayout(oldLayoutBox.checked ? 'old' : 'tabs'));
    paletteBackdrop.addEventListener('mousedown', (e) => { if (e.target === paletteBackdrop) closePalette(); });

    paletteInput.addEventListener('input', () => { state.activeIndex = 0; renderList(); });
    paletteInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!state.shown.length) return;
        const d = e.key === 'ArrowDown' ? 1 : -1;
        state.activeIndex = (state.activeIndex + d + state.shown.length) % state.shown.length;
        renderList();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        runActive();
      } else if (e.key === 'Tab') {
        // The dialog holds one control: keep focus in it (dialog focus trap).
        e.preventDefault();
      }
    });

    // Global keys, on window in the capture phase so they run before the terminal sees the key and
    // before the app's own capture listener on document. Ctrl K opens or closes the palette; Esc
    // closes the palette, then the Settings page. Both are consumed so they don't reach a PTY.
    win.addEventListener('keydown', (e) => {
      if (isPaletteChord(e)) {
        e.preventDefault(); e.stopPropagation();
        if (state.paletteOpen) closePalette(); else openPalette();
        return;
      }
      if (e.key === 'Escape') {
        if (state.paletteOpen) { e.preventDefault(); e.stopPropagation(); closePalette(); return; }
        if (state.view === 'settings') { e.preventDefault(); e.stopPropagation(); closeSettings(); }
      }
    }, true);

    render();
    emitChange();

    return {
      setTab, setLayout, openPalette, closePalette, openSettings, closeSettings,
      getState: () => ({ layout: state.layout, tab: state.tab, view: state.view, paletteOpen: state.paletteOpen }),
      visibleCommands: () => state.shown.map((c) => c.label),
    };
  }

  function buildShortcutTable(doc) {
    const table = h(doc, 'table', { className: 'mk-shortcuts', attrs: { id: 'makoShortcutTable' } });
    const head = h(doc, 'tr', {}, [h(doc, 'th', { text: 'Keys', attrs: { scope: 'col' } }), h(doc, 'th', { text: 'Does', attrs: { scope: 'col' } }), h(doc, 'th', { text: 'Where', attrs: { scope: 'col' } })]);
    table.appendChild(h(doc, 'thead', {}, [head]));
    const body = h(doc, 'tbody');
    for (const s of SHORTCUTS) body.appendChild(h(doc, 'tr', {}, [h(doc, 'td', {}, [h(doc, 'kbd', { className: 'mk-kbd', text: s.keys })]), h(doc, 'td', { text: s.action }), h(doc, 'td', { className: 'mk-meta', text: s.scope })]));
    table.appendChild(body);
    return table;
  }

  return {
    TABS, TAB_IDS, LAYOUTS, DEFAULT_LAYOUT, DEFAULT_TAB, SHORTCUTS, SETTINGS_SECTIONS,
    normalizeLayout, normalizeTab, nextTabIndex, isPaletteChord, rankCommands, createShell, reasonOf,
  };
});
