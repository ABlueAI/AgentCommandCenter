'use strict';
// Run: node app/pane-status/pane-status-descriptor.test.js
//
// The app-owned record, its integrity hash, its schema policy, and the atomic durable write that
// everything else in the subsystem depends on. Every path here uses a temp directory — NO test in this
// subsystem may resolve a real home directory or a real settings file.

const fs = require('fs');
const os = require('os');
const path = require('path');
const descriptorMod = require('./pane-status-descriptor');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-descriptor-'));
function freshDir() { const d = fs.mkdtempSync(path.join(root, 'ud-')); return d; }

const INSTALL = 'a'.repeat(32);
function base(over) {
  return Object.assign({
    installId: INSTALL,
    ownerMarker: 'pane-status/' + INSTALL,
    transactionState: descriptorMod.TXN.INSTALLED,
    installedGroups: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'cmd.exe', args: ['/d'] }] }] },
    installedEvents: ['Stop'],
    runtimePath: 'C:/x/electron.exe',
    runtimeSize: 123,
    runtimeMtimeMs: 456,
    shimPath: 'C:/x/shim.cmd',
    shimSha256: 'f'.repeat(64),
    reporterPath: 'C:/x/reporter.js',
    settingsPath: 'C:/x/settings.json',
    preTransactionSha256: '1'.repeat(64),
    attemptedOutputSha256: '2'.repeat(64),
    createdAt: 1000,
    updatedAt: 1000,
  }, over || {});
}

// ---------------------------------------------------------------- atomic write
{
  const dir = freshDir();
  const target = path.join(dir, 'sub', 'thing.json');
  const res = descriptorMod.atomicWriteFileSync(target, 'hello\n');
  assert(res.ok === true, 'atomicWriteFileSync creates missing parent directories and writes');
  assert(fs.readFileSync(target, 'utf8') === 'hello\n', 'the bytes landed');
  assert(res.sha256 === descriptorMod.sha256('hello\n'), 'it reports the content hash');
  descriptorMod.atomicWriteFileSync(target, 'replaced\n');
  assert(fs.readFileSync(target, 'utf8') === 'replaced\n', 'rename-over-existing replaces atomically');
  const leftovers = fs.readdirSync(path.dirname(target)).filter((f) => f.indexOf('.tmp') !== -1);
  assert(leftovers.length === 0, 'no temp file is left behind');
}

// ---------------------------------------------------------------- integrity
{
  const d = descriptorMod.buildDescriptor(base());
  assert(typeof d.integrity === 'string' && d.integrity.length === 64, 'an integrity hash is attached');
  const recomputed = descriptorMod.integrityHashOf(d);
  assert(recomputed === d.integrity, 'the hash verifies against its own descriptor');

  // key order must not matter
  const reordered = {};
  for (const k of Object.keys(d).sort().reverse()) reordered[k] = d[k];
  assert(descriptorMod.integrityHashOf(reordered) === d.integrity,
    'the hash is over canonical (sorted) content, so key order cannot change it');

  const tampered = Object.assign({}, d, { installId: 'c'.repeat(32) });
  assert(descriptorMod.integrityHashOf(tampered) !== d.integrity, 'tampering changes the hash');
}

// ---------------------------------------------------------------- forbidden content
{
  let threw = false;
  try { descriptorMod.buildDescriptor(base({ installedGroups: { Stop: [{ token: 'x' }] } })); } catch { threw = true; }
  assert(threw, 'a descriptor carrying a "token" key anywhere is REFUSED at build time');

  threw = false;
  try { descriptorMod.buildDescriptor(base({ installedGroups: { a: { b: { prompt: 'leak' } } } })); } catch { threw = true; }
  assert(threw, 'a forbidden key nested three levels deep is still refused');

  threw = false;
  try { descriptorMod.buildDescriptor(base({ transactionState: 'MADE_UP' })); } catch { threw = true; }
  assert(threw, 'an unknown transaction state is refused');

  const d = descriptorMod.buildDescriptor(base());
  const json = JSON.stringify(d);
  for (const forbidden of descriptorMod.FORBIDDEN_KEYS) {
    assert(json.indexOf('"' + forbidden + '"') === -1, `no "${forbidden}" key in a built descriptor`);
  }
}

