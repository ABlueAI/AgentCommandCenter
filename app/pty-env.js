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

// Blue-approved Tier 1 allowlist, 2026-08-25. Matching is ASCII-case-insensitive because every
// approved name is ASCII and Unicode case folding would admit non-Windows-equivalent aliases. A
// copied entry keeps its source spelling and exact value.
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

const PANE_STATUS_ENV_KEYS = Object.freeze([
  'BLUE_HELM_PANE_STATUS_PIPE',
  'BLUE_HELM_PANE_STATUS_TOKEN',
]);

function foldAsciiWindowsEnvName(name) {
  if (typeof name !== 'string' || !/^[\x20-\x7E]+$/.test(name)) return null;
  return name.replace(/[a-z]/g, (ch) => ch.toUpperCase());
}

/**
 * Copy only allowlisted, printable-ASCII Windows environment entries from baseEnv.
 *
 * `allowedNames` is injectable only so the negative-control test can deliberately admit its poison
 * and prove the detector observes it. Production buildPtyEnv always supplies the frozen Tier 1 list.
 * A synthetic object can contain case-colliding keys even though a real Windows environment cannot;
 * first insertion wins so the output never contains two Windows-equivalent names.
 */
function copyAllowedWindowsEnv(baseEnv, allowedNames) {
  const source = baseEnv && typeof baseEnv === 'object' ? baseEnv : {};
  const approved = Array.isArray(allowedNames) ? allowedNames : FENCED_ENV_ALLOWLIST;
  const approvedFolded = new Set(approved.map(foldAsciiWindowsEnvName).filter(Boolean));
  const copiedFolded = new Set();
  const out = {};

  for (const name of Object.keys(source)) {
    const folded = foldAsciiWindowsEnvName(name);
    if (!folded) continue;
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
  const source = baseEnv && typeof baseEnv === 'object' ? baseEnv : {};
  const ambient = fencedRole
    ? copyAllowedWindowsEnv(source, FENCED_ENV_ALLOWLIST)
    : stripAdmissionEnv(source);
  const explicitPaneStatus = {};
  // Pane status owns exactly these two transport names. Copying an arbitrary enrollment object here
  // would let a future/corrupt controller overwrite the forced scrub, Video Scout key, or Tier 1.
  if (paneStatusEnv && typeof paneStatusEnv === 'object') {
    for (const name of PANE_STATUS_ENV_KEYS) {
      if (typeof paneStatusEnv[name] === 'string') explicitPaneStatus[name] = paneStatusEnv[name];
    }
  }

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
