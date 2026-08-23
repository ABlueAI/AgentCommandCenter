'use strict';
// Run: node app/pane-status/pane-status-resolution.test.js
//
// WHICH EXECUTABLE — advisory-review findings 3 and 7. Two resolutions, deliberately opposite rules.
//
//   3. THE VERSION PROBE must resolve `claude` the way THE PANE does. The pane is
//      `pty.spawn('powershell.exe', ['-NoLogo','-ExecutionPolicy','Bypass','-NoExit', …])`, which loads
//      the user's PowerShell PROFILE. The previous build ran `execFile('claude', ['--version'])` from
//      Electron main, resolving against MAIN'S PATH, and treated that as pane identity. The reviewed
//      prototype's own header records this exact divergence happening on this machine: the pin
//      described `%APPDATA%\npm\claude.cmd` (2.1.196) while the pane ran
//      `C:\Users\levij\.local\bin\claude.exe` (2.1.220). So this resolver must be MAXIMALLY sensitive
//      to the user's environment.
//
//   7. THE LIVENESS RESOLVER must be the exact opposite: a bounded absolute path under the validated
//      system directory. The previous build chose it with
//      `process.env.ComSpec ? 'powershell.exe' : 'powershell.exe'` — a ternary whose branches are
//      identical, so it read an environment variable and then ignored it, handing a BARE NAME to
//      execFile either way. A bare name resolves through PATH.
//
// Nothing here spawns a real PowerShell: the resolver's execFile is injected, and the liveness
// resolver's existence check is injected.

const fs = require('fs');
const path = require('path');
const versionMod = require('./pane-status-version');
const lockMod = require('./pane-status-lock');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function eq(a, b, label) { assert(a === b, a === b ? label : `${label} (got ${JSON.stringify(a)})`); }

const MAIN_SRC = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
// Assertions about what main.js DOES must read main.js's CODE. Its correction comments quote the
// constructs they removed — verbatim, deliberately, so a future reader knows what the fix was — and an
// assertion scanning the raw file would fail on the explanation of its own fix. Whole-line comments
// are dropped; nothing else is touched, so no string literal is disturbed.
const MAIN_CODE = MAIN_SRC.split(/\r?\n/).filter((l) => l.trim().indexOf('//') !== 0).join('\n');

