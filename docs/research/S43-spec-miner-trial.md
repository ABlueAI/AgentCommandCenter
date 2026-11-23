# S43: spec-miner trial on the dockview layout

Written 2026-11-23 by the Claude cloud session that built S43 (PR #222). A one-off, read-only trial
before S66 (docs/PLAN-1.1.md row S43; docs/decisions/OSS-ecc.md lists `spec-miner` as this trial).
The raw output is in [S43-spec-miner-output-dockview-layout.md](S43-spec-miner-output-dockview-layout.md).

## What was run

- **Tool:** ECC's `agents/spec-miner.md` ([affaan-m/ECC](https://github.com/affaan-m/ECC), MIT), at
  the commit S39 pinned, `d2ef2680594f9a17526a6e1a2e18b3d242c5d17b` (v2.2.3). sha256 of the file:
  `a9270c2012e2dc979f153a481cdfdc7c5413e8774f579ada0319c00ea8903ba2`. It is a prompt (217 lines),
  not code: `model: opus`, tools `Read, Grep, Glob, Bash, Write`, and it writes OpenSpec files.
- **Scan first:** NVIDIA SkillSpector 2.12.0 (commit `c7958a3`), in a throwaway virtual environment,
  `--no-llm` only (its default model is China-origin; docs/DECISIONS.md). Result: risk 17/100,
  "SAFE", coverage complete, `llm_requested: false`. One finding, HIGH at confidence 0.7, "Hidden
  Instructions": the visible `<!-- deferred: ... -->` metadata comments the spec format documents.
  A false positive: the file's only non-ASCII characters are an em dash and an arrow, and it names no
  URL and no China-origin model.
- **Run:** headless Claude Code 2.1.330 in the cloud session, on an exported copy of `main` at
  `0f035e8`, with the agent's text as the system prompt and the tools cut to `Read, Grep, Glob` (no
  Bash, no Write; nothing installed into `.claude/`, no MCP, user settings only). The prompt picked
  the capability (the dockview layout) and asked for the spec as the final answer instead of a file.
  3.3 minutes, 23 tool calls (12 of them file reads), about $1.33 at API prices (plan usage here).
- **Check:** a separate Opus agent compared every block with the code at `0f035e8`, with file and
  line evidence; I re-checked its main claims by hand.

## What the spec covers

32 Requirements, 8 Invariants, 62 Scenarios, 670 lines. It covers the engine layer well: the
`--classic-layout` choice, fail-safe startup and pane adoption, `addPane` as a transaction, the panel
descriptor allowlist, docking before the PTY starts, the two close directions, the Library singleton,
the fit controller and resize ownership, maximize routing, Save / Restore / Reset / Clear, the
validated `fromJSON` with one rollback, the layout file store, the IPC trust gate, the schema
allowlist, pane-set comparison and the default arrangement.

**Accuracy:** 35 of 40 blocks accurate, 5 partly wrong, none wrong, none unverifiable. No reason
code, limit, regex or enforcing function was invented. The five over-generalise:

| Block | What the code does instead |
|---|---|
| Panel descriptor allowlist | Titles refuse only `\r \n \t \0`, not every control character (`dockview-panel-policy.js:70`) |
| Validated apply, "Extra panel" scenario | A missing pane gives `layout-apply-incomplete`; only an extra one gives `unexpected-panel-after-apply` |
| Dockview knows only id, kind and title | On Restore, titles come from the saved file (checked as safe, not derived from the ID) |
| Pane ownership survives mount transitions | `addPane`'s rollback also deletes ownership directly (`dockview-prototype.js:440`) |
| Refusals carry only closed reason codes | The trust gate and `app.js` add their own literal codes, and `addPane` logs name the pane ID |

## What it missed

It mined only what the layout code guarantees, and read no tests and none of the shell around the
dock. For S66 (three tabs, Ctrl K palette, Settings page, old layout behind a setting), these
matter more than anything it found, most important first:

1. **The engine choice is pinned as not a setting.** `main.js:184-190` reads `--classic-layout`
   once from argv; `dockview-default-path.test.js:152` fails if settings mention dockview. S66's
   "old layout behind a setting" must be a different switch (the tab shell), not the engine flag.
2. **Nothing is saved or restored at startup.** `dockview-app-integration.test.js:128` requires zero
   layout IPC calls; new panes get no position, so they land where dockview puts them.
3. **Navigation is four top-level tabs** (Agents, Terminals, Library, Logs: `index.html:117-260`,
   `switchTab` in `app.js:160-168`); with dockview active the Library tab lands on Terminals.
4. **Tests pin the markup:** 29 `<script src>` tags (`dockview-default-path.test.js:364`), the
   `#terminalDock` element, the toolbar order and no `position:fixed` in the dock CSS.
5. **The layout controls bar** (four buttons, labels and status text) is pinned by the integration
   test but described only by its element IDs.
6. **Keyboard:** xterm's key handler passes unhandled Ctrl chords to the PTY (`app.js:533`), so a
   Ctrl K palette must catch the key before xterm. The only app-level shortcut is Escape.
7. Smaller: two headers per docked pane (Mako's `.term-head` plus dockview's tab), the empty-state
   message hidden in the grid, pane IDs that only go up, a PTY exit that leaves the pane open, and the
   focused pane as the Dictate target.

**Fit with Mako's format:** two `id`s are reused (`app.startLayoutEngine` twice,
`dockview-prototype.activate` three times), one `enforced` names no real function
(`main.whenReady()`), the file is over its own 500-line limit, and no `test` anchors were possible:
Mako's plain node tests have no `TestClass.method` names. Mako does not use OpenSpec.

## Verdict: worth using again?

**Only as an occasional one-off, never installed.** It is fast, cheap and accurate on what it reads,
and the spec is a useful checklist of guarantees a rewrite must keep. But it answers "what does this
code promise", not "what does someone changing this need to know": it skipped the tests that pin the
behaviour and the UI shell around the module, which is where S66's risks are. Its upstream form also
needs `Bash` and `Write`, which Mako's read-only agent rule doesn't allow. Use it again only before a
rewrite that must keep a module's behaviour, scoped to include that module's tests and callers, with
its output checked by a second agent as here. Not worth adopting as a standing agent.

**For S66:** read the gap list above first, then use the raw spec as a regression checklist for the
engine layer, with the five corrections.
