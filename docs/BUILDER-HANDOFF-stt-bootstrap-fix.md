# Builder Handoff - STT Bootstrap Fix (combined audio acceptance 2026-07-16.2)

Branch: `feature/stt-bootstrap-fix`
`main` SHA: `ef3e26a`
Stacked TTS base: `ae66043` (fix(audio): prevent stale TTS playback — green: app 296/0, focused TTS contract 19/0)
STT implementation tip: `82d9bf1` (verify at gate time with `git rev-parse feature/stt-bootstrap-fix`; the
docs-only handoff commit adding this file sits on top)
Merge commit SHA: Pending human live proof and merge

Intended invariant: the STT module imports a real, declared browser bundle; Whisper
initialization progress and every failure are visible (never a hollow Dictate control);
and a finished transcript goes only to the pane locked at recording start — or is
refused visibly, never delivered elsewhere. The TTS repair on the base commit is
unchanged in behavior and remains green.

Concrete root cause fixed: `app/renderer/stt.js` imported `./vendor/transformers.web.min.js`,
which does not exist in the repo (and is the wrong, bare-import distribution for a raw
module renderer). The module died at import time, `window.ccSTT` was never assigned, and
Dictate was hollow. The import now targets the official standalone browser ESM bundle
`../node_modules/@huggingface/transformers/dist/transformers.min.js`, declared as a real
direct dependency at the already-locked version 3.8.1.

Exact files changed (one coherent implementation commit, `82d9bf1`):

- `app/renderer/stt.js` — official-bundle import; env contract applied at module top
  (a wrong bundle now throws into app.js's module-failure handler instead of dying
  silently); model load through the tested webgpu→wasm bootstrap with progress; bounded
  honest failure statuses; transcript text flows ONLY to onResult, never to Logs/status.
- `app/renderer/stt-env-config.js` (NEW) — pure env contract: allowLocalModels=false,
  allowRemoteModels=true, refuse if `env.backends.onnx.wasm` missing, wasmPaths pinned to
  `https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/`, numThreads=1,
  proxy=false.
- `app/renderer/stt-bootstrap.js` (NEW) — Whisper device options (webgpu:
  fp32 encoder + q4 merged decoder; wasm: q8), truthful download sizes (~207 MB / ~77 MB),
  bounded filename helper, throttled progress reporter (~250 ms; done/ready immediate),
  and `createWhisperLoader` reusing `bootstrapModel` from tts-bootstrap.js.
- `app/renderer/stt-target-lock.js` (NEW) — pure destination-pane-lock decision; receives
  only a char count, so transcript text structurally cannot reach Logs from here.
- `app/renderer/tts-bootstrap.js` — additive: `label` option (STT refusals say "speech
  model", TTS default unchanged) + per-device failure reasons length-bounded to 160.
- `app/renderer/app.js` — marker → `AUDIO ACCEPTANCE 2026-07-16.2`; failure classifier
  now recognizes `stt.js` / `transformers.min` / `@huggingface/transformers`
  (transformers.web retained); paneData carries `role`; Dictate wiring locks the target
  pane at record start, refuses a closed pane visibly, logs pane ID/role + char count +
  lifecycle only — the previous `[stt] » <transcript>` log line is REMOVED.
- `app/renderer/index.html` — marker → 2026-07-16.2; loads `stt-target-lock.js` before
  app.js.
- `app/package.json` — `"@huggingface/transformers": "3.8.1"` direct dependency; four
  new suites appended to `npm test`.
- `app/package-lock.json` — the dependency added to the root package's dependency list
  only (the locked package entry was already 3.8.1; no other churn).
- `docs/WORK-ORDER-stt-bootstrap-fix.md` (NEW) — Standard-class work order.

Security-sensitive surfaces touched: none. No main-process, IPC, permission, credential,
microphone-permission, provider, or cost-control code changed. `app/main.js` untouched
(K8 media-permission hardening stays its own Full-class branch). New network surface is
limited to the already-allowed CSP classes: HF model download (`connect-src https:`) and
the pinned jsdelivr WASM path (already used by TTS/ORT).

Commands run:

- `npm.cmd test` in `app/` (via the untracked `app\node_modules` junction to the main
  installation, per the work brief).
- `powershell -ExecutionPolicy Bypass -File scripts/run-pester.ps1`

Exact test results (this tree, `82d9bf1`):

- App gate: **383 passed, 0 failed** across 15 suites — 296 base + 87 new
  (stt-env-config 14, stt-bootstrap 44, stt-target-lock 11, stt real-bundle 18).
  Per-suite: nav-guard 26, launchers 13, video-scout-args 103, task-name 53,
  agent-dom 38, tts-selection 7, audio-module-health 9, tts-device-config 3,
  tts-audio-contract 9, tts-bootstrap 16, tts 19, stt-env-config 14, stt-bootstrap 44,
  stt-target-lock 11, stt 18.
- TTS focused contract (`tts.test.js`, latest-request-wins): **19 passed, 0 failed** —
  the stacked TTS base remains green after the STT changes.
- Pester gate: **216 passed, 0 failed, 0 skipped (of 216)** — unchanged from the base.

Live paths actually tested versus only mocked:

- REAL (no mocks): importing `transformers.min.js` under Node (exposes `pipeline`/`env`);
  importing the real `stt.js` against that real bundle (ready event, `window.ccSTT`
  shape, exact env contract applied) — with one documented graft: under plain Node the
  WEB bundle has no `env.backends.onnx.wasm` (it stubs onnxruntime-node), so the test
  installs a browser-shaped `{ wasm: {} }` stand-in before importing stt.js; in the
  sandboxed Electron renderer (no `process` global) the bundle takes its browser path
  where ONNX Runtime Web's env provides `.wasm` for real.
- MOCKED (deliberately — tests must not download the model or need a microphone):
  the `pipeline` loader in bootstrap tests; recording/MediaRecorder/AudioContext
  (not exercised at all — nothing calls `toggle()` in tests); actual WebGPU adapters.
- NOT yet proven anywhere: a real model download, real microphone capture, real
  transcription, and real WebGPU-vs-WASM selection on this machine — that is exactly the
  human acceptance test this build is being launched for.

Remaining limitations:

- First dictation stop triggers the model download (~207 MB WebGPU path or ~77 MB WASM
  fallback) with visible progress; transcription waits for it. Later runs use the cache.
- The transcript is finalized-only (approved interaction); no partial text, pane
  selector UI, Voice Console, uncertainty highlighting, or TTS queue (roadmap).
- Microphone permission behavior is unchanged (K8 pending): Electron's current handler
  governs `getUserMedia`; a denied mic surfaces as the existing visible
  `microphone unavailable:` error status.
- If a locked pane closes mid-dictation, the transcript is refused and discarded (with
  a visible log naming the pane and char count) — recovery is to dictate again.

Recommended review focus (the five load-bearing hunks): official import + dependency
declaration · environment contract · WebGPU/WASM bootstrap with progress/failure paths ·
destination-pane lock · module-failure visibility.

Review diff (STT-only, excludes the TTS base):
`git diff ae66043...HEAD --output=.agent-review-stt-bootstrap-fix.diff` (pinned, gitignored)

Reviewer verdict:

Reviewer verdict source:

## Review-diff rule

- This branch stacks on the TTS branch: the STT-only reviewed delta is
  `git diff ae66043...<tip>`; the full-branch delta versus main is
  `git diff ef3e26a...<tip>`.
- Always use `--output`; do not use PowerShell `>` for pinned review diffs.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that
  produced it. A paraphrase or implied verdict is not a merge-gate verdict.
