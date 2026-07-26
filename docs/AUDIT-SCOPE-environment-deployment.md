# AUDIT SCOPE — Environment and Deployment Assumptions (EDA-1)

## Purpose

This audit covers the class of release risk that code review alone does not:
facts that must remain true about the computer, operating system, installed
tools, network, external providers, filesystem, and packaged assets for Blue
Helm to launch and work correctly.

Smart App Control exposed the gap. The application did not regress, but a host
policy began refusing the unsigned Electron runtime before Blue Helm code
started. EDA-1 turns those environmental assumptions into an explicit release
inventory.

## Position in the 1.0 sequence

Run EDA-1 after the portable family package and setup instructions exist, and
before the full functional release gate.

- **Tier:** Standard-class, read-only investigation.
- **Blast radius:** a missed assumption can create false release confidence,
  but the audit itself performs no mutation.
- **Model routing:** Sonnet may collect the mechanical inventory; Opus reviews
  blast radius, silent-degradation risk, recipient experience, and final 1.0
  disposition.
- **Output:** a durable findings report only.

No dependency upgrade, security-setting change, fix, packaging change, or
production-code edit is authorized by this audit. Every remediation receives a
separate spec-before-code work order and its normal gate.

## Method

For every assumption, record:

1. **Assumption** — a falsifiable sentence.
2. **Evidence** — command output, version, primary-source link, clean-machine
   observation, or explicit `UNVERIFIED`.
3. **Blast radius** — launch failure, visible feature refusal, silent wrong
   behavior, cost exposure, credential exposure, or data loss.
4. **Warning time** — announced deprecation, update-time break, background
   policy flip, or unknown.
5. **Detection** — existing alert/test/preflight, manual discovery, or none.
6. **Severity and 1.0 disposition** — blocker, accepted residual, or post-1.0.

Facts, inferences, and unverified assumptions must be labelled separately.
“Should work” is not equivalent to a second-machine acceptance result.

## A. Host OS and platform policy

- Establish and document the actual minimum supported Windows version/build.
- Inventory launch-blocking policy: Smart App Control, WDAC/AppLocker, S mode,
  Defender attack-surface-reduction rules, controlled-folder access,
  SmartScreen, and Mark of the Web.
- State the Windows 10 support position explicitly rather than silently
  inheriting its post-end-of-support risk.
- Identify anything requiring elevation, Developer Mode, a reboot, or a
  non-default Windows setting.
- Verify that every security-setting decision is human-only, documented, and
  fails visibly when unmet.
- Carry forward the known fact: Smart App Control blocks the current unsigned
  Electron runtime; `docs/INSTALL-WINDOWS.md` documents the direct-build
  choice, and distribution/signing remains a tracked 1.0 decision.

## B. Runtime and toolchain

- Inventory the pinned Node, Electron, npm, PowerShell, Pester, Git, Claude
  Code, Gemini, Python, compiler/build-tools, and Windows-runtime requirements.
- Record upgrade/EOL triggers and the tests required before changing each pin.
- Check native-module compatibility, including `node-pty`, Electron/Node ABI,
  ONNX Runtime, and required Visual C++ runtime components.
- Verify WebGPU requirements and the tested fallback/refusal behavior on a
  machine without a compatible GPU/driver.
- Verify TTS/STT from a clean clone. The historical missing
  `transformers.web.min.js` problem is **fixed**: the current app tracks
  `@huggingface/transformers` 3.8.1 as a production dependency. Use it as a
  positive-control lesson, not an open finding. Confirm that install,
  first-use model downloads/cache placement, offline refusal, and
  WebGPU-to-WASM behavior work without dev-machine-only files.
- Identify every generated, downloaded, cached, or gitignored runtime asset and
  prove a recipient can recreate it through documented steps.

## C. External services, providers, and command-line tools

- Gemini: model availability, access differences, deprecation policy,
  quota/capacity behavior, retry behavior, and visible refusal when a model
  disappears.
- Claude Code: supported continuation/resume commands, authentication state,
  version compatibility, and recipient-owned account requirements.
- `yt-dlp`, FFmpeg, and other media tools: installation, version discovery,
  stale/missing behavior, output-format assumptions, and update strategy.
