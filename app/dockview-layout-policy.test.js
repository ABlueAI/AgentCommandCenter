'use strict';
// Run: node app/dockview-layout-policy.test.js
//
// The SHARED layout policy — the one schema authority both main and the renderer use.
//
// SCOPE. The envelope/layout schema and its bounds are already exercised exhaustively by
// `dockview-layout-store.test.js` against the committed dockview@7.0.4 fixture, and those
// assertions are deliberately NOT duplicated here: they now run against this module through the
// store's re-export, which this file proves is the identical function object.
//
// What this file owns is everything Phase C added, plus the two structural properties that make
// "one validator" true rather than merely intended:
//
//   * the module is PURE and browser-loadable — no fs, no path, no Electron, no DOM, and nothing
//     declared at top level, because classic renderer scripts share ONE global lexical environment
//     and `renderer/agent-dom.js` already owns a top-level `const api`;
//   * main and the renderer resolve to the SAME function objects, so they cannot drift.
//
// Plus the new pure operations: exact pane-ID extraction, exact set comparison, the canonical
// ordering, and the deterministic default arrangement.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const APP_DIR = __dirname;
const POLICY_PATH = path.join(APP_DIR, 'dockview-layout-policy.js');
const policy = require('./dockview-layout-policy');
const store = require('./dockview-layout-store');
const FIXTURE = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'test-fixtures', 'dockview-7.0.4-layout.json'), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const R = policy.REASON;

// ---------------------------------------------------------------------------
process.stdout.write('\nONE validator: main and the renderer share the same function objects\n');
// ---------------------------------------------------------------------------
{
  // Function IDENTITY, not just "both have a function with that name". Two modules can each export
  // a `validateLayout` and disagree completely; the same object cannot disagree with itself.
  for (const name of ['validateLayout', 'validateEnvelope', 'buildEnvelope', 'paneIdsFromLayout',
    'comparePaneSets', 'canonicalPaneOrder', 'buildDefaultArrangement']) {
    assert(store[name] === policy[name],
      `the main-side store re-exports the IDENTICAL ${name} — not a copy that can drift`);
  }
  assert(store.REASON === policy.REASON, 'and the identical closed reason set');
  assert(store.policy === policy, 'the store exposes the shared policy module itself');

  // The renderer gets the same file, loaded as a classic script. Evaluated here in a bare VM with a
  // `window` and NO `module`, which is exactly the renderer's environment.
  const src = fs.readFileSync(POLICY_PATH, 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'dockview-layout-policy.js' });
  const browserApi = sandbox.window.ccDockviewLayoutPolicy;
  assert(!!browserApi, 'loaded as a browser classic script it publishes window.ccDockviewLayoutPolicy');
  for (const name of ['validateLayout', 'validateEnvelope', 'paneIdsFromLayout', 'comparePaneSets',
    'buildDefaultArrangement']) {
    assert(typeof browserApi[name] === 'function', `the browser export carries ${name}`);
  }
  // Same SOURCE, therefore same rules: the browser instance must agree with the CommonJS instance
  // on the real fixture and on a deliberately broken one.
  assert(browserApi.validateLayout(clone(FIXTURE)) === null,
    'the browser instance accepts the real dockview@7.0.4 fixture');
  const broken = clone(FIXTURE);
  broken.panels.pty1.params = { cwd: 'D:\\Workspace' };
  assert(browserApi.validateLayout(broken) === policy.validateLayout(clone(broken)),
    'and refuses a populated `params` with the SAME reason the main-side instance gives');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nhidden pane-bearing layout nodes are refused\n');
