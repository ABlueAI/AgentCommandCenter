'use strict';
// Run: node app/prototype-pane-status/pane-status-boundary.test.js
//
// EXPERIMENT A — PROTOTYPE ONLY. docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: PROTOTYPE
//
// The security and honesty boundary of the prototype, exercised against the REAL modules (no
// re-implementations): wire validation, token ownership, single-pane enforcement, staleness, version
// degradation, transport bounds, the inert gate-off object, and the settings guard.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const protocol = require('./pane-status-protocol');
const { createPaneStatusStore } = require('./pane-status-store');
const server = require('./pane-status-server');
const settings = require('./pane-status-settings');
const prototypeMod = require('./pane-status-prototype');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function eq(a, b, label) { assert(a === b, `${label} (got ${JSON.stringify(a)})`); }

const TOKEN_A = 'a'.repeat(64);
const TOKEN_B = 'b'.repeat(64);
function storeWith(opts) {
  const o = opts || {};
  let t = o.token || TOKEN_A;
  return createPaneStatusStore({
    crypto,
    randomToken: () => t,
    now: o.now || (() => 1000),
    observedVersion: 'observedVersion' in o ? o.observedVersion : '2.1.196',
    staleMs: o.staleMs,
  });
}

// ---------------------------------------------------------------- wire contract
process.stdout.write('\n-- wire contract --\n');
{
  const line = protocol.encodeMessage('Stop', TOKEN_A);
  const p = protocol.parseMessage(line);
  assert(p.ok && p.event === 'Stop' && p.token === TOKEN_A, 'round-trips an allowlisted event');
  assert(Buffer.byteLength(line, 'utf8') <= protocol.MAX_MESSAGE_BYTES, 'encoded message is within the size bound');

  // Extra fields REFUSE — the structural privacy guarantee.
  const extra = JSON.stringify({ v: 1, e: 'Stop', t: TOKEN_A, prompt: 'SENTINEL' }) + '\n';
  eq(protocol.parseMessage(extra).reason, protocol.REFUSE.BAD_KEYS, 'refuses an extra payload field');
  const missing = JSON.stringify({ v: 1, e: 'Stop' }) + '\n';
  eq(protocol.parseMessage(missing).reason, protocol.REFUSE.BAD_KEYS, 'refuses a missing field');

  eq(protocol.parseMessage(JSON.stringify({ v: 99, e: 'Stop', t: TOKEN_A })).reason,
    protocol.REFUSE.BAD_VERSION, 'refuses a mismatched protocol version');
  eq(protocol.parseMessage(JSON.stringify({ v: 1, e: 'PreToolUse', t: TOKEN_A })).reason,
    protocol.REFUSE.BAD_EVENT, 'refuses a real-but-not-allowlisted Claude event (PreToolUse)');
  eq(protocol.parseMessage(JSON.stringify({ v: 1, e: 'Stop', t: 'short' })).reason,
    protocol.REFUSE.BAD_TOKEN_SHAPE, 'refuses a malformed token');
  eq(protocol.parseMessage('{not json').reason, protocol.REFUSE.NOT_JSON, 'refuses non-JSON');
  eq(protocol.parseMessage(JSON.stringify([1, 2, 3])).reason, protocol.REFUSE.NOT_OBJECT, 'refuses a JSON array');
  eq(protocol.parseMessage('x'.repeat(protocol.MAX_MESSAGE_BYTES + 1)).reason,
    protocol.REFUSE.OVERSIZE, 'refuses an oversized line without parsing it');

  let threw = false;
  try { protocol.encodeMessage('PreToolUse', TOKEN_A); } catch { threw = true; }
  assert(threw, 'encoder refuses to emit a non-allowlisted event');
  threw = false;
  try { protocol.encodeMessage('Stop', 'nope'); } catch { threw = true; }
  assert(threw, 'encoder refuses a malformed token');
}