// -------------------------------------------------------------------------------------------------
process.stdout.write('\n3. the version probe mirrors the PANE launch, profile and all\n');
// -------------------------------------------------------------------------------------------------
{
  // The flags the pane really uses, read out of main.js rather than restated here.
  // Anchored on -NoLogo: main.js also builds a -NoProfile argument vector for the LIBRARY boundary,
  // which is a different subsystem with a different rule, and matching that one instead would make
  // this whole comparison meaningless.
  const paneArgs = /const args = (\['-NoLogo'[^\]]*\]);/.exec(MAIN_CODE);
  assert(paneArgs !== null, 'main.js builds the PANE argument vector as a literal we can read');
  const pane = JSON.parse(paneArgs[1].replace(/'/g, '"'));
  eq(JSON.stringify(pane), JSON.stringify(['-NoLogo', '-ExecutionPolicy', 'Bypass', '-NoExit']),
    'the pane launches PowerShell with these flags');

  const probe = versionMod.PS_FLAGS;
  eq(JSON.stringify(probe), JSON.stringify(['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command']),
    'and the probe uses the same ones, swapping -NoExit for -Command so it terminates');
  for (const flag of pane) {
    if (flag === '-NoExit') continue;
    assert(probe.indexOf(flag) !== -1, `the probe carries the pane's ${flag}`);
  }

  // THE FLAG THAT MUST NOT BE THERE.
  assert(probe.indexOf('-NoProfile') === -1,
    '-NoProfile is ABSENT: the pane loads the user profile, so a probe that skipped it could resolve a different claude');
  assert(versionMod.PS_EXE === 'powershell.exe',
    'and the interpreter is the same bare name the pane spawns, so PATH resolution matches too');

  const script = versionMod.buildProbeScript('claude');
  assert(/Get-Command claude/.test(script), 'the script resolves the bare command with Get-Command');
  assert(script.indexOf('$s = $c.Source') !== -1, 'captures the exact resolved source');
  assert(script.indexOf('& $s --version') !== -1, 'and invokes THAT source for --version');
  eq((script.match(/claude/g) || []).length, 1,
    'the bare name appears EXACTLY ONCE — resolution can never drift between the two steps');
  assert(script.indexOf('claude --version') === -1,
    'NEGATIVE CONTROL: the script never invokes the bare name a second time');

  // Command names are validated even though today's caller passes a repo constant.
  let threw = false;
  try { versionMod.buildProbeScript('claude; rm -rf /'); } catch { threw = true; }
  assert(threw, 'an unsafe command name is refused rather than interpolated');
  threw = false;
  try { versionMod.buildProbeScript(''); } catch { threw = true; }
  assert(threw, 'and so is an empty one');
}

// -------------------------------------------------------------------------------------------------
process.stdout.write('\n   installation A on Electron PATH vs installation B in the pane profile\n');
// -------------------------------------------------------------------------------------------------
{
  // The historical defect, as a fixture. Electron main's PATH would resolve A; the pane's PowerShell
  // profile resolves B. The gate must identify B, because B is what the pane actually runs.
  const A = 'C:\\Users\\example\\AppData\\Roaming\\npm\\claude.cmd';   // what execFile('claude') found
  const B = 'C:\\Users\\example\\.local\\bin\\claude.exe';             // what the pane's profile finds

  const calls = [];
  const resolver = versionMod.createClaudeVersionResolver({
    execFile: (file, args, opts, cb) => {
      calls.push({ file, args, opts });
      cb(null, `PANE_STATUS_SOURCE=${B}\nPANE_STATUS_VERSION=2.1.228 (Claude Code)\n`, '');
    },
    env: { PATH: 'C:\\electron\\path' },
    commandName: 'claude',
    log: () => {},
  });

  return resolver.discover().then(async (res) => {
    assert(res.ok === true, 'the probe succeeds');
    eq(res.source, B, 'and it names installation B — the one the PANE resolves');
    eq(res.executable, B, 'exposed to the gate under its own field name too');
    assert(res.source !== A, 'NOT installation A, which is what Electron main\'s own PATH would have found');
    eq(res.version, '2.1.228', 'the version comes from B');

    eq(calls.length, 1, 'exactly one child process is spawned for the whole probe');
    eq(calls[0].file, 'powershell.exe', 'it is PowerShell, not claude directly');
    assert(calls[0].args.indexOf('-NoProfile') === -1, 'launched WITHOUT -NoProfile');
    assert(calls[0].args[0] === '-NoLogo' && calls[0].args[2] === 'Bypass', 'with the pane flags');
    assert(typeof calls[0].opts.timeout === 'number' && calls[0].opts.timeout > 0, 'and a bounded timeout');
    assert(calls[0].opts.windowsHide === true, 'and no window');
    eq(calls[0].opts.env.PATH, 'C:\\electron\\path', 'the injected environment is passed through unaltered');

    // The GATE re-parses independently and gates on exact membership.
    const gate = versionMod.createVersionGate({
      resolveVersion: () => Promise.resolve(res), supportedVersions: ['2.1.228'], log: () => {},
    });
    const probed = await gate.probe();
    assert(probed.supported === true, 'the gate accepts the exact version it was given');
    eq(gate.record().executable, B, 'and its acceptance record names B');

    const narrow = versionMod.createVersionGate({
      resolveVersion: () => Promise.resolve(res), supportedVersions: ['2.1.227'], log: () => {},
    });
    await narrow.probe();
    assert(narrow.supported() === false, 'a NEIGHBOURING patch version is not supported');
    eq(narrow.reason(), versionMod.VERSION_REFUSAL.UNSUPPORTED, 'exact membership only — never a range');

    await failClosed();
  });
}

// -------------------------------------------------------------------------------------------------
async function failClosed() {
  process.stdout.write('\n   every failure mode is fail-closed\n');
  const cases = [
    ['not found', (cb) => cb(null, 'PANE_STATUS_ERROR=CommandNotFoundException\n', ''), 'provider-not-found'],
    ['empty/unusable source', (cb) => cb(null, 'PANE_STATUS_SOURCE=\n', ''), 'provider-unresolved'],
    ['no source line at all', (cb) => cb(null, 'some banner text\n', ''), 'provider-unresolved'],
    ['version command failed after resolution', (cb) => cb(null, 'PANE_STATUS_SOURCE=C:\\x\\claude.exe\nPANE_STATUS_ERROR=NativeCommandError\n', ''), 'version-command-failed'],
    ['no version line', (cb) => cb(null, 'PANE_STATUS_SOURCE=C:\\x\\claude.exe\n', ''), 'version-command-failed'],
    ['unparseable version', (cb) => cb(null, 'PANE_STATUS_SOURCE=C:\\x\\claude.exe\nPANE_STATUS_VERSION=beta build\n', ''), 'version-unparseable'],
    ['nonzero exit', (cb) => cb(Object.assign(new Error('x'), { code: 1 }), '', ''), 'version-probe-failed'],
    ['timeout', (cb) => cb(Object.assign(new Error('x'), { killed: true, signal: 'SIGTERM' }), '', ''), 'version-probe-timeout'],
  ];
  for (const entry of cases) {
    const label = entry[0];
    const emit = entry[1];
    const reason = entry[entry.length - 1];
    const resolver = versionMod.createClaudeVersionResolver({
      execFile: (file, args, opts, cb) => emit(cb), env: {}, commandName: 'claude', log: () => {},
    });
    const r = await resolver.discover();
    assert(r.ok === false, `${label}: the probe fails`);
    eq(r.reason, reason, `${label}: with reason ${reason}`);
    eq(r.version, null, `${label}: and no version at all`);

    const gate = versionMod.createVersionGate({
      resolveVersion: () => Promise.resolve(r), supportedVersions: ['2.1.228'], log: () => {},
    });
    await gate.probe();
    assert(gate.supported() === false, `${label}: the gate says NOT SUPPORTED`);
    assert(gate.reason() !== null, `${label}: with a bounded reason for the badge`);
  }

  // A resolver that THROWS synchronously must still resolve, never reject: a rejected promise on a
  // background discovery would be an invisible failure.
  const thrower = versionMod.createClaudeVersionResolver({
    execFile: () => { throw new Error('spawn exploded'); }, env: {}, commandName: 'claude', log: () => {},
  });
  const t = await thrower.discover();
  assert(t.ok === false, 'a throwing execFile resolves to a refusal');
  eq(t.reason, 'version-probe-failed', 'with a bounded reason');

  // A resolver is REQUIRED — the module will not silently run without one.
  let threw = false;
  try { versionMod.createClaudeVersionResolver({}); } catch { threw = true; }
  assert(threw, 'the resolver refuses to be constructed without an execFile');

  liveness();
}

// -------------------------------------------------------------------------------------------------
function liveness() {
  process.stdout.write('\n7. the liveness resolver is a BOUNDED ABSOLUTE path, never a PATH lookup\n');
  const REAL = process.env.SystemRoot || 'C:\\Windows';
  const expected = path.join(REAL, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

  const ok = lockMod.resolveWindowsPowerShellPath({ SystemRoot: REAL }, () => true);
  assert(ok.ok === true, 'it resolves under the system directory');
  eq(ok.path, expected, 'to the fixed absolute Windows PowerShell path');
  assert(path.isAbsolute(ok.path), 'which is absolute');

  // POISON EVERYTHING the old code read, or could have read.
  const poisoned = {
    SystemRoot: REAL,
    PATH: 'C:\\evil;C:\\also-evil',
    Path: 'C:\\evil',
    PATHEXT: '.EVIL',
    ComSpec: 'C:\\evil\\cmd.exe',
  };
  const still = lockMod.resolveWindowsPowerShellPath(poisoned, () => true);
  eq(still.path, expected, 'a poisoned PATH, Path, PATHEXT and ComSpec change NOTHING');

  // And prove structurally that it cannot be reading them.
  const lockSrc = fs.readFileSync(path.join(__dirname, 'pane-status-lock.js'), 'utf8');
  const resolverSrc = lockSrc.slice(lockSrc.indexOf('function resolveWindowsPowerShellPath'),
    lockSrc.indexOf('function createPaneStatusLock'));
  assert(resolverSrc.length > 0, 'the resolver source was located');
  for (const name of ['ComSpec', 'PATHEXT']) {
    assert(resolverSrc.indexOf('e.' + name) === -1 && resolverSrc.indexOf('env.' + name) === -1,
      `the resolver body never reads ${name}`);
  }
  assert(!/\be\.PATH\b|\benv\.PATH\b|\be\.Path\b/.test(resolverSrc), 'and never reads PATH');

  // The no-op ternary that made the old selection meaningless must be gone from main.js.
  assert(!/ComSpec\s*\?\s*'powershell\.exe'\s*:\s*'powershell\.exe'/.test(MAIN_CODE),
    'main.js no longer contains the identical-branch ternary that made the choice meaningless');
  assert(/resolveWindowsPowerShellPath\(process\.env\)/.test(MAIN_CODE),
    'and main.js resolves the liveness executable through the bounded resolver');

  // MISSING or UNUSABLE -> refusal, which the lock turns into a conservative liveness-unknown.
  eq(lockMod.resolveWindowsPowerShellPath({ SystemRoot: REAL }, () => false).ok, false,
    'an executable that is not there is a REFUSAL');
  eq(lockMod.resolveWindowsPowerShellPath({ SystemRoot: REAL }, () => false).reason,
    lockMod.LOCK_REFUSAL.POWERSHELL_UNRESOLVED, 'with the liveness-resolver-unavailable reason');
  eq(lockMod.resolveWindowsPowerShellPath({ SystemRoot: 'not-absolute' }, () => true).ok, false,
    'a relative SystemRoot is refused rather than joined');
  eq(lockMod.resolveWindowsPowerShellPath({}, () => false).ok, false,
    'and with nothing in the environment at all it still refuses rather than falling back to a bare name');
  eq(lockMod.resolveWindowsPowerShellPath({ SystemRoot: REAL }, () => { throw new Error('EACCES'); }).ok, false,
    'an existence check that throws is a refusal, not an exception');

  // On this machine, the real thing really is there.
  assert(lockMod.resolveWindowsPowerShellPath(process.env).ok === true,
    'and on this machine the bounded absolute executable genuinely exists');

  process.stdout.write(`\npane-status-resolution: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}
