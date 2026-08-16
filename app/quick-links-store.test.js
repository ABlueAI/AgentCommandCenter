'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createQuickLinksStore, CONFIG_FILENAME, STORE_REASON } = require('./quick-links-store');
const { SCHEMA_VERSION, MAX_CONFIG_BYTES, REASON, buildDefaultConfig } = require('./quick-links-policy');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
function eq(actual, expected, label) { assert(actual === expected, `${label} (got ${JSON.stringify(actual)})`); }
function fixtureConfig(label = 'Fixture') {
  return { schemaVersion: SCHEMA_VERSION, entries: [{ id: 'ql-fixture', label, url: 'https://fixture.test.invalid/path' }] };
}
function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'quick-links-store-')); }
function cleanup(dir) { fs.rmSync(dir, { recursive: true, force: true }); }

process.stdout.write('\nfirst-run seed and round trip\n');
{
  const dir = tempDir();
  try {
    const defaults = buildDefaultConfig({
      starboardUrl: 'https://starboard.test.invalid/login',
      outlookUrl: 'https://outlook.test.invalid/mail',
    }).config;
    const store = createQuickLinksStore({ userDataDir: dir, defaultConfig: defaults });
    const first = store.load();
    assert(first.ok, 'missing config atomically persists explicit fixture defaults');
    eq(first.config.entries.length, 2, 'first run returns exactly two defaults');
    eq(first.config.entries[0].label, 'Starboard Platform', 'first default has exact label');
    eq(first.config.entries[1].label, 'Outlook Web', 'second default has exact label');
    assert(fs.existsSync(path.join(dir, CONFIG_FILENAME)), 'fixed userData config file exists');
    const second = store.load();
    assert(second.ok && second.config.entries.length === 2, 'persisted defaults round trip');
    const saved = store.saveText(JSON.stringify(fixtureConfig('Changed')));
    assert(saved.ok, 'valid explicit save replaces prior valid config');
    eq(store.load().config.entries[0].label, 'Changed', 'saved config round trips');
    assert(fs.readdirSync(dir).every((name) => !name.endsWith('.tmp')), 'successful writes leave no temp file');
  } finally { cleanup(dir); }
}

process.stdout.write('\nmissing defaults and malformed persisted data fail closed\n');
{
  const dir = tempDir();
  try {
    const store = createQuickLinksStore({ userDataDir: dir });
    eq(store.load().reason, STORE_REASON.DEFAULTS_UNAVAILABLE, 'missing file without approved defaults refuses visibly');
    const file = path.join(dir, CONFIG_FILENAME);
    fs.writeFileSync(file, '{broken', 'utf8');
    const before = fs.readFileSync(file);
    eq(store.load().reason, REASON.INVALID_JSON, 'malformed JSON refuses');
    eq(store.saveText(JSON.stringify(fixtureConfig())).reason, STORE_REASON.EXISTING_CONFIG_INVALID,
      'save refuses to overwrite malformed existing user data');
    assert(fs.readFileSync(file).equals(before), 'corrupt bytes are preserved exactly after load/save refusals');
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 99, entries: [] }));
    eq(store.load().reason, REASON.VERSION_MISMATCH, 'version-mismatched persisted config refuses');
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: SCHEMA_VERSION, entries: [], extra: true }));
    eq(store.load().reason, REASON.CONFIG_UNKNOWN_FIELD, 'unknown persisted field refuses');
    fs.writeFileSync(file, 'x'.repeat(MAX_CONFIG_BYTES + 1));
    eq(store.load().reason, REASON.CONFIG_TOO_LARGE, 'oversized file refuses before read/parse');
    fs.writeFileSync(file, Buffer.from([0x7b, 0x80, 0x7d]));
    eq(store.load().reason, STORE_REASON.INVALID_UTF8, 'invalid UTF-8 refuses');
  } finally { cleanup(dir); }
}

process.stdout.write('\nfile identity/read guards\n');
{
  const statBase = { size: 1, isFile: () => true, isSymbolicLink: () => false };
  const fake = (overrides) => Object.assign({
    lstatSync: () => statBase,
    readFileSync: () => Buffer.from('{}'),
  }, overrides);
  eq(createQuickLinksStore({ userDataDir: 'X:\\fixed', fsImpl: fake({
    lstatSync: () => ({ ...statBase, isSymbolicLink: () => true }),
  }) }).load().reason, STORE_REASON.REPARSE_POINT, 'reparse point refuses before read');
  eq(createQuickLinksStore({ userDataDir: 'X:\\fixed', fsImpl: fake({
    lstatSync: () => ({ ...statBase, isFile: () => false }),
  }) }).load().reason, STORE_REASON.NOT_REGULAR_FILE, 'non-regular file refuses');
  eq(createQuickLinksStore({ userDataDir: 'X:\\fixed', fsImpl: fake({
    readFileSync: () => { throw new Error('sentinel read failure'); },
  }) }).load().reason, STORE_REASON.READ_FAILED, 'read exception becomes bounded refusal');
  eq(createQuickLinksStore({ userDataDir: 'X:\\fixed', fsImpl: fake({
    lstatSync: () => { const error = new Error('sentinel access'); error.code = 'EACCES'; throw error; },
  }) }).load().reason, STORE_REASON.READ_FAILED, 'inspection failure is not misreported as absence');
}

process.stdout.write('\natomic replacement and recovery behavior\n');
{
  const dir = tempDir();
  try {
    const file = path.join(dir, CONFIG_FILENAME);
    fs.writeFileSync(file, JSON.stringify(fixtureConfig('Original')), 'utf8');
    const before = fs.readFileSync(file);
    let renameCalls = 0, fsyncCalls = 0;
    const faultFs = Object.assign({}, fs, {
      fsyncSync: (fd) => { fsyncCalls += 1; fs.fsyncSync(fd); },
      renameSync: () => { renameCalls += 1; throw new Error('raw-url=https://sentinel.invalid/?secret=1'); },
    });
    const failedSave = createQuickLinksStore({ userDataDir: dir, fsImpl: faultFs })
      .saveText(JSON.stringify(fixtureConfig('Replacement')));
    eq(failedSave.reason, STORE_REASON.WRITE_FAILED, 'rename failure becomes bounded write refusal');
    eq(renameCalls, 1, 'atomic replacement is attempted exactly once');
    eq(fsyncCalls, 1, 'temp bytes are flushed before replacement');
    assert(fs.readFileSync(file).equals(before), 'prior valid canonical file survives failed replacement byte-for-byte');
    assert(fs.readdirSync(dir).every((name) => !name.endsWith('.tmp')), 'failed replacement cleans its temp file');
    const recovered = createQuickLinksStore({ userDataDir: dir }).load();
    eq(recovered.config.entries[0].label, 'Original', 'old valid config remains recoverable after write failure');
  } finally { cleanup(dir); }
}

process.stdout.write('\nraw save bounds and closed schema\n');
{
  const dir = tempDir();
  try {
    const store = createQuickLinksStore({ userDataDir: dir });
    eq(store.saveText('x'.repeat(MAX_CONFIG_BYTES + 1)).reason, REASON.CONFIG_TOO_LARGE,
      'save refuses over-bound text before parsing or writing');
    eq(store.saveText(JSON.stringify({ ...fixtureConfig(), extra: 'no' })).reason, REASON.CONFIG_UNKNOWN_FIELD,
      'save refuses closed-schema violation');
    assert(!fs.existsSync(path.join(dir, CONFIG_FILENAME)), 'invalid saves create no canonical file');
  } finally { cleanup(dir); }
}

process.stdout.write(`\nquick-links-store: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
