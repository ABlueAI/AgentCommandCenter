((global) => {
  'use strict';
  // S19: the control room's pane header (docs/DESIGN-BRIEF-1.1.md 5.1): next to the status badge
  // and the pane's name (its task), two small tags: the branch the pane works on and the authority
  // it was started at. The status word itself is the pane-status badge (pane-status-badge.js); the
  // stall watch adds its own tag (stall-watch.js).
  //
  // The branch name comes from git (untrusted text): it reaches the DOM only as textContent and
  // attribute values on fixed names. IIFE: classic <script> files share one global scope.

  const AUTHORITY_TEXT = Object.freeze({ minimum: 'Minimum', medium: 'Medium', high: 'High' });
  const AUTHORITY_TITLE = Object.freeze({
    minimum: 'Started at Minimum: plan mode, no edits',
    medium: 'Started at Medium: edits accepted, commands ask',
    high: 'Started at High: auto mode',
  });
  const MAX_BRANCH = 48;

  function clean(text, max) {
    const s = typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }

  /**
   * What the header shows for one pane. opts: { cli, readOnly, authority, branch }.
   * Returns a list of { cls, text, title }: the branch first, then the authority.
   * Only Claude panes carry an authority: other CLIs and shells don't take one. A read-only role
   * says "read-only" (its fence holds whatever the level), and an unknown level is shown as such,
   * never guessed.
   */
  function describeTags(opts) {
    const o = opts || {};
    const tags = [];
    const branch = clean(o.branch, MAX_BRANCH);
    if (branch) tags.push({ cls: 'branch-tag', text: branch, title: `Branch: ${clean(o.branch, 200)}` });
    if (o.cli === 'claude') {
      if (o.readOnly) tags.push({ cls: 'auth-tag auth-readonly', text: 'read-only', title: 'A read-only role: its fence holds at any authority' });
      else if (Object.hasOwn(AUTHORITY_TEXT, o.authority)) tags.push({ cls: `auth-tag auth-${o.authority}`, text: AUTHORITY_TEXT[o.authority], title: AUTHORITY_TITLE[o.authority] });
      else tags.push({ cls: 'auth-tag auth-unknown', text: 'authority ?', title: 'The authority this pane started at is not known' });
    }
    return tags;
  }

  // Put the tags in the header, after the pane's name. Returns how many were added.
  function mountTags(doc, head, tags) {
    if (!doc || !head || !Array.isArray(tags)) return 0;
    const name = head.querySelector('.name');
    let after = name;
    let n = 0;
    for (const t of tags) {
      const span = doc.createElement('span');
      span.className = `pane-tag ${t.cls}`;
      span.textContent = t.text;
      span.setAttribute('title', t.title);
      if (after && after.nextSibling !== undefined && typeof head.insertBefore === 'function') head.insertBefore(span, after.nextSibling);
      else head.appendChild(span);
      after = span;
      n += 1;
    }
    return n;
  }

  const api = { AUTHORITY_TEXT, MAX_BRANCH, describeTags, mountTags };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.ccPaneHeader = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis);
