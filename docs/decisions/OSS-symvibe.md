# S47: Symvibe's three pieces

2026-11-25. Plan row S47 (docs/PLAN-1.1.md): a launch-crew preset, goal-stopping loops and branch
status per agent, from Symvibe, in the control room (docs/DESIGN-BRIEF-1.1.md 5.2). The row says
"OSS first: an OSS record with Blue's verdict before any code". agentplay is a design reference only.

Blue's verdict, word for word: none given. Verdicts: 🤖 builder's default (D-090), which Blue's merge
of PR #287 approves: launch-crew preset **BUILD FRESH** (pattern-mining Claude Squad's profiles),
goal-stopping loops **ADOPT** (the official mechanisms, a cap always set), branch status **BUILD
FRESH** on porcelain v2 (simple-git the fallback ADOPT). Settled under D-090 on 2026-11-26.

Research was done by a cloud session on 2026-11-25. Each fact is **verified** (V, from the linked
source, read that day) or **not verified** (NV, with how to check it). Some hosts were outside the
session's network (producthunt.com, developers.openai.com, git-scm.com), so facts from them are NV.

## Symvibe itself

A Mac app (macOS 14+, Apple Silicon) that runs Claude Code, Codex and other CLI agents on one
infinite board, with teams, voice and git status per repo (Product Hunt listing, slug
`hypervibe-2`; read from search snippets only, NV). No public repository, licence or source was
found, so it can't be adopted or forked: **closed source (NV)**. To check: open
<https://www.producthunt.com/products/hypervibe-2> and look for a source link.

agentplay: no URL found in the repo or by search (NV). Its role stays "design reference only"; the
build needs no link to it.

## Piece 1: launch-crew preset

One click starts a saved set of panes (for example builder, reviewer and scout), each with its role,
repo or worktree, model and effort.

| Option | Licence | Activity | Windows | Fit |
|---|---|---|---|---|
| [Claude Squad](https://github.com/smtg-ai/claude-squad) | AGPL-3.0 (V) | last commit 2026-11-13 (V) | needs tmux, no native Windows (V) | Go TUI; named program `profiles` in its config (V). AGPL: ideas only. |
| [Agent Deck](https://github.com/asheshgoplani/agent-deck) | MIT (V) | last commit 2026-11-23 (V) | WSL only (V) | Go and tmux; session groups (V). Its newest preset adds a China-origin tool (Kimi Code, V): never mined. |
| [Crystal](https://github.com/stravu/crystal) | MIT (V) | deprecated February 2026 (V) | NV | Dead; nothing to depend on. |
| [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) | Apache-2.0 (V) | README says it is sunsetting (V) | not stated | Rust and web; don't depend on it. |
| [hivemind](https://github.com/dip497/hivemind) | MIT (V) | last commit 2026-11-19 (V) | Windows installer (V) | Electron canvas, closest stack; no presets in its README (V). |

**Recommended: BUILD FRESH, pattern-mining Claude Squad's profiles.** A crew is a small JSON preset
that Mako's existing pane and worktree launcher expands into panes, with the same checks a hand-made
pane gets (authority level, role fence, admission budget). No candidate can be a dependency of a
Windows Electron app.

## Piece 2: goal-stopping loops

An agent keeps working until its stated done-condition is met, then stops, with an iteration cap.

| Option | Licence | Windows | Fit |
|---|---|---|---|
| [Claude Code Stop hooks](https://code.claude.com/docs/en/hooks) | product feature, official docs | yes | A Stop hook that returns `decision: "block"` with a `reason` keeps Claude working; `stop_hook_active` marks a continued turn (V). |
| [ralph-loop plugin](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/ralph-loop) (Anthropic) | Apache-2.0 (V) | bash script; on Windows needs Git Bash (V) | A completion promise matched as an exact string and `--max-iterations`; the default is unlimited (V). |
| [Codex CLI `/goal`](https://github.com/openai/codex/releases/tag/rust-v0.128.0) (OpenAI) | Apache-2.0 (V) | yes (V) | Added in rust-v0.128.0 (V): goals that persist, with pause, resume and clear. Whether it needs a feature flag is NV (check developers.openai.com/codex). |
| Claude Code `/loop` | built in | yes | Re-runs a prompt on an interval; it has no done-condition, so it doesn't fit. |

**Recommended: ADOPT the official mechanisms.** Claude panes get a Stop hook carrying the
done-condition and a required iteration cap, written in Node rather than bash so it runs on Windows,
with ralph-loop's state-file and promise idea pattern-mined (not its script vendored). Codex panes
use `/goal`. Mako shows the iteration count; the cap is never unlimited. Writing a hook into a pane's
settings touches `.claude/` and process control, both sensitive areas (AGENTS.md), so that PR gets
`security-reviewer` and a second review.

## Piece 3: branch status per agent

Each pane shows its worktree's branch, changed files and ahead/behind.

| Option | Licence | Fit |
|---|---|---|
| `git status --porcelain=v2 --branch` | git itself, called not linked | Header lines `# branch.head`, `# branch.upstream`, `# branch.ab +A -B` confirmed by a local run on git 2.43 (V). Mako already runs git from main (`git worktree list --porcelain`, app/main.js). |
| [simple-git](https://github.com/steveukx/git-js) | MIT (V) | 4.1.0, 2026-11-16 (V). Shells out to git; one more dependency for what a short parser does. |
| [isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) | MIT (V) | Pure JS; ahead/behind and linked worktrees aren't documented in its README (NV). Poor fit. |

**Recommended: BUILD FRESH on porcelain v2**, a small parser in main with fixture tests, polled per
worktree with a debounce. simple-git is the fallback ADOPT if Blue prefers a library.

## China-origin check

No option above is a China-origin model or hosted AI (V, from each project's README). Agent Deck's
Kimi Code preset is the one item never to mine.

## What this PR does not do

No code. The three pieces are built after this record merges, each covered by tests and checked on a
real pane (the row's "Done when").
