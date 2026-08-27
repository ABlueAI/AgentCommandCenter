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
| Root cause | not established | **established — see the Track B status note below** |

**No common cause is claimed, and none may be inferred from this record.** Track B was
unobservable while segment 15 could not run because segment 14 aborted the chain. That was a
sequencing dependency of the `&&` chain, **not** evidence of a shared cause, and Track B was
not closed, reclassified, or dispositioned on Track A's evidence.

**Track B status — RESOLVED as a gate measurement defect, on its own evidence.** On 2026-08-21,
with segment 14 passing, segment 15 ran and reproduced the recorded `100 -> 100` symptom. The
cause is in the gate, not the product: the maximize scenario sampled geometry after a log-based
settle plus fixed sleeps, neither of which proves the Dockview surface has been laid out. With
`#terminalDock` at zero width, Dockview reports a clamped 100px placeholder for the surface and
for every group, so both panes read 100 and the growth check compared the placeholder with
itself. Forcing the dock to zero width reproduces the signature exactly (dock 0, surface 100,
both panes 100). Shipped maximize behavior was measured correct throughout: 508 -> 1016 with the
sibling collapsing to 1 and an exact restore. Corrected on `fix/dockview-maximize-gate` by
waiting on observable Dockview state plus settled geometry and asserting whole-surface
occupancy; `app/renderer/dockview-prototype.js` was not changed. This resolves Track B only —
Track A, AGR-1, and AGR-2 are untouched by it.

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

**Candidate host/environment changes — checked, with the bound each check actually
carries.** These are **not** uniformly exclusions. Only three rows below rest on positive
evidence (one byte-level hash comparison and two reproductions); the rest are
*absence-of-recorded-change* observations, most of them taken **after** the fact, and they
narrow the candidate space without proving that no change occurred between the Aug 19
green runs and the Aug 20 failing sample.

| Candidate | Evidence | Bounded verdict |
| --- | --- | --- |
| Electron distribution incomplete | all 21 expected files present in `app/node_modules/electron/dist`, including `d3dcompiler_47.dll`, `ffmpeg.dll`, `libEGL.dll`, `libGLESv2.dll`, `vk_swiftshader.dll`, `vulkan-1.dll` | **narrowed** — the enumerated files are present; presence of an enumerated set does not exclude a missing or unloadable transitive dependency outside that set |
| Electron reinstalled or drifted | `electron.exe` CreationTime 2026-06-27; `node_modules/.package-lock.json` last written 2026-08-08; installed version `42.5.0` | **narrowed** — no drift in the inspected timestamps; timestamps can be preserved across a replacement |
| Electron version ambiguity | `app/package.json` requests `^42.5.0`; `app/package-lock.json` resolves the installed dependency to `42.5.0`. A caret range is not an exact pin, but the lock resolution is exact | resolved |
| Binary differs between worktrees | `electron.exe` SHA-256 `F9D584073947EC9B1027278DAD35BE0E6FE0443F954A8448E9B0B3D34ECEEC1B`, length 232,351,232, identical in the main worktree and the measurement worktree | **excluded** — positive evidence; byte identity was measured directly |
| OS update or reboot | last hotfix installed 2026-08-14; last boot 2026-08-14 19:44 | **narrowed** — no hotfix or boot inside the window according to the inspected sources |
| GPU driver change | NVIDIA GeForce RTX 5080 Laptop GPU driver 32.0.16.1088 dated 2026-07-21; Intel Graphics 32.0.101.8424 dated 2026-01-05; both `Status=OK`, `ConfigManagerErrorCode=0` | **not established** — these are *current* properties read after the fact; no Aug 19 baseline was captured, so they do not prove the driver state was unchanged across the transition |
| DLL injection surfaces | `AppInit_DLLs` empty with `LoadAppInit_DLLs=0` in both registry views; `AppCertDlls` key absent; no Image File Execution Options entry for `electron`, `node`, or `chrome` | **narrowed** — the three checked mechanisms show nothing; they do not cover every injection or overlay mechanism |
| Third-party security software | only Windows Defender is registered in `root\SecurityCenter2` | **narrowed** — current registration only; `SecurityCenter2` lists registered AV products, not every filter driver, hook, or overlay |
| Antivirus detection or quarantine | `Get-MpThreatDetection` records no detections | **narrowed** — no detection *recorded* at query time; that is not the same as no interference |
| Code-integrity / Smart App Control block | the CodeIntegrity operational log contains **zero events on 2026-08-20**; `VerifiedAndReputablePolicyState = 0` (SAC off); `UsermodeCodeIntegrityPolicyEnforcementStatus = 0` | **narrowed** — zero events in the checked log for that date, plus a current policy read; neither establishes the policy state as it stood during the Aug 19 runs |
| Windows-recorded application crash | no Error/Warning/Critical event in Application or System during the window; the only `Application Error` naming `electron.exe` on this host is dated 2026-07-15 | **not observed in the checked logs** — Windows recording no crash event means the checked logs contain none, **not** that no crash can have occurred; a child that exits `0xC0000135` at load time need not produce a WER application-error record |
| Missing system runtimes | `msvcp140.dll`, `vcruntime140.dll`, `vcruntime140_1.dll`, `d3dcompiler_47.dll`, `dxgi.dll`, `d3d11.dll` all present in System32 | **narrowed** — the presence of these six common runtime DLLs does not exclude another missing transitive DLL; `0xC0000135` (`STATUS_DLL_NOT_FOUND`) names no module, and the full import closure was not walked |
| Worktree or dependency-copy artefact | the targeted run in the real main worktree reproduced the failure identically | **excluded** — positive evidence; the failure reproduced |
| Chain-position or ordering effect | both targeted standalone runs reproduce the failure identically outside the chain | **excluded** — positive evidence; the failure reproduced |

