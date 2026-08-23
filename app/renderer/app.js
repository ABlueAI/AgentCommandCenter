// Command Center — renderer logic. Talks to main only through `window.cc` (preload).
// No Node here by design; this file is pure UI + IPC calls.

const $ = (sel) => document.querySelector(sel);
const ACCEPTANCE_BUILD = 'V5 STACK CONTENT ACCEPTANCE 2026-07-21.14';
const state = { repo: '', githubUrl: '', worktrees: [], chosenRole: 'builder', chosenCli: 'claude', hardTask: false, theme: 'obsidian', ttsVoice: '', ttsSpeed: 1, videoModel: 'gemini-2.5-flash-lite', mediaResolution: 'MEDIUM', analysisMode: 'transcript' };
const audioModules = window.ccAudioModuleHealth.createAudioModuleHealth();
const quickLinksView = window.ccQuickLinksView.createQuickLinksView({
  document,
  api: {
    list: () => cc.quickLinksList(),
    save: (text) => cc.quickLinksSave(text),
    open: (id) => cc.quickLinksOpen(id),
  },
  log: (line) => appendLog(line),
});
// MAIN-OWNED TURN ADMISSION BUDGET — ABSENT, NOT INERT.
// `window.ccAdmission` exists only when main put the controlled-run token in `additionalArguments`,
// which it does only when a run is configured in ITS OWN startup environment. Renderer script cannot
// add a process argument, so it cannot make this non-null. With no run configured this stays null,
// nothing is constructed, `mount()` is never reached, and #admissionHost keeps zero children.
//
// This view is NOT a second way into a PTY. It can only ask main to spend one admission over
// `ccAdmission.submitPrompt`; ordinary `cc.ptyWrite` traffic to the controlled pane is refused in
// main at the single `pty-write` chokepoint, and that refusal is not something this file can waive.
const admissionView = window.ccAdmission
  ? window.ccAdmissionView.createAdmissionView({
      document,
      bridge: window.ccAdmission,
      log: (line) => appendLog(line),
    })
  : null;

function audioModuleFromFailure(source, detail) {
  const text = `${source || ''} ${detail || ''}`.toLowerCase();
  if (text.includes('tts.js') || text.includes('kokoro')) return 'tts';
  // Recognize the OFFICIAL bundle's identifiers (transformers.min / @huggingface/transformers)
  // as well as this module's own filename; transformers.web stays for the legacy vendor path.
  if (text.includes('stt.js') || text.includes('transformers.web')
    || text.includes('transformers.min') || text.includes('@huggingface/transformers')) return 'stt';
  return '';
}

function renderAudioModuleState(kind) {
  const moduleState = audioModules.get(kind);
  const el = $(kind === 'tts' ? '#ttsStatus' : '#sttStatus');
  if (!el || moduleState.phase !== 'failed') return;
  el.textContent = `engine unavailable — ${moduleState.detail}`;
}

function reportAudioModuleFailure(kind, detail) {
  const before = audioModules.get(kind);
  const after = audioModules.markFailed(kind, detail);
  renderAudioModuleState(kind);
  if (before.phase !== 'failed' || before.detail !== after.detail) appendLog(`[${kind}] engine unavailable: ${after.detail}\n`);
}

// app.js is deliberately loaded before the deferred audio modules. Catch an
// import-time failure here, because a module that dies before its ready event
// cannot report its own failure.
window.addEventListener('error', (event) => {
  const source = (event && event.filename) || (event && event.target && event.target.src);
  const kind = audioModuleFromFailure(source, event && event.message);
  if (kind) reportAudioModuleFailure(kind, (event && event.message) || 'browser module failed to load');
}, true);
window.addEventListener('unhandledrejection', (event) => {
  const reason = event && event.reason;
  const detail = (reason && (reason.message || String(reason))) || 'browser module failed to load';
  const kind = audioModuleFromFailure('', detail);
  if (kind) reportAudioModuleFailure(kind, detail);
});

// Blue Helm role metadata (UI + flow only — the tools allowlist that ENFORCES read-only
// lives in agent-roles/*.md / ~/.claude/agents). Keep colors in sync with styles.css and
// the build spec. needsWorktree=false roles run against an existing checkout or repo root.
const ROLES = {
  builder:          { label: 'Builder',        glyph: '🔨', cli: 'claude', readOnly: false, needsWorktree: true,  newAgent: true },
  reviewer:         { label: 'Reviewer',       glyph: '🔎', cli: 'claude', readOnly: true,  needsWorktree: false, newAgent: false },
  'codebase-scout': { label: 'Codebase Scout', glyph: '🧭', cli: 'claude', readOnly: true,  needsWorktree: false, newAgent: false },
  'web-scout':      { label: 'Web Scout',       glyph: '🌐', cli: 'claude', readOnly: false, needsWorktree: false, newAgent: true },
  'source-scout':   { label: 'Source Scout',    glyph: '🔍', cli: 'claude', readOnly: false, needsWorktree: false, newAgent: true },
  operator:         { label: 'Operator',        glyph: '📣', cli: 'claude', readOnly: false, needsWorktree: false, newAgent: true },
  // Video-scout runs on Gemini (the only model that watches video), launched via the videoScout
  // path, not claude --agent. Input is a URL, not a task name.
  'video-scout':    { label: 'Video Scout',     glyph: '🎥', cli: 'gemini', readOnly: false, needsWorktree: false, newAgent: true, video: true },
};

// ---- chat bubble renderer -----------------------------------------------
function makeBubble(type, text, partial) {
  const div = document.createElement('div');
  div.className = `chat-bubble ${type}${partial ? ' partial' : ''}`;
  const inner = document.createElement('span');
  inner.className = 'bubble-text';
  inner.textContent = text;
  div.appendChild(inner);
  return div;
}

function drainChatEvents(t) {
  t.rafId = null;
  const events = t.pendingEvents.splice(0);
  for (const ev of events) {
    if (ev.partial) {
      if (!t.tailBubble) {
        t.tailBubble = makeBubble(ev.type, ev.text, true);
        t.chatBody.appendChild(t.tailBubble);
      } else {
        t.tailBubble.querySelector('.bubble-text').textContent = ev.text;
      }
    } else {
      if (t.tailBubble) {
        // Finalize the in-progress bubble with the confirmed final text.
        t.tailBubble.querySelector('.bubble-text').textContent = ev.text;
        t.tailBubble.classList.remove('partial');
        t.tailBubble = null;
      } else {
        t.chatBody.appendChild(makeBubble(ev.type, ev.text, false));
      }
    }
  }
  t.chatBody.scrollTop = t.chatBody.scrollHeight;
}

// ---- in-app terminals (xterm.js front-end; real ConPTY lives in main) -------
const terms = new Map(); // id -> { term, fit, pane, ro, parser, chatBody, pendingEvents, rafId, tailBubble }
let termSeq = 0;
let activeTermId = null;  // last-focused pane (dictation LOCKS its target from this at record start)
let sttDictationTargetId = null; // pane locked when recording started; transcript goes ONLY here
const THEMES_XTERM = {
  obsidian:  { background: '#06090d', foreground: '#c8d2dc', cursor: '#20c5b7', selectionBackground: 'rgba(32,197,183,.35)' },
  void:      { background: '#070510', foreground: '#d6cdf0', cursor: '#a78bfa', selectionBackground: 'rgba(167,139,250,.35)' },
  dracula:   { background: '#21222c', foreground: '#f8f8f2', cursor: '#bd93f9', selectionBackground: 'rgba(189,147,249,.35)' },
  nord:      { background: '#272c36', foreground: '#e5e9f0', cursor: '#88c0d0', selectionBackground: 'rgba(136,192,208,.35)' },
  synthwave: { background: '#191223', foreground: '#f3e9ff', cursor: '#ff7edb', selectionBackground: 'rgba(255,126,219,.35)' },
};
// Shared ANSI palette so agent output stays readable across all themes.
const ANSI = { black: '#0b0f14', red: '#e0556b', green: '#3ad29f', yellow: '#d9b54a', blue: '#38bdf8', magenta: '#8b7cf6', cyan: '#20c5b7', white: '#c8d2dc', brightBlack: '#6b7785', brightWhite: '#e6edf3' };
function xtermTheme() { return { ...ANSI, ...(THEMES_XTERM[state.theme] || THEMES_XTERM.obsidian) }; }
function applyTheme(name) {
  if (!THEMES_XTERM[name]) name = 'obsidian';
  state.theme = name;
  document.documentElement.setAttribute('data-theme', name);
  const sel = $('#themeSelect'); if (sel) sel.value = name;
  const t = xtermTheme();
  for (const x of terms.values()) { x.term.options.theme = t; } // re-theme live terminals
  cc.saveSettings({ theme: name });
}
function switchTab(name) {
  // Leaving the Terminals view must not strand maximize state (V1a): coming back
  // always lands on the normal grid, never on a half-forgotten maximized layout.
  if (name !== 'terminals') paneMaximizer.handleViewSwitch();
  // V5b2: same rule for the Library reader — leaving the Library tab restores its layout.
  if (name !== 'library') libMaximizer.handleViewSwitch();
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach((x) => x.classList.toggle('active', x.dataset.pane === name));
}
// RESIZE OWNERSHIP. A Dockview-hosted terminal is fitted ONLY by its guarded fit controller, which
// checks visibility and geometry inside an animation frame and refuses zero/hidden/non-finite sizes.
// This global path is the CLASSIC-grid fitter, so it must skip docked panes: running both would give
// a hosted terminal two effective resize senders and let ungated geometry reach `pty-resize`.
function fitAllTerms() {
  for (const [id, t] of terms) {
    if (paneIsDocked(id)) continue;   // the fit controller owns this pane
    try { t.fit.fit(); } catch {}
  }
}

// V1a maximize: the state machine lives in pane-maximize.js; every side effect
// (refit + PTY resize + focus + button glyphs) lives HERE in onLayout, so all exit
// paths — toggle, Escape, close-while-maximized, view switch — behave identically.
const paneMaximizer = window.ccPaneMaximize.createPaneMaximizer({
  grid: $('#terminalGrid'),
  log: (line) => appendLog(line),
  onLayout: (maximizedId, previousId) => {
    for (const [tid, t] of terms) {
      const btn = t.pane.querySelector('.max');
      if (btn) {
        btn.textContent = maximizedId === tid ? '🗗' : '⛶';
        btn.title = maximizedId === tid ? 'Restore the grid (Esc)' : 'Maximize pane (Esc restores the grid)';
      }
      // Refit and tell ConPTY the new geometry so long lines REFLOW to the new width
      // instead of becoming unreachable. Hidden panes no-op (FitAddon proposes nothing
      // for a zero-size container) and refit again when the grid returns.
      try { t.fit.fit(); cc.ptyResize(tid, t.term.cols, t.term.rows); } catch {}
    }
    // Predictable focus: the maximized pane on maximize; the same pane back in the
    // grid on restore (previousId). Close-while-maximized passes neither — the pane
    // is gone and focus stays wherever the user puts it next.
    const focusId = (maximizedId && terms.has(maximizedId)) ? maximizedId
      : (previousId && terms.has(previousId)) ? previousId : null;
    if (focusId) { activeTermId = focusId; try { terms.get(focusId).term.focus(); } catch {} }
  },
});
// V5b2: the Library report reader reuses the SAME maximize state machine (pane-maximize.js) — one
// controller for the reader panel inside the library split. onLayout only flips the button glyph;
// the CSS (.lib-grid.has-maximized) hides the run list and lets the reader fill the tab.
const libMaximizer = window.ccPaneMaximize.createPaneMaximizer({
  grid: $('#libGrid'),
  log: (line) => appendLog(line),
  onLayout: (maximizedId) => {
    const btn = $('#libMax');
    if (btn) {
      btn.textContent = maximizedId ? '🗗' : '⛶';
      btn.title = maximizedId ? 'Restore (Esc)' : 'Maximize (Esc restores)';
    }
  },
});
// Escape restores the grid while a pane is maximized, and is CONSUMED (capture phase,
// before xterm sees it) so the same press doesn't also reach the PTY; press again for
// a normal terminal ESC. With nothing maximized the key flows to the terminal untouched.
// V5b2: the Library reader's maximizer is offered the same key when nothing terminal consumed it.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (paneMaximizer.handleEscape() || libMaximizer.handleEscape())) { e.preventDefault(); e.stopPropagation(); }
}, true);
// ---- V5b2 Library / in-app report reader -------------------------------------
// The Library lists bounded, schema-valid Video Scout records and reads their reports through
// main-owned identities (opaque handles / pane IDs). Every manifest-derived value is inserted with
// textContent via the shared safe builder (agent-dom.js `el`) or into a <pre>.textContent — never
// innerHTML/Markdown/URL attributes. Copy Report and Maximize REUSE the V1a clipboard consumer and
// the pane-maximize controller (no duplicate implementations).
const LV = window.ccLibraryView;
const libState = { entries: [], selectedHandle: null, currentReportText: '', loaded: false };
const libClip = window.ccClipboardConsumer.createClipboardConsumer({
  invokeRead: () => cc.clipboardRead(),
  invokeWrite: (s) => cc.clipboardWrite(s),
  ptyWrite: () => {},          // the reader never pastes into a PTY
  log: appendLog,
  paneId: 'library',
});
// V3b follow-up Q&A: one explicit question about the displayed stored report. The controller owns
// the renderer-local epoch (stale-response suppression) and the follow-up section's DOM; the ONLY
// submission path is its Ask button. It sends main nothing but {source, handle|paneId, question}.
const libFollowup = window.ccReportFollowup.createReportFollowup({
  el: agentDom.el,
  doc: document,
  submit: (req) => cc.libraryFollowup(req),
  log: appendLog,
});

function libFilters() {
  return {
    title: $('#libSearch').value,
    mode: $('#libMode').value,
    route: $('#libRoute').value,
    outcome: $('#libOutcome').value,
    dateKind: $('#libDateKind').value,
  };
}

