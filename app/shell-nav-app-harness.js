// S66 shared navigation: APPLICATION harness. Real Electron, real preload, real renderer.
//
// Loads `app/renderer/index.html` through the REAL `preload.js` and drives the REAL `app.js` and
// `shell-nav.js`, the way `dockview-app-harness.js` does: only main is replaced, with stubs for the
// IPC channels the renderer calls, and `save-settings` and `pty-start` are counted at the process
// boundary. Each scenario is a fresh document (the window is parked on about:blank between them).
//
// Output is one JSON document on stdout; `shell-nav-app-integration.test.js` reads it.

const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

const INDEX_FILE = path.join(__dirname, 'renderer', 'index.html');
const PRELOAD_FILE = path.join(__dirname, 'preload.js');
const STEP_TIMEOUT_MS = 30000;

const ipc = { saves: [], ptyStart: 0, ptyIds: [], writes: [], kills: [], dismissed: [] };
const control = { settings: {}, gate: null, release: () => {}, repos: [], saveFail: false, worktrees: [], ptyOk: false, resumeRows: null };
const remote = [];
const consoleErrors = [];
let win = null;

function withTimeout(p, ms, label) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`timeout: ${label}`)), ms); })])
    .finally(() => clearTimeout(t));
}
function progress(line) { process.stderr.write(`[shell-harness] ${line}\n`); }
function run(source) { return withTimeout(win.webContents.executeJavaScript(source, true), STEP_TIMEOUT_MS, 'page step'); }

// Page-side helpers, installed before boot continues past `await cc.getSettings()`.
const PRELUDE = `(() => {
  window.__t = {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    async waitFor(fn, ms) { const end = Date.now() + (ms || 10000); while (Date.now() < end) { try { if (fn()) return true; } catch {} await new Promise((r) => setTimeout(r, 25)); } return false; },
    shown(sel) { const n = document.querySelector(sel); if (!n) return null; const r = n.getBoundingClientRect(); return getComputedStyle(n).display !== 'none' && r.width > 0 && r.height > 0; },
    key(key, opts) { const t = document.activeElement || document.body; const e = new KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, opts || {})); t.dispatchEvent(e); return e.defaultPrevented; },
    root() { const r = document.documentElement; return { layout: r.getAttribute('data-mako-layout'), tab: r.getAttribute('data-mako-tab'), view: r.getAttribute('data-mako-view'), surface: r.style.getPropertyValue('--mk-surface').trim() }; },
    selectedTab() { const b = document.querySelector('[role=tab][aria-selected=true]'); return b ? b.getAttribute('data-mako-tab') : null; },
    log() { const n = document.getElementById('logView'); return n ? n.textContent : ''; },
  };
})();`;

async function open(name, settings, beforeBoot, repos) {
  progress(`${name}: loading`);
  control.settings = settings;
  control.repos = repos || [];
  control.worktrees = control.repos.length ? [{ path: 'D:\\Workspace\\AgentCommandCenter-search-bar', branch: 'agent/search-bar' }] : [];
  control.gate = new Promise((r) => { control.release = r; });
  ipc.saves = []; ipc.ptyStart = 0; ipc.ptyIds = []; ipc.writes = []; ipc.kills = []; ipc.dismissed = [];
  await withTimeout(win.loadFile(INDEX_FILE), STEP_TIMEOUT_MS, `${name}: loadFile`);
  await run(PRELUDE);
  if (beforeBoot) await run(beforeBoot);
  control.release();
}
async function park() {
  try { await withTimeout(win.loadURL('about:blank'), 10000, 'park'); } catch { /* the scenario's own result stands */ }
}

