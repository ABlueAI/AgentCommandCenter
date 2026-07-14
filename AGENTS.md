# Project: Agent Command Center

## What this project is
A self-hosted, multi-agent coding command center built on tools I already own —
Codex + git worktrees, with an optional visual board layer (Vibe Kanban) and
an optional second model agent (Codex CLI). The goal is to mirror the *workflow* of a
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
- Codex CLI/IDE is optional and deferred as a second-opinion agent.
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
- Claude Code is the primary builder: Sonnet for fast implementation and Opus
  for deep review, architecture, and tricky bugs.
- Codex CLI/IDE is deferred. If enabled later, it is an independent verifier or
  fallback and never shares Claude Code's worktree.
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
