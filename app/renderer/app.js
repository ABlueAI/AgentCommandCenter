// Command Center — renderer logic. Talks to main only through `window.cc` (preload).
// No Node here by design; this file is pure UI + IPC calls.

const $ = (sel) => document.querySelector(sel);
const ACCEPTANCE_BUILD = 'V1A ACCEPTANCE 2026-07-17.7';
const state = { repo: '', githubUrl: '', worktrees: [], chosenRole: 'builder', chosenCli: 'claude', hardTask: false, theme: 'obsidian', ttsVoice: '', ttsSpeed: 1, videoModel: 'gemini-2.5-flash-lite', mediaResolution: 'MEDIUM', analysisMode: 'transcript' };
const audioModules = window.ccAudioModuleHealth.createAudioModuleHealth();

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
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach((x) => x.classList.toggle('active', x.dataset.pane === name));
}
function fitAllTerms() { for (const t of terms.values()) { try { t.fit.fit(); } catch {} } }

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
// Escape restores the grid while a pane is maximized, and is CONSUMED (capture phase,
// before xterm sees it) so the same press doesn't also reach the PTY; press again for
// a normal terminal ESC. With nothing maximized the key flows to the terminal untouched.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && paneMaximizer.handleEscape()) { e.preventDefault(); e.stopPropagation(); }
}, true);
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
  const pane = agentDom.buildTermPane(document, { badge, label, worktreeTitle: worktree || '' });
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
  const readClip = () => { try { return (cc.clipboardRead && cc.clipboardRead()) || ''; } catch { return ''; } };
  const writeClip = (s) => {
    try {
      if (s && cc.clipboardWrite) {
        cc.clipboardWrite(s);
        appendLog(`[copy ${id}] ${s.length} chars written to clipboard\n`);
      }
    } catch (err) {
      appendLog(`[copy ${id}] clipboardWrite FAILED: ${(err && err.message) || err}\n`);
    }
  };
  const pasteIntoPty = () => {
    const t = readClip();
    if (t) cc.ptyWrite(id, t);
    else appendLog('[clipboard] nothing to paste (clipboard empty, or restart the app to load clipboard support).\n');
  };
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown' || !e.ctrlKey) return true;
    const isV = e.code === 'KeyV' || (e.key && e.key.toLowerCase() === 'v');
    const isC = e.code === 'KeyC' || (e.key && e.key.toLowerCase() === 'c');
    if (isV) { pasteIntoPty(); return false; }              // Ctrl+V / Ctrl+Shift+V
    if (isC) {
      const sel = term.getSelection();
      appendLog(`[copy ${id}] Ctrl+${e.shiftKey ? 'Shift+' : ''}C: ${sel ? sel.length + ' chars selected' : 'no selection → SIGINT'}\n`);
      if (sel) { writeClip(sel); term.clearSelection(); return false; } // copy
      if (e.shiftKey) return false;                          // Ctrl+Shift+C, nothing selected: swallow
      return true;                                           // plain Ctrl+C, nothing selected: SIGINT
    }
    return true;
  });
  appendLog(`[copy ${id}] key handler registered\n`);
  pane.querySelector('.term-body').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const s = term.getSelection();
    if (s) { writeClip(s); term.clearSelection(); }
    else pasteIntoPty();
  });
  // OSC 52: when a program in the PTY asks the terminal to set the clipboard (Claude Code's
  // "(Copied!)", etc.), actually write it to the Windows clipboard. Payload is "<sel>;<base64>".
  if (term.parser && term.parser.registerOscHandler) {
    term.parser.registerOscHandler(52, (data) => {
      const i = (data || '').indexOf(';');
      if (i >= 0) {
        const b64 = data.slice(i + 1);
        if (b64 && b64 !== '?') {
          try { writeClip(decodeURIComponent(escape(atob(b64)))); }
          catch { try { writeClip(atob(b64)); } catch (err) { appendLog(`[osc52 ${id}] base64 decode failed: ${(err && err.message) || err}\n`); } }
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
      reconstruct: () => window.ccTermCopy.reconstructBufferText(term.buffer.active, window.ccTermCopy.COPY_OUTPUT_BOUND),
    });
    selectionAtCopyPointerDown = '';
    if (!result.ok) {
      // e.g. an empty pane — refuse visibly (⚠ flash + Logs), never a silent no-op.
      appendLog(window.ccTermCopy.buildCopyLogLine({ paneId: id, role, source: result.source, failed: true, reason: result.reason }));
      flashCopyBtn(false);
      return;
    }
    let wrote = false;
    let failReason = 'clipboard bridge unavailable (restart the app to load clipboard support)';
    try {
      if (cc.clipboardWrite) { cc.clipboardWrite(result.text); wrote = true; }
    } catch (err) { failReason = (err && err.message) || String(err); }
    if (!wrote) {
      appendLog(window.ccTermCopy.buildCopyLogLine({ paneId: id, role, source: result.source, failed: true, reason: `clipboardWrite: ${failReason}` }));
      flashCopyBtn(false);
      alert(`Copy Output failed — nothing was copied.\n\n${failReason}`);
      return;
    }
    // Logs carry metadata only, by construction: buildCopyLogLine never receives the text.
    appendLog(window.ccTermCopy.buildCopyLogLine({ paneId: id, role, source: result.source, copiedChars: result.copiedChars, totalChars: result.totalChars, truncated: result.truncated }));
    flashCopyBtn(true);
    if (result.truncated) alert(window.ccTermCopy.buildTruncationNotice(result));
  };
  pane.querySelector('.max').onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    paneMaximizer.toggle(id, pane);
  };
  const chatBody = pane.querySelector('.chat-body');
  const paneData = { term, fit, pane, ro, chatBody, role, pendingEvents: [], rafId: null, tailBubble: null, parser: null };
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
  pane.querySelector('.x').onclick = () => {
    // Closing the maximized pane restores the grid cleanly (V1a) — clear the maximize
    // state FIRST so the surviving panes un-hide and refit.
    paneMaximizer.handlePaneClosed(id);
    ro.disconnect();
    try { selectionDisposable.dispose(); } catch {}
    try { mouseSelectionFallback.dispose(); } catch {}
    if (copyFlashTimer) { clearTimeout(copyFlashTimer); copyFlashTimer = null; }
    if (paneData.rafId !== null) { cancelAnimationFrame(paneData.rafId); paneData.rafId = null; }
    cc.ptyKill(id); term.dispose(); pane.remove(); terms.delete(id);
    if (terms.size === 0) showTermEmpty();
  };
  pane.addEventListener('mousedown', (event) => {
    if (event.target.closest('.spk, .copy-out, .max')) return;
    activeTermId = id; term.focus();
  });
  term.textarea && term.textarea.addEventListener('focus', () => { activeTermId = id; });
  terms.set(id, paneData);
  cc.ptyStart({ id, cwd: worktree, cli, role, model: opts.model, effort: opts.effort, initialPrompt: opts.initialPrompt, videoScout: opts.videoScout, videoUrl: opts.videoUrl, videoModel: opts.videoModel, mediaResolution: opts.mediaResolution, analysisMode: opts.analysisMode, startOffset: opts.startOffset, endOffset: opts.endOffset, cols: term.cols, rows: term.rows });
  setTimeout(() => { fit.fit(); cc.ptyResize(id, term.cols, term.rows); activeTermId = id; term.focus(); }, 40);
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
  window.addEventListener('resize', fitAllTerms);
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
      switchTab(t.dataset.tab);
      if (t.dataset.tab === 'terminals') setTimeout(fitAllTerms, 0);
    };
  });
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
  $('#videoModelSelect').onchange = (e) => { state.videoModel = e.target.value; };
  $('#mediaResolutionSelect').onchange = (e) => { state.mediaResolution = e.target.value; };
  $('#analysisModeSelect').onchange = (e) => { state.analysisMode = e.target.value; updateVideoRangeVisibility(); };
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

