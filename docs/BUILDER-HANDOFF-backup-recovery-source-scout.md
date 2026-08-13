# Builder Handoff — Independent Backup and Recovery Source-Scout

Branch: `feature/backup-recovery-source-scout`
Worktree: `.worktrees\backup-recovery-source-scout`
Fork-point SHA: `4d0548e592d34e8407e939981bf4787c054387ad`
Pre-merge `main` SHA: `4d0548e592d34e8407e939981bf4787c054387ad`
Reviewed content tip: the content commit below; the branch tip is the handoff-only tail that pins the
review artifact
Merge commit SHA: **Pending until merge**

**Status: NOT MERGED, NOT PUSHED.** This branch stops for a fresh independent
**Standard-class** review. Per `AGENTS.md`, Blue remains the only merge authority and Claude Code
never merges its own work.

## 0. Procurement authority

Tracked record created by this branch: **`docs/OSS-PROCUREMENT-backup-recovery.md`**.

**Subsystem verdict status, verbatim, as this record ends:**

> BLUE SUBSYSTEM VERDICT: NOT YET ISSUED — IMPLEMENTATION REMAINS UNAUTHORIZED

This is a Source-Scout evaluation only. Per `AGENTS.md` § *OSS-FIRST PROCUREMENT GATE — HARD
INVARIANT* item 3, only Blue issues the subsystem verdict, and only **ADOPT, FORK, PROTOTYPE,
PATTERN-MINE, or BUILD FRESH** are final. § 9 of the record **recommends a direction** and does not
issue one.

**What this branch does NOT authorize:** installing or configuring backup software, creating a
production backup, uploading data anywhere, signing into or creating a cloud account, incurring a
subscription, reading or exporting secrets, modifying application code or configuration, running a
restore drill or prototype, issuing a Blue verdict, merging, or pushing.

## 1. Intended invariant

**One invariant: produce the required OSS-first procurement evaluation for independent backup and
recovery, and change nothing else.** Every change is documentation. No application code, test,
dependency, configuration, script, provider setting, hook, or GitHub configuration is touched, and no
roadmap state is updated.

## 2. Files changed

| File | Kind | Change |
| --- | --- | --- |
| `docs/OSS-PROCUREMENT-backup-recovery.md` | tracked, **new** | The procurement record: failure-class analysis, state inventory, candidate cards, three complete architectures, restore-drill design, key-loss options, Blue's decision questions, recommended direction, gate status |
| `docs/BUILDER-HANDOFF-backup-recovery-source-scout.md` | tracked, **new** | This handoff |

**Nothing else changed.** No `app/`, no `scripts/`, no test, no `package.json`, no lockfile, no
`.github/`, no `AGENTS.md`, no `BLUE-HELM-MASTER-STATUS.md`, no provider settings file.

**`BLUE-HELM-MASTER-STATUS.md` was deliberately not updated**, per the work order: roadmap state
changes only after a later verdict-finalization work order.

## 3. What the evaluation found

### 3.1 The measurement that reframes the problem

`git for-each-ref --format='%(refname:short) %(upstream:short)' refs/heads`, run 2026-08-13:

* **66 local branches total.**
* **6 have an upstream tracking branch.**
* **60 have none** — they exist on one disk, in one building.
* **0 tags.**

GitHub therefore protects roughly one branch in eleven, and nothing outside Git. This is the single
strongest piece of evidence for why backup is a blocking 1.0 prerequisite, and it was measured rather
than assumed.

### 3.2 State inventory

21 categories (S1–S21) classified as authoritative / valuable / reproducible / transient / secret,
each with include-or-exclude disposition, live-copy consistency risk, replacement-machine
portability, and recovery owner. Canonical locations were read from code, not guessed:

* `app/package.json` name `command-center` → `userData` = `C:\Users\levij\AppData\Roaming\command-center`
* `app/main.js:117` → `DEFAULT_PROJECTS_ROOT = 'D:\Workspace'`
* `app/main.js:123` → `VIDEO_SCOUT_RUN_ROOT = 'D:\Gemini_Video_Review\downloads'`
* `app/main.js:210` / `:222` / `:483` / `:766` → `settings.json`, `secure.json`, Dockview layout store, `.claude.json`

