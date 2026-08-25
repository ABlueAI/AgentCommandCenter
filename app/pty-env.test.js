'use strict';
// Run: node app/pty-env.test.js
//
// P1 FENCED-ROLE ENVIRONMENT CONTAINMENT. Exercises the ACTUAL pure builder with poisoned base
// environments, all role/launch classes, explicit pane-status injection, ASCII-case-insensitive
// Windows names, a libuv proxy/negative contrast, and the production node-pty/ConPTY spawn path.
// Source tripwires inspect app/main.js only so their own fixture text cannot satisfy the
// production-wiring assertions.

const assertNode = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const admissionConfig = require('./admission-budget-config');
const {
  FENCED_ENV_ALLOWLIST,
  copyAllowedWindowsEnv,
  buildPtyEnv,
} = require('./pty-env');

const IDENTITY_NAMES = ['USERNAME', 'USERDOMAIN', 'LOGONSERVER'];
const IDENTITY_POISON = Object.freeze({
  USERNAME: 'poison-real-parent-username',
  USERDOMAIN: 'poison-real-parent-domain',
  LOGONSERVER: 'poison-real-parent-logonserver',
});

async function runIdentityProbeChild() {
  const pty = require('@lydell/node-pty');
  const fenced = buildPtyEnv({
    baseEnv: process.env,
    fencedRole: true,
    videoScout: false,
    paneStatusEnv: {},
  });
  const builtIdentity = Object.fromEntries(IDENTITY_NAMES.map((name) => [name,
    Object.prototype.hasOwnProperty.call(fenced, name) ? fenced[name] : null]));
  const libuvChild = spawnSync(process.execPath, ['-e',
    `process.stdout.write(JSON.stringify(Object.fromEntries(${JSON.stringify(IDENTITY_NAMES)}.map((name) => [name, process.env[name] ?? null]))))`,
  ], { env: fenced, encoding: 'utf8', windowsHide: true });
  if (libuvChild.status !== 0) throw new Error(`libuv child failed: ${libuvChild.stderr || libuvChild.status}`);

  const command = [
    "$names = @('USERNAME','USERDOMAIN','LOGONSERVER')",
    "$values = foreach ($name in $names) { [Environment]::GetEnvironmentVariable($name, 'Process') }",
    "[Console]::WriteLine('__P1_IDENTITY__' + ($values -join '|'))",
    'exit',
  ].join('; ');
  const nodePtyIdentity = await new Promise((resolve, reject) => {
    let output = '';
    let settled = false;
    const child = pty.spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: fenced,
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch {}
      reject(new Error('node-pty identity probe timed out'));
    }, 10000);
    child.onData((data) => { output += data; });
    child.onExit(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const marker = '__P1_IDENTITY__';
      const start = output.lastIndexOf(marker);
      if (start < 0) return reject(new Error(`node-pty probe emitted no identity marker: ${JSON.stringify(output)}`));
      const line = output.slice(start + marker.length).split(/\r?\n/, 1)[0]
        .replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, '').trim();
      const values = line.split('|');
      resolve(Object.fromEntries(IDENTITY_NAMES.map((name, index) => [name, values[index] || ''])));
    });
  });

  process.stdout.write(JSON.stringify({
    builtIdentity,
    libuvIdentity: JSON.parse(libuvChild.stdout),
    nodePtyIdentity,
  }));
}

if (process.argv[2] === '--identity-probe-child') {
  runIdentityProbeChild().then(() => process.exit(0)).catch((error) => {
    process.stderr.write(String((error && error.stack) || error));
    process.exit(1);
  });
} else {
let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function deepEqual(actual, expected, label) {
  try { assertNode.deepStrictEqual(actual, expected); assert(true, label); }
  catch { assert(false, label); }
}
function foldedKeys(env) {
  return Object.keys(env || {}).map((name) => name.toUpperCase()).sort();
}
function observedChildEnv(env) {
  const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.env))'], {
    env,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (child.status !== 0) return { ok: false, env: null };
  try { return { ok: true, env: JSON.parse(child.stdout) }; }
  catch { return { ok: false, env: null }; }
}

