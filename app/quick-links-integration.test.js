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
// S06 (docs/PLAN-1.1.md) deliberately changes the legacy open-external handler: it now routes
// through the trusted-sender gate and this policy's validateUrl (open-external-ipc.js). Until S06 the
// assertion here pinned the old 141-byte handler as byte-identical to the dispatched base; it now
// pins the new route instead, so the handler can't quietly drift back to a bare prefix check.
function legacyHandler(source) {
  const start = source.indexOf("ipcMain.handle('open-external'");
  if (start < 0) return null;
  const end = source.indexOf('\n', start);
  // Windows CI checks the file out with CRLF; drop the line's own '\r'.
  return end < 0 ? null : source.slice(start, end).replace(/\r$/, '');
}

process.stdout.write('\nlegacy external-launcher routed through the URL policy (S06)\n');
const currentMain = read('main.js');
const baseMain = fromBase('main.js');
const oldCurrent = legacyHandler(currentMain);
assert(legacyHandler(baseMain) !== null, 'the dispatched base still has the legacy open-external handler');
assert(oldCurrent === "ipcMain.handle('open-external', async (e, url) => openExternalIpc.handleOpenExternal(e, url));",
  'open-external is a one-line delegation to open-external-ipc');
assert(!/\^https\?:\\\/\\\/\/i\.test\(url\)\) shell\.openExternal\(url\)/.test(currentMain),
  'the old prefix-only check calling shell.openExternal is gone');
