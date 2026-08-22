# Builder Handoff — Dockview Maximize Gate Blocker

Branch: `fix/dockview-maximize-gate`

Fork point and pre-merge `main`: `8ec8b78e77511a2be50ba3e0bf26d5015cbda5c6`

Reviewed content tip: the content commit containing this section. A commit cannot contain its
own identity, so its exact SHA is recorded in the external review packet.

Merge commit: pending. Push: unauthorized. Nothing merged or pushed.

## Classification and invariant

**Standard-class.** One recoverable layout/test invariant. No credential, security, destructive,
or cost-direction boundary is touched. No dependency or lockfile change.

Intended invariant: maximizing a Dockview-owned pane visibly gives it the available Dockview
surface, collapses its sibling without closing either PTY, and restores the previous geometry
exactly — and **the gate observes settled geometry rather than depending on an arbitrary delay.**

## Diagnosis

**Symptom.** In the full app gate on baseline `8ec8b78e`, segment 15
`dockview-app-integration.test.js` failed one assertion, `290 passed, 1 failed`, exit 1:

```
✗ FAIL: the maximized pane grew to the whole surface (100 -> 100)
```

**The measurement, not the product, was wrong — verdict B.**

Geometry captured for the surface, both groups, both panel hosts, and both panes across the
before / maximized / restored phases:

| Phase | `#terminalDock` | Dockview surface | host pty1 | host pty2 | pane pty1 | pane pty2 |
| --- | --- | --- | --- | --- | --- | --- |
| before | 1016 | 1016 | 508 | 508 | 508 | 508 |
| maximized | 1016 | 1016 | 1016 | 0 | **1016** | 1 |
| restored | 1016 | 1016 | 508 | 508 | 508 | 508 |

Shipped behavior is correct: the pane takes the whole surface, the sibling collapses, and the
restore is exact. `app/renderer/dockview-prototype.js` was therefore **not** changed.

**Mechanism, reproduced deliberately.** Forcing `#terminalDock` to zero width reproduces the
recorded signature exactly:

| Forced state | `#terminalDock` | Dockview surface | host pty1 | host pty2 | pane pty1 | pane pty2 |
| --- | --- | --- | --- | --- | --- | --- |
| healthy | 1016 | 1016 | 508 | 508 | 508 | 508 |
| **collapsed** | **0** | **100** | **100** | **100** | **100** | **100** |
| recovered | 1016 | 1016 | 508 | 508 | 508 | 508 |

When the dock has no width, Dockview reports a clamped **100px placeholder** for the surface and
for every group. Both panes then read 100, and `maximized.w > before.w` compares the placeholder
with itself. The sibling still collapses to 1, which is why exactly one assertion failed and the
neighbouring collapse assertion passed with `100 -> 1` — the recorded full-gate values.

**Why the gate sampled an unlaid-out surface.** `window.__cc.settled()` only greps the renderer
log for `production layout engine active`; it asserts nothing about geometry. The maximize
scenario then relied on fixed `sleep(300)` / `sleep(350)` delays. A log line plus a delay does
not prove layout. Under full-chain load the surface had not been laid out when the scenario
measured.

**Reproduction is load-dependent, and this is stated as a limit.** The failure did not reproduce
in five targeted attempts on this host: `--only=maximize`, `--only=library,maximize`, the whole
scenario prefix through `maximize`, and segment 15 standalone (`291 passed, 0 failed`) all
passed. The causal chain above rests on the forced-collapse reproduction of the exact signature,
not on an on-demand reproduction of the original timing.

## Correction

Test synchronization and measurement only. No product change.

**`app/dockview-app-harness.js`**

- `window.__cc.dockSurface()` — reports the Dockview surface element **and** the container that
  gives it width, because a surface narrower than its container has not been laid out.
- `window.__cc.stableGeometry(pred, ms)` — waits for the caller's **observable Dockview state**,
  for the surface to have real width that fills its container, and for **two consecutive frames
  to measure identically**. Returns `ok:false` rather than guessing, so callers fail visibly.
