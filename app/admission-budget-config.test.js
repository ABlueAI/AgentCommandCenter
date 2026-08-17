'use strict';
// Run: node app/admission-budget-config.test.js
//
// The startup configuration boundary for the MAIN-OWNED TURN ADMISSION BUDGET.
//
// What this suite is defending: the allowance is a cost control, so the ONLY acceptable outcome of a
// malformed, partial, or hostile REQUEST is INVALID protective mode, never ordinary absence. Every
// negative case below must produce allowance 0, and the positive case requires every field exactly.
//
// It also owns the environment-scrub proof (required test 18): the exact key list main strips from
// each child PTY environment is asserted here against the module's own constants, so adding a new
// admission key without adding it to the scrub list fails this suite rather than leaking into a PTY.

const fs = require('fs');
const path = require('path');
const config = require('./admission-budget-config');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// A complete, valid configuration. Every negative case below is this object with ONE field broken, so
// a failure can only be attributed to the field under test.
function validEnv(overrides) {
  return {
    BLUE_HELM_ADMISSION_ENABLED: '1',
    BLUE_HELM_ADMISSION_RUN_ID: 'evidence-run-0001',
    BLUE_HELM_ADMISSION_ALLOWANCE: '3',
    ...(overrides || {}),
  };
}

// ---- 1. the happy path -------------------------------------------------------------------------

process.stdout.write('\n-- valid configuration --\n');
{
  const plan = config.parseAdmissionConfig(validEnv());
  assert(plan.enabled === true, 'a complete valid configuration enables the run');
  assert(plan.requested === true && plan.configStatus === config.CONFIG_STATUS.VALID,
    'a valid request is explicitly distinguished from absence and invalidity');
  assert(plan.allowance === 3, 'the allowance is the parsed integer');
  assert(plan.runId === 'evidence-run-0001', 'the run id is carried through');
  assert(plan.paneId === null, 'pane id is null when unpinned (claimed later at pty-start)');
  assert(plan.rebind === false, 'rebind defaults to false');
  assert(plan.schemaVersion === config.SCHEMA_VERSION, 'the plan carries a schema version');
  assert(Object.isFrozen(plan), 'the plan is frozen so a caller cannot flip enabled on it');
}

{
  const plan = config.parseAdmissionConfig(validEnv({ BLUE_HELM_ADMISSION_PANE_ID: 'pty4' }));
  assert(plan.enabled === true && plan.paneId === 'pty4', 'a well-formed pane pin is accepted');
}
{
  const plan = config.parseAdmissionConfig(validEnv({ BLUE_HELM_ADMISSION_REBIND: '1' }));
  assert(plan.enabled === true && plan.rebind === true, 'an explicit rebind flag of exactly "1" is accepted');
}

// ---- 2. required test 1: disabled / default-zero ------------------------------------------------

process.stdout.write('\n-- absent versus invalid protective configuration (required test 1) --\n');
{
  const absentCases = [
    ['{} (nothing configured)', {}],
    ['undefined env', undefined],
    ['null env', null],
    ['a non-object env', 'BLUE_HELM_ADMISSION_ENABLED=1'],
  ];
  for (const [label, env] of absentCases) {
    const plan = config.parseAdmissionConfig(env);
    assert(plan.enabled === false && plan.allowance === 0 && plan.requested === false &&
      plan.configStatus === config.CONFIG_STATUS.ABSENT,
    `${label} -> ordinary absence with allowance 0`);
  }

  const invalidCases = [
    ['empty enabled flag', validEnv({ BLUE_HELM_ADMISSION_ENABLED: '' })],
    ['run id without enabled flag', { BLUE_HELM_ADMISSION_RUN_ID: 'evidence-run-0001' }],
    ['allowance without enabled flag', { BLUE_HELM_ADMISSION_ALLOWANCE: '3' }],
    ['pane pin without enabled flag', { BLUE_HELM_ADMISSION_PANE_ID: 'pty1' }],
    ['rebind without enabled flag', { BLUE_HELM_ADMISSION_REBIND: '1' }],
  ];
  for (const [label, env] of invalidCases) {
    const plan = config.parseAdmissionConfig(env);
    assert(plan.enabled === false && plan.allowance === 0 && plan.requested === true &&
      plan.configStatus === config.CONFIG_STATUS.INVALID,
    `${label} -> protective invalidity with allowance 0`);
  }
}

// ---- 3. every malformed field fails closed ------------------------------------------------------

