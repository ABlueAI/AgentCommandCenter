# Browser-to-desktop source archive — 2026-07-14

This directory preserves the files Blue supplied while moving the Agent
Command Center / Blue Helm orchestration work from ChatGPT web to the desktop
app.

## Usage

- Treat `originals/` as immutable evidence from the browser-era project.
- Treat `expanded/` as search-friendly copies of the two ZIP archives.
- Use `BLUE-HELM-MASTER-STATUS.md` at the repository root as the current source
  of truth. Historical files in this archive may be stale or contradictory.
- Use `AGENTS.md` and `CLAUDE.md` for the current platform-specific operating
  instructions.
- Do not copy credential guidance from historical files without checking the
  current rule: provider credentials must not be persisted with `setx`.

## Original files

| Archived name | Original download name | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `AI-COLLABORATION.md` | `AI-COLLABORATION (1).md` | 733 | `7A2C84CDD108B36D494E7D7108D727FC273043066FF47A50FBB9F07DE66BCD92` |
| `BLUE-HELM-MASTER-STATUS.md` | `BLUE-HELM-MASTER-STATUS.md` | 44,440 | `747E8D6A170FBC74544822835B7C0CD160963EC04118C960BF25EF8BE8AA5D16` |
| `BLUE-HELM-CHAT-HANDOFF-4.md` | `BLUE-HELM-CHAT-HANDOFF-4.md` | 7,717 | `3411A19923D4FF1E9ECCA16CD4968689001342119D789DA3DA46AB8B772315FF` |
| `files-2.zip` | `files(2).zip` | 17,856 | `DF53359F5DFC0AB30119BF655B673190952CAF1DA875BFF66F6716FDE72BB908` |
| `files-1.zip` | `files(1).zip` | 44,393 | `4DE5F1EB84276534457E96FDA044B490D7CA5DBDA0448AEB7EC7801A3A4CA127` |
| `BLUE-HELM-ADDITIONS-AND-OPPORTUNITIES.docx` | same | 14,023 | `85F1FAF17CE0DE56822456632B4DB17CBEAFA722B888BDB908DA926017DE6273` |
| `BLUE-HELM-PROGRESS-MAP-7-1-2026.docx` | same | 18,189 | `EF1F92237F2B5E373D8423F5E4B3F09C28471E033CFA035E8121A60E9015C78B` |
| `BLUE-HELM-EXECUTION-CHECKLIST.md` | same | 8,913 | `796361977F0DE87D327A15D4B47A063E7B54B1146041E651A74F21B663E06642` |
| `CLAUDE.md` | `CLAUDE (2).md` | 5,411 | `BE93A55AF95F3044E1682945466F448C511875EB03C94A1B837F196F0121BB68` |

The supplied `CLAUDE (2).md` was byte-identical to the repository's `CLAUDE.md`
before this synchronization branch updated the operational control-plane links.
The supplied AI collaboration file had the same substantive content as the
file subsequently pulled from GitHub, with line-ending differences.

## Expanded archive contents

`expanded/files-1/` contains:

- `BLUE-HELM-CHAT-HANDOFF-2.md`
- `BLUE-HELM-MASTER-STATUS.md`
- `BLUE-HELM-VIDEO-SCOUT.md`
- `BLUE-HELM-READ-FENCE-TEST-BRIEF.md`
- `BLUE-HELM-PROGRESS-SUMMARY.md`

`expanded/files-2/` contains:

- `BLUE-HELM-CHAT-HANDOFF-3.md`
- `BLUE-HELM-MASTER-STATUS.md`

All ZIP entry names were inspected before extraction. They contained only the
listed Markdown files and no traversal paths or executable content.

## Word-document inspection note

Both DOCX files were structurally extracted and read during the recovery pass.
Visual rendering could not be completed because LibreOffice/`soffice` is not
installed in the available Windows environment. Do not interpret this archive
as a visual-layout QA pass for the Word files.
