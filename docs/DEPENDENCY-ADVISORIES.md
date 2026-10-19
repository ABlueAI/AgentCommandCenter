# Dependency advisories (`app/`)

What `npm audit` reports for `app/package-lock.json`, and what was done about each one. Written in
1.1 session S02 (2026-10-19). Update this page whenever the audit result changes.

## Result

| | Before S02 | After S02 |
|---|---|---|
| `npm audit` | 11 (5 moderate, 6 high) | 7 (4 moderate, 3 high) |
| Fixed | | 4: `electron`, `undici`, `tar`, `protobufjs` |
| Left, explained below | | 7: the Node-side half of the speech stack |

Measured with `npm audit --package-lock-only` against the public registry on 2026-10-19.

## Fixed by `npm audit fix` (no breaking changes)

Each moved inside the range `app/package.json` already allowed, so `package.json` is unchanged and
only the lockfile moved. `app/ci-hygiene.test.js` fails if any of them drops below its fixed version.

| Package | Was | Now | Advisories | Where it runs |
|---|---|---|---|---|
| `electron` (high) | 42.5.0 | 42.11.15 | 6, all fixed by 42.10.0: GHSA-r4w5-6pfg-jxp5, GHSA-hq2x-r82h-9wj4, GHSA-gr2m-v5gq-v685, GHSA-j84w-jfhq-vhvj, GHSA-qmv3-fv6v-rmhq, GHSA-9qh4-3jw8-366w (sandbox inheritance for popups, protocol-handler cross-origin reads, preload code-cache poisoning, `<webview>` Node in workers) | **Mako's runtime.** This is the one fix that changes what Blue runs. |
| `undici` (high) | 7.28.0 | 7.30.1 | 15, all fixed by 7.29.1 | Only Electron's install-time downloader (`@electron/get`); `dev`, `optional`, not shipped. |
| `tar` (high) | 7.5.19 | 7.5.22 | GHSA-r292-9mhp-454m (stack-overflow DoS on a crafted archive) | `onnxruntime-node`'s install script. Mako never unpacks archives at runtime. |
| `protobufjs` (moderate) | 7.6.4 | 7.6.6 | GHSA-j3f2-48v5-ccww (DoS parsing `.proto` options) | Installed under `onnxruntime-web`; Mako's renderer loads prebuilt browser bundles instead (below). |

## Left as they are, and why

`npm audit` offers no fix for these. Its only route is `@huggingface/transformers` 4.x. That is a
major upgrade of the dictation engine, and `kokoro-js` 1.2.1 (the latest) still requires
transformers 3.x, so the vulnerable 3.x copy would stay anyway.

How Mako loads the speech stack decides the exposure:

- **Dictation** (`app/renderer/stt.js`) imports
  `node_modules/@huggingface/transformers/dist/transformers.min.js`, the standalone browser bundle,
  into the renderer. That bundle contains no reference to `sharp` or `onnxruntime-node` (checked by
  searching the 3.8.1 bundle on 2026-10-19). It runs ONNX through WebAssembly or WebGPU.
- **Text to speech** (`app/renderer/tts.js`) imports the vendored `app/renderer/vendor/kokoro.web.js`.
  It is byte-identical (SHA-256 `6067712f…20be8f`) to `dist/kokoro.web.js` in `kokoro-js` 1.2.1, and
  it also has no reference to `sharp` or `onnxruntime-node`.
- Nothing in `app/` `require`s `sharp`, `onnxruntime-node`, `global-agent`, `roarr` or `sprintf-js`.

| Package | Severity | Advisory | Why it stays |
|---|---|---|---|
| `sharp` 0.34.5 | high | GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w (image libraries: libvips, libheif, librsvg) | Installed for transformers' Node image code, which Mako never loads. Mako passes no images to it. Fixed only in 0.35.5, outside transformers 3.8.1's `^0.34.1`. |
| `@huggingface/transformers` 3.8.1 | high | inherited from `sharp` and `onnxruntime-node` | No advisory of its own. Fixed only in 4.x (see above). |
| `kokoro-js` 1.2.1 | high | inherited from transformers | No advisory of its own, and no newer release. |
| `onnxruntime-node` 1.21.0 | moderate | inherited from `global-agent` | The Node backend. The renderer bundles use `onnxruntime-web` instead. |
| `global-agent` 3.0.0 | moderate | inherited from `roarr` | Proxy helper used by `onnxruntime-node`'s install script. |
| `roarr` 2.15.4 | moderate | inherited from `sprintf-js` | Logger inside `global-agent`. |
| `sprintf-js` 1.1.3 | moderate | GHSA-hp3w-g68c-fv3c (DoS through huge precision specifiers in a format string) | No fixed version exists. Only reachable if an attacker controls a format string inside `roarr`'s logging at install time. |

The way to clear these is a separate session: move dictation to transformers 4.x, and either
replace or drop the `kokoro-js` dependency (TTS uses only the vendored copy). Both need dictation
and TTS checked on Blue's PC, since the models run on his GPU.

## Regression checks for dictation and text to speech

- **CI (Windows):** the dictation and TTS suites in `npm test` (`renderer/stt*.test.js`,
  `renderer/tts*.test.js`, `renderer/audio-module-health.test.js`, `renderer/wav-encode.test.js`,
  `media-permission-policy.test.js`). The speech stack's own packages did not change, so these
  pin the contract the Electron update must keep.
- **Only on Blue's PC:** real microphone capture, WebGPU inference and audio playback on the new
  Electron. See BLUE-CHECKLIST.md step 15.
