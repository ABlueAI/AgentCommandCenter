# Builder Handoff — Deterministic Role Deployment (`sync-roles.ps1`)

Status: IMPLEMENTED AND VERIFIED (C2; see the completion record at the end); INDEPENDENT FULL-CLASS REVIEW REQUIRED; DEPLOYMENT, MERGE AND PUSH NOT AUTHORIZED

- Branch: `codex/sync-roles-deterministic-deploy`
- Base: `bc9cae27dd7f373f69707899613aed5c853363a4` (merged `main`, pushed)
- Worktree: `D:\Workspace\agent-command-center\.worktrees\sync-roles-deterministic-deploy`

## Authorization

Blue authorized Stage 2 of this correction on 2026-09-29: create this branch and
worktree from the exact base, commit this docs-only pre-registration (C1), then
implement within the three-path cap, run the pre-registered verification once
each, commit implementation, tests and completion record (C2), generate the
pinned review artifact, and stop for an independent Full-class review.

Blue's decision after the failed deployment was verbatim: "DO NOT RETRY
DEPLOYMENT AND DO NOT NORMALIZE THE MAIN CHECKOUT BY HAND. Treat the failed
deployment as a reproducibility defect in scripts/sync-roles.ps1."

Not authorized: deployment, merge, push, Electron launch, provider prompt, live
qualification, ledger edit, H1 rerun, CONTEXT-SYNC restoration, cleanup or
branch deletion.

## Defect: the failed deployment and its verified rollback

On 2026-09-29 Blue authorized one permanent user-scope deployment by running
`scripts\sync-roles.ps1` (SHA-256
`4DA95EA9C8EAB5957461C186F33212E0AE9567BE96F0E9F40B98C05B821CE321`, no
`-ProjectDir`) once from the merged `main` checkout at `bc9cae2`. It exited 0
with empty stderr, but one required post-deployment identity failed:

| Installed file | Required | Deployed |
|---|---|---|
| `~\.claude\agents\source-scout.md` | 1,642 B `A521C9BBC18176985372ADA2FC036690828A9609F96615B48C7321FE70D6D652` | 1,616 B `27CA53B7829B5E0E02FE2536DD205B9D94D98F41987CE094E750869E29B8A47C` |

The other six targets matched their required identities, and every other check
passed, including the production fence policy on all three fenced roles.

Root cause: the tracked blob of `agent-roles/source-scout.md` is identical in
both checkouts, but the merged `main` checkout's working copy still has LF line
endings (`git ls-files --eol`: `i/lf w/lf`, checked out 2026-07-02), while every
other role, and the reviewed worktree's copy, is CRLF (`w/crlf`). Git reports
both as clean. `sync-roles.ps1` deploys working-tree bytes, and it reads them
with Windows PowerShell 5.1's default ANSI decoding (`Get-Content -Raw`), which
also turns the file's three UTF-8 em dashes into mojibake. The deployed bytes
therefore depended on the checkout's line endings and on PowerShell 5.1's
encoding default.

