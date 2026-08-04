'use strict';
// Run: node app/dockview-layout-store.test.js
// Plain Node.js — exercises the ACTUAL main-owned Dockview prototype layout trust boundary.
//
// Saved layout state is a file on disk, so it is untrusted input. Dockview's own `fromJSON` does no
// validation, so every guarantee lives in dockview-layout-store.js and is pinned here.
//
// The anchor test is the CONTROLLED FIXTURE: app/test-fixtures/dockview-7.0.4-layout.json was
// produced by app/dockview-tripwire.js from a real dockview@7.0.4 workspace (two terminals + a
// Library pane, split into two groups with a tab group). If a future Dockview version changes its
// serialization, that test fails loudly rather than this validator drifting toward permissiveness.

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createLayoutStore, validateEnvelope, validateLayout, buildEnvelope,
  REASON, LAYOUT_FILENAME, MAX_RAW_BYTES, MAX_DEPTH, MAX_PANELS, MAX_GROUPS,
} = require('./dockview-layout-store');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-fixtures', 'dockview-7.0.4-layout.json'), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const envelopeOf = (layout) => ({
  schemaVersion: 1, package: 'dockview', packageVersion: '7.0.4',
  savedAt: '2026-08-04T12:00:00Z', layout,
});
const verdict = (layout) => validateEnvelope(envelopeOf(layout));

