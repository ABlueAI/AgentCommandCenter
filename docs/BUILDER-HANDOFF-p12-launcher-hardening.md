# Builder Handoff — P12 Launcher Hardening

Branch: `feature/p12-launcher-hardening`
Fork-point SHA: `a6bba64b2adef827e07592f7c54a81ccfcfcc86a`
Pre-merge main SHA: `a6bba64b2adef827e07592f7c54a81ccfcfcc86a`
Reviewed code tip SHA: `9851a9b05cee42eadb8524b677b5baba94c9aea2`
Branch tip SHA: this docs-only tail commit (adds only this handoff; code is unchanged from the reviewed tip)
Merge commit SHA: Pending until merge

## Intended invariant

`open-vscode` and `open-terminal` may launch only a main-authorized existing
repository/worktree directory, and no user-controlled directory string may be
reparsed by `cmd.exe` or another shell. This closes the parked HIGH finding
**P12** (cmd.exe argument re-parse on the VS Code-open path + the companion
"open any folder" authorization gap) as one branch, one gate.

## Files changed

Production:

- `app/launchers.js` — rewritten. Removed the `cmd.exe /d /s /c code <dir>`
  Windows path. Added the pure `normalizeLauncherDir` pre-filter, deterministic
  `resolveVscodeExe` / `resolveTerminalExe`, and shell-free `openVscodeSpec` /
  `openTerminalSpec(exe, dir)` argv builders. Corrected the comment that
  overstated what a discrete argv element alone bought.
- `app/launcher-authz.js` — **new.** Pure directory authorizer: a renderer path
  is authorized only when it canonicalizes (realpath, case-folded on Windows) to
  a repository root or a live git worktree that main re-derives from the
  filesystem + git. Fail-closed reason constants; identity by canonical real
  path (junction/reparse-safe); returns the canonical real dir to open.
- `app/launcher-ipc.js` — **new.** Pure IPC boundary: trusted-sender gate →
  directory authorization → deterministic exe resolution → shell-free spawn. An
  untrusted sender, an unauthorized directory, or an unresolvable Code.exe spawns
  zero child processes.
- `app/main.js` — wired the trusted-sender gate, the authorizer (with the
  main-owned `listLauncherAuthorizedDirs` enumerator = the exact `list-repos`
  rule + `git worktree list` per repo), and the launcher IPC module. Made
  `launch()` explicit `shell:false` with an `error` handler (a missing VS Code /
  Windows Terminal now refuses visibly instead of an unhandled rejection).
  Added `execFileSync` to the `child_process` import.

Tests:

- `app/launchers.test.js` — rewritten for the shell-free path: normalize
  refusals, resolver determinism, discrete-argv specs, and the **Windows
  positive control** (a disposable `%TEMP%` sentinel proving cmd.exe re-parses a
  command-line `&` into a second command — why cmd.exe must stay out of the loop).
- `app/launcher-authz.test.js` — **new.** Real disposable fixtures: allowed
  repo/worktree, refused foreign dir / stale-unlisted worktree / file / missing /
  traversal / relative / non-string / metacharacter / control char, enumeration
  failure, Windows case-fold, and directory-junction identity in/out of the set.
- `app/launcher-ipc.test.js` — **new.** Zero-children-on-refusal for an
  untrusted sender, an unauthorized directory, and an unresolvable Code.exe;
  gate-before-authorize ordering; refusals carry a reason constant, never the path.
- `app/launcher-fence-invariant.test.js` — **new.** sha256 byte-invariance of the
  fenced-role cwd gate, the ptyEnv block, and the whole pty-start handler.
- `app/package.json` — wired the three new node suites into `test`.

## Security-sensitive surfaces touched

The one-click launcher IPC surface (`open-vscode` / `open-terminal`) and the
detached-process `launch()` helper. **Not** touched (byte-for-byte unchanged,
proven by `launcher-fence-invariant.test.js`):

- fenced-role cwd gate — sha256 `ae9dce92cbdd76da7d96ff5b9c5c070e3a96f4ca1f4c1c06b77eb13ccba62060`
- ptyEnv block — sha256 `b83cd467dc52406d7c402d89864f39f3bc71639516987ff2768902de273c0820`
- entire pty-start handler — sha256 `21c9ab2fc8be096a2be0ec0609070ac74c2d94a5fc6125c2b16e2b3f3e45e421`

