# OSS record: Playwright for the e2e smoke test (S72)

Written 2026-11-26 by the scheduled Claude runner (S72, PR #306), in the AGENTS.md OSS shape.

## Need

Mako had no end-to-end test: nothing in CI started the real app and looked at its window. Plan row
S72 adds one CI job on GitHub's Windows runners that starts Mako and checks that its first window
loads.

## Option and verdict

**Playwright** (Microsoft), its experimental Electron API `_electron.launch`, taken up through
ECC's `e2e-testing` skill, which Blue gave **PROTOTYPE** (BLUE-CHECKLIST.md step 82; his words,
2026-11-25: "Step 82: ECC skills - proceed with all of your recommendations. i agree, thanks";
docs/decisions/OSS-ecc.md, "Top picks" item 3). Blue named Playwright's `_electron.launch` in the
plan row itself (docs/PLAN-1.1.md S72, 2026-11-25), so adopting it is the default and no other
option was searched for. The ECC skill was used as a pattern list only (its record entry: "page
objects, config, flaky-test handling, artifacts"); its files were not re-read for this row and
nothing was copied from it.

## Pin (pin-and-scan, 2026-11-26)

- **Package:** `playwright-core` (the library without the test runner and without any browser
  download), devDependency, exact version **1.65.1**, the npm `latest` tag on 2026-11-26,
  published 2026-11-13. Verified: `npm view playwright-core dist-tags` and `time`.
- **Integrity:** `sha512-hqPpz7blSMPxWVdoeE1yiBSzXsKiVOd2k+kjCvmUywD2GPO2Dd9HfcWnq9NN0GHbNZDFgZ9JfBFr+X5/BLo0qw==`,
  the same in npm's registry metadata, in `app/package-lock.json` and in a hash of the tarball
  fetched with `npm pack` (sha256 of the tarball:
  `6f5a60be62a4fddfbe7d10c448d8fbd54547da3358f2f8a04211440471ee863e`). Verified by command;
  `app/e2e-smoke.test.js` fails if the lockfile and this record differ.
- **Source:** `git+https://github.com/microsoft/playwright.git`, npm `gitHead`
  `bbd948344ea9a60bf1e6f125c02ca99b2b51593b`. npm lists an SLSA provenance attestation for this
  version. **Not verified:** that the commit matches the `v1.65.1` tag on GitHub and that the
  attestation checks out (this session reads only Blue's repository). To check in under 2
  minutes: open `https://github.com/microsoft/playwright/releases/tag/v1.65.1` and compare the
  commit, or run `npm audit signatures` in `app/`.
- **Licence:** Apache-2.0 (permissive; `app/licence-policy.js` passes it with no exception).
- **Install-time code:** none. The package declares no `scripts` and no dependencies, so `npm ci`
  runs nothing of it and pulls nothing else in. It never downloads a browser here: the smoke
  test drives the repository's own pinned Electron.
- **China-origin rule:** passed. Playwright is Microsoft's; it calls no model. A search of all
  116 shipped files for Qwen, DeepSeek, Zhipu/ChatGLM/GLM, Moonshot/Kimi, Doubao, Baichuan and
  MiniMax found nothing.
- **Already in the tree:** `@playwright/mcp` 0.0.84 (Mako's page reader) brings its own
  `playwright-core` 1.65.0-alpha. That copy is unchanged; npm now nests it under
  `@playwright/mcp` and `playwright`, and the smoke test uses only the 1.65.1 pin.
- **SkillSpector:** not run. It scans agent skills, and this is an npm library with no skill
  files; the checks above stand in for it (builder's reading).

## Experimental API

Playwright documents its Electron support as experimental. The smoke script therefore treats any
Playwright failure as a test failure, with the step that failed, and never retries or skips; the
job's two negative controls prove on every run that it still can fail. Moving to a newer
Playwright is a reviewed pin change to this record, `app/package.json` and the lockfile.
