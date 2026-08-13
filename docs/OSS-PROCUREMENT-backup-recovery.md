# OSS Procurement — Independent Backup and Recovery

Subsystem: **Independent backup and recovery** (Blue Helm 1.0 remaining-work entry 1).
Record type: **Source-Scout evaluation, with Blue's issued subsystem verdict recorded in § 12.**
Date: **2026-08-13**
Evidence retrieval date: **2026-08-13** (all external sources accessed this date unless stated).
Branch: `feature/backup-recovery-verdict-finalization` (evidence produced on
`feature/backup-recovery-source-scout`)
Base `main`: `4d0548e592d34e8407e939981bf4787c054387ad` (subject `Merge Release 1.0 decision reconciliation`)
Revision: **4** — **verdict finalization.** Revision 3 was examined by a fresh independent
Standard-class reviewer and returned **`VERDICT: PASS`**. Blue has since issued the subsystem
verdict, and **revision 4 records it verbatim** (§ 12). Revisions 1–3, their corrections, and
the full review history — including the earlier `VERDICT: FAIL` and its seven findings — are
preserved below unchanged as the evidence trail.

**Revision history.**

| Rev | Date | Change |
| --- | --- | --- |
| 1 | 2026-08-13 | First submission at content tip `ccb8b524`. |
| 2 | 2026-08-13 | **Corrective.** Revision 1 inferred "commits absent from GitHub" from "no configured upstream." That inference is invalid. A live `git ls-remote --heads origin` enumeration showed **8 remote heads covering 61 of 66 local branch tips**, leaving **5 unreachable** — 4 pre-existing plus this intentionally unpushed branch. Every claim derived from the faulty inference is corrected, the risk ranking is re-derived, and the Architecture C rationale is restated on its corrected basis (§ 9). `.merge-gate\` is corrected to **11 plan files plus 1 run helper**. Candidate versions, licensing, pricing, `safeStorage` findings, architecture facts, and source citations are unchanged. |
| 3 | 2026-08-13 | **Independent review returned `VERDICT: FAIL`; all seven findings applied.** (1) The last stale `6-of-66` coverage claim is removed from the handoff. (2) **Architecture A's off-site copy is redesigned** — a *separate* restic repository reached through restic's rclone backend and populated by repository-aware `restic copy`, replacing an unstated file-level replication step. (3–4) The worktree inventory is corrected to a **dated snapshot**: 33 `git worktree list` rows, 32 registered linked worktrees, 27 under `.worktrees\`, 5 registered siblings, 9 physical sibling directories. Dirtiness is now **measured**, not inferred. (5) Ref-counting commands are scoped to `git for-each-ref refs/heads`. (6) **Plaintext `*.bundle` files are removed from removable media**; bundles are staged, verified, and captured *inside* encrypted restic snapshots — and the "two independent restore mechanisms" claim for Architecture C is **withdrawn**. (7) `.git` size is re-recorded as a timestamped snapshot with its method. Candidate versions, licensing, pricing, `safeStorage` findings, and source citations are unchanged. |

| 4 | 2026-08-13 | **Verdict finalization.** Revision 3 passed a fresh independent Standard-class review (`VERDICT: PASS`). Blue then issued the subsystem verdict **`ADOPT`** under an explicit issuing statement, recorded verbatim in § 12 together with the bounded-prototype boundary, the **split immutability experiment** (append-only-key immutability as the primary pass condition; compliance-mode Object Lock reported separately), **scope-coverage staleness** requirements, the **metadata-only** credential-exclusion proof, the **corrected DPAPI framing**, and different-machine restore acceptance. **No evidence, measurement, candidate finding, disposition, citation, or recommendation from revisions 1–3 was altered, softened, or removed.** The former `NOT YET ISSUED` ending is retained as labelled superseded history in § 12.9. |

**What revision 4 does not touch.** No candidate was re-researched, no measurement re-taken,
no architecture re-ranked, and no earlier conclusion rewritten. Revision 4 adds Blue's verdict
and the boundary that follows from it. Sections 0–11 stand exactly as reviewed. **No software
was installed, no account or application key created, no storage configured, no data copied,
backed up, restored, scanned, or uploaded, and no secret read.**

**What revision 3 does not touch.** No new candidate sweep was run. No candidate version,
license, price, security finding, disposition, or citation was re-checked or altered, except
where a correction above would otherwise create a direct contradiction. No software was
installed, no account created, no data transferred, no secret read.

**Conclusions that changed in revision 3, recorded rather than protected.** Architecture C's
claim to **two independent restore mechanisms is withdrawn** (§ 5.3, § 9): a bundle stored
inside a restic repository still requires restic to retrieve, so it is Git-*native* but not
storage-engine-*independent*. Because the corrected bundle handling now applies to
Architecture A as well, **the Git-native artifact is no longer a differentiator between A and
C** — the honest remaining difference is the off-site destination (§ 8 Q7). `ADOPT` and the
restic-versus-Kopia conditional are re-checked in § 9 and **survive unchanged**.

**Subsystem verdict: ISSUED — `ADOPT`.** Recorded verbatim in § 12.1, with Blue's issuing
statement, on 2026-08-13. Per `AGENTS.md` § *OSS-FIRST PROCUREMENT GATE — HARD INVARIANT*
item 3, only Blue issues the subsystem verdict, and only ADOPT, FORK, PROTOTYPE,
PATTERN-MINE, or BUILD FRESH are final. **What the verdict authorizes is a bounded prototype
under its own reviewed work order, and nothing more** — not production backup configuration,
not production-data upload, not a recurring schedule, not software installation, not account
or application-key creation, and not any claim that Blue Helm is protected (§ 12.2).

> **SUPERSEDED — revisions 1–3 read:** *"Subsystem verdict: NOT YET ISSUED. This record
> presents evidence and a recommended direction. It does not authorize installation,
> configuration, a backup, a restore, an account, or a purchase."* That was accurate while
> the verdict was outstanding. It is superseded by § 12 and retained for provenance, not
> reinterpreted.

## 0. What this record is, and the honest state of the problem

Blue Helm's release risk has been measured so far as "does the feature work." This
subsystem measures something else: **can this project survive a lost disk, a bad delete,
or a compromised account.** Nothing on `main` currently answers that.

The measured exposure, stated as **commit reachability** rather than as upstream
configuration:

> Live enumeration on 2026-08-13 (`git ls-remote --heads origin`) returned **8 live remote
> heads** against **66 local branch heads**. Testing every local tip for ancestry against
> those live heads: **61 local branch tips are reachable from at least one live remote
> head; 5 are not.** Separately, **60 local branches have no configured upstream** and
> there are **zero tags**, locally and remotely.

The five remote-unreachable tips are:

| Branch | Tip | Status |
| --- | --- | --- |
| `codex/chat-handoff-5` | `1ef274b8` | Pre-existing. `SUPERSEDED` per `docs/DECISION-RECONCILIATION-release-1.0.md` |
| `codex/docs-quick-check-roadmap` | `5eb697f3` | Pre-existing. `DEFERRED` — **carries the verbatim July 30 Blue procurement verdict** |
| `codex/oss-first-procurement-gate` | `7e6045a0` | Pre-existing. `SUPERSEDED` |
| `codex/release-1.0-auth-backup-blockers` | `cc440d44` | Pre-existing. `DEFERRED` — the stranded backup commitment |
| `feature/backup-recovery-source-scout` | this branch | **Expected** — intentionally unpushed pending review |

**The pre-existing exposure is therefore four remote-unreachable branch tips, not sixty
unique histories.** A branch without a configured upstream is not a branch whose commits
are absent from the remote: the great majority were merged and pushed through `main`, and
their objects are reachable there.

**What that correction does not soften.** Those four tips are exactly the four orphan
branches the decision-reconciliation audit classified — including the one holding a
verbatim Blue procurement verdict that never became tracked state. The branches most
likely to be lost are the branches already identified as holding stranded decisions. And
reachability of commit objects is not preservation of the working environment: GitHub
holds 8 refs, not the 66-name local head namespace, and none of the worktree mapping, reflogs,
uncommitted work, gitignored evidence, or non-Git application state catalogued in § 2.

## 1. The protection problem — failure classes

Backup, synchronization, replication, and a Git remote are four different controls that
fail in different ways. The table states, per failure class, what must survive, which copy
answers it, what independence that copy needs, how the failure becomes visible, and what
evidence proves recovery.

| # | Failure class | What must survive | Copy relied upon | Required independence | How failure becomes visible | Recovery evidence |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Internal drive failure (`D:` dies) | All Git history including the 4 remote-unreachable tips, the full local ref namespace and worktree mapping, non-Git app state, control-plane evidence | Copy 2 (local external) first; Copy 3 (off-site) if the external is also lost | Different physical device from `D:` | Immediate and loud — the machine cannot read the volume | Restore drill § 6 completes from Copy 2 alone |
| F2 | Whole-machine loss, theft, fire, flood | Same as F1 | Copy 3 (off-site) | Different physical building | Immediate; the machine is gone | Drill § 6 completes on a replacement machine from Copy 3 alone |
| F3 | Accidental deletion / destructive local command (`rm -rf`, bad `git worktree remove --force`) | The deleted state as of before the command | Most recent good **version** in Copy 2 or 3 | Version retention — a mirror that already synced the deletion is useless | **Often silent.** Discovered later, by absence | A restore of a specific dated version, not "latest" |
| F4 | Bad merge, reset, rebase, force-push | Pre-operation refs and reflog | Versioned repository snapshot; `git reflog` only if the machine survives | Snapshot must predate the operation and be immutable to it | Silent — the repo still works, just wrongly | Restore of a prior snapshot showing the original ref values |
| F5 | GitHub account compromise, repo deletion, prolonged outage | Full history without GitHub | Copy 1 (local) + Copy 2/3 | **Independent of GitHub entirely** — a `git clone` from origin is not a backup | Loud if outage; possibly silent if malicious history rewrite | Drill § 6 explicitly forbids GitHub as a source |
| F6 | Ransomware / destructive malware | Pre-encryption versions | An **append-only or object-locked** copy the compromised host cannot rewrite | Credentials on the host must not be able to delete the backup | Loud at the point of extortion, but backups may already be poisoned | Restore of a version predating the earliest encrypted file |
| F7 | Silent corruption (bit rot, bad cable, failing SSD) | Bit-exact original content | Any copy that passes verification | Requires checksums; a copy tool that faithfully copies corruption is not protection | **Entirely silent without integrity checking** | Recorded digests that match the frozen manifest (§ 6.2) |
| F8 | Backup job silently stops (scheduler disabled, drive unplugged, credential expired) | Nothing new is being protected | N/A — the failure is the absence of a copy | Independent monitoring of *last successful run* | **Silent by construction.** This is the most common real-world backup failure | A visible, dated last-success record and an alert on staleness |
| F9 | Off-site provider failure or account lockout | Recovery without that provider | Copy 2 (local external) | Copy 2 must not depend on the same account or vendor | Loud on attempted access | Drill § 6 run from Copy 2 with the provider unreachable |
| F10 | Loss of encryption key or recovery material | The ability to read copies that survived | None — **the data is gone while intact** | Key material must survive independently of the machine *and* of the backup itself | Silent until a restore is attempted | § 7 recovery-material path, exercised in the drill |
| F11 | Restoring a technically valid but stale or incomplete snapshot | Correct, current, complete state | The snapshot chosen by a human who can see its date and contents | Requires a manifest of what *should* be there | Silent — the restore "succeeds" | Frozen manifest (§ 6.1) compared against restored reality |
| F12 | Provider credentials copied into an inappropriate backup | Secrecy of `GEMINI_API_KEY` and any future credential | N/A — this is a leak, not a loss | Exclusion must be proven, not assumed | Silent | Negative control in the drill (§ 6.7): the excluded paths are absent from the restore |

**Two statements this record refuses to blur.**

* **A Git remote is not a backup.** It holds pushed history only. Measured today that is
  **8 refs carrying commits that cover 61 of 66 local tips** — but it holds none of the
  66-name local head namespace (`git for-each-ref refs/heads`), none of the worktree mapping or reflogs, none of the
  working tree, none of the gitignored control-plane evidence, and none of the non-Git
  application state. Commit reachability is not environment preservation.
* **Synchronization is not versioning.** A folder-sync or mirror tool propagates deletion
  and encryption faithfully. Against F3, F4, and F6 it is an accelerant, not a control,
  unless independent version retention is proven.

## 2. Blue Helm state inventory

Built from repository code, documentation, and **filesystem metadata only**. No credential
value was read, no credential store was opened, no `safeStorage` ciphertext was decrypted
or displayed. Sizes and timestamps below come from directory listings.

Canonical locations established from code:

* `app/package.json` → `"name": "command-center"`, so Electron `userData` resolves to
  `C:\Users\levij\AppData\Roaming\command-center` (confirmed present).
* `app/main.js:117` → `DEFAULT_PROJECTS_ROOT = 'D:\\Workspace'`.
* `app/main.js:123` → `VIDEO_SCOUT_RUN_ROOT = 'D:\\Gemini_Video_Review\\downloads'`.
* `app/main.js:210` → `settings.json`; `:222` → `secure.json`; `:483` → Dockview layout
  store in `userData`; `:766` → `%USERPROFILE%\.claude.json`.

| # | State category | Example path / owner | Classification | Include / protect separately / exclude | Live-copy consistency risk | Portable to a replacement machine? | Recovery prerequisite and owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Committed Git history and refs | `D:\Workspace\agent-command-center\.git` — **647 files, 6,535,195 B apparent (≈6.2 MiB); 7.4 MiB on disk** — dated snapshot, see note ‡ | **Authoritative** | **Include** | Yes — copying during a Git write can tear an object or ref update | Yes | Git installed. Blue |
| S2a | **Branch tips not reachable from any live remote head** | 4 pre-existing (`codex/chat-handoff-5`, `codex/docs-quick-check-roadmap`, `codex/oss-first-procurement-gate`, `codex/release-1.0-auth-backup-blockers`) + this unpushed branch | **Authoritative and irreplaceable** — these commits exist only on this disk | **Include** | With S1 | Yes | Same as S1. Blue |
| S2b | **Local ref namespace and topology** | **66 local heads** (`git for-each-ref refs/heads`) vs 8 live remote heads; plus **30 remote-tracking refs**, **3 other refs** (`refs/codex/turn-diffs/checkpoints/*`), **0 tags**, **0 stash entries**, and reflogs. Measured `2026-08-13T05:49Z`; bare `git for-each-ref` returns **99** rows across all namespaces | **Valuable, not preserved remotely** — the commits are mostly reachable, the *names and branch structure* are not | **Include** | With S1 | Yes | Same as S1. Blue |
| S3 | Uncommitted tracked changes | Working trees under `D:\Workspace\agent-command-center` and `.worktrees\*` | Valuable, possibly authoritative | **Include** | Yes — mid-edit capture | Yes | None beyond files. Blue |
| S4 | Untracked files | Any working tree | Valuable, unknown content | **Include** (with exclusions below) | Yes | Yes | None. Blue |
| S5 | Gitignored review artifacts | `.agent-review*.diff` (`.gitignore:33`) | **Valuable evidence, never committable** | **Include** | Low — written once via `git diff --output` | Yes | None. Blue |
| S6 | Merge-gate plans and control-plane evidence | `.merge-gate\` — **12 files: 11 `*.psd1` merge-authorization plans** (e.g. `plan-release-1.0-decision-reconciliation.psd1`, 827 B, 2026-08-13) **and 1 `*.ps1` run helper** | **Valuable, human-authored, irreplaceable** | **Include** | Low | Yes | None. Blue |
| S7 | Worktree content with potential unfinished work | **32 registered linked worktrees + 1 main worktree = 33 `git worktree list` rows** — 27 under `.worktrees\`, 5 `D:\Workspace\agent-command-center-*` siblings. Dated snapshot, see note † | Valuable | **Include** | Yes | Path-sensitive — see S8 | Blue |
| S8 | Git worktree administrative metadata | `.git\worktrees\*` — **32 administrative entries**, one per registered linked worktree — and the `.git` **files** inside each worktree pointing at absolute paths | Valuable but **path-bound** | **Include**, and expect repair on restore | Low | **Partially.** Absolute paths break if restored to a different drive letter or root | `git worktree repair`. Blue |
| S9 | Blue Helm application configuration | `%APPDATA%\command-center\settings.json` — **161 B** | Valuable, small | **Include** | Low, but written on app events | Yes — plain JSON | None. Blue |
| S10 | Saved Dockview layouts | `%APPDATA%\command-center\dockview-layout.json` (**1,291 B**); `dockview-prototype-layout.json` (**1,653 B**, retained prototype evidence) | Valuable, non-secret | **Include** | Low | Yes | None. Blue |
| S11 | Claude coordination surface | `%USERPROFILE%\.claude.json` | Valuable; **may contain session/account material** | **Protect separately — treat as sensitive until proven otherwise** | Written by external tooling at any time | **UNVERIFIED** | Out of scope here; see § 8 Q2 |
| S12 | Video Scout run library | `D:\Gemini_Video_Review\Downloads` — **61 files, 84.7 MB**; per-run `run-*\manifest.json` (~1.8 KB each) | **Reports/manifests valuable; media reproducible** | **Include manifests and reports; exclude media** | Yes, if a run is active | Yes | None. Blue |
| S13 | Downloaded media | `D:\Gemini_Video_Review\Downloads\*.mp4`, `*.srt`; repo `media/` (`.gitignore`) | **Reproducible / disposable** — already swept by `video-scout-retention-sweep.ps1` and V5c2a cleanup | **Exclude** | N/A | N/A | Re-download. Blue |
| S14 | Agent-role outputs | `D:\Workspace\.command-center\outputs\` — ~46 `web-scout-*` / `source-scout-*` run directories | Valuable research output | **Include** | Low | Yes | None. Blue |
| S15 | Documentation and human acceptance records | Tracked `docs\`, `BLUE-HELM-MASTER-STATUS.md` | Authoritative | **Include** (covered by S1) | With S1 | Yes | None. Blue |
| S16 | Other project repositories and unregistered sibling directories | `D:\Workspace\Automation-Chores`, `D:\Workspace\.reference`, and the **4 `agent-command-center-*` physical directories that are NOT registered worktrees** (note †) | Authoritative for those projects; the unregistered siblings are of **unknown** status until inspected | **Scope decision — see § 8 Q1** | Yes | Yes | Blue |
| S17 | Electron `safeStorage` ciphertext | `%APPDATA%\command-center\secure.json` — **131 B** | **Secret-bearing ciphertext** | **Exclude from ordinary backups** (§ 2.1) | Low | **NO — see § 2.1** | Re-enter key via in-app UI. Blue |
| S18 | Provider configuration and auth state | Provider CLI config under `%USERPROFILE%`; browser/session state | **Secret-bearing** | **Exclude** | Varies | No | Re-authenticate. Blue |
| S19 | Chromium/Electron runtime state | `%APPDATA%\command-center\{Cache,Code Cache,GPUCache,Network,Local Storage,Session Storage,Service Worker,blob_storage,DIPS,...}` | **Reproducible / transient**; `Network` and `Local Storage` may hold session material | **Exclude** | High — live-written | No | Regenerated. None |
| S20 | Dependencies and build output | `node_modules\`, `dist\`, `build\`, `out\` (`.gitignore`) | **Reproducible** | **Exclude** | N/A | N/A | `npm install`. Blue |
| S21 | Vendored large bundle | `app/renderer/vendor/transformers.web.min.js` (untracked by policy) | Reproducible | **Exclude** | N/A | N/A | Re-vendor. Blue |

**† Worktree topology — dated read-only snapshot, `2026-08-13T05:49Z`.** Method:
`git worktree list --porcelain`, `ls .git/worktrees`, and a directory listing of
`D:\Workspace\agent-command-center-*`. These counts change whenever a worktree is added or
removed; they are a **snapshot, not a timeless architecture fact**.

| Quantity | Count |
| --- | ---: |
| Main worktree | 1 |
| Registered linked worktrees (`.git\worktrees\` entries) | 32 |
| **Total `git worktree list` rows (incl. main)** | **33** |
| Registered linked worktrees under `.worktrees\` | 27 |
| Registered `agent-command-center-*` sibling worktrees | 5 |
| Physical `agent-command-center-*` sibling directories | 9 |
| **Physical siblings that are NOT registered worktrees** | **4** |

**Dirtiness was measured, not inferred.** `git -C <path> status --porcelain` across all 33
rows at `2026-08-13T05:49Z`: **4 rows reported any entry, 29 were clean, 0 errored.** All
four entries were **untracked (`??`) only — zero tracked modifications anywhere**: the main
worktree's untracked `.worktrees\` container, two untracked `AGENTS.md` copies, and one
untracked `Wave_transcript.txt`. **Registration does not imply unfinished work**, and this
record does not claim it does. The backup case for S3/S4 rests on the possibility of
uncommitted work at capture time, not on a measured backlog of it.

**‡ `.git` size — dated snapshot, `2026-08-13T05:50Z`.** Method: `du -sb .git` (apparent
bytes) = **6,535,195 B ≈ 6.2 MiB**; `du -sh .git` (disk usage, block-rounded) = **7.4 MiB**;
`find .git -type f | wc -l` = **647**. Revision 1 recorded *624 files / 6.1 MB* earlier the
same day; the difference is this branch's own four commits plus one new worktree
administrative entry, and the apparent-versus-disk-usage distinction. **This is a mutable
measurement, not an invariant** — re-measure before relying on it for sizing.

**Measured totals that make sizing easy.** The authoritative, irreplaceable core (S1–S10,
S14, S15, plus manifests from S12) is **small** — `.git` is ~6.2 MiB apparent, the entire
`%APPDATA%\command-center` non-cache set is under 5 KB, `.merge-gate` is ~10 KB, and run
manifests are ~1.8 KB each. Excluding media (S13, 84.7 MB) and dependencies (S20), the
protected set is plausibly **tens of megabytes**, not gigabytes. **That controlling
conclusion is unchanged by the revision-3 re-measurement.** Cost is therefore not a serious
constraint on this subsystem; discipline is.

### 2.1 `safeStorage` / DPAPI — the load-bearing portability finding

`app/main.js:219` states the design intent: `secure.json` "contains ciphertext only, never
plaintext," encrypted through Electron's `safeStorage`.

Official Electron documentation for `safeStorage`
(https://www.electronjs.org/docs/latest/api/safe-storage, accessed 2026-08-13) states that
on Windows, **"Encryption keys are generated via DPAPI"**, and that:

> "Typically, only a user with the same logon credential as the user who encrypted the data
> can typically decrypt the data."

**Consequence, stated plainly:** backing up `secure.json` does not back up the ability to
read it. Restored onto a replacement machine or a different Windows user, the ciphertext is
expected to be undecryptable. The application already anticipates this — `app/main.js:236`
catches the failure with the comment *"ciphertext unreadable (different OS user / key
rotation) — leave null."*

This yields two conclusions:

1. **Excluding `secure.json` costs almost nothing**, because including it would very likely
   produce an unusable artifact anyway while adding secret-bearing material to every copy.
2. **Credential recovery must be a documented human procedure, not a restored file.** The
   independent path already exists: the in-app key setup UI re-encrypts a freshly supplied
   `GEMINI_API_KEY` under the new machine's DPAPI key. What must be documented is *where
   Blue obtains that key again* (the provider console), not where the ciphertext is stored.

**UNVERIFIED, and deliberately not tested:** whether this specific `secure.json` is
decryptable after a Windows in-place reinstall that preserves the user profile, or after a
Microsoft-account-backed profile migration. Proving it would require a runtime experiment
on a second machine, which this work order does not authorize. Treat it as
**not portable** until proven otherwise; that is the safe direction of the assumption.

## 3. Candidate families evaluated, and why

Four materially different families can each satisfy part of the requirement, and none
satisfies all of it alone. They are evaluated as families first so that a tool is never
selected before its role is defined.

| Family | Role it can fill | Role it cannot fill |
| --- | --- | --- |
| **Versioned encrypted backup engines** (restic, Kopia, Duplicati) | Versioned, deduplicated, client-side-encrypted, integrity-checked copies to local and off-site destinations | Cannot decide *what* to include; cannot repair a torn Git object captured mid-write |
| **Windows first-party facilities** (File History, Windows Backup / `wbadmin`, VSS, OneDrive) | VSS gives consistent capture of locked files; OneDrive gives an already-paid off-site surface | Scope, retention, and portability limits documented in § 4.4–§ 4.7 make them insufficient as the primary control |
| **Git-specific snapshots** (`git bundle`, `--mirror` clone) | A self-contained, verifiable, format-stable archive preserving the **complete 66-name local head namespace** and the 4 remote-unreachable tips | Covers only Git; ignores S9–S14 entirely. Most commits are already reachable remotely, so the marginal gain is namespace + the 4 tips, not 60 histories |
| **Transport and replication** (rclone, robocopy, Syncthing) | Moving bytes to a destination; rclone adds encrypted remotes | **None of these is a backup.** No versioning of their own (rclone/robocopy), or deletion-propagating sync (Syncthing) |

Candidates were included on the evidence below and excluded only with a stated reason.
`rustic` (a Rust reimplementation of the restic format) was **seen but not evaluated as a
serious candidate**: it appeared only as a third-party discussion thread during the object-lock
search, and adopting a reimplementation of a format whose reference implementation is already
a candidate adds risk without adding capability. Named here so the exclusion is visible
rather than silent.

## 4. Candidate cards

Version, license, and activity data retrieved from the GitHub REST API on **2026-08-13**.
Behavioural claims are cited to official documentation.

### 4.1 Restic

| Field | Finding |
| --- | --- |
| Canonical source | https://github.com/restic/restic · https://restic.readthedocs.io |
| Architecture and role | Single static Go binary; content-addressed, deduplicated, encrypted repository. **Complete backup engine.** |
| Current version / date | **v0.19.1**, published **2026-07-05** |
| Repository activity | Last push **2026-08-01**; 35,483 stars; not archived |
| License | **BSD-2-Clause** — permissive, no commercial-use restriction |
| Windows support | Supported; single `.exe`, no service or runtime required |
| Interface | **CLI only** (no official GUI). Scheduling via Windows Task Scheduler |
| Live/locked files | **Built-in VSS.** `--use-fs-snapshot` "will use Windows' Volume Shadow Copy Service (VSS) … Files are read from the VSS snapshot instead of the regular filesystem. This allows to backup files that are exclusively locked by another process" (official docs, accessed 2026-08-13) |
| Snapshot/versioning | Every backup is an immutable snapshot; `forget`/`prune` apply retention policy |
| Dedup / compression | Content-defined chunking dedup; compression supported (repository format v2) |
| Client-side encryption | Yes, always on — a restic repository cannot be created unencrypted |
| Integrity checking | `restic check` verifies "structural consistency and integrity, e.g. snapshots, trees and pack files"; `restic check --read-data` verifies "that the actual pack files on disk in the repository are unmodified" (official docs) |
| Ransomware resistance | **Via `rest-server --append-only`**, which "allows creation of new backups but prevents deletion and modification of existing backups" (rest-server README). Requires running that server somewhere the host cannot administer |
| Object lock / immutability | **Not a documented feature.** Issue #4992 (`s3 retention hold support`) is **closed**; #2202 is **closed**; the standing proposal **#3195 `protect snapshot` remains OPEN**, created 2020-12-27, last updated 2024-07-06. Treat native S3 Object Lock as **absent** |
| Destinations | Local path, SFTP, REST (rest-server), S3 and S3-compatible (incl. B2), Azure, GCS, and rclone-backed remotes |
| Network/telemetry | No telemetry documented; network access only to the configured repository |
| Credential exposure | Repository password via env var, file, or command; **must not be placed in a Windows user env var** per `AGENTS.md` § 8 |
| Update / supply chain | Manual binary replacement or package manager; signed release artifacts published on GitHub |
| Restore portability | High — any machine with the binary, the repository, and the password |
| Restore without workspace/GitHub | **Yes** — fully independent of both |
| Non-destructive test restore | Yes — `restore --target <empty dir>`; also `mount` on some platforms |
| Failure visibility | Non-zero exit codes and stderr; **alerting is not built in and must be owned by Blue** |
| Cost | $0 software |
| Adoption effort | Low for capture; **moderate** for scheduling, retention, verification, and alerting |
| Blue Helm-owned remainder | Include/exclude policy, scheduling, `check` cadence, last-success visibility, restore-drill harness |
| Accept / reject | **Strong accept as the capture engine.** Best-in-class Windows consistency story via built-in VSS; weakest immutability story of the three |

### 4.2 Kopia

| Field | Finding |
| --- | --- |
| Canonical source | https://github.com/kopia/kopia · https://kopia.io/docs |
| Architecture and role | Go binary plus optional desktop GUI (KopiaUI); content-addressed encrypted repository. **Complete backup engine.** |
| Current version / date | **v0.23.1**, published **2026-06-16** |
| Repository activity | Last push **2026-08-12**; 13,845 stars; not archived |
| License | **Apache-2.0** — permissive, includes an express patent grant |
| Windows support | Supported; CLI plus official GUI |
| Interface | CLI **and** GUI; built-in scheduling via policies |
| Live/locked files | **Not built in.** Handled through before/after folder actions: official docs state Kopia "would fail the snapshot task because it can't read the file content" and document a PowerShell shadow-copy script installed via `--before-folder-action`. **This is user-owned scripting, not a supported flag** |
| Snapshot/versioning | Snapshots with rich per-path retention policies |
| Dedup / compression | Content-addressable dedup; compression via **pgzip, s2, zstd** |
| Client-side encryption | **AES-256** or **ChaCha20** |
| Integrity checking | Built-in verification commands; **Reed-Solomon error correction** available |
| Ransomware resistance | **Strongest of the three.** Documented object-lock support |
| Object lock / immutability | **Documented and supported.** `kopia repo create s3 --bucket <name> --retention-mode COMPLIANCE --retention-period <time>`, plus `kopia maintenance set --extend-object-locks true`. Backends: AWS S3, S3-compatible incl. **Backblaze B2**, Azure (version-level immutability), GCS (object retention). Constraint: "the full-maintenance interval must be at least 1 day shorter than the retention period" |
| Destinations | Local, S3/S3-compatible, B2, Azure, GCS, SFTP, WebDAV, rclone, Kopia repository server |
| Network/telemetry | No telemetry documented; network to configured repository |
| Credential exposure | Repository password; same env-var prohibition applies |
| Update / supply chain | GitHub releases; GUI installer available |
| Restore portability | High |
| Restore without workspace/GitHub | **Yes** |
| Non-destructive test restore | Yes — restore to an alternate target; `kopia mount` |
| Failure visibility | Exit codes, logs, GUI surface; **alerting still Blue-owned** |
| Cost | $0 software |
| Adoption effort | Low–moderate; **higher than restic on Windows specifically**, because VSS becomes a script Blue must write, install, and keep working |
| Blue Helm-owned remainder | Same as restic, **plus** the shadow-copy action scripts |
| Accept / reject | **Strong accept as the immutability-first engine.** Its object-lock support is the only documented path to F6 resistance without running a server; its Windows VSS story is materially weaker than restic's |

### 4.3 Duplicati

| Field | Finding |
| --- | --- |
| Canonical source | https://github.com/duplicati/duplicati |
| Architecture and role | .NET application with a web UI and a background service; encrypted, incremental, block-based backups |
| Current version / date | **v2.3.0.4_stable_2026-07-09**, published **2026-07-09** |
| Repository activity | Last push **2026-08-12**; 14,881 stars; not archived |
| License | **MIT with a carve-out.** The LICENSE file (read via the GitHub API, 2026-08-13) is `Copyright (c) 2026 Duplicati Inc.` and states: *"All content that resides under the `proprietary/` directory of this repository, if that directory exists, is licensed under the license defined in `proprietary/LICENSE`."* GitHub's own license detection reports **NOASSERTION** |
| Windows support | Strong — installer, tray tool, Windows service, web UI |
| Live/locked files | VSS supported via a snapshot-policy option |
| Snapshot/versioning | Yes, with retention rules |
| Client-side encryption | Yes (AES-256 / GPG) |
| Integrity checking | Verification of backend files, sampled by default |
| Object lock / immutability | Not a documented first-class feature |
| Restore portability | Good; requires the .NET-based application present |
| Failure visibility | **Best of the three out of the box** — web UI, e-mail/notification reporting |
| Cost | $0 software |
| Adoption effort | Lowest for a GUI-driven setup; highest runtime footprint (service + web UI + .NET) |
| Accept / reject | **Reject for this subsystem, on two grounds.** (1) **Licensing is mixed and vendor-controlled** — a `proprietary/` carve-out under a company copyright is a poor fit for a project whose governing rule is an OSS-first procurement gate, and it makes "commercial-use implications" a question rather than an answer. (2) It adds a persistent service and a local web UI to a machine whose security posture Blue Helm deliberately keeps narrow. Its genuine advantage — built-in failure notification — is a **pattern worth mining**, not a reason to adopt |

### 4.4 Windows File History

| Field | Finding |
| --- | --- |
| Canonical source | Microsoft Support, *Backup and restore with File History* (accessed 2026-08-13) |
| Role | Versioned copies of user **libraries** to an attached or network drive |
| Scope limitation | Backs up libraries — Documents, Pictures, Videos, Music, Desktop. Arbitrary folders are covered **only by adding them to a library** ("Include in library") |
| Fit against this inventory | **Poor.** The entire protected set lives at `D:\Workspace`, `D:\Gemini_Video_Review`, and `%APPDATA%\command-center` — **none of which is a user library.** Protecting them means restructuring Windows libraries around a backup tool's constraints |
| Encryption | Not client-side encrypted by design |
| Off-site | No |
| Accept / reject | **Reject as the primary control.** Possible marginal role as an extra local version store for a redirected folder; not counted in any architecture below |

### 4.5 Windows Backup / `wbadmin`

| Field | Finding |
| --- | --- |
| Canonical source | Microsoft Learn, *wbadmin* (accessed 2026-08-13) |
| Role | Volume/system-image and file backup from the command line |
| Platform applicability | Microsoft Learn lists the command as applying to Windows Server 2025/2022/2019/2016 **and Windows 11 and Windows 10** |
| **UNVERIFIED** | Whether the full `wbadmin` feature set is available and supported on this specific **Windows 11 Home** host. Determining it authoritatively would require running the command on the host, which this work order does not authorize. **Marked unverified rather than assumed either way** |
| Fit | Image-level recovery is a different and complementary goal from versioned file-level recovery of a ~6.2 MiB `.git` plus small state files |
| Encryption / off-site | No client-side encryption; no off-site path |
| Accept / reject | **Not selected.** Retain as an optional bare-metal convenience, decided separately from this subsystem |

### 4.6 Volume Shadow Copy Service (VSS)

| Field | Finding |
| --- | --- |
| Role | **A capture primitive, not a backup product.** Provides a point-in-time consistent view of a volume so open/locked files can be read |
| Why it matters here | Directly answers the consistency risks flagged in § 2 for S1–S4 and S12: capturing `.git` while Git is writing, or `settings.json` while Electron is writing |
| How it is reached | restic `--use-fs-snapshot` (built in); Kopia via before/after folder action scripts; Duplicati via snapshot policy |
| Accept / reject | **Required in whichever architecture is chosen.** It is a property the engine must provide, not a candidate competing with them |

### 4.7 OneDrive version history

| Field | Finding |
| --- | --- |
| Canonical source | Microsoft Support, *Restore a previous version of a file stored in OneDrive* (accessed 2026-08-13) |
| Role | Already-present, already-paid cloud surface with per-file version history |
| **Retention** | **"File version history is retained for 30 days."** No documented cap on version count within that window |
| Known local presence | A OneDrive folder exists on this machine (`C:\Users\levij\OneDrive\Desktop`, per `docs/SMART-APP-CONTROL-AND-DISTRIBUTION.md`) |
| Fit | **30 days is short for a project whose stranded decisions sat unmerged for roughly six weeks.** Also a sync surface, so § 1's F3/F6 warning applies, mitigated but not removed by version history |
| Encryption | Provider-managed, not client-side. Placing an encrypted restic/Kopia repository inside it changes that |
| Accept / reject | **Reject as the off-site copy of record.** Viable as a convenience destination for an *already encrypted* repository, understanding the 30-day version horizon applies to the container files, not to Blue's retention policy |

### 4.8 GitHub as a Git remote

| Field | Finding |
| --- | --- |
| Role | Off-site copy of **pushed Git history only** |
| Measured coverage today | **8 live remote heads**, whose history covers **61 of 66 local branch tips**. **6 local branches have a configured upstream; 0 tags** locally or remotely |
| What it does not hold | The **4 pre-existing remote-unreachable tips** (§ 0) plus this unpushed branch; the **66-name local head namespace (`git for-each-ref refs/heads`) and branch topology**; reflogs and stashes; worktree mapping; working trees; `.merge-gate\` (12 files); `.agent-review*.diff`; `%APPDATA%\command-center` state; the Video Scout library; `.command-center\outputs`; or any recovery material |
| Failure exposure | F5 — account compromise, repository deletion, or outage removes it entirely |
| Accept / reject | **Keep, and count it honestly.** It is a real off-site copy of a real subset. It is **not** the backup, and no architecture below may count it as one of the three copies |

### 4.9 `git bundle` / `--mirror` snapshot

| Field | Finding |
| --- | --- |
| Canonical source | https://git-scm.com/docs/git-bundle (accessed 2026-08-13) |
| Role | "Move objects and refs by archive" — offline transfer of Git objects "without an active 'server'" |
| Key properties | "Bundles are `.pack` files with a header indicating what references are contained within." A self-contained bundle "can be extracted into anywhere, even into an empty repository, or be cloned from" — `git clone backup.bundle <dir>` works |
| Why it matters here | A single verifiable file capturing **all 66 local heads by name** (`--all` covers `refs/heads`), restorable with nothing but Git. Immune to the torn-`.git`-directory risk because Git itself produces it |
| Limitation | Git only. Says nothing about S9–S14. Official docs are explicit that a bundle carries **"only refs and commits reachable from those refs"** and **"not other local state, such as the contents of the index, working tree, the stash, per-repository configuration, hooks, etc."** — so **reflogs and stashes are not preserved** by `git bundle --all` |
| **Storage and encryption (revision 3)** | **Never written as a loose plaintext file to removable or off-site media.** Generated into a controlled local staging directory, verified with `git bundle verify`, then captured **inside the encrypted restic snapshot** as protected input. Plaintext staging is removed by guarded cleanup only after the encrypted snapshot and its verification have succeeded |
| **Independence — narrowed in revision 3** | It is a **Git-native, format-stable recovery artifact** that permits independent *logical* verification (`git bundle verify`) and is consumable by Git alone **after extraction**. Because it is stored only inside restic, **retrieval still depends on restic** — it is therefore **not storage-engine-independent**, and this record no longer claims otherwise |
| Cost / effort | $0; one command plus a verify step |
| Accept / reject | **Accept as a component, on a corrected and narrower basis.** It preserves the complete local head namespace (which the 8 remote heads do not) and the 4 remote-unreachable tips. It must **not** be justified as protecting 60 unique histories absent from GitHub — 61 of 66 tips are reachable remotely — and it must **not** be described as a storage-engine-independent second restore path. Much of its Git-only value could also be obtained by simply pushing the 4 stranded branches, which is a one-command mitigation and not a backup subsystem |

### 4.10 rclone

| Field | Finding |
| --- | --- |
| Canonical source | https://github.com/rclone/rclone |
| Current version / date | **v1.75.0**, published **2026-07-31**; last push 2026-08-12; 59,114 stars |
| License | **MIT** |
| Role | **Transport.** Moves data to ~70 storage providers; `crypt` overlay provides client-side encryption |
| Microsoft OneDrive support | **Officially documented provider**, listed as *"Tier 1 (Core: Production-grade, first-class)"* (rclone OneDrive docs, accessed 2026-08-13) |
| Reached by restic | restic documents an **rclone backend**: *"The general backend specification format is `rclone:<remote>:<path>`, the `<remote>:<path>` component will be directly passed to rclone."* Prerequisite, per the same docs: *"First, you need to install and configure rclone."* |
| What it is not | Not a versioned backup system. No snapshots, no retention policy, no deduplicated history |
| Accept / reject | **Accept as an optional transport only**, and only if a chosen destination is not natively supported by the engine. Must never be described as the backup. **Revision 3 makes this load-bearing for Architecture A**: restic has no native OneDrive backend, so OneDrive is reached as `rclone:<remote>:<path>` — rclone carries bytes for a restic-managed repository and performs no versioning of its own |

### 4.11 `robocopy`

| Field | Finding |
| --- | --- |
| Canonical source | Microsoft Learn, *robocopy* |
| Role | **Transport.** Built-in, reliable, restartable file copy/mirror |
| What it is not | No versioning, no encryption, no dedup, no integrity model beyond copy verification. `/MIR` **propagates deletions** — actively dangerous against F3 |
| Accept / reject | **Reject as a backup.** Legitimate narrow use: staging a copy to an external drive as part of a larger design |

### 4.12 Syncthing

| Field | Finding |
| --- | --- |
| Canonical source | https://github.com/syncthing/syncthing |
| Current version / date | **v2.1.3**, published **2026-08-05**; last push 2026-08-12; 87,623 stars |
| License | **MPL-2.0** |
| Role | Continuous peer-to-peer **replication**. Optional file versioning per folder |
| Why it is not selected | Continuous sync propagates deletion and ransomware encryption to every peer by design. Its file-versioning feature mitigates but does not equal snapshot-based retention with integrity verification |
| Accept / reject | **Reject for this subsystem.** Would only make sense as a *fourth* convenience copy after the three real copies exist |

## 5. Complete recovery architectures

Each architecture is judged against the full requirement, not on tool quality. **No
architecture counts GitHub as one of its three copies**, and none counts two folders on the
same physical disk as two copies.

Common to all three: the protected set is S1–S10, S12 (manifests/reports), S14, S15;
excluded are S13, S17–S21; S11 and S16 are pending Blue's answers in § 8.

### Architecture A — "No new recurring cost"

| Element | Detail |
| --- | --- |
| Engine | **restic** with `--use-fs-snapshot` |
| **Copy 1** | Working state on `D:` (the live original — counted as the primary, not as protection) |
| **Copy 2** | **restic repository** on an **external USB drive**. Offline except during the backup window. **Contains no loose plaintext files** — the `git bundle --all` artifact is captured *inside* the encrypted snapshot (§ 4.9, revision 3) |
| **Copy 3** | A **separate restic repository**, off-site, reached as **`rclone:<onedrive-remote>:<path>`** through restic's documented rclone backend. Populated by repository-aware **`restic copy`** of completed snapshots — **not** by file-syncing Copy 2 |
| **Replication mechanism (revision 3)** | **`restic copy` only.** Destination initialised once with `restic init --from-repo <copy2> --copy-chunker-params` so deduplication is preserved. **The OneDrive desktop synchronization client is never pointed at Copy 2's repository directory**, and no byte-copy or file-sync of an active repository is permitted during `backup`, `copy`, `prune`, `check`, or maintenance |
| **Consistency / quiescing (revision 3)** | Backup, copy, prune, and integrity operations are **serialized — never concurrent**. `restic copy` transfers **only completed snapshots**. If either repository is locked, incomplete, or a step exits non-zero, the run is a **visibly failed run**, not a partial success |
| Storage forms | Internal SSD (source), external USB (removable), cloud file storage via rclone |
| Off-site | OneDrive, via rclone |
| Independent of GitHub | Yes |
| Retention | restic `forget --keep-daily 7 --keep-weekly 8 --keep-monthly 12` **(?) tunable**, applied per repository |
| Encryption ownership | Blue holds the restic repository password. **Both** copies are restic-encrypted client-side; OneDrive never sees plaintext |
| **Credential surface** | The rclone OneDrive remote requires an OAuth token, and the repository password is separate. **Neither is configured by this branch.** Both must be specified and protected under § 7 and `AGENTS.md` § 8 before any implementation — **no credential is created, stored, or read here** |
| RPO | Daily, or on-demand before risky operations **(?)** |
| RTO | Hours — install Git + restic (+ rclone for Copy 3), restore, `git worktree repair` |
| Failure alert | Scheduled-task exit code surfaced by a Blue-owned check; **must be built, does not exist** |
| Cost | **$0 recurring** (uses existing OneDrive allocation and an owned drive). `restic copy` re-encrypts under the destination key, so it **reads and uploads whole snapshots** — a bandwidth cost, not a storage bill |
| Operational complexity | **Slightly higher than revision 2 implied** — two repositories, an rclone remote, and a serialized job order rather than a folder copy |
| Single points of failure | Blue's OneDrive account; the external drive if kept in the same building |
| GitHub **and** the computer both gone | **Recoverable** from Copy 3, provided the password is available (§ 7) |
| Weakness | **Weakest against F6.** A compromised host holds credentials for both copies. OneDrive's 30-day version horizon applies to the container files and is **not** a substitute for restic's own retention |

### Architecture B — "Immutability first"

| Element | Detail |
| --- | --- |
| Engine | **Kopia** with object lock |
| **Copy 1** | Working state on `D:` |
| **Copy 2** | Kopia repository on an **external USB drive** |
| **Copy 3** | Kopia repository in **Backblaze B2 with Object Lock in COMPLIANCE mode**, `--retention-period` set to exceed the full-maintenance interval by at least one day |
| Storage forms | Internal SSD, external USB, S3-compatible object storage |
| Off-site | Backblaze B2 |
| Independent of GitHub | Yes |
| Retention | Kopia policy-based; object lock enforces a floor the host cannot lower |
| Encryption ownership | Blue holds the Kopia repository password (AES-256 or ChaCha20) |
| RPO | Daily or better |
| RTO | Hours |
| Failure alert | Kopia logs plus a Blue-owned staleness check; **must be built** |
| Cost | **~$6.95/TB/month, first 10 GB free.** At a protected set in the tens of MB, the realistic bill is **$0** under the free tier, with headroom before any charge. Free egress up to 3× stored bytes; $0.01/GB beyond. Object Lock carries **"no extra cost"** |
| Single points of failure | The B2 account (mitigated: compliance-mode locks cannot be removed by any user, only extended) |
| GitHub **and** the computer both gone | **Recoverable** from B2 |
| Weakness | **Windows consistency is the soft spot** — VSS requires Blue-authored before/after action scripts that must keep working. Compliance mode is deliberately unforgiving: data cannot be deleted early even when Blue wants it gone |

### Architecture C — "Git-first, defence in depth"

| Element | Detail |
| --- | --- |
| Engine | **restic** for the general file set **plus** a scheduled `git bundle --all` per repository, staged and verified locally then captured **inside** the restic snapshot as a format-stable Git artifact |
| **Copy 1** | Working state on `D:` |
| **Copy 2** | External USB: **restic repository only.** Bundles live inside its encrypted snapshots — **no loose plaintext `*.bundle` files on removable media** (revision 3) |
| **Copy 3** | **Backblaze B2** holding a restic repository, reached natively (restic's docs recommend B2's **S3-compatible API**); bundles included inside its snapshots |
| **Replication mechanism** | `restic backup` direct to each destination, or `restic copy` between repositories. **No file-level sync of an active repository**, same rule as Architecture A |
| **Consistency / quiescing** | Backup, copy, prune, and check **serialized, never concurrent**; only completed snapshots are copied; a locked or incomplete repository is a **visibly failed run** |
| Fourth, deliberately non-counted | GitHub — 8 live heads whose history covers 61 of 66 local tips. Recorded honestly as partial: real commit coverage, no ref namespace, no non-Git state |
| Storage forms | Internal SSD, external USB, S3-compatible object storage |
| Off-site | B2 |
| Independent of GitHub | **Yes.** *(Revision 3: the earlier "doubly so — a bundle restores with Git alone, no restic needed" claim is **withdrawn**. The bundle is stored inside restic, so retrieval requires restic first.)* |
| Retention | restic policy for files; bundle cadence on a dated rotation **(?)** |
| Encryption ownership | Blue holds the restic password; bundles inherit that encryption because they are captured inside the repository |
| RPO | Daily for files; per-session for bundles if triggered before risky Git operations |
| RTO | Hours. **Not "fastest by bundle alone"** — history recovery is `restic restore` of the staged bundle, then `git clone <dated>.bundle`. The bundle shortens and de-risks the *Git* half; it does not remove the restic dependency |
| Failure alert | Same Blue-owned requirement |
| Cost | **$0–negligible** (B2 free tier) |
| Single points of failure | **Restic remains the single retrieval dependency for every copy** — the same as A and B. C's genuine edge is the destination (B2, object-lock-capable) plus a Git-native artifact that can be *logically verified* independently (`git bundle verify`) and consumed by Git alone **after extraction** |
| GitHub **and** the computer both gone | **Recoverable** from B2 |
| Weakness | Two artifacts to verify and two things that can silently stop. No object-lock immutability unless B2 Object Lock is added, which restic does not natively drive (§ 4.1). **After the § 0 and revision-3 corrections the bundle component is narrower still** — it preserves the local head namespace and the 4 tips, it is not 60 absent histories, and it is **not a storage-engine-independent restore path** |

### 5.1 Architecture comparison

| Criterion | A (no cost) | B (immutable) | C (Git-first) |
| --- | --- | --- | --- |
| ≥3 recoverable copies | Yes | Yes | Yes |
| ≥2 storage forms | Yes | Yes | Yes |
| ≥1 off-site | Yes | Yes | Yes |
| Independent of live GitHub | Yes | Yes | Yes |
| **Storage-engine-independent restore path** | **No** | **No** | **No** — claim withdrawn in revision 3 (§ 5.3) |
| Version retention | Yes | Yes | Yes |
| Encrypted off-site | Yes (client-side) | Yes (client-side) | Yes (client-side) |
| **Loose plaintext on removable media** | **None** | **None** | **None** — corrected in revision 3 |
| **Off-site replication mechanism** | `restic copy` over **rclone** | `kopia` direct to B2 | `restic` direct to B2 (S3-compatible) |
| **File-sync of a live repository** | **Prohibited** | **Prohibited** | **Prohibited** |
| Integrity verification | `restic check --read-data` | Kopia verify + Reed-Solomon | `restic check --read-data`, plus `git bundle verify` on the staged artifact |
| Visible failure | **Must be built** | **Must be built** | **Must be built** |
| Replacement-machine recovery | Yes | Yes | Yes |
| Windows locked-file consistency | **Built-in VSS** | **Blue-authored scripts** | **Built-in VSS** |
| F6 ransomware resistance | Weak | **Strong (compliance object lock)** | Moderate |
| Off-site version horizon | OneDrive 30 days on container files | B2 + object lock | B2, no 30-day horizon |
| Recurring cost | $0 | ~$0 (free tier) | ~$0 (free tier) |
| Operational complexity | **Middle** (two repos + rclone remote) | Highest | Middle |

### 5.2 Requirements common to all three, after revision 3

These are no longer architecture-specific. They apply wherever a restic or Kopia repository
is written:

1. **No file-level synchronization or byte-copy of an active repository** during `backup`,
   `copy`, `prune`, `check`, or maintenance. Cloud desktop sync clients are never pointed at
   a live repository directory.
2. **Off-site population is repository-aware** — `restic copy` (or a direct engine backup to
   the off-site repository), never a folder mirror.
3. **Only completed snapshots are transferred.**
4. **Backup, copy, prune, and integrity operations are serialized.**
5. **A locked, incomplete, or non-zero-exit step is a visibly failed run**, never a partial
   success — consistent with Blue Helm's standing fail-visibly rule.
6. **Git bundles are staged locally, verified with `git bundle verify`, captured inside the
   encrypted snapshot, and the plaintext staging copy removed by guarded cleanup only after
   the encrypted snapshot and verification have succeeded.**

### 5.3 The withdrawn redundancy claim

Revision 2 credited Architecture C with **"two independent restore mechanisms (restic and
plain Git)."** That is **withdrawn**, and the reasoning is recorded rather than quietly
deleted.

The bundle is now stored **inside** the restic repository — which is what removes the
plaintext-on-removable-media exposure (Finding 6). The direct consequence is that reaching
the bundle requires restic to run first. What the bundle still provides is real but
narrower:

* a **Git-native, format-stable** artifact that does not depend on restic's repository
  format remaining readable by a future restic version;
* **independent logical verification** via `git bundle verify`, which proves Git-level
  completeness rather than merely that bytes were restored;
* a path that, **once extracted**, is consumable by Git alone with no engine knowledge.

What it is **not** is a second storage path. **Restic is the single retrieval dependency in
all three architectures.** Any design that genuinely wanted engine independence would have to
place a plaintext or separately-encrypted bundle somewhere restic does not own — which is
exactly the exposure this revision removed. **That trade is Blue's to make, and this record
takes the safe side of it by default** (§ 8 Q13).

## 6. Restore-drill design — specified, not performed

**Not performed.** No drill, prototype, or restore command was run. This section is the
acceptance specification for a later, separately authorized work order.

The drill must prove recovery **without** the active workspace, the active computer's
repository, GitHub, undocumented knowledge held only in a Claude session, or existing
decrypted provider credentials.

### 6.1 Frozen manifest
Before capture, record what recovery is expected to produce. **Ref expectations are stated
per namespace, because a bare `git for-each-ref` returns every namespace at once** — 99 rows
at `2026-08-13T05:49Z`, not 66:

| Manifest item | Command | Expected at `2026-08-13T05:49Z` | Preserved by `git bundle --all`? |
| --- | --- | ---: | --- |
| **Local heads** — the load-bearing set | `git for-each-ref refs/heads` | **66** | **Yes** — this is the namespace the drill must prove |
| Remote-tracking refs | `git for-each-ref refs/remotes` | 30 | Reconstructible from the remote; not required |
| Other refs (`refs/codex/turn-diffs/checkpoints/*`) | `git for-each-ref` minus the above | 3 | Tool-generated; record but do not gate on |
| Tags | `git for-each-ref refs/tags` | **0** | Yes (none exist) |
| Stash entries | `git stash list` | **0** | **No** — bundles exclude the stash |
| Reflogs | `git reflog` per ref | not enumerated | **No** — bundles exclude reflogs |

Official `git bundle` documentation is explicit that a bundle carries *"only refs and commits
reachable from those refs"* and *"not other local state, such as the contents of the index,
working tree, the stash, per-repository configuration, hooks, etc."* **Reflogs and stashes
therefore survive only via the file-level restic capture of `.git`, never via the bundle.**

Also record: `git worktree list --porcelain` (33 rows, note †), the file list of
`%APPDATA%\command-center` non-cache state, the `.merge-gate\` file list (12 files), the
Video Scout run-ID list, and `.command-center\outputs` directory names. Store the manifest
**with the backup and on `main`**.

### 6.2 Recorded digests
SHA-256 for: each `.merge-gate\*.psd1`; `settings.json`; `dockview-layout.json`;
`dockview-prototype-layout.json`; a representative sample of run `manifest.json` files; and
`git rev-parse` output for every ref. Git object integrity is additionally self-proving via
content addressing.

### 6.3 Clean isolated destination
A directory on a **different physical device** from `D:`, or a spare machine. Never a path
under `D:\Workspace`. The drill must not be able to write into the live workspace even on
operator error — enforce by choosing a destination on a separate volume and declaring it
in the work order.

### 6.4 Repository-history restoration
Two **artifacts**, compared against each other — but **note the shared dependency** (§ 5.3):

1. `restic restore` the captured `.git` tree into the isolated destination.
2. `restic restore` the captured `<dated>.bundle`, run **`git bundle verify`** on it, then
   `git clone <dated>.bundle` into a second directory.

**Both paths begin with restic.** The drill must not be written up as proving two
independent restore mechanisms; it proves one storage path carrying two independently
verifiable representations of the history. The comparison is still worth running — it
catches a corrupted `.git` capture that a bundle would expose, and vice versa.

### 6.5 Declared non-Git state restoration
Restore S9, S10, S6, S5, S12 (manifests/reports), S14 to the isolated destination.

### 6.6 Verification
**Acceptance criterion, stated by namespace.** Compare restored
**`git for-each-ref refs/heads`** against the frozen manifest — **all 66 local heads present
by name, byte-identical SHAs**. That is the gating comparison. Additionally record
`refs/remotes` (30) and other refs (3) as informational, and confirm `refs/tags` is 0.
Restored-from-bundle history is checked against the same 66-head expectation after
`git bundle verify` passes. Recompute the § 6.2 digests and compare. Confirm representative
untracked and gitignored artifacts exist.

**Known not to be preserved by the bundle path:** stash entries and reflogs. If the file-level
`.git` capture is the only source for those, say so in the drill record rather than implying
the bundle covered them.

### 6.7 Proof that excluded secrets stayed excluded
A **negative control that must pass**: assert `secure.json` is **absent** from the restore;
assert no provider configuration or auth-state file from S18 is present; grep the restored
tree for the key-shaped patterns the repo already excludes, expecting zero hits. Record the
result. A drill that skips this proves only half the design.

### 6.8 Credential re-establishment procedure
Document, and walk through on paper: obtain a fresh `GEMINI_API_KEY` from the provider
console, enter it through the in-app key setup UI, which re-encrypts under the new machine's
DPAPI key. **No credential value is recorded anywhere in this process.**

### 6.9 Application validation appropriate to the restored state
`npm install` in the restored tree, then the documentation-appropriate checks. A full
Electron launch on the drill machine is **optional and separately decided** — the drill's
purpose is proving data recovery, not re-validating the app.

### 6.10 Cleanup that cannot touch the live workspace
Delete only the declared isolated destination, by its absolute path, verified before
deletion. **Per the standing rule against blanket cleanup: delete only what the drill
itself created, and verify that before deleting.**

### 6.11 Evidence retained on `main`
A dated drill record under `docs/`: manifest, digests, commands, outcomes, negative-control
result, and any repair needed (`git worktree repair` is expected).

### 6.12 Failure and rollback handling
The drill is read-only with respect to production. If any step fails, stop and record —
there is nothing to roll back, because nothing in the live workspace was modified. A failed
drill is a **blocking finding**, not a retry-until-green exercise.

### 6.13 Quiescing during capture, and job serialization
Highest-risk writers: **Git operations** (mid-write `.git`), **Electron** (`settings.json`,
`dockview-layout.json`, Chromium state), and **active Video Scout runs** (media and
manifests). VSS resolves the locked-file problem but does not make an application-level
write atomic. Preferred design: capture via VSS **and** schedule when Electron is closed
**(?)**. `git bundle` sidesteps the issue for the most valuable state, because Git produces
the artifact itself.

**Repository-side quiescing (revision 3).** The rules above protect the *source*. The
*repository* needs its own discipline, and revision 2 omitted it:

* **Serialize** `backup`, `copy`, `prune`, and `check`. Never run two against the same
  repository concurrently, and never start the off-site `restic copy` while the local
  `backup` is still writing.
* **Copy only completed snapshots.** `restic copy` operates on finished snapshots; it must
  never be pointed at a run in progress.
* **No cloud sync client on a repository directory.** The OneDrive desktop client must not
  be configured to synchronize Copy 2's repository path. Off-site population is
  `restic copy` over the rclone backend, not a folder mirror (§ 5.2).
* **A locked, incomplete, or non-zero-exit step is a failed run**, surfaced by the § 8 Q11
  mechanism — not silently retried into apparent success.

**Bundle staging and guarded cleanup.** Generate each `git bundle --all` into a controlled
local staging directory; run `git bundle verify`; capture the verified bundle inside the
restic snapshot; **and only after the encrypted snapshot and its verification have both
succeeded**, delete the staging copy by absolute path, verifying the target before deletion.
Per the standing rule against blanket cleanup, delete only what the job itself created. A
failed verification leaves the staging copy in place and fails the run visibly.

## 7. Key-loss and recovery ownership

F10 deserves first-class treatment: **an encrypted backup whose key is lost is
indistinguishable from no backup**, while looking perfectly healthy.

| Option | Strength | Weakness | Fit note |
| --- | --- | --- | --- |
| User-held recovery key (memorised or in a file) | No third party | Memory fails; a file on `D:` dies with `D:` | Unacceptable alone |
| Printed / offline material in a safe | Survives machine loss, ransomware, and account compromise; no vendor | Fire/flood unless off-site; manual | **Strong candidate**, pairs with any engine |
| Password-manager escrow | Convenient, synced, already in Blue's workflow | Introduces the manager's own account as a dependency; recursive if its recovery data is only in the backup | Viable **if** the manager's own recovery path is independently documented |
| Trusted-family recovery | Answers "Blue is unavailable" | Human confidentiality risk; needs an explicit trust decision | Depends on § 8 Q10 |
| Provider-managed keys | No key to lose | **Defeats client-side encryption** — the provider can read the data | Rejected on principle for a project with this posture |
| Hardware-backed key (e.g. security key) | Strong possession factor | Device loss needs a documented second factor; adds cost | Defence in depth, not a starting point |

**Not selected. This is Blue's decision (§ 8 Q9).** The record's only firm position:
**at least two independent recovery paths must exist**, because a single path re-creates
F10 in a new place.

**No secret appears in this record**, and none may be placed in repository content, chat,
work orders, handoffs, command-line arguments, Windows user environment variables
(`AGENTS.md` § 8), standard logs, or a procurement record.

## 8. Questions requiring Blue's judgment

1. **Scope.** Only `agent-command-center`, or all of `D:\Workspace`? The distinction now
   matters precisely (note †): the repository's **32 registered linked worktrees** are
   already covered by S7 wherever they sit, including the **5 registered
   `agent-command-center-*` siblings**. Separately outside that set are `Automation-Chores`,
   `.reference`, and the **4 `agent-command-center-*` physical directories that are not
   registered worktrees** (S16) — whose contents are unexamined by this record. Include
   those, or scope to the repository only?
2. **`.claude.json` (S11).** Include, exclude, or protect separately? It is Blue Helm's
   documented coordination surface, and whether it carries session material is
   **UNVERIFIED**. Excluding it is the safe default; the cost is losing coordination state.
3. **Recovery point.** Per commit, hourly, daily, or on-demand before risky operations?
   The corrected exposure — non-Git state and gitignored evidence, which no push protects —
   argues for at least daily plus a manual trigger.
4. **Replacement-machine recovery time.** Hours, or same-day acceptable?
5. **Maximum recurring cost.** Architectures B and C are plausibly $0 under B2's free tier
   at the measured data volume; is a small paid ceiling acceptable if the set grows?
6. **External drive.** Is one already owned, and can it be stored **outside the building**
   or at least in a different room?
7. **Preferred off-site destination.** Backblaze B2 (new account, object lock available at
   no extra cost) or existing OneDrive (no new account, 30-day version horizon)?
8. **Immutability.** Is compliance-mode object lock required, accepting that locked data
   cannot be deleted early even deliberately?
9. **Encryption recovery material.** Who holds it, in which two independent forms?
10. **Family recovery.** Should a trusted family member be able to restore without Blue?
11. **Visible failure.** What counts — a Windows toast, an in-app Logs entry, an e-mail, a
    Blue Helm pane indicator? Blue Helm's own rules say failure must refuse visibly; a
    silent backup violates that as surely as a silent app control.
12. **Which architecture advances**, and to what — bounded prototype, or straight to a
    specified implementation?
13. **Engine independence versus plaintext exposure (new in revision 3).** Storing the
    `git bundle` inside the restic repository removed the plaintext-on-removable-media
    exposure, but it also means **restic is the single retrieval dependency in every
    architecture** (§ 5.3). Accept that, or require a genuinely engine-independent copy —
    which would need a plaintext or separately-encrypted bundle somewhere restic does not
    own, reintroducing the exposure and needing its own protection decision? **This record
    takes the safe default (bundle inside restic) and does not decide the trade.**

## 9. Recommendation — re-derived after the § 0 and revision-3 corrections, and not a verdict

> **Reading note added in revision 4.** This section remains what it always was: the
> Source-Scout **recommendation** and the reasoning behind it, written before any verdict
> existed. It is preserved unchanged. **Blue's actual issued verdict is § 12**, and where the
> two differ in scope, § 12 controls. Nothing in § 9 should be read as authorization.

**This section was re-derived twice, not patched.** Revision 1 rested substantially on the
claim that sixty branch histories existed nowhere but this disk. That claim was wrong: 61 of
66 local tips are reachable from live remote heads. **Revision 3 then re-checked every
conclusion below against the corrected worktree inventory, the redesigned Architecture A,
and the withdrawn bundle-independence claim** before restating them. The corrected risk
ranking is stated first, and the recommendation is then tested against it.

**Corrected risk ranking, strongest exposure first:**

1. **No independent restore proof of anything.** Unchanged by either correction, and the
   clear top risk. Nothing in `main` demonstrates that any state can be recovered.
2. **Non-Git application state** — `%APPDATA%\command-center` (S9, S10), the Video Scout
   library (S12), `.command-center\outputs` (S14). No push protects any of it.
3. **Gitignored evidence and control-plane material** — `.merge-gate\` (11 plan files plus
   1 run helper) and `.agent-review*.diff`. Deliberately never committable, therefore
   structurally invisible to every Git remote.
4. **Potential uncommitted and untracked work spread across the 32 registered linked
   worktrees** (33 rows including main; note †). **Measured, not assumed:** at
   `2026-08-13T05:49Z` only **4 of 33** rows reported any entry, all **untracked-only**,
   with **zero tracked modifications**. The risk is that this is a *moving target* captured
   at an arbitrary moment — not that a large backlog sits there today. **Revision 3 lowers
   the weight of this item accordingly**, though it remains real because the measurement is
   valid only for the instant it was taken.
5. **Four pre-existing remote-unreachable branch tips**, plus this intentionally unpushed
   branch. Small in count, disproportionate in content: they are the same four orphan
   branches the reconciliation audit classified, one of which holds a verbatim Blue
   procurement verdict.
6. **Local ref namespace, branch topology, worktree mapping, reflogs, stashes** — **66 local
   heads** (`git for-each-ref refs/heads`) against 8 remote heads, plus 3 other refs and the
   33-row worktree mapping. The commits mostly survive; the structure does not. **Reflogs
   and stashes are preserved only by the file-level capture, never by a bundle** (§ 6.1).

**What the corrections changed.** Items 2–4 were always in the record but were ranked behind
a headline number that turned out to be wrong. Removing that number **moves weight away from
the Git-specific argument and toward general file backup** — precisely what an adopted engine
does and what a `git bundle` does not. Revision 3 pushes the same direction again: item 4 is
now measured and smaller than its wording implied, and the bundle's independence claim is
withdrawn (§ 5.3). **Both corrections strengthen the general-file-backup case and weaken the
Git-specific one.**

**Adoptable intact.** The capture engine, its encryption, its deduplication, its snapshot
and retention model, its integrity verification, and its restore machinery. Restic and
Kopia are both mature, permissively licensed, actively maintained, and genuinely fit for
Windows. Nothing here justifies writing a backup engine.

**Blue Helm-owned regardless of engine.** The include/exclude policy derived from § 2;
scheduling and quiescing, **including the § 5.2 serialization rules and the prohibition on
file-syncing a live repository**; the `git bundle` staging, verification, and guarded
cleanup; `check`/verify cadence; **failure visibility and last-success staleness alerting**;
the frozen manifest and digest recording; the restore-drill harness; and the
credential-exclusion negative control. This is configuration, orchestration, and evidence —
not a product. **Revision 3 grew this list**, which is worth noting honestly: the owned
remainder is somewhat larger than revision 2 implied, though still orchestration rather than
engineering.

**Rejected.** Duplicati (mixed vendor-controlled licensing; unnecessary service and web-UI
surface). File History (scope mismatch with the actual state locations). `robocopy` and
Syncthing as backups (no versioning / deletion propagation). GitHub as the backup — not
because its commit coverage is thin (it covers 61 of 66 tips) but because it preserves no
ref namespace, no worktree mapping, no working tree, no gitignored evidence, and no
non-Git state, and because F5 can remove it entirely. **rclone remains accepted only as
transport, never as the backup** — but revision 3 makes it *load-bearing* transport in
Architecture A, since restic has no native OneDrive backend and reaches it as
`rclone:<remote>:<path>`.

**Unverified, and honestly flagged.** `wbadmin`'s full feature availability on Windows 11
Home; `secure.json` decryptability after profile migration; whether `.claude.json` carries
session material; whether any candidate's failure-alerting can be made to satisfy Blue
without custom work (current evidence says no for restic and Kopia).

**The load-bearing uncertainty**, and the bounded experiment that would resolve it:
> Can a scheduled, VSS-consistent capture of this specific machine's state be restored to a
> clean isolated destination such that **all 66 local heads** (`git for-each-ref refs/heads`)
> and the declared non-Git state come back intact, with `secure.json` provably absent — and
> does the operator find out when the job stops running?

That is one bounded prototype: one engine, one external drive, one off-site destination,
one drill, one deliberately broken job to prove the alert fires. **Revision 3 adds one
element to it**: the off-site leg must be exercised as a repository-aware `restic copy`, not
a folder sync, so that the § 5.2 rule is tested rather than merely written down.

**Recommended direction, for Blue's decision — `ADOPT`. Re-checked against the corrected
matrices in revision 3 and unchanged.**

**The check was performed before this was restated, not after.** Each revision-3 correction
was tested against the ADOPT argument in turn: the worktree recount (Findings 3–4) changes an
inventory quantity, not who supplies the engine; the ref-scoping fix (Finding 5) changes a
drill acceptance criterion; the `.git` re-measure (Finding 7) leaves the "tens of megabytes"
sizing conclusion standing. The two corrections with real conceptual weight — Architecture
A's redesign (Finding 2) and the withdrawn bundle independence (Finding 6) — both **increase**
the share of the solution supplied by the adopted engine, because both replace Blue-authored
or Git-specific mechanisms with engine-native ones (`restic copy`, `restic` as sole retrieval
path). Neither creates a capability gap that would require building an engine.

The ADOPT argument never rested on the branch-count claim, and does not rest on the bundle. It
rests on the fact that the capture, encryption, dedup, snapshot, retention, verification, and
restore machinery already exist in mature permissively licensed tools, and that what remains
is configuration and evidence. Correcting the branch measurement **moves exposure toward
general file state** (ranking items 1–4), exactly the surface an adopted engine covers.
**ADOPT survives both corrections on strengthened grounds.**

**One honest qualification.** Revision 3 enlarged the Blue Helm-owned remainder — serialized
job ordering, the rclone remote, bundle staging with verification and guarded cleanup. That
is more orchestration than revision 2 implied. It is still orchestration: no new engine, no
new repository format, no new cryptography. **If that remainder kept growing, the correct
response would be to revisit the verdict direction rather than to defend `ADOPT`** — it has
not grown to that point here, and this record flags the threshold rather than waiting for
someone else to notice it.

The subsystem is an adopted engine plus Blue Helm-owned configuration, verification, and
restore orchestration. Under `AGENTS.md` item 4, that is **ADOPT**, and item 5 makes the
distinction consequential: PATTERN-MINE would not authorize using restic or Kopia at all,
only studying them. Silently collapsing this into PATTERN-MINE would be exactly the
narrowing the gate forbids. The owned configuration and orchestration around an adopted
tool is normal integration work, not a separate BUILD FRESH subsystem — no new engine, no
new format, no new crypto is proposed, and none should be.

**On engine and architecture, both corrections changed the reasoning, and the changes are
recorded rather than hidden.**

**Architecture A is now operationally complete** (Finding 2). Revision 2 described its
off-site copy as "the same restic repository replicated to a OneDrive folder" without naming
a mechanism — which, read literally, invited a file-level sync of a live repository. That is
replaced by a *separate* repository reached over restic's rclone backend and populated by
`restic copy`, with serialization and quiescing stated (§ 5.2). **A is no longer a design
with a hole in it; it is a slightly more complex design than advertised.**

**Architecture C is still recommended — but its margin is now thin, and two of its three
former advantages are gone.**

| Former advantage over A | Status after revision 3 |
| --- | --- |
| The `git bundle` "answers the strongest measured risk" | **Withdrawn in revision 2.** Strongest risks are items 1–4; a bundle addresses none. |
| **"A second independent restore mechanism"** | **Withdrawn in revision 3 (§ 5.3).** The bundle now lives inside restic, so retrieval requires restic. Not storage-engine-independent. |
| Preservation of the local head namespace and the 4 unreachable tips | **No longer a differentiator.** The corrected bundle handling applies to **A as well as C**, so both preserve it. |
| **Backblaze B2 rather than OneDrive as the off-site copy** | **Intact — and now essentially the whole argument.** No 30-day version horizon on container files, and an object-lock-capable destination if Blue later wants it. |

**Stated plainly: after revision 3, Architecture C is close to "Architecture A with B2
instead of OneDrive."** Both use restic, both capture a verified bundle inside the encrypted
snapshot, both prohibit file-syncing a live repository, and both depend on restic for
retrieval. The residual differences are the off-site destination and C's per-session bundle
cadence. **C therefore stands or falls on § 8 Q7** — and **if Blue answers "OneDrive" to Q7,
A and C converge and the distinction should be dropped rather than maintained for appearance.**
That is a materially weaker case for C than revision 2 presented, and it is recorded as such.

**The gap between C and B is unchanged**, and § 8 Q8 still decides it: built-in VSS (restic)
against documented compliance-mode object lock (Kopia). **The restic-versus-Kopia conditional
survives revision 3 unchanged** — nothing in these corrections touches VSS support or object
lock, and both corrections apply symmetrically to either engine. If anything the correction
continues to favour restic's VSS, because ranking items 2–4 are live-written files where
capture consistency is the binding problem. **Should Blue answer Q8 "immutability required,"
B remains the right answer regardless of anything in revision 3.**

**A near-zero-cost mitigation exists and is deliberately not conflated with the
subsystem.** Pushing the four stranded branches would remove ranking item 5 entirely, in
one command, today. It is **not authorized by this record** (it is a push), it is **not a
backup**, and it addresses none of ranking items 1–4. It is named here so that Blue can
take it as a separate cheap decision without anyone treating it as progress on this
subsystem.

**PROTOTYPE is the reasonable alternative direction** if Blue wants the load-bearing
uncertainty resolved before committing — bounded to the single experiment named above.

## 10. Historical and roadmap accuracy

* **GitHub protects only committed and pushed Git history.** Measured 2026-08-13 by live
  enumeration: **8 remote heads**, whose history covers **61 of 66 local branch tips**.
  **6 local branches have a configured upstream; 0 tags** locally or remotely.
* **GitHub is not the sole backup.** It does not protect the **4 pre-existing
  remote-unreachable branch tips**, the **66 local head names** (`git for-each-ref
  refs/heads`) **or branch topology**, reflogs, stashes, the 33-row worktree mapping,
  uncommitted work, gitignored artifacts (`.agent-review*.diff`, `.merge-gate\`),
  `%APPDATA%\command-center` application state, the Video Scout library,
  `.command-center\outputs`, or any recovery material.
* **A configured upstream is not the measure of remote coverage.** Reachability is.
  **6** local branches have a configured upstream; **61 of 66** local tips are reachable
  from live remote history. Those are different measurements of different things, and
  **neither may be substituted for the other**. Revision 1 of this record conflated them;
  § 0 records the correction, and revision 3 removed the last derived occurrence from the
  handoff.
* **Inventory counts are dated snapshots, not invariants.** Worktree counts, `.git` size,
  and dirty/clean state were measured at `2026-08-13T05:49–05:50Z` by the methods recorded
  in notes † and ‡. They change with ordinary work. **Any later record restating them must
  re-measure rather than copy these numbers forward.**
* **`codex/release-1.0-auth-backup-blockers` is stale and must not be merged.** Its
  commitment was reconciled into current roadmap language on `main` by
  `docs/DECISION-RECONCILIATION-release-1.0.md` § 3, which classified it **DEFERRED** and
  retained it as provenance. It was consulted read-only for historical comparison; **current
  `main` is controlling**.
* **Backup and recovery is the first remaining Release 1.0 workstream** —
  `BLUE-HELM-MASTER-STATUS.md` § *Remaining work — Blue Helm 1.0, in order*, entry 1, and a
  blocking prerequisite of the release gate at entry 10.
* **The verdict is issued; production implementation remains unauthorized.** Blue issued
  `ADOPT` on 2026-08-13 (§ 12.1). What it authorizes is a **bounded prototype under its own
  reviewed work order** — not production backup configuration, production-data upload, a
  recurring schedule, or any claim of completed protection (§ 12.2). **This record is not yet
  on `main`.** It sits on `feature/backup-recovery-verdict-finalization`, unmerged and
  unpushed, pending independent review and Blue's merge authorization. Until that merge, the
  tracked-record requirement of `AGENTS.md` gate item 6 is **satisfied in form but not yet on
  the canonical branch** — which is precisely the failure mode
  `docs/DECISION-RECONCILIATION-release-1.0.md` § 4 records for the stranded July 30 verdict,
  and the reason this branch must not be left unmerged indefinitely.

## 11. Procurement gate status

| `AGENTS.md` gate requirement | Status |
| --- | --- |
| 1. Source-Scout evaluation of maintained OSS, official SDKs, libraries | **Satisfied** — §§ 3–5 |
| 2. Candidates with license, maintenance, telemetry, security surface, Windows support, adopt-vs-build effort | **Satisfied** — § 4 |
| 3. One explicit Blue verdict (ADOPT/FORK/PROTOTYPE/PATTERN-MINE/BUILD FRESH) | **SATISFIED** — Blue issued **`ADOPT`** on 2026-08-13 under an explicit issuing statement, recorded verbatim in § 12.1 |
| 4. If Blue named an OSS base, ADOPT/FORK is the default reading; never silently narrowed to PATTERN-MINE | **SATISFIED** — the issued verdict is `ADOPT` and names restic as the adopted engine (§ 12.1) |
| 5. PATTERN-MINE does not authorize rebuilding the subsystem | **NOT ENGAGED** — the verdict is `ADOPT`, not PATTERN-MINE; no build-fresh work is proposed or authorized |
| 6. Verdict recorded verbatim in a tracked record under `docs/` named for the subsystem | **SATISFIED IN FORM, PENDING MERGE** — this file is the record and now carries the verbatim verdict; it reaches `main` only when this branch is independently reviewed and Blue authorizes the merge |
| 7. Restate the verbatim verdict and identify the record by path in every work order and handoff | **SATISFIED for this branch** — `docs/BUILDER-HANDOFF-backup-recovery-source-scout.md` restates it verbatim and names this record by path; **binding on every later backup work order**, including the prototype |
| 9. "No suitable OSS exists" requires documented search evidence | **Not claimed.** Suitable OSS plainly exists |

## 12. Blue's issued verdict, and the boundary it sets

Added in revision 4. Sections 0–11 are the reviewed evidence and are unchanged. This section
records the decision Blue made on that evidence.

### 12.1 Authorization and the verdict, verbatim

**Blue's issuing statement, verbatim:**

> I ISSUE THE BACKUP AND RECOVERY ADOPT VERDICT EXACTLY AS DRAFTED.

Recorded 2026-08-13. This record was written only after that statement was made. Discussion,
a recommendation, a reviewer `VERDICT: PASS`, and a proposed verdict draft were each treated
as **insufficient** to authorize finalization, per the verdict-finalization work order.

**Blue's subsystem verdict, verbatim:**

> ADOPT — Independent backup and recovery: adopt restic as Blue Helm's backup engine, using its supported Windows VSS capture and encrypted repository format. Protect Agent Command Center and the project repositories it manages with an external removable copy and a separate encrypted Backblaze B2 off-site repository; GitHub remains an additional convenience and is not counted as one of the required backup copies. Blue Helm owns the allowlisted include/exclude policy, serialized scheduling, Git-bundle staging and verification, failure and staleness alerts, retention, integrity checks, credential-exclusion controls, and restore evidence.
>
> Exclude Electron `safeStorage` ciphertext, provider credentials, project secret files, provider/session configuration, shell history, and any other secret-bearing state not explicitly approved for protection. Credentials must be re-established through the documented human-controlled path. Recovery material must be stored independently of the computer and repository.
>
> Before production scheduling, authorize only a bounded prototype proving:
>
> 1. VSS-consistent capture to an external removable repository and a separate encrypted Backblaze B2 repository.
> 2. Whether B2 Object Lock plus a least-privilege application key that cannot delete backup objects can safely host the restic repository, including the exact effect on `forget`, `prune`, retention, maintenance, cost, and recovery. If workable off-site immutability cannot be demonstrated, stop and return to Blue for a fresh restic-versus-Kopia decision.
> 3. Visible failed-job and stale-backup detection.
> 4. An allowlist-shaped credential-exclusion policy, verified against the restored tree using known sentinels and secret-shaped detection. The scanner may report only bounded metadata and must never print matched values or surrounding secret content.
> 5. An isolated restore without the active workspace or GitHub.
> 6. A successful restore and verification on a different Windows machine or clean VM, including repository history, declared non-Git state, credential exclusion, and the documented credential re-establishment path.
>
> No production backup configuration, production-data upload, unattended recurring schedule, or claim of completed recovery protection is authorized by this verdict alone.

**Selected architecture.** The verdict selects restic with an external removable copy and a
separate encrypted Backblaze B2 off-site repository — the shape § 5 records as **Architecture
C**. Per § 9, C's surviving advantage over A was the off-site destination, and Blue's answer
to § 8 Q7 is **B2**, so C stands rather than converging into A. Choosing B2 also removes the
OneDrive desktop-sync ambiguity structurally rather than by rule (§ 12.8).

**Engine rationale, as decided.** Blue selected restic over Kopia on Windows capture
simplicity: restic's `--use-fs-snapshot` is a supported built-in flag, where Kopia's Windows
shadow-copy path is a Blue-authored `--before-folder-action` script (§ 4.1, § 4.2). The
tradeoff is explicit and is **not** presented as cost-free: this does not buy Kopia's
compliance-mode Object Lock, and § 12.3 is the experiment that tests what immutability restic
can actually reach.

### 12.2 What `ADOPT` authorizes, and what it does not

**Authorized now:**

* Adopt **restic** as the selected backup engine for this subsystem.
* Write a **separate bounded prototype specification** under its own work order.
* Later **execute only that prototype**, after the specification has had its own independent
  review and Blue's authorization.
* Evaluate the external USB and Backblaze B2 destinations using **disposable or synthetic
  prototype material** — never production credentials or secret-bearing state.
* Design the Blue Helm-owned orchestration around the adopted engine (§ 9).

**Not authorized by this verdict:**

* Production backup configuration.
* Production-data upload.
* Unattended or recurring scheduling.
* Any claim that Blue Helm is protected, or that recovery protection is complete.
* Installing restic or rclone through this branch.
* Creating a Backblaze or Microsoft account, or any application key, through this branch.
* Backing up real credentials or secret-bearing state.
* Merging or pushing without the normal review and authorization path.

**Nothing in this record has been exercised.** No architecture has been run. No backup, copy,
restore, scan, or upload has occurred at any point across revisions 1–4.

### 12.3 The bounded prototype — immutability split into two distinct controls

The prototype must test **two different controls** and report them separately. Collapsing
them would either overstate restic's immutability or discard a workable control because a
stricter one failed.

#### A. Append-only-key immutability — **primary pass condition**

Test whether:

* Scheduled backup and copy operations can run under a **least-privilege B2 application key**
  that can create and write the required objects but **cannot delete backup objects**.
* A compromised scheduled-backup environment therefore **cannot delete retained off-site
  snapshots**.
* `forget` and `prune` — which require delete access — occur **only** through a **separately
  held privileged maintenance credential**.
* That privileged credential is **unavailable** to the scheduled job and to the ordinary pane
  environment.
* Maintenance runs in an **explicit controlled window**.
* Failure or absence of append-only protection **refuses visibly**.
* Key permissions and actual destructive behaviour are proven by **negative controls** — an
  attempted delete under the restricted key must be observed to fail — **not inferred from
  configuration text**.

*Supporting evidence already on record.* Restic's own documentation states that `forget` and
`prune` "require full read, write and delete access to the repository," and recommends, for
append-only backends, using "a separate and well-secured client whenever full access to the
repository is needed, e.g. for administrative tasks such as running `forget`, `prune`."
Backblaze's application-key capability model separates `writeFiles` from `deleteFiles`, so a
write-without-delete key is expressible. This control is therefore expected to be reachable —
but it must be **demonstrated**, not assumed.

#### B. Compliance-mode Object Lock — **separately reported experiment**

Test and report:

* Whether compliance-mode Object Lock can coexist safely with a restic repository.
* The exact effect on `forget`, `prune`, repository growth, retention, maintenance, cost, and
  recovery.
* **Restic's lack of object-lock awareness** — § 4.1 records issues #4992 and #2202 closed and
  proposal #3195 open since 2020-12-27, and restic has no equivalent of Kopia's
  `--extend-object-locks` maintenance handling.
* Whether locked objects **prevent normal repository maintenance**.
* Whether the control is operationally usable, or would require reconsidering Kopia.

**Compliance-mode Object Lock is not the pass condition.** The stop-and-return trigger is:

> **No workable off-site immutability of either reviewed kind can be demonstrated.**

If append-only-key immutability succeeds but compliance-mode Object Lock does not, **report
both results accurately and do not treat the prototype as failed.** If neither works safely,
**stop and return to Blue for a fresh restic-versus-Kopia decision** before any production
work.

### 12.4 Scope-coverage staleness — the allowlist must not silently shrink

An allowlist fails safe for secrecy and **unsafe for coverage**: a newly managed repository
is silently unprotected until someone adds it. That is failure class **F8** (§ 1) re-entering
through the include policy rather than the scheduler.

The prototype specification must include:

* A **canonical inventory** of every repository and non-Git state category Blue Helm claims to
  manage.
* **Comparison of that inventory against the protected allowlist on every run.**
* **Visible refusal or warning** when a managed repository or state category is absent from
  the allowlist.
* Detection of **newly created** managed repositories.
* Detection of paths that **moved or disappeared**.
* A **last-success timestamp per declared protection unit**, or another equivalently
  reviewable scope-evidence model.
* **No silent success** when the scheduled job ran but omitted a declared unit.
* Tests proving **both**: an unapproved secret-bearing path is excluded, **and** a newly
  managed repository is surfaced as unprotected.

Three staleness kinds must be distinguished, each with its own visible evidence:

| Kind | Meaning |
| --- | --- |
| **Job staleness** | The backup did not run, or failed |
| **Copy staleness** | One destination did not receive the completed snapshot |
| **Coverage staleness** | The job succeeded, but the declared managed scope was incomplete |

*Scope note.* The verdict extends protection to "the project repositories it manages." § 2
S16 records that `D:\Workspace\Automation-Chores`, `D:\Workspace\.reference`, and the **4
`agent-command-center-*` physical directories that are not registered worktrees** have
**unexamined contents**. The § 2 sizing conclusion ("tens of megabytes") was measured for the
narrower Agent Command Center set and **must be re-measured** against the canonical inventory
rather than inherited.

### 12.5 Credential-exclusion proof — allowlist-shaped, metadata-only reporting

Carried into the prototype specification:

* **Allowlist-shaped capture.**
* **Known non-secret sentinels** proving intended files were included.
* **Known secret-shaped synthetic sentinels** proving excluded paths were excluded.
* A **post-restore secret-shaped scan**.
* **Bounded metadata-only reporting**: counts, rule identifiers, disposition, and pass/fail
  only.
* **No matched value.** **No surrounding content.** **No secret-bearing path** where the path
  itself is sensitive.
* **Logs and retained evidence must remain metadata-only** — the § 6.11 drill record is kept
  on `main`, so a scanner that echoed matches would convert the negative control into a
  disclosure surface.
* A **positive control** proving the scanner detects the synthetic secret.
* A **negative control** proving the reporting layer does not emit it.

**No real secret may be created merely to test the scanner.**

### 12.6 DPAPI — bypassed by exclusion, not answered by migration

The different-machine restore **must not be written up as proving whether existing Windows
DPAPI ciphertext is portable.** Because `secure.json` is excluded, that question is
**deliberately bypassed by design**, not resolved.

The prototype must prove:

* Recovery succeeds **without** `secure.json`.
* The restored machine **does not depend on decrypting the original DPAPI ciphertext**.
* Credential re-establishment through the **documented human-controlled path** works.
* The restored tree contains **no excluded `secure.json`**.

**Do not copy, migrate, or attempt to decrypt the original `secure.json` during the
prototype.** The § 2.1 portability question remains **UNVERIFIED** and stays that way; the
design's correctness does not depend on answering it.

### 12.7 Different-machine acceptance

The bounded prototype must include restoration to **a clean Windows VM or a physically
different Windows computer**.

The destination must not rely on: the source machine's workspace; GitHub; existing
source-machine DPAPI state; existing provider credentials; or undocumented knowledge held only
by an active agent session.

It must verify:

* Declared Git refs and representative objects — per namespace, per § 6.1 and § 6.6.
* Declared non-Git state.
* **Worktree repair, pruning, and reconstruction** behaviour.
* Bundle extraction and `git bundle verify`.
* Credential exclusion.
* Human-controlled credential re-establishment.
* App launch, or appropriate read-only validation.
* Safe cleanup that **cannot affect the source workspace**.
* Retained evidence on `main`.

### 12.8 Independent-review observations carried forward as specification requirements

From the fresh independent Standard-class review that returned `VERDICT: PASS` on revision 3:

* **If OneDrive is ever reconsidered**, its desktop client must be **affirmatively excluded**
  from any live repository path. Merely "not pointing it there" is insufficient, because a
  repository inside a synced root is mirrored by default. Selecting B2 avoids this case
  entirely rather than mitigating it.
* **Git-bundle handling applies consistently to every restic architecture** — staged,
  verified, captured inside the encrypted snapshot, guarded cleanup. § 5.1's integrity row
  credits `git bundle verify` only to C; the § 5.2 rule is common to all.
* **Deliberately failed and stale job evidence belongs inside the formal restore/prototype
  acceptance plan**, not only in the § 9 experiment narrative.
* **Worktree recovery must address repair, pruning, and reconstruction** — `git worktree
  repair` alone does not cover worktrees that were not restored, and a bundle-only path
  carries no worktree metadata at all.
* **File History's minor known-folder enumeration** (§ 4.4 omits Contacts and Favorites) does
  **not** change its rejection; the state locations are still outside its scope.
* **No architecture has been exercised.** Every behavioural claim in this record remains
  documentation-sourced.

### 12.9 Review history, and the superseded ending

| Stage | Result |
| --- | --- |
| Initial Source-Scout submission (rev 1, `ccb8b524`) | Submitted |
| Pre-review accuracy correction (rev 2, `b079d0f9`) | Reachability inference corrected before review |
| First independent Standard-class review of rev 2 | **`VERDICT: FAIL`** — seven findings, three merge-blocking |
| Revision-3 corrections (`a796952a`) | All seven findings applied |
| Fresh independent Standard-class review of rev 3 | **`VERDICT: PASS`** — all seven confirmed corrected, with six non-blocking observations |
| Blue's authorization and verdict | **`ADOPT`**, issued 2026-08-13 (§ 12.1) |
| This verdict-finalization branch | Documentation-only; records the verdict and its boundary; stops for fresh independent review |

**The first review was a `FAIL` and is recorded as one.** It is not rewritten as though it had
passed originally, and revision 3 did not become correct retroactively — it became correct by
being corrected and re-reviewed.

> **SUPERSEDED ENDING — revisions 1–3 ended with:**
>
> **BLUE SUBSYSTEM VERDICT: NOT YET ISSUED — IMPLEMENTATION REMAINS UNAUTHORIZED**
>
> That line was accurate for revisions 1–3 and is retained here as provenance. It is
> superseded by the verdict in § 12.1 and by the ending below. **Implementation beyond the
> bounded prototype remains unauthorized regardless** (§ 12.2) — the supersession changes who
> has decided, not what is permitted to be built.

---

**BLUE SUBSYSTEM VERDICT: ADOPT**