function renderLibraryList() {
  const listEl = $('#libList');
  const filtered = LV.sortEntries(LV.filterEntries(libState.entries, libFilters()), $('#libSort').value);
  listEl.textContent = '';   // clear via textContent, never innerHTML
  if (filtered.length === 0) {
    listEl.appendChild(agentDom.el(document, 'div', {
      className: 'empty muted',
      text: libState.entries.length ? 'No runs match the current filters.' : 'No Video Scout runs found yet.',
    }));
  } else {
    for (const entry of filtered) {
      const row = LV.buildRunRow({ el: agentDom.el, doc: document }, entry);
      if (entry.handle === libState.selectedHandle) row.classList.add('selected');
      row.onclick = () => selectLibraryEntry(entry);
      listEl.appendChild(row);
    }
  }
  const c = LV.computeCounts(libState.entries);
  $('#libStatus').textContent =
    `${c.total} run(s) · ${c.available} with report · ${c.notPersisted} metadata-only · ${c.incomplete} incomplete · ${c.approximate} approx · ${c.unknown} unknown`;
}

async function refreshLibrary() {
  // V3b: a refresh START bumps the reader epoch (and clears the follow-up state). If something
  // newer (a selection or Open Report) takes the reader over while the scan runs, this refresh has
  // become LATE: it still applies the fresh list + handles below, but it must NOT clear or replace
  // what the newer action displayed.
  const myEpoch = libFollowup.noteRefreshStart();
  libState.loaded = true;
  $('#libStatus').textContent = 'Scanning…';
  let res;
  try { res = await cc.libraryList(); }
  catch (e) { appendLog(`[library] list failed: ${(e && e.message) || e}\n`); $('#libStatus').textContent = 'Scan failed.'; return; }
  if (!res || !res.ok) {
    appendLog(`[library] list refused: ${(res && res.error) || 'unknown error'}\n`);
    $('#libStatus').textContent = 'Scan refused.';
    return;
  }
  libState.entries = Array.isArray(res.entries) ? res.entries : [];
  if (libFollowup.isCurrent(myEpoch)) {
    libState.selectedHandle = null;
    clearReader();
  }
  renderLibraryList();
  // Honest, metadata-only reporting of what the scan found (no report/manifest content).
  appendLog(`[library] scanned root: total=${res.total} valid=${libState.entries.length} invalid=${res.invalidCount} capExceeded=${res.capExceeded === true}\n`);
  if (res.capExceeded) appendLog('[library] NOTE: run-directory cap reached; some runs are not listed.\n');
  if (res.invalidCount > 0) {
    const byReason = {};
    for (const iv of (res.invalid || [])) byReason[iv.reason] = (byReason[iv.reason] || 0) + 1;
    appendLog(`[library] ${res.invalidCount} invalid record(s) excluded: ${Object.entries(byReason).map(([k, v]) => `${k}x${v}`).join(', ')}\n`);
  }
}

function clearReader() {
  $('#libMetaHost').textContent = '';
  $('#libReportText').textContent = '';
  const st = $('#libReportStatus'); st.textContent = ''; st.classList.add('hidden');
  libState.currentReportText = '';
}
function showReportStatus(msg) {
  const st = $('#libReportStatus');
  st.textContent = msg;                       // textContent — inert
  st.classList.remove('hidden');
  $('#libReportText').textContent = '';
  libState.currentReportText = '';
}
function showReportText(text) {
  const st = $('#libReportStatus'); st.textContent = ''; st.classList.add('hidden');
  $('#libReportText').textContent = text;     // textContent — inert plain text (no HTML/Markdown)
  libState.currentReportText = text;
}
function renderMeta(entryLike) {
  const host = $('#libMetaHost');
  host.textContent = '';
  host.appendChild(LV.buildMetaPanel({ el: agentDom.el, doc: document }, entryLike));
}

async function selectLibraryEntry(entry) {
  // V3b: selecting bumps the epoch — clears the previous follow-up question/answer/errors and
  // makes any in-flight read or follow-up response stale. Selection NEVER submits anything.
  const myEpoch = libFollowup.noteSelection();
  libState.selectedHandle = entry.handle;
  renderLibraryList();          // re-mark selection
  renderMeta(entry);
  showReportStatus('Loading…');
  let res;
  try { res = await cc.libraryRead(entry.handle); }
  catch (e) {
    if (libFollowup.isCurrent(myEpoch)) showReportStatus('The report could not be read.');
    appendLog(`[library] read failed: ${(e && e.message) || e}\n`);
    return;
  }
  if (!libFollowup.isCurrent(myEpoch)) return;   // a newer selection/open/refresh owns the reader
  applyReadResult(res, entry);
  // Record the follow-up identity ONLY after the read displayed: the CURRENT opaque handle when a
  // completed report is shown, otherwise no source (controls stay hidden/disabled).
  const available = !!(res && res.ok && res.status === 'available' && typeof res.text === 'string');
  libFollowup.setSource(available ? { kind: 'library', handle: entry.handle } : null, available);
}

function applyReadResult(res, entryLike) {
  if (res && res.ok && res.status === 'available' && typeof res.text === 'string') {
    showReportText(res.text);
    appendLog(`[library] report opened: chars=${res.chars} status=available\n`);  // metadata only
    return;
  }
  const status = (res && res.status) || 'unsafe';
  const outcome = (res && res.outcome) || (entryLike && entryLike.outcome) || null;
  showReportStatus(LV.reportStatusMessage(status, outcome));
  appendLog(`[library] report unavailable: status=${status}\n`);                  // metadata only
}

async function openReportForPane(paneId) {
  // Bring the Library surface forward through the ONE navigation path, so Open Report lands on the
  // docked panel when Dockview is live and on the Library tab in classic mode. `firstLoadRefresh`
  // is off because the ordered algorithm below owns the initial scan — flipping `libState.loaded`
  // here would make it skip the await and reintroduce the V3b ordering defect.
  focusLibrarySurface({ firstLoadRefresh: false });
  // V3b ordering fix: the awaited-initial-scan / epoch algorithm is openPaneReportOrdered in
  // report-followup.js (unit-tested there) — the initial scan completes BEFORE the pane report is
  // read/displayed, a superseding action wins the reader, and a successful read records the PANE
  // identity as the follow-up source (no Library handle is minted for Open Report).
  await window.ccReportFollowup.openPaneReportOrdered(libFollowup, {
    isLoaded: () => libState.loaded,
    refresh: () => refreshLibrary(),
    beforeRead: () => {
      libState.selectedHandle = null;
      renderLibraryList();
      showReportStatus('Loading…');
    },
    readPane: (id) => cc.libraryOpenReport(id).catch((e) => {
      appendLog(`[library] open-report failed: ${(e && e.message) || e}\n`);
      throw e;
    }),
    displayError: () => showReportStatus('The report could not be read.'),
    display: (res) => {
      // The renderer never learns the run ID/path — build a minimal meta from the read result only.
      const entryLike = {
        title: (res && res.title) || 'Video Scout run',
        displayRunLabel: '(from Video Scout pane)',
        mode: res && res.mode, route: res && res.route, outcome: res && res.outcome,
        totalTokens: null, dateKind: 'unknown', date: null, sortMs: null,
        reportStatus: (res && res.reportStatus) || (res && res.status) || 'incomplete',
        startOffsetSeconds: null, endOffsetSeconds: null,
      };
      renderMeta(entryLike);
      applyReadResult(res, entryLike);
    },
  }, paneId);
}

function copyReport() {
  let sel = '';
  const g = window.getSelection && window.getSelection();
  const readerEl = $('#libReportText');
  if (g && g.rangeCount > 0 && !g.isCollapsed && readerEl.contains(g.getRangeAt(0).commonAncestorContainer)) sel = g.toString();
  const src = sel || libState.currentReportText || '';
  if (!src) { appendLog('[library-copy] nothing to copy (no report shown).\n'); return; }
  const bounded = window.ccTermCopy.applyCopyBound(src, window.ccTermCopy.COPY_OUTPUT_BOUND);
  libClip.writeText(bounded.text).then((r) => {
    if (r.ok) {
      appendLog(`[library-copy] copied=${bounded.copiedChars} available=${bounded.totalChars} truncated=${bounded.truncated}\n`); // metadata only
      if (bounded.truncated) alert(`Copy Report: copied the newest ${bounded.copiedChars.toLocaleString('en-US')} of ${bounded.totalChars.toLocaleString('en-US')} characters (the ${window.ccTermCopy.COPY_OUTPUT_BOUND.toLocaleString('en-US')}-character limit).`);
    } else {
      appendLog(`[library-copy] clipboardWrite FAILED: ${r.error}\n`);
      alert(`Copy Report failed — nothing was copied.\n\n${r.error}`);
    }
  }).catch(() => {});
}

function setupLibrary() {
  // V3b: build the follow-up section (safe builders only) into its reader host. Mounting never
  // submits anything; the Ask button is the only submission path.
  libFollowup.mount($('#libFollowupHost'));
  $('#libRefresh').onclick = () => refreshLibrary();
  for (const idSel of ['#libSearch', '#libMode', '#libRoute', '#libOutcome', '#libDateKind', '#libSort']) {
    const elx = $(idSel);
    elx.addEventListener(idSel === '#libSearch' ? 'input' : 'change', () => renderLibraryList());
  }
  $('#libCopy').onclick = (e) => { e.preventDefault(); copyReport(); };
  $('#libMax').onclick = (e) => { e.preventDefault(); libMaximizer.toggle('lib-reader', $('#libReader')); };
}

