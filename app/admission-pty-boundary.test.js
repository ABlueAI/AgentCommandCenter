'use strict';
// Run: node app/admission-pty-boundary.test.js
// Pure route tests for pane eligibility, launch-time prompt detection, and the one final PTY writer.

const fs = require('fs');
const path = require('path');
const {
  WRITE_REASON,
  isEligibleClaudePane,
  hasNonemptyInitialPrompt,
  createAdmissionPtyBoundary,
} = require('./admission-pty-boundary');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}

const roles = new Set(['builder', 'reviewer', 'source-scout']);

process.stdout.write('\n-- main-owned Claude eligibility --\n');
assert(isEligibleClaudePane({ cli: 'claude' }, roles), 'bare Claude is eligible');
assert(isEligibleClaudePane({ agent: 'claude' }, roles), 'legacy bare-Claude agent shape is eligible');
assert(isEligibleClaudePane({ role: 'builder' }, roles), 'an allowlisted Claude role is eligible');
assert(!isEligibleClaudePane({}, roles), 'a plain shell is ineligible');
assert(!isEligibleClaudePane({ cli: 'codex' }, roles), 'Codex is ineligible');
assert(!isEligibleClaudePane({ cli: 'gemini' }, roles), 'Gemini is ineligible');
assert(!isEligibleClaudePane({ role: 'not-deployed' }, roles), 'an unknown role is ineligible');
assert(!isEligibleClaudePane({ role: 'reviewer', videoScout: true }, roles), 'Video Scout is ineligible even with a role-shaped payload');

process.stdout.write('\n-- launch-time prompt detection --\n');
assert(!hasNonemptyInitialPrompt({}), 'absent initialPrompt is not turn-initiating');
assert(!hasNonemptyInitialPrompt({ initialPrompt: '  \r\n  ' }), 'whitespace-only initialPrompt is empty');
assert(hasNonemptyInitialPrompt({ initialPrompt: 'review this diff' }), 'content-bearing initialPrompt is detected');
assert(hasNonemptyInitialPrompt({ initialPrompt: '  "$task"  ' }), 'shell-significant wrapping cannot hide content');

process.stdout.write('\n-- one final write choke point --\n');
{
  const writes = [];
  const refusals = [];
  let protectedPane = 'pty1';
  const handles = new Map([
    ['pty1', { write: (bytes) => writes.push(['pty1', bytes]) }],
    ['pty2', { write: (bytes) => writes.push(['pty2', bytes]) }],
  ]);
  const boundary = createAdmissionPtyBoundary({
    getPty: (id) => handles.get(id),
    isDirectInputBlocked: (id) => id === protectedPane,
    onDirectRefusal: (id) => refusals.push(id),
  });

  const blocked = boundary.writeDirect('pty1', 'UNMETERED');
  assert(!blocked.ok && blocked.reason === WRITE_REASON.DIRECT_INPUT_BLOCKED,
    'generic input to a protected pane is refused at the final writer');
  assert(writes.length === 0 && refusals.length === 1, 'refusal performs zero PTY writes and is visible');

  const forged = boundary.writeDirect('pty1', 'FORGED', true);
  assert(!forged.ok && writes.length === 0, 'an extra boolean argument cannot forge the private capability');

  const ordinary = boundary.writeDirect('pty2', 'ordinary');
  assert(ordinary.ok && writes.length === 1 && writes[0][1] === 'ordinary',
    'generic input to an uncontrolled pane is unchanged');

  boundary.writeAdmitted('pty1', 'durably-admitted');
  assert(writes.length === 2 && writes[1][0] === 'pty1' && writes[1][1] === 'durably-admitted',
    'the main-local admitted closure can write to the protected pane');

  protectedPane = null;
  assert(boundary.writeDirect('pty1', 'after-exit').ok, 'confirmed pane exit can release direct-input protection');
  assert(boundary.writeDirect('pty404', 'missing').reason === WRITE_REASON.PTY_MISSING,
    'a missing PTY returns a bounded failure');
}

process.stdout.write('\n-- source tripwires --\n');
{
  const moduleSrc = fs.readFileSync(path.join(__dirname, 'admission-pty-boundary.js'), 'utf8');
  const mainSrc = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert((moduleSrc.match(/\.write\(bytes\)/g) || []).length === 1,
    'the boundary contains exactly one production PTY write primitive');
  assert((mainSrc.match(/\.write\(/g) || []).length === 0,
    'main has no second PTY write primitive outside the final boundary');
  assert(mainSrc.includes('writer: admissionPtyBoundary.writeAdmitted'),
    'the admission budget receives only the capability-bearing writer closure');
  assert(mainSrc.includes('admissionPtyBoundary.writeDirect(id, data)'),
    'generic pty-write also terminates at the same boundary');
}

process.stdout.write(`\nadmission-pty-boundary: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
