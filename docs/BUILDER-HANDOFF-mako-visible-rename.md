# Builder Handoff: Mako visible-branding rename

Branch: `codex/mako-visible-rename`

Fork-point SHA: `8b6c9638c06599b688911a5f4b5871d6b7c11079`

Pre-merge main SHA: `8b6c9638c06599b688911a5f4b5871d6b7c11079`

Tested application SHA (latest, logo integration): `5b066b952828bc0631469f05e1d41f24f78c1e29`

Tested application tree (latest): `b9c70328222c050d4cd7a231ce3f9471f36593df`

Review endpoint SHA (documentation only): `578a2f1a0132aca485bf1894507bb243f7b30075`

Independent review: **Full-class cumulative review PASS** at review endpoint `578a2f1`
(reviewed application code `5b066b9`). See "Independent Full-class review closeout" at the
end of this document. The closeout commit is a further documentation-only tail; its own SHA
and the artifacts ending at it are reported outside this committed document. Deployment,
shortcut mutation, merge, and push remain **not authorized**.

> **Reading this document.** The 17-path visual-identity amendment (`cb2387e`) supersedes
> every earlier 13-path inventory and every earlier anchor-retention statement below. Those
> older statements are retained unchanged as history and are individually marked
> **SUPERSEDED**.

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

> **SUPERSEDED (history only).** This 13-path cap was replaced by Blue's 17-path
> visual-identity amendment (`cb2387e`, below). The current authorized inventory is the 17
> paths in that amendment, confirmed by the independent review closeout at the end.

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

> **SUPERSEDED (history only).** The anchor-retention requirement above was replaced by the
> 17-path visual-identity amendment (`cb2387e`). The reviewed application at `5b066b9`
> removes the ⚓ anchor and uses the approved shark mark and outlined wordmark.

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

> **Closeout clarification.** Both identities above are Windows CRLF working-tree
> identities, which is what `app/main.js` hashes at runtime. They are not Git-blob
> identities. The exact blob and CRLF identities are measured in the review closeout below.

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

> **SUPERSEDED (history only).** This 13-path list describes the rename-only endpoint
> `da5271b`. At the reviewed application `5b066b9` and review endpoint `578a2f1`, exactly the
> 17 amended paths differ from the fork point; see the review closeout at the end.

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
- The live top-level brand was `⚓ Mako`. *(History at `3b1fdf6` only; SUPERSEDED by the
  logo amendment, which removed the anchor.)*
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

> **SUPERSEDED (history only).** The review was conducted against the 17-path amended
> scope, not the 13-path cap named here.

Confirm that the 13-path cap held; historical evidence and technical identifiers did not
move; the hook diff changes only the three brand literals; stable reason codes and enforcement
remain unchanged; and the new hook identity is consistently measured and enforced.

## Review diff

Generate with:

`git diff --no-color --no-ext-diff 8b6c9638c06599b688911a5f4b5871d6b7c11079...<tip-sha> --output=.agent-review-mako-visible-rename.diff`

Reviewer verdict: PASS

Reviewer verdict source: Independent Full-class cumulative review of
`8b6c9638c06599b688911a5f4b5871d6b7c11079...578a2f1a0132aca485bf1894507bb243f7b30075`
(reviewed application code `5b066b952828bc0631469f05e1d41f24f78c1e29`); recorded verbatim in
"Independent Full-class review closeout" at the end of this document. The rename-only diff
command above is retained as history; the reviewed artifacts used `--binary` and are listed
in the closeout.

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

## Logo integration completion and validation (2026-09-30)

This is the current completion record; the earlier rename-only measurements above are
retained, not attributed to this newer application tree.

