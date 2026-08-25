'use strict';
// Run: node app/pane-status/pane-status-settings-doc.test.js
//
// Ownership classification and the preservation rules. The assertions that matter most here are the
// NEGATIVE ones: what we refuse to touch, and what survives an install and a removal untouched.

const path = require('path');
const doc = require('./pane-status-settings-doc');
const shimMod = require('./pane-status-runtime-shim');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const MINE = 'a'.repeat(32);
const THEIRS = 'b'.repeat(32);
const CMD = shimMod.resolveCmdExe();
const userData = path.join('C:', 'Users', 'x', 'AppData', 'Roaming', 'Blue Helm');

const myShim = doc.buildShimPath(userData, MINE);
const theirShim = doc.buildShimPath(path.join('C:', 'Users', 'other', 'AppData', 'Roaming', 'Blue Helm'), THEIRS);
const myGroups = doc.buildHookGroups({ cmdExe: CMD, shimPath: myShim });
const theirGroups = doc.buildHookGroups({ cmdExe: CMD, shimPath: theirShim });

// ---------------------------------------------------------------- shape
assert(Object.keys(myGroups).length === 8, 'eight event groups are built');
assert(doc.INSTALLED_EVENTS.length === 8, 'the installed-event list has eight entries');
const entry = myGroups.SessionStart[0].hooks[0];
assert(entry.type === 'command', 'the entry type is "command"');
assert(entry.command === CMD && path.isAbsolute(entry.command), 'command is an ABSOLUTE cmd.exe');
assert(Array.isArray(entry.args) && entry.args[0] === '/d' && entry.args[1] === '/c',
  'args begin /d /c — NOT /s, which strips quoting and breaks paths with spaces');
assert(entry.args.slice(-6).join(' ') === '>nul 2>nul & exit /b 0',
  'args end with the suppression and the forced zero exit, as separate argv elements');
assert(typeof entry.timeout === 'number', 'a per-hook timeout is set');
assert(entry.args.every((a) => a.indexOf('"') === -1),
  'NO argument contains a quote — quotes get backslash-escaped by the argv encoder and cmd.exe cannot read them');
assert(myGroups.SessionStart[0].matcher === '', 'the matcher is empty, meaning match-all');

// ---------------------------------------------------------------- owner marker recovery
assert(doc.installIdOf(entry) === MINE, 'the install id is recoverable from the entry alone');
assert(doc.installIdOf(theirGroups.Stop[0].hooks[0]) === THEIRS, 'another install id is recovered too');
assert(doc.installIdOf({ type: 'command', command: 'echo', args: ['hi'] }) === null, 'a foreign hook has no install id');
assert(doc.installIdOf({ type: 'command', command: 'echo hi' }) === null, 'a shell-form hook has no install id');
assert(doc.unescapeFromCmd('C:\\a^ b\\c^&d') === 'C:\\a b\\c&d', 'caret-escaping round-trips exactly');

// ---------------------------------------------------------------- classification
function classify(settings, groups, id) { return doc.classifyDocument(settings, groups || myGroups, id || MINE).overall; }

assert(classify({}) === doc.OWNERSHIP.ABSENT, 'an empty document is ABSENT');
assert(classify({ hooks: {} }) === doc.OWNERSHIP.ABSENT, 'an empty hooks map is ABSENT');
assert(classify({ hooks: myGroups }) === doc.OWNERSHIP.OWNED_EXACT, 'our own groups are OWNED_EXACT');
assert(classify({ hooks: theirGroups }) === doc.OWNERSHIP.OTHER_INSTALL,
  'another Blue Helm installation is OWNED_BY_ANOTHER_INSTALLATION, never adopted');

const foreign = { hooks: { SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'echo hi' }] }] } };
assert(classify(foreign) === doc.OWNERSHIP.ABSENT, 'unrelated foreign hooks alone leave us ABSENT (nothing of ours)');

// modified: same install id, different args
const modified = JSON.parse(JSON.stringify(myGroups));
modified.SessionStart[0].hooks[0].timeout = 99;
assert(classify({ hooks: modified }) === doc.OWNERSHIP.OWNED_MODIFIED, 'a tampered entry is OWNED_MODIFIED');

// partial install
const partial = JSON.parse(JSON.stringify(myGroups));
delete partial.PostToolUse;
assert(classify({ hooks: partial }) === doc.OWNERSHIP.OWNED_MODIFIED, 'a PARTIAL install is OWNED_MODIFIED, not exact');

// ambiguous: our hook sharing a matcher group with somebody else's
const ambiguous = JSON.parse(JSON.stringify(myGroups));
ambiguous.SessionStart[0].hooks.push({ type: 'command', command: 'echo other' });
assert(classify({ hooks: ambiguous }) === doc.OWNERSHIP.AMBIGUOUS,
  'our hook sharing a matcher group with a foreign hook is AMBIGUOUS — we will not rewrite it');

