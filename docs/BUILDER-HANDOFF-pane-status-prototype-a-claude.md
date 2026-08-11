# Builder Handoff — Pane-Status Experiment A (Claude Code hook reporter)

Branch: `feature/pane-status-prototype-a-claude`
Worktree: `.worktrees/pane-status-prototype-a-claude`
Fork-point SHA: `3ff96bdea3e68a83cd5774c9b94b68d9cb292add`
Pre-merge main SHA: `3ff96bdea3e68a83cd5774c9b94b68d9cb292add`
Revision 1 reviewed tip: `bf66fb3b9fad080d1ff92ed0815034e525a75740` — **`VERDICT: FAIL`**
Revision 2 reviewed tip: see § 12
Branch tip: see § 12
Merge commit SHA: Pending until merge

**Status: REVISION 2 — CORRECTIVE. All ten review findings addressed. Structural gates green.
The one remaining authorized model turn was deliberately NOT consumed; a human verification step is
in § 11. AWAITING A FRESH INDEPENDENT FULL-CLASS REVIEW. NOT MERGED, NOT PUSHED.**

## 0. Procurement authority

Tracked record: **`docs/OSS-PROCUREMENT-pane-status.md`**. Blue's verdict, verbatim:

> BLUE SUBSYSTEM VERDICT: PROTOTYPE

This branch is **Experiment A only**: one provider (Claude Code), one pane, one temporary hook
reporter, one bounded display. Still unauthorized and untouched here: production specification or
implementation, permanent hook installation, multiple providers, multiple status-enabled panes,
**Experiment B**, any app-server listener / `codex --remote` / observer client, merge, and push.

The OSS research was not reopened, the § 10 recommendation was not changed, and the procurement
record's reviewed historical analysis was **not rewritten**.

Full evidence: **`docs/PROTOTYPE-EVIDENCE-pane-status-claude-hook.md`** (revision 2).

---

## 1. REVIEW HISTORY — revision 1, `VERDICT: FAIL`

An independent Full-class review of `bf66fb3b` returned:

> **VERDICT: FAIL**

**1 Critical · 3 High · 4 Medium · 3 Low.** Recorded in full below, **not downgraded and not
reinterpreted**. The disposition column records what revision 2 did.

### Blocking

| # | Sev | Finding | Disposition in revision 2 |
| --- | --- | --- | --- |
| 1 | **Critical** | **The application could never display any state but `unknown`.** `app/main.js` constructed the prototype with no `observedVersion`; the store recorded `null`; `resolveDisplayState` checks `versionSupported === false` **first**, before `lastEvent`, so every view returned `unknown/version-mismatch`. The live object exposed no `setObservedVersion`, so no call site could fix it. The working demonstration existed only in `live-probe.js`, which supplied the answer itself. | **FIXED.** New `pane-status-version.js`; `main.js` discovers and feeds the version; `setObservedVersion` exposed and refreshes the enrolled pane. `pane-status-integration.test.js` drives a real event to `working` through main.js's own call shape. |
| 2 | **High** | **The pinned version was a different installation from the one Blue Helm launches.** `AGENT_CMD.claude` is bare `claude` via PowerShell → `C:\Users\levij\.local\bin\claude.exe` (**2.1.220**). The probe hard-coded `%APPDATA%\npm\claude.cmd` (**2.1.196**). So the pin didn't match the launched binary, **and the entire live run — including the decisive scrub finding — was collected against a build Blue Helm does not run.** | **FIXED + SCOPED.** Discovery now resolves through PowerShell with the PTY's environment and versions **that resolved path**. `2.1.220` was **not** added to the supported list (§ 4). Evidence § 2 scopes every runtime observation to npm 2.1.196. |
| 3 | **High** | **The token authenticates the pane environment, not the reporter.** Pipe name and token live in the PTY env; every descendant inherits them — proven by the experiment's own § 5 finding that hook children inherit *despite* the scrub. Any Bash tool call, MCP server, or other hook can forge an allowlisted event. Contradicts the handoff's "not terminal output (threat 1)" framing. | **RECORDED AS A NEGATIVE RESULT**, not patched. Evidence § 5.1. Claims corrected; "validates the mechanism convincingly" **withdrawn**. **No new authentication scheme was invented.** |
| 4 | **High** | **A fresh-process second `install` could destroy the genuine settings backup.** It captured the already-patched file as "the original", copied it over the real backup (integrity check passed, both sides patched), appended hooks twice, and a later `restore` "proved" restoration to the patched file and deleted the recovery copy. Revision 1's fixture reused the same in-memory guard, so it could not catch this. | **FIXED.** `install()` refuses — before any write — on an existing recovery copy or an existing `MARKER`; the runner refuses on an existing sidecar. Six-step fresh-process fixture in `pane-status-boundary.test.js` + `pane-status-runner.test.js`. |