// ---------------------------------------------------------------------------
process.stdout.write('\nthe controlled dockview@7.0.4 fixture is accepted\n');
// ---------------------------------------------------------------------------
{
  const v = verdict(clone(FIXTURE));
  assert(v.ok === true, 'the real dockview@7.0.4 layout validates (validator is not over-fit)');
  assert(validateLayout(clone(FIXTURE)) === null, 'validateLayout returns null for the real fixture');

  // Pin the shape the validator was derived FROM, so a serialization change is visible here.
  const panelKeys = Object.values(FIXTURE.panels).map(p => Object.keys(p).sort().join('+'));
  assert(panelKeys.every(k => k === 'contentComponent+id+title'),
    'fixture panels carry exactly id + contentComponent + title (no params key)');
  assert(!Object.prototype.hasOwnProperty.call(FIXTURE, 'floatingGroups')
      && !Object.prototype.hasOwnProperty.call(FIXTURE, 'popoutGroups')
      && !Object.prototype.hasOwnProperty.call(FIXTURE, 'edgeGroups'),
    'fixture carries no floatingGroups / popoutGroups / edgeGroups');
  assert(FIXTURE.grid.root.type === 'branch' && FIXTURE.grid.root.data.length === 2,
    'fixture exercises a real split (branch with two leaves)');
  assert(FIXTURE.grid.root.data.some(n => n.data.views.length === 2),
    'fixture exercises a real tab group (a leaf holding two views)');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nenvelope contract\n');
// ---------------------------------------------------------------------------
{
  assert(validateEnvelope(null).reason === REASON.ENVELOPE_SHAPE, 'null is refused');
  assert(validateEnvelope([]).reason === REASON.ENVELOPE_SHAPE, 'an array is refused');
  assert(validateEnvelope('{}').reason === REASON.ENVELOPE_SHAPE, 'a string is refused');

  const extra = envelopeOf(clone(FIXTURE)); extra.extraKey = 1;
  assert(validateEnvelope(extra).reason === REASON.ENVELOPE_SHAPE, 'an unknown top-level key is refused');

  const missing = envelopeOf(clone(FIXTURE)); delete missing.savedAt;
  assert(validateEnvelope(missing).reason === REASON.ENVELOPE_SHAPE, 'a missing envelope key is refused');

  for (const [v, label] of [[0, '0'], [2, '2'], ['1', 'the string "1"'], [null, 'null']]) {
    const e = envelopeOf(clone(FIXTURE)); e.schemaVersion = v;
    assert(validateEnvelope(e).reason === REASON.SCHEMA_VERSION, `schemaVersion ${label} is refused`);
  }
  const wrongPkg = envelopeOf(clone(FIXTURE)); wrongPkg.package = 'dockview-core';
  assert(validateEnvelope(wrongPkg).reason === REASON.PACKAGE, 'a different package name is refused');

  for (const bad of ['7.0.3', '7.0.5', '7.0.4-beta', '']) {
    const e = envelopeOf(clone(FIXTURE)); e.packageVersion = bad;
    assert(validateEnvelope(e).reason === REASON.PACKAGE_VERSION, `packageVersion "${bad}" is refused`);
  }
}

// ---------------------------------------------------------------------------
process.stdout.write('\nsavedAt must be a real UTC ISO-8601 instant\n');
// ---------------------------------------------------------------------------
{
  for (const good of ['2026-08-04T12:00:00Z', '2026-01-01T00:00:00.123Z']) {
    const e = envelopeOf(clone(FIXTURE)); e.savedAt = good;
    assert(validateEnvelope(e).ok === true, `"${good}" is accepted`);
  }
  for (const bad of [
    '2026-08-04T12:00:00',            // no zone
    '2026-08-04T12:00:00+01:00',      // not UTC
    '2026-13-45T99:99:99Z',           // impossible instant a lenient parse would coerce
    '2026-08-04',                     // date only
    'not-a-date', '', 'Z'.repeat(60),
  ]) {
    const e = envelopeOf(clone(FIXTURE)); e.savedAt = bad;
    assert(validateEnvelope(e).reason === REASON.TIMESTAMP, `savedAt "${bad.slice(0, 24)}" is refused`);
  }
  const num = envelopeOf(clone(FIXTURE)); num.savedAt = 1785000000000;
  assert(validateEnvelope(num).reason === REASON.TIMESTAMP, 'a numeric savedAt is refused');

  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(buildEnvelope({}, Date.UTC(2026, 7, 4, 12)).savedAt),
    'buildEnvelope emits a second-precision UTC ISO-8601 stamp');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nprototype-pollution keys are refused at every depth\n');
// ---------------------------------------------------------------------------
{
  // JSON.parse creates a REAL own property named __proto__, so these must be caught structurally.
  const atRoot = JSON.parse('{"schemaVersion":1,"package":"dockview","packageVersion":"7.0.4","savedAt":"2026-08-04T12:00:00Z","layout":{},"__proto__":{"polluted":true}}');
  assert(validateEnvelope(atRoot).reason === REASON.FORBIDDEN_KEY, '__proto__ on the envelope is refused');

  const inLayout = clone(FIXTURE);
  const withProto = JSON.parse(JSON.stringify(inLayout).replace('"panels":{', '"panels":{"__proto__":{"a":1},'));
  assert(verdict(withProto).reason === REASON.FORBIDDEN_KEY, '__proto__ inside panels is refused');

  const inNode = JSON.parse(JSON.stringify(clone(FIXTURE)).replace('"type":"branch"', '"constructor":{},"type":"branch"'));
  assert(verdict(inNode).reason === REASON.FORBIDDEN_KEY, 'constructor inside a grid node is refused');

  const deepProto = clone(FIXTURE);
  const raw = JSON.stringify(envelopeOf(deepProto)).replace('"views":[', '"prototype":{},"views":[');
  assert(validateEnvelope(JSON.parse(raw)).reason === REASON.FORBIDDEN_KEY, 'prototype inside a leaf group is refused');

  assert(({}).polluted === undefined, 'no test above actually polluted Object.prototype');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nunknown keys are refused (strict allowlist, not a blocklist)\n');
// ---------------------------------------------------------------------------
{
  for (const key of ['floatingGroups', 'popoutGroups', 'edgeGroups']) {
    const l = clone(FIXTURE); l[key] = [];
    assert(verdict(l).reason === REASON.LAYOUT_SHAPE, `${key} is refused (popouts/floating are out of scope)`);
  }
  const withParams = clone(FIXTURE);
  withParams.panels.pty1.params = { cwd: 'D:\\Workspace\\secret' };
  assert(verdict(withParams).reason === REASON.LAYOUT_SHAPE,
    'a panel carrying params is refused — presence alone, before content is considered');

  const withParamsEmpty = clone(FIXTURE);
  withParamsEmpty.panels.pty1.params = {};
  assert(verdict(withParamsEmpty).reason === REASON.LAYOUT_SHAPE, 'even an EMPTY params object is refused');

  const extraNodeKey = clone(FIXTURE); extraNodeKey.grid.root.hidden = true;
  assert(verdict(extraNodeKey).reason === REASON.LAYOUT_SHAPE, 'an unknown grid-node key is refused');

  const extraGroupKey = clone(FIXTURE); extraGroupKey.grid.root.data[0].data.tabGroups = [];
  assert(verdict(extraGroupKey).reason === REASON.LAYOUT_SHAPE, 'an unknown leaf-group key is refused');

  const extraGridKey = clone(FIXTURE); extraGridKey.grid.margin = 4;
  assert(verdict(extraGridKey).reason === REASON.LAYOUT_SHAPE, 'an unknown grid key is refused');
}

// ---------------------------------------------------------------------------
process.stdout.write('\ncomponent kinds and pane identity\n');
// ---------------------------------------------------------------------------
{
  for (const kind of ['iframe', 'webview', 'Terminal', 'terminal ', '', 'script']) {
    const l = clone(FIXTURE); l.panels.pty1.contentComponent = kind;
    assert(verdict(l).reason === REASON.UNKNOWN_COMPONENT, `component kind "${kind}" is refused`);
  }
  const bothKinds = clone(FIXTURE);
  assert(verdict(bothKinds).ok === true, 'the two allowlisted kinds (terminal, library) are accepted');

  for (const id of ['pty', 'PTY1', 'shell1', 'pty1234567', 'library2']) {
    const l = clone(FIXTURE);
    l.panels[id] = { id, contentComponent: 'terminal', title: 'X' };
    l.grid.root.data[0].data.views.push(id);
    assert(verdict(l).reason === REASON.UNKNOWN_PANE_ID, `pane id "${id}" is refused (not a known prototype id)`);
  }
  // A path-shaped id is refused one guard EARLIER than the pane-id allowlist: the string content
  // check rejects separators and traversal first. Pinning the earlier reason keeps the two guards
  // from silently swapping order without a test noticing.
  {
    const l = clone(FIXTURE);
    l.panels['../etc'] = { id: '../etc', contentComponent: 'terminal', title: 'X' };
    l.grid.root.data[0].data.views.push('../etc');
    assert(verdict(l).reason === REASON.UNSAFE_CONTENT,
      'a path-shaped pane id is refused as unsafe content, before the pane-id allowlist is reached');
  }

  const mismatch = clone(FIXTURE); mismatch.panels.pty1.id = 'pty2';
  assert(verdict(mismatch).reason === REASON.LAYOUT_SHAPE, 'a panel whose id disagrees with its map key is refused');

  const dupView = clone(FIXTURE);
  dupView.grid.root.data[0].data.views = ['pty1'];
  dupView.grid.root.data[1].data.views = ['pty1', 'pty2', 'library'];
  assert(verdict(dupView).reason === REASON.DUPLICATE_PANE_ID, 'the same pane appearing in two groups is refused');

  const orphanPanel = clone(FIXTURE);
  orphanPanel.panels.pty3 = { id: 'pty3', contentComponent: 'terminal', title: 'Orphan' };
  assert(verdict(orphanPanel).reason === REASON.LAYOUT_SHAPE,
    'a panel not referenced by the grid is refused (it would restore as a silently-missing pane)');

  const danglingView = clone(FIXTURE);
  delete danglingView.panels.library;
  assert(verdict(danglingView).reason === REASON.LAYOUT_SHAPE, 'a grid view with no matching panel is refused');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nno paths, URLs, or credential-shaped content may survive validation\n');
// ---------------------------------------------------------------------------
{
  for (const title of [
    'D:\\Workspace\\agent-command-center',
    '/home/levi/secret',
    'https://example.com/report',
    'file:///D:/x',
    '../../etc/passwd',
    'api_key=abc123',
    'Bearer eyJhbGciOi',
    'password: hunter2',
    'line1\nline2',
  ]) {
    const l = clone(FIXTURE); l.panels.pty1.title = title;
    assert(verdict(l).reason === REASON.UNSAFE_CONTENT, `title carrying "${title.slice(0, 28)}" is refused`);
  }
  const longTitle = clone(FIXTURE); longTitle.panels.pty1.title = 'T'.repeat(201);
  assert(verdict(longTitle).reason === REASON.STRING_TOO_LONG, 'an over-long title is refused');

  const plain = clone(FIXTURE); plain.panels.pty1.title = 'Terminal 1';
  assert(verdict(plain).ok === true, 'an ordinary display title is still accepted');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nstructural bounds\n');
// ---------------------------------------------------------------------------
{
  // depth
  const deep = clone(FIXTURE);
  let node = deep.grid.root;
  for (let i = 0; i < MAX_DEPTH + 2; i++) {
    const child = { type: 'branch', data: [], size: 100 };
    node.data = [child];
    node = child;
  }
  node.type = 'leaf';
  node.data = { views: ['pty1'], activeView: 'pty1', id: 'g' };
  assert(verdict(deep).reason === REASON.TOO_DEEP, `nesting deeper than ${MAX_DEPTH} is refused`);

  // group budget
  const manyGroups = clone(FIXTURE);
  manyGroups.grid.root.data = [];
  for (let i = 0; i < MAX_GROUPS + 5; i++) {
    manyGroups.grid.root.data.push({ type: 'leaf', data: { views: [], id: 'g' + i }, size: 1 });
  }
  manyGroups.panels = {};
  assert(verdict(manyGroups).reason === REASON.TOO_MANY_GROUPS, `more than ${MAX_GROUPS} groups is refused`);

  // panel budget
  const manyPanels = clone(FIXTURE);
  manyPanels.panels = {};
  for (let i = 0; i < MAX_PANELS + 5; i++) {
    manyPanels.panels['pty' + i] = { id: 'pty' + i, contentComponent: 'terminal', title: 'T' };
  }
  assert(verdict(manyPanels).reason === REASON.TOO_MANY_PANELS, `more than ${MAX_PANELS} panels is refused`);

  // array bound
  const bigViews = clone(FIXTURE);
  bigViews.grid.root.data[0].data.views = Array.from({ length: 200 }, (_, i) => 'pty' + i);
  assert(verdict(bigViews).reason === REASON.ARRAY_TOO_LONG, 'an over-long views array is refused');

  // numbers
  for (const bad of [NaN, Infinity, -Infinity, '100', null]) {
    const l = clone(FIXTURE); l.grid.width = bad;
    const r = verdict(l);
    assert(r.ok === false, `grid.width = ${String(bad)} is refused`);
  }
  const badSize = clone(FIXTURE); badSize.grid.root.size = Infinity;
  assert(verdict(badSize).reason === REASON.NON_FINITE, 'a non-finite node size is refused');

  // node type
  const badType = clone(FIXTURE); badType.grid.root.type = 'root';
  assert(verdict(badType).reason === REASON.LAYOUT_SHAPE, 'a node type other than leaf/branch is refused');

  const badOrientation = clone(FIXTURE); badOrientation.grid.orientation = 'DIAGONAL';
  assert(verdict(badOrientation).reason === REASON.LAYOUT_SHAPE, 'an unknown orientation is refused');

  const activeViewOutside = clone(FIXTURE);
  activeViewOutside.grid.root.data[0].data.activeView = 'library';
  assert(verdict(activeViewOutside).reason === REASON.LAYOUT_SHAPE, 'an activeView not in its own views is refused');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nfile-backed store: read guards\n');
// ---------------------------------------------------------------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dv-store-'));
  const store = createLayoutStore({ userDataDir: dir });
  const file = path.join(dir, LAYOUT_FILENAME);

  assert(store.layoutPath() === file, 'the layout path is main-owned: userData + a fixed filename');
  assert(store.load().reason === REASON.NOT_FOUND, 'a missing file refuses with no-saved-layout');

  fs.writeFileSync(file, 'not json at all');
  assert(store.load().reason === REASON.INVALID_JSON, 'non-JSON refuses with invalid-json');

  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1 }));
  assert(store.load().reason === REASON.ENVELOPE_SHAPE, 'a truncated envelope refuses');

  // oversized — checked BEFORE parsing
  fs.writeFileSync(file, 'x'.repeat(MAX_RAW_BYTES + 1));
  const big = store.load();
  assert(big.reason === REASON.TOO_LARGE, `a file larger than ${MAX_RAW_BYTES} bytes refuses before parsing`);

  // invalid UTF-8 — a lone continuation byte
  fs.writeFileSync(file, Buffer.from([0x7b, 0x80, 0x7d]));
  assert(store.load().reason === REASON.INVALID_UTF8, 'invalid UTF-8 refuses with invalid-utf8');

  // unsupported version fixture
  fs.writeFileSync(file, JSON.stringify({
    schemaVersion: 2, package: 'dockview', packageVersion: '7.0.4',
    savedAt: '2026-08-04T12:00:00Z', layout: FIXTURE,
  }));
  assert(store.load().reason === REASON.SCHEMA_VERSION, 'an unsupported schemaVersion refuses');

  // a valid file round-trips
  const ok = store.save(clone(FIXTURE));
  assert(ok.ok === true, 'a valid layout saves');
  const loaded = store.load();
  assert(loaded.ok === true, 'the saved layout loads back');
  assert(JSON.stringify(loaded.envelope.layout) === JSON.stringify(FIXTURE), 'the layout round-trips byte-identically');

  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
process.stdout.write('\nfile-backed store: an invalid file is preserved, never repaired\n');
// ---------------------------------------------------------------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dv-store-'));
  const store = createLayoutStore({ userDataDir: dir });
  const file = path.join(dir, LAYOUT_FILENAME);

  const corrupt = '{"schemaVersion":1,"package":"dockview","packageVersion":"7.0.4","savedAt":"2026-08-04T12:00:00Z","layout":{"grid":BROKEN';
  fs.writeFileSync(file, corrupt);
  const before = fs.readFileSync(file, 'utf8');
  const r1 = store.load();
  const r2 = store.load();
  assert(r1.reason === REASON.INVALID_JSON && r2.reason === REASON.INVALID_JSON, 'a corrupt file refuses repeatedly');
  assert(fs.readFileSync(file, 'utf8') === before,
    'the corrupt file is byte-for-byte untouched after failed loads (evidence is preserved)');
  assert(fs.existsSync(file), 'the corrupt file is not deleted');

  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
process.stdout.write('\nfile-backed store: refuses a non-regular file and a reparse point\n');
// ---------------------------------------------------------------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dv-store-'));
  const file = path.join(dir, LAYOUT_FILENAME);

  // A directory at the canonical path must refuse, not throw.
  fs.mkdirSync(file);
  const dirStore = createLayoutStore({ userDataDir: dir });
  assert(dirStore.load().reason === REASON.NOT_REGULAR_FILE, 'a directory at the layout path refuses');
  fs.rmSync(file, { recursive: true, force: true });

  // Symlink/junction refusal is asserted through an injected fs so the test does not depend on
  // Windows symlink privileges (which ordinary user accounts lack without developer mode).
  const linkStore = createLayoutStore({
    userDataDir: dir,
    fsImpl: {
      lstatSync: () => ({ isSymbolicLink: () => true, isFile: () => true, size: 10 }),
      readFileSync: () => { throw new Error('must never be read'); },
      writeFileSync: () => {}, renameSync: () => {}, rmSync: () => {},
    },
  });
  const linkResult = linkStore.load();
  assert(linkResult.reason === REASON.REPARSE_POINT, 'a reparse point at the layout path refuses before any read');

  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
process.stdout.write('\nfile-backed store: writes are validated and atomic\n');
// ---------------------------------------------------------------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dv-store-'));
  const store = createLayoutStore({ userDataDir: dir });
  const file = path.join(dir, LAYOUT_FILENAME);

  const bad = store.save({ grid: { root: { type: 'leaf', data: { views: ['evil'], id: 'g' } }, width: 1, height: 1, orientation: 'HORIZONTAL' }, panels: {} });
  assert(bad.ok === false, 'an invalid layout is refused BEFORE it is written');
  assert(!fs.existsSync(file), 'nothing was written for the refused save');

  store.save(clone(FIXTURE));
  const leftovers = fs.readdirSync(dir).filter(f => f.endsWith('.tmp'));
  assert(leftovers.length === 0, 'no temp file survives a successful save');
  assert(fs.readdirSync(dir).length === 1, 'exactly one file exists after saving');

  assert(store.reset().ok === true, 'reset removes the layout file');
  assert(!fs.existsSync(file), 'the layout file is gone after reset');
  assert(store.reset().ok === true, 'reset is idempotent when no file exists');

  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
process.stdout.write('\nrefusal reasons never leak file contents\n');
// ---------------------------------------------------------------------------
{
  const secret = 'D:\\Workspace\\SECRET-worktree\\api_key_abcdef123456';
  const l = clone(FIXTURE); l.panels.pty1.title = secret;
  const r = verdict(l);
  assert(r.ok === false, 'the secret-bearing layout is refused');
  const serialized = JSON.stringify(r);
  assert(!serialized.includes('SECRET') && !serialized.includes('abcdef123456'),
    'the refusal carries no fragment of the offending value');
  assert(Object.keys(r).sort().join(',') === 'ok,reason', 'a refusal is exactly { ok, reason }');
  assert(Object.values(REASON).includes(r.reason), 'the reason is one of the bounded constants');
}

// ---------------------------------------------------------------------------
process.stdout.write(`\ndockview-layout-store: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
