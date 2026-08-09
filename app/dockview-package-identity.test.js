'use strict';
// Run: node app/dockview-package-identity.test.js
// Plain Node.js — pins the EXACT dependency identity the Dockview work order § 4 requires, so a
// silent version drift, a React introduction, or a bundler creeping in fails the gate rather than
// being discovered during review.
//
// Every value here is asserted against the on-disk install and the lockfile — not against the
// procurement record's prose, which could go stale independently.

const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const APP_DIR = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package-lock.json'), 'utf8'));

const EXPECTED_VERSION = '7.0.4';
const EXPECTED_INTEGRITY = {
  'node_modules/dockview': 'sha512-n6n9WpYZgp/WY8SgvP4hr9qh01ZXhSGIRmlhoJXxRU3f34bwxCbFyOhBArV4W8quolX8OQe1yPfAUwUUjdnZPA==',
  'node_modules/dockview-core': 'sha512-AiIzD6ov153L/VuhqVBg5KD5oSAgJGH7L1xvzV/X+ghIEOTFfEQYEBGNd/ys+ZjQfdGRogHSeQ0v9JF/L6JrPg==',
};

// ---------------------------------------------------------------------------
process.stdout.write('\nexact, pinned package identity\n');
// ---------------------------------------------------------------------------
{
  assert(pkg.dependencies.dockview === EXPECTED_VERSION,
    `package.json pins dockview to exactly ${EXPECTED_VERSION} (no range)`);
  assert(/^\d+\.\d+\.\d+$/.test(pkg.dependencies.dockview),
    'the pin carries no ^ or ~ — --save-exact was used');
  assert(pkg.dependencies['dockview-core'] === undefined,
    'dockview-core is NOT a direct dependency (it is internal in v7)');
  assert(pkg.dependencies['dockview-react'] === undefined && pkg.devDependencies['dockview-react'] === undefined,
    'dockview-react is not installed');

  for (const [key, integrity] of Object.entries(EXPECTED_INTEGRITY)) {
    const entry = lock.packages[key];
    assert(!!entry, `${key} is present in the lockfile`);
    assert(entry && entry.version === EXPECTED_VERSION, `${key} resolves to exactly ${EXPECTED_VERSION}`);
    assert(entry && entry.integrity === integrity, `${key} integrity matches the recorded value`);
    assert(entry && entry.license === 'MIT', `${key} is MIT`);
    assert(entry && entry.hasInstallScript !== true, `${key} has no install script`);
  }
}

// ---------------------------------------------------------------------------
process.stdout.write('\nno React, anywhere in the tree\n');
// ---------------------------------------------------------------------------
{
  const paths = Object.keys(lock.packages);
  const reactPaths = paths.filter((p) => /(^|\/)react(-dom)?$/.test(p) || /react/i.test(p));
  assert(reactPaths.length === 0, `no lockfile entry mentions react (checked ${paths.length} entries)`);

  const declared = [];
  for (const [p, e] of Object.entries(lock.packages)) {
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']) {
      for (const dep of Object.keys((e && e[field]) || {})) {
        if (/^react(-dom)?$/.test(dep)) declared.push(`${p} -> ${field}.${dep}`);
      }
    }
  }
  assert(declared.length === 0, 'no package declares react or react-dom as any kind of dependency');
  assert(!fs.existsSync(path.join(APP_DIR, 'node_modules', 'react')), 'node_modules/react does not exist');
  assert(!fs.existsSync(path.join(APP_DIR, 'node_modules', 'react-dom')), 'node_modules/react-dom does not exist');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe dependency closure is exactly two packages\n');
