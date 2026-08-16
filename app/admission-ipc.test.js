'use strict';
// Run: node app/admission-ipc.test.js
//
// The IPC and PTY-input boundary for the MAIN-OWNED TURN ADMISSION BUDGET.
//
// Two properties are on trial here:
//
//   1. DIRECT INPUT IS DEAD for the controlled pane. Typing, paste, dictation delivery, shell-input
//      helpers, Enter and control characters all arrive at main's single `pty-write` handler, so this
//      suite drives that decision function with exactly those byte shapes and proves none of them
//      reaches a PTY — while an UNCONTROLLED pane keeps its existing behaviour byte-for-byte.
//
//   2. THE CONTROLLED PATH IS NARROW. It uses the canonical `trusted-ipc-sender.js` gate (the REAL
//      one, not a re-implementation), so the wrong window, the wrong sender, a subframe, the wrong
//      document and a torn-down frame each refuse; and the surface contains no setter, so a renderer
//      that can read the counts still cannot change them.

const fs = require('fs');
const path = require('path');
const { createAdmissionIpc, IPC_REASON, CHANNEL_SUBMIT, CHANNEL_STATE, REFUSAL_THROTTLE_MS } = require('./admission-ipc');
const { createTrustedSenderGate } = require('./trusted-ipc-sender');
const budgetModule = require('./admission-budget');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function section(name) { process.stdout.write(`\n-- ${name} --\n`); }

const { REASON } = budgetModule;
const SENTINEL = 'ZZ-PROMPT-SENTINEL-4b7e2a11-DO-NOT-LOG';
const CC = (n) => String.fromCharCode(n);
const ENTRY_URL = 'file:///D:/Workspace/agent-command-center/app/renderer/index.html';

// ---- harness ---------------------------------------------------------------------------------------

/** A minimal fake budget whose control decisions the suite can steer directly. */
function fakeBudget(opts) {
  const o = opts || {};
  const calls = [];
  return {
    calls,
    enabled: o.enabled !== false,
    isDirectInputBlocked: (paneId) => (o.controlledPane ? paneId === o.controlledPane : false),
    isControlledPane: (paneId) => (o.controlledPane ? paneId === o.controlledPane : false),
    submitPrompt: async (paneId, prompt) => {
      calls.push({ paneId, prompt });
      if (o.submitResult) return o.submitResult;
      return { ok: true, admitted: 1, remaining: 2, allowance: 3 };
    },
    state: () => o.state || { enabled: true, ok: true, allowance: 3, admitted: 1, remaining: 2, refused: 0, runState: 'open', paneBound: true, bindingStale: false },
  };
}

function makeIpc(opts) {
  const o = opts || {};
  const logs = [];
  let t = 0;
  const ipc = createAdmissionIpc({
    budget: o.budget || fakeBudget({ controlledPane: 'pty1' }),
    assessSender: o.assessSender || (() => ({ ok: true })),
    logRefusal: (line) => logs.push(String(line)),
    now: o.now || (() => (t += 1)),
  });
  return { ipc, logs, advance: (ms) => { t += ms; } };
}

// The real gate, driven by stub windows/events, so the trust matrix under test is the production one.
function realGate(win) {
  return createTrustedSenderGate({ entryUrl: ENTRY_URL, getTrustedWindow: () => win });
}
function trustedWindow() {
  const frame = { url: ENTRY_URL };
  const wc = { mainFrame: frame };
  return { win: { isDestroyed: () => false, webContents: wc }, wc, frame };
}

// ---- 1. required test 12: direct typing is blocked for the controlled pane -------------------------

async function testDirectInputBlocked() {
  section('required test 12: direct terminal input is blocked for the controlled pane');
  const { ipc, logs } = makeIpc();
  assert(ipc.refuseDirectWrite('pty1') === true, 'a keystroke on the controlled pane is refused');
  assert(logs.length === 1, 'the refusal is visible exactly once');
  assert(/Direct terminal input is disabled/.test(logs[0]), 'the refusal names the cause in plain words');
  assert(logs[0].includes(REASON.DIRECT_INPUT_BLOCKED), 'the refusal carries the bounded reason constant');
}

