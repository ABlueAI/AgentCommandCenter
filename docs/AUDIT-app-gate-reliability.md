# Audit — App-Gate Reliability

Status: **OPEN**
Opened: 2026-08-21
Base: `e0d9e5347c29cf43d854a8c0272b838790fd4da1` (`main == origin/main`), tree
`63b3777df4caf81d58bdac02db18b7ccf4db671d`, `app` tree
`e0aaaaab805dd46297ead0d8f881b0a1084db943`.

Documentation only. **No implementation fix is authorized by this record.** Documenting a
finding does not authorize repairing it; each repair needs its own Blue work order.

## Scope and the two tracks

This audit covers the app gate (`npm test` in `app/`, a 67-entry `&&` chain). Two
observations are tracked and are **deliberately not merged into one class**:

| | **Track A** | **Track B** |
| --- | --- | --- |
| Suite | `app/dockview-bootstrap.test.js` (chain segment 14) | `app/dockview-app-integration.test.js` (chain segment 15) |
| Symptom | Electron child processes fail to launch; GPU exit `0xC0000135` | maximize assertion `100 -> 100` |
| Observations | 20/20 in the valid sample, plus 2 targeted runs | 1, no GPU evidence, 0/20 in the sample |
| Root cause | not established | not established |

**No common cause is claimed, and none may be inferred from this record.** Track B is
currently unobservable because segment 15 cannot run while segment 14 aborts the chain.
That is a sequencing dependency of the `&&` chain, **not** evidence of a shared cause,
and Track B must not be closed, reclassified, or dispositioned on Track A's evidence.

Evidence base: the preserved 20-run measurement (snapshot `34af8bf`, `app` tree
`e0aaaaab…db943`), summary SHA-256
`b34b830f9fbd0f1dc77e9771f8dd79f7dea5dcca97b2ce20d60fe4884824a82a`, raw-file manifest
SHA-256 `b8a424298f8f8163497936b3d07e6c0ffd15238964891e127c38f835f44dc622`. Both hashes
were re-verified against the files on disk before this record was written, and all 60
manifest-listed raw files matched their recorded hashes.

---

## AGR-1 — The harness emits two reports and the test parses across both, discarding the named failure — OPEN

**Status:** OPEN. Diagnosability / fail-visibly defect. **No fix authorized.**

**Class:** separate from Track A's unresolved root cause. AGR-1 does **not** cause the
launch failure and fixing it would **not** make the gate pass. It determines only
whether the failure that already happened is legible.

**Affected files**

- `app/dockview-bootstrap-harness.js`
- `app/dockview-bootstrap.test.js`

**Exact mechanism**

1. `emit()` lacks a single-shot guard. It writes the JSON payload to stdout and calls
   `app.exit(code)`; nothing records that a report was already written, and nothing
   prevents a second call (`app/dockview-bootstrap-harness.js:120-123`).
2. `fail()` calls `emit(...)` and is wired to more than one failure path
   (`app/dockview-bootstrap-harness.js:125-133`).
3. On the observed failure, `render-process-gone` fires first and emits the **first**
   structured failure document — `{"ok": false, "stage": "render-process-gone",
   "error": "launch-failed", …}` (`app/dockview-bootstrap-harness.js:585`).
4. `app.exit(1)` does not terminate the process before the already-pending
   `await win.loadFile(HARNESS_FILE)` promise rejects. Its `catch` calls `fail('loadFile', …)`,
   which emits a **second** document — `{"ok": false, "stage": "loadFile",
   "error": "ERR_FAILED (-2) loading 'file:///…dockview-bootstrap-harness.html'", …}`
   (`app/dockview-bootstrap-harness.js:598-601`).
5. The test extracts the report with `text.indexOf('{')` through `text.lastIndexOf('}')`
   and `JSON.parse`s that slice (`app/dockview-bootstrap.test.js:71-78`). With two
   documents present, the slice spans **both**, so it is not valid JSON.
6. `JSON.parse` therefore throws, `report` is null, and the test takes the no-report
   branch: `✗ FAIL: the harness produced no parseable JSON report (Unexpected
   non-whitespace character after JSON at position 259 (line 16 column 1))`
   (`app/dockview-bootstrap.test.js:80-86`).

**Consequence.** A correct, structured, already-named failure — `stage:
render-process-gone`, `error: launch-failed` — is present in the harness output and is
discarded by the parser. The gate reports a parser complaint instead of the failure it
observed. The named cause survives only because the test also dumps raw stdout/stderr on
that branch; the machine-readable report is lost.