- Scope amendment committed before integration: `cb2387e` (parent `da5271b`).
- Tested application commit: `5b066b952828bc0631469f05e1d41f24f78c1e29`.
- Tested tree: `b9c70328222c050d4cd7a231ce3f9471f36593df`.
- Exactly the amended 17 paths differ from the unchanged fork point. The logo implementation
  commit changes seven paths: the two SVGs, ICO, main window option, header HTML, header CSS,
  and existing branding test. There is no new package or lockfile change.
- The approved raster direction was redrawn as static outlined vector geometry, not used as
  a screenshot in the app. The shark outline is mathematically mirrored, with the approved
  one-sided cobalt facet. The white fin accents connect to the central M. Wordmark glyphs
  share baseline 194; lowercase a/o share x-height 59. The k has no descender. This is custom
  artwork, not a named commercial font or a font installation.
- The top bar uses local image assets with a single accessible name, `Mako`; icon left,
  lettering right. At the normal layout the mark is 40px square and the wordmark 110x20px.
- `BrowserWindow.icon` resolves the fixed local ICO relative to `__dirname`. The ICO has
  PNG frames at 16, 24, 32, 48, 64, 128, and 256px. No shortcut is modified.

Asset identities (working-file bytes at validation):

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `app/renderer/assets/mako-mark.svg` | 955 | `30B70EA00BD767184E101406063961EE403F4B367138085475E2E85F1E7172FB` |
| `app/renderer/assets/mako-wordmark.svg` | 1,101 | `C3D4070A8044F85CD897E31213618FB2958440B1EE95FEF8D7DD6B97036C355D` |
| `app/assets/mako.ico` | 19,339 | `6411C345AFF620CE4394B26294B1D9D9A5C30D7F7054F80D65416F14D4146154` |

> **Closeout clarification.** The two SVG rows are the Git-blob (LF) identities. A normal
> Windows checkout of this repository materializes the SVGs as CRLF with different bytes
> and hashes; both forms are measured in the review closeout below. The ICO is
> binary-detected and identical in every checkout.

