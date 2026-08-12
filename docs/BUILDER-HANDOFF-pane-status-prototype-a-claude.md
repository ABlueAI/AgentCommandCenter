# Builder Handoff — Pane-Status Experiment A (Claude Code hook reporter)

Branch: `feature/pane-status-prototype-a-claude`
Worktree: `.worktrees/pane-status-prototype-a-claude`
Fork-point SHA: `3ff96bdea3e68a83cd5774c9b94b68d9cb292add`
Pre-merge main SHA: `3ff96bdea3e68a83cd5774c9b94b68d9cb292add`
Revision 1 reviewed tip: `bf66fb3b9fad080d1ff92ed0815034e525a75740` — **`VERDICT: FAIL`**
Revision 2 reviewed tip: `c8d9fdaa3ecd8b792850ad525b9b768bdd14bcb5` — **`VERDICT: PASS`**
Revision 3 reviewed tip: see § 12
Merge commit SHA: Pending until merge

**Status: REVISION 3 — FINAL. All six revision-2 Low findings corrected. Experiment A was run inside
the REAL Electron application against the executable a pane actually launches. Claude settings were
restored byte-identically. TWO RESULTS NEED BLUE'S ATTENTION BEFORE ANY NEXT STEP: the visible badge
was never confirmed (§ 6), and the run went ONE MODEL TURN OVER BUDGET (§ 7). AWAITING A FRESH
INDEPENDENT FULL-CLASS REVIEW. NOT MERGED, NOT PUSHED.**

## 0. Procurement authority

Tracked record: **`docs/OSS-PROCUREMENT-pane-status.md`**. Blue's verdict, verbatim:

> BLUE SUBSYSTEM VERDICT: PROTOTYPE

This branch is **Experiment A only**: one provider (Claude Code), one pane, one temporary hook
reporter, one bounded display. Still unauthorized and untouched: production specification or
implementation, permanent hook installation, multiple providers, multiple status-enabled panes,
**Experiment B**, any app-server listener / `codex --remote` / observer client, merge, and push.

The procurement record was **not modified in revision 3** — no addendum was required, its reviewed
analysis is untouched, and its canonical verdict is unchanged.

Full evidence: **`docs/PROTOTYPE-EVIDENCE-pane-status-claude-hook.md`** (revision 3).

---

## 1. REVIEW HISTORY

### 1.1 Revision 1 — `VERDICT: FAIL`

**1 Critical · 3 High · 4 Medium · 3 Low.** Retained verbatim in the revision-2 record and **not
downgraded**: (1) the application could never display any state but `unknown`; (2) the pinned version
was a different installation from the one Blue Helm launches; (3) the token authenticates the pane
environment, not the reporter; (4) a fresh-process second `install` could destroy the genuine backup;
(5) provider-upgrade behaviour never performed; (6) gate-off was inert, not absent; (7)
`window.ccPaneStatusReattach` was unreachable; (8) PTY spawn failure stranded the single slot; (9) the
suite structurally could not catch finding 1; (10) `listen` printed the bearer token; (11)
kill-criterion 2 answered structurally.

### 1.2 Revision 2 — `VERDICT: PASS`

An independent Full-class review of `c8d9fdaa` returned:

> VERDICT: PASS

The reviewer **independently confirmed all 11 revision-1 findings fixed, scoped, or honestly
recorded, with none downgraded**, verified all three artifact identities byte-exactly, reconciled both
gates per suite, and confirmed no user settings or runtime state changed, no model turn was consumed,
and nothing was merged or pushed. It raised **six non-blocking Low findings**.

### 1.3 The six Low findings and their revision-3 dispositions

| # | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | Low | `dockview-default-path.test.js:306-311` — stale comment claiming the badge module "defines one global" with the gate off (revision 1's behaviour, the exact thing finding 6 removed) | **CORRECTED.** The comment now states gate-off means loaded-but-publishes-no-global, and names the two suites that assert it |
| 2 | Low | `dockview-default-path.test.js:181-184` — the "every entry is conditional" assertion FILTERED to `...`-prefixed lines, so an unconditional non-spread entry was discarded rather than caught | **FIXED.** Every non-empty, non-comment entry is inspected; a **negative control** proves the predicate rejects an unconditional entry |
| 3 | Low | `pane-status-version.js:110-118` — `ERROR_TAG` tested before `SOURCE_TAG`, so a resolved provider whose `--version` threw reported `provider-not-found` with a null source, and `version-command-failed` was unreachable | **FIXED.** Source read first; resolved-but-version-failed now reports `version-command-failed` **with the resolved path preserved**; `provider-not-found` reserved for real resolution failure; both covered |
| 4 | Low | `main.js:398-412` — `.discover().then(...)` had no `.catch()`; a throw in the handler became an unhandled rejection | **FIXED.** Bounded `.catch()` logging a fixed constant — no path, env value, command output, token, or the caught error's text |
| 5 | Low | `pane-status-integration.test.js:63-67` — claimed "EXACTLY the dependency set app/main.js passes" while injecting `net`/`crypto` | **CORRECTED** to application call shape **plus injected test stubs**, naming the load-bearing property |
| 6 | Low | `pane-status-boundary.test.js` — labels said "fresh-process" for fresh **guard objects** in one process | **RELABELLED** "new-guard"; "fresh process" reserved for the runner suite that really spawns processes |

Verified revision-2 artifacts, **not regenerated and not altered**:

| Artifact | Range | Size | SHA-256 |
| --- | --- | --- | --- |
| rev2 focused | `f8cb64a3...c8d9fdaa` | 165,445 | `b8b5f644d1fc53f84beb6c7762c7968dbd7328de1374a0a6c622cee9242a64f7` |
| rev2 cumulative | `3ff96bde...c8d9fdaa` | 280,014 | `3b3cb40fc1d5590479f7009af66f76934c48044f283e598d5b2566fc3e1683f3` |
| rev1 | `3ff96bde...bf66fb3b` | 174,128 | `eaad43a22aeacfc7de79f234e3805e7aaf56dd75e2de11854e42d5936aa42f89` |

---

## 2. The exact executable, the version, and the pin

Resolved through **the application's own implemented path** (`pane-status-version.js`, PowerShell,
the PTY's environment, bare `AGENT_CMD.claude`), and confirmed again from inside the running app:

```
[pane-status] provider resolved: C:\Users\levij\.local\bin\claude.exe (version 2.1.220)
```

**`SUPPORTED_CLAUDE_VERSIONS` is now `['2.1.196', '2.1.220']`, and `2.1.220` REMAINS.** The work order
permitted it only if the final run launched that exact resolved executable and observed the real
application path successfully. It did: no `version-mismatch` error was emitted, the first view was
`unknown (no-signal)` rather than `unknown (version-mismatch)`, and six real events drove real states.

**This is not a range and not a support declaration.** `isVersionSupported` is an exact `indexOf`
against a frozen list. `pane-status-version.test.js` asserts `2.1.195`, `2.1.197`, **`2.1.200` (which
sits between the two entries)**, `2.1.219`, `2.1.221`, `2.2.196` and `3.1.220` are all still refused —
which no semver range could do — plus malformed, padded, range-shaped and non-string inputs.

---

## 3. What revision 3 changed

| Path | Change |
| --- | --- |
| `app/prototype-pane-status/pane-status-version.js` | Low 3 — SOURCE read before ERROR; `version-command-failed` preserves the resolved path |
| `app/prototype-pane-status/pane-status-version.test.js` | +37 — both interpretation outcomes, and the exact-list/no-semver suite |
| `app/prototype-pane-status/pane-status-protocol.js` | `2.1.220` added provisionally, with the closed-set reasoning in-file |
| `app/prototype-pane-status/pane-status-integration.test.js` | +4 — 2.1.220 now reaches `working`; an adjacent version still refuses; Low 5 comment fix |
| `app/prototype-pane-status/pane-status-boundary.test.js` | Low 6 — "new-guard" relabelling and scope note |
| `app/dockview-default-path.test.js` | +1 — Low 1 comment; Low 2 stronger check + negative control |
| `app/main.js` | Low 4 — bounded `.catch()` on the discovery chain |
| `docs/PROTOTYPE-EVIDENCE-pane-status-claude-hook.md` | Revision 3 throughout |

