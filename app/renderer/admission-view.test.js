'use strict';
// Run: node app/renderer/admission-view.test.js
//
// VIEW-LEVEL proof for the controlled-run turn admission surface. The DOM is a stub (same approach as
// renderer/quick-links-view.test.js) and the bridge is a stub, so this suite exercises the REAL view
// module against a controllable main.
//
// What this suite is for: absence without a bridge, bounded rendering, explicit-click-only spending,
// single-flight, the client-side length bound, refusal display, state refresh, and the proof that no
// prompt text reaches a log, a status line, or the view's own state. The end-to-end chain through the
// real IPC boundary, the real budget and a real ledger file is proven separately in
// app/admission-ui-integration.test.js.

const fs = require('fs');
const path = require('path');
const { createAdmissionView, boundedReason, reasonText, MAX_PROMPT_CHARS } = require('./admission-view');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
function eq(actual, expected, label) { assert(actual === expected, `${label} (got ${JSON.stringify(actual)})`); }

// ---- minimal DOM ------------------------------------------------------------------------------
class Classes {
  constructor(owner) { this.owner = owner; }
  values() { return this.owner.className.split(/\s+/).filter(Boolean); }
  toggle(name, force) {
    const set = new Set(this.values());
    const add = force === undefined ? !set.has(name) : force;
    if (add) set.add(name); else set.delete(name);
    this.owner.className = [...set].join(' ');
  }
  add(name) { this.toggle(name, true); }
  remove(name) { this.toggle(name, false); }
  contains(name) { return this.values().includes(name); }
}
class Element {
  constructor(tag, id = '') {
    this.tagName = String(tag).toUpperCase(); this.id = id; this.children = []; this.attributes = {};
    this.className = ''; this.classList = new Classes(this); this._text = ''; this.value = '';
    this.disabled = false; this.type = ''; this.maxLength = -1; this.placeholder = '';
    this.onclick = null; this.onkeydown = null; this.oninput = null;
  }
  set textContent(value) { this._text = String(value == null ? '' : value); this.children = []; }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || null; }
  appendChild(child) { this.children.push(child); return child; }
  walk() { return this.children.flatMap((c) => [c, ...c.walk()]); }
  find(pred) { return this.walk().find(pred) || null; }
}
function makeDocument() {
  const ids = { admissionHost: new Element('div', 'admissionHost') };
  return { ids, getElementById: (id) => ids[id] || null, createElement: (tag) => new Element(tag) };
}

function runState(over = {}) {
  return {
    enabled: true, ok: true, allowance: 3, admitted: 0, remaining: 3, refused: 0,
    runState: 'open', paneBound: true, bindingStale: false, paneId: 'pty1', ...over,
  };
}

/** Harness with a stubbed bridge. `bridge: null` models "no controlled run configured". */
function harness(opts = {}) {
  const document = makeDocument();
  const logs = [];
  const calls = { submit: [], getState: 0 };
  let current = opts.state === undefined ? runState() : opts.state;
  const bridge = opts.bridge === null ? null : {
    enabled: true,
    getState: async () => { calls.getState += 1; return opts.getState ? opts.getState() : { ok: true, state: current }; },
    submitPrompt: async (req) => {
      calls.submit.push(req);
      if (opts.submitPrompt) return opts.submitPrompt(req, current);
      current = { ...current, admitted: current.admitted + 1, remaining: current.remaining - 1 };
      return { ok: true, admitted: current.admitted, remaining: current.remaining, allowance: current.allowance };
    },
    ...(opts.bridgeOverride || {}),
  };
  const view = createAdmissionView({ document, bridge, log: (line) => logs.push(line) });
  return {
    document, logs, calls, view, bridge,
    host: document.ids.admissionHost,
    setState: (v) => { current = v; },
    input: () => document.ids.admissionHost.find((n) => n.id === 'admissionPrompt'),
    send: () => document.ids.admissionHost.find((n) => n.id === 'admissionSend'),
    status: () => document.ids.admissionHost.find((n) => n.className.includes('admission-status')),
    counts: () => document.ids.admissionHost.find((n) => n.className.includes('admission-counts')),
    pane: () => document.ids.admissionHost.find((n) => n.className.includes('admission-pane')),
    counter: () => document.ids.admissionHost.find((n) => n.className.includes('admission-counter')),
    badge: () => document.ids.admissionHost.find((n) => n.className.includes('admission-badge')),
  };
}

