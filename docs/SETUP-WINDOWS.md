# Setup: Agent Command Center on Windows

A step-by-step build of a parallel-agent workflow using tools you already own. ~90 min
total, but each phase stands alone — you have a useful setup after Phase 2.

Prereqs: Git, Node.js 18+, and Claude Code installed and connected to GitHub.
Default shell is **PowerShell**; fall back to **WSL2** if you hit path/shell friction.

---

## Phase 0 — Turn this kit into its own repo (5 min)
This folder is your home base. Make it a real repo:

```powershell
cd path\to\agent-command-center
git init
git add .
git commit -m "Agent Command Center starter kit"
# Optional: create an empty repo on GitHub, then:
git remote add origin https://github.com/<you>/agent-command-center.git
git push -u origin main
```

`CLAUDE.md` here is read automatically by any Claude Code session started in this folder.

---

## Phase 1 — Understand git worktrees (10 min)
This is THE concept that makes parallel agents safe. See `docs/WORKTREE-CHEATSHEET.md`
for the full mental model. Try it on a throwaway repo first:

```powershell
cd path\to\your\repo
git worktree add ..\repo-agent1 -b agent1-task
git worktree add ..\repo-agent2 -b agent2-task
git worktree list
git worktree remove ..\repo-agent1   # cleanup later
```

Two sibling folders, each on its own branch, one shared history. That's the whole trick.

---

## Phase 2 — Manual parallel agents (15 min) — the $0 foundation
This is "multiple agents at once" at its core. No extra tools.

```powershell
# Window 1
..\agent-command-center\scripts\new-agent.ps1 -Task task-a
cd ..\<repo>-task-a
npm install   # each worktree has its own node_modules
claude

# Window 2 (new PowerShell tab)
..\agent-command-center\scripts\new-agent.ps1 -Task task-b
cd ..\<repo>-task-b
claude
```

Two independent Claude Code instances, each isolated to its own branch. Give each a small
task. When one finishes: review its diff, open a PR, merge on GitHub. **If you stopped
here you'd already have the core workflow.** Everything below is a nicer control surface.

---

## Phase 3 — Add the visual board: Vibe Kanban (20 min)
The closest free analog to a paid board: each card becomes an agent in its own worktree.

```powershell
npx vibe-kanban
```

Point it at your repo when prompted. Then:
1. Create a task card — paste a filled-in `prompts/TASK-BRIEF-TEMPLATE.md`. The brief is
   the single biggest quality lever.
2. Drag to **In Progress** → it spins up an agent in its own worktree automatically.
3. Review the diff in the board, send feedback to the running agent, merge when clean.

Bring-your-own-key: it uses your existing Claude Code (and Codex once added), no new model
bill. **Heads-up:** the company behind Vibe Kanban (Bloop) shut down in April 2026; it's
now community-maintained open source. Still free and works well — just don't make anything
mission-critical depend on it. Phase 2's manual flow is your dependency-free bedrock.

---

## Phase 4 — Drop in your project brief as CLAUDE.md (10 min)
Already done for *this* repo (`CLAUDE.md` in the root). For **each project repo** you run
agents against, add a `CLAUDE.md` describing *that* project + these conventions, so every
agent boots already knowing the project, your plan→review→test→human-merge discipline,
and what's out of scope. You stop re-explaining the project every session.

> Tip: copy the "How I work / Model routing / Out of scope" sections from this repo's
> `CLAUDE.md` into each project's `CLAUDE.md`, and rewrite only the "What this project is"
> part to match that project.

---

## Phase 5 — Optional: add a second model (Codex CLI) (15 min)
Route work across models — Claude for deep reasoning, Codex for a second opinion. Install
the Codex CLI, sign in with your OpenAI account, and Vibe Kanban can then assign some cards
to Codex instead of Claude (one agent builds, another reviews). Skip for day one — it's a
bolt-on, not a dependency.

---

## Phase 6 — One real run, end to end (10 min)
Prove the whole loop on something small and real:
1. Create a card/brief for a tiny, low-risk change (a copy tweak, a small helper, a test).
2. Let the agent build it in its worktree.
3. Make sure tests run and pass.
4. Review the diff yourself.
5. Merge the PR.

That round trip — **brief → agent builds in isolation → tests → your review → merge** — is
the entire engine. Everything fancier (more agents, more models, automation) is just
volume on top of this loop.

---

## Deliberately NOT doing yet (the real time sinks / risk)
- Autonomous "fix production error → auto-PR → auto-merge" loops.
- Full observability wiring (Sentry, PostHog).

Add them later, gradually, and keep a **human merge gate** on anything touching auth,
payments, or customer data. The setup above is complete and useful without them.