function showTermEmpty() {
  if (!$('#termEmpty')) {
    const d = document.createElement('div');
    d.className = 'empty muted'; d.id = 'termEmpty';
    d.innerHTML = 'No terminals open. Open an agent from the <b>Agents</b> tab, or click <b>+ Shell</b>.';
    $('#terminalGrid').appendChild(d);
  }
}
function openInAppTerminal(opts = {}) {
  const { worktree, title } = opts;
  const cli = opts.cli || opts.agent || null;
  const role = (opts.role && ROLES[opts.role]) ? opts.role : null;
  switchTab('terminals');
  const empty = $('#termEmpty'); if (empty) empty.remove();
  const id = 'pty' + (++termSeq);
  const wtName = worktree ? worktree.split(/[\\/]/).pop() : 'shell';
  const label = title || (role ? `${ROLES[role].label} · ${wtName}` : `${cli ? cli + ' · ' : ''}${wtName}`);
  // Role badge (tinted + lock for read-only) replaces the plain CLI dot when a role is set.
  const badge = role
    ? { kind: 'role', role, glyph: ROLES[role].glyph, readOnly: ROLES[role].readOnly, label: ROLES[role].label }
    : { kind: 'cli', cli: cli || 'codex' };
  // Build the pane with safe DOM APIs (agent-dom.js): `label` and `worktree` derive from git
  // worktree metadata and must never be interpolated into innerHTML (AUDIT-REPORT.md finding #1).
  const pane = agentDom.buildTermPane(document, { badge, label, worktreeTitle: worktree || '', openReport: role === 'video-scout' });
  $('#terminalGrid').appendChild(pane);
  const term = new Terminal({ theme: xtermTheme(), fontFamily: "'Cascadia Code','Consolas',monospace", fontSize: 13, cursorBlink: true, allowProposedApi: true, scrollback: 5000 });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  // Clickable URLs — opened only via the vetted shell.openExternal path, http(s) only.
  term.loadAddon(new WebLinksAddon.WebLinksAddon((e, uri) => {
    if (/^https?:\/\//i.test(uri)) cc.openExternal(uri);
  }));
  // Correct width for wide/emoji glyphs so the agents' box-drawing TUIs render cleanly.
  try { term.loadAddon(new Unicode11Addon.Unicode11Addon()); term.unicode.activeVersion = '11'; } catch {}
  term.open(pane.querySelector('.term-body'));
  // GPU renderer for smooth large output; fall back to DOM if the WebGL context is lost.
  try {
    const webgl = new WebglAddon.WebglAddon();
    webgl.onContextLoss(() => { try { webgl.dispose(); } catch {} });
    term.loadAddon(webgl);
  } catch { /* no WebGL here — xterm keeps its DOM renderer */ }
  fit.fit();
  term.onData((d) => cc.ptyWrite(id, d));
  term.onResize(({ cols, rows }) => cc.ptyResize(id, cols, rows));
  // Clipboard, mirroring Windows Terminal / VS Code (not the purist xterm convention):
  //   Ctrl+V (or Ctrl+Shift+V)  -> paste
  //   Ctrl+C                    -> copy when text is selected, otherwise send SIGINT (^C)
  //   Ctrl+Shift+C              -> always copy the selection
  //   right-click               -> copy selection, else paste
  //   OSC 52                    -> programs (e.g. Claude Code's "Copied!") set the OS clipboard
  // Paste writes raw bytes to the PTY (like typing) rather than term.paste(), whose bracketed-
  // paste escapes some TUIs (e.g. the Gemini prompt) silently drop.
  // All clipboard access is async IPC to main (main is the security boundary — the
  // sandboxed preload's Electron clipboard is undefined). The consumer helpers never
  // throw/reject: a rejection or { ok:false } becomes a visible metadata-only Logs line,
  // and a failed read returns null so it can never be pasted. Fire-and-forget callers
  // (Ctrl+C/V, right-click, OSC 52) get a trailing .catch as belt-and-suspenders so a
  // future edit can't turn one into an unhandled rejection.
  const clip = window.ccClipboardConsumer.createClipboardConsumer({
    invokeRead: () => cc.clipboardRead(),
    invokeWrite: (s) => cc.clipboardWrite(s),
    ptyWrite: (text) => cc.ptyWrite(id, text),
    log: appendLog,
    paneId: id,
  });
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown' || !e.ctrlKey) return true;
    const isV = e.code === 'KeyV' || (e.key && e.key.toLowerCase() === 'v');
    const isC = e.code === 'KeyC' || (e.key && e.key.toLowerCase() === 'c');
    if (isV) { clip.pasteIntoPty().catch(() => {}); return false; }   // Ctrl+V / Ctrl+Shift+V
    if (isC) {
      const sel = term.getSelection();
      appendLog(`[copy ${id}] Ctrl+${e.shiftKey ? 'Shift+' : ''}C: ${sel ? sel.length + ' chars selected' : 'no selection → SIGINT'}\n`);
      if (sel) { clip.writeClip(sel).catch(() => {}); term.clearSelection(); return false; } // copy
      if (e.shiftKey) return false;                          // Ctrl+Shift+C, nothing selected: swallow
      return true;                                           // plain Ctrl+C, nothing selected: SIGINT
    }
    return true;
  });
  appendLog(`[copy ${id}] key handler registered\n`);
  pane.querySelector('.term-body').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const s = term.getSelection();
    if (s) { clip.writeClip(s).catch(() => {}); term.clearSelection(); }
    else clip.pasteIntoPty().catch(() => {});
  });
  // OSC 52: when a program in the PTY asks the terminal to set the clipboard (Claude Code's
  // "(Copied!)", etc.), actually write it to the Windows clipboard. Payload is "<sel>;<base64>".
  if (term.parser && term.parser.registerOscHandler) {
    term.parser.registerOscHandler(52, (data) => {
      const i = (data || '').indexOf(';');
      if (i >= 0) {
        const b64 = data.slice(i + 1);
        if (b64 && b64 !== '?') {
          let decoded = null;
          try { decoded = decodeURIComponent(escape(atob(b64))); }
          catch { try { decoded = atob(b64); } catch (err) { appendLog(`[osc52 ${id}] base64 decode failed: ${(err && err.message) || err}\n`); } }
          if (decoded !== null) clip.writeClip(decoded, `osc52 ${id}`).catch(() => {});
        }
      }
      return true; // handled
    });
  }
  // Keep this terminal fit to its grid cell whenever the layout changes — a pane added/removed,
  // the window resized, the tab shown. This is the canonical xterm.js pattern (observe the
  // container + debounce + fit); without it a reflowed pane keeps its old size and overflows.
  let rafPending = false;
  const ro = new ResizeObserver(() => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; try { fit.fit(); } catch {} });
  });
  ro.observe(pane.querySelector('.term-body'));
  // RESIZE OWNERSHIP. `ro` above is the APP-OWNED (classic grid) resize owner and it is live from
  // here. A Dockview-hosted pane must have exactly ONE owner, so the adapter suspends this one and
  // its gated fit controller takes over; an adoption rollback hands it straight back. A
  // ResizeObserver exposes no "am I observing?" state, so `paneData.roConnected` below is the
  // record — `ro.disconnect()` and `ro.observe()` are called from exactly three places (the
  // suspend host op, resumeAppResizeObserver, and this pane's close path) and each updates it.
  const speakBtn = pane.querySelector('.spk');
  const speakSelectionMemory = window.ccTTSSelection.createSelectionMemory();
  let selectionAtSpeakPointerDown = '';
  const selectedTextInPane = () => {
    const terminalText = term.getSelection();
    if (terminalText) return terminalText;
    const selection = window.getSelection && window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return '';
    const range = selection.getRangeAt(0);
    return pane.contains(range.commonAncestorContainer) ? selection.toString() : '';
  };
  const rememberSpeakSelection = () => speakSelectionMemory.remember(selectedTextInPane());
  // Interactive agent TUIs can clear xterm's live selection while focus moves to
  // the header. Remember the last non-empty value when xterm first observes it;
  // PowerShell and agent panes now use the same pane-local handoff.
  const selectionDisposable = term.onSelectionChange(rememberSpeakSelection);
  const termBody = pane.querySelector('.term-body');
  termBody.addEventListener('pointerdown', () => speakSelectionMemory.clear(), true);
  const mouseSelectionFallback = window.ccTTSSelection.installMouseTrackingSelectionFallback({
    term,
    element: termBody,
    remember: (text) => speakSelectionMemory.remember(text),
    onCapture: (charCount) => appendLog(`[tts] mouse-mode selection captured: pane=${id} role=${role || 'shell'} chars=${charCount}\n`),
  });
  pane.addEventListener('mouseup', rememberSpeakSelection);
  speakBtn.addEventListener('pointerdown', (event) => {
    // Snapshot first: the generic pane focus handler below can otherwise clear
    // xterm's visible selection before the click handler reads it.
    selectionAtSpeakPointerDown = selectedTextInPane() || speakSelectionMemory.peek();
    event.preventDefault();
    event.stopPropagation();
  });
  speakBtn.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!window.ccTTS) {
      const moduleState = audioModules.get('tts');
      const detail = moduleState.phase === 'failed' ? moduleState.detail : 'module is still starting';
      appendLog(`[tts] voice engine unavailable: ${detail}\n`);
      return;
    }
    const action = window.ccTTSSelection.resolveSpeakAction({
      selectionAtPointerDown: selectionAtSpeakPointerDown,
      selectionAtClick: selectedTextInPane(),
      selectionRemembered: speakSelectionMemory.peek(),
      paneId: id,
      role,
    });
    selectionAtSpeakPointerDown = '';
    speakSelectionMemory.clear();
    appendLog(action.log);
    if (!action.ok) return;
    window.ccTTS.speak(action.text);
  };
  // V1a Copy Output — ONE shared path for every pane type, including Video Scout.
  // Priority: a live pane-local selection wins; the pointer-down snapshot rescues a
  // selection the header click (or a mouse-mode TUI) cleared between pointer-down and
  // click — the same mechanism the 🔊 button uses; with no selection at all, the whole
  // buffer + scrollback is reconstructed under the copy bound (term-copy.js).
  const copyBtn = pane.querySelector('.copy-out');
  let selectionAtCopyPointerDown = '';
  let copyFlashTimer = null;
  const flashCopyBtn = (ok) => {
    copyBtn.textContent = ok ? '✓' : '⚠';
    copyBtn.classList.toggle('flash-ok', ok);
    copyBtn.classList.toggle('flash-err', !ok);
    if (copyFlashTimer) clearTimeout(copyFlashTimer);
    copyFlashTimer = setTimeout(() => { copyBtn.textContent = '⧉'; copyBtn.classList.remove('flash-ok', 'flash-err'); }, 1400);
  };
  copyBtn.addEventListener('pointerdown', (event) => {
    // Snapshot BEFORE the click can clear the selection (same rescue as the 🔊 button).
    selectionAtCopyPointerDown = selectedTextInPane() || speakSelectionMemory.peek();
    event.preventDefault();
    event.stopPropagation();
  });
  copyBtn.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const result = window.ccTermCopy.resolveCopyRequest({
      selection: selectedTextInPane(),
      snapshot: selectionAtCopyPointerDown,
      bound: window.ccTermCopy.COPY_OUTPUT_BOUND, // EVERY source is bounded — selections included
      reconstruct: () => window.ccTermCopy.reconstructBufferText(term.buffer.active, window.ccTermCopy.COPY_OUTPUT_BOUND),
    });
    selectionAtCopyPointerDown = '';
    if (!result.ok) {
      // e.g. an empty pane — refuse visibly (⚠ flash + Logs), never a silent no-op.
      appendLog(window.ccTermCopy.buildCopyLogLine({ paneId: id, role, source: result.source, failed: true, reason: result.reason }));
      flashCopyBtn(false);
      return;
    }
    // The clipboard write is async IPC to main; do NOT report success until it RESOLVES
    // with { ok:true }. A rejection or { ok:false } flashes ⚠ + a metadata-only FAILED
    // Logs line + an alert — never a false success. clip.writeText never rejects, and
    // the trailing .catch is belt-and-suspenders against a future unhandled rejection.
    clip.writeText(result.text).then((res) => {
      if (!res.ok) {
        appendLog(window.ccTermCopy.buildCopyLogLine({ paneId: id, role, source: result.source, failed: true, reason: `clipboardWrite: ${res.error}` }));
        flashCopyBtn(false);
        alert(`Copy Output failed — nothing was copied.\n\n${res.error}`);
        return;
      }
      // Logs carry metadata only, by construction: buildCopyLogLine never receives the text.
      appendLog(window.ccTermCopy.buildCopyLogLine({ paneId: id, role, source: result.source, copiedChars: result.copiedChars, totalChars: result.totalChars, truncated: result.truncated }));
      flashCopyBtn(true);
      if (result.truncated) alert(window.ccTermCopy.buildTruncationNotice({ copiedChars: result.copiedChars, totalChars: result.totalChars, role }));
    }).catch(() => {});
  };
  // MAXIMIZE ROUTES BY OWNERSHIP. Two maximizers exist and exactly one may run for a given pane:
  //   * the classic grid maximizer (pane-maximize.js), which hides the siblings inside
  //     `#terminalGrid` and refits them through `t.fit.fit()` + cc.ptyResize in its onLayout;
  //   * Dockview's own group maximizer, which hides the sibling leaf views inside the dock and
  //     whose panes are refit by their gated fit controllers.
  // `paneIsDocked` — adapter ownership, not a DOM guess — is the single source of truth, so the
  // choice is made once and the two mechanisms can never both fire for one click.
  pane.querySelector('.max').onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (paneIsDocked(id)) { maximizeDockedPane(id); return; }
    paneMaximizer.toggle(id, pane);
  };
  // V5b2: Open Report (Video Scout panes only). The renderer sends ONLY this pane's id; main resolves
  // it to the run through V5b1's internal pane->runId registry (never terminal parsing / a path) and
  // returns the re-validated report, which we show in the in-app Library reader — no OS file open.
  const openReportBtn = pane.querySelector('.open-report');
  if (openReportBtn) {
    openReportBtn.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      openReportForPane(id);
    };
  }
  const chatBody = pane.querySelector('.chat-body');
  const paneData = { term, fit, pane, ro, roConnected: true, chatBody, role, pendingEvents: [], rafId: null, tailBubble: null, parser: null };
  paneData.parser = new PtyParser((ev) => {
    // Video-scout SDK runs print one machine-readable token-usage line; surface it in the Logs
    // tab so every run's real cost is recorded outside the (closable) pane. The parser is already
    // line-buffered and ANSI-stripped, so chunk boundaries can't split the marker.
    if (role === 'video-scout' && !ev.partial && ev.text && ev.text.includes('[video-scout usage]')) {
      appendLog(ev.text.trim() + '\n');
    }
    paneData.pendingEvents.push(ev);
    if (paneData.rafId === null) paneData.rafId = requestAnimationFrame(() => drainChatEvents(paneData));
  });
  // The ONE close path for this pane. Extracted from the close button's handler (behaviour and
  // ordering are unchanged) and made IDEMPOTENT so that a second caller cannot double-kill a PTY or
  // double-dispose an xterm. On the Dockview prototype branch a panel-removal event is that second
  // caller; on the default path the close button is still the only one, and `terms.delete(id)` below
  // makes any repeat call a no-op.
  const closeThisPane = () => {
    if (!terms.has(id)) return;   // already closed — exactly-once guarantee
    // CLOSE CONVERGENCE, direction 2 of 2. If this pane is hosted in a Dockview panel, remove the
    // panel too, so closing from the pane's own ✕ does not leave a ghost panel behind. The adapter
    // suppresses its own close-convergence while doing so, and this whole call is inside the
    // `terms.has(id)` guard, so the two directions cannot recurse: whichever fires first deletes the
    // map entry, and the other returns immediately. Exactly one ptyKill, one xterm disposal, one
    // observer disconnect, one map deletion.
    //
    // `layoutInstance` is a module-local, not a window global, so nothing outside this file can
    // substitute a fake and redirect closure. In classic mode it is null and this is one falsy check.
    if (layoutInstance && typeof layoutInstance.onAppPaneClosed === 'function') {
      try { layoutInstance.onAppPaneClosed(id); } catch { /* layout teardown must not block a close */ }
    }
    // Closing the maximized pane restores the grid cleanly (V1a) — clear the maximize
    // state FIRST so the surviving panes un-hide and refit.
    paneMaximizer.handlePaneClosed(id);
    ro.disconnect(); paneData.roConnected = false;
    try { selectionDisposable.dispose(); } catch {}
    try { mouseSelectionFallback.dispose(); } catch {}
    if (copyFlashTimer) { clearTimeout(copyFlashTimer); copyFlashTimer = null; }
    if (paneData.rafId !== null) { cancelAnimationFrame(paneData.rafId); paneData.rafId = null; }
    cc.ptyKill(id); term.dispose(); pane.remove(); terms.delete(id);
    if (terms.size === 0) showTermEmpty();
  };
  // ---- LOCAL ROLLBACK (pre-PTY only) ----------------------------------------------------------
  // Undo everything this function built in the RENDERER, for the window in which no PTY exists yet.
  // It is deliberately NOT `closeThisPane`: this path must invoke neither `ptyStart` nor `ptyKill`.
  // Killing an ID main has never seen would be a false entry in the process trace and would make
  // "zero PTY was started" unprovable; the whole point of docking before starting is that there is
  // nothing to kill here. Bounded: it touches only what the lines above created.
  const rollbackLocalPane = () => {
    if (!terms.has(id)) return;
    paneMaximizer.handlePaneClosed(id);
    ro.disconnect(); paneData.roConnected = false;
    try { selectionDisposable.dispose(); } catch {}
    try { mouseSelectionFallback.dispose(); } catch {}
    if (copyFlashTimer) { clearTimeout(copyFlashTimer); copyFlashTimer = null; }
    if (paneData.rafId !== null) { cancelAnimationFrame(paneData.rafId); paneData.rafId = null; }
    term.dispose(); pane.remove(); terms.delete(id);
    if (terms.size === 0) showTermEmpty();
  };
  paneData.closePane = closeThisPane;
  pane.querySelector('.x').onclick = closeThisPane;
  pane.addEventListener('mousedown', (event) => {
    if (event.target.closest('.spk, .copy-out, .max')) return;
    activeTermId = id; term.focus();
  });
  term.textarea && term.textarea.addEventListener('focus', () => { activeTermId = id; });
  terms.set(id, paneData);

  // ---- TERMINAL LAUNCH TRANSACTION -------------------------------------------------------------
  // ORDER IS LOAD-BEARING: dock FIRST, start the PTY only once the dock has succeeded.
  //
  // The earlier shape started the PTY and then, if docking failed, immediately killed it. That is a
  // race, not a transaction: `ptyStart` is asynchronous IPC, so the kill can be sent while main is
  // still inside `pty.spawn`. Main resolves `pty-kill` against its `ptys` map, and a handle that is
  // not in that map yet cannot be killed — leaving an orphan ConPTY that nothing in the app owns or
  // can reach. Docking first removes the window entirely: on the failure path there is no PTY,
  // because none was ever requested.
  //
  // The pane itself is real and complete before this point — real xterm, real clipboard / OSC 52 /
  // TTS / Dictate / Open Report wiring — because Dockview must host THAT element, never a copy.
  if (layoutInstance) {
    let docked = null;
    try { docked = layoutInstance.addPane(id, 'terminal'); }
    catch { docked = { ok: false, reason: 'add-pane-threw' }; }
    if (!docked || docked.ok !== true) {
      appendLog(`[dockview] REFUSED to dock ${id}: ${(docked && docked.reason) || 'unknown'} — the `
        + 'pane was removed and NO terminal process was started, so there is no orphan PTY, no '
        + 'hidden pane, and nothing to kill\n');
      rollbackLocalPane();
      return;
    }
  }

  // EXACTLY ONE ptyStart, on every path, and only after the pane is visible and owned.
  const startResult = cc.ptyStart({ id, cwd: worktree, cli, role, model: opts.model, effort: opts.effort, initialPrompt: opts.initialPrompt, videoScout: opts.videoScout, videoUrl: opts.videoUrl, videoModel: opts.videoModel, mediaResolution: opts.mediaResolution, analysisMode: opts.analysisMode, startOffset: opts.startOffset, endOffset: opts.endOffset, sliceRanges: opts.sliceRanges, analysisFocus: opts.analysisFocus, cols: term.cols, rows: term.rows });
  // A refused or rejected start must not leave a Dockview panel behind: the panel would be a ghost
  // host for a terminal that never ran, and a later Save would persist it. Convergence goes through
  // the SAME idempotent close path the ✕ uses, so the panel, the observer, the xterm and the map
  // entry each go exactly once — and its `cc.ptyKill` is the belt-and-braces guarantee that no
  // process survives a start that reported failure after spawning (main ignores a kill for an ID it
  // does not hold).
  //
  // In CLASSIC mode this only logs: the pane stays exactly as it always has, because there is no
  // panel to strand and main already surfaces its own refusal through `main-error`.
  const onStartFailed = (reason) => {
    if (!terms.has(id)) return;             // the user closed it first — nothing to undo
    appendLog(`[pty] start FAILED for ${id}: ${reason}`
      + (layoutInstance ? ' — removing the pane and its layout panel\n' : '\n'));
    if (layoutInstance) closeThisPane();
  };
  Promise.resolve(startResult).then(
    (res) => { if (!res || res.ok !== true) onStartFailed((res && res.error) || 'refused'); },
    () => onStartFailed('ipc-rejected'),
  );
  // The settle-in refit. Guarded on the pane still being live, because a start failure can close it
  // inside this window and fitting a disposed xterm would throw out of a timer callback.
  setTimeout(() => {
    if (!terms.has(id)) return;
    fit.fit(); cc.ptyResize(id, term.cols, term.rows); activeTermId = id; term.focus();
  }, 40);
}

