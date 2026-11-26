# OSS record: the brain tab's stage and shark (S18)

Written 2026-11-26 by the runner session that builds S18 (PR #311). Sources: docs/DESIGN-BRIEF-1.1.md
sections 7 and 10, docs/decisions/OSS-ui-libraries.md (S63), and the npm registry.

## Blue's verdict (word for word)

> Three.js: "Three.js is fine, that has my okay" (design brief section 7). The pin was left to the
> pin-and-scan step below.
>
> The task-node web, Ctrl+F and the conversation widgets: no verdict yet (OSS-ui-libraries.md,
> "Date and verdict" still blank).

## Verdicts

| Piece | Verdict | Why |
|---|---|---|
| Shark renderer: **Three.js 0.160.0** | **ADOPT** (Blue's OK of the engine; the pin is the builder's, 🤖 builder's default, D-090) | The version the shark was tuned on (brief question 7). Vendored, see the scan below. |
| Task-node stage | **BUILD FRESH**, small (🤖 builder's default, D-090) | Cytoscape.js is "PROTOTYPE aimed at ADOPT, Blue's verdict pending", and the brief says S18 builds on it only after his verdict. The stage needs at most 8 nodes or groups in urgency rows, which about 150 lines of DOM do with no new dependency. If Blue adopts Cytoscape.js, `layoutItems` and `nodeButton` in `app/renderer/brain-stage.js` are the two places it replaces. |
| Ctrl+F | **BUILD FRESH**, small (🤖 builder's default, D-090) | MiniSearch is "ADOPT proposed, verdict pending". A live stage holds tens of tasks, so an every-word match over title and content, title hits first, is enough; MiniSearch can replace `findTasks` after his verdict. |
| Conversation column and message box | **BUILD FRESH** shell (🤖 builder's default, D-090) | Deep Chat's published bundle fails the China-origin rule as shipped (S63). S18 builds only the column, cards and box; the conductor's content is S51's. |

## Pin and scan: three@0.160.0 (2026-11-26)

- **Registry facts (verified, `npm view three@0.160.0`):** licence MIT; no dependencies; maintainers
  mrdoob and mugen87; tarball integrity
  `sha512-DLU8lc0zNIPkM7rH5/e1Ks1Z8tWCGRq6g8mPowdDJpw1CFBJMU7UoJjC6PefXW7z//SSl0b2+GCw14LB+uDhng==`,
  matched by hashing the downloaded tarball.
- **What is vendored:** `build/three.module.js` unmodified, and the ten addon files the bloom needs
  (`EffectComposer`, `MaskPass`, `ShaderPass`, `Pass`, `RenderPass`, `UnrealBloomPass`,
  `OutputPass`, `CopyShader`, `LuminosityHighPassShader`, `OutputShader`), under
  `app/renderer/vendor/three/`. The only change is the addons' bare `'three'` import, rewritten to
  `../../three.module.js` because the renderer's CSP allows no inline import map.
  `app/vendor-three.test.js` pins every file by hash and proves that is the only change.
  `BufferGeometryUtils` (listed in the brief) is not vendored: the renderer doesn't need it.
- **Licence:** MIT, text in `LICENSES/MIT-three.js.txt`, one row per file in THIRD-PARTY-NOTICES.md.
- **Network and code-loading scan (verified, grep over the vendored files):** no `eval`, `new
  Function`, `WebSocket` or `importScripts`. `three.module.js` has three `fetch(` calls, all in its
  file and image loaders (`FileLoader`, `ImageBitmapLoader`), which the renderer never calls; the
  renderer's CSP limits connections to `'self'` and `https:` either way.
- **China-origin check:** pass. Three.js is a rendering library with no models and no hosted AI.
- **`npm audit`:** not run: nothing was added to `app/package.json` or the lockfile (the files are
  vendored like xterm.js and the fonts), so the audit's package set is unchanged.
