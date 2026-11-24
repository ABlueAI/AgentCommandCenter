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
  // later rows (S19's needs-you jump key) add their own entries here.
  const SHORTCUTS = Object.freeze([
    Object.freeze({ keys: 'Ctrl K', action: 'Open the command palette', scope: 'Every tab, both layouts' }),
    Object.freeze({ keys: 'Ctrl Space (hold)', action: 'Push to talk: dictate into the last pane you used, typed when you let go (S18 points it at the message box)', scope: 'Every tab, both layouts' }),
    Object.freeze({ keys: 'Esc', action: 'Close the palette or the Settings page', scope: 'While one is open' }),
    Object.freeze({ keys: 'Left / Right', action: 'Move between tabs', scope: 'Tab bar focused' }),
    Object.freeze({ keys: 'Home / End', action: 'First or last tab', scope: 'Tab bar focused' }),
    Object.freeze({ keys: 'Up / Down, Enter', action: 'Pick and run a palette command', scope: 'Palette open' }),
  ]);

  // The Settings page's sections (brief 8). Sections whose controls come with a later step say so
  // visibly instead of showing an empty box.
  const SETTINGS_SECTIONS = Object.freeze([
    Object.freeze({ id: 'layout', title: 'Layout' }),
    Object.freeze({ id: 'general', title: 'Today\'s settings' }),
    Object.freeze({ id: 'shortcuts', title: 'Shortcuts' }),
    Object.freeze({ id: 'shark', title: 'Shark', pending: 'The shark\'s look, colours and frame rate come with the brain tab (S18).' }),
    Object.freeze({ id: 'quiet', title: 'Quiet hours', pending: 'A manual switch in the top bar. It is turned on once the brain tab (S18) and the control room (S19) make alerts and voice honour it; a schedule is for 1.2.' }),
    Object.freeze({ id: 'repos', title: 'Repos and emblems', pending: 'The emblem rail on the left switches repos. Uploading your own emblem image waits for Blue\'s go (design brief question 10).' }),
    Object.freeze({ id: 'voice', title: 'Voice', pending: 'Voice and speed are set in the control room\'s terminal bar for now.' }),
    Object.freeze({ id: 'keys', title: 'Keys', pending: 'Keys are stored from the banners at the top of the window for now.' }),
  ]);

  // Quiet hours and Pause all are stored as the ISO time they started, or null when off. Anything
  // else in the stored settings is treated as off and reported.
  function normalizeSince(value) {
    if (value === undefined || value === null) return { since: null, fellBack: false };
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/.test(value) && !Number.isNaN(Date.parse(value))) {
      return { since: value, fellBack: false };
    }
    return { since: null, fellBack: true };
  }
  // "2:05 PM" in the user's own clock format.
  function clockTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  // The banners' words (brief 4.1). Each piece says plainly what it does not do yet.
  function quietBannerText(since) {
    return `Quiet hours since ${clockTime(since)}. Agents keep working.`;
  }
  function pausedBannerText(since) {
    return `Paused since ${clockTime(since)}.`;
  }

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

  // Exactly Ctrl+Space (push to talk), no Shift, Alt or Meta.
  function isPushToTalkChord(e) {
    return !!e && e.ctrlKey === true && !e.shiftKey && !e.altKey && !e.metaKey && (e.code === 'Space' || e.key === ' ');
  }

  /**
   * Push to talk (hold Ctrl Space). Pure state machine, so every edge is unit-tested.
   * deps: { isRecording(), press() (clicks Dictate), notify(text, ms), now(), pendingMs }
   * The microphone opens only after the OS grants it, so a quick tap can come up before
   * isRecording() turns true. Then the stop is remembered and sent the moment recording starts
   * (onSttStatus('recording')), never dropped. A remembered stop expires after pendingMs, so a
   * refused start can't stop a later recording Blue starts with the mouse.
   */
  function createPushToTalk(deps) {
    const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
    const pendingMs = deps.pendingMs > 0 ? deps.pendingMs : 15000;
    const notify = typeof deps.notify === 'function' ? deps.notify : () => {};
    const st = { held: false, pendingAt: null, stopWhenStarted: false };
    const pendingLive = () => st.pendingAt !== null && now() - st.pendingAt < pendingMs;

    function keydown(e) {
      if (!isPushToTalkChord(e)) return false;
      if (e.repeat || st.held) return true;
      st.held = true;
      if (deps.isRecording()) return true;          // already recording (started with the mouse)
      st.stopWhenStarted = false;
      if (deps.press() !== false) st.pendingAt = now();
      return true;
    }
    function release() {
      if (!st.held) return false;
      st.held = false;
      if (deps.isRecording()) { st.pendingAt = null; st.stopWhenStarted = false; deps.press(); return true; }
      if (pendingLive()) {
        st.stopWhenStarted = true;
        notify('You let go before the microphone opened. It stops as soon as it opens.', 6000);
      }
      return true;
    }
    function keyup(e) {
      if (!st.held || !e || !(e.code === 'Space' || e.key === ' ' || e.key === 'Control')) return false;
      return release();
    }
    function onSttStatus(state) {
      if (state === 'recording') {
        const stop = st.stopWhenStarted && pendingLive();
        st.pendingAt = null;
        st.stopWhenStarted = false;
        if (stop) deps.press();
      } else if (state === 'error' || state === 'idle') {
        st.pendingAt = null;
        st.stopWhenStarted = false;
      }
    }
    return { keydown, keyup, blur: release, onSttStatus, state: () => Object.assign({}, st) };
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
    return e && typeof e.code === 'string' && /^[a-z0-9-]{1,64}$/.test(e.code) ? e.code : `unknown-error, ${errorKind(e)}`;
  }
  // A bounded, path-free word for an error: its class name (TypeError) and an errno code (EPERM),
  // never its message.
  function errorKind(e) {
    const name = e && typeof e.name === 'string' && /^[A-Za-z]{1,40}$/.test(e.name) ? e.name : 'Error';
    const code = e && typeof e.code === 'string' && /^E[A-Z]{2,20}$/.test(e.code) ? ` ${e.code}` : '';
    return name + code;
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
      return p.then((r) => {
        // main answers with the saved settings, or rejects when the write fails; an explicit
        // { ok: false } is treated as a refusal too.
        if (r && r.ok === false) throw r;
        return true;
      }).catch((e) => {
        log(`[shell] could not save settings (${Object.keys(partial).join(', ')}): save-failed (${errorKind(e)})\n`);
        return false;
      });
    };

    const stored = deps.settings || {};
    const layoutChoice = normalizeLayout(stored.uiLayout);
    if (layoutChoice.fellBack) log('[shell] stored layout not recognised; using the three-tab layout\n');
    const tabChoice = normalizeTab(stored.uiTab);
    if (tabChoice.fellBack) log('[shell] stored tab not recognised; opening the control room\n');

    const quietChoice = normalizeSince(stored.uiQuietSince);
    if (quietChoice.fellBack) log('[shell] stored quiet-hours state not recognised; quiet hours off\n');
    const pausedChoice = normalizeSince(stored.uiPausedSince);
    if (pausedChoice.fellBack) log('[shell] stored Pause all state not recognised; not paused\n');
    const now = typeof deps.now === 'function' ? deps.now : () => Date.now();

    // Every dependency is checked before the page is touched, so a refusal leaves nothing behind.
    if (!tokens || typeof tokens.applyTabTokens !== 'function' || typeof tokens.clearTabTokens !== 'function') throw refusal('tokens-missing');
    if (!doc.getElementById('makoShell') || !doc.getElementById('makoViews')) throw refusal('mount-missing');
    if (!doc.getElementById('makoBanners')) throw refusal('banners-missing');
    if (!deps.controlPanel) throw refusal('control-panel-missing');

    const state = {
      layout: layoutChoice.layout, tab: tabChoice.tab, view: 'tab', paletteOpen: false, returnFocus: null, activeIndex: 0, shown: [],
      quietSince: quietChoice.since, pausedSince: pausedChoice.since,
    };

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

    // Top-bar status pieces (brief 8): the usage chip (today's S11 usage panel, moved here in the
    // three-tab layout so it shows on every tab), the quiet-hours switch and Pause all. The two
    // switches are shown but stay disabled until the rows that give them their effect turn them on
    // (S18 and S19 honour quiet hours; S19 wires what Pause all does to panes, a process-control
    // change with its own second review): a switch that changed nothing would read as a promise.
    const statusSlot = h(doc, 'div', { className: 'mk-status', attrs: { id: 'makoStatusSlot' } });
    const quietButton = h(doc, 'button', {
      className: 'mk-btn mk-quiet', text: 'Quiet hours',
      attrs: { type: 'button', id: 'makoQuiet', 'aria-pressed': 'false', disabled: '', title: 'Quiet hours: S18 and S19 make alerts and voice honour this switch, and enable it' },
    });
    const pauseButton = h(doc, 'button', {
      className: 'mk-btn mk-pause', text: 'Pause all',
      attrs: { type: 'button', id: 'makoPauseAll', 'aria-pressed': 'false', disabled: '', title: 'Pause all: S19 wires what pausing does to panes, and enables it' },
    });
    const usagePanel = deps.usagePanel || null;
    const usageHome = usagePanel ? { parent: usagePanel.parentNode, next: usagePanel.nextSibling } : null;
    statusSlot.appendChild(quietButton);
    statusSlot.appendChild(pauseButton);
    const bar = h(doc, 'div', { className: 'mk-tabbar' }, [tablist, h(doc, 'span', { className: 'mk-spacer' }), statusSlot, paletteButton, settingsButton]);

    // Banners show in both layouts, on every tab (index.html places #makoBanners outside the shell).
    const banners = doc.getElementById('makoBanners');
    if (!banners) throw refusal('banners-missing');
    const quietBanner = h(doc, 'div', { className: 'mk-banner mk-banner-quiet', attrs: { id: 'makoQuietBanner', role: 'status', hidden: '' } });
    const quietText = h(doc, 'span', { className: 'mk-banner-text' });
    const quietEnd = h(doc, 'button', { className: 'mk-btn mk-banner-btn', text: 'End now', attrs: { type: 'button', id: 'makoQuietEnd' } });
    quietBanner.appendChild(quietText); quietBanner.appendChild(quietEnd);
    const pausedBanner = h(doc, 'div', { className: 'mk-banner mk-banner-paused', attrs: { id: 'makoPausedBanner', role: 'status', hidden: '' } });
    const pausedText = h(doc, 'span', { className: 'mk-banner-text' });
    const pausedResume = h(doc, 'button', { className: 'mk-btn mk-banner-btn', text: 'Resume all', attrs: { type: 'button', id: 'makoResumeAll' } });
    pausedBanner.appendChild(pausedText); pausedBanner.appendChild(pausedResume);
    // One short-notice line on every tab and in both layouts (push to talk says here what it is
    // doing, or why it refused, since the Logs tab and the Dictate control may be hidden).
    const noticeBanner = h(doc, 'div', { className: 'mk-banner mk-banner-notice', attrs: { id: 'makoNotice', role: 'status', 'aria-live': 'polite', hidden: '' } });
    banners.appendChild(quietBanner);
    banners.appendChild(pausedBanner);
    banners.appendChild(noticeBanner);
    header.appendChild(stripe);
    header.appendChild(bar);

    // -- panels: brain and aquarium frames, the control room is today's layout ----------------------
    // Each frame is the shared sidebar's slot plus the tab's own content (S18 and S20 build there).
    function framePanel(id, title, body) {
      const main = h(doc, 'div', { className: 'mk-frame-main' }, [h(doc, 'p', { className: 'mk-overline', text: title }), h(doc, 'p', { className: 'mk-frame-note', text: body })]);
      return h(doc, 'section', {
        className: 'mk-panel mk-frame', attrs: { id: `makoPanel-${id}`, role: 'tabpanel', 'aria-labelledby': `makoTab-${id}`, tabindex: '0' },
      }, [main]);
    }
    // The sidebar frame (brief 8): small-caps sections of icon-and-word items. "Everything else"
    // is always there; tabs add their own sections with setSidebarSection. The control room keeps
    // today's sidebar, so this one shows on the brain and aquarium tabs.
    const sidebar = h(doc, 'aside', { className: 'mk-sidebar', attrs: { id: 'makoSidebar', 'aria-label': 'Sidebar' } });
    const sidebarSections = new Map();
    function setSidebarSection(id, title, items) {
      let sec = sidebarSections.get(id);
      if (!sec) {
        sec = h(doc, 'nav', { className: 'mk-sidebar-section', attrs: { 'aria-label': String(title).slice(0, 60), 'data-section': id } });
        sidebarSections.set(id, sec);
        // "Everything else" stays last.
        const last = sidebarSections.get('everything');
        if (last && id !== 'everything') sidebar.insertBefore(sec, last); else sidebar.appendChild(sec);
      }
      while (sec.firstChild) sec.removeChild(sec.firstChild);
      sec.appendChild(h(doc, 'p', { className: 'mk-overline', text: String(title).slice(0, 60) }));
      for (const it of Array.isArray(items) ? items.slice(0, 20) : []) {
        if (!it || typeof it.label !== 'string' || typeof it.run !== 'function') continue;
        const b = h(doc, 'button', { className: 'mk-side-item', text: it.label.slice(0, 60), attrs: { type: 'button' } });
        b.addEventListener('click', () => {
          try { it.run(); } catch (e) { log(`[shell] sidebar item "${it.label.slice(0, 60)}" failed: command-failed (${errorKind(e)})\n`); }
        });
        sec.appendChild(b);
      }
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
      } else if (section.id === 'general') {
        // app.js fills this with today's settings (theme, projects root); until it does, it says where they are.
        sec.appendChild(h(doc, 'div', { className: 'mk-settings-body', attrs: { id: 'makoSettings-general-body' } }, [
          h(doc, 'p', { className: 'mk-meta mk-pending', text: 'Theme and the projects folder are in the control room\'s top bar.' }),
        ]));
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
      else { root.removeAttribute('data-mako-tab'); tokens.clearTabTokens(root); }
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
      // The shared sidebar moves into whichever frame is showing.
      const framed = !brainPanel.hidden ? brainPanel : !aquariumPanel.hidden ? aquariumPanel : null;
      if (framed && sidebar.parentNode !== framed) framed.insertBefore(sidebar, framed.firstChild);
      // Today's layout is the control room in the tab layout, and the whole app in the old one.
      controlPanel.hidden = !(onTab && (!tabsLayout || state.tab === 'control'));
      settingsPage.hidden = state.view !== 'settings';
      const tabInfo = TABS.find((t) => t.id === state.tab);
      // The stripe names the current scope: the repo in use, then where you are.
      let scope = '';
      try { scope = typeof deps.currentScope === 'function' ? String(deps.currentScope() || '') : ''; }
      catch { log('[shell] could not read the current repo for the scope stripe: scope-failed\n'); }
      const where = state.view === 'settings' ? 'Settings' : `${tabInfo.label} · ${tabInfo.hint}`;
      stripeText.textContent = scope ? `${scope.slice(0, 80)} · ${where}` : `No repo selected · ${where}`;
      oldLayoutBox.checked = state.layout === 'old';
      // The usage chip lives in the shell's top bar in the three-tab layout, and goes back to its
      // own place in the old top bar otherwise. Moving the node keeps usage-view.js's wiring.
      if (usagePanel) {
        if (tabsLayout && usagePanel.parentNode !== statusSlot) statusSlot.insertBefore(usagePanel, statusSlot.firstChild);
        else if (!tabsLayout && usagePanel.parentNode !== usageHome.parent) {
          if (usageHome.next && usageHome.next.parentNode === usageHome.parent) usageHome.parent.insertBefore(usagePanel, usageHome.next);
          else usageHome.parent.appendChild(usagePanel);
        }
      }
      quietButton.setAttribute('aria-pressed', state.quietSince ? 'true' : 'false');
      pauseButton.setAttribute('aria-pressed', state.pausedSince ? 'true' : 'false');
      quietBanner.hidden = !state.quietSince;
      if (state.quietSince) quietText.textContent = quietBannerText(state.quietSince);
      pausedBanner.hidden = !state.pausedSince;
      if (state.pausedSince) pausedText.textContent = pausedBannerText(state.pausedSince);
      root.setAttribute('data-mako-quiet', state.quietSince ? 'on' : 'off');
      root.setAttribute('data-mako-paused', state.pausedSince ? 'on' : 'off');
    }

    function emitChange() {
      try {
        win.dispatchEvent(new win.CustomEvent('mako-shell-change', { detail: { layout: state.layout, tab: state.tab, view: state.view, quietSince: state.quietSince, pausedSince: state.pausedSince } }));
      } catch { log('[shell] could not send the shell change event: event-failed\n'); }
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
      const label = n.layout === 'old' ? 'Old layout on.' : 'Three-tab layout on.';
      layoutStatus.textContent = `${label} Saving…`;
      const token = {};
      state.layoutSave = token;
      save({ uiLayout: n.layout }).then((ok) => {
        if (state.layoutSave !== token) return;   // a later switch owns the line now
        layoutStatus.textContent = ok ? `${label} Saved; it stays after a restart.`
          : `${label} Not saved (save-failed): Mako will open in the other layout after a restart. Details in Logs.`;
      });
      emitChange();
      return true;
    }

    // showNotice(text, ms): ms > 0 hides it after that long; 0 keeps it until replaced or cleared.
    let noticeTimer = null;
    function showNotice(text, ms) {
      if (noticeTimer) { clearTimeout(noticeTimer); noticeTimer = null; }
      const t = String(text || '').slice(0, 240);
      noticeBanner.textContent = t;
      noticeBanner.hidden = !t;
      if (t && ms > 0) noticeTimer = setTimeout(() => { noticeBanner.hidden = true; noticeBanner.textContent = ''; noticeTimer = null; }, ms);
    }

    // The one quiet state and the one paused state. S18 and S19 read them (getState, and the
    // 'mako-shell-change' event) and give them their effect.
    function setQuiet(on) {
      state.quietSince = on ? (state.quietSince || new Date(now()).toISOString()) : null;
      render();
      save({ uiQuietSince: state.quietSince });
      emitChange();
      return state.quietSince;
    }
    function setPaused(on) {
      state.pausedSince = on ? (state.pausedSince || new Date(now()).toISOString()) : null;
      render();
      save({ uiPausedSince: state.pausedSince });
      emitChange();
      return state.pausedSince;
    }
    // A row that gives a switch its effect turns it on here (S18 and S19).
    function enableSwitch(name) {
      const btn = name === 'quiet' ? quietButton : name === 'pause' ? pauseButton : null;
      if (!btn) { log(`[shell] refused to enable unknown switch "${String(name).slice(0, 40)}"\n`); return false; }
      btn.disabled = false;
      btn.removeAttribute('title');
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
      catch (e) { log(`[shell] could not list app commands: commands-failed (${errorKind(e)})\n`); }
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
      catch (e) { log(`[shell] command "${c.label}" failed: command-failed (${errorKind(e)})\n`); }
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
    quietButton.addEventListener('click', () => setQuiet(!state.quietSince));
    pauseButton.addEventListener('click', () => setPaused(!state.pausedSince));
    quietEnd.addEventListener('click', () => setQuiet(false));
    pausedResume.addEventListener('click', () => setPaused(false));
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

    let everything = [];
    try { everything = typeof deps.sidebarItems === 'function' ? deps.sidebarItems() || [] : []; }
    catch (e) { log(`[shell] could not list the sidebar items: commands-failed (${errorKind(e)})\n`); }
    setSidebarSection('everything', 'Everything else', everything.concat([{ label: 'Settings', run: () => openSettings() }]));

    // First render. If it fails, take back everything this shell put on the page and refuse.
    try {
      render();
    } catch (e) {
      for (const n of [stripe, bar, brainPanel, aquariumPanel, settingsPage, quietBanner, pausedBanner, noticeBanner, paletteBackdrop]) {
        if (n.parentNode) n.parentNode.removeChild(n);
      }
      if (usagePanel && usageHome && usagePanel.parentNode !== usageHome.parent) {
        if (usageHome.next && usageHome.next.parentNode === usageHome.parent) usageHome.parent.insertBefore(usagePanel, usageHome.next);
        else usageHome.parent.appendChild(usagePanel);
      }
      for (const a of ['data-mako-layout', 'data-mako-view', 'data-mako-tab', 'data-mako-quiet', 'data-mako-paused']) root.removeAttribute(a);
      try { tokens.clearTabTokens(root); } catch { /* nothing more to take back */ }
      header.hidden = true;
      controlPanel.hidden = false;
      const r = refusal('render-failed');
      r.kind = errorKind(e);
      throw r;
    }

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

    emitChange();

    return {
      setTab, setLayout, openPalette, closePalette, openSettings, closeSettings,
      setQuiet, setPaused, enableSwitch, refreshScope: render, showNotice, setSidebarSection,
      getState: () => ({ layout: state.layout, tab: state.tab, view: state.view, paletteOpen: state.paletteOpen, quietSince: state.quietSince, pausedSince: state.pausedSince }),
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
    normalizeLayout, normalizeTab, normalizeSince, quietBannerText, pausedBannerText, nextTabIndex, isPaletteChord, isPushToTalkChord, createPushToTalk, errorKind, rankCommands, createShell, reasonOf,
  };
});
