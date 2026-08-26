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
const RESERVED_CANONICAL_NAMES = Object.freeze([
  'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB',
  'BLUE_HELM_PANE_STATUS_PIPE',
  'BLUE_HELM_PANE_STATUS_TOKEN',
  'GEMINI_API_KEY',
]);
const PLATFORM_ALIAS_CODE_POINTS = Object.freeze([
  0x00DF, // sharp-s
  0x0131, // dotless-i
  0x017F, // long-s
  0xFB01, // fi ligature
  0xFB05, // long-s+t ligature
  0xFB06, // s+t ligature
  0x212A, // Kelvin sign
  0x1E9E, // capital sharp-s
]);
const CHILD_PROBE_TIMEOUT_MS = 10000;

// Independent test oracle for the production helper's documented conservative relation. Generate
// the whole Unicode corpus rather than adding only the spellings a reviewer happened to name.
function foldConservativeNameForTest(name) {
  if (typeof name !== 'string') return null;
  const folded = name.normalize('NFKC').toLowerCase().toUpperCase();
  return /^[\x20-\x7E]+$/.test(folded) ? folded : null;
}

function generateReservedAliasCorpus() {
  const aliases = new Map();
  for (let codePoint = 0x80; codePoint <= 0x10FFFF; codePoint++) {
    if (codePoint >= 0xD800 && codePoint <= 0xDFFF) continue;
    const character = String.fromCodePoint(codePoint);
    const foldedCharacter = foldConservativeNameForTest(character);
    if (!foldedCharacter) continue;
    for (const canonical of RESERVED_CANONICAL_NAMES) {
      let offset = canonical.indexOf(foldedCharacter);
      while (offset >= 0) {
        const alias = canonical.slice(0, offset) + character + canonical.slice(offset + foldedCharacter.length);
        if (!aliases.has(alias)) {
          aliases.set(alias, Object.freeze({ alias, canonical, codePoint, foldedCharacter, offset }));
        }
        offset = canonical.indexOf(foldedCharacter, offset + 1);
      }
    }
  }
  return Object.freeze([...aliases.values()]);
}

