'use strict';
// S09: the "Resume or Start fresh" offer shown at the top of the Terminals tab when Mako starts after
// closing (or stopping unexpectedly) with Claude panes open.
//
// Main decides what may be offered (app/session-resume.js) and checks every Resume again in pty-start,
// so this view only shows main's rows and reports Blue's choice. Row values (role, folder path) are
// placed with textContent only, never innerHTML: folder names come from git worktrees and may contain
// markup characters (AUDIT-REPORT.md finding #1, the same rule as agent-dom.js).
//
// Dual browser-<script> / CommonJS module (like authority-choice.js), tested in plain node against a
// small DOM stub (session-resume-view.test.js).

(function (global) {
  function folderName(p) {
    return typeof p === 'string' && p ? p.split(/[\\/]/).filter(Boolean).pop() || p : 'unknown folder';
  }

  // The words for one row. `roleLabel` maps a role to its display name (app.js's ROLES).
  function describeRow(row, roleLabel) {
    const who = row.role ? roleLabel(row.role) : 'Claude';
    const when = typeof row.stoppedAt === 'string' ? row.stoppedAt.slice(0, 16).replace('T', ' ') + ' UTC' : 'unknown time';
    const how = row.stopReason === 'unknown' ? 'Mako stopped unexpectedly' : 'Mako closed';
    const warnings = [];
    if (row.worktreeMissing) warnings.push('Its folder no longer exists, so it can\'t be resumed.');
    else if (row.mayBeExpired) warnings.push('Claude Code may have deleted this conversation (cleanupPeriodDays, 30 days by default).');
    return { label: `${who} · ${folderName(row.worktree)}`, detail: `${how} ${when}`, title: row.worktree || '', warnings };
  }

  // host: the empty #resumeHost element. Handlers get the row; onResume returns false to keep the row
  // (for example at Maximum, where no local Claude pane starts).
  function create(deps) {
    const d = deps || {};
    const doc = d.document;
    const host = d.host;
    const roleLabel = typeof d.roleLabel === 'function' ? d.roleLabel : (r) => r;
    const onResume = d.onResume, onFresh = d.onFresh, onDismiss = d.onDismiss;
    let rows = [];

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
    function drop(row) { rows = rows.filter((r) => r !== row); draw(); }

    function draw() {
      host.textContent = '';
      if (rows.length === 0) { host.className = 'resume-host hidden'; return; }
      host.className = 'resume-host';
      const box = node('div', 'resume-offer');
      const head = node('div', 'resume-head');
      const n = rows.length;
      head.appendChild(node('span', null, `${n === 1 ? 'One Claude pane was' : n + ' Claude panes were'} open when Mako last closed. Resume each conversation, or start fresh.`));
      head.appendChild(button('Not now', 'mini ghost', 'Don\'t offer these again', () => {
        const all = rows; rows = []; draw();
        for (const r of all) onDismiss(r);
      }));
      box.appendChild(head);
      for (const row of rows) {
        const t = describeRow(row, roleLabel);
        const line = node('div', 'resume-row');
        const label = node('span', 'resume-label', t.label);
        label.title = t.title;
        line.appendChild(label);
        line.appendChild(node('span', 'muted small', t.detail));
        for (const w of t.warnings) line.appendChild(node('span', 'resume-warn small', w));
        if (row.worktreeMissing) {
          line.appendChild(button('Dismiss', 'mini ghost', 'Don\'t offer this again', () => { drop(row); onDismiss(row); }));
        } else {
          line.appendChild(button('Resume', 'mini accent', 'Open this pane again with claude --resume', () => {
            if (onResume(row) !== false) drop(row);
          }));
          line.appendChild(button('Start fresh', 'mini ghost', 'Open the same pane with a new conversation', () => { drop(row); onFresh(row); }));
        }
        box.appendChild(line);
      }
      host.appendChild(box);
    }

    function render(next) { rows = Array.isArray(next) ? next.slice() : []; draw(); }
    return { render, rows: () => rows.slice() };
  }

  const api = { create, describeRow, folderName };
  global.ccSessionResumeView = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
