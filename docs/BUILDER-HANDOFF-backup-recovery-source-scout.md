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

## Independent review result — revision 2

An independent Standard-class review examined revision 2 (corrected reviewed tip `b079d0f9`) and
returned, literally:

> `VERDICT: FAIL`

**This was a FAIL, not a partial pass, and it is recorded here without severity downgrade.** Seven
findings were raised; **all seven are applied in revision 3**.

| # | Severity | Blocking | Finding | Applied in revision 3 |
| --- | --- | --- | --- | --- |
| 1 | **High** | **Yes** | Handoff § 3.4 still described GitHub as having "measured 6-of-66 coverage" — an upstream-configuration count presented as commit reachability, contradicting the corrected record, and arithmetically the "one branch in eleven" formulation the correction existed to remove | § 3.4 rewritten; both documents swept for every derived fraction and synonym |
| 2 | **Medium** | **Yes** | Architecture A's Copy 3 said the restic repository was "replicated to an already-owned OneDrive folder" with **no mechanism named**, inviting file-level sync of a live repository; §6.13 quiescing covered only source-side writers | Copy 3 redesigned as a **separate repository** over restic's rclone backend, populated by `restic copy`; § 5.2 serialization rules added |
| 3 | **Medium** | **Yes** | "26 registered worktrees" was wrong in three places — actual 32 registered / 33 rows | Corrected everywhere as a **dated snapshot** with method (record note †) |
| 4 | **Low/Medium** | No — corrected now | "the ten sibling worktree folders" — actual **9** physical directories, only **5** registered | § 8 Q1 and S16 restated with the 9/5/4 breakdown |
| 5 | **Low** | No — corrected now | Bare `git for-each-ref` described as producing 66 refs; it returns **99** across all namespaces | § 6.1 manifest and § 6.6 acceptance criterion scoped to `git for-each-ref refs/heads` |
| 6 | **Low** | No — corrected now | Loose plaintext `*.bundle` files sat beside the restic repository on removable media; the encryption-ownership line covered only bundles *inside* the repository | Bundles staged, verified, and captured **inside** encrypted snapshots; the "two independent restore mechanisms" claim **withdrawn** (record § 5.3) |
| 7 | **Low/informational** | No | `.git` recorded as 624 files / 6.1 MB, a mutable measurement presented as fixed | Re-measured and labelled with exact time and method (record note ‡) |

**No reviewer has yet examined revision 3, and no Blue verdict has been issued at any point on this
branch.** This handoff records the review outcome; it does not claim a passing one.

**Revision 3 — independent-review corrections.** All seven findings applied. Candidate versions,
licensing, pricing, `safeStorage` findings, security advisories, candidate dispositions, and source
citations are **unchanged and were not re-researched**; no new candidate sweep was run. The only
external documentation consulted was what Finding 2 required to substantiate the corrected
Architecture A — restic's rclone-backend and `copy` documentation, and rclone's OneDrive provider
page — using the already-evaluated rclone candidate. **All three earlier artifacts are preserved
byte-identical.**

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

### 3.1 The measurement — corrected in revision 2

**Revision 1 of this branch made an invalid inference and it is corrected here.** It treated "no
configured upstream" as equivalent to "commits absent from GitHub." Those are different facts.

Live enumeration, 2026-08-13, `git ls-remote --heads origin` plus per-tip ancestry testing against
every live remote head:

* **8 live remote heads.**
* **66 local branch heads.**
* **61 local branch tips reachable from at least one live remote head.**
* **5 not reachable** — `codex/chat-handoff-5`, `codex/docs-quick-check-roadmap`,
  `codex/oss-first-procurement-gate`, `codex/release-1.0-auth-backup-blockers`, and
  `feature/backup-recovery-source-scout` (this branch, expected — intentionally unpushed).
* Separately: **60 local branches have no configured upstream**; **0 tags** locally and remotely.

**The pre-existing exposure is four remote-unreachable branch tips, not sixty unique histories.**
Most branches without an upstream were merged and pushed through `main`, so their objects are
reachable there.

