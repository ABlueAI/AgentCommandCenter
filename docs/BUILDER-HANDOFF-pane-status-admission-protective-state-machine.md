# Builder Handoff — Pane-status admission protective state machine

Date: 2026-08-17
Branch: `codex/pane-status-admission-protective-state-machine`
Forked from failed-review handoff tip: `57dfee58475765c21d9e10f0107fe2fd66d4647f`
Pre-merge `main`: `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f`
Reviewed corrective content tip: `346d771c095fe2283fe505f70f5a9eb5324ffe3a`
Merge commit: pending; nothing merged or pushed

The handoff-only branch tip is the commit containing this document and must be read from the branch
ref. A commit cannot truthfully contain its own SHA. The tail must touch only this file.

## Intended invariant

> When admission configuration is absent, Blue Helm behaves normally. Once admission is explicitly
> requested, main enters protective mode. The first eligible Claude pane is designated before spawn
> and remains protected for its lifetime. No launch-time prompt, generic PTY input, or other
> turn-initiating input may reach that pane except through a successfully persisted admission.
> Configuration, initialization, claim, integrity, CAS, persistence, or renderer failure may only
> tighten or preserve that protection—never convert the pane into an ordinary pane.

This is the controlling invariant for the corrective content tip.

## Procurement and threat decision

Tracked procurement record: `docs/OSS-PROCUREMENT-pane-status.md`.

Canonical verdict, verbatim:

> BUILD FRESH — Pane status: build Blue Helm’s production pane-status subsystem as an advisory-only,
> human-facing indicator using official provider lifecycle interfaces and the reviewed Experiment A
> architecture. Provider events are unauthenticated hints and must never authorize or automatically
> trigger merge, push, approval, pane closure, process control, restart, credential access, or another
> consequential action. Begin with Claude Code only; fail closed to unknown for unverified versions;
> require explicit reversible hook setup and removal; keep logs metadata-only; preserve the
> Experiment A provenance limitation as an accepted residual.

Blue threat-boundary decision, verbatim:

> I ACCEPT THE ADMISSION LEDGER AS AN ACCIDENTAL-SPEND CONTROL, NOT A SECURITY BOUNDARY AGAINST A MALICIOUS OR COMPROMISED SAME-USER PANE. CORRECT THE FALSE PROVIDER-INACCESSIBILITY CLAIMS, REMOVE THE UNREACHABLE ROLLBACK GUARD, AND RETURN FOR FULL REVIEW.

The correction preserves that boundary. Environment stripping prevents inheritance only. It does
not hide `userData`, prevent filesystem access, or stop a same-user process from reading, replacing,
deleting, replaying, or recomputing the unkeyed ledger. The checksum and CAS coordinate ordinary
Blue Helm processes and detect accidental corruption; they are not authentication, rollback
prevention, hostile-tamper resistance, or same-user isolation.

## Failed-review findings resolved

### 1. Fatal ledger health can no longer reopen generic input

- Pane designation is process-local and separate from ledger health: `unbound → pending → bound → exited`.
- A configured pin is protected before initialization. An unpinned pane becomes `pending` immediately
  before its durable claim is attempted.
- Claim persistence/CAS failure restores the durable-record shape but deliberately retains the
  process-local pending designation.
- Integrity mismatch, unreadable storage, version/plan/count failure, conflict, or later fatal reload
  continues to refuse direct input for the protected live pane.
- Only confirmed process exit, explicit kill, or failed spawn releases the designation, because no
  PTY remains that could receive input.
- The reviewer's live reproduction is pinned in tests: a bound pane's reload becomes
  `integrity-mismatch`; controlled submission writes zero bytes; generic input remains blocked; and
  the rejected ledger is not saved, repaired, deleted, or overwritten.

### 2. Invalid configuration can no longer collapse into ordinary mode

- Admission parsing now distinguishes `absent`, `valid`, and `invalid`.
- Complete absence preserves ordinary Blue Helm behavior.
- Presence of any admission key is an explicit request. Partial, malformed, disabled-shaped, or
  out-of-range input is `invalid`, with allowance zero.
- An invalid request visibly refuses eligible Claude-pane startup before spawn. It cannot fall
  through to an ordinary unmetered Claude pane.
