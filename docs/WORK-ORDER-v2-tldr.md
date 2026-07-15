# Work Order — V2: Section TL;DRs in Video Scout Reports

## 1. Goal

Make every Video Scout report easier to scan: retain the existing report-leading
`## 1. TL;DR` block and require one concise, evidence-grounded TL;DR line at
the start of every subsequent substantive report section.

## 2. Gate tier and blast radius

**Tier: Standard-class.** One-invariant branch; one Reviewer pass scoped to the
named prompt/template and prompt-test hunks; then merge.

**Blast radius:** report formatting instructions only. This work does not touch
security boundaries, credentials, destructive operations, launch routing,
analysis mode, model selection, media resolution, or cost-direction guards.

## 3. Context / where to look

- Prompt template: `prompts/video-scout-analysis.md`
- Loader: `scripts/lib/get-video-scout-prompt.ps1` (do not change unless a
  demonstrated test need requires it)
- Existing prompt tests: `scripts/lib/get-video-scout-prompt.Tests.ps1`
- Current control-plane status: `BLUE-HELM-MASTER-STATUS.md`

## 4. Required change

The prompt already starts with `## 1. TL;DR`; preserve that leading block and
its evidence discipline. Add an explicit instruction to every substantive
section after it — Sections 2 through 9 — requiring a single first line in
this exact shape:

`**Section TL;DR:** <one concise, evidence-grounded sentence>`

The line summarizes that section only. It must not invent facts, hide
uncertainty, replace the detailed body, or omit timestamps/qualifiers required
elsewhere by the template. The existing exact report order and all existing
section headers remain unchanged.

## 5. Constraints / out of scope

- Prompt-template and focused prompt-test changes only.
- No app, Electron, IPC, PTY, manifest, backfill, Gemini SDK/CLI, model,
  routing, duration-guard, credential, or dependency changes.
- Do not alter the forensic evidence, confidence, timestamp, verbatim-capture,
  conflict, sampling, quick-pass, or follow-up rules.
- Do not pay for a live Gemini run solely to test formatting; this is a
  deterministic template/test task. Observe the format on the next ordinary
  Video Scout run after merge.
- Keep the diff small. If implementation expands beyond the template and its
  focused assertions, stop and report why before continuing.

## 6. Difficulty and routing

- Difficulty: **2/10**
- Implementation: Claude Sonnet
- Mode: plan briefly, then build
- Reviewer: one read-only Standard-class pass restricted to the prompt/template
  hunk and prompt-test hunk

## 7. Acceptance criteria

- [ ] `## 1. TL;DR` remains the report-leading section.
- [ ] Sections 2–9 each explicitly require a one-line `**Section TL;DR:**` as
      their first content line.
- [ ] Existing section headers/order and forensic constraints are preserved.
- [ ] Focused Pester assertions prove the prompt contains the report-leading
      TL;DR instruction and all eight section-level instructions.
- [ ] `powershell -NoProfile -ExecutionPolicy Bypass -File
      scripts\run-pester.ps1` passes.
- [ ] No changes outside the declared scope.
- [ ] Pin a three-dot diff and obtain one scoped Reviewer verdict before merge.

## 8. Builder handoff

Work only on a fresh one-invariant feature branch from current `main`. Do not
merge or push. Report the brief plan, changed files, exact test result, branch
tip SHA, and pinned diff path for the Reviewer gate.
