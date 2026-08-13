# OSS Procurement — Independent Backup and Recovery

Subsystem: **Independent backup and recovery** (Blue Helm 1.0 remaining-work entry 1).
Record type: **Source-Scout evaluation.** Read-only research and analysis.
Date: **2026-08-13**
Evidence retrieval date: **2026-08-13** (all external sources accessed this date unless stated).
Branch: `feature/backup-recovery-source-scout`
Base `main`: `4d0548e592d34e8407e939981bf4787c054387ad` (subject `Merge Release 1.0 decision reconciliation`)
Revision: **1** — first submission, stops for independent Standard-class review.

**Subsystem verdict: NOT YET ISSUED.** This record presents evidence and a recommended
direction. It does not authorize installation, configuration, a backup, a restore, an
account, or a purchase. Per `AGENTS.md` § *OSS-FIRST PROCUREMENT GATE — HARD INVARIANT*
item 3, only Blue issues the subsystem verdict, and only ADOPT, FORK, PROTOTYPE,
PATTERN-MINE, or BUILD FRESH are final.

## 0. What this record is, and the honest state of the problem

Blue Helm's release risk has been measured so far as "does the feature work." This
subsystem measures something else: **can this project survive a lost disk, a bad delete,
or a compromised account.** Nothing on `main` currently answers that.

The audit below found the problem is materially worse than "there is no backup job." The
single most important measured fact in this record:

> **60 of 66 local branches in `D:\Workspace\agent-command-center` have no upstream
> tracking branch.** Six do. There are **zero tags**. Measured 2026-08-13 with
> `git for-each-ref --format='%(refname:short) %(upstream:short)' refs/heads`.

GitHub therefore protects roughly one branch in eleven. The remaining sixty exist on
exactly one disk, in one building. That is not a gap in a backup plan; it is the absence
of one.

## 1. The protection problem — failure classes

Backup, synchronization, replication, and a Git remote are four different controls that
fail in different ways. The table states, per failure class, what must survive, which copy
answers it, what independence that copy needs, how the failure becomes visible, and what
evidence proves recovery.

| # | Failure class | What must survive | Copy relied upon | Required independence | How failure becomes visible | Recovery evidence |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Internal drive failure (`D:` dies) | All Git history, all local-only branches, non-Git app state, control-plane evidence | Copy 2 (local external) first; Copy 3 (off-site) if the external is also lost | Different physical device from `D:` | Immediate and loud — the machine cannot read the volume | Restore drill § 6 completes from Copy 2 alone |
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

