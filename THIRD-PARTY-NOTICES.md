# Third-party notices

Mako's own code is under the MIT licence in [LICENSE](LICENSE). The files listed here are not Mako's
own code: they were copied into this repository from other projects and stay under their own
licences. The full licence texts are in [LICENSES/](LICENSES/).

This file records notices and where to get the source. It is not legal advice, and it does not
answer how these licences affect Mako as a whole.

Checked on 2026-11-07 against the npm packages each file came from (sha256 of each file compared;
details under "How each version was checked"). `app/third-party-notices.test.js` fails if a tracked
file under `app/renderer/vendor/` is missing from the table below.

## Vendored files (`app/renderer/vendor/`)

| File | Upstream project | Version | Licence | Copyright | Source (pinned) |
|---|---|---|---|---|---|
| `app/renderer/vendor/xterm.js` | xterm.js (`@xterm/xterm`, `lib/xterm.js`) | 6.0.0 | MIT ([text](LICENSES/MIT-xterm.js.txt)) | Copyright (c) 2017-2019, The xterm.js authors; Copyright (c) 2014-2016, SourceLair Private Company; Copyright (c) 2012-2013, Christopher Jeffrey | [xtermjs/xterm.js@f447274 (tag 6.0.0)](https://github.com/xtermjs/xterm.js/tree/f447274f430fd22513f6adbf9862d19524471c04) |
| `app/renderer/vendor/xterm.css` | xterm.js (`@xterm/xterm`, `css/xterm.css`) | 6.0.0 | MIT ([text](LICENSES/MIT-xterm.js.txt); the file also carries its own notice) | Copyright (c) 2014 The xterm.js authors; Copyright (c) 2012-2013, Christopher Jeffrey | [xtermjs/xterm.js@f447274 (tag 6.0.0)](https://github.com/xtermjs/xterm.js/tree/f447274f430fd22513f6adbf9862d19524471c04) |
| `app/renderer/vendor/addon-fit.js` | xterm.js fit addon (`@xterm/addon-fit`, `lib/addon-fit.js`) | 0.11.0 | MIT ([text](LICENSES/MIT-xterm.js.txt)) | Copyright (c) 2019, The xterm.js authors | [xtermjs/xterm.js@f447274, `addons/addon-fit`](https://github.com/xtermjs/xterm.js/tree/f447274f430fd22513f6adbf9862d19524471c04/addons/addon-fit) |
| `app/renderer/vendor/addon-unicode11.js` | xterm.js Unicode 11 addon (`@xterm/addon-unicode11`, `lib/addon-unicode11.js`) | 0.9.0 | MIT ([text](LICENSES/MIT-xterm.js.txt)) | Copyright (c) 2019, The xterm.js authors | [xtermjs/xterm.js@f447274, `addons/addon-unicode11`](https://github.com/xtermjs/xterm.js/tree/f447274f430fd22513f6adbf9862d19524471c04/addons/addon-unicode11) |
| `app/renderer/vendor/addon-web-links.js` | xterm.js web links addon (`@xterm/addon-web-links`, `lib/addon-web-links.js`) | 0.12.0 | MIT ([text](LICENSES/MIT-xterm.js.txt)) | Copyright (c) 2017, The xterm.js authors | [xtermjs/xterm.js@f447274, `addons/addon-web-links`](https://github.com/xtermjs/xterm.js/tree/f447274f430fd22513f6adbf9862d19524471c04/addons/addon-web-links) |
| `app/renderer/vendor/addon-webgl.js` | xterm.js WebGL addon (`@xterm/addon-webgl`, `lib/addon-webgl.js`) | 0.19.0 | MIT ([text](LICENSES/MIT-xterm.js.txt)) | Copyright (c) 2018, The xterm.js authors | [xtermjs/xterm.js@f447274, `addons/addon-webgl`](https://github.com/xtermjs/xterm.js/tree/f447274f430fd22513f6adbf9862d19524471c04/addons/addon-webgl) |
| `app/renderer/vendor/kokoro.web.js` | kokoro-js (`kokoro-js`, `dist/kokoro.web.js`), a prebuilt bundle; **contains eSpeak NG, GPL-3.0-or-later** (next section) | 1.2.1 | Mixed: GPL-3.0-or-later ([text](LICENSES/GPL-3.0.txt)) for the eSpeak NG engine and data; Apache-2.0 ([text](LICENSES/Apache-2.0.txt)) and MIT ([text](LICENSES/MIT-kokoro-bundle.txt)) for the rest | See the next section, one line per component | See the next section, one link per component |

The five xterm.js npm packages above were all published from the same xterm.js commit, `f447274`
(each package's `gitHead`).

## What is inside `kokoro.web.js`

`app/renderer/vendor/kokoro.web.js` is byte-for-byte the `dist/kokoro.web.js` file of the npm package
`kokoro-js` 1.2.1 (sha256
`6067712fe4c43cdb36c762f860a5ab8d96ea1d9c8882466438eb9f3d0d20be8f`). It is one minified file that
bundles several projects. npm declares kokoro-js and phonemizer as Apache-2.0 only, but the bundle
also carries the eSpeak NG speech engine and its data, which are licensed GPL-3.0-or-later. The
bundle has no licence comments of its own.

| Component in the bundle | Version | Licence | Copyright | Complete corresponding source (pinned) |
|---|---|---|---|---|
| **eSpeak NG** engine, compiled to WebAssembly/JavaScript with Emscripten (the `eSpeakNGWorker` class, `espeak_VOICE_*` and `synthesize_ipa` symbols), plus its `espeak-ng-data` files (phoneme tables, dictionaries, voices) | Unverified: the build doesn't record it. The Emscripten glue it uses is unchanged in espeak-ng from release 1.51.1 to `master`, so the version can't be read from it. The newest release before phonemizer.js was built (January 2025) is [1.52.0 (`4870adf`)](https://github.com/espeak-ng/espeak-ng/tree/4870adfa25b1a32b4361592f1be8a40337c58d6c) | **GPL-3.0-or-later** ([text](LICENSES/GPL-3.0.txt)); espeak-ng's README states "GPL version 3 or later". Its repository also carries `COPYING.APACHE`, `COPYING.BSD2` and `COPYING.UCD` for some parts | Copyright (C) 2005 to 2013 Jonathan Duddington; Copyright (C) 2013-2017 Reece H. Dunn; and the other eSpeak NG contributors (from espeak-ng's source headers) | [espeak-ng/espeak-ng](https://github.com/espeak-ng/espeak-ng), release [1.52.0](https://github.com/espeak-ng/espeak-ng/tree/4870adfa25b1a32b4361592f1be8a40337c58d6c) (most likely; unverified). The Emscripten build is that repository's [`emscripten/`](https://github.com/espeak-ng/espeak-ng/tree/4870adfa25b1a32b4361592f1be8a40337c58d6c/emscripten) directory; the prebuilt worker as bundled is [`src/espeakng.worker.js`](https://github.com/xenova/phonemizer.js/blob/6835144b7ee9043129222549c1ed2f6a27216278/src/espeakng.worker.js) and [`data/espeakng.worker.data`](https://github.com/xenova/phonemizer.js/blob/6835144b7ee9043129222549c1ed2f6a27216278/data/espeakng.worker.data) in phonemizer.js below |
| phonemizer.js (`phonemizer`), the wrapper that loads the eSpeak NG worker | 1.2.1 | Apache-2.0 ([text](LICENSES/Apache-2.0.txt)) for the wrapper; the eSpeak NG worker it carries is GPL-3.0-or-later (row above) | No copyright line in its LICENSE; author: Xenova (Joshua Lochner) | [xenova/phonemizer.js@6835144 ("Update to v1.2.1", the npm `gitHead`)](https://github.com/xenova/phonemizer.js/tree/6835144b7ee9043129222549c1ed2f6a27216278) |
| kokoro-js itself (`src/kokoro.js` and friends) | 1.2.1 | Apache-2.0 ([text](LICENSES/Apache-2.0.txt)) | No copyright line in its LICENSE; author: hexgrad, contributor: Xenova (`package.json`) | [hexgrad/kokoro@664c76a, `kokoro.js/` ("Update to 1.2.1", the npm `gitHead`)](https://github.com/hexgrad/kokoro/tree/664c76a704021239ba59c84dcbaa4d3dece01fe9/kokoro.js) |
| Transformers.js (`@huggingface/transformers`), web build | 3.5.1 | Apache-2.0 ([text](LICENSES/Apache-2.0.txt)) | No copyright line in its LICENSE; author: Hugging Face (`package.json`) | [huggingface/transformers.js@746c8c2 (tag 3.5.1)](https://github.com/huggingface/transformers.js/tree/746c8c25bf27c5e0684a20f76889b4bb8d23e295) |
| `@huggingface/jinja`, bundled by Transformers.js | 0.4.1 | MIT ([text](LICENSES/MIT-kokoro-bundle.txt)) | Copyright (c) 2023 Hugging Face | [npm tarball 0.4.1, which includes `src/`](https://registry.npmjs.org/@huggingface/jinja/-/jinja-0.4.1.tgz) (the package records no git commit) |
| ONNX Runtime Web (`onnxruntime-web` and `onnxruntime-common`), JavaScript only | `onnxruntime-web` 1.22.0-dev.20250409-89f8206ba4; `onnxruntime-common` 1.21.0 (the bundle carries both version strings) | MIT ([text](LICENSES/MIT-kokoro-bundle.txt)) | Copyright (c) Microsoft Corporation | [microsoft/onnxruntime@89f8206, `js/`](https://github.com/microsoft/onnxruntime/tree/89f8206ba4f1c22c39e0297fb55272e8ce8cd7d0/js) |

None of the three Apache-2.0 npm packages above ships a `NOTICE` file.

The component versions other than kokoro-js come from `kokoro.js/package-lock.json` at the kokoro-js
1.2.1 commit, plus version strings found in the bundle. That the published bundle was built from
exactly that lockfile is likely but unverified. The bundle may also hold small modules that its
upstream builds compiled in and that this table doesn't name; a string search found no sign of the
other packages in that lockfile's dependency tree (`long`, `flatbuffers`, `guid-typescript`,
`protobufjs`, `platform`).

### Earlier copies in this repository's history

`app/renderer/vendor/kokoro.web.js` was added in commit `d2b2eea` (PR #19, 2026-06-30) and has not
changed since: the copy in `d2b2eea` and the copy on `main` have the same sha256. Everything in
this notice applies to that file in every commit since `d2b2eea`, including the earlier copies.

The same commit also added `app/renderer/vendor/transformers.web.min.js`, byte-for-byte the
`dist/transformers.web.min.js` of `@huggingface/transformers` 3.8.1 (Apache-2.0, Hugging Face;
source: [huggingface/transformers.js@2ec882e (tag 3.8.1)](https://github.com/huggingface/transformers.js/tree/2ec882e739e4cb461f8d440d4d7394cbf5372429)).
Commit `efa5207` removed it the same day and `.gitignore` keeps it out, so only the history holds it.
It does not contain eSpeak NG.

## Downloaded at runtime, not in this repository

Read-aloud downloads these when it first runs; none of them is stored in the repository:

- The Kokoro model weights and voice files, from Hugging Face
  (`onnx-community/Kokoro-82M-v1.0-ONNX`), under the terms that repository states.
- The ONNX Runtime WebAssembly binaries, from jsDelivr
  (`https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/`, the bundle's default path;
  `app/renderer/tts.js` doesn't change it).

## How each version was checked

On 2026-11-07, each npm package named above was downloaded with `npm pack`, and each file in
`app/renderer/vendor/` matched the named file in that package exactly (sha256). For
`kokoro.web.js`, the gzip-compressed, base64-encoded eSpeak NG blob inside it is identical to the
one in `phonemizer` 1.2.0 and 1.2.1's `dist/phonemizer.js`, and kokoro-js 1.2.1's lockfile pins
1.2.1. Each commit linked above is the package's npm `gitHead`, or a tag that resolves to that
commit, except espeak-ng (version unverified, above) and `@huggingface/jinja` (no `gitHead`).

## Keeping this file current

Anyone who adds, replaces or updates a file under `app/renderer/vendor/` updates its row here, and
adds any new licence text to `LICENSES/`. The test `app/third-party-notices.test.js` (run by
`npm test` in `app/`) checks that every tracked file under `app/renderer/vendor/` has a row, that
every row names a tracked file, and that every licence file linked here exists.
