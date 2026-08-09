# Builder Handoff — Pane-Status OSS Procurement Evaluation

Branch: `feature/pane-status-source-scout`
Worktree: `.worktrees/pane-status-source-scout`
Fork-point SHA: `7a102a2498cb48fdc168e20503741509c5daefd3`
Pre-merge main SHA: `7a102a2498cb48fdc168e20503741509c5daefd3`
Documentation reviewed tip: see § 8
Branch tip: see § 8
Merge commit SHA: Pending until merge

**Status: SOURCE-SCOUT EVALUATION COMPLETE — NO BLUE VERDICT EXISTS; IMPLEMENTATION REMAINS
UNAUTHORIZED**

## 1. Intended invariant

> Produce a primary-source-backed OSS procurement evaluation for cross-provider pane-status detection
> without changing, specifying, prototyping, or implementing the production subsystem.

Documentation-only, Standard-class. No runtime behaviour changed, because no runtime file changed.

## 2. Procurement record and authorization state

Tracked record created by this branch: **`docs/OSS-PROCUREMENT-pane-status.md`**.

There is **no Blue subsystem verdict to quote**, so none is quoted. The record carries the required
authorization-state placeholder verbatim:

> BLUE SUBSYSTEM VERDICT: NOT YET ISSUED — IMPLEMENTATION REMAINS UNAUTHORIZED

That is an authorization-state statement, not a sixth verdict term. The five allowed final subsystem
verdicts remain **ADOPT · FORK · PROTOTYPE · PATTERN-MINE · BUILD FRESH**. `REJECT` appears nowhere as a
final verdict; it is used only at the candidate-disposition level, which `AGENTS.md` defines as a
separate, lower level.

The binding state quoted from `BLUE-HELM-MASTER-STATUS.md`, verbatim:

> Cross-provider pane-status indicators still have no Blue verdict, so that separate subsystem remains
> unauthorized for specification or implementation.

**The Dockview ADOPT verdict was not reused.** `docs/OSS-PROCUREMENT-dockview.md` states the boundary
itself — "keep pane-status indicators separate" — and one record cannot cover two subsystems.

## 3. Files changed

Exactly two, both new, both Markdown:

| Path | Change |
| --- | --- |
| `docs/OSS-PROCUREMENT-pane-status.md` | **Added** — the tracked procurement record (12 required sections) |
| `docs/BUILDER-HANDOFF-pane-status-source-scout.md` | **Added** — this handoff |

`BLUE-HELM-MASTER-STATUS.md` was **deliberately not edited**, per the work order: the roadmap already
records the pending gate, and no verdict exists to record. No application code, test, dependency,
lockfile, script, GitHub configuration, `AGENTS.md`, or unrelated document was touched.

`codex/release-1.0-auth-backup-blockers` was not read, referenced, or incorporated.

## 4. Security-sensitive surfaces touched

**None changed.** The evaluation *analysed* several, and the analysis is the deliverable:

* provider hook systems as a code-execution surface (§ 6.A1/A2/A4, § 8 threats 2 and 4);
* hook payloads as a conversation-content disclosure surface (§ 8 threat 4);
* in-band terminal sequences as a forgeable-input surface (§ 8 threat 1);
* pane-identity binding across Dockview moves (§ 8 threat 10).

No credential was entered, no provider login performed, no package installed, no paid model run made.

## 5. Method and evidence discipline

Every claim in the record is tagged **[FACT]**, **[INFERENCE]**, or **[RECOMMENDATION]**. Primary
sources with URLs and retrieval dates are listed in § 4 of the record.

The step that produced the most decision-relevant findings was **verifying documentation against the
software actually installed on this machine**, rather than trusting docs that describe current `main`
branches:

| Check | Result |
| --- | --- |
| `claude --version` | `2.1.220 (Claude Code)` — now a native `C:\Users\levij\.local\bin\claude.exe`, no longer the npm `.ps1` shim |
| `codex --version` | `codex-cli 0.142.3` |
| `gemini --version` | `0.49.0` |
| Gemini bundle token scan | Hooks **present** in the installed 0.49.0 (`hook_event_name` ×27, `BeforeTool` ×144, `AfterAgent` ×67) |
| Codex binary string scan | Hooks and `notify` **present** (`hooks.json` ×6, `hook_event_name` ×25, `bypass_hook_trust` ×14, `agent-turn-complete` ×1) |
| Codex `SessionEnd` | **0 occurrences** while `SessionStart` = 45 — documented event absent from the installed version |
| `OSC 9;4` emission | **Claude only**: `claude.exe` `terminalProgressBarEnabled` ×21, `9;4` ×6; Codex **0**; Gemini **0** |
| `Get-Command wmic.exe` | **Not present** on this Windows 11 build — decisive for `ps-tree`, and it forces `pidtree` onto its PowerShell path |

Method caveat recorded in the record itself: string presence in a 308 MB binary is strong evidence for
distinctive tokens and weak evidence for common words. Counts for generic tokens (`Stop`,
`Notification`) are explicitly **not** cited as proof of event names.

## 6. Findings a reviewer should check first

1. **§ 7.5 — installed-version drift.** Codex's documented `SessionEnd` is absent from the installed
   0.142.3 binary. This is the strongest argument in the record that the subsystem needs per-provider
   capability detection and a visible *unknown* state, because a hook that never fires produces no
   error — it produces a pane that silently stops updating.
2. **§ 7.1 — providers are not equivalent.** Only Claude Code distinguishes *awaiting input* from
   *finished* (`Notification` matchers `idle_prompt` / `permission_prompt` versus `Stop`, plus a
   separate `StopFailure`). Codex and Gemini express tool-approval only. Generic PowerShell panes
   express nothing about intent. Any cross-provider indicator will be honest but **asymmetric**.
