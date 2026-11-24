'use strict';
// Run: node app/third-party-notices.test.js
//
// Guards THIRD-PARTY-NOTICES.md (repo root). On 2026-11-07 the read-aloud bundle
// app/renderer/vendor/kokoro.web.js turned out to carry the GPL-3.0-or-later eSpeak NG engine with no
// notice anywhere in the repo, and the vendored xterm.js files lacked their MIT notice. This test
// keeps the notice complete from now on:
//   1. every file git tracks under app/renderer/vendor/ has a row in the notices table;
//   2. every row in that table names a file git tracks (no stale rows);
//   3. every LICENSES/ file the notices link to exists;
//   4. README.md points to the notices;
//   5 to 7 (S57, the licence guardrail, rules in app/licence-policy.js): every npm package in
//   app/package-lock.json and every file row in the notices carries only permissive licences or
//   is a named exception, and no exception is stale.
// It asks git for the tracked files (not a directory walk), so a gitignored local file such as
// transformers.web.min.js is never required to have a row. If git can't run, the test fails.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  ✓ ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}

const repoRoot = path.join(__dirname, '..');
// Windows checkouts get CRLF line endings (git autocrlf), so normalise before matching on "\n".
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8').replace(/\r\n/g, '\n');
const VENDOR = 'app/renderer/vendor/';