// ---------------------------------------------------------------- write / read round trip
{
  const dir = freshDir();
  const d = descriptorMod.buildDescriptor(base());
  const w = descriptorMod.write(dir, d);
  assert(w.ok === true, 'write succeeds and self-verifies by reading back');
  assert(fs.existsSync(path.join(dir, 'pane-status-installation.json')), 'the file is at the exact documented name');
  const r = descriptorMod.read(dir);
  assert(r.ok === true && r.value.installId === INSTALL, 'read returns the descriptor');
  assert(r.value.transactionState === descriptorMod.TXN.INSTALLED, 'the transaction state round-trips');
}

// ---------------------------------------------------------------- refusals
{
  const dir = freshDir();
  assert(descriptorMod.read(dir).reason === descriptorMod.DESCRIPTOR_REFUSAL.MISSING, 'a missing descriptor is MISSING');

  fs.writeFileSync(path.join(dir, 'pane-status-installation.json'), '{not json');
  assert(descriptorMod.read(dir).reason === descriptorMod.DESCRIPTOR_REFUSAL.MALFORMED, 'unparseable is MALFORMED');

  fs.writeFileSync(path.join(dir, 'pane-status-installation.json'), '[]');
  assert(descriptorMod.read(dir).reason === descriptorMod.DESCRIPTOR_REFUSAL.MALFORMED, 'a top-level array is MALFORMED');

  // corrupt integrity
  const good = descriptorMod.buildDescriptor(base());
  const corrupt = Object.assign({}, good, { installedEvents: ['Stop', 'SessionEnd'] });   // hash no longer matches
  fs.writeFileSync(path.join(dir, 'pane-status-installation.json'), JSON.stringify(corrupt, null, 2) + '\n');
  assert(descriptorMod.read(dir).reason === descriptorMod.DESCRIPTOR_REFUSAL.INTEGRITY,
    'content changed without rehashing is an INTEGRITY failure');

  // newer schema -> refuse READ-ONLY
  const newer = Object.assign({}, good, { schemaVersion: descriptorMod.SCHEMA_VERSION + 1 });
  newer.integrity = descriptorMod.integrityHashOf(newer);
  fs.writeFileSync(path.join(dir, 'pane-status-installation.json'), JSON.stringify(newer, null, 2) + '\n');
  const nr = descriptorMod.read(dir);
  assert(nr.ok === false && nr.reason === descriptorMod.DESCRIPTOR_REFUSAL.NEWER_SCHEMA && nr.readOnly === true,
    'a NEWER schema is refused READ-ONLY — we never overwrite a future build\'s record');

  // older schema -> only an explicit migration, which does not exist yet
  const older = Object.assign({}, good, { schemaVersion: 0 });
  older.integrity = descriptorMod.integrityHashOf(older);
  fs.writeFileSync(path.join(dir, 'pane-status-installation.json'), JSON.stringify(older, null, 2) + '\n');
  assert(descriptorMod.read(dir).ok === false, 'an older schema without a tested migration is refused, not guessed at');
}

// ---------------------------------------------------------------- remove
{
  const dir = freshDir();
  descriptorMod.write(dir, descriptorMod.buildDescriptor(base()));
  assert(descriptorMod.exists(dir) === true, 'exists() sees it');
  assert(descriptorMod.remove(dir).ok === true, 'remove succeeds');
  assert(descriptorMod.exists(dir) === false, 'and it is gone');
  assert(descriptorMod.remove(dir).ok === true, 'removing a missing descriptor is idempotent, not an error');
}

// ---------------------------------------------------------------- every transaction state is representable
for (const state of descriptorMod.TXN_STATES) {
  const dir = freshDir();
  const w = descriptorMod.write(dir, descriptorMod.buildDescriptor(base({ transactionState: state })));
  assert(w.ok === true && descriptorMod.read(dir).value.transactionState === state,
    `transaction state ${state} round-trips`);
}

try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
process.stdout.write(`\npane-status-descriptor: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
