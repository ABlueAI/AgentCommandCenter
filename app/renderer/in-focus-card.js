'use strict';
// S66: the shared In-focus card (docs/DESIGN-BRIEF-1.1.md section 4.4). The same card appears on the
// brain tab (S18) and in the control room (S19); S66 builds the component and its four state
// layouts, and those rows wire the actions. An action with no handler yet is shown disabled with
// the reason, never as a button that silently does nothing.
//
// Every value (task title, repo, branch, the latest line) is untrusted text from panes and git, so
// it reaches the DOM only through textContent and setAttribute on fixed attribute names.
//
// Dual browser-<script> / CommonJS module; tested in plain node (in-focus-card.test.js).

(function publish(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ccInFocusCard = api;
})(typeof window !== 'undefined' ? window : globalThis, function factory() {
  const STATES = Object.freeze(['question', 'permission', 'working', 'finished']);

  // The status chip for each state: colour token and the word, so colour is never alone (the icons
  // come with S18's icon set).
  const CHIP = Object.freeze({
    question: Object.freeze({ token: 'status-needs', word: 'Needs you' }),
    permission: Object.freeze({ token: 'status-needs', word: 'Permission' }),
    working: Object.freeze({ token: 'status-working', word: 'Working' }),
    finished: Object.freeze({ token: 'status-ended', word: 'Finished' }),
  });

  // Properties, in the brief's order.
  const PROPERTIES = Object.freeze([
    ['heldBy', 'Held by'], ['repo', 'Repo'], ['role', 'Role'], ['model', 'Model'], ['authority', 'Authority'],
    ['branch', 'Branch'], ['elapsed', 'Elapsed'], ['latest', 'Latest'],
  ]);

  // Buttons per state (brief 4.4). `primary` marks the one recommended action.
  const ACTIONS = Object.freeze({
    question: Object.freeze([['askWhy', 'Ask why'], ['snooze', 'Snooze'], ['openPane', 'Open pane']]),
    permission: Object.freeze([['allowOnce', 'Allow once'], ['deny', 'Deny'], ['openPane', 'Open pane']]),
    working: Object.freeze([['peek', 'Peek'], ['askMako', 'Ask Mako'], ['openPane', 'Open pane'], ['pause', 'Pause'], ['interrupt', 'Interrupt (Esc)']]),
    finished: Object.freeze([['openPr', 'Open PR'], ['whatNext', 'What next?'], ['archive', 'Archive']]),
  });
  const FOOTER = Object.freeze([['openAgentPage', 'Open agent page'], ['terminal', 'Terminal'], ['backToRightNow', 'Back to Right now']]);
  const PERMISSION_LINE = 'Mako never answers this for you. Your click is the answer.';
  const NOT_WIRED = 'Not wired yet: the brain tab (S18) and the control room (S19) connect this button.';

  function text(value, max) {
    if (value === undefined || value === null) return '';
    const s = String(value);
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }

  function h(doc, tag, className, content) {
    const n = doc.createElement(tag);
    if (className) n.className = className;
    if (content !== undefined) n.textContent = content;
    return n;
  }

  /**
   * Build the card for one task.
   * task: { state, title, answers?: [{ id, label, recommended? }], verdict?: 'READY TO MERGE' | 'NOT READY: ...',
   *         heldBy, repo, role, model, authority, branch, elapsed, latest }
   * handlers: { [actionId]: (task, answerId?) => void }, for the actions a row has wired.
   * An unknown state is refused (throws), never drawn as another state.
   */
  function buildInFocusCard(doc, task, handlers) {
    const t = task || {};
    if (!STATES.includes(t.state)) throw new Error(`in-focus-card: unknown state "${text(t.state, 40)}"`);
    const hs = handlers || {};
    const card = h(doc, 'section', t.state === 'permission' ? 'mk-card mk-card-permission mk-infocus' : 'mk-card mk-infocus');
    card.setAttribute('aria-label', 'In focus');
    card.setAttribute('data-state', t.state);

    const head = h(doc, 'div', 'mk-card-head');
    head.appendChild(h(doc, 'p', 'mk-overline', 'In focus'));
    const chip = h(doc, 'span', `mk-chip mk-chip-${t.state}`, CHIP[t.state].word);
    chip.setAttribute('data-token', CHIP[t.state].token);
    head.appendChild(chip);
    card.appendChild(head);
    card.appendChild(h(doc, 'h3', 'mk-card-title', text(t.title, 200) || 'Untitled task'));

    const props = h(doc, 'dl', 'mk-props');
    for (const [key, label] of PROPERTIES) {
      props.appendChild(h(doc, 'dt', 'mk-prop-name', label));
      const v = text(t[key], 300);
      props.appendChild(h(doc, 'dd', key === 'branch' ? 'mk-prop-value mk-mono' : 'mk-prop-value', v || '–'));
    }
    card.appendChild(props);

    if (t.state === 'permission') card.appendChild(h(doc, 'p', 'mk-meta mk-permission-line', PERMISSION_LINE));
    if (t.state === 'finished' && t.verdict) card.appendChild(h(doc, 'p', /^READY TO MERGE/.test(t.verdict) ? 'mk-verdict mk-verdict-ready' : 'mk-verdict', text(t.verdict, 200)));

    const actions = h(doc, 'div', 'mk-card-actions');
    const button = (id, label, primary, answerId) => {
      const b = h(doc, 'button', primary ? 'mk-btn mk-btn-primary' : 'mk-btn', label);
      b.setAttribute('type', 'button');
      b.setAttribute('data-action', id);
      const fn = hs[id];
      if (typeof fn === 'function') b.addEventListener('click', () => fn(t, answerId));
      else { b.disabled = true; b.setAttribute('title', NOT_WIRED); }
      return b;
    };
    if (t.state === 'question') {
      for (const a of Array.isArray(t.answers) ? t.answers.slice(0, 6) : []) {
        // The id goes back to the caller exactly as given (never cut); only the label is shortened.
        // An id that isn't a short plain string is refused, not altered.
        if (typeof a.id !== 'string' || !/^[A-Za-z0-9_.:-]{1,120}$/.test(a.id)) continue;
        actions.appendChild(button('answer', text(a.label, 60), !!a.recommended, a.id));
      }
    }
    ACTIONS[t.state].forEach(([id, label], i) => actions.appendChild(button(id, label, t.state === 'permission' && i === 0)));
    card.appendChild(actions);

    const footer = h(doc, 'div', 'mk-card-footer');
    for (const [id, label] of FOOTER) footer.appendChild(button(id, label, false));
    card.appendChild(footer);
    return card;
  }

  return { STATES, CHIP, PROPERTIES, ACTIONS, FOOTER, PERMISSION_LINE, NOT_WIRED, buildInFocusCard };
});