// duplicated ours
const duped = JSON.parse(JSON.stringify(myGroups));
duped.SessionStart.push(JSON.parse(JSON.stringify(myGroups.SessionStart[0])));
assert(classify({ hooks: duped }) === doc.OWNERSHIP.AMBIGUOUS, 'two copies of our own group is AMBIGUOUS');

// a blocking event poisons the whole verdict
const mixed = JSON.parse(JSON.stringify(myGroups));
mixed.Stop = theirGroups.Stop;
assert(classify({ hooks: mixed }) === doc.OWNERSHIP.OTHER_INSTALL,
  'ONE event owned by another installation blocks the entire document');

// ---------------------------------------------------------------- preservation on install
{
  const before = {
    theme: 'dark',
    permissions: { allow: ['Bash(npm test)'] },
    hooks: {
      SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'echo unrelated' }] }],
      SomeOtherEvent: [{ matcher: '', hooks: [{ type: 'command', command: 'echo keep me' }] }],
    },
  };
  const after = doc.withInstalled(before, myGroups);
  assert(after.theme === 'dark', 'an unrelated top-level key survives');
  assert(JSON.stringify(after.permissions) === JSON.stringify(before.permissions), 'unrelated nested settings survive');
  assert(after.hooks.SomeOtherEvent.length === 1, 'an event group we do not install survives untouched');
  assert(after.hooks.SessionStart.length === 2, 'an existing group on an event we DO install is preserved beside ours');
  assert(after.hooks.SessionStart[0].hooks[0].command === 'echo unrelated', 'and it stays FIRST — we append');
  assert(before.hooks.SessionStart.length === 1, 'the input document is not mutated');
}

// ---------------------------------------------------------------- preservation on removal
{
  const installed = doc.withInstalled({
    theme: 'dark',
    hooks: { SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'echo unrelated' }] }] },
  }, myGroups);

  // A change made AFTER setup must survive removal.
  installed.newSetting = 'added later';
  installed.hooks.Stop.push({ matcher: '', hooks: [{ type: 'command', command: 'echo added later' }] });

  const after = doc.withRemoved(installed, myGroups);
  assert(after.theme === 'dark', 'unrelated settings survive removal');
  assert(after.newSetting === 'added later', 'a setting added AFTER setup survives removal');
  assert(after.hooks.SessionStart.length === 1 && after.hooks.SessionStart[0].hooks[0].command === 'echo unrelated',
    'the pre-existing unrelated group survives removal');
  assert(after.hooks.Stop.length === 1 && after.hooks.Stop[0].hooks[0].command === 'echo added later',
    'a hook group added after setup survives removal');
  assert(after.hooks.PostToolUse === undefined, 'an event that held only our group is deleted entirely');
}

// removal targets the RECORDED group, not what this build would emit now
{
  const oldShim = doc.buildShimPath(userData, MINE);
  const recorded = doc.buildHookGroups({ cmdExe: CMD, shimPath: oldShim, timeoutSeconds: 3 });
  const installed = doc.withInstalled({}, recorded);
  const currentBuild = doc.buildHookGroups({ cmdExe: CMD, shimPath: oldShim, timeoutSeconds: 5 });

  const wrongTarget = doc.withRemoved(installed, currentBuild);
  assert(wrongTarget.hooks && wrongTarget.hooks.Stop, 'removing "what this build would install" MISSES the recorded group');
  const rightTarget = doc.withRemoved(installed, recorded);
  assert(rightTarget.hooks === undefined, 'removing the RECORDED group succeeds — which is why the descriptor stores it');
}

// ---------------------------------------------------------------- serialize / parse
assert(doc.serialize({}) === '{}\n', 'an empty document serializes to {} plus a newline, never to nothing');
assert(doc.parse('').ok === true && Object.keys(doc.parse('').value).length === 0, 'an empty file parses as an empty document');
assert(doc.parse('   \n ').ok === true, 'a whitespace-only file parses as an empty document');
assert(doc.parse('{oops').ok === false, 'malformed JSON is refused');
assert(doc.parse('[1,2]').ok === false, 'a top-level array is refused');
assert(doc.parse(doc.serialize({ a: 1 })).value.a === 1, 'serialize/parse round-trips');

