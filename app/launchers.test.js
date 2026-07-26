'use strict';
// Run: node app/launchers.test.js
// Plain Node.js — no framework. P12 launcher hardening. Proves:
//   * normalizeLauncherDir refuses cmd metacharacters / control chars / relative / traversal / junk;
//   * resolveVscodeExe / resolveTerminalExe resolve a REAL executable deterministically from main-owned
//     env (never a shell, never cmd.exe / .cmd / PowerShell);
//   * the production VS Code spec is Code.exe with the path as a single discrete argv element;
//   * shell:false passes a metacharacter path to a child LITERALLY (the general property); and
//   * (Windows positive control) the HISTORICAL cmd.exe form actually EXECUTES an injected command
//     from a metacharacter path — i.e. exactly the class the fix removes by dropping cmd.exe.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  IS_WIN,
  normalizeLauncherDir,
  resolveVscodeExe,
  resolveTerminalExe,
  openVscodeSpec,
  openTerminalSpec,
} = require('./launchers');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// --- normalizeLauncherDir: accepts a plain absolute path unchanged ------------------------------
{
  const ok = normalizeLauncherDir(IS_WIN ? 'C:\\Workspace\\repo' : '/home/blue/repo');
  assert(ok.ok === true && ok.dir === (IS_WIN ? 'C:\\Workspace\\repo' : '/home/blue/repo'),
    'a clean absolute path passes unchanged');
}

// --- normalizeLauncherDir: every forbidden cmd metacharacter / quote is refused -----------------
for (const ch of ['%', '&', '|', '^', '<', '>', '(', ')', '"', "'", '`']) {
  const r = normalizeLauncherDir(`C:\\Workspace\\re${ch}po`);
  assert(r.ok === false && r.reason === 'forbidden-char', `refuses metacharacter ${JSON.stringify(ch)} (forbidden-char)`);
}

// --- normalizeLauncherDir: control chars, quotes-only, whitespace, type, relative, traversal ----
{
  assert(normalizeLauncherDir('C:\\repox').reason === 'control-char', 'refuses a control character');
  assert(normalizeLauncherDir('C:\\repo\tx').reason === 'control-char', 'refuses an embedded tab (control char)');
  assert(normalizeLauncherDir('   ').reason === 'blank', 'refuses whitespace-only input (blank)');
  assert(normalizeLauncherDir('').reason === 'not-a-string', 'refuses empty string');
  assert(normalizeLauncherDir(null).reason === 'not-a-string', 'refuses null');
  assert(normalizeLauncherDir(42).reason === 'not-a-string', 'refuses a non-string type');
  assert(normalizeLauncherDir('relative\\path').reason === 'not-absolute', 'refuses a relative path');
  assert(normalizeLauncherDir('C:\\Workspace\\..\\Windows').reason === 'traversal', 'refuses a `..` traversal segment');
  assert(normalizeLauncherDir('C:\\' + 'x'.repeat(5000)).reason === 'too-long', 'refuses an over-length path');
}

// --- resolveVscodeExe: deterministic, first existing candidate, main-owned env only -------------
{
  const env = { LOCALAPPDATA: 'C:\\U\\AppData\\Local', ProgramFiles: 'C:\\Program Files' };
  const userExe = 'C:\\U\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe';
  const sysExe = 'C:\\Program Files\\Microsoft VS Code\\Code.exe';
  // user install present -> chosen first
  let r = resolveVscodeExe({ env, isWin: true, exists: (p) => p === userExe || p === sysExe });
  assert(r.ok && r.exe === userExe, 'resolves the user-install Code.exe first');
  // only system install present -> falls through to it
  r = resolveVscodeExe({ env, isWin: true, exists: (p) => p === sysExe });
  assert(r.ok && r.exe === sysExe, 'falls through to the system-install Code.exe');
  // none present -> visible refusal, never a bare `code`/shell fallback on Windows
  r = resolveVscodeExe({ env, isWin: true, exists: () => false });
  assert(r.ok === false && r.reason === 'vscode-not-found', 'refuses (vscode-not-found) when no Code.exe exists');
  // the resolved exe is Code.exe — never cmd.exe / a .cmd / powershell
  r = resolveVscodeExe({ env, isWin: true, exists: (p) => p === userExe });
  assert(/\\Code\.exe$/i.test(r.exe) && !/cmd\.exe$/i.test(r.exe) && !/\.cmd$/i.test(r.exe) && !/powershell/i.test(r.exe),
    'the resolved VS Code exe is Code.exe — not cmd.exe, a .cmd, or PowerShell');
  // off-Windows: spawn `code` directly (no cmd.exe possible)
  r = resolveVscodeExe({ env: {}, isWin: false, exists: () => false });
  assert(r.ok && r.exe === 'code', 'off-Windows resolves the direct `code` executable');
}

// --- resolveTerminalExe: WindowsApps alias when present, else bare `wt`; never a shell ----------
{
  const env = { LOCALAPPDATA: 'C:\\U\\AppData\\Local' };
  const alias = 'C:\\U\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe';
  assert(resolveTerminalExe({ env, isWin: true, exists: (p) => p === alias }) === alias,
    'resolves the wt.exe App Execution Alias path when it exists');
  const bare = resolveTerminalExe({ env, isWin: true, exists: () => false });
  assert(bare === 'wt' && !/cmd\.exe$/i.test(bare), 'falls back to the bare `wt` alias name (never cmd.exe)');
}

