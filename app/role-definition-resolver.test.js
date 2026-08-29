'use strict';
// Run: node app/role-definition-resolver.test.js
//
// EFFECTIVE-DEFINITION RESOLUTION MATRIX.
//
// Reading `~/.claude/agents/<role>.md` is not sufficient: documented precedence is
// managed(1) > --agents(2) > project(3) > user(4) > plugin(5), identity is the frontmatter `name`
// rather than the filename, and duplicate names inside one tree resolve by filesystem read order
// with NO documented precedence. This suite pins that main REFUSES whenever it cannot establish
// which definition the launched CLI will consume, rather than launching with a disclaimer.

const path = require('path');
const { createRoleDefinitionResolver, REASON, DEFAULT_MANAGED_PATHS, DEFAULT_MANAGED_REGISTRY_KEYS } =
  require('./role-definition-resolver');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  \u2713 ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
function section(t) { process.stdout.write('\n' + t + '\n'); }

const HOME = 'C:\\Users\\levij';
const SANDBOX = 'D:\\Workspace\\.command-center\\outputs\\web-scout-2026-08-28T00-00-00-abc123';

function roleDoc(name, extra) {
  return ['---', 'name: ' + name, 'description: d', 'tools: WebSearch, WebFetch, Read, Write',
    (extra || 'model: sonnet'), '---', '', 'Body.'].join('\n');
}

// Virtual filesystem: `files` maps an absolute path to content, `dirs` is the set of directories.
function makeFsx(files) {
  const norm = (p) => path.resolve(p).toLowerCase();
  const table = new Map();
  const dirs = new Set();
  for (const k of Object.keys(files)) {
    table.set(norm(k), files[k]);
    let d = path.dirname(path.resolve(k));
    while (true) { dirs.add(norm(d)); const up = path.dirname(d); if (up === d) break; d = up; }
  }
  return {
    existsSync: (p) => table.has(norm(p)) || dirs.has(norm(p)),
    readFileSync: (p) => {
      const v = table.get(norm(p));
      if (v === undefined) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      return v;
    },
    readdirSync: (p) => {
      const base = norm(p);
      const out = new Map();
      for (const key of table.keys()) {
        if (key.indexOf(base + path.sep.toLowerCase()) !== 0) continue;
        const rel = key.slice(base.length + 1);
        const first = rel.split(path.sep)[0];
        const isDir = rel.indexOf(path.sep) !== -1;
        if (!out.has(first)) out.set(first, { name: first, isDirectory: () => isDir });
      }
      return Array.from(out.values());
    },
  };
}

const noManaged = () => ({ present: false });
function make(files, opts) {
  const o = opts || {};
  return createRoleDefinitionResolver({
    fsx: o.fsx || makeFsx(files),
    homeDir: HOME,
    probeRegistryKey: o.probeRegistryKey || noManaged,
    managedPaths: o.managedPaths || [],
    managedRegistryKeys: o.managedRegistryKeys || DEFAULT_MANAGED_REGISTRY_KEYS,
    caps: o.caps,
  });
}

const USER_WS = HOME + '\\.claude\\agents\\web-scout.md';

