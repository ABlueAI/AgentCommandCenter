'use strict';
// Run: node app/admission-pty-boundary.test.js
// Pure route tests for pane eligibility, launch-time prompt detection, and the one final PTY writer.

const fs = require('fs');
const path = require('path');
const {
  WRITE_REASON,
  SUBMISSION_TERMINATOR,
  SUBMIT_DELAY_MS,
  isEligibleClaudePane,
  hasNonemptyInitialPrompt,
  createAdmissionPtyBoundary,
} = require('./admission-pty-boundary');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}

const roles = new Set(['builder', 'reviewer', 'source-scout']);

process.stdout.write('\n-- main-owned Claude eligibility --\n');
assert(isEligibleClaudePane({ cli: 'claude' }, roles), 'bare Claude is eligible');
assert(isEligibleClaudePane({ agent: 'claude' }, roles), 'legacy bare-Claude agent shape is eligible');
assert(isEligibleClaudePane({ role: 'builder' }, roles), 'an allowlisted Claude role is eligible');
assert(!isEligibleClaudePane({}, roles), 'a plain shell is ineligible');
assert(!isEligibleClaudePane({ cli: 'codex' }, roles), 'Codex is ineligible');
assert(!isEligibleClaudePane({ cli: 'gemini' }, roles), 'Gemini is ineligible');
assert(!isEligibleClaudePane({ role: 'not-deployed' }, roles), 'an unknown role is ineligible');
assert(!isEligibleClaudePane({ role: 'reviewer', videoScout: true }, roles), 'Video Scout is ineligible even with a role-shaped payload');

process.stdout.write('\n-- launch-time prompt detection --\n');
assert(!hasNonemptyInitialPrompt({}), 'absent initialPrompt is not turn-initiating');
assert(!hasNonemptyInitialPrompt({ initialPrompt: '  \r\n  ' }), 'whitespace-only initialPrompt is empty');
assert(hasNonemptyInitialPrompt({ initialPrompt: 'review this diff' }), 'content-bearing initialPrompt is detected');
assert(hasNonemptyInitialPrompt({ initialPrompt: '  "$task"  ' }), 'shell-significant wrapping cannot hide content');

const flush = async () => { for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r)); };

/**
 * Deterministic scheduler. `delay(ms)` records the request and resolves only when `advance()` moves the
 * virtual clock past it — nothing in this suite sleeps in real time.
 */
function manualScheduler() {
  let now = 0;
  const pending = [];
  const requested = [];
  return {
    requested,
    now: () => now,
    delay: (ms) => { requested.push(ms); return new Promise((resolve) => pending.push({ at: now + ms, resolve })); },
    async advance(ms) {
      now += ms;
      for (const p of pending.splice(0)) { if (p.at <= now) p.resolve(); else pending.push(p); }
      await flush();
    },
  };
}

// FAKE CLAUDE CODE INPUT MODEL — the behaviour observed in controlled live run -c (CLI v2.1.283),
// modelled, not measured. Each PTY write arrives as one input chunk. A multi-byte chunk, or a CR that
// arrives within the model's coalescing window after the previous chunk, is PASTE: its CR becomes a
// newline in the input box and nothing is submitted. A lone CR arriving after the window is an Enter
// keypress and submits the input. The window is a modelling choice, not a value taken from Claude Code.
const MODEL_PASTE_WINDOW_MS = 50;
function fakeClaudeTui(clock) {
  const tui = { input: '', submissions: [], lastChunkAt: -Infinity };
  tui.receive = (chunk) => {
    const at = clock();
    const gap = at - tui.lastChunkAt;
    tui.lastChunkAt = at;
    if (chunk === '\r' && gap >= MODEL_PASTE_WINDOW_MS) {
      tui.submissions.push(tui.input);
      tui.input = '';
      return;
    }
    tui.input += chunk.replace(/\r/g, '\n');
  };
  return tui;
}

