# Work Order - STT Accuracy Upgrade

## Goal

Raise finalized local dictation from a bootstrap-level Whisper Base result to
the strongest practical Whisper configuration for this machine, while keeping
capture local, progress visible, and destination-pane locking unchanged.

## Tier and blast radius

**Standard-class.** One invariant: usable microphone speech is transcribed by
the declared high-accuracy English pipeline with explicit decoding options;
unusable capture refuses visibly instead of producing a misleading transcript.

**Blast radius:** renderer-side model selection, microphone constraints,
recording format, non-content audio quality checks, decoding options, status,
and focused tests. No microphone permission handler, IPC, credential, provider,
cost, destructive, or main-process surface is touched.

## Evidence and model decision

- Human acceptance proved `whisper-base.en` runs, but it changed ordinary words
  and dropped multiple dictated letters/numbers in a short sample.
- Base is the 74M bootstrap model. The target PC has an RTX 5080 Laptop GPU with
  16 GB VRAM and 32 GB system RAM, so retaining Base for download size is the
  wrong tradeoff.
- Use the official Transformers.js-compatible
  `onnx-community/whisper-large-v3-turbo` model. WebGPU loads fp16 encoder and
  decoder weights to avoid the quantization sensitivity documented for Whisper;
  WASM remains a visible q8 fallback.

## Required scope

- Replace Base with `whisper-large-v3-turbo`.
- WebGPU dtype: fp16 encoder + fp16 merged decoder (approximately 1.6 GB first
  use). WASM dtype: q8 (approximately 1.1 GB first use).
- Explicit finalized decoding: English, transcribe task, deterministic beam
  search, and 30-second chunks with 5-second overlap for longer dictations.
- Request mono speech capture with echo cancellation, noise suppression, and
  automatic gain control; prefer Opus/WebM at 128 kbps when supported.
- Inspect only aggregate PCM properties (duration, RMS, peak, clipping). Never
  store, replay, or log recorded audio. Refuse non-finite, near-silent, or
  too-short capture before inference; surface clipping honestly.
- Preserve finalized-only transcripts, pane lock, privacy, visible progress,
  and WebGPU-to-WASM failure behavior.
- Advance the combined acceptance marker to `AUDIO ACCEPTANCE 2026-07-16.3`.

## Explicitly out of scope

- Cloud transcription, partial text, audio retention/replay, microphone
  permission hardening (K8), transcript rewriting, or heuristically inventing
  missing letters/numbers.

## Acceptance

- Focused tests cover model/dtypes, decoding options, capture constraints,
  recorder choice, PCM quality/refusals, and privacy.
- Full app and Pester gates green.
- One scoped Reviewer pass on model/capture/decoding hunks.
- Human repeats the same prose + A-P + 1-12 comparison in the `.3` build.