### Non-blocking

| # | Sev | Finding | Disposition in revision 2 |
| --- | --- | --- | --- |
| 5 | **Medium** | **A required Experiment A element was never performed and not listed as unknown**: § 11.1 requires "verify behaviour when the provider is upgraded". | **RECORDED AS UNVERIFIED.** Evidence § 11 item 10. Exact-version mismatch is proven structurally (including for 2.1.220); real upgrade behaviour is explicitly untested, and no turn was spent simulating it. |
| 6 | **Medium** | **Gate-off was inert, not absent**: `cc.onPaneStatusPrototype`, the renderer subscription, and both `window.*` globals existed unconditionally. | **FIXED BY SHAPE.** Gate token forwarded via `additionalArguments`; `window.ccPaneStatus` is **undefined** when off; badge global gated; both shapes tested. Evidence § 9.1. |
| 7 | **Medium** | **`window.ccPaneStatusReattach` was never called by any application code**, while evidence § 7 marked live re-attachment PROVEN. | **REMOVED.** Narrowest correction taken: the unreachable global is gone and evidence § 7 now claims only self-healing on the next update. |
| 8 | **Medium** | **PTY spawn failure stranded the single slot.** `envForPane` enrolled before the spawn; the failure path never released. Dockview happened to recover via the renderer; **classic layout did not**. | **FIXED IN MAIN.** `paneStatus.releasePane(id)` in the spawn catch, where enrolment was taken. Covered by test and pinned as a content assertion in the tripwire. |
| 9 | **Low** | **The suite structurally could not catch finding 1** — every construction site supplied `observedVersion` by hand. | **FIXED.** `pane-status-integration.test.js` builds the subsystem with main.js's exact dependency set and asserts main.js's source wiring. |
| 10 | **Low** | **`run-experiment-a.js listen` printed the bearer token to stdout** — a structural token-to-scrollback path, never invoked live. | **REMOVED.** No command prints it; `listen` passes it to a child's environment. Every command mode is executed and scanned in `pane-status-runner.test.js`. |
| 11 | **Low** | **Kill-criterion 2 was answered structurally** without cross-referencing the unperformed live drag. | **CORRECTED.** Evidence § 10 now labels every criterion RUNTIME / STRUCTURAL / NOT PERFORMED and states plainly that criterion 2 is **not satisfied**. |

> Reviewer's numbering ran 1–11 across the two tables (1 Critical, 3 High, 4 Medium, 3 Low).

---

## 2. What revision 2 changed

| Path | Change |
| --- | --- |
| `app/prototype-pane-status/pane-status-version.js` | **Added** — resolves the provider through PowerShell exactly as the pane does; versions that resolved path; fails closed |
| `app/prototype-pane-status/pane-status-version.test.js` | **Added** — 68 assertions |
| `app/prototype-pane-status/pane-status-integration.test.js` | **Added** — 74 assertions; main.js's call shape, both gate shapes, spawn-failure release |
| `app/prototype-pane-status/pane-status-runner.test.js` | **Added** — 72 assertions; executes every runner mode, scans for token leakage |
| `app/prototype-pane-status/pane-status-prototype.js` | `setObservedVersion`/`observedVersion` exposed; `RENDERER_ARG` added; inert object extended |
| `app/prototype-pane-status/pane-status-settings.js` | Install refuses on an existing recovery copy or an existing marker |
| `app/prototype-pane-status/run-experiment-a.js` | Sidecar refusal; **no token printing**; child-env launcher; test-only path overrides |
| `app/prototype-pane-status/pane-status-boundary.test.js` | +22 — the six-step interrupted-install fixture |
| `app/main.js` | Version discovery + propagation; gate token forwarded; **release on spawn failure** |
| `app/preload.js` | Pane-status bridge moved out of `cc` and behind the forwarded gate token |
| `app/renderer/app.js` | Subscribes through the gated bridge; unreachable reattach global removed |
| `app/renderer/pane-status-badge.js` | Global published only behind the bridge |
| `app/renderer/pane-status-badge.test.js` | +3 — gate-off/gate-on global behaviour |
| `app/launcher-fence-invariant.test.js` | **Re-pinned again, see § 3** |
| `app/dockview-default-path.test.js` | **Re-pinned, see § 3** |
| `app/package.json` | Three suites added to the gate chain |
| `docs/PROTOTYPE-EVIDENCE-pane-status-claude-hook.md` | Corrected throughout |

