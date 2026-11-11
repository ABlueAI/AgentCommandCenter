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
//   4. README.md points to the notices.
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

process.stdout.write(`\nthird-party-notices: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
