'use strict';
// Run: node app/launcher-fence-invariant.test.js
//
// P12 SOURCE-INVARIANT PROOF. The P12 launcher-hardening branch changes ONLY the launcher path. The
// credential/fence-critical regions of app/main.js must be byte-for-byte identical to the reviewed
// base (a6bba64b2adef827e07592f7c54a81ccfcfcc86a). This asserts that by sha256 over byte-exact string
// slices of the CURRENT app/main.js:
//   * the fenced-role cwd gate (FENCED_ROLES containment before a PTY spawns),
//   * the ptyEnv block (CLAUDE_CODE_SUBPROCESS_ENV_SCRUB + the video-scout GEMINI_API_KEY injection),
//   * the ENTIRE pty-start IPC handler.
// Anchors are CONTENT strings (not line numbers), so unrelated edits above/below do not move them. If
// a future edit perturbs any region, this fails loudly — the same anti-regression posture as the
// fence's own tests. The pinned hashes were captured from main.js at the reviewed base.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function slice(startAnchor, endAnchor) {
  const i = src.indexOf(startAnchor);
  const j = i < 0 ? -1 : src.indexOf(endAnchor, i);
  if (i < 0 || j < 0) return null;
  return src.slice(i, j);
}
function sha(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }

// Region definitions: [name, startAnchor, endAnchor, expected byte length, expected sha256].
const REGIONS = [
  {
    name: 'fenced-role cwd gate',
    start: 'if (!opts.videoScout && opts.role && FENCED_ROLES.has(opts.role)) {',
    end: '// Never spawn into a missing directory',
    len: 1354,
    sha: 'ae9dce92cbdd76da7d96ff5b9c5c070e3a96f4ca1f4c1c06b77eb13ccba62060',
  },
  {
    name: 'ptyEnv block',
    start: 'const ptyEnv = {',
    end: 'let p;',
    len: 213,
    sha: 'b83cd467dc52406d7c402d89864f39f3bc71639516987ff2768902de273c0820',
  },
  {
    name: 'pty-start handler',
    start: "ipcMain.handle('pty-start', (_e, opts) => {",
    end: "ipcMain.on('pty-write'",
    len: 8714,
    sha: '21c9ab2fc8be096a2be0ec0609070ac74c2d94a5fc6125c2b16e2b3f3e45e421',
  },
];

for (const r of REGIONS) {
  const seg = slice(r.start, r.end);
  if (seg === null) { assert(false, `region present: ${r.name}`); continue; }
  assert(seg.length === r.len, `${r.name}: byte length unchanged (${seg.length} === ${r.len})`);
  assert(sha(seg) === r.sha, `${r.name}: sha256 byte-for-byte unchanged from reviewed base`);
}

process.stdout.write(`\nlauncher-fence-invariant: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