async function scenarioFirstRun() {
  await open('firstRun', { theme: 'obsidian', projectsRoot: 'D:\\Workspace' });
  const booted = await run(`window.__t.waitFor(() => document.documentElement.getAttribute('data-mako-layout') === 'tabs')`);
  const r = await run(`(async () => {
    const t = window.__t;
    const out = { booted: true };
    out.initial = t.root();
    out.initialSelected = t.selectedTab();
    out.headerShown = t.shown('#makoShell');
    out.controlShown = t.shown('#makoPanel-control');
    out.topbarShown = t.shown('.topbar');
    out.brainShown = t.shown('#makoPanel-brain');
    out.tabCount = document.querySelectorAll('#makoShell [role=tab]').length;
    out.tablistLabel = document.querySelector('[role=tablist]').getAttribute('aria-label');
    out.tabIndexes = Array.from(document.querySelectorAll('[role=tab]')).map((b) => b.getAttribute('tabindex'));
    await t.waitFor(() => document.getElementById('makoScopeStripe').textContent.startsWith('No repo selected'));
    out.stripeNoRepo = document.getElementById('makoScopeStripe').textContent;

    // Click the brain tab.
    document.getElementById('makoTab-brain').click();
    out.afterClick = t.root();
    out.afterClickSelected = t.selectedTab();
    out.afterClickBrainShown = t.shown('#makoPanel-brain');
    out.afterClickControlShown = t.shown('#makoPanel-control');
    out.afterClickTopbarShown = t.shown('.topbar');

    // Keyboard: Right, End, Home from the focused tab.
    document.getElementById('makoTab-brain').focus();
    // Ctrl Space presses the Dictate control (here it refuses visibly: no pane, or no engine).
    out.micWired = await t.waitFor(() => typeof document.getElementById('sttMic').onclick === 'function');
    const logBefore = t.log().length;
    out.pttPrevented = t.key(' ', { ctrlKey: true, code: 'Space' });
    out.pttNotice = t.shown('#makoNotice') ? document.getElementById('makoNotice').textContent : null;
    document.activeElement.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
    out.pttNoticeAfterRelease = t.shown('#makoNotice') ? document.getElementById('makoNotice').textContent : null;
    out.pttLogged = ['[stt] dictation engine unavailable', '[stt] click into an agent pane first'].some((x) => t.log().slice(logBefore).includes(x));
    document.getElementById('makoTab-brain').focus();
    out.rightPrevented = t.key('ArrowRight');
    out.afterRight = t.selectedTab();
    out.focusAfterRight = document.activeElement && document.activeElement.id;
    t.key('End');
    out.afterEnd = t.selectedTab();
    out.afterEndRoot = t.root();
    out.aquariumShown = t.shown('#makoPanel-aquarium');
    t.key('Home');
    out.afterHome = t.selectedTab();
    t.key('ArrowLeft');
    out.afterLeftWrap = t.selectedTab();
    // The two shipped fonts load from the app itself, and the tab layout uses Inter.
    try {
      const loaded = await Promise.all([document.fonts.load('14px "Mako Inter"'), document.fonts.load('14px "Mako Cascadia Code"')]);
      out.fontsLoaded = loaded.map((l) => l.length);
    } catch (e) { out.fontsLoaded = 'error'; }
    out.bodyFont = getComputedStyle(document.body).fontFamily;
    // The shared In-focus card renders with the tab's tokens: a permission card is always red.
    const card = window.ccInFocusCard.buildInFocusCard(document, { state: 'permission', title: 'Allow git push?' }, {});
    document.getElementById('makoPanel-aquarium').appendChild(card);
    const toRgb = (hex) => 'rgb(' + [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ') + ')';
    out.permissionBorder = getComputedStyle(card).borderTopColor === toRgb('#f2606b');
    out.permissionAllowDisabled = card.querySelector('[data-action=allowOnce]').disabled;
    await t.sleep(50);
    return out;
  })()`);
  // Focus rings: synthetic key events don't set :focus-visible, so a REAL key goes in from main.
  await run(`(() => { document.getElementById('makoTab-control').click(); document.getElementById('makoTab-control').focus(); return true; })()`);
  win.webContents.focus();
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' });
  r.focusRing = await run(`(async () => {
    await window.__t.waitFor(() => document.activeElement && document.activeElement.id === 'makoTab-aquarium', 3000);
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return { id: el.id, style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor };
  })()`);
  r.booted = booted;
  r.saves = ipc.saves.slice();
  r.ptyStart = ipc.ptyStart;
  await park();
  return r;
}

