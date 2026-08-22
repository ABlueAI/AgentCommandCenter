'use strict';
// Blue Helm production pane status — fail-closed Claude Code version gating.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
//
// WHY THIS EXISTS. Pane status reads Claude Code's hook lifecycle. That lifecycle is an INTERNAL
// contract of somebody else's program: event names, payload shape, and firing order can change in any
// release, and nothing obliges Claude Code to tell us. A subsystem that kept displaying `working`
// against a version whose events it no longer understands would be confidently wrong, which is the
// one outcome the invariant forbids. So the gate is EXACT-MATCH and FAIL-CLOSED:
//
//   * only versions that were actually observed and tested on an acceptance machine are supported;
//   * there are NO RANGES, no semver caret, no "greater than". A range is a claim about software that
//     has not been written yet;
//   * an unresolved, unparseable, or unlisted version is NOT supported, and the badge shows
//     `unknown` with reason `version-mismatch`. It never shows a lifecycle state.
//
// THE CHILD-PROCESS BOUNDARY. Resolving a version means running an executable, and § 15 of the work
// order permits that in exactly three places: explicit setup, installed-startup discovery, and an
// explicitly ordered acceptance re-probe. The resolver is therefore INJECTED and this module never
// imports child_process. Provider events, heartbeat, freshness, rendering, enrollment and revocation
// cannot reach a spawn from here, because there is no spawn here to reach.

// Versions proven on an acceptance machine, exact strings only.
//
// PROVISIONAL. Entries are added ONLY by the read-only version probe of § 18, one exact string at a
// time, on the machine that ran it. An entry is a statement that a human ran the probe and recorded
// the result — never an inference, never a range, never a guess about a neighbouring patch release.
const SUPPORTED_CLAUDE_VERSIONS = Object.freeze([
  // PROVISIONAL — added by the § 18 read-only probe on the acceptance machine, 2026-08-22.
  //   command (the application's own resolution path) : `claude --version`, execFile, shell:false
  //   resolved executable                             : C:\Users\levij\.local\bin\claude.exe
  //   raw output                                      : "2.1.228 (Claude Code)\n"
  //   exit                                            : 0
  //
  // This entry records a VERSION PROBE, not a live acceptance run. No provider session was opened, no
  // prompt was submitted, and no model turn was consumed to produce it, so nothing here establishes
  // that the eight hook events actually fire as expected on this build — only that this is the exact
  // version the application would launch. Controlled live acceptance is a separate, later order.
  //
  // A second probe is required immediately before that live acceptance. If the resolved path or the
  // version differs by so much as a patch number, the run STOPS before the provider session and needs
  // a fresh provisional code change, a regenerated artifact, and a fresh Full review.
  '2.1.228',
]);

const VERSION_REFUSAL = Object.freeze({
  NOT_PROBED: 'version-not-probed',
  UNPARSEABLE: 'version-unparseable',
  UNSUPPORTED: 'version-unsupported',
  RESOLVER_FAILED: 'version-resolver-failed',
});

// `claude --version` prints something like "2.1.196 (Claude Code)". We take the leading dotted triple
// and nothing else. A string we cannot parse this precisely is not a version we are willing to act on.
const VERSION_PATTERN = /^\s*(\d+\.\d+\.\d+)\b/;

/** Extract the exact version from raw resolver output. Returns null when it cannot be parsed. */
function parseVersion(raw) {
  if (typeof raw !== 'string') return null;
  const m = VERSION_PATTERN.exec(raw);
  return m ? m[1] : null;
}

/**
 * Exact membership. Deliberately not a comparison — `indexOf` on a frozen list of strings is the
 * whole policy, and it is impossible to accidentally widen.
 */
function isVersionSupported(version, supportedVersions) {
  const list = supportedVersions || SUPPORTED_CLAUDE_VERSIONS;
  if (typeof version !== 'string' || version.length === 0) return false;
  return list.indexOf(version) !== -1;
}

/**
 * deps:
 *   resolveVersion() -> { ok, raw, exit, executable } | Promise thereof.  INJECTED. The only
 *                       child-process dependency in the whole subsystem's version path.
 *   supportedVersions -> optional override (tests pin their own list)
 *   log(line)         -> bounded logger. Receives version strings, never payloads or tokens.
 */
function createVersionGate(deps) {
  const d = deps || {};
  const resolveVersion = typeof d.resolveVersion === 'function' ? d.resolveVersion : null;
  const supportedVersions = d.supportedVersions || SUPPORTED_CLAUDE_VERSIONS;
  const log = typeof d.log === 'function' ? d.log : () => {};

  // State starts at "not probed", which is NOT supported. Fail-closed means the default answer is no.
  let observed = null;      // exact parsed version, or null
  let lastRaw = null;       // raw resolver output, retained for the acceptance record
  let lastReason = VERSION_REFUSAL.NOT_PROBED;
  let lastExecutable = null;

  /**
   * Run the injected resolver. Permitted ONLY from explicit setup, installed-startup discovery, or an
   * explicitly ordered acceptance re-probe — the controller enforces which of those is calling.
   */
  async function probe() {
    if (!resolveVersion) {
      lastReason = VERSION_REFUSAL.RESOLVER_FAILED;
      return { ok: false, reason: lastReason };
    }
    let result;
    try { result = await resolveVersion(); }
    catch { result = null; }

    if (!result || result.ok !== true) {
      observed = null;
      lastRaw = result && typeof result.raw === 'string' ? result.raw : null;
      lastExecutable = result && typeof result.executable === 'string' ? result.executable : null;
      lastReason = VERSION_REFUSAL.RESOLVER_FAILED;
      log('[pane-status] version probe failed: resolver did not return a result');
      return { ok: false, reason: lastReason };
    }

    lastRaw = typeof result.raw === 'string' ? result.raw : null;
    lastExecutable = typeof result.executable === 'string' ? result.executable : null;
    const parsed = parseVersion(lastRaw);
    if (!parsed) {
      observed = null;
      lastReason = VERSION_REFUSAL.UNPARSEABLE;
      log('[pane-status] version probe returned output that does not parse as an exact version');
      return { ok: false, reason: lastReason };
    }

    observed = parsed;
    const supported = isVersionSupported(observed, supportedVersions);
    lastReason = supported ? null : VERSION_REFUSAL.UNSUPPORTED;
    // The version string is bounded and non-sensitive, so it is safe to log; a payload never is.
    log(`[pane-status] Claude version resolved: ${observed} (${supported ? 'supported' : 'NOT supported'})`);
    return { ok: true, version: observed, supported, raw: lastRaw, executable: lastExecutable };
  }

  /** The gate itself. No probe yet, a failed probe, and an unlisted version are all equally "no". */
  function supported() { return isVersionSupported(observed, supportedVersions); }

  /** Why the gate says no, as a bounded constant. null when it says yes. */
  function reason() { return supported() ? null : (lastReason || VERSION_REFUSAL.NOT_PROBED); }

  /** The acceptance record for § 18. Contains no token, no payload, no settings content. */
  function record() {
    return {
      observed,
      raw: lastRaw,
      executable: lastExecutable,
      supported: supported(),
      reason: reason(),
      supportedVersions: Array.from(supportedVersions),
    };
  }

  return { probe, supported, reason, record, observedVersion: () => observed };
}

const api = {
  SUPPORTED_CLAUDE_VERSIONS,
  VERSION_REFUSAL,
  VERSION_PATTERN,
  parseVersion,
  isVersionSupported,
  createVersionGate,
};
if (typeof module === 'object' && module.exports) module.exports = api;