const FENCED_ROLES = new Set(['web-scout', 'operator', 'source-scout']);
const ALL_ROLES = ['builder', 'reviewer', 'codebase-scout', 'web-scout', 'operator', 'source-scout'];
const isFenced = (opts) => Boolean(!opts.videoScout && opts.role && FENCED_ROLES.has(opts.role));
const PANE_ENV = {
  BLUE_HELM_PANE_STATUS_PIPE: '\\\\.\\pipe\\blue-helm-pane-status-test',
  BLUE_HELM_PANE_STATUS_TOKEN: 'main-issued-token',
};
const POISON = Object.freeze({
  ANTHROPIC_API_KEY: 'poison-anthropic',
  OPENAI_API_KEY: 'poison-openai',
  GEMINI_API_KEY: 'poison-gemini',
  AWS_SECRET_ACCESS_KEY: 'poison-aws',
  AZURE_CLIENT_SECRET: 'poison-azure',
  GITHUB_TOKEN: 'poison-github',
  NPM_TOKEN: 'poison-npm',
  STRIPE_SECRET_KEY: 'poison-stripe',
  STARBOARD_SERVICE_TOKEN: 'poison-business',
  DATABASE_URL: 'poison-database',
  CUSTOM_SECRET: 'poison-generic',
  CHROME_CRASHPAD_PIPE_NAME: 'poison-host-tooling',
  ELECTRON_RUN_AS_NODE: 'poison-electron',
  BLUE_HELM_ADMISSION_ENABLED: 'poison-admission',
  BLUE_HELM_PANE_STATUS_PIPE: 'poison-ambient-pipe',
  BLUE_HELM_PANE_STATUS_TOKEN: 'poison-ambient-token',
});
const BASE_ENV = {
  Path: 'C:\\Windows\\System32;C:\\Tools',
  pathext: '.COM;.EXE;.BAT;.CMD',
  SYSTEMROOT: 'C:\\Windows',
  windir: 'C:\\Windows',
  systemdrive: 'C:',
  ComSpec: 'C:\\Windows\\System32\\cmd.exe',
  USERPROFILE: 'C:\\Users\\blue',
  HOMEDRIVE: 'C:',
  HOMEPATH: '\\Users\\blue',
  APPDATA: 'C:\\Users\\blue\\AppData\\Roaming',
  LOCALAPPDATA: 'C:\\Users\\blue\\AppData\\Local',
  TEMP: 'C:\\Temp',
  TMP: 'C:\\Temp',
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  ProgramW6432: 'C:\\Program Files',
  ProgramData: 'C:\\ProgramData',
  PSModulePath: 'C:\\Modules',
  NUMBER_OF_PROCESSORS: '16',
  PROCESSOR_ARCHITECTURE: 'AMD64',
  OS: 'Windows_NT',
  USERNAME: 'poison-tier2-username',
  USERDOMAIN: 'poison-tier2-domain',
  COMPUTERNAME: 'poison-tier2-computer',
  LOGONSERVER: 'poison-unknown-logonserver',
  NODE_EXTRA_CA_CERTS: 'C:\\host-tooling\\ca.pem',
  CLAUDE_CONFIG_DIR: 'C:\\host-tooling\\claude',
  LANG: 'en_US.UTF-8',
  LC_ALL: 'en_US.UTF-8',
  ...POISON,
};

process.stdout.write('\n-- approved Tier 1 allowlist --\n');
{
  const expected = [
    'PATH', 'PATHEXT', 'SystemRoot', 'windir', 'SystemDrive', 'ComSpec', 'USERPROFILE',
    'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'ProgramFiles',
    'ProgramFiles(x86)', 'ProgramW6432', 'ProgramData', 'PSModulePath',
    'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS',
  ];
  deepEqual(FENCED_ENV_ALLOWLIST, expected, 'the production allowlist is exactly Blue-approved Tier 1, in declared order');
  assert(Object.isFrozen(FENCED_ENV_ALLOWLIST), 'the production allowlist is frozen');
  assert(FENCED_ENV_ALLOWLIST.includes('ProgramFiles(x86)'), 'ProgramFiles(x86) is an explicit positive control');
  for (const name of Object.keys(POISON)) {
    assert(Object.prototype.hasOwnProperty.call(BASE_ENV, name), `poison ${name} genuinely entered the base fixture`);
  }
}