// ---- Dockview layout engine scripts ------------------------------------------------------------
// Loaded on every normal launch. Classic recovery mode returns from startLayoutEngine() before this
// list is touched, so `--classic-layout` creates no Dockview script tag at all — index.html itself
// references none of them, which is what makes that guarantee checkable rather than asserted.
//
// Injected dynamically rather than listed in index.html precisely so recovery mode can decline
// them. They load in dependency order, from LOCAL FILES ONLY — no CDN, no remote asset.
const DOCKVIEW_SCRIPTS = [
  '../node_modules/dockview/dist/dockview.js',   // vendor UMD bundle -> window.dockview
  'dockview-fit-policy.js',
  'dockview-panel-policy.js',
  // The SAME schema module main validates with, loaded here as a classic script so the renderer can
  // validate immediately before every fromJSON. It lives beside main.js rather than in renderer/
  // precisely because both processes load it — one file, one set of rules, no drift.
  '../dockview-layout-policy.js',
  'dockview-prototype.js',                       // last: it depends on all three policies
];

// ---- Library singleton docking (PROTOTYPE ONLY) ------------------------------------------------
// The Library is ONE element that lives in the tab strip and carries every listener library-view.js
// and report-followup.js bound to it. The prototype moves that exact node into a Dockview panel and
// must be able to return it to the precise position it came from.
//
// `#libraryPane` is an inert id added to the existing production section purely as this seam's
// anchor; nothing on the default path reads it. If it is ever missing, every caller here reports a
// bounded refusal — there is deliberately no fallback markup and no silent null path, because a
// silent null is exactly what made Add Library discard clicks without a trace.
const LIBRARY_SELECTOR = '#libraryPane';
// A zero-size marker parked at the Library's original position. Storing the parent alone is not
// enough: siblings can change while the Library is docked, and only a placeholder survives that.
let libraryHomePlaceholder = null;
// A HELD REFERENCE to the docked element. This is load-bearing, not defensive: the adapter unmounts
// a pane (detaching it from the document) BEFORE releasing it, so by the time undock runs a
// `document.querySelector` lookup returns null and the singleton would be stranded outside the DOM
// with no way back. The real-Electron bootstrap harness caught exactly that.
let libraryDockedElement = null;

function libraryElement() { return document.querySelector(LIBRARY_SELECTOR) || libraryDockedElement; }

/**
 * Move the Library out of the tab strip, leaving a placeholder at its exact position.
 * Returns the element on success, or null if the Library DOM is missing.
 * Idempotent: docking an already-docked Library returns the same element and moves nothing.
 */
function dockLibraryElement() {
  const el = libraryElement();
  if (!el) return null;
  if (libraryHomePlaceholder) return el;      // already docked — do not create a second placeholder
  const placeholder = document.createComment('dockview-prototype: Library home');
  el.parentNode.insertBefore(placeholder, el);
  libraryHomePlaceholder = placeholder;
  libraryDockedElement = el;
  return el;
}

/**
 * Return the Library to the exact position it was taken from and drop the placeholder.
 * Idempotent: undocking a Library that is not docked is a no-op, never a throw.
 */
function undockLibraryElement() {
  const el = libraryDockedElement || document.querySelector(LIBRARY_SELECTOR);
  const placeholder = libraryHomePlaceholder;
  libraryHomePlaceholder = null;
  libraryDockedElement = null;
  if (!el || !placeholder || !placeholder.parentNode) return false;
  placeholder.parentNode.insertBefore(el, placeholder);
  placeholder.parentNode.removeChild(placeholder);
  return true;
}

// ---- The audio-control seam is GONE -----------------------------------------------------------
// The prototype borrowed the app-owned `.tts-controls` element into its own slot, because its
// full-screen opaque overlay covered the Terminals toolbar and made Dictate unreachable. The
// production surface is embedded BELOW that toolbar, so the controls are never covered and never
// need to move. The whole borrow/restore mechanism — selector, placeholder, held reference,
// last-resort parent, dock/undock helpers, count preflight and the adapter's rollback — is deleted
// rather than left dormant: dead machinery around a live audio surface is a liability, and the
// safest reparenting code is the code that does not exist.
//
// `.tts-controls` therefore stays exactly where index.html puts it, keeping every handler
// setupSTTControls()/setupTTSControls() and the ccSTT/ccTTS modules bind to it, and dictation
// destination locking continues to key off `activeTermId` rather than DOM position.

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(el);
  });
}

// ---- Production layout engine ------------------------------------------------------------------
// THE LIVE ADAPTER INSTANCE, held in module scope. The prototype published this on
// `window.ccDockviewPrototypeInstance` and then read it back as an authority in the close path,
// which meant any script in the renderer could substitute a fake and redirect pane closure. It is
// now a module-local that nothing outside this file can reach or replace.
let layoutInstance = null;

/** True when Dockview is the live terminal workspace. */
function dockviewIsActive() { return layoutInstance !== null; }

/** True when THIS adapter owns `paneId`. The single source of truth for resize/maximize routing. */
function paneIsDocked(paneId) {
  if (!layoutInstance) return false;
  try { return layoutInstance.ownedPaneIds().indexOf(paneId) !== -1; }
  catch { return false; }
}

/**
 * Give a pane's resizing back to the app's OWN grid ResizeObserver.
 *
 * The exact inverse of the adapter's `suspendAppResizeObserver`, and the reason a rolled-back
 * adoption leaves a pane that still resizes. It reconnects the EXISTING observer object —
 * `observe()` on an already-constructed ResizeObserver re-establishes the subscription — because a
 * freshly constructed one would be a SECOND owner alongside the original, which is the exact
 * double-resize failure the suspend exists to prevent.
 *
 * Idempotent by the `roConnected` record, so calling it on a pane that already owns its resizing
 * cannot subscribe twice. A missing terminal body is a visible refusal, never a silent no-op:
 * a pane that resizes with nobody listening looks identical to one that works until the window moves.
 *
 * @returns {boolean} true when the pane's own observer is (or already was) live.
 */
function resumeAppResizeObserver(paneId) {
  const t = terms.get(paneId);
  if (!t || !t.ro) return false;
  if (t.roConnected === true) return true;
  const body = t.pane.querySelector('.term-body');
  if (!body) {
    appendLog(`[dockview] REFUSED to resume grid resizing for ${paneId}: the terminal body is missing\n`);
    return false;
  }
  t.ro.observe(body);
  t.roConnected = true;
  return true;
}

/**
 * Maximize / restore a DOCKVIEW-OWNED pane. Only ever reached for a pane `paneIsDocked` reports as
 * owned, so the classic grid maximizer is not an alternative here and is deliberately never called:
 * it would hide the siblings of a grid that is not even on screen.
 *
 * A refusal from the layout engine is a FULL STOP with a visible reason. Refits are the adapter's,
 * through its gated fit controllers — running `fitAllTerms` here would be a second resize owner.
 */
function maximizeDockedPane(paneId) {
  let result = null;
  try { result = layoutInstance.maximizePane(paneId); }
  catch { result = null; }
  if (!result) {
    appendLog(`[dockview] maximize REFUSED for ${paneId} — the layout engine owns this pane and `
      + 'declined the request; the classic grid maximizer was NOT used and nothing changed\n');
    return false;
  }
  refreshDockedMaximizeGlyphs();
  return true;
}

/**
 * Keep the ⛶/🗗 glyph on every DOCKED pane truthful. Dockview permits one maximized group at a
 * time, so maximizing pane B while A is maximized silently restores A — and A's button would
 * otherwise still claim to be maximized. Docked panes only: a classic pane's glyph belongs to
 * pane-maximize.js's own onLayout and must not be written from here.
 */
function refreshDockedMaximizeGlyphs() {
  for (const [tid, t] of terms) {
    if (!paneIsDocked(tid)) continue;
    const btn = t.pane.querySelector('.max');
    if (!btn) continue;
    let maximized = null;
    try { maximized = layoutInstance.isPaneMaximized(tid); } catch { maximized = null; }
    if (maximized === null) continue;   // the engine cannot answer — leave the glyph alone
    btn.textContent = maximized ? '🗗' : '⛶';
    btn.title = maximized ? 'Restore the layout' : 'Maximize pane';
  }
}

/**
 * Library navigation while Dockview is the live workspace.
 *
 * The Library is ONE element. When it is docked it physically lives inside `#terminalDock`, so
 * "go to the Library" means activating the Terminals workspace and adding — or focusing — that
 * singleton panel. Activating the (now empty) Library tabpane instead would hide the workspace the
 * Library is actually in, which is the same class of bug as showing an empty shell.
 *
 * @param {{firstLoadRefresh?: boolean}} options  `firstLoadRefresh:false` for Open Report, whose own
 *   ordered algorithm (report-followup.js `openPaneReportOrdered`) owns the initial scan and must
 *   not have `libState.loaded` flipped underneath it.
 * @returns {boolean} true when the Library is open and focused.
 */
function openLibraryInDock(options = {}) {
  switchTab('terminals');
  let result = null;
  try { result = layoutInstance.addPane('library', 'library'); }
  catch { result = { ok: false, reason: 'add-pane-threw' }; }
  // `library-already-open` is the SUCCESS shape for NAVIGATION: the adapter focused the panel the
  // user already has rather than creating a second one. Every other non-ok reason is a refusal.
  const opened = !!result && (result.ok === true || result.reason === 'library-already-open');
  if (!opened) {
    appendLog(`[dockview] Library REFUSED: ${(result && result.reason) || 'unknown'} — the Library `
      + 'was not opened, no element was moved, and no copy was made\n');
    return false;
  }
  // The existing V5b2 first-load behaviour, unchanged: the run library is scanned the first time the
  // Library is opened, and ⟳ Refresh re-scans thereafter.
  if (options.firstLoadRefresh !== false && !libState.loaded) refreshLibrary();
  return true;
}

/**
 * Bring the Library surface to the front, whichever engine is live. Classic mode and every
 * bootstrap refusal take the original tab path, byte-for-byte.
 */
function focusLibrarySurface(options = {}) {
  if (dockviewIsActive()) return openLibraryInDock(options);
  switchTab('library');
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === 'library'));
  return true;
}

/**
 * Show exactly one terminal surface. Both containers exist at all times; this only toggles which is
 * visible, so the classic grid is never destroyed and is always one attribute away from usable.
 */
function showTerminalSurface(which) {
  const grid = $('#terminalGrid');
  const dock = $('#terminalDock');
  if (!grid || !dock) return false;
  const useDock = which === 'dock';
  dock.hidden = !useDock;
  grid.hidden = useDock;
  return true;
}

/** One bounded, content-free refusal, and a guaranteed landing on the working grid. */
function refuseLayoutEngine(reason) {
  appendLog(`[dockview] REFUSED: ${reason} — layout engine not started, classic grid left usable\n`);
  showTerminalSurface('grid');
}

/**
 * Adopt terminal panes that already exist — panes created while the Dockview scripts were still
 * loading, which is a real race because startup is async and `+ Shell` is clickable immediately.
 *
 * ALL-OR-NOTHING. A partially adopted workspace would leave the unadopted panes parented to the
 * hidden classic grid: alive, holding a PTY, and invisible. That is precisely the "hidden pane"
 * the work order forbids, so a single failure rolls every adoption back and the caller falls back
 * to the grid. No PTY is created or killed on any path here.
 *
 * @returns {boolean} true when every existing pane was adopted.
 */
function adoptExistingPanes() {
  if (!layoutInstance) return false;
  const adopted = [];
  for (const id of [...terms.keys()]) {
    let result = null;
    try { result = layoutInstance.addPane(id, 'terminal'); }
    catch { result = { ok: false, reason: 'adopt-threw' }; }
    if (result && result.ok) { adopted.push(id); continue; }

    appendLog(`[dockview] adopt REFUSED for ${id}: ${(result && result.reason) || 'unknown'} — `
      + `rolling back ${adopted.length} adopted pane(s); no PTY was created or killed\n`);
    // Release each adopted pane from the adapter FIRST. That disposes its fit controller and
    // disconnects the adapter's own ResizeObserver, so the pane arrives back at the grid with NO
    // resize owner at all — which `returnAllPanesToGrid` then fixes by reconnecting the app's.
    for (const doneId of adopted) {
      try { layoutInstance.onAppPaneClosed(doneId); } catch { /* rollback is best effort */ }
    }
    returnAllPanesToGrid();
    return false;
  }
  return true;
}