section('MANAGED SCOPE \u2014 refuse on presence, refuse on unreadability, never parse');
{
  for (const managedPath of DEFAULT_MANAGED_PATHS) {
    const files = {}; files[USER_WS] = roleDoc('web-scout'); files[managedPath + '\\x'] = 'y';
    const r = make(files, { managedPaths: [managedPath] }).resolve({ role: 'web-scout', cwd: SANDBOX });
    assert(!r.ok && r.reason === REASON.MANAGED_PRESENT, 'REFUSES when present: ' + managedPath);
  }
  for (const key of DEFAULT_MANAGED_REGISTRY_KEYS) {
    const files = {}; files[USER_WS] = roleDoc('web-scout');
    const r = make(files, { probeRegistryKey: (k) => ({ present: k === key }) })
      .resolve({ role: 'web-scout', cwd: SANDBOX });
    assert(!r.ok && r.reason === REASON.MANAGED_PRESENT, 'REFUSES when policy key present: ' + key);
  }
  const files = {}; files[USER_WS] = roleDoc('web-scout');
  const thrown = make(files, { probeRegistryKey: () => { throw new Error('access denied'); } })
    .resolve({ role: 'web-scout', cwd: SANDBOX });
  assert(!thrown.ok && thrown.reason === REASON.MANAGED_UNREADABLE,
    'REFUSES when a policy probe cannot answer (unreadable is not absent)');
  const shapeless = make(files, { probeRegistryKey: () => ({}) }).resolve({ role: 'web-scout', cwd: SANDBOX });
  assert(!shapeless.ok && shapeless.reason === REASON.MANAGED_UNREADABLE,
    'REFUSES when a probe returns an unusable answer');
  const statThrows = make(files, {
    managedPaths: ['C:\\Program Files\\ClaudeCode\\managed-settings.json'],
    fsx: Object.assign({}, makeFsx(files), { existsSync: () => { throw new Error('EPERM'); } }),
  }).resolve({ role: 'web-scout', cwd: SANDBOX });
  assert(!statThrows.ok && statThrows.reason === REASON.MANAGED_UNREADABLE,
    'REFUSES when a managed path cannot be stat-ed');
  assert(DEFAULT_MANAGED_PATHS.join('|').indexOf('ProgramData') === -1,
    'the obsolete ProgramData path is NOT consulted (the CLI does not read it)');
  assert(DEFAULT_MANAGED_PATHS.indexOf('C:\\Program Files\\ClaudeCode\\.claude\\agents') !== -1,
    'the managed AGENTS directory is covered, not only managed-settings.json');
}

section('USER SCOPE \u2014 the ordinary path still resolves');
{
  const files = {}; files[USER_WS] = roleDoc('web-scout');
  const r = make(files).resolve({ role: 'web-scout', cwd: SANDBOX });
  assert(r.ok && r.scope === 'user', 'resolves from ~/.claude/agents when nothing overrides it');
  assert(r.ok && r.path.toLowerCase() === path.resolve(USER_WS).toLowerCase(), 'and reports the winning path');
}

section('PROJECT SCOPE OVERRIDE \u2014 identity is the frontmatter name, not the filename');
{
  // A project definition on an ANCESTOR of the launch cwd outranks user scope.
  const proj = 'D:\\Workspace\\.claude\\agents\\anything.md';
  const files = {}; files[USER_WS] = roleDoc('web-scout'); files[proj] = roleDoc('web-scout', 'model: opus');
  const r = make(files).resolve({ role: 'web-scout', cwd: SANDBOX });
  assert(r.ok && r.scope === 'project', 'a project definition outranks the user definition');
  assert(r.ok && r.text.indexOf('model: opus') !== -1,
    'and it is selected by its frontmatter NAME even though the filename is anything.md');
}
{
  // Closest-to-cwd wins among project levels (documented for v2.1.178+; installed is 2.1.250).
  const near = 'D:\\Workspace\\.command-center\\.claude\\agents\\a.md';
  const far = 'D:\\Workspace\\.claude\\agents\\b.md';
  const files = {}; files[USER_WS] = roleDoc('web-scout');
  files[near] = roleDoc('web-scout', 'model: near'); files[far] = roleDoc('web-scout', 'model: far');
  const r = make(files).resolve({ role: 'web-scout', cwd: SANDBOX });
  assert(r.ok && r.text.indexOf('model: near') !== -1, 'the definition CLOSEST to the launch cwd wins');
}
{
  // "Winner" means the highest-priority candidate MATCHING THE REQUESTED IDENTITY. A nearer
  // directory holding only OTHER agents must not end the search.
  const nearOther = 'D:\\Workspace\\.command-center\\.claude\\agents\\operator.md';
  const farMatch = 'D:\\Workspace\\.claude\\agents\\ws.md';
  const files = {}; files[nearOther] = roleDoc('operator'); files[farMatch] = roleDoc('web-scout', 'model: far');
  const r = make(files).resolve({ role: 'web-scout', cwd: SANDBOX });
  assert(r.ok && r.text.indexOf('model: far') !== -1,
    'a nearer directory containing only OTHER identities does not end the search');
}
{
  const sub = 'D:\\Workspace\\.claude\\agents\\nested\\deep.md';
  const files = {}; files[sub] = roleDoc('web-scout');
  const r = make(files).resolve({ role: 'web-scout', cwd: SANDBOX });
  assert(r.ok && r.scope === 'project', 'subfolders are scanned recursively (they share the namespace)');
}

