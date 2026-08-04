// Dockview prototype layout store — the MAIN-owned trust boundary for saved layout state.
//
// The renderer never supplies a path and never receives an unvalidated blob. Saved layout state is
// a file on disk, therefore it is UNTRUSTED INPUT: a user can hand-edit it, an unrelated program can
// corrupt it, and a future Dockview version can change its shape. Dockview's own `fromJSON` performs
// no validation for us — it will happily consume whatever it is handed — so every guarantee has to
// live here.
//
// The shape below was NOT inferred from Dockview's TypeScript definitions. It was derived from a
// controlled dockview@7.0.4 fixture produced by app/dockview-tripwire.js against real panel/split/
// tab-group arrangements (work order § 9: "Derive the exact allowlisted layout shape from controlled
// dockview@7.0.4 fixtures"). The captured fixture is committed at
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
// Refusals return a BOUNDED REASON CODE and never echo file contents (work order § 9: "Do not
// expose state contents in Logs").

'use strict';

const fs = require('fs');
const path = require('path');

// ---- bounds (work order § 9) ------------------------------------------------
const MAX_RAW_BYTES = 262144;   // 256 KiB — checked BEFORE any parsing
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
const LAYOUT_FILENAME = 'dockview-prototype-layout.json';

// The ONLY component kinds the prototype hosts. An unknown kind is a refusal, not a skipped panel —
// silently dropping a panel is itself a predeclared kill criterion (§ 5.7).
const ALLOWED_COMPONENTS = new Set(['terminal', 'library']);

// The ONLY pane IDs the prototype may restore (§ 9: "Only known prototype pane IDs may be
// restored"). Closed by construction: the single Library pane, or a numbered prototype terminal.
const PANE_ID_PATTERN = /^(library|pty[0-9]{1,6})$/;

// Keys that must never appear anywhere in parsed state, at any depth.
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

// Bounded refusal reasons. These are the ONLY strings that may reach a log or the UI — never the
// offending value, never a fragment of the file.
const REASON = {
  NOT_FOUND: 'no-saved-layout',
  NOT_REGULAR_FILE: 'not-a-regular-file',
  REPARSE_POINT: 'reparse-point-refused',
  TOO_LARGE: 'file-too-large',
  INVALID_UTF8: 'invalid-utf8',
  INVALID_JSON: 'invalid-json',
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
  READ_FAILED: 'read-failed',
  WRITE_FAILED: 'write-failed',
};

// ---- primitive guards -------------------------------------------------------

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
 * those shapes enforces § 5.9 ("Dockview receives no ... worktree paths, prompts, credentials")
 * on the READ path too, so a hand-edited file cannot smuggle content back in through a title.
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

// ---- layout validation ------------------------------------------------------

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
 */
function validateLayout(layout) {
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

  const ctx = { groupCount: 0, referencedViews: new Set() };
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
  // referencing a panel that is not defined would restore as a silently-missing pane (§ 5.7).
  for (const v of ctx.referencedViews) if (!seen.has(v)) return REASON.LAYOUT_SHAPE;
  for (const id of seen) if (!ctx.referencedViews.has(id)) return REASON.LAYOUT_SHAPE;

  if (hasOwn(layout, 'activeGroup')) {
    e = checkString(layout.activeGroup, MAX_ID_LENGTH); if (e) return e;
  }

  return null;
}

/**
 * Validate the full on-disk envelope. Used on BOTH sides of the boundary:
 *   - before writing,
 *   - after reading and before returning over IPC,
 *   - immediately before calling `fromJSON`.
 * (work order § 9: "Validate: Before writing. After reading and before returning over IPC.
 * Immediately before calling fromJSON.")
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

// ---- file-backed store ------------------------------------------------------

/**
 * @param {object} deps
 * @param {string} deps.userDataDir  Electron `userData`. MAIN supplies this; the renderer never
 *                                   supplies any part of a path (§ 9).
 * @param {object} [deps.fsImpl]     Injectable for tests.
 */
