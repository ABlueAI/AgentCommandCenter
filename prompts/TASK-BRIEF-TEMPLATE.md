# Task Brief Template

> The single biggest quality lever is the brief. Treat it like a brief to a contractor,
> not a one-liner. Fill this in, paste it to the agent, and let it plan before it codes.
> Copy this file per task (or keep it open and adapt it).

---

## 1. Goal (one sentence)
What does "done" look like, in plain language?

## 2. Context / where to look
- Repo / directory: `@<path-or-repo>`
- Related files or prior art: `@<file>` …
- Reference implementation that did this well (if any): `<project/path>`

## 3. Constraints & conventions
- Stack / libraries to use (or avoid):
- Patterns to follow (point at an existing example):
- Out of scope (explicitly): 

## 4. Difficulty & agent plan
- Difficulty (1–10):
- 1–2  → one agent, no plan, just go.
- 3–6  → one agent, **plan first**; maybe a couple of sub-agents to read the codebase.
- 7–10 → **plan first**, multiple sub-agents, break into phases.
- Mode for this task: `[ ] just build   [ ] plan first`

## 5. Acceptance criteria (the test gate)
- [ ] Behavior: …
- [ ] Tests added/updated and passing: …
- [ ] No changes outside the stated scope
- [ ] Diff reviewed by me before merge

## 6. Model routing
- Implementation: Claude Sonnet
- Deep reasoning / architecture / tricky bug: Claude Opus
- Second-opinion review: Codex (if available)

---

### Example (filled in)
**Goal:** Add a search bar to the models page so users can filter models by name.
**Context:** `@bridgebench-ui` — the page is `src/pages/Models.tsx`; follow the input
styling already used in `src/components/SearchInput.tsx`.
**Constraints:** Client-side filter only; no backend changes. Out of scope: pagination.
**Difficulty:** 2 → one agent, just build.
**Acceptance:** Typing filters the list live; existing tests pass; a test covers the filter.
**Routing:** Sonnet to implement; I review the diff before merge.