- `scenarioMaximize` — the three fixed measurement sleeps are replaced by `stableGeometry` waits
  keyed on observable state: `groups.length === 2` after the split, `hasMaximizedGroup() === true`
  after the maximize click, `=== false` after the restore click. Each phase reports
  `geometrySettled`, `settleReads`, and the surface.

**`app/dockview-app-integration.test.js`**

The whole-surface requirement is **strengthened, not weakened**. `maximized.w > before.w` is
replaced by `maximized.w === surface.w` — occupying the whole surface, not merely more pixels
than before — plus:

- geometry settled before measuring, after maximizing, and after restoring;
- the surface fills its container, so it is a real layout and not the clamp;
- the pane genuinely shared the surface beforehand (`before.w < surface.w`).

No fixed sleep was lengthened, no retry loop wraps an assertion, no `>=` was substituted, and the
whole-surface requirement was neither weakened nor deleted. Sibling collapse, exact restore,
glyph truth, classic-grid non-involvement, and zero PTY close/restart are all preserved
unchanged.

**Negative control.** With the dock forced to zero width the new gate refuses to treat the
reading as a measurement: `geometrySettled=false` after 551 reads, failing visibly on a named
assertion instead of silently comparing `100 > 100`.

## Gates

| Gate | Result |
| --- | --- |
| Focused Dockview integration suite | `dockview-app-integration: 296 passed, 0 failed`, exit 0 |
| `dockview-package-identity` | 47 passed, 0 failed, exit 0 |
| `dockview-layout-policy` | 182 passed, 0 failed, exit 0 |
| `dockview-layout-store` | 134 passed, 0 failed, exit 0 |
| `dockview-default-path` | 380 passed, 0 failed, exit 0 |
| `renderer/dockview-fit-policy` | 59 passed, 0 failed, exit 0 |
| **Complete app gate** | **exit 0 — 67 suites, 4,893 assertions, 0 failures** |

Segment 14 `dockview-bootstrap: 203 passed, 0 failed`. Segment 15
`dockview-app-integration: 296 passed, 0 failed`. Each gate was run once; no repetition campaign.

**Assertion count: 4,893, not 4,888.** The acceptance criterion named 4,888. The correction adds
five assertions (three settled-geometry checks, the surface-fills-container check, and the
shared-surface precondition) and replaces the growth assertion one-for-one, so segment 15 moves
from 291 to 296 and the total moves by exactly `+5`. Counts reconcile across all three summary
formats: 65 suites in `N passed, M failed`, 2 in `N assertions passed`, 4,875 + 18 = 4,893.

## Track B disposition

**RESOLVED, on its own evidence, as a gate measurement defect — not a product defect.** Track B
was previously unobservable only because the `&&` chain aborted at segment 14; with segment 14
passing it ran and reproduced its recorded symptom, which is now diagnosed and corrected.

Track A, AGR-1, and AGR-2 are **untouched**. No common cause is claimed or implied between the
tracks; Track A passing while Track B failed in the same run is evidence they are independent.
AGR-1's double-report parse defect remains OPEN and latent — it is unobservable while the
bootstrap harness emits a single report. AGR-2 remains unexplained: the green-versus-failing
transition has now been seen in both directions on identical `app` trees, and one green full
chain does not close it.

## Scope

Changed: `app/dockview-app-harness.js`, `app/dockview-app-integration.test.js`,
`docs/AUDIT-app-gate-reliability.md` (minimal Track B status note), and this handoff.

Not touched: `dockview-bootstrap` / Track A, AGR-1, AGR-2, test-runner accounting, pane status,
dependencies or lockfiles, `app/renderer/dockview-prototype.js`, and unrelated Dockview behavior.

## Review and closeout

One independent scoped Standard review over the complete branch. The verdict is recorded in the
**merge commit message**; no verdict-tail commit is authorized on this branch, and no separate
documentation-closeout branch is planned. Exploratory A/B and diagnostic logs live in the session
scratchpad and need no separate archival.