/**
 * Put every live terminal pane back under classic-grid ownership: the DOM position AND the resize
 * owner, which are two halves of the same handover and are useless apart.
 *
 * Adoption disconnects each adopted pane's app-owned ResizeObserver, because the adapter's gated
 * fit controller took over. When adoption then rolls back, the controller is disposed with it — so
 * a pane returned to the grid without this reconnect has ZERO resize owners: it looks correct until
 * the first window resize, then keeps a stale geometry forever. Reparenting by object identity
 * means the xterm, its PTY and every handler ride along with the element.
 *
 * Ends with ONE bounded refit for the whole transition (not one per pane): `fitAllTerms` skips
 * docked panes, and by this point nothing is docked, so it is exactly the classic-grid fitter doing
 * exactly one pass. A fit that changes the geometry sends its own `pty-resize` through xterm's
 * `onResize`, so no separate resize message is issued here.
 */
function returnAllPanesToGrid() {
  const grid = $('#terminalGrid');
  if (!grid) return;
  for (const [id, t] of terms) {
    if (t && t.pane && t.pane.parentNode !== grid) {
      try { grid.appendChild(t.pane); } catch { /* best effort — the refusal already reported */ }
    }
    resumeAppResizeObserver(id);
  }
  fitAllTerms();
}

async function startLayoutEngine() {
  // STRICT in the direction that matters. `enabled` is main's frozen boolean: true on a normal
  // launch, false under --classic-layout. The renderer cannot flip it either way, because it is
  // computed in the preload from an argv token no renderer script can write.
  if (!window.ccDockview || window.ccDockview.enabled !== true) {
    appendLog('[classic-layout] CLASSIC RECOVERY MODE ACTIVE — Dockview is not loaded and layout '
      + 'operations are unavailable. The classic grid is the terminal workspace.\n');
    showTerminalSurface('grid');
    return;
  }

  try {
    for (const src of DOCKVIEW_SCRIPTS) await loadScriptOnce(src);
  } catch {
    // The rejection carries only a src we already control; one bounded reason is the contract.
    refuseLayoutEngine('script-load-failed');
    return;
  }

  // A script element's `onload` fires when the file was FETCHED — NOT when it parsed and published
  // its API. That distinction is not theoretical: two policy scripts once fetched fine, failed to
  // parse on a global `const api` collision, and left the adapter undefined while onload reported
  // success. Verify the actual exports before anything is committed to the visible UI.
  const engine = window.ccDockviewPrototype;
  if (!engine || typeof engine.bootstrap !== 'function' || typeof engine.activate !== 'function') {
    refuseLayoutEngine('adapter-export-missing');
    return;
  }
  // Names come from the adapter's own closed literal list, so this reason cannot carry state.
  const missing = typeof engine.missingBrowserExports === 'function' ? engine.missingBrowserExports(window) : [];
  if (missing.length > 0) {
    refuseLayoutEngine(`missing-exports:${missing.join('+')}`);
    return;
  }

  // bootstrap() binds to the EMBEDDED #terminalDock, re-verifies the exports itself, wraps
  // activation in an error boundary, and strips any partial surface on failure. The grid is still
  // the visible workspace at this point and stays that way unless everything below succeeds.
  let result = null;
  try {
    result = engine.bootstrap({ win: window, doc: document, log: appendLog, buildHost: buildDockviewHost });
  } catch {
    refuseLayoutEngine('bootstrap-threw');
    return;
  }
  if (!result || result.ok !== true || !result.instance) {
    refuseLayoutEngine((result && result.reason) || 'activation-refused');
    return;
  }
  layoutInstance = result.instance;

  // Adopt first, still hidden, so a failed adoption never flashes a broken workspace.
  if (!adoptExistingPanes()) {
    try { layoutInstance.dispose(); } catch { /* teardown must not mask the refusal */ }
    layoutInstance = null;
    const dock = $('#terminalDock');
    while (dock && dock.firstChild) dock.removeChild(dock.firstChild);
    refuseLayoutEngine('pane-adoption-failed');
    return;
  }

  // ONLY NOW is the visible workspace switched. Everything above can fail with the classic grid
  // still on screen and still usable, which is the whole point of the ordering.
  showTerminalSurface('dock');
  appendLog('[dockview] production layout engine active (dockview 7.0.4).\n');

  // A READ-ONLY, bounded diagnostic surface for tests, human acceptance and support transcripts.
  // It is deliberately NOT an authority: nothing in this file (or any other) reads it, it exposes
  // no element, handle, or mutator, every accessor returns a fresh plain value, and the property is
  // non-writable and non-configurable so it cannot be swapped for a fake that lies about the state.
  // Removing it would change no application behaviour whatsoever — that is the test of whether a
  // diagnostic has quietly become load-bearing.
  try {
    Object.defineProperty(window, 'ccDockviewDiagnostics', {
      value: Object.freeze({
        snapshot: () => (layoutInstance ? layoutInstance.diagnostics() : null),
        active: () => layoutInstance !== null,
        /**
         * Who owns each live pane's resizing right now. Exactly one of the two must be true per
         * pane at every stable point: the app's grid ResizeObserver, or the adapter's gated fit
         * controller. Both true is the double-resize defect; both false is the silently-dead-resize
         * defect that a rolled-back adoption used to produce.
         */
        resizeOwners: () => [...terms.entries()].map(([paneId, t]) => ({
          paneId,
          appObserver: t.roConnected === true,
          fitController: !!(layoutInstance && layoutInstance.registry.has(paneId)),
        })),
      }),
      writable: false,
      configurable: false,
      enumerable: false,
    });
  } catch { /* a diagnostic surface must never be able to break startup */ }
}

// PANE STATUS badge instance, held at module scope because two different scopes need it: `boot()`
// constructs it and subscribes it to main's view pushes, while `buildDockviewHost()` — which runs in
// its own scope — has to reach it to re-attach badges after a Dockview layout change. It stays `null`
// until boot() runs, and every call site tolerates null rather than assuming construction succeeded.
let paneStatusBadge = null;

// The controlled surface the adapter is allowed to use. Everything privileged stays on this side:
// the adapter never sees cc.*, a path, a role, a prompt, or report content.
function buildDockviewHost(container) {
  return {
    bridge: window.ccDockview,
    getDockviewGlobal: () => window.dockview,
    getContainer: () => container,
    log: appendLog,
    isTerminalPane: (paneId) => terms.has(paneId),
    getPaneElement: (paneId) => {
      const t = terms.get(paneId);
      if (t) return t.pane;
      return paneId === 'library' ? libraryElement() : null;
    },
    getTerminalBody: (paneId) => {
      const t = terms.get(paneId);
      return t ? t.pane.querySelector('.term-body') : null;
    },
    fitTerminal: (paneId) => { const t = terms.get(paneId); if (t) t.fit.fit(); },
    // Hand the gated fit controller sole ownership of this pane's resizing: the app's own
    // per-pane ResizeObserver has no visibility or geometry gate, and leaving it attached would
    // give a Dockview-hosted terminal two observers and two PTY-resize senders.
    suspendAppResizeObserver: (paneId) => {
      const t = terms.get(paneId);
      if (!t || !t.ro || t.roConnected !== true) return false;
      try { t.ro.disconnect(); } catch { /* already disconnected */ }
      t.roConnected = false;
      return true;
    },
    // The inverse. Narrowly scoped to ONE pane and reconnects the EXISTING observer rather than
    // constructing a second one — see resumeAppResizeObserver. The adapter calls nothing here on a
    // normal close; this exists for the transitions where a pane leaves Dockview alive.
    resumeAppResizeObserver: (paneId) => resumeAppResizeObserver(paneId),
    measureTerminal: (paneId) => {
      const t = terms.get(paneId);
      return t ? { cols: t.term.cols, rows: t.term.rows } : null;
    },
    sendResize: (paneId, cols, rows) => cc.ptyResize(paneId, cols, rows),
    focusPane: (paneId) => {
      const t = terms.get(paneId);
      if (t) { activeTermId = paneId; try { t.term.focus(); } catch {} }
    },
    // PANE STATUS re-attachment after a Dockview layout change. Dockview reparents pane elements,
    // which can drop the badge NODE; the STATE lives in the badge module keyed by pane id and is
    // unaffected, so this restores the visual without inventing or resetting a status. Returns the
    // number of badges re-attached so the adapter's own tests can assert it actually ran.
    reattachPaneStatus: () => (paneStatusBadge ? paneStatusBadge.reattachAll() : 0),
    // Pane creation goes through the EXISTING code path, so the prototype's terminals are real
    // PTYs carrying the app's own clipboard, OSC 52, TTS, Dictate, and close wiring — not stand-ins.
    createTerminalPane: async () => {
      const before = new Set(terms.keys());
      openInAppTerminal({});
      return [...terms.keys()].find((id) => !before.has(id)) || null;
    },
    // The Library is a SINGLETON element that already lives in the tab strip. The prototype docks
    // that exact element and must be able to put it back; it never clones or rebuilds it, because a
    // clone would lose every listener library-view.js and report-followup.js bound to it.
    libraryAvailable: () => libraryElement() !== null,
    dockLibrary: () => dockLibraryElement(),
    undockLibrary: () => undockLibraryElement(),
    isLibraryDocked: () => libraryHomePlaceholder !== null,
    // No audio members. The adapter has no knowledge of `.tts-controls` and no way to reach it:
    // the production surface never covers the toolbar, so the element never moves.
    // Diagnostics for acceptance: a monotonic ID like "Terminal 17" does NOT mean 17 live
    // terminals. This reports what is actually live so the two can never be confused.
    liveTerminalCount: () => terms.size,
    liveTerminalIds: () => [...terms.keys()],
    // The app's single idempotent close path. Calling it twice kills one PTY once.
    closePane: (paneId) => {
      const t = terms.get(paneId);
      if (t && typeof t.closePane === 'function') t.closePane();
    },
  };
}

// ---- boot -------------------------------------------------------------------
async function boot() {
  const s = await cc.getSettings();
  applyTheme((s && s.theme) || 'obsidian');
  if (s && s.ttsVoice) state.ttsVoice = s.ttsVoice;
  if (s && s.ttsSpeed) state.ttsSpeed = s.ttsSpeed;
  updateKeyBanner(await cc.getGeminiKeyStatus());
  await refreshRepos();
  wireUi();
  await quickLinksView.load();
  // Pull the controlled run's bounded counts once the bar exists. No-op with no run configured.
  if (admissionView) await admissionView.refresh();
  document.title = `Blue Helm — ${ACCEPTANCE_BUILD}`;
  const buildBadge = $('#audioBuild');
  if (buildBadge) buildBadge.textContent = ACCEPTANCE_BUILD; // single source: the const above
  appendLog(`[build] ${ACCEPTANCE_BUILD}\n`);
  cc.onPtyData(({ id, data }) => {
    const t = terms.get(id);
    if (t) { t.term.write(data); t.parser.feed(data); }
  });
  cc.onPtyExit(({ id }) => {
    const t = terms.get(id);
    if (t) { t.parser.flush(); t.term.write('\r\n\x1b[90m[process exited — close this pane]\x1b[0m\r\n'); }
  });
  cc.onMainError((m) => appendLog('\n[main error] ' + m + '\n'));

// EXPERIMENT A — PROTOTYPE pane status (Claude only, one pane).
// docs/OSS-PROCUREMENT-pane-status.md — "BLUE SUBSYSTEM VERDICT: PROTOTYPE".
//
// Receive-only. Main pushes a token-free { paneId, state, reason, prototype } view; the renderer has
// no way to request status, enroll a pane, or reach the transport.
//
// PRODUCTION. The bridge is exposed unconditionally in the trusted window, so the badge and the
// toolbar control are always constructed. Whether pane status is SET UP is a runtime question the
// toolbar control asks and answers honestly — it is not a question about whether an object exists.
//
// State is keyed by the app's pane id — the same key `terms`, main's PTY map, and Dockview's registry
// use — so a badge follows its PROCESS, not its position. That is what makes a Dockview drag unable
// to hand one pane's status to another.
paneStatusBadge = (window.ccPaneStatus && window.ccPaneStatusBadge)
  ? window.ccPaneStatusBadge.createPaneStatusBadge({
      document,
      log: appendLog,
      getPaneElement: (paneId) => { const t = terms.get(paneId); return t ? t.pane : null; },
    })
  : null;
// The compact Claude status control in the existing Terminals toolbar. Its three possible actions map
// one-to-one onto three of the four zero-argument invokes; there is no control here that sets a pane's
// status, reaches a token, or names a path.
//
// CORRECTED (advisory review, finding 2). This used to query `#terminals-toolbar`, `.term-toolbar` and
// `#term-toolbar` — three selectors, NONE of which exists anywhere in index.html. Every one returned
// null, so `createSetupControl` mounted nothing and the entire setup surface was unreachable in the
// running application: there was no way to install or remove the hooks from the UI at all. The suite
// that "covered" it passed because it injected its own `getToolbarElement`, which is precisely the
// mistake — a test that supplies the integration point cannot prove the integration point exists.
//
// The real element is `.term-bar` (app/renderer/index.html), which is what Work Order 1 J.1 specified,
// and `#paneStatusHost` is the empty placeholder inside it — a sibling of `.tts-controls`, immediately
// before `#newTermShell`, mirroring `#admissionHost`. Falling back to the bar itself keeps the control
// reachable if the placeholder is ever removed, and both halves are asserted against the REAL markup.
const paneStatusSetup = (window.ccPaneStatus && window.ccPaneStatusBadge)
  ? window.ccPaneStatusBadge.createSetupControl({
      document,
      log: appendLog,
      bridge: window.ccPaneStatus,
      // No `getToolbarElement` here. The mount point is resolved by the production
      // `resolveSetupHost` inside the badge module, against this document, so a suite cannot make the
      // integration work by supplying an element the real page does not have.
    })
  : null;
if (paneStatusBadge) {
  window.ccPaneStatus.onView((view) => {
    const shown = paneStatusBadge.update(view);
    if (shown && view && view.paneId) {
      appendLog(`[pane-status] ${view.paneId} -> ${shown.label}${view.reason ? ` (${view.reason})` : ''}\n`);
    }
  });
}
if (paneStatusSetup) {
  window.ccPaneStatus.onSetupState((setup) => { paneStatusSetup.render(setup); });
  // Ask once at startup so the control is honest before main pushes anything.
  Promise.resolve(paneStatusSetup.refresh()).catch(() => {
    // A failed first read must be VISIBLE, not silent: the control stays at its "off" default and the
    // Logs tab says why. Fixed constant — no path, no settings content, no token.
    appendLog('[pane-status] could not read setup state at startup; the control shows "off" until it can.\n');
  });
}
  window.addEventListener('resize', fitAllTerms);
  // PRODUCTION layout engine. On a normal launch this loads Dockview and, only after activation and
  // pane adoption both succeed, switches the visible terminal workspace from the grid to the dock.
  // Under `--classic-layout` it returns immediately and NOTHING about Dockview is fetched, parsed,
  // styled, persisted, or initialized. See startLayoutEngine above.
  // The .catch is required, not decorative: this is a floating promise, and an unhandled rejection
  // here would be an invisible failure. Every internal path already refuses in a bounded way, so
  // this only fires if the bootstrap itself broke — and it still refuses visibly.
  startLayoutEngine().catch(() => refuseLayoutEngine('startup-failed'));
  // TTS/STT modules load after this script. Every state has an explicit UI:
  // ready wires the control; a missed ready event becomes a visible refusal.
  const ttsReady = () => { audioModules.markReady('tts'); setupTTSControls(); appendLog('[tts] module ready\n'); };
  const sttReady = () => { audioModules.markReady('stt'); setupSTTControls(); appendLog('[stt] module ready\n'); };
  if (window.ccTTS) ttsReady();
  else window.addEventListener('cc-tts-ready', ttsReady, { once: true });
  if (window.ccSTT) sttReady();
  else {
    installSTTUnavailableControl();
    window.addEventListener('cc-stt-ready', sttReady, { once: true });
  }
  setTimeout(() => {
    for (const kind of ['tts', 'stt']) {
      if (audioModules.get(kind).phase !== 'pending') continue;
      reportAudioModuleFailure(kind, 'module did not initialize; required browser bundle may be missing');
    }
  }, 2500);
}

