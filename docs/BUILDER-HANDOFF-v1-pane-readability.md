# Builder Handoff — V1a Pane Readability and Copy Repair

Branch: `feature/v1-pane-readability`
Fork-point / pre-merge main SHA: `f97b4e70e888a1e32689f0a0d9fe517d30401438` (verified equal on
`main` and `origin/main` before branching)
Tip SHA: implementation `51c0054`; Reviewer LOW-1 fix `546abd0`; this docs-only verdict
commit sits on top
Merge commit SHA: Pending human approval

Tier: STANDARD-CLASS — renderer-only pane layout, terminal-buffer reading, and clipboard
output through the existing bridge. No new IPC surface, no filesystem opening, no
credentials, permissions, cost controls, or security boundaries.

Intended invariant: every terminal pane — including Video Scout — is fully readable,
maximizable, scrollable, selectable, and safely copyable.

## What shipped

1. **`app/renderer/term-copy.js` (new, pure)** — Copy Output logic. Public xterm APIs
   only (`buffer.length`, `getLine(i)`, `line.isWrapped`,
   `line.translateToString(trimRight)`); no private internals patched or read.
   - Reconstruction walks the buffer BACKWARD from the newest row, regrouping wrapped
     physical rows into one logical line (rows that continue are taken untrimmed —
     wrap-boundary spaces are real text; only the final physical row is trimmed of
     never-written cell padding), preserving intentional blank lines, dropping only the
     never-written rows below the last output. It stops RETAINING lines once the
     1,000,000-character budget is met and keeps counting the rest, so availability is
     always known without materializing an unbounded string first (the xterm buffer is
     itself bounded by the unchanged `scrollback: 5000`).
   - Bound: newest 1,000,000 UTF-16 code units win; a cut inside a surrogate pair drops
     the orphan half (999,999 copied, never a broken character).
   - `resolveCopyRequest`: live pane-local selection → pointer-down snapshot →
     reconstruction. Selections are never truncated.
   - Privacy by construction: `buildCopyLogLine` is the only Logs producer and never
     receives the copied text — only pane ID, role, source, copied/available counts,
     truncated flag, or the failure reason.
2. **`app/renderer/pane-maximize.js` (new, pure)** — the maximize state machine.
   Mechanism is class toggling (`maximized` on the pane, `has-maximized` on the grid);
   styles.css hides siblings (hidden, NOT closed — PTYs keep running) and gives the
   maximized pane the whole grid content area with its header and controls visible.
   Exits: same control toggles back · Escape (consumed only when it acted; a second
   Esc reaches the PTY normally) · close-while-maximized restores the grid cleanly ·
   leaving the Terminals view auto-restores (state can never strand). Every transition
   fires one `onLayout`, where app.js reruns FitAddon + `cc.ptyResize` for every pane
   (long lines reflow; hidden panes no-op and refit on return) and restores focus
   predictably (maximized pane on maximize, same pane in the grid on restore).
3. **`app/renderer/agent-dom.js`** — `buildTermPane` now also builds the `⧉ Copy
   Output` and `⛶ Maximize` header buttons on the ONE safe construction path every
   pane type shares. No innerHTML anywhere; existing selector contracts preserved.
4. **`app/renderer/app.js`** — one shared Copy Output wiring inside
   `openInAppTerminal` (statically proven: single `.copy-out` wiring, no
   role-conditional branch — Video Scout goes through the same code); pointer-down
   snapshot identical in mechanism to the 🔊 button so a selection survives the header
   click; clipboard failures flash ⚠ + alert + FAILED Logs line (never a silent
   success); truncation raises the visible notice with copied/available counts;
   maximizer instantiation, capture-phase Escape listener, switchTab restore, and
   close-ordering (`handlePaneClosed` before `pane.remove()`).
5. **Marker `V1A ACCEPTANCE 2026-07-17.7`** — window title, Terminals-bar badge
   (`#audioBuild`, set from the same const), and startup Logs.
6. **Docs** — BLUE-HELM-MASTER-STATUS.md: V1a recorded separately from the deferred
   report reader; K2 marked ✅ RESOLVED by V1a with the original finding retained;
   Video Scout same-path statement; Open Report/OS dispatch deferral; V5b reader
   design (main-owned pane→run identity, shared PS manifest schema/validator, no JS
   duplicate).

## Exclusions honored

No dockview-core (R3 stays the later replacement). No Open Report, `shell.openPath`,
or OS dispatch. No run-directory/report-path resolution, no terminal-output parsing
for run IDs, no V5b reader. No new dependencies. No PowerShell changes (Pester
byte-identical). Scrollback unchanged at 5000 (tripwire-tested).

## Escape contract (deliberate, documented)

While a pane is maximized, Escape restores the grid and is CONSUMED (capture phase,
before xterm sees it); it does not also reach the PTY. To send a terminal ESC while
maximized: press Esc once (grid restores, focus stays on that pane), then Esc again.
Predictable two-step, per the work-order contract "the same control and Escape
restore the previous grid."

