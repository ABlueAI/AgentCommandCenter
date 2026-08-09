'use strict';
// Dockview prototype — mode gate + panel payload policy (PURE, no DOM, no Dockview).
//
// Two decisions live here, both of which the work order makes kill criteria:
//
//   § 5.10  "Default `npm start` imports or initializes Dockview" is a NO-GO. So enablement must be
//           a single, strict, fail-closed decision that only main can satisfy — not a truthiness
//           check somewhere in the adapter that a stray value could pass.
//   § 5.9   "Dockview receives terminal/report contents, worktree paths, prompts, credentials,
//           provider keys, IPC authority, or filesystem authority" is a NO-GO. So the payload handed
//           to Dockview is BUILT here, from an allowlist, rather than assembled ad hoc at call sites.
//
// § 7 states what Dockview is permitted to know about a pane, and it is only three things:
//   * an opaque pane ID
//   * an allowlisted component kind ('terminal' | 'library')
//   * a display-safe title
// Notably absent: params. dockview@7.0.4 omits `params` from its serialization entirely when none is
// supplied (verified against the controlled fixture), and the layout validator refuses state that
// carries one. This module is the other half of that guarantee — it never creates one.

// BROWSER SAFETY (round 4). Renderer classic scripts share ONE global lexical environment, so a
// top-level `const` here collides with any other renderer script that uses the same name and both
// scripts fail to PARSE. That is exactly what happened: agent-dom.js already declares a top-level
// `const api`, so this module threw "Identifier 'api' has already been declared" before a single
// statement ran. Node/CommonJS never saw it because each required file gets its own module scope.
// The whole module is therefore enclosed here, which also means a future top-level name added
// below cannot collide with anything else in the renderer.
(function () {
  const ALLOWED_KINDS = new Set(['terminal', 'library']);
  const PANE_ID_PATTERN = /^(library|pty[0-9]{1,6})$/;
  const MAX_TITLE_LENGTH = 200;

  const REFUSAL = {
    BAD_PANE_ID: 'bad-pane-id',
    BAD_KIND: 'unknown-component-kind',
    BAD_TITLE: 'unsafe-title',
  };

  /**
   * Is the Dockview prototype enabled?
   *
   * STRICT and fail-closed by design. The only accepted signal is a bridge object whose `enabled` is
   * the boolean `true` — the value main forwarded through `additionalArguments` and the preload froze.
   * Truthy-but-not-true values ('true', 1, {}) are refused, so a bug or an injected object cannot
   * enable the prototype by being merely truthy. A missing bridge is off.
   */
  function isPrototypeEnabled(bridge) {
    return !!bridge && bridge.enabled === true;
  }

  /**
   * Should the renderer load and initialize Dockview at all?
   *
   * Deliberately identical to isPrototypeEnabled rather than adding a second, looser condition. It
   * exists as its own name so the call site in app.js reads as the decision it is, and so the
   * default-path test can assert on exactly the predicate that guards the dynamic import.
   */
  function shouldLoadDockview(bridge) {
    return isPrototypeEnabled(bridge);
  }

  /** Reject anything that looks like a path, URL, traversal, control character, or credential. */
  function titleIsSafe(title) {
    if (typeof title !== 'string') return false;
    if (title.length === 0 || title.length > MAX_TITLE_LENGTH) return false;
    if (/[\\/]/.test(title)) return false;
    if (/^[A-Za-z]:/.test(title)) return false;
    if (/[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(title)) return false;
    if (/\.\./.test(title)) return false;
    if (/[\r\n\t\0]/.test(title)) return false;
    if (/(api[_-]?key|secret|token|password|passwd|credential|bearer|authorization)/i.test(title)) return false;
    return true;
  }

  /**
   * Build the ONLY object that may be handed to Dockview's addPanel for a pane.
   *
   * Returns { ok:true, panel:{ id, component, title } } or { ok:false, reason }. The returned object
   * is frozen, so a later call site cannot bolt `params` (or anything else) onto it on the way to
   * Dockview.
   */
  function buildPanelDescriptor({ paneId, kind, title } = {}) {
    if (typeof paneId !== 'string' || !PANE_ID_PATTERN.test(paneId)) {
      return { ok: false, reason: REFUSAL.BAD_PANE_ID };
    }
    if (typeof kind !== 'string' || !ALLOWED_KINDS.has(kind)) {
      return { ok: false, reason: REFUSAL.BAD_KIND };
    }
    if (!titleIsSafe(title)) {
      return { ok: false, reason: REFUSAL.BAD_TITLE };
    }
    return { ok: true, panel: Object.freeze({ id: paneId, component: kind, title }) };
  }

  /**
   * Display title for a prototype pane.
   *
   * Deliberately derived from the pane ID ALONE. The production grid labels panes with the role plus
   * the worktree directory name; that name is a filesystem-derived string, and § 7 forbids handing
   * worktree paths to Dockview. Generating the title here from the opaque ID means there is no code
   * path by which a path fragment can reach a Dockview title in the first place.
   */
  function defaultTitleFor(paneId) {
    if (paneId === 'library') return 'Library';
    const m = /^pty([0-9]{1,6})$/.exec(paneId);
    return m ? `Terminal ${m[1]}` : '';
  }

  const api = {
    isPrototypeEnabled,
    shouldLoadDockview,
    buildPanelDescriptor,
    defaultTitleFor,
    titleIsSafe,
    ALLOWED_KINDS,
    PANE_ID_PATTERN,
    REFUSAL,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ccDockviewPanelPolicy = api;
})();