function createLayoutStore({ userDataDir, fsImpl = fs } = {}) {
  if (typeof userDataDir !== 'string' || !userDataDir) {
    throw new Error('createLayoutStore: userDataDir is required');
  }
  // Fixed canonical path. Built once, from a main-owned directory plus a constant filename, so
  // there is no code path in which a caller-supplied string reaches it.
  const layoutPath = path.join(userDataDir, LAYOUT_FILENAME);

  /**
   * Read + validate. Never throws; always returns a bounded result.
   * An INVALID file is left exactly as-is for diagnosis — never repaired, deleted, or overwritten
   * (§ 9: "An invalid file must remain available for diagnosis and must not be overwritten
   * automatically").
   */
  function load() {
    let st;
    try {
      st = fsImpl.lstatSync(layoutPath); // lstat, NOT stat — must not follow a link
    } catch {
      return refuse(REASON.NOT_FOUND);
    }

    // Reparse points (symlinks and Windows junctions both report as symbolic links here) are
    // refused before any read, so the fixed path cannot be redirected at another file.
    if (st.isSymbolicLink()) return refuse(REASON.REPARSE_POINT);
    if (!st.isFile()) return refuse(REASON.NOT_REGULAR_FILE);
    if (st.size > MAX_RAW_BYTES) return refuse(REASON.TOO_LARGE);

    let buf;
    try {
      buf = fsImpl.readFileSync(layoutPath);
    } catch {
      return refuse(REASON.READ_FAILED);
    }
    if (!Buffer.isBuffer(buf)) return refuse(REASON.READ_FAILED);
    // Re-check post-read: the file could have grown between lstat and read.
    if (buf.length > MAX_RAW_BYTES) return refuse(REASON.TOO_LARGE);

    // Strict UTF-8: `fatal` rejects invalid sequences instead of substituting U+FFFD, and `ignoreBOM`
    // false means a BOM would surface as a leading U+FEFF and fail the JSON parse rather than being
    // silently swallowed.
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buf);
    } catch {
      return refuse(REASON.INVALID_UTF8);
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return refuse(REASON.INVALID_JSON);
    }

    return validateEnvelope(parsed);
  }

  /**
   * Validate THEN write, atomically. A layout that does not validate is never persisted, so an
   * invalid file can only ever arrive from outside this process.
   */
  function save(layout) {
    const envelope = buildEnvelope(layout);
    const verdict = validateEnvelope(envelope);
    if (!verdict.ok) return verdict;

    const tmp = layoutPath + '.' + process.pid + '.' + Math.random().toString(36).slice(2) + '.tmp';
    try {
      fsImpl.writeFileSync(tmp, JSON.stringify(envelope, null, 2), { encoding: 'utf8' });
      // Atomic replacement. On Windows rename-onto-existing fails, so renameSync is attempted and
      // falls back to an explicit replace; the unique temp name keeps concurrent writers from
      // colliding either way.
      try {
        fsImpl.renameSync(tmp, layoutPath);
      } catch {
        fsImpl.rmSync(layoutPath, { force: true });
        fsImpl.renameSync(tmp, layoutPath);
      }
    } catch {
      try { fsImpl.rmSync(tmp, { force: true }); } catch { /* temp cleanup is best-effort */ }
      return refuse(REASON.WRITE_FAILED);
    }
    return { ok: true, savedAt: envelope.savedAt };
  }

  /** Explicit user-triggered Reset. Removes the prototype layout file; never touches anything else. */
  function reset() {
    try {
      fsImpl.rmSync(layoutPath, { force: true });
      return { ok: true };
    } catch {
      return refuse(REASON.WRITE_FAILED);
    }
  }

  return { load, save, reset, layoutPath: () => layoutPath };
}

module.exports = {
  createLayoutStore,
  validateEnvelope,
  validateLayout,
  buildEnvelope,
  REASON,
  LAYOUT_FILENAME,
  SCHEMA_VERSION,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  ALLOWED_COMPONENTS,
  PANE_ID_PATTERN,
  MAX_RAW_BYTES,
  MAX_DEPTH,
  MAX_PANELS,
  MAX_GROUPS,
};