// -------------------------------------------------------------------------------------------------
// THE `hooks` SUBTREE MUST BE THE SHAPE THE PROVIDER SCHEMA DESCRIBES (advisory review, finding 10)
// -------------------------------------------------------------------------------------------------
// The previous build tested `typeof settings.hooks === 'object'`, which is TRUE for an array and for
// null. An ARRAY therefore flowed into `Object.assign({}, base.hooks)` and came back out as an object
// with numeric keys — a silent structural rewrite of a file we do not own. A SCALAR was replaced
// outright. Both are now visible refusals that write nothing.
process.stdout.write('\nmalformed hooks structures REFUSE rather than being transformed\n');
{
  const bad = [
    ['an array', { hooks: [] }, doc.HOOKS_REFUSAL.NOT_AN_OBJECT],
    ['a populated array', { hooks: [{ matcher: '', hooks: [] }] }, doc.HOOKS_REFUSAL.NOT_AN_OBJECT],
    ['a string', { hooks: 'enabled' }, doc.HOOKS_REFUSAL.NOT_AN_OBJECT],
    ['a number', { hooks: 3 }, doc.HOOKS_REFUSAL.NOT_AN_OBJECT],
    ['a boolean', { hooks: true }, doc.HOOKS_REFUSAL.NOT_AN_OBJECT],
    ['null', { hooks: null }, doc.HOOKS_REFUSAL.NULL],
    ['an installed event holding an object', { hooks: { Stop: { matcher: '' } } }, doc.HOOKS_REFUSAL.EVENT_NOT_AN_ARRAY],
    ['an installed event holding a string', { hooks: { PreToolUse: 'x' } }, doc.HOOKS_REFUSAL.EVENT_NOT_AN_ARRAY],
    ['a matcher group that is a scalar', { hooks: { Stop: ['nope'] } }, doc.HOOKS_REFUSAL.GROUP_MALFORMED],
    ['a matcher group that is an array', { hooks: { Stop: [[]] } }, doc.HOOKS_REFUSAL.GROUP_MALFORMED],
    ['a matcher group whose hooks is not an array', { hooks: { Stop: [{ matcher: '', hooks: {} }] } }, doc.HOOKS_REFUSAL.GROUP_MALFORMED],
  ];
  for (const [label, value, reason] of bad) {
    const v = doc.validateHooksStructure(value);
    assert(v.ok === false, `hooks as ${label} is REFUSED`);
    assert(v.reason === reason, `  with reason ${reason} (got ${v.reason})`);
  }

  const good = [
    ['absent entirely', {}],
    ['an empty object', { hooks: {} }],
    ['a well-formed installed event', { hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'x' }] }] } }],
    ['an UNRELATED event with a shape we do not understand', { hooks: { PreCompact: 'whatever it means' } }],
    ['a group with no hooks key at all', { hooks: { Stop: [{ matcher: 'Bash' }] } }],
  ];
  for (const [label, value] of good) {
    assert(doc.validateHooksStructure(value).ok === true, `hooks ${label} is accepted`);
  }

  // NEGATIVE CONTROL: the transformation the old guard performed must not be reachable any more.
  const arrayHooks = { hooks: [{ matcher: '', hooks: [] }] };
  const wouldHaveBeen = Object.assign({}, arrayHooks.hooks);
  assert(Object.prototype.hasOwnProperty.call(wouldHaveBeen, '0'),
    'NEGATIVE CONTROL: spreading an array really does produce numeric keys — that was the defect');
  assert(doc.validateHooksStructure(arrayHooks).ok === false,
    'and the structural gate now stops it before any spread happens');
}

// -------------------------------------------------------------------------------------------------
// KEY-ORDER-INDEPENDENT EQUALITY (advisory review, finding 4)
// -------------------------------------------------------------------------------------------------
process.stdout.write('\ndeepEqual compares meaning, not serialization\n');
{
  assert(doc.deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), 'key order does not matter');
  assert(doc.deepEqual({ a: [{ x: 1, y: 2 }] }, { a: [{ y: 2, x: 1 }] }), 'nested key order does not matter either');
  assert(!doc.deepEqual([1, 2], [2, 1]), 'ARRAY order still does — hook order is meaningful');
  assert(!doc.deepEqual({ a: 1 }, { a: 1, b: undefined }), 'an extra key is a difference even when undefined');
  assert(!doc.deepEqual({ a: 1 }, { a: '1' }), 'a type change is a difference');
  assert(!doc.deepEqual({ a: 1 }, null), 'null is not an empty object');
  assert(!doc.deepEqual([], {}), 'an array is not an object');
  assert(doc.deepEqual(null, null) && doc.deepEqual(3, 3) && doc.deepEqual('x', 'x'), 'primitives compare by value');
  assert(JSON.stringify({ a: 1, b: 2 }) !== JSON.stringify({ b: 2, a: 1 }),
    'NEGATIVE CONTROL: JSON.stringify DOES disagree on key order — which is why it was the wrong tool');
}

process.stdout.write(`\npane-status-settings-doc: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