async function scenarioPalette() {
  await open('palette', { theme: 'obsidian', projectsRoot: 'D:\\Workspace', uiLayout: 'tabs', uiTab: 'brain' }, null, ['D:\\Workspace\\AgentCommandCenter', 'D:\\Workspace\\<img src=x onerror=window.__pwned=1>']);
  await run(`window.__t.waitFor(() => document.documentElement.getAttribute('data-mako-layout') === 'tabs')`);
  const r = await run(`(async () => {
    const t = window.__t;
    const out = {};
    out.rememberedTab = t.selectedTab();
    const before = document.getElementById('makoTab-brain');
    before.focus();
    out.ctrlKPrevented = t.key('k', { ctrlKey: true });
    out.paletteShown = t.shown('#makoPalette');
    out.focusInInput = document.activeElement && document.activeElement.id;
    const input = document.getElementById('makoPaletteInput');
    out.inputRole = input.getAttribute('role');
    out.dialogModal = document.getElementById('makoPalette').getAttribute('aria-modal');
    out.allOptions = Array.from(document.querySelectorAll('#makoPaletteList [role=option]')).map((o) => o.textContent);
    out.activeDescendant = input.getAttribute('aria-activedescendant');
    // Esc closes and gives focus back.
    out.escPrevented = t.key('Escape');
    out.paletteShownAfterEsc = t.shown('#makoPalette');
    out.focusAfterEsc = document.activeElement && document.activeElement.id;
    // Ctrl Shift K is not ours.
    out.ctrlShiftKPrevented = t.key('K', { ctrlKey: true, shiftKey: true });
    out.paletteAfterCtrlShiftK = t.shown('#makoPalette');
    // Open, filter, move, run.
    t.key('k', { ctrlKey: true });
    input.value = 'aqua';
    input.dispatchEvent(new Event('input'));
    out.filtered = Array.from(document.querySelectorAll('#makoPaletteList [role=option]')).map((o) => o.querySelector('.mk-palette-label').textContent);
    t.key('Enter');
    out.afterEnterTab = t.selectedTab();
    out.afterEnterPalette = t.shown('#makoPalette');
    // No match shows a visible line, not an empty box.
    t.key('k', { ctrlKey: true });
    input.value = 'zzzz-nothing';
    input.dispatchEvent(new Event('input'));
    out.noMatchShown = t.shown('.mk-palette-empty');
    // Arrow keys move the active option.
    input.value = 'go to';
    input.dispatchEvent(new Event('input'));
    t.key('ArrowDown');
    out.activeAfterDown = input.getAttribute('aria-activedescendant');
    t.key('ArrowUp'); t.key('ArrowUp');
    out.activeAfterUpWrap = input.getAttribute('aria-activedescendant');
    out.tabTrapped = t.key('Tab');
    t.key('Escape');
    // A palette command reaches today's views: "Open Logs" lands on the control room's Logs tab.
    // boot() wires the old tab buttons after the shell starts, so wait for that first.
    out.tabsWired = await t.waitFor(() => typeof document.querySelector('.tab[data-tab=logs]').onclick === 'function');
    t.key('k', { ctrlKey: true });
    input.value = 'open logs';
    input.dispatchEvent(new Event('input'));
    t.key('Enter');
    out.afterLogsTab = t.selectedTab();
    out.logsPaneActive = document.querySelector('.tabpane[data-pane=logs]').classList.contains('active');
    // The scope stripe names the repo in use, and a palette repo command switches it.
    await t.waitFor(() => document.getElementById('makoScopeStripe').textContent.startsWith('AgentCommandCenter · '));
    out.stripeRepo = document.getElementById('makoScopeStripe').textContent;
    t.key('k', { ctrlKey: true });
    input.value = 'repo: <img';
    input.dispatchEvent(new Event('input'));
    out.repoOption = Array.from(document.querySelectorAll('#makoPaletteList .mk-palette-label')).map((n) => n.textContent);
    out.repoOptionNoMarkup = document.querySelectorAll('#makoPaletteList img').length === 0;
    t.key('Enter');
    out.stripeAfterRepo = document.getElementById('makoScopeStripe').textContent;
    out.stripeNoMarkup = document.querySelectorAll('#makoScopeStripe img').length === 0 && window.__pwned === undefined;
    // The emblem rail: one emblem per repo, the one in use current, a click switches repo.
    out.railShown = t.shown('#makoRail');
    const emblems = () => Array.from(document.querySelectorAll('#makoRail .mk-emblem'));
    out.emblemLetters = emblems().map((b) => b.textContent);
    out.emblemCurrent = emblems().map((b) => b.getAttribute('aria-current'));
    emblems()[0].click();
    await t.waitFor(() => document.getElementById('makoScopeStripe').textContent.startsWith('AgentCommandCenter · '));
    out.stripeAfterEmblem = document.getElementById('makoScopeStripe').textContent;
    out.emblemCurrentAfter = emblems().map((b) => b.getAttribute('aria-current'));
    out.railNoMarkup = document.querySelectorAll('#makoRail img').length === 0;
    // Agents are palette commands too.
    await t.waitFor(() => document.querySelectorAll('#agentGrid button').length > 0);
    t.key('k', { ctrlKey: true });
    input.value = 'agent:';
    input.dispatchEvent(new Event('input'));
    out.agentOptions = Array.from(document.querySelectorAll('#makoPaletteList .mk-palette-label')).map((n) => n.textContent);
    t.key('Enter');
    out.agentsViewActive = document.querySelector('.tabpane[data-pane=agents]').classList.contains('active');
    out.agentCardFocused = !!(document.activeElement && document.activeElement.closest('#agentGrid'));
    // The sidebar frame on the brain tab, with "Everything else".
    document.getElementById('makoTab-brain').click();
    out.sidebarInBrain = t.shown('#makoPanel-brain #makoSidebar');
    out.sidebarItems = Array.from(document.querySelectorAll('#makoSidebar [data-section=everything] .mk-side-item')).map((b) => b.textContent);
    document.getElementById('makoTab-aquarium').click();
    out.sidebarInAquarium = t.shown('#makoPanel-aquarium #makoSidebar');
    Array.from(document.querySelectorAll('#makoSidebar .mk-side-item')).find((b) => b.textContent === 'Logs').click();
    out.sidebarLogs = t.selectedTab() === 'control' && document.querySelector('.tabpane[data-pane=logs]').classList.contains('active');
    out.sidebarHiddenOnControl = !t.shown('#makoSidebar');
    // Today's settings on the Settings page; a palette command leaves Settings first.
    document.getElementById('makoSettingsOpen').click();
    out.themeOnSettings = !!document.getElementById('makoThemeSelect') && document.getElementById('makoThemeSelect').options.length === document.getElementById('themeSelect').options.length;
    out.folderOnSettings = t.shown('#makoChangeRoot');
    const themeSel = document.getElementById('makoThemeSelect');
    themeSel.value = 'nord'; themeSel.dispatchEvent(new Event('change'));
    out.themeApplied = document.documentElement.getAttribute('data-theme');
    shell.setLayout('old');
    shell.openSettings();
    t.key('k', { ctrlKey: true });
    input.value = 'open logs';
    input.dispatchEvent(new Event('input'));
    t.key('Enter');
    out.oldLayoutLogsLeavesSettings = t.root().view === 'tab' && t.shown('.tabpane[data-pane=logs]');
    out.railShownOld = t.shown('#makoRail');
    shell.setLayout('tabs');
    await t.sleep(50);
    return out;
  })()`);
  r.saves = ipc.saves.slice();
  r.ptyStart = ipc.ptyStart;
  await park();
  return r;
}

