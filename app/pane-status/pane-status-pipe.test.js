'use strict';
// Run: node app/pane-status/pane-status-pipe.test.js
//
// Transport bounds and cleanup, driven through a REAL Windows named pipe with a real registry behind
// it. The refusal assertions matter more than the happy path: a status transport that can be made to
// buffer without limit, or to log a peer's bytes, is a liability rather than a feature.

const crypto = require('crypto');
const net = require('net');
const pipeMod = require('./pane-status-pipe');
const registryMod = require('./pane-status-registry');
const protocol = require('./pane-status-protocol');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// ---------------------------------------------------------------- pipe name
assert(pipeMod.buildPipeName('abcdef01').indexOf('\\\\.\\pipe\\') === 0, 'a pipe name is a \\\\.\\pipe\\ path');
let threw = false;
try { pipeMod.buildPipeName('nope'); } catch { threw = true; }
assert(threw, 'a non-hex suffix is refused');
threw = false;
try { pipeMod.buildPipeName('../../evil'); } catch { threw = true; }
assert(threw, 'a traversal-shaped suffix is refused');

let clock = 1000;
const logs = [];
function makeRig() {
  logs.length = 0;
  const registry = registryMod.createPaneStatusRegistry({
    now: () => clock, randomToken: () => crypto.randomBytes(32).toString('hex'),
    crypto, isVersionSupported: () => true, log: (l) => logs.push(l),
  });
  registry.setOverrideReason(null);
  const views = [];
  const pipeName = pipeMod.buildPipeName(crypto.randomBytes(8).toString('hex'));
  const server = pipeMod.createPaneStatusPipe({
    net, registry, pipeName, log: (l) => logs.push(l), now: () => clock,
    onStateChange: (v) => views.push(v),
  });
  return { registry, server, views, pipeName };
}

function send(pipeName, payload) {
  return new Promise((resolve) => {
    const sock = net.createConnection(pipeName, () => sock.end(payload, () => resolve(true)));
    sock.on('error', () => resolve(false));
  });
}
const settle = (ms) => new Promise((r) => setTimeout(r, ms || 250));

(async () => {
  // ---------------------------------------------------------------- happy path
  {
    const rig = makeRig();
    assert(rig.server.start().ok === true, 'the listener starts');
    assert(rig.server.isListening() === true, 'and reports listening');
    const tok = rig.registry.enroll('pty1').token;
    await send(rig.pipeName, protocol.encodeMessage('UserPromptSubmit', tok));
    await settle();
    assert(rig.views.length === 1 && rig.views[0].state === 'working', 'a valid message drives one state change');
    assert(rig.server.metrics().accepted === 1, 'and is counted as accepted');
    rig.server.stop();
    assert(rig.server.isListening() === false, 'stop() closes the listener');
  }

  // ---------------------------------------------------------------- refusals do not leak bytes
  {
    const rig = makeRig();
    rig.server.start();
    rig.registry.enroll('pty1');
    const SENTINEL = 'SENTINEL-PIPE-LEAK-9f2c';
    await send(rig.pipeName, JSON.stringify({ v: 1, e: 'Stop', t: 'x'.repeat(64), secret: SENTINEL }) + '\n');
    await settle();
    assert(rig.views.length === 0, 'a malformed message produces no state change');
    assert(rig.server.metrics().refused >= 1, 'and is counted as refused');
    assert(logs.join('|').indexOf(SENTINEL) === -1, 'the refusal log NEVER contains the peer\'s bytes');
    assert(logs.some((l) => l.indexOf('REFUSED') !== -1), 'but it does say REFUSED with a bounded reason');
    rig.server.stop();
  }

  // ---------------------------------------------------------------- unknown token
  {
    const rig = makeRig();
    rig.server.start();
    rig.registry.enroll('pty1');
    await send(rig.pipeName, protocol.encodeMessage('Stop', 'd'.repeat(64)));
    await settle();
    assert(rig.views.length === 0, 'a well-formed message with an UNKNOWN token changes nothing');
    rig.server.stop();
  }

  // ---------------------------------------------------------------- connection byte bound
  {
    const rig = makeRig();
    rig.server.start();
    const tok = rig.registry.enroll('pty1').token;
    const flood = 'x'.repeat(pipeMod.MAX_CONNECTION_BYTES + 1000);
    await send(rig.pipeName, flood);
    await settle();
    assert(rig.views.length === 0, 'an oversize connection is dropped without a state change');
    assert(logs.some((l) => l.indexOf('oversize') !== -1), 'and logs a bounded oversize reason');
    // the transport still works afterwards
    await send(rig.pipeName, protocol.encodeMessage('Stop', tok));
    await settle();
    assert(rig.views.length === 1, 'the listener survives a flood and still serves a good message');
    rig.server.stop();
  }

  // ---------------------------------------------------------------- messages-per-connection bound
  {
    const rig = makeRig();
    rig.server.start();
    const tok = rig.registry.enroll('pty1').token;
    let payload = '';
    for (let i = 0; i < pipeMod.MAX_MESSAGES_PER_CONNECTION + 3; i++) payload += protocol.encodeMessage('Stop', tok);
    await send(rig.pipeName, payload);
    await settle();
    assert(rig.server.metrics().accepted <= pipeMod.MAX_MESSAGES_PER_CONNECTION,
      'no more than the per-connection message bound is accepted');
    rig.server.stop();
  }

  // ---------------------------------------------------------------- unterminated oversize line
  {
    const rig = makeRig();
    rig.server.start();
    rig.registry.enroll('pty1');
    await send(rig.pipeName, '{"v":1,"e":"Stop","t":"' + 'a'.repeat(protocol.MAX_MESSAGE_BYTES) + '');
    await settle();
    assert(rig.views.length === 0, 'an unterminated line longer than one legal message is refused');
    rig.server.stop();
  }

  // ---------------------------------------------------------------- deliverLine is directly testable
  {
    const rig = makeRig();
    const tok = rig.registry.enroll('pty1').token;
    rig.server.deliverLine(protocol.encodeMessage('Notification', tok));
    assert(rig.views.length === 1 && rig.views[0].state === 'attention', 'deliverLine applies a message without a socket');
    rig.server.deliverLine('garbage\n');
    assert(rig.views.length === 1, 'and refuses garbage without a state change');
  }

  // ---------------------------------------------------------------- a PostToolUse no-op publishes nothing
  {
    const rig = makeRig();
    const tok = rig.registry.enroll('pty1').token;
    rig.server.deliverLine(protocol.encodeMessage('Notification', tok));
    const before = rig.views.length;
    rig.server.deliverLine(protocol.encodeMessage('PostToolUse', tok));
    assert(rig.views.length === before, 'an accepted-but-no-op PostToolUse does NOT republish a view');
    assert(rig.server.metrics().noop === 1, 'and is counted separately as a no-op, not as accepted or refused');
  }

  // ---------------------------------------------------------------- the module cannot spawn
  {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, 'pane-status-pipe.js'), 'utf8');
    // Match an actual require, not the words in the file's own explanatory comments.
    assert(!/require\(\s*['"]child_process['"]\s*\)/.test(src), 'pane-status-pipe.js never requires child_process');
  }

  process.stdout.write(`\npane-status-pipe: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { process.stderr.write('UNCAUGHT: ' + (e && e.stack) + '\n'); process.exit(1); });
