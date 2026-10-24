'use strict';
// Run: node app/authority-level.test.js
// Plain Node.js, no framework. S10: proves the level -> permission-mode table, that Maximum never
// launches a Claude pane locally, that fenced roles and non-Claude panes get no permission mode, and
// that no renderer value other than a known level name is accepted or reaches the command text.

const {
  LEVEL, LEVELS, PERMISSION_MODE, CLOUD_SESSION_URL, REASON, applyAuthority, permissionModeArg,
} = require('./authority-level');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const roleBuilder = { ok: true, kind: 'role', role: 'builder', cli: null, fenced: false, videoScout: false };
const roleReviewer = { ok: true, kind: 'role', role: 'reviewer', cli: null, fenced: false, videoScout: false };
const roleWebScout = { ok: true, kind: 'role', role: 'web-scout', cli: null, fenced: true, videoScout: false };
const cliClaude = { ok: true, kind: 'cli', role: null, cli: 'claude', fenced: false, videoScout: false };
const cliCodex = { ok: true, kind: 'cli', role: null, cli: 'codex', fenced: false, videoScout: false };
const cliGemini = { ok: true, kind: 'cli', role: null, cli: 'gemini', fenced: false, videoScout: false };
const shell = { ok: true, kind: 'shell', role: null, cli: null, fenced: false, videoScout: false };
const video = { ok: true, kind: 'video-scout', role: 'video-scout', cli: null, fenced: false, videoScout: true };

process.stdout.write('\nTHE TABLE (AGENTS.md "Authority levels")\n');
assert(LEVELS.join(',') === 'minimum,medium,high,maximum', 'four levels, in order');
assert(PERMISSION_MODE.minimum === 'plan', 'Minimum -> plan');
assert(PERMISSION_MODE.medium === 'acceptEdits', 'Medium -> acceptEdits');
assert(PERMISSION_MODE.high === 'auto', 'High -> auto');
assert(!(LEVEL.MAXIMUM in PERMISSION_MODE), 'Maximum has no local permission mode');
assert(Object.values(PERMISSION_MODE).every((m) => m !== 'bypassPermissions' && m !== 'dontAsk'),
  'no level ever maps to bypassPermissions or dontAsk');
assert(CLOUD_SESSION_URL === 'https://claude.ai/code', 'Maximum goes to claude.ai/code');
{
  // The renderer opens it through open-external, which runs the Quick Links URL policy first.
  const v = require('./quick-links-policy').validateUrl(CLOUD_SESSION_URL);
  assert(v.ok === true && v.url === CLOUD_SESSION_URL, 'the open-external URL policy accepts it unchanged');
}
assert(Object.isFrozen(PERMISSION_MODE) && Object.isFrozen(LEVELS) && Object.isFrozen(LEVEL), 'the tables are frozen');

process.stdout.write('\nUNFENCED CLAUDE PANES GET THE MODE\n');
for (const launch of [roleBuilder, roleReviewer, cliClaude]) {
  const name = launch.role || launch.cli;
  for (const level of ['minimum', 'medium', 'high']) {
    const r = applyAuthority(launch, level);
    assert(r.ok === true && r.authority === level && r.permissionMode === PERMISSION_MODE[level] && r.authorityApplied === true,
      `${name} at ${level} -> ${PERMISSION_MODE[level]}`);
    assert(permissionModeArg(r) === ' --permission-mode ' + PERMISSION_MODE[level], `${name} at ${level}: the flag text`);
    assert(r.kind === launch.kind && r.role === launch.role && r.fenced === launch.fenced, `${name} at ${level}: classification kept`);
  }
}
{
  const r = applyAuthority(roleBuilder, 'high');
  assert(roleBuilder.permissionMode === undefined && r !== roleBuilder, 'the classified launch object is not mutated');
}

process.stdout.write('\nMAXIMUM NEVER RUNS A CLAUDE PANE LOCALLY\n');
for (const launch of [roleBuilder, roleReviewer, roleWebScout, cliClaude]) {
  const r = applyAuthority(launch, 'maximum');
  assert(r.ok === false && r.reason === REASON.MAXIMUM_RUNS_IN_CLOUD, `${launch.role || launch.cli} at maximum is refused`);
}

process.stdout.write('\nFENCED ROLES AND NON-CLAUDE PANES: NO MODE, RECORDED AS NOT APPLIED\n');
for (const level of ['minimum', 'medium', 'high']) {
  const r = applyAuthority(roleWebScout, level);
  assert(r.ok === true && r.permissionMode === null && r.authorityApplied === false && r.authority === level,
    `web-scout (fenced) at ${level}: no mode, its fence governs`);
  assert(permissionModeArg(r) === '', `web-scout (fenced) at ${level}: no flag`);
}
for (const launch of [cliCodex, cliGemini, shell, video]) {
  for (const level of LEVELS) {
    const r = applyAuthority(launch, level);
    assert(r.ok === true && r.permissionMode === null && r.authorityApplied === false,
      `${launch.cli || launch.kind} at ${level}: launches without a Claude mode`);
  }
}

process.stdout.write('\nNO LEVEL SENT: THE PRE-S10 LAUNCH\n');
for (const raw of [undefined, null]) {
  const r = applyAuthority(roleBuilder, raw);
  assert(r.ok === true && r.authority === null && r.permissionMode === null && permissionModeArg(r) === '',
    `${String(raw)}: no mode, no flag`);
}

process.stdout.write('\nHOSTILE OR MALFORMED LEVELS REFUSE\n');
for (const raw of ['', 'Minimum', 'MAXIMUM', 'bypassPermissions', 'plan', 'auto', 'high ', 'high; rm -rf', 1, true, {}, [], ['high']]) {
  const r = applyAuthority(roleBuilder, raw);
  assert(r.ok === false && r.reason === REASON.UNKNOWN_LEVEL, `${JSON.stringify(raw)} is refused`);
}

process.stdout.write('\nTHE FLAG BUILDER RE-CHECKS ITS INPUT\n');
assert(permissionModeArg(Object.assign({}, roleBuilder, { permissionMode: 'bypassPermissions' })) === '',
  'a mode outside the table yields no flag');
assert(permissionModeArg(Object.assign({}, roleBuilder, { permissionMode: 'plan; whoami' })) === '',
  'an injected string yields no flag');
assert(permissionModeArg(Object.assign({}, roleWebScout, { permissionMode: 'auto' })) === '',
  'a fenced launch yields no flag even if a mode is present');
assert(permissionModeArg(null) === '' && permissionModeArg(undefined) === '', 'no launch, no flag');

process.stdout.write(`\nauthority-level: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
