# Authority levels in Mako (S10)

Mako's terminal toolbar has an **Authority** selector. It sets the level every Claude pane you start
next launches at; panes already running keep theirs. The levels are the ones in AGENTS.md
"Authority levels", mapped to Claude Code's own `--permission-mode` flag:

| Level | Claude Code mode | What it means |
|---|---|---|
| Minimum | `plan` | Read, research and plan. No edits. |
| Medium (default) | `acceptEdits` | Edits are accepted; commands with side effects still ask. |
| High | `auto` | Multi-step work with few interruptions. |
| Maximum | none on this PC | The task goes to a cloud session: Mako opens claude.ai/code instead of a pane. |

Mako never launches `bypassPermissions` or `dontAsk`. Maximum is meant for sandboxes only (AGENTS.md),
so it never runs a Claude agent on Blue's PC.

## How it works

- The renderer sends only the level's name with `pty-start` (`app/renderer/authority-choice.js`).
- Main checks it right after it classifies the launch (`app/authority-level.js`, called from the
  pty-start authority's classify step in `app/main.js`). An unknown level, or Maximum for a Claude
  pane, is refused before anything else runs, with a visible reason in the Logs tab, and no process
  starts. The permission mode comes from a table in main; no renderer text reaches the command line.
- `buildAgentCommand` adds ` --permission-mode <mode>` to a role pane (`claude --agent <role> ...`,
  before any opening prompt) and to a plain `claude` pane.
- At Maximum, a Claude launch creates no pane and requests no PTY: Mako opens `https://claude.ai/code`
  through the existing open-external path (trusted sender, Quick Links URL policy, http(s) only).
  Start the task there. Mako doesn't pass the task text along.
- The level is remembered in the instance's settings (`authority`), so the stable and dev copies
  each keep their own. An unrecognised stored value falls back to Medium and says so in the Logs tab.

## Which panes it applies to

- **Applies:** unfenced Claude panes: builder, reviewer, codebase-scout, and a plain Claude pane.
- **Fenced roles** (web-scout, operator, source-scout) keep the launch they had: their fence (tool
  denials, the write-fence hook and the sandbox folder) is their authority, and plan mode would stop
  them writing their reports. The Logs tab shows `permission-mode=not-applied` for them. At Maximum
  they go to the cloud like every Claude launch.
- **Codex, Gemini, Video Scout and shell panes** have no Claude permission mode and launch as before
  at every level, including Maximum.

## Limits

- Setup a launch flow does before its pane (a worktree, a fenced role's sandbox folder, the
  reviewer's diff) still happens at Maximum; only the pane is skipped.
- The role files in agent-roles/ declare `permissionMode: default`. Whether Claude Code's
  `--permission-mode` flag wins over that frontmatter for `claude --agent <role>` is not verified
  here; BLUE-CHECKLIST.md step 40 checks it on a builder pane. If the frontmatter wins, a follow-up
  drops `permissionMode` from the unfenced role files (agent-roles/README.md already treats launch
  flags as an overlay on the frontmatter).
- Changing the level doesn't change panes that are already running. Inside a pane, Claude Code's own
  Shift+Tab still cycles modes; Mako doesn't block that.
- Whether `auto` is available on Blue's current plan is not verified here (BLUE-CHECKLIST.md step 40
  checks it).
