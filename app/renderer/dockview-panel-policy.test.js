'use strict';
// Run: node app/renderer/dockview-panel-policy.test.js
// Plain Node.js — the prototype-mode opt-in matrix (§ 5.10) and the "what may Dockview be told
// about a pane" boundary (§ 5.9 / § 7).

const {
  isPrototypeEnabled, shouldLoadDockview, buildPanelDescriptor, defaultTitleFor, titleIsSafe, REFUSAL,
} = require('./dockview-panel-policy');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// ---------------------------------------------------------------------------
process.stdout.write('\nprototype-mode matrix: only main\'s frozen boolean true enables it\n');
// ---------------------------------------------------------------------------
{
  assert(isPrototypeEnabled({ enabled: true }) === true, 'enabled === true turns the prototype ON');

  for (const [bridge, label] of [
    [undefined, 'no bridge at all (default npm start, preload absent)'],
    [null, 'a null bridge'],
    [{}, 'a bridge with no enabled property'],
    [{ enabled: false }, 'enabled === false'],
    [{ enabled: 'true' }, 'the STRING "true"'],
    [{ enabled: 1 }, 'the number 1'],
    [{ enabled: {} }, 'a truthy object'],
    [{ enabled: [] }, 'a truthy array'],
    [{ enabled: 'yes' }, 'an arbitrary truthy string'],
    ['enabled', 'a bare string'],
    [0, 'the number 0'],
  ]) {
    assert(isPrototypeEnabled(bridge) === false, `${label} leaves the prototype OFF`);
  }

  assert(shouldLoadDockview({ enabled: true }) === true, 'Dockview loads only when the flag is true');
  for (const bridge of [undefined, null, {}, { enabled: false }, { enabled: 'true' }, { enabled: 1 }]) {
    assert(shouldLoadDockview(bridge) === false, `Dockview is NOT loaded for ${JSON.stringify(bridge)}`);
  }
  // The decisive default-path guarantee: with no bridge, the loader predicate is false, so app.js
  // never reaches the dynamic import and Dockview is never fetched, parsed, or initialized.
  assert(shouldLoadDockview(undefined) === false,
    'DEFAULT PATH: with no ccDockview bridge the loader predicate is false (§ 5.10)');
}

// ---------------------------------------------------------------------------
process.stdout.write('\npanel descriptor: exactly id + component + title, nothing else\n');
// ---------------------------------------------------------------------------
{
  const r = buildPanelDescriptor({ paneId: 'pty1', kind: 'terminal', title: 'Terminal 1' });
  assert(r.ok === true, 'a well-formed terminal pane is accepted');
  assert(Object.keys(r.panel).sort().join(',') === 'component,id,title',
    'the descriptor carries EXACTLY id, component, title');
  assert(r.panel.id === 'pty1' && r.panel.component === 'terminal' && r.panel.title === 'Terminal 1',
    'the three allowlisted values are passed through unchanged');
  assert(Object.isFrozen(r.panel), 'the descriptor is frozen so params cannot be attached later');

  // Proving the freeze actually holds (non-strict assignment would silently no-op).
  let mutated = false;
  try { r.panel.params = { cwd: 'D:\\secret' }; mutated = Object.prototype.hasOwnProperty.call(r.panel, 'params'); }
  catch { mutated = false; }
  assert(mutated === false, 'attaching params to a built descriptor does not take effect');

  const lib = buildPanelDescriptor({ paneId: 'library', kind: 'library', title: 'Library' });
  assert(lib.ok === true && lib.panel.component === 'library', 'the Library pane is accepted');
}

// ---------------------------------------------------------------------------
process.stdout.write('\npanel descriptor: refusals\n');
// ---------------------------------------------------------------------------
{
  for (const [paneId, label] of [
    ['', 'an empty pane ID'],
    ['shell1', 'an unknown pane ID'],
    ['PTY1', 'a wrong-case pane ID'],
    ['pty1234567', 'an over-long numbered pane ID'],
    ['../etc/passwd', 'a path-shaped pane ID'],
    ['library2', 'a near-miss on the library ID'],
    [null, 'a null pane ID'],
    [42, 'a numeric pane ID'],
  ]) {
    const r = buildPanelDescriptor({ paneId, kind: 'terminal', title: 'X' });
    assert(r.ok === false && r.reason === REFUSAL.BAD_PANE_ID, `${label} is refused`);
  }

  for (const kind of ['iframe', 'webview', 'Terminal', '', 'script', null, 'terminal ']) {
    const r = buildPanelDescriptor({ paneId: 'pty1', kind, title: 'X' });
    assert(r.ok === false && r.reason === REFUSAL.BAD_KIND, `component kind ${JSON.stringify(kind)} is refused`);
  }

  for (const title of [
    'D:\\Workspace\\agent-command-center',
    '/home/levi/worktrees/secret',
    'https://example.com/report',
    'file:///D:/x',
    '../../etc/passwd',
    'api_key=abc123',
    'Bearer eyJhbGciOi',
    'password: hunter2',
    'AUTHORIZATION: x',
    'line1\nline2',
    'tab\there',
    '',
    'T'.repeat(201),
    null,
    123,
  ]) {
    const r = buildPanelDescriptor({ paneId: 'pty1', kind: 'terminal', title });
    assert(r.ok === false && r.reason === REFUSAL.BAD_TITLE,
      `title ${JSON.stringify(String(title).slice(0, 26))} is refused`);
  }

  assert(buildPanelDescriptor().ok === false, 'a call with no arguments is refused, not thrown');
  assert(buildPanelDescriptor({}).ok === false, 'an empty descriptor request is refused');
}

// ---------------------------------------------------------------------------
process.stdout.write('\ntitles are derived from the opaque pane ID, never from a worktree path\n');
// ---------------------------------------------------------------------------
{
  assert(defaultTitleFor('pty1') === 'Terminal 1', 'pty1 -> "Terminal 1"');
  assert(defaultTitleFor('pty12') === 'Terminal 12', 'pty12 -> "Terminal 12"');
  assert(defaultTitleFor('library') === 'Library', 'library -> "Library"');
  assert(defaultTitleFor('shell1') === '', 'an unknown pane ID yields no title');

  // Every generated title must itself pass the safety check — the two rules cannot drift apart.
  for (const id of ['pty1', 'pty2', 'pty999999', 'library']) {
    const t = defaultTitleFor(id);
    assert(titleIsSafe(t), `the generated title for ${id} is display-safe`);
    assert(buildPanelDescriptor({ paneId: id, kind: id === 'library' ? 'library' : 'terminal', title: t }).ok === true,
      `the generated title for ${id} builds a valid descriptor`);
  }
  // The production grid's label style (role + worktree directory name) must NOT be usable, because
  // a worktree name is filesystem-derived.
  assert(titleIsSafe('Builder · D:\\Workspace\\acc') === false,
    'a production-style label carrying a worktree path would be refused as a title');
}

// ---------------------------------------------------------------------------
process.stdout.write(`\ndockview-panel-policy: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
