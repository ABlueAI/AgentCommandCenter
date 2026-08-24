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
  // PROVISIONAL — re-probed 2026-08-23 with the CORRECTED pane-equivalent resolver (below), on the
  // machine intended for acceptance. The 2026-08-22 entry was obtained with the superseded method and
  // is retained here only as the comparison it now forms half of.
  //
  //   METHOD B (production, current)  one PowerShell, pane flags, profile LOADED, Get-Command then
  //                                   `& $source --version`
  //     resolved executable : C:\Users\levij\.local\bin\claude.exe
  //     raw version line    : "2.1.228 (Claude Code)"
  //     parsed              : 2.1.228
  //
  //   METHOD A (superseded)           execFile('claude', ['--version']) against the host process PATH
  //     resolved executable : C:\Users\levij\.local\bin\claude.exe
  //     parsed              : 2.1.228
  //
  // THE TWO AGREE TODAY. That is recorded as an observation, NOT as evidence that the historical
  // divergence cannot happen: `where.exe claude` on this machine still lists THREE candidates —
  //     C:\Users\levij\.local\bin\claude.exe
  //     C:\Users\levij\AppData\Roaming\npm\claude
  //     C:\Users\levij\AppData\Roaming\npm\claude.cmd
  // — which is exactly the two-installation condition that produced the prototype's revision-1 defect
  // (a pin describing the npm install while the pane ran the .local one). They agree only because
  // `.local\bin` currently precedes the npm directory for BOTH resolution paths. A PATH edit or a
  // profile change makes them disagree again, and only method B would follow the pane.
  //
  // The A-versus-B divergence is therefore proven by an automated fixture (pane-status-resolution
  // .test.js), and NOT currently reproduced on this host. No claim is made that it was.
  //
  // This entry records a VERSION PROBE, not a live acceptance run. No provider session was opened, no
  // prompt was submitted, and no model turn was consumed to produce it, so nothing here establishes
  // that the eight hook events actually fire as expected on this build — only that this is the exact
  // version the application would launch. Controlled live acceptance is a separate, later order.
  //
  // A third probe, through METHOD B, is required immediately before that live acceptance. If the
  // resolved path or the version differs by so much as a patch number, the run STOPS before the
  // provider session and needs a fresh provisional code change, a regenerated artifact, and a fresh
  // Full review.
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

// =================================================================================================
// THE PRODUCTION RESOLVER — the version gate must probe the SAME `claude` the pane launches.
// =================================================================================================
//
// CORRECTION (advisory review, finding 3). The previous build called
// `execFile('claude', ['--version'])` from Electron main and treated the answer as pane identity. It
// is not. Electron main's PATH is the PATH the app was started with; the pane is a
// `pty.spawn('powershell.exe', ['-NoLogo','-ExecutionPolicy','Bypass','-NoExit', …])` that LOADS THE
// USER'S POWERSHELL PROFILE, and a profile may prepend to PATH, define a `claude` function, or set an
// alias. Those two resolutions can name different executables with different versions.
//
// This is not hypothetical. The reviewed prototype's own header records exactly this defect from its
// revision 1: the pin described `%APPDATA%\npm\claude.cmd` (2.1.196) while the pane actually ran
// `C:\Users\levij\.local\bin\claude.exe` (2.1.220). Work Order 1 § F.8 and the Work Order 1R addendum
// § E.2 both specify the corrected behaviour, and the corrected prototype module implemented it. That
// behaviour is carried forward here rather than reinvented.
//
// WHY THE BARE NAME `powershell.exe` IS CORRECT HERE, AND ONLY HERE.
//   The stale-lock liveness resolver uses a BOUNDED ABSOLUTE path under the system directory
//   (pane-status-lock.js), because it must not depend on the user's environment at all.
//   This resolver is the exact opposite requirement: it must depend on precisely the user's
//   environment, because that environment is what decides which `claude` the pane runs. Resolving an
//   absolute PowerShell here would break the binding the whole module exists to establish.
//
// `-NoProfile` IS DELIBERATELY ABSENT. The pane loads the profile; so must the probe.
const PS_EXE = 'powershell.exe';
// The pane's flags minus -NoExit (we want the probe to terminate). app/main.js builds
// ['-NoLogo','-ExecutionPolicy','Bypass','-NoExit'] for the PTY; a test pins this correspondence.
const PS_FLAGS = Object.freeze(['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command']);

