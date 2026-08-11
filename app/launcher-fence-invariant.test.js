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

// ---------------------------------------------------------------------------------------------
// RE-PINNED for Experiment A (pane-status PROTOTYPE), and deliberately not silently.
//
// This tripwire is designed to fail when pty-start changes, so that a human decides whether the
// change is legitimate. Experiment A changes it, because the ONLY way to hand the hook reporter its
// pipe name and pane token is that pane's process environment — the alternatives (argv, a file, a
// persistent user variable, terminal output) are all forbidden by the work order, and rightly.
//
// What changed, exactly:
//   * `ptyEnv block`      213 -> 236 bytes. ONE added spread: `...paneStatusEnv`, which is `{}` for
//                         every pane unless the prototype gate is set AND that pane is the single
//                         enrolled Claude pane.
//   * `pty-start handler` 8714 -> 9289 bytes. The same spread, its comment, and the one line that
//                         computes `paneStatusEnv`.
//
// What did NOT change, and is the reason this re-pin is safe to accept:
//   * `fenced-role cwd gate` — byte-for-byte IDENTICAL, same length, same hash as the reviewed base.
//     The credential/fence containment logic was not touched at all.
//   * `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1'` is still set on every PTY, unchanged and unweakened.
//     Asserted separately below so it cannot be lost in a future re-pin.
//
// Pre-prototype hashes, retained so the reviewed base stays reproducible:
//   ptyEnv block      213  b83cd467dc52406d7c402d89864f39f3bc71639516987ff2768902de273c0820
//   pty-start handler 8714 21c9ab2fc8be096a2be0ec0609070ac74c2d94a5fc6125c2b16e2b3f3e45e421
// ---------------------------------------------------------------------------------------------

// Region definitions: [name, startAnchor, endAnchor, expected byte length, expected sha256].
const REGIONS = [
  {
    name: 'fenced-role cwd gate',
    start: 'if (!opts.videoScout && opts.role && FENCED_ROLES.has(opts.role)) {',
    end: '// Never spawn into a missing directory',
    len: 1354,
    sha: 'ae9dce92cbdd76da7d96ff5b9c5c070e3a96f4ca1f4c1c06b77eb13ccba62060', // UNCHANGED from base
  },
  {
    name: 'ptyEnv block',
    start: 'const ptyEnv = {',
    end: 'let p;',
    len: 236,
    sha: 'cd1007432e476ed49e99383c44b18dabcc817b085f078327b9dd1b61eefb7415',
  },
  {
    name: 'pty-start handler',
    start: "ipcMain.handle('pty-start', (_e, opts) => {",
    end: "ipcMain.on('pty-write'",
    len: 9289,
    sha: 'abe919c44da95b76df1cc5b4547aad5ccba83a24c4c3ab1d0f77f2e6454d4d53',
  },
];

for (const r of REGIONS) {
  const seg = slice(r.start, r.end);
  if (seg === null) { assert(false, `region present: ${r.name}`); continue; }
  assert(seg.length === r.len, `${r.name}: byte length unchanged (${seg.length} === ${r.len})`);
  assert(sha(seg) === r.sha, `${r.name}: sha256 byte-for-byte unchanged from reviewed base`);
}

// CONTENT assertions that survive any future re-pin. A hash tells you something moved; these tell you
// whether the thing that matters is still there. Added with Experiment A precisely because a re-pin
// happened — the next person to re-pin must not be able to quietly drop the scrub along with it.
assert(src.indexOf("CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1'") !== -1,
  'ptyEnv still sets CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1 on every PTY');
assert((src.match(/CLAUDE_CODE_SUBPROCESS_ENV_SCRUB/g) || []).length >= 1,
  'the credential scrub is present and was not renamed away');
assert(!/CLAUDE_CODE_SUBPROCESS_ENV_SCRUB\s*:\s*'0'/.test(src) && !/CLAUDE_CODE_SUBPROCESS_ENV_SCRUB\s*:\s*''/.test(src),
  'the credential scrub is never set to a disabled value');
assert(src.indexOf('...(opts.videoScout ? { GEMINI_API_KEY: geminiKey } : {})') !== -1,
  'the video-scout key injection is still scoped to video-scout panes only');
// The prototype addition must remain a no-op-by-default spread, not an unconditional injection.
assert(src.indexOf('const paneStatusEnv = paneStatus.envForPane(opts);') !== -1,
  'the pane-status prototype env is computed through the gated envForPane()');
assert(!/BLUE_HELM_PANE_STATUS_TOKEN\s*:/.test(src),
  'main.js never writes a literal pane-status token into ptyEnv (the store mints it)');

process.stdout.write(`\nlauncher-fence-invariant: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
