'use strict';
// Run: node app/nav-guard.test.js
// Plain Node.js -- no framework (matches video-scout-args.test.js). Covers the navigation-lockdown
// decisions so a link or injected navigation can neither open an uncontrolled child window nor
// repoint the app window (AUDIT #3).

const { isHttpUrl, decideWindowOpen, decideNavigation, sanitizeForLog, refusalLine, MAX_LOG_URL } = require('./nav-guard');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const ENTRY = 'file:///D:/Workspace/agent-command-center/app/renderer/index.html';

// --- isHttpUrl -----------------------------------------------------------------------------------
assert(isHttpUrl('https://example.com') && isHttpUrl('http://x'), 'isHttpUrl accepts http/https');
assert(!isHttpUrl('file:///etc/passwd') && !isHttpUrl('javascript:alert(1)') && !isHttpUrl('vbscript:x'), 'isHttpUrl rejects file/javascript/vbscript');
assert(!isHttpUrl(undefined) && !isHttpUrl(null) && !isHttpUrl(42), 'isHttpUrl rejects non-strings');
assert(!isHttpUrl('httpsx://x') && !isHttpUrl(' https://x'), 'isHttpUrl is anchored (no scheme smuggling)');

// --- decideWindowOpen: ALWAYS deny a child window; forward only http(s) to the OS browser --------
{
  const d = decideWindowOpen('https://example.com/');
  assert(d.action === 'deny', 'window.open is always denied (no child window ever)');
  assert(d.externalUrl === 'https://example.com/', 'http(s) popup target is forwarded to the OS browser');
}
assert(decideWindowOpen('file:///C:/secret').externalUrl === null, 'a file: popup is denied and NOT forwarded');
assert(decideWindowOpen('javascript:alert(1)').action === 'deny' && decideWindowOpen('javascript:alert(1)').externalUrl === null, 'a javascript: popup is denied and not forwarded');
assert(decideWindowOpen(undefined).action === 'deny', 'a malformed popup url is still denied');

// --- decideNavigation: allow only the entry doc; forward http(s) out; block everything else ------
{
  const d = decideNavigation(ENTRY, ENTRY);
  assert(d.allow === true && d.externalUrl === null, 'navigation to the app entry document is allowed (e.g. reload)');
}
{
  const d = decideNavigation('https://evil.example/', ENTRY);
  assert(d.allow === false, 'navigation to a remote origin is BLOCKED (window is never repointed)');
  assert(d.externalUrl === 'https://evil.example/', 'a blocked http(s) navigation is instead handed to the OS browser');
}
assert(decideNavigation('file:///C:/Windows/System32/x', ENTRY).allow === false, 'navigation to a different local file is blocked');
assert(decideNavigation('file:///C:/Windows/System32/x', ENTRY).externalUrl === null, 'a blocked file: navigation is not forwarded anywhere');
assert(decideNavigation('javascript:fetch(0)', ENTRY).allow === false, 'a javascript: navigation is blocked');

// --- refusal is SURFACED (AUDIT #2, finding B): every denial produces a visible, safe log line -----
// This models the exact wiring in main.js's guardNav: when decideNavigation blocks a URL, main.js
// emits refusalLine(...) on the main-error channel. We assert the refusal-line contract here (the
// electron send itself is exercised end-to-end in P11).
{
  // a denied file: navigation -> a refusal line naming the guard and the blocked URL is produced
  const url = 'file:///C:/Windows/System32/x';
  const d = decideNavigation(url, ENTRY);
  assert(d.allow === false, 'precondition: the file: navigation is denied');
  const line = refusalLine('will-navigate', url, !!d.externalUrl);
  assert(line.indexOf(url) !== -1, 'the refusal line contains the blocked URL (operator can see WHAT was blocked)');
  assert(/will-navigate/.test(line) && /denied/.test(line), 'the refusal line names which guard fired and that it denied');
  assert(/blocked \(not forwarded\)/.test(line), 'a non-http target is reported as blocked, not silently forwarded');
}
{
  // a denied remote navigation is forwarded to the OS browser -> the line reflects that disposition
  const url = 'https://evil.example/';
  const d = decideNavigation(url, ENTRY);
  const line = refusalLine('will-redirect', url, !!d.externalUrl);
  assert(/forwarded to external browser/.test(line) && line.indexOf(url) !== -1, 'a forwarded http(s) denial is logged as forwarded, with the URL');
}
{
  // window.open is ALWAYS denied -> it always yields a refusal line (never a silent drop)
  const url = 'file:///C:/secret';
  const line = refusalLine('window.open', url, !!decideWindowOpen(url).externalUrl);
  assert(/window\.open/.test(line) && line.indexOf(url) !== -1, 'a denied window.open produces a refusal line with the URL');
}
{
  // allowed navigation (the entry doc reload) is NOT a denial -> main.js emits nothing. We assert the
  // precondition that drives that: allow === true, so guardNav never calls sendRefusal.
  assert(decideNavigation(ENTRY, ENTRY).allow === true, 'the allowed entry-doc navigation is not a denial (no refusal emitted)');
}

