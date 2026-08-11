# Builder Handoff — Pane-Status Experiment A (Claude Code hook reporter)

Branch: `feature/pane-status-prototype-a-claude`
Worktree: `.worktrees/pane-status-prototype-a-claude`
Fork-point SHA: `3ff96bdea3e68a83cd5774c9b94b68d9cb292add`
Pre-merge main SHA: `3ff96bdea3e68a83cd5774c9b94b68d9cb292add`
Reviewed tip: see § 9
Branch tip: see § 9
Merge commit SHA: Pending until merge

**Status: PROTOTYPE BUILT, GATED, TESTED, AND RUN LIVE — AWAITING INDEPENDENT FULL-CLASS REVIEW.
NOT MERGED, NOT PUSHED. PRODUCTION IMPLEMENTATION REMAINS UNAUTHORIZED.**

## 0. Procurement authority

Tracked record: **`docs/OSS-PROCUREMENT-pane-status.md`**. Blue's verdict, verbatim:

> BLUE SUBSYSTEM VERDICT: PROTOTYPE

This branch is **Experiment A only**: one provider (Claude Code), one pane, one temporary hook
reporter, one bounded display. Still unauthorized and untouched here: production specification or
implementation, permanent hook installation, multiple providers, multiple status-enabled panes,
**Experiment B**, any app-server listener / `codex --remote` / observer client, merge, and push.

The OSS research was not reopened and the § 10 recommendation was not changed.

Full evidence: **`docs/PROTOTYPE-EVIDENCE-pane-status-claude-hook.md`**.

## 1. Intended invariant

> When prototype mode is disabled, application behaviour and provider configuration are unchanged.
> When enabled, exactly one Claude pane may receive out-of-band status events carrying only
> `hook_event_name` and an app-generated ephemeral pane token.

The gate is `BLUE_HELM_PANE_STATUS_PROTOTYPE=1`, compared `=== '1'`.

**How "disabled means unchanged" is enforced** — by shape, not by a flag test.
`createPaneStatusPrototype()` returns a **different object** when the gate is off, whose `envForPane()`
returns `{}` unconditionally and which has no pipe, token, or listener behind it. A missed flag check
cannot leak because there is nothing to leak. Same posture as `preload.js`'s `ccDockview`.

## 2. Files changed

| Path | Change |
| --- | --- |
| `app/prototype-pane-status/pane-status-protocol.js` | **Added** — wire contract, event allowlist, state mapping, staleness, version gate |
| `app/prototype-pane-status/pane-status-store.js` | **Added** — token minting, single-pane enrolment, constant-time compare |
| `app/prototype-pane-status/pane-status-server.js` | **Added** — main-owned Windows named pipe, bounded framing |
| `app/prototype-pane-status/pane-status-reporter.js` | **Added** — the hook child |
| `app/prototype-pane-status/pane-status-settings.js` | **Added** — settings guard. **Not imported by the app** |
| `app/prototype-pane-status/pane-status-prototype.js` | **Added** — the single orchestrator `main.js` touches |
| `app/prototype-pane-status/pane-status-boundary.test.js` | **Added** — 135 assertions |
| `app/prototype-pane-status/pane-status-reporter.test.js` | **Added** — 106 assertions, real child + real pipe |
| `app/prototype-pane-status/run-experiment-a.js` | **Added** — builder-operated settings/listen runner |
| `app/prototype-pane-status/live-probe.js` | **Added** — builder-operated live probe |
| `app/renderer/pane-status-badge.js` | **Added** — IIFE badge module |
| `app/renderer/pane-status-badge.test.js` | **Added** — 42 assertions |
| `app/main.js` | Modified — require, gated construction, `envForPane` spread in `ptyEnv`, release on `pty-kill` |
| `app/preload.js` | Modified — one **receive-only** channel |
| `app/renderer/app.js` | Modified — badge construction + subscription |
| `app/renderer/index.html` | Modified — one script tag |
| `app/renderer/styles.css` | Modified — badge styles |
| `app/package.json` | Modified — three suites added to the gate chain |
| `app/launcher-fence-invariant.test.js` | Modified — **re-pinned, see § 4** |
| `app/dockview-default-path.test.js` | Modified — **re-pinned, see § 4** |

No dependency, lockfile, script, GitHub configuration, `AGENTS.md`, or PowerShell file changed. The
procurement record was **not** touched.

## 3. Security-sensitive surfaces

