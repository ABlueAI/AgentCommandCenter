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
const { buildPtyEnv } = require('./pty-env');

// LINE-ENDING NORMALIZATION — READ THIS BEFORE RE-PINNING ANYTHING BELOW.
//
// These anchors hash a REGION OF SOURCE, so they only mean anything if the same commit always yields
// the same characters. It did not. `.gitattributes` sets `* text=auto` and this machine has
// `core.autocrlf=true`, so main.js is stored LF and checked out CRLF — but a builder whose editor
// appends NEW lines with a bare LF into an already-CRLF working file leaves a MIXED-ending file that
// still commits to the identical blob. That is exactly what happened here: the previous pins were
// measured on such a mixed working tree, and a CLEAN CHECKOUT OF THE VERY SAME COMMIT produced a
// `pty-start handler` region 35 characters longer — failing this suite for a region that had not
// changed by a single character. A tripwire that fires on checkout state rather than on content is
// worse than no tripwire: it trains the next reader to re-pin without looking.
//
// So the source is NORMALIZED TO LF before slicing and hashing. The pins below are now reproducible
// from the committed object itself — `git show <sha>:app/main.js` — on any machine and under any
// autocrlf setting, rather than from one particular working tree.
//
// UNIT CHANGE, ONE TIME: the historical counts in the comment block below were measured in CRLF units
// and are NOT comparable to the LF units used from here on. Each guarded region was verified
// byte-identical to the previous branch tip at the moment these values were rebased.
const rawSrc = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const src = rawSrc.split('\r\n').join('\n');

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
//     present in that pane's environment. Nothing else in the block moved: the scrub, the video-scout
//     key scoping, and the pane-status spread are byte-identical. The key list is asserted complete by
//     admission-budget-config.test.js, which fails if an ENV_* constant is added without being added
//     to the scrub list.
//
//     WHAT THAT DOES NOT MEAN — the earlier wording here drew a false analogy to
//     `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` and implied the pane therefore cannot reach the cost control.
//     It can. Removing those keys prevents their inheritance into the pane environment and nothing
//     more: it does not hide Electron `userData`, it creates no filesystem isolation, `APPDATA` and
//     `USERPROFILE` are still in the child environment, and the ledger filename is a literal in
//     readable repository source. A PTY child runs as the same Windows user as main and has the same
//     access to that file. The admission ledger is an ACCIDENTAL-SPEND control over Blue Helm's input
//     paths, not a boundary against a malicious or compromised same-user process. See the
//     threat-boundary header in app/admission-budget.js.
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
//
// NOT RE-PINNED for the QUICK LINKS INTEGRATION REBASE — and that is the finding, not an omission.
//
// The admission branch was rebased from a2121ca3 onto main 5bbe3635 ("Merge Quick Links Release 1.0").
// A rebase can silently drop a side, so all three regions were recomputed INDEPENDENTLY from the raw
// bytes of four separate revisions rather than inferred from the fact that this file still passes:
//
//   revision                                  fenced-role gate      ptyEnv block      pty-start handler
//   a6bba64b  original reviewed base          1354 / ae9dce92…      213 / b83cd467…    8714 / 21c9ab2f…
//   5bbe3635  main, Quick Links landed        1354 / ae9dce92…      236 / cd100743…    9913 / 67cb161c…
//   5f8cb59d  admission, pre-rebase           1354 / ae9dce92…      271 / 2a399a98…   12443 / b5fe654e…
//   (this)    admission, post-rebase          1354 / ae9dce92…      271 / 2a399a98…   12443 / b5fe654e…
//
// Two things are proven by that table, and neither was taken on trust:
//   1. Quick Links did not touch this boundary. At 5bbe3635 the ptyEnv block and the pty-start handler
//      still carry the EXACT revision-2 values (236 / cd100743… and 9913 / 67cb161c…) that predate the
//      admission work entirely. The claim "Quick Links did not modify pty-start" is therefore measured,
//      not assumed from the merge's file list.
//   2. The rebase composed rather than replaced. Post-rebase, both moved regions equal the pre-rebase
//      admission values byte-for-byte, so the admission delta survived the rebase intact and no Quick
//      Links content was displaced from inside these regions.
//
//   * `fenced-role cwd gate` — 1354 bytes, sha ae9dce92…, IDENTICAL at all four points above, which
//     now includes both the Quick Links merge and this rebase. The credential/fence containment logic
//     has never been touched by any revision, by either feature, or by the integration between them.
//
// RE-PINNED (fourth time) for the ADMISSION LEDGER THREAT-BOUNDARY CORRECTION.
// Blue's authorization, verbatim:
//   I ACCEPT THE ADMISSION LEDGER AS AN ACCIDENTAL-SPEND CONTROL, NOT A SECURITY BOUNDARY AGAINST A
//   MALICIOUS OR COMPROMISED SAME-USER PANE. CORRECT THE FALSE PROVIDER-INACCESSIBILITY CLAIMS,
//   REMOVE THE UNREACHABLE ROLLBACK GUARD, AND RETURN FOR FULL REVIEW.
//
// EXACTLY ONE REGION MOVED, AND THE CHANGE IS COMMENT-ONLY:
//   * `pty-start handler` 12443 -> 13170 bytes. The comment above `const ptyEnv` was corrected: it
//     used to say the child "must not be able to read, and therefore must not be able to reason about
//     or rewrite" its own budget configuration, which overstated what stripping environment keys
//     achieves. The replacement states plainly that the strip removes the run-id and allowance keys
//     from the inherited pane environment and nothing more — no `userData` concealment, no filesystem
//     isolation, and no
//     implication that `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` prevents a same-user process from reaching
//     the ledger.
//
// NO EXECUTABLE STATEMENT IN THIS REGION CHANGED. That is the load-bearing claim of this re-pin, and
// it is independently checkable two ways:
//   1. `ptyEnv block` is STILL 271 / 2a399a98… — byte-identical to the previous pin. The environment
//      actually handed to a PTY was not touched at all, because the corrected text sits ABOVE the
//      `const ptyEnv = {` anchor and therefore outside that region while remaining inside the wider
//      pty-start region.
//   2. `fenced-role cwd gate` is STILL 1354 / ae9dce92… — the same value as the ORIGINAL reviewed
//      base, now across four re-pins, two features and one rebase.
// The +727 bytes are the net comment delta. Every content assertion below still passes unchanged.
//
// Prior hash for the region that moved, retained:
//   pty-start handler 12443 b5fe654e0d638de756079e7a0d67fa1fbba134f40f9d99a189091df9f1c7a945  (rev 3)
//
// RE-PINNED (fifth time) for the PROTECTIVE ADMISSION STATE-MACHINE CORRECTION.
// The fenced-role gate and ptyEnv executable block remain byte-identical. The wider pty-start handler
// intentionally changes admission composition: the pure launch policy now distinguishes absent from
// invalid configuration, selects only eligible Claude panes, refuses launch-time prompts, durably
// claims before spawn, and closes/voids a claimed run when spawn fails. Generic/admitted PTY bytes now
// converge in admission-pty-boundary.js, outside this region, behind a private main-local capability.
// Prior threat-correction hash retained:
//   pty-start handler 13170 eb3c26968e6c447f15b4e5ccbe2c999912d189213ed006615efc25938738dfe0  (rev 4)
//
// RE-PINNED (eighth time) for P1 FENCED-ROLE ENVIRONMENT CONTAINMENT. The one PTY environment
// literal moved into the pure, dynamically tested buildPtyEnv module. main now computes the standing
// fenced-role predicate, passes process.env as INPUT rather than spreading it, and hands the returned
// ptyEnv to the same single pty.spawn sink. The wider handler is shorter because stale prototype and
// setx-residue commentary was replaced by the precise P1 boundary and explicit-injection ordering.
//
// What did NOT change:
//   * `fenced-role cwd gate` remains 1326 / 9a1255f1... byte-for-byte identical.
//   * pane-status enrollment still occurs before environment construction, and the exact returned
//     paneStatusEnv is passed as builder input; the builder copies only the two exact transport keys
//     whose values are strings.
//   * the spawn executable, argv, cwd, failure cleanup, and one pty.spawn sink remain in place.
//
// Previous production pins retained:
//   ptyEnv block      265   b0bc588013e85de54042a0f19f30d187d8fcd22c2fec5f4e9596ad3527e1b77d
//   pty-start handler 14993 03eab4cd2bd2fd44c182ad3901b5735696c76fbf4a9345ebb49f1db161c7a30b
//
// REVISION 1, authorized by Blue after the first app gate: the executable statements and ptyEnv
// block remain byte-identical. The handler comment restores the admission ledger's required positive
// threat-boundary statements (inherited-key effect, APPDATA/USERPROFILE visibility, and
// ACCIDENTAL-SPEND classification) after admission-budget.test.js correctly rejected their omission.
// Pre-revision P1 handler pin retained: 12808 /
// 658100cfb25734f0efb9d87997efd249fcaa0576f69e354c3b2440afc4802814.
//
// RE-PINNED (ninth time) for P1 REVISION 6 COMMENT ACCURACY. Before main.js was edited, the handoff
// pre-registered that the 1326-byte cwd gate and 229-byte executable ptyEnv block MUST remain exact,
// while the full handler MUST move because it includes the inaccurate comment. The old pin then
// failed exactly that way: gate and block passed; only the handler reported 13484 !== 13205 and a
// changed hash. The main.js-only R6 artifact is the independent evidence: it contains only comment
// lines correcting construction order and the two-key/string-value pane-status boundary. No
// executable statement changed. The immutable pins remeasured exactly as predicted:
//   fenced-role cwd gate 1326 / 9a1255f1e81e0a9e4e289ab15380707dd6bcc1d410ffd16f44adddb99b16f8c6
//   ptyEnv block         229 / 18cf42b434ee922ee61194d9316150c0b766591e063d0b0545f6aebc8d85cb54
// Previous handler pin retained:
//   pty-start handler 13205 / 14d3ae60ed6ea32e4231fdef7d0979e160207b0580466f53178a4b9f86098486
// ---------------------------------------------------------------------------------------------

