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

## The env scrub and explicit tool sets (S31)

Every Claude pane runs with `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` (AGENTS.md "Security rules"). With
it set, Claude Code prints "Permission mode forced to default - CLAUDE_CODE_SUBPROCESS_ENV_SCRUB is set
... Declare allowedTools explicitly" and opens every pane in default mode, whatever `--permission-mode`
says (seen on Blue's PC with Claude Code 2.1.316, checklist step 40). `--allowedTools` is still
honored, so each level also passes an explicit set of tools that run without asking; anything else
still asks. The scrub stays on; turning it off is Blue's call. The sets live in
`app/authority-level.js` (`ALLOWED_TOOLS`, `DISALLOWED_TOOLS`):

| Level | Runs without asking | Denied |
|---|---|---|
| Minimum | `Read`, `Glob`, `Grep`, `TodoWrite` | `Edit`, `Write`, `NotebookEdit` |
| Medium | Minimum's, plus `Edit`, `Write`, `NotebookEdit` | nothing extra; every command still asks |
| High | Medium's, plus `git status`, `diff`, `log`, `show`, `branch`, `switch`, `fetch`, `add`, `commit` | nothing extra; anything else (including `git push` and `npm test`) still asks |

- **Minimum** can't use the edit tools at all. Shell commands still ask, and one you approve can change
  files. Plan mode works the same way (Claude Code's docs: in plan mode other shell commands go through
  the regular permission flow), so say no to a command at Minimum unless it only reads.
- **High** doesn't allow `npm test` or `npm ci` without asking: the agent can edit `package.json` or
  the lockfile without asking, and those commands would then run whatever it wrote. Writes to `.git`
  and `.claude` are Claude Code protected paths and still ask, so the git commands can't be turned
  into a way to run unasked code.
- Claude Code's built-in read-only commands (`ls`, `cat`, read-only `git`, and others) run without
  asking at every level, as they always did.

The command is `claude [--agent <role>] --allowedTools '<set>' [--disallowedTools '<set>']
--permission-mode <mode> ["<opening prompt>"]`: the lists come before the mode because they take
several values and would otherwise swallow the opening prompt. `--permission-mode` is still passed, so
the level's mode applies again if the scrub ever stops forcing default. High no longer gets `auto`'s
classifier while the scrub forces default; its fixed list is the stand-in.

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
- **Fenced roles** (web-scout, operator, source-scout, page-reader) keep the launch they had: their fence (tool
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