**Transport — a main-owned Windows named pipe.** Not terminal output (§ 8 threat 1: pane content can
forge anything a pane can print). Not TCP, not even loopback — creating a network listener is an
explicit kill criterion, and a loopback socket is reachable by every process on the machine. Unique
pipe name per app run. Bounds: 512 B/message, 4 KiB/connection, 4 messages/connection, 8 concurrent
connections, 5 s idle timeout.

**Token.** 32 CSPRNG bytes as hex, minted in main, held only in main's memory, delivered only into the
single enrolled pane's process environment. Never in argv, a log line, a file, the renderer, Claude's
settings, or a persistent user variable. **No `setx`.** Compared with `crypto.timingSafeEqual` on
length-checked buffers.

**Credential scrub.** `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` is unchanged and unweakened. The
fenced-role cwd gate in `pty-start` is **byte-for-byte identical** to the reviewed base.

**Renderer boundary.** One receive-only channel. No `invoke()` counterpart exists, so the renderer
cannot request status, enroll a pane, or reach the transport. The view object has exactly four fields
and no room for a token.

**Claude configuration.** The application has **no** authority to edit it: `main.js` does not import
the settings guard, and a test asserts that. The temporary change was made by a builder-operated
script with a proven byte-identical restore.

## 4. Two deliberate tripwires were re-pinned — read this first

Both exist to fail when someone changes a protected region, so a human decides. Both fired. Both are
re-pinned **with the old values retained in-file** and with new content assertions that survive any
future re-pin.

**`launcher-fence-invariant.test.js`** — pins `pty-start` regions by SHA-256.

| Region | Before | After | Why |
| --- | --- | --- | --- |
| fenced-role cwd gate | 1354 B / `ae9dce92…` | **1354 B / `ae9dce92…` — UNCHANGED** | Not touched at all |
| ptyEnv block | 213 B / `b83cd467…` | 236 B / `cd100743…` | One added spread: `...paneStatusEnv` |
| pty-start handler | 8714 B / `21c9ab2f…` | 9289 B / `abe919c4…` | That spread, its comment, and the line computing it |

The env is the **only** channel that can carry the pipe name and token to the hook child; argv, a file,
a persistent variable and terminal output are all forbidden. So `pty-start` had to change. New
assertions now check the *content* that matters — the scrub is present, is never set to a disabled
value, the video-scout key injection is still video-scout-scoped, and `main.js` never writes a literal
token — so a future re-pin cannot quietly drop the scrub along with the hash.

**`dockview-default-path.test.js`** — pinned `index.html` at exactly 21 `<script src>` tags; now 22.
The addition is named explicitly (`pane-status-badge.js`) and the file must still carry the procurement
verdict string, so a *further* extra script fails here rather than riding in on this bump.

## 5. Gates

| Gate | Result |
| --- | --- |
| App gate (`npm test`) | **exit 0 — 49 chain entries, 3,390 assertions passed, 0 failed** |
| Pester (`scripts\run-pester.ps1`) | **955 passed / 0 failed / 0 skipped** |
| `git diff --check` | clean |

**Assertion reconciliation** — counted per suite, not copied:

| Source | Δ |
| --- | --- |
| Baseline (pre-branch) | 3,099 |
| `pane-status-boundary` (new) | +135 |
| `pane-status-reporter` (new) | +106 |
| `pane-status-badge` (new) | +42 |
| `launcher-fence-invariant` 6 → 12 | +6 |
| `dockview-default-path` 371 → 373 | +2 |
| **Total** | **3,390** ✓ |

Chain entries 46 → 49. Pester is unchanged at 955 because no PowerShell file changed.

**A note on the worktree.** `git worktree add` does not copy the gitignored `app/node_modules`
junction, so it had to be recreated before the app gate could run — the same step recorded on the
V5c2b branch.

## 6. Runtime experiment — what happened

Two model turns were used of the three authorized, in disposable temp directories, with content-free
prompts ("Reply with exactly the word: ok").

* **Turn 1 (prototype pane).** `SessionStart → idle`, `UserPromptSubmit → working`, `Stop → turn
  ended`, `SessionEnd → exited`. 4 accepted, 0 refused. Delivery 1 ms (min/median/max, n=4).
* **Turn 2 (control).** A Claude session with **no** prototype variables, while the temporary hooks
  were installed: **0 connections, 0 events, no reporter output**, exit 0. Blue's own sessions were
  unaffected for the whole window.