(async () => {
  // -- 1. absent without a bridge ----------------------------------------------------------------
  process.stdout.write('\n(1) the surface is COMPLETELY ABSENT with no controlled run\n');
  {
    const h = harness({ bridge: null });
    eq(h.view.mount(), false, 'mount() refuses when window.ccAdmission is absent');
    eq(h.host.children.length, 0, 'host has ZERO children — no bar, no field, no button');
    eq(h.host.textContent, '', 'host renders no text at all');
    eq(h.view.snapshot().mounted, false, 'view reports itself unmounted');
    eq(h.calls.submit.length, 0, 'no submission is possible');
    eq(await h.view.submit(), false, 'submit() refuses with no bridge');
    eq(h.calls.submit.length, 0, 'refused submit still issued no request');
    eq(await h.view.refresh(), false, 'refresh() refuses with no bridge');
  }
  {
    // A half-present bridge is treated as absent rather than partially trusted.
    const h = harness({ bridgeOverride: { submitPrompt: undefined } });
    eq(h.view.mount(), false, 'a bridge missing submitPrompt is treated as absent');
    eq(h.host.children.length, 0, 'partial bridge builds nothing');
  }

  // -- 2. appears with the bridge and renders bounded state --------------------------------------
  process.stdout.write('\n(2) with a bridge the bar appears and renders BOUNDED state only\n');
  {
    const h = harness();
    eq(h.view.mount(), true, 'mount() succeeds with a usable bridge');
    eq(h.host.children.length, 1, 'exactly one bar is appended');
    assert(h.input() !== null, 'a dedicated prompt field exists');
    assert(h.send() !== null, 'an explicit Send button exists');
    eq(h.send().type, 'button', 'Send is type=button (never an implicit form submit)');
    eq(h.input().maxLength, MAX_PROMPT_CHARS, `field enforces the ${MAX_PROMPT_CHARS}-character client bound`);
    await h.view.refresh();
    assert(h.counts().textContent.includes('3 of 3'), 'remaining allowance is displayed');
    assert(h.counts().textContent.includes('0 spent'), 'spent count is displayed');
    eq(h.pane().textContent, 'pane: pty1', 'the BOUND PANE IDENTIFIER is displayed');
    eq(h.badge().textContent, 'CONTROLLED RUN', 'controlled state is displayed');
    eq(h.send().disabled, false, 'Send is enabled for a live bound run with allowance');
    eq(h.view.mount(), true, 'mount() is idempotent');
    eq(h.host.children.length, 1, 'a second mount does not duplicate the bar');
  }
  {
    const h = harness({ state: runState({ paneBound: false, paneId: null }) });
    h.view.mount(); await h.view.refresh();
    eq(h.pane().textContent, 'pane: unbound', 'an unbound run is VISIBLY unbound');
    assert(h.pane().classList.contains('unbound'), 'unbound state is visibly styled');
    eq(h.send().disabled, true, 'Send is disabled while unbound');
  }
  {
    const h = harness({ state: runState({ paneBound: false, paneId: null, bindingStale: true }) });
    h.view.mount(); await h.view.refresh();
    eq(h.pane().textContent, 'pane: unbound (stale binding)', 'a stale binding is named as such');
    eq(h.send().disabled, true, 'Send is disabled on a stale binding');
  }

  // -- 3. one explicit click = exactly one submission --------------------------------------------
  process.stdout.write('\n(3) ONE explicit click produces EXACTLY ONE submission\n');
  {
    const h = harness();
    h.view.mount(); await h.view.refresh();
    h.input().value = 'run the thing';
    h.send().onclick();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    eq(h.calls.submit.length, 1, 'exactly one submitPrompt call');
    eq(h.calls.submit[0].paneId, 'pty1', 'submitted to the BOUND pane, not a renderer-chosen one');
    eq(h.calls.submit[0].prompt, 'run the thing', 'the prompt is passed through unchanged');
    eq(Object.keys(h.calls.submit[0]).sort().join(','), 'paneId,prompt', 'request carries exactly the two allowed keys');
    eq(h.input().value, '', 'prompt text is CLEARED after a successful admission');
  }
  {
    // Mount alone must never spend.
    const h = harness();
    h.view.mount();
    eq(h.calls.submit.length, 0, 'mount() causes no automatic submission');
    await h.view.refresh();
    eq(h.calls.submit.length, 0, 'refresh() causes no automatic submission');
  }

  // -- 4. Enter alone never spends ---------------------------------------------------------------
  process.stdout.write('\n(4) ENTER ALONE produces NO submission\n');
  {
    const h = harness();
    h.view.mount(); await h.view.refresh();
    h.input().value = 'this must not be sent by a keystroke';
    let prevented = 0;
    for (const key of ['Enter', 'NumpadEnter']) {
      const result = h.input().onkeydown({ key, preventDefault: () => { prevented += 1; } });
      eq(result, false, `${key} handler returns false`);
    }
    await new Promise((r) => setImmediate(r));
    eq(h.calls.submit.length, 0, 'Enter and NumpadEnter spent NOTHING');
    eq(prevented, 2, 'the default action is prevented for both Enter keys');
    eq(h.input().value, 'this must not be sent by a keystroke', 'the text is left intact for a deliberate Send');
    assert(h.status().textContent.includes('Enter does not send'), 'the user is told why Enter did nothing');
    // An ordinary key must not be swallowed.
    eq(h.input().onkeydown({ key: 'a' }), true, 'ordinary keys pass through untouched');
    eq(h.calls.submit.length, 0, 'ordinary keys spend nothing either');
  }

  // -- 5. double-click / in-flight cannot double-spend -------------------------------------------
  process.stdout.write('\n(5) an in-flight submission CANNOT be double-spent\n');
  {
    let release;
    const gate = new Promise((r) => { release = r; });
    const h = harness({ submitPrompt: async () => { await gate; return { ok: true, admitted: 1, remaining: 2, allowance: 3 }; } });
    h.view.mount(); await h.view.refresh();
    h.input().value = 'once only';
    const first = h.view.submit();
    await new Promise((r) => setImmediate(r));
    eq(h.view.snapshot().inFlight, true, 'the view reports a request in flight');
    eq(h.send().disabled, true, 'Send is DISABLED while in flight');
    const second = await h.view.submit();          // the impatient second click
    const third = await h.view.submit();
    eq(second, false, 'the second click is refused');
    eq(third, false, 'the third click is refused');
    eq(h.calls.submit.length, 1, 'still EXACTLY ONE request was issued');
    assert(h.status().textContent.includes('already in flight'), 'the in-flight refusal is visible');
    release();
    eq(await first, true, 'the original submission completes');
    eq(h.calls.submit.length, 1, 'completion did not release a queued duplicate');
    eq(h.view.snapshot().inFlight, false, 'in-flight clears afterwards');
  }

  // -- 6. N+1 visibly refuses --------------------------------------------------------------------
  process.stdout.write('\n(6) N+1 VISIBLY refuses\n');
  {
    // (a) The client already knows the allowance is gone: refuse without spending a round trip.
    const h = harness({ state: runState({ allowance: 1, admitted: 1, remaining: 0 }) });
    h.view.mount(); await h.view.refresh();
    eq(h.send().disabled, true, 'Send is disabled once the allowance is spent');
    assert(h.counts().classList.contains('spent'), 'the exhausted count is visibly styled');
    h.input().value = 'one turn too many';
    eq(await h.view.submit(), false, 'the N+1 submission is refused');
    eq(h.calls.submit.length, 0, 'a known-exhausted budget never even reaches main');
    const text = h.status().textContent;
    assert(text.includes('Budget exhausted'), 'the refusal is human-readable');
    assert(h.status().classList.contains('admission-error'), 'the refusal is visibly an error');
    assert(text.length < 200, 'the refusal is bounded in length');
    eq(h.input().value, 'one turn too many', 'a refused prompt is NOT cleared');
  }
  {
    // (b) The client's snapshot is STALE — it believes a turn is left, main knows better. Main is
    // authoritative and its refusal is what the user sees.
    // The first read (boot) shows a turn left; every later read shows the truth. That is exactly the
    // window in which a stale client can make a doomed request.
    let reads = 0;
    const h = harness({
      submitPrompt: async () => ({ ok: false, reason: 'admission-budget-exhausted', admitted: 1, remaining: 0, allowance: 1 }),
      getState: () => {
        reads += 1;
        return { ok: true, state: runState(reads === 1 ? { allowance: 1, admitted: 0, remaining: 1 } : { allowance: 1, admitted: 1, remaining: 0 }) };
      },
    });
    h.view.mount(); await h.view.refresh();
    h.input().value = 'one turn too many';
    eq(await h.view.submit(), false, "main's N+1 refusal is honoured over a stale client snapshot");
    eq(h.calls.submit.length, 1, 'the stale client did make the request');
    assert(h.status().textContent.includes('Budget exhausted'), "main's exhausted refusal is displayed");
    eq(h.view.snapshot().run.remaining, 0, 'the corrected count is pulled from main afterwards');
    eq(h.send().disabled, true, 'Send is disabled once main reports exhaustion');
  }
  {
    // A closed run refuses too.
    const h = harness({ state: runState({ runState: 'closed', remaining: 2 }) });
    h.view.mount(); await h.view.refresh();
    eq(h.badge().textContent, 'RUN CLOSED', 'a closed run is visibly closed');
    h.input().value = 'nope';
    eq(await h.view.submit(), false, 'a closed run refuses');
    eq(h.calls.submit.length, 0, 'a closed run never reaches main');
    assert(h.status().textContent.includes('closed'), 'the closed-run refusal is visible');
  }

  // -- 7. no prompt text anywhere ----------------------------------------------------------------
  process.stdout.write('\n(7) prompt text NEVER reaches logs, status text, or view state\n');
  {
    const SENTINEL = 'PROMPT_SENTINEL_c0ffee_do_not_leak';
    for (const outcome of [
      { ok: true, admitted: 1, remaining: 2, allowance: 3 },
      { ok: false, reason: 'admission-persist-failed' },
      { ok: false, reason: 'admission-write-failed-after-admission' },
    ]) {
      const h = harness({ submitPrompt: async () => outcome });
      h.view.mount(); await h.view.refresh();
      h.input().value = SENTINEL;
      await h.view.submit();
      const where = {
        'renderer logs': h.logs.join('\n'),
        'status line': h.status().textContent,
        'whole rendered host': h.host.textContent,
        'view snapshot': JSON.stringify(h.view.snapshot()),
      };
      for (const [name, text] of Object.entries(where)) {
        assert(!text.includes(SENTINEL), `${outcome.ok ? 'success' : outcome.reason}: sentinel absent from ${name}`);
      }
    }
  }
  {
    // A hostile reason from main is bounded before it is displayed.
    const h = harness({ submitPrompt: async () => ({ ok: false, reason: '<img src=x onerror=alert(1)>' }) });
    h.view.mount(); await h.view.refresh();
    h.input().value = 'x';
    await h.view.submit();
    eq(h.status().textContent, 'Refused — admission-unknown-error.', 'an unbounded reason is replaced by a constant');
    eq(h.status().children.length, 0, 'the refusal creates no child element');
    assert(!h.logs.join('').includes('onerror'), 'the hostile reason never enters the log');
  }
  eq(boundedReason('admission-budget-exhausted'), 'admission-budget-exhausted', 'a valid constant survives bounding');
  eq(boundedReason('Not A Constant'), 'admission-unknown-error', 'an invalid reason is replaced');
  eq(boundedReason(undefined), 'admission-unknown-error', 'a missing reason is replaced');
  assert(reasonText('admission-write-failed-after-admission').includes('not refunded'),
    'the writer-failure text states the turn is NOT refunded');
  assert(reasonText('admission-persist-failed').includes('NOTHING was sent'),
    'the persist-failure text states nothing was sent');

  // -- 8. state refreshes after success AND refusal ----------------------------------------------
  process.stdout.write('\n(8) state REFRESHES after both success and refusal\n');
  {
    const h = harness();
    h.view.mount();
    await h.view.refresh();
    const afterBoot = h.calls.getState;
    h.input().value = 'go';
    await h.view.submit();
    assert(h.calls.getState > afterBoot, 'state is re-read after a successful admission');
    eq(h.view.snapshot().run.remaining, 2, 'the refreshed remaining count comes from main');
    assert(h.counts().textContent.includes('2 of 3'), 'the refreshed count is rendered');
  }
  {
    // A writer failure SPENDS the turn. The refreshed count must show that, not assume a refusal is free.
    let spent = 0;
    const h = harness({
      submitPrompt: async () => { spent = 1; return { ok: false, reason: 'admission-write-failed-after-admission' }; },
      getState: () => ({ ok: true, state: runState({ admitted: spent, remaining: 3 - spent }) }),
    });
    h.view.mount(); await h.view.refresh();
    const before = h.calls.getState;
    h.input().value = 'go';
    eq(await h.view.submit(), false, 'the writer failure is reported as a refusal');
    assert(h.calls.getState > before, 'state is re-read after a REFUSAL too');
    eq(h.view.snapshot().run.remaining, 2, 'the refusal that DID spend shows the reduced remaining count');
    assert(h.status().textContent.includes('not refunded'), 'the final visible message is the writer-failure refusal');
  }
  {
    const h = harness({ getState: () => { throw new Error('ipc down'); } });
    h.view.mount();
    eq(await h.view.refresh(), false, 'a thrown getState is handled, not propagated');
    eq(h.view.snapshot().ready, false, 'the view marks itself not ready');
    eq(h.send().disabled, true, 'Send is disabled when state is unavailable');
    assert(h.status().textContent.length > 0, 'the failure is visible');
  }
  {
    const h = harness({ getState: () => ({ ok: true, state: { enabled: true, ok: false, reason: 'admission-ledger-unreadable' } }) });
    h.view.mount();
    eq(await h.view.refresh(), false, 'an unhealthy ledger state is refused');
    assert(h.status().textContent.includes('admission-ledger-unreadable'), 'the ledger reason stays visible');
    eq(h.send().disabled, true, 'Send is disabled on an unhealthy ledger');
  }

  // -- client bound + empty ----------------------------------------------------------------------
  process.stdout.write('\nclient-side bounds (main stays authoritative)\n');
  {
    const h = harness();
    h.view.mount(); await h.view.refresh();
    h.input().value = '   ';
    eq(await h.view.submit(), false, 'a whitespace-only prompt is refused locally');
    eq(h.calls.submit.length, 0, 'the empty prompt never reached main');
    h.input().value = 'x'.repeat(MAX_PROMPT_CHARS + 1);
    eq(await h.view.submit(), false, 'an over-long prompt is refused locally');
    eq(h.calls.submit.length, 0, 'the over-long prompt never reached main');
    assert(h.status().textContent.includes(String(MAX_PROMPT_CHARS)), 'the limit is stated to the user');
    h.input().value = 'x'.repeat(MAX_PROMPT_CHARS);
    eq(await h.view.submit(), true, 'a prompt at exactly the limit is allowed through');
    eq(h.calls.submit.length, 1, 'the boundary-length prompt reached main');
    // The counter reports length only — never the text.
    h.input().value = 'abc';
    h.input().oninput();
    eq(h.counter().textContent, `3 / ${MAX_PROMPT_CHARS}`, 'the counter shows a length, not the text');
    assert(!h.counter().textContent.includes('abc'), 'the counter never contains the prompt');
  }
  {
    // Main remains authoritative: a prompt the client accepts can still be refused server-side.
    const h = harness({ submitPrompt: async () => ({ ok: false, reason: 'admission-prompt-control-characters' }) });
    h.view.mount(); await h.view.refresh();
    h.input().value = 'looks fine to the client';
    eq(await h.view.submit(), false, "main's refusal overrides the client's acceptance");
    assert(h.status().textContent.includes('control characters'), "main's reason is what the user sees");
  }

  // -- 12. no bypass path -------------------------------------------------------------------------
  process.stdout.write('\n(12) the view has NO path to a PTY other than admission-submit-prompt\n');
  {
    const viewSrc = fs.readFileSync(path.join(__dirname, 'admission-view.js'), 'utf8');
    const code = viewSrc.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');
    eq((code.match(/submitPrompt\(/g) || []).length, 1, 'exactly ONE submitPrompt call site in the view');
    eq((code.match(/ptyWrite/g) || []).length, 0, 'the view never references cc.ptyWrite');
    eq((code.match(/\bcc\./g) || []).length, 0, 'the view never touches the general `cc` bridge');
    eq((code.match(/ipcRenderer/g) || []).length, 0, 'the view never touches ipcRenderer directly');
    eq((code.match(/require\(/g) || []).length, 0, 'the view requires no module (no Node reach)');
    // The prompt value is touched in exactly five places, and every one of them is accounted for:
    // two in the counter (type guard + `.length`), two in submit() (type guard + the value passed to
    // submitPrompt), and one write that clears the field. Any sixth occurrence is a new place the
    // prompt could escape from and must be justified before this number is raised.
    eq((code.match(/el\.input\.value/g) || []).length, 5,
      'input.value appears exactly 5x: 2 counter, 2 submit, 1 clear');
    const appSrc = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
    assert(appSrc.includes('window.ccAdmission\n  ? window.ccAdmissionView.createAdmissionView('),
      'app.js constructs the view ONLY when the bridge exists');
    assert(appSrc.includes('if (admissionView) admissionView.mount();'), 'app.js guards mount()');
    assert(appSrc.includes('if (admissionView) await admissionView.refresh();'), 'app.js guards refresh()');
  }

  // -- 16. gate-off leaves the global undefined ---------------------------------------------------
  process.stdout.write('\n(16) with the gate off there is no bridge to find\n');
  {
    const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
    assert(preload.includes("if (process.argv.includes('--blue-helm-admission-budget')) {"),
      'ccAdmission is exposed only behind the controlled-run token');
    // Comments discuss the bridge by name; CODE must not mention it before the gate opens.
    const preloadCode = preload.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');
    const idx = preloadCode.indexOf("--blue-helm-admission-budget");
    assert(idx > 0, 'the gate is present in preload code, not only in a comment');
    eq((preloadCode.slice(0, idx).match(/ccAdmission/g) || []).length, 0,
      'no CODE exposes ccAdmission before the gate');
    eq((preloadCode.match(/exposeInMainWorld\('ccAdmission'/g) || []).length, 1,
      'ccAdmission is exposed from exactly one place');
    // The token is a main-process argument; renderer script cannot add one.
    const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    assert(main.includes("...(admissionEnabled ? [ADMISSION_RENDERER_ARG] : []),"),
      'main adds the token only when a run is configured');
    // Quick Links must still be reachable from the same preload.
    for (const m of ['quickLinksList', 'quickLinksSave', 'quickLinksOpen']) {
      assert(preload.includes(m), `Quick Links bridge method ${m} survives alongside ccAdmission`);
    }
  }

  process.stdout.write(`\nadmission-view: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  process.stderr.write(`admission-view test harness failed: ${error && error.stack}\n`);
  process.exit(1);
});
