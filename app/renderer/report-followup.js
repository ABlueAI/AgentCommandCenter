'use strict';
// V3b stored-report follow-up UI (renderer). One compact section under the Library report reader:
// a question box, a character counter, one explicit Ask button, a visible busy state, a plain-text
// answer, and visible errors. NOT a chat: one bounded question, one bounded answer at a time.
//
// Renderer rules implemented here (main remains the authority for every one of them):
//   - Submission happens ONLY from the Ask button. Selecting, opening, refreshing, or restoring a
//     report never submits anything — no code path here calls submit() except the click handler.
//   - A renderer-local monotonically increasing EPOCH suppresses stale responses: every selection /
//     Open Report start / Refresh start / reader clear bumps it (and clears question, answer, and
//     errors); a submission captures the epoch and its result is DISCARDED unless the epoch is
//     still current. The epoch is renderer state only — it is never sent to or echoed by main.
//   - The submit control disables while a follow-up is in flight (main's global single-flight rule
//     is the real cost boundary; this is UX).
//   - The answer and every error render through textContent via the injected safe builder — never
//     innerHTML/Markdown. The request carries ONLY {source, handle|paneId, question}.
//
// Same dual browser-<script> / CommonJS shape as library-view.js; deps ({el, doc, submit, log})
// are injected so report-followup.test.js exercises the REAL logic against a DOM stub.

