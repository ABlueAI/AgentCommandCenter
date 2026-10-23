# S16: Composer research (includes the Dodaios trial)

2026-10-21, plan session S16 (PR #82). Research only: no Mako code changes. Blue's verdict, given
on 2026-10-21, is recorded below, word for word (BLUE-CHECKLIST.md step 19).

The **Composer** is one Mako pane that takes a large task, fans it out to several agents, and lets
Blue compose and split sessions from it (docs/PLAN-1.1.md, "S16 details"). Blue also wants it to be
"almost to be a person i can communicate with ... to run all of the agents and ... recieve updates
and get summaries from an inteligent role" (docs/DECISIONS.md, 2026-10-20).

## Blue's verdict (2026-10-21)

No option is adopted, rejected or scheduled. Every option below stays open for study, and the open
questions are deferred, to be answered as more OSS material is reviewed. The proposed verdicts and
the recommended direction below are the builder's proposals and input for that later work, not
decisions. Blue, in his own session on 2026-10-21 (his second message answered the builder's
offer to record "everything stays open for study, questions deferred" as his verdict; the builder
reads the opening "no" as rejecting merging without a recorded verdict, not that phrase; Blue
confirmed that reading on 2026-10-22: "Confirming the verdict, yes, true"):

- "bottom line, you wont be able to come up with the best answer for creating the composer, nor will i. it will come from a lot of input from a lot of OSS material and we will figure out the good and bad tidbits and find something i like. but for now i dont have all of the answers and that will need to be answered down the line"
- "no, this does not cover my conclusion. everything stays open for study, questions deferred"

## One-page summary

**Recommended direction (builder's proposal, not adopted; detail at the end):** build the Composer as a thin, Mako-owned layer on
top of Claude Code's own parallel-agent features, with Mako's existing voice; run a credentialed
Dodaios prototype (a later sandboxed session, not S16) before deciding whether to adopt Dodaios as the Composer's engine; and mine the
other tools for patterns.

| Option | What it is | Licence · upkeep · Windows | Proposed verdict |
|---|---|---|---|
| **Dodaios** (formerly Personal Jarvis) | Python "agent OS": coding-agent panes with call-signs, voice fan-out, a lead agent, persistent agents, background missions | Apache-2.0 (MIT up to 1.6.0) · 4.0.1 on 2026-10-20, one maintainer, very fast releases · Windows installer and docs | **PROTOTYPE, aimed at ADOPT** (keeps Blue's ADOPT/FORK default) |
| **Claude Code subagents, agent view, cross-session messaging** | Built into the Claude Code CLI Blue already runs | Anthropic product (no extra install or cost) · subagents and cross-session messaging work on native Windows; agent view (research preview) on Windows not verified | **ADOPT** as the Composer's building blocks |
| **Claude Code Agent Teams** | A lead session that spawns teammates, shared task list, mailbox | Experimental, off by default · split panes not supported in Windows Terminal | **PROTOTYPE** |
| **Claude desktop's linked sessions** (cross-session access) **and Claude Code Projects** | Desktop sessions that list and message each other; Projects: one conversation that starts and tracks parallel threads | Anthropic product · Projects is a public beta on Pro and Max, rolling out gradually | Linked sessions: **PATTERN-MINE** · Projects: **PROTOTYPE** |
| **Microsoft Conductor** | YAML multi-agent workflows with deterministic routing and human gates | MIT · 0.1.42 on 2026-10-06 · Windows install script | **PATTERN-MINE** |
| **parallel-code** | Electron app: tasks in parallel worktrees, diff review, phone access | MIT · active (2026-10-18) · macOS and Linux only | **PATTERN-MINE** |
| **crystal** | Was a multi-session Claude Code manager | MIT · deprecated February 2026, replaced by Nimbalyst | **PATTERN-MINE** (history only) |
| **Emdash** | Electron app: parallel agents in worktrees, issue intake, PRs | Apache-2.0 · active (2026-10-19) · Windows installer · PostHog telemetry on unless turned off | **PATTERN-MINE** |
| **Cloudroom** (core and GUI) | Agents on your Mac or a Linux box, "Teleport" between them | Apache-2.0 · active (2026-10-21) · **no Windows** (macOS, Linux alpha) | **PATTERN-MINE** |
| **Gumloop** | Closed, paid workflow-automation SaaS | Proprietary · no adoption without Blue's spending OK | **PATTERN-MINE** (UX template only) |
| **n8n** | Workflow automation, self-hosted or cloud | Sustainable Use License (source-available, not open source) · telemetry on by default | **PATTERN-MINE** |
| **Activepieces** | Open-source workflow automation; its integrations double as MCP servers | MIT (Community Edition) · active · Docker | **PROTOTYPE** (for the later workflow-automation session) |

**Model rule (requirement):** the Composer picks the model and effort for each task itself, prefers
Opus 5.5, and asks Blue only before Opus 5.5 at max effort. The Claude Code options, Conductor and
Dodaios's panes can set model and effort per agent; Dodaios's fan-out call can't (see "The model
rule" below). Mako enforces the rule in its own launch code, not in the Composer's prompt.

**Blue's verdict:** see "Blue's verdict" above (both of his messages): every option stays open for
study and the open questions are deferred. The "Proposed verdict" column is the builder's proposal only. Spending on
Gumloop or any paid service still needs Blue's explicit OK.

## What every option is judged against

- **Authority levels (S10).** The Composer never starts a pane above the level Blue gave the task
  (Minimum, Medium, High; Maximum only as a cloud session). It never raises a level itself.
- **Usage and parallel caps (S04).** Every pane the Composer starts counts against the parallel cap
  S04 adds to docs/RUNNER.md (docs/PLAN-1.1.md, "Parallel work": 1 on Pro; 2 after Blue's Max 5x
  upgrade on 2026-10-28; 3 once a week of usage shows room). Until S04, one session at a time. It stops at a
  usage limit. Never paid extra usage.
- **Blue merges everything.** The Composer may write a merge briefing; it never merges, approves, or
  enables auto-merge.
- **A new sensitive role.** The Composer starts panes and reads their output. Pane output can carry
  text from web pages and READMEs, so it is a prompt-injection path into the one role that can start
  more agents. Its role file, tools and launch path get the sensitive-area review (AGENTS.md), and
  its start-pane tool goes through Mako's main process (fence, environment scrub, admission budget),
  never a shell command. The Operator role stays unchanged (agent-roles/operator.md).
- **Voice reuse.** Mako already ships whisper STT (`onnx-community/whisper-large-v3-turbo` in the
  renderer, app/renderer/stt-bootstrap.js) and Kokoro TTS (`Kokoro-82M`, app/renderer/tts.js). The
  Composer would be the one voice that speaks. docs/PROJECT-STATE.md's roadmap proposes that
  background panes chime instead of talking over it, and a voice per role; neither is built yet
  (today Mako has one global voice, default `am_michael`, selectable).
- **Windows first, OSS first, no telemetry surprises, failures visible** (AGENTS.md).

## The model rule

Blue (2026-10-21): "I would like the composer to be able to automatically pick which model to use"
and "only ask if it is opus 5.5 max. if 5.5 extra is deliberatlely chosen, i have to assume it is for
good reason. just trying to see how we can prevent token waste by accidental wrong model used."

Proposed rule for the build sessions:

1. The Composer proposes a model and effort for each task, defaulting to Opus 5.5 at high effort, and
   Opus 5.5 at extra high (`xhigh`) when it judges the task hard. It can choose a smaller model for
   chores only if Blue allows that (open question 15).
2. Mako's main process checks every launch: Opus 5.5 at `max` effort stops and asks Blue; everything
   else starts without a question. The check lives in code, so a prompt or a pane's output can't talk
   the Composer past it.
3. Each pane's header and the Composer's plan card show the model and effort it got (for example
   "Opus 5.5 · high"); the end-of-task summary lists them per pane.

How each option sets model and effort per agent:

| Option | Per-agent model and effort | Notes |
|---|---|---|
| Claude Code CLI panes | `--model` and `--effort` at launch; `/model` and `/effort` while running | What Mako's launcher would pass |
| Subagent definitions | `model` and `effort` in the agent file's frontmatter | Mako already ships `.claude/agents/pr-reviewer.md` |
| Agent view (`claude --bg`) | `--model` per dispatch; `/effort` in the dispatch input; `claude agents --effort`, `--permission-mode` for defaults | Permission mode is set for all dispatches, not per dispatch |
| Agent Teams | Model from the spawn prompt or the subagent definition; effort inherited from the lead (a definition's effort applies in in-process mode) | Teammate model is fixed at spawn |
| Claude Code Projects | "Thread model" and "Thread effort" settings (default Opus at high), "Coordinator model" separately; a task can ask for another model | A thread limit given in chat is a preference, not a cap |
| Dodaios | Per pane: `model`, `effort`, `permission_mode` when a pane is opened; per member in team threads | Its fan-out call opens panes without a model or effort field, so they start on the CLI's default |
| Microsoft Conductor | `model` and `reasoning.effort` (low to max) per agent in YAML | |
| Cloudroom | "Teleport" keeps a thread's model and effort | No Windows |
| parallel-code, Emdash | Choose the agent CLI per task; per-task model flags not verified | |

## Options

### 1. Dodaios (formerly Personal Jarvis)

**What it is.** A desktop "agent OS" written in Python with a React web UI, by Ruben Lütke
([repository](https://github.com/Dodaios/Dodaios), read at commit
[`c2aeac0`](https://github.com/Dodaios/Dodaios/tree/c2aeac0c642024b9207cf340cde19cd4b288d6c2),
2026-10-20; PyPI package `dodaios` 4.0.1). The pieces that matter for the Composer:

- **Fan-out to several panes.** The Agentic IDE runs coding CLIs (Claude Code, Codex and seven others)
  in live terminal panes with call-signs (T1, T2...). One call, `POST /api/agentic-ide/fanout`, opens
  panes, splits one instruction into one assignment per pane (an LLM "planner", with a plain
  fallback), types each brief in, and reports **delivered** and **undelivered** per pane. It refuses
  a repeated order unless `force` is set, and has a `dry_run` that plans without typing anything
  ([Agentic IDE guide](https://github.com/Dodaios/Dodaios/blob/c2aeac0c642024b9207cf340cde19cd4b288d6c2/docs/product/extend-and-automate/agentic-ide.md)).
- **The "person you talk to".** A lead agent ("Plan with the lead agent ... it hands the work to the
  right agent or pane"), reached by a wake phrase, a call shortcut or chat. "Tell T2 to review the
  failing tests" routes by call-sign; near matches ask for confirmation instead of guessing.
- **Persistent agents.** "Dodaios Agents" are specialists with one chat that never ends, private notes,
  routines on a schedule, and optional **team leads** that split a goal into tasks, hand them out,
  check the results and report back
  ([team leads](https://github.com/Dodaios/Dodaios/blob/c2aeac0c642024b9207cf340cde19cd4b288d6c2/docs/agent-society/team-leads.md)).
  **Team threads** give one task to two to eight agents on different models, with "a coordinator in
  the app, not a model" deciding whose turn runs
  ([team threads](https://github.com/Dodaios/Dodaios/blob/c2aeac0c642024b9207cf340cde19cd4b288d6c2/docs/agentic-ide-team-threads.md)).
- **Summaries and updates.** A per-pane report and recap (`GET /terminals/{name}/report`),
  completion notices that say "Finished means the terminal went quiet; it does not mean the answer
  or code is correct", and background "missions" with a reviewer step and an operations board.
- **Usage handling.** Missions on a subscription park when the plan's limit is reached and resume
  later; paid API fallback is off by default and capped at $2 per mission and $10 per day
  ([mission capacity](https://github.com/Dodaios/Dodaios/blob/c2aeac0c642024b9207cf340cde19cd4b288d6c2/docs/mission-capacity.md)).

**Licence and upkeep.** Apache-2.0 from 2.0.0 on; releases up to 1.6.0 stay MIT; bundled parts keep
their own licences (portions from NousResearch hermes-agent and T3 Code, both MIT; see `NOTICE`).
Releases are very frequent (3.1.0 on 2026-10-09, 3.2.0 on 2026-10-13, 4.0.0 and 4.0.1 on
2026-10-20, which renamed the program, data folders and stored keys). The README lists one
contributor. Both points mean a fork or pin would carry real upkeep.

**Windows install (from its docs).** One line in PowerShell, `irm .../install/install.ps1 | iex`,
fetched from the `main` branch (not pinned), which downloads a private Python and Git without
administrator rights, adds a launcher and opens the app. A desktop installer also exists; the README
says Windows installers are signed "once the SignPath Foundation program approves the project", so
signing isn't confirmed. Data goes to `%LOCALAPPDATA%\Dodaios`; keys go to the Windows credential
store. Login autostart is on by default. Not installed on Windows in this session.

**Telemetry and network.** The privacy page (reviewed 2026-10-08) says there is no general telemetry
upload, but a local "Flight Recorder" is on by default and stores message text and transcripts with
incomplete redaction and no clear button; Google and Slack sign-ins go through the project's own
token service ([privacy and local data](https://github.com/Dodaios/Dodaios/blob/c2aeac0c642024b9207cf340cde19cd4b288d6c2/docs/product/privacy-safety-and-support/privacy-and-local-data.md)).
The code checks GitHub's releases API for updates. The sandbox trial below saw no outside host
contacted while idle.

**Sandbox trial (2026-10-21, this cloud container, Linux, no keys or accounts).**

1. Installed `dodaios==4.0.1` from PyPI into its own Python 3.12 virtual environment (686 MB, 122
   packages). This step used the sandbox's normal network access and was not logged. `dodaios --doctor` reported "OK with warnings": no coding-agent CLI installed, brain
   provider `claude-api` without a key, no desktop.
2. Ran `dodaios serve` (and, before it, `--doctor`) headless with an empty home folder, no proxy (so
   nothing could leave the sandbox) and a Python audit hook logging every host lookup, socket connect and subprocess. It
   listened on `127.0.0.1:47821` only. `GET /api/health` answered `{"ok":true,"version":"4.0.1"}`.
   POST calls without a trusted `Origin` header were refused ("Untrusted Origin header"), which is a
   good guard against other local pages.
3. Opened a workspace with two plain-terminal panes in a scratch git folder, then sent a fan-out
   `dry_run` with `split: true`. It answered with two assignments split by the fallback ("the planner
   was unavailable"), because the planner needs a model. **The trial stopped here, as the task
   requires:** a real split, real agent work, recaps and voice all need a Claude login or an API key.
4. During about three minutes of running, the only network attempt was `localhost:11434` (an Ollama
   probe). At start-up it ran `gh auth status`, `gcloud auth list`, `docker info` and `git` to
   discover installed tools and their logins. On Blue's PC that means it reads which GitHub account
   is signed in.

**Fit with Mako's guardrails.**

- **Authority.** Dodaios's own safety page promises approval before consequential actions, but it
  was last reviewed 2026-07-21. In the current code, background mission workers start Claude Code with
  `permissions.defaultMode: bypassPermissions` and with `hooks` and plugins emptied
  (`dodaios/missions/isolation/env.py`), so Mako's fence hooks would not run there. Agentic IDE panes
  open in the CLI's own mode unless one is passed. Mako would have to pin every pane's permission
  mode itself.
- **Caps.** No pane cap: up to 100 panes per request and no workspace limit (`MAX_PANES_PER_REQUEST =
  100`, `MAX_WORKSPACES = None`). Mako's S04 cap would have to wrap it.
- **Merging.** Its README pitches "Ship from the Git panel ... merges". On GitHub, `main` still needs
  Blue's code-owner approval, but the merge button would exist.
- **Process control.** Coding agents run in a background "terminal host" that keeps running after the
  app closes, and on Windows it is started "outside every job object of the app (through WMI when the
  app's job refuses to let it go)". That is the opposite of S06's goal (no leftover `claude.exe`
  after close).
- **Voice.** Its voice stack is separate and Python-based (local Whisper, Piper voices, openWakeWord,
  hosted options). Adopting Dodaios whole would mean two voice stacks; Mako's whisper and Kokoro
  would stay for Mako's own panes.

**Proposed verdict: PROTOTYPE, aimed at ADOPT.** Blue named Dodaios, so ADOPT or FORK of the relevant
piece is the default, and this proposal keeps that default rather than narrowing to "study and
rebuild". The relevant piece is the Agentic IDE plus the lead agent: fan-out, call-sign voice routing,
recaps, team threads. Whether it can be adopted depends on things a model-less trial can't show: how
good the split and recaps are, and whether its defaults can be pinned to Mako's guardrails. So the
next step is a one-day credentialed prototype on Windows (open question 9), running Dodaios as-is
beside Mako on a throwaway repo, with the checks above as pass or fail. That prototype is not part of
S16, which allows no real credentials: it needs its own sensitive plan row (credentials) in the
later Composer plan change, and it runs only where AGENTS.md allows Maximum-style runs (the Codex
app's Windows sandbox; Windows Sandbox only if AGENTS.md's Maximum row is first changed to
include it), because Dodaios's mission
workers run with permission prompts off. If it passes, a build session
adopts it behind a Mako pane (Dodaios's web UI on `127.0.0.1`, panes pinned to Mako's permission
modes); if it fails, its patterns are mined with Blue's OK. Forking a piece into Mako's Electron and
Node code would effectively be a rewrite from Python, so FORK is not proposed.

Blue's verdict, word for word: see "Blue's verdict" at the top (2026-10-21, both of his messages).

### 2. Claude Code subagents, agent view and cross-session messaging

**What it is.** Features of the Claude Code CLI Blue already uses on Windows
([run agents in parallel](https://code.claude.com/docs/en/agents), read 2026-10-21):

- **Subagents:** workers inside one session, defined in `.claude/agents/*.md` with their own tools,
  `model` and `effort`. Mako's `pr-reviewer` is one.
- **Agent view** (research preview): `claude --bg --model ... "task"` dispatches a background session
  that moves into its own git worktree before editing; `claude agents` shows every session with a
  state (working, needs input, idle, completed, failed) and a one-line summary written by a
  Haiku-class model when each turn ends; a linked PR shows its CI colour
  ([agent view](https://code.claude.com/docs/en/agent-view)).
- **Cross-session messaging:** any session can list and message Blue's other sessions on the same
  machine (a per-session named pipe on native Windows, Claude Code v2.1.234 or later), and ask for one
  notice when another session goes idle. Messages from another session can't approve anything, change
  settings or run commands, and the receiving session's permission prompts still fire
  ([cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging)).

**Fit.** No new install, licence or account; on Blue's existing plan. Each Mako pane already runs one
Claude Code session, so a Composer pane could message the panes it started and get "finished" notices
without scraping their terminals. Permission boundaries stay per session, which matches S10. Agent
view's own sessions run outside Mako's panes, so a Composer that starts panes should do it through
Mako's launcher, not `claude --bg`, to keep the fence, environment scrub and S04 cap. Voice: none
built in; Mako's whisper and Kokoro do it.

**Proposed verdict: ADOPT** (as the Composer's building blocks: subagent definitions for the roles it
dispatches, cross-session messaging for updates, agent view's state and summary model as the pattern
for the Composer's status list).

Blue's verdict, word for word: see "Blue's verdict" at the top (2026-10-21, both of his messages).

### 3. Claude Code Agent Teams

**What it is.** One lead session spawns "teammates", each a full Claude Code session, with a shared
task list, a file-based mailbox and hooks for quality gates (`TaskCompleted`, `TeammateIdle`)
([agent teams](https://code.claude.com/docs/en/agent-teams), read 2026-10-21).

**Facts.** Experimental and off by default (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). Once on, Claude
may form a team without being asked and "doesn't ask you to confirm the launch". Teammates start with
the lead's permission mode and can't be given their own at spawn. Split-pane mode needs tmux or
iTerm2 and "isn't supported in VS Code's integrated terminal, Windows Terminal, or Ghostty", so inside
Mako it would run in-process: every teammate inside one Mako pane. No nesting, one team per session,
no resume of in-process teammates. Token use "significantly more" than one session.

**Fit.** Closest built-in match to "one pane that fans out", but the teammates aren't separate Mako
panes Blue can see, the launch has no confirmation, and per-teammate authority isn't possible. The
model rule can be held by subagent definitions with a fixed `model` and `effort`.

**Proposed verdict: PROTOTYPE** (one research-only trial in a single Mako pane, after the Composer's
first build session, to compare with Mako-launched panes).

Blue's verdict, word for word: see "Blue's verdict" at the top (2026-10-21, both of his messages).

### 4. Claude desktop's linked sessions and Claude Code Projects

The 2026-10-20 brief that names "linked sessions" as Blue's pattern is not in the repo. This section
reads it as the Claude desktop app's cross-session access, plus Projects, Anthropic's newest
"coordinator" feature, which matches the Composer's description closely. If Blue meant something
else, say so in the verdict.

**Linked sessions (desktop).** In the desktop app's Code tab, "Claude can list your other Code tab
sessions, read what each has been doing, and send messages between them", and can offer out-of-scope
work as a task chip that starts a new session in its own worktree. It sees only sessions the desktop
app runs itself ([desktop docs](https://code.claude.com/docs/en/desktop), read 2026-10-21). Closed
app; Mako can't embed it, and the CLI's cross-session messaging (option 2) is the same mechanism.

**Projects.** "One ongoing conversation where Claude coordinates a stream of related work": Claude
starts a thread (usually a cloud session) per task, threads run in parallel, an Overview shows which
need Blue, and the desktop app notifies when a thread errors or needs input. Coordinator and thread
model and effort are settings (default Opus, high effort for threads). Usage comes from the same plan
limits; a thread at the limit waits and resumes; usage credits are never turned on by a thread. Public
beta on Pro and Max, rolling out gradually; 200 new threads a day across projects
([Projects](https://code.claude.com/docs/en/claude-projects), read 2026-10-21).

**Fit.** Cloud threads are sandboxed, which suits AGENTS.md's Maximum level. Two gaps: a thread limit
given in chat is "a preference rather than a cap", so S04's cap isn't enforced; and "Cloud threads
don't read permission rules from a repository's `.claude/settings.json`", so the repo's deny rule on
merge tools would not apply. `main` still needs Blue's code-owner approval, but after he approves, a
thread might be able to merge. This is not specific to Projects: any `ABlueAgent` actor that doesn't
read `.claude/settings.json` may have the same opening today, and nothing recorded in the repo shows
the ruleset limiting who can merge (not verified; issue #85). It needs closing on GitHub's side
before a Projects trial. No voice in Projects; it lives outside Mako.

**Proposed verdicts.** Linked sessions: **PATTERN-MINE**. Projects: **PROTOTYPE**: one small project on
a throwaway repo once it reaches Blue's account and the merge gap is closed, to compare its
coordinator and summaries with the Composer.

Blue's verdict, word for word (linked sessions): see "Blue's verdict" at the top (2026-10-21, both of his messages).

Blue's verdict, word for word (Projects): see "Blue's verdict" at the top (2026-10-21, both of his messages).

### 5. Microsoft Conductor

**What it is.** A CLI that runs multi-agent workflows defined in YAML: parallel groups and for-each
fan-out, human-in-the-loop gates, max iterations and timeouts, a web dashboard and a "Fleet Manager"
TUI. "No LLM in the orchestration loop, no tokens spent deciding what runs next"
([repository](https://github.com/microsoft/conductor), read at
[`49af6de`](https://github.com/microsoft/conductor/tree/49af6de0d21e1125faa22bc5a607500e045e29cd),
2026-10-15).

**Facts.** MIT, Microsoft. Latest release 0.1.42 (2026-10-06). Windows install by PowerShell script
(`irm https://aka.ms/conductor/install.ps1 | iex`, checksum-verified). Providers: GitHub Copilot
(default), OpenAI, Anthropic Claude by API key (pay per token), Claude Agent SDK on the signed-in
`claude` CLI (experimental). Per-agent `reasoning.effort` low to max. It checks GitHub for updates
once a day (`CONDUCTOR_NO_UPDATE_CHECK=1` turns it off); OpenTelemetry export only if configured.

**Fit.** Good for fixed, repeatable pipelines (review, research then summary), weak as a "person you
talk to": workflows are written ahead of time. The stable Claude path needs an API key, which means new
spending (AGENTS.md: ask Blue). Copilot is its default provider and Blue doesn't use it. No voice.

**Proposed verdict: PATTERN-MINE** (deterministic routing, human gates, iteration limits and per-agent
effort in a file under version control; revisit for workflow automation if Blue wants workflows as
code).

Blue's verdict, word for word: see "Blue's verdict" at the top (2026-10-21, both of his messages).

### 6. The R15 pattern mine: parallel-code, crystal, Emdash

From BLUE-HELM-MASTER-STATUS.md R15 (study-only through the core build).

- **parallel-code** ([repository](https://github.com/johannesjo/parallel-code), read at
  [`8933553`](https://github.com/johannesjo/parallel-code/tree/8933553365e240ff5720fd7542b6006fec65503e),
  2026-10-18). Electron and SolidJS, MIT, version 4.0.0. Each task gets a branch and worktree, agents
  run side by side, "AI Arena" races agents on one task, diff review with inline comments, merge from
  the sidebar, phone monitoring over Wi-Fi or Tailscale. Platform badge: macOS and Linux (no
  Windows). `PRIVACY.md`: no analytics or telemetry. Its merge button and phone listener both conflict
  with Mako's rules (R10 already flags the listener).
- **crystal** ([repository](https://github.com/stravu/crystal)). MIT, last commit 2026-02-26. Its
  README: "Crystal ... has been deprecated and replaced by Nimbalyst. Deprecated: February 2026."
  Nimbalyst was not researched here (PR #82's Follow-ups).
- **Emdash** ([repository](https://github.com/generalaction/emdash), read at
  [`ce0e562`](https://github.com/generalaction/emdash/tree/ce0e5620d2fa6fc2ebd97e910902f915cb1431d0),
  2026-10-19). Apache-2.0, YC W26, Windows installer and portable build. Parallel agents in worktrees,
  issues from Linear, GitHub, Jira and others sent into an agent, PRs, CI checks and merge in one
  place, remote machines over SSH. Telemetry: PostHog, on unless turned off (`TELEMETRY_ENABLED=false`
  or Settings); after GitHub sign-in it identifies the user with username and email
  (`apps/emdash-desktop/src/main/lib/telemetry.ts`). It installs its own hooks into each agent's
  user-level config, which would sit beside Mako's pane-status hooks.

**Fit.** All three are parallel-pane managers like Mako, not Composers: Blue still writes each task.
Useful patterns: per-task worktree setup and teardown (R9), Arena-style comparison of agents on the same
task, issue intake. None adds a voice coordinator.

**Proposed verdicts:** parallel-code **PATTERN-MINE** · crystal **PATTERN-MINE** (history only;
deprecated) · Emdash **PATTERN-MINE**.

Blue's verdict, word for word (parallel-code): see "Blue's verdict" at the top (2026-10-21, both of his messages).

Blue's verdict, word for word (crystal): see "Blue's verdict" at the top (2026-10-21, both of his messages).

Blue's verdict, word for word (Emdash): see "Blue's verdict" at the top (2026-10-21, both of his messages).

### 7. Cloudroom (cloudroom-core and cloudroom-gui)

**What it is.** `cloudroom-core` is one Rust service per Linux machine that runs coding agents and
saves their history; `cloudroom-gui` is a desktop app for Claude Code, Codex and Pi that can "Teleport"
a running thread from the Mac to the cloud and back with "the same chat, model, and effort"
([core](https://github.com/davidondrej/cloudroom-core) at
[`e4a511c`](https://github.com/davidondrej/cloudroom-core/tree/e4a511cb88ea708cbcc1db1101dd03090031cbe9),
[GUI](https://github.com/davidondrej/cloudroom-gui) at
[`4283edd`](https://github.com/davidondrej/cloudroom-gui/tree/4283edd7a0b46c0ab2998ed6d327cc1ce2a56e8a),
both 2026-10-21).

**Windows support, verified on GitHub.** None. The GUI README: "Runs on Apple Silicon Macs with macOS
13+. A Linux x64 alpha is on Releases." Its `gui/package.json` removes Electron's Windows installer
builder (`electron-builder-squirrel-windows` set to `"-"`). The core's install guide targets Ubuntu
24.04. This confirms the plan's 2026-10-20 reading.

**Other facts.** Apache-2.0 (GUI built on BB, MIT). "Pre-release software." Agents "run without
approval prompts", as a separate Linux user without sudo; the API needs a token and listens on
localhost only. Hosted cloud is invite-only.

**Proposed verdict: PATTERN-MINE** (Teleport is the same idea as Mako's Maximum level, which sends a
task to a cloud session; the agent-as-separate-OS-user model is worth noting for S10).

Blue's verdict, word for word: see "Blue's verdict" at the top (2026-10-21, both of his messages).

### 8. Workflow automation: Gumloop, n8n, Activepieces

Blue: "workflow automations are one of my tasks as well. id like to review Gumloop as a template."
Workflow automations get their own plan change after S16.

- **Gumloop.** Closed, paid SaaS with a visual node canvas and AI steps. Its site couldn't be reached
  from this sandbox, so pricing comes from third-party pages that disagree: a Free tier, and a "Pro"
  plan from about $37 a month after a March 2026 repackaging (credit amounts reported from 10,000 to
  20,000), plus Enterprise ([Zapier](https://zapier.com/blog/gumloop-pricing/),
  [usagepricing.com](https://usagepricing.com/blueprint/gumloop)). No self-hosting found outside
  Enterprise. Not verified on gumloop.com.
- **n8n** ([repository](https://github.com/n8n-io/n8n) at
  [`58f11bf`](https://github.com/n8n-io/n8n/tree/58f11bf0cf5e384efa7f6818fc940ff5ed8200a9), CLI 2.45.0).
  Licence checked: the **Sustainable Use License**, "fair-code", not open source. "You may use or
  modify the software only for your own internal business purposes or for non-commercial or personal
  use," and may distribute it only free of charge for non-commercial purposes; `.ee.` files need an
  enterprise licence. Building automations that clients use or configure needs a careful reading or
  a commercial licence. Telemetry is on by default (`N8N_DIAGNOSTICS_ENABLED` defaults to `true`; it
  sends to n8n's PostHog and `telemetry.n8n.io`). Install: Docker or Node.
- **Activepieces** ([repository](https://github.com/activepieces/activepieces) at
  [`252ea9e`](https://github.com/activepieces/activepieces/tree/252ea9e53984357ad2edc6605d7cec89087c8f92),
  0.92.2). Community Edition is MIT; `packages/ee` is commercial. "All our pieces (280+) are available
  as MCP", so a Claude Code pane could call the same integrations. Self-hosted with Docker (on Windows
  that means Docker Desktop; not tried). Product analytics can be turned off with
  `AP_TELEMETRY_ENABLED=false` before first start or in Platform Admin; licensed instances also send
  a daily deployment snapshot, a separate switch.

**Fit.** Workflow tools hold credentials for many services, run network listeners (webhooks) and act
on schedules, so any of them is a sensitive area under AGENTS.md. None should get Blue's business
credentials by default. Voice: none of them speaks; the Composer could start a workflow on request.

**Proposed verdicts:** Gumloop **PATTERN-MINE** (UX template from its public pages; no account or
spending without Blue's OK) · n8n **PATTERN-MINE** (licence and default telemetry) · Activepieces
**PROTOTYPE** (in the later workflow-automation session, sandboxed, no real credentials).

Blue's verdict, word for word (Gumloop): see "Blue's verdict" at the top (2026-10-21, both of his messages).

Blue's verdict, word for word (n8n): see "Blue's verdict" at the top (2026-10-21, both of his messages).

Blue's verdict, word for word (Activepieces): see "Blue's verdict" at the top (2026-10-21, both of his messages).

## What was checked, and what was not

- Facts were read on 2026-10-21 from shallow clones of each repository at the commits linked above,
  and from code.claude.com docs pages. Gumloop's, Emdash's and n8n's own docs sites could not be
  reached from the sandbox, so those facts come from the source code (Emdash, n8n) or third-party
  pages (Gumloop pricing).
- Nothing was installed or run on Windows. The only hands-on run was Dodaios on Linux, without any
  model, so split quality, recaps, voice and Windows behaviour are unverified.
- Agent Teams, agent view and Projects were not run; Projects may not be on Blue's account yet.
- No page, README or issue read during the research tried to instruct this session. The cloned
  repositories carry their own `AGENTS.md` and `CLAUDE.md` files for their contributors; they were
  treated as data and not followed.

## Open questions for Blue

Deferred by Blue on 2026-10-21 ("questions deferred"). They stay here as the list to answer down
the line, as the OSS review goes on.

From the S16 row:

1. Does the Composer only split and dispatch work, or also review and merge-brief it? (Only Blue merges
   either way.)
2. Local panes, cloud sessions, or both?
3. Does it start agents itself, or propose a split that Blue approves?
4. How much usage can one Composer task spend?
5. Voice: always listening (wake word), or push to talk?
6. Updates: in the app only, on the phone, or spoken?
7. One persistent "chief of staff" with memory, or one Composer per task?
8. Are workflow automations part of the Composer, or a separate feature?

Raised by the research:

9. **Dodaios prototype with a real login.** Its fan-out, recaps and voice can't be judged without a
   model. Should a later session run a one-day trial on Windows with your Claude subscription signed in,
   on a throwaway repo, with no business data? It can't run under S16, which allows no real
   credentials: a "yes" here only records the decision, and the trial gets its own sensitive plan row
   in the later Composer plan change. It runs in the Codex app's Windows sandbox; Windows Sandbox only if AGENTS.md's
   Maximum row is first changed to include it; a separate Windows user is not a sandbox under AGENTS.md.
   (Recommended: yes, time-boxed.)
10. **Merging after your approval.** Cloud project threads, and possibly any `ABlueAgent` actor that
    doesn't read `.claude/settings.json`, might be able to merge a PR once you approve it (issue #85,
    not verified). Close that on GitHub's side before any Projects trial? (Recommended: yes, as its
    own guardrail PR.)
11. Does the Composer dispatch to Codex panes too, or only Claude Code?
12. Agent Teams can form teams without asking once turned on. May it be turned on for the Composer's
    pane only, for one trial?
13. Will you run automations for clients? n8n's licence allows only internal business or personal
    use; Activepieces' Community Edition is MIT.
14. Gumloop: study its public pages and videos only, or approve a paid month (about $37 reported) to
    use it as a template?
15. Model rule detail: is Opus 5.5 at high the default, and may the Composer pick Sonnet 5.5 or Haiku
    5.5 for small chores, or always Opus 5.5?

## Recommended direction

The builder's proposal, not adopted: Blue's verdict keeps every option open for study.

Build the Composer as a thin layer that Mako owns: one Composer pane, a sensitive role, that talks
with Blue through Mako's existing whisper and Kokoro voice, proposes a split with a model and effort
for each task, and starts panes only through Mako's own launcher, so every pane keeps Mako's fence,
environment scrub, authority level, S04 cap and the code-enforced Opus 5.5 max-effort question. It
gets updates through Claude Code's cross-session messaging and Mako's pane status, and writes
summaries modelled on agent view's state list and Dodaios's delivered and undelivered receipts and
recaps. Claude Code's subagents, agent view and cross-session messaging are adopted as building
blocks, because they come with the Claude Code Blue already runs on Windows and his plan (agent
view's Windows support still to be checked). Before that build is finalized, a later session with
its own sensitive plan row runs the one-day credentialed Dodaios prototype in a sandbox: if Dodaios's lead agent and fan-out are good enough and
its defaults can be pinned to Mako's guardrails, the build adopts it behind a Mako pane instead of
building the coordinator; if not, its patterns are mined with Blue's OK. Agent Teams and Projects get
small trials for comparison, Projects only after the merge gap (issue #85) is closed. Conductor, parallel-code,
crystal, Emdash, Cloudroom, Gumloop and n8n are pattern sources only, and Activepieces is the
prototype candidate for the later workflow-automation session.