No dependency, lockfile, GitHub configuration, `AGENTS.md`, or PowerShell file changed. **The
procurement record was not touched.**

---

## 3. Tripwires re-pinned again — read this first

**`launcher-fence-invariant.test.js`.** Exactly one region moved in revision 2.

| Region | Rev 1 | Rev 2 | Why |
| --- | --- | --- | --- |
| fenced-role cwd gate | 1354 B / `ae9dce92…` | **unchanged** | Never touched in either revision |
| ptyEnv block | 236 B / `cd100743…` | **unchanged** | Revision 2 did not alter the PTY environment |
| pty-start handler | 8714 → 9289 B | **9913 B / `67cb161c…`** | The `pty.spawn` **failure path** now releases the prototype enrolment (finding 8) |

All prior hashes are retained in-file. New content assertions pin the *behaviour* so a future re-pin
cannot drop it: the spawn-failure release is asserted inside the catch block, `setObservedVersion` must
be called, and `createPaneStatusPrototype` must not hard-code `observedVersion`.

**`dockview-default-path.test.js`.** `additionalArguments` was a single ternary and is now a spread
list, because the prototype forwards its own gate token the same way. The old pin is retained in a
comment. The replacement is **stronger than a shape match**: it asserts that *every* entry is
conditional, so "the production path forwards an empty list" survives future additions rather than
having to be re-argued. Script-tag count is unchanged at 22.

---

## 4. The decision not to add `2.1.220`

Blue Helm resolves `C:\Users\levij\.local\bin\claude.exe`, version **2.1.220**. The work order permits
adding it to `SUPPORTED_CLAUDE_VERSIONS` **only if** the remaining live run exercises that exact binary
and confirms the required hook behaviour. That run did not happen (§ 11), so **`2.1.220` was not
added** and the list remains `['2.1.196']`.

