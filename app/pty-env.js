'use strict';
// PTY ENVIRONMENT CONSTRUCTION BOUNDARY.
//
// P1 hardens the existing, owned pty-start boundary. It adds no subsystem or dependency, so the
// OSS procurement gate does not reopen. Fenced roles receive a Windows environment built from an
// EMPTY object and this exact Tier 1 allowlist. Unfenced panes retain the pre-P1 environment
// expression through stripAdmissionEnv(baseEnv). Explicit main-issued values are layered only after
// ambient construction: the Claude subprocess scrub, Video Scout's safeStorage key, then the exact
// pane-status enrollment environment.
//
// Pure: no Electron, process, filesystem, logging, or spawning. Environment values are never
// inspected, transformed, or emitted here.

const { stripAdmissionEnv } = require('./admission-budget-config');

// Blue-approved Tier 1 allowlist, 2026-08-25. Matching is case-insensitive because Windows
// environment names are case-insensitive. A copied entry keeps its source spelling and exact value.
const FENCED_ENV_ALLOWLIST = Object.freeze([
  'PATH',
  'PATHEXT',
  'SystemRoot',
  'windir',
  'SystemDrive',
  'ComSpec',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'TEMP',
  'TMP',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'ProgramW6432',
  'ProgramData',
  'PSModulePath',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
  'OS',
]);

/**
 * Copy only allowlisted Windows environment entries from baseEnv.
 *
 * `allowedNames` is injectable only so the negative-control test can deliberately admit its poison
 * and prove the detector observes it. Production buildPtyEnv always supplies the frozen Tier 1 list.
 * A synthetic object can contain case-colliding keys even though a real Windows environment cannot;
 * first insertion wins so the output never contains two Windows-equivalent names.
 */
function copyAllowedWindowsEnv(baseEnv, allowedNames) {
  const source = baseEnv && typeof baseEnv === 'object' ? baseEnv : {};
  const approved = Array.isArray(allowedNames) ? allowedNames : FENCED_ENV_ALLOWLIST;
  const approvedFolded = new Set(approved.map((name) => String(name).toUpperCase()));
  const copiedFolded = new Set();
  const out = {};

  for (const name of Object.keys(source)) {
    const folded = name.toUpperCase();
    if (!approvedFolded.has(folded) || copiedFolded.has(folded)) continue;
    if (typeof source[name] !== 'string') continue;
    out[name] = source[name];
    copiedFolded.add(folded);
  }
  return out;
}

/**
 * Construct the exact environment handed to pty.spawn.
 *
 * `fencedRole` is computed in main from the standing predicate:
 *   !opts.videoScout && opts.role && FENCED_ROLES.has(opts.role)
 */
function buildPtyEnv({ baseEnv, fencedRole, videoScout, geminiKey, paneStatusEnv }) {
  const ambient = fencedRole
    ? copyAllowedWindowsEnv(baseEnv, FENCED_ENV_ALLOWLIST)
    : stripAdmissionEnv(baseEnv);
  const explicitPaneStatus = paneStatusEnv && typeof paneStatusEnv === 'object'
    ? paneStatusEnv
    : {};

  return {
    ...ambient,
    CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
    ...(videoScout ? { GEMINI_API_KEY: geminiKey } : {}),
    ...explicitPaneStatus,
  };
}

const api = {
  FENCED_ENV_ALLOWLIST,
  copyAllowedWindowsEnv,
  buildPtyEnv,
};
if (typeof module === 'object' && module.exports) module.exports = api;