- Quick Links, if merged at audit time: default-browser behavior and destination
  reachability only. Native Hexona/GoHighLevel, Outlook, Graph, or MCP access is
  outside 1.0 unless the durable scope changes.
- For every dependency, distinguish launch-time requirements from
  feature-use-only requirements and confirm failures refuse visibly.

## D. Filesystem and machine layout

- Remove or explicitly configure assumptions involving
  `D:\Workspace\...`, `D:\Gemini_Video_Review\...`, repository siblings, drive
  letters, and OneDrive-redirected desktop paths.
- Test spaces, non-ASCII usernames, long paths, missing drives, read-only
  locations, controlled folders, and unavailable network/removable drives.
- Verify non-admin and multi-user behavior.
- Measure disk-space needs for dependencies, model caches, worktrees, run
  reports, and temporary media.
- Confirm V5c cleanup remains manifest-owned and that low-disk/failed-cleanup
  conditions refuse or report visibly without deleting unrelated content.

## E. Distribution, licensing, and recipient machines

- Produce the complete recipient setup sequence and execute it on a Windows
  account/computer that has never built Blue Helm.
- Enumerate prerequisites, how each is detected, and the visible message when
  it is absent.
- Audit redistribution licenses and notices for Electron, all npm/native
  dependencies, bundled tools, fonts, icons, vendored assets, and model
  weights. Flag non-commercial, attribution, copyleft, model-specific, or
  no-redistribution terms separately from source-code licenses.
- Verify that no required runtime asset is present only because it is
  gitignored, cached, junctioned, or manually copied on the development box.
- Verify uninstall/cleanup instructions and confirm they do not remove user
  reports, manifests, unrelated repositories, or credentials without explicit
  authorization.
- Record the chosen zero-recurring-signing-cost distribution path and its
  recipient-facing trust/security behavior.

## F. Offline, network, privacy, and telemetry posture

- Identify every network request at launch, first use, and explicit feature
  use.
- Test fully offline launch and representative offline feature failures for
  visible refusal, bounded timeout, and no hanging UI.
- Verify no renderer asset, font, icon, or production dependency is fetched
  from an undeclared CDN at runtime.
- Re-check telemetry and phone-home behavior against the exact locked versions
  shipped, not merely the version originally evaluated.
- Verify provider credentials remain main-process-side/per-machine and never
  enter fenced PTYs, logs, reports, manifests, crash output, setup screenshots,
  or distributable files.

## G. Time, locale, power state, and Windows servicing

- Test timezone and DST boundaries in run IDs, manifest timestamps, retention
  age gates, Library sorting, and approximate backfill dates.
- Test non-US locale and encoding assumptions, including UTF-8/UTF-16,
  decimal/date formatting, Unicode paths, and PowerShell output handling.
- Test sleep/resume and reboot behavior, including PTY/session state and
  prevention of automatic paid-work restart.
- Test launch and one representative workflow after a Windows cumulative or
  feature update.
- Record what version/configuration evidence is needed to diagnose the next
  environment-only failure.

## Highest-value acceptance test

On a Windows machine or clean local account that has never built Blue Helm:

1. Start from the approved release source/package.
2. Follow only `docs/INSTALL-WINDOWS.md`.
3. Do not reuse the development machine's `node_modules`, model cache,
   junctions, shortcuts, credentials, provider sessions, or absolute paths.
4. Install/configure only prerequisites the guide names.
5. Launch Blue Helm.
6. Configure recipient-owned credentials.
7. Run one non-paid UI smoke and one representative explicitly authorized
   agent workflow.
8. Record every undocumented intervention as an EDA-1 finding.

This is a release test, not permission to copy Blue's credentials or perform
unbounded provider spend.

## Deliverable

Create a findings table divided into:

1. **Blocks Blue Helm 1.0** — fix or explicitly accept before release.
2. **Accepted residuals/post-1.0** — owner and trigger condition required.
3. **Verified holding** — evidence and re-check trigger retained as a living
   assumptions inventory.

Each row must contain all six method fields. Unverified assumptions are
findings, not blank cells.

The release gate begins only after every 1.0 blocker has a merge record or an
explicit human acceptance record.

