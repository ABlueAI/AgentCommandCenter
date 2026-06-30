# Agent Roles (Blue Helm)

The five **roles** the command center launches agents with. A *role* is a reusable
**access + behavior profile** applied at launch; a *task brief* is the specific mission.
Role underneath, brief on top, per-task routing on the side.

This folder is the **canonical, version-controlled source**. Deploy it with
[`../scripts/sync-roles.ps1`](../scripts/sync-roles.ps1), which copies the roles into
`~/.claude/agents/` (user scope) so they're discoverable in **every** project the command
center drives — not just this repo.

## The five roles

| Role | Model | effort | Tools | Read-only? | Color | Runs on |
|---|---|---|---|---|---|---|
| `builder` | sonnet (Opus override for hard tasks) | medium | Read, Edit, Write, Grep, Glob, Bash | No | orange | Claude |
| `reviewer` | opus | high | Read, Grep, Glob | **Yes** | green | Claude (ideally a different model than built the code) |
| `codebase-scout` | sonnet | low | Read, Grep, Glob | **Yes** | cyan | Claude |
| `web-scout` | sonnet | medium | WebSearch, WebFetch, Read, Write | Repo: yes | cyan | Claude (text) / **Gemini (video)** |
| `operator` | sonnet | medium | Read, WebSearch, WebFetch, Write | Repo: yes | purple | Claude |

## The read-only guarantee (what makes a role real)

The hard constraint is the **`tools` allowlist, not the prompt**. `reviewer` and
`codebase-scout` get `Read, Grep, Glob` only — with no Write, Edit, or Bash, they
**cannot** modify files or run commands no matter what any prompt (or prompt injection)
says. That constraint is what makes their output trustworthy.

Consequence: the Reviewer has no shell, so it **cannot run `git diff` itself** — the
launcher provides the diff (`git diff main...<branch>`) as its opening input.

## Identity vs. routing (the launch model)

- **Frontmatter = stable identity:** `name`, `description`, `tools`, `model`/`effort`
  defaults, `permissionMode`, `color`, and the system prompt (the file body).
- **Launch flags = per-spawn routing:** the launcher overlays `--model` / `--effort` /
  `--permission-mode` per task. The builder's *"Opus override for difficulty-7+"* is the
  launcher passing `--model claude-opus-4-8` at spawn — one `builder.md`, dialed up when
  the task warrants it.

Launch a role as a top-level session in a worktree:

```powershell
claude --agent builder        # read-write roles get a fresh worktree first
claude --agent reviewer        # read-only roles skip worktree creation; point at a branch
```

## Verified against Claude Code 2.1.195

- **`effort`** accepts `low | medium | high | xhigh | max` (availability is model-dependent).
- **`model`** accepts `sonnet`/`opus`/`haiku`/`fable`, a full ID like `claude-opus-4-8`, or
  `inherit` (default). Use a full ID to pin a version against drift.
- **`color`** is a fixed set: `red, blue, green, yellow, purple, orange, pink, cyan`. The
  hex shades in the build spec are the app's pane-badge layer, separate from this CLI color.
- **Plugin caveat:** if these are ever packaged as a *plugin*, `permissionMode`, `hooks`,
  and `mcpServers` frontmatter are ignored. As project/user-scope files (the path here),
  they work normally.

## Write-fencing (web-scout / operator)

These two roles have the `Write` tool, which the allowlist can't scope to a directory. So
they carry a **PreToolUse hook** (`scripts/hooks/fence-write.js`) that **hard-denies any
Write/Edit outside the session cwd**. The launcher runs them in a dedicated sandbox
(`<projectsRoot>/.command-center/outputs/<role>-<timestamp>`), so they cannot touch any
repo no matter what their prompt says. The hook deploys to `~/.claude/hooks/` and its
absolute path is injected in place of the `__CC_HOOK__` placeholder by `sync-roles.ps1` —
so **these roles only enforce after a `sync-roles.ps1` run** (don't hand-copy the .md).

## Open items (still to verify when building)

- Precedence when both frontmatter `effort` and a launch-time `--effort` flag are set
  (test before relying on launch-time override for the builder's hard-task dial-up).
- Live-confirm the fence fires when launched via `claude --agent web-scout` (frontmatter
  hooks are documented to apply; verify once by asking it to write outside the sandbox).
- Optional: extend the same fence to keep the **builder** inside its worktree.

> The human merge gate is sacred: no role auto-merges to `main`, ever. Never run a role in
> bypass-permissions mode against anything that can reach production.
