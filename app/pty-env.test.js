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
  omitReservedWindowsEnv,
  buildPtyEnv,
} = require('./pty-env');

const IDENTITY_NAMES = ['USERNAME', 'USERDOMAIN', 'LOGONSERVER'];
const IDENTITY_POISON = Object.freeze({
  USERNAME: 'poison-real-parent-username',
  USERDOMAIN: 'poison-real-parent-domain',
  LOGONSERVER: 'poison-real-parent-logonserver',
});
const UNICODE_RESERVED_POISON = Object.freeze({
  'CLAUDE_CODE_ſUBPROCESS_ENV_SCRUB': 'ambient-unicode-scrub-poison',
  'GEMıNI_API_KEY': 'ambient-unicode-gemini-poison',
  'BLUE_HELM_PANE_STATUS_PıPE': 'ambient-unicode-pipe-poison',
});

function runNodePtyTextProbe(pty, env, marker, payloadLines) {
  const beginMarker = `${marker}_BEGIN`;
  const endMarker = `${marker}_END`;
  const command = [
    `[Console]::WriteLine('${beginMarker}')`,
    ...payloadLines,
    `[Console]::WriteLine('${endMarker}')`,
    'exit',
  ].join('; ');

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = pty.spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {
        name: 'xterm-256color',
        cols: 240,
        rows: 80,
        cwd: process.cwd(),
        env,
      });
    } catch (error) {
      return resolve({ unavailable: true, reason: String((error && (error.code || error.name)) || 'spawn-threw') });
    }

    let output = '';
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill(); } catch {}
      callback();
    };
    const timer = setTimeout(() => finish(() => reject(new Error(`${marker} probe timed out`))), 10000);
    child.onData((data) => { output += data; });
    child.onExit(() => finish(() => {
      const cleaned = output.replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, '');
      const start = cleaned.lastIndexOf(beginMarker);
      if (start < 0) return reject(new Error(`${marker} probe emitted no begin marker: ${JSON.stringify(output)}`));
      const tail = cleaned.slice(start + beginMarker.length);
      const end = tail.indexOf(endMarker);
      if (end < 0) return reject(new Error(`${marker} probe emitted no end marker`));
      resolve({ unavailable: false, payload: tail.slice(0, end) });
    }));
  });
}

function markedValues(output, marker) {
  const values = [];
  let offset = 0;
  while (offset < output.length) {
    const start = output.indexOf(marker, offset);
    if (start < 0) break;
    const valueStart = start + marker.length;
    const lineEnd = output.slice(valueStart).search(/[\r\n]/);
    const end = lineEnd < 0 ? output.length : valueStart + lineEnd;
    values.push(output.slice(valueStart, end).trim());
    offset = end;
  }
  return values;
}

function markedValue(output, marker) {
  const values = markedValues(output, marker);
  return values.length ? values[values.length - 1] : '';
}