No Video Scout, Gemini, credential, manifest, report, retention, follow-up, or
provider-request code changed. P12 sits entirely on the launcher path, before and
independent of `pty-start`; the fence gate's behavior is unchanged.

## Where P12 sits relative to the fence gate

The fenced-role cwd gate and the launcher path are disjoint. Fenced roles are
enforced inside `pty-start` (in-app PTY spawns) via `realOrNearest` + the
outputs-sandbox containment check. The launchers spawn *external* detached
processes (VS Code / Windows Terminal) and never enter `pty-start`. P12 adds an
independent authorization boundary for the launcher path only; it neither reads
nor modifies the fence gate, `ptyEnv`, `realOrNearest`, or `FENCED_ROLES`.

## Restated design (the eight required points)

1. **Exploit path.** A bypassed renderer calls `cc.openVscode(dir)` with an
   attacker string; the old handler passed it unvalidated to `cmd.exe /d /s /c
   code <dir>`. libuv quotes an argv element only when it contains
   whitespace/tab/quote, so a metacharacter directory with no whitespace reached
   cmd.exe verbatim and re-parsed into a second command. Companion residual:
   neither launcher validated the directory (open-any-folder). Fixed together.
2. **Authoritative set.** Union over each repo main re-derives (immediate subdir
   of `projectsRoot` containing `.git` — the `list-repos` rule) of the repo root
   and each `git -C <repo> worktree list --porcelain` path — exactly what the
   renderer legitimately draws from.
3. **Canonicalization.** Pre-filter the raw string, then `fs.realpathSync.native`
   (resolves 8.3/symlink/junction), require `isDirectory`, canonicalize every set
   member the same way, compare case-folded on Windows. Junction into the set =
   allowed; out = refused; pruned worktree not in the git set = refused.
4. **VS Code without cmd.exe.** Resolve a real `Code.exe` from a fixed bounded
   env-derived candidate list; spawn `Code.exe <dir>` shell:false, discrete argv;
   none found → visible `vscode-not-found` refusal.
5. **Preserved behavior.** VS Code opens the authorized folder; Terminal opens
   `wt -w 0 nt -d <dir>` (resolving the WindowsApps alias); both spawns carry an
   `error` handler → visible refusal, never a crash.
6. **Files changed** — see above.
7. **Boundary tests** — see above.
8. **Load-bearing assumptions** — `Code.exe <folder>` opens that folder (standard
   VS Code behavior; the binary was verified present at
   `%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe`); `wt.exe` is
   shell:false-spawnable (already relied upon; the WindowsApps alias was verified
   present). Manual acceptance confirms the GUI open.

## Commands run

- Read `AGENTS.md`, `docs/AI-COLLABORATION.md`, `docs/BUILDER-HANDOFF-TEMPLATE.md`,
  `BLUE-HELM-MASTER-STATUS.md` (P12), `BLUE-HELM-CHAT-HANDOFF-4.md`,
  `docs/MERGE-GATE.md`, `app/main.js`, `app/launchers.js`, `app/launchers.test.js`,
  `app/preload.js`, `app/trusted-ipc-sender.js`, `app/clipboard-ipc.js`, and the
  renderer launcher callers.
- `node --check` on every touched JavaScript file.
- `cd app; npm test` → **1203 passed, 0 failed**.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\run-pester.ps1`
  → **Passed: 659 Failed: 0 Skipped: 0**.
- `git diff --check` → clean (exit 0; only cosmetic LF→CRLF working-copy warnings,
  normalized to LF blobs by `.gitattributes` `text=auto`).
- Focused: the four new/rewritten launcher suites individually; the source-invariant
  sha256 comparison of the fence/ptyEnv/pty-start regions.

## Exact test results

- App node gate: **1203 passed / 0 failed** (baseline was 1132; +71 from the
  rewritten launchers suite and the three new suites — launcher-authz 18,
  launcher-ipc 20, launcher-fence-invariant 6, launchers 40).
- Pester gate: **659 passed / 0 failed / 0 skipped** (unchanged from baseline; no
  PowerShell changed).

## Manual verification

- All three invariant regions sha256-MATCH the reviewed base.
- The production launcher modules contain no `cmd.exe` / `ComSpec` / shell in code
  (only in explanatory comments).
- `git status` clean after commit (no phantom EOL modification).

## Known limitations

- The metacharacter pre-filter refuses `% & | ^ < > ( ) " ' \`` in a directory
  string. An otherwise-authorized directory whose **real name** contains one of
  these (e.g. a repo under `...\Program Files (x86)\...`) is refused by design
  (visible, actionable). Blue's projects root is metacharacter-free, so this does
  not fire in normal use.