// Show the time-range inputs only in video mode, and CLEAR them when leaving video mode so a value
// the user can no longer see is never silently dropped into (or applied over) a launch. Logic +
// tests live in video-range-ui.js (clear-on-hide invariant).
function updateVideoRangeVisibility() {
  videoRangeUi.syncVideoRangeVisibility({
    analysisMode: state.analysisMode,
    rangeOpts: $('#videoRangeOpts'),
    startInput: $('#videoStartInput'),
    endInput: $('#videoEndInput'),
  });
}

// Accepts MM:SS, H:MM:SS, or bare whole seconds. Returns:
//   null  — input was empty (field simply not provided)
//   NaN   — input had content but didn't match any accepted format
//   number — parsed whole seconds
function parseTimeToSeconds(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  let m = /^(\d+):([0-5]?\d)$/.exec(s);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  m = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(s);
  if (m) return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
  return NaN;
}

// Lightweight YouTube-host check for the same immediate-feedback purpose as resolveVideoRange —
// mirrors YOUTUBE_HOSTS in video-scout-args.js and the YouTube subset of VIDEO_HOSTS in main.js
// (which remain the authority; a bypassed renderer is still refused there). Used only to block a
// range + non-YouTube launch in the UI before a dead pane is ever created.
function isYouTubeUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === 'youtube.com' || h === 'www.youtube.com' || h === 'm.youtube.com' || h === 'youtu.be';
  } catch { return false; }
}

