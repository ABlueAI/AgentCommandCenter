'use strict';
// S18: the brain tab's task-node stage, conversation cards and right panel
// (docs/DESIGN-BRIEF-1.1.md section 4). It sits in S66's brain frame (`#makoPanel-brain`).
//
// What this module owns:
//   * the task model: one task per live pane, its state from pane status (S06/S07's hook view),
//     the stall watch (20 minutes of silence or 5 failed tries; a usage stop is never "stalled"),
//     and the urgency order (needs you on top, oldest first; then held, working, queued, ended);
//   * the stage layout: up to 8 nodes, then groups by repo (default), by kind, or none; a click on
//     a group fans its tasks out;
//   * Ctrl+F: find a node by title or content, focus it on the stage, opening its group;
//   * the prompt reader: a numbered menu in a pane's last lines ("Do you want to proceed?" with
//     "1. Yes"), turned into a permission or question card;
//   * the keys a card answer sends: only a digit that the menu on screen offered, or Esc. Nothing
//     from a pane's output is ever written back into a pane (the answer is a key, never text);
//   * the DOM: the stage, the work-flow strip, the conversation column with question and
//     permission cards, the message box shell and the right panel (Right now or In focus).
//
// The shark itself is drawn by shark-renderer.js into this stage's `sharkHost`. Not here yet:
// "What Mako knows" (question 3). The conductor's own content (replies, plan cards, briefs) is S51's.
//
// Every value shown (titles, repos, branches, pane output) is untrusted text, so it reaches the DOM
// only through textContent and setAttribute on fixed attribute names, never as HTML.
//
// Dual browser-<script> / CommonJS module; tested in plain node (brain-stage.test.js).

