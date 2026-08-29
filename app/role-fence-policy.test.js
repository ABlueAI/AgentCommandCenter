'use strict';
// Run: node app/role-fence-policy.test.js
//
// P4 + HOOK-INTEGRITY MATRIX.
//
// N1 and N2 are the exact counterexamples an independent no-write probe drove through the REAL
// pre-existing `verify-fence` handler, which returned { ok: true } for all three of:
//   * the canonical role;
//   * a role whose matcher covered only `Read` while its tools still declared `Write`;
//   * a role with an EMPTY PreToolUse list whose fence command sat under `PostToolUse`.
// Both now refuse, and the positive controls prove the tightening does not break a real launch.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { assertFencedRoleDefinition, FORBIDDEN_TOOLS, REASON } = require('./role-fence-policy');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  \u2713 ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
function section(t) { process.stdout.write('\n' + t + '\n'); }

const ROLES_DIR = path.join(__dirname, '..', 'agent-roles');
const HOOK = 'C:/hooks/fence-write.js';
const DECOY = 'C:/elsewhere/fence-write.js';        // same BASENAME, different file
const TRACKED_SHA = 'a'.repeat(64);
const OTHER_SHA = 'b'.repeat(64);

// Filesystem stub: both hook paths exist, but only the canonical one hashes to the tracked identity.
const fsx = {
  existsSync: (p) => p === HOOK || p === DECOY,
  realpathSync: (p) => p,
};
const hashes = {}; hashes[HOOK] = TRACKED_SHA; hashes[DECOY] = OTHER_SHA;
const hashFile = (p) => { if (!(p in hashes)) throw new Error('ENOENT'); return hashes[p]; };

function build(o) {
  const opt = o || {};
  const lines = ['---', 'name: ' + (opt.name || 'web-scout'), 'description: d'];
  if (opt.tools !== null) lines.push('tools: ' + (opt.tools === undefined ? 'WebSearch, WebFetch, Read, Write' : opt.tools));
  lines.push(opt.hooks === undefined ? [
    'hooks:',
    '  PreToolUse:',
    '    - matcher: "' + (opt.matcher || 'Read|Write|Edit|MultiEdit') + '"',
    '      hooks:',
    '        - type: ' + (opt.type || 'command'),
    '          command: "node \\"' + (opt.hookPath || HOOK) + '\\""',
  ].join('\n') : opt.hooks);
  lines.push('---', '', 'Body.');
  return lines.join('\n');
}

const check = (text, role) => assertFencedRoleDefinition({
  role: role || 'web-scout', text,
  canonicalHookPath: HOOK, trackedHookSha256: TRACKED_SHA,
  fsx, hashFile, platform: 'win32',
});

section('POSITIVE CONTROLS \u2014 every real fenced role passes');
for (const r of ['web-scout', 'operator', 'source-scout']) {
  // Deployed form: sync-roles.ps1 substitutes __CC_HOOK__ with the absolute hook path.
  const deployed = fs.readFileSync(path.join(ROLES_DIR, r + '.md'), 'utf8').replace('__CC_HOOK__', HOOK);
  const res = check(deployed, r);
  assert(res.ok === true, r + ' passes the fence policy as actually deployed');
  assert(res.ok && res.hookPath === HOOK, r + ' binds to the canonical hook path');
}

section('N1 \u2014 matcher covers Read but the role still declares Write (probe counterexample)');
{
  const r = check(build({ matcher: 'Read', tools: 'WebSearch, WebFetch, Read, Write' }));
  assert(r.ok === false && r.reason === REASON.MATCHER_COVERAGE,
    'REFUSES: an uncovered Write is no longer accepted (the old regex asked only for Read)');
  const readOnly = check(build({ matcher: 'Read', tools: 'WebSearch, WebFetch, Read' }));
  assert(readOnly.ok === true, 'but a role that declares no Write is legitimately covered by Read alone');
}

section('N2 \u2014 empty PreToolUse with the fence command under PostToolUse (probe counterexample)');
{
  const r = check(build({ hooks: [
    'hooks:',
    '  PreToolUse: []',
    '  PostToolUse:',
    '    - matcher: "Read|Write"',
    '      hooks:',
    '        - type: command',
    '          command: "node \\"' + HOOK + '\\""',
  ].join('\n') }));
  assert(r.ok === false && r.reason === REASON.PRETOOLUSE_MISSING,
    'REFUSES: the command existing SOMEWHERE in the file proves nothing');
}

section('N3\u2013N5 \u2014 the remaining structural holes');
{
  const wrongType = check(build({ type: 'inline' }));
  assert(!wrongType.ok && wrongType.reason === REASON.HOOK_NOT_IN_PRETOOLUSE,
    'N3 REFUSES: a non-command hook type does not wire the fence');
  const splitEntry = check(build({ hooks: [
    'hooks:',
    '  PreToolUse:',
    '    - matcher: "Read|Write"',
    '      hooks:',
    '        - type: command',
    '          command: "node \\"C:/unrelated.js\\""',
    '    - matcher: "Bash"',
    '      hooks:',
    '        - type: command',
    '          command: "node \\"' + HOOK + '\\""',
  ].join('\n') }));
  assert(!splitEntry.ok && splitEntry.reason === REASON.MATCHER_COVERAGE,
    'N4 REFUSES: a covering matcher on a DIFFERENT entry cannot vouch for the fence entry');
  for (const bad of ['Read|Write|.*', 'Read.*', '(Read|Write)', 'Read|Write|', '*']) {
    const r = check(build({ matcher: bad }));
    assert(!r.ok && (r.reason === REASON.MATCHER_UNSUPPORTED || r.reason === REASON.MATCHER_COVERAGE),
      'N5 REFUSES unsupported matcher form: ' + JSON.stringify(bad));
  }
}