None of the **narrowed** or **not established** rows may be cited as a closed question, and
no combination of them establishes that the host was unchanged across the Aug 19–20
transition. Where a candidate needs to be genuinely excluded, it needs positive evidence of
the kind carried by the hash-comparison row and the two reproduction rows.

**OBSERVATION — DEFERRED, NOT INVESTIGATED.**

Windows Code Integrity logs referenced `C:\Windows\System32\nvspcap64.dll` on August 15,
17, 19, and 21. No such event was recorded during the August 20 measurement window.

A read-only inspection on August 21 established that the file exists. Its local version
metadata identifies it as:

- Company: NVIDIA Corporation
- Product: NVIDIA App
- Description: NVIDIA Game Proxy

The retained evidence does not establish whether this module — or any NVIDIA capture or
overlay component — loaded into the Electron main process, renderer, or GPU child during
either the green or failing runs. It does not establish any causal relationship to
`0xC0000135`.

Possible relevance to the broader child-process injection class is inference, not fact.

**DISPOSITION: DEFERRED; not on the critical path.** Do not promote it to an active lead
without new evidence tying it to an affected Electron process or the measurement window.

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

**Result.** Unknown. The green-versus-failing transition is **not reconciled**. Of the
candidates above, three are genuine exclusions resting on positive evidence and the rest
are narrowings or open questions; an exclusion is not a cause in any case, and a narrowing
is not even an exclusion. The inherited-environment hypothesis remains unproven.

---

## AGR-3 — Merged-main gate reached both Dockview product assertion sets — CLOSED

**Status:** CLOSED on the later authorized merged-main gate. **No implementation fix was
required or authorized by this entry.** AGR-1 and AGR-2 remain **OPEN**.

During independent Full-class review of P1 fenced-role environment containment Revision
7, the reviewer admitted the two named Dockview suite failures under the existing narrow
AGR decision tree. The exact-fork and branch observations matched their respective
pre-assertion Electron `ERR_FAILED` / GPU `0xC0000135` signatures; all 88 registered suites
were accounted for exactly once as 14 before the two named suites, each named suite once,
and the remaining 72-suite suffix once with exit `0`. The reviewer therefore found the
failures non-attributable to P1 and returned `VERDICT: PASS` for the reviewed R7 content.

That exception established **non-attribution, not coverage**. Neither
`app/dockview-bootstrap.test.js` nor `app/dockview-app-integration.test.js` reached its
product assertions in the fresh P1 app gate, and those assertions had gone
unexecuted through seven consecutive P1 revisions. The correct accounting is therefore
“86 suites green; two named pre-assertion AGR exceptions accepted,” not “all 88 suites
green.” The residual was required to remain open until a future authorized run reached
both suites' product assertions or a separately authorized reliability repair restored
that coverage.

That closure condition was later met on merged `main` at
`76dd083ead5648322af22678c279d6524c79a44b`: the authorized merged-main app gate
reached both Dockview suites' product assertions and exited successfully. AGR-3 is
therefore closed on direct coverage evidence, not by reinterpreting the earlier P1
exception. This does not resolve or narrow AGR-1's report-parsing defect or AGR-2's
unreconciled historical green-versus-failing transition; both remain open.