// ---------------------------------------------------------------------------
{
  const dockviewEntry = lock.packages['node_modules/dockview'];
  assert(JSON.stringify(dockviewEntry.dependencies) === JSON.stringify({ 'dockview-core': '^7.0.4' }),
    'dockview depends on dockview-core alone');
  const coreEntry = lock.packages['node_modules/dockview-core'];
  assert(!coreEntry.dependencies || Object.keys(coreEntry.dependencies).length === 0,
    'dockview-core has zero dependencies');
  assert(!coreEntry.peerDependencies, 'dockview-core has no peer dependencies');

  // No bundler / transpiler was pulled in — § 4 stops for Blue if a second build dependency appears.
  const bundlers = Object.keys(lock.packages)
    .filter((p) => /(esbuild|webpack|rollup|vite|parcel|@swc|babel|browserify)/i.test(p));
  assert(bundlers.length === 0, `no bundler or transpiler is installed (${bundlers.join(', ') || 'none'})`);
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe installed package on disk agrees with the lockfile\n');
// ---------------------------------------------------------------------------
{
  for (const name of ['dockview', 'dockview-core']) {
    const p = path.join(APP_DIR, 'node_modules', name, 'package.json');
    assert(fs.existsSync(p), `${name} is installed`);
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert(j.version === EXPECTED_VERSION, `installed ${name} is ${EXPECTED_VERSION}`);
    assert(j.license === 'MIT', `installed ${name} declares MIT`);
  }

  // The browser-loadable UMD bundle is what the prototype actually loads (the published ESM entry
  // imports the bare specifier 'dockview-core', which a file:// renderer cannot resolve).
  const umd = path.join(APP_DIR, 'node_modules', 'dockview', 'dist', 'dockview.js');
  assert(fs.existsSync(umd), 'the self-contained UMD bundle exists at dist/dockview.js');
  const source = fs.readFileSync(umd, 'utf8');
  assert(/@license MIT/.test(source), 'the bundle carries an MIT licence banner');
  assert(/global\.dockview\s*=\s*\{\}/.test(source), 'the bundle publishes the global `dockview`');
  assert(!/require\(['"][^'"]+['"]\)/.test(source), 'the bundle has no surviving external require()');

  // The ESM entry's bare specifier is the reason the UMD bundle is used. Pin that fact, so if a
  // future version ships a self-contained ESM bundle the choice can be revisited deliberately.
  const esm = fs.readFileSync(path.join(APP_DIR, 'node_modules', 'dockview', 'dist', 'package', 'main.esm.mjs'), 'utf8');
  assert(/from ['"]dockview-core['"]/.test(esm),
    'the published ESM entry still imports the bare specifier dockview-core (not browser-resolvable)');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nno network or telemetry primitives in the shipped bundle\n');
// ---------------------------------------------------------------------------
{
  const source = fs.readFileSync(path.join(APP_DIR, 'node_modules', 'dockview', 'dist', 'dockview.js'), 'utf8');
  for (const [pattern, label] of [
    [/\bfetch\s*\(/, 'fetch('],
    [/XMLHttpRequest/, 'XMLHttpRequest'],
    [/WebSocket/, 'WebSocket'],
    [/EventSource/, 'EventSource'],
    [/sendBeacon/, 'sendBeacon'],
    [/importScripts/, 'importScripts'],
    [/new\s+Worker\b/, 'new Worker'],
    [/\beval\s*\(/, 'eval('],
    [/new\s+Function\b/, 'new Function'],
    [/localStorage/, 'localStorage'],
    [/sessionStorage/, 'sessionStorage'],
    [/indexedDB/, 'indexedDB'],
    [/document\.cookie/, 'document.cookie'],
  ]) {
    assert(!pattern.test(source), `the bundle contains no ${label}`);
  }

  // Every URL literal must be the SVG namespace or a documentation comment — no endpoints.
  const urls = [...new Set(source.match(/https?:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+/g) || [])];
  const nonDoc = urls.filter((u) =>
    !u.startsWith('http://www.w3.org/2000/svg') &&
    !/^https:\/\/(developer\.mozilla\.org|github\.com|en\.wikipedia\.org|stackoverflow\.com|rxjs\.dev|terodox\.tech)/.test(u));
  assert(nonDoc.length === 0, `no endpoint-shaped URL literals (unexpected: ${nonDoc.join(', ') || 'none'})`);
}

// ---------------------------------------------------------------------------
process.stdout.write(`\ndockview-package-identity: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