Measured sizes: `.git` 624 files / **6.1 MB**; `.merge-gate\` **12 files**; Video Scout library **61
files / 84.7 MB** (mostly excludable media); `%APPDATA%\command-center` non-cache state **under 5 KB**.
The authoritative set is **tens of megabytes**, so cost is not the binding constraint — discipline is.

### 3.3 The `safeStorage` finding

Official Electron documentation states that on Windows `safeStorage` keys "are generated via DPAPI"
and that "only a user with the same logon credential as the user who encrypted the data can typically
decrypt the data." `app/main.js:236` already handles that failure with the comment *"ciphertext
unreadable (different OS user / key rotation)."*

Therefore `secure.json` (131 B) is recorded as **excluded from ordinary backups**: including it would
likely produce an unusable artifact while adding secret-bearing material to every copy. Credential
recovery is specified as a **documented human procedure** — obtain a fresh key from the provider
console, re-enter through the in-app key setup UI — not a restored file.

### 3.4 Candidates and dispositions

Accepted as engines: **restic** (BSD-2-Clause, v0.19.1, 2026-07-05) and **Kopia** (Apache-2.0,
v0.23.1, 2026-06-16). Accepted as a component: **`git bundle`**. Accepted as optional transport:
**rclone** (MIT, v1.75.0).

Rejected with reasons: **Duplicati** (MIT **with a `proprietary/` carve-out** under
`Copyright (c) 2026 Duplicati Inc.`; GitHub reports NOASSERTION — plus an unnecessary service and
web-UI surface); **File History** (backs up libraries, and none of the real state lives in a
library); **robocopy** and **Syncthing** as backups (no versioning / deletion propagation);
**GitHub** as the backup (measured 6-of-66 coverage). **`wbadmin`** is not selected and its full
availability on this **Windows 11 Home** host is marked **UNVERIFIED** rather than assumed.

The decisive engine difference is recorded honestly in both directions:

* **restic** has **built-in VSS** (`--use-fs-snapshot`); its immutability path is `rest-server
  --append-only`, and native S3 Object Lock is **absent** — issues #4992 and #2202 are **closed**,
  and proposal **#3195 has been OPEN since 2020-12-27**, last updated 2024-07-06.
* **Kopia** has **documented object lock** (`--retention-mode COMPLIANCE`, `kopia maintenance set
  --extend-object-locks true`) on S3/B2/Azure/GCS, but on Windows its VSS story is **Blue-authored
  before/after action scripts**, not a supported flag.

### 3.5 Architectures and the drill

Three complete architectures (A: no recurring cost, restic + external drive + OneDrive; B:
immutability-first, Kopia + external drive + B2 compliance object lock; C: Git-first, restic +
`git bundle` + external drive + B2). Each shows all three copies, storage forms, off-site placement,
encryption ownership, retention, RPO/RTO, alerting, cost, single points of failure, and behaviour when
GitHub **and** the computer are both unavailable. **GitHub is never counted as one of the three
copies**, and same-disk folders are never counted as separate copies.

The restore drill is **specified, not performed**, in 13 parts including a frozen manifest, recorded
digests, an isolated destination on a different physical device, dual restoration paths
(restic and plain `git clone <bundle>`), a **negative control proving `secure.json` is absent**,
the credential re-establishment procedure, cleanup restricted to what the drill itself created, and
evidence retained on `main`.

## 4. Security-sensitive surfaces touched

**None modified, and none read into.** No credential value was read, displayed, or recorded. No
credential store was opened. No `safeStorage` ciphertext was decrypted — `secure.json` was observed
only as a directory-listing row (name, 131 bytes, timestamp). No provider setting, hook, or
`~/.claude` file was modified. No secret, token, or credential appears in either changed file. No
backup, restore, upload, account creation, or sign-in occurred.

## 5. Commands run

Read-only Git, filesystem-metadata, and web research only:

* `git rev-parse main origin/main`, `git log -1 --format=...`, `git status --porcelain`
* `git worktree add -b feature/backup-recovery-source-scout …` (this worktree)
* `git for-each-ref refs/heads`, `git branch --no-merged main`, `git tag`, `git remote -v`
* `git ls-tree`, `git show`, `git diff --stat`, `git diff --check`, `git diff --output`, `cmp`, `sha256sum`
* `Get-ChildItem` / `Test-Path` for directory metadata (names, sizes, timestamps) — **no file
  contents were read from `%APPDATA%\command-center`**
* `gh api` for repository, release, license, and issue metadata (restic, rest-server, kopia,
  duplicati, rclone, syncthing)
* Web fetches of official documentation (Electron, restic, Kopia, Backblaze, Microsoft, git-scm)

**No Electron, provider CLI, app-server, listener, hook installation, or live model session was
started.** No `npm`, no Pester, no application launch, no backup or restore command.

## 6. Exact test results — gate disposition

**Documentation-only branch. App and Pester gates were NOT run, and none was required.** The delta is
two new tracked Markdown files and no code, test, dependency, script, or configuration file.

| Gate | Disposition |
| --- | --- |
| App gate (`npm test`) | **NOT RUN** — documentation-only |
| Pester (`scripts\run-pester.ps1`) | **NOT RUN** — documentation-only |
| `git diff --check` | **RUN — clean (exit 0)** |

Recorded plainly rather than omitted: this branch performed no gate execution and makes no claim about
the state of the gates beyond what `main` already records.

## 7. Manual verification

* Starting state confirmed before any edit: `main` = `origin/main` =
  `4d0548e592d34e8407e939981bf4787c054387ad`, subject `Merge Release 1.0 decision reconciliation`,
  tracked state clean, `.worktrees/` untracked and untouched.
* The worktree was created at exactly that SHA and verified with `git rev-parse HEAD`.
* Every external claim carries a source and the **2026-08-13** access date. Version, license, and
  issue-state facts were taken from the GitHub REST API rather than from prose summaries.
* The procurement record ends with the exact required line and contains **no** ADOPT / FORK /
  PROTOTYPE / PATTERN-MINE / BUILD FRESH verdict line.
* Final state: `main` and `origin/main` unchanged at `4d0548e5…`; the four previously audited orphan
  branches untouched; this worktree clean after commits.

## 8. Known limitations

* **This is a paper evaluation.** No candidate was installed or executed. Every behavioural claim is
  from official documentation, not from observing the tool on this machine.
* **Three claims are explicitly UNVERIFIED and labelled as such in the record:** `wbadmin`'s full
  feature availability on Windows 11 Home; whether `secure.json` survives a profile migration;
  whether `.claude.json` carries session material.
* **Cost figures are point-in-time.** Backblaze B2 at $6.95/TB/month with 10 GB free and free egress
  to 3× stored bytes, read from the official pricing page on 2026-08-13. Pricing changes.
* **Retention numbers and the quiescing choice are marked `(?)`** as tunable, per project convention.
* **No architecture was validated end to end.** The load-bearing uncertainty named in § 9 of the
  record is exactly what a bounded prototype would resolve.
* **The recommendation is a recommendation.** Blue may reasonably choose Architecture B over C, or
  PROTOTYPE over ADOPT; the record argues both and says which question decides it.

## 9. Unexpected pre-existing findings

* **60 of 66 local branches have no upstream, and there are zero tags.** The exposure is larger than
  "no backup exists" — most of the project's branch history has never left this machine.
* **`.merge-gate\` holds 12 human-authored merge authorizations that are gitignored by design.** They
  are deliberately never committable, which means they are also completely unprotected by GitHub, and
  they are the evidence trail for every merge the project has gated.
* **Duplicati's licensing changed shape.** The LICENSE is MIT with a `proprietary/` carve-out under
  `Copyright (c) 2026 Duplicati Inc.` This is not what a "MIT-licensed OSS backup tool" reputation
  implies, and it is why GitHub reports NOASSERTION.
* **restic's `rest-server` latest release is v0.14.0 from 2025-05-31** — over a year old, though the
  repository was pushed 2026-07-22. Relevant because `--append-only` is restic's only documented
  immutability path.
* **`git worktree` metadata is path-bound.** With 26 registered worktrees, a restore to a different
  drive letter will need `git worktree repair`; the drill design accounts for this.

## 10. Recommended review focus

1. **Whether the record issues no verdict** — that § 9 recommends a direction, ends with the exact
   required line, and contains no `BLUE SUBSYSTEM VERDICT: ADOPT|FORK|PROTOTYPE|PATTERN-MINE|BUILD
   FRESH` anywhere.
2. **Whether the 60-of-66 branch measurement is reproducible** from the command recorded in § 3.1.
3. **Whether the `safeStorage`/DPAPI conclusion is properly sourced** to official Electron
   documentation and correctly turned into an exclusion plus a human recovery procedure.
4. **Whether negative claims are disciplined** — particularly restic's absent object-lock support
   (closed issues #4992/#2202, open proposal #3195) and the `wbadmin` UNVERIFIED marking.
5. **Whether the architectures are honest**: three genuinely independent copies, GitHub never counted
   as one of them, no two copies on the same physical disk.
6. **Whether the drill design could actually run without the live workspace or GitHub**, and whether
   its cleanup step can touch anything it did not create.
7. **Whether any credential value, path to a credential store's contents, or secret-shaped string
   appears in either document.**
8. **Whether the ADOPT-versus-PATTERN-MINE reasoning holds** under `AGENTS.md` items 4 and 5, and is
   not a silent narrowing in either direction.

## 11. Review artifact

| Field | Value |
| --- | --- |
| Base (pre-merge `main`) | `4d0548e592d34e8407e939981bf4787c054387ad` |
| **Reviewed content tip** | **Pinned by the tail commit — see the table below once written** |
| Branch tip | the handoff-only tail commit that pins this table |

*(Artifact identity is recorded by the tail commit, after the content tip exists.)*

## Review-diff rule

* Before merge, use `git diff main...<tip>`.
* After merge, reproduce with `git diff <recorded-pre-merge-main>...<tip>`.
* Always use `--output`; never PowerShell `>`.
* Retain the literal `VERDICT: PASS|FAIL` line and name the review that produced it.

## Reviewer verdict

**None yet** — this branch stops for a fresh independent Standard-class review.

## Reviewer verdict source

Pending.

---

**BLUE SUBSYSTEM VERDICT: NOT YET ISSUED — IMPLEMENTATION REMAINS UNAUTHORIZED** — independent backup
and recovery, evaluated 2026-08-13 in `docs/OSS-PROCUREMENT-backup-recovery.md`. **Implementation,
installation, configuration, and any restore drill remain unauthorized until Blue issues a verdict and
it is recorded on `main`.**