No dependency, lockfile, GitHub configuration, `AGENTS.md`, PowerShell file, or the procurement
record changed. **No pinned tripwire region moved** — `launcher-fence-invariant.test.js` passes
unchanged at 15/15, so the fenced-role cwd gate, the ptyEnv block and the pty-start handler are all
byte-identical to the revision-2 reviewed state.

---

## 4. THE REAL-APPLICATION RUN — what was observed

Full detail in evidence § 3.5. Six events accepted, 0 refused, 0 dropped, 0 transport errors:

| Event | Result | Renderer line |
| --- | --- | --- |
| enrolment | `pane pty1 enrolled` | `pty1 -> unknown (no-signal)` |
| `SessionStart` | accepted → `idle` | `pty1 -> idle` |
| `UserPromptSubmit` ×2 | accepted → `working` | `pty1 -> working` |
| `Stop` ×2 | accepted → `turn ended` | `pty1 -> turn ended` |
| **`Notification`** | **accepted → `attention`** | `pty1 -> attention` |
| `StopFailure` | **UNVERIFIED** | — |
| `SessionEnd` | **not observed this run** (Electron force-stopped, not a clean Claude exit) | — |

**Three genuinely new results:**

1. **The real preload/renderer path is proven.** Those renderer lines only exist if the gate token
   reached the preload, `window.ccPaneStatus` was exposed, and main pushed on the prototype channel.
2. **`Notification` fired naturally** — `UNVERIFIED` in every prior revision, and the one signal the
   whole feature's value rests on. **What triggered it was not established** (idle vs permission
   prompt); the operator did not confirm.
3. **A second pane was refused status by the running application**: `pane pty2 launched WITHOUT
   status: Experiment A already bound to pty1`. Kill criterion 9 moves STRUCTURAL → RUNTIME.

---

## 5. Blue's report, verbatim

> it did reply with only the word "ok" after i prompted. no errors, appears tobeb working as intended.

> there is no visible error. i was able to open another pane.

> here is more log. i dont see anything new. should i be looking for something? im a little confused
> as to what we are looking for? nothing seems out of sorts

> its good, lets move on, idk what badges youre talking about can we circle back to it in another
> test? im not seeing what youre referencing

**No Dockview drag was performed or reported.** It was offered while the application was still
running and declined in favour of revisiting it separately.

---

## 6. NEEDS BLUE — the visible badge was never confirmed

**The operator, looking at the running application, could not see a badge.** Recorded as a first-hand
observation, not explained away. Evidence § 7.1.

The renderer log lines do **not** contradict him: `update()` returns its computed view **whether or
not a DOM node was attached** (`if (!el) return shown;`). They prove the event arrived and the state
machine ran — not that anything was drawn. Revision 2's suite shares the blind spot, asserting against
a stub DOM where the host always exists.

**A lead, explicitly not a diagnosis:** `ensureBadge` prefers `pane.querySelector('.term-head')` and
falls back to the pane root. **`.term-head` appears nowhere in `app/renderer/app.js` or
`index.html`** — it exists only as CSS rules. So the badge, if attached at all, lands as the last
child of the pane element, after the xterm container. No DOM inspection of the running renderer was
performed, so this is the first thing to check next time, not a finding.

**Consequence for any production reading: a status feature nobody can see delivers none of the stated
benefit.** The six events do not evidence that the feature works *for a user*.

---

## 7. NEEDS BLUE — the run went one model turn over budget

**Authorized: three total. Consumed: four.** Two in revision 1; the application log shows **two**
complete prompt cycles in the enrolled pane, where one was authorized (evidence § 3.4).

The operator reported sending **one** prompt and did not confirm a second. Only the enrolled pane
holds the token, so both cycles came from `pty1`. **The origin of the second is not established and
is not invented here.** It is recorded as a one-turn overrun, flagged rather than rounded down to
"three of three".

What turn B contained is unknown, so it cannot be asserted content-free. Kill criterion 1 is
nonetheless unaffected: the transport carried only an event name and a token, and the entire
application log contains no token, no pipe name, and **no 64-hex run of any kind**.

---

## 8. Settings safety — baseline, mutation, restoration