## Commands run and exact results (this tree)

- Baseline before any change (fresh worktree at `f97b4e7`): app **729 passed / 0
  failed** (summed across the 22-suite chain; two suites report "N assertions
  passed"), Pester **275 passed / 0 failed / 0 skipped** — both exactly as the work
  order expected.
- After implementation: app **814 passed / 0 failed** (729 baseline + 44 term-copy +
  36 pane-maximize + 5 new agent-dom assertions), Pester **275/0/0 byte-identical**.
  The reachability meta-test verifies both new suites are wired into
  `app/package.json` (they run 2nd and 3rd in the chain).

## Test coverage map (work-order gate → assertion)

Wrapped/unwrapped rows, blank lines, trailing padding, forward and reverse/mouse-mode
selections, native PowerShell selection, selection surviving a header click,
no-selection full-buffer copy, bound−1 / exact bound / bound+1 (real 1,000,000
constant), Unicode at the truncation boundary, privacy (no selected text in Logs,
metadata-only builder statically enforced), clipboard-failure visibility → 
`term-copy.test.js` (44). Maximize, Escape restore, close-while-maximized, view
switch, refit + PTY-resize + focus on every transition, CSS hidden-not-closed →
`pane-maximize.test.js` (36). Copy Output controls produced by the safe builder for
role- AND cli-badged panes → `agent-dom.test.js` (+5). Video Scout same-path →
static no-role-branch check + shared-builder assertions. Reachability → the existing
meta-test gates both new files by name.

## Known limitations

- The truncation notice and clipboard-failure surface use `alert()` (the app's
  established visible channel); both are rare events. The per-click feedback is the
  button flash (✓ / ⚠).
- The full-buffer reconstruction reads `term.buffer.active`: for alternate-screen
  TUIs (Claude/Codex/Gemini in full-screen mode) that is the visible alt screen —
  exactly what the pane shows; shell panes get the normal buffer plus all scrollback.
- `translateToString(false)` on wrapped continuation rows preserves wrap-boundary
  spaces by taking the full row; a program that deliberately printed trailing spaces
  at a physical row boundary is indistinguishable from padding on the FINAL row only
  (that row is trimmed) — standard xterm serialization behavior.

Unexpected pre-existing findings: none.

## Morning/human acceptance procedure (marker `V1A ACCEPTANCE 2026-07-17.7`)

The worktree build is left running (window title carries the marker; normal Desktop
shortcut untouched). Panes to cover: 1. PowerShell (+ Shell) · 2. normal Claude agent
· 3. a second interactive agent in mouse mode · 4. a real Video Scout pane with long
wrapped analysis output. For each: maximize + restore (button and Esc) · scroll
newest→oldest · select and copy a passage (Ctrl+C and header ⧉) · Copy Output with
no selection · paste elsewhere and verify order/wrapping/blank lines/Unicode · Logs
show only metadata · TTS + Dictate still work. Truncation: the buffer's character
capacity is ≈ 5,000 scrollback rows × columns, so the bound is only reachable when
the pane is WIDE — **maximize the PowerShell pane first** (>200 columns on any of
your monitors), then run `1..3000 | % { 'X' * 500 }` (fills the scrollback with full
rows; at ≥240 columns the buffer then holds ≥1.2M characters), then Copy Output with
no selection: expect the visible truncated notice with copied/available counts and a
`truncated=true` Logs line. No paid Video Scout run is needed to reach the bound.

## Review-diff rule

- Pinned diff: `git diff --output=.agent-review-v1-pane-readability.diff f97b4e7...<tip>`
  (three-dot from the recorded baseline; `--output`, never PowerShell `>`).
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it.

Reviewer verdict: `VERDICT: PASS`

Reviewer verdict source: Standard-class read-only Reviewer pass (fresh subagent), July 17,
2026, over the pinned whole diff `.agent-review-v1-pane-readability.diff`
(`f97b4e7...51c0054`) plus worktree source. All five mandated focus areas verified by
reading (buffer reconstruction + bound enforcement hand-traced against every test
vector · selection preservation + one-shared-path Video Scout routing · clipboard
privacy metadata-only-by-construction + visible failures · maximize/restore/resize
lifecycle across all exit paths · K2 documentation closure), plus the Escape contract
(two-press for maximized TUIs judged honest and acceptable), CRLF-safe static checks,
reachability wiring, and diff proportionality. Findings: LOW-1 (truncation notice
hardcoded Video-Scout wording for every pane type) — FIXED as prescribed in `546abd0`
and confirmed by a scoped delta review from the same Reviewer, `VERDICT: PASS`, no new
findings, no regressions. LOW-2 (recorded, accepted as-is): selection/snapshot copies
bypass the 1,000,000 bound by documented design — xterm has already materialized the
string, so the anti-materialization rationale does not apply. INFO-1: the bound counts
UTF-16 code units (matches every `s.length` log in the app; pairs never split).
INFO-2: the Escape two-press contract, documented above.