function installSTTUnavailableControl() {
  const micBtn = $('#sttMic');
  if (!micBtn) return;
  micBtn.onclick = () => {
    const moduleState = audioModules.get('stt');
    const detail = moduleState.phase === 'failed' ? moduleState.detail : 'module is still starting';
    appendLog(`[stt] dictation engine unavailable: ${detail}\n`);
  };
}

// Wire the Whisper dictation control: push-to-talk that types the FINALIZED transcript
// into the pane LOCKED at recording start (we own the PTY write channel, so no OS
// dictation needed). Logs carry pane ID/role, character count, lifecycle, and errors
// only — never the dictated text itself.
function setupSTTControls() {
  const stt = window.ccSTT; if (!stt) return;
  const micBtn = $('#sttMic');
  if (micBtn && !micBtn.dataset.sttWired) {
    micBtn.dataset.sttWired = '1';
    micBtn.onclick = () => {
      if (stt.isRecording()) { stt.toggle(); return; } // second click: stop + one finalized transcript
      if (stt.isBusy()) { appendLog('[stt] still transcribing the previous dictation…\n'); return; }
      if (!activeTermId || !terms.has(activeTermId)) { appendLog('[stt] click into an agent pane first, then 🎤.\n'); return; }
      // Lock the destination NOW: however long the model load takes, and whatever pane
      // is clicked meanwhile, the finished transcript goes here or is refused visibly.
      sttDictationTargetId = activeTermId;
      const paneRole = (terms.get(sttDictationTargetId) || {}).role || 'shell';
      appendLog(`[stt] dictation started — locked to pane ${sttDictationTargetId} (${paneRole})\n`);
      stt.toggle(); // first click: recording starts immediately (model loads at stop time)
    };
  }
  stt.onStatus(({ state: st, detail }) => {
    const el = $('#sttStatus'); if (el) el.textContent = (st && st !== 'idle') ? (st + (detail ? ' — ' + detail : '')) : '';
    if (micBtn) { micBtn.textContent = st === 'recording' ? '⏺ Stop' : '🎤 Dictate'; micBtn.classList.toggle('rec', st === 'recording'); }
    if (st === 'error' && detail) appendLog('[stt] ' + detail + '\n');
  });
  stt.onResult((text) => {
    const targetId = sttDictationTargetId;
    sttDictationTargetId = null;
    const action = window.ccSttTargetLock.resolveTranscriptDelivery({
      targetId,
      paneExists: !!(targetId && terms.has(targetId)),
      charCount: (text || '').length,
    });
    appendLog(action.log); // pane id + char count only, by construction — never the text
    if (action.deliver) cc.ptyWrite(targetId, text + ' ');
  });
}

// Populate + wire the Kokoro TTS controls (voice, speed, stop, status) once the module is up.
function setupTTSControls() {
  const tts = window.ccTTS; if (!tts) return;
  const voiceSel = $('#ttsVoice');
  if (voiceSel && !voiceSel.dataset.filled) {
    for (const v of tts.voices) {
      const o = document.createElement('option'); o.value = v.id; o.textContent = v.label; voiceSel.appendChild(o);
    }
    voiceSel.dataset.filled = '1';
    voiceSel.value = state.ttsVoice || tts.getVoice();
    tts.setVoice(voiceSel.value);
    voiceSel.onchange = () => { tts.setVoice(voiceSel.value); state.ttsVoice = voiceSel.value; cc.saveSettings({ ttsVoice: voiceSel.value }); };
  }
  const speedSel = $('#ttsSpeed');
  if (speedSel) {
    speedSel.value = String(state.ttsSpeed || 1);
    tts.setSpeed(speedSel.value);
    speedSel.onchange = () => { tts.setSpeed(speedSel.value); state.ttsSpeed = Number(speedSel.value); cc.saveSettings({ ttsSpeed: state.ttsSpeed }); };
  }
  const stopBtn = $('#ttsStop');
  if (stopBtn) stopBtn.onclick = () => tts.stop();
  tts.onStatus(({ state: st, detail }) => {
    const el = $('#ttsStatus'); if (el) el.textContent = (st && st !== 'idle') ? (st + (detail ? ' — ' + detail : '')) : '';
    if (stopBtn) stopBtn.classList.toggle('hidden', st !== 'speaking' && st !== 'synthesizing' && st !== 'loading');
    if (st === 'error' && detail) appendLog('[tts] ' + detail + '\n');
    if (st === 'ready' && detail) appendLog('[tts] engine ready: ' + detail + '\n');
  });
}

async function refreshRepos() {
  const { repos, selectedRepo } = await cc.listRepos();
  const sel = $('#repoSelect');
  sel.innerHTML = '';
  if (repos.length === 0) {
    const o = document.createElement('option');
    o.textContent = '(no repos found — set projects root 📁)';
    o.value = '';
    sel.appendChild(o);
  }
  for (const r of repos) {
    const o = document.createElement('option');
    o.value = r;
    o.textContent = r.split(/[\\/]/).pop();
    sel.appendChild(o);
  }
  state.repo = repos.includes(selectedRepo) ? selectedRepo : (repos[0] || '');
  sel.value = state.repo;
  await onRepoChange();
}

async function onRepoChange() {
  await cc.saveSettings({ selectedRepo: state.repo });
  state.githubUrl = state.repo ? await cc.repoGithubUrl(state.repo) : '';
  await refreshAgents();
}

// ---- agents -----------------------------------------------------------------
async function refreshAgents() {
  appendLog('[TIMING] refreshAgents: listWorktrees START\n');
  const all = state.repo ? await cc.listWorktrees(state.repo) : [];
  appendLog(`[TIMING] refreshAgents: listWorktrees END (${all.length} items)\n`);
  // The first worktree is the main checkout; the rest are agents.
  state.worktrees = all.filter((w) => !w.branch || w.branch !== 'main');
  renderAgentList();
  renderAgentGrid();
}

// The task slug for an app-created worktree, whose folder is named "<repo>-<task>". Returns null
// when the folder does NOT match that convention (a manually-created or foreign worktree): there is
// then no app-derivable task name, and the remove path must never be handed an unvalidatable name
// (finding M1). Callers treat a falsy result (null, or the '' from a degenerate "<repo>-" folder)
// as non-removable and DISABLE the Remove control; displayNameOf() decides the label.
function taskOf(wt) {
  const base = wt.path.split(/[\\/]/).pop();
  const repoName = state.repo.split(/[\\/]/).pop();
  return base.startsWith(repoName + '-') ? base.slice(repoName.length + 1) : null;
}

// What to LABEL a worktree in the UI — independent of whether it's app-removable. Prefer the branch,
// then the derived task, then the raw folder name, so a row always shows something meaningful even
// when taskOf() is null.
function displayNameOf(wt) {
  return wt.branch || taskOf(wt) || wt.path.split(/[\\/]/).pop();
}
function agentColorOf(wt) {
  // best-effort: we can't know which CLI is running, so tag by branch convention
  return 'claude';
}

function renderAgentList() {
  const list = $('#agentList');
  if (state.worktrees.length === 0) {
    list.innerHTML = '<div class="empty">No agents yet. Click <b>+ New</b>.</div>';
    return;
  }
  list.innerHTML = '';
  for (const wt of state.worktrees) {
    const task = taskOf(wt);
    // wt.branch / wt.path are git-derived — build with safe DOM APIs, never innerHTML (finding #1).
    // removable=false (non-<repo>-<task> folder) disables Remove rather than sending an
    // unvalidatable name to the main process (finding M1).
    const row = agentDom.buildAgentRow(document, {
      colorClass: agentColorOf(wt), name: displayNameOf(wt), path: wt.path, removable: !!task,
    });
    if (task) row.querySelector('.x').onclick = () => removeAgent(task);
    list.appendChild(row);
  }
}

function renderAgentGrid() {
  const grid = $('#agentGrid');
  grid.innerHTML = '';
  if (state.worktrees.length === 0) {
    grid.innerHTML = '<div class="empty muted">No active agents. Use <b>+ New</b> in the sidebar.</div>';
    return;
  }
  for (const wt of state.worktrees) {
    const task = taskOf(wt);
    // wt.branch / wt.path are git-derived — build with safe DOM APIs, never innerHTML (finding #1).
    // removable=false disables the card's Remove button for non-<repo>-<task> folders (finding M1).
    const card = agentDom.buildAgentCard(document, {
      colorClass: agentColorOf(wt), branchText: displayNameOf(wt), path: wt.path, removable: !!task,
    });
    card.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = () => {
        const act = b.dataset.act;
        if (['claude', 'codex', 'gemini'].includes(act)) openInAppTerminal({ worktree: wt.path, cli: act });
        // read-only roles operate on the existing checkout — no new worktree
        else if (act === 'review') launchReviewer(wt.path);
        else if (act === 'scout') openInAppTerminal({ worktree: wt.path, role: 'codebase-scout', cli: 'claude' });
        else if (act === 'code') cc.openVscode(wt.path);
        else if (act === 'term') cc.openTerminal(wt.path);
        else if (act === 'rm') { if (task) removeAgent(task); } // disabled button won't fire; guard anyway
      };
    });
    grid.appendChild(card);
  }
}

async function removeAgent(task) {
  // Normalized contract: remove-agent returns { ok, error? }. On refusal (e.g. a bypassed renderer
  // sent an invalid name), surface it the same way worktreeOk() does on the create side — log +
  // alert — instead of silently swallowing it (finding L3).
  const res = await cc.removeAgent({ repo: state.repo, task });
  if (res && res.ok === false) {
    appendLog(`[agent] remove refused: ${res.error || 'unknown error'}\n`);
    alert(`Could not remove the worktree:\n\n${res.error || 'unknown error'}`);
  }
  await refreshAgents();
}

// Launch the read-only Reviewer against a checkout: build the diff (this branch vs main)
// first, then open it with an opening prompt pointing at the saved diff so it reviews a
// concrete change set rather than an empty tree.
async function launchReviewer(worktree) {
  const name = worktree.split(/[\\/]/).pop();
  const r = await cc.reviewDiff({ worktree, base: 'main' });
  let initialPrompt;
  if (r && r.empty) {
    appendLog(`[reviewer] no changes vs main in ${name}.\n`);
    initialPrompt = 'There are no changes versus main to review in this checkout. Say so, and ask which branch or files to review.';
  } else if (r && r.ok) {
    appendLog(`[reviewer] diff ready for ${name}: ${r.files} file(s), ${r.bytes} bytes.\n`);
    initialPrompt = `Review the change set in ./${r.fileName} (this branch vs main, ${r.files} file(s)). Read that file, then report findings per your role instructions.`;
  } else {
    appendLog(`[reviewer] could not build diff for ${name}: ${(r && r.error) || 'unknown error'}\n`);
    initialPrompt = 'The diff could not be generated automatically. Ask the human to paste the diff you should review.';
  }
  openInAppTerminal({ worktree, role: 'reviewer', cli: 'claude', initialPrompt, title: `Reviewer · ${name}` });
}

// ---- Gemini key banner ------------------------------------------------------
function updateKeyBanner(status) {
  const hasKey = status && status.hasKey;
  $('#keyBanner').classList.toggle('hidden', !!hasKey);
  $('#keyStored').classList.toggle('hidden', !hasKey);
}

// ---- logs -------------------------------------------------------------------
function appendLog(text) {
  const log = $('#logView');
  log.textContent += text;
  log.scrollTop = log.scrollHeight;
}

