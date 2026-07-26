# Builder Handoff — Blue Helm 1.0 Portable Family Distribution Scope

Branch: `codex/docs-v1-portable-distribution`
Fork-point SHA: `6baa732e35bba46d3ace135d8116d6a7eb2f103a`
Pre-merge main SHA: `6baa732e35bba46d3ace135d8116d6a7eb2f103a`
Tip SHA: `e3ab0c18f8a6799b3e6c52028b1f0af879c1618b`
Merge commit SHA: Pending until merge

Intended invariant:

Blue Helm 1.0 is not complete until it has a portable, organized family build,
clean-machine setup instructions, per-machine credentials, redistribution
license checks, and a proven zero-recurring-signing-cost distribution route.
The Electron 42.5.0 signed-upstream-binary swap is closed without falsely
closing the free Store MSIX or eligible OSS-signing candidates. A public
Microsoft Store launch is not required.

Files changed:

- `BLUE-HELM-MASTER-STATUS.md`
- `docs/INSTALL-WINDOWS.md`
- `docs/SMART-APP-CONTROL-AND-DISTRIBUTION.md`
- `docs/AUDIT-SCOPE-environment-deployment.md`
- `docs/BUILDER-HANDOFF-v1-portable-family-distribution-scope.md`

Security-sensitive surfaces touched:

None. This branch changes project scope documentation only.

Commands run:

- Read `AGENTS.md`, `docs/AI-COLLABORATION.md`,
  `docs/BUILDER-HANDOFF-TEMPLATE.md`, `BLUE-HELM-MASTER-STATUS.md`, and the
  latest platform handoff.
- `git diff --check`
- `git diff --stat`
- `git diff -- BLUE-HELM-MASTER-STATUS.md`
- Read-only verification against current Microsoft Smart App Control, Windows
  distribution, Store onboarding, and Artifact Signing documentation.
- Read-only verification against Electron packaging/signing documentation and
  SignPath Foundation's current OSS eligibility terms.
- Verified that the transferred EDA-1 audit's carried STT missing-runtime claim
  was historical and fixed: the current app declares
  `@huggingface/transformers` 3.8.1 as a production dependency. EDA-1 retains
  it as a positive-control lesson and requires clean-clone proof instead of
  reopening it as a current defect.

Exact test results:

No runtime tests were run because no runtime, package, script, or configuration
file changed. `git diff --check` exited 0. The generated pinned review diff
reproduces the reviewed range byte-for-byte.

Manual verification:

- The new distribution item is ordered before the release gate and daily-driver
  acceptance day.
- The release gate and daily-driver items were renumbered from 11/12 to 12/13.
- The ship-goal wording now distinguishes a required family-distribution
  package from a non-required public Store launch.
- The scope explicitly makes recurring paid signing optional and non-blocking.
- The transferred Claude evidence is retained as a bounded closure of the
  official signed-Electron-42.5.0 swap, not overstated as proof that every
  zero-dollar distribution route is closed.
- `docs/INSTALL-WINDOWS.md` gives the current direct-build recipient an honest,
  human-only Smart App Control procedure and troubleshooting path without
  disabling Defender or using registry bypasses.
- The distribution matrix retains direct transfer as the guaranteed fallback,
  Store-signed MSIX as the preferred time-boxed prototype, SignPath as
  conditional/approval-based, and paid signing as optional.
- Current Microsoft documentation permits US/Canada individual Public Trust
  identities; the transferred “three-year organization only” claim was not
  retained.
- EDA-1 is now an explicit read-only release step after portable packaging and
  before the functional release gate. It inventories host policy, toolchain,
  providers, paths, licensing/assets, network/privacy, locale/time, power
  state, Windows servicing, and recipient-machine assumptions.
- EDA-1's highest-value test is a clean-clone/clean-machine install using only
  `docs/INSTALL-WINDOWS.md`; all undocumented interventions become findings.
- EDA-1 makes no fixes. Blocking remediations receive separate normally gated
  work orders, and the release gate cannot begin until each 1.0 blocker is
  resolved or explicitly accepted.

Known limitations:

This branch records the release requirement and current Windows launch
guidance; it does not implement packaging, first-run configuration, signing,
Store submission, or clean-machine testing. Those require a separate
spec-before-code work order near the end of 1.0. Store certification and
SignPath acceptance remain candidates, not promised outcomes. EDA-1 is an
audit scope, not evidence that its assumptions already hold; its findings
report remains future release work.

Unexpected pre-existing findings:

The July 23 checkpoint baseline still describes V3a as current even though V3b
is now merged at `6baa732`. That broader status refresh is outside this
single-purpose branch.

Recommended review focus:

Confirm that the new scope is achievable without requiring a public Store
launch or recurring certificate subscription, that credentials remain
per-machine, and that clean-machine acceptance is concrete. Check the
fact/inference boundary around the upstream Electron comparison, the Smart App
Control tradeoff, free Store MSIX signing/onboarding, Artifact Signing
individual eligibility, and conditional SignPath eligibility. For the EDA-1
delta, confirm that the scope is comprehensive without reintroducing stale
findings, that it remains read-only, and that its clean-machine acceptance is
sequenced after packaging and before the release gate.

Review diff:
Full reviewed range:
`git diff 6baa732e35bba46d3ace135d8116d6a7eb2f103a...e3ab0c18f8a6799b3e6c52028b1f0af879c1618b --output=.agent-review-v1-portable-family-distribution-scope.diff`

Scoped EDA-1 delta:
`git diff 1cfd9e4545306fca7bb6ae2690bd71bfca0193d3...e3ab0c18f8a6799b3e6c52028b1f0af879c1618b --output=.agent-review-v1-portable-family-distribution-eda1-delta.diff`

Reviewer verdict:

- Base portable-distribution review over
  `6baa732e35bba46d3ace135d8116d6a7eb2f103a...bbedda2e7f894354092740692b4fe34b2ea43bfb`:
  `VERDICT: PASS`
- Scoped EDA-1 delta review: Pending.

Reviewer verdict source:

Base verdict source: attached `Reviewer Report — V1 Portable Family
Distribution Scope (docs-only)`, read-only Standard-class review supplied by
Blue on July 26, 2026. The report also verified the one-commit handoff-only
tail through `1cfd9e4`, pinned-diff byte equality, current external policy
claims, and untouched `main`/`origin/main`.

## Review-diff rule

- Review the three-dot range named above.
- Always create the pinned diff with `git diff --output`; never use PowerShell
  redirection.
- Read the literal `VERDICT: PASS|FAIL` line before any merge decision.
- Blue remains the only merge authority.
