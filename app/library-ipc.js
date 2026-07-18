'use strict';
// V5b2 Library/report read boundary (main process). The renderer can LIST and READ only bounded,
// schema-valid Video Scout records/reports selected through MAIN-OWNED identities: it never supplies
// or receives a filesystem path or a run ID it can act on. It requests a report only through an
// OPAQUE main-issued handle (library) or by pane ID (Open Report on a live Video Scout pane, resolved
// through V5b1's internal pane->runId registry). PowerShell is the sole manifest validator and the
// only code that touches the filesystem (video-scout-library.ps1); this module owns the trust gate,
// the opaque-handle table, and the projection to a path-free, bounded renderer payload.
//
// PURE of Electron: main.js injects the canonical ENTRY_URL, the trusted-window getter, the execFile
// wrapper (runLibraryAction), and the pane->runId lookup — so the whole boundary is unit-testable in
// plain node against stubs (library-ipc.test.js), like clipboard-ipc.js and media-permission-policy.js.

const crypto = require('crypto');
const { createTrustedSenderGate } = require('./trusted-ipc-sender');

// An opaque, unguessable handle. It encodes NOTHING — no path, no run ID, no filename. It is only a
// lookup key into a main-private table that maps to a validated run ID, and the whole table is
// replaced on every List refresh (so a handle from a stale list can never resolve).
function newHandle() { return 'lib_' + crypto.randomBytes(24).toString('hex'); }

// Coercers that keep the renderer payload to known, bounded primitives only (never a raw PS object).
const str = (v) => (typeof v === 'string' ? v : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const DATE_KINDS = new Set(['exact', 'approximate', 'unknown']);

function createLibraryIpc(deps) {
  const entryUrl = deps && deps.entryUrl;
  const getTrustedWindow = deps && deps.getTrustedWindow;
  const runLibraryAction = deps && deps.runLibraryAction;   // async ({action, runId}) => parsed JSON | throws
  const getRunIdForPane = deps && deps.getRunIdForPane;     // (paneId) => runId | undefined  (V5b1 registry)
  const logRefusal = (deps && deps.logRefusal) || (() => {});
  if (typeof runLibraryAction !== 'function') {
    throw new Error('library-ipc: runLibraryAction (the execFile wrapper) is required.');
  }
  if (typeof getRunIdForPane !== 'function') {
    throw new Error('library-ipc: getRunIdForPane (the pane->runId lookup) is required.');
  }
  // Constructor validates entryUrl/getTrustedWindow (fails closed if missing).
  const gate = createTrustedSenderGate({ entryUrl, getTrustedWindow });

  // handle -> validated run ID. Rebuilt wholesale on every successful List; replacing it invalidates
  // every previously-issued handle.
  let handleMap = new Map();

  function refuse(op, reason) {
    // Bounded reason constant only — never a path, run ID, or any manifest/report content.
    logRefusal(`[library] denied ${op}: ${reason}`);
    return { ok: false, error: reason };
  }

  // Project one PS list entry into the path-free renderer shape, minting an opaque handle for it.
  function projectEntry(e, fresh) {
    const runId = str(e && e.runId);
    if (!runId) return null;              // an entry with no usable run ID is dropped, not surfaced
    const handle = newHandle();
    fresh.set(handle, runId);
    const dateKind = DATE_KINDS.has(e.dateKind) ? e.dateKind : 'unknown';
    return {
      handle,                             // the ONLY token the renderer may use to request a report
      displayRunLabel: runId,             // bounded, path-free label for display (never used to request)
      title: str(e.title) || '(untitled run)',
      date: str(e.date),
      dateKind,
      sortMs: num(e.sortMs),
      mode: str(e.mode),
      route: str(e.route),
      outcome: str(e.outcome),            // null => incomplete
      totalTokens: num(e.totalTokens),
      startOffsetSeconds: num(e.startOffsetSeconds),
      endOffsetSeconds: num(e.endOffsetSeconds),
      reportStatus: str(e.reportStatus) || 'incomplete',
    };
  }

  async function handleList(event) {
    const g = gate.assess(event);
    if (!g.ok) return refuse('list', g.reason);
    let res;
    try { res = await runLibraryAction({ action: 'List' }); }
    catch { return refuse('list', 'library-subprocess-failed'); }
    if (!res || res.ok !== true) return refuse('list', (res && str(res.reason)) || 'library-error');

    const fresh = new Map();
    const entries = [];
    const rawEntries = Array.isArray(res.entries) ? res.entries : [];
    for (const e of rawEntries) {
      const p = projectEntry(e, fresh);
      if (p) entries.push(p);
    }
    handleMap = fresh;   // replacing the table invalidates all previously-issued handles

    const rawInvalid = Array.isArray(res.invalid) ? res.invalid : [];
    const invalid = rawInvalid.map((x) => ({
      runLabel: str(x && x.runLabel) || '(unrecognized run directory)',
      reason: str(x && x.reason) || 'invalid',
    }));
    return {
      ok: true,
      rootExists: res.rootExists !== false,
      total: num(res.total) == null ? entries.length : res.total,
      capExceeded: res.capExceeded === true,
      invalidCount: invalid.length,
      invalid,
      entries,
    };
  }

  // Shared Read projection: main resolves an identity to a run ID, PowerShell RE-VALIDATES everything
  // (TOCTOU) and returns a structured result; we forward only known, bounded fields and the plain
  // report text (only when status === 'available'). No path is ever returned to the renderer.
  async function readByRunId(op, runId) {
    let res;
    try { res = await runLibraryAction({ action: 'Read', runId }); }
    catch { return refuse(op, 'library-subprocess-failed'); }
    if (!res) return refuse(op, 'library-error');
    if (res.ok === true) {
      const status = str(res.status) || 'incomplete';
      return {
        ok: true,
        status,
        outcome: str(res.outcome),
        reportStatus: str(res.reportStatus) || status,
        title: str(res.title),
        mode: str(res.mode),
        route: str(res.route),
        chars: num(res.chars),
        text: (status === 'available' && typeof res.text === 'string') ? res.text : null,
      };
    }
    // A PS-side refusal (unsafe/missing/etc.): surface a bounded status + reason, never content.
    logRefusal(`[library] ${op} unavailable: ${str(res.reason) || 'read-refused'}`);
    return { ok: false, status: str(res.status) || 'unsafe', error: str(res.reason) || 'read-refused' };
  }

  async function handleRead(event, handle) {
    const g = gate.assess(event);
    if (!g.ok) return refuse('read', g.reason);
    if (typeof handle !== 'string' || !handleMap.has(handle)) return refuse('read', 'unknown-handle');
    return readByRunId('read', handleMap.get(handle));
  }

  async function handleOpenReport(event, paneId) {
    const g = gate.assess(event);
    if (!g.ok) return refuse('open-report', g.reason);
    if (typeof paneId !== 'string' || paneId.length === 0) return refuse('open-report', 'invalid-pane');
    // V5b1's internal pane->runId registry is the ONLY source of the run ID here. The renderer sends
    // only the pane ID; it never supplies a run ID or a path, and terminal output is never parsed.
    const runId = getRunIdForPane(paneId);
    if (typeof runId !== 'string' || runId.length === 0) return refuse('open-report', 'no-run-for-pane');
    return readByRunId('open-report', runId);
  }

  return {
    handleList,
    handleRead,
    handleOpenReport,
    // test/inspection only — never sent to the renderer.
    _handleCount: () => handleMap.size,
  };
}

const api = { createLibraryIpc };
if (typeof module === 'object' && module.exports) module.exports = api;
