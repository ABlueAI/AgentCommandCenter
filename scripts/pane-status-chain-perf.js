'use strict';
// Blue Helm pane status — REPRODUCIBLE FULL-CHAIN PERFORMANCE HARNESS (§ 13 / Binding Amendment A § 5).
//
//   Run: node scripts/pane-status-chain-perf.js [runs]        (default 200)
//
// WHAT IT MEASURES. The exact chain Claude Code invokes for one hook event, end to end:
//
//   cmd.exe -> the hook argument vector built by pane-status-runtime-shim
//           -> pane-status-reporter.cmd (the app-written shim)
//           -> Electron with child-only ELECTRON_RUN_AS_NODE=1
//           -> app/pane-status/pane-status-reporter.js
//
// It does NOT measure reporter.js in isolation and call that hook overhead. Timing the leaf of a
// four-process chain and reporting it as the cost of the chain is the specific mistake Binding
// Amendment A § 5 forbids, and it would understate the real figure by most of it.
//
// WHY IT IS A BUILDER-OPERATED SCRIPT AND NOT A TEST. It spawns 200 real processes and takes about a
// minute. Putting it in the app gate would add that to every run for a number nobody reads on most
// commits. It lives in scripts/ rather than app/pane-status/ so that it is outside the production
// runtime tree the singleton and isolation scans walk — no production module requires it, and a
// dedicated assertion in pane-status-isolation.test.js proves that.
//
// WHAT IT NEVER TOUCHES. Real Claude settings, real hooks, the real userData directory, a provider
// session, a prompt, or a model turn. Every path it uses is created under os.tmpdir() and deleted
// afterwards, and the chain runs UNENROLLED — no pipe, no token — which is exactly the machine-wide
// steady state a user-scope installation imposes on every other Claude session on the box.
//
// WHAT IT CANNOT TELL YOU:
//
//   ENROLLED PER-TOOL-CALL OVERHEAD IS NOT MEASURED HERE. PRETOOLUSE AND POSTTOOLUSE PRODUCE TWO
//   REPORTER INVOCATIONS PER TOOL CALL. THAT IS A REQUIRED CONTROLLED-LIVE ACCEPTANCE MEASUREMENT,
//   NOT EVIDENCE ESTABLISHED BY THIS UNENROLLED HARNESS.

const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_DIR = path.join(__dirname, '..', 'app');
const shimMod = require(path.join(APP_DIR, 'pane-status', 'pane-status-runtime-shim'));

const RUNS = Math.max(1, Math.min(2000, Number(process.argv[2]) || 200));

/** The Electron executable this repository's application runs as. */
function resolveElectron() {
  const fromModule = path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe');
  if (fs.existsSync(fromModule)) return fromModule;
  return null;
}