process.stdout.write('\n-- malformed fields fail closed --\n');
{
  const badEnabled = ['0', 'true', 'yes', ' 1', '1 ', '01', 'TRUE'];
  for (const v of badEnabled) {
    const plan = config.parseAdmissionConfig(validEnv({ BLUE_HELM_ADMISSION_ENABLED: v }));
    assert(plan.enabled === false && plan.reason === config.CONFIG_REASON.BAD_ENABLED && plan.requested === true &&
      plan.configStatus === config.CONFIG_STATUS.INVALID,
      `enabled=${JSON.stringify(v)} refuses (only the exact string "1" enables)`);
  }
}
{
  const badRunIds = ['', 'short', 'UPPERCASE-RUN-ID', 'has space here', '-leading-hyphen', 'trailing-hyphen-',
    'has_underscore_x', 'a'.repeat(65), 'run/../id-traversal', 'run.id.with.dots'];
  for (const v of badRunIds) {
    const plan = config.parseAdmissionConfig(validEnv({ BLUE_HELM_ADMISSION_RUN_ID: v }));
    assert(plan.enabled === false,
      `run id ${JSON.stringify(v.length > 20 ? v.slice(0, 20) + '…' : v)} refuses`);
  }
  assert(config.parseAdmissionConfig(validEnv({ BLUE_HELM_ADMISSION_RUN_ID: undefined })).enabled === false,
    'a missing run id refuses');
}
{
  // A cost control must not accept a number whose value depends on the parser.
  const badAllowances = ['0', '-1', '+3', '3.0', '3e0', ' 3', '3 ', '03', '', 'three', '999', '11', 'Infinity', 'NaN'];
  for (const v of badAllowances) {
    const plan = config.parseAdmissionConfig(validEnv({ BLUE_HELM_ADMISSION_ALLOWANCE: v }));
    assert(plan.enabled === false && plan.allowance === 0,
      `allowance ${JSON.stringify(v)} refuses (integer lexical form, 1..${config.MAX_ALLOWANCE})`);
  }
  assert(config.parseAdmissionConfig(validEnv({ BLUE_HELM_ADMISSION_ALLOWANCE: String(config.MAX_ALLOWANCE) })).allowance === config.MAX_ALLOWANCE,
    `the maximum allowance ${config.MAX_ALLOWANCE} is accepted`);
  assert(config.parseAdmissionConfig(validEnv({ BLUE_HELM_ADMISSION_ALLOWANCE: String(config.MAX_ALLOWANCE + 1) })).enabled === false,
    `one above the maximum (${config.MAX_ALLOWANCE + 1}) refuses`);
}
{
  const badPanes = ['pty', 'PTY1', 'pty1234567', 'library2', '../pty1', 'pty1 '];
  for (const v of badPanes) {
    const plan = config.parseAdmissionConfig(validEnv({ BLUE_HELM_ADMISSION_PANE_ID: v }));
    assert(plan.enabled === false && plan.reason === config.CONFIG_REASON.BAD_PANE_ID,
      `pane pin ${JSON.stringify(v)} refuses rather than widening to "any pane"`);
  }
}
{
  for (const v of ['0', 'true', 'yes']) {
    const plan = config.parseAdmissionConfig(validEnv({ BLUE_HELM_ADMISSION_REBIND: v }));
    assert(plan.enabled === false && plan.reason === config.CONFIG_REASON.BAD_REBIND,
      `rebind=${JSON.stringify(v)} refuses (only the exact string "1")`);
  }
}

// ---- 4. required test 18: admission configuration is absent from the child PTY environment ------

process.stdout.write('\n-- required test 18: PTY environment scrub --\n');
{
  const parentEnv = {
    ...validEnv({ BLUE_HELM_ADMISSION_PANE_ID: 'pty2', BLUE_HELM_ADMISSION_REBIND: '1' }),
    PATH: 'C:\\Windows',
    SOME_UNRELATED: 'keep-me',
  };
  const child = config.stripAdmissionEnv(parentEnv);

  for (const key of config.ADMISSION_ENV_KEYS) {
    assert(!Object.prototype.hasOwnProperty.call(child, key),
      `child PTY environment does not carry ${key}`);
  }
  assert(config.hasAdmissionEnv(child) === false, 'hasAdmissionEnv() agrees the child env is clean');
  assert(config.hasAdmissionEnv(parentEnv) === true, 'hasAdmissionEnv() still sees the parent env as configured');
  assert(child.PATH === 'C:\\Windows' && child.SOME_UNRELATED === 'keep-me',
    'unrelated environment values survive the scrub untouched');
  assert(parentEnv.BLUE_HELM_ADMISSION_ENABLED === '1',
    'the scrub returns a COPY — the parent process environment is not mutated');
}
{
  // The list must be complete. Every ENV_* constant this module exports has to be in the scrub list,
  // or a future key would be configured by main and readable by the PTY.
  const declared = Object.keys(config)
    .filter((k) => k.startsWith('ENV_'))
    .map((k) => config[k]);
  assert(declared.length > 0, 'the module exports ENV_* key constants to check against');
  for (const key of declared) {
    assert(config.ADMISSION_ENV_KEYS.includes(key),
      `${key} is in ADMISSION_ENV_KEYS (adding a key without scrubbing it must fail here)`);
  }
  assert(config.ADMISSION_ENV_KEYS.length === declared.length,
    'ADMISSION_ENV_KEYS contains exactly the declared ENV_* constants — no more, no fewer');
  assert(Object.isFrozen(config.ADMISSION_ENV_KEYS), 'ADMISSION_ENV_KEYS is frozen');
}

// ---- 5. source tripwire (required test 21) -------------------------------------------------------

process.stdout.write('\n-- source tripwires --\n');
{
  const mainSrc = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert(mainSrc.includes('admissionConfig.stripAdmissionEnv(process.env)'),
    'main.js builds the PTY environment from stripAdmissionEnv(process.env), not from process.env directly');
  // The spread that builds ptyEnv must not start from raw process.env any more. Catching the literal
  // is crude but it is exactly the regression that would silently re-leak the configuration.
  const ptyEnvBlock = mainSrc.slice(mainSrc.indexOf('const ptyEnv = {'), mainSrc.indexOf('const ptyEnv = {') + 400);
  assert(ptyEnvBlock.length > 0 && !/\.\.\.process\.env\b/.test(ptyEnvBlock),
    'the ptyEnv literal no longer spreads raw process.env');
  assert(mainSrc.includes('parseAdmissionConfig(process.env)'),
    'main.js parses the admission plan once, from its own startup environment');
  assert(mainSrc.includes('prepareAdmissionPaneLaunch({'),
    'main delegates every pane start to the protective admission launch policy before spawn');
}

process.stdout.write(`\nadmission-budget-config: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