**The decisive finding, and the one I most want a reviewer to look at.**
`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` did **not** block the hook child from inheriting the two
`BLUE_HELM_*` variables. The work order anticipated the opposite and told me to stop and report
blocked; that condition did not arise. But `main.js`'s own comments describe that flag as preventing
exactly this for hook commands, the official settings documentation does not list the flag at all, and
the hooks documentation states hooks inherit the parent environment with only `OTEL_*` excluded.

I am recording the narrow observation and **not** the broad conclusion: two `BLUE_HELM_*` variables
reached a hook child. I did not test credential-shaped variables, Bash tool calls, or MCP servers.
Any security reasoning resting on "hooks don't see the PTY environment" should be re-verified — as its
own bounded task, which is **not** authorized here. See § 5 of the evidence document.

**Settings.** Original 381 B / `b9f576bb…`, no `hooks` key. Patched (only `hooks` added, all five
existing keys preserved), experiment run, restored to **381 B / `b9f576bb…` exact**, `hooks` absent on
re-parse, recovery copy deleted only after restoration was proven.

**Not performed / unverified, stated plainly:** `Notification` (would need an interactive prompt I
cannot drive, and forcing it would mean weakening permissions), `StopFailure` (forbidden to
manufacture), and a **live Dockview drag** (no GUI automation hook — recorded as not performed, never
as passed or failed). Dockview identity is proven synthetically against the real module.

**No kill criterion fired** — all ten are enumerated with their outcome in § 10 of the evidence
document.

## 7. Recommended review focus

1. **§ 4's two re-pins.** Are they justified, and are the new content assertions strong enough?
2. **The privacy boundary.** `pane-status-reporter.js` builds a fresh object from one validated string
   plus its own token — verify no path copies, spreads, or stringifies the input.
3. **`envForPane()` in `pane-status-prototype.js`** — the only place a token leaves main.
4. **The inert object.** Confirm the gate-off path genuinely has nothing behind it.
5. **Wording.** `Stop` renders "turn ended". Assert nothing anywhere says finished/safe/exited-process.
6. **The § 6 environment finding** — is my narrow phrasing narrow enough?

## 8. Known limitations

* `Notification` and `StopFailure` unverified live; the live Dockview drag not performed.
* n = 4 latency samples, one session, idle machine.
* Exact-version pin (`2.1.196`); any other version degrades every pane to `unknown`.
* `STALE_MS = 120000` is an unvalidated experiment value, marked `(?)`.
* With `-NoExit` the PTY outlives the Claude process, so a pane can survive `SessionEnd`; the
  prototype shows `exited` and does not age it out. Whether that is right for production is undecided.
* The probe stands in for the Electron main process. It uses the real store, server and protocol, but
  no Electron instance was launched, which is why the live drag is unperformed.

## 9. Commits and review artifact

| Field | Value |
| --- | --- |
| **Reviewed tip** | `bf66fb3b9fad080d1ff92ed0815034e525a75740` |
| Branch tip | the handoff-only tail commit below |
| Cumulative range | `3ff96bdea3e68a83cd5774c9b94b68d9cb292add...bf66fb3b9fad080d1ff92ed0815034e525a75740` |
| Artifact | `.agent-review-pane-status-prototype-a-claude.diff` |
| Shortstat | **22 files, 3,127 insertions, 7 deletions** |
| Size | **174,128 bytes** |
| SHA-256 | `eaad43a22aeacfc7de79f234e3805e7aaf56dd75e2de11854e42d5936aa42f89` |

Created with `git diff --output` (never PowerShell redirection), gitignored via `.gitignore:33`,
regenerated from its stated range inside this worktree and proven **byte-identical**, with the
regeneration copy removed behind a filename-pattern guard. `git diff --check` is clean on the range.

**Only 7 deletions across the whole branch**, and they are worth checking directly: they are the two
re-pinned tripwire assertions (§ 4) and the lines they replaced. No existing behaviour was removed.

## 10. Reviewer verdict

**None yet** — stopped for a fresh independent **Full-class** review.

## Review-diff rule

* Before merge, use `git diff main...<tip>`.
* After merge, reproduce with `git diff <recorded-pre-merge-main>...<tip>`.
* Always use `--output`; never PowerShell `>`.
* Retain the literal `VERDICT: PASS|FAIL` line and name the review that produced it.

---

**Authorized and performed:** bounded Experiment A — one Claude provider, one pane, a temporary
reversible hook installation, and a bounded prototype display.

**Not authorized, and not done:** production specification or implementation, permanent hook
installation, a second provider, a second status-enabled pane, Experiment B, any app-server listener /
`codex --remote` / observer client, merge, and push.

**BLUE SUBSYSTEM VERDICT: PROTOTYPE**