3. **§ 8.1 — the constraint set.** Threats 1+2 rule out in-band signalling as authoritative; 4+9 rule
   out handing a reporter conversation content; 5+6 rule out treating one turn-end event as "finished".
   Two unrelated OSS projects (`wmux`, `tmux-agent-status`) independently converged on the same
   decomposition, which is corroboration rather than proof.
4. **§ 6.B3 — the one genuinely off-the-shelf component.** Installed Claude Code emits `OSC 9;4`; the
   official MIT `@xterm/addon-progress` parses exactly that, with state 3 = indeterminate. Verified
   absent from Codex and Gemini, so it is a Claude-only signal.
5. **§ 6.E — no third-party project is adoptable.** `claude-squad` is AGPL-3.0; `amux` is
   NOASSERTION/Commons Clause; `tmux-agent-status` has **no licence file** despite an open-source-looking
   README; `wmux` (MIT, Windows-native, closest architectural match) is a competing application, not a
   library.
6. **Two corrections made to sweep findings**, recorded in § 6.E so they are not carried forward wrongly:
   `anthropics/claude-code` issues **#56936** (Windows 11 Notification hook) and **#8320** (60-second
   idle notification) are **CLOSED**, not open. They are retained as *historical* Windows-specific
   reliability defects in the exact mechanism this subsystem would rely on.

## 7. Known limitations of this evaluation

* **No behavioural verification of any signal.** No hook was installed and no CLI was run beyond
  `--version`, so every event claim rests on documentation plus offline binary inspection. Whether
  Claude Code's `Notification` hook actually fires on Blue's machine is **unverified**, and issue
  #56936 is precisely why that matters.
* **Binary string inspection is presence evidence, not semantic proof.** It establishes that a token
  ships in the installed build; it does not prove the surrounding behaviour.
* **Codex's hooks are not documented in the `openai/codex` repository `docs/` tree** (verified via the
  GitHub contents API — no `hooks.md`). The event list came from `learn.chatgpt.com/docs/hooks.md`,
  which is OpenAI's own documentation site, cross-checked against the installed binary.
* **One single-source claim was deliberately excluded**: a third-party assertion that Claude Code emits
  `OSC 133` at turn boundaries could not be corroborated against Anthropic documentation, so the record
  does not rely on it. The `OSC 9;4` finding replaced it and is machine-verified.
* **`wmux` was assessed from metadata and description only**, not by reading its source. If Blue wants
  its per-provider adapter design mined, that is a separate authorized task.
* Gemini's `notification_type` values beyond `"ToolPermission"` are not documented; the record says so
  rather than guessing.

## 8. Commands run and review artifact

Commands: `git worktree add`, `git status`, `git diff --check`, `git add`, `git commit`,
`git diff --output`; `gh api` for repository metadata; `npm view <pkg> --json` for registry metadata;
`claude/codex/gemini --version`; offline `rg -a` / PowerShell string scans of already-installed files.

No test suite was run: this branch changes no code, so the app and Pester gates are unaffected and
would prove nothing about it. The tracked-file change set is two new Markdown documents.

| Field | Value |
| --- | --- |
| Reviewed base | `7a102a2498cb48fdc168e20503741509c5daefd3` |
| Documentation reviewed tip | recorded in the handoff-only tail commit below |
| Branch tip | the handoff-only tail commit below |
| Exact review range | `7a102a2498cb48fdc168e20503741509c5daefd3...<documentation reviewed tip>` |
| Pinned artifact | `.agent-review-pane-status-source-scout.diff` |
| Changed paths | `docs/OSS-PROCUREMENT-pane-status.md` (added), `docs/BUILDER-HANDOFF-pane-status-source-scout.md` (added) |
| Insertions / deletions | recorded in the tail commit |
| Artifact size | recorded in the tail commit |
| Artifact SHA-256 | recorded in the tail commit |
| `git diff --check` | clean |

These values are deliberately left unfilled in the reviewed commit, because the artifact is generated
*from* that commit and cannot be known before it exists. The tail commit below fills them in and
modifies only this document.

The artifact was created with `git diff --output` (never PowerShell redirection), remains gitignored
local review evidence, and was independently regenerated from the stated range — matching the pinned
file in both exact byte count and SHA-256 identity. This handoff-only tail commit is excluded from the
range, and it modifies only this document.

## 9. Reviewer verdict

Reviewer verdict: **none yet — stopped for a fresh independent Standard-class review.**

Reviewer verdict source: n/a.

## Review-diff rule

- Before merge, use `git diff main...<tip>`.
- After merge, reproduce the reviewed delta with `git diff <recorded-pre-merge-main>...<tip>`.
- `git diff main...<tip>` may be empty after merge because the branch tip is already an ancestor of
  `main`.
- Always use `--output`; do not use PowerShell `>` for pinned review diffs.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it. A paraphrase or
  implied verdict is not a merge-gate verdict.

Pinned `.agent-review-*.diff` files are local review artifacts and must remain gitignored.

---

Not authorized and not started: pane-status specification, architecture commitment, dependency
installation, prototyping, implementation, merge, and push. The bounded experiment described in
§ 11.1 of the procurement record is **described only** and requires an explicit later `PROTOTYPE`
verdict from Blue before any part of it may be built.

**BLUE SUBSYSTEM VERDICT: NOT YET ISSUED — IMPLEMENTATION REMAINS UNAUTHORIZED**
