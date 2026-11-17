# Dependency advisories (`app/`)

What `npm audit` reports for `app/package-lock.json`, and what was done about each one. Written in
1.1 session S02 (2026-10-19). Update this page whenever the audit result changes.

## Result

### S36: Electron 42.11.16 (2026-11-17)

Electron is pinned to exactly `42.11.16` in both the manifest and lockfile, up from the
previously locked `42.11.15` (the manifest allowed `^42.5.0`). No other dependency changed.

| | Before S36 | After S36 |
|---|---|---|
| Audit findings (vulnerable packages) | 4 high | 3 high |
| Electron | GHSA-jr5w-w6x2-84p9 (high) | Fixed in 42.11.16 |
| Remaining | `sharp`, `@huggingface/transformers`, `kokoro-js` | Same three packages |

Measured against the public registry on 2026-11-17: `npm audit --package-lock-only --json`
before the bump and `npm audit --json` after it. Both audits exited 1 because findings remain.
GHSA-jr5w-w6x2-84p9 concerns compromised eMudhra intermediate certificates and affects Electron
versions below 42.11.16. The three `sharp` advisories listed below are unchanged; transformers
and kokoro inherit those findings. No additional dependency fixes were applied.

Compared with S02's historical result, the current registry no longer reports
GHSA-hp3w-g68c-fv3c for `sprintf-js`, or its inherited findings in `roarr`, `global-agent` and
`onnxruntime-node`. Those four moderate findings were already absent in the pre-bump audit;
their disappearance is not caused by this Electron update. Their installed versions are unchanged.

The regression floor in `app/ci-hygiene.test.js` now requires Electron 42.11.16 or newer.
The Windows voice check remains BLUE-CHECKLIST.md step 15, on 42.11.16; it is still pending.

### S02 historical result (2026-10-19)

| | Before S02 | After S02 |
|---|---|---|
| `npm audit` | 11 (5 moderate, 6 high) | 7 (4 moderate, 3 high) |
| Fixed | | 4: `electron`, `undici`, `tar`, `protobufjs` |
| Left, explained below | | 7: the Node-side half of the speech stack |

Measured with `npm audit --package-lock-only` against the public registry on 2026-10-19.

**Keeping it current.** Nothing refreshes this automatically yet. CI doesn't run `npm audit`, and
the GitHub Actions in `.github/workflows/` are pinned to commit SHAs, so they no longer pick up new
minor or patch releases by themselves. Until that changes, any session that touches dependencies or
workflows re-runs `npm audit --package-lock-only` in `app/`, checks each action's tag with
`git ls-remote --tags https://github.com/actions/<name>`, and updates this page and the pins. The
automated option is a Dependabot config for `github-actions` and `npm`. That is a `.github/` change
that opens PRs on its own, so it waits for Blue's decision.

## Fixed by `npm audit fix` (no breaking changes)

Each moved inside the range `app/package.json` already allowed, so `package.json` is unchanged and
only the lockfile moved. `app/ci-hygiene.test.js` fails if any of them drops below its fixed version.

| Package | Was | Now | Advisories | Where it runs |
|---|---|---|---|---|
| `electron` (high) | 42.5.0 | 42.11.15 | 6, all fixed by 42.10.0: GHSA-r4w5-6pfg-jxp5, GHSA-hq2x-r82h-9wj4, GHSA-gr2m-v5gq-v685, GHSA-j84w-jfhq-vhvj, GHSA-qmv3-fv6v-rmhq, GHSA-9qh4-3jw8-366w (sandbox inheritance for popups, protocol-handler cross-origin reads, preload code-cache poisoning, `<webview>` Node in workers) | **Mako's runtime.** This is the one fix that changes what Blue runs. |
| `undici` (high) | 7.28.0 | 7.30.1 | 15, all fixed by 7.29.1 | Only Electron's install-time downloader (`@electron/get`); `dev`, `optional`, not shipped. |
| `tar` (high) | 7.5.19 | 7.5.22 | GHSA-r292-9mhp-454m (stack-overflow DoS on a crafted archive) | `onnxruntime-node`'s install script. Mako never unpacks archives at runtime. |
| `protobufjs` (moderate) | 7.6.4 | 7.6.6 | GHSA-j3f2-48v5-ccww (DoS parsing `.proto` options) | Installed under `onnxruntime-web`; Mako's renderer loads prebuilt browser bundles instead (below). |

## S02 remaining findings and exposure

This section records S02's findings. For the current audit result, see S36 above: only `sharp`
and its two dependents remain reported; the four moderate findings below are historical.

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
  `media-permission-policy.test.js`). They run under plain Node and check Mako's own code against
  the unchanged `@huggingface/transformers` 3.8.1 and vendored `kokoro-js` 1.2.1 bundles. They do
  not run inside Electron, so they can't see a runtime change.
- **Only on Blue's PC:** real microphone capture, WebGPU inference and audio playback on Electron
  42.11.16. In particular, `app/media-permission-policy.js` grants the microphone only when the
  request matches facts probed on Electron 42.5.0 (`securityOrigin` `file:///` and the exact
  requesting URL). If 42.11.16 reports them differently, the policy refuses the microphone and CI
  stays green. Dictation working in BLUE-CHECKLIST.md step 15 is what confirms they still hold.
  Likewise `app/renderer/tts.js` relies on two facts probed on 42.5.0: unprefixed `preservesPitch`
  works, and a `play()` that starts after synthesis (well after the click) still resolves. Step
  15's TTS check at 1.0× and 2.0× confirms both.