**Reproduction (no new run required).** Present in every retained run: 20/20 valid-sample
`run-*.stderr.log`, 5/5 junction-pilot logs, the native pilot, and both targeted runs —
28 of 28 retained observations, identical parse error and identical byte offset (position
259).

**Why this is registered as its own finding.** Under the standing fail-visibly rule, a
failure path must surface a visible, honest message. This path surfaces a *misleading*
one: the operator sees a JSON parsing problem and not `launch-failed`. Any future
repair must make the failure **more** legible; suppressing the error, retrying, or
weakening an assertion would violate the same rule this finding is drawn from.

---

## AGR-2 — Recorded green full-chain runs are not reconciled with the deterministic 20/20 failure — OPEN

**Status:** OPEN. **Unresolved.** Read-only Phase 1 forensics could not decide the
question; the outcome is recorded as **unknown**, not as an inferred cause.

**The question.** How did earlier full-chain runs exit 0 when the current bootstrap
failure is deterministic 20/20?

**Recorded green runs (tracked evidence).**

- `docs/AUDIT-test-runner-wiring.md` — `npm test` on `8c6bfce` reports **67 suites /
  4,888 assertions / 0 failures**; and the R1 branch gates at `cf6c1a8` "matched main
  exactly: app 67/4,888/0".
- `docs/BUILDER-HANDOFF-pane-status-admission-protective-state-machine.md` — merged-main
  gates ran on `2ef73c39` and exited 0: **67 suites, 4,888 assertions, 0 failures**.

A run that reports 67 suites necessarily executed segment 14, so Electron child-process
launch **did** work on this host at those points. The failing sample is dated
2026-08-20, `34af8bf`.

**Exit propagation is NOT defective — verified, so no gate-integrity finding is opened
on that basis.**

- `app/package.json` `scripts.test` is 67 segments joined by `&&`, with no `||`, no
  single `&`, no `--if-present`, and no `exit 0`; segment 14 is
  `node dockview-bootstrap.test.js`.
- There are no `pretest` or `posttest` hooks.
- No `.npmrc` exists at the repo root, in `app/`, or in the user profile, so no
  `script-shell` override is in effect.
- `app/dockview-bootstrap.test.js` calls `process.exit(1)` on the no-report branch.
- Empirically, all 20 valid runs recorded `exit_code=1`.

A non-zero segment-14 exit therefore aborts the chain and propagates to the parent. The
recorded green results could not have masked a segment-14 failure, and prior green
Dockview results remain usable.

**Candidate host/environment changes — all excluded by recorded evidence.** No change in
any of these between the Aug 19 green runs and the Aug 20 failing sample:

| Candidate | Evidence | Verdict |
| --- | --- | --- |
| Electron distribution incomplete | all 21 expected files present in `app/node_modules/electron/dist`, including `d3dcompiler_47.dll`, `ffmpeg.dll`, `libEGL.dll`, `libGLESv2.dll`, `vk_swiftshader.dll`, `vulkan-1.dll` | excluded |
| Electron reinstalled or drifted | `electron.exe` CreationTime 2026-06-27; `node_modules/.package-lock.json` last written 2026-08-08; installed version `42.5.0` | excluded |
| Electron version ambiguity | `app/package.json` requests `^42.5.0`; `app/package-lock.json` resolves the installed dependency to `42.5.0`. A caret range is not an exact pin, but the lock resolution is exact | resolved |
| Binary differs between worktrees | `electron.exe` SHA-256 `F9D584073947EC9B1027278DAD35BE0E6FE0443F954A8448E9B0B3D34ECEEC1B`, length 232,351,232, identical in the main worktree and the measurement worktree | excluded |
| OS update or reboot | last hotfix installed 2026-08-14; last boot 2026-08-14 19:44 | excluded |
| GPU driver change | NVIDIA GeForce RTX 5080 Laptop GPU driver 32.0.16.1088 dated 2026-07-21; Intel Graphics 32.0.101.8424 dated 2026-01-05; both `Status=OK`, `ConfigManagerErrorCode=0` | excluded |
| DLL injection surfaces | `AppInit_DLLs` empty with `LoadAppInit_DLLs=0` in both registry views; `AppCertDlls` key absent; no Image File Execution Options entry for `electron`, `node`, or `chrome` | excluded |
| Third-party security software | only Windows Defender is registered in `root\SecurityCenter2` | excluded |
| Antivirus detection or quarantine | `Get-MpThreatDetection` records no detections | excluded |
| Code-integrity / Smart App Control block | the CodeIntegrity operational log contains **zero events on 2026-08-20**; `VerifiedAndReputablePolicyState = 0` (SAC off); `UsermodeCodeIntegrityPolicyEnforcementStatus = 0` | excluded |
| Windows-recorded application crash | no Error/Warning/Critical event in Application or System during the window; the only `Application Error` naming `electron.exe` on this host is dated 2026-07-15 | excluded |
| Missing system runtimes | `msvcp140.dll`, `vcruntime140.dll`, `vcruntime140_1.dll`, `d3dcompiler_47.dll`, `dxgi.dll`, `d3d11.dll` all present in System32 | excluded |
| Worktree or dependency-copy artefact | the targeted run in the real main worktree reproduced the failure identically | excluded |
| Chain-position or ordering effect | both targeted standalone runs reproduce the failure identically outside the chain | excluded |