// Client-side mirror of the validation video-scout-args.js re-does server-side (untrusted-input
// posture: this check is for immediate user feedback, not the security boundary). Returns:
//   {}                              — both fields blank: whole video, nothing to report
//   { error: string }               — invalid: caller should BLOCK submission and show the reason
//   { startOffset, endOffset }      — both valid, ready to send
function resolveVideoRange(startRaw, endRaw) {
  const start = parseTimeToSeconds(startRaw);
  const end = parseTimeToSeconds(endRaw);
  const startGiven = start !== null;
  const endGiven = end !== null;
  if (!startGiven && !endGiven) return {};
  if (startGiven !== endGiven) {
    return { error: 'both start and end are required to analyze a range (only one was given)' };
  }
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return { error: 'could not parse the time range (use MM:SS, H:MM:SS, or whole seconds)' };
  }
  if (start < 0 || end < 0 || start > 86400 || end > 86400) {
    return { error: 'time range must be between 0 and 86400 seconds (24h)' };
  }
  if (end <= start) {
    return { error: `end (${end}s) must be after start (${start}s)` };
  }
  return { startOffset: start, endOffset: end };
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
  state.videoModel = 'gemini-2.5-flash-lite'; state.mediaResolution = 'MEDIUM'; state.analysisMode = 'transcript';
  $('#videoModelSelect').value = state.videoModel;
  $('#mediaResolutionSelect').value = state.mediaResolution;
  $('#analysisModeSelect').value = state.analysisMode;
  // Time-range fields are read fresh from the DOM at launch (not mirrored into `state`), so
  // clearing them here is what makes a previous run's range never carry over. Also reset the inline
  // range-error UI (text + red borders) so a prior session's error never lingers over the cleared
  // fields. updateVideoRangeVisibility (clear-on-hide, mode is 'transcript' here) empties the values.
  videoRangeUi.resetVideoRangeError({
    errorEl: $('#videoRangeError'), startInput: $('#videoStartInput'), endInput: $('#videoEndInput'),
  });
  $('#videoStartInput').value = '';
  $('#videoEndInput').value = '';
  updateVideoRangeVisibility();
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
    // Time range: only meaningful in video mode (transcript/audio have no video stream to slice —
    // the inputs are hidden then too, see updateVideoRangeVisibility). On ANY failure we BLOCK
    // submission with visible inline feedback and do NOT fall back to whole-video — a user who
    // asked for a slice must never be silently downgraded to (and billed for) the whole video.
    // Whole-video is only the explicit both-blank path. This is immediate-feedback UX; main.js
    // (video-scout-args.js) independently refuses on the pty-start IPC handler as the bypass-proof
    // enforcement boundary.
    const rangeErrEl = $('#videoRangeError');
    const startEl = $('#videoStartInput');
    const endEl = $('#videoEndInput');
    const showRangeError = (msg) => {
      if (rangeErrEl) { rangeErrEl.textContent = msg; rangeErrEl.classList.remove('hidden'); }
      startEl.classList.add('invalid'); endEl.classList.add('invalid');
      appendLog(`[video-scout] launch blocked: ${msg}\n`);
    };
    if (rangeErrEl) { rangeErrEl.classList.add('hidden'); rangeErrEl.textContent = ''; }
    startEl.classList.remove('invalid'); endEl.classList.remove('invalid');

    // Belt check: clear-on-hide (updateVideoRangeVisibility) guarantees a non-video mode has empty
    // range inputs, so this is unreachable in normal operation. If it ever fires, some path bypassed
    // clear-on-hide — log it loudly rather than let a stale range slip by unnoticed.
    const stale = videoRangeUi.detectStaleRange({ analysisMode: state.analysisMode, startValue: startEl.value, endValue: endEl.value });
    if (stale) appendLog(`[video-scout] ${stale}\n`);

    let rangeOpts = {};
    let rangeLogSuffix = '';
    if (state.analysisMode === 'video') {
      const range = resolveVideoRange(startEl.value, endEl.value);
      if (range.error) {
        showRangeError(range.error);
        return; // modal stays open, fields + error visible — do not launch
      }
      if (range.startOffset !== undefined) {
        if (!isYouTubeUrl(url)) {
          showRangeError('A time range only works for YouTube URLs. Clear the range, or use a YouTube URL.');
          return; // modal stays open — do not create a pane that main would refuse anyway
        }
        rangeOpts = { startOffset: range.startOffset, endOffset: range.endOffset };
        rangeLogSuffix = `, range: ${range.startOffset}s-${range.endOffset}s`;
      }
    }
    closeModal();
    appendLog(`\n[video-scout] downloading + analyzing ${url}… (mode: ${state.analysisMode}, model: ${state.videoModel}, media resolution: ${state.mediaResolution}${rangeLogSuffix})\n`);
    openInAppTerminal({
      worktree: state.repo || undefined, role, videoScout: true, videoUrl: url,
      videoModel: state.videoModel, mediaResolution: state.mediaResolution, analysisMode: state.analysisMode,
      ...rangeOpts,
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
