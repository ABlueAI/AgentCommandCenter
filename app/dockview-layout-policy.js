'use strict';
// Dockview LAYOUT POLICY — the ONE schema authority, shared by main and the renderer.
//
// WHY THIS MODULE EXISTS.
//
// Saved layout state is a file on disk, therefore UNTRUSTED INPUT: a user can hand-edit it, an
// unrelated program can corrupt it, and a future Dockview version can change its shape. Dockview's
// own `fromJSON` performs no validation for us — it consumes whatever it is handed.
//
// Phase B validated that state in MAIN only. That left a real gap: main validated on read, and the
// renderer then handed the result straight to `fromJSON`. Anything that could reach the renderer
// between those two points — an IPC shape change, a future caller, a rollback snapshot Dockview
// itself produced — arrived at `fromJSON` unchecked. Phase C closes it by validating again in the
// renderer immediately before EVERY `fromJSON`, and the only honest way to do that is with the SAME
// code, not a second implementation that can drift.
//
// So this module is:
//   * PURE — no `fs`, no `path`, no Electron, no DOM, no I/O of any kind;
//   * DUAL-LOADED — `require`d by main (through `dockview-layout-store.js`) and loaded by the
//     renderer as a classic `<script>` publishing `window.ccDockviewLayoutPolicy`;
//   * FULLY ENCLOSED — it declares nothing at top level, because classic renderer scripts share ONE
//     global lexical environment and `renderer/agent-dom.js` already owns a top-level `const api`.
//     A collision there is a PARSE-time failure that takes both scripts down.
//
// The shape below was NOT inferred from Dockview's TypeScript definitions. It was derived from a
// controlled dockview@7.0.4 fixture produced by app/dockview-tripwire.js against real panel/split/
// tab-group arrangements. The captured fixture is committed at
// app/test-fixtures/dockview-7.0.4-layout.json and is asserted against this validator by the tests,
// so if a future Dockview version changes its serialization the tests fail loudly rather than the
// validator silently drifting toward permissiveness.
//
// Validation posture is STRICT ALLOWLIST, not blocklist: every object rejects unknown keys. That is
// what keeps `params`, `floatingGroups`, `popoutGroups`, and `edgeGroups` out without needing to
// enumerate them as threats — anything not explicitly permitted is refused. dockview@7.0.4 emits
// none of those for our usage, which is exactly why an allowlist is honest here rather than an
// over-fit guess.
//
// Refusals return a BOUNDED REASON CODE from the closed set below and NEVER echo file contents,
// pane IDs, layout fragments, paths, or exception text.