**Signing observation, recorded in the required wording.**

> `Get-AuthenticodeSignature` against the installed
> `app\node_modules\electron\dist\electron.exe` at snapshot `34af8bf` returned
> `NotSigned`; the inspected file reports version `42.5.0`.

This is an inspected property of the local installed binary. It is **not** a claim about
Electron's general distribution practice, and it is not established as causal —
user-mode code-integrity enforcement is off and Smart App Control is off, so nothing on
this host is currently recorded as blocking an unsigned user-mode image.

**Separate observation — os_crypt `0x8009000B`.** Every run logs
`Failed to decrypt: Key not valid for use in specified state. (0x8009000B)` immediately
before the GPU exit. It is recorded as a **separate observation** and is **not**
established as causal or as related to Track A's root cause.

**Separate observation — restricted-context signal.** 26 of the 28 retained runs (all 20
valid runs, all 5 junction pilots, the native pilot) emit
`warning: unable to access 'C:\Users\levij/.config/git/ignore': Permission denied`,
indicating the run context could not read a file inside the user's own profile. The two
targeted runs do **not** carry that warning and fail identically, so the warning is
**not necessary** for the failure. Recorded as an anomaly, not a cause.

**Leading unproven hypothesis — inherited Chromium environment.** Recorded as
**inference, not fact**, and testable only under a future authorization:

- Fact: `app/dockview-bootstrap.test.js:61-62` copies the entire parent `process.env`
  into `childEnv` and deletes exactly one variable, `ELECTRON_RUN_AS_NODE`.
  `app/dockview-app-integration.test.js:53-54` does the same. Every other inherited
  variable is passed through to the spawned Electron 42.5.0 process.
- Fact: nothing under `app/` references `crashpad`, `CHROME_CRASHPAD_PIPE_NAME`, or
  `crashReporter`.
- Fact: an agent execution context on this host exports
  `CHROME_CRASHPAD_PIPE_NAME` (observed value of the form
  `\\.\pipe\crashpad_<pid>_<token>`) and `ELECTRON_RUN_AS_NODE=1`, because the agent
  host is itself a Chromium/Electron application.
- Inference (unproven): a child Electron inheriting a `CHROME_CRASHPAD_PIPE_NAME` that
  belongs to a *different* Chromium process could fail child-process startup while the
  main process still runs — the observed shape, where the main process reaches
  `BrowserWindow` creation and both the renderer and GPU children fail at launch.
- Not established: whether that variable was present in the 2026-08-20 measurement
  context. The retained logs do not record the child environment.

The two Electron-launching suites share this env-inheritance property as a **code
property only**. It is explicitly **not** offered as a common cause for Tracks A and B.

**Result.** Unknown. The green-versus-failing transition is **not reconciled**. The
excluded candidates above are exclusions, not a cause, and the environment hypothesis is
unproven.

---

## Rules this audit inherits

- Do not suppress Electron errors, add blind retries, weaken assertions, or relabel a
  failing gate to obtain green evidence.
- Do not infer a common cause between Track A and Track B.
- Do not close Track B on Track A evidence, or vice versa.
- If a future repair introduces a new subsystem or dependency, stop for the OSS-first
  procurement gate in `AGENTS.md`. Ordinary repair of the existing harness does not
  itself reopen procurement.
- Findings F1 and F5 belong to `docs/AUDIT-test-runner-wiring.md` and are unrelated to
  AGR-1 and AGR-2. F1 remains a separate aggregation/reporting-contract problem.

## Evidence preservation

A cleanup-resistant copy of the measurement evidence and the related review artifacts was
made on 2026-08-21 under a bounded Blue authorization, outside the Git repository at
`D:\Workspace\agent-command-center-evidence\gate-reliability-2026-08-20\`. Every copied
file was verified against the SHA-256 recorded in its tracked handoff before copying and
against its source after copying.

That copy is **not** durable archival storage and **not** an independent backup. The
standing concern that gitignored working-directory artifacts are being treated as
archival artifacts remains open and is not closed by it.
