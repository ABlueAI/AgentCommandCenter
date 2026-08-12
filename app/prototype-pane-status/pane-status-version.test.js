'use strict';
// Run: node app/prototype-pane-status/pane-status-version.test.js
//
// EXPERIMENT A — PROTOTYPE ONLY. docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: PROTOTYPE
//
// REVISION 2 suite. Revision 1 had no version discovery at all, and the version it hard-coded came
// from a DIFFERENT Claude installation than the one `app/main.js` launches. These assertions pin the
// two properties that failure taught us to require:
//
//   1. The version check and the pane launch must name the SAME resolved executable.
//   2. Every failure mode must produce a null version — never an assumed-compatible one.

const path = require('path');
const version = require('./pane-status-version');
const protocol = require('./pane-status-protocol');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function eq(a, b, label) { assert(a === b, `${label} (got ${JSON.stringify(a)})`); }

// ---------------------------------------------------------------- the probe mirrors the pane launch
process.stdout.write('\n-- the probe uses the pane\'s own resolution environment --\n');
{
  // app/main.js spawns: powershell.exe -NoLogo -ExecutionPolicy Bypass -NoExit -Command <run>
  // The probe must mirror those flags minus -NoExit, or it is resolving in a different world.
  eq(version.PS_EXE, 'powershell.exe', 'the probe runs through powershell.exe, like the pane');
  const flags = version.PS_FLAGS.join(' ');
  assert(flags.indexOf('-ExecutionPolicy Bypass') !== -1,
    'the probe passes -ExecutionPolicy Bypass so npm .ps1 shims resolve exactly as they do for a pane');
  assert(version.PS_FLAGS.indexOf('-NoExit') === -1, 'the probe does NOT pass -NoExit (it must terminate)');
  // -NoProfile would be a DIFFERENT resolution world: a profile can prepend to PATH or define a
  // `claude` function/alias that wins over any file on disk. The pane loads the profile, so we must.
  assert(version.PS_FLAGS.indexOf('-NoProfile') === -1,
    'the probe does NOT pass -NoProfile — the pane loads Blue\'s profile, so resolution must too');

  const script = version.buildProbeScript('claude');
  assert(script.indexOf('Get-Command claude') !== -1, 'it resolves the same BARE command name the pane launches');
  assert(script.indexOf('$c.Source') !== -1, 'it reports the path PowerShell actually chose');
  assert(script.indexOf('& $s --version') !== -1,
    'it invokes THAT RESOLVED PATH for the version, never the bare name a second time');
  assert(script.indexOf('AppData') === -1 && script.indexOf('npm') === -1 && script.indexOf('.local') === -1,
    'the probe hard-codes NO installation path (the revision-1 defect)');

  let threw = false;
  try { version.buildProbeScript('claude; rm -rf /'); } catch { threw = true; }
  assert(threw, 'an unsafe command name is refused rather than interpolated');
  threw = false;
  try { version.buildProbeScript(''); } catch { threw = true; }
  assert(threw, 'an empty command name is refused');
}