process.stdout.write('\n-- one final write choke point --\n');
(async () => {
{
  const writes = [];
  const refusals = [];
  let protectedPane = 'pty1';
  const handles = new Map([
    ['pty1', { write: (bytes) => writes.push(['pty1', bytes]) }],
    ['pty2', { write: (bytes) => writes.push(['pty2', bytes]) }],
  ]);
  const boundary = createAdmissionPtyBoundary({
    getPty: (id) => handles.get(id),
    isDirectInputBlocked: (id) => id === protectedPane,
    onDirectRefusal: (id) => refusals.push(id),
    delay: () => Promise.resolve(),
  });

  const blocked = boundary.writeDirect('pty1', 'UNMETERED');
  assert(!blocked.ok && blocked.reason === WRITE_REASON.DIRECT_INPUT_BLOCKED,
    'generic input to a protected pane is refused at the final writer');
  assert(writes.length === 0 && refusals.length === 1, 'refusal performs zero PTY writes and is visible');

  const forged = boundary.writeDirect('pty1', 'FORGED', true);
  assert(!forged.ok && writes.length === 0, 'an extra boolean argument cannot forge the private capability');

  const ordinary = boundary.writeDirect('pty2', 'ordinary');
  assert(ordinary.ok && writes.length === 1 && writes[0][1] === 'ordinary',
    'generic input to an uncontrolled pane is unchanged');

  await boundary.writeAdmitted('pty1', 'durably-admitted');
  assert(writes.length === 3 && writes[1][0] === 'pty1' && writes[1][1] === 'durably-admitted',
    'the main-local admitted closure can write to the protected pane');
  assert(writes[2][0] === 'pty1' && writes[2][1] === SUBMISSION_TERMINATOR,
    'the admitted closure submits with the terminator as a separate write');

  protectedPane = null;
  assert(boundary.writeDirect('pty1', 'after-exit').ok, 'confirmed pane exit can release direct-input protection');
  assert(boundary.writeDirect('pty404', 'missing').reason === WRITE_REASON.PTY_MISSING,
    'a missing PTY returns a bounded failure');
}

process.stdout.write('\n-- admitted delivery framing against a fake Claude Code input model --\n');
{
  const TEXT = 'Read .\\cwd-marker.txt and report its complete contents.';
  assert(SUBMISSION_TERMINATOR === '\r', 'the submission terminator is a single carriage return');
  assert(SUBMIT_DELAY_MS === 300, 'the provisional framing interval is 300 ms');
  assert(SUBMIT_DELAY_MS > MODEL_PASTE_WINDOW_MS, 'the framing interval exceeds the model coalescing window');

  // (a) the pre-correction framing: ONE write of text + CR.
  {
    const s = manualScheduler();
    const tui = fakeClaudeTui(s.now);
    tui.receive(TEXT + SUBMISSION_TERMINATOR);
    assert(tui.submissions.length === 0, '(a) a combined text+CR burst submits NOTHING (reproduces run -c)');
    assert(tui.input === TEXT + '\n', '(a) the CR became a newline and the prompt is left in the input box');
  }

  // (b) the corrected framing through the real boundary.
  {
    const s = manualScheduler();
    const tui = fakeClaudeTui(s.now);
    const writes = [];
    const handle = { write: (bytes) => { writes.push(bytes); tui.receive(bytes); } };
    const boundary = createAdmissionPtyBoundary({
      getPty: (id) => (id === 'pty1' ? handle : undefined),
      isDirectInputBlocked: (id) => id === 'pty1',
      delay: s.delay,
    });
    let settled = false;
    const delivery = boundary.writeAdmitted('pty1', TEXT).then(() => { settled = true; });
    await flush();
    assert(writes.length === 1 && writes[0] === TEXT, '(b) phase 1 writes the prompt text alone');
    assert(s.requested.length === 1 && s.requested[0] === SUBMIT_DELAY_MS, '(b) exactly one framing delay is requested');
    assert(!settled && tui.submissions.length === 0, '(b) nothing is submitted and the delivery is pending during the delay');
    await s.advance(SUBMIT_DELAY_MS - 1);
    assert(writes.length === 1 && !settled, '(b) no terminator before the interval has elapsed');
    await s.advance(1);
    await delivery;
    assert(writes.length === 2 && writes[1] === SUBMISSION_TERMINATOR, '(b) phase 2 writes the terminator alone');
    assert(settled, '(b) the delivery resolves only after both writes');
    assert(tui.submissions.length === 1 && tui.submissions[0] === TEXT,
      '(b) exactly ONE submission, equal to the prompt text');
    assert(tui.input === '', '(b) nothing is left behind in the input box');
  }

  // (c) the same two writes without a gap coalesce into paste: the gap is load-bearing.
  {
    const s = manualScheduler();
    const tui = fakeClaudeTui(s.now);
    const handle = { write: (bytes) => tui.receive(bytes) };
    const boundary = createAdmissionPtyBoundary({
      getPty: () => handle,
      isDirectInputBlocked: () => true,
      delay: () => Promise.resolve(), // zero virtual time elapses
    });
    await boundary.writeAdmitted('pty1', TEXT);
    assert(tui.submissions.length === 0 && tui.input === TEXT + '\n',
      '(c) separated writes with NO gap are still pasted — the interval is what makes the CR an Enter');
  }

  // (d) the pane disappears, or its handle is replaced, during the delay.
  {
    const s = manualScheduler();
    const writes = [];
    const handles = new Map([['pty1', { write: (b) => writes.push(['old', b]) }]]);
    const boundary = createAdmissionPtyBoundary({
      getPty: (id) => handles.get(id), isDirectInputBlocked: () => true, delay: s.delay,
    });
    const gone = boundary.writeAdmitted('pty1', TEXT).then(() => 'resolved', (e) => e.message);
    await flush();
    handles.delete('pty1');
    await s.advance(SUBMIT_DELAY_MS);
    assert((await gone) === WRITE_REASON.PTY_MISSING, '(d) a pane that exits during the delay rejects the delivery');
    assert(writes.length === 1 && writes[0][1] === TEXT, '(d) no terminator is written after the pane is gone');

    const s2 = manualScheduler();
    const newWrites = [];
    handles.set('pty1', { write: (b) => writes.push(['old', b]) });
    const boundary2 = createAdmissionPtyBoundary({
      getPty: (id) => handles.get(id), isDirectInputBlocked: () => true, delay: s2.delay,
    });
    writes.length = 0;
    const replaced = boundary2.writeAdmitted('pty1', TEXT).then(() => 'resolved', (e) => e.message);
    await flush();
    handles.set('pty1', { write: (b) => newWrites.push(b) });
    await s2.advance(SUBMIT_DELAY_MS);
    assert((await replaced) === WRITE_REASON.PTY_MISSING, '(d) a replaced handle rejects the delivery');
    assert(newWrites.length === 0 && writes.length === 1,
      '(d) the terminator is never written to a different process than the one that received the text');
  }

  // (e) a phase-1 failure never requests the delay.
  {
    const s = manualScheduler();
    const boundary = createAdmissionPtyBoundary({
      getPty: () => undefined, isDirectInputBlocked: () => true, delay: s.delay,
    });
    const r = await boundary.writeAdmitted('pty1', TEXT).then(() => 'resolved', (e) => e.message);
    assert(r === WRITE_REASON.PTY_MISSING && s.requested.length === 0,
      '(e) a missing PTY rejects before any write and requests no delay');
  }

  // (f) text that could frame its own submission is rejected before any byte is written.
  {
    const s = manualScheduler();
    const writes = [];
    const handle = { write: (b) => writes.push(b) };
    const boundary = createAdmissionPtyBoundary({
      getPty: () => handle, isDirectInputBlocked: () => true, delay: s.delay,
    });
    for (const [label, value] of [['a CR', 'a\rb'], ['an LF', 'a\nb'], ['empty text', ''], ['a non-string', 42]]) {
      const r = await boundary.writeAdmitted('pty1', value).then(() => 'resolved', (e) => e.message);
      assert(r === WRITE_REASON.BAD_ADMITTED_TEXT, `(f) admitted text containing ${label} is rejected`);
    }
    assert(writes.length === 0 && s.requested.length === 0, '(f) rejected text causes zero writes and no delay');
  }

  // (g) generic input is untouched by the framing: no delay, no terminator, still blocked when protected.
  {
    const s = manualScheduler();
    const writes = [];
    const handle = { write: (b) => writes.push(b) };
    const boundary = createAdmissionPtyBoundary({
      getPty: () => handle, isDirectInputBlocked: (id) => id === 'pty1', delay: s.delay,
    });
    assert(!boundary.writeDirect('pty1', 'typed').ok, '(g) direct input to the controlled pane is still refused');
    assert(boundary.writeDirect('pty2', 'typed').ok && writes.length === 1 && writes[0] === 'typed',
      '(g) direct input to an ordinary pane is written verbatim');
    assert(s.requested.length === 0, '(g) direct input never requests the framing delay');
  }
}

process.stdout.write('\n-- source tripwires --\n');
{
  const moduleSrc = fs.readFileSync(path.join(__dirname, 'admission-pty-boundary.js'), 'utf8');
  const mainSrc = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const budgetSrc = fs.readFileSync(path.join(__dirname, 'admission-budget.js'), 'utf8');
  assert((moduleSrc.match(/\.write\(bytes\)/g) || []).length === 1,
    'the boundary contains exactly one production PTY write primitive');
  assert((moduleSrc.match(/SUBMISSION_TERMINATOR = '\\r'/g) || []).length === 1,
    'the terminator is defined exactly once, in the final boundary');
  assert((mainSrc.match(/\.write\(/g) || []).length === 0,
    'main has no second PTY write primitive outside the final boundary');
  assert(mainSrc.includes('writer: admissionPtyBoundary.writeAdmitted'),
    'the admission budget receives only the capability-bearing writer closure');
  assert(mainSrc.includes('admissionPtyBoundary.writeDirect(id, data)'),
    'generic pty-write also terminates at the same boundary');
  assert((budgetSrc.match(/await writer\(paneId, promptText\)/g) || []).length === 1,
    'the budget makes exactly one admitted-delivery call, with the prompt text only');
  assert(!/promptText \+ SUBMISSION_TERMINATOR/.test(budgetSrc),
    'the budget no longer concatenates the terminator onto the prompt');
  for (const rel of ['renderer/admission-view.js', 'admission-ipc.js', 'preload.js']) {
    const src = fs.readFileSync(path.join(__dirname, rel), 'utf8');
    assert(!/SUBMISSION_TERMINATOR|SUBMIT_DELAY_MS/.test(src),
      `${rel} can supply neither the terminator nor the framing delay`);
  }
}

process.stdout.write(`\nadmission-pty-boundary: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
})().catch((e) => { process.stderr.write(`admission-pty-boundary: harness error ${e && e.stack}\n`); process.exit(1); });
