'use strict';

// Source/lifecycle tripwires for the branch invariant. These tests compare the legacy launcher
// handler and dependency manifests directly with the dispatched base, then prove Quick Links uses
// only its dedicated policy/store/IPC/preload/renderer route.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = 'a2121ca36727bbb3294fd61a057f13730b8a1d17';
const APP = __dirname;
const REPO = path.resolve(APP, '..');
let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
function read(rel) { return fs.readFileSync(path.join(APP, rel), 'utf8'); }
function fromBase(rel, encoding = 'utf8') {
  return execFileSync('git', ['show', `${BASE}:app/${rel}`], { cwd: REPO, encoding });
}
// ANCHOR CORRECTED during the turn-admission-budget integration, because it was measuring the wrong
// thing. The end anchor used to be `'\n  });'` — an INDENTED closer — but this handler's own closing
// line is `});` at column 0. The old slice therefore ran past the handler and stopped at the first
// indented `});` much further down main.js, capturing 12,551 characters of unrelated code (the whole
// of pty-start, pty-write, pty-kill and the vibe-kanban board handlers) under the name "legacy
// open-external handler".
//
// That made the assertion both too weak and too strong: too weak because a real edit to the two lines
// that matter was never isolated, and too strong because ANY edit anywhere in 12 KB of neighbouring
// code failed it. The admission budget's `p.onExit` block — which legitimately ends in an indented
// `});` — tripped it while leaving the open-external handler untouched.
//
// The corrected anchor bounds the handler exactly. Verified across three revisions: the handler is
// 141 bytes and byte-identical at the dispatched base a2121ca3, at Quick Links main 5bbe3635, and on
// this branch. The assertion below now pins those 141 bytes and nothing else.
function legacyHandler(source) {
  const start = source.indexOf("ipcMain.handle('open-external'");
  if (start < 0) return null;
  const end = source.indexOf('\n});', start);
  return end < 0 ? null : source.slice(start, end + '\n});'.length);
}

process.stdout.write('\nlegacy external-launcher isolation\n');
const currentMain = read('main.js');
const baseMain = fromBase('main.js');
const oldCurrent = legacyHandler(currentMain);
const oldBase = legacyHandler(baseMain);
assert(oldCurrent !== null && oldBase !== null, 'legacy open-external handler is present in current and base source');
assert(oldCurrent.replace(/\r\n/g, '\n') === oldBase.replace(/\r\n/g, '\n'),
  'legacy open-external handler source is content-identical to dispatched base');
// Pin the corrected anchor's own behaviour, so a future edit cannot silently widen this region back
// out into neighbouring code without the change being visible here.
assert(oldBase.replace(/\r\n/g, '\n').length === 141,
  'the extracted region is the 141-byte handler itself, not a slice of surrounding code');
assert(oldCurrent.replace(/\r\n/g, '\n').split('\n').length === 3,
  'the extracted region is exactly the handler\'s three lines');
assert(!oldCurrent.includes('pty-start') && !oldCurrent.includes('pty-write'),
  'the extracted region does not reach into the PTY handlers');

const featureSources = [
  'quick-links-policy.js', 'quick-links-store.js', 'quick-links-ipc.js', 'renderer/quick-links-view.js',
].map((rel) => `${rel}\n${read(rel)}`).join('\n');
for (const forbidden of [
  "ipcRenderer.invoke('open-external'", 'cc.openExternal(', '.handleOpenExternal(',
]) assert(!featureSources.includes(forbidden), `Quick Links feature source does not reuse ${forbidden}`);
assert(!/\bwebview\b|BrowserView|new BrowserWindow/.test(featureSources), 'Quick Links creates no embedded browser/window');

