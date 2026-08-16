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
// What changed in REVISION 1, exactly:
//   * `ptyEnv block`      213 -> 236 bytes. ONE added spread: `...paneStatusEnv`, which is `{}` for
//                         every pane unless the prototype gate is set AND that pane is the single
//                         enrolled Claude pane.
//   * `pty-start handler` 8714 -> 9289 bytes. The same spread, its comment, and the one line that
//                         computes `paneStatusEnv`.
//
// RE-PINNED AGAIN for REVISION 2, after a Full-class VERDICT: FAIL. Exactly one region moved again:
//   * `pty-start handler` 9289 -> 9913 bytes. The ONLY change is in the `pty.spawn` FAILURE path: it
//                         now calls `paneStatus.releasePane(id)` (plus its comment). `envForPane`
//                         enrols the pane and mints its token BEFORE the spawn is attempted, so a
//                         failed spawn used to strand the single Experiment A slot — under classic
//                         layout the renderer never cleans it up, and every later Claude pane
//                         silently got no status until the app restarted. Enrolment is taken in main,
//                         so it is handed back in main.
//   * `ptyEnv block`      236 bytes — UNCHANGED from revision 1. The environment handed to a PTY was
//                         not touched by revision 2 at all.
//
// What did NOT change across EITHER revision, and is the reason these re-pins are safe to accept:
//   * `fenced-role cwd gate` — byte-for-byte IDENTICAL, same length, same hash as the reviewed base.
//     The credential/fence containment logic has never been touched.
//   * `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1'` is still set on every PTY, unchanged and unweakened.
//     Asserted separately below so it cannot be lost in a future re-pin.
//
// RE-PINNED AGAIN for the MAIN-OWNED TURN ADMISSION BUDGET (Blue's turn-accounting OUTCOME B).
// Blue's authorization, verbatim: I SELECT TURN-ACCOUNTING OUTCOME B. THE FOURTH TURN REMAINS
// UNEXPLAINED. NO LIVE PANE-STATUS PROVIDER SESSION IS AUTHORIZED UNTIL THE MAIN-OWNED ADMISSION
// BUDGET IS REVIEWED AND LANDED.
//
// This tripwire fired, which is exactly what it is for. The change is legitimate and is the point of
// the work order: bounding paid turns REQUIRES touching the PTY boundary, because that boundary is
// where a paid prompt becomes a real cost. Two regions moved:
//
//   * `ptyEnv block`      236 -> 271 bytes. ONE substitution, +35 bytes:
//         ...process.env
//     became
//         ...admissionConfig.stripAdmissionEnv(process.env)
//     `stripAdmissionEnv` returns a COPY of the parent environment with every key in
//     ADMISSION_ENV_KEYS removed, so the run id and allowance that bound a pane's paid turns are not
//     readable by that pane — the same class of leak `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` exists to
//     prevent, applied to the cost control instead of a credential. Nothing else in the block moved:
//     the scrub, the video-scout key scoping, and the pane-status spread are byte-identical.
//     The key list is asserted complete by admission-budget-config.test.js, which fails if an
//     ENV_* constant is added without being added to the scrub list.
//
//   * `pty-start handler` 9913 -> 12443 bytes. Three additions, no deletions and no reordering:
//       1. the seven-line comment above `const ptyEnv` explaining the scrub, plus the +35 above;
//       2. a pane-claim block after a successful spawn — the run binds to the FIRST eligible pane,
//          because renderer pane ids are minted at runtime and cannot be known when the plan is
//          parsed at startup. The binding is persisted immutably, so a second pane is refused rather
//          than re-pointed; a refused claim leaves the pane completely ordinary;
//       3. `p.onExit` grew from a one-liner to a block that also calls `admissionBudget.notePaneExit`
//          and `admissionIpc.forgetPane`, so a dead pane's unused allowance is VOIDED rather than
//          left claimable by another pane.
//
// What did NOT change, and is the reason this re-pin is safe to accept:
//   * `fenced-role cwd gate` — byte-for-byte IDENTICAL again: 1354 bytes, sha ae9dce92…, the same
//     value as the ORIGINAL reviewed base. The credential/fence containment logic has still never
//     been touched by any of these three re-pins.
//   * `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1'` is still set on every PTY, unchanged and unweakened
//     (asserted separately below).
//   * The spawn itself, its arguments, the cwd resolution, and the video-scout validation path are
//     all unmoved.
//
// Prior hashes, retained so every reviewed base stays reproducible:
//   ptyEnv block      213  b83cd467dc52406d7c402d89864f39f3bc71639516987ff2768902de273c0820  (base)
//   ptyEnv block      236  cd1007432e476ed49e99383c44b18dabcc817b085f078327b9dd1b61eefb7415  (rev 1/2)
//   pty-start handler 8714 21c9ab2fc8be096a2be0ec0609070ac74c2d94a5fc6125c2b16e2b3f3e45e421  (base)
//   pty-start handler 9289 abe919c44da95b76df1cc5b4547aad5ccba83a24c4c3ab1d0f77f2e6454d4d53  (rev 1)
//   pty-start handler 9913 67cb161c6dea42ca9b8be3bc87f783e264a7cab8d73607cdd0d79747fbba8c73  (rev 2)
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
    len: 271,
    sha: '2a399a9890fbeccd05141779f69958878f42232a8a42e2f9e0aaf992408657f8',
  },
  {
    name: 'pty-start handler',
    start: "ipcMain.handle('pty-start', (_e, opts) => {",
    end: "ipcMain.on('pty-write'",
    len: 12443,
    sha: 'b5fe654e0d638de756079e7a0d67fa1fbba134f40f9d99a189091df9f1c7a945',
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
// Revision 2 content assertions — the reason THIS re-pin happened, pinned as behaviour so the next
// re-pin cannot quietly drop them along with the hash.
{
  const failTail = src.slice(src.indexOf('pty-start: pty.spawn FAILED'));
  const failBlock = failTail.slice(0, failTail.indexOf('return { ok: false'));
  assert(failBlock.indexOf('paneStatus.releasePane(id)') !== -1,
    'a failed pty.spawn releases the pane-status enrolment in main\'s own failure path');
}
assert(src.indexOf('paneStatus.setObservedVersion(') !== -1,
  'main.js feeds a DISCOVERED provider version into the prototype (never a hard-coded one)');
assert(!/createPaneStatusPrototype\(\{[\s\S]{0,400}?observedVersion/.test(src),
  'and never hard-codes observedVersion at construction');

// TURN ADMISSION BUDGET content assertions — the reason THIS re-pin happened, pinned as behaviour so
// the next re-pin cannot quietly drop them along with the hash. A hash says something moved; these say
// whether the cost control is still wired.
assert(src.indexOf('...admissionConfig.stripAdmissionEnv(process.env)') !== -1,
  'ptyEnv is built from the admission-scrubbed environment copy, not raw process.env');
{
  // The scrub must be the FIRST spread in ptyEnv: a later `...process.env` would put the keys back.
  const envBlock = src.slice(src.indexOf('const ptyEnv = {'), src.indexOf('let p;', src.indexOf('const ptyEnv = {')));
  assert(!/\.\.\.process\.env\b/.test(envBlock),
    'the ptyEnv block never spreads raw process.env — the admission keys cannot be reintroduced');
  assert(envBlock.indexOf('...admissionConfig.stripAdmissionEnv(process.env)') <
         envBlock.indexOf("CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1'"),
    'the scrubbed copy is the base of the object, with the credential scrub layered on top of it');
}
assert(/admissionBudget\.claimPane\(id\)/.test(src),
  'pty-start binds the controlled run to the first eligible pane, in main');
assert(/admissionBudget\.notePaneExit\(id\)/.test(src),
  'a pane exit voids the remaining allowance rather than leaving it claimable');
assert(!/admissionBudget\.(setAllowance|reset|refund|grant|certify)\b/.test(src),
  'main.js never calls a mutation that could restore or extend an allowance (none exists)');

process.stdout.write(`\nlauncher-fence-invariant: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