// ---------------------------------------------------------------- multiple candidates
process.stdout.write('\n-- multiple claude candidates: the FIRST launch-resolved one wins --\n');
{
  // The review machine had four `claude` candidates. PowerShell resolves ONE, and that is the one
  // the pane runs. We simulate the resolver returning each, and assert we report what it chose —
  // never a different installation's metadata.
  const CANDIDATES = [
    { source: 'C:\\Users\\levij\\.local\\bin\\claude.exe', version: '2.1.220' },
    { source: 'C:\\Users\\levij\\AppData\\Roaming\\npm\\claude.ps1', version: '2.1.196' },
    { source: 'C:\\Users\\levij\\AppData\\Roaming\\npm\\claude.cmd', version: '2.1.196' },
  ];
  for (const c of CANDIDATES) {
    const out = `${version.SOURCE_TAG}${c.source}\n${version.VERSION_TAG}${c.version} (Claude Code)\n`;
    const got = version.interpretProbe({ stdout: out });
    assert(got.ok, `resolves when PowerShell picks ${path.basename(c.source)}`);
    eq(got.source, c.source, '  and reports the exact path PowerShell chose');
    eq(got.version, c.version, '  and the version read from THAT executable');
  }

  // The decisive one: the first-resolved candidate is 2.1.220 while a DIFFERENT installation on the
  // same machine is 2.1.196. The resolver must report 2.1.220 — reporting 2.1.196 was the defect.
  const firstResolved = version.interpretProbe({
    stdout: `${version.SOURCE_TAG}C:\\Users\\levij\\.local\\bin\\claude.exe\n${version.VERSION_TAG}2.1.220 (Claude Code)\n`,
  });
  eq(firstResolved.version, '2.1.220', 'the first launch-resolved executable supplies the observed version');
  assert(firstResolved.source.indexOf('npm') === -1,
    'and it is NOT taken from the npm shim just because that installation also exists');

  // Profile banners / update notices around our tagged lines must not shift the answer.
  const noisy = version.interpretProbe({
    stdout: `Windows PowerShell\nCopyright (C) Microsoft.\n\n${version.SOURCE_TAG}C:\\x\\claude.exe\nA new version 9.9.9 is available!\n${version.VERSION_TAG}2.1.220 (Claude Code)\n`,
  });
  eq(noisy.version, '2.1.220', 'a banner or an update notice mentioning another version does not win');
}

// ---------------------------------------------------------------- fail closed, always
process.stdout.write('\n-- every failure mode yields a NULL version, never an assumed one --\n');
{
  const cases = [
    ['timeout', { timedOut: true }, 'version-probe-timeout'],
    ['spawn error', { error: new Error('nope') }, 'version-probe-failed'],
    ['provider missing', { stdout: `${version.ERROR_TAG}CommandNotFoundException\n` }, 'provider-not-found'],
    ['empty source', { stdout: `${version.SOURCE_TAG}\n` }, 'provider-unresolved'],
    ['no output at all', { stdout: '' }, 'provider-unresolved'],
    ['version command failed', { stdout: `${version.SOURCE_TAG}C:\\x\\claude.exe\n` }, 'version-command-failed'],
    ['unparsable version', { stdout: `${version.SOURCE_TAG}C:\\x\\claude.exe\n${version.VERSION_TAG}not a version\n` }, 'version-unparsable'],
  ];
  for (const [label, probe, reason] of cases) {
    const got = version.interpretProbe(probe);
    assert(got.ok === false, `${label} refuses`);
    eq(got.version, null, `  ${label} yields a null version`);
    eq(got.reason, reason, `  ${label} carries its bounded reason`);
  }

  // ---- Low finding 3 (revision 3): resolution success vs resolution failure are DIFFERENT reasons.
  //
  // The probe prints SOURCE_TAG the moment `Get-Command` succeeds, then runs `& $s --version`. Under
  // `$ErrorActionPreference = "Stop"`, a native command writing to stderr raises a terminating
  // NativeCommandError in Windows PowerShell 5.1, so the catch can fire AFTER the source line was
  // printed. Revision 2 checked ERROR_TAG first and called that `provider-not-found` with a null
  // source — naming the wrong cause for a provider that was found. Both paths still fail closed.
  {
    const resolvedButVersionThrew = version.interpretProbe({
      stdout: `${version.SOURCE_TAG}C:\\Users\\levij\\.local\\bin\\claude.exe\n${version.ERROR_TAG}NativeCommandError\n`,
    });
    eq(resolvedButVersionThrew.ok, false, 'a resolved provider whose --version THREW still refuses');
    eq(resolvedButVersionThrew.reason, 'version-command-failed',
      '  and reports version-command-failed, NOT provider-not-found');
    eq(resolvedButVersionThrew.source, 'C:\\Users\\levij\\.local\\bin\\claude.exe',
      '  and PRESERVES the resolved source, so the operator is told which executable failed');
    eq(resolvedButVersionThrew.version, null, '  while still yielding a null version (fail-closed)');

    const neverResolved = version.interpretProbe({
      stdout: `${version.ERROR_TAG}CommandNotFoundException\n`,
    });
    eq(neverResolved.reason, 'provider-not-found',
      'provider-not-found is RESERVED for an actual resolution failure');
    eq(neverResolved.source, null, '  which genuinely has no source to report');
  }

  // The null must actually degrade the badge — this is the join between this module and the store.
  assert(!protocol.isVersionSupported(null), 'a null version is NOT supported (badge degrades to unknown)');
  assert(!protocol.isVersionSupported(''), 'an empty version is NOT supported');
}