const PROBE_TIMEOUT_MS = 15000;
const MAX_PROBE_OUTPUT_BYTES = 65536;

// Sentinels. Parsing keys on these rather than on line position, so a profile banner, a progress bar,
// or an update notice printed around our lines cannot shift the answer.
const SOURCE_TAG = 'PANE_STATUS_SOURCE=';
const VERSION_TAG = 'PANE_STATUS_VERSION=';
const ERROR_TAG = 'PANE_STATUS_ERROR=';

// The command name is a repo constant (AGENT_CMD.claude), never user input. It is validated anyway,
// because "it is a constant today" is not a property a future edit preserves.
const SAFE_COMMAND_NAME = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * The fixed, app-owned resolver script. Resolves the bare command name the same way the pane will,
 * prints the path it chose, then invokes THAT EXACT path — `& $s --version` — never the bare name a
 * second time, so resolution cannot drift between the two steps.
 */
function buildProbeScript(commandName) {
  if (typeof commandName !== 'string' || !SAFE_COMMAND_NAME.test(commandName)) {
    throw new Error('pane-status-version: unsafe command name');
  }
  return [
    '$ErrorActionPreference = "Stop";',
    'try {',
    `  $c = Get-Command ${commandName};`,
    '  $s = $c.Source;',
    `  Write-Output ("${SOURCE_TAG}" + $s);`,
    '  if ($s) {',
    '    $v = & $s --version;',
    `    Write-Output ("${VERSION_TAG}" + ($v -join " "));`,
    '  }',
    '} catch {',
    `  Write-Output ("${ERROR_TAG}" + $_.Exception.GetType().Name);`,
    '}',
  ].join(' ');
}

/** Pull a tagged value out of the probe's stdout. Returns null when the tag never appeared. */
function readTag(stdout, tag) {
  const text = typeof stdout === 'string' ? stdout : '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.indexOf(tag) === 0) return line.slice(tag.length).trim();
  }
  return null;
}

/**
 * Interpret one completed probe. Pure, so every fail-closed branch is testable without PowerShell.
 *
 * SOURCE IS READ FIRST, BEFORE BRANCHING ON ERROR_TAG — carried forward from the prototype's
 * revision-3 correction. The probe writes SOURCE_TAG as soon as Get-Command succeeds and only then
 * runs `& $s --version`; with `$ErrorActionPreference = "Stop"`, a native command that writes to
 * stderr raises a terminating NativeCommandError in Windows PowerShell 5.1, so the catch can fire
 * AFTER the source line was printed. Testing ERROR_TAG first reported `provider-not-found` with a null
 * source for a provider that WAS found and whose version command merely failed. Both fail closed
 * either way; the defect was that the operator-visible reason named the wrong cause.
 */
function interpretProbe(result) {
  const r = result || {};
  if (r.timedOut) return { ok: false, version: null, source: null, raw: null, reason: 'version-probe-timeout' };
  if (r.error) return { ok: false, version: null, source: null, raw: null, reason: 'version-probe-failed' };
  const stdout = typeof r.stdout === 'string' ? r.stdout : '';

  const source = readTag(stdout, SOURCE_TAG);
  if (readTag(stdout, ERROR_TAG) !== null) {
    return source
      ? { ok: false, version: null, source, raw: null, reason: 'version-command-failed' }
      : { ok: false, version: null, source: null, raw: null, reason: 'provider-not-found' };
  }
  // An EMPTY source is unusable: Get-Command can resolve a function or an alias that has no Source,
  // and there is then no exact executable to pin. That is a refusal, never a fallback to the name.
  if (!source) return { ok: false, version: null, source: null, raw: null, reason: 'provider-unresolved' };
  const versionLine = readTag(stdout, VERSION_TAG);
  if (versionLine === null) return { ok: false, version: null, source, raw: null, reason: 'version-command-failed' };
  const version = parseVersion(versionLine);
  if (!version) return { ok: false, version: null, source, raw: versionLine, reason: 'version-unparseable' };
  return { ok: true, version, source, raw: versionLine, reason: null };
}