// --- sanitizeForLog: the refusal log must not itself become an injection sink ----------------------
assert(sanitizeForLog('file:///a\r\nFAKE LOG LINE') === 'file:///aFAKE LOG LINE', 'CR/LF are stripped so a crafted URL cannot forge extra log lines');
assert(sanitizeForLog('a\x00b\x07c\x1fd\x7fe') === 'abcde', 'C0 control chars and DEL are stripped from the logged URL');
{
  const long = 'https://x/' + 'a'.repeat(MAX_LOG_URL + 50);
  const out = sanitizeForLog(long);
  assert(out.length <= MAX_LOG_URL + '...(truncated)'.length && /\.\.\.\(truncated\)$/.test(out), 'an over-long URL is truncated (cannot flood the Logs tab)');
}
assert(sanitizeForLog(undefined) === 'undefined' && sanitizeForLog(null) === 'null', 'a non-string URL is coerced, not thrown, so a malformed event cannot crash the logger');

// --- Issue #163: the OS-browser hand-off goes through the Quick Links URL policy ------------------
{
  const fs = require('fs');
  const path = require('path');
  const { validateUrl } = require('./quick-links-policy');
  const { createOpenExternalIpc } = require('./open-external-ipc');
  const { externalTarget } = require('./nav-guard');
  const SECRET = 'SECRETTOKEN';
  // Every refusal the policy makes for an http(s)-looking URL: none may reach the OS browser.
  const refused = [
    ['user info', `https://github.com@evil.example/${SECRET}`, 'url-userinfo-not-allowed'],
    ['empty user info', 'https://@evil.example/', 'url-userinfo-not-allowed'],
    ['user and password', `http://user:${SECRET}@example.com/`, 'url-userinfo-not-allowed'],
    ['over 2048 characters', 'https://example.com/' + 'a'.repeat(2048), 'url-too-long'],
    ['control character', `https://example.com/\u0007${SECRET}`, 'url-control-character'],
    ['C1 control character', `https://example.com/\u0085${SECRET}`, 'url-control-character'],
    ['bidi override', `https://example.com/\u202e${SECRET}`, 'url-bidi-character'],
    // `https:\\host` isn't even an http(s):// prefix, so it stops before the policy, as not http.
    ['backslash authority', `https:\\\\evil.example\\${SECRET}`, 'not-http'],
    ['backslash in path', `https://example.com\\@evil.example/`, 'url-backslash'],
    ['malformed percent escape', `https://example.com/%zz${SECRET}`, 'url-invalid-percent-encoding'],
    ['lone percent', 'https://example.com/100%', 'url-invalid-percent-encoding'],
    ['encoded newline', `https://example.com/%0a${SECRET}`, 'url-encoded-control'],
    ['encoded NUL', `https://example.com/%00${SECRET}`, 'url-encoded-control'],
    ['encoded C1 control', `https://example.com/%C2%85${SECRET}`, 'url-encoded-control'],
    ['trailing space', 'https://example.com/ ', 'url-surrounding-whitespace'],
    ['no host after //', 'https:///path', 'url-malformed'],
  ];
  for (const [label, url, reason] of refused) {
    const w = decideWindowOpen(url);
    const n = decideNavigation(url, ENTRY);
    assert(w.action === 'deny' && w.externalUrl === null && w.reason === reason, `window.open, ${label}: denied, not forwarded (${reason})`);
    assert(n.allow === false && n.externalUrl === null && n.reason === reason, `navigation, ${label}: blocked, not forwarded (${reason})`);
    const line = refusalLine('will-navigate', url, false, n.reason);
    assert(reason === 'not-http' ? line.includes('blocked (not forwarded) -- ') : line.includes(`blocked (not forwarded: ${reason})`),
      `${label}: the refusal line names the policy's reason`);
  }
  // The policy's desktop-app links are for stored Quick Links only: a page link never launches an app.
  for (const appLink of ['claude://claude.ai/new', 'codex://threads/new', 'obsidian://open']) {
    assert(decideWindowOpen(appLink).externalUrl === null && decideNavigation(appLink, ENTRY).externalUrl === null,
      `${appLink.split(':')[0]}: never forwarded from a window.open or navigation`);
    assert(decideWindowOpen(appLink).reason === 'not-http', `${appLink.split(':')[0]}: refused as not http(s)`);
  }
  // What IS forwarded is the policy's normalized URL, never the raw string.
  assert(decideWindowOpen('HTTPS://Example.COM').externalUrl === 'https://example.com/', 'window.open forwards the normalized URL');
  assert(decideNavigation('HTTP://Example.COM/a?b#c', ENTRY).externalUrl === 'http://example.com/a?b#c', 'navigation forwards the normalized URL');
  assert(decideWindowOpen('https://github.com/ABlueAI/AgentCommandCenter/pull/1').reason === null, 'an accepted link carries no refusal reason');
  // A non-http(s) target keeps its old line (no reason suffix), and a reason can't inject text.
  assert(/blocked \(not forwarded\) -- /.test(refusalLine('window.open', 'file:///C:/x', false, 'not-http')), 'a non-http target keeps the plain blocked line');
  assert(/blocked \(not forwarded\) -- /.test(refusalLine('window.open', 'https://x/', false, 'Bad\nReason')), 'a reason that is not a bounded constant is left out of the line');
  // Parity: for every input, nav-guard forwards exactly what the open-external IPC channel would open.
  const opened = [];
  const ipc = createOpenExternalIpc({ assessSender: () => ({ ok: true }), validateUrl, openExternal: (u) => { opened.push(u); }, logRefusal() {} });
  const parityInputs = refused.map((r) => r[1]).concat([
    'https://example.com/', 'HTTP://Example.COM', 'http:example.com/', 'file:///C:/x', 'javascript:alert(1)',
    'claude://claude.ai/new', 'https://example.com/%41', 'https://[::1]:8080/x', 'ms-msdt:/id x', undefined, 42,
  ]);
  for (const input of parityInputs) {
    opened.length = 0;
    ipc.handleOpenExternal({}, input);
    const viaIpc = opened.length ? opened[0] : null;
    assert(externalTarget(input).url === viaIpc && decideWindowOpen(input).externalUrl === viaIpc && decideNavigation(input, ENTRY).externalUrl === viaIpc,
      `parity with open-external for ${JSON.stringify(String(input).slice(0, 40))}`);
  }
  // main.js wiring: every OS hand-off from the guards uses the decision's externalUrl, nothing raw.
  const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const calls = src.match(/shell\.openExternal\(([^)]*)\)/g) || [];
  assert(calls.length === 3 && calls.filter((c) => c === 'shell.openExternal(d.externalUrl)').length === 1 &&
    calls.filter((c) => c === 'shell.openExternal(url)').length === 2,
    'main.js calls shell.openExternal only with a guard decision\'s externalUrl or inside the two policy-checked IPC openers');
  for (const factory of ['createOpenExternalIpc({', 'createQuickLinksIpc({']) {
    const oi = src.indexOf(factory);
    const end = oi < 0 ? -1 : src.indexOf('\n  });', oi) >= 0 && src.indexOf('\n  });', oi) < src.indexOf('\n});', oi) ? src.indexOf('\n  });', oi) : src.indexOf('\n});', oi);
    assert(oi >= 0 && /openExternal: \(url\) => shell\.openExternal\(url\)/.test(src.slice(oi, end)),
      `the raw-url call in ${factory.slice(0, -2)} is its injected opener, which runs only after the policy`);
  }
  const gi = src.indexOf('const openOutside = (guard, d, url) => {');
  const guards = gi < 0 ? '' : src.slice(gi, src.indexOf("win.webContents.on('will-redirect'", gi));
  assert(guards.includes('decideWindowOpen(url)') && guards.includes('decideNavigation(url, ENTRY_URL)') &&
    (guards.match(/openOutside\(/g) || []).length === 2 && /\.catch\(\(\) => sendRefusal\(/.test(guards) &&
    guards.includes('refusalLine(guard, url, !!d.externalUrl, d.reason)'),
    'main.js: both guards hand off only through openOutside, which reports a failed open and the refusal reason');
}

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