async function runIdentityProbeChild() {
  let pty;
  try { pty = require('@lydell/node-pty'); }
  catch (error) {
    process.stdout.write(JSON.stringify({ skipped: true, reason: String((error && (error.code || error.name)) || 'module-unavailable') }));
    return;
  }
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

  const fencedProbe = await runNodePtyTextProbe(pty, fenced, '__P1_FENCED_ENV__', [
    "$names = @([Environment]::GetEnvironmentVariables('Process').Keys | ForEach-Object { [string]$_ } | Sort-Object)",
    "foreach ($name in $names) { [Console]::WriteLine('__P1_NAME__' + $name) }",
    "[Console]::WriteLine('__P1_USERNAME__' + [Environment]::GetEnvironmentVariable('USERNAME', 'Process'))",
    "[Console]::WriteLine('__P1_USERDOMAIN__' + [Environment]::GetEnvironmentVariable('USERDOMAIN', 'Process'))",
    "[Console]::WriteLine('__P1_LOGONSERVER__' + [Environment]::GetEnvironmentVariable('LOGONSERVER', 'Process'))",
  ]);
  if (fencedProbe.unavailable) {
    process.stdout.write(JSON.stringify({ skipped: true, reason: fencedProbe.reason }));
    return;
  }

  const collisionSource = {
    ...process.env,
    claude_code_subprocess_env_scrub: 'ambient-scrub-poison',
    gemini_api_key: 'ambient-gemini-poison',
    Blue_Helm_Pane_Status_Pipe: 'ambient-pipe-poison',
    blue_helm_pane_status_token: 'ambient-token-poison',
    ...UNICODE_RESERVED_POISON,
  };
  const collisionEnv = buildPtyEnv({
    baseEnv: collisionSource,
    fencedRole: false,
    videoScout: true,
    geminiKey: 'sentinel-main-gemini',
    paneStatusEnv: {
      BLUE_HELM_PANE_STATUS_PIPE: 'sentinel-main-pipe',
      BLUE_HELM_PANE_STATUS_TOKEN: 'sentinel-main-token',
    },
  });
  const collisionProbe = await runNodePtyTextProbe(pty, collisionEnv, '__P1_RESERVED_ENV__', [
    "$names = @([Environment]::GetEnvironmentVariables('Process').Keys | ForEach-Object { [string]$_ } | Sort-Object)",
    "foreach ($name in $names) { [Console]::WriteLine('__P1_RESERVED_NAME__' + $name) }",
    "[Console]::WriteLine('__P1_SCRUB__' + [Environment]::GetEnvironmentVariable('CLAUDE_CODE_SUBPROCESS_ENV_SCRUB', 'Process'))",
    "[Console]::WriteLine('__P1_GEMINI__' + [Environment]::GetEnvironmentVariable('GEMINI_API_KEY', 'Process'))",
    "[Console]::WriteLine('__P1_PIPE__' + [Environment]::GetEnvironmentVariable('BLUE_HELM_PANE_STATUS_PIPE', 'Process'))",
    "[Console]::WriteLine('__P1_TOKEN__' + [Environment]::GetEnvironmentVariable('BLUE_HELM_PANE_STATUS_TOKEN', 'Process'))",
  ]);
  if (collisionProbe.unavailable) {
    process.stdout.write(JSON.stringify({ skipped: true, reason: collisionProbe.reason }));
    return;
  }

  process.stdout.write(JSON.stringify({
    builtIdentity,
    libuvIdentity: JSON.parse(libuvChild.stdout),
    fencedBuiltNames: Object.keys(fenced).sort(),
    fencedTier1Names: Object.keys(copyAllowedWindowsEnv(process.env, FENCED_ENV_ALLOWLIST)).sort(),
    nodePtyFenced: {
      names: markedValues(fencedProbe.payload, '__P1_NAME__'),
      username: markedValue(fencedProbe.payload, '__P1_USERNAME__'),
      userdomain: markedValue(fencedProbe.payload, '__P1_USERDOMAIN__'),
      logonserver: markedValue(fencedProbe.payload, '__P1_LOGONSERVER__'),
    },
    collisionSourceUnicodePoisonPresent: Object.keys(UNICODE_RESERVED_POISON)
      .every((name) => Object.prototype.hasOwnProperty.call(collisionSource, name)),
    collisionBuiltNames: Object.keys(collisionEnv).sort(),
    nodePtyCollision: {
      names: markedValues(collisionProbe.payload, '__P1_RESERVED_NAME__'),
      scrub: markedValue(collisionProbe.payload, '__P1_SCRUB__'),
      gemini: markedValue(collisionProbe.payload, '__P1_GEMINI__'),
      pipe: markedValue(collisionProbe.payload, '__P1_PIPE__'),
      token: markedValue(collisionProbe.payload, '__P1_TOKEN__'),
    },
  }));
}