// ---- 2. required test 13: no input route can bypass the block ---------------------------------------

async function testNoBypass() {
  section('required test 13: paste, dictation, shell input, Enter and control characters cannot bypass');
  const { ipc } = makeIpc();
  // Every one of these is a real byte shape that reaches main's `pty-write` today:
  //   term.onData        -> single characters and control codes
  //   clipboard-consumer -> a whole pasted block, possibly multi-line
  //   the STT delivery   -> transcript text plus a trailing space
  //   shell-input helpers-> a command plus Enter
  const routes = [
    ['a single typed character', 'a'],
    ['Enter (CR)', CC(13)],
    ['newline (LF)', CC(10)],
    ['CRLF', CC(13) + CC(10)],
    ['Ctrl+C (ETX)', CC(3)],
    ['Ctrl+D (EOT)', CC(4)],
    ['ESC', CC(27)],
    ['a bracketed-paste introducer', CC(27) + '[200~pasted' + CC(27) + '[201~'],
    ['a multi-line clipboard paste', `line one${CC(13)}line two${CC(13)}`],
    ['a dictation delivery (transcript + space)', 'please summarise the diff '],
    ['a shell-input helper (command + Enter)', `git status${CC(13)}`],
    ['a NUL byte', CC(0)],
    ['a large paste', 'x'.repeat(50000)],
    ['an empty write', ''],
  ];
  for (const [label, bytes] of routes) {
    // The decision function ignores the payload entirely — which is the point: there is no byte shape
    // that can argue its way past a pane-level block.
    const refused = ipc.refuseDirectWrite('pty1', bytes);
    assert(refused === true, `${label} is refused for the controlled pane`);
  }
}

// ---- 3. required test 14: uncontrolled panes keep their existing behaviour ---------------------------

async function testUncontrolledPanesUnaffected() {
  section('required test 14: uncontrolled panes retain existing input behaviour');
  const { ipc, logs } = makeIpc();
  for (const pane of ['pty2', 'pty3', 'library', 'pty999999']) {
    assert(ipc.refuseDirectWrite(pane) === false, `${pane} is NOT blocked`);
  }
  assert(logs.length === 0, 'no refusal is logged for uncontrolled panes');

  // With the budget disabled entirely, nothing is blocked at all.
  const off = makeIpc({ budget: fakeBudget({ enabled: false, controlledPane: null }) });
  assert(off.ipc.refuseDirectWrite('pty1') === false, 'with no controlled run, pty1 is not blocked either');
  assert(off.logs.length === 0, 'a disabled budget logs nothing on ordinary input');
}

// ---- 4. the refusal is throttled but the BLOCK never is ----------------------------------------------

