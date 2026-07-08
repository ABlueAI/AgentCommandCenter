// Command Center — renderer logic. Talks to main only through `window.cc` (preload).
// No Node here by design; this file is pure UI + IPC calls.

const $ = (sel) => document.querySelector(sel);
const state = { repo: '', githubUrl: '', worktrees: [], chosenRole: 'builder', chosenCli: 'claude', hardTask: false, theme: 'obsidian', ttsVoice: '', ttsSpeed: 1, videoModel: 'gemini-2.5-flash-lite', mediaResolution: 'MEDIUM', analysisMode: 'transcript' };

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
let activeTermId = null;  // pane that dictation types into (last focused)
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
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach((x) => x.classList.toggle('active', x.dataset.pane === name));
}
function fitAllTerms() { for (const t of terms.values()) { try { t.fit.fit(); } catch {} } }
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
    ? `<span class="role-badge" data-role="${role}">${ROLES[role].glyph}${ROLES[role].readOnly ? ' 🔒' : ''} ${ROLES[role].label}</span>`
    : `<span class="dot ${cli || 'codex'}"></span>`;
  const pane = document.createElement('div');
  pane.className = 'term-pane';
  pane.innerHTML = `<div class="term-head">${badge}
      <span class="name" title="${worktree || ''}">${label}</span>
      <button class="spk" title="Speak selection (Kokoro TTS)">🔊</button>
      <button class="x" title="Close">✕</button></div>
    <div class="term-body"></div>
    <div class="chat-body"></div>`;
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
  pane.querySelector('.spk').onclick = () => {
    const sel = term.getSelection();
    if (!window.ccTTS) { appendLog('[tts] voice engine not ready yet.\n'); return; }
    if (!sel || !sel.trim()) { appendLog('[tts] select some text in the pane first, then click 🔊.\n'); return; }
    window.ccTTS.speak(sel);
  };
  const chatBody = pane.querySelector('.chat-body');
  const paneData = { term, fit, pane, ro, chatBody, pendingEvents: [], rafId: null, tailBubble: null, parser: null };
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
    ro.disconnect();
    if (paneData.rafId !== null) { cancelAnimationFrame(paneData.rafId); paneData.rafId = null; }
    cc.ptyKill(id); term.dispose(); pane.remove(); terms.delete(id);
    if (terms.size === 0) showTermEmpty();
  };
  pane.addEventListener('mousedown', () => { activeTermId = id; term.focus(); });
  term.textarea && term.textarea.addEventListener('focus', () => { activeTermId = id; });
  terms.set(id, paneData);
  cc.ptyStart({ id, cwd: worktree, cli, role, model: opts.model, effort: opts.effort, initialPrompt: opts.initialPrompt, videoScout: opts.videoScout, videoUrl: opts.videoUrl, videoModel: opts.videoModel, mediaResolution: opts.mediaResolution, analysisMode: opts.analysisMode, cols: term.cols, rows: term.rows });
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
  // TTS/STT modules load after this script; wire their controls when they announce ready.
  if (window.ccTTS) setupTTSControls();
  else window.addEventListener('cc-tts-ready', setupTTSControls, { once: true });
  if (window.ccSTT) setupSTTControls();
  else window.addEventListener('cc-stt-ready', setupSTTControls, { once: true });
}

// Wire the Whisper dictation control: push-to-talk that types the transcript into
// the focused agent pane (we own the PTY write channel, so no OS dictation needed).
function setupSTTControls() {
  const stt = window.ccSTT; if (!stt) return;
  const micBtn = $('#sttMic');
  if (micBtn && !micBtn.dataset.wired) {
    micBtn.dataset.wired = '1';
    micBtn.onclick = () => {
      if (!activeTermId || !terms.has(activeTermId)) { appendLog('[stt] click into an agent pane first, then 🎤.\n'); return; }
      stt.toggle();
    };
  }
  stt.onStatus(({ state: st, detail }) => {
    const el = $('#sttStatus'); if (el) el.textContent = (st && st !== 'idle') ? (st + (detail ? ' — ' + detail : '')) : '';
    if (micBtn) { micBtn.textContent = st === 'recording' ? '⏺ Stop' : '🎤 Dictate'; micBtn.classList.toggle('rec', st === 'recording'); }
    if (st === 'error' && detail) appendLog('[stt] ' + detail + '\n');
  });
  stt.onResult((text) => {
    if (activeTermId && terms.has(activeTermId)) { cc.ptyWrite(activeTermId, text + ' '); appendLog('[stt] » ' + text + '\n'); }
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
    if (stopBtn) stopBtn.classList.toggle('hidden', st !== 'speaking' && st !== 'loading');
    if (st === 'error' && detail) appendLog('[tts] ' + detail + '\n');
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

// task slug derived from "<repo>-<task>" worktree folder name
function taskOf(wt) {
  const base = wt.path.split(/[\\/]/).pop();
  const repoName = state.repo.split(/[\\/]/).pop();
  return base.startsWith(repoName + '-') ? base.slice(repoName.length + 1) : (wt.branch || base);
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
    const row = document.createElement('div');
    row.className = 'agent-row';
    row.innerHTML = `<span class="dot ${agentColorOf(wt)}"></span>
      <span class="name" title="${wt.path}">${wt.branch || taskOf(wt)}</span>
      <button class="x" title="Remove worktree">✕</button>`;
    row.querySelector('.x').onclick = () => removeAgent(taskOf(wt));
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
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="title"><span class="dot ${agentColorOf(wt)}"></span>${wt.branch || task}</div>
      <div class="meta">${wt.path}</div>
      <div class="row">
        <button class="ghost" data-act="claude">Claude</button>
        <button class="ghost" data-act="codex">Codex</button>
        <button class="ghost" data-act="gemini">Gemini</button>
      </div>
      <div class="row">
        <button class="ghost" data-act="review" title="Read-only Opus review of this branch">🔎 Review</button>
        <button class="ghost" data-act="scout" title="Read-only codebase exploration">🧭 Scout</button>
      </div>
      <div class="row">
        <button class="action" data-act="code">VSCode</button>
        <button class="action" data-act="term">Terminal</button>
        <button class="ghost" data-act="rm">Remove</button>
      </div>`;
    card.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = () => {
        const act = b.dataset.act;
        if (['claude', 'codex', 'gemini'].includes(act)) openInAppTerminal({ worktree: wt.path, cli: act });
        // read-only roles operate on the existing checkout — no new worktree
        else if (act === 'review') launchReviewer(wt.path);
        else if (act === 'scout') openInAppTerminal({ worktree: wt.path, role: 'codebase-scout', cli: 'claude' });
        else if (act === 'code') cc.openVscode(wt.path);
        else if (act === 'term') cc.openTerminal(wt.path);
        else if (act === 'rm') removeAgent(task);
      };
    });
    grid.appendChild(card);
  }
}

async function removeAgent(task) {
  await cc.removeAgent({ repo: state.repo, task });
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
  $('#analysisModeSelect').onchange = (e) => { state.analysisMode = e.target.value; };
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
  for (const wt of state.worktrees) add(wt.path, wt.branch || taskOf(wt));
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
    closeModal();
    appendLog(`\n[video-scout] downloading + analyzing ${url}… (mode: ${state.analysisMode}, model: ${state.videoModel}, media resolution: ${state.mediaResolution})\n`);
    openInAppTerminal({
      worktree: state.repo || undefined, role, videoScout: true, videoUrl: url,
      videoModel: state.videoModel, mediaResolution: state.mediaResolution, analysisMode: state.analysisMode,
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