// ---- wiring -----------------------------------------------------------------
function wireUi() {
  $('#repoSelect').onchange = (e) => { state.repo = e.target.value; onRepoChange(); };
  $('#themeSelect').onchange = (e) => applyTheme(e.target.value);
  $('#refresh').onclick = refreshRepos;
  $('#changeRoot').onclick = async () => {
    const dir = await cc.pickFolder();
    if (dir) { await cc.saveSettings({ projectsRoot: dir }); await refreshRepos(); }
  };

  $('#openVscode').onclick = () => state.repo && cc.openVscode(state.repo);
  $('#openTerminal').onclick = () => state.repo && cc.openTerminal(state.repo);
  $('#openGithub').onclick = () => state.githubUrl && cc.openExternal(state.githubUrl);

  // Launch the installed Vibe Kanban desktop app; if not found, let the user locate it.
  const openBoard = async () => {
    const r = await cc.openBoard();
    if (!r || !r.ok) { const p = await cc.pickBoardApp(); if (p) await cc.openBoard(); }
  };
  $('#openBoard').onclick = openBoard;
  $('#openBoard2').onclick = openBoard;
  $('#locateBoard').onclick = async () => { const p = await cc.pickBoardApp(); if (p) await cc.openBoard(); };

  // tabs
  document.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => {
      // PRODUCTION Dockview: the Library is a docked panel inside the Terminals workspace, so its
      // tab navigates there and adds or focuses the singleton — never a clone, never a duplicate.
      // Classic mode and every bootstrap refusal leave `layoutInstance` null and fall through to
      // the original tab behaviour below, unchanged.
      if (t.dataset.tab === 'library' && dockviewIsActive()) { openLibraryInDock(); return; }
      switchTab(t.dataset.tab);
      if (t.dataset.tab === 'terminals') setTimeout(fitAllTerms, 0);
      // V5b2: scan the run library the first time the Library tab is opened (Refresh re-scans).
      if (t.dataset.tab === 'library' && !libState.loaded) refreshLibrary();
    };
  });
  setupLibrary();   // V5b2: wire the Library controls (refresh / filters / sort / copy / maximize)
  quickLinksView.mount();
  // Builds the controlled-run bar into #admissionHost. With no run configured `admissionView` is null
  // and this line does nothing at all — no element, no handler, no listener.
  if (admissionView) admissionView.mount();
  $('#newTermShell').onclick = () => openInAppTerminal({ worktree: state.repo || undefined });

  // Gemini key banner
  $('#geminiKeySave').onclick = async () => {
    const key = $('#geminiKeyInput').value.trim();
    if (!key) { $('#geminiKeyInput').focus(); return; }
    const r = await cc.setGeminiKey(key);
    if (r && r.ok) {
      $('#geminiKeyInput').value = '';
      updateKeyBanner({ hasKey: true });
    } else {
      appendLog(`[key] save failed: ${(r && r.error) || 'unknown error'}\n`);
    }
  };
  $('#geminiKeyInput').onkeydown = (e) => { if (e.key === 'Enter') $('#geminiKeySave').click(); };
  $('#geminiKeyChange').onclick = () => updateKeyBanner({ hasKey: false });
  $('#geminiKeyClear').onclick = async () => {
    await cc.clearGeminiKey();
    updateKeyBanner({ hasKey: false });
  };

  // new-agent modal
  $('#newAgent').onclick = openModal;
  $('#modalCancel').onclick = closeModal;
  $('#modalCreate').onclick = createAgent;
  // Role picker: switches behavior + reveals builder/plain sub-options.
  document.querySelectorAll('.role-choices .choice').forEach((c) => {
    c.onclick = () => {
      document.querySelectorAll('.role-choices .choice').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      state.chosenRole = c.dataset.role;
      const r = ROLES[state.chosenRole] || {};
      $('#builderOpts').classList.toggle('hidden', state.chosenRole !== 'builder');
      $('#cliRow').classList.toggle('hidden', state.chosenRole !== 'plain');
      $('#targetRow').classList.toggle('hidden', !r.readOnly);
      $('#videoScoutOpts').classList.toggle('hidden', !r.video);
      setTaskInputMode(!!r.video); // video-scout uses the same field for a URL
      updateVideoRangeVisibility();
      updateModalHint();
    };
  });
  // CLI sub-picker (only relevant for the Plain role).
  document.querySelectorAll('.cli-choice').forEach((c) => {
    c.onclick = () => {
      document.querySelectorAll('.cli-choice').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      state.chosenCli = c.dataset.cli;
      updateModalHint();
    };
  });
  $('#hardTask').onchange = (e) => { state.hardTask = e.target.checked; };
  // Video-scout's Gemini options (model / media-resolution). Server-side allowlists in main.js
  // (VALID_VIDEO_MODELS / VALID_MEDIA_RESOLUTIONS) are the actual enforcement — these dropdowns
  // only offer known-good values, they are not the security boundary.
  // V4Q Phase B: the model dropdown PINS a manual choice for the rest of this modal session. An
  // out-of-allowlist value is refused rather than substituted, and the control is snapped back to
  // the concrete model still held in state — the dropdown must never display one model while
  // ptyStart sends another.
  //
  // CORRECTION: `change` alone was insufficient. A <select> emits NO change event when the user
  // picks the option ALREADY DISPLAYED, so deliberately keeping the automatic Flash-Lite left the
  // session unpinned and switching to video then silently escalated it to Pro (and symmetrically,
  // a deliberately kept Pro was silently downgraded). Deliberate ACTIVATION now pins the displayed
  // model; a subsequent `change` replaces that pin with the newly selected model.
  const modelSelect = $('#videoModelSelect');
  const pinFromInteraction = (interaction) => {
    const outcome = videoModelPolicy.applyModelInteraction(modelPolicy, interaction);
    if (outcome.error) { syncVideoModelControls(outcome.error); return; }
    if (!outcome.handled) return; // focus/tab/modifier-only: no choice was expressed
    modelPolicy = outcome.state;
    syncVideoModelControls();
  };
  // Primary pointer only — right/middle activation is not a choice. Fires BEFORE the native
  // selector changes the value, so the displayed model is pinned even if the user dismisses.
  modelSelect.onpointerdown = (e) => pinFromInteraction({
    type: 'pointerdown', button: e.button, isPrimary: e.isPrimary, displayedModel: modelSelect.value,
  });
  modelSelect.onkeydown = (e) => pinFromInteraction({
    type: 'keydown', key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, displayedModel: modelSelect.value,
  });
  modelSelect.onchange = (e) => pinFromInteraction({ type: 'change', displayedModel: e.target.value });
  $('#mediaResolutionSelect').onchange = (e) => { state.mediaResolution = e.target.value; };
  // V4Q Phase B: a mode change re-applies the AUTOMATIC policy only while the session is unpinned.
  // After a manual pick the mode still changes (slice rows follow it) but the model does not.
  $('#analysisModeSelect').onchange = (e) => {
    modelPolicy = videoModelPolicy.applyAnalysisMode(modelPolicy, e.target.value);
    syncVideoModelControls();
    updateVideoRangeVisibility();
  };
  // V4: add a slice row (capped at MAX_SLICES; the handler disables itself via renumberSliceRows).
  const addSliceBtn = $('#addSliceBtn');
  if (addSliceBtn) addSliceBtn.onclick = () => addSliceRow();
  // V3a: live character counter for the optional analysis-focus field. Counts the NORMALIZED length
  // (so trailing whitespace / newlines don't misreport it), and marks the counter when over the bound.
  // This is UX only — main.js (video-scout-args.js) and feed-gemini.ps1 are the real enforcement.
  const focusInput = $('#analysisFocusInput');
  if (focusInput) focusInput.oninput = updateAnalysisFocusCounter;
}

// Update the "N / 2000" analysis-focus counter from the current textarea value. Uses the shared
// normalizer so the count matches exactly what will be validated (trim + CRLF/CR/LF/tab -> space).
function updateAnalysisFocusCounter() {
  const el = $('#analysisFocusInput'); const counter = $('#analysisFocusCounter');
  if (!el || !counter) return;
  const res = analysisFocus.normalizeAnalysisFocus(el.value);
  // chars is populated for a valid value (provided) and for the too-long case; blank -> 0. For the
  // (textarea-unreachable) non-string / control-char cases, fall back to the raw length.
  const len = (typeof res.chars === 'number') ? res.chars : el.value.length;
  counter.textContent = `${len} / ${analysisFocus.MAX_ANALYSIS_FOCUS_CHARS}`;
  counter.classList.toggle('over', len > analysisFocus.MAX_ANALYSIS_FOCUS_CHARS);
}

// The task field doubles as the URL field for video-scout — relabel it accordingly.
function setTaskInputMode(isVideo) {
  const lbl = $('#taskNameLabel'); const inp = $('#taskName');
  if (isVideo) {
    if (lbl) lbl.innerHTML = 'Video URL';
    if (inp) inp.placeholder = 'https://youtu.be/…';
  } else {
    if (lbl) lbl.innerHTML = 'Task name <span class="muted">(kebab-case)</span>';
    if (inp) inp.placeholder = 'e.g. search-bar';
  }
}

// V4 slice rows: the DOM row list lives here; ALL decision logic lives in video-range-ui.js
// (classifySliceRows / computeSliceAggregate / detectStaleSliceRows). Each entry is one visible
// "Slice N" row. Rows are read fresh from the DOM at launch — never mirrored into `state`.
const sliceRows = [];

function collectSliceRowValues() {
  return sliceRows.map((r) => ({ startValue: r.startEl.value, endValue: r.endEl.value }));
}

// Build one slice row (label + start/end inputs + a per-row Remove button). Row numbering is
// recomputed on every add/remove so the visible "Slice N" labels always match positional order —
// the same order every downstream layer (args JSON, provider parts, prompt, manifest) preserves.
function createSliceRow() {
  const rowEl = document.createElement('div');
  rowEl.className = 'slice-row';
  const label = document.createElement('span');
  label.className = 'slice-label muted small';
  const startEl = document.createElement('input');
  startEl.type = 'text'; startEl.placeholder = 'Start (MM:SS or seconds)'; startEl.className = 'slice-start';
  const endEl = document.createElement('input');
  endEl.type = 'text'; endEl.placeholder = 'End (MM:SS or seconds)'; endEl.className = 'slice-end';
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button'; removeBtn.className = 'ghost small-btn slice-remove'; removeBtn.textContent = '✕';
  removeBtn.title = 'Remove this slice';
  const row = { rowEl, label, startEl, endEl, removeBtn };
  removeBtn.onclick = () => {
    const idx = sliceRows.indexOf(row);
    if (idx !== -1) { sliceRows.splice(idx, 1); rowEl.remove(); }
    if (sliceRows.length === 0) addSliceRow(); // never zero rows: one blank row = whole video
    renumberSliceRows(); updateSliceAggregate();
  };
  startEl.oninput = updateSliceAggregate;
  endEl.oninput = updateSliceAggregate;
  rowEl.append(label, startEl, endEl, removeBtn);
  return row;
}

function addSliceRow() {
  if (sliceRows.length >= videoRangeUi.MAX_SLICES) return; // the button is disabled too; belt check
  const row = createSliceRow();
  sliceRows.push(row);
  const host = $('#sliceRowsHost');
  if (host) host.appendChild(row.rowEl);
  renumberSliceRows(); updateSliceAggregate();
}

function renumberSliceRows() {
  sliceRows.forEach((r, i) => { r.label.textContent = `Slice ${i + 1}`; });
  const addBtn = $('#addSliceBtn');
  if (addBtn) addBtn.disabled = sliceRows.length >= videoRangeUi.MAX_SLICES;
}

// Reset to exactly ONE blank row with no lingering errors — the modal-open / clear-on-hide state.
function resetSliceRows() {
  const host = $('#sliceRowsHost');
  sliceRows.splice(0).forEach((r) => r.rowEl.remove());
  if (host) addSliceRow();
  clearSliceRowErrors();
}

function clearSliceRowErrors() {
  const errEl = $('#videoRangeError');
  if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
  for (const r of sliceRows) { r.startEl.classList.remove('invalid'); r.endEl.classList.remove('invalid'); }
}

// V4Q Phase B — the per-modal-session model policy. Held OUTSIDE `state` because it is session
// scoped: openModal() replaces it wholesale, which is what guarantees a manual choice never leaks
// into the next modal session. `state.videoModel` remains the single value the launch path reads
// and always holds a CONCRETE allowlisted model — never 'auto', never blank, never a sentinel.
let modelPolicy = videoModelPolicy.initialPolicyState();

// The ONE place the policy is pushed into the DOM and into `state`, so the dropdown, the status
// line, and the value ptyStart will send can never disagree. `refusal` shows an invalid-selection
// message while leaving the previously chosen concrete model intact on the wire.
function syncVideoModelControls(refusal) {
  state.videoModel = modelPolicy.model;
  state.analysisMode = modelPolicy.analysisMode;
  const select = $('#videoModelSelect');
  if (select) select.value = modelPolicy.model;
  const modeSelect = $('#analysisModeSelect');
  if (modeSelect) modeSelect.value = modelPolicy.analysisMode;
  const status = $('#videoModelStatus');
  if (status) {
    status.textContent = refusal || videoModelPolicy.describeModelSelection(modelPolicy);
    status.classList.toggle('over', Boolean(refusal));
  }
}

// Live "N slices · Xs / 1800s" display, driven by the same math the classifier enforces, so the
// user sees the aggregate and the cap BEFORE submitting (display-only; never the validation).
function updateSliceAggregate() {
  const el = $('#sliceAggregate');
  if (!el) return;
  const agg = videoRangeUi.computeSliceAggregate({ rows: collectSliceRowValues() });
  if (agg.populatedCount === 0) { el.textContent = 'whole video (no slices)'; el.classList.remove('over'); return; }
  const label = agg.populatedCount === 1 ? '1 slice' : `${agg.populatedCount} slices`;
  const capNote = agg.populatedCount >= 2 ? ` / ${videoRangeUi.AGGREGATE_SLICE_CAP_SECONDS}s cap` : '';
  el.textContent = `${label} · ${agg.aggregateSeconds}s${capNote}`;
  el.classList.toggle('over', agg.populatedCount >= 2 && agg.overCap);
}

// Show the slice rows only in video mode, and CLEAR them (reset to one blank row) when leaving
// video mode so a value the user can no longer see is never silently dropped into (or applied
// over) a launch — the same clear-on-hide invariant as before, extended to the whole row set.
function updateVideoRangeVisibility() {
  const rangeOpts = $('#videoRangeOpts');
  const isVideo = state.analysisMode === 'video';
  if (rangeOpts) rangeOpts.classList.toggle('hidden', !isVideo);
  if (!isVideo) resetSliceRows();
}

// Lightweight YouTube-host check for the same immediate-feedback purpose as classifySliceRows —
// mirrors YOUTUBE_HOSTS in video-scout-args.js and the YouTube subset of VIDEO_HOSTS in main.js
// (which remain the authority; a bypassed renderer is still refused there). Used only to block a
// range + non-YouTube launch in the UI before a dead pane is ever created.
function isYouTubeUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === 'youtube.com' || h === 'www.youtube.com' || h === 'm.youtube.com' || h === 'youtu.be';
  } catch { return false; }
}