// ---------------------------------------------------------------- the pinned list is EXACT, not a range
process.stdout.write('\n-- the supported list is a closed set of exact strings, never a semver range --\n');
{
  // REVISION 3. `2.1.220` — the executable a Blue Helm pane actually resolves and launches — was
  // added PROVISIONALLY alongside the already-evidenced npm `2.1.196`, and only because the final
  // authorized run exercises that exact binary through the real Electron path. Two entries must not
  // become "the 2.1.x line works": § 7.5 of the procurement record records that provider surfaces
  // drift by REMOVAL as well as addition, so every version has to be exercised on its own merits.
  eq(protocol.SUPPORTED_CLAUDE_VERSIONS.length, 2, 'the list holds exactly two exercised versions');
  assert(protocol.isVersionSupported('2.1.196'),
    'npm 2.1.196 (revision-1 live probe run) is accepted');
  assert(protocol.isVersionSupported('2.1.220'),
    'the app-resolved .local\\bin\\claude.exe 2.1.220 is accepted');

  // NEIGHBOURS ON BOTH SIDES AND BETWEEN THE TWO ENTRIES ARE ALL REFUSED. This is the assertion that
  // proves no range behaviour exists: 2.1.200 sits BETWEEN the two supported versions and is still
  // refused, which a semver range could not do.
  for (const near of ['2.1.195', '2.1.197', '2.1.200', '2.1.219', '2.1.221', '2.1.2200', '2.2.196', '3.1.220']) {
    assert(!protocol.isVersionSupported(near),
      `a NEARBY version (${near}) is refused — the check is exact-match, not a range`);
  }
  assert(!protocol.isVersionSupported('2.1.200'),
    'a version BETWEEN the two supported entries is refused, so the pair is not an interval');

  // Malformed, padded, and shape-confusable inputs are refused rather than coerced.
  for (const bad of ['', ' 2.1.220', '2.1.220 ', 'v2.1.220', '2.1.220 (Claude Code)', '2.1', '2.1.220.1',
                     '2.1.220-beta.1', 'latest', '*', '>=2.1.196', '2.1.196,2.1.220']) {
    assert(!protocol.isVersionSupported(bad),
      `a malformed or range-shaped version (${JSON.stringify(bad)}) is refused`);
  }
  for (const wrongType of [null, undefined, 2.1, {}, [], ['2.1.220'], true]) {
    assert(!protocol.isVersionSupported(wrongType),
      `a non-string version (${JSON.stringify(wrongType)}) is refused`);
  }

  // The list is frozen, so no caller can widen it at runtime.
  assert(Object.isFrozen(protocol.SUPPORTED_CLAUDE_VERSIONS), 'the pinned list is frozen');
  let mutated = false;
  try { protocol.SUPPORTED_CLAUDE_VERSIONS.push('9.9.9'); mutated = true; } catch { mutated = false; }
  assert(!protocol.isVersionSupported('9.9.9'),
    'and a push against it cannot introduce a supported version' + (mutated ? '' : ' (throws in strict mode)'));
}