Source: independent Full-class review of P1 R7 content tip `4bee857` with handoff tail
`d2d9c90`, recorded during the August 27 verdict-finalization pass. Its controlling line
is retained verbatim: `VERDICT: PASS`.

Closure source: the later authorized app gate on merged `main` at `76dd083`, which
reached both named suites' product assertions and exited successfully.

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
  AGR-1, AGR-2, and AGR-3. F1 remains a separate aggregation/reporting-contract problem.

## Evidence preservation

A cleanup-resistant copy of the measurement evidence and the related review artifacts was
made on 2026-08-21 under a bounded Blue authorization, outside the Git repository at
`D:\Workspace\agent-command-center-evidence\gate-reliability-2026-08-20\`.

**What was actually verified — stated precisely, because not every copied file had a prior
tracked pin.** 99 files were copied. Copy fidelity and prior-pin coverage are two different
things and are reported separately:

| Claim | Count | Basis |
| --- | --- | --- |
| Copies that matched their source after copying | **99 of 99** | SHA-256 of each destination compared against SHA-256 of its source, at copy time |
| Files whose **recorded identity** in a tracked handoff matched | **17** | prior pin recorded in a tracked document; re-verified against the file on disk |
| Raw files that matched the **existing** raw-file manifest | **60** | manifest SHA-256 `b8a424298f8f8163497936b3d07e6c0ffd15238964891e127c38f835f44dc622` |
| Ancillary measurement files with **no prior pin and no manifest coverage** | **22** | no prior recorded identity existed; preserved with **newly observed** hashes taken at copy time |

The three coverage rows sum to the 99 copied files (17 + 60 + 22). The 22 ancillary files
carry **first-observation** hashes only: those hashes record what the bytes were when the
copy was made, and they do **not** establish that the bytes were unchanged since the run
that produced them. No prior pin exists against which they could have been checked.

The R4 regeneration twins are a further qualification: their identity rests on the
**handoff's recorded twin-identity statement** — that the regenerated artifact is
byte-identical to the original — rather than on an independently recorded pin for the
regenerated file itself.

**Phase 0 closeout — manifest preservation.** The manifest describing the copy operation
was itself outside the preserved set, in a session-scoped temporary directory. Under a
bounded Blue authorization it was copied — copy only; not regenerated, source not deleted,
no other files added — to
`D:\Workspace\agent-command-center-evidence\gate-reliability-2026-08-20\PHASE0-MANIFEST.tsv`.

- Source SHA-256: `031097c3445dfad510c19a30194b2ac4101a318771148fcdb4e3f184a75d8b72`
- Destination SHA-256: `031097c3445dfad510c19a30194b2ac4101a318771148fcdb4e3f184a75d8b72`
- 47,395 bytes both sides; byte identity confirmed by direct comparison, not by hash alone.
- Content: a header row plus 99 data rows — 99 `COPY_MATCH`, 17 `PIN_MATCH`,
  82 `NO_RECORDED_PIN`, consistent with the coverage table above.
- The preserved directory therefore now holds 100 files: the 99 evidence files the manifest
  describes, plus the manifest itself, which describes them but not itself.

**What this preservation is, positively stated.** It is **cleanup-resistant preservation
only** — it moves the evidence out of reach of routine working-directory and temp-directory
cleanup. It is **not** durable archival storage and **not** an independent backup: it is a
single unreplicated copy on the same host and the same physical volume as much of its
source, with no offsite copy, no redundancy, and no integrity re-verification schedule.

**H2 remains open.** The standing concern that gitignored working-directory artifacts are
being treated as archival artifacts is **not** closed by this copy, and nothing in this
record should be read as closing it.

---

## Independent review verdict

Recorded verbatim:

```
VERDICT: PASS
CLASS: Standard
INDEPENDENCE: CONFIRMED
```

Source: fresh independent Standard review of cumulative range `e0d9e53...06f29e6` and
focused range `dec7d9d...06f29e6`.

This tail is verdict-only and is **unreviewed by construction**: it cannot contain its own
SHA, and reviewing it would spawn a further tail. The pinned artifact continues to pin the
reviewed content tip `06f29e6` and excludes this commit. The PASS records the review
outcome on that tip; it does **not** close AGR-1 or AGR-2, which remain **OPEN**, and it
does not close the later AGR-3 coverage residual. It authorizes no fix, no merge, and no
push.