process.stdout.write('\ndedicated narrow IPC/preload/main route\n');
const preload = read('preload.js');
for (const line of [
  "quickLinksList: () => ipcRenderer.invoke('quick-links-list')",
  "quickLinksSave: (text) => ipcRenderer.invoke('quick-links-save', text)",
  "quickLinksOpen: (id) => ipcRenderer.invoke('quick-links-open', id)",
]) assert(preload.includes(line), `preload exposes exact narrow method: ${line.split(':')[0]}`);
assert(!/quickLinks\w+:[^\n]*ipcRenderer\.send\(/.test(preload), 'Quick Links preload exposes no generic/send channel');
for (const channel of ['quick-links-list', 'quick-links-save', 'quick-links-open']) {
  assert(currentMain.includes(`ipcMain.handle('${channel}'`), `main registers dedicated ${channel} handler`);
}
assert(currentMain.includes('createQuickLinksIpc({') && currentMain.includes('getTrustedWindow: () => win'),
  'main constructs Quick Links IPC with the canonical late-bound trusted window');
assert(currentMain.includes('entryUrl: ENTRY_URL'), 'main supplies the canonical entry URL to Quick Links IPC');
assert(currentMain.includes('openExternal: (url) => shell.openExternal(url)'),
  'shell.openExternal is injected only behind the Quick Links IPC boundary');

process.stdout.write('\nUI source and production-data checkpoint\n');
const html = read('renderer/index.html');
const view = read('renderer/quick-links-view.js');
const appJs = read('renderer/app.js');
assert(html.includes('id="quickLinksList"') && html.includes('id="quickLinksSave"') && html.includes('id="quickLinksCancel"'),
  'visible Quick Links list and Save/Cancel controls are in shipped markup');
assert(html.includes('<script src="quick-links-view.js"></script>'), 'renderer controller is loaded before app wiring');
assert(appJs.includes('quickLinksView.mount()') && appJs.includes('await quickLinksView.load()'),
  'Quick Links UI is mounted and explicitly loaded during boot');
assert(!/\.openById\([^)]*\)/.test(appJs), 'app boot/wiring never auto-opens a Quick Link');
assert(view.includes("button.onclick = () => { openById(entry.id); }"),
  'the only renderer open trigger is an explicit rendered button click by stored ID');
const mainQuickStart = currentMain.indexOf('const quickLinksDefaults = buildQuickLinksDefaultConfig');
const mainQuickEnd = currentMain.indexOf('// EXPERIMENT A', mainQuickStart);
const mainQuickBlock = currentMain.slice(mainQuickStart, mainQuickEnd);
const productionQuickLinks = [read('quick-links-policy.js'), read('quick-links-store.js'), read('quick-links-ipc.js'), view, mainQuickBlock]
  .join('\n');
assert(mainQuickBlock.includes("starboardUrl: 'https://jlautomationsystems.com/'"),
  'production seed uses Blue-approved exact Starboard Platform URL');
assert(mainQuickBlock.includes("outlookUrl: 'https://outlook.office365.com/'"),
  'production seed uses Blue-approved exact Outlook Web URL');
assert(/defaultConfig:\s*quickLinksDefaults\.config/.test(mainQuickBlock),
  'validated approved defaults are passed to the fixed userData store');
assert(!/defaultConfig:\s*null/.test(mainQuickBlock),
  'the completed production checkpoint no longer leaves defaults unavailable');
for (const forbidden of ['https://example.com', 'http://example.com', 'test.invalid', 'placeholder.example']) {
  assert(!productionQuickLinks.includes(forbidden), `production Quick Links source contains no ${forbidden} URL`);
}
for (const forbiddenLabel of ['Starboard CRM', 'GoHighLevel', 'Hexona']) {
  assert(!productionQuickLinks.includes(forbiddenLabel), `production Quick Links source contains no forbidden label ${forbiddenLabel}`);
}

process.stdout.write('\nno dependency delta and full-chain reachability\n');
const currentPkg = JSON.parse(read('package.json'));
const basePkg = JSON.parse(fromBase('package.json'));
assert(JSON.stringify(currentPkg.dependencies) === JSON.stringify(basePkg.dependencies), 'runtime dependencies unchanged from base');
assert(JSON.stringify(currentPkg.devDependencies) === JSON.stringify(basePkg.devDependencies), 'devDependencies unchanged from base');
let lockUnchanged = true;
try { execFileSync('git', ['diff', '--quiet', BASE, '--', 'app/package-lock.json'], { cwd: REPO }); }
catch { lockUnchanged = false; }
assert(lockUnchanged, 'package-lock.json has no delta from base');
const requiredTests = [
  'quick-links-policy.test.js', 'quick-links-store.test.js', 'quick-links-ipc.test.js',
  'quick-links-integration.test.js', 'renderer/quick-links-view.test.js',
];
for (const suite of requiredTests) {
  const token = `node ${suite}`;
  assert(currentPkg.scripts.test.split('&&').map((part) => part.trim()).filter((part) => part === token).length === 1,
    `${suite} is reachable exactly once from npm test`);
}

process.stdout.write(`\nquick-links-integration: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