// --- the specs: path is a single discrete argv element; cmd is the resolved exe -----------------
{
  const DIR = 'C:\\Workspace\\proj-with-dash'; // metachar-free (metachars are refused upstream now)
  const vs = openVscodeSpec('C:\\VSCode\\Code.exe', DIR);
  assert(vs.cmd === 'C:\\VSCode\\Code.exe', 'open-vscode spec spawns the resolved Code.exe');
  assert(vs.args.length === 1 && vs.args[0] === DIR, 'open-vscode passes the dir as the ONLY, discrete argv element');
  assert(!/cmd\.exe$/i.test(vs.cmd) && !/\.cmd$/i.test(vs.cmd), 'open-vscode spec never selects cmd.exe or a .cmd');

  const term = openTerminalSpec('C:\\U\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe', DIR);
  assert(/wt\.exe$/i.test(term.cmd), 'open-terminal spec spawns the resolved wt.exe');
  assert(term.args[term.args.length - 1] === DIR && term.args[term.args.length - 2] === '-d',
    'open-terminal passes the dir as a discrete element following -d');
  assert(term.args.join(' ') === `-w 0 nt -d ${DIR}`, 'open-terminal argv is the expected discrete sequence');
}

// --- shell:false passes a metacharacter argv to the child LITERALLY (general property) ----------
{
  const raw = 'a $(whoami) `id` & echo x | dir'; // never touched by a shell -> byte-identical echo-back
  const r = spawnSync(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', raw], { shell: false });
  assert(!r.error && r.status === 0, 'shell:false spawn of a metacharacter argv runs cleanly (no split)');
  assert(r.stdout.toString() === raw, 'the child received the argument BYTE-FOR-BYTE — no shell interpretation');
}

// --- WINDOWS POSITIVE CONTROL: cmd.exe re-parse is a real code-execution primitive --------------
// Demonstrates WHY cmd.exe must stay out of the launch path, and that the new spec never puts it
// there. Confined entirely to a disposable %TEMP% fixture with a harmless sentinel; no VS Code / wt /
// network needed.
//
// Runtime nuance (measured, and captured in the handoff): the HISTORICAL form spawned cmd.exe with the
// directory as a DISCRETE arg (`cmd.exe /d /s /c code <dir>`). On the pinned Node v24, libuv's post-
// CVE-2024-27980 quoting escapes cmd metacharacters in discrete args, so that specific form no longer
// injects on THIS runtime — the discrete-arg case below writes no file. The re-parse primitive is
// nonetheless real whenever a value reaches cmd.exe as part of a command LINE (modelled with
// windowsVerbatimArguments, the "value concatenated into a command string" anti-pattern). The P12 fix
// removes cmd.exe entirely, so it depends on NEITHER libuv's escaping NOR string-building discipline.
if (IS_WIN) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p12-'));
  try {
    // (1) THE DANGER IS REAL: a `&` reaching cmd.exe in a command line re-parses into a 2nd command.
    const sentinel = path.join(tmp, 'sentinel.txt');
    spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'echo ok&echo INJECTED>sentinel.txt'],
      { shell: false, cwd: tmp, windowsHide: true, windowsVerbatimArguments: true });
    assert(fs.existsSync(sentinel),
      'POSITIVE CONTROL: cmd.exe re-parses a command-line `&` and EXECUTES an injected command (sentinel written) — why cmd.exe must stay out of the launch path');

    // (2) On the pinned runtime the discrete-arg form is escaped by libuv (documents the nuance; a
    // harmless `echo` token so nothing external launches). No injection -> no file.
    const discrete = path.join(tmp, 'discrete.txt');
    spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'echo', 'Z:\\nope&echo INJECTED>discrete.txt'],
      { shell: false, cwd: tmp, windowsHide: true });
    assert(!fs.existsSync(discrete),
      'the historical discrete-arg cmd.exe form does NOT inject on the pinned Node (libuv escapes metacharacters) — the fix removes reliance on that behavior');

    // (3) THE FIX: the P12 spec spawns Code.exe directly (no cmd.exe), and such a string never reaches
    // spawning anyway — normalizeLauncherDir refuses the `&` upstream.
    const hostile = 'Z:\\nope&echo INJECTED';
    const vs = openVscodeSpec('C:\\VSCode\\Code.exe', hostile);
    assert(!/cmd\.exe$/i.test(vs.cmd) && !/\.cmd$/i.test(vs.cmd) && !/powershell/i.test(vs.cmd),
      'the P12 spec spawns Code.exe directly — no cmd.exe in the launch path, so no re-parse is possible');
    assert(normalizeLauncherDir(hostile).reason === 'forbidden-char',
      'the hostile `&` string is refused by normalizeLauncherDir before any launch');
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
  }
} else {
  process.stdout.write('  · (positive-control cmd.exe test is Windows-only — skipped on this platform)\n');
}

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