**What survives the correction, and matters.** The four unreachable tips are exactly the four orphan
branches classified by `docs/DECISION-RECONCILIATION-release-1.0.md` — including
`codex/docs-quick-check-roadmap`, which carries the verbatim July 30 Blue procurement verdict. And
reachability of commit objects is not preservation of the environment: 8 remote refs do not preserve
the 66-name local ref namespace, branch topology, worktree mapping, reflogs, uncommitted work,
gitignored evidence, or any non-Git state.

### 3.2 State inventory

21 categories (S1–S21) classified as authoritative / valuable / reproducible / transient / secret,
each with include-or-exclude disposition, live-copy consistency risk, replacement-machine
portability, and recovery owner. Canonical locations were read from code, not guessed:

* `app/package.json` name `command-center` → `userData` = `C:\Users\levij\AppData\Roaming\command-center`
* `app/main.js:117` → `DEFAULT_PROJECTS_ROOT = 'D:\Workspace'`
* `app/main.js:123` → `VIDEO_SCOUT_RUN_ROOT = 'D:\Gemini_Video_Review\downloads'`
* `app/main.js:210` / `:222` / `:483` / `:766` → `settings.json`, `secure.json`, Dockview layout store, `.claude.json`

Measured sizes, **all dated snapshots with recorded method** (revision 3, Finding 7): `.git`
**647 files / 6,535,195 B apparent ≈ 6.2 MiB / 7.4 MiB on disk**, measured `2026-08-13T05:50Z` via
`du -sb`, `du -sh`, and `find … | wc -l`; `.merge-gate\` **12 files — 11 `*.psd1` plans and 1
`*.ps1` run helper**; Video Scout library **61 files / 84.7 MB** (mostly excludable media);
`%APPDATA%\command-center` non-cache state **under 5 KB**.
The authoritative set is **tens of megabytes**, so cost is not the binding constraint — discipline is.
**That controlling conclusion is unchanged by the re-measurement.**

**Worktree topology, corrected in revision 3** (Findings 3–4), measured `2026-08-13T05:49Z` via
`git worktree list --porcelain`, `ls .git/worktrees`, and a directory listing:

* **1** main worktree; **32** registered linked worktrees; **33** total `git worktree list` rows.
* **27** registered linked worktrees under `.worktrees\`; **5** registered `agent-command-center-*`
  sibling worktrees.
* **9** physical `agent-command-center-*` sibling directories — so **4 are not registered
  worktrees** and are treated as unexamined scope (S16, § 8 Q1).
* **Dirtiness measured, not inferred:** **4 of 33** rows reported any entry, **all untracked-only**,
  **zero tracked modifications** anywhere. The record no longer implies that registration means
  unfinished work.

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
library); **robocopy** and **Syncthing** as backups (no versioning / deletion propagation).
**`wbadmin`** is not selected and its full availability on this **Windows 11 Home** host is marked
**UNVERIFIED** rather than assumed.

**GitHub is rejected as the complete backup — and revision 3 corrects why.** Revision 2's phrasing
here read "measured 6-of-66 coverage," which was the **last surviving instance of the exact defect
revision 2 existed to remove**: `6` counts branches with a *configured upstream*, not commit
reachability. Stated correctly, from the live enumeration:

* **66** local branch tips.
* **6** local branches with a configured upstream.
* **8** live remote heads.
* **61 of 66** local tips reachable through live remote history.
* **5** tips unreachable — 4 pre-existing, plus this intentionally unpushed branch.
* **0** tags, locally and remotely.

**GitHub's commit coverage is therefore broad, not thin.** It is rejected as the backup because it
does not preserve: the full local head namespace and branch naming; the worktree mapping; reflogs and
stashes; working-tree changes; gitignored review and merge-gate evidence (`.agent-review*.diff`,
`.merge-gate\`); non-Git application state; or **any recovery path independent of GitHub loss or
compromise** (F5).

The decisive engine difference is recorded honestly in both directions:

* **restic** has **built-in VSS** (`--use-fs-snapshot`); its immutability path is `rest-server
  --append-only`, and native S3 Object Lock is **absent** — issues #4992 and #2202 are **closed**,
  and proposal **#3195 has been OPEN since 2020-12-27**, last updated 2024-07-06.
* **Kopia** has **documented object lock** (`--retention-mode COMPLIANCE`, `kopia maintenance set
  --extend-object-locks true`) on S3/B2/Azure/GCS, but on Windows its VSS story is **Blue-authored
  before/after action scripts**, not a supported flag.

### 3.5 Architectures and the drill

Three complete architectures (A: no recurring cost, restic + external drive + OneDrive via rclone;
B: immutability-first, Kopia + external drive + B2 compliance object lock; C: Git-first, restic +
`git bundle` + external drive + B2). Each shows all three copies, storage forms, off-site placement,
encryption ownership, retention, RPO/RTO, alerting, cost, single points of failure, and behaviour when
GitHub **and** the computer are both unavailable. **GitHub is never counted as one of the three
copies**, and same-disk folders are never counted as separate copies.

**Revision 3 closed the Architecture A gap** (Finding 2). Copy 3 is now a **separate restic
repository** reached as `rclone:<remote>:<path>` through restic's documented rclone backend and
populated by repository-aware **`restic copy`** of completed snapshots — never by pointing the
OneDrive desktop sync client at Copy 2's live repository directory. New record § 5.2 makes the rules
common to all three architectures: no file-sync or byte-copy of an active repository during backup,
copy, prune, check, or maintenance; serialized operations; completed snapshots only; and a locked or
incomplete repository counted as a **visibly failed run**. The rclone OneDrive credential surface is
named as something that must be specified and protected later — **no credential is configured by
this branch.**

**Revision 3 also removed plaintext bundles from removable media** (Finding 6). Bundles are staged
locally, verified with `git bundle verify`, captured **inside** the encrypted restic snapshot, and the
staging copy removed by guarded cleanup only after the snapshot and verification both succeed.
**Consequence, recorded rather than hidden:** Architecture C's "two independent restore mechanisms"
claim is **withdrawn** — a bundle inside restic still needs restic to retrieve, so it is Git-*native*
but not storage-engine-*independent* (record § 5.3, § 8 Q13).

The restore drill is **specified, not performed**, in 13 parts including a frozen manifest **scoped
per ref namespace** (Finding 5: 66 local heads via `git for-each-ref refs/heads`, not 99 from a bare
`git for-each-ref`; and an explicit note that bundles preserve neither reflogs nor stashes), recorded
digests, an isolated destination on a different physical device, two verifiable restoration artifacts
**that share restic as their retrieval path**, a **negative control proving `secure.json` is absent**,
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

**Added in revision 3 — all read-only, all on this host:**

* `git worktree list --porcelain`, `ls .git/worktrees`, and a directory listing of
  `D:\Workspace\agent-command-center-*` (Findings 3–4)
* `git -C <path> status --porcelain` across all 33 worktree rows — **status only; nothing staged,
  committed, cleaned, or modified in any other worktree** (Finding 3)
* `git for-each-ref refs/heads | refs/remotes | refs/tags`, bare `git for-each-ref`, `git stash list`
  (Finding 5)
* `du -sb .git`, `du -sh .git`, `find .git -type f | wc -l` (Finding 7)
* Three web fetches to substantiate Finding 2 only: restic's rclone-backend and `copy` documentation,
  and rclone's OneDrive provider page. **No new candidate sweep.**

**No Electron, provider CLI, app-server, listener, hook installation, or live model session was
started.** No `npm`, no Pester, no application launch, no backup or restore command. **No software
was installed, no account created, no data transferred, no secret read, and no cleanup of production
data performed** — in revision 3 as in revisions 1 and 2.

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

**Revision-3 verification, performed before any edit:**

* Branch `feature/backup-recovery-source-scout` at starting tip `7bda19af…`, whose parent is the
  reviewed revision-2 content tip `b079d0f9…`. Tracked worktree state clean.
* `main` = `origin/main` = `4d0548e592d34e8407e939981bf4787c054387ad`, unchanged.
* **All three earlier artifacts re-hashed and confirmed byte-identical** at 68,901 / 38,060 / 82,975
  bytes and `c1a36fb4…` / `f28056f1…` / `9d915b50…`.
* Every corrected count was **re-derived on this host**, not copied from the review: worktree
  topology, per-worktree status, ref-namespace counts, and `.git` size. The review's numbers and the
  builder's numbers agree.

**Revision-3 verification, performed after the edits:**

* `git diff --check` clean on both new ranges; both ranges change exactly the two declared Markdown
  files; the tail is exactly one commit touching only this handoff.
* The procurement record still ends with the exact required line and contains **no** ADOPT / FORK /
  PROTOTYPE / PATTERN-MINE / BUILD FRESH verdict line.
* No code, test, dependency, script, configuration, roadmap file, provider setting, account, or
  storage target changed. No software installed, no account created, no secret read, no backup,
  copy, upload, restore, prototype, or production-data cleanup performed.

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
* **Revision 1 shipped a wrong inference, and that is a process signal.** The faulty claim was
  measured-looking, quantified, and repeated in six places before anything checked whether upstream
  configuration implies commit absence. The corrected § 9 states plainly which conclusions changed
  (Architecture C's rationale, the risk ranking) and which did not (ADOPT). A reader comparing
  revisions should not have to guess which parts moved.
* **Revision 2's own correction was incomplete, and that is the sharper signal.** A revision written
  specifically to purge one conflation **left an instance of it in this handoff** (Finding 1), and
  shipped a second wrong measured count (Findings 3–4) in the same pass. Self-correction is not
  self-verification. The independent review caught both.
* **Counts in this record are dated snapshots, not invariants.** Worktree topology, `.git` size, and
  dirty/clean state were measured at `2026-08-13T05:49–05:50Z` and change with ordinary work. Any
  later document restating them must **re-measure**, not copy them forward.
* **Architecture A's off-site design is specified but unexercised.** `restic copy` over an rclone
  OneDrive remote is documented behaviour, not observed behaviour — no repository was created, no
  remote configured, no byte transferred. The bounded prototype in record § 9 is what would prove it.
* **The Blue Helm-owned remainder grew in revision 3** — serialized job ordering, the rclone remote,
  and bundle staging with verification and guarded cleanup. Record § 9 flags the threshold at which a
  growing remainder should reopen the verdict direction rather than be absorbed silently into
  `ADOPT`.

## 9. Unexpected pre-existing findings

* **Four pre-existing branch tips are not reachable from any live remote head, and they are exactly
  the four orphan branches the reconciliation audit classified** — including
  `codex/docs-quick-check-roadmap`, which carries the verbatim July 30 Blue procurement verdict. The
  branches already identified as holding stranded decisions are also the branches whose commits exist
  nowhere but this disk. **Zero tags** exist locally or remotely.
* **`.merge-gate\` holds 12 gitignored control-plane files — 11 `*.psd1` merge-authorization plans
  and 1 `*.ps1` run helper.** All twelve are valuable local evidence; only the eleven are
  authorization plans. Being never-committable by design, they are structurally unprotected by any
  Git remote, and they are the evidence trail for every merge the project has gated.
* **Duplicati's licensing changed shape.** The LICENSE is MIT with a `proprietary/` carve-out under
  `Copyright (c) 2026 Duplicati Inc.` This is not what a "MIT-licensed OSS backup tool" reputation
  implies, and it is why GitHub reports NOASSERTION.
* **restic's `rest-server` latest release is v0.14.0 from 2025-05-31** — over a year old, though the
  repository was pushed 2026-07-22. Relevant because `--append-only` is restic's only documented
  immutability path.
* **`git worktree` metadata is path-bound.** With **32 registered linked worktrees** (33 rows
  including main, measured `2026-08-13T05:49Z`), a restore to a different drive letter will need
  `git worktree repair`; the drill design accounts for this.
* **Four `agent-command-center-*` directories on disk are not registered worktrees.** Nine such
  sibling directories exist; only five appear in `git worktree list`. The other four are unexamined
  by this record and are routed to Blue as a scope question (§ 8 Q1, S16) rather than silently
  included or silently dropped.
* **Almost nothing is actually dirty right now.** Across all 33 worktree rows, only 4 reported any
  entry and **all were untracked-only, with zero tracked modifications**. This does not weaken the
  case for backing up uncommitted work — it means the exposure is a *moving target*, not a standing
  backlog, and the record now says so instead of implying widespread unfinished work.

## 10. Recommended review focus

1. **Whether the record issues no verdict** — that § 9 recommends a direction, ends with the exact
   required line, and contains no `BLUE SUBSYSTEM VERDICT: ADOPT|FORK|PROTOTYPE|PATTERN-MINE|BUILD
   FRESH` anywhere.
2. **Whether the corrected reachability measurement is reproducible** from the commands recorded in
   § 3.1 — `git ls-remote --heads origin`, then per-tip ancestry against every live remote head — and
   whether **every** current-voice claim previously derived from the upstream-count inference has been
   corrected rather than only the headline ones.
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
9. **Whether § 9 genuinely re-derives rather than find-replaces.** The corrected risk ranking should
   stand on its own evidence, and the near-zero-cost mitigation (pushing the four stranded branches)
   should be named without being conflated with the subsystem or treated as authorized.

**Revision-3-specific focus — the seven applied findings:**

10. **Finding 1 — whether the conflation is genuinely gone.** Sweep both documents for every
    fraction, synonym, table cell, and summary derived from `6 of 66`, `60 local-only histories`, or
    `one branch in eleven`. Historical statements survive **only** inside labelled correction
    history (record § 0 revision table, § 9 withdrawals, this handoff's review-result section).
11. **Finding 2 — whether Architecture A is now genuinely complete.** Is the replication mechanism
    named, repository-aware, and free of any file-sync of a live repository? Are serialization and
    quiescing stated? Is the rclone credential surface deferred rather than invented?
12. **Findings 3–4 — whether the worktree numbers are reproducible and correctly distinguished**:
    1 main / 32 registered / 33 rows / 27 under `.worktrees\` / 5 registered siblings / 9 physical
    siblings / 4 unregistered. And whether dirtiness is stated as **measured** rather than inferred
    from registration.
13. **Finding 5 — whether every 66-count is scoped to `git for-each-ref refs/heads`**, and whether
    the drill's acceptance criterion names its ref namespace exactly.
14. **Finding 6 — whether any loose plaintext `*.bundle` remains on removable or off-site media**,
    and whether the withdrawal of "two independent restore mechanisms" is carried consistently
    through Architecture C, the comparison matrix, § 5.3, the drill, and § 9. **A reviewer should
    specifically check that C's remaining advantage is not overstated** — after this correction it
    is close to "A with B2 instead of OneDrive," and the record says so.
15. **Finding 7 — whether mutable measurements are labelled with time and method** rather than
    presented as invariants.
16. **Whether the re-derivation is honest about what changed.** `ADOPT` and the restic-versus-Kopia
    conditional survive; Architecture C's margin narrowed materially; the Blue Helm-owned remainder
    grew. All four should be visible, not just the ones that flatter the previous conclusion.

## 11. Review artifacts

### Commit shape

| Field | Value |
| --- | --- |
| Base (pre-merge `main`) | `4d0548e592d34e8407e939981bf4787c054387ad` |
| Revision 1 content tip (superseded, retained) | `ccb8b5246de03cd8974aba68a4aa738798c0ce99` |
| Revision 1 handoff-only tail | `9e9ad01d8e42574cda7e8ed7911ed998da8290e5` |
| Revision 2 content tip (reviewed → `VERDICT: FAIL`, retained) | `b079d0f9d092544e9f83e46a84cb212924599f4a` |
| Revision 2 handoff-only tail | `7bda19afb33f8ce0677996dec2ba922af1b7f732` |
| **Revision 3 reviewed content tip** | **pinned by the tail commit below** |
| Branch tip | the revision-3 handoff-only tail commit that pins this table |

**Review the revision-3 cumulative range** — it is the controlling artifact. The revision-3 focused
range is provided so this correction can be audited in isolation against the reviewed revision-2 tip.

### The five pinned artifacts

| # | Artifact | Range | Shortstat | Size | SHA-256 |
| --- | --- | --- | --- | ---: | --- |
| 1 | `.agent-review-backup-recovery-source-scout.diff` **(rev 1 original, unmodified)** | `4d0548e5...ccb8b524` | 2 files, 917 insertions, 0 deletions | **68,901 bytes** | `c1a36fb402ea4580e5061cbefe89317d3a812af3dc374b5741769af77b788e4c` |
| 2 | `.agent-review-backup-recovery-correction.diff` **(rev 2 focused, unmodified)** | `9e9ad01d...b079d0f9` | 2 files, 211 insertions, 62 deletions | **38,060 bytes** | `f28056f131908992cabea030eca85c3cfb93e11b0863ab3a06169f2729106ba7` |
| 3 | `.agent-review-backup-recovery-source-scout-cumulative.diff` **(rev 2 cumulative, unmodified)** | `4d0548e5...b079d0f9` | 2 files, 1,087 insertions, 0 deletions | **82,975 bytes** | `9d915b5098ef274eb8e37710d7c709ecd58e9bf8c54a3d05aec1accedfb5855a` |
| 4 | `.agent-review-backup-recovery-revision-3.diff` **(rev 3 focused)** | `7bda19af...<rev 3 tip>` | *pinned by the tail commit* | *pinned by the tail commit* | *pinned by the tail commit* |
| 5 | `.agent-review-backup-recovery-revision-3-cumulative.diff` **(rev 3 cumulative — controlling)** | `4d0548e5...<rev 3 tip>` | *pinned by the tail commit* | *pinned by the tail commit* | *pinned by the tail commit* |

**Artifacts 1–3 are preserved byte-identical** — each re-hashed at the start of revision 3 and
unchanged. None was regenerated, renamed, or overwritten. **Revision 3 writes new filenames rather
than touching any existing artifact.**

All were created with `git diff --output` (never PowerShell `>`) and are gitignored via
`.gitignore:33`. **Artifacts 4 and 5 were each regenerated from their stated range to a separate
temporary file and proven byte-identical; only the temporary copies were removed.**
`git diff --check` is clean (exit 0) on **both** new revision-3 ranges.

### Changed-file lists

**Revision-3 focused range** `7bda19af...<revision-3 tip>` — exactly the two declared Markdown files:

| Status | Path |
| --- | --- |
| `M` | `docs/BUILDER-HANDOFF-backup-recovery-source-scout.md` |
| `M` | `docs/OSS-PROCUREMENT-backup-recovery.md` |

**Revision-3 cumulative range** `4d0548e5...<revision-3 tip>` — the same two files, still the only
additions:

| Status | Path |
| --- | --- |
| `A` | `docs/BUILDER-HANDOFF-backup-recovery-source-scout.md` |
| `A` | `docs/OSS-PROCUREMENT-backup-recovery.md` |

**Gate disposition: documentation-only; the app and Pester gates were NOT run** (§ 6). No application
code, test, dependency, configuration, script, provider setting, hook, GitHub configuration, backup
target, or external account is present in either range, and no production data was copied or uploaded.
No backup, restore, installation, upload, account creation, or model session occurred during the
correction.

**The revision-3 tail commit touches only this handoff document**, and artifacts 4 and 5 both end at
the revision-3 content tip and exclude the tail.

## Review-diff rule

* Before merge, use `git diff main...<tip>`.
* After merge, reproduce with `git diff <recorded-pre-merge-main>...<tip>`.
* Always use `--output`; never PowerShell `>`.
* Retain the literal `VERDICT: PASS|FAIL` line and name the review that produced it.

## Reviewer verdict

**Revision 2 — `VERDICT: FAIL`.** Independent Standard-class review of content tip `b079d0f9`, seven
findings (1 High / 2 Medium / 3 Low–Low-Medium / 1 informational), three of them merge-blocking. The
verdict is recorded literally and **not** characterised as a partial pass. All seven findings are
applied in revision 3; the full table is in the *Independent review result* section above.

**Revision 3 — none yet.** This branch stops for a **fresh independent Standard-class review** of the
revision-3 cumulative range. The revision-3 corrections were written by the same session that produced
the revision-2 review, so **that reviewer is not independent of this revision** and must not review
it — a different reviewer is required.

## Reviewer verdict source

Revision 2: independent Standard-class review recorded above, verdict line `VERDICT: FAIL`.
Revision 3: **pending.**

---

**BLUE SUBSYSTEM VERDICT: NOT YET ISSUED — IMPLEMENTATION REMAINS UNAUTHORIZED** — independent backup
and recovery, evaluated 2026-08-13 in `docs/OSS-PROCUREMENT-backup-recovery.md`. **Implementation,
installation, configuration, and any restore drill remain unauthorized until Blue issues a verdict and
it is recorded on `main`.**