// Reflect what the modal will actually launch.
function updateModalHint() {
  const hint = $('#modalHint');
  if (!hint) return;
  const role = state.chosenRole;
  if (role === 'plain') {
    hint.innerHTML = `Creates a git worktree on <code>agent/&lt;task&gt;</code> and launches <code>${state.chosenCli}</code>.`;
  } else if (ROLES[role].video) {
    hint.innerHTML = `Downloads the video (yt-dlp) and analyzes it with <code>Gemini</code> — visual + spoken. Needs <code>GEMINI_API_KEY</code>.`;
  } else if (ROLES[role].readOnly) {
    hint.innerHTML = `Read-only — launches <code>claude --agent ${role}</code> against the target checkout (no worktree, no edits).`;
  } else if (ROLES[role].needsWorktree) {
    hint.innerHTML = `Creates a git worktree on <code>agent/&lt;task&gt;</code> and launches <code>claude --agent ${role}</code>.`;
  } else {
    hint.innerHTML = `Runs in a fenced output sandbox (can't write to any repo) — launches <code>claude --agent ${role}</code>.`;
  }
}

// Fill the read-only-role target dropdown: the main checkout + every live agent worktree.
function populateTargets() {
  const sel = $('#targetSelect');
  if (!sel) return;
  sel.innerHTML = '';
  const add = (val, text) => { const o = document.createElement('option'); o.value = val; o.textContent = text; sel.appendChild(o); };
  if (state.repo) add(state.repo, state.repo.split(/[\\/]/).pop() + ' (main checkout)');
  for (const wt of state.worktrees) add(wt.path, displayNameOf(wt));
}

function openModal() {
  if (!state.repo) { alert('Pick a repo first (set your projects root with 📁).'); return; }
  $('#taskName').value = '';
  // reset to Builder default
  state.chosenRole = 'builder'; state.hardTask = false;
  $('#hardTask').checked = false;
  document.querySelectorAll('.role-choices .choice').forEach((x) => x.classList.toggle('active', x.dataset.role === 'builder'));
  populateTargets();
  setTaskInputMode(false);
  $('#builderOpts').classList.remove('hidden');
  $('#cliRow').classList.add('hidden');
  $('#targetRow').classList.add('hidden');
  $('#videoScoutOpts').classList.add('hidden');
  // Reset the Gemini options to their defaults every time the modal opens (mirrors hardTask reset
  // above) so a previous run's choice never silently carries over into the next one. analysisMode
  // resets to transcript (cheapest) so the expensive full-video pass is always a fresh opt-in.
  // V4Q Phase B: reset the POLICY SESSION first, then synchronize every control from it. This is
  // the only reset path, so a manual model choice can never survive a close/reopen: the new session
  // starts unpinned, in transcript mode, on the economy model.
  modelPolicy = videoModelPolicy.resetPolicyState();
  state.mediaResolution = 'MEDIUM';
  $('#mediaResolutionSelect').value = state.mediaResolution;
  syncVideoModelControls();
  // Slice rows are read fresh from the DOM at launch (not mirrored into `state`), so resetting
  // them here is what makes a previous run's slices never carry over. Reopening restores exactly
  // ONE blank row with no stale values or errors; updateVideoRangeVisibility (clear-on-hide, mode
  // is 'transcript' here) hides the block and re-resets defensively.
  resetSliceRows();
  updateVideoRangeVisibility();
  // V3a: clear the optional analysis-focus field, its inline error, and reset its counter every time
  // the modal opens, so a previous run's focus (or a prior error) never silently carries over.
  const focusInput = $('#analysisFocusInput');
  if (focusInput) { focusInput.value = ''; focusInput.classList.remove('invalid'); }
  const focusErr = $('#analysisFocusError');
  if (focusErr) { focusErr.textContent = ''; focusErr.classList.add('hidden'); }
  updateAnalysisFocusCounter();
  updateModalHint();
  // Belt-and-suspenders: disable pointer events on the terminal grid so
  // xterm's WebGL compositing layer can't intercept modal clicks, and
  // blur any active terminal so keystrokes reach the name input.
  $('#terminalGrid').style.pointerEvents = 'none';
  for (const t of terms.values()) { try { t.term.blur(); } catch {} }
  $('#modal').classList.remove('hidden');
  $('#taskName').focus();
}
function closeModal() {
  $('#modal').classList.add('hidden');
  $('#terminalGrid').style.pointerEvents = '';
}

// Guard: did new-agent actually create the worktree? If not, surface the real reason
// instead of launching a terminal into a directory that doesn't exist.
function worktreeOk(res, task) {
  if (res && res.ok) return true;
  const why = (res && res.error) || 'unknown error';
  appendLog(`[agent] could not create worktree for "${task}": ${why}\n`);
  alert(`Could not create the worktree for "${task}":\n\n${why}\n\nThat branch or folder may already exist — try a different task name, or Remove the old agent first.`);
  return false;
}

async function createAgent() {
  await cc.tlogReset();
  appendLog('[TIMING] createAgent: START\n');
  const role = state.chosenRole;
  const meta = role !== 'plain' ? ROLES[role] : null;

  // Video-scout: the input is a video URL, not a task. Download + analyze with Gemini.
  if (meta && meta.video) {
    const url = $('#taskName').value.trim();
    if (!/^https?:\/\/\S+$/.test(url)) { alert('Enter a video URL (starting with http:// or https://).'); $('#taskName').focus(); return; }
    const ks = await cc.getGeminiKeyStatus();
    if (!ks || !ks.hasKey) {
      closeModal();
      appendLog('[video-scout] GEMINI_API_KEY not stored — enter it in the key setup banner.\n');
      updateKeyBanner({ hasKey: false });
      $('#geminiKeyInput').focus();
      return;
    }
    // Time slices: only meaningful in video mode (transcript/audio have no video stream to slice —
    // the rows are hidden then too, see updateVideoRangeVisibility). On ANY failure we BLOCK
    // submission with visible inline feedback, mark the offending row(s), and do NOT fall back to
    // whole-video — a user who asked for slices must never be silently downgraded to (and billed
    // for) the whole video. Whole-video is only the explicit all-blank path. This is immediate-
    // feedback UX; main.js (video-scout-args.js) independently refuses on the pty-start IPC handler
    // as the bypass-proof enforcement boundary.
    const rangeErrEl = $('#videoRangeError');
    const showRangeError = (msg, badRows) => {
      if (rangeErrEl) { rangeErrEl.textContent = msg; rangeErrEl.classList.remove('hidden'); }
      const bad = Array.isArray(badRows) && badRows.length ? badRows : sliceRows.map((_, i) => i);
      for (const i of bad) {
        const r = sliceRows[i];
        if (r) { r.startEl.classList.add('invalid'); r.endEl.classList.add('invalid'); }
      }
      appendLog(`[video-scout] launch blocked: ${msg}\n`);
    };
    clearSliceRowErrors();

    // Belt check: clear-on-hide (updateVideoRangeVisibility) guarantees a non-video mode has blank
    // rows, so this is unreachable in normal operation. If it ever fires, some path bypassed
    // clear-on-hide — log it loudly rather than let stale slices slip by unnoticed.
    const stale = videoRangeUi.detectStaleSliceRows({ analysisMode: state.analysisMode, rows: collectSliceRowValues() });
    if (stale) appendLog(`[video-scout] ${stale}\n`);

    let rangeOpts = {};
    let rangeLogSuffix = '';
    if (state.analysisMode === 'video') {
      const cls = videoRangeUi.classifySliceRows({ rows: collectSliceRowValues() });
      if (cls.kind === 'error') {
        showRangeError(cls.message, cls.badRows);
        return; // modal stays open, rows + error visible — do not launch, no pane
      }
      if (cls.kind === 'single' || cls.kind === 'multi') {
        if (!isYouTubeUrl(url)) {
          showRangeError('Time slices only work for YouTube URLs (analyzed directly via the Gemini API). Clear the slices, or use a YouTube URL.');
          return; // modal stays open — do not create a pane that main would refuse anyway
        }
      }
      if (cls.kind === 'single') {
        // One populated row = the existing single-slice scalar path, unchanged end to end.
        rangeOpts = { startOffset: cls.startOffset, endOffset: cls.endOffset };
        rangeLogSuffix = `, range: ${cls.startOffset}s-${cls.endOffset}s`;
      } else if (cls.kind === 'multi') {
        // 2-8 rows = the V4 path: ONE submission, ONE provider request with N ordered parts.
        rangeOpts = { sliceRanges: cls.ranges };
        rangeLogSuffix = `, slices: ${cls.ranges.length} (aggregate ${cls.aggregateSeconds}s)`;
      }
    }
    // V3a pre-analysis focus: immediate-feedback validation (main.js + feed-gemini.ps1 re-validate
    // independently — this block is UX only, never the security boundary). On any failure BLOCK the
    // submission with a visible inline error and keep the modal open. A valid nonblank focus is passed
    // as opts.analysisFocus; a blank one is omitted so the default brief is unchanged. We never log the
    // focus text — only the bounded reason on failure, and a char count in the launch note below.
    const focusEl = $('#analysisFocusInput');
    const focusErrEl = $('#analysisFocusError');
    if (focusErrEl) { focusErrEl.classList.add('hidden'); focusErrEl.textContent = ''; }
    if (focusEl) focusEl.classList.remove('invalid');
    const focusRes = analysisFocus.normalizeAnalysisFocus(focusEl ? focusEl.value : undefined);
    if (!focusRes.ok) {
      const fmsg = analysisFocus.analysisFocusRejectionMessage(focusRes.reason);
      if (focusErrEl) { focusErrEl.textContent = fmsg; focusErrEl.classList.remove('hidden'); }
      if (focusEl) focusEl.classList.add('invalid');
      appendLog(`[video-scout] launch blocked: analysis focus ${focusRes.reason}\n`);
      return; // modal stays open, error visible — do not launch, no pane, no provider request
    }
    const focusOpt = focusRes.provided ? { analysisFocus: focusRes.value } : {};
    const focusLogSuffix = focusRes.provided ? `, focus: ${focusRes.chars} chars` : '';
    closeModal();
    appendLog(`\n[video-scout] downloading + analyzing ${url}… (mode: ${state.analysisMode}, model: ${state.videoModel}, media resolution: ${state.mediaResolution}${rangeLogSuffix}${focusLogSuffix})\n`);
    openInAppTerminal({
      worktree: state.repo || undefined, role, videoScout: true, videoUrl: url,
      videoModel: state.videoModel, mediaResolution: state.mediaResolution, analysisMode: state.analysisMode,
      ...rangeOpts,
      ...focusOpt,
      title: `Video Scout · ${new URL(url).hostname}`,
    });
    return;
  }

  // Read-only roles: no worktree, no task needed — point at the chosen target checkout.
  if (meta && meta.readOnly) {
    const target = $('#targetSelect').value || state.repo;
    closeModal();
    if (role === 'reviewer') { await launchReviewer(target); return; }
    appendLog(`\n[agent] ${role} (read-only) on ${target}…\n`);
    openInAppTerminal({ worktree: target, role, cli: 'claude', title: `${meta.label} · ${target.split(/[\\/]/).pop()}` });
    return;
  }

  const task = $('#taskName').value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  if (!task) { $('#taskName').focus(); return; }
  closeModal();

  // Plain: today's behavior — fresh worktree + a bare CLI.
  if (role === 'plain') {
    appendLog(`\n[agent] worktree agent/${task} (plain ${state.chosenCli})…\n`);
    appendLog('[TIMING] createAgent: newAgent START\n');
    const res = await cc.newAgent({ repo: state.repo, task });
    appendLog('[TIMING] createAgent: newAgent END\n');
    appendLog('[TIMING] createAgent: refreshAgents START\n');
    await refreshAgents();
    appendLog('[TIMING] createAgent: refreshAgents END\n');
    if (!worktreeOk(res, task)) return;
    appendLog('[TIMING] createAgent: openInAppTerminal (plain)\n');
    openInAppTerminal({ worktree: res.worktree, cli: state.chosenCli });
    return;
  }

  if (meta.needsWorktree) {
    // Builder: fresh worktree, launched with the role (Opus override when Hard is checked).
    appendLog(`\n[agent] worktree agent/${task} (${role}${state.hardTask ? ', opus/xhigh' : ''})…\n`);
    appendLog('[TIMING] createAgent: newAgent START\n');
    const res = await cc.newAgent({ repo: state.repo, task });
    appendLog('[TIMING] createAgent: newAgent END\n');
    appendLog('[TIMING] createAgent: refreshAgents START\n');
    await refreshAgents();
    appendLog('[TIMING] createAgent: refreshAgents END\n');
    if (!worktreeOk(res, task)) return;
    const model = state.hardTask ? 'opus' : undefined;
    const effort = state.hardTask ? 'xhigh' : undefined;
    appendLog('[TIMING] createAgent: openInAppTerminal (builder)\n');
    openInAppTerminal({ worktree: res.worktree, role, cli: 'claude', model, effort, title: `${meta.label} · ${task}` });
  } else {
    // Web-Scout / Operator: run in a dedicated fenced sandbox outside any repo. Its
    // PreToolUse write-fence confines writes to this dir — it can't touch a repo.
    // FAIL CLOSED: confirm the fence is actually deployed before launching a write-capable
    // role. If sync-roles.ps1 wasn't run, the fence wouldn't apply and the role would be
    // unconfined — refuse rather than give a false sense of containment.
    appendLog('[TIMING] createAgent: verifyFence START\n');
    const fence = await cc.verifyFence({ role });
    appendLog(`[TIMING] createAgent: verifyFence END ok=${fence && fence.ok}\n`);
    if (!fence || !fence.ok) {
      appendLog(`[agent] BLOCKED ${role}: write-fence not active — ${fence && fence.error}\n`);
      alert(`Refusing to launch "${ROLES[role].label}" — its write-fence isn't active:\n\n${(fence && fence.error) || 'unknown error'}`);
      return;
    }
    appendLog('[TIMING] createAgent: ensureOutputDir START\n');
    const r = await cc.ensureOutputDir({ role });
    appendLog(`[TIMING] createAgent: ensureOutputDir END ok=${r && r.ok}\n`);
    if (!r || !r.ok) { appendLog(`[agent] could not create sandbox: ${r && r.error}\n`); alert('Could not create the output sandbox:\n' + ((r && r.error) || 'unknown error')); return; }
    appendLog(`\n[agent] ${role} in fenced sandbox ${r.dir}…\n`);
    appendLog('[TIMING] createAgent: openInAppTerminal (sandbox)\n');
    openInAppTerminal({ worktree: r.dir, role, cli: 'claude', title: `${meta.label} · ${task}` });
  }
}

boot();