// ---------------------------------------------------------------------------
{
  const hiddenLeaf = clone(FIXTURE);
  hiddenLeaf.grid.root.data[0].visible = false;
  assert(policy.validateLayout(hiddenLeaf) === R.LAYOUT_SHAPE,
    'a pane-bearing leaf with visible:false is refused before it can reach fromJSON');
  assert(policy.paneIdsFromLayout(hiddenLeaf).reason === R.LAYOUT_SHAPE,
    'pane extraction cannot turn hidden state into an apparently coherent pane set');

  const hiddenBranch = clone(FIXTURE);
  hiddenBranch.grid.root.visible = false;
  assert(policy.validateLayout(hiddenBranch) === R.LAYOUT_SHAPE,
    'a hidden branch is refused too — no hidden pane-bearing subtree is accepted');

  const explicitlyVisible = clone(FIXTURE);
  explicitlyVisible.grid.root.data[0].visible = true;
  assert(policy.validateLayout(explicitlyVisible) === null,
    'visible:true remains accepted; only state that hides a pane-bearing node is forbidden');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe policy is PURE and safe to load as a classic renderer script\n');
// ---------------------------------------------------------------------------
{
  const src = fs.readFileSync(POLICY_PATH, 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .filter((l) => !/^\s*\/\//.test(l)).join('\n');

  assert(!/require\s*\(/.test(code), 'it calls require() nowhere — no fs, no path, no Electron');
  assert(!/\bprocess\./.test(code), 'it reads no process state');
  assert(!/\bdocument\b/.test(code), 'it touches no DOM');
  assert(!/readFileSync|writeFileSync|lstatSync|rmSync/.test(code), 'it performs no file I/O');
  // Nothing at top level: a second top-level `const api` anywhere in the renderer is a PARSE-time
  // collision that takes both scripts down. This is the exact defect that broke round 3.
  assert(!/^(const|let|var|class|function)\s/m.test(code.replace(/^'use strict';\r?\n/, '')),
    'it declares NOTHING at top level — fully enclosed, so no future name can collide');
  assert(/^\(function \(\) \{/m.test(src), 'it is wrapped in an IIFE');
  assert(/if \(typeof module === 'object' && module\.exports\) module\.exports = api;/.test(src),
    'it exports under CommonJS');
  assert(/if \(typeof window !== 'undefined'\) window\.ccDockviewLayoutPolicy = api;/.test(src),
    'and publishes a browser global');

  // The file-boundary constants stay OUT of the pure policy.
  assert(policy.LAYOUT_FILENAME === undefined, 'the pure policy owns no filename');
  assert(store.LAYOUT_FILENAME === 'dockview-layout.json', 'the store owns the production filename');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe reason set is CLOSED and content-free\n');
// ---------------------------------------------------------------------------
{
  const codes = [...policy.REASON_CODES];
  assert(codes.length === Object.keys(policy.REASON).length, 'every REASON entry is in REASON_CODES');
  assert(new Set(codes).size === codes.length, 'no two reasons share a code');
  for (const code of codes) {
    assert(typeof code === 'string' && code.length > 0 && code.length <= 40,
      `"${code}" is a short bounded string`);
    assert(/^[a-z0-9-]+$/.test(code), `"${code}" is a kebab-case code — it cannot carry content`);
  }
  // The Phase-C additions exist and are distinct.
  for (const name of ['PANE_SET_INVALID', 'SAVED_NOT_LIVE', 'LIVE_NOT_SAVED', 'PANE_SET_MISMATCH',
    'NO_LIVE_PANES', 'PANE_NOT_MOUNTED', 'APPLY_THREW', 'APPLY_INCOMPLETE', 'UNEXPECTED_PANEL',
    'IDENTITY_CHANGED', 'OWNERSHIP_MISMATCH', 'SNAPSHOT_INVALID', 'BUSY']) {
    assert(typeof R[name] === 'string', `REASON.${name} exists`);
  }
}

// ---------------------------------------------------------------------------
process.stdout.write('\npaneIdsFromLayout extracts the exact set, and validates first\n');
// ---------------------------------------------------------------------------
{
  const result = policy.paneIdsFromLayout(clone(FIXTURE));
  assert(result.ok === true, 'the real fixture yields IDs');
  assert(JSON.stringify(result.ordered) === JSON.stringify(['pty1', 'pty2', 'library']),
    `grid order is preserved (saw ${JSON.stringify(result.ordered)})`);
  assert(JSON.stringify(result.sorted) === JSON.stringify(['library', 'pty1', 'pty2']),
    'and a canonical sorted form is provided for comparison');
  assert(result.ordered.length === new Set(result.ordered).size, 'no duplicates');

  // It VALIDATES first, so IDs can never be extracted from state that could not reach fromJSON.
  const invalid = clone(FIXTURE);
  invalid.panels.pty1.title = 'D:\\Workspace\\secret';
  const bad = policy.paneIdsFromLayout(invalid);
  assert(bad.ok === false && bad.reason === R.UNSAFE_CONTENT,
    `unsafe content refuses extraction by name (saw ${bad.reason})`);
  assert(policy.paneIdsFromLayout(null).reason === R.LAYOUT_SHAPE, 'null refuses');
  assert(policy.paneIdsFromLayout({}).reason === R.LAYOUT_SHAPE, 'an empty object refuses');

  // The grid is the authority, and the validator already cross-references it against `panels`.
  const orphan = clone(FIXTURE);
  delete orphan.panels.library;
  assert(policy.paneIdsFromLayout(orphan).ok === false,
    'a grid view with no matching panel refuses rather than yielding a phantom ID');
}

// ---------------------------------------------------------------------------
process.stdout.write('\ncomparePaneSets enforces EXACT set equality, and reports counts only\n');
// ---------------------------------------------------------------------------
{
  const eq = policy.comparePaneSets(['pty1', 'pty2', 'library'], ['library', 'pty2', 'pty1']);
  assert(eq.ok === true && eq.count === 3,
    'the same three IDs in a different ORDER are equal — order alone is never a mismatch');
  assert(policy.comparePaneSets([], []).ok === true, 'two empty sets are equal');

  // Saved names a pane that is not open: restoring would mount an empty shell.
  const notLive = policy.comparePaneSets(['pty1', 'pty2'], ['pty1']);
  assert(notLive.ok === false && notLive.reason === R.SAVED_NOT_LIVE,
    `a saved pane that is not live refuses as ${R.SAVED_NOT_LIVE}`);
  assert(notLive.savedNotLive === 1 && notLive.liveNotSaved === 0, 'with an exact count of each side');

  // A pane is open that the saved state does not mention: restoring would strand it.
  const notSaved = policy.comparePaneSets(['pty1'], ['pty1', 'pty2']);
  assert(notSaved.ok === false && notSaved.reason === R.LIVE_NOT_SAVED,
    `an extra live pane refuses as ${R.LIVE_NOT_SAVED}`);
  assert(notSaved.liveNotSaved === 1 && notSaved.savedNotLive === 0, 'with the counts the other way round');

  // EQUAL COUNTS, DIFFERENT IDS — the case a naive length check would wave through.
  const swapped = policy.comparePaneSets(['pty1', 'pty3'], ['pty1', 'pty2']);
  assert(swapped.ok === false && swapped.reason === R.PANE_SET_MISMATCH,
    `equal counts with different IDs refuse as ${R.PANE_SET_MISMATCH}`);
  assert(swapped.savedCount === 2 && swapped.liveCount === 2,
    'and the counts alone would NOT have caught it — which is why the sets are compared');

  // Duplicates make "same count" meaningless and are refused before any comparison.
  assert(policy.comparePaneSets(['pty1', 'pty1'], ['pty1']).reason === R.DUPLICATE_PANE_ID,
    'a duplicate on the saved side refuses');
  assert(policy.comparePaneSets(['pty1'], ['pty1', 'pty1']).reason === R.DUPLICATE_PANE_ID,
    'a duplicate on the live side refuses');

  // Bounded and typed.
  for (const bad of [null, undefined, 'pty1', {}, 42]) {
    assert(policy.comparePaneSets(bad, ['pty1']).reason === R.PANE_SET_INVALID,
      `a non-array saved list (${JSON.stringify(bad) || String(bad)}) refuses`);
  }
  assert(policy.comparePaneSets(['pty1'], ['not-a-pane']).reason === R.PANE_SET_INVALID,
    'an ID outside the closed pane-ID pattern refuses');
  const huge = Array.from({ length: policy.MAX_PANELS + 1 }, (_, i) => `pty${i + 1}`);
  assert(policy.comparePaneSets(huge, ['pty1']).reason === R.PANE_SET_INVALID, 'an oversized list refuses');

  // CONTENT-FREE: the result carries counts and a code, never an ID.
  const serialized = JSON.stringify(swapped) + JSON.stringify(notLive) + JSON.stringify(notSaved);
  assert(!/pty\d|library/.test(serialized),
    `no pane ID appears anywhere in a refusal result (saw ${serialized})`);
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe canonical order is deterministic and numeric\n');
// ---------------------------------------------------------------------------
{
  assert(JSON.stringify(policy.canonicalPaneOrder(['library', 'pty10', 'pty2']))
    === JSON.stringify(['pty2', 'pty10', 'library']),
    'terminals ascend NUMERICALLY (pty2 before pty10) and the Library goes last');
  assert(JSON.stringify(policy.canonicalPaneOrder(['pty3', 'pty1', 'pty2']))
    === JSON.stringify(['pty1', 'pty2', 'pty3']), 'terminals alone sort ascending');
  assert(JSON.stringify(policy.canonicalPaneOrder(['library'])) === JSON.stringify(['library']),
    'the Library alone is itself');
  assert(JSON.stringify(policy.canonicalPaneOrder([])) === JSON.stringify([]), 'an empty set is empty');
  // Deterministic: the same input always yields the same output, whatever order it arrives in.
  const a = policy.canonicalPaneOrder(['pty2', 'library', 'pty1']);
  const b = policy.canonicalPaneOrder(['library', 'pty1', 'pty2']);
  assert(JSON.stringify(a) === JSON.stringify(b), 'input order does not affect the result');
  // A plain lexical sort would put pty10 before pty2 — the exact bug this avoids.
  assert(JSON.stringify(['pty10', 'pty2'].sort()) !== JSON.stringify(policy.canonicalPaneOrder(['pty10', 'pty2'])),
    'NEGATIVE CONTROL: a plain string sort gives a DIFFERENT (wrong) order');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe deterministic default arrangement: one visible row, created from nothing\n');
// ---------------------------------------------------------------------------
{
  // THE DOCUMENTED ARRANGEMENT: a single horizontal row of groups, one pane per group, in canonical
  // order, first pane active, every node size 100 (dockview re-normalises proportionally).
  const panes = [
    { id: 'library', component: 'library', title: 'Library' },
    { id: 'pty10', component: 'terminal', title: 'Terminal 10' },
    { id: 'pty2', component: 'terminal', title: 'Terminal 2' },
  ];
  const built = policy.buildDefaultArrangement({ panes, width: 1200, height: 800 });
  assert(built.ok === true, 'it builds');
  assert(JSON.stringify(built.order) === JSON.stringify(['pty2', 'pty10', 'library']),
    'in canonical order');
  assert(policy.validateLayout(built.layout) === null,
    'and its output survives the SAME validator everything else does');

  const root = built.layout.grid.root;
  assert(root.type === 'branch', 'the root is a branch');
  assert(built.layout.grid.orientation === 'HORIZONTAL', 'laid out as a horizontal ROW');
  assert(root.data.length === 3, 'with one group per pane — every pane stays VISIBLE');
  assert(root.data.every((n) => n.type === 'leaf' && n.data.views.length === 1),
    'no pane is hidden behind a tab');
  assert(JSON.stringify(root.data.map((n) => n.data.views[0])) === JSON.stringify(['pty2', 'pty10', 'library']),
    'groups follow the canonical order');
  assert(root.data.every((n) => n.size === 100) && root.size === 100,
    'every node carries size 100, so dockview splits evenly after it re-normalises');
  assert(built.layout.grid.width === 1200 && built.layout.grid.height === 800,
    'the real container dimensions are carried through');
  assert(built.layout.activeGroup === '1' && root.data[0].data.id === '1',
    'the first group is active');
  assert(JSON.stringify(Object.keys(built.layout.panels).sort()) === JSON.stringify(['library', 'pty10', 'pty2']),
    'the panel map holds exactly the panes it was given');
  assert(built.layout.panels.pty2.contentComponent === 'terminal'
    && built.layout.panels.library.contentComponent === 'library',
    'each panel keeps its own component kind');

  // DETERMINISM: same panes, same layout, byte for byte, whatever order they arrive in.
  const shuffled = policy.buildDefaultArrangement({
    panes: [panes[2], panes[0], panes[1]], width: 1200, height: 800,
  });
  assert(JSON.stringify(shuffled.layout) === JSON.stringify(built.layout),
    'the arrangement is a pure function of the pane SET, not of the input order');

  // IT CREATES NOTHING. The output can only ever describe the panes it was handed.
  const one = policy.buildDefaultArrangement({ panes: [panes[1]], width: 100, height: 100 });
  assert(one.ok === true && Object.keys(one.layout.panels).length === 1,
    'one pane in, exactly one panel out — it cannot conjure a second terminal or the Library');
  assert(policy.buildDefaultArrangement({ panes: [], width: 100, height: 100 }).reason === R.NO_LIVE_PANES,
    `no panes refuses as ${R.NO_LIVE_PANES} rather than inventing a default workspace`);

  // Bounded and typed.
  assert(policy.buildDefaultArrangement({ panes: null, width: 1, height: 1 }).reason === R.PANE_SET_INVALID,
    'a non-array pane list refuses');
  assert(policy.buildDefaultArrangement({ panes, width: NaN, height: 1 }).reason === R.NON_FINITE,
    'a non-finite width refuses');
  assert(policy.buildDefaultArrangement({ panes: [{ id: 'nope', component: 'terminal', title: 'x' }], width: 1, height: 1 }).reason === R.UNKNOWN_PANE_ID,
    'an ID outside the closed pattern refuses');
  assert(policy.buildDefaultArrangement({ panes: [{ id: 'pty1', component: 'iframe', title: 'x' }], width: 1, height: 1 }).reason === R.UNKNOWN_COMPONENT,
    'an unknown component kind refuses');
  assert(policy.buildDefaultArrangement({ panes: [{ id: 'pty1', component: 'terminal', title: 'D:\\x' }], width: 1, height: 1 }).reason === R.UNSAFE_CONTENT,
    'a title carrying a path refuses — the builder cannot smuggle content into a layout either');
  assert(policy.buildDefaultArrangement({ panes: [{ id: 'pty1', component: 'terminal', title: 'a' }, { id: 'pty1', component: 'terminal', title: 'b' }], width: 1, height: 1 }).reason === R.DUPLICATE_PANE_ID,
    'a duplicate pane refuses');
  const tooMany = Array.from({ length: policy.MAX_PANELS + 1 }, (_, i) => ({ id: `pty${i + 1}`, component: 'terminal', title: `Terminal ${i + 1}` }));
  assert(policy.buildDefaultArrangement({ panes: tooMany, width: 1, height: 1 }).reason === R.TOO_MANY_PANELS,
    'more panes than the bound refuses');

  // The round trip that matters: build -> extract -> compare must be exactly the input set.
  const ids = policy.paneIdsFromLayout(built.layout);
  assert(policy.comparePaneSets(ids.sorted, panes.map((p) => p.id)).ok === true,
    'the built arrangement describes EXACTLY the live pane set it was given — a reset cannot lose or add a pane');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nan envelope built here round-trips through the shared validator\n');
// ---------------------------------------------------------------------------
{
  const envelope = policy.buildEnvelope(clone(FIXTURE), Date.UTC(2026, 7, 8, 12, 0, 0));
  const verdict = policy.validateEnvelope(envelope);
  assert(verdict.ok === true, 'buildEnvelope output validates');
  assert(envelope.schemaVersion === 1 && envelope.package === 'dockview' && envelope.packageVersion === '7.0.4',
    'carrying schema version 1 and the pinned package identity');
  assert(envelope.savedAt === '2026-08-08T12:00:00Z', `with a strict UTC timestamp (saw ${envelope.savedAt})`);
  // And a JSON round trip — the on-disk form — validates identically.
  assert(policy.validateEnvelope(JSON.parse(JSON.stringify(envelope))).ok === true,
    'and so does its JSON round trip, which is the form that reaches the renderer');
}

// ---------------------------------------------------------------------------
process.stdout.write(`\ndockview-layout-policy: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