(function publish(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ccBrainStage = api;
})(typeof window !== 'undefined' ? window : globalThis, function factory() {
  // Node states, most urgent first (brief 3.2 and 4.2). The word goes with the colour, always.
  const STATE_ORDER = Object.freeze(['needs', 'held', 'working', 'idle', 'ended']);
  const STATE_INFO = Object.freeze({
    needs: Object.freeze({ token: 'status-needs', word: 'Needs you' }),
    held: Object.freeze({ token: 'status-held', word: 'Held by Blue' }),
    working: Object.freeze({ token: 'status-working', word: 'Working' }),
    idle: Object.freeze({ token: 'status-idle', word: 'Queued' }),
    ended: Object.freeze({ token: 'status-ended', word: 'Turn ended' }),
  });
  const MAX_NODES = 8;
  const STALL_SILENCE_MS = 20 * 60 * 1000;
  const STALL_FAILED_TRIES = 5;
  const GROUP_MODES = Object.freeze(['repo', 'kind', 'none']);
  const MAX_PROMPT_LINES = 40;
  const MAX_OPTIONS = 6; // the In-focus card shows 6 answers; a longer menu is answered in the pane

  // Pane status (pane-status-protocol.js STATES) -> node state. `exited` leaves the stage (it stays
  // in the history and in Ctrl+F); `unknown` is shown as queued with its own word, never as working.
  const FROM_PANE_STATUS = Object.freeze({
    attention: 'needs', failed: 'needs', working: 'working', idle: 'idle', 'turn ended': 'ended', unknown: 'idle', exited: 'exited',
  });

  function str(value, max) {
    if (value === undefined || value === null) return '';
    const s = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ');
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }
  function num(value) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
  function minutes(ms) { return ms > 0 ? Math.floor(ms / 60000) : 0; }
  function clock(ms) {
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  /**
   * Read the prompt a pane is showing from its last output lines (ANSI already stripped).
   * Claude Code draws a permission request as a question line ("Do you want to proceed?") over a
   * numbered menu ("❯ 1. Yes", "2. Yes, and don't ask again ...", "3. No, and tell Claude ...").
   * The last numbered menu that counts up from 1 wins. Returns null when there is none.
   * kind is 'permission' only for a "Do you want to ..." question whose first option is "Yes";
   * anything else with a menu is a 'question'.
   */
  function readPrompt(lines) {
    if (!Array.isArray(lines) || lines.length === 0) return null;
    const recent = lines.slice(-MAX_PROMPT_LINES).map((l) => String(l == null ? '' : l));
    const OPTION = /^[\s│|]*(?:[❯›>]\s*)?([1-9])[.)]\s+(.+?)[\s│|]*$/;
    // Walk up from the bottom: collect the last block of consecutive option lines.
    let end = -1;
    for (let i = recent.length - 1; i >= 0; i--) { if (OPTION.test(recent[i])) { end = i; break; } }
    if (end < 0) return null;
    // A live menu is at the bottom of the screen: at most 3 lines after its last option, none of
    // them another reply (a numbered list further up in the agent's answer is not a menu).
    if (recent.length - 1 - end > 3) return null;
    // Only consecutive option lines count. A menu split by a wrapped line no longer counts up from
    // 1 and is refused below: the card then offers only "Open pane", never a guessed key.
    let start = end;
    while (start - 1 >= 0 && OPTION.test(recent[start - 1])) start--;
    const options = [];
    for (let i = start; i <= end; i++) {
      const m = OPTION.exec(recent[i]);
      options.push({ n: Number(m[1]), label: str(m[2].trim(), 80) });
    }
    // The menu must count 1, 2, 3 ... with no gaps, or it isn't a menu we can answer.
    if (options.length < 2 || options.length > MAX_OPTIONS) return null;
    // ... and it has a cursor (❯) on one of its options, which a plain list never has.
    let cursor = false;
    for (let i = start; i <= end; i++) if (/^[\s│|]*[❯›]/.test(recent[i])) cursor = true;
    if (!cursor) return null;
    for (let i = 0; i < options.length; i++) if (options[i].n !== i + 1) return null;
    const clean = (l) => l.replace(/^[\s│|╭╰─]+|[\s│|╮╯─]+$/g, '');
    let question = '';
    let qAt = -1;
    for (let i = start - 1; i >= 0 && i >= start - 6; i--) {
      const t = clean(recent[i]);
      if (t) { question = str(t, 200); qAt = i; break; }
    }
    // What the request is about: the lines above the question, back to the tool's header (Claude
    // Code draws "Bash command" or "● Bash(...)" and then the command), at most 12 lines. All of it
    // is shown on the card and is part of the signature, so two requests that differ only in their
    // command differ. `complete` says the header was found, so the whole command is on the card;
    // without it (a longer command, another layout) Allow once is not offered.
    const detail = [];
    let complete = false;
    for (let i = qAt - 1; i >= 0 && i >= qAt - 12; i--) {
      const t = clean(recent[i]);
      if (!t) break;
      detail.unshift(str(t, 200));
      if (TOOL_HEADER.test(t)) { complete = true; break; }
    }
    const permission = /^Do you want to\b/i.test(question) && /^Yes\b/i.test(options[0].label);
    return { kind: permission ? 'permission' : 'question', question, detail, complete, options };
  }

  // A stable signature of a prompt, so a click is checked against the prompt still on screen.
  function promptSignature(prompt) {
    if (!prompt) return '';
    return JSON.stringify([prompt.kind, prompt.detail || [], prompt.complete === true, prompt.question, prompt.options.map((o) => [o.n, o.label])]);
  }

  // The one option "Allow once" picks: the first "Yes" that doesn't widen the permission
  // ("don't ask again", "always", "all"). Null if the menu has none, so the button refuses.
  // The first line of a tool request in Claude Code's permission prompt.
  const TOOL_HEADER = /^(●\s*[A-Za-z][\w-]*\(|(Bash command|Edit file|Create file|Write file|Read file|Fetch|Web ?search|Tool use|MCP tool)\b)/i;

  // An option that widens what the agent may do beyond this one request. The brain tab never
  // offers one as a button; Blue picks it in the pane if he wants it.
  const WIDENING = /don'?t ask|always|\ball\b|session|auto-?accept|bypass/i;
  function widens(label) { return WIDENING.test(String(label || '')); }
  // A permission card offers "Allow once" only when it shows the whole request (from the tool's
  // header down to the question) and the menu has a plain "Yes".
  function allowOnceOption(prompt) {
    if (!prompt || prompt.kind !== 'permission') return null;
    if (!Array.isArray(prompt.detail) || prompt.detail.length === 0 || prompt.complete !== true) return null;
    // Only a plain "Yes" (with at most a bracketed hint), never "Yes, and ...".
    const o = prompt.options.find((x) => /^Yes\.?(\s*\([^)]*\))?$/i.test(x.label) && !widens(x.label));
    return o ? o.n : null;
  }

  /**
   * The keys a card action sends to the pane, or a refusal. The only keys this module ever
   * produces are one digit the menu on screen offered, or Esc.
   * action: 'allowOnce' | 'deny' | 'answer' | 'interrupt'; answerId: 'opt-<n>' for 'answer'.
   * clickedSignature: the prompt the card showed; current: the prompt on screen now.
   */
  function keysForAction(action, task, clickedSignature, answerId) {
    if (!task) return { ok: false, reason: 'task-gone' };
    if (action === 'interrupt') {
      return task.state === 'working' || task.stalled ? { ok: true, keys: '\u001b' } : { ok: false, reason: 'not-working' };
    }
    if (task.state !== 'needs' || !task.prompt) return { ok: false, reason: 'no-prompt' };
    if (promptSignature(task.prompt) !== clickedSignature) return { ok: false, reason: 'prompt-changed' };
    if (action === 'deny') return task.prompt.kind === 'permission' ? { ok: true, keys: '\u001b' } : { ok: false, reason: 'not-permission' };
    if (action === 'allowOnce') {
      const n = allowOnceOption(task.prompt);
      return n ? { ok: true, keys: String(n) } : { ok: false, reason: 'no-allow-once-option' };
    }
    if (action === 'answer') {
      const m = /^opt-([1-9])$/.exec(String(answerId || ''));
      if (!m) return { ok: false, reason: 'bad-answer' };
      const n = Number(m[1]);
      const opt = task.prompt.options.find((o) => o.n === n);
      if (!opt) return { ok: false, reason: 'bad-answer' };
      if (widens(opt.label)) return { ok: false, reason: 'widening-option' };
      return { ok: true, keys: String(n) };
    }
    return { ok: false, reason: 'unknown-action' };
  }

  /**
   * Build one task from what the app knows about a pane.
   * input: { id, title, repo, branch, role, model, authority, holder, status, statusSince,
   *          lastOutputAt, failedTries, usageResetAt, held, lines }
   * Returns null for an exited pane (it leaves the stage) or input without an id.
   */
  function buildTask(input, now) {
    const p = input || {};
    if (typeof p.id !== 'string' || !p.id) return null;
    const t = num(now) || Date.now();
    const mapped = FROM_PANE_STATUS[p.status] || 'idle';
    const since = num(p.statusSince);
    const task = {
      id: p.id,
      title: str(p.title, 120) || 'Untitled task',
      holder: str(p.holder, 40) || (p.role ? str(p.role, 40) : 'agent'),
      repo: str(p.repo, 80),
      branch: str(p.branch, 120),
      role: str(p.role, 40),
      model: str(p.model, 40),
      authority: str(p.authority, 20),
      kind: str(p.role, 40) || 'shell',
      status: typeof p.status === 'string' ? p.status : 'unknown',
      since,
      waitingMin: since === null ? 0 : minutes(t - since),
      state: mapped,
      word: STATE_INFO[mapped] ? STATE_INFO[mapped].word : '',
      stalled: false,
      prompt: null,
      latest: '',
    };
    if (mapped === 'exited') { task.word = 'Exited'; return task; }
    if (p.status === 'unknown' || !Object.prototype.hasOwnProperty.call(FROM_PANE_STATUS, p.status)) task.word = 'Status unknown';
    if (p.status === 'failed') task.word = 'Failed';
    if (p.held === true && mapped !== 'needs') { task.state = 'held'; task.word = STATE_INFO.held.word; }
    const lines = Array.isArray(p.lines) ? p.lines : [];
    for (let i = lines.length - 1; i >= 0; i--) { const l = str(lines[i], 200).trim(); if (l) { task.latest = l; break; } }
    if (task.state === 'needs' && p.status === 'attention') task.prompt = readPrompt(lines);
    // Stall watch (V7): a usage stop is never stalled; otherwise 20 minutes of silence or 5 failed tries.
    const reset = num(p.usageResetAt);
    if (reset !== null && reset > t) {
      task.word = `Waiting for reset at ${clock(reset)}`;
    } else if (task.state === 'working') {
      const last = num(p.lastOutputAt);
      const silent = last !== null && t - last >= STALL_SILENCE_MS;
      const tries = num(p.failedTries) !== null && p.failedTries >= STALL_FAILED_TRIES;
      if (silent || tries) { task.state = 'needs'; task.stalled = true; task.word = 'Stalled'; }
    }
    return task;
  }

  // Most urgent first: by state, then oldest first (the longest wait on top).
  function orderTasks(tasks) {
    const live = (Array.isArray(tasks) ? tasks : []).filter((x) => x && x.state !== 'exited');
    return live.slice().sort((a, b) => {
      const d = STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state);
      if (d !== 0) return d;
      const sa = a.since === null ? Infinity : a.since;
      const sb = b.since === null ? Infinity : b.since;
      if (sa !== sb) return sa - sb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  function mostUrgent(tasks) { return orderTasks(tasks)[0] || null; }

  /**
   * What the stage draws: nodes (single tasks) and groups (a repo or kind with a count, coloured
   * by its most urgent task). Groups appear only past 8 tasks; mode 'none' never groups.
   * expanded: the group key whose tasks are fanned out (its tasks become nodes again).
   */
  function stageItems(tasks, mode, expanded) {
    const ordered = orderTasks(tasks);
    const m = GROUP_MODES.includes(mode) ? mode : 'repo';
    if (ordered.length <= MAX_NODES || m === 'none') return ordered.map((t) => ({ type: 'task', task: t }));
    const groups = new Map();
    for (const t of ordered) {
      const key = m === 'repo' ? (t.repo || 'No repo') : (t.kind || 'shell');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    const items = [];
    for (const [key, list] of groups) {
      if (key === expanded) for (const t of list) items.push({ type: 'task', task: t, group: key });
      else items.push({ type: 'group', key, mode: m, count: list.length, state: list[0].state, top: list[0] });
    }
    // Keep the urgency order across groups and fanned-out tasks.
    const rank = (it) => STATE_ORDER.indexOf(it.type === 'task' ? it.task.state : it.state);
    const since = (it) => { const s = it.type === 'task' ? it.task.since : it.top.since; return s === null ? Infinity : s; };
    return items.sort((a, b) => (rank(a) - rank(b)) || (since(a) - since(b)));
  }

  /**
   * Where each item sits, as fractions of the stage (x, y in 0..1). Higher = more urgent: one row
   * per state present, in urgency order; left and right only spread the row out, they carry no
   * meaning. The middle column is left for the shark.
   */
  function layoutItems(items) {
    const list = Array.isArray(items) ? items : [];
    const rows = [];
    for (const it of list) {
      const s = it.type === 'task' ? it.task.state : it.state;
      let row = rows.find((r) => r.state === s);
      if (!row) { row = { state: s, items: [] }; rows.push(row); }
      row.items.push(it);
    }
    const out = [];
    rows.forEach((row, r) => {
      const y = rows.length === 1 ? 0.2 : 0.12 + (0.76 * r) / (rows.length - 1);
      const n = row.items.length;
      row.items.forEach((it, i) => {
        // Spread across the width, skipping the shark's middle fifth.
        const slots = [];
        for (let k = 0; k < n; k++) {
          const f = n === 1 ? 0.25 : (k / (n - 1));
          slots.push(f < 0.5 ? 0.06 + f * 0.68 : 0.62 + (f - 0.5) * 0.64);
        }
        out.push({ item: it, x: Math.min(0.94, slots[i]), y });
      });
    });
    return out;
  }

  /**
   * Ctrl+F: tasks whose title or content matches every word of the query, title matches first.
   * Content is the repo, branch, holder, latest line and the prompt's question. Exited tasks are
   * found too (nothing disappears).
   */
  function findTasks(tasks, query) {
    const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
    if (!words.length) return [];
    const scored = [];
    for (const t of Array.isArray(tasks) ? tasks : []) {
      if (!t) continue;
      const title = t.title.toLowerCase();
      const content = [t.repo, t.branch, t.holder, t.latest, t.prompt ? t.prompt.question : ''].join(' ').toLowerCase();
      if (!words.every((w) => title.includes(w) || content.includes(w))) continue;
      const score = words.filter((w) => title.includes(w)).length;
      scored.push({ t, score });
    }
    return scored.sort((a, b) => b.score - a.score).map((x) => x.t);
  }

  // The counts line and the work-flow strip (brief 4.1).
  function counts(tasks) {
    const live = orderTasks(tasks);
    return {
      waiting: live.filter((t) => t.state === 'needs' || t.state === 'held').length,
      onAgents: live.filter((t) => t.state === 'working').length,
      ready: live.filter((t) => t.state === 'ended').length,
      queued: live.filter((t) => t.state === 'idle').length,
    };
  }

  // The In-focus card's state for a task (in-focus-card.js STATES).
  function focusState(task) {
    if (!task) return null;
    if (task.stalled) return 'working'; // a stalled task keeps Interrupt (Esc), the thing Blue wants then
    if (task.state === 'needs') return task.prompt && task.prompt.kind === 'permission' ? 'permission' : 'question';
    if (task.state === 'ended' || task.state === 'exited') return 'finished';
    return 'working';
  }

  // The In-focus card's task object (in-focus-card.js buildInFocusCard).
  function focusTask(task, now) {
    const t = num(now) || Date.now();
    return {
      state: focusState(task),
      title: task.title,
      // No answer is marked recommended: the pane's own order is not Mako's advice.
      answers: task.prompt && task.prompt.kind === 'question' ? task.prompt.options.filter((o) => !widens(o.label)).map((o) => ({ id: `opt-${o.n}`, label: o.label })) : [],
      heldBy: task.holder, repo: task.repo, role: task.role, model: task.model, authority: task.authority, branch: task.branch,
      elapsed: task.since === null ? '' : `${minutes(t - task.since)} min`,
      latest: task.prompt && task.prompt.detail && task.prompt.detail.length ? task.prompt.detail.join(' · ') : task.latest,
    };
  }

  // The one-line hover text (brief 4.2): "Review #174 · waiting 6 min · asks adapter or port".
  function hoverLine(task) {
    const parts = [task.title, `${task.word.toLowerCase()} · waiting ${task.waitingMin} min`];
    if (task.prompt && task.prompt.question) parts.push(`asks ${task.prompt.question}`);
    return str(parts.join(' · '), 200);
  }

  // ---- DOM ----------------------------------------------------------------------------------------

  function h(doc, tag, className, content, attrs) {
    const n = doc.createElement(tag);
    if (className) n.className = className;
    if (content !== undefined && content !== null) n.textContent = content;
    if (attrs) for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
    return n;
  }

  /**
   * Mount the brain tab into S66's frame.
   * deps: { doc, host (the frame's main area), log(line), now(), inFocus (ccInFocusCard),
   *         onKeys(paneId, keys) -> Promise<{ok, reason?}> (the only path to a pane),
   *         readPane(paneId) -> the pane's input for buildTask now (checked at every click),
   *         onOpenPane(paneId), onViewPaused(paused) }
   * Returns { update(inputs), find(query), focusFind(), focusTask(id), state() }.
   */
  function refusal(kind) { const e = new Error(`brain-stage: ${kind}`); e.kind = kind; return e; }

  // What each refusal means, in words.
  const REFUSAL_TEXT = Object.freeze({
    'prompt-changed': 'The pane\'s prompt is not what the card showed; open the pane.',
    'no-prompt': 'The pane is no longer showing that prompt; open the pane.',
    'task-gone': 'That pane is closed.',
    'already-answered': 'This prompt was already answered from here; open the pane to check it.',
    'not-working': 'That pane isn\'t working, so there is nothing to interrupt.',
    'not-permission': 'That is a question, not a permission request.',
    'no-allow-once-option': 'Mako can\'t show what this allows, or there is no plain "Yes"; open the pane.',
    'widening-option': 'That choice widens what the agent may do; pick it in the pane if you want it.',
    'bad-answer': 'That isn\'t one of the choices on screen.',
    'unknown-action': 'Open the pane.',
  });

  function createBrainStage(deps) {
    const d = deps || {};
    const doc = d.doc;
    const log = typeof d.log === 'function' ? d.log : () => {};
    const now = typeof d.now === 'function' ? d.now : () => Date.now();
    if (!doc || !d.host) throw refusal('mount-missing');
    if (!d.inFocus || typeof d.inFocus.buildInFocusCard !== 'function') throw refusal('in-focus-card-missing');
    if (typeof d.onKeys !== 'function' || typeof d.onOpenPane !== 'function') throw refusal('pane-bridge-missing');

    const st = {
      tasks: [], history: new Map(), mode: 'repo', expanded: null, focusId: null, paused: false,
      updatedAt: null, frozenAt: null, findQuery: '', findHits: [], notice: '', spent: new Map(),
    };

    const root = h(doc, 'div', 'mk-brain', null, { id: 'makoBrain' });
    const left = h(doc, 'div', 'mk-brain-main');
    const right = h(doc, 'aside', 'mk-brain-right', null, { id: 'makoBrainRight', 'aria-label': 'Right panel' });

    // Stage
    const stage = h(doc, 'section', 'mk-stage', null, { id: 'makoStage', 'aria-label': 'Task stage' });
    const stageTop = h(doc, 'div', 'mk-stage-top');
    const liveLine = h(doc, 'span', 'mk-meta mk-stage-live', '', { id: 'makoStageLive', 'aria-live': 'polite' });
    const pauseBtn = h(doc, 'button', 'mk-btn', 'Pause', { type: 'button', id: 'makoStagePause', title: 'Freeze this view (the agents keep working)' });
    const groupSel = h(doc, 'select', 'mk-select', null, { id: 'makoStageGroup', 'aria-label': 'Group tasks' });
    for (const [v, label] of [['repo', 'Group by repo'], ['kind', 'Group by kind'], ['none', 'No grouping']]) {
      const o = h(doc, 'option', null, label); o.value = v; groupSel.appendChild(o);
    }
    const findBox = h(doc, 'input', 'mk-input mk-stage-find', null, { id: 'makoStageFind', type: 'search', placeholder: 'Find a task (Ctrl F)', 'aria-label': 'Find a task', 'aria-keyshortcuts': 'Control+F' });
    stageTop.appendChild(liveLine);
    stageTop.appendChild(findBox);
    stageTop.appendChild(groupSel);
    stageTop.appendChild(pauseBtn);
    const field = h(doc, 'div', 'mk-stage-field', null, { id: 'makoStageField', role: 'group', 'aria-label': 'Task nodes, most urgent at the top' });
    // The lines from the shark to the nodes, in the stage's own 0..100 coordinates.
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const svg = (tag, attrs) => {
      const n = typeof doc.createElementNS === 'function' ? doc.createElementNS(SVG_NS, tag) : doc.createElement(tag);
      for (const k of Object.keys(attrs || {})) n.setAttribute(k, attrs[k]);
      return n;
    };
    const lines = svg('svg', { class: 'mk-stage-lines', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true', id: 'makoStageLines' });
    field.appendChild(lines);
    // The shark renderer (shark-renderer.js) draws into this box, behind the nodes.
    const sharkHost = h(doc, 'div', 'mk-shark-host', null, { id: 'makoSharkHost' });
    field.appendChild(sharkHost);
    const shark = h(doc, 'button', 'mk-shark-slot', null, { type: 'button', id: 'makoShark', 'aria-label': 'Mako, the conductor', title: '"What Mako knows" opens here in a later step of S18 (pending Blue\'s visual check).' });
    shark.appendChild(h(doc, 'span', 'mk-shark-mark', 'Mako'));
    const sharkState = h(doc, 'span', 'mk-meta', 'Idle', { id: 'makoSharkState' });
    shark.appendChild(sharkState);
    const sharkNote = h(doc, 'span', 'mk-meta mk-shark-note', 'Loading the shark\'s shape', { id: 'makoSharkNote', role: 'status' });
    shark.appendChild(sharkNote);
    shark.disabled = true;
    field.appendChild(shark);
    const countsLine = h(doc, 'p', 'mk-meta mk-stage-counts', '', { id: 'makoStageCounts' });
    const voiceLine = h(doc, 'p', 'mk-meta mk-stage-voice', 'Hold Ctrl Space to talk. The mic is off until you do.');
    const findStatus = h(doc, 'p', 'mk-meta', '', { id: 'makoStageFindStatus', 'aria-live': 'polite' });
    stage.appendChild(stageTop);
    stage.appendChild(field);
    stage.appendChild(countsLine);
    stage.appendChild(voiceLine);
    stage.appendChild(findStatus);

    // Work-flow strip
    const strip = h(doc, 'nav', 'mk-flow-strip', null, { id: 'makoFlowStrip', 'aria-label': 'Work flow' });
    const flow = {};
    for (const [id, label] of [['inbox', 'Inbox'], ['running', 'Running'], ['output', 'Output']]) {
      const b = h(doc, 'div', 'mk-flow-item', null, { 'data-flow': id });
      b.appendChild(h(doc, 'p', 'mk-overline', label));
      flow[id] = h(doc, 'p', 'mk-numeral', '0');
      b.appendChild(flow[id]);
      strip.appendChild(b);
    }

    // Conversation and message box
    const convo = h(doc, 'section', 'mk-convo', null, { id: 'makoConvo', 'aria-label': 'Conversation' });
    const cards = h(doc, 'div', 'mk-convo-cards', null, { id: 'makoConvoCards' });
    const convoNote = h(doc, 'p', 'mk-meta', 'Mako\'s own replies, plan cards and the morning brief come with the conductor (S51). Questions and permission requests from your panes show here now.');
    const box = h(doc, 'form', 'mk-message-box', null, { id: 'makoMessageBox', 'aria-label': 'Message box' });
    const chips = h(doc, 'div', 'mk-chips');
    for (const label of ['Repo: auto', 'Tier: auto', 'Model: auto']) chips.appendChild(h(doc, 'span', 'mk-chip mk-chip-mode', label));
    const input = h(doc, 'textarea', 'mk-message-input', null, { id: 'makoMessageInput', rows: '2', placeholder: 'Talk to Mako, or give it a job', 'aria-label': 'Message to Mako' });
    const send = h(doc, 'button', 'mk-btn mk-btn-primary', 'Send', { type: 'submit', id: 'makoMessageSend' });
    send.disabled = true;
    send.setAttribute('title', 'Mako, the conductor, answers here once S51 is built. Until then answer a card, or type in the pane.');
    const sendNote = h(doc, 'p', 'mk-meta', 'Sending waits for the conductor (S51). Answer a card above, or open the pane.', { id: 'makoMessageNote' });
    box.appendChild(chips);
    box.appendChild(input);
    box.appendChild(send);
    box.appendChild(sendNote);
    box.addEventListener('submit', (e) => { e.preventDefault(); });
    convo.appendChild(cards);
    convo.appendChild(convoNote);
    convo.appendChild(box);

    left.appendChild(stage);
    left.appendChild(strip);
    left.appendChild(convo);
    root.appendChild(left);
    root.appendChild(right);
    d.host.appendChild(root);

    function notice(text) {
      st.notice = str(text, 200);
      findStatus.textContent = st.notice;
      log(`[brain] ${st.notice}\n`);
    }

    function taskById(id) { return st.tasks.find((t) => t.id === id) || null; }

    // The one path from a card to a pane: checked against the prompt on screen at click time,
    // and only a digit the menu offered or Esc goes out.
    // The check is against the pane as it is now (deps.readPane), not the stage's last snapshot,
    // and nothing is sent while the view is paused (its cards may be out of date).
    function act(action, id, signature, answerId) {
      if (st.paused) { notice('Not sent: view-paused. Resume the view, then answer.'); return Promise.resolve({ ok: false, reason: 'view-paused' }); }
      let task = taskById(id);
      if (typeof d.readPane === 'function') {
        let fresh = null;
        try { fresh = d.readPane(id); } catch { fresh = null; }
        task = fresh ? buildTask(fresh, now()) : null;
      }
      let res = keysForAction(action, task, signature, answerId);
      // One answer per prompt: a second click on the same prompt, before the pane's status moves
      // on, is refused (it would answer a prompt Blue hasn't seen yet).
      const spent = st.spent.get(id);
      if (res.ok && action !== 'interrupt' && spent && task && spent.sig === signature && spent.since === task.since) res = { ok: false, reason: 'already-answered' };
      if (!res.ok) { notice(`Not sent: ${res.reason}. ${REFUSAL_TEXT[res.reason] || 'Open the pane.'}`); render(); return Promise.resolve(res); }
      if (action !== 'interrupt') st.spent.set(id, { sig: signature, since: task.since });
      return Promise.resolve()
        .then(() => d.onKeys(id, res.keys))
        .then((r) => {
          if (!r || r.ok !== true) { st.spent.delete(id); notice(`Not sent: ${(r && r.reason) || 'write-failed'}.`); return { ok: false, reason: (r && r.reason) || 'write-failed' }; }
          // ptyWrite is one-way: main can still refuse it (a protected pane, an exited process),
          // so this says what happened, not that the pane moved on.
          notice(`Key sent to ${task.title}; check that it moved on.`);
          return { ok: true };
        }, () => { st.spent.delete(id); notice('Not sent: write-failed.'); return { ok: false, reason: 'write-failed' }; });
    }

    function openPane(id) {
      try { d.onOpenPane(id); } catch (e) { notice(`Could not open the pane: ${e && e.kind === 'pane-closed' ? 'pane-closed' : 'open-failed'}.`); }
    }

    function nodeButton(item) {
      if (item.type === 'group') {
        const label = item.key;
        const b = h(doc, 'button', `mk-node mk-node-group mk-node-${item.state}`, null, { type: 'button', 'data-group': label, 'data-state': item.state, title: `${label}: ${item.count} tasks; most urgent ${STATE_INFO[item.state].word.toLowerCase()}` });
        b.appendChild(h(doc, 'span', 'mk-node-dot', null, { 'aria-hidden': 'true' }));
        b.appendChild(h(doc, 'span', 'mk-node-label', `${str(label, 40)} · ${item.count}`));
        b.appendChild(h(doc, 'span', 'mk-node-sub', STATE_INFO[item.state].word));
        b.addEventListener('click', () => { st.expanded = st.expanded === label ? null : label; render(); });
        return b;
      }
      const t = item.task;
      const cls = `mk-node mk-node-${t.state}${t.stalled ? ' mk-node-stalled' : ''}${st.findHits.includes(t.id) ? ' mk-node-hit' : ''}${st.focusId === t.id ? ' mk-node-focus' : ''}`;
      const b = h(doc, 'button', cls, null, { type: 'button', 'data-task': t.id, 'data-state': t.state, title: hoverLine(t) });
      b.appendChild(h(doc, 'span', 'mk-node-dot', null, { 'aria-hidden': 'true' }));
      b.appendChild(h(doc, 'span', 'mk-node-label', `${t.title} · ${t.holder}`));
      b.appendChild(h(doc, 'span', 'mk-node-sub', `${t.word} · waiting ${t.waitingMin} min`));
      b.addEventListener('click', () => { st.focusId = t.id; render(); });
      return b;
    }

    function promptCard(t) {
      const sig = promptSignature(t.prompt);
      const permission = t.prompt.kind === 'permission';
      const card = h(doc, 'article', permission ? 'mk-card mk-card-permission' : 'mk-card', null, { 'data-task': t.id, 'data-kind': t.prompt.kind });
      const head = h(doc, 'div', 'mk-card-head');
      head.appendChild(h(doc, 'span', `mk-chip mk-chip-${permission ? 'permission' : 'question'}`, permission ? 'Permission' : 'Needs you'));
      head.appendChild(h(doc, 'span', 'mk-meta', `${t.repo || 'No repo'} · waiting ${t.waitingMin} min`));
      card.appendChild(head);
      card.appendChild(h(doc, 'h3', 'mk-card-title', t.title));
      for (const line of t.prompt.detail || []) card.appendChild(h(doc, 'p', 'mk-mono mk-prompt-detail', line));
      if (permission && t.prompt.complete !== true) card.appendChild(h(doc, 'p', 'mk-meta mk-shark-error', 'Mako can\'t show this whole request here (it may be cut off); open the pane to read it.', { 'data-incomplete': 'true' }));
      card.appendChild(h(doc, 'p', 'mk-question', t.prompt.question || 'The pane is asking you to choose.'));
      if (permission) card.appendChild(h(doc, 'p', 'mk-meta mk-permission-line', d.inFocus.PERMISSION_LINE));
      const actions = h(doc, 'div', 'mk-card-actions');
      const btn = (label, primary, fn, attrs) => {
        const b = h(doc, 'button', primary ? 'mk-btn mk-btn-primary' : 'mk-btn', label, Object.assign({ type: 'button' }, attrs || {}));
        b.addEventListener('click', fn);
        actions.appendChild(b);
        return b;
      };
      if (permission) {
        const allow = btn('Allow once', true, () => act('allowOnce', t.id, sig), { 'data-action': 'allowOnce' });
        if (!allowOnceOption(t.prompt)) { allow.disabled = true; allow.setAttribute('title', 'Mako can\'t show what this allows, or the menu has no plain "Yes"; open the pane.'); }
        btn('Deny', false, () => act('deny', t.id, sig), { 'data-action': 'deny' });
      } else {
        for (const o of t.prompt.options) {
          if (widens(o.label)) { actions.appendChild(h(doc, 'span', 'mk-meta', `${o.n}. ${o.label} (in the pane only)`, { 'data-widening': `opt-${o.n}` })); continue; }
          btn(o.label, false, () => act('answer', t.id, sig, `opt-${o.n}`), { 'data-action': 'answer', 'data-answer': `opt-${o.n}` });
        }
      }
      btn('Open pane', false, () => openPane(t.id), { 'data-action': 'openPane' });
      card.appendChild(actions);
      return card;
    }

    function renderRight() {
      while (right.firstChild) right.removeChild(right.firstChild);
      const task = st.focusId ? taskById(st.focusId) : null;
      if (task) {
        const sig = promptSignature(task.prompt);
        let card;
        try {
          card = d.inFocus.buildInFocusCard(doc, focusTask(task, now()), {
            allowOnce: () => act('allowOnce', task.id, sig),
            deny: () => act('deny', task.id, sig),
            answer: (_t, answerId) => act('answer', task.id, sig, answerId),
            interrupt: () => act('interrupt', task.id, ''),
            openPane: () => openPane(task.id),
            terminal: () => openPane(task.id),
            backToRightNow: () => { st.focusId = null; render(); },
          });
        } catch {
          card = h(doc, 'p', 'mk-meta', 'The In-focus card could not be drawn (card-refused). Open the pane from its node.');
          log('[brain] REFUSED: the In-focus card could not be drawn (card-refused)\n');
        }
        right.appendChild(card);
        return;
      }
      if (st.focusId && !task) st.focusId = null;
      const c = counts(st.tasks);
      right.appendChild(h(doc, 'p', 'mk-overline', 'Right now'));
      const dl = h(doc, 'dl', 'mk-props', null, { id: 'makoRightNow' });
      for (const [k, v] of [['Waiting on you', c.waiting], ['On agents', c.onAgents], ['Ready', c.ready], ['Queued', c.queued]]) {
        dl.appendChild(h(doc, 'dt', 'mk-prop-name', k));
        dl.appendChild(h(doc, 'dd', 'mk-prop-value mk-numeral', String(v)));
      }
      right.appendChild(dl);
      const waiting = orderTasks(st.tasks).filter((t) => t.state === 'needs').slice(0, 6);
      if (waiting.length) {
        right.appendChild(h(doc, 'p', 'mk-overline', 'Waiting on you'));
        for (const t of waiting) {
          const b = h(doc, 'button', 'mk-side-item', `${t.title} · ${t.waitingMin} min`, { type: 'button', 'data-task': t.id });
          b.addEventListener('click', () => { st.focusId = t.id; render(); });
          right.appendChild(b);
        }
      }
      right.appendChild(h(doc, 'p', 'mk-meta', 'Usage and its reset time are in the top bar. Merged-PR history and activity come with the history data (S62).'));
    }

    function render() {
      const t = now();
      // Live line and counts
      if (st.paused) liveLine.textContent = `Paused · last updated ${st.frozenAt ? clock(st.frozenAt) : 'never'}`;
      else liveLine.textContent = st.updatedAt === null ? 'Live · waiting for the first update' : `Live · updated ${Math.max(0, Math.round((t - st.updatedAt) / 1000))} seconds ago`;
      pauseBtn.textContent = st.paused ? 'Resume' : 'Pause';
      pauseBtn.setAttribute('aria-pressed', st.paused ? 'true' : 'false');
      const c = counts(st.tasks);
      countsLine.textContent = `Waiting on you ${c.waiting} · On agents ${c.onAgents} · Ready ${c.ready}`;
      flow.inbox.textContent = String(c.queued);
      flow.running.textContent = String(c.onAgents + c.waiting);
      flow.output.textContent = String(c.ready);

      // Nodes, and the lines from the shark to them (brief 4.2; pending Blue's visual check,
      // question 3): solid faint blue = tracking, dashed red = waiting on Blue, none = queued.
      for (const n of Array.from(field.querySelectorAll('.mk-node'))) n.remove();
      while (lines.firstChild) lines.removeChild(lines.firstChild);
      const items = stageItems(st.tasks, st.mode, st.expanded);
      if (items.length === 0) {
        const empty = h(doc, 'p', 'mk-node mk-node-empty mk-meta', 'No live tasks. Start an agent from the control room.');
        field.appendChild(empty);
      }
      for (const placed of layoutItems(items)) {
        const lineState = placed.item.type === 'task' ? placed.item.task.state : placed.item.state;
        if (lineState !== 'idle') {
          const l = svg('line', { x1: '50', y1: '45', x2: (placed.x * 100).toFixed(2), y2: (placed.y * 100).toFixed(2), class: lineState === 'needs' ? 'mk-line mk-line-waiting' : 'mk-line mk-line-tracking', 'data-line': lineState });
          lines.appendChild(l);
        }
        const b = nodeButton(placed.item);
        b.style.left = `${(placed.x * 100).toFixed(2)}%`;
        b.style.top = `${(placed.y * 100).toFixed(2)}%`;
        field.appendChild(b);
      }

      // Cards: one per pane waiting on a prompt, most urgent first.
      while (cards.firstChild) cards.removeChild(cards.firstChild);
      for (const task of orderTasks(st.tasks)) {
        if (task.state !== 'needs') continue;
        if (task.prompt) { cards.appendChild(promptCard(task)); continue; }
        if (task.status !== 'attention') continue;
        // Waiting on Blue, but no menu Mako can read: say so, and offer only the pane.
        const c = h(doc, 'article', 'mk-card', null, { 'data-task': task.id, 'data-kind': 'unreadable' });
        c.appendChild(h(doc, 'h3', 'mk-card-title', task.title));
        c.appendChild(h(doc, 'p', 'mk-meta', 'This pane is waiting on you, but Mako couldn\'t read a menu it can answer (prompt-unreadable). Open the pane.'));
        const b = h(doc, 'button', 'mk-btn mk-btn-primary', 'Open pane', { type: 'button', 'data-action': 'openPane' });
        b.addEventListener('click', () => openPane(task.id));
        c.appendChild(b);
        cards.appendChild(c);
      }
      if (st.tasks.length && st.tasks.every((x) => x.status === 'unknown')) {
        cards.appendChild(h(doc, 'p', 'mk-meta mk-status-note', 'Pane status isn\'t reporting, so the stage can\'t show who needs you. Check "Claude status" in the control room\'s terminal bar.', { id: 'makoStatusNote' }));
      }
      const finished = Array.from(st.history.values()).filter((x) => x.state === 'exited');
      if (finished.length) cards.appendChild(h(doc, 'p', 'mk-meta mk-finished-line', `${finished.length} finished: ${finished.slice(-4).map((x) => x.title).join(', ')}`));
      renderRight();
    }

    function update(inputs) {
      const t = now();
      const built = (Array.isArray(inputs) ? inputs : []).map((p) => buildTask(p, t)).filter(Boolean);
      for (const b of built) st.history.set(b.id, b);
      // A pane that is gone entirely (closed) is finished: it leaves the stage, stays in history.
      const liveIds = new Set(built.map((b) => b.id));
      for (const [id, old] of st.history) if (!liveIds.has(id) && old.state !== 'exited') st.history.set(id, Object.assign({}, old, { state: 'exited', word: 'Closed' }));
      if (st.paused) return false;
      st.tasks = built.filter((b) => b.state !== 'exited');
      st.updatedAt = t;
      if (st.findQuery) st.findHits = findTasks(st.tasks, st.findQuery).map((x) => x.id);
      render();
      return true;
    }

    function find(query) {
      st.findQuery = str(query, 120);
      const hits = findTasks(Array.from(st.history.values()), st.findQuery);
      st.findHits = hits.map((x) => x.id);
      if (!st.findQuery) { findStatus.textContent = ''; render(); return []; }
      const live = hits.find((x) => st.tasks.some((t) => t.id === x.id));
      if (live) {
        st.focusId = live.id;
        // Open the folded group that holds it.
        if (st.tasks.length > MAX_NODES && st.mode !== 'none') st.expanded = st.mode === 'repo' ? (live.repo || 'No repo') : (live.kind || 'shell');
        findStatus.textContent = `${hits.length} found; showing ${live.title}`;
      } else if (hits.length) {
        findStatus.textContent = `${hits.length} found, all finished: ${hits[0].title}`;
      } else {
        findStatus.textContent = 'No task matches.';
      }
      render();
      const node = live ? field.querySelector(`[data-task="${live.id.replace(/[^A-Za-z0-9_-]/g, '')}"]`) : null;
      if (node && typeof node.focus === 'function') node.focus();
      return hits.map((x) => x.id);
    }

    findBox.addEventListener('input', () => find(findBox.value));
    findBox.addEventListener('keydown', (e) => { if (e.key === 'Escape') { findBox.value = ''; find(''); } });
    groupSel.addEventListener('change', () => { st.mode = GROUP_MODES.includes(groupSel.value) ? groupSel.value : 'repo'; st.expanded = null; render(); });
    pauseBtn.addEventListener('click', () => {
      st.paused = !st.paused;
      if (st.paused) st.frozenAt = st.updatedAt; else st.frozenAt = null;
      // Pause freezes this view's motion too (the shark), never the agents.
      if (typeof d.onViewPaused === 'function') { try { d.onViewPaused(st.paused); } catch { log('[brain] the shark did not take the view\'s pause\n'); } }
      render();
    });

    render();
    return {
      update, find,
      focusFind: () => { findBox.focus(); if (typeof findBox.select === 'function') findBox.select(); },
      focusTask: (id) => { st.focusId = id; render(); },
      // The shark slot's words: Mako's own state (never a task's) and the shape file's load
      // result; an error is shown in the needs-you colour, with its reason.
      setShark: (info) => {
        const i = info || {};
        if (typeof i.state === 'string') sharkState.textContent = str(i.state, 20);
        if (typeof i.note === 'string') sharkNote.textContent = str(i.note, 160);
        sharkNote.className = i.error ? 'mk-meta mk-shark-note mk-shark-error' : 'mk-meta mk-shark-note';
      },
      state: () => ({ tasks: st.tasks.slice(), mode: st.mode, expanded: st.expanded, focusId: st.focusId, paused: st.paused, findHits: st.findHits.slice(), notice: st.notice }),
      root, sharkHost,
    };
  }

  // Exactly Ctrl+F: no Shift, Alt or Meta.
  function isFindChord(e) {
    return !!e && e.ctrlKey === true && !e.shiftKey && !e.altKey && !e.metaKey && (e.key === 'f' || e.key === 'F' || e.code === 'KeyF');
  }

  return {
    STATE_ORDER, STATE_INFO, MAX_NODES, STALL_SILENCE_MS, STALL_FAILED_TRIES, GROUP_MODES, FROM_PANE_STATUS,
    readPrompt, promptSignature, allowOnceOption, widens, keysForAction, buildTask, orderTasks, mostUrgent, stageItems, layoutItems,
    findTasks, counts, focusState, focusTask, hoverLine, createBrainStage, isFindChord,
  };
});
