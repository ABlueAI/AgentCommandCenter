'use strict';
// Run: node app/open-external-ipc.test.js
// Plain Node.js — no framework. Proves S06's link hardening on the legacy open-external channel: an
// untrusted sender, a URL the Quick Links policy refuses, or a desktop-app link opens NOTHING; a valid
// http(s) link opens exactly once with the policy's normalized URL; refusals never echo the URL.

const { createOpenExternalIpc } = require('./open-external-ipc');
const { validateUrl } = require('./quick-links-policy');

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
  setImmediate(() => {
    assert(r.ok === true && logs.some((l) => l === 'Open link failed: os-open-failed'), 'an OS open failure is logged, not swallowed');
    {
      const t = makeIpc({ openExternal: () => { throw new Error('boom'); } });
      const r2 = t.ipc.handleOpenExternal({}, 'https://example.com/');
      assert(r2.ok === false && r2.reason === 'os-open-failed' && t.logs.length === 1, 'a throwing openExternal is a visible refusal');
    }
    process.stdout.write(`\nopen-external-ipc: ${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
  });
}