process.stdout.write('\n-- fenced construction --\n');
{
  const env = buildPtyEnv({
    baseEnv: BASE_ENV,
    fencedRole: true,
    videoScout: false,
    geminiKey: 'main-issued-gemini',
    paneStatusEnv: PANE_ENV,
  });
  const expectedAmbient = copyAllowedWindowsEnv(BASE_ENV, FENCED_ENV_ALLOWLIST);
  deepEqual(env, {
    ...expectedAmbient,
    CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
    ...PANE_ENV,
  }, 'a fenced environment is exactly Tier 1 plus explicit scrub and pane-status injection');
  assert(env.Path === BASE_ENV.Path && !Object.prototype.hasOwnProperty.call(env, 'PATH'),
    'PATH matches case-insensitively while preserving the source spelling and exact value');
  assert(env.SYSTEMROOT === BASE_ENV.SYSTEMROOT && !Object.prototype.hasOwnProperty.call(env, 'SystemRoot'),
    'SystemRoot matches case-insensitively while preserving the source spelling and exact value');
  assert(env['ProgramFiles(x86)'] === BASE_ENV['ProgramFiles(x86)'], 'ProgramFiles(x86) survives with its exact value');
  for (const name of Object.keys(POISON)) {
    if (name.startsWith('BLUE_HELM_PANE_STATUS_')) continue;
    assert(!foldedKeys(env).includes(name.toUpperCase()), `fenced output omits poison ${name}`);
  }
  assert(env.BLUE_HELM_PANE_STATUS_PIPE === PANE_ENV.BLUE_HELM_PANE_STATUS_PIPE
    && env.BLUE_HELM_PANE_STATUS_TOKEN === PANE_ENV.BLUE_HELM_PANE_STATUS_TOKEN,
  'main-issued pane-status transport survives and overrides no ambient value');
  assert(!Object.values(env).includes('poison-ambient-pipe') && !Object.values(env).includes('poison-ambient-token'),
    'ambient pane-status lookalike values never survive the fenced allowlist');
  assert(env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB === '1', 'the Claude subprocess scrub is explicitly forced to 1');
  assert(!Object.prototype.hasOwnProperty.call(env, 'GEMINI_API_KEY'), 'a fenced non-Video-Scout pane receives no Gemini key');
  assert(!Object.values(env).some((value) => typeof value === 'string' && value.startsWith('poison-tier2-')),
    'Blue-rejected Tier 2 identity entries are not copied from the ambient fixture');
}

