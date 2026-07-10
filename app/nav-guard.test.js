'use strict';
// Run: node app/nav-guard.test.js
// Plain Node.js -- no framework (matches video-scout-args.test.js). Covers the navigation-lockdown
// decisions so a link or injected navigation can neither open an uncontrolled child window nor
// repoint the app window (AUDIT #3).

const { isHttpUrl, decideWindowOpen, decideNavigation } = require('./nav-guard');

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

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