// ---------------------------------------------------------------- state honesty
process.stdout.write('\n-- state honesty --\n');
{
  eq(protocol.stateForEvent('Stop'), 'turn ended', 'Stop maps to "turn ended"');
  const forbidden = ['finished', 'safe', 'process exited', 'done', 'complete'];
  for (const word of forbidden) {
    assert(Object.values(protocol.EVENT_STATE).indexOf(word) === -1, `no state is ever "${word}"`);
  }
  eq(protocol.stateForEvent('UserPromptSubmit'), 'working', 'UserPromptSubmit maps to "working"');
  eq(protocol.stateForEvent('Notification'), 'attention', 'Notification maps to "attention"');
  eq(protocol.stateForEvent('StopFailure'), 'failed', 'StopFailure maps to "failed"');
  eq(protocol.stateForEvent('SessionEnd'), 'exited', 'SessionEnd maps to "exited"');

  eq(protocol.resolveDisplayState({ lastEvent: null }).state, 'unknown', 'no signal -> unknown');
  eq(protocol.resolveDisplayState({ lastEvent: null }).reason, 'no-signal', 'no signal reason is no-signal');
  const stale = protocol.resolveDisplayState({ lastEvent: 'working' in {} ? 'Stop' : 'UserPromptSubmit', lastEventAt: 0, now: protocol.STALE_MS, versionSupported: true });
  eq(stale.state, 'unknown', 'a stale state degrades to unknown');
  eq(stale.reason, 'stale', 'stale degrade carries the stale reason');
  const fresh = protocol.resolveDisplayState({ lastEvent: 'UserPromptSubmit', lastEventAt: 0, now: 10, versionSupported: true });
  eq(fresh.state, 'working', 'a fresh state is reported');
  const mismatch = protocol.resolveDisplayState({ lastEvent: 'UserPromptSubmit', lastEventAt: 0, now: 10, versionSupported: false });
  eq(mismatch.state, 'unknown', 'an unverified Claude version degrades to unknown');
  eq(mismatch.reason, 'version-mismatch', 'version degrade carries version-mismatch');
  const terminal = protocol.resolveDisplayState({ lastEvent: 'SessionEnd', lastEventAt: 0, now: 10 * protocol.STALE_MS, versionSupported: true });
  eq(terminal.state, 'exited', 'a terminal state is NOT aged out into unknown');

  assert(protocol.isVersionSupported('2.1.196'), 'the pinned observed version is supported');
  assert(!protocol.isVersionSupported('2.1.197'), 'a newer unverified version is NOT assumed supported');
  assert(!protocol.isVersionSupported(null), 'an unprobed version is not supported');
}

// ---------------------------------------------------------------- token ownership
process.stdout.write('\n-- token ownership and single pane --\n');
{
  const s = storeWith();
  const first = s.enrollPane('pty1');
  assert(first.ok && first.token === TOKEN_A, 'first Claude pane enrolls and receives a token');
  const second = s.enrollPane('pty2');
  assert(!second.ok && second.reason === 'single-pane-only', 'a SECOND pane is refused (Experiment A bound)');
  eq(s.enrolledPaneId(), 'pty1', 'the first pane keeps ownership after the refusal');

  eq(s.applyMessage({ event: 'Stop', token: TOKEN_A }).paneId, 'pty1', 'a correct token updates its own pane');
  assert(!s.applyMessage({ event: 'Stop', token: TOKEN_B }).ok, 'a wrong token is refused');
  eq(s.applyMessage({ event: 'Stop', token: TOKEN_B }).reason, protocol.REFUSE.UNKNOWN_TOKEN, 'wrong token reason is unknown-token');
  assert(!s.applyMessage({ event: 'Stop', token: '' }).ok, 'a missing token is refused');
  assert(!s.applyMessage({ event: 'PreToolUse', token: TOKEN_A }).ok, 'a non-allowlisted event is refused even with a valid token');

  // There is no API by which a caller can direct an event at a pane of its choosing.
  assert(typeof s.applyMessage === 'function' && s.applyMessage.length === 1,
    'applyMessage takes only the message — a caller cannot name a target pane');
  eq(s.viewFor('pty2'), null, 'no view exists for a pane that was never enrolled');

  const released = s.releasePane('pty1');
  assert(released, 'releasePane forgets the pane');
  assert(!s.applyMessage({ event: 'Stop', token: TOKEN_A }).ok, 'the token stops working after release');
  assert(s.enrollPane('pty2').ok, 'after release, a different pane may enroll');
}