process.stdout.write('\n-- case collisions and unknown omission --\n');
{
  const copied = copyAllowedWindowsEnv({ Path: 'first', PATH: 'second', UnknownThing: 'x' });
  deepEqual(copied, { Path: 'first' }, 'synthetic case-colliding entries are deduplicated deterministically: first insertion wins');
  assert(!Object.prototype.hasOwnProperty.call(copied, 'UnknownThing'), 'an unknown ambient variable is absent by construction');
  deepEqual(copyAllowedWindowsEnv({ 'Oſ': 'evil-os', 'SyſtemRoot': 'evil-sysroot', 'Programﬁles': 'evil-programfiles' }), {},
    'non-ASCII Unicode folds cannot alias allowlisted ASCII names');
  const sparse = buildPtyEnv({ baseEnv: {}, fencedRole: true, videoScout: false, paneStatusEnv: {} });
  deepEqual(sparse, { CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1' }, 'missing allowlisted entries are not invented');
  const sparseUnfenced = buildPtyEnv({ baseEnv: null, fencedRole: false, videoScout: false, paneStatusEnv: {} });
  deepEqual(sparseUnfenced, { CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1' },
    'invalid base input is normalized to an empty object on the unfenced path too');
}

process.stdout.write('\n-- explicit pane-status key boundary --\n');
{
  const env = buildPtyEnv({
    baseEnv: BASE_ENV,
    fencedRole: false,
    videoScout: true,
    geminiKey: 'main-issued-gemini',
    paneStatusEnv: {
      ...PANE_ENV,
      CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '0',
      GEMINI_API_KEY: 'pane-status-collision',
      Path: 'pane-status-path-collision',
      BLUE_HELM_PANE_STATUS_EXTRA: 'unapproved-pane-status-entry',
    },
  });
  assert(env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB === '1',
    'pane-status-shaped input cannot disable the forced Claude subprocess scrub');
  assert(env.GEMINI_API_KEY === 'main-issued-gemini',
    'pane-status-shaped input cannot replace the explicit Video Scout key');
  assert(env.Path === BASE_ENV.Path,
    'pane-status-shaped input cannot replace an ambient operational entry');
  assert(!Object.prototype.hasOwnProperty.call(env, 'BLUE_HELM_PANE_STATUS_EXTRA'),
    'only the two exact pane-status transport names are admitted');
  assert(env.BLUE_HELM_PANE_STATUS_PIPE === PANE_ENV.BLUE_HELM_PANE_STATUS_PIPE
    && env.BLUE_HELM_PANE_STATUS_TOKEN === PANE_ENV.BLUE_HELM_PANE_STATUS_TOKEN,
  'the two exact pane-status transport values still survive');
}

process.stdout.write('\n-- complete role and launch matrix --\n');
for (const role of ALL_ROLES) {
  const opts = { role, videoScout: false };
  const actual = buildPtyEnv({
    baseEnv: BASE_ENV, fencedRole: isFenced(opts), videoScout: false,
    geminiKey: 'main-issued-gemini', paneStatusEnv: PANE_ENV,
  });
  if (FENCED_ROLES.has(role)) {
    assert(!Object.values(actual).includes('poison-anthropic'), `${role} uses the fenced builder path`);
  } else {
    const expected = {
      ...admissionConfig.stripAdmissionEnv(BASE_ENV),
      CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
      ...PANE_ENV,
    };
    deepEqual(actual, expected, `${role} remains deep-equal to the pre-P1 unfenced expression`);
  }
}
{
  const videoOpts = { role: 'web-scout', videoScout: true };
  const video = buildPtyEnv({
    baseEnv: BASE_ENV, fencedRole: isFenced(videoOpts), videoScout: true,
    geminiKey: 'main-issued-gemini', paneStatusEnv: PANE_ENV,
  });
  const videoExpected = {
    ...admissionConfig.stripAdmissionEnv(BASE_ENV),
    CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
    GEMINI_API_KEY: 'main-issued-gemini',
    ...PANE_ENV,
  };
  deepEqual(video, videoExpected, 'Video Scout bypasses the role fence and retains current behavior plus its explicit main-issued key');
  assert(video.GEMINI_API_KEY !== POISON.GEMINI_API_KEY, 'Video Scout receives the safeStorage injection, not ambient Gemini residue');
}
for (const [label, opts] of [
  ['bare CLI', { cli: 'claude', videoScout: false }],
  ['plain PowerShell', { videoScout: false }],
]) {
  const actual = buildPtyEnv({
    baseEnv: BASE_ENV, fencedRole: isFenced(opts), videoScout: false,
    geminiKey: 'main-issued-gemini', paneStatusEnv: PANE_ENV,
  });
  const expected = {
    ...admissionConfig.stripAdmissionEnv(BASE_ENV),
    CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
    ...PANE_ENV,
  };
  deepEqual(actual, expected, `${label} remains deep-equal to the pre-P1 unfenced expression`);
}

process.stdout.write('\n-- libuv proxy, production node-pty inheritance, and negative control --\n');
{
  const fenced = buildPtyEnv({
    baseEnv: { ...process.env, ...BASE_ENV },
    fencedRole: true,
    videoScout: false,
    paneStatusEnv: PANE_ENV,
  });
  const observed = observedChildEnv(fenced);
  assert(observed.ok, 'a libuv proxy child starts with the constructed fenced environment and reports its observed key set');
  if (observed.ok) {
    const builtKeys = foldedKeys(fenced);
    const childKeys = foldedKeys(observed.env);
    const missing = builtKeys.filter((name) => !childKeys.includes(name));
    const added = childKeys.filter((name) => !builtKeys.includes(name));
    deepEqual(missing, [], 'the libuv proxy child observes every key in the constructed environment');
    if (process.platform !== 'win32') deepEqual(added, [], 'a non-Windows libuv child adds no key beyond the constructed environment');
    assert(!Object.values(observed.env).includes('poison-anthropic'), 'the libuv proxy child cannot observe non-required credential poison');
    assert(observed.env.BLUE_HELM_PANE_STATUS_TOKEN === PANE_ENV.BLUE_HELM_PANE_STATUS_TOKEN,
      'the libuv proxy child observes the explicit pane-status token');
  }

  const negativeControlEnv = {
    ...copyAllowedWindowsEnv(BASE_ENV, [...FENCED_ENV_ALLOWLIST, 'ANTHROPIC_API_KEY']),
    CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
  };
  const negativeObserved = observedChildEnv(negativeControlEnv);
  assert(negativeObserved.ok && negativeObserved.env.ANTHROPIC_API_KEY === POISON.ANTHROPIC_API_KEY,
    'NEGATIVE CONTROL: deliberately admitting the poison makes the real-child detector observe it');

  if (process.platform === 'win32') {
    const inheritanceProbe = spawnSync(process.execPath, [__filename, '--identity-probe-child'], {
      env: { ...process.env, ...IDENTITY_POISON },
      cwd: __dirname,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    });
    assert(inheritanceProbe.status === 0,
      'the isolated poisoned-parent inheritance probe completes on Windows');
    let measured = null;
    try { measured = inheritanceProbe.status === 0 ? JSON.parse(inheritanceProbe.stdout) : null; } catch {}
    assert(Boolean(measured), 'the poisoned-parent inheritance probe returns parseable structured evidence');
    if (measured) {
      deepEqual(measured.builtIdentity, { USERNAME: null, USERDOMAIN: null, LOGONSERVER: null },
        'the pure builder omits all three rejected identity variables before either spawn path');
      deepEqual(measured.libuvIdentity, IDENTITY_POISON,
        'libuv back-fills its required identity variables from the real poisoned parent environment');
      deepEqual(measured.nodePtyIdentity, { USERNAME: '', USERDOMAIN: '', LOGONSERVER: '' },
        'the production node-pty/ConPTY path preserves their omission and does not back-fill parent identity values');
    }
  } else {
    assert(true, 'Windows-only parent-inheritance comparison is not applicable on this platform');
  }
}

process.stdout.write('\n-- production main-process wiring --\n');
{
  // Intentionally read main.js only. None of the assertion needles below can match this test file.
  const mainSrc = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const fencedRolesMatch = mainSrc.match(/const FENCED_ROLES = new Set\(\[([^\]]+)\]\);/);
  const mainFencedRoles = fencedRolesMatch
    ? [...fencedRolesMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
    : [];
  deepEqual(mainFencedRoles, [...FENCED_ROLES],
    'the complete-role matrix stays synchronized with main.js FENCED_ROLES');
  const spawnMatches = mainSrc.match(/\bpty\.spawn\(/g) || [];
  assert(spawnMatches.length === 1, 'main.js has exactly one pty.spawn sink');
  assert(mainSrc.includes('const fencedRole = !opts.videoScout && opts.role && FENCED_ROLES.has(opts.role);'),
    'main.js computes the standing fenced-role predicate at the real pty-start boundary');
  assert(mainSrc.includes('const ptyEnv = buildPtyEnv({'), 'main.js obtains ptyEnv from the production builder');
  assert(mainSrc.includes('baseEnv: process.env,'), 'main.js passes the actual ambient process environment into the builder');
  assert(mainSrc.includes('fencedRole,'), 'main.js passes the computed fence decision into the builder');
  assert(mainSrc.includes('videoScout: opts.videoScout,'), 'main.js passes Video Scout identity explicitly into the builder');
  assert(mainSrc.includes('paneStatusEnv,'), 'main.js passes only the enrollment-produced pane-status environment');
  assert(/pty\.spawn\('powershell\.exe',[\s\S]*?env:\s*ptyEnv,/.test(mainSrc),
    'the single real pty.spawn receives the buildPtyEnv output');
  assert(!/JSON\.stringify\(ptyEnv\)|Object\.(?:keys|values|entries)\(ptyEnv\)/.test(mainSrc),
    'main.js never serializes or enumerates the PTY environment into diagnostics');
  const envLogLines = mainSrc.split(/\r?\n/).filter((line) => line.includes('pty-start: env built'));
  assert(envLogLines.length === 1 && !envLogLines[0].includes('process.env') && !envLogLines[0].includes('ptyEnv'),
    'the environment diagnostic is one bounded metadata-only line and contains no environment value expression');
}

process.stdout.write(`\npty-env: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
}