// Region definitions: [name, startAnchor, endAnchor, expected byte length, expected sha256].
const REGIONS = [
  {
    name: 'fenced-role cwd gate',
    start: 'if (!opts.videoScout && opts.role && FENCED_ROLES.has(opts.role)) {',
    end: '// Never spawn into a missing directory',
    len: 1326,
    sha: '9a1255f1e81e0a9e4e289ab15380707dd6bcc1d410ffd16f44adddb99b16f8c6', // UNCHANGED content; LF units
  },
  {
    name: 'ptyEnv block',
    start: 'const fencedRole = !opts.videoScout && opts.role && FENCED_ROLES.has(opts.role);',
    end: 'let p;',
    len: 229,
    sha: '18cf42b434ee922ee61194d9316150c0b766591e063d0b0545f6aebc8d85cb54',
  },
  {
    name: 'pty-start handler',
    start: "ipcMain.handle('pty-start', (_e, opts) => {",
    end: "ipcMain.on('pty-write'",
    // RE-PINNED when Experiment A was retired and production pane status landed. The handler now
    // enrolls the pane through the production controller instead of the prototype's envForPane().
    //
    // RE-PINNED AGAIN (seventh time) for the PANE-STATUS PRODUCTION CORRECTION. Exactly one thing
    // changed inside this region: `p.onExit` now calls `paneStatus.notePaneExit(id)`, so a pane whose
    // PROCESS ended publishes `exited` and has its token revoked immediately, instead of displaying a
    // stale `working` for up to 120 seconds behind a still-valid token. Work Order 1 § F.7 specified
    // that and the previous build dropped it silently. The accompanying comment records why the
    // video-scout run-ID mapping is deliberately NOT touched on the same path.
    //
    // Previous pins, retained so the earlier reviewed bases stay reproducible:
    //   len 13287 / sha 3ad6db301a3fa0e101195f439012ee42ca25ba6b31040b10d0196d23b7141bb3  (CRLF units)
    //   len 13864 / sha 1b6929a2e691c2e418ab529a80411e26f58a1d32a6f08b2ceb1b085e3db96274  (LF units)
    len: 13484,
    sha: 'ab6f6cd37752029c52d4a89fb99331a319f8b032a011b297d78d22beeafea161',
  },
];