const GENERATED_RESERVED_ALIAS_CORPUS = generateReservedAliasCorpus();
const PLATFORM_ALIAS_CODE_POINT_SET = new Set(PLATFORM_ALIAS_CODE_POINTS);
const EXPECTED_REPRESENTATIVE_CODE_POINTS = Object.freeze(PLATFORM_ALIAS_CODE_POINTS.filter((codePoint) => {
  const foldedCharacter = foldConservativeNameForTest(String.fromCodePoint(codePoint));
  return foldedCharacter && RESERVED_CANONICAL_NAMES.some((canonical) => canonical.includes(foldedCharacter));
}));
const representativeByCodePoint = new Map();
for (const entry of GENERATED_RESERVED_ALIAS_CORPUS) {
  if (PLATFORM_ALIAS_CODE_POINT_SET.has(entry.codePoint) && !representativeByCodePoint.has(entry.codePoint)) {
    representativeByCodePoint.set(entry.codePoint, entry);
  }
}
const REPRESENTATIVE_RESERVED_POISON = Object.freeze(Object.fromEntries(
  [...representativeByCodePoint.values()].map((entry) => [
    entry.alias,
    `ambient-generated-u${entry.codePoint.toString(16)}-poison`,
  ]),
));
const MULTI_SUBSTITUTION_ALIASES = Object.freeze([
  Object.freeze({ alias: 'GEMıNı_API_KEY', canonical: 'GEMINI_API_KEY' }),
  Object.freeze({ alias: 'BLUE_HELM_PANE_ﬅATUſ_PIPE', canonical: 'BLUE_HELM_PANE_STATUS_PIPE' }),
]);
const PLATFORM_ALIAS_CASES = Object.freeze([
  Object.freeze({
    label: 'ascii-case-control',
    alias: 'p1_ascii_case_control',
    canonical: 'P1_ASCII_CASE_CONTROL',
    value: 'ascii-case-control-value',
  }),
  ...PLATFORM_ALIAS_CODE_POINTS.map((codePoint) => {
    const alias = String.fromCodePoint(codePoint);
    return Object.freeze({
      label: `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
      alias,
      canonical: foldConservativeNameForTest(alias),
      value: `unicode-u${codePoint.toString(16)}-value`,
    });
  }),
]);
const DUPLICATE_ORDER_CASES = Object.freeze([
  Object.freeze({ label: 'canonical-first', order: Object.freeze(['canonical', 'alias']) }),
  Object.freeze({ label: 'alias-first', order: Object.freeze(['alias', 'canonical']) }),
]);
const SEQUENTIAL_PROBE_COUNT = 2 + PLATFORM_ALIAS_CASES.length + DUPLICATE_ORDER_CASES.length;
const PRODUCTION_PROBE_PARENT_TIMEOUT_MS = 2 * SEQUENTIAL_PROBE_COUNT * CHILD_PROBE_TIMEOUT_MS;

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
    const timer = setTimeout(() => finish(() => reject(new Error(`${marker} probe timed out`))), CHILD_PROBE_TIMEOUT_MS);
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
    ...REPRESENTATIVE_RESERVED_POISON,
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

  // Ask the actual Windows environment lookup, through the production node-pty/ConPTY path, whether
  // each non-ASCII candidate resolves under its conservative ASCII spelling. The exact alias lookup
  // is the negative control proving node-pty really put that spelling into the child environment.
  const platformAliasMeasurements = [];
  const platformProbeBase = copyAllowedWindowsEnv(process.env, FENCED_ENV_ALLOWLIST);
  for (const aliasCase of PLATFORM_ALIAS_CASES) {
    const quotedAlias = aliasCase.alias.replace(/'/g, "''");
    const quotedCanonical = aliasCase.canonical.replace(/'/g, "''");
    const aliasProbe = await runNodePtyTextProbe(pty, {
      ...platformProbeBase,
      [aliasCase.alias]: aliasCase.value,
    }, '__P1_PLATFORM_ALIAS__', [
      `[Console]::WriteLine('__P1_ALIAS_EXACT__' + [Environment]::GetEnvironmentVariable('${quotedAlias}', 'Process'))`,
      `[Console]::WriteLine('__P1_ALIAS_CANONICAL__' + [Environment]::GetEnvironmentVariable('${quotedCanonical}', 'Process'))`,
    ]);
    if (aliasProbe.unavailable) {
      process.stdout.write(JSON.stringify({ skipped: true, reason: aliasProbe.reason }));
      return;
    }
    const exactLookups = markedValues(aliasProbe.payload, '__P1_ALIAS_EXACT__');
    const canonicalLookups = markedValues(aliasProbe.payload, '__P1_ALIAS_CANONICAL__');
    if (exactLookups.length !== 1 || canonicalLookups.length !== 1) {
      throw new Error(`${aliasCase.label} probe emitted ambiguous lookup marker counts: exact=${exactLookups.length} canonical=${canonicalLookups.length}`);
    }
    platformAliasMeasurements.push({
      ...aliasCase,
      aliasLookup: exactLookups[0],
      canonicalLookup: canonicalLookups[0],
    });
  }

  // This bypasses buildPtyEnv deliberately: the builder removes ASCII-case collisions. The probe
  // asks whether a duplicate-bearing object reaches the production node-pty/ConPTY child as two
  // names, and which value canonical lookup returns, in both construction orders.
  const duplicateCanonical = 'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB';
  const duplicateAlias = 'claude_code_subprocess_env_scrub';
  const duplicateValues = Object.freeze({
    canonical: 'duplicate-canonical-value',
    alias: 'duplicate-alias-value',
  });
  const duplicateMeasurements = [];
  for (const orderCase of DUPLICATE_ORDER_CASES) {
    const duplicateEnv = { ...platformProbeBase };
    for (const kind of orderCase.order) {
      duplicateEnv[kind === 'canonical' ? duplicateCanonical : duplicateAlias] = duplicateValues[kind];
    }
    const duplicateProbe = await runNodePtyTextProbe(pty, duplicateEnv, '__P1_DUPLICATE_ENV__', [
      `$pairNames = @([Environment]::GetEnvironmentVariables('Process').Keys | ForEach-Object { [string]$_ } | Where-Object { [StringComparer]::OrdinalIgnoreCase.Equals($_, '${duplicateCanonical}') } | Sort-Object)`,
      "foreach ($name in $pairNames) { [Console]::WriteLine('__P1_DUPLICATE_NAME__' + $name) }",
      `[Console]::WriteLine('__P1_DUPLICATE_LOOKUP__' + [Environment]::GetEnvironmentVariable('${duplicateCanonical}', 'Process'))`,
    ]);
    if (duplicateProbe.unavailable) {
      process.stdout.write(JSON.stringify({ skipped: true, reason: duplicateProbe.reason }));
      return;
    }
    const duplicateLookups = markedValues(duplicateProbe.payload, '__P1_DUPLICATE_LOOKUP__');
    if (duplicateLookups.length !== 1) {
      throw new Error(`${orderCase.label} duplicate probe emitted ${duplicateLookups.length} lookup markers`);
    }
    duplicateMeasurements.push({
      label: orderCase.label,
      order: orderCase.order,
      names: markedValues(duplicateProbe.payload, '__P1_DUPLICATE_NAME__'),
      canonicalLookup: duplicateLookups[0],
      values: duplicateValues,
    });
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
    collisionSourceUnicodePoisonPresent: Object.keys(REPRESENTATIVE_RESERVED_POISON)
      .every((name) => Object.prototype.hasOwnProperty.call(collisionSource, name)),
    collisionBuiltNames: Object.keys(collisionEnv).sort(),
    nodePtyCollision: {
      names: markedValues(collisionProbe.payload, '__P1_RESERVED_NAME__'),
      scrub: markedValue(collisionProbe.payload, '__P1_SCRUB__'),
      gemini: markedValue(collisionProbe.payload, '__P1_GEMINI__'),
      pipe: markedValue(collisionProbe.payload, '__P1_PIPE__'),
      token: markedValue(collisionProbe.payload, '__P1_TOKEN__'),
    },
    platformAliasMeasurements,
    duplicateMeasurements,
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
function asciiFoldedKeys(env) {
  return Object.keys(env || {}).map((name) => name.replace(/[a-z]/g, (ch) => ch.toUpperCase())).sort();
}
function foldAscii(name) {
  return typeof name === 'string' && /^[\x20-\x7E]+$/.test(name)
    ? name.replace(/[a-z]/g, (ch) => ch.toUpperCase())
    : null;
}
function reservedFamilyNames(envOrNames, expectedName) {
  const names = Array.isArray(envOrNames) ? envOrNames : Object.keys(envOrNames || {});
  const expected = foldConservativeNameForTest(expectedName);
  return names.filter((name) => foldConservativeNameForTest(name) === expected);
}
function hasExactCanonicalReservedFamily(envOrNames, expectedName, expectedCount) {
  const family = reservedFamilyNames(envOrNames, expectedName);
  return expectedCount === 0
    ? family.length === 0
    : family.length === 1 && family[0] === expectedName;
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
  ...REPRESENTATIVE_RESERVED_POISON,
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
  for (const name of Object.keys(REPRESENTATIVE_RESERVED_POISON)) {
    assert(Object.prototype.hasOwnProperty.call(BASE_ENV, name),
      `generated Unicode reserved-alias poison ${name} genuinely entered the base fixture`);
  }
  assert(GENERATED_RESERVED_ALIAS_CORPUS.length > 1000,
    'the single-substitution conservative corpus is generated across Unicode rather than limited to named reviewer examples');
  process.stdout.write(`  MEASURED generated single-substitution corpus: ${GENERATED_RESERVED_ALIAS_CORPUS.length} aliases\n`);
  assert(GENERATED_RESERVED_ALIAS_CORPUS.some((entry) => entry.foldedCharacter === '_'),
    'corpus eligibility is derived from canonical substrings and includes Unicode scalars that fold to underscore');
  deepEqual([...representativeByCodePoint.keys()].sort((a, b) => a - b),
    [...EXPECTED_REPRESENTATIVE_CODE_POINTS].sort((a, b) => a - b),
  'the representative poison set is exactly the reviewer code points that can substitute into current reserved names');
  assert(foldConservativeNameForTest(String.fromCodePoint(0xFB01)) === 'FI'
    && !RESERVED_CANONICAL_NAMES.some((canonical) => canonical.includes('FI'))
    && !EXPECTED_REPRESENTATIVE_CODE_POINTS.includes(0xFB01),
  'U+FB01 is explicitly excluded because FI is not a substring of any current reserved canonical name');
  for (const codePoint of PLATFORM_ALIAS_CODE_POINTS) {
    const folded = foldConservativeNameForTest(String.fromCodePoint(codePoint));
    assert(typeof folded === 'string',
      `the conservative oracle maps U+${codePoint.toString(16).toUpperCase().padStart(4, '0')} -> ${folded}`);
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
    assert(!asciiFoldedKeys(env).includes(name.toUpperCase()), `fenced output omits poison ${name}`);
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
    ...REPRESENTATIVE_RESERVED_POISON,
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
    ...REPRESENTATIVE_RESERVED_POISON,
  }, 'reserved removal returns a fresh object without mutating its input');
  const branchControl = { 'ſAFE_HARBOR': 'non-reserved-conservative-branch' };
  assert(foldConservativeNameForTest('ſAFE_HARBOR') === 'SAFE_HARBOR',
    'the non-reserved Unicode control genuinely collapses to printable ASCII');
  deepEqual(omitReservedWindowsEnv(branchControl, ALWAYS_RESERVED_ENV_NAMES), branchControl,
    'the denylist-only conservative branch preserves a collapsed printable-ASCII name that is not reserved');
  const protoSource = Object.create(null);
  protoSource.__proto__ = 'ambient-proto-value';
  protoSource.Path = 'ambient-path';
  const protoCopy = omitReservedWindowsEnv(protoSource, ALWAYS_RESERVED_ENV_NAMES);
  assert(Object.prototype.hasOwnProperty.call(protoCopy, '__proto__')
    && protoCopy.__proto__ === 'ambient-proto-value',
  'an ambient __proto__ name is copied as an own data property rather than silently discarded');
  assert(Object.getPrototypeOf(protoCopy) === Object.prototype,
    'reserved omission returns a normal plain environment object after the null-prototype internal copy');

  const generatedAliasSource = {
    ...Object.fromEntries(GENERATED_RESERVED_ALIAS_CORPUS.map((entry) => [
      entry.alias,
      `generated-u${entry.codePoint.toString(16)}-poison`,
    ])),
    ...Object.fromEntries(MULTI_SUBSTITUTION_ALIASES.map((entry, index) => [
      entry.alias,
      `multi-substitution-${index}-poison`,
    ])),
  };
  const generatedAliasEnv = buildPtyEnv({
    baseEnv: generatedAliasSource,
    fencedRole: false,
    videoScout: true,
    geminiKey: 'generated-main-gemini',
    paneStatusEnv: PANE_ENV,
  });
  deepEqual(generatedAliasEnv, {
    CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
    GEMINI_API_KEY: 'generated-main-gemini',
    ...PANE_ENV,
  }, 'the generated single-substitution corpus plus bounded multi-substitution controls leave only canonical main-issued reserved names');
  for (const name of RESERVED_CANONICAL_NAMES) {
    assert(hasExactCanonicalReservedFamily(generatedAliasEnv, name, 1),
      `the generated-corpus output has exactly one canonical ${name} and no conservative collider`);
  }
  for (const entry of MULTI_SUBSTITUTION_ALIASES) {
    assert(foldConservativeNameForTest(entry.alias) === entry.canonical
      && !Object.prototype.hasOwnProperty.call(generatedAliasEnv, entry.alias),
    `whole-string folding removes bounded multi-substitution alias ${entry.alias}`);
  }
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
    baseEnv: { ...BASE_ENV, 0: 'numeric-ambient-name' },
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
  assert(Object.keys(env)[0] === '0' && env[0] === 'numeric-ambient-name',
    'integer-like ambient names follow JavaScript enumeration rules; no universal key-order claim is made');
  for (const name of [
    'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB', 'GEMINI_API_KEY',
    'BLUE_HELM_PANE_STATUS_PIPE', 'BLUE_HELM_PANE_STATUS_TOKEN',
  ]) {
    assert(hasExactCanonicalReservedFamily(env, name, 1),
      `the unfenced Video Scout environment contains exactly one canonical ${name} and no conservative collider`);
  }
  for (const poison of [
    'ambient-scrub-poison', 'ambient-case-gemini-poison',
    'ambient-case-pipe-poison', 'ambient-case-token-poison',
    ...Object.values(REPRESENTATIVE_RESERVED_POISON),
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
  assert(hasExactCanonicalReservedFamily(env, 'GEMINI_API_KEY', 0),
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
  assert(hasExactCanonicalReservedFamily(unenrolled, 'BLUE_HELM_PANE_STATUS_PIPE', 0)
    && hasExactCanonicalReservedFamily(unenrolled, 'BLUE_HELM_PANE_STATUS_TOKEN', 0),
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
    // unchanged, but every conservative reserved-family spelling is now removed before composition.
    const expected = {
      CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
      ...PANE_ENV,
      ...omitReservedWindowsEnv(admissionConfig.stripAdmissionEnv(BASE_ENV), ALWAYS_RESERVED_ENV_NAMES),
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
    CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
    GEMINI_API_KEY: 'main-issued-gemini',
    ...PANE_ENV,
    ...omitReservedWindowsEnv(admissionConfig.stripAdmissionEnv(BASE_ENV), [
      ...ALWAYS_RESERVED_ENV_NAMES, 'GEMINI_API_KEY',
    ]),
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
    CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
    ...PANE_ENV,
    ...omitReservedWindowsEnv(admissionConfig.stripAdmissionEnv(BASE_ENV), ALWAYS_RESERVED_ENV_NAMES),
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
    const builtKeys = asciiFoldedKeys(fenced);
    const childKeys = asciiFoldedKeys(observed.env);
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
      timeout: PRODUCTION_PROBE_PARENT_TIMEOUT_MS,
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
      assert(hasExactCanonicalReservedFamily(observedNames, 'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB', 1),
        'the fenced production child observes exactly one canonical main-issued scrub name');

      const collision = measured.nodePtyCollision;
      assert(measured.collisionSourceUnicodePoisonPresent === true,
        'the production collision probe genuinely supplied every generated representative reserved alias');
      for (const name of Object.keys(REPRESENTATIVE_RESERVED_POISON)) {
        assert(!measured.collisionBuiltNames.includes(name) && !collision.names.includes(name),
          `generated conservative reserved alias ${name} is absent before and after production node-pty`);
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
        assert(hasExactCanonicalReservedFamily(measured.collisionBuiltNames, name, 1)
          && hasExactCanonicalReservedFamily(collision.names, name, 1),
        `builder and production child each contain one canonical ${name} and no conservative collider`);
      }

      const aliasMeasurements = Array.isArray(measured.platformAliasMeasurements)
        ? measured.platformAliasMeasurements : [];
      assert(aliasMeasurements.length === PLATFORM_ALIAS_CASES.length,
        'the production platform probe reports the ASCII control and every generated Unicode candidate family');
      const asciiControl = aliasMeasurements.find((entry) => entry.label === 'ascii-case-control');
      assert(asciiControl && asciiControl.aliasLookup === asciiControl.value
        && asciiControl.canonicalLookup === asciiControl.value,
      'POSITIVE CONTROL: Windows resolves an ASCII case variant through the production ConPTY environment');
      const unicodeMeasurements = aliasMeasurements.filter((entry) => entry.label !== 'ascii-case-control');
      for (const entry of unicodeMeasurements) {
        assert(entry.aliasLookup === entry.value,
          `${entry.label} genuinely entered the production ConPTY child under its exact alias spelling`);
        assert(entry.canonicalLookup === '' || entry.canonicalLookup === entry.value,
          `${entry.label} canonical lookup reports a bounded yes/no platform result`);
        assert(foldConservativeNameForTest(entry.alias) === entry.canonical,
          `${entry.label} is contained by the conservative reserved-family oracle regardless of platform result`);
      }
      const resolvedUnicode = unicodeMeasurements
        .filter((entry) => entry.canonicalLookup === entry.value)
        .map((entry) => entry.label);
      process.stdout.write(`  MEASURED Windows non-ASCII alias resolutions: ${JSON.stringify(resolvedUnicode)}\n`);

      const duplicateMeasurements = Array.isArray(measured.duplicateMeasurements)
        ? measured.duplicateMeasurements : [];
      assert(duplicateMeasurements.length === DUPLICATE_ORDER_CASES.length,
        'the production duplicate-bearing probe reports both insertion orders');
      const duplicateByLabel = new Map(duplicateMeasurements.map((entry) => [entry.label, entry]));
      const canonicalName = 'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB';
      const aliasName = 'claude_code_subprocess_env_scrub';
      const orderedMeasurements = DUPLICATE_ORDER_CASES.map((orderCase) => duplicateByLabel.get(orderCase.label));
      for (const entry of orderedMeasurements) {
        assert(entry && Array.isArray(entry.names) && typeof entry.canonicalLookup === 'string',
          `${entry ? entry.label : 'missing'} reports the child name list and one canonical lookup`);
      }
      const bothNamesArrived = orderedMeasurements.every((entry) => entry
        && entry.names.length === 2
        && entry.names.includes(canonicalName)
        && entry.names.includes(aliasName));
      const firstWins = bothNamesArrived && orderedMeasurements.every((entry) =>
        entry.canonicalLookup === entry.values[entry.order[0]]);
      const lastWins = bothNamesArrived && orderedMeasurements.every((entry) =>
        entry.canonicalLookup === entry.values[entry.order[entry.order.length - 1]]);
      const collapsedToSingleName = orderedMeasurements.every((entry) => entry
        && entry.names.length === 1
        && (entry.names[0] === canonicalName || entry.names[0] === aliasName)
        && (entry.canonicalLookup === entry.values.canonical || entry.canonicalLookup === entry.values.alias));
      const duplicateOutcome = firstWins ? 'first-wins'
        : lastWins ? 'last-wins'
          : collapsedToSingleName ? 'collapsed-to-single-name'
            : 'ambiguous';
      process.stdout.write(`  MEASURED duplicate-bearing node-pty outcome: ${duplicateOutcome} ${JSON.stringify(duplicateMeasurements)}\n`);
      assert(duplicateOutcome === 'first-wins' || duplicateOutcome === 'collapsed-to-single-name',
        'the duplicate-bearing production measurement is first-wins or collapsed, never last-wins/ambiguous');
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
  assert(mainSrc.includes('paneStatusEnv,'),
    'main.js passes the enrollment result to the builder, which filters the two exact string-valued pane-status names');
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