section('AMBIGUITY AND CAPS \u2014 refuse rather than guess');
{
  const files = {};
  files['D:\\Workspace\\.claude\\agents\\one.md'] = roleDoc('web-scout');
  files['D:\\Workspace\\.claude\\agents\\sub\\two.md'] = roleDoc('web-scout');
  const r = make(files).resolve({ role: 'web-scout', cwd: SANDBOX });
  assert(!r.ok && r.reason === REASON.AMBIGUOUS_IDENTITY,
    'REFUSES two files declaring the same name in one tree (loader uses read order, undocumented)');
}
{
  const files = {}; files[USER_WS] = roleDoc('web-scout');
  const r = make(files, { caps: { ancestors: 1, filesPerDir: 64, depth: 4 } })
    .resolve({ role: 'web-scout', cwd: SANDBOX });
  assert(!r.ok && r.reason === REASON.ANCESTOR_CAP, 'REFUSES when the ancestor cap is exceeded');
  const many = {};
  for (let i = 0; i < 5; i++) many['D:\\Workspace\\.claude\\agents\\f' + i + '.md'] = roleDoc('r' + i);
  many[USER_WS] = roleDoc('web-scout');
  const c = make(many, { caps: { ancestors: 32, filesPerDir: 2, depth: 4 } })
    .resolve({ role: 'web-scout', cwd: SANDBOX });
  assert(!c.ok && c.reason === REASON.SCAN_CAP, 'REFUSES when the per-directory scan cap is exceeded');
}
{
  const files = {};
  files[USER_WS] = roleDoc('web-scout');
  files[HOME + '\\.claude\\agents\\broken.md'] = '---\nname: x\ndescription: |\n  block\n---\n';
  const r = make(files).resolve({ role: 'web-scout', cwd: SANDBOX });
  assert(!r.ok && r.reason === REASON.CANDIDATE_UNSUPPORTED,
    'REFUSES when ANY sibling candidate uses an unsupported grammar (never silently skipped)');
}
{
  const files = {}; files[USER_WS] = roleDoc('web-scout');
  const fsx = Object.assign({}, makeFsx(files), {
    readFileSync: () => { const e = new Error('EACCES'); e.code = 'EACCES'; throw e; },
  });
  const r = make(files, { fsx }).resolve({ role: 'web-scout', cwd: SANDBOX });
  assert(!r.ok && r.reason === REASON.CANDIDATE_UNREADABLE, 'REFUSES an unreadable candidate');
}

section('DOCUMENTATION FILES ARE SKIPPED, NOT REFUSED');
{
  const files = {};
  files[USER_WS] = roleDoc('web-scout');
  files[HOME + '\\.claude\\agents\\README.md'] = '# Notes\n\nNo frontmatter here.\n';
  files[HOME + '\\.claude\\agents\\nameless.md'] = '---\ndescription: d\n---\n';
  const r = make(files).resolve({ role: 'web-scout', cwd: SANDBOX });
  assert(r.ok === true, 'a no-frontmatter file and a no-name file are skipped as documentation');
}

section('NOT DEPLOYED / BAD INPUT');
{
  assert(make({}).resolve({ role: 'web-scout', cwd: SANDBOX }).reason === REASON.ROLE_NOT_DEPLOYED,
    'REFUSES when the identity is not deployed anywhere');
  const files = {}; files[USER_WS] = roleDoc('web-scout');
  for (const bad of [{ role: '', cwd: SANDBOX }, { role: 'web-scout', cwd: '' }, {}, { role: 5, cwd: SANDBOX }]) {
    assert(make(files).resolve(bad).reason === REASON.BAD_INPUT, 'REFUSES bad input: ' + JSON.stringify(bad));
  }
}

section('REFUSAL REASONS ARE BOUNDED CONSTANTS');
{
  const all = Object.values(REASON);
  const files = {}; files['C:\\Program Files\\ClaudeCode\\managed-settings.json'] = '{}';
  const r = make(files, { managedPaths: ['C:\\Program Files\\ClaudeCode\\managed-settings.json'] })
    .resolve({ role: 'web-scout', cwd: SANDBOX });
  assert(all.indexOf(r.reason) !== -1 && r.reason.indexOf('\\') === -1 && r.reason.indexOf('Program') === -1,
    'reason is a declared constant carrying no path');
}

process.stdout.write('\nrole-definition-resolver: ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