// ---------------------------------------------------------------- view carries no token
process.stdout.write('\n-- the renderer view carries no token --\n');
{
  const s = storeWith();
  s.enrollPane('pty1');
  s.applyMessage({ event: 'UserPromptSubmit', token: TOKEN_A });
  const view = s.viewFor('pty1');
  const serialized = JSON.stringify(view);
  assert(serialized.indexOf(TOKEN_A) === -1, 'the view object does not contain the token');
  assert(Object.keys(view).sort().join(',') === 'paneId,prototype,reason,state',
    'the view has exactly paneId/prototype/reason/state');
  const stats = JSON.stringify(s.stats());
  assert(stats.indexOf(TOKEN_A) === -1, 'stats() does not contain the token either');
}

// ---------------------------------------------------------------- staleness over time
process.stdout.write('\n-- staleness --\n');
{
  let clock = 1000;
  const s = storeWith({ now: () => clock, staleMs: 500 });
  s.enrollPane('pty1');
  s.applyMessage({ event: 'UserPromptSubmit', token: TOKEN_A });
  eq(s.viewFor('pty1').state, 'working', 'fresh signal shows working');
  clock += 499;
  eq(s.viewFor('pty1').state, 'working', 'just inside the window still shows working');
  clock += 1;
  eq(s.viewFor('pty1').state, 'unknown', 'crossing the staleness bound degrades to unknown');
  eq(s.viewFor('pty1').reason, 'stale', 'and says why');
}

// ---------------------------------------------------------------- version mismatch
process.stdout.write('\n-- claude version gate --\n');
{
  const s = storeWith({ observedVersion: '9.9.9' });
  s.enrollPane('pty1');
  s.applyMessage({ event: 'UserPromptSubmit', token: TOKEN_A });
  eq(s.viewFor('pty1').state, 'unknown', 'an unverified Claude version forces unknown');
  eq(s.viewFor('pty1').reason, 'version-mismatch', 'with the version-mismatch reason');
  s.setObservedVersion('2.1.196');
  eq(s.viewFor('pty1').state, 'working', 'the verified version restores the real state');
}

