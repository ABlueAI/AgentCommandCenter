# Work Order — K7 TTS Bootstrap Repair

## Goal

Make the existing Speak control useful and honest: Kokoro initializes on its
supported WebGPU and WASM paths, and any initialization failure is visibly
reported in Logs while the control stops presenting as usable.

## Tier and blast radius

**Standard-class.** One-invariant branch: `feature/tts-bootstrap-fix`; one
scoped Reviewer pass over the Kokoro environment contract and initialization
failure path; then merge.

**Blast radius:** local module initialization and failure visibility. Worst-case
failure is a still-nonfunctional TTS control, which is recoverable and
non-destructive. This work does not touch credentials, IPC permissions,
provider routing, spend/cost controls, or destructive operations.

## Context

- TTS module: `app/renderer/tts.js`
- TTS UI/status and Logs integration: inspect the existing renderer/main log
  path before editing; reuse the established visible-error pattern.
- Browser bundle: `app/renderer/vendor/kokoro.web.js`
- Current verified mismatch: the tracked bundle exposes `env.wasmPaths`; it
  does **not** expose the `env.backends.onnx` API the TTS integration dereferences.
- K7/K8 record: `BLUE-HELM-MASTER-STATUS.md`

## Required scope

- Repair the integration/packaging contract between `tts.js` and the tracked
  Kokoro browser bundle.
- Do not vendor, rewrite, or patch Kokoro or ONNX Runtime internals.
- Surface initialization failures honestly in Logs and make the Speak control
  visibly unavailable/failed rather than apparently live.
- Add a success-side bootstrap contract test and a failure-path test proving a
  failed initialization is visible, not silent.
- After merge, fully restart Electron and live-test voice selection, speed, and
  stop on both WebGPU and WASM paths.

## Explicitly out of scope

- STT bootstrap and dictation targeting.
- K8 audio permission hardening. K8 is **Full-class** because it changes the
  Electron media-permission security boundary (trusted origin + audio-only
  proof); it must remain on its own branch after TTS and STT bootstrap work.
- New TTS engines, custom ONNX/Kokoro internals, cloud TTS, credentials,
  backend services, or auto-speak policy.

## Acceptance criteria

- [ ] No `env.backends.onnx` assumption remains unless the tracked bundle
      demonstrably provides it.
- [ ] A supported bootstrap path succeeds through the established TTS status
      contract.
- [ ] Initialization failure produces an honest visible Log/status message and
      leaves the control visibly unavailable/failed.
- [ ] Tests cover both the bootstrap contract and the visible failure path.
- [ ] Relevant app tests pass; full Electron restart precedes manual proof.
- [ ] Human live proof covers voice, speed, and stop on WebGPU and WASM.
- [ ] No K8 permission, STT, credential, or unrelated UI change appears in the
      diff.

## Builder handoff

Plan before edits. Use only `feature/tts-bootstrap-fix`; do not merge or push.
Report changed files, automated-test result, exact manual-test steps still
requiring the human, branch tip SHA, and a pinned three-dot diff. Reviewer scope
is the environment contract and visible initialization-failure path only.