**Consequence, stated plainly: on Blue's machine today the badge will read `unknown
(version-mismatch)`, and main surfaces a visible `main-error` explaining why.** That is the designed
fail-closed behaviour for an unexercised provider build. It is not a claim that the feature works, and
it is not a defect — it is the honest state until someone exercises 2.1.220.

---

## 5. Security-sensitive surfaces (corrected)

**Transport.** A main-owned Windows named pipe. Not terminal output, not TCP, not loopback. Unique
name per app run. Bounds: 512 B/message, 4 KiB/connection, 4 messages/connection, 8 concurrent
connections, 5 s idle timeout.

**Token — corrected claim.** 32 CSPRNG bytes as hex, minted in main, held only in main's memory,
delivered only into the single enrolled pane's process environment. Never in argv, a log line, a file,
the renderer, Claude's settings, a persistent user variable, **or any console**. No `setx`. Compared
with `crypto.timingSafeEqual`.

**It authenticates possession of the pane environment, NOT reporter identity.** Every descendant of the
pane's PTY inherits the pipe name and token, so a model-invoked shell command, an MCP server, or
another hook can forge an allowlisted event. The named pipe removes **accidental** forgery via visible
terminal output; it does **not** prevent **deliberate** forgery from inside the pane. Recorded as an
**unresolved production blocker** and a **negative security result** — see evidence § 5.1.

**Credential scrub.** `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` unchanged and unweakened. The fenced-role
cwd gate is byte-for-byte identical to the reviewed base across both revisions.

**Renderer boundary.** One receive-only channel, and it exists **only when the gate is on**. No
`invoke()` counterpart. The view object has exactly four fields and no room for a token.

**Claude configuration.** The application still has **no** authority to edit it: `main.js` imports
neither the settings guard nor the runner, and tests assert both.

---

## 6. Gates — recounted per suite, not copied

| Gate | Result |
| --- | --- |
| App gate (`npm test`) | **exit 0 — 52 chain entries, 3,636 assertions passed, 0 failed** |
| Pester (`scripts\run-pester.ps1`) | **955 passed / 0 failed / 0 skipped** (35 suites, 107.9 s) |
| `git diff --check` | clean |

**Assertion reconciliation from revision 1's 3,390:**

| Source | Δ |
| --- | --- |
| `pane-status-version` (new) | +68 |
| `pane-status-integration` (new) | +74 |
| `pane-status-runner` (new) | +72 |
| `pane-status-boundary` 135 → 157 | +22 |
| `dockview-default-path` 373 → 377 | +4 |
| `launcher-fence-invariant` 12 → 15 | +3 |
| `pane-status-badge` 42 → 45 | +3 |
| **Total** | **3,390 + 246 = 3,636** ✓ |

Chain entries 49 → 52. Pester is unchanged at 955 because no PowerShell file changed.

---

## 7. Focused suites run

Main-process integration and version propagation (`pane-status-integration`); command
resolution/version binding (`pane-status-version`); protocol/store/server and settings
(`pane-status-boundary`); reporter privacy (`pane-status-reporter`); settings installation,
interruption, refusal and restoration (`pane-status-boundary` + `pane-status-runner`); gate-on/gate-off
application shape (`pane-status-integration`); spawn-failure release (`pane-status-integration` +
`launcher-fence-invariant`); renderer badge lifecycle and Dockview identity (`pane-status-badge`);
token absence across every output surface (`pane-status-runner`).

---

## 8. Recommended review focus

1. **Finding 3's disposition.** Is recording provenance as a negative result the right call, or does
   Blue want a separately specified trust boundary before anything else proceeds?
2. **The § 4 decision.** Leaving 2.1.220 unsupported means the badge shows `unknown` on Blue's own
   machine. Correct, or should the remaining turn be spent to change that?
3. **The two re-pins in § 3**, and whether the new content assertions are strong enough.
4. **`pane-status-version.js`** — is resolving through PowerShell *with the profile loaded* the right
   fidelity/complexity trade, and is fail-closed genuinely fail-closed?
5. **The settings refusals** — is refuse-and-tell-the-operator right, or should `install` offer an
   automatic recovery path?
6. **Evidence § 10** — are the RUNTIME / STRUCTURAL / NOT PERFORMED labels honest?

---

## 9. Known limitations

* `Notification` and `StopFailure` unverified live; the live Dockview drag not performed.
* **Nothing has been observed in the real Electron application.** The fix is proven by test through
  main.js's own call shape; no Electron instance has rendered a badge.
* **Every runtime observation is scoped to npm Claude Code 2.1.196**, which is not the executable Blue
  Helm launches.
* **Provider-upgrade behaviour is unverified** (a required Experiment A element).
* n = 4 latency samples, one session, idle machine.
* `STALE_MS = 120000` is an unvalidated experiment value, marked `(?)`.
* With `-NoExit` the PTY outlives the Claude process, so a pane can survive `SessionEnd`.
* Reporter provenance is unresolved (§ 5).

---

## 10. Runtime experiment status

**No model turn was consumed in revision 2.** Two of three authorized turns were spent in revision 1;
**one remains**, held for § 11.

Blue's Claude settings were **not touched** in revision 2. Verified read-only: `~/.claude/settings.json`
is 382 B / `a67c2e66…` with the five original top-level keys, **no `hooks` key**, no prototype marker;
`%TEMP%\blue-helm-pane-status-experiment` does not exist. Per the work order, the current file is
treated as **user-owned state** and no attempt was made to restore it to the historical 381-byte hash.

---

## 11. HUMAN VERIFICATION STEP — for Blue, requiring the one remaining turn

The final run needs a Dockview drag, and there is no GUI automation hook for one. Reporting it without
Blue's own observation would repeat the error this review just failed the branch for. So it is handed
over rather than guessed.

**Decide first (§ 4):** the badge will read `unknown (version-mismatch)` until `2.1.220` is exercised.
Either accept that and verify only the plumbing, or authorize adding `2.1.220` to
`SUPPORTED_CLAUDE_VERSIONS` **as part of** this run so a real state can appear.

**Before the run:** confirm `%TEMP%\blue-helm-pane-status-experiment` does not exist; confirm
`~/.claude/settings.json` contains no `blue-helm-pane-status-prototype` marker; record its byte size
and SHA-256 as the run's baseline; confirm no `*blue-helm-pane-status*` named pipe exists; run
`node app/prototype-pane-status/run-experiment-a.js identity` (read-only) and
`Get-Command claude` to confirm the executable — **without launching a model**.

**The run:** `node app/prototype-pane-status/run-experiment-a.js install` (it will refuse if anything
is left over — that is the fix from finding 4); set `BLUE_HELM_PANE_STATUS_PROTOTYPE=1`; start the app;
open **one** Claude pane; send one content-free prompt (`Reply with exactly the word: ok`) requesting
no permissions, secrets, files, tools, or repository content; **observe the badge**; then **drag the
pane to another Dockview group and observe whether the badge state survives** — that is the
observation only Blue can make, and it is kill-criterion 2.

**After the run:** exit Claude cleanly; stop Electron;
`node app/prototype-pane-status/run-experiment-a.js restore`; confirm byte-identical restoration
against **the new baseline**; confirm `hooks` and the marker are absent; confirm no pipe, stray
process, recovery file, or temp directory remains.

**Do not consume a fourth turn.** If this cannot be completed in one, stop and request authorization.

---

## 12. Commits and review artifacts

| Field | Value |
| --- | --- |
| Revision 1 reviewed tip | `bf66fb3b9fad080d1ff92ed0815034e525a75740` — `VERDICT: FAIL` |
| Handoff-only tail (rev 1) | `f8cb64a391a969e51ecc379094ca02cc76c9ae81` |
| **Revision 2 reviewed tip** | `c8d9fdaa3ecd8b792850ad525b9b768bdd14bcb5` |
| Branch tip | the handoff-only tail commit below |
| Focused correction range | `f8cb64a391a969e51ecc379094ca02cc76c9ae81...c8d9fdaa3ecd8b792850ad525b9b768bdd14bcb5` |
| Cumulative prototype range | `3ff96bdea3e68a83cd5774c9b94b68d9cb292add...c8d9fdaa3ecd8b792850ad525b9b768bdd14bcb5` |

The corrective content commit's parent is `f8cb64a391a969e51ecc379094ca02cc76c9ae81`, as required.

| Artifact | Range | Shortstat | Size | SHA-256 |
| --- | --- | --- | --- | --- |
| `.agent-review-pane-status-prototype-a-claude-rev2-focused.diff` | `f8cb64a3...c8d9fdaa` | **18 files, 1,923 insertions, 251 deletions** | **165,445 bytes** | `b8b5f644d1fc53f84beb6c7762c7968dbd7328de1374a0a6c622cee9242a64f7` |
| `.agent-review-pane-status-prototype-a-claude-rev2-cumulative.diff` | `3ff96bde...c8d9fdaa` | **26 files, 4,808 insertions, 10 deletions** | **280,014 bytes** | `3b3cb40fc1d5590479f7009af66f76934c48044f283e598d5b2566fc3e1683f3` |

The revision-1 artifact is unchanged and still verifies at its recorded identity:
`.agent-review-pane-status-prototype-a-claude.diff`, `3ff96bde...bf66fb3b`, 174,128 bytes,
`eaad43a22aeacfc7de79f234e3805e7aaf56dd75e2de11854e42d5936aa42f89`.

**On the 251 deletions in the focused range** — worth checking directly, since revision 1 had only 7.
They are: the two re-pinned tripwire assertions and the lines they replaced (§ 3); the preload's
`onPaneStatusPrototype` member, moved out of the always-exposed `cc` object and behind the gate; the
renderer's unconditional badge construction and the unreachable reattach global (finding 7); the
`listen` token-printing block (finding 10); and the replaced sections of the two documents. **No
existing application behaviour was removed** — the deletions are relocations, corrections, and the
removal of the two surfaces the review required to be absent.

Both created with `git diff --output` (never PowerShell redirection), gitignored via `.gitignore:33`,
regenerated from their stated ranges and proven **byte-identical**. **The original revision-1 artifact
`.agent-review-pane-status-prototype-a-claude.diff` was neither altered nor regenerated.**
`git diff --check` is clean on both ranges.

---

## 13. Reviewer verdict

**None yet for revision 2** — stopped for a fresh independent **Full-class** review.

Revision 1's verdict, retained verbatim: **`VERDICT: FAIL`** (1 Critical, 3 High, 4 Medium, 3 Low),
recorded in § 1.

**Note on independence:** the reviewer who produced revision 1's `VERDICT: FAIL` also performed this
corrective work, at Blue's direction. The next review must therefore be carried out by a **different**
reviewer for the independence requirement to hold.

## Review-diff rule

* Before merge, use `git diff main...<tip>`.
* After merge, reproduce with `git diff <recorded-pre-merge-main>...<tip>`.
* Always use `--output`; never PowerShell `>`.
* Retain the literal `VERDICT: PASS|FAIL` line and name the review that produced it.

---

**Authorized and performed in revision 2:** corrective work within bounded Experiment A — structural
fixes, focused tests, settings-recovery tests, and evidence correction. No model turn was consumed.

**Not authorized, and not done:** production specification or implementation, permanent hook
installation, a second provider, a second status-enabled pane, Experiment B, any app-server listener /
`codex --remote` / observer client, merge, and push.

Explicitly:

* **Experiment A correction only.**
* **Reporter provenance remains unresolved unless independently proven.**
* **Production pane-status implementation remains unauthorized.**
* **Experiment B and app-server runtime testing remain unauthorized.**
* **Nothing was merged or pushed.**

**BLUE SUBSYSTEM VERDICT: PROTOTYPE**
