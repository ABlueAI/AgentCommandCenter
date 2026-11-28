'use strict';
// Run: node app/open-external-ipc.test.js
// Plain Node.js — no framework. Proves S06's link hardening on the legacy open-external channel: an
// untrusted sender, a URL the Quick Links policy refuses, or a desktop-app link opens NOTHING; a valid
// http(s) link opens exactly once with the policy's normalized URL; refusals never echo the URL.

const { createOpenExternalIpc } = require('./open-external-ipc');
const { validateUrl } = require('./quick-links-policy');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

function makeIpc(over) {
  const opened = [];
  const logs = [];
  const ipc = createOpenExternalIpc(Object.assign({
    assessSender: () => ({ ok: true }),
    validateUrl,
    openExternal: (url) => { opened.push(url); return Promise.resolve(); },
    logRefusal: (line) => logs.push(line),
  }, over || {}));
  return { ipc, opened, logs };
}

async function testTerminalLinks() {
  const raw = 'HTTPS://Example.COM/docs/a b';
  const target = 'https://example.com/docs/a%20b';
  const prompts = [];
  let answer;
  const { ipc, opened, logs } = makeIpc({
    confirmTerminalLink: (url) => {
      prompts.push(url);
      return url === target ? new Promise((resolve) => { answer = resolve; }) : Promise.resolve(false);
    },
  });
  assert(typeof ipc.handleOpenTerminalLink === 'function', 'the terminal link route is available');
  if (typeof ipc.handleOpenTerminalLink !== 'function') return;

  for (const [url, reason] of [
    ['https://user@example.com/', 'url-userinfo-not-allowed'],
    ['https://example.com/\u202e', 'url-bidi-character'],
    ['https://example.com/a\tb', 'url-control-character'],
    ['https://example.com/%zz', 'url-invalid-percent-encoding'],
    ['obsidian://open', 'url-protocol-not-allowed'],
  ]) {
    const result = await ipc.handleOpenTerminalLink({}, url);
    assert(result.ok === false && result.reason === reason && prompts.length === 0 && opened.length === 0
      && logs.at(-1) === `Open link refused: ${reason}`, `terminal link visibly refuses ${reason} before prompting`);
  }

  const untrusted = makeIpc({
    assessSender: () => ({ ok: false, reason: 'untrusted-sender' }),
    confirmTerminalLink: () => { throw new Error('unexpected confirmation'); },
  });
  const denied = await untrusted.ipc.handleOpenTerminalLink({}, raw);
  assert(denied.reason === 'untrusted-sender' && untrusted.opened.length === 0,
    'untrusted terminal link senders are refused before confirmation');

  const declined = ipc.handleOpenTerminalLink({}, raw);
  assert(prompts[0] === target && opened.length === 0, 'shows the normalized destination before opening');
  answer(false);
  assert((await declined).reason === 'cancelled' && opened.length === 0, 'declining the link opens nothing');
  const approved = ipc.handleOpenTerminalLink({}, raw);
  answer(true);
  assert((await approved).ok === true && opened.length === 1 && opened[0] === prompts[1],
    'opens exactly the destination shown for the approved link');

  let trusted = true;
  const stale = makeIpc({
    assessSender: () => trusted ? { ok: true } : { ok: false, reason: 'untrusted-sender' },
    confirmTerminalLink: async () => { trusted = false; return true; },
  });
  assert((await stale.ipc.handleOpenTerminalLink({}, raw)).reason === 'untrusted-sender' && stale.opened.length === 0,
    'the sender must still be trusted when confirmation returns');

  const noPrompt = makeIpc();
  assert((await noPrompt.ipc.handleOpenTerminalLink({}, raw)).reason === 'confirmation-unavailable'
    && noPrompt.opened.length === 0 && noPrompt.logs.length === 1, 'missing confirmation visibly refuses a terminal link');
  const promptFailure = makeIpc({ confirmTerminalLink: async () => { throw new Error(raw); } });
  assert((await promptFailure.ipc.handleOpenTerminalLink({}, raw)).reason === 'confirmation-failed'
    && promptFailure.opened.length === 0 && promptFailure.logs.at(-1) === 'Open link refused: confirmation-failed',
    'a failed link prompt visibly refuses the request without logging the URL');
  const openFailure = makeIpc({ confirmTerminalLink: async () => true, openExternal: async () => { throw new Error(raw); } });
  assert((await openFailure.ipc.handleOpenTerminalLink({}, raw)).reason === 'os-open-failed'
    && openFailure.logs.at(-1) === 'Open link refused: os-open-failed', 'a failed terminal link open is reported as a refusal');
}

