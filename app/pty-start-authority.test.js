'use strict';
// Run: node app/pty-start-authority.test.js
//
// TRUSTED-IPC + PIPELINE-ORDER MATRIX for the `pty-start` authority.
//
// The sender gate under test is the REAL canonical `trusted-ipc-sender.js` (the same construction
// admission-ipc.test.js uses), not a re-implementation — there must be exactly one trust contract.
//
// This suite proves ORDER as well as outcome: an untrusted sender must never reach classification,
// and classification must never reach role-definition resolution. Zero-spawn is proven separately,
// against the real registered handler, in pty-start-authority-main.test.js — an isolated helper that
// cannot spawn could not prove main respects its own refusal.

const { createPtyStartAuthority } = require('./pty-start-authority');
const { createTrustedSenderGate } = require('./trusted-ipc-sender');
const { classifyPtyLaunch } = require('./pty-launch-classify');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  \u2713 ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
function section(t) { process.stdout.write('\n' + t + '\n'); }

const ENTRY = 'file:///D:/Workspace/agent-command-center/app/renderer/index.html';
const VALID_ROLES = new Set(['builder', 'reviewer', 'codebase-scout', 'web-scout', 'operator', 'source-scout']);
const FENCED_ROLES = new Set(['web-scout', 'operator', 'source-scout']);
const VALID_CLIS = new Set(['claude', 'codex', 'gemini']);

function makeWindow() {
  const mainFrame = { url: ENTRY };
  const wc = { mainFrame };
  return { isDestroyed: () => false, webContents: wc, _frame: mainFrame };
}
const goodEvent = (win) => ({ sender: win.webContents, senderFrame: win._frame });

function build(win, opts) {
  const o = opts || {};
  const calls = { classify: 0, resolve: 0, policy: 0, refusals: [] };
  const gate = createTrustedSenderGate({ entryUrl: ENTRY, getTrustedWindow: () => win });
  const authority = createPtyStartAuthority({
    assessSender: (e) => gate.assess(e),
    classify: (x) => { calls.classify++; return classifyPtyLaunch(x, { validRoles: VALID_ROLES, fencedRoles: FENCED_ROLES, validClis: VALID_CLIS }); },
    resolveDefinition: (req) => { calls.resolve++; return o.resolve ? o.resolve(req) : { ok: true, text: 'T', path: 'P', scope: 'user' }; },
    assertPolicy: (req) => { calls.policy++; return o.policy ? o.policy(req) : { ok: true, hookPath: 'H' }; },
    logRefusal: (line) => calls.refusals.push(line),
  });
  return { authority, calls };
}

section('CONSTRUCTION IS FAIL-CLOSED');
for (const missing of ['assessSender', 'classify', 'resolveDefinition', 'assertPolicy']) {
  const deps = { assessSender: () => ({ ok: true }), classify: () => ({ ok: true }), resolveDefinition: () => ({ ok: true }), assertPolicy: () => ({ ok: true }) };
  delete deps[missing];
  let threw = false;
  try { createPtyStartAuthority(deps); } catch (e) { threw = true; }
  assert(threw, 'refuses to construct without ' + missing);
}

section('TRUSTED SENDER \u2014 the one correct shape succeeds');
{
  const win = makeWindow();
  const { authority, calls } = build(win);
  const r = authority.assess(goodEvent(win), { id: 'p', role: 'web-scout', cli: 'claude' });
  assert(r.ok === true && r.launch.fenced === true, 'trusted window + main frame + canonical document is accepted');
  assert(calls.classify === 1, 'and classification ran exactly once');
  assert(calls.resolve === 0 && calls.policy === 0, 'phase 2 did NOT run during assess (ordering)');
}

