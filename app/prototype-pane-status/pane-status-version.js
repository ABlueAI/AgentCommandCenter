'use strict';
// EXPERIMENT A — PROTOTYPE ONLY. Provider version discovery, bound to the executable the PANE launches.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: PROTOTYPE
//
// WHY THIS MODULE EXISTS AT ALL — revision 2, from a Full-class VERDICT: FAIL.
//
// Revision 1 never told the prototype which Claude version was installed, so every view resolved to
// `unknown/version-mismatch` in the real application; the working demonstration existed only inside
// `live-probe.js`, which hard-coded the answer. Worse, the version that WAS recorded came from
// `%APPDATA%\npm\claude.cmd` (npm 2.1.196) while `app/main.js` launches a BARE `claude` through
// PowerShell, which on the review machine resolved first to `C:\Users\levij\.local\bin\claude.exe`
// (2.1.220). The pin described one installation and the pane ran another.
//
// THE RULE THIS MODULE ENFORCES: the version check and the pane launch must name the SAME resolved
// executable, or the check is worthless. So we do not search PATH ourselves, do not guess an install
// location, and never read another installation's package metadata. We ask PowerShell — the very
// interpreter the PTY uses — to resolve the same bare command name, report the path it picked, and
// then invoke THAT path for its version. Windows command resolution (PATHEXT ordering, PATH order,
// aliases and functions) is therefore performed by the thing that will perform it for real.
//
// FAIL-CLOSED, ALWAYS. Resolution failure, a version command that errors, a version string we cannot
// parse, or a timeout all yield `{ ok:false }` and a null version. A null version is NOT "assume
// compatible" — `pane-status-store` degrades the badge to `unknown` with a visible reason. The one
// thing this module may never do is let an unverified provider look verified.

// The pane is spawned as:
//   pty.spawn('powershell.exe', ['-NoLogo','-ExecutionPolicy','Bypass','-NoExit','-Command', run])
// We mirror those flags EXCEPT `-NoExit` (we want the probe to exit). We deliberately do NOT add
// `-NoProfile`: the real pane loads Blue's PowerShell profile, and a profile may prepend to PATH or
// define a `claude` function or alias that changes which executable wins. Matching the pane matters
// more than shaving startup cost, and mismatching it is exactly the revision-1 defect.
const PS_EXE = 'powershell.exe';
const PS_FLAGS = Object.freeze(['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command']);

// Whole probe budget. Generous enough for a profile load plus a large binary's --version, small
// enough that a wedged provider cannot delay the app: discovery is asynchronous and the badge simply
// stays `unknown` until (or unless) it lands.
const PROBE_TIMEOUT_MS = 15000;
const MAX_PROBE_OUTPUT_BYTES = 65536;

// Sentinels. Parsing keyed on these rather than on line position, so profile banners, progress
// output, or an update notice printed around our lines cannot shift the answer.
const SOURCE_TAG = 'PANE_STATUS_SOURCE=';
const VERSION_TAG = 'PANE_STATUS_VERSION=';
const ERROR_TAG = 'PANE_STATUS_ERROR=';

// The command name is a repo constant (`AGENT_CMD.claude`), never user input. It is still validated
// before interpolation, because "it is a constant today" is not a property a future edit preserves.
const SAFE_COMMAND_NAME = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * The PowerShell probe. Resolves the bare command name the same way the pane will, prints the path
 * it chose, then invokes THAT EXACT path — `& $source --version` — never the bare name a second
 * time, so resolution cannot drift between the two steps.
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
 * Extract the version from `claude --version` output (e.g. `2.1.196 (Claude Code)`).
 *
 * Anchored at the start and requiring three numeric components: a permissive search would happily
 * lift a version number out of an update notice or a deprecation warning printed above the real one.
 * Anything we cannot parse this way is a refusal, not a guess.
 */
function parseVersion(versionOutput) {
  if (typeof versionOutput !== 'string') return null;
  const m = /^\s*v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(versionOutput);
  return m ? m[1] : null;
}

/**
 * Interpret one completed probe. Pure, so every branch is testable without spawning PowerShell.
 * Returns { ok, version, source, reason } where `reason` is a bounded constant safe to log.
 */
function interpretProbe(result) {
  const r = result || {};
  if (r.timedOut) return { ok: false, version: null, source: null, reason: 'version-probe-timeout' };
  if (r.error) return { ok: false, version: null, source: null, reason: 'version-probe-failed' };
  const stdout = typeof r.stdout === 'string' ? r.stdout : '';

  // CORRECTED (revision 3, Low finding 3). SOURCE IS READ FIRST, BEFORE BRANCHING ON ERROR_TAG.
  //
  // The probe writes SOURCE_TAG as soon as `Get-Command` succeeds, and only then runs
  // `& $s --version`. With `$ErrorActionPreference = "Stop"`, a native command that writes to stderr
  // raises a terminating NativeCommandError in Windows PowerShell 5.1 — so the catch can fire AFTER
  // the source line was already printed. Revision 2 tested ERROR_TAG first and therefore reported
  // `provider-not-found` with a null source for a provider that WAS found and whose version command
  // merely failed, and `version-command-failed` was unreachable in that case. Both outcomes fail
  // closed to a null version either way; the defect was that the operator-visible reason named the
  // wrong cause. Reserve `provider-not-found` for an ACTUAL resolution failure.
  const source = readTag(stdout, SOURCE_TAG);
  if (readTag(stdout, ERROR_TAG) !== null) {
    return source
      ? { ok: false, version: null, source, reason: 'version-command-failed' }
      : { ok: false, version: null, source: null, reason: 'provider-not-found' };
  }
  if (!source) return { ok: false, version: null, source: null, reason: 'provider-unresolved' };
  const versionLine = readTag(stdout, VERSION_TAG);
  if (versionLine === null) return { ok: false, version: null, source, reason: 'version-command-failed' };
  const version = parseVersion(versionLine);
  if (!version) return { ok: false, version: null, source, reason: 'version-unparsable' };
  return { ok: true, version, source, reason: null };
}

/**
 * deps:
 *   execFile(file, args, opts, cb) -> node child_process.execFile (injected for tests)
 *   env          -> the environment the PANE will be launched with (PATH/PATHEXT must match)
 *   commandName  -> the bare command the pane launches (AGENT_CMD.claude)
 *   log(line)    -> bounded logger
 *   timeoutMs    -> optional override
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
   * Run the probe once. Never rejects: a failure is a resolved refusal, because a rejected promise
   * on a background discovery would be an invisible failure, and this repo requires the opposite.
   */
  function discover() {
    let script;
    try {
      script = buildProbeScript(commandName);
    } catch {
      return Promise.resolve({ ok: false, version: null, source: null, reason: 'unsafe-command-name' });
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (outcome) => {
        if (settled) return;
        settled = true;
        if (outcome.ok) {
          log(`[pane-status] provider resolved: ${outcome.source} (version ${outcome.version})`);
        } else {
          // Visible failure, bounded reason, no interpolated output.
          log(`[pane-status] provider version NOT established (${outcome.reason}) — panes stay "unknown"`);
        }
        resolve(outcome);
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
        finish({ ok: false, version: null, source: null, reason: 'version-probe-failed' });
      }
    });
  }

  return { discover, commandName };
}

const api = {
  PS_EXE,
  PS_FLAGS,
  PROBE_TIMEOUT_MS,
  SOURCE_TAG,
  VERSION_TAG,
  ERROR_TAG,
  buildProbeScript,
  readTag,
  parseVersion,
  interpretProbe,
  createClaudeVersionResolver,
};
if (typeof module === 'object' && module.exports) module.exports = api;