if (process.argv[2] === '--identity-probe-child') {
  runIdentityProbeChild().then(() => process.exit(0)).catch((error) => {
    process.stderr.write(String((error && error.stack) || error));
    process.exit(1);
  });
} else {
let passed = 0, failed = 0, skipped = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function skip(label) {
  process.stdout.write(`  - SKIP: ${label}\n`);
  skipped++;
}
function deepEqual(actual, expected, label) {
  try { assertNode.deepStrictEqual(actual, expected); assert(true, label); }
  catch { assert(false, label); }
}
function foldedKeys(env) {
  return Object.keys(env || {}).map((name) => name.replace(/[a-z]/g, (ch) => ch.toUpperCase())).sort();
}
function foldAscii(name) {
  return typeof name === 'string' && /^[\x20-\x7E]+$/.test(name)
    ? name.replace(/[a-z]/g, (ch) => ch.toUpperCase())
    : null;
}
function countFoldedName(envOrNames, expectedName) {
  const names = Array.isArray(envOrNames) ? envOrNames : Object.keys(envOrNames || {});
  const expected = foldAscii(expectedName);
  return names.filter((name) => foldAscii(name) === expected).length;
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
const ALWAYS_RESERVED_ENV_NAMES = [
  'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB',
  'BLUE_HELM_PANE_STATUS_PIPE',
  'BLUE_HELM_PANE_STATUS_TOKEN',
];
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
  claude_code_subprocess_env_scrub: 'ambient-scrub-poison',
  gemini_api_key: 'ambient-case-gemini-poison',
  Blue_Helm_Pane_Status_Pipe: 'ambient-case-pipe-poison',
  blue_helm_pane_status_token: 'ambient-case-token-poison',
  ...UNICODE_RESERVED_POISON,
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
  for (const name of Object.keys(UNICODE_RESERVED_POISON)) {
    assert(Object.prototype.hasOwnProperty.call(BASE_ENV, name),
      `Unicode reserved-alias poison ${name} genuinely entered the base fixture`);
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
  const reservedSource = {
    Path: 'first-path',
    PATH: 'second-path',
    claude_code_subprocess_env_scrub: 'ambient-scrub',
    Blue_Helm_Pane_Status_Token: 'ambient-token',
    ...UNICODE_RESERVED_POISON,
  };
  deepEqual(omitReservedWindowsEnv(reservedSource, [
    'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB', 'GEMINI_API_KEY',
    'BLUE_HELM_PANE_STATUS_PIPE', 'BLUE_HELM_PANE_STATUS_TOKEN',
  ]), { Path: 'first-path', PATH: 'second-path' },
  'reserved removal deletes ASCII-case and Unicode-to-ASCII aliases while preserving unrelated duplicates and order');
  deepEqual(reservedSource, {
    Path: 'first-path',
    PATH: 'second-path',
    claude_code_subprocess_env_scrub: 'ambient-scrub',
    Blue_Helm_Pane_Status_Token: 'ambient-token',
    ...UNICODE_RESERVED_POISON,
  }, 'reserved removal returns a fresh object without mutating its input');
  const unrelatedUnicode = { 'BLUE_HELM_💙': 'unrelated-unicode' };
  deepEqual(omitReservedWindowsEnv(unrelatedUnicode, ALWAYS_RESERVED_ENV_NAMES), unrelatedUnicode,
    'the denylist-only Unicode fallback preserves an unrelated ambient Unicode name');
  const sparse = buildPtyEnv({ baseEnv: {}, fencedRole: true, videoScout: false, paneStatusEnv: {} });
  deepEqual(sparse, { CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1' }, 'missing allowlisted entries are not invented');
  const sparseUnfenced = buildPtyEnv({ baseEnv: null, fencedRole: false, videoScout: false, paneStatusEnv: {} });
  deepEqual(sparseUnfenced, { CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1' },
    'invalid base input is normalized to an empty object on the unfenced path too');
}

process.stdout.write('\n-- process environment immutability --\n');
{
  const before = JSON.stringify(Object.entries(process.env));
  buildPtyEnv({
    baseEnv: process.env,
    fencedRole: false,
    videoScout: true,
    geminiKey: 'sentinel-main-gemini',
    paneStatusEnv: PANE_ENV,
  });
  const after = JSON.stringify(Object.entries(process.env));
  assert(after === before, 'buildPtyEnv leaves process.env byte-identical, including key order and values');
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
  for (const name of [
    'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB', 'GEMINI_API_KEY',
    'BLUE_HELM_PANE_STATUS_PIPE', 'BLUE_HELM_PANE_STATUS_TOKEN',
  ]) {
    assert(countFoldedName(env, name) === 1,
      `the unfenced Video Scout environment contains exactly one Windows-equivalent ${name}`);
  }
  for (const poison of [
    'ambient-scrub-poison', 'ambient-case-gemini-poison',
    'ambient-case-pipe-poison', 'ambient-case-token-poison',
    ...Object.values(UNICODE_RESERVED_POISON),
  ]) {
    assert(!Object.values(env).includes(poison), `reserved ambient poison ${poison} is absent`);
  }
}

process.stdout.write('\n-- fail-closed Video Scout key reservation --\n');
for (const badKey of [undefined, null, '', 0]) {
  const env = buildPtyEnv({
    baseEnv: {
      GEMINI_API_KEY: 'ambient-upper',
      gemini_api_key: 'ambient-lower',
      GEMıNI_API_KEY: 'ambient-unicode',
    },
    fencedRole: false,
    videoScout: true,
    geminiKey: badKey,
    paneStatusEnv: {},
  });
  assert(countFoldedName(env, 'GEMINI_API_KEY') === 0,
    `Video Scout reserves and omits Gemini when the main-issued key is ${JSON.stringify(badKey)}`);
}
{
  const ordinary = buildPtyEnv({
    baseEnv: { gemini_api_key: 'deliberate-pre-existing-ambient' },
    fencedRole: false,
    videoScout: false,
    paneStatusEnv: {},
  });
  assert(ordinary.gemini_api_key === 'deliberate-pre-existing-ambient',
    'non-Video-Scout unfenced panes deliberately retain ambient Gemini residue as pre-existing behavior');
}
{
  const unenrolled = buildPtyEnv({
    baseEnv: {
      Blue_Helm_Pane_Status_Pipe: 'ambient-unenrolled-pipe',
      blue_helm_pane_status_token: 'ambient-unenrolled-token',
      BLUE_HELM_PANE_STATUS_PıPE: 'ambient-unenrolled-unicode-pipe',
    },
    fencedRole: false,
    videoScout: false,
    paneStatusEnv: {},
  });
  assert(countFoldedName(unenrolled, 'BLUE_HELM_PANE_STATUS_PIPE') === 0
    && countFoldedName(unenrolled, 'BLUE_HELM_PANE_STATUS_TOKEN') === 0,
  'pane-status transport names are reserved and absent when enrollment contributes no values');
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
    // Revision 3 deliberately narrows the old deep-equality claim: the unfenced base is otherwise
    // unchanged, but every Windows-equivalent spelling of a main-owned name is now removed first.
    const expected = {
      ...omitReservedWindowsEnv(admissionConfig.stripAdmissionEnv(BASE_ENV), ALWAYS_RESERVED_ENV_NAMES),
      CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
      ...PANE_ENV,
    };
    deepEqual(actual, expected, `${role} preserves unfenced ambient behavior except reserved main-owned names`);
  }
}
{
  const videoOpts = { role: 'web-scout', videoScout: true };
  const video = buildPtyEnv({
    baseEnv: BASE_ENV, fencedRole: isFenced(videoOpts), videoScout: true,
    geminiKey: 'main-issued-gemini', paneStatusEnv: PANE_ENV,
  });
  const videoExpected = {
    ...omitReservedWindowsEnv(admissionConfig.stripAdmissionEnv(BASE_ENV), [
      ...ALWAYS_RESERVED_ENV_NAMES, 'GEMINI_API_KEY',
    ]),
    CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
    GEMINI_API_KEY: 'main-issued-gemini',
    ...PANE_ENV,
  };
  deepEqual(video, videoExpected,
    'Video Scout bypasses the role fence while reserving every main-owned name before explicit injection');
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
    ...omitReservedWindowsEnv(admissionConfig.stripAdmissionEnv(BASE_ENV), ALWAYS_RESERVED_ENV_NAMES),
    CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
    ...PANE_ENV,
  };
  deepEqual(actual, expected, `${label} preserves unfenced ambient behavior except reserved main-owned names`);
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
    let measured = null;
    try { measured = inheritanceProbe.status === 0 ? JSON.parse(inheritanceProbe.stdout) : null; } catch {}
    if (inheritanceProbe.status !== 0) {
      assert(false, `the production node-pty probe completes (status ${inheritanceProbe.status})`);
    } else if (!measured) {
      assert(false, 'the production node-pty probe returns parseable structured evidence');
    } else if (measured.skipped) {
      skip(`production node-pty/ConPTY unavailable (${measured.reason})`);
    } else {
      deepEqual(measured.builtIdentity, { USERNAME: null, USERDOMAIN: null, LOGONSERVER: null },
        'the pure builder omits all three rejected identity variables before either spawn path');
      deepEqual(measured.libuvIdentity, IDENTITY_POISON,
        'libuv back-fills its required identity variables from the real poisoned parent environment');
      deepEqual({
        USERNAME: measured.nodePtyFenced.username || '',
        USERDOMAIN: measured.nodePtyFenced.userdomain || '',
        LOGONSERVER: measured.nodePtyFenced.logonserver || '',
      }, { USERNAME: '', USERDOMAIN: '', LOGONSERVER: '' },
        'the production node-pty/ConPTY path preserves their omission and does not back-fill parent identity values');

      const observedNames = Array.isArray(measured.nodePtyFenced.names) ? measured.nodePtyFenced.names : [];
      const observedTier1Names = observedNames.filter((name) =>
        foldAscii(name) !== foldAscii('CLAUDE_CODE_SUBPROCESS_ENV_SCRUB'));
      const builtTier1Folded = measured.fencedTier1Names.map(foldAscii).filter(Boolean).sort();
      const observedTier1Folded = observedTier1Names.map(foldAscii).filter(Boolean).sort();
      const added = observedTier1Folded.filter((name) => !builtTier1Folded.includes(name));
      const missing = builtTier1Folded.filter((name) => !observedTier1Folded.includes(name));
      process.stdout.write(`  MEASURED fenced node-pty names only: ${JSON.stringify(observedNames)}\n`);
      process.stdout.write(`  MEASURED fenced Tier-1 delta: added=${JSON.stringify(added)} missing=${JSON.stringify(missing)}\n`);
      deepEqual(added, [], 'node-pty/ConPTY adds no ambient name beyond the constructed Tier 1 set');
      deepEqual(missing, [], 'node-pty/ConPTY preserves every constructed Tier 1 name');
      assert(countFoldedName(observedNames, 'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB') === 1,
        'the fenced production child observes exactly one main-issued scrub name');

      const collision = measured.nodePtyCollision;
      assert(measured.collisionSourceUnicodePoisonPresent === true,
        'the production collision probe genuinely supplied every Unicode-to-ASCII reserved alias');
      for (const name of Object.keys(UNICODE_RESERVED_POISON)) {
        assert(!measured.collisionBuiltNames.includes(name) && !collision.names.includes(name),
          `Unicode reserved alias ${name} is absent before and after production node-pty`);
      }
      assert(collision.scrub === '1' && collision.scrub !== 'ambient-scrub-poison',
        'production node-pty observes the forced scrub sentinel and not ambient case poison');
      assert(collision.gemini === 'sentinel-main-gemini' && collision.gemini !== 'ambient-gemini-poison',
        'production node-pty observes the main-issued Gemini sentinel and not ambient case poison');
      assert(collision.pipe === 'sentinel-main-pipe' && collision.pipe !== 'ambient-pipe-poison',
        'production node-pty observes the main-issued pane-status pipe sentinel and not ambient case poison');
      assert(collision.token === 'sentinel-main-token' && collision.token !== 'ambient-token-poison',
        'production node-pty observes the main-issued pane-status token sentinel and not ambient case poison');
      for (const name of [
        'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB', 'GEMINI_API_KEY',
        'BLUE_HELM_PANE_STATUS_PIPE', 'BLUE_HELM_PANE_STATUS_TOKEN',
      ]) {
        assert(countFoldedName(measured.collisionBuiltNames, name) === 1
          && countFoldedName(collision.names, name) === 1,
        `builder and production child each contain one Windows-equivalent ${name}`);
      }
    }
  } else {
    skip('Windows-only production node-pty/ConPTY measurement is not applicable on this platform');
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

process.stdout.write(`\npty-env: ${passed} passed, ${failed} failed, ${skipped} skipped\n`);
process.exit(failed ? 1 : 0);
}
