// Run: node app/renderer/stt-target-lock.test.js
//
// Plain Node.js — no test framework (matches pty-parser.test.js). Exit 0 = all pass.
// Proves the destination-pane lock contract: a finalized transcript is delivered to the
// pane locked at recording start, or refused visibly — and the decision layer can never
// leak the transcript because it only ever receives a character count.

const { resolveTranscriptDelivery } = require('./stt-target-lock.js');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

function section(name) { process.stdout.write(`\n${name}\n`); }

// ══════════════════════════════════════════════════════════════════════════════
section('Delivery goes to the LOCKED pane when it still exists');
// ══════════════════════════════════════════════════════════════════════════════

{
  const secretTranscript = 'the launch code is swordfish';
  const action = resolveTranscriptDelivery({ targetId: 't7', paneExists: true, charCount: secretTranscript.length });
  assert(action.deliver === true, 'an existing locked pane receives the transcript');
  assert(action.log.includes('t7'), 'the log names the locked pane id');
  assert(action.log.includes(`${secretTranscript.length} chars`), 'the log carries the character count');
  assert(!action.log.includes('swordfish'), 'the log CANNOT contain transcript text (the function never receives it)');
}

// ══════════════════════════════════════════════════════════════════════════════
section('Refusals are visible, never a silent redirect');
// ══════════════════════════════════════════════════════════════════════════════

{
  const noTarget = resolveTranscriptDelivery({ targetId: null, paneExists: false, charCount: 12 });
  assert(noTarget.deliver === false, 'no locked target -> no delivery');
  assert(/refusing/.test(noTarget.log) && /12-char/.test(noTarget.log),
    'the no-target refusal is visible and carries only the char count');

  const closed = resolveTranscriptDelivery({ targetId: 't3', paneExists: false, charCount: 40 });
  assert(closed.deliver === false, 'a closed locked pane -> no delivery ANYWHERE else');
  assert(closed.log.includes('t3') && /closed before/.test(closed.log) && /refusing/.test(closed.log),
    'the closed-pane refusal names the pane and refuses explicitly');
  assert(/different pane/.test(closed.log), 'the refusal states the transcript is NOT rerouted to another pane');
}

// ══════════════════════════════════════════════════════════════════════════════
section('Char count is defensive');
// ══════════════════════════════════════════════════════════════════════════════

{
  const nan = resolveTranscriptDelivery({ targetId: 't1', paneExists: true, charCount: NaN });
  assert(/0 chars/.test(nan.log), 'a non-finite char count degrades to 0, never NaN in Logs');
  const neg = resolveTranscriptDelivery({ targetId: 't1', paneExists: true, charCount: -5 });
  assert(/0 chars/.test(neg.log), 'a negative char count clamps to 0');
}

// ══════════════════════════════════════════════════════════════════════════════
process.stdout.write(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