(function () {
  // ---- bounds -----------------------------------------------------------------------------------
  const MAX_RAW_BYTES = 262144;   // 256 KiB — checked BEFORE any parsing, by the file-backed store
  const MAX_DEPTH = 20;
  const MAX_PANELS = 64;
  const MAX_GROUPS = 64;
  const MAX_KEYS_PER_OBJECT = 32;
  const MAX_ARRAY_LENGTH = 128;
  const MAX_ID_LENGTH = 64;
  const MAX_TITLE_LENGTH = 200;

  const SCHEMA_VERSION = 1;
  const PACKAGE_NAME = 'dockview';
  const PACKAGE_VERSION = '7.0.4';

  // The ONLY component kinds Blue Helm hosts. An unknown kind is a refusal, not a skipped panel —
  // silently dropping a panel is itself a predeclared kill criterion.
  const ALLOWED_COMPONENTS = new Set(['terminal', 'library']);

  // The ONLY pane IDs that may be restored. Closed by construction: the single Library pane, or a
  // numbered terminal.
  const PANE_ID_PATTERN = /^(library|pty[0-9]{1,6})$/;

  // Keys that must never appear anywhere in parsed state, at any depth.
  const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

  // THE CLOSED REASON SET. These are the ONLY strings that may reach a log or the UI — never the
  // offending value, never a fragment of the file, never a pane ID.
  const REASON = {
    // --- file boundary (produced by the store; defined here so the set stays in one place) ---
    NOT_FOUND: 'no-saved-layout',
    NOT_REGULAR_FILE: 'not-a-regular-file',
    REPARSE_POINT: 'reparse-point-refused',
    TOO_LARGE: 'file-too-large',
    INVALID_UTF8: 'invalid-utf8',
    INVALID_JSON: 'invalid-json',
    READ_FAILED: 'read-failed',
    WRITE_FAILED: 'write-failed',

    // --- envelope + layout schema ---
    ENVELOPE_SHAPE: 'invalid-envelope',
    SCHEMA_VERSION: 'unsupported-schema-version',
    PACKAGE: 'package-mismatch',
    PACKAGE_VERSION: 'package-version-mismatch',
    TIMESTAMP: 'invalid-timestamp',
    LAYOUT_SHAPE: 'invalid-layout-shape',
    TOO_DEEP: 'layout-too-deep',
    TOO_MANY_PANELS: 'too-many-panels',
    TOO_MANY_GROUPS: 'too-many-groups',
    FORBIDDEN_KEY: 'forbidden-key',
    UNKNOWN_COMPONENT: 'unknown-component-kind',
    DUPLICATE_PANE_ID: 'duplicate-pane-id',
    UNKNOWN_PANE_ID: 'unknown-pane-id',
    STRING_TOO_LONG: 'string-too-long',
    ARRAY_TOO_LONG: 'array-too-long',
    NON_FINITE: 'non-finite-number',
    UNSAFE_CONTENT: 'unsafe-content-in-state',

    // --- exact live/saved pane-set comparison (Phase C § 3) ---
    PANE_SET_INVALID: 'pane-set-invalid',
    SAVED_NOT_LIVE: 'saved-panes-not-live',
    LIVE_NOT_SAVED: 'live-panes-not-saved',
    PANE_SET_MISMATCH: 'pane-set-mismatch',

    // --- renderer-side transaction outcomes (Phase C §§ 4-6) ---
    NO_LIVE_PANES: 'no-live-panes',
    PANE_NOT_MOUNTED: 'pane-not-mounted',
    APPLY_THREW: 'layout-apply-threw',
    APPLY_INCOMPLETE: 'layout-apply-incomplete',
    UNEXPECTED_PANEL: 'unexpected-panel-after-apply',
    IDENTITY_CHANGED: 'pane-element-identity-changed',
    OWNERSHIP_MISMATCH: 'ownership-count-mismatch',
    SNAPSHOT_INVALID: 'rollback-snapshot-invalid',
    BUSY: 'layout-operation-in-progress',
  };

  /** Every value in REASON, as a Set, so a caller can assert a code is inside the closed set. */
  const REASON_CODES = new Set(Object.keys(REASON).map((k) => REASON[k]));

  // ---- primitive guards ---------------------------------------------------------------------

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function refuse(reason) { return { ok: false, reason }; }

  /**
   * Own keys of a parsed-JSON object, with the prototype-pollution keys refused.
   * `JSON.parse('{"__proto__":{}}')` creates a real own property named `__proto__`, so this must run
   * on every object at every depth — not only at the top level.
   */
  function safeKeys(obj) {
    const keys = Object.getOwnPropertyNames(obj);
    for (const k of keys) if (FORBIDDEN_KEYS.has(k)) return null;
    return keys;
  }

  function hasOwn(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

  /**
   * Strings inside layout state are structural (IDs, titles, orientation). None of them has any
   * legitimate reason to contain a filesystem path, a URL, or a credential-shaped token. Refusing
   * those shapes enforces "Dockview receives no worktree paths, prompts, credentials" on the READ
   * path too, so a hand-edited file cannot smuggle content back in through a title.
   */
  function looksUnsafe(s) {
    if (/[\\/]/.test(s)) return true;                     // path separators
    if (/^[A-Za-z]:/.test(s)) return true;                // Windows drive letter
    if (/[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) return true; // any URL scheme
    if (/\.\./.test(s)) return true;                      // traversal
    if (/[\r\n\t\0]/.test(s)) return true;                // control characters
    // credential-shaped keys/values
    if (/(api[_-]?key|secret|token|password|passwd|credential|bearer|authorization)/i.test(s)) return true;
    return false;
  }

  function checkString(s, maxLen) {
    if (typeof s !== 'string') return REASON.LAYOUT_SHAPE;
    if (s.length > maxLen) return REASON.STRING_TOO_LONG;
    if (looksUnsafe(s)) return REASON.UNSAFE_CONTENT;
    return null;
  }

  function checkFiniteNumber(n) {
    return (typeof n === 'number' && Number.isFinite(n)) ? null : REASON.NON_FINITE;
  }

  // ---- layout validation ----------------------------------------------------------------------

  /**
   * Validate one grid node. Nodes are the only recursive part of the shape, so this is where the
   * depth bound and the group budget are enforced.
   *
   * Observed dockview@7.0.4 shapes (from the controlled fixture):
   *   branch: { type:'branch', data:[ node, ... ], size?:number, visible?:boolean }
   *   leaf:   { type:'leaf',   data:{ views:string[], activeView?:string, id:string },
   *             size?:number, visible?:boolean }
   */
  function validateNode(node, depth, ctx) {
    if (depth > MAX_DEPTH) return REASON.TOO_DEEP;
    if (!isPlainObject(node)) return REASON.LAYOUT_SHAPE;

    const keys = safeKeys(node);
    if (keys === null) return REASON.FORBIDDEN_KEY;
    if (keys.length > MAX_KEYS_PER_OBJECT) return REASON.LAYOUT_SHAPE;
    for (const k of keys) {
      if (!['type', 'data', 'size', 'visible'].includes(k)) return REASON.LAYOUT_SHAPE;
    }

    if (hasOwn(node, 'size')) { const e = checkFiniteNumber(node.size); if (e) return e; }
    if (hasOwn(node, 'visible') && typeof node.visible !== 'boolean') return REASON.LAYOUT_SHAPE;

    if (node.type === 'branch') {
      if (!Array.isArray(node.data)) return REASON.LAYOUT_SHAPE;
      if (node.data.length > MAX_ARRAY_LENGTH) return REASON.ARRAY_TOO_LONG;
      for (const child of node.data) {
        const e = validateNode(child, depth + 1, ctx);
        if (e) return e;
      }
      return null;
    }

    if (node.type === 'leaf') {
      const g = node.data;
      if (!isPlainObject(g)) return REASON.LAYOUT_SHAPE;

      ctx.groupCount += 1;
      if (ctx.groupCount > MAX_GROUPS) return REASON.TOO_MANY_GROUPS;

      const gk = safeKeys(g);
      if (gk === null) return REASON.FORBIDDEN_KEY;
      if (gk.length > MAX_KEYS_PER_OBJECT) return REASON.LAYOUT_SHAPE;
      for (const k of gk) {
        if (!['views', 'activeView', 'id'].includes(k)) return REASON.LAYOUT_SHAPE;
      }

      if (!hasOwn(g, 'id')) return REASON.LAYOUT_SHAPE;
      let e = checkString(g.id, MAX_ID_LENGTH); if (e) return e;

      if (!Array.isArray(g.views)) return REASON.LAYOUT_SHAPE;
      if (g.views.length > MAX_ARRAY_LENGTH) return REASON.ARRAY_TOO_LONG;
      for (const v of g.views) {
        e = checkString(v, MAX_ID_LENGTH); if (e) return e;
        if (!PANE_ID_PATTERN.test(v)) return REASON.UNKNOWN_PANE_ID;
        if (ctx.referencedViews.has(v)) return REASON.DUPLICATE_PANE_ID; // a pane cannot be in two groups
        ctx.referencedViews.add(v);
        ctx.orderedViews.push(v);
      }

      if (hasOwn(g, 'activeView')) {
        e = checkString(g.activeView, MAX_ID_LENGTH); if (e) return e;
        if (!g.views.includes(g.activeView)) return REASON.LAYOUT_SHAPE;
      }
      return null;
    }

    return REASON.LAYOUT_SHAPE; // neither 'branch' nor 'leaf'
  }

  /**
   * Validate the Dockview layout object itself (the `layout` member of our envelope).
   * Returns null when valid, otherwise a bounded reason code.
   *
   * Unknown top-level keys are refused, which is precisely what excludes `floatingGroups`,
   * `popoutGroups`, and `edgeGroups` — Blue's verdict excludes popouts and puts floating windows
   * outside acceptance scope, so state carrying them must not be restorable at all.
   *
   * `outCtx` is an optional out-parameter used by `paneIdsFromLayout` so the ID extraction reuses
   * this single traversal rather than walking the tree a second time with its own (drift-prone)
   * idea of the shape.
   */
  function validateLayout(layout, outCtx) {
    const ctx = outCtx || { groupCount: 0, referencedViews: new Set(), orderedViews: [] };
    ctx.groupCount = 0;
    ctx.referencedViews = new Set();
    ctx.orderedViews = [];

    if (!isPlainObject(layout)) return REASON.LAYOUT_SHAPE;

    const keys = safeKeys(layout);
    if (keys === null) return REASON.FORBIDDEN_KEY;
    for (const k of keys) {
      if (!['grid', 'panels', 'activeGroup'].includes(k)) return REASON.LAYOUT_SHAPE;
    }
    if (!hasOwn(layout, 'grid') || !hasOwn(layout, 'panels')) return REASON.LAYOUT_SHAPE;

    // --- grid ---
    const grid = layout.grid;
    if (!isPlainObject(grid)) return REASON.LAYOUT_SHAPE;
    const gridKeys = safeKeys(grid);
    if (gridKeys === null) return REASON.FORBIDDEN_KEY;
    for (const k of gridKeys) {
      if (!['root', 'width', 'height', 'orientation'].includes(k)) return REASON.LAYOUT_SHAPE;
    }
    for (const k of ['root', 'width', 'height', 'orientation']) {
      if (!hasOwn(grid, k)) return REASON.LAYOUT_SHAPE;
    }
    let e = checkFiniteNumber(grid.width); if (e) return e;
    e = checkFiniteNumber(grid.height); if (e) return e;
    if (grid.orientation !== 'HORIZONTAL' && grid.orientation !== 'VERTICAL') return REASON.LAYOUT_SHAPE;

    e = validateNode(grid.root, 1, ctx); if (e) return e;

    // --- panels ---
    const panels = layout.panels;
    if (!isPlainObject(panels)) return REASON.LAYOUT_SHAPE;
    const panelIds = safeKeys(panels);
    if (panelIds === null) return REASON.FORBIDDEN_KEY;
    if (panelIds.length > MAX_PANELS) return REASON.TOO_MANY_PANELS;

    const seen = new Set();
    for (const id of panelIds) {
      if (!PANE_ID_PATTERN.test(id)) return REASON.UNKNOWN_PANE_ID;
      if (seen.has(id)) return REASON.DUPLICATE_PANE_ID;
      seen.add(id);

      const p = panels[id];
      if (!isPlainObject(p)) return REASON.LAYOUT_SHAPE;
      const pk = safeKeys(p);
      if (pk === null) return REASON.FORBIDDEN_KEY;

      // dockview@7.0.4's DockviewPanel.toJSON() ALWAYS emits ten own keys, seven of which are
      // `undefined` for our usage. Verified against a live `api.toJSON()` read with
      // Object.getOwnPropertyNames — NOT through a JSON round-trip, which silently drops
      // undefined-valued keys and would make this validator look tighter than it can be.
      //
      // That matters because validation runs on BOTH sides of the file:
      //   * before writing, against the in-memory object  -> ten own keys present
      //   * after reading, against JSON.parse output      -> only the three populated keys
      // So both shapes must validate, and refusing key PRESENCE outright would refuse every save.
      //
      // The security property is preserved exactly where it counts: an optional key is tolerated
      // ONLY when its value is `undefined`. A `params` (or renderer, or size hint) carrying an actual
      // value is still refused — which is the case that could smuggle a path, prompt, or credential.
      const REQUIRED_PANEL_KEYS = ['id', 'contentComponent', 'title'];
      const OPTIONAL_UNDEFINED_ONLY = [
        'tabComponent', 'params', 'renderer',
        'minimumHeight', 'maximumHeight', 'minimumWidth', 'maximumWidth',
      ];
      for (const k of pk) {
        if (REQUIRED_PANEL_KEYS.includes(k)) continue;
        if (OPTIONAL_UNDEFINED_ONLY.includes(k)) {
          if (p[k] !== undefined) return REASON.LAYOUT_SHAPE; // a populated optional field is refused
          continue;
        }
        return REASON.LAYOUT_SHAPE;                            // any other key at all is refused
      }
      for (const k of REQUIRED_PANEL_KEYS) {
        if (!hasOwn(p, k) || p[k] === undefined) return REASON.LAYOUT_SHAPE;
      }
      if (p.id !== id) return REASON.LAYOUT_SHAPE; // map key and panel identity must agree
      e = checkString(p.id, MAX_ID_LENGTH); if (e) return e;
      e = checkString(p.title, MAX_TITLE_LENGTH); if (e) return e;
      if (typeof p.contentComponent !== 'string') return REASON.LAYOUT_SHAPE;
      if (!ALLOWED_COMPONENTS.has(p.contentComponent)) return REASON.UNKNOWN_COMPONENT;
    }

    // Cross-reference: every view named by the grid must exist in `panels`, and vice versa. A grid
    // referencing a panel that is not defined would restore as a silently-missing pane.
    for (const v of ctx.referencedViews) if (!seen.has(v)) return REASON.LAYOUT_SHAPE;
    for (const id of seen) if (!ctx.referencedViews.has(id)) return REASON.LAYOUT_SHAPE;

    if (hasOwn(layout, 'activeGroup')) {
      e = checkString(layout.activeGroup, MAX_ID_LENGTH); if (e) return e;
    }

    return null;
  }

  /**
   * Validate the full on-disk envelope. Used on EVERY side of the boundary:
   *   - in main, before writing;
   *   - in main, after reading and before returning over IPC;
   *   - in the RENDERER, immediately before calling `fromJSON` (Phase C).
   */
  function validateEnvelope(value) {
    if (!isPlainObject(value)) return refuse(REASON.ENVELOPE_SHAPE);

    const keys = safeKeys(value);
    if (keys === null) return refuse(REASON.FORBIDDEN_KEY);

    const expected = ['schemaVersion', 'package', 'packageVersion', 'savedAt', 'layout'];
    if (keys.length !== expected.length) return refuse(REASON.ENVELOPE_SHAPE);
    for (const k of expected) if (!hasOwn(value, k)) return refuse(REASON.ENVELOPE_SHAPE);

    if (value.schemaVersion !== SCHEMA_VERSION) return refuse(REASON.SCHEMA_VERSION);
    if (value.package !== PACKAGE_NAME) return refuse(REASON.PACKAGE);
    if (value.packageVersion !== PACKAGE_VERSION) return refuse(REASON.PACKAGE_VERSION);

    if (typeof value.savedAt !== 'string' || value.savedAt.length > 40) return refuse(REASON.TIMESTAMP);
    // Strict UTC ISO-8601, and it must round-trip — rejects "2026-13-45T99:99:99Z" style strings that
    // a lenient Date parse would otherwise accept or coerce.
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value.savedAt)) return refuse(REASON.TIMESTAMP);
    const parsed = Date.parse(value.savedAt);
    if (!Number.isFinite(parsed)) return refuse(REASON.TIMESTAMP);
    if (new Date(parsed).toISOString().slice(0, 19) !== value.savedAt.slice(0, 19)) return refuse(REASON.TIMESTAMP);

    const layoutError = validateLayout(value.layout);
    if (layoutError) return refuse(layoutError);

    return { ok: true, envelope: value };
  }

  /** Build a well-formed envelope around a layout. Callers still validate before writing. */
  function buildEnvelope(layout, now) {
    return {
      schemaVersion: SCHEMA_VERSION,
      package: PACKAGE_NAME,
      packageVersion: PACKAGE_VERSION,
      savedAt: new Date(now === undefined ? Date.now() : now).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      layout,
    };
  }

  // ---- pane-set extraction and comparison (Phase C § 3) -----------------------------------------

  /**
   * The exact pane IDs a layout places, taken from the GRID — the authoritative placement — in
   * traversal order.
   *
   * It VALIDATES first and reuses that single traversal, so there is no second, drift-prone idea of
   * the shape anywhere. A caller therefore cannot extract IDs from state that would not be allowed
   * to reach `fromJSON`.
   *
   * `ordered` preserves grid order (useful for a deterministic rebuild); `sorted` is the canonical
   * form for comparison. `validateLayout` already refuses duplicates and cross-references the grid
   * against `panels`, so both lists describe exactly the same set.
   */
  function paneIdsFromLayout(layout) {
    const ctx = { groupCount: 0, referencedViews: new Set(), orderedViews: [] };
    const error = validateLayout(layout, ctx);
    if (error) return refuse(error);
    const ordered = ctx.orderedViews.slice();
    return { ok: true, ordered, sorted: ordered.slice().sort() };
  }

  /**
   * EXACT set equality between the pane IDs a saved layout names and the pane IDs that are actually
   * live and owned right now.
   *
   * The two lists MUST be derived independently — the saved one from the validated saved layout, the
   * live one from the adapter's own ownership map. Deriving both from the saved layout would make
   * this comparison a tautology, which is precisely the defect it exists to prevent: restoring onto
   * a workspace whose panes are not the saved ones mounts empty shells or strands live terminals.
   *
   * Returns bounded COUNTS only. Never a pane ID — a refusal reaches the Logs tab and the UI.
   */
  function comparePaneSets(savedIds, liveIds) {
    for (const list of [savedIds, liveIds]) {
      if (!Array.isArray(list)) return refuse(REASON.PANE_SET_INVALID);
      if (list.length > MAX_PANELS) return refuse(REASON.PANE_SET_INVALID);
      for (const id of list) {
        if (typeof id !== 'string' || !PANE_ID_PATTERN.test(id)) return refuse(REASON.PANE_SET_INVALID);
      }
    }
    const saved = new Set(savedIds);
    const live = new Set(liveIds);
    // A duplicate anywhere makes "same count" meaningless, so it is refused before any comparison.
    if (saved.size !== savedIds.length || live.size !== liveIds.length) {
      return refuse(REASON.DUPLICATE_PANE_ID);
    }

    let savedNotLive = 0;
    for (const id of saved) if (!live.has(id)) savedNotLive++;
    let liveNotSaved = 0;
    for (const id of live) if (!saved.has(id)) liveNotSaved++;

    if (savedNotLive === 0 && liveNotSaved === 0) {
      return { ok: true, count: saved.size };
    }
    // Distinct reasons, because they mean genuinely different things to a user: state that names a
    // pane which is not open, versus a pane that is open and would be stranded by the restore.
    const reason = (savedNotLive > 0 && liveNotSaved > 0) ? REASON.PANE_SET_MISMATCH
      : (savedNotLive > 0 ? REASON.SAVED_NOT_LIVE : REASON.LIVE_NOT_SAVED);
    return { ok: false, reason, savedCount: saved.size, liveCount: live.size, savedNotLive, liveNotSaved };
  }

  // ---- the deterministic default arrangement (Phase C § 6) --------------------------------------

  /**
   * Canonical ordering for a set of live panes.
   *
   * THE CHOSEN ARRANGEMENT: terminals first, in ASCENDING NUMERIC pane-ID order (so `pty2` precedes
   * `pty10`, which a plain string sort would get wrong), then the Library singleton last if it is
   * open. Numeric rather than lexical because the IDs are a monotonic counter and a user reads them
   * as "the order I opened them in".
   */
  function canonicalPaneOrder(paneIds) {
    const terminals = [];
    let hasLibrary = false;
    for (const id of paneIds) {
      if (id === 'library') { hasLibrary = true; continue; }
      terminals.push(id);
    }
    terminals.sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
    return hasLibrary ? terminals.concat(['library']) : terminals;
  }

  /**
   * Build THE deterministic default arrangement for exactly the panes given.
   *
   * THE CHOSEN ARRANGEMENT, stated once and pinned by tests: a SINGLE HORIZONTAL ROW of groups, one
   * pane per group, in `canonicalPaneOrder`, with the first pane active. Every live pane stays
   * VISIBLE — that is the point. A single tabbed group would also be deterministic, but it would
   * hide every pane but one, and "reset the arrangement" must not look like the panes disappeared.
   *
   * Every node carries `size: 100`. dockview@7.0.4 lays out proportionally and re-normalises through
   * `gridview.layout(width, height)` immediately after deserializing, so equal sizes produce an even
   * split at whatever the real container size is. The committed fixture confirms sizes need not sum
   * to `width`: it carries two leaves of `size: 100` under a `width: 100` grid.
   *
   * It creates NOTHING: no pane, no terminal, no Library. It is a pure function of the panes it is
   * handed, so it cannot multiply terminals the way the prototype's `useDefaultLayout` did.
   *
   * @param {object} spec
   * @param {Array<{id:string, component:string, title:string}>} spec.panes  the LIVE owned panes
   * @param {number} spec.width   current grid width  (from the layout Dockview just serialized)
   * @param {number} spec.height  current grid height
   * @returns {{ok:true, layout:object} | {ok:false, reason:string}}
   */
  function buildDefaultArrangement(spec) {
    const s = spec || {};
    const panes = Array.isArray(s.panes) ? s.panes : null;
    if (!panes) return refuse(REASON.PANE_SET_INVALID);
    if (panes.length === 0) return refuse(REASON.NO_LIVE_PANES);
    if (panes.length > MAX_PANELS || panes.length > MAX_GROUPS) return refuse(REASON.TOO_MANY_PANELS);
    if (checkFiniteNumber(s.width) || checkFiniteNumber(s.height)) return refuse(REASON.NON_FINITE);

    const byId = new Map();
    for (const p of panes) {
      if (!isPlainObject(p)) return refuse(REASON.LAYOUT_SHAPE);
      if (typeof p.id !== 'string' || !PANE_ID_PATTERN.test(p.id)) return refuse(REASON.UNKNOWN_PANE_ID);
      if (byId.has(p.id)) return refuse(REASON.DUPLICATE_PANE_ID);
      byId.set(p.id, p);
    }

    const order = canonicalPaneOrder([...byId.keys()]);
    const panels = {};
    const children = [];
    let index = 0;
    for (const id of order) {
      const p = byId.get(id);
      if (typeof p.component !== 'string' || !ALLOWED_COMPONENTS.has(p.component)) {
        return refuse(REASON.UNKNOWN_COMPONENT);
      }
      const titleError = checkString(p.title, MAX_TITLE_LENGTH);
      if (titleError) return refuse(titleError);
      panels[id] = { id, contentComponent: p.component, title: p.title };
      index += 1;
      children.push({
        type: 'leaf',
        data: { views: [id], activeView: id, id: String(index) },
        size: 100,
      });
    }

    const layout = {
      grid: {
        root: { type: 'branch', data: children, size: 100 },
        width: s.width,
        height: s.height,
        orientation: 'HORIZONTAL',
      },
      panels,
      activeGroup: '1',
    };

    // Self-check: the builder's output must survive the SAME validator everything else does. If it
    // ever cannot, that is a builder bug and it must refuse rather than hand `fromJSON` something
    // the policy would reject a moment later.
    const error = validateLayout(layout);
    if (error) return refuse(error);
    return { ok: true, layout, order };
  }

  const api = {
    validateLayout,
    validateEnvelope,
    buildEnvelope,
    paneIdsFromLayout,
    comparePaneSets,
    canonicalPaneOrder,
    buildDefaultArrangement,
    REASON,
    REASON_CODES,
    SCHEMA_VERSION,
    PACKAGE_NAME,
    PACKAGE_VERSION,
    ALLOWED_COMPONENTS,
    PANE_ID_PATTERN,
    MAX_RAW_BYTES,
    MAX_DEPTH,
    MAX_PANELS,
    MAX_GROUPS,
    MAX_KEYS_PER_OBJECT,
    MAX_ARRAY_LENGTH,
    MAX_ID_LENGTH,
    MAX_TITLE_LENGTH,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ccDockviewLayoutPolicy = api;
})();