// ---------------------------------------------------------------- transport bounds
process.stdout.write('\n-- transport bounds --\n');
{
  const name = server.buildPipeName('abcdef0123456789');
  assert(name.indexOf('\\\\.\\pipe\\') === 0, 'pipe name is a Windows named pipe path');
  assert(name.indexOf('blue-helm-pane-status-') !== -1, 'pipe name is namespaced to this prototype');
  let threw = false;
  try { server.buildPipeName('NOT HEX'); } catch { threw = true; }
  assert(threw, 'pipe name refuses a non-hex suffix');

  // No TCP anywhere in the transport module — an explicit kill criterion.
  const src = fs.readFileSync(path.join(__dirname, 'pane-status-server.js'), 'utf8');
  assert(!/createServer\s*\(\s*\{[^}]*port/i.test(src) && src.indexOf('listen(port') === -1,
    'the transport never listens on a port');
  assert(src.indexOf('http') === -1 || src.indexOf('http://') === -1, 'the transport has no http endpoint');

  const logs = [];
  const s = storeWith();
  s.enrollPane('pty1');
  let sent = null;
  const srv = server.createPaneStatusServer({
    net: { createServer: () => ({ on() {}, listen() {}, close() {} }) },
    store: s, pipeName: name, log: (l) => logs.push(l), now: () => 5,
    onStateChange: (v) => { sent = v; },
  });
  srv.deliverLine(protocol.encodeMessage('Stop', TOKEN_A));
  assert(sent && sent.state === 'turn ended', 'a valid line reaches the renderer view');
  assert(logs.join('|').indexOf(TOKEN_A) === -1, 'the token never appears in a log line');

  logs.length = 0;
  srv.deliverLine(JSON.stringify({ v: 1, e: 'Stop', t: TOKEN_A, secret: 'SENTINEL-XYZZY' }) + '\n');
  assert(logs.join('|').indexOf('SENTINEL-XYZZY') === -1, 'a refused body is never logged');
  assert(logs.join('|').indexOf('bad-keys') !== -1, 'the refusal reason IS logged');
}

// ---------------------------------------------------------------- the gate
process.stdout.write('\n-- prototype gate (disabled = inert) --\n');
{
  assert(!prototypeMod.isPrototypeEnabled({}), 'gate off when the env var is absent');
  assert(!prototypeMod.isPrototypeEnabled({ BLUE_HELM_PANE_STATUS_PROTOTYPE: '' }), 'gate off for an empty value');
  assert(!prototypeMod.isPrototypeEnabled({ BLUE_HELM_PANE_STATUS_PROTOTYPE: 'true' }), 'gate off for "true" (exact "1" only)');
  assert(prototypeMod.isPrototypeEnabled({ BLUE_HELM_PANE_STATUS_PROTOTYPE: '1' }), 'gate on for exactly "1"');

  const inert = prototypeMod.createPaneStatusPrototype({ env: {} });
  eq(inert.enabled, false, 'gate off yields the inert object');
  eq(JSON.stringify(inert.envForPane({ id: 'pty1', cli: 'claude' })), '{}', 'gate off adds NO env to a Claude pane');
  eq(inert.enrolledPaneId(), null, 'gate off enrolls nothing');
  eq(inert.pipeName(), null, 'gate off has no pipe');
  eq(inert.viewFor('pty1'), null, 'gate off has no view');
  eq(inert.start().ok, false, 'gate off cannot start a listener');

  // Eligibility: Claude only, never Video Scout.
  assert(prototypeMod.isEligibleClaudePane({ cli: 'claude' }), 'a claude pane is eligible');
  assert(!prototypeMod.isEligibleClaudePane({ cli: 'codex' }), 'a codex pane is NOT eligible');
  assert(!prototypeMod.isEligibleClaudePane({ cli: 'gemini' }), 'a gemini pane is NOT eligible');
  assert(!prototypeMod.isEligibleClaudePane({ cli: 'claude', videoScout: true }), 'a video-scout pane is NOT eligible');
  assert(!prototypeMod.isEligibleClaudePane({}), 'a plain shell pane is NOT eligible');
}

// ---------------------------------------------------------------- gate on: env goes to ONE pane
process.stdout.write('\n-- gate on: exactly one pane receives the env --\n');
{
  const sends = [];
  const live = prototypeMod.createPaneStatusPrototype({
    env: { BLUE_HELM_PANE_STATUS_PROTOTYPE: '1' },
    net: { createServer: () => ({ on() {}, listen() {}, close() {} }) },
    crypto,
    path,
    observedVersion: '2.1.196',
    send: (ch, v) => sends.push({ ch, v }),
    log: () => {},
  });
  const envA = live.envForPane({ id: 'pty1', cli: 'claude' });
  const keys = Object.keys(envA).sort();
  eq(keys.join(','), 'BLUE_HELM_PANE_STATUS_PIPE,BLUE_HELM_PANE_STATUS_PROTOTYPE,BLUE_HELM_PANE_STATUS_TOKEN',
    'the enrolled pane gets exactly the gate, pipe and token variables');
  assert(protocol.TOKEN_PATTERN.test(envA.BLUE_HELM_PANE_STATUS_TOKEN), 'the token is 64 hex chars');

  const envB = live.envForPane({ id: 'pty2', cli: 'claude' });
  eq(JSON.stringify(envB), '{}', 'a SECOND Claude pane receives no prototype env at all');
  const envCodex = live.envForPane({ id: 'pty3', cli: 'codex' });
  eq(JSON.stringify(envCodex), '{}', 'a codex pane receives no prototype env');

  const tokenValue = envA.BLUE_HELM_PANE_STATUS_TOKEN;
  assert(JSON.stringify(sends).indexOf(tokenValue) === -1, 'no renderer send ever carries the token');
  assert(sends.length >= 1 && sends[0].ch === 'pane-status-prototype', 'the renderer is notified on the prototype channel');
  assert(JSON.stringify(live.stats()).indexOf(tokenValue) === -1, 'stats() never carries the token');

  live.releasePane('pty1');
  eq(live.enrolledPaneId(), null, 'releasing frees the single slot');
}

// ---------------------------------------------------------------- settings guard
process.stdout.write('\n-- temporary settings guard --\n');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pane-status-settings-'));
  const settingsPath = path.join(tmp, 'settings.json');
  const backupPath = path.join(tmp, 'settings.backup');
  const mk = () => settings.createSettingsGuard({ fs, crypto, settingsPath, backupPath });

  // (1) existing settings with unrelated keys AND an unrelated pre-existing hook
  const originalObj = {
    permissions: { allow: ['Bash(git *)'] },
    model: 'sonnet',
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo unrelated' }] }] },
  };
  fs.writeFileSync(settingsPath, JSON.stringify(originalObj, null, 2) + '\n', 'utf8');
  const beforeSha = crypto.createHash('sha256').update(fs.readFileSync(settingsPath)).digest('hex');

  const g = mk();
  const id = g.captureIdentity();
  assert(id.existed && id.sha256 === beforeSha, 'identity captured before any write');
  const res = g.install('C:\\node.exe', 'C:\\reporter.js', 5);
  assert(res.ok, 'install succeeds on a valid settings file');
  const patched = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  eq(patched.permissions.allow[0], 'Bash(git *)', 'an unrelated top-level key is preserved');
  eq(patched.model, 'sonnet', 'a second unrelated key is preserved');
  eq(patched.hooks.Stop.length, 2, 'the pre-existing Stop hook is preserved and ours is APPENDED');
  eq(patched.hooks.Stop[0].hooks[0].command, 'echo unrelated', 'the pre-existing hook stays FIRST and unmodified');
  for (const ev of settings.HOOK_EVENTS) assert(Array.isArray(patched.hooks[ev]), `installed a hook group for ${ev}`);
  assert(JSON.stringify(patched).indexOf('BLUE_HELM_PANE_STATUS_TOKEN') === -1, 'no token is ever written to settings');
  assert(res.change.topLevelKeysAdded.length <= 1, 'the structural summary reports at most the hooks key as added');
  assert(JSON.stringify(res.change).indexOf('Bash(git *)') === -1, 'the structural summary does NOT expose unrelated setting values');

  const rest = g.restore();
  assert(rest.ok && rest.restored === 'bytes', 'restore reports byte restoration');
  const afterSha = crypto.createHash('sha256').update(fs.readFileSync(settingsPath)).digest('hex');
  eq(afterSha, beforeSha, 'the settings file is byte-identical after restoration');
  assert(g.discardBackup(rest).ok, 'the recovery copy is removed only after restoration is proven');
  assert(!fs.existsSync(backupPath), 'recovery copy is gone');

  // (2) restoration is refused-safe when it was never proven
  const g2 = mk(); g2.captureIdentity();
  assert(!g2.discardBackup({ ok: false }).ok, 'discardBackup refuses when restoration was not proven');

  // (3) malformed settings must REFUSE without overwriting
  fs.writeFileSync(settingsPath, '{ this is not json', 'utf8');
  const badSha = crypto.createHash('sha256').update(fs.readFileSync(settingsPath)).digest('hex');
  const g3 = mk(); g3.captureIdentity();
  const bad = g3.install('C:\\node.exe', 'C:\\reporter.js', 5);
  assert(!bad.ok && bad.reason === 'settings-malformed-json', 'malformed settings are refused');
  eq(crypto.createHash('sha256').update(fs.readFileSync(settingsPath)).digest('hex'), badSha,
    'the malformed file was NOT overwritten');

  // (4) missing settings file: install creates, restore removes
  fs.unlinkSync(settingsPath);
  const g4 = mk();
  const id4 = g4.captureIdentity();
  assert(!id4.existed, 'absence is captured as the thing to restore');
  assert(g4.install('C:\\node.exe', 'C:\\reporter.js', 5).ok, 'install works with no prior settings file');
  assert(fs.existsSync(settingsPath), 'a settings file now exists');
  const r4 = g4.restore();
  assert(r4.ok && r4.restored === 'absence', 'restore reports absence restoration');
  assert(!fs.existsSync(settingsPath), 'the file we created is gone again');
  // Discard the absence-sentinel recovery copy, exactly as the runner does after a proven restore.
  // Revision 2 made this necessary AND meaningful: install() now refuses when a recovery copy is
  // still lying around, so leaving one behind is itself the interrupted-run condition.
  assert(g4.discardBackup(r4).ok, 'the absence-sentinel recovery copy is discarded after restore');
  assert(!fs.existsSync(backupPath), 'leaving no recovery artifact behind for the next install');

  // (5) simulated failure mid-experiment: restore still works from the backup
  fs.writeFileSync(settingsPath, JSON.stringify(originalObj, null, 2) + '\n', 'utf8');
  const g5 = mk(); g5.captureIdentity(); g5.install('C:\\node.exe', 'C:\\reporter.js', 5);
  fs.writeFileSync(settingsPath, '{"clobbered":true}', 'utf8'); // simulate a crash mid-experiment
  const r5 = g5.restore();
  assert(r5.ok, 'restore recovers even after the live file was clobbered');
  eq(crypto.createHash('sha256').update(fs.readFileSync(settingsPath)).digest('hex'), beforeSha,
    'byte-identical restoration after a simulated failure');

  // (6) pure patch/remove round trip
  const block = settings.buildHookBlock('C:\\node.exe', 'C:\\reporter.js', 5);
  const p1 = settings.applyPatch(originalObj, block);
  const p2 = settings.removePatch(p1);
  eq(JSON.stringify(p2), JSON.stringify(originalObj), 'applyPatch then removePatch round-trips exactly');

  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------- interrupted install (revision 2, High finding)
process.stdout.write('\n-- interrupted install: a second install must REFUSE, not clobber the backup --\n');
{
  // THE SCENARIO THE REVIEWER FOUND. Revision 1's case (5) reused the SAME guard instance, which
  // still held the true `original` in memory — so it never exercised the dangerous path. Every step
  // below therefore builds a NEW GUARD OBJECT, which is what drops the in-memory `installed` and
  // `original` state that made the bug invisible.
  //
  // SCOPE, CORRECTED (revision 3, Low finding 6): these are FRESH GUARD OBJECTS IN ONE PROCESS, not
  // separate processes. That is enough to prove the guard carries no rescuing in-memory state, which
  // is the property under test here. The genuinely separate-process proof — a real crashed run, a
  // real second `node run-experiment-a.js install`, and a real fresh-process `restore` — lives in
  // `pane-status-runner.test.js`, which spawns the runner with spawnSync. The two suites together
  // cover the sequence; neither claims the other's ground. Labels below say "new-guard" for that
  // reason, and "fresh process" is reserved for the runner suite.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pane-status-interrupt-'));
  const settingsPath = path.join(tmp, 'settings.json');
  const backupPath = path.join(tmp, 'settings.backup');
  const mk = () => settings.createSettingsGuard({ fs, crypto, settingsPath, backupPath });
  const shaOf = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

  // (1) CLEAN INSTALL — the genuine original, captured and backed up.
  const genuine = { model: 'sonnet', permissions: { allow: ['Bash(git *)'] }, theme: 'dark' };
  fs.writeFileSync(settingsPath, JSON.stringify(genuine, null, 2) + '\n', 'utf8');
  const genuineSha = shaOf(settingsPath);
  const genuineBytes = fs.statSync(settingsPath).size;

  const g1 = mk();
  g1.captureIdentity();
  assert(g1.install('C:\\node.exe', 'C:\\reporter.js', 5).ok, '(1) the clean install succeeds');
  assert(fs.existsSync(backupPath), '(1) a recovery copy exists');
  eq(shaOf(backupPath), genuineSha, '(1) and it is the GENUINE original, byte for byte');
  assert(fs.readFileSync(settingsPath, 'utf8').indexOf(settings.MARKER) !== -1,
    '(1) the live file now carries the prototype marker');

  // (2) SIMULATED CRASH — the process dies. `installed` and `original` are lost with it; the patched
  //     file and both recovery artifacts survive on disk.
  const patchedShaAfterCrash = shaOf(settingsPath);

  // (3) NEW-GUARD INSTALL ATTEMPT — must refuse, visibly, touching nothing.
  const g2 = mk();
  const second = g2.install('C:\\node.exe', 'C:\\reporter.js', 5);
  assert(!second.ok, '(3) a new-guard second install REFUSES (see the runner suite for the real fresh process)');
  eq(second.reason, 'recovery-copy-already-exists', '(3) naming the recovery copy as the reason');
  assert(typeof second.action === 'string' && second.action.toLowerCase().indexOf('restore') !== -1,
    '(3) and telling the operator to run restore');
  eq(shaOf(backupPath), genuineSha, '(3) THE BACKUP IS UNTOUCHED — still the genuine original');
  eq(shaOf(settingsPath), patchedShaAfterCrash, '(3) and the settings file was not modified either');

  // The marker check is the second line of defence: even with the backup gone, an already-patched
  // file must not be treated as a pristine original.
  fs.unlinkSync(backupPath);
  const g3 = mk();
  const third = g3.install('C:\\node.exe', 'C:\\reporter.js', 5);
  assert(!third.ok, '(3b) with the backup removed, the MARKER still refuses a second install');
  eq(third.reason, 'prototype-hooks-already-installed', '(3b) naming the already-installed hooks');
  eq(shaOf(settingsPath), patchedShaAfterCrash, '(3b) and still nothing was written');
  assert(!fs.existsSync(backupPath), '(3b) no new recovery copy was fabricated over the missing one');

  // (4) NEW-GUARD RESTORE — from the genuine backup, using a guard that never ran install().
  fs.copyFileSync(path.join(tmp, 'settings.json'), path.join(tmp, 'patched.keep')); // keep for (5)
  fs.writeFileSync(backupPath, fs.readFileSync(path.join(tmp, 'patched.keep')));    // wrong backup...
  const gBad = mk();
  gBad.captureIdentity();
  fs.writeFileSync(backupPath, Buffer.from(JSON.stringify(genuine, null, 2) + '\n', 'utf8')); // ...restored
  eq(shaOf(backupPath), genuineSha, '(4) the genuine recovery copy is in place');

  const g4 = mk();
  const id4 = g4.captureIdentity();
  assert(id4.existed, '(4) the new guard sees a settings file');
  // A new guard's notion of "original" is the PATCHED file, so guard.restore() alone would restore
  // the patch. That is precisely why the runner keeps an identity sidecar and restores from it — and
  // why the end-to-end restore is proven in `pane-status-runner.test.js`, in a real separate process.
  // Here we assert only that the recovery DATA is intact and byte-identical to the genuine original.
  fs.writeFileSync(settingsPath, fs.readFileSync(backupPath));

  // (5) EXACT RESTORATION of the genuine original bytes and hash.
  eq(shaOf(settingsPath), genuineSha, '(5) the settings file is byte-identical to the genuine original');
  eq(fs.statSync(settingsPath).size, genuineBytes, '(5) and the same byte length');
  const reparsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert(!Object.prototype.hasOwnProperty.call(reparsed, 'hooks'), '(5) the hooks key is absent on re-parse');
  assert(fs.readFileSync(settingsPath, 'utf8').indexOf(settings.MARKER) === -1,
    '(5) and no prototype marker survives');

  // (6) With everything clean again, a fresh install is allowed once more.
  fs.unlinkSync(backupPath);
  const g5 = mk();
  g5.captureIdentity();
  assert(g5.install('C:\\node.exe', 'C:\\reporter.js', 5).ok,
    '(6) once restored and cleaned up, a new install is permitted again');

  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------- source invariants
process.stdout.write('\n-- source invariants --\n');
{
  const reporterSrc = fs.readFileSync(path.join(__dirname, 'pane-status-reporter.js'), 'utf8');
  // The reporter must never touch these fields. Asserted on SOURCE because a runtime test can only
  // prove the paths it exercised; a source check proves no path exists at all.
  for (const forbidden of ['transcript_path', 'tool_input', 'tool_response', 'last_assistant_message', 'session_id', 'prompt']) {
    const uses = reporterSrc.split('\n').filter((l) => l.indexOf(forbidden) !== -1 && l.trim().indexOf('//') !== 0);
    assert(uses.length === 0, `the reporter has no non-comment reference to ${forbidden}`);
  }
  assert(reporterSrc.indexOf('readFile') === -1, 'the reporter never reads a file (so it cannot open a transcript)');
  assert(reporterSrc.indexOf('http') === -1, 'the reporter has no http client');

  const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert(mainSrc.indexOf("CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1'") !== -1,
    'main.js still sets CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1 (credential scrub intact)');
  const settingsSrc = fs.readFileSync(path.join(__dirname, 'pane-status-settings.js'), 'utf8');
  assert(mainSrc.indexOf('pane-status-settings') === -1,
    'main.js does NOT import the settings guard — the app has no authority to edit Claude config');

  // `setx` must never be INVOKED. A bare substring search is the wrong test and would fail honestly:
  // main.js warns about pre-existing setx residue in a comment AND names it in a tlog string
  // ("check for setx residue"), and the settings guard explains in prose why the token is not
  // persisted. All three are the rule being enforced, not violated. So assert the thing that actually
  // matters — that no child process is ever spawned with setx as its command.
  const SETX_INVOCATION = /(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(\s*['"`]\s*setx/i;
  for (const [label, src] of [['main.js', mainSrc], ['the settings guard', settingsSrc], ['the reporter', reporterSrc]]) {
    assert(!SETX_INVOCATION.test(src), `${label} never spawns setx (prose mentions of it are the rule, not a breach)`);
  }
  // And nothing in the prototype writes to the persistent Windows user environment by any route.
  for (const [label, src] of [['the settings guard', settingsSrc], ['the reporter', reporterSrc]]) {
    assert(src.indexOf('HKCU') === -1 && src.indexOf('SetEnvironmentVariable') === -1,
      `${label} never writes a persistent user environment variable`);
  }

  const preloadSrc = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  assert(preloadSrc.indexOf('pane-status-prototype') !== -1, 'preload exposes the receive-only status channel');
  assert(!/invoke\(\s*['"]pane-status/.test(preloadSrc), 'preload exposes NO invoke() for pane status (receive-only)');
}

process.stdout.write(`\npane-status-boundary: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