/** Count Electron processes, and how many of them own a visible top-level window. */
function electronProcessCensus() {
  const ps = require(path.join(APP_DIR, 'pane-status', 'pane-status-lock')).resolveWindowsPowerShellPath(process.env);
  if (!ps.ok) return { ok: false, reason: ps.reason };
  const r = cp.spawnSync(ps.path, ['-NoProfile', '-NonInteractive', '-Command',
    '$p = @(Get-Process -Name electron -ErrorAction SilentlyContinue); '
    + '"" + $p.Count + " " + @($p | Where-Object { $_.MainWindowHandle -ne 0 }).Count'],
  { windowsHide: true, encoding: 'utf8', timeout: 30000 });
  const m = /^(\d+)\s+(\d+)$/.exec(String(r.stdout || '').trim());
  if (!m) return { ok: false, reason: 'census-unparseable' };
  return { ok: true, processes: Number(m[1]), windows: Number(m[2]) };
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

const electron = resolveElectron();
if (!electron) {
  process.stderr.write('pane-status-chain-perf: app/node_modules/electron/dist/electron.exe not found — run npm install in app/ first\n');
  process.exit(1);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-chain-perf-'));
const installId = 'p'.repeat(0) + 'abcdef0123456789abcdef0123456789';
const shimDir = path.join(root, 'pane-status', installId);
fs.mkdirSync(shimDir, { recursive: true });
const shimPath = path.join(shimDir, 'pane-status-reporter.cmd');
const reporterPath = path.join(APP_DIR, 'pane-status', 'pane-status-reporter.js');

const verdict = shimMod.validateShimPath(shimPath);
if (!verdict.ok) {
  process.stderr.write(`pane-status-chain-perf: temp shim path refused (${verdict.reason})\n`);
  process.exit(1);
}
fs.writeFileSync(shimPath, shimMod.buildShimContent(electron, reporterPath));

const cmdExe = shimMod.resolveCmdExe(process.env);
const args = shimMod.buildHookArgs(shimPath);

// UNENROLLED: the pane variables are deliberately absent, so the reporter exits before reading stdin.
const env = Object.assign({}, process.env);
delete env.BLUE_HELM_PANE_STATUS_PIPE;
delete env.BLUE_HELM_PANE_STATUS_TOKEN;
delete env.ELECTRON_RUN_AS_NODE;   // the SHIM sets it, for its own child only

// A realistic hook payload on stdin, so the measurement includes whatever the reporter does with it.
const PAYLOAD = JSON.stringify({
  session_id: 'x'.repeat(36),
  transcript_path: 'C:\\\\Users\\\\example\\\\.claude\\\\projects\\\\example\\\\session.jsonl',
  cwd: 'C:\\\\Workspace\\\\example',
  hook_event_name: 'PostToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'git status', description: 'Show working tree status' },
}) + '\n';

const before = electronProcessCensus();

const timings = [];
const exits = new Map();
let stdoutEscaped = 0;
let stderrEscaped = 0;

process.stdout.write(`pane-status full-chain measurement — ${RUNS} runs\n`);
process.stdout.write(`  cmd.exe  : ${cmdExe}\n`);
process.stdout.write(`  args     : ${JSON.stringify(args)}\n`);
process.stdout.write(`  shim     : ${shimPath}\n`);
process.stdout.write(`  runtime  : ${electron}\n`);
process.stdout.write(`  reporter : ${reporterPath}\n`);
process.stdout.write('  enrolled : NO (BLUE_HELM_PANE_STATUS_* deliberately absent)\n\n');

for (let i = 0; i < RUNS; i++) {
  const t0 = process.hrtime.bigint();
  const r = cp.spawnSync(cmdExe, args, {
    env, cwd: root, windowsHide: true, encoding: 'utf8', input: PAYLOAD, timeout: 60000,
  });
  const t1 = process.hrtime.bigint();
  timings.push(Number(t1 - t0) / 1e6);
  const code = r.status === null ? 'null' : String(r.status);
  exits.set(code, (exits.get(code) || 0) + 1);
  if ((r.stdout || '').length > 0) stdoutEscaped += 1;
  if ((r.stderr || '').length > 0) stderrEscaped += 1;
}

const after = electronProcessCensus();
const sorted = timings.slice().sort((a, b) => a - b);
const fmt = (n) => (n === null ? 'n/a' : n.toFixed(1) + 'ms');

process.stdout.write('RESULTS\n');
process.stdout.write(`  runs            : ${RUNS}\n`);
process.stdout.write(`  p50             : ${fmt(percentile(sorted, 50))}\n`);
process.stdout.write(`  p95             : ${fmt(percentile(sorted, 95))}\n`);
process.stdout.write(`  max             : ${fmt(sorted[sorted.length - 1])}\n`);
process.stdout.write(`  min             : ${fmt(sorted[0])}\n`);
process.stdout.write(`  exit codes      : ${JSON.stringify(Object.fromEntries(exits))}\n`);
process.stdout.write(`  stdout escaped  : ${stdoutEscaped} of ${RUNS}\n`);
process.stdout.write(`  stderr escaped  : ${stderrEscaped} of ${RUNS}\n`);
if (before.ok && after.ok) {
  process.stdout.write(`  electron procs  : ${before.processes} before -> ${after.processes} after (residue ${after.processes - before.processes})\n`);
  process.stdout.write(`  electron windows: ${before.windows} before -> ${after.windows} after (appeared ${after.windows - before.windows})\n`);
} else {
  process.stdout.write(`  process census  : UNAVAILABLE (${(before.ok ? after : before).reason})\n`);
}
process.stdout.write('\n');
process.stdout.write('ENROLLED PER-TOOL-CALL OVERHEAD IS NOT MEASURED BY THIS HARNESS. PRETOOLUSE AND\n');
process.stdout.write('POSTTOOLUSE PRODUCE TWO REPORTER INVOCATIONS PER TOOL CALL. THAT IS A REQUIRED\n');
process.stdout.write('CONTROLLED-LIVE ACCEPTANCE MEASUREMENT, NOT EVIDENCE ESTABLISHED HERE.\n');

try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }

const badExit = Array.from(exits.keys()).some((k) => k !== '0');
process.exit((badExit || stdoutEscaped || stderrEscaped) ? 1 : 0);