async function scenarioSettingsAndOldLayout() {
  await open('settings', { theme: 'obsidian', projectsRoot: 'D:\\Workspace', uiTab: 'control' });
  await run(`window.__t.waitFor(() => document.documentElement.getAttribute('data-mako-layout') === 'tabs')`);
  const r = await run(`(async () => {
    const t = window.__t;
    const out = {};
    document.getElementById('makoSettingsOpen').click();
    out.view = t.root().view;
    out.settingsShown = t.shown('#makoSettings');
    out.controlShownInSettings = t.shown('#makoPanel-control');
    out.focusInSettings = document.activeElement && document.activeElement.id;
    out.sections = Array.from(document.querySelectorAll('#makoSettings .mk-settings-section h3')).map((n) => n.textContent);
    out.shortcutRows = document.querySelectorAll('#makoShortcutTable tbody tr').length;
    out.escPrevented = t.key('Escape');
    out.viewAfterEsc = t.root().view;
    out.focusAfterEsc = document.activeElement && document.activeElement.id;
    // Turn on the old layout from the Settings page.
    document.getElementById('makoSettingsOpen').click();
    const box = document.getElementById('makoOldLayout');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    out.layoutAfterSwitch = t.root().layout;
    out.statusText = document.getElementById('makoLayoutStatus').textContent;
    document.getElementById('makoSettingsClose').click();
    out.headerShownOld = t.shown('#makoShell');
    out.controlShownOld = t.shown('#makoPanel-control');
    out.topbarShownOld = t.shown('.topbar');
    out.tabAttrOld = t.root().tab;
    await t.sleep(50);
    return out;
  })()`);
  r.saves = ipc.saves.slice();
  await park();
  return r;
}

async function scenarioRestartOld() {
  // A restart with the old layout saved: it comes back old, and Ctrl K and Settings still work.
  await open('restartOld', { theme: 'obsidian', projectsRoot: 'D:\\Workspace', uiLayout: 'old', uiTab: 'brain' });
  await run(`window.__t.waitFor(() => document.documentElement.getAttribute('data-mako-layout') === 'old')`);
  const r = await run(`(async () => {
    const t = window.__t;
    const out = {};
    out.root = t.root();
    out.headerShown = t.shown('#makoShell');
    out.controlShown = t.shown('#makoPanel-control');
    out.brainShown = t.shown('#makoPanel-brain');
    out.terminalsTabShown = t.shown('.tab[data-tab=terminals]');
    t.key('k', { ctrlKey: true });
    out.paletteShown = t.shown('#makoPalette');
    out.offersTabs = Array.from(document.querySelectorAll('#makoPaletteList [role=option] .mk-palette-label')).map((n) => n.textContent).includes('Use the three-tab layout');
    t.key('Escape');
    document.getElementById('makoSettingsTopbar').click();
    out.settingsFromTopbar = t.shown('#makoSettings');
    out.boxChecked = document.getElementById('makoOldLayout').checked;
    await t.sleep(50);
    return out;
  })()`);
  r.saves = ipc.saves.slice();
  await park();
  return r;
}

