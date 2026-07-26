'use strict';
// Run: node app/launcher-ipc.test.js
// Plain Node.js — no framework. Proves the P12 launcher IPC pipeline: an untrusted sender, an
// unauthorized directory, or an unresolvable VS Code executable spawns ZERO child processes; a fully
// valid request spawns exactly one, with the resolved executable and the authorized directory as a
// discrete argv element; and every refusal logs a bounded reason CONSTANT, never the offending path.

const { createLauncherIpc } = require('./launcher-ipc');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const SECRET_DIR = 'D:\\Workspace\\repo-SECRETNAME'; // the "offending path" — must never appear in a refusal
const REAL_DIR = 'D:\\Workspace\\repo';              // what a successful authorize returns
const VS_EXE = 'C:\\U\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe';
const WT_EXE = 'C:\\U\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe';

// Test harness: records launch() calls and refusal log lines. Individual dep overrides let each case
// force one stage to refuse while the others would succeed.
function makeIpc(over) {
  const launched = [];
  const logs = [];
  const ipc = createLauncherIpc({
    assessSender: (over && over.assessSender) || (() => ({ ok: true })),
    authorize: (over && over.authorize) || (() => ({ ok: true, dir: REAL_DIR })),
    resolveVscode: (over && over.resolveVscode) || (() => ({ ok: true, exe: VS_EXE })),
    resolveTerminal: (over && over.resolveTerminal) || (() => WT_EXE),
    launch: (cmd, args) => launched.push({ cmd, args }),
    logRefusal: (line) => logs.push(line),
  });
  return { ipc, launched, logs };
}

// --- constructor validation --------------------------------------------------------------------
{
  let threw = false;
  try { createLauncherIpc({ authorize: () => {}, resolveVscode: () => {}, resolveTerminal: () => {}, launch: () => {} }); }
  catch { threw = true; }
  assert(threw, 'constructor throws when a required dependency (assessSender) is missing');
}

// --- happy path: VS Code spawns exactly one child, Code.exe + discrete dir arg ------------------
{
  const { ipc, launched } = makeIpc();
  ipc.handleOpenVscode({}, SECRET_DIR);
  assert(launched.length === 1, 'valid open-vscode spawns exactly one child');
  assert(launched[0].cmd === VS_EXE, 'open-vscode spawns the resolved Code.exe (never cmd.exe)');
  assert(launched[0].args.length === 1 && launched[0].args[0] === REAL_DIR,
    'open-vscode passes the AUTHORIZED canonical dir as the only, discrete argv element');
}

// --- happy path: Terminal spawns exactly one child, wt + discrete -d dir ------------------------
{
  const { ipc, launched } = makeIpc();
  ipc.handleOpenTerminal({}, SECRET_DIR);
  assert(launched.length === 1, 'valid open-terminal spawns exactly one child');
  assert(/wt\.exe$/i.test(launched[0].cmd), 'open-terminal spawns the resolved wt.exe');
  assert(launched[0].args.join(' ') === `-w 0 nt -d ${REAL_DIR}`, 'open-terminal argv is the expected discrete sequence at the authorized dir');
}

// --- untrusted sender: ZERO children, both launchers ------------------------------------------
for (const method of ['handleOpenVscode', 'handleOpenTerminal']) {
  const { ipc, launched, logs } = makeIpc({ assessSender: () => ({ ok: false, reason: 'untrusted-sender' }) });
  ipc[method]({}, SECRET_DIR);
  assert(launched.length === 0, `${method}: an untrusted sender spawns ZERO child processes`);
  assert(logs.length === 1 && /untrusted-sender/.test(logs[0]), `${method}: the refusal names the reason constant`);
  assert(!logs[0].includes('SECRETNAME'), `${method}: the refusal does NOT echo the offending path`);
}

// --- unauthorized directory: ZERO children, both launchers -------------------------------------
for (const method of ['handleOpenVscode', 'handleOpenTerminal']) {
  const { ipc, launched, logs } = makeIpc({ authorize: () => ({ ok: false, reason: 'not-authorized' }) });
  ipc[method]({}, SECRET_DIR);
  assert(launched.length === 0, `${method}: an unauthorized directory spawns ZERO child processes`);
  assert(logs.length === 1 && /not-authorized/.test(logs[0]) && !logs[0].includes('SECRETNAME'),
    `${method}: refuses with the reason constant only (no path echo)`);
}

// --- VS Code executable not found: ZERO children ------------------------------------------------
{
  const { ipc, launched, logs } = makeIpc({ resolveVscode: () => ({ ok: false, reason: 'vscode-not-found' }) });
  ipc.handleOpenVscode({}, SECRET_DIR);
  assert(launched.length === 0, 'open-vscode with no resolvable Code.exe spawns ZERO child processes');
  assert(logs.length === 1 && /vscode-not-found/.test(logs[0]), 'open-vscode refuses visibly with vscode-not-found');
}

// --- ordering: the sender gate runs BEFORE authorization (a bad sender never triggers authorize) -
{
  let authorizeCalled = false;
  const { ipc, launched } = makeIpc({
    assessSender: () => ({ ok: false, reason: 'no-trusted-window' }),
    authorize: () => { authorizeCalled = true; return { ok: true, dir: REAL_DIR }; },
  });
  ipc.handleOpenVscode({}, SECRET_DIR);
  assert(authorizeCalled === false && launched.length === 0,
    'the trusted-sender gate short-circuits before authorization or any spawn');
}

process.stdout.write(`\nlauncher-ipc: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
