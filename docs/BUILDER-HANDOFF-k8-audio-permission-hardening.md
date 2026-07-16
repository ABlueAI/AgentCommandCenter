# Builder Handoff — K8 Audio Permission Hardening

Branch: `feature/k8-audio-permission-hardening`
Fork-point SHA: `a02c17b`
Pre-merge main SHA: `a02c17b` (local == origin/main, verified before branching)
Tip SHA: implementation `df53aa5`; this docs-only handoff commit sits on top
(verify at gate time with `git rev-parse feature/k8-audio-permission-hardening`)
Merge commit SHA: Pending human live proof and merge

Intended invariant: Blue Helm grants media permission only when the current trusted
application window's main frame requests microphone-only access from the exact trusted
application entry document. Everything else — camera, mixed audio/video, unknown or
missing media types, foreign documents/origins, subframes, wrong/null/destroyed
WebContents, and every non-media permission — is denied fail-closed, and the refusal is
visible without disclosing user content.

Concrete defect fixed: `app/main.js` granted on the permission NAME alone
(`perm === 'media' || perm === 'audioCapture'`), proving nothing about the requester,
document, frame, or media types, and denying silently. `audioCapture` is not in
Electron 42's request-handler permission union; the legacy allowance is removed (no
runtime evidence for it appeared — the real dictation path requests `media`).

Files changed (implementation commit `df53aa5`):

- `app/media-permission-policy.js` (NEW) — one pure, dependency-free CJS policy
  (nav-guard.js pattern). Shared `assessRequester` feeds BOTH deciders so request and
  check cannot disagree on the same security facts; `createMediaPermissionHandlers`
  returns the exact adapter pair main.js installs; the request callback is answered
  exactly once on every path (including internal-error → `policy-error`, fail closed);
  refusal reasons are bounded constants only.
- `app/media-permission-policy.test.js` (NEW) — 106 assertions; in the `npm test` gate.
- `app/main.js` — `ENTRY_PATH`/`ENTRY_URL` hoisted to ONE canonical module-scope
  definition shared by `win.loadFile()`, the navigation lockdown, and the permission
  policy; the two name-only handlers replaced by the policy pair; refusals go to
  `console.error` + the existing `main-error` → Logs channel. Nothing else in main.js
  touched (no navigation, preload, IPC, CSP, sandboxing, or credential changes).
- `app/package.json` — new suite appended to `npm test`.
- `app/renderer/app.js`, `app/renderer/index.html` — acceptance marker only:
  `K8 ACCEPTANCE 2026-07-16.5` (window title, control strip, startup Logs line).

Security-sensitive surfaces touched: exactly one — Electron's session media-permission
boundary (`setPermissionRequestHandler` / `setPermissionCheckHandler`). That is the K8
scope. The four Day-0 security modules (nav-guard, launchers, task-name, agent-dom) are
untouched; renderer audio engines (TTS/STT) are untouched.

Runtime origin/URL facts established (bounded one-time probe, Electron 42.5.0, deleted
before the implementation commit per the approved corrections; metadata only — no
audio, transcripts, or device labels were recorded):

- The trusted probe was forced through BOTH handlers: the check handler logged its
  metadata and returned FALSE for it, after which the request handler provably fired
  and granted only that one audio-only request; the real
  `getUserMedia(MIC_CONSTRAINTS)` stream then delivered an audio track. Denying checks
  does NOT block getUserMedia (request handler governs access).
- Request handler for the trusted mic call: `requestingUrl` equals
  `pathToFileURL(entryPath).toString()` EXACTLY (drive-letter case and encoding
  intact); `securityOrigin === 'file:///'`; `isMainFrame: true`;
  `mediaTypes: ['audio']`; fired exactly once per getUserMedia call.
- Chromium fires AUTOMATIC media checks at page load (`video` then `audio`) with EMPTY
  `requestingOrigin`/`requestingUrl` — denied fail-closed by the policy; this is why
  denied-check logging is latched (first occurrence per reason+mediaKind per session,
  a Set, no time-window state) — otherwise every launch floods Logs.
- Page-initiated checks report `requestingOrigin 'file:///'` + the exact entry URL;
  `details.securityOrigin` is sometimes ABSENT even on otherwise-trusted audio checks
  (denied fail-closed — no functional impact, proven live); `embeddingOrigin` is
  populated even for MAIN-frame checks (either `'file:///'` or the entry URL itself),
  contradicting the d.ts "subframe-only" comment — so it denies only on a foreign
  value, never on mere presence.
- `navigator.permissions.query({name:'microphone'})` (optional evidence only): routes
  through the check handler WITHOUT `mediaType` → denied `media-type-missing` → the
  API reports 'denied'. No app code calls `permissions.query` (grepped), so nothing
  depends on it.