async function scenarioTopBar() {
  // The usage chip on every tab, the two switches (shown, disabled until S18 and S19), and the
  // banners on every tab and in the old layout, restored after a restart.
  await open('topBar', { theme: 'obsidian', projectsRoot: 'D:\\Workspace', uiTab: 'brain', uiPausedSince: '2026-11-24T19:05:00.000Z', uiQuietSince: 'not-a-time' });
  await run(`window.__t.waitFor(() => document.documentElement.getAttribute('data-mako-layout') === 'tabs')`);
  const r = await run(`(async () => {
    const t = window.__t;
    const out = {};
    out.pausedRestored = t.shown('#makoPausedBanner');
    out.pausedText = document.getElementById('makoPausedBanner').textContent;
    out.quietBadStoredOff = !t.shown('#makoQuietBanner');
    out.quietBadLogged = t.log().includes('stored quiet-hours state not recognised');
    out.usageOnTab = {};
    out.pausedOnTab = {};
    for (const tab of ['brain', 'control', 'aquarium']) {
      document.getElementById('makoTab-' + tab).click();
      out.usageOnTab[tab] = t.shown('#usagePanel') && document.getElementById('usagePanel').parentNode.id === 'makoStatusSlot';
      out.pausedOnTab[tab] = t.shown('#makoPausedBanner');
    }
    out.quietDisabled = document.getElementById('makoQuiet').disabled;
    // S19 turns Pause all on late in boot, after the shell starts: wait for it (or time out).
    await t.waitFor(() => document.getElementById('makoPauseAll').disabled === false, 5000);
    out.pauseDisabled = document.getElementById('makoPauseAll').disabled;
    // Quiet hours on (as S18 and S19 will do), on every tab.
    shell.setQuiet(true);
    out.quietOnTab = {};
    for (const tab of ['brain', 'control', 'aquarium']) {
      document.getElementById('makoTab-' + tab).click();
      out.quietOnTab[tab] = t.shown('#makoQuietBanner');
    }
    out.quietText = document.getElementById('makoQuietBanner').textContent;
    out.rootQuiet = document.documentElement.getAttribute('data-mako-quiet');
    // A switch turned on by its row works by click.
    out.enableUnknown = shell.enableSwitch('everything');
    out.enableQuiet = shell.enableSwitch('quiet');
    document.getElementById('makoQuiet').click();
    out.quietAfterToggle = shell.getState().quietSince;
    document.getElementById('makoQuiet').click();
    out.quietPressed = document.getElementById('makoQuiet').getAttribute('aria-pressed');
    // In the old layout the banners still show and the usage chip goes back to the old top bar.
    shell.setLayout('old');
    out.pausedInOld = t.shown('#makoPausedBanner');
    out.quietInOld = t.shown('#makoQuietBanner');
    out.usageInOldTopbar = t.shown('#usagePanel') && document.getElementById('usagePanel').parentNode.classList.contains('topbar');
    out.usageBeforeTheme = document.getElementById('usagePanel').nextElementSibling && document.getElementById('usagePanel').nextElementSibling.className;
    // End now and Resume all clear them.
    document.getElementById('makoQuietEnd').click();
    document.getElementById('makoResumeAll').click();
    out.quietAfterEnd = t.shown('#makoQuietBanner');
    out.pausedAfterResume = t.shown('#makoPausedBanner');
    await t.sleep(50);
    return out;
  })()`);
  r.saves = ipc.saves.slice();
  await park();
  return r;
}

async function scenarioNeedsYou() {
  // S19: the "Needs you" strip. Main sends token-free pane-status views; the strip shows one chip
  // per waiting pane, oldest first, F8 is consumed and jumps, and a pane that can't be focused (none
  // runs in this harness) is logged, never silent.
  await open('needsYou', { theme: 'obsidian', projectsRoot: 'D:\\Workspace', uiTab: 'control' });
  await run(`window.__t.waitFor(() => document.documentElement.getAttribute('data-mako-layout') === 'tabs')`);
  // Wait until boot has bound the Terminals tab, then open it.
  await run(`(async () => { const b = document.querySelector('.tab[data-tab="terminals"]'); await window.__t.waitFor(() => typeof b.onclick === 'function'); b.click(); })()`);
  const out = {};
  out.hiddenAtStart = await run(`window.__t.shown('#needsYouStrip') === false`);
  // The renderer may still be wiring its listeners: resend the first view until it lands (a repeat
  // changes nothing, which the unit test checks).
  let landed = false;
  for (let i = 0; i < 40 && !landed; i += 1) {
    win.webContents.send('pane-status-view', { paneId: 'pty1', state: 'attention', reason: null });
    landed = await run(`window.__t.waitFor(() => window.__t.log().includes('pty1 -> needs you'), 250)`);
  }
  out.firstLanded = landed;
  await run(`window.__t.sleep(30)`);
  win.webContents.send('pane-status-view', { paneId: 'pty2', state: 'attention', reason: null });
  win.webContents.send('pane-status-view', { paneId: 'pty3', state: 'working', reason: null });
  await run(`window.__t.waitFor(() => document.querySelectorAll('#needsYouStrip .mk-needs-chip').length === 2)`);
  // A waiting pane's status ages to unknown/stale after 2 minutes with no new hook event: still waiting.
  win.webContents.send('pane-status-view', { paneId: 'pty1', state: 'unknown', reason: 'stale' });
  await run(`window.__t.waitFor(() => window.__t.log().includes('pty1 -> unknown'), 3000)`);
  out.chipsAfterStale = await run(`document.querySelectorAll('#needsYouStrip .mk-needs-chip').length`);
  Object.assign(out, await run(`(async () => {
    const t = window.__t;
    const strip = document.getElementById('needsYouStrip');
    return {
      shown: t.shown('#needsYouStrip'),
      chips: Array.from(strip.querySelectorAll('.mk-needs-chip')).map((b) => b.getAttribute('data-pane-id')),
      title: strip.querySelector('.mk-needs-title').textContent,
      region: strip.getAttribute('role') + '|' + strip.getAttribute('aria-label'),
      f8Consumed: t.key('F8'),
      ctrlF8Consumed: t.key('F8', { ctrlKey: true }),
    };
  })()`));
  await run(`window.__t.sleep(30)`);
  out.f8Logged = await run(`window.__t.log().includes('[needs-you] could not focus pty1 (focus-failed)')`);
  if (process.env.MAKO_SCREENSHOT_DIR) {
    try {
      const img = await win.webContents.capturePage();
      require('fs').writeFileSync(path.join(process.env.MAKO_SCREENSHOT_DIR, 's19-needs-you.png'), img.toPNG());
      out.screenshot = true;
    } catch (e) { out.screenshot = String((e && e.message) || e).slice(0, 200); }
  }
  win.webContents.send('pane-status-view', { paneId: 'pty1', state: 'working', reason: null });
  await run(`window.__t.waitFor(() => document.querySelectorAll('#needsYouStrip .mk-needs-chip').length === 1)`);
  out.afterWorking = await run(`Array.from(document.querySelectorAll('#needsYouStrip .mk-needs-chip')).map((b) => b.getAttribute('data-pane-id'))`);
  win.webContents.send('pane-status-view', { paneId: 'pty2', state: 'exited', reason: null });
  await run(`window.__t.waitFor(() => document.getElementById('needsYouStrip').hidden === true)`);
  out.hiddenAtEnd = await run(`window.__t.shown('#needsYouStrip') === false`);
  // S19: the cheat sheet opens from its "?" button, lists S66's shortcut list, and Esc closes it.
  Object.assign(out, await run(`(async () => {
    const t = window.__t;
    const btn = document.getElementById('makoCheatSheetOpen');
    if (!btn) return { cheatButton: false };
    btn.focus();
    btn.click();
    await t.sleep(30);
    const dlg = document.getElementById('makoCheatSheet');
    const r = { cheatButton: true, cheatOpen: dlg.open, cheatRows: dlg.querySelectorAll('tbody tr').length, cheatHasF8: dlg.textContent.includes('F8'), cheatFocus: document.activeElement && document.activeElement.id };
    dlg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    dlg.close();
    await t.sleep(30);
    r.cheatClosed = !dlg.open;
    r.cheatFocusBack = document.activeElement === btn;
    return r;
  })()`));
  out.ptyStart = ipc.ptyStart;
  await park();
  return out;
}