| Stage | Value |
| --- | --- |
| Baseline (before any write) | **382 B** · `a67c2e6620f13861c7e548b4d69c259b119bae746cc6f8dfbd307a6b8f55dcc5` · `effortLevel, model, permissions, theme, tui` · no `hooks` · no marker |
| Read-only `identity` | agreed exactly, and created nothing |
| Recovery copy | 382 / `a67c2e66…` — byte-identical, verified before the first mutation |
| Patched | 3,188 B · `hooks` added · marker present · 6 events each 0 → 1 group |
| **Restored** | **382 B** · **`a67c2e66…` — exact match**; `hooks` and marker absent on re-parse |
| Recovery copy + sidecar | removed **only after** restoration was proven |
| Temp dir · pipes · processes | all absent (temp dir removed only after verifying it was empty, behind a name guard) |

**One production file changed and is reported rather than omitted:**
`%APPDATA%\command-center\dockview-layout.json` did not exist before and now does (1,291 B). It was
written by the **production Dockview layout engine** because the real app ran with the real user-data
directory — normal behaviour, not a prototype side effect. **Not deleted**: it is legitimate
user-owned state, and removing it to tidy a table would destroy a real setting. Scanned: 0 matches for
`pane-status`, `blue-helm`, or any 64-hex run.

---

## 9. Gates — recounted per suite

| Gate | Result |
| --- | --- |
| App gate (`npm test`) | **exit 0 — 52 chain entries, 3,678 assertions passed, 0 failed** |
| Pester (`scripts\run-pester.ps1`) | **955 passed / 0 failed / 0 skipped** (35 suites) |
| `git diff --check` | clean (exit 0) |

**Reconciliation from revision 2's 3,636:**

| Source | Δ |
| --- | --- |
| `pane-status-version` 68 → 105 | +37 |
| `pane-status-integration` 74 → 78 | +4 |
| `dockview-default-path` 377 → 378 | +1 |
| **Total** | **3,636 + 42 = 3,678** ✓ |

Chain entries unchanged at 52. Pester unchanged at 955 — no PowerShell file changed. Note the app
gate reports 50 suites in `N passed, M failed` form plus `audio-module-health` and
`tts-audio-contract` at 9 assertions each (3,660 + 18 = 3,678).

---

## 10. Kill criteria after revision 3

1 **NO** (RUNTIME+STRUCTURAL) · 2 **NOT SATISFIED** (drag declined) · 3 **NO** (RUNTIME+STRUCTURAL) ·
4 **NO** (RUNTIME) · 5 **NO** (RUNTIME) · 6 **NO** (RUNTIME, 2 turns) · 7 **NO**
(RUNTIME+STRUCTURAL) · 8 **NO** (RUNTIME) · 9 **NO** (**RUNTIME**, upgraded) · 10 **NO** (RUNTIME).

Outside the ten: **§ 6 the visible badge is unconfirmed**, and **§ 5.1 of the evidence — reporter
provenance is unresolved**.

---

## 11. Recommended review focus

1. **§ 6 and § 7** — the two results that need Blue's judgement, not just a reviewer's.
2. Whether keeping `2.1.220` is right given the badge was never seen. The argument for keeping it is
   that list membership governs *event acceptance*, which was demonstrated; the argument against is
   that "observes the real application path successfully" could be read to include the display.
3. The Low-2 tripwire rewrite and its negative control.
4. Whether evidence § 7.1 states the badge hypothesis narrowly enough.
5. Whether § 11 item 19 keeps provider-upgrade behaviour appropriately un-generalised.

---

## 12. Commits and review artifacts

| Field | Value |
| --- | --- |
| Revision 1 reviewed tip | `bf66fb3b9fad080d1ff92ed0815034e525a75740` — `VERDICT: FAIL` |
| Revision 2 reviewed tip | `c8d9fdaa3ecd8b792850ad525b9b768bdd14bcb5` — `VERDICT: PASS` |
| Handoff-only tail (rev 2) | `d85002ce82e3fbb5b895197a0d17f3f3a0ed5d9d` |
| **Revision 3 reviewed tip** | `3920a3b1a57a349137ac7e5098624ebda06aab5c` |
| Branch tip | the handoff-only tail commit below |
| Focused correction range | `d85002ce82e3fbb5b895197a0d17f3f3a0ed5d9d...3920a3b1a57a349137ac7e5098624ebda06aab5c` |
| Cumulative prototype range | `3ff96bdea3e68a83cd5774c9b94b68d9cb292add...3920a3b1a57a349137ac7e5098624ebda06aab5c` |