/**
 * WO-7 § 1 — THE OPERATOR-VISIBLE CLASSIFICATION OF A RESOLUTION, AND NOTHING ELSE.
 *
 * The resolved executable is an absolute filesystem path. It used to be interpolated straight into the
 * provider-resolution log line, and main.js wires that logger to `tlog` — so the path reached the Logs
 * tab, and from there anywhere a log is copied. It disclosed where the operator's provider is
 * installed, which is neither the operator's decision nor anything the log needed to say.
 *
 * What replaces it is a fixed, bounded classification: HOW the provider was resolved, and whether that
 * succeeded. The path itself is still resolved, still verified, and still the executable the probe
 * invokes — it is simply never rendered anywhere a human or a file can read it.
 */
const RESOLUTION_METHOD = 'powershell-get-command';

/**
 * deps:
 *   execFile(file, args, opts, cb) -> node child_process.execFile. INJECTED — this module still never
 *                                     imports child_process, so no provider-event path can reach one.
 *   env          -> the environment the PANE will be launched with (PATH/PATHEXT must match)
 *   commandName  -> the bare command the pane launches (AGENT_CMD.claude)
 *   log(line)    -> bounded logger
 *   timeoutMs    -> optional override
 *
 * The returned `discover()` shape is exactly what createVersionGate's `resolveVersion` expects
 * (`{ ok, raw, executable }`) plus the resolver's own parsed fields, so the gate re-parses and
 * re-checks membership independently of anything decided here.
 */
function createClaudeVersionResolver(deps) {
  const d = deps || {};
  const execFile = d.execFile;
  const env = d.env || {};
  const commandName = d.commandName || 'claude';
  const log = typeof d.log === 'function' ? d.log : () => {};
  const timeoutMs = typeof d.timeoutMs === 'number' ? d.timeoutMs : PROBE_TIMEOUT_MS;
  if (typeof execFile !== 'function') throw new Error('pane-status-version: execFile is required');

  /**
   * Run the probe once. NEVER REJECTS: a failure is a resolved refusal, because a rejected promise on
   * a background discovery would be an invisible failure and this repo requires the opposite.
   */
  function discover() {
    let script;
    try { script = buildProbeScript(commandName); }
    catch { return Promise.resolve({ ok: false, version: null, source: null, executable: null, raw: null, reason: 'unsafe-command-name' }); }

    return new Promise((resolve) => {
      let settled = false;
      const finish = (outcome) => {
        if (settled) return;
        settled = true;
        // WO-7 § 1. `outcome.source` is an ABSOLUTE EXECUTABLE PATH and must never be interpolated
        // here: this logger is wired to tlog in main.js. Only the resolution method and the
        // success/failure classification are operator-visible; `outcome.reason` is already one of a
        // fixed set of bounded constants, and `outcome.version` is a parsed version, never a path.
        if (outcome.ok) {
          log(`[pane-status] provider resolved via ${RESOLUTION_METHOD} (version ${outcome.version})`);
        } else {
          log(`[pane-status] provider version NOT established via ${RESOLUTION_METHOD} `
            + `(${outcome.reason}) — panes stay "unknown"`);
        }
        // `executable` is the gate's field name for the same fact `source` names here. It stays on the
        // returned object because the acceptance record needs it, and it reaches no sink: nothing
        // logs it, the controller never puts it in setup state, and IPC never projects it.
        resolve(Object.assign({ executable: outcome.source }, outcome));
      };
      try {
        execFile(
          PS_EXE,
          PS_FLAGS.concat([script]),
          { env, timeout: timeoutMs, maxBuffer: MAX_PROBE_OUTPUT_BYTES, windowsHide: true },
          (error, stdout) => {
            const timedOut = !!(error && (error.killed || error.signal));
            finish(interpretProbe({ error: error && !timedOut ? error : null, timedOut, stdout }));
          },
        );
      } catch {
        finish({ ok: false, version: null, source: null, raw: null, reason: 'version-probe-failed' });
      }
    });
  }

  return { discover, commandName, script: () => buildProbeScript(commandName) };
}

const api = {
  SUPPORTED_CLAUDE_VERSIONS,
  VERSION_REFUSAL,
  VERSION_PATTERN,
  parseVersion,
  isVersionSupported,
  createVersionGate,
  PS_EXE,
  PS_FLAGS,
  PROBE_TIMEOUT_MS,
  SOURCE_TAG,
  VERSION_TAG,
  ERROR_TAG,
  RESOLUTION_METHOD,
  buildProbeScript,
  readTag,
  interpretProbe,
  createClaudeVersionResolver,
};
if (typeof module === 'object' && module.exports) module.exports = api;
