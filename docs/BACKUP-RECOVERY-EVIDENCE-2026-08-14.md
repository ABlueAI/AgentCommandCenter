# Backup and Recovery Evidence — 2026-08-14

## 0. Status and boundary

This is a factual record of the manual local recovery drill completed on
2026-08-14. It is not a production backup specification, does not supersede the
`ADOPT` verdict in `docs/OSS-PROCUREMENT-backup-recovery.md`, and does not claim
that Blue Helm has a complete backup system.

Blue authorized this record with:

> AUTHORIZE RELEASE 1.0 SCOPE RESET AND BACKUP EVIDENCE RECORD

No secret value is reproduced here. Evidence that would require the repository
password was recorded from the completed human/Claude run and was not replayed
during this documentation pass.

## 1. Result in one sentence

The drill created an encrypted restic 0.19.1 repository on a physical disk
separate from the workspace, captured `D:\Workspace` with two broad cache
exclusions, restored into an isolated directory, and read a representative
tracked project file; it did not establish off-site, scheduled, stale-detected,
or independently recoverable protection.

## 2. Environment and measured identities

| Item | Recorded result | Evidence class |
|---|---|---|
| Date | 2026-08-14 | completed-run record |
| Engine | restic 0.19.1, Windows/amd64 | independently reproduced from installed binary |
| Source root | `D:\Workspace` | completed-run command history |
| Repository | `C:\blue-helm-backup` | independently observed filesystem structure |
| Original disk | Disk 1, Samsung SSD 990 PRO with Heatsink 4TB | independently reproduced live |
| Repository disk | Disk 0, NVMe MTFDKBA1T0QGN-1BN1AABGA | independently reproduced live |
| Repository data packs | 9 files, 103,963,207 bytes total | independently reproduced live |
| Snapshot blobs | 2 | independently reproduced live |
| Restore target | `D:\restore-test` during the run | completed-run command history; removed afterward |

The two paths are on different physical disks, not merely different drive
letters or partitions. That protects against loss of either one of those disks
in isolation. Both disks remain in the same machine and location.

## 3. Capture operation

The actual backup command targeted `D:\Workspace` and excluded:

- `node_modules`
- `.worktrees`

No `.env` exclusion was present in that command. During the completed drill a
project `.env` was observed inside the captured material. The file is absent
from the active workspace at the time of this record, so this documentation
pass did not independently reopen the encrypted snapshot and re-observe it.

This is a negative security finding. The two-entry denylist is suitable only as
evidence of what the manual drill did. It is not an approved production
credential-exclusion policy and must not be copied into unattended backup
configuration. The production decision record instead requires allowlisted
scope plus metadata-only exclusion proof.

## 4. Encryption evidence

The destination has restic's repository structure, including a repository
configuration and key material, and the installed engine identifies itself as
restic 0.19.1. Restic repositories encrypt repository content by design. This
record does not include, read, relocate, or test the repository password or any
other recovery secret.

Accordingly, the drill proves that the created copy is a restic-encrypted
repository. It does **not** prove that recovery material exists independently of
this computer or that another machine/operator can unlock it.

## 5. Restore evidence

The completed run restored into an isolated directory and then read the first
lines of:

`D:\restore-test\Workspace\agent-command-center\BLUE-HELM-MASTER-STATUS.md`

That is positive evidence for a representative tracked-file round trip. The
temporary restore directory was subsequently removed and was absent when this
record was prepared.

The drill did not retain a complete file-by-file restore manifest, did not
compare every restored byte against the source, and did not execute the restore
on another Windows machine. It therefore proves a representative recovery, not
complete-workspace restoration.

## 6. Windows long-path finding

Cleanup encountered Codex turn-diff reference paths that exceed the traditional
Windows `MAX_PATH` boundary after being nested under the restore directory.
The current matching path set under `.git\refs\codex\turn-diffs\checkpoints`
contains two files; the longest current absolute source path is 253 characters.
At the representative restore prefix used by the drill, the projected path is
266 characters.

Extended-length path handling (`\\?\`) was needed during cleanup. The clean-
machine test must therefore verify long-path behavior for restore, inspection,
and guarded cleanup instead of treating a successful representative file read
as proof that all Git metadata is portable under ordinary Windows path APIs.

## 7. What this drill proves

The evidence supports these bounded claims:

1. restic 0.19.1 is installed and ran on this Windows machine;
2. a nontrivial encrypted repository exists;
3. the source and repository were on separate physical disks;
4. the capture covered `D:\Workspace` subject to the two stated exclusions;
5. a representative tracked project file was read from an isolated restore;
6. the drill exposed a real secret-coverage weakness (`.env`) and a real Windows
   long-path risk rather than silently declaring success.

For Blue's personal 1.0 release, this is sufficient evidence to record one
recoverable local cross-disk copy and to make the remaining risk explicit. It
does not complete the production backup roadmap item.

## 8. What remains unprotected or unproven

The drill did **not** establish:

- an off-site copy or survival of machine/location loss;
- three copies across two media with one off-site;
- immutable or append-only retention;
- an unattended recurring schedule;
- visible failed-job detection;
- visible stale-backup or scope-coverage-staleness detection;
- an allowlisted source policy or complete credential exclusion;
- independent custody and recovery testing of the repository password;
- repository-wide `check --read-data` integrity proof;
- a VSS-consistent capture of open files;
- a different-machine or clean-VM restore;
- full Git namespace, reflog, stash, and worktree recovery guarantees;
- a complete restored-file manifest or byte-for-byte whole-set comparison; or
- protection against simultaneous loss/compromise of both internal disks.

These are accepted residuals for the narrow personal 1.0 scope, not passes.
Production backup automation and off-site recovery remain deferred, and the
`ADOPT` verdict remains available for that later work.

## 9. Evidence provenance and handling

The documentation pass performed only read-only verification:

- a real fetch and live `origin/main` comparison;
- the installed restic binary's version output;
- filesystem metadata for the restic repository;
- physical-disk mapping for `C:` and `D:`;
- redacted command-history review for the completed capture/restore flow;
- current path-length measurement for Codex turn-diff references; and
- confirmation that the temporary restore targets were absent.

It did not rerun backup or restore, invoke a provider, read a repository secret,
create an account or key, modify the restic repository, or upload data.
