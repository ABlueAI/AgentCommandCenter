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

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
