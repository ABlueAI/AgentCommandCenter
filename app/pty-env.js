'use strict';
// PTY ENVIRONMENT CONSTRUCTION BOUNDARY.
//
// P1 hardens the existing, owned pty-start boundary. It adds no subsystem or dependency, so the
// OSS procurement gate does not reopen. Fenced roles receive a Windows environment built from an
// EMPTY object and this exact Tier 1 allowlist. Unfenced panes begin with the pre-P1 environment
// expression from stripAdmissionEnv(baseEnv), with one deliberate correction: before explicit
// main-issued values are layered, all ASCII-case-insensitive ambient variants — plus a conservative
// non-ASCII superset of exact ASCII reserved names — are removed for the Claude subprocess scrub,
// Video Scout's safeStorage key, and the exact pane-status transport names.
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
const SUBPROCESS_SCRUB_ENV_KEY = 'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB';
const GEMINI_ENV_KEY = 'GEMINI_API_KEY';

function foldAsciiWindowsEnvName(name) {
  if (typeof name !== 'string' || !/^[\x20-\x7E]+$/.test(name)) return null;
  return name.replace(/[a-z]/g, (ch) => ch.toUpperCase());
}

// DENYLIST-ONLY conservative fallback. This can never admit a name: when the strict ASCII fold
// refuses a source spelling, compatibility normalization plus lower-then-upper casing is used only
// to ask whether it collapses to a printable-ASCII reserved name. This is intentionally a superset,
// not a claim about Windows' NLS comparison: it may fail closed on spellings Windows treats as
// distinct (for example ligatures), but it covers compatibility and one-way case mappings such as
// Kelvin sign, capital sharp-s, dotless-i, and long-s. Unrelated ASCII duplicates remain untouched.
function foldReservedConservativeAliasToAscii(name) {
  if (typeof name !== 'string') return null;
  const wide = name.normalize('NFKC').toLowerCase().toUpperCase();
  return /^[\x20-\x7E]+$/.test(wide) ? wide : null;
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
 * Return a fresh copy without ASCII-case-insensitive variants of `reservedNames`, including the
 * denylist-only conservative non-ASCII superset described above.
 *
 * This intentionally does not deduplicate unrelated ambient-vs-ambient variants. Changing which
 * Path/PATH, TEMP/Temp, or other unfenced value wins would be a separate launch-behaviour change.
 */
function omitReservedWindowsEnv(baseEnv, reservedNames) {
  const source = baseEnv && typeof baseEnv === 'object' ? baseEnv : {};
  const reservedFolded = new Set((reservedNames || []).map(foldAsciiWindowsEnvName).filter(Boolean));
  // A null prototype makes `__proto__` an ordinary ambient key during the copy. The returned spread
  // is a plain object and preserves that own property without invoking Object.prototype's setter.
  const out = Object.create(null);

  for (const name of Object.keys(source)) {
    const folded = foldAsciiWindowsEnvName(name);
    const reservedCandidate = folded || foldReservedConservativeAliasToAscii(name);
    if (reservedCandidate && reservedFolded.has(reservedCandidate)) continue;
    out[name] = source[name];
  }
  return { ...out };
}

/**
 * Construct the exact environment handed to pty.spawn.
 *
 * `fencedRole` is computed in main from the standing predicate:
 *   !opts.videoScout && opts.role && FENCED_ROLES.has(opts.role)
 */
function buildPtyEnv({ baseEnv, fencedRole, videoScout, geminiKey, paneStatusEnv }) {
  const source = baseEnv && typeof baseEnv === 'object' ? baseEnv : {};
  const ambientBase = fencedRole
    ? copyAllowedWindowsEnv(source, FENCED_ENV_ALLOWLIST)
    : stripAdmissionEnv(source);
  // Pane-status owns its names even when this pane is not enrolled. Scrub is always main-issued.
  // Video Scout also reserves Gemini even when the supplied key is absent/invalid, so ambient residue
  // cannot become an implicit credential fallback.
  const reservedNames = [SUBPROCESS_SCRUB_ENV_KEY, ...PANE_STATUS_ENV_KEYS];
  if (videoScout) reservedNames.push(GEMINI_ENV_KEY);
  const ambient = omitReservedWindowsEnv(ambientBase, reservedNames);
  const explicitPaneStatus = {};
  // Pane status owns exactly these two transport names. Copying an arbitrary enrollment object here
  // would let a future/corrupt controller overwrite the forced scrub, Video Scout key, or Tier 1.
  if (paneStatusEnv && typeof paneStatusEnv === 'object') {
    for (const name of PANE_STATUS_ENV_KEYS) {
      if (typeof paneStatusEnv[name] === 'string') explicitPaneStatus[name] = paneStatusEnv[name];
    }
  }

  // Canonical main-issued entries are placed first as defense-in-depth. Correctness does not depend
  // on insertion order: the ambient copy above has already removed the entire conservative reserved
  // family, so the later spread cannot carry a canonical or conservative-alias collision.
  return {
    [SUBPROCESS_SCRUB_ENV_KEY]: '1',
    ...(videoScout && typeof geminiKey === 'string' && geminiKey
      ? { [GEMINI_ENV_KEY]: geminiKey }
      : {}),
    ...explicitPaneStatus,
    ...ambient,
  };
}

const api = {
  FENCED_ENV_ALLOWLIST,
  copyAllowedWindowsEnv,
  omitReservedWindowsEnv,
  buildPtyEnv,
};
if (typeof module === 'object' && module.exports) module.exports = api;
