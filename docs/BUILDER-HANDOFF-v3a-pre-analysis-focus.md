# Builder Handoff — V3a Video Scout pre-analysis focus

Branch: `feature/v3a-pre-analysis-focus`
Fork-point SHA: `0b867649dfb5ab8b166c7212a288cd26f5fd00ae`
Pre-merge main SHA: `0b867649dfb5ab8b166c7212a288cd26f5fd00ae` (verified `main` == `origin/main` == this SHA before branching)
Tip SHA: reviewed **code** tip `3fefd09` (base implementation `bd6b92c` + the privacy delta `3fefd09`;
handoff/verdict docs commits interleave but change no reviewed code)
Merge commit SHA: `9641de3066d471452dad40042a32968652e82f68`

Intended invariant:
An optional user-supplied "Analysis focus / instructions" value AUGMENTS the mode's existing default
analysis brief and never replaces the required report structure, bypasses a cost/duration guard,
creates a second provider request, or is interpreted as shell syntax. The focus is bounded, normalized,
and validated at every hop (renderer for feedback, main as the enforcement boundary, feed-gemini.ps1
independently as a standalone entry point), and it always rides as ONE discrete argv element so
metacharacter-shaped content stays literal prompt data.

Gate tier: **Standard-class.** Blast-radius rationale: adds bounded prompt DATA to the existing Video
Scout discrete-argument path. No new IPC handler, credential boundary, filesystem authority, deletion
path, duration/cost guard, or provider call. Worst-case failure is a refused launch or a differently
composed prompt — both recoverable and testable.

Files changed (11; no `app/main.js`, no `app/preload.js`):
- `app/renderer/analysis-focus.js` (NEW) — shared dual browser-`<script>`/CommonJS normalizer/validator
  (`normalizeAnalysisFocus`, `analysisFocusRejectionMessage`, `MAX_ANALYSIS_FOCUS_CHARS = 2000`).
- `app/renderer/analysis-focus.test.js` (NEW, 37) — the shared-validator contract.
- `app/video-scout-args.js` — requires the shared validator; validates `analysisFocus`; pushes
  `-AnalysisFocus <normalized>` or sets `error` (refuse); logs a char COUNT only.
- `app/video-scout-args.test.js` — added focus argv-literal / refusal / normalization / unicode tests.
- `app/renderer/app.js` — modal textarea handler + live `N / 2000` counter (`updateAnalysisFocusCounter`),
  reset-on-open, inline refusal in `createAgent`, and `analysisFocus` in the `ptyStart` passthrough.
- `app/renderer/index.html` — the `#analysisFocusInput` textarea, `#analysisFocusError`,
  `#analysisFocusCounter`, and the `analysis-focus.js` `<script>` tag.
- `scripts/lib/get-analysis-focus.ps1` (NEW) — independent `Get-NormalizedAnalysisFocus` +
  `Add-AnalysisFocusToPrompt` (report-structure-preservation instruction BEFORE the delimited focus).
- `scripts/lib/get-analysis-focus.Tests.ps1` (NEW) — helper unit tests.
- `scripts/feed-gemini.ps1` — `-AnalysisFocus` param; independent validation before any spend; compose
  on the CLI path (before flatten/escape) and the SDK path (base = default brief or explicit `-Prompt`
  → existing `--prompt-text`; no focus ⇒ `--prompt-file` unchanged). **Privacy delta (`3fefd09`):** the
  `-NoFeed` and "Gemini CLI not found" fallback branches OMIT the deferred `gemini -p "<prompt> …"`
  command when a focus is present (it would embed the focus) and print a metadata-safe notice instead;
  with no focus both branches are byte-for-byte unchanged.
- `scripts/feed-gemini-analysis-focus.Tests.ps1` (NEW) — behavioral `-NoFeed` wiring + source invariants.
- `app/package.json` — wired `node renderer/analysis-focus.test.js` into `npm test`.

Security-sensitive surfaces touched:
- **Fence gate: NOT touched.** `app/main.js` is unmodified. `buildVideoScoutArgs(opts)` already
  receives the full IPC payload and its `error` already drives the visible refusal — and that call
  sits entirely AFTER the fenced-role cwd gate (`app/main.js:634-660`: `FENCED_ROLES` check,
  `!opts.videoScout` guard, `realOrNearest`, `outputsRoot`, containment/refusal). Focus flows through
  the existing `opts` object into `buildVideoScoutArgs`; nothing was reordered, extracted, or added in
  or around the gate. Change sits strictly inside the additive validation of the existing
  `if (opts.videoScout)` launch branch (via the dependency-free helper it already calls).
- Untrusted IPC value: validated independently in the main process (`video-scout-args.js`) — a
  bypassed/modified renderer calling `pty-start` directly still hits it — and again in
  `feed-gemini.ps1` (documented standalone entry point).
- No shell string is ever built from the focus; it is one discrete argv element.

Commands run:
- `cd app && npm test` → all node suites pass, **0 failed (exit 0)**. Reachability meta green
  (32 `*.test.js` discovered; the new `renderer/analysis-focus.test.js` is wired).
- `powershell.exe -NoProfile -File scripts\run-pester.ps1` → **571 passed / 0 failed / 0 skipped**
  (`get-analysis-focus.Tests.ps1` + the privacy-aware `feed-gemini-analysis-focus.Tests.ps1`).
  (`pwsh` unavailable; used the Windows PowerShell 5.1 absolute executable per the work order.)

