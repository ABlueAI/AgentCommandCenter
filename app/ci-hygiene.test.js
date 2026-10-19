'use strict';
// Run: node app/ci-hygiene.test.js
//
// Session S02 (CI and dependency hygiene) pins, so they can't quietly slip back:
//   1. Every GitHub Action a workflow uses is pinned to a full 40-character commit SHA, with its
//      release tag in a trailing comment. A tag like `@v5` can be moved by whoever controls the
//      action's repository; a commit SHA can't.
//   2. The CI job names stay the two required status checks on `main` (ruleset protect-main). A
//      renamed job would leave the required check waiting forever and block every merge.
//   3. The packages `npm audit fix` patched in S02 stay at or above their fixed versions in the
//      lockfile (docs/DEPENDENCY-ADVISORIES.md lists each advisory and why the rest remain).

const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  ✓ ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}

const repoRoot = path.join(__dirname, '..');
const workflowsDir = path.join(repoRoot, '.github', 'workflows');

process.stdout.write('\nworkflow actions are pinned to commit SHAs\n');
const PINNED = /^\s*(?:-\s*)?uses:\s*[A-Za-z0-9_.-]+\/[A-Za-z0-9_.\/-]+@[0-9a-f]{40}\s+#\s*v\d+(?:\.\d+){0,2}\s*$/;
const workflowFiles = fs.readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f));
assert(workflowFiles.includes('ci.yml') && workflowFiles.includes('merge-audit.yml'),
  `found the workflows (${workflowFiles.join(', ')})`);
let usesCount = 0;
for (const file of workflowFiles) {
  const lines = fs.readFileSync(path.join(workflowsDir, file), 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!/^\s*(?:-\s*)?uses:/.test(line)) return;
    usesCount++;
    assert(PINNED.test(line), `${file}:${i + 1} pins a commit SHA with a tag comment (${line.trim()})`);
  });
}
assert(usesCount >= 5, `every uses: line was checked (${usesCount} found, at least 5 expected)`);

process.stdout.write('\nCI job names match the required checks on main\n');
const ci = fs.readFileSync(path.join(workflowsDir, 'ci.yml'), 'utf8');
for (const check of ['App tests (Windows)', 'PowerShell tests (Windows)']) {
  assert(new RegExp(`^\\s+name:\\s*${check.replace(/[()]/g, '\\$&')}\\s*$`, 'm').test(ci),
    `ci.yml has a job named "${check}"`);
}

process.stdout.write('\naudited packages stay at or above their fixed versions\n');
const lock = JSON.parse(fs.readFileSync(path.join(__dirname, 'package-lock.json'), 'utf8'));
function atLeast(version, floor) {
  const a = version.split(/[.-]/).slice(0, 3).map(Number);
  const b = floor.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}
const FLOORS = {
  electron: '42.10.0',  // GHSA-qmv3-fv6v-rmhq and five others: fixed in 42.10.0
  undici: '7.29.1',     // fifteen advisories in 7.x: fixed in 7.29.1
  tar: '7.5.21',        // GHSA-r292-9mhp-454m: affects <= 7.5.20
  protobufjs: '7.6.5',  // GHSA-j3f2-48v5-ccww: affects 7.5.0 to 7.6.4
};
for (const [name, floor] of Object.entries(FLOORS)) {
  const entry = lock.packages[`node_modules/${name}`];
  const version = entry && entry.version;
  assert(typeof version === 'string' && atLeast(version, floor), `${name} ${version} >= ${floor}`);
}
assert(!atLeast('7.6.4', '7.6.5') && atLeast('42.11.15', '42.10.0') && !atLeast('42.9.3', '42.10.0'),
  'the version comparison orders patch and minor numbers numerically');

process.stdout.write(`\nci-hygiene: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
