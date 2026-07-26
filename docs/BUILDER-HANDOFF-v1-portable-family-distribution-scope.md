# Builder Handoff — Blue Helm 1.0 Portable Family Distribution Scope

Branch: `codex/docs-v1-portable-distribution`
Fork-point SHA: `6baa732e35bba46d3ace135d8116d6a7eb2f103a`
Pre-merge main SHA: `6baa732e35bba46d3ace135d8116d6a7eb2f103a`
Tip SHA: `bbedda2e7f894354092740692b4fe34b2ea43bfb`
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

Known limitations:

This branch records the release requirement and current Windows launch
guidance; it does not implement packaging, first-run configuration, signing,
Store submission, or clean-machine testing. Those require a separate
spec-before-code work order near the end of 1.0. Store certification and
SignPath acceptance remain candidates, not promised outcomes.

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
individual eligibility, and conditional SignPath eligibility.

Review diff:
`git diff 6baa732e35bba46d3ace135d8116d6a7eb2f103a...bbedda2e7f894354092740692b4fe34b2ea43bfb --output=.agent-review-v1-portable-family-distribution-scope.diff`

Reviewer verdict:

Pending.

Reviewer verdict source:

Pending.

## Review-diff rule

- Review the three-dot range named above.
- Always create the pinned diff with `git diff --output`; never use PowerShell
  redirection.
- Read the literal `VERDICT: PASS|FAIL` line before any merge decision.
- Blue remains the only merge authority.