// The two parsers; the self-checks at the end run them on a small sample too.
function rowPaths(notices) {
  // A row is a markdown table line whose first cell is a backticked path under app/renderer/vendor/.
  const re = /^\|\s*`(app\/renderer\/vendor\/[^`]+)`\s*\|/gm;
  return [...notices.matchAll(re)].map((m) => m[1]);
}
function licenceLinks(notices) {
  return [...new Set([...notices.matchAll(/\]\((LICENSES\/[^)#\s]+)\)/g)].map((m) => m[1]))];
}

let tracked = null;
try {
  const out = execFileSync('git', ['ls-files', '-z', '--', VENDOR], { cwd: repoRoot, encoding: 'utf8' });
  tracked = out.split('\0').filter(Boolean);
} catch (e) {
  assert(false, 'git ls-files ran (needed to list tracked vendor files): ' + e.message);
}

let notices = '';
try { notices = read('THIRD-PARTY-NOTICES.md'); } catch (e) { /* asserted below */ }
assert(notices.length > 0, 'THIRD-PARTY-NOTICES.md exists at the repo root');

const rows = rowPaths(notices);

if (tracked) {
  // Floor guard: a broken git call or pathspec must not pass by finding nothing.
  assert(tracked.length >= 7, `found ${tracked.length} tracked files under ${VENDOR} (>= 7 expected)`);
  for (const f of tracked) {
    assert(rows.includes(f), `${f} has a row in THIRD-PARTY-NOTICES.md`);
  }
  for (const r of rows) {
    assert(tracked.includes(r), `notices row ${r} names a file git tracks`);
  }
}
assert(new Set(rows).size === rows.length, 'no file has two rows in THIRD-PARTY-NOTICES.md');

const links = licenceLinks(notices);
assert(links.length >= 3, `the notices link to licence texts under LICENSES/ (found ${links.length})`);
for (const l of links) {
  assert(fs.existsSync(path.join(repoRoot, ...l.split('/'))), `${l} exists`);
}

// The GPL component must stay named as such on its row, not only in prose further down.
const kokoroRow = (notices.split('\n').find((line) => line.startsWith('| `app/renderer/vendor/kokoro.web.js`')) || '');
assert(/GPL-3\.0-or-later/.test(kokoroRow) && /eSpeak NG/.test(kokoroRow),
  'the kokoro.web.js row names eSpeak NG and GPL-3.0-or-later');

let readme = '';
try { readme = read('README.md'); } catch (e) { /* asserted below */ }
assert(readme.includes('](THIRD-PARTY-NOTICES.md)'), 'README.md links to THIRD-PARTY-NOTICES.md');

// Self-checks on the parser, so a regex change can't silently match nothing.
const sample = '| File | x |\n|---|---|\n| `app/renderer/vendor/a.js` | [t](LICENSES/MIT.txt) |\n'
  + 'Prose `app/renderer/vendor/b.js` is not a row. [t](LICENSES/MIT.txt)\n';
assert(JSON.stringify(rowPaths(sample)) === '["app/renderer/vendor/a.js"]', 'parser: only table rows count as rows');
assert(JSON.stringify(licenceLinks(sample)) === '["LICENSES/MIT.txt"]', 'parser: licence links are found once each');

// --- Licence guardrail (S57, app/licence-policy.js) -------------------------------------------
// 5. every npm package in app/package-lock.json declares only permissive licences, or is a named
//    exception (exact name and licence) that THIRD-PARTY-NOTICES.md lists;
// 6. every row in the notices' file tables names only permissive licences, or is a named exception;
// 7. no exception is stale.
const policy = require('./licence-policy');

// Planted samples first, so the real checks below can't pass by matching nothing.
const spdx = (e) => policy.parseSpdx(e);
assert(spdx('MIT').ok && spdx('MIT').permissive, 'spdx: MIT is permissive');
assert(spdx('GPL-3.0-only').ok && !spdx('GPL-3.0-only').permissive, 'spdx: a planted GPL-3.0-only fails');
assert(!spdx('GPL-3.0-or-later').permissive && !spdx('AGPL-3.0').permissive && !spdx('LGPL-2.1+').permissive,
  'spdx: GPL-3.0-or-later, AGPL-3.0 and LGPL-2.1+ fail');
assert(spdx('(MIT OR CC0-1.0)').permissive && spdx('MIT OR GPL-3.0-only').permissive,
  'spdx: an OR with one permissive side passes');
assert(!spdx('MIT AND GPL-3.0-only').permissive && !spdx('(MIT OR GPL-2.0) AND LGPL-3.0').permissive,
  'spdx: an AND with a copyleft part fails');
assert(spdx('Apache-2.0 WITH LLVM-exception').permissive && !spdx('GPL-2.0 WITH Classpath-exception-2.0').permissive,
  'spdx: WITH keeps its licence\'s verdict');
for (const bad of [undefined, '', 'SEE LICENSE IN LICENSE.md', 'UNLICENSED', '(MIT', 'MIT OR', 'LicenseRef-Custom', 'MIT )']) {
  const r = spdx(bad);
  assert(!(r.ok && r.permissive), `spdx: ${JSON.stringify(bad)} does not pass`);
}

const plantedLock = {
  lockfileVersion: 3,
  packages: {
    '': { name: 'command-center', license: 'MIT' },
    'node_modules/ok': { version: '1.0.0', license: 'ISC' },
    'node_modules/planted-gpl': { version: '1.0.0', license: 'GPL-3.0-only' },
    'node_modules/no-licence': { version: '1.0.0' },
    'node_modules/a/node_modules/nested-agpl': { version: '2.0.0', license: 'AGPL-3.0-or-later' },
    'node_modules/excepted': { version: '1.0.0', license: 'LGPL-3.0-or-later' },
    'node_modules/excepted-changed': { version: '1.0.0', license: 'GPL-3.0-only' },
  },
};
const plantedEx = [
  { name: 'excepted', licence: 'LGPL-3.0-or-later' },
  { name: 'excepted-changed', licence: 'LGPL-3.0-or-later' },
  { name: 'gone', licence: 'GPL-2.0' },
];
const pl = policy.checkLockfile(plantedLock, plantedEx).problems.join('\n');
assert(/planted-gpl@1\.0\.0/.test(pl), 'lockfile: the planted GPL-only package fails');
assert(/no-licence@1\.0\.0.*can't be read/.test(pl), 'lockfile: a package with no licence fails');
assert(/nested-agpl@2\.0\.0/.test(pl), 'lockfile: a nested AGPL package fails');
assert(!/package excepted@/.test(pl), 'lockfile: an exception with the same licence passes');
assert(/excepted-changed@1\.0\.0.*its exception is for/.test(pl), 'lockfile: an exception whose licence changed fails');
assert(/stale exception: no package gone/.test(pl), 'lockfile: a stale exception fails');
assert(!/package ok@/.test(pl), 'lockfile: an ISC package passes');
assert(policy.checkLockfile({ packages: { '': { license: 'GPL-3.0-only' } } }, []).problems.length === 1,
  'lockfile: Mako itself must stay MIT');
assert(policy.checkLockfile({ lockfileVersion: 1, dependencies: {} }, []).problems.length === 1,
  'lockfile: a lockfile without "packages" fails instead of passing empty');

const plantedNotices = '| File | Upstream | Licence | Source |\n|---|---|---|---|\n'
  + '| `vendor/ok.js` | x | MIT ([text](LICENSES/MIT.txt)) | y |\n'
  + '| `vendor/planted.js` | x | GPL-3.0-only ([text](LICENSES/GPL-3.0.txt)) | y |\n'
  + '| `vendor/blank.js` | x | see the file | y |\n'
  + '| `vendor/mixed.js` | x | Mixed: GPL-3.0-or-later for a; MIT for the rest | y |\n'
  + '\n| npm package | Licence (as declared) |\n|---|---|\n| `not-a-file-row` | GPL-3.0-only |\n';
const nrows = policy.noticeFileRows(plantedNotices);
assert(nrows.length === 4 && nrows[0].file === 'vendor/ok.js' && /^MIT/.test(nrows[0].licence),
  'notices parser: finds the four file rows and their Licence cells, not other tables');
const np = policy.checkNoticeRows(nrows, [{ file: 'vendor/mixed.js', mustName: 'GPL-3.0-or-later' }, { file: 'vendor/gone.js', mustName: 'GPL' }]).join('\n');
assert(/vendor\/planted\.js/.test(np), 'notices: a planted GPL-only vendored file fails');
assert(/vendor\/blank\.js.*names no permissive/.test(np), 'notices: a row naming no licence fails');
assert(!/row vendor\/ok\.js/.test(np) && !/row vendor\/mixed\.js/.test(np), 'notices: MIT passes; the named exception passes');
assert(/stale file exception: vendor\/gone\.js/.test(np), 'notices: a stale file exception fails');
assert(policy.checkNoticeRows([{ file: 'x', licence: 'MIT; Replacing nothing' }], []).length === 0,
  'notices: words that merely contain "epl" or "gpl" letters don\'t trip the check');

// The real lockfile and notices.
let lock = null;
try { lock = JSON.parse(read('app', 'package-lock.json')); } catch (e) {
  assert(false, 'app/package-lock.json parses: ' + e.message);
}
if (lock) {
  const real = policy.checkLockfile(lock);
  assert(real.checked >= 50, `the licence check read ${real.checked} npm packages (>= 50 expected)`);
  for (const p of real.problems) assert(false, p);
  // End to end: the real lockfile plus one planted GPL-only dependency fails on exactly that one.
  const planted = JSON.parse(JSON.stringify(lock));
  planted.packages['node_modules/planted-gpl-dep'] = { version: '9.9.9', license: 'GPL-3.0-only' };
  const pp = policy.checkLockfile(planted).problems;
  assert(pp.length === real.problems.length + 1 && pp.some((x) => x.includes('planted-gpl-dep@9.9.9')),
    'the real lockfile with a planted GPL-only dependency fails on that dependency');
  assert(real.problems.length === 0, 'every npm package in app/package-lock.json has a permissive licence or a named exception');
}
const realRows = policy.noticeFileRows(notices);
assert(realRows.length >= rows.length + 4,
  `the licence check read ${realRows.length} notices file rows (the vendor rows plus the 4 agent rows expected)`);
const rowProblems = policy.checkNoticeRows(realRows);
for (const p of rowProblems) assert(false, p);
assert(rowProblems.length === 0, 'every THIRD-PARTY-NOTICES.md file row has a permissive licence or a named exception');
for (const ex of policy.PACKAGE_EXCEPTIONS) {
  assert(notices.includes('| `' + ex.name + '` |'), `npm exception ${ex.name} is listed in THIRD-PARTY-NOTICES.md`);
}

process.stdout.write(`\nthird-party-notices: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