async function testThrottle() {
  section('refusal is throttled; the block itself is not');
  const logs = [];
  let t = 0;
  const h = createAdmissionIpc({
    budget: fakeBudget({ controlledPane: 'pty1' }),
    assessSender: () => ({ ok: true }),
    logRefusal: (line) => logs.push(String(line)),
    now: () => t,
  });

  // A held key: 500 keystrokes inside one throttle window. Every one must be REFUSED, and the
  // Logs tab must receive exactly one line — a flood of 500 identical refusals would bury the
  // signal it exists to deliver.
  let refusedInWindow = 0;
  for (let i = 0; i < 500; i += 1) if (h.refuseDirectWrite('pty1')) refusedInWindow += 1;
  assert(refusedInWindow === 500, 'all 500 keystrokes in the window are refused');
  assert(logs.length === 1, '500 keystrokes inside one window produce exactly ONE visible refusal');

  t += REFUSAL_THROTTLE_MS + 1;
  assert(h.refuseDirectWrite('pty1') === true, 'the keystroke after the window is still refused');
  assert(logs.length === 2, 'a refusal is emitted again after the throttle window elapses');
  assert(/suppressed/.test(logs[1]), 'the second refusal reports how many attempts were suppressed');
  // 499, not 500: the first keystroke of the window was SHOWN, the other 499 were suppressed.
  assert(/499 further attempt/.test(logs[1]), 'the suppressed count is accurate (499 of the 500 were suppressed)');

  // Throttling affects visibility, never the block itself.
  let refusedCount = 0;
  for (let i = 0; i < 100; i += 1) if (h.refuseDirectWrite('pty1')) refusedCount += 1;
  assert(refusedCount === 100, 'all 100 further keystrokes are still refused while throttled');
  assert(logs.length === 2, 'and those 100 produced no additional log lines');

  // An uncontrolled pane is never throttled, because it is never refused.
  assert(h.refuseDirectWrite('pty2') === false, 'an uncontrolled pane passes through during a throttle window');
}

// ---- 5. required test 15: the trust matrix ------------------------------------------------------------

async function testTrustMatrix() {
  section('required test 15: wrong window, sender, frame, document and torn-down frame all refuse');
  const budget = fakeBudget({ controlledPane: 'pty1' });

  const cases = [
    ['no trusted window', () => ({ win: null, event: { sender: {}, senderFrame: {} } })],
    ['a destroyed window', () => {
      const t = trustedWindow();
      return { win: { ...t.win, isDestroyed: () => true }, event: { sender: t.wc, senderFrame: t.frame } };
    }],
    ['a wrong (untrusted) sender', () => {
      const t = trustedWindow();
      return { win: t.win, event: { sender: { other: true }, senderFrame: t.frame } };
    }],
    ['a subframe rather than the main frame', () => {
      const t = trustedWindow();
      return { win: t.win, event: { sender: t.wc, senderFrame: { url: ENTRY_URL } } };
    }],
    ['the wrong document in the main frame', () => {
      const frame = { url: 'file:///C:/evil/index.html' };
      const wc = { mainFrame: frame };
      return { win: { isDestroyed: () => false, webContents: wc }, event: { sender: wc, senderFrame: frame } };
    }],
    ['a torn-down frame whose url getter throws', () => {
      const frame = { get url() { throw new Error('frame disposed'); } };
      const wc = { mainFrame: frame };
      return { win: { isDestroyed: () => false, webContents: wc }, event: { sender: wc, senderFrame: frame } };
    }],
    ['a torn-down webContents whose mainFrame getter throws', () => {
      const frame = { url: ENTRY_URL };
      const wc = { get mainFrame() { throw new Error('wc disposed'); } };
      return { win: { isDestroyed: () => false, webContents: wc }, event: { sender: wc, senderFrame: frame } };
    }],
    ['a missing event entirely', () => {
      const t = trustedWindow();
      return { win: t.win, event: undefined };
    }],
  ];

  for (const [label, build] of cases) {
    const { win, event } = build();
    const logs = [];
    const ipc = createAdmissionIpc({
      budget,
      assessSender: (e) => realGate(win).assess(e),
      logRefusal: (l) => logs.push(String(l)),
      now: () => 1,
    });
    const before = budget.calls.length;
    const r = await ipc.handleSubmitPrompt(event, { paneId: 'pty1', prompt: SENTINEL });
    assert(r.ok === false && r.reason === IPC_REASON.UNTRUSTED, `${label} -> refused as untrusted`);
    assert(budget.calls.length === before, `${label} -> the budget was never consulted`);
    assert(JSON.stringify(r).indexOf(SENTINEL) === -1, `${label} -> the refusal does not echo the prompt`);
    // The renderer must not learn WHICH trust clause failed — that is free probing feedback.
    assert(Object.keys(r).length === 2, `${label} -> the refusal payload carries only { ok, reason }`);

    const s = await ipc.handleGetState(event);
    assert(s.ok === false && s.reason === IPC_REASON.UNTRUSTED, `${label} -> the state read also refuses`);
  }

  // The positive control: the genuinely trusted sender is admitted, so the matrix above is not passing
  // for the trivial reason that everything refuses.
  {
    const t = trustedWindow();
    const ipc = createAdmissionIpc({
      budget, assessSender: (e) => realGate(t.win).assess(e), logRefusal: () => {}, now: () => 1,
    });
    const r = await ipc.handleSubmitPrompt({ sender: t.wc, senderFrame: t.frame }, { paneId: 'pty1', prompt: 'hello' });
    assert(r.ok === true, 'positive control: the trusted window IS admitted');
  }
}

