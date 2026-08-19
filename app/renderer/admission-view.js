'use strict';
// MAIN-OWNED TURN ADMISSION BUDGET — the controlled-run surface.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
//
// THIS IS NOT A SECOND WAY TO WRITE TO A PTY. It is a form that asks main to spend one admission. The
// only call it can make is `ccAdmission.submitPrompt()`; there is no `cc.ptyWrite` here, no fallback,
// and no retry that reaches the terminal another way. If main refuses, nothing is written and the
// refusal is displayed — this module has no path around that answer.
//
// ABSENT, NOT INERT. `createAdmissionView` is only ever constructed when `window.ccAdmission` exists,
// and `mount()` refuses and builds NOTHING when the bridge is missing. With no controlled run
// configured the preload never exposes the bridge, so the host element stays empty: no field, no
// button, no status text, and nothing for a stray click to reach. Renderer script cannot add the
// process argument that creates the bridge, so it cannot conjure this surface into existence either.
//
// ENTER IS NOT A SEND. Every send costs real money, so it takes a deliberate pointer click on a button
// that says so. The key handler below swallows Enter and explains why rather than leaving it to the
// accident that a bare <input> outside a <form> happens not to submit — a future refactor that wraps
// this in a form must not silently turn a keystroke into a paid turn.
//
// PROMPT TEXT NEVER LEAVES THE FIELD. It leaves this module through exactly ONE call — the single
// `bridge.submitPrompt(...)` below. The only other access anywhere is a `.length` read for the
// character counter, which yields a number and never the text. It is never logged, never put in a
// status line, never stored in `state` (the state object has no prompt field, deliberately, so there
// is no object that could later be serialized with it inside), and never echoed back from a refusal.
// Every message shown here is either a fixed string from REASON_TEXT or a bounded reason constant
// re-validated against a strict pattern. Both counts — one `submitPrompt` call site and zero
// `ptyWrite` references — are asserted by source tripwires in renderer/admission-view.test.js.

