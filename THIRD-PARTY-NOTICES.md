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
| `app/renderer/vendor/fonts/InterVariable.woff2` | Inter, the UI font of the 1.1 layout (S66); `web/InterVariable.woff2` from the release file `Inter-4.1.zip`, unmodified | 4.1 | OFL-1.1 ([text](LICENSES/OFL-1.1-Inter.txt)) | Copyright (c) 2016 The Inter Project Authors | [rsms/inter@e3a3d4c (tag v4.1)](https://github.com/rsms/inter/tree/e3a3d4c57d5ecc01453a575621882a384c1995a3) |
| `app/renderer/vendor/fonts/CascadiaCode.woff2` | Cascadia Code, the code font of the 1.1 layout (S66); `woff2/CascadiaCode.woff2` from the release file `CascadiaCode-2407.24.zip`, unmodified (the licence reserves the name "Cascadia Code" for unmodified copies) | 2407.24 | OFL-1.1 ([text](LICENSES/OFL-1.1-CascadiaCode.txt)) | Copyright (c) 2019 - Present, Microsoft Corporation, with Reserved Font Name Cascadia Code | [microsoft/cascadia-code@56bcca3 (tag v2407.24)](https://github.com/microsoft/cascadia-code/tree/56bcca3f2c1e4cb19458954f0e2bb4635960df91) |
| `app/renderer/vendor/three/three.module.min.js` | Three.js, the shark renderer's engine (S18); `build/three.module.min.js`, unmodified | 0.160.0 | MIT ([text](LICENSES/MIT-three.js.txt)) | Copyright © 2010-2023 three.js authors | [npm `three@0.160.0`](https://www.npmjs.com/package/three/v/0.160.0), tarball integrity `sha512-DLU8lc0zNIPkM7rH5/e1Ks1Z8tWCGRq6g8mPowdDJpw1CFBJMU7UoJjC6PefXW7z//SSl0b2+GCw14LB+uDhng==` |
| `app/renderer/vendor/three/addons/postprocessing/EffectComposer.js` | Three.js addon (S18 bloom); `examples/jsm/postprocessing/EffectComposer.js`, with only its `'three'` import rewritten to `../../three.module.min.js` (app/vendor-three.test.js proves it) | 0.160.0 | MIT ([text](LICENSES/MIT-three.js.txt)) | Copyright © 2010-2023 three.js authors | [npm `three@0.160.0`](https://www.npmjs.com/package/three/v/0.160.0), tarball integrity `sha512-DLU8lc0zNIPkM7rH5/e1Ks1Z8tWCGRq6g8mPowdDJpw1CFBJMU7UoJjC6PefXW7z//SSl0b2+GCw14LB+uDhng==` |
| `app/renderer/vendor/three/addons/postprocessing/MaskPass.js` | Three.js addon (S18 bloom); `examples/jsm/postprocessing/MaskPass.js`, with only its `'three'` import rewritten to `../../three.module.min.js` (app/vendor-three.test.js proves it) | 0.160.0 | MIT ([text](LICENSES/MIT-three.js.txt)) | Copyright © 2010-2023 three.js authors | [npm `three@0.160.0`](https://www.npmjs.com/package/three/v/0.160.0), tarball integrity `sha512-DLU8lc0zNIPkM7rH5/e1Ks1Z8tWCGRq6g8mPowdDJpw1CFBJMU7UoJjC6PefXW7z//SSl0b2+GCw14LB+uDhng==` |
| `app/renderer/vendor/three/addons/postprocessing/OutputPass.js` | Three.js addon (S18 bloom); `examples/jsm/postprocessing/OutputPass.js`, with only its `'three'` import rewritten to `../../three.module.min.js` (app/vendor-three.test.js proves it) | 0.160.0 | MIT ([text](LICENSES/MIT-three.js.txt)) | Copyright © 2010-2023 three.js authors | [npm `three@0.160.0`](https://www.npmjs.com/package/three/v/0.160.0), tarball integrity `sha512-DLU8lc0zNIPkM7rH5/e1Ks1Z8tWCGRq6g8mPowdDJpw1CFBJMU7UoJjC6PefXW7z//SSl0b2+GCw14LB+uDhng==` |
| `app/renderer/vendor/three/addons/postprocessing/Pass.js` | Three.js addon (S18 bloom); `examples/jsm/postprocessing/Pass.js`, with only its `'three'` import rewritten to `../../three.module.min.js` (app/vendor-three.test.js proves it) | 0.160.0 | MIT ([text](LICENSES/MIT-three.js.txt)) | Copyright © 2010-2023 three.js authors | [npm `three@0.160.0`](https://www.npmjs.com/package/three/v/0.160.0), tarball integrity `sha512-DLU8lc0zNIPkM7rH5/e1Ks1Z8tWCGRq6g8mPowdDJpw1CFBJMU7UoJjC6PefXW7z//SSl0b2+GCw14LB+uDhng==` |
| `app/renderer/vendor/three/addons/postprocessing/RenderPass.js` | Three.js addon (S18 bloom); `examples/jsm/postprocessing/RenderPass.js`, with only its `'three'` import rewritten to `../../three.module.min.js` (app/vendor-three.test.js proves it) | 0.160.0 | MIT ([text](LICENSES/MIT-three.js.txt)) | Copyright © 2010-2023 three.js authors | [npm `three@0.160.0`](https://www.npmjs.com/package/three/v/0.160.0), tarball integrity `sha512-DLU8lc0zNIPkM7rH5/e1Ks1Z8tWCGRq6g8mPowdDJpw1CFBJMU7UoJjC6PefXW7z//SSl0b2+GCw14LB+uDhng==` |
| `app/renderer/vendor/three/addons/postprocessing/ShaderPass.js` | Three.js addon (S18 bloom); `examples/jsm/postprocessing/ShaderPass.js`, with only its `'three'` import rewritten to `../../three.module.min.js` (app/vendor-three.test.js proves it) | 0.160.0 | MIT ([text](LICENSES/MIT-three.js.txt)) | Copyright © 2010-2023 three.js authors | [npm `three@0.160.0`](https://www.npmjs.com/package/three/v/0.160.0), tarball integrity `sha512-DLU8lc0zNIPkM7rH5/e1Ks1Z8tWCGRq6g8mPowdDJpw1CFBJMU7UoJjC6PefXW7z//SSl0b2+GCw14LB+uDhng==` |
| `app/renderer/vendor/three/addons/postprocessing/UnrealBloomPass.js` | Three.js addon (S18 bloom); `examples/jsm/postprocessing/UnrealBloomPass.js`, with only its `'three'` import rewritten to `../../three.module.min.js` (app/vendor-three.test.js proves it) | 0.160.0 | MIT ([text](LICENSES/MIT-three.js.txt)) | Copyright © 2010-2023 three.js authors | [npm `three@0.160.0`](https://www.npmjs.com/package/three/v/0.160.0), tarball integrity `sha512-DLU8lc0zNIPkM7rH5/e1Ks1Z8tWCGRq6g8mPowdDJpw1CFBJMU7UoJjC6PefXW7z//SSl0b2+GCw14LB+uDhng==` |
| `app/renderer/vendor/three/addons/shaders/CopyShader.js` | Three.js addon (S18 bloom); `examples/jsm/shaders/CopyShader.js`, with only its `'three'` import rewritten to `../../three.module.min.js` (app/vendor-three.test.js proves it) | 0.160.0 | MIT ([text](LICENSES/MIT-three.js.txt)) | Copyright © 2010-2023 three.js authors | [npm `three@0.160.0`](https://www.npmjs.com/package/three/v/0.160.0), tarball integrity `sha512-DLU8lc0zNIPkM7rH5/e1Ks1Z8tWCGRq6g8mPowdDJpw1CFBJMU7UoJjC6PefXW7z//SSl0b2+GCw14LB+uDhng==` |
| `app/renderer/vendor/three/addons/shaders/LuminosityHighPassShader.js` | Three.js addon (S18 bloom); `examples/jsm/shaders/LuminosityHighPassShader.js`, with only its `'three'` import rewritten to `../../three.module.min.js` (app/vendor-three.test.js proves it) | 0.160.0 | MIT ([text](LICENSES/MIT-three.js.txt)) | Copyright © 2010-2023 three.js authors | [npm `three@0.160.0`](https://www.npmjs.com/package/three/v/0.160.0), tarball integrity `sha512-DLU8lc0zNIPkM7rH5/e1Ks1Z8tWCGRq6g8mPowdDJpw1CFBJMU7UoJjC6PefXW7z//SSl0b2+GCw14LB+uDhng==` |
| `app/renderer/vendor/three/addons/shaders/OutputShader.js` | Three.js addon (S18 bloom); `examples/jsm/shaders/OutputShader.js`, with only its `'three'` import rewritten to `../../three.module.min.js` (app/vendor-three.test.js proves it) | 0.160.0 | MIT ([text](LICENSES/MIT-three.js.txt)) | Copyright © 2010-2023 three.js authors | [npm `three@0.160.0`](https://www.npmjs.com/package/three/v/0.160.0), tarball integrity `sha512-DLU8lc0zNIPkM7rH5/e1Ks1Z8tWCGRq6g8mPowdDJpw1CFBJMU7UoJjC6PefXW7z//SSl0b2+GCw14LB+uDhng==` |

The five xterm.js npm packages above were all published from the same xterm.js commit, `f447274`
(each package's `gitHead`).

## Adapted agent files (`.claude/agents/`)

These project agents (S39 and S40) are edited copies of other projects' agent prompts, or, for
`pr-reviewer`, Mako's own reviewer with parts of one folded in. Each file's header comment names its
source, its licence and what Mako changed. Details and file hashes:
[docs/decisions/OSS-ecc.md](docs/decisions/OSS-ecc.md).

| File | Upstream file | Licence | Copyright | Source (pinned) |
|---|---|---|---|---|
| `.claude/agents/security-reviewer.md` | ECC `agents/security-reviewer.md` (v2.2.3) | MIT ([text](LICENSES/MIT-ECC.txt)) | Copyright (c) 2026 Affaan Mustafa | [affaan-m/ECC@d2ef268](https://github.com/affaan-m/ECC/tree/d2ef2680594f9a17526a6e1a2e18b3d242c5d17b) |
| `.claude/agents/typescript-reviewer.md` | ECC `agents/typescript-reviewer.md` (v2.2.3) | MIT ([text](LICENSES/MIT-ECC.txt)) | Copyright (c) 2026 Affaan Mustafa | [affaan-m/ECC@d2ef268](https://github.com/affaan-m/ECC/tree/d2ef2680594f9a17526a6e1a2e18b3d242c5d17b) |
| `.claude/agents/silent-failure-hunter.md` | Anthropic `pr-review-toolkit` plugin, `agents/silent-failure-hunter.md` (1.0.1) | Apache-2.0 ([text](LICENSES/Apache-2.0.txt)) | No copyright line or NOTICE file upstream; author: Anthropic (`plugin.json`) | [anthropics/claude-plugins-official@b5b01ac, `plugins/pr-review-toolkit`](https://github.com/anthropics/claude-plugins-official/tree/b5b01ac4f889fec0c4c6bb89f27ca7c8574473f6/plugins/pr-review-toolkit) |
| `.claude/agents/pr-test-analyzer.md` | Anthropic `pr-review-toolkit` plugin, `agents/pr-test-analyzer.md` (1.0.1) | Apache-2.0 ([text](LICENSES/Apache-2.0.txt)) | No copyright line or NOTICE file upstream; author: Anthropic (`plugin.json`) | [anthropics/claude-plugins-official@b5b01ac, `plugins/pr-review-toolkit`](https://github.com/anthropics/claude-plugins-official/tree/b5b01ac4f889fec0c4c6bb89f27ca7c8574473f6/plugins/pr-review-toolkit) |
| `.claude/agents/pr-reviewer.md` | Parts of ECC `agents/code-reviewer.md` (v2.2.3), folded into Mako's own reviewer | MIT ([text](LICENSES/MIT-ECC.txt)) | Copyright (c) 2026 Affaan Mustafa | [affaan-m/ECC@d2ef268](https://github.com/affaan-m/ECC/tree/d2ef2680594f9a17526a6e1a2e18b3d242c5d17b) |
| `.claude/agents/planner.md` | ECC `agents/planner.md` (v2.2.3) | MIT ([text](LICENSES/MIT-ECC.txt)) | Copyright (c) 2026 Affaan Mustafa | [affaan-m/ECC@d2ef268](https://github.com/affaan-m/ECC/tree/d2ef2680594f9a17526a6e1a2e18b3d242c5d17b) |
| `.claude/agents/agent-evaluator.md` | ECC `agents/agent-evaluator.md` (v2.2.3) | MIT ([text](LICENSES/MIT-ECC.txt)) | Copyright (c) 2026 Affaan Mustafa | [affaan-m/ECC@d2ef268](https://github.com/affaan-m/ECC/tree/d2ef2680594f9a17526a6e1a2e18b3d242c5d17b) |
| `docs/HARNESS-CHANGES.md` | The method of ECC `agents/harness-optimizer.md` (v2.2.3), rewritten as text | MIT ([text](LICENSES/MIT-ECC.txt)) | Copyright (c) 2026 Affaan Mustafa | [affaan-m/ECC@d2ef268](https://github.com/affaan-m/ECC/tree/d2ef2680594f9a17526a6e1a2e18b3d242c5d17b) |

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

## npm packages outside the permissive list

`npm ci` in `app/` installs these from the npm registry; none of them is stored in this repository.
They are the only packages in `app/package-lock.json` whose declared licence isn't one of the
permissive licences listed in `app/licence-policy.js` (S57). Each is an optional platform package
of sharp, which `@huggingface/transformers` depends on; npm installs only the one for the machine it
runs on. The libvips image library in them is LGPL-3.0-or-later and stays a separate prebuilt
library that sharp loads at run time.

| npm package | Version | Licence (as declared) | Source |
|---|---|---|---|
| `@img/sharp-libvips-darwin-arm64` | 1.2.4 | LGPL-3.0-or-later | [lovell/sharp-libvips](https://github.com/lovell/sharp-libvips) |
| `@img/sharp-libvips-darwin-x64` | 1.2.4 | LGPL-3.0-or-later | [lovell/sharp-libvips](https://github.com/lovell/sharp-libvips) |
| `@img/sharp-libvips-linux-arm` | 1.2.4 | LGPL-3.0-or-later | [lovell/sharp-libvips](https://github.com/lovell/sharp-libvips) |
| `@img/sharp-libvips-linux-arm64` | 1.2.4 | LGPL-3.0-or-later | [lovell/sharp-libvips](https://github.com/lovell/sharp-libvips) |
| `@img/sharp-libvips-linux-ppc64` | 1.2.4 | LGPL-3.0-or-later | [lovell/sharp-libvips](https://github.com/lovell/sharp-libvips) |
| `@img/sharp-libvips-linux-riscv64` | 1.2.4 | LGPL-3.0-or-later | [lovell/sharp-libvips](https://github.com/lovell/sharp-libvips) |
| `@img/sharp-libvips-linux-s390x` | 1.2.4 | LGPL-3.0-or-later | [lovell/sharp-libvips](https://github.com/lovell/sharp-libvips) |
| `@img/sharp-libvips-linux-x64` | 1.2.4 | LGPL-3.0-or-later | [lovell/sharp-libvips](https://github.com/lovell/sharp-libvips) |
| `@img/sharp-libvips-linuxmusl-arm64` | 1.2.4 | LGPL-3.0-or-later | [lovell/sharp-libvips](https://github.com/lovell/sharp-libvips) |
| `@img/sharp-libvips-linuxmusl-x64` | 1.2.4 | LGPL-3.0-or-later | [lovell/sharp-libvips](https://github.com/lovell/sharp-libvips) |
| `@img/sharp-wasm32` | 0.34.5 | Apache-2.0 AND LGPL-3.0-or-later AND MIT | [lovell/sharp](https://github.com/lovell/sharp) |
| `@img/sharp-win32-arm64` | 0.34.5 | Apache-2.0 AND LGPL-3.0-or-later | [lovell/sharp](https://github.com/lovell/sharp) |
| `@img/sharp-win32-ia32` | 0.34.5 | Apache-2.0 AND LGPL-3.0-or-later | [lovell/sharp](https://github.com/lovell/sharp) |
| `@img/sharp-win32-x64` | 0.34.5 | Apache-2.0 AND LGPL-3.0-or-later | [lovell/sharp](https://github.com/lovell/sharp) |

The full LGPL-3.0 text isn't in `LICENSES/` yet; each package ships its own licence files.

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

The two fonts (S66, 2026-11-24) were checked the same way against their upstream release files
rather than npm: `Inter-4.1.zip` (sha256 `9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e`)
and `CascadiaCode-2407.24.zip` (sha256 `e67a68ee3386db63f48b9054bd196ea752bc6a4ebb4df35adce6733da50c8474`),
downloaded from each project's GitHub release for the tag linked above; each font file here is the
named file in its zip, byte for byte (`InterVariable.woff2` sha256 `693b77d4…29a8e3`,
`CascadiaCode.woff2` sha256 `3ec1f7e7…bc60dccc`). The fonts are copied unmodified, so the Reserved
Font Name in Cascadia Code's licence doesn't apply (it restricts modified versions). The licence
texts in `LICENSES/` are each project's own licence file at that tag.

## Keeping this file current

Anyone who adds, replaces or updates a file under `app/renderer/vendor/` updates its row here, and
adds any new licence text to `LICENSES/`. The test `app/third-party-notices.test.js` (run by
`npm test` in `app/`) checks that every tracked file under `app/renderer/vendor/` has a row, that
every row names a tracked file, and that every licence file linked here exists. Since S57 it also
fails if an npm package in `app/package-lock.json` or a row in this file's file tables carries a
licence that isn't on the permissive list in `app/licence-policy.js` and isn't one of that file's
named exceptions, and if the npm table above doesn't list exactly those exceptions with the
licence and version the lockfile has.