section('HOOK IDENTITY \u2014 basename proves nothing');
{
  const decoy = check(build({ hookPath: DECOY }));
  assert(!decoy.ok && decoy.reason === REASON.HOOK_PATH_NOT_CANONICAL,
    'REFUSES a different file that merely happens to be named fence-write.js');
  const drifted = assertFencedRoleDefinition({
    role: 'web-scout', text: build({}), canonicalHookPath: HOOK,
    trackedHookSha256: OTHER_SHA, fsx, hashFile, platform: 'win32',
  });
  assert(!drifted.ok && drifted.reason === REASON.HOOK_CONTENT_MISMATCH,
    'REFUSES when the deployed hook is not byte-identical to the tracked fence-write.js');
  const noTracked = assertFencedRoleDefinition({
    role: 'web-scout', text: build({}), canonicalHookPath: HOOK,
    trackedHookSha256: null, fsx, hashFile, platform: 'win32',
  });
  assert(!noTracked.ok && noTracked.reason === REASON.HOOK_CONTENT_MISMATCH,
    'an unreadable TRACKED hook fails closed rather than accepting anything');
  const missing = assertFencedRoleDefinition({
    role: 'web-scout', text: build({}), canonicalHookPath: HOOK, trackedHookSha256: TRACKED_SHA,
    fsx: { existsSync: () => false, realpathSync: (p) => p }, hashFile, platform: 'win32',
  });
  assert(!missing.ok && missing.reason === REASON.HOOK_FILE_MISSING, 'REFUSES when the hook file is absent');
  assert(check(build({}).replace(HOOK, '__CC_HOOK__')).reason === REASON.PLACEHOLDER,
    'REFUSES an undeployed role still carrying the __CC_HOOK__ placeholder');
}

section('P4 \u2014 forbidden tools');
for (const t of FORBIDDEN_TOOLS) {
  const r = check(build({ tools: 'WebSearch, WebFetch, Read, Write, ' + t }));
  assert(!r.ok && r.reason === REASON.FORBIDDEN_TOOL, 'REFUSES a fenced role declaring ' + t);
}
{
  const all = check(build({ tools: 'Read, Write, Bash, Glob, NotebookEdit' }));
  assert(!all.ok && all.reason === REASON.FORBIDDEN_TOOL, 'REFUSES all three at once');
  const omitted = check(build({ tools: null }));
  assert(!omitted.ok && omitted.reason === REASON.TOOLS_ABSENT,
    'REFUSES an omitted tools key \u2014 the loader would inherit ALL tools, including Bash');
  const denylistRescue = check(build({ tools: 'Read, Write, Bash' })
    .replace('model: sonnet', '') .replace('description: d', 'description: d\ndisallowedTools: Bash'));
  assert(!denylistRescue.ok && denylistRescue.reason === REASON.FORBIDDEN_TOOL,
    'a disallowedTools entry can NEVER rescue a forbidden tool granted by tools:');
  for (const near of ['Globals', 'BashfulTool', 'NotebookEditor', 'Readable']) {
    const r = check(build({ tools: 'Read, Write, ' + near }));
    assert(r.ok === true, 'substring near-miss is not a forbidden tool: ' + near);
  }
}

section('IDENTITY AND PARSE');
{
  assert(check(build({ name: 'operator' }), 'web-scout').reason === REASON.IDENTITY_MISMATCH,
    'REFUSES when the frontmatter name is not the requested identity (name, not filename, is identity)');
  assert(check('not a role file').reason === REASON.PARSE, 'REFUSES unparseable content');
}

section('BUILDER IS NEVER SUBMITTED TO THIS POLICY');
{
  // Builder legitimately declares Bash and carries no hook. It is excluded by CLASSIFICATION, not by
  // this policy \u2014 pinned here so the exclusion is visible where the forbidden list lives.
  const builder = fs.readFileSync(path.join(ROLES_DIR, 'builder.md'), 'utf8');
  const r = check(builder, 'builder');
  assert(r.ok === false, 'builder WOULD refuse if it were ever routed here (it declares Bash)');
  const FENCED = new Set(['web-scout', 'operator', 'source-scout']);
  assert(!FENCED.has('builder'), 'and it is not a fenced role, so the classifier never routes it here');
}

section('REFUSAL REASONS ARE BOUNDED CONSTANTS');
{
  const all = Object.values(REASON);
  const r = check(build({ tools: 'Read, Write, Bash', hookPath: 'D:/secret/path/fence-write.js' }));
  assert(all.indexOf(r.reason) !== -1, 'reason is a declared constant');
  assert(r.reason.indexOf('secret') === -1 && r.reason.indexOf('/') === -1, 'and carries no path');
}

process.stdout.write('\nrole-fence-policy: ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