(function publish(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ccAdmissionView = api;
})(typeof window !== 'undefined' ? window : globalThis, function factory() {
  // Mirrors MAX_PROMPT_CHARS in app/admission-budget.js. This is a CONVENIENCE bound: it stops an
  // obviously over-long prompt from costing a round trip. Main re-checks it and main's answer is the
  // one that counts, exactly as the renderer's length check on any other boundary in this app.
  const MAX_PROMPT_CHARS = 4000;

  // Local reasons for refusals this module can decide without asking main. They are in the same
  // bounded namespace as the budget's own constants so the display path cannot tell them apart.
  const LOCAL_REASON = Object.freeze({
    BRIDGE_UNAVAILABLE: 'admission-bridge-unavailable',
    IPC_FAILED: 'admission-ipc-failed',
    NO_PANE_BOUND: 'admission-no-pane-bound',
    IN_FLIGHT: 'admission-already-in-flight',
    EMPTY_PROMPT: 'admission-prompt-empty',
    TOO_LONG: 'admission-prompt-too-long',
    NOT_READY: 'admission-state-unavailable',
  });

  // Human-readable text for the refusals Blue will actually meet. Anything not listed still displays,
  // as its bounded constant — an unknown reason must stay VISIBLE rather than be swallowed by a
  // generic "something went wrong", because an unrecognised refusal is the interesting one.
  const REASON_TEXT = Object.freeze({
    'admission-budget-exhausted': 'Budget exhausted — every authorized turn for this run has been spent. No further prompt will be admitted.',
    'admission-run-closed': 'This run is closed. Its remaining allowance was voided and cannot be spent.',
    'admission-no-pane-bound': 'No pane is bound to this run yet. Open the controlled terminal pane first.',
    'admission-pane-mismatch': 'That is not the pane bound to this run. The budget cannot be moved to another pane.',
    'admission-pane-binding-stale': 'The bound pane is from a previous session. Restart with the rebind flag set, or open a new run.',
    'admission-pane-not-running': 'The bound pane is not running, so nothing was spent.',
    'admission-persist-failed': 'The ledger could not be written, so NOTHING was sent and no turn was spent.',
    'admission-ledger-unreadable': 'The ledger could not be read safely, so NOTHING was sent and no turn was spent.',
    'admission-ledger-integrity-mismatch': 'The ledger failed its integrity check, so NOTHING was sent and the rejected file was left unchanged.',
    'admission-ledger-conflict': 'Another Blue Helm process changed or is updating the ledger. NOTHING was sent; use the existing app window.',
    'admission-ledger-malformed': 'The ledger is malformed, so NOTHING was sent and the rejected file was left unchanged.',
    'admission-ledger-version-mismatch': 'The ledger version is unsupported, so NOTHING was sent and the rejected file was left unchanged.',
    'admission-write-failed-after-admission': 'The turn was recorded but the terminal write failed. This turn IS spent and is not refunded.',
    'admission-already-in-flight': 'A submission is already in flight. Wait for it to finish.',
    'admission-direct-input-blocked': 'Direct typing is disabled for the controlled pane. Use this form.',
    'admission-prompt-empty': 'Enter a prompt first.',
    'admission-prompt-too-long': `Prompt is too long — the limit is ${MAX_PROMPT_CHARS} characters.`,
    'admission-prompt-control-characters': 'Prompt contains control characters (including line breaks). Use a single line of plain text.',
    'admission-bridge-unavailable': 'The controlled-run bridge is unavailable. No prompt can be submitted.',
    'admission-ipc-failed': 'The request to the main process failed. Nothing was sent.',
    'admission-state-unavailable': 'Run state is unavailable, so submission is disabled.',
    'admission-untrusted-sender': 'Refused: the main process did not trust this window.',
    'admission-disabled': 'No controlled run is configured.',
  });

  /**
   * Refusal reasons are rendered into the DOM, so they are treated as untrusted until proven bounded —
   * the same posture quick-links-view.js takes. A reason that does not match the constant shape is
   * replaced rather than displayed.
   */
  function boundedReason(value) {
    return typeof value === 'string' && /^[a-z0-9-]{1,64}$/.test(value) ? value : 'admission-unknown-error';
  }

  function reasonText(reason) {
    const safe = boundedReason(reason);
    return REASON_TEXT[safe] || `Refused — ${safe}.`;
  }

  function createAdmissionView(deps) {
    const d = deps || {};
    const doc = d.document;
    const bridge = d.bridge;
    const log = typeof d.log === 'function' ? d.log : () => {};
    if (!doc || typeof doc.getElementById !== 'function') throw new Error('admission-view: document is required');

    // Bounded, prompt-free UI state. There is deliberately no `prompt` field here: the text lives in
    // the input element and nowhere else, so there is no object that could later be logged or
    // serialized with it inside.
    const state = {
      mounted: false,
      inFlight: false,
      ready: false,
      run: null,      // last bounded snapshot from main
      reason: null,   // last bounded refusal reason
    };
    const el = {};

    function bridgeUsable() {
      return !!bridge && typeof bridge.submitPrompt === 'function' && typeof bridge.getState === 'function';
    }

    function make(tag, className, text) {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    /**
     * Build the surface. Returns false and appends NOTHING when there is no bridge, which is the
     * "completely absent" requirement: the host keeps zero children.
     */
    function mount() {
      if (state.mounted) return true;
      if (!bridgeUsable()) return false;
      const host = doc.getElementById('admissionHost');
      if (!host) return false;

      const bar = make('div', 'admission-bar');
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', 'Controlled run turn budget');

      const head = make('div', 'admission-head');
      el.badge = make('span', 'admission-badge', 'CONTROLLED RUN');
      el.counts = make('span', 'admission-counts', '—');
      el.pane = make('span', 'admission-pane', 'pane: unbound');
      head.appendChild(el.badge); head.appendChild(el.counts); head.appendChild(el.pane);

      const row = make('div', 'admission-row');
      el.input = doc.createElement('input');
      el.input.type = 'text';
      el.input.id = 'admissionPrompt';
      el.input.className = 'admission-input';
      el.input.maxLength = MAX_PROMPT_CHARS;
      el.input.autocomplete = 'off';
      el.input.spellcheck = false;
      el.input.placeholder = 'Prompt for the controlled pane (single line) — each send spends one paid turn';
      el.input.setAttribute('aria-label', 'Controlled run prompt');
      // Enter must never spend a turn. Swallow it and say so, rather than relying on the absence of a
      // surrounding <form> to make it harmless.
      el.input.onkeydown = (ev) => {
        const key = ev && ev.key;
        if (key === 'Enter' || key === 'NumpadEnter') {
          if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
          setNotice('Enter does not send. Click Send — each send spends one paid turn.', false);
          return false;
        }
        return true;
      };
      el.input.oninput = () => { renderCounter(); };

      el.send = doc.createElement('button');
      el.send.type = 'button';
      el.send.id = 'admissionSend';
      el.send.className = 'mini accent admission-send';
      el.send.textContent = 'Send 1 turn';
      el.send.onclick = () => { submit(); };

      row.appendChild(el.input); row.appendChild(el.send);

      el.counter = make('span', 'admission-counter', `0 / ${MAX_PROMPT_CHARS}`);
      el.status = make('div', 'admission-status', '');
      el.status.setAttribute('role', 'status');
      el.status.setAttribute('aria-live', 'polite');

      bar.appendChild(head); bar.appendChild(row); bar.appendChild(el.counter); bar.appendChild(el.status);
      host.appendChild(bar);
      state.mounted = true;
      renderRun();
      return true;
    }

    function renderCounter() {
      if (!el.counter) return;
      const n = typeof el.input.value === 'string' ? el.input.value.length : 0;
      el.counter.textContent = `${n} / ${MAX_PROMPT_CHARS}`;
      el.counter.classList.toggle('over', n > MAX_PROMPT_CHARS);
    }

    function setNotice(message, isError) {
      if (!el.status) return;
      el.status.textContent = message;
      el.status.classList.toggle('admission-error', isError === true);
      el.status.setAttribute('role', isError ? 'alert' : 'status');
    }

    /** Visible refusal + a METADATA-ONLY log line. The prompt is not a parameter here and cannot be. */
    function refuse(reason) {
      const safe = boundedReason(reason);
      state.reason = safe;
      setNotice(reasonText(safe), true);
      log(`[admission-ui] result=refused reason=${safe}\n`);
      return false;
    }

    /** Paint the bounded run snapshot. Never renders anything derived from the prompt. */
    function renderRun() {
      if (!state.mounted) return;
      const run = state.run;
      if (!run || run.ok !== true) {
        el.counts.textContent = 'state unavailable';
        el.pane.textContent = 'pane: unbound';
        el.pane.classList.add('unbound');
        el.send.disabled = true;
        return;
      }
      const remaining = typeof run.remaining === 'number' ? run.remaining : 0;
      el.counts.textContent = `${remaining} of ${run.allowance} turn(s) remaining · ${run.admitted} spent`;
      el.counts.classList.toggle('spent', remaining <= 0);
      if (run.paneBound === true && typeof run.paneId === 'string') {
        el.pane.textContent = `pane: ${run.paneId}`;
        el.pane.classList.remove('unbound');
      } else {
        el.pane.textContent = run.bindingStale === true ? 'pane: unbound (stale binding)' : 'pane: unbound';
        el.pane.classList.add('unbound');
      }
      el.badge.textContent = run.runState === 'closed' ? 'RUN CLOSED' : 'CONTROLLED RUN';
      // A send is possible only with a live binding, allowance left, and no request already out.
      el.send.disabled = state.inFlight || remaining <= 0 || run.paneBound !== true || run.runState === 'closed';
    }

    /** Pull bounded state from main. Called on boot and after EVERY submission, success or refusal. */
    async function refresh() {
      if (!bridgeUsable()) { state.ready = false; return refuse(LOCAL_REASON.BRIDGE_UNAVAILABLE); }
      let result;
      try { result = await bridge.getState(); }
      catch { state.ready = false; state.run = null; renderRun(); return refuse(LOCAL_REASON.IPC_FAILED); }
      if (!result || result.ok !== true || !result.state || result.state.ok !== true) {
        state.ready = false;
        state.run = null;
        renderRun();
        return refuse((result && result.reason) || (result && result.state && result.state.reason) || LOCAL_REASON.NOT_READY);
      }
      state.ready = true;
      state.run = result.state;
      renderRun();
      log(`[admission-ui] result=state remaining=${state.run.remaining} allowance=${state.run.allowance} bound=${state.run.paneBound === true}\n`);
      return true;
    }

    /**
     * Spend one admission. The ONLY caller of `bridge.submitPrompt`, and the only place the prompt
     * text is read.
     */
    async function submit() {
      if (!bridgeUsable()) return refuse(LOCAL_REASON.BRIDGE_UNAVAILABLE);
      if (!state.mounted) return refuse(LOCAL_REASON.NOT_READY);
      // Single-flight in the UI as well as in main. Main is authoritative — it refuses a second
      // concurrent submission on its own — but blocking here means an impatient double-click never
      // becomes two requests in the first place.
      if (state.inFlight) return refuse(LOCAL_REASON.IN_FLIGHT);
      if (!state.ready || !state.run || state.run.paneBound !== true || typeof state.run.paneId !== 'string') {
        return refuse(LOCAL_REASON.NO_PANE_BOUND);
      }
      // Do not ask main to do something the last known state says is impossible. Main is still
      // authoritative — it refuses an exhausted or closed run on its own, and it is the only place the
      // count can actually be decided — but a client that already knows the answer should not spend a
      // round trip to hear it. If this snapshot is stale and main disagrees, main's refusal wins and
      // is displayed like any other. Reaching this guard at all means the button was bypassed, since
      // renderRun() disables Send in exactly these two states.
      if (state.run.runState === 'closed') return refuse('admission-run-closed');
      if (typeof state.run.remaining !== 'number' || state.run.remaining <= 0) {
        return refuse('admission-budget-exhausted');
      }
      const text = typeof el.input.value === 'string' ? el.input.value : '';
      if (text.trim().length === 0) return refuse(LOCAL_REASON.EMPTY_PROMPT);
      if (text.length > MAX_PROMPT_CHARS) return refuse(LOCAL_REASON.TOO_LONG);

      state.inFlight = true;
      state.reason = null;
      el.send.disabled = true;
      el.send.textContent = 'Sending…';
      setNotice('Submitting one admitted turn…', false);

      let result;
      try {
        result = await bridge.submitPrompt({ paneId: state.run.paneId, prompt: text });
      } catch {
        result = { ok: false, reason: LOCAL_REASON.IPC_FAILED };
      } finally {
        state.inFlight = false;
        el.send.textContent = 'Send 1 turn';
      }

      const admitted = !!(result && result.ok === true);
      if (admitted) {
        // Cleared ONLY on a real admission, so a refused prompt is still there to correct and resend.
        el.input.value = '';
        renderCounter();
        setNotice(`Sent. ${typeof result.remaining === 'number' ? result.remaining : '?'} turn(s) remaining.`, false);
        log(`[admission-ui] result=admitted remaining=${typeof result.remaining === 'number' ? result.remaining : -1}\n`);
      } else {
        refuse((result && result.reason) || LOCAL_REASON.IPC_FAILED);
      }
      // Refresh on BOTH paths. After a refusal the numbers may still have moved — a
      // `write-failed-after-admission` spends the turn — so the displayed remaining count must come
      // from main rather than from an assumption about what a refusal implies.
      await refresh();
      if (!admitted && state.reason) setNotice(reasonText(state.reason), true);
      return admitted;
    }

    return {
      mount,
      refresh,
      submit,
      // Bounded test/inspection view. Deliberately carries no prompt text.
      snapshot: () => ({
        mounted: state.mounted,
        inFlight: state.inFlight,
        ready: state.ready,
        reason: state.reason,
        run: state.run ? { ...state.run } : null,
      }),
    };
  }

  return { createAdmissionView, boundedReason, reasonText, LOCAL_REASON, REASON_TEXT, MAX_PROMPT_CHARS };
});
