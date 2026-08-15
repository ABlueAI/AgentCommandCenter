# Project: Agent Command Center

## What this project is
A self-hosted, multi-agent coding command center built on tools I already own —
Claude Code and Codex in separate git worktrees, with an optional visual board
layer (Vibe Kanban). The goal is to mirror the *workflow* of a
parallel-agent "vibe coding" setup — multiple agents working in parallel, planned and
reviewed by me — WITHOUT paying for or routing through any third-party agent platform.

This repo IS that command center: it holds the conventions (this file), the worktree
helper scripts, the task-brief template, and the setup docs. It is the home base from
which I spin up parallel agents against *other* project repos on my machine.

I am deliberately NOT using a paid agent platform (e.g., BridgeMind). Reasons: it would
be a separate recurring bill on top of my existing Codex/OpenAI costs; the model calls
would run on their resold credit pool rather than my own plan; it's beta software built
entirely by autonomous agents; and it would need broad access to my repos, API keys, and
payment setup. Owning the stack is cheaper, fully portable, and safer.

## Environment
- OS: Windows (primary). Default to Windows-native (PowerShell). If path/shell friction
  appears, fall back to WSL2. Flag clearly when a step is failing specifically because of
  a Windows-vs-Unix path or shell difference — that's a known failure mode for agent
  tooling and worth naming explicitly rather than guessing around.
- ChatGPT desktop is installed and connected to this local repository.
- Claude Code is the primary coding tool and is connected to GitHub.
- Codex desktop/CLI is an active secondary builder and independent verifier for
  bounded work assigned by Blue; it never shares Claude Code's worktree.
- Helper scripts live in `scripts/` (PowerShell `.ps1` + bash `.sh` equivalents).

## Repository layout
- `AGENTS.md` — this brief; Codex reads it at the start of every session.
- `README.md` — quick start.
- `docs/SETUP-WINDOWS.md` — the full 6-phase setup, step by step.
- `docs/WORKTREE-CHEATSHEET.md` — worktree mental model + the commands I actually use.
- `scripts/` — `new-agent`, `list-agents`, `remove-agent` (one agent = one worktree+branch).
- `prompts/TASK-BRIEF-TEMPLATE.md` — the contractor-grade brief I fill in per task.

## Operational control plane

Open these before project-state or handoff work:

- `docs/AI-COLLABORATION.md` — Human, Claude Code, ChatGPT, and Codex boundaries.
- `docs/BUILDER-HANDOFF-TEMPLATE.md` — required branch handoff record.
- `BLUE-HELM-MASTER-STATUS.md` — current ordered roadmap and risk register.
- The highest-numbered `BLUE-HELM-CHAT-HANDOFF-*.md` — latest platform handoff.

Durable rules: use a feature branch for every change and keep `main` merge-only;
one invariant per branch; read Reviewer verdicts verbatim; use three-dot diffs
before merge; record the pre-merge `main` SHA so the reviewed delta can be
reproduced after merge; create pinned `.agent-review-*.diff` files with
`git diff --output`, never PowerShell `>`; fully restart Electron after
renderer or main-process changes; make failures refuse visibly; and never put
provider credentials in Windows user environment variables with `setx`.

## OSS-FIRST PROCUREMENT GATE — HARD INVARIANT

Before specifying, prototyping, or implementing any new subsystem:

