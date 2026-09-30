# Builder Handoff: Mako visible-branding rename

Branch: `codex/mako-visible-rename`

Fork-point SHA: `8b6c9638c06599b688911a5f4b5871d6b7c11079`

Pre-merge main SHA: `8b6c9638c06599b688911a5f4b5871d6b7c11079`

Tested application SHA: `3b1fdf625e3c0e17038bd4b33d376badd5ec3fda`

Tested application tree: `0122b8192aff537b2ec8309472b7707d1787e37a`

Review endpoint SHA: Pending this handoff-only smoke record and independent review

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

Final tracked hook identity after the approved three-string rename:

- byte length: `7,036`
- SHA-256: `E21F28D5BB2181D44CDEF787DD65550C4CFDEAAA1FC1FDAA23E5EB68CA135B09`

There is no literal production hook hash to patch: `app/main.js` computes the
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

Exactly the authorized 13 paths differ from the fork point. The implementation changes the
12 product/test/current-documentation paths and retains this pre-registration handoff as the
thirteenth path:

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

## Commands run

- `node mako-branding.test.js`
- `node renderer/pane-maximize.test.js`
- `node role-fence-policy.test.js`
- `node pty-start-authority-main.test.js`
- `node --check` for every changed JavaScript file
- `npm test`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\run-pester.ps1`
- `git diff --check`
- read-only branding, reason-code, compatibility-identifier, path-cap, and hook-diff scans

## Exact test results

- Branding contract: `22` passed, `0` failed.
- Pane maximize affected-string suite: `40` passed, `0` failed.
- Role fence policy: `146` passed, `0` failed.
- PTY authority/main: `414` passed, `0` failed.
- JavaScript syntax checks: all changed JavaScript files passed.
- Full app gate: `97` suites, `7,363` passed, `0` failed. This reconciles to the
  accepted 96-suite/7,340-assertion baseline plus the 22 new branding assertions and the
  package-script reachability assertion.
- Full Pester gate: `984` passed, `0` failed, `0` skipped; completed in `100.9s`.
- `git diff --check`: passed.

The full app gate used the fork point's already-installed dependency tree through a temporary
directory junction because this managed worktree intentionally had no independent
`app/node_modules`. Package dependencies and `app/package-lock.json` are unchanged. The
junction was test infrastructure only, was gitignored, and was removed after the bounded
smoke after its exact path, reparse-point type, and target were reverified.

Test-log identities retained outside the repository:

- app: `C:\Users\levij\AppData\Local\Temp\mako-visible-rename-npm-test.log`,
  `534,249` bytes, SHA-256
  `7B04F26BE67A9F962B3C5CC107D310F62B3F20E269A3576ACE792E559E110A63`;
- Pester: `C:\Users\levij\AppData\Local\Temp\mako-visible-rename-pester.log`,
  `151,770` bytes, SHA-256
  `1DCE96C45C8E1DDB1EA9C71FBD320B85B8FC06D8B66CD1817FD68A9FD551850E`.

The first sandboxed PTY-authority invocation encountered its documented Windows drive-root
fixture fallback: the managed worktree is on `C:` and the sandbox prevented creating the
drive-root fixture, so the fallback saw the user's real role directory. The same suite was
then run outside the filesystem sandbox and passed `414/0`; this was a harness-environment
condition, not a product assertion failure.

## Manual verification

Bounded restarted-app smoke: **PASS** against tested application commit `3b1fdf6`.

- Pre-smoke: no Electron process was running; no process, user, or machine
  `BLUE_HELM_ADMISSION_*` value was present.
- The app was launched once from this worktree with the normal Electron entry point.
- The live window title was exactly
  `Mako — V5 STACK CONTENT ACCEPTANCE 2026-07-21.14`.
- The live top-level brand was `⚓ Mako`.
- The loaded document URL pointed to this worktree's `app/renderer/index.html`.
- No provider prompt, agent pane, controlled admission, shortcut change, or user-scope
  deployment was attempted.
- The app was closed normally with `Alt+F4`; no Electron process remained.
- The admission ledger was unchanged in bytes, modified time, and identity:
  `1,477` bytes, mtime `2026-09-29T05:06:09.7112180Z`, SHA-256
  `1998F3AAC6F462DB1201B2E846612D8863A9FAA33D1B92206685409AF4FAF9CA`.
- The installed user-scope hook was unchanged at `7,051` bytes, SHA-256
  `A04A95BC247C8969B3156F432DA25E4193E4B66B26FF9F911C0EA9B80AB3820A`.
- Smoke stdout: `290` bytes, SHA-256
  `2DE0878C3FBDB2B9B8DB936B5F0587543DEFAFE5B2FAA372E9E91C16033B9FBB`.
- Smoke stderr: `174` bytes, SHA-256
  `9BCF35BC732729CB4E353267459D7B74A8DD639CCBC2558B168A76924996AD42`;
  it contains only the established audio-permission denial diagnostics.

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

## Approved visual-identity amendment (pre-implementation)

Blue approved the following 17-path amendment after selecting the connected-white shark
and refined 10A wordmark (shared baseline, corrected k leg, lowercase o). This supersedes
the earlier anchor-retention requirement and 13-path ceiling for subsequent work only;
the prior implementation and validation records above remain historical evidence.

The original 13 authorized paths remain in scope, plus exactly:

14. `app/renderer/assets/mako-mark.svg`
15. `app/renderer/assets/mako-wordmark.svg`
16. `app/assets/mako.ico`
17. `app/renderer/styles.css`

Replace the top-bar anchor with the shark at left and outlined Mako lettering at right;
set the normal app-window icon to the black-background shark. The static SVG assets must
contain no scripts, external resources, embedded font dependency, or new runtime library.
The wordmark uses the selected lettering as outlined artwork rather than a font install.
The mark geometry is mirrored; the approved cobalt dorsal facet remains intentionally
one-sided. Preserve the connected white fin/M accent and solid black eyes.

Within the existing scope, update `app/main.js`, `app/renderer/index.html`, the branding
tests, and this handoff. Do not modify hook bytes again, change integrity enforcement,
reason codes, admission behavior, data paths, or provider behavior. No eighteenth path is
authorized. Preserve the earlier pinned review diff and generate a separately named one.

Validation: focused branding/affected tests, the app and Pester gates, and a fully restarted
normal-app visual smoke at usable header sizes. The smoke authorizes no agent pane,
provider prompt, controlled run/admission, or ledger mutation. Close normally afterward.
Independent Full-class review remains pending, security-focused on the original bounded
hook change with proportionate review of the visual assets and wiring.

Deployment, shortcut mutation, merge, and push remain separately authorized. H1 is
complete and must not be rerun. This is branding maintenance, not a new subsystem;
no additional OSS procurement decision or new dependency is introduced.

## Review-diff rule

- Before merge, use `git diff 8b6c9638c06599b688911a5f4b5871d6b7c11079...<tip>`.
- After merge, reproduce the reviewed delta with the same recorded pre-merge main SHA.
- Always use `--output`; do not use PowerShell `>` for pinned review diffs.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it.
- Pinned `.agent-review-*.diff` files remain local and gitignored.