const oeStart = currentMain.indexOf('const openExternalIpc = createOpenExternalIpc({');
const oeBlock = oeStart < 0 ? '' : currentMain.slice(oeStart, currentMain.indexOf('\n});', oeStart));
assert(oeBlock.includes('assessSender: (e) => launcherGate.assess(e)'), 'open-external uses the canonical trusted-sender gate');
assert(oeBlock.includes('validateUrl: validateQuickLinkUrl'), 'open-external uses the Quick Links validateUrl');
assert(currentMain.includes("validateUrl: validateQuickLinkUrl } = require('./quick-links-policy')"),
  'validateQuickLinkUrl is the Quick Links policy export');

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
// S15 (PR #130, Blue's verdict 2026-11-03: ADOPT Playwright MCP) adds exactly one runtime dependency,
// pinned exactly; it is set aside here and pinned below. Any other change still fails.
const S15_DEPENDENCY = ['@playwright/mcp', '0.0.84'];
assert(currentPkg.dependencies[S15_DEPENDENCY[0]] === S15_DEPENDENCY[1], 'S15: @playwright/mcp is pinned exactly to 0.0.84');
// S35 (PR #170, Blue's 2026-11-10/11 decision: a GitHub App is the primary local identity, and the
// instructions say to use the official MIT @octokit/auth-app whole) adds exactly one more runtime
// dependency, pinned exactly, with its 16 MIT/ISC transitive packages (S35_LOCK below). Set aside the
// same way; any other change still fails.
const S35_DEPENDENCY = ['@octokit/auth-app', '8.3.1'];
assert(currentPkg.dependencies[S35_DEPENDENCY[0]] === S35_DEPENDENCY[1], 'S35: @octokit/auth-app is pinned exactly to 8.3.1');
const depsWithoutS15 = Object.assign({}, currentPkg.dependencies);
delete depsWithoutS15[S15_DEPENDENCY[0]];
delete depsWithoutS15[S35_DEPENDENCY[0]];
assert(JSON.stringify(depsWithoutS15) === JSON.stringify(basePkg.dependencies), 'runtime dependencies unchanged from base apart from S15\'s and S35\'s one addition each');
assert(JSON.stringify(currentPkg.devDependencies) === JSON.stringify(basePkg.devDependencies), 'devDependencies unchanged from base');
// Compared as JSON with the app's OWN version fields set aside: the 1.0.0 release bump (2026-10-16)
// changes those two fields and nothing else, and the point here is that no dependency changed.
// Also set aside: the 1.1 S02 `npm audit fix` (docs/DEPENDENCY-ADVISORIES.md), which moved exactly
// these four packages to patched versions inside their existing ranges, and the root
// hasInstallScript flag npm writes for the app's postinstall. Those four entries must match the
// audited version, registry tarball and integrity below exactly; any other lockfile change still
// fails here, and so does any later move of these four until this list is updated with it.
const AUDIT_FIX = {
  'node_modules/electron': ['42.11.15', 'sha512-pZOe/Qga4o3t6q9WdL6hV0hYjjlcagJsSCFp3Zc4rxyqTYsIQr6macePGoQefXkdKFnsA4VvwqHjYxTUSiE3qA=='],
  'node_modules/protobufjs': ['7.6.6', 'sha512-dYDWdjSl5RNb7SgPxGQcRU+GtvP7s2fpkrY0r432PcOIaZ0/rBcxEZnQN67iJhFuQiVw754JDoPruPCNdGsbjg=='],
  'node_modules/tar': ['7.5.22', 'sha512-MFO/QzvtAOmJbkhOaCTvbGcFN9L9b+JunIsDwaKljSOdcLMea3NJ1k9Usz/rjdfSXTq4dfzfeS7W4p4YOAAHeA=='],
  'node_modules/undici': ['7.30.1', 'sha512-03KrMbjIFDWQR5RNPrSw3bd1r12JpyFQl9/yxjUbJtqkjmllqC5lFjZh6ujeuJCKr8EOQvRW872Oy/az+nLYxg=='],
};
// S15's three new lockfile entries (the server and the Playwright it depends on, a pinned pre-release).
// Each must match this version, registry tarball and integrity exactly, and is then set aside.
const S15_LOCK = {
  'node_modules/@playwright/mcp': ['0.0.84', 'sha512-weqLrA7/D8MJzNV9/t3Hnjp100tS2sxFXKeb2gH6Nhktqmdfvx5qRA9AZ5Mhjnre1jY0wltsrRK5VZS5NBgcvw=='],
  'node_modules/playwright': ['1.65.0-alpha-2026-10-30', 'sha512-dmAJMVHKzHvMQjn+XDcaq/pxaZ0W6n8i78rwTM+VGRtQ3WBF5ZiSdB1yL/cyoYUGUMwg3jxN65KqC9cERaCbIg=='],
  'node_modules/playwright-core': ['1.65.0-alpha-2026-10-30', 'sha512-LPMw8B/HRQKMcJeXTqWSrkB/AfCKKmbDQMbu0p7zg8MgibOWaKMjZWR/StAtrQkOxvOmZEju1o1TnPgdoOCwrg=='],
};
// S35's new lockfile entries (@octokit/auth-app and what it depends on). Each must match this version,
// registry tarball and integrity exactly, and is then set aside.
const S35_LOCK = {
  'node_modules/@octokit/auth-app': ['8.3.1', 'sha512-XHWxZsF4mvGTQCv7AOxgby9t9OjVO19FBuKq+QmyBxFrf+B2hR/P5j/MTF8g95bITf8cRtR17KIXThpFNqiKbg=='],
  'node_modules/@octokit/auth-oauth-app': ['9.0.5', 'sha512-Hn2yAlIDjFLGjAz7t+CRu7e9VYoFW1W3LLyOLyahFoJGlCf4PtDkHKtRET8w/2CJpsrC0FxIF5g5Xtx9E4O78w=='],
  'node_modules/@octokit/auth-oauth-device': ['8.0.5', 'sha512-kdJtjRhykMLJrMdcoC56XUBDfoUAuWEFKpkDxwYim+bNwYw1MreLolk+PLnwEYT8djm589YepeMuJ8+ECAIzVQ=='],
  'node_modules/@octokit/auth-oauth-user': ['6.0.4', 'sha512-eya2pMJ9pCBq1jrm1Rf6J3NI+NemEpzDMLo9J/GpRoK0KgdxIVXWX4LESIfwJ+GYeoq6QFIlUJNi1lVp5FBgmw=='],
  'node_modules/@octokit/endpoint': ['11.0.5', 'sha512-iXa654H3yFafF/ieHkukfbgWo2rmXD2ceD0ZOtrPhw1bc3FDch1d9N/TNs0FQ1/cIbwb7kspUX8jzIs8nzb9DQ=='],
  'node_modules/@octokit/oauth-authorization-url': ['8.0.0', 'sha512-7QoLPRh/ssEA/HuHBHdVdSgF8xNLz/Bc5m9fZkArJE5bb6NmVkDm3anKxXPmN1zh6b5WKZPRr3697xKT/yM3qQ=='],
  'node_modules/@octokit/oauth-methods': ['6.0.5', 'sha512-/mAz7taDZD7DcV4zcG6TDw3Kr6TOldmYBRpvA62C3WIxRMmcgX8XxsTvVQomqKE7VEk/BgYhUao1aR2tYGyIKg=='],
  'node_modules/@octokit/openapi-types': ['29.0.1', 'sha512-9qWOMFNxxLokERcms42rU0PTLqQmVs7g5E41TI4mCOxmpFayD1rfC7XxOL55cG9MBZLFlC31BrR37myMKardwg=='],
  'node_modules/@octokit/request': ['10.0.16', 'sha512-A0zWGjHzISIb+9ccG8s0dq7LKO5zVpJLRICjgUb+sJxEWqn8RUHB1rD3AE51+PECvXHIxqZ1VVvs4fHTSD9nUQ=='],
  'node_modules/@octokit/request-error': ['7.1.2', 'sha512-XZRuT3xZ84D3gYErI1DZvhJ33dCWVV6uzBtWkaBB4TvA/L6eOeTZodxLFVB44bBEEo3vEx7y00UfX1tBLrtLRg=='],
  'node_modules/@octokit/types': ['18.0.0', 'sha512-l6bAF43PNxkJp6g+W4PjoUSSkxHomXw2nOum5CTftJz1NlV3vu93NImgOYtLf6CbBUb5j+fiuzW0PPQ5JTSvZA=='],
  'node_modules/content-type': ['3.1.1', 'sha512-GW4qUsfFo59d0HbUibDlWv5wPz+vAAcaTWbKIuKCf0JkC7wWkSyf8f13IpXn5JkeMlB2P8iTSSIjwXljorg2vA=='],
  'node_modules/json-with-bigint': ['3.5.12', 'sha512-uwbF/wSSuOgC7qqlq27Xp5B6a2MHVug3t0idZdTqu0JnlFvgJuH7ju+KAk/J06C7GfhoYy2gnb9wz2INqcne7w=='],
  'node_modules/toad-cache': ['3.7.4', 'sha512-m1TdR/rvT7kgGJZhspNtXdsdYk0fddFpJJFlG5s+UkPFo6lkLoZ3YLOaovPYjq1R75NP5JfeTlSHaOsE09peCg=='],
  'node_modules/universal-github-app-jwt': ['2.2.2', 'sha512-dcmbeSrOdTnsjGjUfAlqNDJrhxXizjAz94ija9Qw8YkZ1uu0d+GoZzyH+Jb9tIIqvGsadUfwg+22k5aDqqwzbw=='],
  'node_modules/universal-user-agent': ['7.0.3', 'sha512-TmnEAEAsBJVZM/AADELsK76llnwcf9vMKuPz8JflO1frO8Lchitr0fNaN9d+Ap0BjKtqWqd/J17qeDnXh8CL2A=='],
};
const currentLock = JSON.parse(read('package-lock.json'));
for (const [key, [version, integrity]] of Object.entries(S35_LOCK)) {
  const entry = currentLock.packages[key] || {};
  const name = key.slice('node_modules/'.length);
  const file = name.split('/').pop();
  assert(entry.version === version && entry.integrity === integrity
    && entry.resolved === `https://registry.npmjs.org/${name}/-/${file}-${version}.tgz`,
  `S35: ${name} is ${version} from registry.npmjs.org with the pinned integrity`);
}
for (const [key, [version, integrity]] of Object.entries(S15_LOCK)) {
  const entry = currentLock.packages[key] || {};
  const name = key.slice('node_modules/'.length);
  const file = name.split('/').pop();
  assert(entry.version === version && entry.integrity === integrity
    && entry.resolved === `https://registry.npmjs.org/${name}/-/${file}-${version}.tgz`,
    `S15: ${name} is ${version} from registry.npmjs.org with the pinned integrity`);
}
for (const [key, [version, integrity]] of Object.entries(AUDIT_FIX)) {
  const entry = currentLock.packages[key] || {};
  const name = key.slice('node_modules/'.length);
  assert(entry.version === version && entry.integrity === integrity
    && entry.resolved === `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
    `${name} is the audited ${version} from registry.npmjs.org with the audited integrity`);
}
const withoutOwnVersion = (lockText) => {
  const lock = JSON.parse(lockText);
  delete lock.version;
  if (lock.packages && lock.packages['']) {
    delete lock.packages[''].version;
    delete lock.packages[''].hasInstallScript;
    if (lock.packages[''].dependencies) {
      delete lock.packages[''].dependencies[S15_DEPENDENCY[0]];
      delete lock.packages[''].dependencies[S35_DEPENDENCY[0]];
    }
  }
  for (const key of Object.keys(S15_LOCK)) if (lock.packages) delete lock.packages[key];
  for (const key of Object.keys(S35_LOCK)) if (lock.packages) delete lock.packages[key];
  for (const key of Object.keys(AUDIT_FIX)) {
    if (lock.packages && lock.packages[key]) {
      delete lock.packages[key].version;
      delete lock.packages[key].resolved;
      delete lock.packages[key].integrity;
    }
  }
  return JSON.stringify(lock);
};
assert(withoutOwnVersion(read('package-lock.json')) === withoutOwnVersion(fromBase('package-lock.json')),
  'package-lock.json has no dependency delta from base beyond the S02 audit fix, S15\'s three entries and S35\'s pinned entries');
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