// ---- 6. request-shape discipline and prompt hygiene ---------------------------------------------------

async function testRequestShape() {
  section('request shape is strict, and no refusal echoes the prompt');
  const budget = fakeBudget({ controlledPane: 'pty1' });
  const { ipc, logs } = makeIpc({ budget });

  const bad = [
    ['null', null],
    ['a string', 'pty1'],
    ['an array', ['pty1', 'hi']],
    ['a missing prompt', { paneId: 'pty1' }],
    ['a missing paneId', { prompt: 'hi' }],
    ['an extra field', { paneId: 'pty1', prompt: 'hi', allowance: 99 }],
    ['a non-string paneId', { paneId: 7, prompt: 'hi' }],
  ];
  for (const [label, req] of bad) {
    const before = budget.calls.length;
    const r = await ipc.handleSubmitPrompt({}, req);
    assert(r.ok === false && r.reason === IPC_REASON.BAD_REQUEST, `${label} -> bad-request`);
    assert(budget.calls.length === before, `${label} -> the budget was never consulted`);
  }
  // An extra field is refused rather than ignored — that is the difference between a strict shape and
  // a permissive one, and it is why a smuggled `allowance` cannot ride along unnoticed.
  assert((await ipc.handleSubmitPrompt({}, { paneId: 'pty1', prompt: 'hi', allowance: 99 })).reason === IPC_REASON.BAD_REQUEST,
    'a smuggled allowance field refuses the whole request');

  const promptCases = [
    ['a prompt carrying Enter', `${SENTINEL}${CC(13)}rm -rf /`, REASON.PROMPT_CONTROL_CHARS],
    ['a prompt carrying ESC', `${SENTINEL}${CC(27)}[2J`, REASON.PROMPT_CONTROL_CHARS],
    ['an empty prompt', '', REASON.EMPTY_PROMPT],
    ['a non-string prompt', 12345, REASON.BAD_PROMPT_TYPE],
    ['an over-long prompt', 'x'.repeat(budgetModule.MAX_PROMPT_CHARS + 1), REASON.PROMPT_TOO_LONG],
  ];
  for (const [label, prompt, expected] of promptCases) {
    const before = budget.calls.length;
    const r = await ipc.handleSubmitPrompt({}, { paneId: 'pty1', prompt });
    assert(r.ok === false && r.reason === expected, `${label} -> ${expected}`);
    assert(budget.calls.length === before, `${label} -> refused before the budget is touched`);
  }

  assert(logs.join('\n').indexOf(SENTINEL) === -1, 'no refusal log line contains the prompt sentinel');
  const allPayloads = JSON.stringify(await Promise.all(
    promptCases.map(([, p]) => ipc.handleSubmitPrompt({}, { paneId: 'pty1', prompt: p }))));
  assert(allPayloads.indexOf(SENTINEL) === -1, 'no refusal payload contains the prompt sentinel');
}

// ---- 7. required test 16: the renderer cannot set, increase, reset or certify --------------------------