- WHATWG URL is useless for the origin (`new URL(fileUrl).origin === 'null'`); the
  policy derives trust from the runtime ENTRY_URL and refuses (throws at startup) for
  any non-file entry. No absolute checkout paths are pinned in code or fixtures
  (fixtures use synthetic `file:///X:/...` paths), so the change survives the merge
  back to `D:\Workspace\agent-command-center`.

Commands run and exact results (this tree, `df53aa5`):

- `npm.cmd test` in `app/` (via the untracked node_modules junction):
  **529 passed, 0 failed** across 17 suites — exactly baseline 423 + 106 new
  (media-permission-policy 106). Per-suite: nav-guard 26, launchers 13,
  video-scout-args 103, task-name 53, media-permission-policy 106, agent-dom 38,
  tts-selection 27, audio-module-health 9, tts-device-config 3, tts-audio-contract 9,
  tts-bootstrap 16, tts 19, stt-env-config 14, stt-bootstrap 47, stt-audio-quality 16,
  stt-target-lock 11, stt 19. No existing assertion disappeared.
- `powershell -ExecutionPolicy Bypass -File scripts/run-pester.ps1`:
  **216 passed, 0 failed, 0 skipped (of 216)** — unchanged (scripts side untouched).

Manual verification (live, this worktree build):

- Old production Command Center tree stopped; the K8 build launched DIRECTLY from the
  worktree (Desktop shortcut NOT retargeted). Verified running root process command
  line `...\.worktrees\k8-audio-permission-hardening\app\...electron.exe" "...\app"`
  and window title `Blue Helm — K8 ACCEPTANCE 2026-07-16.5`; control strip and startup
  Logs (`[build] K8 ACCEPTANCE 2026-07-16.5`) confirmed in-app.
- Camera-only probe `getUserMedia({video:true})`: **rejected before access**
  (`NotAllowedError`, no stream) + bounded Logs line
  `[audio-permission] denied request: video-requested`.
- Mixed probe `getUserMedia({audio:true,video:true})`: **rejected**
  (`NotAllowedError`) + a second `video-requested` line (request denials are
  deliberately NOT latched — every real access attempt stays visible).
- Positive control with Dictate's exact MIC_CONSTRAINTS shape: **granted**, one audio
  track (no video), all tracks stopped immediately by the probe.
- Exactly one latched `denied check: security-origin-mismatch` line from Chromium's
  automatic status checks — fail-closed without flooding; no URLs, device labels, or
  content in any line; no transcript text in Logs.
- Probes ran via a temporary local CDP session (`--remote-debugging-port` on
  127.0.0.1); the app was then relaunched CLEAN (no debug flag), re-verified (PID,
  command line, `.5` title), and left running for human acceptance.
- Still pending HUMAN live proof: Dictate round-trip (speak → transcript reaches the
  pane locked at record start), TTS in PowerShell + agent panes, Stop, voice/speed
  selection, pane targeting.

Known limitations:

- The two page-load automatic check denials fire before the renderer's Logs listener
  attaches, so their lines reach the main-process console (`console.error`) but may
  not appear in the Logs tab; the latch means the same signature will not re-log
  later. Deliberate trade-off, recorded here; every REQUEST denial is always visible
  in Logs.
- `navigator.permissions.query({name:'microphone'})` now reports 'denied'
  (missing mediaType → fail closed). Nothing in the app uses it; a future feature
  that wants it must widen the policy through review, not around it.
- The trusted-origin serialization (`'file:///'`) is Chromium-observed, not
  URL-API-derivable; if a future Electron major changes it, the mic prompt would fail
  CLOSED (visible `origin-mismatch` refusals) — re-probe and update the policy then.

Unexpected pre-existing findings: none. (The d.ts `embeddingOrigin` "subframe-only"
comment being wrong at runtime is documented above and handled.)

Recommended whole-diff review focus: the policy module end to end (it IS the
boundary) · main.js wiring (single canonical ENTRY definition; handlers installed
before window creation with late-bound `getTrustedWindow`; callback-exactly-once) ·
the check-side latch (visibility vs flood trade-off) · absence of any other change.

Review diff (whole branch vs fork point):
`git diff a02c17b...HEAD --output=.agent-review-k8-audio-permission-hardening.diff`
(pinned, gitignored)

Reviewer verdict: Pending

Reviewer verdict source: Pending

## Review-diff rule

- Before merge, the reviewed delta is `git diff a02c17b...<tip>`.
- After merge, reproduce it with the recorded pre-merge main SHA:
  `git diff a02c17b...<tip>`.
- Always use `--output`; never PowerShell `>` for pinned review diffs.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced
  it. A paraphrase or implied verdict is not a merge-gate verdict.
