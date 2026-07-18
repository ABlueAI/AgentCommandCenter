# Builder Handoff — V1a Pane Readability and Copy Repair

Branch: `feature/v1-pane-readability`
Fork-point / pre-merge main SHA: `f97b4e70e888a1e32689f0a0d9fe517d30401438` (verified equal on
`main` and `origin/main` before branching)
Tip SHA: implementation `51c0054`; Reviewer LOW-1 fix `546abd0`; verdict docs `2c0f0aa`;
launch-blocker IIFE fix `c5dda88`; verdict docs `e46a783`; universal-bound correction
`3f09d90`; verdict docs `51dc6a4`; clipboard IPC-boundary repair `386b0c2` (Full-class);
this final docs commit sits on top
Merge commit SHA: Pending human approval

Tier: STANDARD-CLASS for the pane readability/copy/maximize work — BUT the clipboard
bridge hunks (`386b0c2`) are a FULL-CLASS security-boundary delta: they move an OS
capability (the system clipboard) from the sandboxed preload into main behind bounded,
sender-validated IPC. See the dedicated section below.

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
     reconstruction. EVERY source is subject to the bound — selections included
     (Blue's correction: no clipboard path may be unbounded). `applyCopyBound`
     applies the identical newest-wins, surrogate-safe cut to selection/snapshot
     strings; at or below the limit a selection is copied byte-identically.
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
- Final (after the LOW-1 fix, the IIFE launch-blocker fix, Blue's universal-bound
  correction, and the Full-class clipboard IPC boundary): app **875 passed / 0 failed**
  (824 + 21 clipboard-ipc + 30 clipboard-consumer), Pester **275/0/0 byte-identical**.
  The reachability meta-test verifies every new suite is wired into `app/package.json`.
- Real-renderer boot proof: the acceptance build launches to the
  `Blue Helm — V1A CLIPBOARD ACCEPTANCE 2026-07-18.8` window title with zero Uncaught
  errors, and the CDP clipboard round-trip (above) passes against the running build.

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

## Clipboard IPC security boundary (Full-class delta, `386b0c2`)

Live acceptance surfaced `Cannot read properties of undefined (reading 'writeText')`:
under the sandboxed Electron 42 preload the `clipboard` module is undefined, so
preload's direct `clipboard.readText/writeText` crashed on EVERY copy/paste — global,
not Video Scout-specific. The clipboard is an OS capability reachable from a renderer
that also hosts hostile terminal bytes, so the repair is a bounded IPC boundary, not a
wider preload surface, and is reviewed Full-class.

- **`app/clipboard-ipc.js` (new, pure — no Electron import).** main injects the real
  `clipboard`, the canonical `ENTRY_URL`, and the trusted-window getter (the same
  late-binding K8's media-permission-policy uses). Every request is served ONLY when,
  fail-closed in order: (1) the trusted window exists and is not destroyed; (2)
  `event.sender` IS that window's `webContents`; (3) `event.senderFrame` IS that
  webContents' MAIN frame (never a subframe); (4) `senderFrame.url` IS the exact
  `ENTRY_URL`. Accepts only strings; enforces the **1,000,000-char hard limit on both
  reads and writes** at the boundary; returns structured `{ ok, text?, error? }`;
  refusals carry a bounded reason constant only and NEVER clipboard content. A
  torn-down frame (throwing `.url` getter) degrades to a refusal, never a main throw.
- **`app/main.js`** imports Electron `clipboard` (main only), builds the handlers with
  the K8 anchors, and registers `clipboard-read` / `clipboard-write`. Refusals go to
  console + the Logs channel.
- **`app/preload.js`** no longer destructures `clipboard`; `clipboardRead` /
  `clipboardWrite` are `ipcRenderer.invoke` wrappers only. No `navigator.clipboard`, no
  direct OS access. `contextIsolation`/`nodeIntegration` unchanged; K8 untouched.
- **`app/renderer/clipboard-consumer.js` (new, pure, IIFE-wrapped)** holds the async
  consumer logic: success reported ONLY after the IPC resolves `{ ok:true }`; a
  rejection or `{ ok:false }` refuses visibly (metadata-only Logs) and never throws; a
  FAILED read returns `null` so it can never be pasted; char counts logged, never
  content. **`app/renderer/app.js`** routes ALL five consumers through it — Copy Output
  awaits `clip.writeText` and flashes success only inside the resolved `.then`;
  Ctrl+C / Ctrl+Shift+C, right-click copy/paste, Ctrl+V, and OSC 52 are fire-and-forget
  with trailing `.catch` (no unhandled rejection). Copy Output keeps the universal
  1,000,000-char bound + metadata-only Logs.
- **Tests:** `app/clipboard-ipc.test.js` (21) and `app/renderer/clipboard-consumer.test.js`
  (30) — the actual exported handlers/consumer, plus static wiring checks. Both wired
  into `app/package.json`.
- **Runtime proof (CDP probe against the real Electron 42 build, no source changes):**
  trusted main-frame write → `{ok:true}`, read → `{ok:true,text:<marker>}` with
  ROUNDTRIP MATCH true (the `senderFrame === mainFrame` identity that unit tests can't
  prove holds at runtime), over-limit → `payload-exceeds-limit`, non-string →
  `non-string-payload`. App boots clean, zero uncaught console errors.

## In-flight defect found by launching (worth remembering)

The first acceptance-build launch died at load: classic renderer `<script>` files
share ONE global scope, and both new modules declared a top-level `const api` that
collided with agent-dom.js's (`Uncaught SyntaxError: Identifier 'api' has already
been declared`), leaving `window.ccPaneMaximize` undefined and app.js dead — while
all 818 node assertions were green, because CommonJS gives each test file its own
module scope. Fixed in `c5dda88` by wrapping both modules in the
`((global) => { ... })` IIFE pattern the three newest renderer modules already use
(logic byte-identical, confirmed by delta review), and a static tripwire in BOTH
suites now fails the gate if the wrapper is ever removed or a top-level `const api`
reappears. Lesson recorded: a new classic renderer module is not "loaded" until the
real renderer has booted it — node suites cannot prove shared-scope safety.

## Human retest — CLIPBOARD ONLY (marker `V1A CLIPBOARD ACCEPTANCE 2026-07-18.8`)

The clipboard repair is the only thing that needs a human retest — the previously
passed maximize/readability tests do NOT need repeating. The worktree build is left
running (window title carries the marker; normal Desktop shortcut untouched). Steps:
1. **Copy Output from PowerShell** — click ⧉ with no selection; expect the ✓ flash and
   a metadata-only `[copy-output …]` Logs line.
2. **Copy Output from a real Video Scout pane** — same, on a pane with long analysis
   output (proves the same path serves the Gemini pane).
3. **Selected-text Ctrl+C** — select a passage, Ctrl+C, paste elsewhere; verify the
   text arrives.
4. **Ctrl+V paste** — copy a known string in another app, click into a harmless
   PowerShell prompt in a pane, Ctrl+V; verify it types in.
5. **Logs privacy** — confirm no copied/selected text appears anywhere in the Logs tab
   (only counts, pane id, role, source, truncated flag).

Already machine-verified so you don't have to chase it: the CDP round-trip proved the
trusted main-frame read/write path works in the real Electron 42 build, and the
over-limit/non-string refusals fire at the main boundary.

### Prior (readability/maximize) acceptance procedure — for reference, NOT required again

Panes: PowerShell · normal Claude agent · a second agent in mouse mode · a real Video
Scout pane. For each: maximize + restore (button and Esc) · scroll newest→oldest ·
select/copy a passage · Copy Output with no selection · paste and verify
order/wrapping/blank lines/Unicode · Logs metadata only · TTS + Dictate still work.
Truncation drill: **maximize the PowerShell pane first** (>200 columns), run
`1..3000 | % { 'X' * 500 }`, then Copy Output with no selection → expect the truncated
notice with copied/available counts and a `truncated=true` Logs line.

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
findings, no regressions. LOW-2 — SUPERSEDED BY BLUE'S CORRECTION (July 17): the
selection exemption from the bound was rejected as an unbounded clipboard operation
regardless of the LOW rating; the bound is now universal (commit `3f09d90`), closing
LOW-2 with the stronger invariant. INFO-1: the bound counts UTF-16 code units (matches
every `s.length` log in the app; pairs never split). INFO-2: the Escape two-press
contract, documented above.

Second delta review (same Reviewer), July 17, 2026, over the launch-blocker fix
`c5dda88`: wrapped bodies confirmed logic-identical line-for-line (bound enforcement,
surrogate safety, privacy-by-construction, maximize state machine all unchanged),
browser/CJS dual export correct under context isolation, tripwires judged to
genuinely close the collision class. `VERDICT: PASS`.

Third delta review (same Reviewer), July 17, 2026, over the universal-bound correction
`3f09d90`: applyCopyBound's cut rule confirmed identical to the buffer path's
(newest-wins slice, surrogate-orphan drop, count semantics); at-or-below-limit
selections byte-identical to pre-fix; `reconstructBufferText` and the buffer branch
byte-for-byte unchanged per the directive; privacy holds on the new truncation path
(metadata-only Logs, counts-only notice); tests exercise the exported functions at the
real 1,000,000 constant with a throwing reconstruct stub proving the buffer is never
touched. `VERDICT: PASS`.
