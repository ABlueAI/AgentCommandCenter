// S20 aquarium tab: APPLICATION harness. Real Electron, real preload, real renderer.
//
// Loads `app/renderer/index.html` through the REAL `preload.js` and drives the REAL `app.js`,
// `shell-nav.js`, `aquarium.js` and `aquarium-engine.js`, the way `shell-nav-app-harness.js` does:
// only main is replaced. `pty-start` succeeds without a process, and pane-status views are sent on
// the channel main uses (`pane-status-view`), so a creature's colour is measured from the moment
// main would report a state to the moment the canvas shows it.
//
// Output is one JSON document on stdout; `aquarium-app-integration.test.js` reads it.

const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

const INDEX_FILE = path.join(__dirname, 'renderer', 'index.html');
const PRELOAD_FILE = path.join(__dirname, 'preload.js');
const STEP_TIMEOUT_MS = 30000;

const ipc = { ptyStart: [], ptyWrite: [], ptyKill: [] };
const control = { settings: {}, gate: null, release: () => {} };
const remote = [];
const consoleErrors = [];
let win = null;

function withTimeout(p, ms, label) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`timeout: ${label}`)), ms); })])
    .finally(() => clearTimeout(t));
}
function progress(line) { process.stderr.write(`[aquarium-harness] ${line}\n`); }
function run(source) { return withTimeout(win.webContents.executeJavaScript(source, true), STEP_TIMEOUT_MS, 'page step'); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function send(channel, payload) { win.webContents.send(channel, payload); }

const PRELUDE = `(() => {
  window.__t = {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    async waitFor(fn, ms) { const end = Date.now() + (ms || 10000); while (Date.now() < end) { try { if (fn()) return true; } catch {} await new Promise((r) => setTimeout(r, 25)); } return false; },
    shown(sel) { const n = document.querySelector(sel); if (!n) return null; const r = n.getBoundingClientRect(); return getComputedStyle(n).display !== 'none' && r.width > 0 && r.height > 0; },
    rows() { return Array.from(document.querySelectorAll('#makoCrewList .mk-aq-row')).map((b) => ({ id: b.getAttribute('data-agent-id'), state: b.getAttribute('data-state'), species: b.getAttribute('data-species'), text: b.textContent })); },
    // The colour the canvas shows at a creature's body pixel, as #rrggbb.
    pixel(id) {
      const c = aquarium.creatures().find((x) => x.agentId === id);
      if (!c) return null;
      const d = document.getElementById('makoTank').getContext('2d').getImageData(c.body.x, c.body.y, 1, 1).data;
      return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    },
    // Wait until the canvas shows a creature in a colour; resolves to the milliseconds it took, or -1.
    async colourTime(id, want, ms) {
      const t0 = performance.now();
      const ok = await window.__t.waitFor(() => window.__t.pixel(id) === want, ms || 4000);
      return ok ? Math.round(performance.now() - t0) : -1;
    },
    clickCreature(id) {
      const c = aquarium.creatures().find((x) => x.agentId === id);
      const cv = document.getElementById('makoTank');
      const r = cv.getBoundingClientRect();
      const x = r.left + c.body.x * (r.width / cv.width);
      const y = r.top + c.body.y * (r.height / cv.height);
      cv.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    },
    log() { const n = document.getElementById('logView'); return n ? n.textContent : ''; },
  };
})();`;

async function open(name, settings) {
  progress(`${name}: loading`);
  control.settings = settings;
  control.gate = new Promise((r) => { control.release = r; });
  ipc.ptyStart = []; ipc.ptyWrite = []; ipc.ptyKill = [];
  await withTimeout(win.loadFile(INDEX_FILE), STEP_TIMEOUT_MS, `${name}: loadFile`);
  await run(PRELUDE);
  control.release();
  await run(`window.__t.waitFor(() => document.documentElement.getAttribute('data-mako-layout') === 'tabs' && document.getElementById('makoAquarium'))`);
}
async function park() {
  try { await withTimeout(win.loadURL('about:blank'), 10000, 'park'); } catch { /* the scenario's own result stands */ }
}
async function waitStarts(n) {
  const end = Date.now() + 10000;
  while (ipc.ptyStart.length < n && Date.now() < end) await sleep(25);
}

async function scenarioTank() {
  await open('tank', { theme: 'obsidian', projectsRoot: 'D:\\Workspace', uiLayout: 'tabs', uiTab: 'aquarium' });
  const out = {};
  out.mounted = await run(`!!document.getElementById('makoTank') && !!document.getElementById('makoCrewList')`);
  out.tabSelected = await run(`document.documentElement.getAttribute('data-mako-tab')`);
  out.emptyText = await run(`document.getElementById('makoCrewEmpty').hidden ? null : document.getElementById('makoCrewEmpty').textContent`);
  out.canvasLabelEmpty = await run(`document.getElementById('makoTank').getAttribute('aria-label')`);
  out.startState = await run(`aquarium.state()`);

  // Three panes: a plain shell (a builder), a reviewer and a codebase scout.
  await run(`document.getElementById('makoTab-control').click(); true`);
  await sleep(50);
  await run(`document.getElementById('newTermShell').click(); true`);
  await waitStarts(1);
  await run(`openInAppTerminal({ role: 'reviewer', cli: 'claude', title: 'Reviewer · S20 tank' }); true`);
  await waitStarts(2);
  await run(`openInAppTerminal({ worktree: 'D:\\\\Workspace\\\\AgentCommandCenter', role: 'codebase-scout', cli: 'claude' }); true`);
  await waitStarts(3);
  const ids = ipc.ptyStart.slice(0, 3);
  out.paneIds = ids;
  await run(`document.getElementById('makoTab-aquarium').click(); window.__t.waitFor(() => window.__t.rows().length === 3)`);
  out.rows = await run(`window.__t.rows()`);
  out.creatures = await run(`aquarium.creatures()`);
  out.stored = await run(`${JSON.stringify(ids)}.map((id) => aquarium.creatureFor(id))`);
  out.tokens = await run(`(() => { const s = window.ccUiTokens.SHARED_TOKENS; return { needs: s['status-needs'], working: s['status-working'], ended: s['status-ended'], idle: s['status-idle'] }; })()`);

  // Each state reaches the canvas within about 2 seconds of main reporting it.
  out.timing = {};
  send('pane-status-view', { paneId: ids[0], state: 'working' });
  out.timing.working = await run(`window.__t.colourTime(${JSON.stringify(ids[0])}, ${JSON.stringify(out.tokens.working)})`);
  send('pane-status-view', { paneId: ids[1], state: 'attention' });
  out.timing.needs = await run(`window.__t.colourTime(${JSON.stringify(ids[1])}, ${JSON.stringify(out.tokens.needs)})`);
  out.liveNeeds = await run(`document.getElementById('makoAquariumLive').textContent`);
  send('pane-status-view', { paneId: ids[2], state: 'turn ended' });
  out.timing.ended = await run(`window.__t.colourTime(${JSON.stringify(ids[2])}, ${JSON.stringify(out.tokens.ended)})`);
  out.rowsAfter = await run(`window.__t.rows()`);
  out.live = await run(`document.getElementById('makoAquariumLive').textContent`);
  // The needs-you fish rises: it ends up above the others (higher = more urgent).
  await sleep(1500);
  out.after = await run(`aquarium.creatures().map((c) => ({ id: c.agentId, y: c.box.y, state: c.state }))`);
  out.canvasLabel = await run(`document.getElementById('makoTank').getAttribute('aria-label')`);

  // Hidden means stopped: no frames on another tab, frames again back on the aquarium.
  const f0 = await run(`aquarium.state().loop.frames`);
  await sleep(500);
  out.framesShowing = (await run(`aquarium.state().loop.frames`)) - f0;
  await run(`document.getElementById('makoTab-control').click(); true`);
  await sleep(200);
  const h0 = await run(`aquarium.state().loop.frames`);
  await sleep(600);
  out.framesHidden = (await run(`aquarium.state().loop.frames`)) - h0;
  out.loopWhileHidden = await run(`aquarium.state().loop`);
  // A state change while hidden shows as soon as the tab is back.
  send('pane-status-view', { paneId: ids[0], state: 'idle' });
  await sleep(100);
  await run(`document.getElementById('makoTab-aquarium').click(); true`);
  out.timing.idleAfterShow = await run(`window.__t.colourTime(${JSON.stringify(ids[0])}, ${JSON.stringify(out.tokens.idle)})`);

  // A click on a creature opens its pane in the control room.
  await run(`window.__t.clickCreature(${JSON.stringify(ids[1])}); true`);
  await sleep(100);
  out.afterCreatureClick = await run(`({ tab: document.documentElement.getAttribute('data-mako-tab'), active: activeTermId })`);
  // Enter on a crew row (a real keyboard path) opens its pane too.
  await run(`document.getElementById('makoTab-aquarium').click(); true`);
  await sleep(100);
  await run(`document.querySelector('#makoCrewList .mk-aq-row[data-agent-id=${JSON.stringify(ids[2])}]').click(); true`);
  await sleep(100);
  out.afterRowClick = await run(`({ tab: document.documentElement.getAttribute('data-mako-tab'), active: activeTermId })`);

  // A click on empty water opens nothing.
  await run(`document.getElementById('makoTab-aquarium').click(); true`);
  await sleep(100);
  out.emptyClick = await run(`(() => {
    const cv = document.getElementById('makoTank'); const r = cv.getBoundingClientRect();
    const hit = aquarium.hitTest(1, 1);
    cv.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + 1, clientY: r.top + 1 }));
    return { hit, tab: document.documentElement.getAttribute('data-mako-tab') };
  })()`);

  // Closing a pane removes its creature.
  await run(`terms.get(${JSON.stringify(ids[0])}).closePane(); true`);
  await run(`window.__t.waitFor(() => window.__t.rows().length === 2)`);
  out.rowsAfterClose = await run(`window.__t.rows().map((r) => r.id)`);
  out.storedAfterClose = await run(`aquarium.creatureFor(${JSON.stringify(ids[0])})`);
  out.killed = ipc.ptyKill.slice();
  out.writes = ipc.ptyWrite.slice();
  out.log = (await run(`window.__t.log()`)).split('\n').filter((l) => l.startsWith('[aquarium]')).slice(-10);
  await park();
  return out;
}

// Under reduced motion the fish hold still but keep their colours.
async function scenarioReducedMotion() {
  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  await dbg.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  try {
    await open('reducedMotion', { theme: 'obsidian', projectsRoot: 'D:\\Workspace', uiLayout: 'tabs', uiTab: 'aquarium' });
    const out = {};
    out.matches = await run(`window.matchMedia('(prefers-reduced-motion: reduce)').matches`);
    await run(`document.getElementById('makoTab-control').click(); true`);
    await sleep(50);
    await run(`document.getElementById('newTermShell').click(); true`);
    await waitStarts(1);
    const id = ipc.ptyStart[0];
    send('pane-status-view', { paneId: id, state: 'working' });
    await run(`document.getElementById('makoTab-aquarium').click(); window.__t.waitFor(() => window.__t.rows().length === 1)`);
    const want = await run(`window.ccUiTokens.SHARED_TOKENS['status-working']`);
    out.colourMs = await run(`window.__t.colourTime(${JSON.stringify(id)}, ${JSON.stringify(want)})`);
    const a = await run(`aquarium.creatures()[0].box`);
    await sleep(800);
    const b = await run(`aquarium.creatures()[0].box`);
    out.moved = a.x !== b.x || a.y !== b.y;
    out.framesRunning = await run(`aquarium.state().loop.frames`);
    await park();
    return out;
  } finally {
    try { await dbg.sendCommand('Emulation.setEmulatedMedia', { features: [] }); dbg.detach(); } catch { /* the next scenario loads fresh */ }
  }
}

app.whenReady().then(async () => {
  const ses = session.fromPartition('aquarium-app-harness', { cache: false });
  ses.webRequest.onBeforeRequest((details, callback) => {
    if (!details.url.startsWith('file:') && !details.url.startsWith('devtools:') && !details.url.startsWith('about:')) {
      remote.push(details.url.slice(0, 200));
      callback({ cancel: true });
      return;
    }
    callback({ cancel: false });
  });

  ipcMain.handle('get-settings', async () => { await control.gate; return Object.assign({}, control.settings); });
  ipcMain.handle('save-settings', () => ({ ok: true }));
  ipcMain.handle('list-repos', () => ({ repos: ['D:\\Workspace\\AgentCommandCenter'], selectedRepo: 'D:\\Workspace\\AgentCommandCenter' }));
  ipcMain.handle('list-worktrees', () => []);
  ipcMain.handle('repo-github-url', () => '');
  ipcMain.handle('get-gemini-key-status', () => ({ ok: true, hasKey: true, available: true }));
  ipcMain.handle('get-agent-token-status', () => ({ ok: true, hasToken: true }));
  ipcMain.handle('tlog-reset', () => ({ ok: true }));
  ipcMain.handle('pty-start', (_e, o) => { ipc.ptyStart.push((o && o.id) || 'unknown'); return { ok: true }; });
  ipcMain.on('pty-kill', (_e, id) => { ipc.ptyKill.push(id); });
  ipcMain.on('pty-write', (_e, p) => { ipc.ptyWrite.push({ id: p && p.id, data: p && p.data }); });
  ipcMain.on('pty-resize', () => {});
  ipcMain.handle('library-list', () => ({ ok: true, entries: [], total: 0, invalidCount: 0, invalid: [], capExceeded: false }));
  ipcMain.handle('clipboard-read', () => ({ ok: true, text: '' }));
  ipcMain.handle('clipboard-write', () => ({ ok: true }));
  ipcMain.handle('open-external', () => ({ ok: true }));

  win = new BrowserWindow({
    show: false, width: 1440, height: 900,
    webPreferences: { session: ses, preload: PRELOAD_FILE, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.showInactive();
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 3) consoleErrors.push({ message: String(message).slice(0, 300), line, file: String(sourceId || '').split('/').pop() });
  });

  const scenarios = {};
  let fatal = null;
  const watchdog = setTimeout(() => {
    process.stdout.write(JSON.stringify({ ok: false, fatal: { scenario: 'watchdog', error: 'over budget' }, scenarios }) + '\n');
    app.exit(1);
  }, 3 * 60 * 1000);
  for (const [name, fn] of [['tank', scenarioTank], ['reducedMotion', scenarioReducedMotion]]) {
    try { scenarios[name] = await fn(); progress(`${name}: done`); }
    catch (e) { fatal = { scenario: name, error: String((e && e.message) || e) }; progress(`${name}: FAILED ${fatal.error}`); break; }
  }
  clearTimeout(watchdog);
  process.stdout.write(JSON.stringify({ ok: fatal === null, fatal, scenarios, remote, consoleErrors: consoleErrors.slice(0, 50) }) + '\n');
  app.exit(fatal === null ? 0 : 1);
});