for (const r of REGIONS) {
  const seg = slice(r.start, r.end);
  if (seg === null) { assert(false, `region present: ${r.name}`); continue; }
  assert(seg.length === r.len, `${r.name}: byte length unchanged (${seg.length} === ${r.len})`);
  assert(sha(seg) === r.sha, `${r.name}: sha256 byte-for-byte unchanged from reviewed base`);
}

// CONTENT assertions that survive any future re-pin. The pure builder is exercised here rather than
// matching comments that merely mention the intended behavior.
{
  const ordinary = buildPtyEnv({ baseEnv: {}, fencedRole: false, videoScout: false, paneStatusEnv: {} });
  assert(ordinary.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB === '1',
    'the production builder sets CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1 on every PTY');
  const video = buildPtyEnv({
    baseEnv: { GEMINI_API_KEY: 'ambient' }, fencedRole: false, videoScout: true,
    geminiKey: 'explicit', paneStatusEnv: {},
  });
  assert(video.GEMINI_API_KEY === 'explicit',
    'the production builder gives Video Scout the explicit main-issued key, not ambient residue');
  const fenced = buildPtyEnv({
    baseEnv: { GEMINI_API_KEY: 'ambient' }, fencedRole: true, videoScout: false, paneStatusEnv: {},
  });
  assert(!Object.prototype.hasOwnProperty.call(fenced, 'GEMINI_API_KEY'),
    'the production builder gives a fenced non-Video-Scout pane no Gemini key');
}
assert(src.indexOf('const ptyEnv = buildPtyEnv({') !== -1,
  'main.js obtains the real ptyEnv from the production builder');