- Ineligible shell, Codex, Gemini, and Video Scout panes remain outside this Claude-only run.

### 3. The protected pane is selected before process creation

- Main-owned launch policy identifies the first eligible Claude pane and performs the durable claim
  before `pty.spawn`.
- Only bare Claude and valid Claude role launches are eligible. Starting an ineligible pane first
  cannot steal or consume the run.
- A nonempty `initialPrompt` on the intended controlled pane is visibly refused before spawn, so it
  cannot spend a turn outside the controlled-prompt path.
- A second eligible Claude pane after the target is already bound is explicitly non-target and
  ordinary; it cannot move or consume the first pane's run.
- If spawn fails after a durable claim, main closes the run and voids the remainder rather than
  transferring the claim.

### 4. Every supported PTY input path shares one final capability boundary

- `app/admission-pty-boundary.js` owns the sole production `pty.write(bytes)` primitive.
- Generic renderer input and durably admitted input enter through different closures.
- The admitted closure carries a module-private `Symbol`; no renderer field, boolean, or IPC payload
  can forge it.
- `main.js` contains no direct PTY write primitive. Its generic `pty-write` handler always passes
  through the boundary, and the budget's writer receives only the admitted closure.
- Renderer direct-input, clipboard paste, speech-to-text delivery, launch-time prompt handling, and
  the controlled-prompt UI are covered by source/integration tripwires.

### 5. Threat language is corrected at the original surfaces

- `admission-budget-config.js`, `admission-budget-store.js`, `admission-budget.js`, `main.js`, tests,
  and Master Status describe environment stripping as prevention of inheritance only.
- A complete first-party production JavaScript scan rejects equivalent provider-inaccessibility
  overclaims while allowing explicitly labelled historical/removal commentary.
- The dead rollback guarantee remains removed; no replacement cross-restart prevention guarantee was
  invented.

## Files changed in the corrective content commit

- `BLUE-HELM-MASTER-STATUS.md`
- `app/admission-budget-config.js`
- `app/admission-budget-config.test.js`
- `app/admission-budget-store.js`
- `app/admission-budget.js`
- `app/admission-budget.test.js`
- `app/admission-pane-launch.js` (new)
- `app/admission-protective-state.test.js` (new)
- `app/admission-pty-boundary.js` (new)
- `app/admission-pty-boundary.test.js` (new)
- `app/admission-ui-integration.test.js`
- `app/launcher-fence-invariant.test.js`
- `app/main.js`
- `app/package.json`

No dependency or lockfile changed.

## Test gates

Focused final results:

| Suite | Result |
| --- | ---: |
| `admission-budget-config.test.js` | 83 passed, 0 failed |
| `admission-pty-boundary.test.js` | 23 passed, 0 failed |
| `admission-protective-state.test.js` | 53 passed, 0 failed |
| `admission-budget.test.js` | 243 passed, 0 failed |
| `admission-budget-store.test.js` | 81 passed, 0 failed |
| `admission-ipc.test.js` | 135 passed, 0 failed |
| `admission-ui-integration.test.js` | 167 passed, 0 failed |
| `renderer/admission-view.test.js` | 134 passed, 0 failed |
| `launcher-fence-invariant.test.js` | 21 passed, 0 failed |
| `single-instance.test.js` | 14 passed, 0 failed |
| `quick-links-integration.test.js` | 43 passed, 0 failed |

Focused subtotal: **997 passed, 0 failed**.

Complete application gate: **66 unique reachable suites, 4,826 assertions passed, 0 failed**.
The runner emitted 64 `passed, failed` summaries plus two supported assertion-only summaries
(`audio-module-health.test.js`, 9; `tts-audio-contract.test.js`, 9). Counting both formats reconciles
to 66 suites and 4,826 assertions; no suite disappeared.

Native Pester: **955 passed, 0 failed, 0 skipped**.

`git diff --cached --check`: exit 0 before the content commit and again with the handoff-only tail
staged.

Fenced-role CRLF-reading anchor: **1,354 bytes**, SHA-256
`ae9dce92cbdd76da7d96ff5b9c5c070e3a96f4ca1f4c1c06b77eb13ccba62060`.

