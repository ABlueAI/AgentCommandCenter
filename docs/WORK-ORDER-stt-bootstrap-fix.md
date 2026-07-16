# Work Order - STT Bootstrap Fix (Whisper repair + combined audio acceptance build)

## Goal

Make Dictate real: repair the STT module so it actually loads, runs Whisper locally
(WebGPU first, WASM fallback), shows honest first-use download progress, and delivers one
finalized transcript to the pane where dictation STARTED. Ship the result as the combined
TTS + STT acceptance build `AUDIO ACCEPTANCE 2026-07-16.2`, stacked on the green TTS
repair (`ae66043`), which must remain green and untouched in behavior.

## Tier and blast radius

**Standard-class.** One invariant on `feature/stt-bootstrap-fix` (stacked on the TTS
branch): the STT module imports a real, declared browser bundle; initialization progress
and every failure are visible; and a finished transcript goes only to the pane locked at
recording start — or is refused visibly, never delivered elsewhere.

**Blast radius:** browser-module packaging, local Whisper initialization,
progress/failure visibility, and transcript delivery. Worst-case failure remains a
recoverable nonfunctional Dictate control. This work must not alter credentials,
destructive operations, cost guards, or Electron's permission boundary. K8 microphone
permission hardening remains a separate Full-class branch; the media permission handler
in `app/main.js` is not modified here.

## Proven root cause

`app/renderer/stt.js` imports `./vendor/transformers.web.min.js`, which does not exist in
the repo. The module dies at import time, `window.ccSTT` is never assigned, and Dictate
is a hollow control. `transformers.web.min.js` is also the wrong distribution for a raw
`<script type="module">` renderer (it contains bare imports). The correct entry point is
the official standalone browser ESM bundle
`../node_modules/@huggingface/transformers/dist/transformers.min.js`, already present
transitively at the locked version 3.8.1 — it becomes a real direct dependency.

## Required scope

- Declare `"@huggingface/transformers": "3.8.1"` as a direct production dependency
  (package.json + the lockfile root dependency list; no unrelated lockfile churn).
- Repair the `stt.js` import to the official bundle. Do not vendor or rewrite
  Transformers, Whisper, ONNX Runtime, model inference, or audio decoding.
- Testable environment contract (`stt-env-config.js`): `allowLocalModels=false`,
  `allowRemoteModels=true`, refuse clearly if `env.backends.onnx.wasm` is missing,
  `wasmPaths=https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/`,
  `numThreads=1`, `proxy=false`. No manual model download step — first use downloads and
  Chromium caches.
- Keep `onnx-community/whisper-base.en`; WebGPU first
  (`dtype {encoder_model:'fp32', decoder_model_merged:'q4'}`), visible fallback to WASM
  (`dtype 'q8'`). Truthful approximate first-use sizes in the UI (~207 MB WebGPU,
  ~77 MB WASM). Never claim a backend succeeded before the pipeline resolves; a falsy
  loader result is a failure; both-backends failure names both reasons, bounded.
- `progress_callback` on both attempts: initialization, download start, rounded
  percentage, file completion, model ready, and the WebGPU→WASM fallback all visible in
  the Dictate status; repetitive progress throttled (~250 ms), completion/ready
  immediate; bounded filename + rounded percent only — never model contents, recorded
  audio, or dictated text.
- Dictate interaction preserved: first click records immediately; second click stops,
  produces ONE finalized transcript (no partials), and sends it to the pane locked at
  recording start. A closed target pane refuses visibly rather than delivering
  elsewhere. Logs carry pane ID/role, character count, lifecycle, and errors only —
  never transcript text.
- `audioModuleFromFailure` recognizes `stt.js`, `transformers.min`, and
  `@huggingface/transformers` so a module import failure yields an honest
  STT-unavailable status and Logs entry.
- Acceptance marker becomes `AUDIO ACCEPTANCE 2026-07-16.2` in the window title, the
  audio control strip, and Logs at startup.

## Explicitly out of scope

- K8 microphone permission hardening (`app/main.js` media permission handler).
- Voice Console/widget, explicit pane selector UI, uncertainty highlighting, advanced
  TTS queue, partial/streaming transcripts, cloud STT.
- Any change to the TTS repair semantics on the base commit.

## Acceptance

- [ ] `npm.cmd test` green, including new focused STT suites; TTS latest-request-wins
      tests remain green. Exact counts reported.
- [ ] `scripts/run-pester.ps1` green. Exact counts reported.
- [ ] Scoped Standard-class Reviewer pass on the STT-only diff (`ae66043...HEAD`);
      verdict read verbatim.
- [ ] Electron launched from THIS worktree with the old process tree fully stopped;
      running process command line verified; `AUDIO ACCEPTANCE 2026-07-16.2` visible.
- [ ] Human confirms intelligible English TTS and a finalized Whisper transcript in the
      intended pane. Not complete until then.

## Gate

One scoped review of: the official import + dependency declaration, the environment
contract, the WebGPU/WASM bootstrap with progress/failure paths, the destination-pane
lock, and module-failure visibility. Human approval remains the merge gate; do not merge
or push.