The revision-3 content commit's parent is `d85002ce`, as required.

| Artifact | Range | Shortstat | Size | SHA-256 |
| --- | --- | --- | --- | --- |
| `.agent-review-pane-status-prototype-a-claude-rev3-focused.diff` | `d85002ce...3920a3b1` | **9 files, 689 insertions, 267 deletions** | **91,004 bytes** | `6fe5745583b7829dd720bdc3ad9f14e7a6b5052a904e9d278690fea0fa4e5e9e` |
| `.agent-review-pane-status-prototype-a-claude-rev3-cumulative.diff` | `3ff96bde...3920a3b1` | **26 files, 5,243 insertions, 10 deletions** | **309,470 bytes** | `555ee343928b62593b493e0c3d34710db92c2f58add76195f6014d9057cd8de6` |

**Every earlier artifact is preserved unchanged and still verifies at its recorded identity:**

| Artifact | Size | SHA-256 |
| --- | --- | --- |
| `.agent-review-pane-status-prototype-a-claude.diff` (rev 1) | 174,128 | `eaad43a22aeacfc7de79f234e3805e7aaf56dd75e2de11854e42d5936aa42f89` |
| `…-rev2-focused.diff` | 165,445 | `b8b5f644d1fc53f84beb6c7762c7968dbd7328de1374a0a6c622cee9242a64f7` |
| `…-rev2-cumulative.diff` | 280,014 | `3b3cb40fc1d5590479f7009af66f76934c48044f283e598d5b2566fc3e1683f3` |

**On the 267 deletions in the focused range** — they are: the replaced tripwire assertions and
comments (Low 1, Low 2), the reordered `interpretProbe` branch (Low 3), the two relabelled test
comment blocks (Low 5, Low 6), the superseded `2.1.220`-is-unsupported assertions, and the replaced
sections of the two documents. **No application behaviour was removed**; the only behavioural changes
are the three fixes in Low 2, Low 3 and Low 4, and the version-list addition.

Both created with `git diff --output` (never PowerShell redirection), gitignored via `.gitignore:33`,
regenerated from their stated ranges and proven **byte-identical** by `cmp`. `git diff --check` is
clean (exit 0) on both ranges.

---

## 13. Reviewer verdict

**None yet for revision 3** — stopped for a fresh independent **Full-class** review.

* Revision 1: **`VERDICT: FAIL`** (1 Critical, 3 High, 4 Medium, 3 Low).
* Revision 2: **`VERDICT: PASS`** (6 non-blocking Low), all six corrected here.

**Note on independence:** the reviewer who produced revision 2's `VERDICT: PASS` also performed
revision 3's corrective and runtime work, at Blue's direction. The next review must therefore be
carried out by a **different** reviewer for the independence requirement to hold.

## Review-diff rule

* Before merge, use `git diff main...<tip>`.
* After merge, reproduce with `git diff <recorded-pre-merge-main>...<tip>`.
* Always use `--output`; never PowerShell `>`.
* Retain the literal `VERDICT: PASS|FAIL` line and name the review that produced it.

---

**Experiment A is COMPLETE.** It was specified, built, reviewed twice, corrected twice, and finally
run inside the real application against the executable a pane actually launches.

* **Model turns: four consumed against three authorized** (§ 7). The overrun is unexplained and is
  recorded rather than smoothed over. No further turn may be spent without a new authorization.
* **Reporter provenance remains unresolved** — a negative security result and a production blocker.
* **The visible badge remains unconfirmed** (§ 6) — the weakest part of the prototype.
* **Production pane-status implementation remains unauthorized.**
* **Experiment B and app-server runtime testing remain unauthorized.**
* **Nothing was merged or pushed.**

**BLUE SUBSYSTEM VERDICT: PROTOTYPE**