async function scenarioPauseAll() {
  // S19: what Pause all does to panes, counted at the IPC boundary. Two panes start (main answers
  // ok); one is working, one needs Blue. Pause all sends one Esc to the working pane only, kills
  // nothing, and refuses a new pane; Resume all sends nothing.
  control.ptyOk = true;
  await open('pauseAll', { theme: 'obsidian', projectsRoot: 'D:\\Workspace', uiTab: 'control' });
  const out = {};
  try {
    await run(`window.__t.waitFor(() => document.documentElement.getAttribute('data-mako-layout') === 'tabs')`);
    await run(`(async () => { const b = document.querySelector('.tab[data-tab="terminals"]'); await window.__t.waitFor(() => typeof b.onclick === 'function'); b.click(); })()`);
    out.pauseEnabled = await run(`window.__t.waitFor(() => document.getElementById('makoPauseAll').disabled === false)`);
    await run(`(async () => { const b = document.getElementById('newTermShell'); await window.__t.waitFor(() => typeof b.onclick === 'function'); b.click(); await window.__t.sleep(200); b.click(); })()`);
    const end = Date.now() + 10000;
    while (ipc.ptyIds.length < 2 && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
    out.started = ipc.ptyIds.length;
    out.headerTags = await run(`Array.from(terms.get(${JSON.stringify('pty1')}) ? terms.get('pty1').pane.querySelectorAll('.term-head .pane-tag') : []).map((n) => n.textContent)`);
    const [working, waiting] = ipc.ptyIds;
    // Resend until the renderer has the views (it may still be wiring listeners).
    for (let i = 0; i < 40; i += 1) {
      win.webContents.send('pane-status-view', { paneId: working, state: 'working', reason: null });
      win.webContents.send('pane-status-view', { paneId: waiting, state: 'attention', reason: null });
      if (await run(`window.__t.waitFor(() => window.__t.log().includes(${JSON.stringify(waiting + ' -> needs you')}), 250)`)) break;
    }
    ipc.writes = [];
    await run(`document.getElementById('makoPauseAll').click()`);
    await run(`window.__t.sleep(100)`);
    out.escWrites = ipc.writes.filter((w) => w[1] === '\u001b');
    out.otherWrites = ipc.writes.filter((w) => w[1] !== '\u001b').length;
    out.working = working;
    out.kills = ipc.kills.slice();
    out.banner = await run(`window.__t.shown('#makoPausedBanner')`);
    out.logged = await run(`window.__t.log().includes('Esc requested for 1 working pane(s)') && window.__t.log().includes('nothing killed')`);
    const before = ipc.ptyStart;
    await run(`(async () => { document.getElementById('newTermShell').click(); await window.__t.sleep(200); })()`);
    out.startedWhilePaused = ipc.ptyStart - before;
    out.refusalLogged = await run(`window.__t.log().includes('refused to start a shell: Pause all is on')`);
    ipc.writes = [];
    await run(`document.getElementById('makoResumeAll').click()`);
    await run(`window.__t.sleep(100)`);
    out.writesOnResume = ipc.writes.length;
    out.bannerAfterResume = await run(`window.__t.shown('#makoPausedBanner')`);
    // S19: the stall watch paints the real pane header: five failed turns in a row read "stalled".
    for (let i = 0; i < 5; i += 1) {
      win.webContents.send('pane-status-view', { paneId: working, state: 'failed', reason: null });
      win.webContents.send('pane-status-view', { paneId: working, state: 'working', reason: null });
    }
    await run(`window.__t.waitFor(() => window.__t.log().split(${JSON.stringify(working + ' -> failed')}).length >= 6, 5000)`);
    // Read through the pane's own header (the element the app holds for it, as the badge does).
    out.stallTag = await run(`(() => { stallWatch.tick(); const h = terms.get(${JSON.stringify(working)}).pane.querySelector('.term-head'); return Array.from(h.querySelectorAll('.stall-tag')).map((n) => n.textContent + '|' + n.getAttribute('role')); })()`);
    // S19: the right panel. Selecting the working pane (a mousedown on it, as a click does) shows
    // its In-focus card; Interrupt sends exactly one Esc to that pane, counted at the boundary.
    await run(`terms.get(${JSON.stringify(working)}).pane.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
    out.panel = await run(`(() => { const p = document.getElementById('controlFocus'); const c = p.querySelector('[data-state]'); return { state: c ? c.getAttribute('data-state') : null, shown: window.__t.shown('#controlFocus'), hasInterrupt: !!p.querySelector('[data-action="interrupt"]') }; })()`);
    ipc.writes = [];
    await run(`(() => { const b = document.querySelector('#controlFocus [data-action="interrupt"]'); if (b) b.click(); })()`);
    await run(`window.__t.sleep(100)`);
    out.interruptWrites = ipc.writes.slice();
    out.interruptKills = ipc.kills.slice();
    if (process.env.MAKO_SCREENSHOT_DIR) {
      try {
        const img = await win.webContents.capturePage();
        require('fs').writeFileSync(path.join(process.env.MAKO_SCREENSHOT_DIR, 's19-control-room.png'), img.toPNG());
      } catch { /* a screenshot is for people, never a gate */ }
    }
  } finally {
    control.ptyOk = false;
  }
  await park();
  return out;
}

async function scenarioPausedResume() {
  // S19: a pause restored at startup meets the Resume offer. Resume and Start fresh start nothing,
  // dismiss nothing, and the row stays on offer for after Resume all.
  control.ptyOk = true;
  control.resumeRows = [{ sessionId: 'sess-1', role: 'builder', worktree: 'D:\\Workspace\\AgentCommandCenter-search-bar', startedAt: '2026-11-25T10:00:00.000Z', stoppedAt: '2026-11-25T18:00:00.000Z', stopReason: 'closed', worktreeMissing: false, mayBeExpired: false }];
  const out = {};
  try {
    await open('pausedResume', { theme: 'obsidian', projectsRoot: 'D:\\Workspace', uiTab: 'control', uiPausedSince: '2026-11-25T19:05:00.000Z' });
    await run(`window.__t.waitFor(() => document.querySelectorAll('.resume-row').length === 1 && document.getElementById('makoPauseAll').disabled === false)`);
    Object.assign(out, await run(`(async () => {
      const t = window.__t;
      const buttons = () => Array.from(document.querySelectorAll('.resume-row button'));
      const byText = (txt) => buttons().find((b) => b.textContent === txt);
      byText('Resume').click();
      await t.sleep(50);
      byText('Start fresh').click();
      await t.sleep(100);
      return {
        rowsLeft: document.querySelectorAll('.resume-row').length,
        refusedResume: t.log().includes('refused to start a resumed pane: Pause all is on'),
        refusedFresh: t.log().includes('refused to start a fresh pane: Pause all is on'),
        restoredLogged: t.log().includes('paused state restored at startup; nothing sent'),
      };
    })()`));
    out.ptyStart = ipc.ptyStart;
    out.dismissed = ipc.dismissed.slice();
  } finally {
    control.ptyOk = false;
    control.resumeRows = null;
  }
  await park();
  return out;
}

async function refusalCase(name, beforeBoot) {
  await open(name, { theme: 'obsidian', projectsRoot: 'D:\\Workspace', uiTab: 'brain' }, beforeBoot);
  await run(`window.__t.waitFor(() => window.__t.log().includes('[shell] REFUSED'))`);
  await run(`window.__t.waitFor(() => typeof document.getElementById('makoSettingsTopbar').onclick === 'function')`);
  await run(`window.__t.waitFor(() => typeof document.querySelector('.tab[data-tab=logs]').onclick === 'function')`);
  const r = await run(`(async () => {
    const t = window.__t;
    const out = {
      line: (t.log().match(/\\[shell\\] REFUSED[^\\n]*/) || [''])[0],
      headerShown: t.shown('#makoShell'),
      controlShown: t.shown('.layout'),
      topbarShown: t.shown('.topbar'),
      railShown: t.shown('#makoRail'),
      framesInPage: document.querySelectorAll('.mk-frame').length,
      rootAttrs: ['data-mako-layout', 'data-mako-tab', 'data-mako-view'].filter((a) => document.documentElement.hasAttribute(a)),
    };
    out.ctrlKPrevented = t.key('k', { ctrlKey: true });
    out.paletteInPage = !!document.getElementById('makoPalette');
    // The top bar's Settings button says why there is no Settings page, and opens Logs.
    document.getElementById('makoSettingsTopbar').click();
    out.settingsRefusalLogged = t.log().includes('Settings is unavailable');
    out.logsOpened = document.querySelector('.tabpane[data-pane=logs]').classList.contains('active');
    return out;
  })()`);
  await park();
  return r;
}
async function scenarioRefusal() {
  // Three ways the shell can't start. Each refuses visibly and leaves the old layout untouched.
  return {
    mount: await refusalCase('refusalMount', `document.getElementById('makoViews').remove();`),
    tokens: await refusalCase('refusalTokens', `delete window.ccUiTokens;`),
    control: await refusalCase('refusalControl', `document.getElementById('makoPanel-control').removeAttribute('id');`),
    render: await refusalCase('refusalRender', `window.ccUiTokens = Object.assign({}, window.ccUiTokens, { applyTabTokens: () => { throw new TypeError('planted'); } }); true;`),
  };
}

async function scenarioSaveFails() {
  // main can't write the settings file: the layout line must not claim "Saved".
  control.saveFail = true;
  await open('saveFails', { theme: 'obsidian', projectsRoot: 'D:\\Workspace' });
  await run(`window.__t.waitFor(() => document.documentElement.getAttribute('data-mako-layout') === 'tabs')`);
  const r = await run(`(async () => {
    const t = window.__t;
    document.getElementById('makoSettingsOpen').click();
    const box = document.getElementById('makoOldLayout');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    const status = document.getElementById('makoLayoutStatus');
    const first = status.textContent;
    await t.waitFor(() => !status.textContent.includes('Saving'));
    return { first, final: status.textContent, logged: t.log().includes('could not save settings (uiLayout): save-failed') };
  })()`);
  control.saveFail = false;
  await park();
  return r;
}

app.whenReady().then(async () => {
  const ses = session.fromPartition('shell-nav-app-harness', { cache: false });
  ses.webRequest.onBeforeRequest((details, callback) => {
    if (!details.url.startsWith('file:') && !details.url.startsWith('devtools:') && !details.url.startsWith('about:')) {
      remote.push(details.url.slice(0, 200));
      callback({ cancel: true });
      return;
    }
    callback({ cancel: false });
  });

  ipcMain.handle('get-settings', async () => { await control.gate; return Object.assign({}, control.settings); });
  ipcMain.handle('save-settings', (_e, partial) => {
    ipc.saves.push(partial);
    if (control.saveFail && partial && 'uiLayout' in partial) throw new Error('EPERM: harness write refused');
    return { ok: true };
  });
  ipcMain.handle('list-repos', () => ({ repos: control.repos.slice(), selectedRepo: control.repos[0] || '' }));
  ipcMain.handle('list-worktrees', () => control.worktrees.slice());
  ipcMain.handle('repo-github-url', () => '');
  ipcMain.handle('get-gemini-key-status', () => ({ ok: true, hasKey: true, available: true }));
  ipcMain.handle('get-agent-token-status', () => ({ ok: true, hasToken: true }));
  ipcMain.handle('tlog-reset', () => ({ ok: true }));
  ipcMain.handle('pty-start', (_e, o) => { ipc.ptyStart += 1; ipc.ptyIds.push(o && o.id); return control.ptyOk ? { ok: true } : { ok: false, error: 'harness' }; });
  ipcMain.on('pty-kill', (_e, id) => { ipc.kills.push(id); });
  // S19: a Resume offer only for the scenario that sets one; otherwise the invoke is unhandled, as before.
  ipcMain.handle('session-resume-offer', () => (control.resumeRows ? { ok: true, rows: control.resumeRows.slice(), retentionDays: 14 } : Promise.reject(new Error('harness: no offer'))));
  ipcMain.handle('session-resume-dismiss', (_e, id) => { ipc.dismissed.push(id); return { ok: true }; });
  ipcMain.on('pty-write', (_e, m) => { ipc.writes.push([m && m.id, m && m.data]); });
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
  }, 4 * 60 * 1000);
  for (const [name, fn] of [['firstRun', scenarioFirstRun], ['palette', scenarioPalette], ['settings', scenarioSettingsAndOldLayout], ['restartOld', scenarioRestartOld], ['topBar', scenarioTopBar], ['needsYou', scenarioNeedsYou], ['pauseAll', scenarioPauseAll], ['pausedResume', scenarioPausedResume], ['refusal', scenarioRefusal], ['saveFails', scenarioSaveFails]]) {
    try { scenarios[name] = await fn(); progress(`${name}: done`); }
    catch (e) { fatal = { scenario: name, error: String((e && e.message) || e) }; progress(`${name}: FAILED ${fatal.error}`); break; }
  }
  clearTimeout(watchdog);
  process.stdout.write(JSON.stringify({ ok: fatal === null, fatal, scenarios, remote, consoleErrors: consoleErrors.slice(0, 50) }) + '\n');
  app.exit(fatal === null ? 0 : 1);
});