`ptyEnv` anchor: **271 bytes**, SHA-256
`2a399a9890fbeccd05141779f69958878f42232a8a42e2f9e0aaf992408657f8`.

The intentionally changed complete `pty-start` region is re-pinned at **13,458 bytes**, SHA-256
`653b0c3363577ae6754f5eeb260036115d9c0c330b6c2731b3896ebf0f684c82`.

## Pinned review artifacts

Controlling cumulative artifact:

- Path: `.agent-review-admission-protective-state-machine-cumulative.diff`
- Range: `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f...346d771c095fe2283fe505f70f5a9eb5324ffe3a`
- Size: **434,336 bytes**
- SHA-256: `0f94f4f2aaabfab46e07a6389b7c81152a0c285824ced398f83a546f81f94716`
- Shortstat: **29 files changed, 7,191 insertions, 12 deletions**

Supplementary focused artifact:

- Path: `.agent-review-admission-protective-state-machine-focused.diff`
- Range: `57dfee58475765c21d9e10f0107fe2fd66d4647f...346d771c095fe2283fe505f70f5a9eb5324ffe3a`
- Size: **87,350 bytes**
- SHA-256: `54f1ce4a6eeaa160b37d16bc5acd05a6e1b8a09d9b6b5ca754e1b61e9f1e4b78`
- Shortstat: **14 files changed, 821 insertions, 117 deletions**

Each was independently regenerated with `git diff --output` to a separate temporary file. Both
reproductions were byte-identical to their pinned artifact; only the two temporary reproductions were
removed. Earlier pinned artifacts were not overwritten.

## Manual verification and review boundary

- Traced launch construction, pre-spawn designation, spawn failure, PTY exit/kill, generic input,
  controlled submission, and renderer IPC paths.
- Confirmed `main.js` has zero direct PTY write primitives and the boundary module has exactly one.
- Confirmed launch-time prompt content does not reach logs, refusals, ledger/checksum evidence, IPC
  responses, persisted DOM state, or errors.
- Confirmed Quick Links handlers/preload and Dockview test reachability remain in the complete gate.
- Confirmed the dependency junction used only to reach the repository's existing installed test
  dependencies was removed afterward; its target was preserved.
- No Claude/provider session, pane-status hook, paid prompt, app server, remote TUI, merge, or push was
  launched or performed. Electron activity was limited to the repository's inert local test harnesses.

## Known limitations and accepted residuals

- This is an accidental-spend boundary across supported Blue Helm input paths, not malicious
  same-user isolation. A same-user process can rewrite/recompute/replay/delete the ledger.
- Deleting the ledger permits a fresh run; replaying an older valid ledger is not detected.
- A process crash can leave the fixed `wx` lock file behind. That fails closed until a human diagnoses
  and removes the stale lock; automatic stale-lock recovery would weaken the refusal posture.
- Writer failure after durable admission remains consumed and is not refunded because partial delivery
  cannot be ruled out.
- Only the first designated eligible Claude pane is controlled by this run. Later non-target panes are
  ordinary by explicit scope; they cannot acquire or move the existing run.
- The provenance residual and ledger residual in Master Status retain their automatic void condition:
  if pane status or admission ever becomes consequential or automated, the accepted advisory-only
  boundary is void and requires a new threat decision.

## Recommended independent Full-class review focus

1. Reproduce the cumulative artifact identity and review the complete range, not only the focused fix.
2. Execute every state in `admission-protective-state.test.js`, especially fatal reload after bind,
   claim-CAS failure, invalid configuration, ineligible-before-Claude, initial prompt, and failed spawn.
3. Trace all turn-initiating inputs to the single capability boundary and prove no renderer/main bypass.
4. Re-run the complete app gate and count both supported summary formats to reconcile 66/4,826/0.
5. Re-run native Pester and `git diff --check`.
6. Re-scan first-party production code for provider-inaccessibility, rollback-prevention, authentication,
   or hostile-tamper overclaims.
7. Verify branch ancestry and that the handoff tail is exactly one commit touching only this document.

Reviewer verdict: pending fresh independent Full-class review. This handoff is not merge authorization.
