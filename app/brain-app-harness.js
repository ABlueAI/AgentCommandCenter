// S18 brain tab: APPLICATION harness. Real Electron, real preload, real renderer.
//
// Loads `app/renderer/index.html` through the REAL `preload.js` and drives the REAL `app.js`,
// `shell-nav.js`, `in-focus-card.js` and `brain-stage.js`, the way `shell-nav-app-harness.js` does:
// only main is replaced. `pty-start` succeeds without a process, PTY output and pane-status views
// are sent on the same channels main uses (`pty-data`, `pane-status-view`), and every `pty-write`
// is recorded at the process boundary, so "a card answer reaches the pane" is measured where main
// would receive it.
//
// Output is one JSON document on stdout; `brain-app-integration.test.js` reads it.

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
function progress(line) { process.stderr.write(`[brain-harness] ${line}\n`); }
function run(source) { return withTimeout(win.webContents.executeJavaScript(source, true), STEP_TIMEOUT_MS, 'page step'); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PRELUDE = `(() => {
  window.__t = {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    async waitFor(fn, ms) { const end = Date.now() + (ms || 10000); while (Date.now() < end) { try { if (fn()) return true; } catch {} await new Promise((r) => setTimeout(r, 25)); } return false; },
    shown(sel) { const n = document.querySelector(sel); if (!n) return null; const r = n.getBoundingClientRect(); return getComputedStyle(n).display !== 'none' && r.width > 0 && r.height > 0; },
    nodes() { return Array.from(document.querySelectorAll('#makoStageField .mk-node[data-task]')).map((n) => ({ id: n.getAttribute('data-task'), state: n.getAttribute('data-state'), y: (() => { const r = n.getBoundingClientRect(); return r.top + r.height / 2; })(), cls: n.className })); },
    groups() { return Array.from(document.querySelectorAll('#makoStageField .mk-node[data-group]')).map((n) => ({ key: n.getAttribute('data-group'), text: n.textContent })); },
    log() { const n = document.getElementById('logView'); return n ? n.textContent : ''; },
  };
})();`;

const PERMISSION = [
  '● Bash(npm test)',
  ' Do you want to proceed?',
  ' ❯ 1. Yes',
  '   2. Yes, and don\'t ask again for npm test commands in this project',
  '   3. No, and tell Claude what to do differently (esc)',
  '',
].join('\r\n');
const QUESTION = ['Which store should the history use?', '❯ 1. Adapter', '  2. Port', ''].join('\r\n');

function send(channel, payload) { win.webContents.send(channel, payload); }

async function open(name, settings) {
  progress(`${name}: loading`);
  control.settings = settings;
  control.gate = new Promise((r) => { control.release = r; });
  ipc.ptyStart = []; ipc.ptyWrite = []; ipc.ptyKill = [];
  await withTimeout(win.loadFile(INDEX_FILE), STEP_TIMEOUT_MS, `${name}: loadFile`);
  await run(PRELUDE);
  control.release();
  await run(`window.__t.waitFor(() => document.documentElement.getAttribute('data-mako-layout') === 'tabs' && document.getElementById('makoBrain'))`);
}
async function park() {
  try { await withTimeout(win.loadURL('about:blank'), 10000, 'park'); } catch { /* the scenario's own result stands */ }
}
async function openPanes(n) {
  const before = ipc.ptyStart.length;
  for (let i = 0; i < n; i++) {
    await run(`document.getElementById('makoTab-control').click(); true`);
    await sleep(50);
    await run(`document.getElementById('newTermShell').click(); true`);
    const want = before + i + 1;
    const until = Date.now() + 5000;
    while (ipc.ptyStart.length < want && Date.now() < until) await sleep(25);
  }
  const end = Date.now() + 10000;
  while (ipc.ptyStart.length < before + n && Date.now() < end) await sleep(25);
  return ipc.ptyStart.slice(before);
}

async function scenarioStage() {
  await open('stage', { theme: 'obsidian', projectsRoot: 'D:\\Workspace', uiLayout: 'tabs', uiTab: 'brain' });
  const out = {};
  out.mounted = await run(`!!document.getElementById('makoStage') && !!document.getElementById('makoConvo') && !!document.getElementById('makoBrainRight')`);
  out.emptyText = await run(`document.getElementById('makoStageField').textContent`);
  const ids = await openPanes(3);
  out.paneIds = ids;
  // Pane 1 asks for permission, pane 2 asks a question, pane 3 works.
  send('pty-data', { id: ids[0], data: PERMISSION });
  send('pty-data', { id: ids[1], data: QUESTION });
  send('pty-data', { id: ids[2], data: 'Building the stage\r\n' });
  send('pane-status-view', { paneId: ids[2], state: 'working' });
  await sleep(50);
  send('pane-status-view', { paneId: ids[1], state: 'attention' });
  await sleep(50);
  send('pane-status-view', { paneId: ids[0], state: 'attention' });
  await run(`document.getElementById('makoTab-brain').click(); window.__t.waitFor(() => window.__t.nodes().length === 3 && document.querySelectorAll('#makoConvoCards article').length === 2)`);
  out.nodes = await run(`window.__t.nodes()`);
  out.counts = await run(`document.getElementById('makoStageCounts').textContent`);
  out.cards = await run(`Array.from(document.querySelectorAll('#makoConvoCards article')).map((a) => ({ kind: a.getAttribute('data-kind'), cls: a.className, text: a.textContent.slice(0, 300) }))`);
  out.permissionBorder = await run(`(() => { const a = document.querySelector('#makoConvoCards article[data-kind=permission]'); return a ? getComputedStyle(a).borderTopColor : null; })()`);
  out.needsToken = await run(`getComputedStyle(document.documentElement).getPropertyValue('--mk-status-needs').trim()`);

  // A card answer reaches the pane.
  const w0 = ipc.ptyWrite.length;
  await run(`document.querySelector('#makoConvoCards article[data-kind=permission] [data-action=allowOnce]').click(); true`);
  await sleep(150);
  await run(`document.querySelector('#makoConvoCards article[data-kind=question] [data-answer="opt-2"]').click(); true`);
  await sleep(150);
  out.writes = ipc.ptyWrite.slice(w0);

  // A click on a node opens In focus; Deny there reaches the pane as Esc.
  await run(`document.querySelector('#makoStageField .mk-node[data-task="${ids[0]}"]').click(); true`);
  out.focusState = await run(`(() => { const c = document.querySelector('#makoBrainRight .mk-infocus'); return c ? c.getAttribute('data-state') : null; })()`);
  const w1 = ipc.ptyWrite.length;
  await run(`document.querySelector('#makoBrainRight [data-action=deny]').click(); true`);
  await sleep(150);
  out.denyWrites = ipc.ptyWrite.slice(w1);
  await run(`document.querySelector('#makoBrainRight [data-action=backToRightNow]').click(); true`);
  out.rightNow = await run(`!!document.getElementById('makoRightNow')`);

  // Ctrl+F (a real key event) focuses the find box; typing finds a node by title and by content.
  win.focus();
  win.webContents.focus();
  await run(`document.getElementById('makoStage').focus(); true`);
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F', modifiers: ['control'] });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'F', modifiers: ['control'] });
  await sleep(150);
  out.findFocused = await run(`document.activeElement && document.activeElement.id`);
  out.findByContent = await run(`(() => { const f = document.getElementById('makoStageFind'); f.value = 'history'; f.dispatchEvent(new Event('input')); return { status: document.getElementById('makoStageFindStatus').textContent, focus: (document.querySelector('#makoBrainRight .mk-card-title') || {}).textContent || null }; })()`);
  out.findNone = await run(`(() => { const f = document.getElementById('makoStageFind'); f.value = 'zzzz'; f.dispatchEvent(new Event('input')); return document.getElementById('makoStageFindStatus').textContent; })()`);

  // More than 8 tasks group by repo; a click on the group fans them out.
  await openPanes(6);
  await run(`document.getElementById('makoTab-brain').click(); window.__t.waitFor(() => window.__t.groups().length >= 1)`);
  out.groups = await run(`window.__t.groups()`);
  out.nodesWhenGrouped = await run(`window.__t.nodes().length`);
  await run(`document.querySelector('#makoStageField .mk-node[data-group]').click(); true`);
  out.nodesFanned = await run(`window.__t.nodes().length`);

  // Open pane goes to the control room.
  await run(`document.getElementById('makoStageFind').value=''; document.getElementById('makoStageFind').dispatchEvent(new Event('input')); document.querySelector('#makoConvoCards article [data-action=openPane]').click(); true`);
  out.afterOpenTab = await run(`document.documentElement.getAttribute('data-mako-tab')`);
  out.log = (await run(`window.__t.log()`)).split('\n').filter((l) => l.startsWith('[brain]')).slice(-10);
  await park();
  return out;
}

app.whenReady().then(async () => {
  const ses = session.fromPartition('brain-app-harness', { cache: false });
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
  for (const [name, fn] of [['stage', scenarioStage]]) {
    try { scenarios[name] = await fn(); progress(`${name}: done`); }
    catch (e) { fatal = { scenario: name, error: String((e && e.message) || e) }; progress(`${name}: FAILED ${fatal.error}`); break; }
  }
  clearTimeout(watchdog);
  process.stdout.write(JSON.stringify({ ok: fatal === null, fatal, scenarios, remote, consoleErrors: consoleErrors.slice(0, 50) }) + '\n');
  app.exit(fatal === null ? 0 : 1);
});