((global) => {

  const FOLLOWUP_QUESTION_MAX = 2000;   // renderer convenience bound; main enforces its own

  // Map main's bounded error constants to human messages. Unknown codes (still bounded constants —
  // main allowlists them) fall through to a generic line that names the code for the Logs tab.
  const ERROR_MESSAGES = {
    'follow-up-in-progress': 'A follow-up is already running — wait for it to finish.',
    'question-empty': 'Enter a question first.',
    'question-invalid': 'Enter a question first.',
    'question-too-long': 'The question is too long (2,000 character limit).',
    'question-control-chars': 'The question contains unsupported control characters.',
    'bad-request': 'The follow-up request was malformed and was refused.',
    'unknown-handle': 'This report selection is stale — refresh the Library and select the run again.',
    'no-run-for-pane': 'This pane no longer has an associated run.',
    'gemini-key-missing': 'GEMINI_API_KEY is not configured — enter it in the key setup banner first.',
    'report-unavailable': 'The stored report could not be re-read, so nothing was asked.',
    'report-too-large-for-follow-up': 'This report exceeds the 200,000-character follow-up limit, so nothing was asked.',
    'provider-unavailable': 'Gemini reported it is overloaded and the bounded retries were exhausted — try again in a moment.',
    'provider-terminal': 'Gemini refused the request.',
    'network-error': 'A network error interrupted the request; it was not retried.',
    'empty-response': 'Gemini returned an empty answer.',
    'child-timeout': 'The follow-up timed out and was stopped.',
    'ipc-failed': 'The follow-up request could not reach the main process.',
  };
  function followupErrorMessage(code) {
    if (typeof code === 'string' && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
    return `The follow-up failed (${typeof code === 'string' && code ? code : 'unknown-error'}).`;
  }

  function createReportFollowup(deps) {
    const el = deps.el;
    const doc = deps.doc;
    const submitImpl = deps.submit;   // async (req) => main's bounded result
    const log = deps.log || (() => { });

    const state = {
      epoch: 0,                 // renderer-local; never crosses IPC
      source: null,             // { kind:'library', handle } | { kind:'pane', paneId } | null
      reportAvailable: false,
      busy: false,              // an in-flight submission this renderer started
    };
    let n = null;               // node refs after mount()

    function setError(msg) {
      if (!n) return;
      n.error.textContent = msg || '';
      if (msg) n.error.classList.remove('hidden'); else n.error.classList.add('hidden');
    }

    // Every selection / open-start / refresh-start / clear runs through here: bump the epoch (so
    // any in-flight response becomes stale) and clear the previous question, answer, and errors.
    function bump() {
      state.epoch++;
      state.source = null;
      state.reportAvailable = false;
      if (n) {
        n.question.value = '';
        n.answer.textContent = '';
        setError('');
      }
      update();
      return state.epoch;
    }

    // Called AFTER a read displayed its result: record which main-owned identity a submission
    // would use (or null when no readable report is shown). Never bumps and never submits.
    function setSource(source, reportAvailable) {
      state.source = source || null;
      state.reportAvailable = reportAvailable === true;
      update();
    }

    function update() {
      if (!n) return;
      const qLen = String(n.question.value || '').length;
      n.counter.textContent = `${qLen.toLocaleString('en-US')} / ${FOLLOWUP_QUESTION_MAX.toLocaleString('en-US')}`;
      const visible = state.reportAvailable && !!state.source;
      if (visible) n.wrap.classList.remove('hidden'); else n.wrap.classList.add('hidden');
      n.question.disabled = state.busy;
      n.btn.disabled = !(visible && !state.busy && qLen > 0 && qLen <= FOLLOWUP_QUESTION_MAX);
      n.busyNote.textContent = state.busy ? 'Asking…' : '';
    }

    // The ONE submission path — invoked ONLY by the Ask button's click handler (explicit
    // authorization for one logical provider request). Exposed for tests.
    async function submit() {
      if (!n || state.busy || !state.source || !state.reportAvailable) return { ignored: true };
      const question = String(n.question.value || '');
      if (!question.trim()) { setError(followupErrorMessage('question-empty')); return { ignored: true }; }
      const myEpoch = state.epoch;
      const req = state.source.kind === 'library'
        ? { source: 'library', handle: state.source.handle, question }
        : { source: 'pane', paneId: state.source.paneId, question };
      state.busy = true;
      setError('');
      n.answer.textContent = '';
      update();
      let res;
      try { res = await submitImpl(req); }
      catch { res = { ok: false, error: 'ipc-failed' }; }
      state.busy = false;
      if (myEpoch !== state.epoch) {
        // The user changed reports while this ran: the answer must NOT appear under the new
        // report. Discard without logging its content (metadata-only note).
        update();
        log('[followup] stale response discarded (report changed while the request ran)\n');
        return { discarded: true };
      }
      if (res && res.ok === true && typeof res.answer === 'string') {
        n.answer.textContent = res.answer;   // textContent — inert plain text, never HTML/Markdown
        const u = (res.usage && typeof res.usage === 'object') ? res.usage : {};
        log(`[followup] answered: questionChars=${question.length} attempts=${res.attempts} ` +
          `prompt=${u.promptTokens == null ? '?' : u.promptTokens} output=${u.outputTokens == null ? '?' : u.outputTokens} ` +
          `total=${u.totalTokens == null ? '?' : u.totalTokens}\n`);   // metadata only — never the texts
      } else {
        const code = res && typeof res.error === 'string' ? res.error : 'unknown-error';
        setError(followupErrorMessage(code));
        log(`[followup] failed: ${code}\n`);   // bounded constant only
      }
      update();
      return { done: true };
    }

    // Build the section into `host` with the injected safe builder. All static strings; every
    // dynamic value later lands via textContent.
    function mount(host) {
      const wrap = el(doc, 'div', { className: 'lib-followup hidden' });
      wrap.appendChild(el(doc, 'div', { className: 'lib-followup-label', text: 'Ask a follow-up about this report' }));
      const question = el(doc, 'textarea', {
        className: 'lib-followup-q',
        attrs: { rows: '3', placeholder: 'Type one question about this report…', spellcheck: 'false' },
      });
      wrap.appendChild(question);
      const bar = el(doc, 'div', { className: 'lib-followup-bar' });
      const counter = el(doc, 'span', { className: 'lib-followup-count muted small', text: '0 / 2,000' });
      const busyNote = el(doc, 'span', { className: 'lib-followup-busy muted small', text: '' });
      const btn = el(doc, 'button', { className: 'lib-btn lib-followup-submit', text: 'Ask', title: 'Submit this one question (one paid request)' });
      bar.appendChild(counter);
      bar.appendChild(el(doc, 'span', { className: 'spacer' }));
      bar.appendChild(busyNote);
      bar.appendChild(btn);
      wrap.appendChild(bar);
      const error = el(doc, 'div', { className: 'lib-followup-error lib-status-msg hidden' });
      const answer = el(doc, 'pre', { className: 'lib-followup-answer' });
      wrap.appendChild(error);
      wrap.appendChild(answer);
      host.appendChild(wrap);
      n = { wrap, question, counter, busyNote, btn, error, answer };
      btn.onclick = (e) => { if (e && e.preventDefault) e.preventDefault(); submit(); };
      question.oninput = () => update();
      update();
      return n;
    }

    return {
      mount,
      submit,
      setSource,
      noteSelection: bump,
      noteOpenReportStart: bump,
      noteRefreshStart: bump,
      noteCleared: bump,
      currentEpoch: () => state.epoch,
      isCurrent: (epoch) => epoch === state.epoch,
      _state: () => ({ epoch: state.epoch, busy: state.busy, reportAvailable: state.reportAvailable, source: state.source }),
      _nodes: () => n,
    };
  }

  // V3b Open Report ordering (the production algorithm app.js runs, exported so the ordering is
  // unit-tested — not re-implemented — in report-followup.test.js):
  //   1. Open Report bumps the epoch (clearing follow-up state) and, when the Library has not
  //      loaded yet, AWAITS the initial scan before reading the pane report — so the scan's
  //      completion (which clears the reader) is strictly ordered BEFORE the pane display and can
  //      never land on top of it.
  //   2. The awaited refresh bumps the epoch exactly once (its own noteRefreshStart). If the epoch
  //      moved further, something newer took the reader over while the scan ran: this open stops
  //      ('superseded') instead of overwriting it.
  //   3. The pane read's result displays only if the epoch is still current, and only a successful
  //      'available' read records the PANE identity as the follow-up source (no Library handle is
  //      minted; a later list refresh does not invalidate this source).
  // deps: { isLoaded():bool, refresh():Promise (must bump exactly once via noteRefreshStart),
  //         beforeRead():void, readPane(paneId):Promise, display(res):void, displayError():void }
  async function openPaneReportOrdered(followup, deps, paneId) {
    const started = followup.noteOpenReportStart();
    let myEpoch = started;
    if (!deps.isLoaded()) {
      await deps.refresh();
      if (followup.currentEpoch() !== started + 1) return 'superseded';
      myEpoch = started + 1;
    }
    if (deps.beforeRead) deps.beforeRead();
    let res;
    try { res = await deps.readPane(paneId); }
    catch {
      if (followup.isCurrent(myEpoch) && deps.displayError) deps.displayError();
      return 'failed';
    }
    if (!followup.isCurrent(myEpoch)) return 'superseded';
    deps.display(res);
    const available = !!(res && res.ok && res.status === 'available' && typeof res.text === 'string');
    followup.setSource(available ? { kind: 'pane', paneId } : null, available);
    return 'done';
  }

  const api = { createReportFollowup, followupErrorMessage, openPaneReportOrdered, FOLLOWUP_QUESTION_MAX };
  global.ccReportFollowup = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