Per Blue's failure rule the fresh rollback was executed exactly once and
verified 7/7. Evidence (all read-only) under
`outputs\deployment-fence-live-admission-refresh-20260929\`:

| Evidence | Bytes | SHA-256 |
|---|---|---|
| `manifest-before.json` | 7,548 | `7B486E4E6306E7BD5517BA9F23A6ABD834C9A5168D697787E67A84E79278EEE5` |
| `manifest-after.json` (records the P1 failure) | 8,323 | `5DA90CD3B15E74BC3958F218D794C6CC9F368E809A61F2C0BA6014517E05D535` |
| `sync-roles-run.log` | 745 | `E96EED65A0528BA32F1C5ADD452ACDD7AE5030078C3CDC6BE23DA966481C870D` |
| `policy-check.json` | 2,910 | `89F8BCE8D9C3451494872A9D6FBBA69CEE2AD778F7874921E2A4E6385D0F3F9C` |
| `rollback-procedure-UNEXECUTED.ps1` (executed once) | 1,662 | `A8A064FFEE0C41BCBEFED50BDF18BDC2B9FFF67DB394C2F1F1F49328D36A4767` |
| `rollback-run.log` (exit 0, 7/7 restored) | 1,537 | `9FD7E8C5CE7C7E65AC29895A881B6F4FB421D65A399989C0B02F853D27E82769` |

After the rollback the seven installed files again equal the pre-deployment
state (hook `9489C154AFD89E6A4F0A569AC6674C3A4B9BEF02A581B26FE741A757341B6ECA`,
web-scout `37C5FD38E95B5D26B3748F449CA026A1B9510F95804CCE6BA80CF0663BA4C0CF`,
source-scout `27CA53B7829B5E0E02FE2536DD205B9D94D98F41987CE094E750869E29B8A47C`).
The ledger (1,477 B,
`1998F3AAC6F462DB1201B2E846612D8863A9FAA33D1B92206685409AF4FAF9CA`) was never
touched. Until a corrected deployment is authorized, builds from merged `main`
refuse fenced launches (installed hook differs from their tracked hook).

## Gate class and invariant

**Full-class.** `sync-roles.ps1` deploys the security-sensitive write/web fence
hook and the fenced role definitions whose PreToolUse matchers the production
fence policy enforces.

Invariant:

> For a given commit, the deployed role bytes depend only on the tracked role
> content and the installed hook path, never on the checkout's line endings or
> on Windows PowerShell 5.1's default encoding. Every role source is validated
> and prepared in memory before any destination is written; any validation
> failure leaves every user- and project-scope destination unchanged. The hook
> is deployed byte-for-byte.

## Pre-registered path cap (exactly three)

Exactly these tracked paths may differ from `bc9cae2`:

1. `scripts/sync-roles.ps1`
2. `scripts/sync-roles.Tests.ps1` (new)
3. `docs/BUILDER-HANDOFF-sync-roles-deterministic-deploy.md` (new)

Work stops before a fourth tracked path is touched. No tracked role file is
modified merely to influence checkout line endings; no hook, application,
package, dependency, `.gitattributes`, runner or other test file is in scope.

Runner inspection: `scripts\run-pester.ps1` discovers `*.Tests.ps1` recursively
under `scripts\`, and both reachability meta-suites use floors (`>= 14`), not an
exact list, so the new suite needs no runner change. No existing test reads or
pins `sync-roles.ps1`.

## Decisions (Blue)

- **D1:** Refuse a UTF-8 BOM in any role source before writing anything.
- **D2:** Refuse a lone CR in any role source before writing anything.
- **D3:** Preserve the hook bytes exactly; do not normalize its encoding or line
  endings. (At runtime `main.js` compares the installed hook with the SHA-256 of
  its own checkout's `scripts\hooks\fence-write.js`, so the hook must stay a
  byte copy.)
- **D4:** Write the pre-read hook and prepared role bytes with `WriteAllBytes`.
- **D5:** Re-read and byte-verify every file written.
- **D6:** A missing or unreadable hook source refuses before any destination
  changes. The previous missing-hook warning becomes a fail-closed refusal; roles
  that reference an absent hook are never deployed.
- **D7:** Sort role sources deterministically by filename before validation and
  preparation.

## Pre-registered implementation

Parameter semantics (`-ProjectDir`), source discovery (`agent-roles\*.md`
excluding `README.md`), destinations (`~\.claude\hooks\fence-write.js`,
`~\.claude\agents\`, optional `<ProjectDir>\.claude\agents\`) and console
reporting are preserved.

Phase A (no destination writes):

1. Locate and byte-read the hook source; refuse if missing or unreadable (D6).
2. Enumerate role sources excluding `README.md`, sorted by filename with an
   ordinal comparison (D7); refuse if none.
3. For each role: read raw bytes; refuse a leading UTF-8 BOM (D1); decode with
   strict UTF-8 (`UTF8Encoding($false, $true)`), refusing malformed input;
   refuse a lone CR (D2); normalize LF and CRLF to CRLF; replace every exact
   `__CC_HOOK__` with the forward-slash absolute path of the installed hook;
   encode as UTF-8 without BOM; keep the prepared bytes in memory.
4. Refusal messages name the file and the reason and never echo file content.

Phase B:

1. Create the required destination directories.
2. Write the pre-read hook bytes with `WriteAllBytes` (D3, D4).
3. Write the prepared role bytes to user scope and, when given, project scope
   with `WriteAllBytes` (D4).
4. Re-read every written file and compare it byte-for-byte with what was
   written; refuse on any mismatch (D5).

A dot-source guard (the `merge-gate.ps1` pattern) lets the tests load the pure
preparation function without deploying; invoked normally (`-File` or `&`), the
script deploys exactly as before.

## Pre-registered tests (`scripts/sync-roles.Tests.ps1`, Pester 3.4)

Deployments run the script under test in real Windows PowerShell 5.1 child
processes (`powershell.exe -NoProfile -ExecutionPolicy Bypass -File`) inside a
temporary fixture repository, with `USERPROFILE` redirected to a guarded
temporary profile under `%TEMP%` for the child only. A guard refuses to run a
deployment whose profile is not under `%TEMP%` or equals the real profile. The
suite hashes the real profile's installed hook and six roles before and after
and requires them to be byte-identical.

1. LF and CRLF source fixtures deploy byte-identically.
2. BOM-less UTF-8 em dashes and other non-ASCII text (accented Latin, CJK, a
   four-byte emoji) survive exactly.
3. Output is CRLF-only UTF-8 without BOM, with the trailing newline preserved.
4. Malformed UTF-8 (in the first- and in the last-sorted role), a BOM, and a
   lone CR each exit non-zero and leave the user and project destinations
   unchanged; when Phase A fails no destination directory or file is created.
5. A missing hook source and an unreadable (exclusively locked) hook source each
   refuse before any destination change.
6. Placeholder replacement is exact (multiple occurrences, forward-slash path,
   none left); roles without a placeholder change only line endings.
7. `-ProjectDir` produces user- and project-scope outputs that are
   byte-identical; `README.md` is never deployed.
8. Role processing order is deterministic by filename.
9. The hook is copied byte-for-byte for both LF and CRLF hook fixtures.
10. The existing refusals remain (no `agent-roles\`, no roles).
11. Refusal output names the file and never echoes its content.
12. The six real roles, prepared through the dot-sourced function with the
    literal installed hook path `C:/Users/levij/.claude/hooks/fence-write.js`
    from their working-tree bytes and from LF and CRLF variants, produce exactly
    the expected identities below.

## Expected deployed identities (real roles)

| Role | Bytes | SHA-256 |
|---|---|---|
| builder | 1,495 | `F1961DE06C43F3A47FE04E82551B31DB479D7C9F9907436CFD9DE14BD75D2BC7` |
| reviewer | 1,221 | `0BAF2B5391D9AD9E828A76CE92375118210A8ECE803EE9B8C7CC369938212580` |
| codebase-scout | 755 | `2A15AD0BD8C8BAD38767FA51E27BB3C44FDE76645C4FF1B35CC480427913FD12` |
| web-scout | 1,773 | `AFDA5D08FE81489D702F06B80C328A09F0F9E94F6E1C5F367E117B9187B34AB4` |
| operator | 1,476 | `C0E1B415857A40B39CEC6A19758CF3776AC2640CCA9DFA34F1374DD72D7FEC53` |
| source-scout | 1,627 | `549B8624B6A70E9F37F71F1B8624DB5AB06F891C1E1CB54B86F3DA4C91064EC1` |

The first five equal their qualified identities. source-scout changes from the
mojibake form (1,642 B `A521C9BB…`) to its correct UTF-8 form. These values
were reproduced read-only from the tracked blobs at `bc9cae2` before this
pre-registration.

## Pre-registered verification (each once)

Run from this worktree:

1. Focused: `Invoke-Pester scripts\sync-roles.Tests.ps1` (Pester 3.4)
2. Full Pester: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-pester.ps1`
3. Full app: `npm.cmd test` from `app\`, expecting 96 suites, 7,340 passed, 0 failed
4. PowerShell parse checks of `scripts\sync-roles.ps1` and `scripts\sync-roles.Tests.ps1`
5. `git diff --check`
6. Path cap: `git diff --name-only bc9cae2...HEAD` equals exactly the three paths
7. Clean worktree after C2

## Pinned review artifact

Created with `git diff --output` only, never PowerShell redirection:
`.agent-review-sync-roles-deterministic-deploy-since-bc9cae2.diff`, range
`bc9cae27dd7f373f69707899613aed5c853363a4...<C2>`. Its length and SHA-256 are
reported outside the commit.

## Independent review requirement

An independent Full-class review of `bc9cae2...<C2>` is required before merge.
No deployment attempt occurs until this correction is reviewed, merged through
`scripts\merge-gate.ps1` and separately authorized.

## Procurement

This is maintenance of the existing role-deployment mechanism, not a new
subsystem or dependency, so it does not reopen OSS procurement. The controlling
tracked record remains `docs/OSS-PROCUREMENT-pane-status.md`; its canonical
verdict is quoted verbatim:

> BLUE SUBSYSTEM VERDICT: BUILD FRESH

## Residuals (pre-registered)

1. Phase B is not transactional across files: an I/O failure part-way through
   (for example a locked destination) can leave a partial deployment. Mitigated
   by complete Phase A validation, Phase B read-back verification, and the
   backup/rollback procedure used for every authorized deployment.
2. The hook remains checkout-line-ending dependent by design (D3); deploying
   from one checkout and running the app from a checkout with different hook
   line endings refuses fenced launches (fails closed).
3. The JavaScript emulations of deployment in
   `app/pty-start-authority-main.test.js`, `app/admission-main-startup.test.js`
   and `app/role-fence-policy.test.js` do not normalize to CRLF; they pin no
   deployed bytes and are outside the cap.
4. The fenced-role identity pins assume the installed hook path
   `C:/Users/levij/.claude/hooks/fence-write.js`, supplied to the pure function
   as input, so the tests run on any machine.
5. source-scout's deployed identity changes from the mojibake form used during
   run `fence-live-d919942-20260929-e` (which never exercised source-scout) to
   the corrected 1,627 B form; whether it needs its own live qualification is
   Blue's decision.
6. The merged `main` checkout's stale LF working copy of
   `agent-roles/source-scout.md` is left untouched (Blue's decision); the
   correction makes it harmless.
7. Installed state remains the rolled-back pre-deployment state until an
   authorized deployment.
8. The Pester gate requires Pester 3.x or 4.x.
9. H1 is complete and must never be rerun. `CONTEXT-SYNC.md` remains preserved
   in `outputs\pre-merge-quarantine-20260929\` for its own feature branch.

## Completion record (C2)

C1 (pre-registration): `e1a6a07ba407b8a287bb4c410214464537d7460e`, parent
`bc9cae2`, this document only. C2 changes the other two capped paths and this
document (completion record; C1's two trailing-whitespace header lines, which
`git diff --check` flagged, are reformatted as a list). Everything pre-registered
above is otherwise preserved unchanged.

### Implementation

`scripts/sync-roles.ps1` (base blob `b3a5828162acd683b105969b30a22a159028048b`,
new blob `71c30bf3be5bf38409486e4c76426b7b2e82833a`) implements the
pre-registered design:

- `ConvertTo-DeployedRoleBytes` (pure): refuses a leading UTF-8 BOM (D1),
  decodes with `UTF8Encoding($false, $true)` and refuses malformed input,
  refuses a lone CR (D2), normalizes LF/CRLF to CRLF, replaces every exact
  `__CC_HOOK__`, and returns UTF-8 without BOM. Refusals name only the file.
- `Invoke-SyncRoles` Phase A: `agent-roles\` must exist; the hook source must
  exist and be byte-readable (D6, replacing the old missing-hook warning); role
  files (`*.md`, excluding `README.md`) are sorted with `[StringComparer]::Ordinal`
  (D7); each is byte-read and prepared in memory. Any failure throws with "No
  destination was changed." before any destination directory or file is touched.
- Phase B: creates the destination directories, writes the pre-read hook bytes
  and the prepared role bytes with `WriteAllBytes` (D3, D4) to user scope and the
  optional `-ProjectDir` scope, and re-reads every written file, refusing on any
  byte mismatch (D5). Console reporting is unchanged in form.
- A dot-source guard (`$MyInvocation.InvocationName -ne '.'`) lets the tests
  load the functions without deploying; `-File` and `&` invocations deploy.

`scripts/sync-roles.Tests.ps1` (new blob
`b622773781935706a7919a31f527c379a3a25149`, Pester 3.4, ASCII-only) has 29 tests
covering every pre-registered case: the six real-role identities from
working-tree, LF and CRLF sources; pure BOM/malformed/lone-CR refusals; LF/CRLF
byte-identity with CRLF-only BOM-less output and intact non-ASCII (em dash,
accented Latin, CJK, a four-byte emoji); trailing-newline preservation; exact
placeholder replacement; `-ProjectDir` identity and `README.md` exclusion;
byte-for-byte LF and CRLF hooks and the console report; overwrite of existing
destinations; ordinal ordering (report order `B, a, c` and first refusal
`B-bad.md`); malformed-first, malformed-last, BOM and lone-CR refusals each with
seeded user and project destinations byte-, length- and mtime-identical and, on
a fresh profile, no `.claude` directory created in either scope; missing and
exclusively locked hook sources (seeded and fresh); the existing `agent-roles/`
and no-roles refusals; and a final isolation test proving `USERPROFILE` was
restored and the real profile's `.claude\hooks` and `.claude\agents` files are
byte-, length- and mtime-identical to before the suite.

### Verification results

| Gate | Result |
|---|---|
| Parse checks (`sync-roles.ps1`, `sync-roles.Tests.ps1`) | 0 errors each; both files ASCII-only (the test file was re-parsed after the harness fix) |
| Focused `sync-roles.Tests.ps1` (Pester 3.4) | 29 passed, 0 failed (second run; see below) |
| Full `scripts\run-pester.ps1` | exit 0; 36 suites; 984 passed, 0 failed, 0 skipped (955 before + 29) |
| Full app `npm.cmd test` | exit 0; 96 suites (94 counted-shape plus 2 `assertions passed`); 7,340 passed, 0 failed |
| Real profile `.claude\hooks` + `.claude\agents` | byte-identical before and after every run above (independent check outside the suite as well) |
| `git diff --check bc9cae2` | clean (run at C2) |
| Path cap `git diff --name-only bc9cae2...C2` | exactly the three capped paths |

Deviation, recorded honestly: the first focused run was 23 passed, 6 failed. All
six failures were a test-harness defect, not a script defect: the destination
snapshot covered the whole fixture profile, and the Windows PowerShell 5.1 child
process itself creates `<profile>\AppData\Roaming` at startup (including in runs
that refuse before any write). In every failure the `.claude` destination trees
were byte-, length- and mtime-identical. The helper was corrected to snapshot
exactly the destination trees (`<profile>\.claude`, `<project>\.claude`) and the
focused suite was rerun once (29/0). The full Pester and app gates each ran once,
after the fix.

The full Pester run's only stderr line is the video-scout suite's own simulated
`HTTP 503 - attempt 1/3; retrying` message. The app gate ran through a local,
gitignored junction `app\node_modules` -> the main checkout's `app\node_modules`
(the same arrangement the reviewed fence worktree used; `package.json` and
`package-lock.json` are unchanged from `bc9cae2`), so no dependency changed.

No deployment, Electron launch, provider prompt, ledger edit, merge or push
occurred. The installed user-scope hook and roles remain the rolled-back
pre-deployment state.

### Next steps (each separately authorized)

1. Independent Full-class review of `bc9cae2...C2` against the pinned artifact.
2. Merge through `scripts\merge-gate.ps1`.
3. A separately authorized deployment from the merged checkout with backups,
   a fresh rollback procedure and the identities above as required values.