{
  const read = (name) => readFileSync(join(__dirname, name), 'utf8');
  const renderer = read('renderer/app.js');
  const main = read('main.js');
  assert(/linkHandler:\s*\{[^}]*activate: openTerminalLink/.test(renderer)
    && renderer.includes('new WebLinksAddon.WebLinksAddon(openTerminalLink)'),
    'both xterm OSC 8 and detected text links share the terminal link handler');
  assert(renderer.includes('cc.openTerminalLink(uri)')
    && read('preload.js').includes("ipcRenderer.invoke('open-terminal-link', u)")
    && main.includes("ipcMain.handle('open-terminal-link', (e, url) => openExternalIpc.handleOpenTerminalLink(e, url));"),
    'terminal links reach the dedicated validated IPC handler');
  assert(/confirmTerminalLink: async \(url\) => \{\s*const result = await dialog\.showMessageBox\(win, \{[^}]*detail: url,[^}]*defaultId: 0,[^}]*cancelId: 0,/.test(main),
    'main shows the URL in a native dialog with Cancel selected by default');
}

{
  let threw = false;
  try { createOpenExternalIpc({ assessSender() {}, validateUrl }); } catch { threw = true; }
  assert(threw, 'constructor throws when openExternal is missing');
}

{
  const { ipc, opened } = makeIpc();
  const r = ipc.handleOpenExternal({}, 'https://github.com/ABlueAI/AgentCommandCenter/pull/1');
  assert(r.ok === true && opened.length === 1, 'a valid https link opens exactly once');
  assert(opened[0] === 'https://github.com/ABlueAI/AgentCommandCenter/pull/1', 'it opens the policy-normalized URL');
}
{
  const { ipc, opened } = makeIpc();
  ipc.handleOpenExternal({}, 'HTTP://Example.COM');
  assert(opened[0] === 'http://example.com/', 'the URL handed to the OS is the parsed href, not the raw string');
}

{
  const { throws } = require('node:assert/strict');
  throws(() => createOpenExternalIpc(), /assessSender must be a function/);
  throws(() => createOpenExternalIpc({ assessSender: () => ({ ok: true }) }), /validateUrl must be a function/);
}

const SECRET = 'SECRETTOKEN';
for (const [label, url] of [
  ['file: URL', `file:///C:/Windows/${SECRET}.exe`],
  ['javascript: URL', `javascript:alert('${SECRET}')`],
  ['vbscript-like custom scheme', `ms-msdt:/id ${SECRET}`],
  ['userinfo spoof', `https://github.com@evil.example/${SECRET}`],
  ['backslash authority', `https:\\\\evil.example\\${SECRET}`],
  ['encoded control', `https://example.com/%0a${SECRET}`],
  ['bidi override', `https://example.com/\u202e${SECRET}`],
  ['surrounding whitespace', ` https://example.com/${SECRET}`],
  ['shorthand without //', `http:example.com/${SECRET}`],
  ['non-string', { href: SECRET }],
]) {
  const { ipc, opened, logs } = makeIpc();
  const r = ipc.handleOpenExternal({}, url);
  assert(r.ok === false && opened.length === 0, `${label}: refused, nothing opened`);
  assert(logs.length === 1 && !logs[0].includes(SECRET), `${label}: refusal logged once without the URL`);
}

for (const appLink of ['claude://claude.ai/new', 'codex://threads/new', 'obsidian://open']) {
  const { ipc, opened, logs } = makeIpc();
  const r = ipc.handleOpenExternal({}, appLink);
  assert(r.ok === false && r.reason === 'url-protocol-not-allowed' && opened.length === 0 && logs.length === 1,
    `${appLink.split(':')[0]}: desktop-app links are Quick Links only, never from a terminal`);
}

{
  let validated = false;
  const { ipc, opened, logs } = makeIpc({
    assessSender: () => ({ ok: false, reason: 'untrusted-sender' }),
    validateUrl: (u) => { validated = true; return validateUrl(u); },
  });
  const r = ipc.handleOpenExternal({}, 'https://example.com/');
  assert(r.ok === false && r.reason === 'untrusted-sender' && opened.length === 0, 'an untrusted sender opens nothing');
  assert(validated === false, 'the sender gate runs before URL validation');
  assert(logs[0] === 'Open link refused: untrusted-sender', 'the refusal names the gate reason');
}

{
  const { ipc, logs } = makeIpc({ openExternal: () => Promise.reject(new Error('no handler')) });
  const r = ipc.handleOpenExternal({}, 'https://example.com/');
  setImmediate(async () => {
    assert(r.ok === true && logs.some((l) => l === 'Open link failed: os-open-failed'), 'an OS open failure is logged, not swallowed');
    {
      const t = makeIpc({ openExternal: () => { throw new Error('boom'); } });
      const r2 = t.ipc.handleOpenExternal({}, 'https://example.com/');
      assert(r2.ok === false && r2.reason === 'os-open-failed' && t.logs.length === 1, 'a throwing openExternal is a visible refusal');
    }
    await testTerminalLinks();
    process.stdout.write(`\nopen-external-ipc: ${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
  });
}