- Only standard **stable** VS Code install locations are resolved (user + system
  installs). VS Code Insiders / portable installs refuse visibly with
  `vscode-not-found`; Blue uses stable (verified).

## Unexpected pre-existing findings

- **On the pinned Node v24.18.0, the historical discrete-arg `cmd.exe /d /s /c
  code <dir>` form no longer injects**: libuv's post-CVE-2024-27980 quoting
  escapes cmd metacharacters passed as discrete args (measured — the discrete-arg
  case in `launchers.test.js` writes no sentinel, and a raw command-line `&` case
  does). So the specific historical exploit was already mitigated at the runtime
  layer on this Node. This does **not** reduce P12's value: the fix removes the
  dependency on libuv's escaping remaining correct across Node/runtime versions,
  and independently closes the open-any-folder authorization gap (which was never
  runtime-mitigated). The positive-control test is written to state this honestly.
- The `BLUE-HELM-MASTER-STATUS.md` remaining-work list still shows items 1
  (merge-gate.ps1) and 2 (V3b) as remaining though both are merged
  (`147fb74`, `6baa732`); outside this single-purpose branch.

## Recommended review focus

Command injection (no shell reachable on the production path), executable
substitution (Code.exe/wt.exe resolved only from main-owned env, never a renderer
path or raw PATH result), path authorization (exact canonical real-path membership
in the git-derived set), symlink/reparse escape (junction identity in/out of the
set), stale worktree identity, renderer compromise (zero children on any refusal),
visible refusal (reason constants only, no path echo), and fence-gate preservation
(the three pinned sha256 regions).

## Review diff

Full reviewed range:
`git diff a6bba64b2adef827e07592f7c54a81ccfcfcc86a...9851a9b05cee42eadb8524b677b5baba94c9aea2 --output=.agent-review-p12-launcher-hardening.diff`

- Pinned diff SHA-256: `ADC7686CA2293812B96920FC22516546A63699E2F126338D102CACCBDF66676E`
- Pinned diff size: `58181` bytes, 9 files.

## Reviewer verdict

`VERDICT: PASS`

The Full-class whole-diff review found no CRITICAL, HIGH, or MEDIUM findings.
Two non-blocking LOW findings were left unchanged to preserve the reviewed code
tip:

- `LOW-1`: `listLauncherAuthorizedDirs` performs bounded synchronous git
  enumeration on each launcher click. This can briefly affect responsiveness
  with many repositories or a hung git process, but it fails closed and has no
  security impact.
- `LOW-2`: `launcher-fence-invariant.test.js` hashes working-tree regions using
  their checkout EOL form. It is stable on the supported Windows CRLF checkout
  but could produce a false failure on an LF checkout. This is test portability,
  not a runtime or fence regression.

The Reviewer also recorded four informational residuals: fixed-location
executable candidates are checked with `existsSync`; the pre-existing bare
`wt` fallback remains PATH-resolved if the WindowsApps alias is absent; the
authorized set intentionally covers every user-owned repo/worktree under
`projectsRoot`; and a local-filesystem attacker could race directory identity
between authorization and spawn. None expands the compromised-renderer threat
model or blocks merge.

## Reviewer verdict source

Attached `Reviewer Report — P12 Launcher Hardening (Full-class, read-only)`,
supplied by Blue after an independent Opus review. The Reviewer regenerated the
pinned diff byte-for-byte, independently reproduced app **1203/0** and Pester
**659/0/0**, recomputed all three fence/PTY invariant regions against the base,
and confirmed the single handoff-only tail through `88ee84c`.

## Review-diff rule

- Before merge, use `git diff a6bba64...9851a9b`.
- After merge, reproduce the reviewed delta with
  `git diff <recorded-pre-merge-main>...9851a9b`.
- Always use `--output`; never PowerShell `>` for pinned review diffs.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that
  produced it. Blue remains the only merge authority.

Pinned `.agent-review-*.diff` files are local review artifacts and remain
gitignored.
