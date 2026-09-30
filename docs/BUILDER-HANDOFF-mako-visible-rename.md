# Builder Handoff: Mako visible-branding rename

Branch: `codex/mako-visible-rename`

Fork-point SHA: `8b6c9638c06599b688911a5f4b5871d6b7c11079`

Pre-merge main SHA: `8b6c9638c06599b688911a5f4b5871d6b7c11079`

Tip SHA: Pending implementation and review

Merge commit SHA: Pending until merge

## Intended invariant

Change the product-facing name from **Blue Helm / Command Center** to **Mako** before
daily-driver acceptance, while preserving the accepted and integrated Fence stack and
all compatibility identities. The rename must not change enforcement, admission behavior,
storage, migration behavior, protocols, executable commands, or historical evidence.

This branch follows the release sequence recorded in
`outputs/MAKO-RELEASE-RESUMPTION-2026-09-27.md`: the Fence stack is already accepted,
integrated, pushed, and deployed at the fork point; this visible rename precedes the
daily-driver day. H1 is complete and must not be rerun.

This is branding maintenance, not a new subsystem. The OSS-first procurement gate is not
triggered because no dependency, SDK, service, or subsystem is introduced.

## Authorized 13-path cap

No fourteenth path may be edited without a new approval.

1. `app/main.js`
2. `app/package.json`
3. `app/renderer/index.html`
4. `app/renderer/app.js`
5. `app/renderer/admission-view.js`
6. `app/renderer/pane-status-badge.js`
7. `scripts/hooks/fence-write.js`
8. `app/renderer/pane-maximize.test.js`
9. `app/pty-start-authority-main.test.js`
10. `app/mako-branding.test.js`
11. `app/README.md`
12. `docs/INSTALL-WINDOWS.md`
13. `docs/BUILDER-HANDOFF-mako-visible-rename.md`

## Preserved compatibility and evidence

The following must remain unchanged:

- repository and package identity `command-center`;
- `%APPDATA%\command-center`, `.command-center`, sandbox paths, and existing data;
- `BLUE_HELM_*` environment variables;
- ledger schema and contents;
- IPC names, protocol values, installation IDs, and all stable reason codes;
- executable commands, command lines, code blocks, and shortcut target details;
- prior handoffs, verdicts, hashes, filenames, quoted evidence, and historical records.

The existing anchor icon remains. This branch changes the visible name, not the visual
identity system.

## Security-sensitive surface and explicit hook re-pin

The only authorized edit to `scripts/hooks/fence-write.js` is changing the three
user-visible refusal-string brand names from `Blue Helm` to `Mako`. Tool parsing, path and
origin resolution, allow/deny decisions, response structure, and these stable reason codes
must remain unchanged:

- `fence-webfetch-denied`
- `fence-input-unverifiable`
- `fence-outside-sandbox`

Baseline tracked and installed hook identity at the fork point:

- SHA-256: `A04A95BC247C8969B3156F432DA25E4193E4B66B26FF9F911C0EA9B80AB3820A`

The final tracked hook byte length and SHA-256 will be measured after implementation and
recorded here. There is no literal production hook hash to patch: `app/main.js` computes the
tracked file's SHA-256 at startup and `app/role-fence-policy.js` compares it with the deployed
file. The existing role-policy mismatch tests remain unchanged and must pass. The exact
refusal-message assertions in `app/pty-start-authority-main.test.js` move with the approved
strings.

No user-scope deployment is authorized by this branch plan. Until a separately authorized
post-merge deployment installs the reviewed hook bytes, the merged application must refuse
fenced launches on hook-content mismatch.

## Validation boundary

Automated validation:

- focused branding test and affected exact-string tests;
- fence authority and role-policy suites;
- full app suite;
- full Pester suite;
- `git diff --check`;
- explicit scans proving protected compatibility identifiers remain unchanged.

Bounded restarted-app smoke:

- fully stop Electron, then launch the normal branch build once;
- inspect the window title, top-level brand, and reachable branding surfaces;
- use no provider prompt, agent pane, controlled admission, or ledger mutation;
- perform no user-scope hook deployment or shortcut mutation;
- close Electron normally and record the result.

Hook deployment and desktop-shortcut renaming each require separate authorization after a
Full-class PASS and merge. Shortcut verification must preserve target, arguments, working
directory, and icon.

## Review class and focus

Class: **Full** because the hook bytes and their integrity identity change.

Security review is bounded to the hook string diff, new hook identity, stable reason codes,
byte-identity enforcement, admission behavior, and deployment consequences. The remaining
branding and current-documentation edits receive proportionate review. This branch does not
reopen H1 or the accepted Fence architecture.

## Files changed

Pre-registration only at this commit. Final list pending implementation.

## Commands run

Pending.

## Exact test results

Pending.

## Manual verification

Pending.

## Known limitations

- Internal compatibility names intentionally remain visible to maintainers and in diagnostic
  evidence where changing them would be a migration or historical rewrite.
- Desktop-shortcut renaming and user-scope hook deployment are not part of implementation.

## Unexpected pre-existing findings

None at pre-registration.

## Recommended review focus

Confirm that the 13-path cap held; historical evidence and technical identifiers did not
move; the hook diff changes only the three brand literals; stable reason codes and enforcement
remain unchanged; and the new hook identity is consistently measured and enforced.

## Review diff

Generate with:

`git diff --no-color --no-ext-diff 8b6c9638c06599b688911a5f4b5871d6b7c11079...<tip-sha> --output=.agent-review-mako-visible-rename.diff`

Reviewer verdict: Pending

Reviewer verdict source: Pending independent Full-class review

## Review-diff rule

- Before merge, use `git diff 8b6c9638c06599b688911a5f4b5871d6b7c11079...<tip>`.
- After merge, reproduce the reviewed delta with the same recorded pre-merge main SHA.
- Always use `--output`; do not use PowerShell `>` for pinned review diffs.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it.
- Pinned `.agent-review-*.diff` files remain local and gitignored.