// ---------------------------------------------------------------- version string parsing
process.stdout.write('\n-- version parsing --\n');
{
  eq(version.parseVersion('2.1.196 (Claude Code)'), '2.1.196', 'parses the documented output shape');
  eq(version.parseVersion('  2.1.220 (Claude Code)\r'), '2.1.220', 'tolerates surrounding whitespace and CR');
  eq(version.parseVersion('v2.1.220'), '2.1.220', 'tolerates a leading v');
  eq(version.parseVersion('2.1.220-beta.1 (Claude Code)'), '2.1.220-beta.1', 'keeps a prerelease suffix');
  eq(version.parseVersion('Claude Code 2.1.220'), null, 'refuses when the version is not at the start');
  eq(version.parseVersion('2.1'), null, 'refuses a two-component version');
  eq(version.parseVersion(''), null, 'refuses empty');
  eq(version.parseVersion(null), null, 'refuses non-strings');
}

// ---------------------------------------------------------------- the resolver never rejects
process.stdout.write('\n-- discover() surfaces failure as a resolved refusal, never a rejection --\n');
(async () => {
  {
    const calls = [];
    const r = version.createClaudeVersionResolver({
      execFile: (file, args, opts, cb) => {
        calls.push({ file, args, opts });
        cb(null, `${version.SOURCE_TAG}C:\\x\\claude.exe\n${version.VERSION_TAG}2.1.196 (Claude Code)\n`);
      },
      env: { PATH: 'C:\\x', PATHEXT: '.COM;.EXE;.CMD' },
      commandName: 'claude',
    });
    const got = await r.discover();
    assert(got.ok && got.version === '2.1.196', 'a successful probe resolves with the version');
    eq(calls.length, 1, 'exactly one probe is run');
    eq(calls[0].file, 'powershell.exe', 'through powershell.exe');
    // THE binding assertion: the probe inherits the environment the PANE will be launched with, so
    // PATH/PATHEXT ordering is identical. A probe with a different PATH resolves a different file.
    eq(calls[0].opts.env.PATH, 'C:\\x', 'with the PANE\'s PATH, so resolution order is identical');
    eq(calls[0].opts.env.PATHEXT, '.COM;.EXE;.CMD', 'and the PANE\'s PATHEXT');
    assert(typeof calls[0].opts.timeout === 'number' && calls[0].opts.timeout > 0, 'and a bounded timeout');
  }
  {
    const r = version.createClaudeVersionResolver({
      execFile: (file, args, opts, cb) => cb(Object.assign(new Error('killed'), { killed: true })),
      env: {},
    });
    const got = await r.discover();
    eq(got.ok, false, 'a killed probe resolves as a refusal');
    eq(got.version, null, 'with a null version');
  }
  {
    const r = version.createClaudeVersionResolver({
      execFile: () => { throw new Error('execFile blew up'); },
      env: {},
    });
    const got = await r.discover();
    eq(got.ok, false, 'a throwing execFile does not escape discover()');
    eq(got.reason, 'version-probe-failed', 'and carries a bounded reason');
  }
  {
    const logs = [];
    const r = version.createClaudeVersionResolver({
      execFile: (f, a, o, cb) => cb(null, `${version.SOURCE_TAG}C:\\x\\claude.exe\n${version.VERSION_TAG}2.1.196 (Claude Code)\n`),
      env: {}, log: (l) => logs.push(l),
    });
    await r.discover();
    assert(logs.length >= 1, 'the outcome is logged (visible, per the repo rule)');
    assert(logs.join('|').indexOf('2.1.196') !== -1, 'and names the version it established');
  }
  {
    const logs = [];
    const r = version.createClaudeVersionResolver({
      execFile: (f, a, o, cb) => cb(null, ''), env: {}, log: (l) => logs.push(l),
    });
    await r.discover();
    assert(logs.join('|').indexOf('NOT established') !== -1,
      'a failure REFUSES VISIBLY rather than passing silently');
  }

  process.stdout.write(`\npane-status-version: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  process.stderr.write(`\nUNCAUGHT: ${e && e.message}\n`);
  process.exit(1);
});