The ICO was rendered from the SVG with the already-bundled Sharp 0.35.4 tool, not a new
application dependency. The build-only utility and approved image reference are retained in
`D:\Workspace\agent-command-center\outputs\mako-visible-rename-logo-20260930\`.
`build-mako-assets.cjs` SHA-256 is
`E8E8E77DEAF8A4A9ADFA80611AD8C72D9D91DE79DF9673C9A9A47D4037A3713A`.
It takes a worktree root argument and writes the ICO plus a visual proof; it is not invoked
at app startup. SVG checks reject executable/external content and embedded raster/fonts.

### Automated results on the latest application tree

- Branding: **52 passed, 0 failed** (30 assertions added to the earlier 22).
- Affected pane-maximize suite: **40 passed, 0 failed**.
- Full app: **97 suites, 7,393 passed, 0 failed**, exit 0. Counted as 95 summaries of
  `N passed, M failed` plus the two assertion-only suites (9 each).
- Full Pester: **984 passed, 0 failed, 0 skipped**, exit 0; 130.79 seconds.
- Changed JavaScript syntax checks and `git diff --check`: PASS.
- Hook bytes remain `E21F28D5...135B09`, unchanged by the entire visual amendment.
- The previous `.agent-review-mako-visible-rename.diff` remains unchanged at SHA-256
  `853709308925325BB6D33EC69140E1CFA6A3862DD94E5E1DA488D561C7D98483`.

The first full-app invocation stopped at missing `node_modules/dockview/package.json`:
the build-only dependency guard had mistakenly matched a test name in the package-script
diff and did not create the dependency junction. The guard was corrected to compare the
actual dependency objects and lockfile; the first log was retained, and run 2 passed.
The temporary, verified junction to main's unchanged dependencies was removed after smoke;
the target dependency directory was verified intact. No install was performed.

### Restarted normal-app visual smoke

**PASS** at `5b066b9`. Electron was initially absent. The normal application was launched
once (PID 32336), without controlled-run variables, provider prompts, or an agent pane.
Computer Use observed the worktree's canonical file URL, the Mako window title, a single
accessible `graphic Mako`, the shark window icon, and the unclipped shark/wordmark header.
The small wordmark's k baseline and lowercase o are legible. Screenshot capture is 1309x855;
a border-drag attempt selected page text rather than resizing, so this record does not
claim minimum-width acceptance. No persistent layout setting was changed. The sizing menu
was dismissed and the app was closed normally with Alt+F4; no Electron remained.

Post-smoke, all seven installed hook/role files match pre-smoke size, SHA-256, and mtime.
The ledger remains 1,477 bytes, SHA-256
`1998F3AAC6F462DB1201B2E846612D8863A9FAA33D1B92206685409AF4FAF9CA`,
mtime `2026-09-29T05:06:09.7112180Z`. No ledger lock or Process/User/Machine admission
environment was present. No deployment or ledger edit occurred.

The first post-smoke verifier compared serialized objects and falsely reported a mismatch
because PowerShell 7 deserialized ISO timestamp strings as DateTime. Field-by-field hash,
size, path, and UTC-tick comparison proved no file change. The evidence-only verifier was
corrected and passed without relaunching or changing application code.

Evidence directory: `D:\Workspace\agent-command-center\outputs\mako-visible-rename-logo-20260930\`.

| Evidence | SHA-256 |
| --- | --- |
| `mako-logo-npm-test-run2.log` | `3F9563C8BA7E0DE093A2CBB2C60DD931B0B92582FCB9573F6846B5A4C9604530` |
| `mako-logo-pester.log` | `DC6E9B687E2132D8B4A9E180EAF12DA9AF1CE57E3F1961D29CC883010700F646` |
| `mako-logo-live-smoke.png` | `C800FA192329114D4C58D54EB479DA8A94DEC54CEC49635BC3F5FCEAB5B46C41` |
| `mako-logo-electron-stdout.log` | `17CE08603EF2F3775319E20E109C2B10F608DFEFD960517038D479A7D31AAC0E` |
| `mako-logo-electron-stderr.log` | `9BCF35BC732729CB4E353267459D7B74A8DD639CCBC2558B168A76924996AD42` |

Stderr contains only the three established audio-permission denial diagnostics.

### Remaining gates and review transport

> **Status superseded by the review closeout below:** the independent Full-class review is
> complete with `VERDICT: PASS`. The text in this subsection is retained as history.

Independent Full-class review remains pending. This builder validation is not that verdict.
Review the original hook rename/security invariants and the added static asset wiring at
their respective risk levels. Preserve H1 and prior Fence/live acceptance as complete.
No deployment, shortcut mutation, merge, push, provider prompt, admission, or H1 rerun is
authorized or performed by this record. Main remains at the fork point.

Generate new pinned cumulative and logo-only diffs with `git diff --no-color --no-ext-diff
--binary <base>...<endpoint> --output=<new-file>`, using bases `8b6c9638` and `da5271b`
respectively. The binary option retains the ICO payload. Keep the previous diff unchanged;
report endpoint and new diff hashes outside the committed document.

## Review-diff rule

- Before merge, use `git diff 8b6c9638c06599b688911a5f4b5871d6b7c11079...<tip>`.
- After merge, reproduce the reviewed delta with the same recorded pre-merge main SHA.
- Always use `--output`; do not use PowerShell `>` for pinned review diffs.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it.
- Pinned `.agent-review-*.diff` files remain local and gitignored.

## Independent Full-class review closeout: PASS at `578a2f1` (documentation only)

This closeout is documentation only and changes only this handoff. The application code and
assets remain exactly those reviewed at `5b066b952828bc0631469f05e1d41f24f78c1e29`
(tree `b9c70328222c050d4cd7a231ce3f9471f36593df`). The review endpoint
`578a2f1a0132aca485bf1894507bb243f7b30075` is itself documentation only: relative to
`5b066b9` it changes only this handoff. Every earlier record above is preserved as history;
superseded statements are marked in place.

### Current status

| Item | Status |
| --- | --- |
| Independent Full-class cumulative review | **PASS** at `578a2f1` (application code `5b066b9`) |
| Reviewed scope | Exactly the 17 amended paths; no eighteenth path |
| User-scope hook deployment | **NOT AUTHORIZED**. Installed hook (`A04A95BC…3820A`) and tracked hook (`E21F28D5…135B09`) intentionally differ. |
| Fenced launches from a merged build | **Will refuse** on hook-content mismatch until a separately authorized deployment |
| Desktop-shortcut mutation | **NOT AUTHORIZED** |
| Merge | **NOT AUTHORIZED** (separate Blue decision) |
| Push | **NOT AUTHORIZED** |
| Fetch / rebase | Not authorized; not performed |
| H1 and the controlled live fence qualification | Complete; **not reopened** and not rerun |
| `main` | Unchanged at `8b6c9638c06599b688911a5f4b5871d6b7c11079` |

### Review result (verbatim)

```text
CLASS: Full
INDEPENDENCE: CONFIRMED
REVIEWED BASE: 8b6c9638c06599b688911a5f4b5871d6b7c11079
REVIEWED APPLICATION COMMIT: 5b066b952828bc0631469f05e1d41f24f78c1e29
REVIEWED ENDPOINT: 578a2f1a0132aca485bf1894507bb243f7b30075
REVIEWED RANGES: 8b6c9638c06599b688911a5f4b5871d6b7c11079...578a2f1a0132aca485bf1894507bb243f7b30075 (cumulative, 17 paths)
                 da5271b93e689b2935ffb6b156bf498c6114fd03...578a2f1a0132aca485bf1894507bb243f7b30075 (visual amendment)