* **A Git remote is not a backup.** It holds pushed history only. Measured today, that is
  6 of 66 branches, none of the working tree, none of the gitignored control-plane
  evidence, and none of the non-Git application state.
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
| S1 | Committed Git history and refs | `D:\Workspace\agent-command-center\.git` — 624 files, **6.1 MB** | **Authoritative** | **Include** | Yes — copying during a Git write can tear an object or ref update | Yes | Git installed. Blue |
| S2 | **Local branches with no upstream** | 60 of 66 refs under `.git/refs/heads` | **Authoritative and irreplaceable** | **Include** | With S1 | Yes | Same as S1. Blue |
| S3 | Uncommitted tracked changes | Working trees under `D:\Workspace\agent-command-center` and `.worktrees\*` | Valuable, possibly authoritative | **Include** | Yes — mid-edit capture | Yes | None beyond files. Blue |
| S4 | Untracked files | Any working tree | Valuable, unknown content | **Include** (with exclusions below) | Yes | Yes | None. Blue |
| S5 | Gitignored review artifacts | `.agent-review*.diff` (`.gitignore:33`) | **Valuable evidence, never committable** | **Include** | Low — written once via `git diff --output` | Yes | None. Blue |
| S6 | Merge-gate plans and control-plane evidence | `.merge-gate\` — **12 files**, e.g. `plan-release-1.0-decision-reconciliation.psd1` (827 B, 2026-08-13) | **Valuable, human-authored, irreplaceable** | **Include** | Low | Yes | None. Blue |
| S7 | Worktree content with unfinished work | 26 registered worktrees (`git worktree list`), incl. `D:\Workspace\agent-command-center-*` siblings | Valuable | **Include** | Yes | Path-sensitive — see S8 | Blue |
| S8 | Git worktree administrative metadata | `.git\worktrees\*`, and `.git` **files** inside each worktree pointing at absolute paths | Valuable but **path-bound** | **Include**, and expect repair on restore | Low | **Partially.** Absolute paths break if restored to a different drive letter or root | `git worktree repair`. Blue |
| S9 | Blue Helm application configuration | `%APPDATA%\command-center\settings.json` — **161 B** | Valuable, small | **Include** | Low, but written on app events | Yes — plain JSON | None. Blue |
| S10 | Saved Dockview layouts | `%APPDATA%\command-center\dockview-layout.json` (**1,291 B**); `dockview-prototype-layout.json` (**1,653 B**, retained prototype evidence) | Valuable, non-secret | **Include** | Low | Yes | None. Blue |
| S11 | Claude coordination surface | `%USERPROFILE%\.claude.json` | Valuable; **may contain session/account material** | **Protect separately — treat as sensitive until proven otherwise** | Written by external tooling at any time | **UNVERIFIED** | Out of scope here; see § 8 Q2 |
| S12 | Video Scout run library | `D:\Gemini_Video_Review\Downloads` — **61 files, 84.7 MB**; per-run `run-*\manifest.json` (~1.8 KB each) | **Reports/manifests valuable; media reproducible** | **Include manifests and reports; exclude media** | Yes, if a run is active | Yes | None. Blue |
| S13 | Downloaded media | `D:\Gemini_Video_Review\Downloads\*.mp4`, `*.srt`; repo `media/` (`.gitignore`) | **Reproducible / disposable** — already swept by `video-scout-retention-sweep.ps1` and V5c2a cleanup | **Exclude** | N/A | N/A | Re-download. Blue |
| S14 | Agent-role outputs | `D:\Workspace\.command-center\outputs\` — ~46 `web-scout-*` / `source-scout-*` run directories | Valuable research output | **Include** | Low | Yes | None. Blue |
| S15 | Documentation and human acceptance records | Tracked `docs\`, `BLUE-HELM-MASTER-STATUS.md` | Authoritative | **Include** (covered by S1) | With S1 | Yes | None. Blue |
| S16 | Other project repositories | `D:\Workspace\Automation-Chores`, `D:\Workspace\.reference` | Authoritative for those projects | **Scope decision — see § 8 Q1** | Yes | Yes | Blue |
| S17 | Electron `safeStorage` ciphertext | `%APPDATA%\command-center\secure.json` — **131 B** | **Secret-bearing ciphertext** | **Exclude from ordinary backups** (§ 2.1) | Low | **NO — see § 2.1** | Re-enter key via in-app UI. Blue |
| S18 | Provider configuration and auth state | Provider CLI config under `%USERPROFILE%`; browser/session state | **Secret-bearing** | **Exclude** | Varies | No | Re-authenticate. Blue |
| S19 | Chromium/Electron runtime state | `%APPDATA%\command-center\{Cache,Code Cache,GPUCache,Network,Local Storage,Session Storage,Service Worker,blob_storage,DIPS,...}` | **Reproducible / transient**; `Network` and `Local Storage` may hold session material | **Exclude** | High — live-written | No | Regenerated. None |
| S20 | Dependencies and build output | `node_modules\`, `dist\`, `build\`, `out\` (`.gitignore`) | **Reproducible** | **Exclude** | N/A | N/A | `npm install`. Blue |
| S21 | Vendored large bundle | `app/renderer/vendor/transformers.web.min.js` (untracked by policy) | Reproducible | **Exclude** | N/A | N/A | Re-vendor. Blue |

**Measured totals that make sizing easy.** The authoritative, irreplaceable core (S1–S10,
S14, S15, plus manifests from S12) is **small** — `.git` is 6.1 MB, the entire
`%APPDATA%\command-center` non-cache set is under 5 KB, `.merge-gate` is ~10 KB, and run
manifests are ~1.8 KB each. Excluding media (S13, 84.7 MB) and dependencies (S20), the
protected set is plausibly **tens of megabytes**, not gigabytes. Cost is therefore not a
serious constraint on this subsystem; discipline is.

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
| **Git-specific snapshots** (`git bundle`, `--mirror` clone) | A self-contained, verifiable, format-stable archive of *all* refs including the 60 local-only branches | Covers only Git; ignores S9–S14 entirely |
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
| Fit | Image-level recovery is a different and complementary goal from versioned file-level recovery of a 6.1 MB `.git` plus small state files |
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
| Measured coverage today | **6 of 66 local branches; 0 tags.** Nothing else |
| What it does not hold | 60 local-only branches, working trees, `.merge-gate\` (12 files), `.agent-review*.diff`, `%APPDATA%\command-center` state, the Video Scout library, `.command-center\outputs`, or any recovery material |
| Failure exposure | F5 — account compromise, repository deletion, or outage removes it entirely |
| Accept / reject | **Keep, and count it honestly.** It is a real off-site copy of a real subset. It is **not** the backup, and no architecture below may count it as one of the three copies |

### 4.9 `git bundle` / `--mirror` snapshot

| Field | Finding |
| --- | --- |
| Canonical source | https://git-scm.com/docs/git-bundle (accessed 2026-08-13) |
| Role | "Move objects and refs by archive" — offline transfer of Git objects "without an active 'server'" |
| Key properties | "Bundles are `.pack` files with a header indicating what references are contained within." A self-contained bundle "can be extracted into anywhere, even into an empty repository, or be cloned from" — `git clone backup.bundle <dir>` works |
| Why it matters here | A single verifiable file capturing **all 66 refs**, restorable with nothing but Git. Immune to the torn-`.git`-directory risk because Git itself produces it |
| Limitation | Git only. Says nothing about S9–S14. Also excludes the reflog and stashes unless captured deliberately |
| Cost / effort | $0; one command |
| Accept / reject | **Strong accept as a component.** The single highest value-per-effort item in this record, and the one that most directly answers the 60-local-branch finding |

### 4.10 rclone

| Field | Finding |
| --- | --- |
| Canonical source | https://github.com/rclone/rclone |
| Current version / date | **v1.75.0**, published **2026-07-31**; last push 2026-08-12; 59,114 stars |
| License | **MIT** |
| Role | **Transport.** Moves data to ~70 storage providers; `crypt` overlay provides client-side encryption |
| What it is not | Not a versioned backup system. No snapshots, no retention policy, no deduplicated history |
| Accept / reject | **Accept as an optional transport only**, and only if a chosen destination is not natively supported by the engine. Must never be described as the backup |

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
| **Copy 2** | restic repository on an **external USB drive**, plus a `git bundle --all` written into the same repository path. Offline except during the backup window |
| **Copy 3** | The same restic repository replicated to an **already-owned OneDrive folder** (encrypted before it leaves the machine, because restic encrypts client-side) |
| Storage forms | Internal SSD (source), external USB (removable), cloud object/file storage |
| Off-site | OneDrive |
| Independent of GitHub | Yes |
| Retention | restic `forget --keep-daily 7 --keep-weekly 8 --keep-monthly 12` **(?) tunable** |
| Encryption ownership | Blue holds the restic repository password |
| RPO | Daily, or on-demand before risky operations **(?)** |
| RTO | Hours — install Git + restic, restore, `git worktree repair` |
| Failure alert | Scheduled-task exit code surfaced by a Blue-owned check; **must be built, does not exist** |
| Cost | **$0 recurring** (uses existing OneDrive allocation and an owned drive) |
| Single points of failure | Blue's OneDrive account; the external drive if kept in the same building |
| GitHub **and** the computer both gone | **Recoverable** from OneDrive, provided the password is available (§ 7) |
| Weakness | **Weakest against F6.** A compromised host holds credentials for both copies. OneDrive's 30-day version horizon is the only rollback for the container files |

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
| Engine | **restic** for the general file set **plus** a scheduled `git bundle --all` per repository as an independent, format-stable Git artifact |
| **Copy 1** | Working state on `D:` |
| **Copy 2** | External USB: restic repository **and** dated `*.bundle` files |
| **Copy 3** | **Backblaze B2** holding the restic repository; bundles included in it |
| Fourth, deliberately non-counted | GitHub, for the 6 branches that are pushed — recorded honestly as partial |
| Storage forms | Internal SSD, external USB, S3-compatible object storage |
| Off-site | B2 |
| Independent of GitHub | Yes, and doubly so — a bundle restores with Git alone, no restic needed |
| Retention | restic policy for files; bundles kept on a dated rotation **(?)** |
| Encryption ownership | Blue holds the restic password; bundles inside the repository inherit its encryption |
| RPO | Daily for files; per-session for bundles if triggered before risky Git operations |
| RTO | **Fastest for the most likely disaster** — recovering history needs only Git and one `.bundle` |
| Failure alert | Same Blue-owned requirement |
| Cost | **$0–negligible** (B2 free tier) |
| Single points of failure | Fewest of the three: two independent restore mechanisms (restic and plain Git) over two independent destinations |
| GitHub **and** the computer both gone | **Recoverable**, by either mechanism |
| Weakness | Two mechanisms mean two things to verify and two things that can silently stop. No object-lock immutability unless B2 Object Lock is added, which restic does not natively drive (§ 4.1) |

### 5.1 Architecture comparison

| Criterion | A (no cost) | B (immutable) | C (Git-first) |
| --- | --- | --- | --- |
| ≥3 recoverable copies | Yes | Yes | Yes |
| ≥2 storage forms | Yes | Yes | Yes |
| ≥1 off-site | Yes | Yes | Yes |
| Independent of live GitHub | Yes | Yes | **Yes, twice over** |
| Version retention | Yes | Yes | Yes |
| Encrypted off-site | Yes (client-side) | Yes (client-side) | Yes (client-side) |
| Integrity verification | `restic check --read-data` | Kopia verify + Reed-Solomon | Both, plus `git bundle verify` |
| Visible failure | **Must be built** | **Must be built** | **Must be built** |
| Replacement-machine recovery | Yes | Yes | Yes |
| Windows locked-file consistency | **Built-in VSS** | **Blue-authored scripts** | **Built-in VSS** |
| F6 ransomware resistance | Weak | **Strong (compliance object lock)** | Moderate |
| Recurring cost | $0 | ~$0 (free tier) | ~$0 (free tier) |
| Operational complexity | Lowest | Highest | Middle |

## 6. Restore-drill design — specified, not performed

**Not performed.** No drill, prototype, or restore command was run. This section is the
acceptance specification for a later, separately authorized work order.

The drill must prove recovery **without** the active workspace, the active computer's
repository, GitHub, undocumented knowledge held only in a Claude session, or existing
decrypted provider credentials.

### 6.1 Frozen manifest
Before capture, record what recovery is expected to produce: the full output of
`git for-each-ref` (all 66 refs, so the 60 local-only branches are provable), `git worktree
list`, the file list of `%APPDATA%\command-center` non-cache state, the `.merge-gate\`
file list, the Video Scout run-ID list, and `.command-center\outputs` directory names.
Store the manifest **with the backup and on `main`**.

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
Restore `.git` from the backup **and**, independently, `git clone <dated>.bundle` into a
second directory. Two mechanisms, compared against each other.

### 6.5 Declared non-Git state restoration
Restore S9, S10, S6, S5, S12 (manifests/reports), S14 to the isolated destination.

### 6.6 Verification
Compare restored `git for-each-ref` against the frozen manifest — **all 66 refs present,
byte-identical SHAs**. Recompute the § 6.2 digests and compare. Confirm representative
untracked and gitignored artifacts exist.

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

### 6.13 Quiescing during capture
Highest-risk writers: **Git operations** (mid-write `.git`), **Electron** (`settings.json`,
`dockview-layout.json`, Chromium state), and **active Video Scout runs** (media and
manifests). VSS resolves the locked-file problem but does not make an application-level
write atomic. Preferred design: capture via VSS **and** schedule when Electron is closed
**(?)**. `git bundle` sidesteps the issue for the most valuable state, because Git produces
the artifact itself.

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

1. **Scope.** Only `agent-command-center`, or all of `D:\Workspace` — including
   `Automation-Chores`, `.reference`, and the ten sibling worktree folders (S16)?
2. **`.claude.json` (S11).** Include, exclude, or protect separately? It is Blue Helm's
   documented coordination surface, and whether it carries session material is
   **UNVERIFIED**. Excluding it is the safe default; the cost is losing coordination state.
3. **Recovery point.** Per commit, hourly, daily, or on-demand before risky operations?
   The 60-local-branch finding argues for at least daily plus a manual trigger.
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

## 9. Recommendation — re-derived, and not a verdict

**Adoptable intact.** The capture engine, its encryption, its deduplication, its snapshot
and retention model, its integrity verification, and its restore machinery. Restic and
Kopia are both mature, permissively licensed, actively maintained, and genuinely fit for
Windows. Nothing here justifies writing a backup engine.

**Blue Helm-owned regardless of engine.** The include/exclude policy derived from § 2;
scheduling and quiescing; the `git bundle` component; `check`/verify cadence; **failure
visibility and last-success staleness alerting**; the frozen manifest and digest recording;
the restore-drill harness; and the credential-exclusion negative control. This is
configuration, orchestration, and evidence — not a product.

**Rejected.** Duplicati (mixed vendor-controlled licensing; unnecessary service and web-UI
surface). File History (scope mismatch with the actual state locations). `robocopy` and
Syncthing as backups (no versioning / deletion propagation). GitHub as the backup (measured
6-of-66 coverage). rclone is accepted only as optional transport.

**Unverified, and honestly flagged.** `wbadmin`'s full feature availability on Windows 11
Home; `secure.json` decryptability after profile migration; whether `.claude.json` carries
session material; whether any candidate's failure-alerting can be made to satisfy Blue
without custom work (current evidence says no for restic and Kopia).

**The load-bearing uncertainty**, and the bounded experiment that would resolve it:
> Can a scheduled, VSS-consistent capture of this specific machine's state be restored to a
> clean isolated destination such that **all 66 refs** and the declared non-Git state come
> back intact, with `secure.json` provably absent — and does the operator find out when the
> job stops running?

That is one bounded prototype: one engine, one external drive, one off-site destination,
one drill, one deliberately broken job to prove the alert fires.

**Recommended direction, for Blue's decision — `ADOPT`.**

The subsystem is an adopted engine plus Blue Helm-owned configuration, verification, and
restore orchestration. Under `AGENTS.md` item 4, that is **ADOPT**, and item 5 makes the
distinction consequential: PATTERN-MINE would not authorize using restic or Kopia at all,
only studying them. Silently collapsing this into PATTERN-MINE would be exactly the
narrowing the gate forbids. The owned configuration and orchestration around an adopted
tool is normal integration work, not a separate BUILD FRESH subsystem — no new engine, no
new format, no new crypto is proposed, and none should be.

**On engine choice, if Blue chooses ADOPT**, the evidence favours **restic in Architecture
C**: built-in VSS is a materially better Windows consistency story than user-maintained
shadow-copy scripts, and the `git bundle` component directly answers the strongest measured
risk in this record with one command and no new dependency. **Kopia in Architecture B is
the correct choice if ransomware immutability outranks Windows capture simplicity** — its
compliance-mode object lock is the only documented path in this evaluation to a copy a
compromised host cannot destroy. Both are defensible; they optimise different failure
classes, and § 8 Q8 is the question that decides between them.

**PROTOTYPE is the reasonable alternative direction** if Blue wants the load-bearing
uncertainty resolved before committing — bounded to the single experiment named above.

## 10. Historical and roadmap accuracy

* **GitHub protects only committed and pushed Git history.** Measured coverage on
  2026-08-13: **6 of 66 local branches, 0 tags.**
* **GitHub is not the sole backup.** It does not protect uncommitted work, gitignored
  artifacts (`.agent-review*.diff`, `.merge-gate\`), the 60 local-only branches,
  `%APPDATA%\command-center` application state, the Video Scout library,
  `.command-center\outputs`, or any recovery material.
* **`codex/release-1.0-auth-backup-blockers` is stale and must not be merged.** Its
  commitment was reconciled into current roadmap language on `main` by
  `docs/DECISION-RECONCILIATION-release-1.0.md` § 3, which classified it **DEFERRED** and
  retained it as provenance. It was consulted read-only for historical comparison; **current
  `main` is controlling**.
* **Backup and recovery is the first remaining Release 1.0 workstream** —
  `BLUE-HELM-MASTER-STATUS.md` § *Remaining work — Blue Helm 1.0, in order*, entry 1, and a
  blocking prerequisite of the release gate at entry 10.
* **Implementation remains unauthorized** until Blue issues a verdict and it is recorded on
  `main` in this tracked record. This branch changes no roadmap state; roadmap updates
  belong to a later verdict-finalization work order.

## 11. Procurement gate status

| `AGENTS.md` gate requirement | Status |
| --- | --- |
| 1. Source-Scout evaluation of maintained OSS, official SDKs, libraries | **Satisfied** — §§ 3–5 |
| 2. Candidates with license, maintenance, telemetry, security surface, Windows support, adopt-vs-build effort | **Satisfied** — § 4 |
| 3. One explicit Blue verdict (ADOPT/FORK/PROTOTYPE/PATTERN-MINE/BUILD FRESH) | **NOT SATISFIED — awaiting Blue.** § 9 recommends a direction only |
| 6. Verdict recorded verbatim in a tracked record under `docs/` named for the subsystem | **Pending** — this file is the record; the verdict line is absent by design |
| 9. "No suitable OSS exists" requires documented search evidence | **Not claimed.** Suitable OSS plainly exists |

---

**BLUE SUBSYSTEM VERDICT: NOT YET ISSUED — IMPLEMENTATION REMAINS UNAUTHORIZED**
