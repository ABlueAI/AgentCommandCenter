'use strict';
// S46: the daily list of Claude sessions idle 3 days or more, shown at the top of the Terminals tab
// once a day (S19's control room takes it over in its right panel later).
//
// Main decides what is idle and archives finished sessions (app/session-hygiene.js); this view only
// shows main's rows and sends Blue's done-when back. Row values (role, folder path, done-when) are
// placed with textContent only, never innerHTML (AUDIT-REPORT.md finding #1, as session-resume-view.js).
//
// Dual browser-<script> / CommonJS module, tested in plain node against a small DOM stub
// (session-hygiene-view.test.js).

(function (global) {
  function folderName(p) {
    return typeof p === 'string' && p ? p.split(/[\\/]/).filter(Boolean).pop() || p : 'unknown folder';
  }

  const STATE_WORDS = { running: 'running', waiting: 'waiting for Resume or Start fresh', finished: 'finished' };
  const OWNER_WORDS = { blue: 'Blue', composer: 'the Composer', runner: 'the runner' };

  // The words for one row. `roleLabel` maps a role to its display name (app.js's ROLES).
  function describeRow(row, roleLabel) {
    const who = row.role ? roleLabel(row.role) : 'Claude';
    const owner = (OWNER_WORDS[row.owner] || row.owner || 'unknown') + (row.ownerAssumed ? ' (assumed)' : '');
    const days = Number.isFinite(row.idleDays) ? `idle ${row.idleDays} day${row.idleDays === 1 ? '' : 's'}` : 'idle time unknown';
    return {
      label: `${who} · ${folderName(row.worktree)}`,
      detail: `${days} · ${STATE_WORDS[row.state] || row.state} · owner ${owner}`,
      doneWhen: row.doneWhen ? `Done when: ${row.doneWhen}` : 'No done-when set',
      title: row.worktree || '',
    };
  }

  // host: the empty #hygieneHost element. onSaveDoneWhen(row, text) returns a promise of
  // { ok, error }; a refusal is shown on the row, never dropped.
  function create(deps) {
    const d = deps || {};
    const doc = d.document;
    const host = d.host;
    const roleLabel = typeof d.roleLabel === 'function' ? d.roleLabel : (r) => r;
    const onSaveDoneWhen = d.onSaveDoneWhen;
    const maxLength = Number.isFinite(d.maxDoneWhenLength) ? d.maxDoneWhenLength : 200;
    let rows = [];
    let idleDays = 3;
    const errors = new Map();

    function node(tag, className, text) {
      const n = doc.createElement(tag);
      if (className) n.className = className;
      if (text !== undefined) n.textContent = text;
      return n;
    }
    function button(text, className, title, handler) {
      const b = node('button', className, text);
      b.type = 'button';
      if (title) b.title = title;
      b.onclick = handler;
      return b;
    }

    function save(row, input) {
      const text = String(input.value || '');
      return Promise.resolve()
        .then(() => onSaveDoneWhen(row, text))
        .catch(() => ({ ok: false, error: 'ipc-rejected' }))
        .then((r) => {
          if (r && r.ok === true) {
            errors.delete(row.sessionId);
            row.doneWhen = text.trim() || null;
          } else {
            errors.set(row.sessionId, `Not saved [${(r && r.error) || 'unknown'}]`);
          }
          draw();
          return r;
        });
    }

    function draw() {
      host.textContent = '';
      if (rows.length === 0) { host.className = 'hygiene-host hidden'; return; }
      host.className = 'hygiene-host';
      const box = node('div', 'hygiene-list');
      const head = node('div', 'hygiene-head');
      const n = rows.length;
      head.appendChild(node('span', null, `${n === 1 ? 'One Claude session has' : n + ' Claude sessions have'} been idle ${idleDays} days or more.`));
      head.appendChild(button('Hide until tomorrow', 'mini ghost', 'Show this list again tomorrow', () => { rows = []; draw(); }));
      box.appendChild(head);
      for (const row of rows) {
        const t = describeRow(row, roleLabel);
        const line = node('div', 'hygiene-row');
        const label = node('span', 'hygiene-label', t.label);
        label.title = t.title;
        line.appendChild(label);
        line.appendChild(node('span', 'muted small', t.detail));
        line.appendChild(node('span', 'small', t.doneWhen));
        const input = node('input', 'hygiene-done-when');
        input.type = 'text';
        input.maxLength = maxLength;
        input.placeholder = 'Done when…';
        input.value = row.doneWhen || '';
        line.appendChild(input);
        line.appendChild(button('Save', 'mini ghost', 'Save this session\'s done-when', () => save(row, input)));
        const err = errors.get(row.sessionId);
        if (err) line.appendChild(node('span', 'hygiene-warn small', err));
        box.appendChild(line);
      }
      host.appendChild(box);
    }

    function render(next, days) {
      rows = Array.isArray(next) ? next.map((r) => Object.assign({}, r)) : [];
      if (Number.isFinite(days)) idleDays = days;
      errors.clear();
      draw();
    }
    return { render, rows: () => rows.slice(), save };
  }

  // Once a day: the list shows when main's `day` differs from the last day it was shown.
  function shouldShow(lastShownDay, answer) {
    return !!(answer && answer.ok === true && typeof answer.day === 'string' && answer.day !== lastShownDay
      && Array.isArray(answer.idle) && answer.idle.length > 0);
  }

  const api = { create, describeRow, folderName, shouldShow };
  global.ccSessionHygieneView = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