ARTIFACT AUTHENTICATION: PASS
VERDICT: PASS
```

No blocking findings. Four low or informational notes are carried forward below without
change in substance. The reviewer stated that PASS makes the cumulative 17-path branch
suitable for this documentation-only closeout and then a separately authorized merge
process, and that it does not authorize deployment, shortcut mutation, merge, push, or an
H1 rerun.

Independence note: the independent reviewer (Claude Code, Opus) had no part in building or
validating this branch. At Blue's explicit authorization, the same review session wrote
this documentation-only closeout; it changes no reviewed code, test, script, hook, or asset.

### Reviewed identities, ranges and artifacts

- Fork point / pre-merge main: `8b6c9638c06599b688911a5f4b5871d6b7c11079`
- Rename-only endpoint: `da5271b93e689b2935ffb6b156bf498c6114fd03`
- Visual-scope pre-registration: `cb2387ed3f84fa91ecc2a3c5facf7d3f3c8a1d62`
- Reviewed application commit: `5b066b952828bc0631469f05e1d41f24f78c1e29`,
  tree `b9c70328222c050d4cd7a231ce3f9471f36593df`
- Review endpoint (documentation only; parent `5b066b9`):
  `578a2f1a0132aca485bf1894507bb243f7b30075`

Each reviewed artifact below was authenticated by size and SHA-256. The reviewer also
regenerated both reviewed diffs with
`git diff --no-color --no-ext-diff --binary <base>...578a2f1 --output=<file>` and got
byte-identical results.

| Artifact | Range | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `.agent-review-mako-logo-final-cumulative.diff` | `8b6c963...578a2f1` | 83,614 | `A45780715FFB0CAA8A8A3AB7B1AD513CE9A1773DB9D60ED9AC023563FFC752D9` |
| `.agent-review-mako-logo-amendment.diff` | `da5271b...578a2f1` | 45,088 | `02B37E123C8E83B5A81AC17E0C83A7C23B2DB6AA0E8179A4E96E0AE8F0EE7AC3` |
| `.agent-review-mako-visible-rename.diff` (earlier, preserved) | rename-only | 41,370 | `853709308925325BB6D33EC69140E1CFA6A3862DD94E5E1DA488D561C7D98483` |
| `outputs\mako-visible-rename-logo-20260930\REVIEWER-BRIEF.md` | n/a | 4,452 | `F777D404674E2904F0D54307B6875D0409768795AA78ABEB08E7E721361CC8C0` |

The five evidence files listed in the logo completion record above, and
`build-mako-assets.cjs`, all matched their recorded SHA-256 values.

### Checks performed by the reviewer

- **Identity and scope.** HEAD `578a2f1`, parent `5b066b9`, worktree clean. Exactly the 17
  amended paths differ from `8b6c963`; only this handoff differs between `5b066b9` and
  `578a2f1`. In `app/package.json` only `description` and `scripts.test` changed; the test
  script gained `node mako-branding.test.js` and lost nothing (96 → 97 entries). The
  dependency objects and `app/package-lock.json` are unchanged. Every removed line outside
  this handoff is a visible "Blue Helm" or "Command Center" string, the anchor markup and
  CSS, or the test-script line. The `command-center` package name, `.command-center`,
  `%APPDATA%\command-center`, `BLUE_HELM_*` identifiers, IPC names, reason codes, the
  repository path, commands, and historical evidence are intact.
- **Hook (Full-class focus).** The word-level diff of `scripts/hooks/fence-write.js` shows
  exactly three `Blue Helm` → `Mako` substitutions (lines 58, 60, 63). Applying those three
  substitutions to the fork-point hook reproduces the reviewed hook byte for byte. There is
  no change to enforcement, path/origin/tool/destination resolution, allow/deny branches,
  response shape, or admission behavior. `fence-webfetch-denied`,
  `fence-input-unverifiable` and `fence-outside-sandbox` each appear exactly once.
  `app/role-fence-policy.js` is unchanged. `app/main.js:1226-1231` hashes the tracked hook
  at startup and `app/role-fence-policy.js:227` refuses with
  `fence-policy-hook-content-not-tracked-identity` on any mismatch, so fenced launches fail
  closed until a separately authorized deployment.
- **Artwork and UI.** Both SVGs use only `svg`, `title`, `defs`, `linearGradient`, `stop`,
  `rect`, `g` and `path`. They contain no script, event handler, `href`/`src`/`style`
  attribute, external resource, `foreignObject`, raster, data URL, `<text>`, font
  dependency, DOCTYPE or ENTITY. The wordmark is outlined paths only. The top bar has one
  accessible name (`role="img" aria-label="Mako"`) with two `alt=""` images; the shark
  precedes the wordmark; the anchor and all `.anchor` consumers are gone. Header sizes are
  bounded at 40×40 and 110×20 with `object-fit: contain`, and no rule depends on a fixed
  top-bar height. `BrowserWindow.icon` is `path.join(__dirname, 'assets', 'mako.ico')`. The
  ICO parsed independently as type 1 with seven contiguous 32-bpp RGBA PNG frames (16, 24,
  32, 48, 64, 128, 256), each ending exactly at IEND, with 0 trailing bytes. The silhouette,
  eyes and white accents mirror about x = 469; the white accent is one polygon joining the
  fins to the central M. Every wordmark glyph's lowest point, including curve control
  points, is 194; the a and o share top 59; the k has no descender; the o is lowercase
  height and narrower than the a.

### Test and evidence assessment

- Reviewer reruns (read-only): branding 52/0; pane-maximize 40/0; launcher-fence-invariant
  32/0 (static source checks); `node --check` passed on all eight changed JavaScript files,
  including the hook; `git diff --check` passed.
- Builder app log (run 2): 95 summaries totalling 7,375 passed and 0 failed, plus two
  9-assertion suites, reconciling to 7,393. Pester: 984 passed, 0 failed, 0 skipped.
- Smoke: the before and after snapshots are byte-identical for the ledger (1,477 bytes,
  `1998F3AAC6F462DB1201B2E846612D8863A9FAA33D1B92206685409AF4FAF9CA`) and all seven
  installed hook and role files. Stdout shows no pane or admission activity. Stderr holds
  only the three established audio-permission denial diagnostics. The screenshot shows the
  Mako title and the shark to the left of the wordmark, plus the disclosed stray text
  selection.
- Not rerun by the reviewer: `pty-start-authority-main` and `role-fence-policy`, because of
  their documented drive-root fixture side effects. The authenticated full-suite log was
  relied on for both.

### Measured line-ending identities

Measured at closeout from Git objects, read-only. The blob form is `git cat-file blob`.
The CRLF form is `git -c core.autocrlf=true cat-file --filters`, cross-checked against an
independent LF→CRLF conversion of the blob (byte-identical in every case). All values agree
with the independent review.

| Object | Git blob OID | Blob (LF) bytes | Blob (LF) SHA-256 | CRLF bytes | CRLF SHA-256 |
| --- | --- | ---: | --- | ---: | --- |
| `scripts/hooks/fence-write.js` at `5b066b9` (unchanged at `578a2f1`) | `c8e9fa88aa9521f4a32aaab9da3beec4f7c52dbc` | 6,904 | `6F000954B670B440E9B4B25E51579BA99218AF51891BD0D115F0F81371F3FD7F` | 7,036 | `E21F28D5BB2181D44CDEF787DD65550C4CFDEAAA1FC1FDAA23E5EB68CA135B09` |
| `scripts/hooks/fence-write.js` at fork `8b6c963` | `e8e808153971d6339a57d1bf05df4de540125f00` | 6,919 | `97A55552358425BA1FD3A21FFBC81E99C8506C801A7343BAA538310A221B31B2` | 7,051 | `A04A95BC247C8969B3156F432DA25E4193E4B66B26FF9F911C0EA9B80AB3820A` |
| `app/renderer/assets/mako-mark.svg` | `17ecc92f7aa2e8c131cc1664c19adf1561c5b796` | 955 | `30B70EA00BD767184E101406063961EE403F4B367138085475E2E85F1E7172FB` | 972 | `6728B0FF60BBB95B538694CA04B56546A589C52E4508D14F145208B0A132C03B` |
| `app/renderer/assets/mako-wordmark.svg` | `98c18ceb8a1efaad35a954b842037c5167c4aa87` | 1,101 | `C3D4070A8044F85CD897E31213618FB2958440B1EE95FEF8D7DD6B97036C355D` | 1,112 | `3CC46E07DBBCC858B0E4D0DD8A283B53D4C434648BBE218B24B741A8C5C2C68D` |
| `app/assets/mako.ico` (binary-detected, never converted) | `ac799fe12fe909aa1c20dd63e395da57a1794412` | 19,339 | `6411C345AFF620CE4394B26294B1D9D9A5C30D7F7054F80D65416F14D4146154` | 19,339 | `6411C345AFF620CE4394B26294B1D9D9A5C30D7F7054F80D65416F14D4146154` |

The fork-point SVG and ICO paths did not exist; those files are new on this branch.

Filesystem state at closeout (read-only):

- This worktree's hook: 7,036 bytes, `E21F28D5BB2181D44CDEF787DD65550C4CFDEAAA1FC1FDAA23E5EB68CA135B09`,
  byte-identical to the CRLF form of the `5b066b9` blob.
- This worktree's SVGs: 955 and 1,101 bytes, LF, byte-identical to their blobs. They were
  written directly by the builder and never re-materialized by a checkout.
- This worktree's ICO: 19,339 bytes, `6411C345AFF620CE4394B26294B1D9D9A5C30D7F7054F80D65416F14D4146154`.
- Installed `%USERPROFILE%\.claude\hooks\fence-write.js`: 7,051 bytes,
  `A04A95BC247C8969B3156F432DA25E4193E4B66B26FF9F911C0EA9B80AB3820A`, byte-identical to the
  CRLF form of the fork-point blob.
- Main checkout `D:\Workspace\agent-command-center\scripts\hooks\fence-write.js`: 7,051
  bytes, `A04A95BC247C8969B3156F432DA25E4193E4B66B26FF9F911C0EA9B80AB3820A`.

Materialization rule, measured on this machine: with the repository's `* text=auto`
attribute on Windows, text files materialize as CRLF under `core.autocrlf=true` **and**
under `core.autocrlf=false` (because `core.eol` is unset, i.e. native). They materialize as
LF only under `core.autocrlf=input` or `core.eol=lf`. This machine's system gitconfig sets
`core.autocrlf=true`.

### Reviewer notes carried forward

1. **Hook Git-blob versus CRLF working-tree identity.** The tracked-hook identity
   `E21F28D5BB2181D44CDEF787DD65550C4CFDEAAA1FC1FDAA23E5EB68CA135B09` (7,036 bytes) is the
   Windows CRLF working-tree identity. The Git blob is 6,904 bytes,
   `6F000954B670B440E9B4B25E51579BA99218AF51891BD0D115F0F81371F3FD7F`. The runtime check
   hashes working-tree bytes (`app/main.js:1226-1231`) and compares them with the installed
   hook (`app/role-fence-policy.js:227`). This relationship is not new: at the fork point
   the installed `A04A95BC…3820A` is the CRLF form of blob `97A55552…31B2`. A checkout that
   materializes LF would compute `6F000954…FD7F`, mismatch a CRLF deployment, and fail
   closed. Any later deployment must install bytes equal to the running build's
   materialized tracked hook, and the deployment work order must state which form it
   verifies.
2. **SVG LF/CRLF materialization; `.gitattributes` deferred.** The recorded SVG identities
   (955 and 1,101 bytes) are Git-blob/LF identities. A fresh Windows checkout, including
   `main` after merge, materializes 972 and 1,112 bytes with the CRLF hashes above. Both
   forms render identically; no test pins SVG bytes or hashes; the ICO is unaffected.
   Explicit `.gitattributes` rules for `*.svg` and `*.ico` are deferred to a separately
   authorized branch; `.gitattributes` is outside the 17-path cap and outside this closeout.
3. **Superseded 13-path and anchor wording.** The earlier 13-path inventory and
   anchor-retention statements ("Authorized 13-path cap", "Preserved compatibility and
   evidence", "Files changed", the `3b1fdf6` smoke brand line, and "Recommended review
   focus") are superseded by the 17-path visual-identity amendment (`cb2387e`), which
   authorized removing the anchor. Each is marked **SUPERSEDED** in place and retained
   unchanged as history.
4. **Slight logo-facet asymmetry, intentional and visually accepted.** The cobalt dorsal
   facet is intentionally one-sided, as the approved amendment specifies. Its apex vertex
   sits at x = 468, against the silhouette's mirror centerline at x = 469
   (`app/renderer/assets/mako-mark.svg:13`): a 1-unit offset in a 1024-unit viewBox. Blue's
   closeout authorization records this slight asymmetry as intentional and visually
   accepted. The silhouette, eyes and white accents are exactly mirrored.

### Residuals

- Minimum-width header layout remains unverified; only the normal 1309×855 header was
  verified.
- The artwork is an approved vector redraw of the approved concept, not an image trace or a
  pixel-identical copy.
- Line-ending behavior must be respected during deployment (note 1).
- Merged code will refuse fenced launches on hook-content mismatch until a separately
  authorized deployment installs the reviewed hook bytes.
- H1 and the completed controlled live fence qualification are not reopened.

### Closeout transport

Pinned artifacts that end at this closeout commit necessarily include this section, so
their identities are reported outside this document. All earlier artifacts and evidence
are preserved unchanged.