1. Run a Source-Scout evaluation of maintained OSS projects, official SDKs, and reusable libraries.
2. Record the candidates evaluated with, for each: license, maintenance, telemetry/network behavior, security surface, Windows support, and estimated adoption-versus-build effort.
3. Obtain one explicit Blue verdict: **ADOPT, FORK, PROTOTYPE, PATTERN-MINE, or BUILD FRESH**. These five are the only final subsystem verdicts. Candidate disposition is a separate, lower level: an individual candidate may be accepted or **rejected** while the evaluation is being built, and `REJECT` is never a final subsystem verdict. Rejecting every candidate yields the documented search evidence that may support **BUILD FRESH**; it does not by itself produce a verdict.
4. If Blue named an OSS base or structure, treat ADOPT/FORK as the default interpretation. Never silently narrow it to PATTERN-MINE.
5. PATTERN-MINE does not authorize rebuilding the subsystem. A separate Blue decision must authorize build-fresh work.
6. Record the verdict verbatim in a **tracked OSS procurement decision record**: a committed Markdown file under `docs/`, named for the subsystem, holding the candidates evaluated, the item-2 evidence, and Blue's verdict line quoted verbatim. It must be a tracked repository file — not a chat message, a memory entry, or an untracked local note.
7. Restate that verbatim verdict, and identify the record by path, in every work order and handoff concerning the subsystem.
8. Any later deviation must stop visibly and request approval before code is written.
9. “No suitable OSS exists” requires documented search evidence; it cannot be inferred from model memory.
10. **Blue must refuse merge authorization for a new subsystem branch whose work order and handoff do not identify the tracked OSS procurement record and quote the verdict verbatim.** `scripts/merge-gate.ps1` does **not** parse procurement-record prose and does **not** mechanically enforce this policy. It accepts a plan-declared `handoffDoc` path and validates that document's handoff-tail commit shape and regular-blob identity, alongside plan-declared SHAs, ancestry, clean state, the pinned diff, the predicted merge tree, and the declared gates — but it never inspects work-order text, handoff prose, procurement-record contents, or verdicts. Automated enforcement would require its own separately reviewed implementation branch. **Until that exists, this gate is enforced by human review and authorization; describing it as automatic would be false.**

## How I work (conventions — follow these)
1. Spec before code. When I describe a feature, first restate the intent and produce a
   short structured PLAN. Do not start editing files until the plan is agreed.
2. Review before merge — always. Every change is reviewed by me (the human) via the diff
   before it merges. Never auto-merge. Non-negotiable for anything touching auth,
   payments, or customer/user data.
3. Tests are a gate. Add or update tests for new functionality, run the suite, and fix
   failures before treating work as shippable.
4. One goal at a time. Work the current task to a clean stopping point before starting
   the next. Surface a clear checkpoint when done.
5. Isolate parallel work in git worktrees. Each parallel agent/task gets its own worktree
   and branch so concurrent work never collides. Don't commit in a way that steps on
   another running agent.
6. Distinguish facts from inferences. When you make an assumption, say so, and flag the
   load-bearing one if a decision depends on it.
7. Flag security risks proactively — flawed logic, injection surfaces, secrets in code,
   risky permissions — with the reason and a concrete mitigation.
8. Provider credentials must NOT be persisted as Windows user env vars (`setx`). Every
   Claude Code agent PTY is launched with `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` (set in
   `app/main.js` → `pty-start`). Without it, Bash tool calls, PreToolUse/PostToolUse hook
   scripts, and MCP servers inherit the full PTY env by default, making any credential in
   `process.env` readable inside a Bash step. Use the in-app key setup UI instead —
   credentials are encrypted via Electron safeStorage and injected only into the PTYs that
   need them. If a key was previously set via `setx`, remove it from the Windows user
   environment: System Properties → Environment Variables → User variables → delete the
   entry (or: `[Environment]::SetEnvironmentVariable('KEY_NAME', $null, 'User')`).

## Model routing (which agent does what)
- ChatGPT desktop with GPT-5.6 handles most planning, architecture, research,
  review, and project-state maintenance.
- Claude Code is a primary builder: Sonnet for fast implementation and Opus for
  deep review, architecture, and tricky bugs.
- Codex desktop/CLI is an active secondary builder and verifier. During the
  four-day 1.0 release push, Blue deliberately spreads bounded work between
  Claude and Codex to stay inside provider usage limits; this is a scheduling
  constraint, not a lower quality bar. Codex never shares Claude Code's
  worktree, and a reviewed tip that is rebased must be reviewed again.
- I (human) stay the router and the final reviewer.

## Explicitly OUT OF SCOPE for now (deferred, with guardrails)
- Autonomous self-healing loops (e.g., production error -> auto-PR -> auto-merge).
- Full observability wiring (Sentry, PostHog).
These come later. Even then, a human merge gate stays on anything touching auth,
payments, or data. Do not build or enable autonomous merge loops unless I explicitly ask
and approve the guardrails first.

## Context learned (why the setup looks like this)
I studied a parallel-agent "vibe coding" livestream to extract the workflow. The useful,
portable patterns: intent/voice-driven prompting, a goals board worked one item at a
time, plan-before-code with sub-agent review, screenshots-as-context for bugs,
multi-model routing, parallel agents in isolated worktrees, and tests-as-a-gate. The
risky part I am NOT copying is fully autonomous merge loops with a single reviewer. This
project adopts the discipline, not the autonomy.