// The pane-status addition must remain a no-op-by-default spread, not an unconditional injection.
// Production form: the controller ENROLLS the pane and returns { ok, env }; a refusal yields {} and the
// pane launches with no status environment at all. Previous prototype form, retained for provenance:
//   const paneStatusEnv = paneStatus.envForPane(opts);
assert(src.indexOf('const paneStatusEnrollment = paneStatus.enrollPane(id);') !== -1,
  'the pane is enrolled through the production controller');
assert(src.indexOf('const paneStatusEnv = paneStatusEnrollment.ok ? paneStatusEnrollment.env : {};') !== -1,
  'and a refused enrolment contributes an EMPTY env rather than blocking the spawn');
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
// Production form: the version is DISCOVERED by an injected resolver that runs the application's own
// command-resolution path, and the gate is exact-match and fail-closed. Never a hard-coded version.
// Previous prototype form, retained for provenance:  paneStatus.setObservedVersion(
assert(/resolveVersion:\s*\(\)\s*=>/.test(src),
  'main.js injects a version RESOLVER into the pane-status controller');
// CORRECTED (advisory review, finding 3). The previous assertion here pinned
// `AGENT_CMD.claude, ['--version']` — an execFile from Electron main — and called that "the SAME
// executable a pane launches". It was not: main resolves against main's PATH, while the pane resolves
// inside a PowerShell that loads the user's profile. The assertion was therefore pinning the defect in
// place and would have blocked the fix. It is replaced by a STRICTLY STRONGER one: the resolver must
// go through the pane-equivalent PowerShell path, and the direct-exec form must be gone.
assert(/createClaudeVersionResolver\(\{/.test(src),
  'and it discovers the version through the pane-equivalent PowerShell resolver');
assert(/commandName:\s*AGENT_CMD\.claude/.test(src),
  'resolving the same bare command name a pane launches, never a hard-coded path');
assert(src.indexOf("AGENT_CMD.claude, ['--version']") === -1,
  'NEGATIVE CONTROL: main.js no longer execs the bare command directly from the Electron process');
assert(!/supportedVersions\s*:\s*\[/.test(src),
  'main.js does not hard-code a supported-version list — that lives in pane-status-version.js');
assert(!/createPaneStatusPrototype\(\{[\s\S]{0,400}?observedVersion/.test(src),
  'and never hard-codes observedVersion at construction');

// TURN ADMISSION BUDGET content assertions — the reason THIS re-pin happened, pinned as behaviour so
// the next re-pin cannot quietly drop them along with the hash. A hash says something moved; these say
// whether the cost control is still wired.
assert(src.indexOf('baseEnv: process.env,') !== -1,
  'main.js passes process.env only as builder input, never as a spread at the sink');
{
  const envBlock = src.slice(src.indexOf('const fencedRole = !opts.videoScout'),
    src.indexOf('let p;', src.indexOf('const fencedRole = !opts.videoScout')));
  assert(!/\.\.\.process\.env\b/.test(envBlock),
    'the main.js ptyEnv block never spreads raw process.env');
  assert(envBlock.indexOf('baseEnv: process.env,') > envBlock.indexOf('const ptyEnv = buildPtyEnv({'),
    'process.env is passed inside the bounded buildPtyEnv call');
}
assert(/prepareAdmissionPaneLaunch\(\{/.test(src),
  'pty-start delegates pre-spawn eligible-pane claiming to the protective launch policy');
assert(/admissionBudget\.notePaneExit\(id\)/.test(src),
  'a pane exit voids the remaining allowance rather than leaving it claimable');
assert(!/admissionBudget\.(setAllowance|reset|refund|grant|certify)\b/.test(src),
  'main.js never calls a mutation that could restore or extend an allowance (none exists)');

process.stdout.write(`\nlauncher-fence-invariant: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
