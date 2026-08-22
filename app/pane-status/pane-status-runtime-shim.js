'use strict';
// Blue Helm production pane status — the runtime shim and the exact hook invocation.
//
// EVERY CONSTANT IN THIS FILE IS AN EMPIRICAL RESULT, NOT A TRANSCRIPTION.
// See docs/BUILDER-HANDOFF-pane-status-production.md § discovery for the fixture evidence.
//
// THE CHAIN
//   Claude Code  ->  cmd.exe  ->  pane-status-reporter.cmd  ->  Electron (as node)  ->  reporter.js
//
// WHY EACH LINK EXISTS
//   * Claude Code's command-hook exec form (`args` present) resolves `command` as an executable and
//     spawns it directly, with NO shell. A `.cmd` file is not an executable, so something must
//     interpret it: that is cmd.exe, and it must be an absolute path.
//   * The reporter must run with ELECTRON_RUN_AS_NODE=1, and a command hook has no `env` field. A
//     `.cmd` shim is the smallest thing that can set an environment variable for its own child only.
//   * `setlocal` keeps that variable inside the shim, so nothing else on the machine inherits it.
//
// THE ENCODING, AND WHY IT IS NOT THE OBVIOUS ONE
//   Claude Code spawns exec-form hooks with `spawn(command, args, { env, cwd, detached, windowsHide })`
//   — no `shell`, and no `windowsVerbatimArguments`. That means Windows argv encoding applies: each
//   arg is quoted by the MSVCRT rules, which quote ONLY on space, tab, or quote, and escape an inner
//   quote as \" — a sequence cmd.exe does not understand.
//
//   Consequences, all measured:
//     * Putting quotes INSIDE an arg (`"<shim>" >nul 2>nul & exit /b 0`) fails. The encoder turns
//       them into \" and cmd.exe reports `'\"C:\...cmd\"' is not recognized`. Worse, with the
//       trailing `& exit /b 0` the failure is SILENT: exit 0, empty stderr, reporter never runs.
//     * Adding /s makes it worse, not better: /s strips the first and last quote, unquoting a path
//       that contains a space.
//   So the arguments are passed as SEPARATE argv elements and the encoder is allowed to do the
//   quoting: ['/d','/c', <shim>, '>nul','2>nul','&','exit','/b','0'].
//
//   That alone is still not enough. cmd.exe re-parses metacharacters after removing the quoting, so a
//   shim path containing & ^ ( ) ; , = or + breaks even though the encoder quoted it. Caret-escaping
//   those characters — AND the space — fixes every measured case (17/17). Escaping metacharacters but
//   not the space fails on `lab &dir` and `lab ^dir`, so the space is part of the rule, not decoration.
//
//   Paired percent signs are irreducible: cmd expands %VAR% before caret processing and `^` cannot
//   escape `%` on a command line. Such a path is REFUSED, visibly, rather than encoded wrongly.

const path = require('path');

// cmd.exe metacharacters that must be caret-escaped when the token reaches cmd. The trailing space is
// deliberate and load-bearing — see the note above.
const CMD_META = /[&^()<>|;,= ]/g;

// Characters that cannot be encoded safely at all. Most are already illegal in Windows paths; they are
// validated anyway so a caller cannot hand us one from a config file or a crafted userData path.
const REFUSE_PATTERN = /["\r\n\u0000-\u001f]/;

const REFUSAL = Object.freeze({
  NOT_ABSOLUTE: 'shim-path-not-absolute',
  CONTROL_OR_QUOTE: 'shim-path-has-quote-or-control-character',
  PAIRED_PERCENT: 'shim-path-has-paired-percent',
  EMPTY: 'shim-path-empty',
});

// Caret-escape a token so it survives cmd.exe's re-parse.
function escapeForCmd(value) {
  return String(value).replace(CMD_META, (m) => '^' + m);
}

// Validate a shim path against what the chain can actually encode. Returns { ok:true } or
// { ok:false, reason } using a bounded constant — never the offending path.
function validateShimPath(shimPath) {
  if (typeof shimPath !== 'string' || shimPath.length === 0) return { ok: false, reason: REFUSAL.EMPTY };
  if (!path.isAbsolute(shimPath)) return { ok: false, reason: REFUSAL.NOT_ABSOLUTE };
  if (REFUSE_PATTERN.test(shimPath)) return { ok: false, reason: REFUSAL.CONTROL_OR_QUOTE };
  // Two or more percent signs can form %VAR% and expand. One cannot. Conservative and deterministic.
  const percents = (shimPath.match(/%/g) || []).length;
  if (percents >= 2) return { ok: false, reason: REFUSAL.PAIRED_PERCENT };
  return { ok: true };
}

// Resolve and validate the absolute cmd.exe. Never trusts PATH.
function resolveCmdExe(env) {
  const e = env || process.env || {};
  const root = e.SystemRoot || e.windir || 'C:\\Windows';
  return path.join(root, 'System32', 'cmd.exe');
}

// The exact hook argument vector. `command` is the resolved absolute cmd.exe.
function buildHookArgs(shimPath) {
  const verdict = validateShimPath(shimPath);
  if (!verdict.ok) throw new Error('buildHookArgs: ' + verdict.reason);
  return ['/d', '/c', escapeForCmd(shimPath), '>nul', '2>nul', '&', 'exit', '/b', '0'];
}

// The shim's own text. CRLF throughout: an LF-only .cmd is not reliably parsed by cmd.exe.
//
// `%` inside an embedded path is doubled, because a batch file expands %VAR% in its own body. Paths
// with a PAIR of percent signs never reach here — validateShimPath refuses them first — but a single
// one is legal and must survive.
function buildShimContent(runtimePath, reporterPath) {
  const q = (p) => '"' + String(p).replace(/%/g, '%%') + '"';
  const lines = [
    '@echo off',
    'setlocal',
    'set "ELECTRON_RUN_AS_NODE=1"',
    q(runtimePath) + ' ' + q(reporterPath),
    'endlocal',
    'exit /b 0',
  ];
  return lines.join('\r\n') + '\r\n';
}

const api = {
  CMD_META,
  REFUSE_PATTERN,
  REFUSAL,
  escapeForCmd,
  validateShimPath,
  resolveCmdExe,
  buildHookArgs,
  buildShimContent,
};
if (typeof module === 'object' && module.exports) module.exports = api;