section('UNTRUSTED SENDERS \u2014 refuse BEFORE classification');
{
  const cases = [
    // The window is gone, but a well-formed event still arrives from a now-orphaned renderer.
    ['no trusted window', () => null, () => goodEvent(makeWindow()), 'no-trusted-window'],
    ['destroyed window', () => { const w = makeWindow(); w.isDestroyed = () => true; return w; }, (w) => goodEvent(w), 'no-trusted-window'],
    ['wrong sender', makeWindow, () => ({ sender: { other: true }, senderFrame: { url: ENTRY } }), 'untrusted-sender'],
    ['subframe', makeWindow, (w) => ({ sender: w.webContents, senderFrame: { url: ENTRY } }), 'not-main-frame'],
    ['wrong document', makeWindow, (w) => { w._frame.url = 'file:///C:/evil.html'; return goodEvent(w); }, 'untrusted-document'],
    ['undefined event', makeWindow, () => undefined, 'untrusted-sender'],
    ['malformed event', makeWindow, () => ({}), 'untrusted-sender'],
    ['null senderFrame', makeWindow, (w) => ({ sender: w.webContents, senderFrame: null }), 'not-main-frame'],
  ];
  for (const [label, mkWin, mkEvent, expected] of cases) {
    const win = mkWin();
    const { authority, calls } = build(win);
    const r = authority.assess(mkEvent(win), { id: 'p', role: 'web-scout' });
    assert(r.ok === false && r.reason === expected, label + ' refuses with ' + expected);
    assert(calls.classify === 0, label + ': classification never ran');
    assert(calls.resolve === 0 && calls.policy === 0, label + ': no definition was resolved');
  }
}
{
  // A torn-down frame whose getters THROW must degrade to a refusal, never a main-process throw.
  const win = makeWindow();
  Object.defineProperty(win._frame, 'url', { get() { throw new Error('disposed'); } });
  const { authority, calls } = build(win);
  let r = null, threw = false;
  try { r = authority.assess(goodEvent(win), { role: 'web-scout' }); } catch (e) { threw = true; }
  assert(!threw && r.ok === false, 'a torn-down frame refuses instead of throwing');
  assert(calls.classify === 0, 'and still never reaches classification');
}
{
  const win = makeWindow();
  Object.defineProperty(win.webContents, 'mainFrame', { get() { throw new Error('disposed'); } });
  const { authority } = build(win);
  let threw = false;
  try { authority.assess({ sender: win.webContents, senderFrame: {} }, { role: 'web-scout' }); }
  catch (e) { threw = true; }
  assert(!threw, 'a throwing mainFrame getter refuses instead of throwing');
}

section('CLASSIFICATION REFUSALS \u2014 refuse BEFORE any definition is resolved');
for (const bad of [null, undefined, 'x', 42, [], { role: 'nope' }, { role: 'web-scout', videoScout: 1 }, { role: 'video-scout' }]) {
  const win = makeWindow();
  const { authority, calls } = build(win);
  const r = authority.assess(goodEvent(win), bad);
  assert(r.ok === false, 'refuses malformed/hostile opts: ' + JSON.stringify(bad));
  assert(calls.resolve === 0 && calls.policy === 0, 'and resolves no role definition for ' + JSON.stringify(bad));
}

section('PHASE 2 \u2014 resolution then policy, each able to refuse');
{
  const win = makeWindow();
  const { authority, calls } = build(win);
  const ok = authority.authorizeFencedRole({ role: 'web-scout', cwd: 'D:\\sandbox' });
  assert(ok.ok === true && ok.hookPath === 'H', 'a clean resolution + policy accepts');
  assert(calls.resolve === 1 && calls.policy === 1, 'both stages ran once, in order');
}
{
  const win = makeWindow();
  const { authority, calls } = build(win, { resolve: () => ({ ok: false, reason: 'resolve-managed-scope-present' }) });
  const r = authority.authorizeFencedRole({ role: 'web-scout', cwd: 'D:\\sandbox' });
  assert(r.ok === false && r.reason === 'resolve-managed-scope-present', 'a resolution refusal propagates');
  assert(calls.policy === 0, 'and policy is never consulted for an unresolved definition');
}
{
  const win = makeWindow();
  const { authority } = build(win, { policy: () => ({ ok: false, reason: 'fence-policy-forbidden-tool-declared' }) });
  const r = authority.authorizeFencedRole({ role: 'web-scout', cwd: 'D:\\sandbox' });
  assert(r.ok === false && r.reason === 'fence-policy-forbidden-tool-declared', 'a policy refusal propagates');
}
{
  const win = makeWindow();
  const { authority } = build(win, { resolve: () => null, policy: () => null });
  const r = authority.authorizeFencedRole({ role: 'web-scout', cwd: 'D:\\x' });
  assert(r.ok === false, 'a dependency returning a junk value fails closed');
}

section('REFUSAL LOGGING IS BOUNDED');
{
  const win = makeWindow();
  const { authority, calls } = build(win);
  const secret = 'D:\\Users\\levij\\.ssh\\id_rsa';
  authority.assess(goodEvent(win), { role: secret, cwd: secret, initialPrompt: secret });
  assert(calls.refusals.length === 1, 'exactly one refusal line was emitted');
  assert(calls.refusals[0].indexOf(secret) === -1, 'and it contains no renderer-supplied payload');
  assert(calls.refusals[0].indexOf('pty-start refused') === 0, 'and it is the bounded refusal form');
}

process.stdout.write('\npty-start-authority: ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