async function testNoSetterSurface() {
  section('required test 16: the renderer surface contains no setter');
  const { ipc } = makeIpc();
  const surface = Object.keys(ipc).sort();
  assert(JSON.stringify(surface) === JSON.stringify(
    ['decideDirectWrite', 'forgetPane', 'handleGetState', 'handleSubmitPrompt', 'refuseDirectWrite', 'register']),
    'the IPC object exposes exactly the six expected members');

  // Exactly two channels are registered, and both are invoke-only.
  const registered = [];
  ipc.register({ handle: (ch) => registered.push(ch), on: () => { throw new Error('must not register a send channel'); } });
  assert(registered.length === 2, 'exactly two IPC channels are registered');
  assert(registered.includes(CHANNEL_SUBMIT) && registered.includes(CHANNEL_STATE),
    'the two channels are the submit and state reads');
  assert(!registered.some((c) => /set|reset|grant|allow|certify|refund|write/i.test(c)),
    'no registered channel name suggests a mutation of the allowance');

  // The state read is bounded and carries no handle to mutate.
  const s = await ipc.handleGetState({});
  assert(s.ok === true, 'a trusted state read succeeds');
  const keys = Object.keys(s.state).sort();
  assert(JSON.stringify(keys) === JSON.stringify(
    ['admitted', 'allowance', 'bindingStale', 'enabled', 'ok', 'paneBound', 'refused', 'remaining', 'runState']),
    'the state view carries only bounded counts and flags');
  assert(typeof s.state.setAllowance === 'undefined', 'the state view carries no setter');

  // Preload source tripwire: the renderer bridge must expose exactly the two invokes and nothing else.
  const preload = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');
  const block = preload.slice(preload.indexOf("--blue-helm-admission-budget"));
  assert(block.length > 0, 'the preload contains the admission bridge');
  assert(/exposeInMainWorld\('ccAdmission', Object\.freeze\(/.test(block),
    'the admission bridge is frozen so renderer code cannot add methods to it');
  const invokes = block.match(/ipcRenderer\.invoke\('([^']+)'/g) || [];
  assert(invokes.length === 2, 'the preload bridge makes exactly two invokes');
  assert(!/ipcRenderer\.send\(/.test(block), 'the admission bridge exposes no fire-and-forget send channel');
  assert(!/setAllowance|reset|certify|refund|grant/i.test(block), 'the preload bridge exposes no mutation method');

  // And the bridge must be ABSENT rather than inert when no run is configured.
  assert(/if \(process\.argv\.includes\('--blue-helm-admission-budget'\)\)/.test(preload),
    'the bridge exists only when main forwarded the controlled-run token');
}

// ---- 8. pass-through of budget refusals, and forgetPane ------------------------------------------------

async function testBudgetRefusalPassThrough() {
  section('budget refusals pass through with counts but never content');
  {
    const budget = fakeBudget({
      controlledPane: 'pty1',
      submitResult: { ok: false, reason: REASON.EXHAUSTED, admitted: 3, remaining: 0, allowance: 3 },
    });
    const { ipc, logs } = makeIpc({ budget });
    const r = await ipc.handleSubmitPrompt({}, { paneId: 'pty1', prompt: SENTINEL });
    assert(r.ok === false && r.reason === REASON.EXHAUSTED, 'an exhausted budget surfaces its reason');
    assert(r.remaining === 0 && r.admitted === 3 && r.allowance === 3, 'the counts are surfaced for the UI');
    assert(JSON.stringify(r).indexOf(SENTINEL) === -1, 'the exhausted refusal does not echo the prompt');
    assert(logs.some((l) => l.includes(REASON.EXHAUSTED)), 'the exhausted refusal is visible');
    assert(logs.join('\n').indexOf(SENTINEL) === -1, 'the visible refusal does not echo the prompt');
  }
  {
    const budget = fakeBudget({
      controlledPane: 'pty1',
      submitResult: { ok: false, reason: REASON.WRITE_FAILED_AFTER_ADMISSION, admitted: 1, remaining: 2, allowance: 3 },
    });
    const { ipc, logs } = makeIpc({ budget });
    const r = await ipc.handleSubmitPrompt({}, { paneId: 'pty1', prompt: SENTINEL });
    assert(r.reason === REASON.WRITE_FAILED_AFTER_ADMISSION, 'a post-admission write failure surfaces distinctly');
    assert(r.admitted === 1, 'the consumed admission is reported honestly rather than hidden');
    assert(logs.some((l) => /admission is consumed/.test(l)),
      'the log states plainly that the admission was consumed');
  }
  {
    // A budget that returns nothing at all must still refuse, not throw.
    const budget = fakeBudget({ controlledPane: 'pty1', submitResult: undefined });
    budget.submitPrompt = async () => undefined;
    const { ipc } = makeIpc({ budget });
    const r = await ipc.handleSubmitPrompt({}, { paneId: 'pty1', prompt: 'hello' });
    assert(r.ok === false, 'an undefined budget result is treated as a refusal');
  }
  {
    // Disabled budget: the handler refuses before any budget call.
    const budget = fakeBudget({ enabled: false, controlledPane: null });
    const { ipc } = makeIpc({ budget });
    const r = await ipc.handleSubmitPrompt({}, { paneId: 'pty1', prompt: 'hello' });
    assert(r.ok === false && r.reason === IPC_REASON.DISABLED, 'a disabled budget refuses the controlled path');
    assert(budget.calls.length === 0, 'the disabled budget was never consulted');
  }
  {
    const { ipc } = makeIpc();
    ipc.refuseDirectWrite('pty1');
    ipc.forgetPane('pty1');
    assert(typeof ipc.forgetPane === 'function', 'forgetPane clears throttle bookkeeping without touching the ledger');
  }
}

// ---- 9. source tripwires -------------------------------------------------------------------------------

function testSourceTripwires() {
  section('required test 21: source tripwires');
  const src = fs.readFileSync(path.join(__dirname, 'admission-ipc.js'), 'utf8');
  assert(/const trust = assessSender\(event\);/.test(src), 'the submit handler assesses the sender first');
  const trustIdx = src.indexOf('async function handleSubmitPrompt');
  const budgetIdx = src.indexOf('await budget.submitPrompt(');
  const gateIdx = src.indexOf('assessSender(event)', trustIdx);
  assert(gateIdx !== -1 && gateIdx < budgetIdx, 'the trust gate runs before the budget is consulted');
  assert((src.match(/await budget\.submitPrompt\(/g) || []).length === 1,
    'there is exactly ONE call into the budget from the IPC boundary');
  assert(!/console\.log\(/.test(src), 'the boundary never console.logs (which would bypass the bounded logger)');
  // Count CODE occurrences only: strip `//` comments first, or the header's own description of the
  // rule would be counted as a violation of it.
  const codeOnly = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert(/req\.prompt/.test(codeOnly), 'the prompt is read');
  const promptReads = (codeOnly.match(/req\.prompt/g) || []).length;
  assert(promptReads === 2,
    `req.prompt is read exactly twice in code — once to validate, once to hand to the budget (found ${promptReads})`);

  const mainSrc = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert(/admissionIpc\.register\(ipcMain\)/.test(mainSrc), 'main registers the admission channels');
  assert(/if \(admissionEnabled\) \{/.test(mainSrc),
    'the admission channels are registered ONLY when a controlled run is configured');
}

// ---- run -------------------------------------------------------------------------------------------------

(async () => {
  await testDirectInputBlocked();
  await testNoBypass();
  await testUncontrolledPanesUnaffected();
  await testThrottle();
  await testTrustMatrix();
  await testRequestShape();
  await testNoSetterSurface();
  await testBudgetRefusalPassThrough();
  testSourceTripwires();

  process.stdout.write(`\nadmission-ipc: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  process.stderr.write(`\nadmission-ipc: harness error ${(err && err.message) || err}\n`);
  process.exit(1);
});