Exact test results:
- App node gate: 0 failed, exit 0 (new `analysis-focus` suite 37; `video-scout-args` extended: focus
  rides as one literal argv value; blank omitted; 2001 refused without truncation; non-string/control
  refused; unicode/metacharacters preserved; absent focus adds nothing).
- Pester gate: 571/0/0. New suites cover: null/blank ⇒ not-set; CRLF/CR/LF/tab → space; trim; exactly
  2000 accepted; 2001 throws (never truncated); C0/DEL throw; unicode + metacharacters preserved;
  composition keeps the base intact with the preservation instruction BEFORE the focus; `-NoFeed`
  transcript path composes on focus and leaves the base brief unchanged without it; the focus text is
  never written to the manifest; only a `chars=<N>` metadata line is logged; source invariants: exactly
  one `-AnalysisFocus` param, one SDK `& node $sdkScript` site, two `Assert-DurationGuard -Url` sites
  (unchanged), and no raw-focus `Write-Host`.

Human live acceptance: **PASS (July 23, 2026).** Blue fully restarted Electron and confirmed the
focus field appears only for Video Scout and clears on reopen; one short captioned transcript analysis
with a distinctive harmless focus still began exactly with `## 1. TL;DR` and meaningfully followed the
focus; the Logs tab showed only focus metadata/count and never the text; Library Open Report worked;
the manifest completed normally; and exactly one provider analysis occurred. Blue then performed the
human `--no-ff` merge, re-ran the merged-main gates (app **997/0**, Pester **571/0/0**), and pushed
`main` at `9641de3066d471452dad40042a32968652e82f68`.

Known limitations:
- The live `N / 2000` counter counts the NORMALIZED length; the textarea has a generous `maxlength=4000`
  raw-paste bound (well above 2000 so the over-limit refusal path stays reachable) — the real cap is the
  2000-unit validation, which refuses (never truncates).
- SDK-route composition is asserted at SOURCE level (one `& node $sdkScript` site; base=brief-or-Prompt
  → `--prompt-text`; `--prompt-file` retained when no focus) rather than by executing the real node/
  provider path — the same scope discipline the transcript-prompt suite uses for modes it does not run.

Unexpected pre-existing findings: none introduced. (An IDE linter flagged `$usageLine` "assigned but
never used" at `feed-gemini.ps1` in the SDK capture — pre-existing and a false positive; it is consumed
later by `ConvertFrom-VideoScoutUsageLine -Lines $usageLine`. Not touched by V3a.)

Recommended review focus:
- Main independently enforces the 2000-unit bound and rejects non-string/C0/DEL (a bypassed renderer
  still refuses); focus is never truncated.
- Focus remains ONE literal argv value; no shell string is constructed anywhere.
- Prompt composition preserves the required report structure (preservation instruction before the
  delimited focus) on both the CLI and SDK routes.
- No second paid call; no duration/model/mode/range/manifest/cleanup change.
- No focus content reaches the Logs tab or the manifest (only a char count).
- The fenced-role cwd gate in `app/main.js` is untouched (file unmodified).
- No out-of-scope changes (no Q&A, multi-slice, budget, schema, retention, or credential work).

Review diff:
`git diff 0b867649...3fefd09 --output=.agent-review-v3a-pre-analysis-focus.diff`
(full pinned diff hash `e69ff0fb…`, 71247 bytes; delta range for the privacy fix is `bd6b92c...3fefd09`.)

Reviewer verdict: `VERDICT: PASS` (base) · `VERDICT: PASS` (privacy delta)

Reviewer verdict source:
- **Base** — scoped Standard-class read-only review over `0b867649...bd6b92c` (2026-07-22). All ten
  checklist invariants verified at the main boundary; no CRITICAL/HIGH/MEDIUM findings. It raised one
  LOW: the `-NoFeed` and "Gemini CLI not found" fallback branches echoed the deferred
  `gemini -p "<prompt> …"` command, which with a focus present contains the composed focus.
- **Privacy delta** — scoped Standard-class read-only review over `bd6b92c...3fefd09` (2026-07-23),
  `VERDICT: PASS`, **no findings at any severity**. The LOW is now FIXED: both fallback branches OMIT
  the deferred command when `$normalizedFocus` is set and print a metadata-safe notice; the no-focus
  path is byte-for-byte unchanged; a distinctive sentinel focus is proven absent from BOTH the `-NoFeed`
  and CLI-missing outputs (the CLI-missing branch is reachable from an app-launched run when the Gemini
  CLI is unavailable); the CLI-missing test harness uses a LOCAL `Get-Command` shadow that cannot leak.

## Review-diff rule

- Before merge, use `git diff main...3fefd09` (equivalently the immutable `0b867649...3fefd09`); the
  privacy delta alone is `bd6b92c...3fefd09`.
- After merge, reproduce the reviewed delta with `git diff <recorded-pre-merge-main>...3fefd09`
  (`git diff main...3fefd09` may be empty once the tip is an ancestor of `main`).
- Always use `--output`; do not use PowerShell `>` for pinned review diffs.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it.

Pinned `.agent-review-*.diff` files are local review artifacts and must remain gitignored.
