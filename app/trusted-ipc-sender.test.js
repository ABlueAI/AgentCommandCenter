'use strict';
// Run: node app/trusted-ipc-sender.test.js
// Plain Node.js — exercises the ACTUAL shared trusted-IPC sender gate that both the clipboard
// boundary (V1a) and the library/report boundary (V5b2) use. The whole point of extracting it is
// that there is exactly ONE gate; these tests pin its fail-closed contract.

const { createTrustedSenderGate } = require('./trusted-ipc-sender');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const ENTRY = 'file:///D:/Workspace/agent-command-center/app/renderer/index.html';

function makeWindow(o) {
  o = o || {};
  const mainFrame = { url: o.frameUrl === undefined ? ENTRY : o.frameUrl };
  const wc = { mainFrame };
  const win = { _destroyed: !!o.destroyed, isDestroyed() { return this._destroyed; }, webContents: wc };
  return { win, wc, mainFrame };
}
const makeEvent = (wc, frame) => ({ sender: wc, senderFrame: frame });
const build = (win) => createTrustedSenderGate({ entryUrl: ENTRY, getTrustedWindow: () => win });

// constructor validation (shared by clipboard-ipc constructor)
{
  let threw = 0;
  for (const bad of [
    () => createTrustedSenderGate({ getTrustedWindow: () => ({}) }),          // no entryUrl
    () => createTrustedSenderGate({ entryUrl: '', getTrustedWindow: () => ({}) }),
    () => createTrustedSenderGate({ entryUrl: ENTRY }),                        // no getTrustedWindow
  ]) { try { bad(); } catch { threw++; } }
  assert(threw === 3, 'constructor rejects a missing entryUrl / getTrustedWindow');
}

// trusted main frame accepted
{
  const { win, wc, mainFrame } = makeWindow();
  const g = build(win).assess(makeEvent(wc, mainFrame));
  assert(g.ok === true, 'trusted main frame at the entry document is accepted');
}
// wrong webContents
{
  const trusted = makeWindow();
  const other = { mainFrame: { url: ENTRY } };
  const g = build(trusted.win).assess(makeEvent(other, other.mainFrame));
  assert(g.ok === false && g.reason === 'untrusted-sender', 'a foreign webContents is denied (untrusted-sender)');
}
// subframe (senderFrame !== mainFrame)
{
  const trusted = makeWindow();
  const sub = { url: ENTRY };
  const g = build(trusted.win).assess(makeEvent(trusted.wc, sub));
  assert(g.ok === false && g.reason === 'not-main-frame', 'a subframe of the trusted window is denied (not-main-frame)');
}
// wrong ENTRY_URL
{
  const evil = makeWindow({ frameUrl: 'file:///D:/Workspace/agent-command-center/app/renderer/evil.html' });
  const g = build(evil.win).assess(makeEvent(evil.wc, evil.mainFrame));
  assert(g.ok === false && g.reason === 'untrusted-document', 'the trusted window at a non-entry document is denied (untrusted-document)');
}
// destroyed window
{
  const dead = makeWindow({ destroyed: true });
  const g = build(dead.win).assess(makeEvent(dead.wc, dead.mainFrame));
  assert(g.ok === false && g.reason === 'no-trusted-window', 'a destroyed trusted window is denied (no-trusted-window)');
  const gNull = build(null).assess(makeEvent({}, {}));
  assert(gNull.ok === false && gNull.reason === 'no-trusted-window', 'a null trusted window is denied (no-trusted-window)');
}
// no event at all
{
  const t = makeWindow();
  const g = build(t.win).assess(undefined);
  assert(g.ok === false && g.reason === 'untrusted-sender', 'a missing event is denied (untrusted-sender), not a crash');
}
// torn-down frame: url getter throws -> refuse, not throw
{
  const torn = makeWindow();
  Object.defineProperty(torn.mainFrame, 'url', { get() { throw new Error('frame gone'); } });
  let threw = false, res;
  try { res = build(torn.win).assess(makeEvent(torn.wc, torn.mainFrame)); } catch { threw = true; }
  assert(!threw && res.ok === false && res.reason === 'untrusted-document', 'a frame with a throwing url getter refuses (untrusted-document), never throws');
}
// torn-down webContents: mainFrame getter throws -> refuse
{
  const trusted = makeWindow();
  Object.defineProperty(trusted.wc, 'mainFrame', { get() { throw new Error('wc gone'); } });
  let threw = false, res;
  try { res = build(trusted.win).assess(makeEvent(trusted.wc, { url: ENTRY })); } catch { threw = true; }
  assert(!threw && res.ok === false && res.reason === 'not-main-frame', 'a webContents with a throwing mainFrame getter refuses (not-main-frame), never throws');
}

process.stdout.write(`\ntrusted-ipc-sender: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
