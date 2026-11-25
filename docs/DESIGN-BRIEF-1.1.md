# Mako 1.1 design brief (S14)

Written 2026-11-24 by the Claude cloud session that built S14 (PR #253), from Blue's hand-over of
prototype A, his comments on it and the decisions that came after it (his private vault; only the
public part is used here), and from `docs/PLAN-1.1.md` "Mako 1.1 scope" and `docs/DECISIONS.md`.
Words and structure, not code. It is the spec the UI rows build from: S66 (shared navigation), then
S18 (brain tab), S19 (control room) and S20 (aquarium) in parallel.

**How to read it.** Where two sources disagree, **the later decision wins** (section 2 lists what
changed after prototype A). Every open choice is a question in the next section, with a default;
building proceeds on the defaults until Blue changes one. Merging this PR approves the brief and its
defaults; a "no" to any default after the merge is a small plan change, not a rewrite. "Builder's
reading" marks a line that is this session's inference, not Blue's words.

## Questions for Blue (each has a default; building proceeds on it)

Questions 1 to 15 come from the hand-over (its Part 3). Questions 16 to 18 came up while writing.

| # | Question | Default (what gets built unless Blue says otherwise) |
|---|---|---|
| 1 | **Fonts.** Prototype A used Fira Sans and Fira Code; the signed sheet (later) says Inter and Cascadia Code. | **Inter and Cascadia Code, with A's sizes** (section 3.3). |
| 2 | **Urgency by height or by distance?** The scope says higher = more urgent; a later visuals sheet says "the more urgent node sits closer to the shark". Blue's words (2026-11-11): "position equals urgency". | **Higher = more urgent**, needs-you on top, oldest first (as ticked in the scope). |
| 3 | **Visuals not seen yet.** The stage's line styles and the "What Mako knows" panel were "yes, pending a visual"; Blue's visuals check moved to 2026-11-27. | **Build both as ticked, marked "pending Blue's visual check"; S18 builds them last** so a change costs little. |
| 4 | **No rebuilt prototype on task nodes.** A was never redrawn with task nodes instead of category chips. | **This brief describes the task-node stage in words (section 4.2); Blue checks it at S18's first PC check.** |
| 5 | **Violet for "held by Blue"** has no value. | **`#9466ff`** (section 3.1): 4.82:1 on the brain surface, darker than the status red, blue and grey (verified by computation, section 3.1). |
| 6 | **No control-room design exists.** Only its colours and parts are set. | **The layout in section 5.1**, modelled on Paperclip's first image and A's shell. **Blue looks at it (a screenshot from S19's draft PR) before S19 builds past its frame.** |
| 7 | **Three.js version.** The shark was tuned on 0.160.0. | **Pin `three` 0.160.0 exactly**, unless the scan finds a problem; a newer version needs a re-check of the bloom look. |
| 8 | **The shark shape file is only in the private vault.** | **This PR adds it** as `app/assets/shark/shark-shape-B3.json`, in its own commit (geometry and settings only). Merging approves it; the commit can be dropped if Blue says no. The lab page's renderer code is not added. |
| 9 | **Pause all, quiet hours, usage and the shared In-focus card: S66, or S18 and S19?** | **S66 builds the top-bar pieces and the shared card; S18 and S19 fill them** (section 8). The plan rows change to match in this PR. |
| 10 | **Repo emblem image upload.** Blue asked for it (2026-11-10) and A has it; no sheet item names it. | **In 1.1, in S66 with the emblem rail**, as part of the UI overhaul (it passes the 1.1 test). Blue confirms before the 2026-12-01 freeze. |
| 11 | **Aquarium look.** Only "green-ish" and A's aquarium colours exist; the H1 trial (checklist step 55, by 2026-11-27) is not done. | **Three species: builder, reviewer and scout.** S20 waits for the trial result before it draws them. |
| 12 | **Pop-outs.** In 1.1 only if cheap; first to move to 1.2 if the 2026-12-20 checkpoint says behind. | **S19 sizes it and leaves a seam** (one window can host any tab) without building pop-outs first. |
| 13 | **The old layout's setting.** | **One switch on the Settings page, "Use the old layout"**, removed by S20. |
| 14 | **Where UI UX Pro Max is installed.** Installing into `.claude/` is a sensitive area. | **Not installed in this PR.** A follow-up PR installs its core skill folder only, pinned at `4f2dbb6`, at `.claude/skills/ui-ux-pro-max/`, flagged sensitive, for Blue's OK (section 10). |
| 15 | **The "95% line" on A's usage bar.** Blue dropped the pace check. | **Drop the line; keep the percentage and the reset time.** |
| 16 | **Permission card colour.** A drew permission cards with an amber border; the later Composer scope (V2) says permission prompts "always show as a red card". | **Red** (the later decision): the card uses the needs-you red with the shield icon and the word "Permission". Amber stays only for the message box, so amber always means "where Blue talks". |
| 17 | **Who fills the brain tab's conversation.** The Composer's own content (Mako's replies, plan cards, the morning brief, the evening summary, "What Mako knows") needs the conductor, which is S51 (scope pending Blue's sign-off). | **S18 builds the column, the message box and the question and permission cards from pane state; S51 fills the column with the conductor's content.** Builder's reading of the schedule's "the Composer's screen pieces start once S66 exists". |
| 18 | **The usage panel's 90% warning.** Today's top bar turns red at 90% and suggests pausing the runner (S11). | **Keep it** as a warning (it stops nothing). Builder's reading: Blue dropped automatic stops and the pace line, not warnings. |

## 1. What the 1.1 UI is

Three tabs on one shared shell (S66):

1. **Brain** (S18), dark blue: the Composer's stage. Blue's words: "almost a communication with the
   composer". The shark (Mako, the conductor) in the middle, live task nodes around it, the
   conversation and message box below.
2. **Control room** (S19), black: "The comm control room, where I see the agents and what they need
   from me. It should be clean." The Dockview panes with a clear header each, "needs you", usage and
   the reset time, Pause all, and a cheat sheet.
3. **Aquarium** (S20), green-ish: a tank per repo, one creature per live pane. The MVP only in 1.1
   ("1.2 will revamp aquarium").

The model for all three is **Paperclip's first image** (Blue: "a really sleek design ... model it after
that page a little bit"): a near-black app, a thin bright stripe across the top naming the current
scope, a narrow rail of round halftone emblems, a quiet sidebar of icon-and-word items under
small-caps labels, a warm amber reply box, and a name-and-value properties panel. Hairline borders, no
heavy shadows, small type. Blue on the old dashboard: "I just think there's a lot of wasted space."

**Rules every tab follows** (from Blue's words and A):

- **Utility first.** "Ensure it isn't just for looks but follows the same rules as other main brain
  dashboards" (2026-11-10). Every visual element answers a question Blue has: what needs me, what is
  working, what is done.
- **Nothing disappears** unless Blue deletes it ("nothing really ever disappears unless it's explicitly
  deleted or told to be deleted", 2026-11-11). Finished work leaves the stage but stays in the history
  and in Ctrl+F.
- **Colour is never alone.** Every state carries its icon and its word (section 3.1).
- **Calm.** Voice states pulse subtly, "not anything corny". No motion that carries no information.
- **Failures refuse visibly** (AGENTS.md): a missing data source shows a visible "unavailable" state
  with the reason, never an empty panel that looks like "nothing to do".

## 2. What changed after prototype A (the later decision wins)

| A shows | Build this instead | Source |
|---|---|---|
| Category chips on the shark | **Task nodes only, no memory nodes.** Each node is one live task plus whoever holds it (an agent, Codex or Blue). Categories survive only as the "group by kind" switch | 2026-11-11; Composer scope S4 |
| A particle-cloud shark image | **The final shark** (section 7) | 2026-11-18, recorded 2026-11-21 |
| Nodes placed left and right | **Higher = more urgent**, needs-you on top, oldest first; 8 at most, then groups | Scope S4 (question 2) |
| Fira Sans, Fira Code | **Inter, Cascadia Code** | Sheet 6.12 (question 1) |
| A Pause button on the stage | Keep it (it freezes the **view**), and add **Pause all** in the top bar of every tab (it pauses the **agents**). Two different things with two different names | Scope V10 |
| Usage bars with a 95% pause line | No pace check and no automatic stop; percentage and reset time always visible | 2026-11-16 (question 15) |
| Quiet-hours toggle in the tab bar | Same; a manual switch only in 1.1 (a schedule is 1.2) | Sheet 6.6 |
| No Ctrl+F | **Ctrl+F finds a node** by title or content | 2026-11-11 |
| No plan card | **Plan cards** in the conversation | Scope V3 |
| No "What Mako knows" | **Clicking the shark opens it** | Scope V9 |
| Message box with attach and Send | Add chips for **repo, tier and model** (each "auto" by default) and **push-to-talk** (Ctrl Space) | Scope V2 |
| Permission card with an amber border | **Red card** (question 16) | Scope V2 |

## 3. The look

Dark only. Compact in the control room, roomier on the brain tab. Borders, not shadows, separate
surfaces. Icons are inline stroke SVG; no emoji.

### 3.1 Colour tokens

Each tab sets its own surface colours **once, on the app root** (S66 switches the set when the tab
changes); components only ever use the token names below, never raw values.

**Per tab:**

| Token | Brain (tab 1) | Control room (tab 2) | Aquarium (tab 3) | Used for |
|---|---|---|---|---|
| `surface` | `#0a1530` | `#0a0a0b` | `#05191a` | Page ground of each tab |
| `surface-sunken` | `#071026` | `#050506` | `#031213` | Emblem rail, stage background |
| `surface-raised` | `#111e3d` | `#141417` | `#0b2426` | Cards, selected row |
| `surface-hover` | `#18284d` | `#1d1d21` | `#103033` | Hover and selected rows; Blue's message bubble |
| `line` | `#22325a` | `#26262b` | `#1b3b3d` | Hairline borders |
| `line-strong` | `#5a71b3` | `#62626c` (see note) | `#4f8588` | Borders of buttons, chips, inputs (3:1 on their ground) |
| `ink` | `#f2f5fb` | `#efeff1` | `#eaf5f3` | Primary text |
| `ink-muted` | `#9aa8c7` | `#9a9aa3` | `#93b5b0` | Metadata, property names, times |
| `ink-faint` | `#8796ba` | `#85858f` | `#7fa39e` | Overlines and section labels only |
| `accent-ink` | `#8ea9ff` | `#8ea9ff` | `#86d9ff` | Links, PR numbers, Open actions |
| `focus` | `#a9bcff` | `#a9bcff` | `#9fe6ff` | 2 px solid focus ring on every control |

**Same on every tab:**

| Token | Value | Used for |
|---|---|---|
| `accent` | `#3f65f4` | Mako shark blue from the logo: primary buttons, the active tab marker |
| `on-accent` | `#ffffff` | Text on `accent` |
| `status-needs` | `#f2606b` | Needs you: dot, icon, red pulse, permission cards. Always with the icon and the words "Needs you" (or "Permission") |
| `status-working` | `#6fa8ff` | Working. Always with the word "Working" |
| `status-ended` | `#3fc98a` | Turn ended or ready; READY TO MERGE text. Red and green differ mostly by hue, so the icon and the word are required, never colour alone |
| `status-held` | `#9466ff` (**proposed**, question 5) | Held by Blue, with the minutes held |
| `status-idle` | `#8796ba` | Paused or queued (A's grey dot) |
| `status-permission` | `#f0b44c` | Kept as a token for the "Permission" chip text only if Blue says amber (question 16); unused by default |
| `composer` | `#22190b` | Message box fill on every tab where there is one: the warm tint marks where Blue talks |
| `composer-line` | `#8a6a2a` | Message box border, active mode chip border |
| `composer-ink` | `#f0c060` | Active mode chip text (Delegate, Plan) |
| `composer-placeholder` | `#c2b08e` | Placeholder text in the message box |
| `emblem-1` to `emblem-8` | `#6d7cff` `#ff9d5c` `#49e0a8` `#e879c9` `#ffd65c` `#5cc8ff` `#ff8a7a` `#b5e655` | Repo emblem colour slots |
| `emblem-ink` | `#0b1020` | Letter and halftone dots on every emblem |
| `stage-glow` | `#1c3486` to `#071026` | Radial background of the brain stage |
| `shadow-float` | `0 14px 36px rgba(0,0,0,0.5)` | Only menus, the command palette and dialogs. Never cards |

**Contrast, verified by computation** (WCAG 2 relative-luminance formula, run in this session on the
values above): `status-held` `#9466ff` is 4.82:1 on the brain `surface`, 4.39:1 on its
`surface-raised`, 5.28:1 on the control room `surface` (4.91:1 on its `surface-raised`) and 4.83:1 on
the aquarium `surface` (4.33:1 on its `surface-raised`); its luminance (0.230) is below
`status-needs` (0.283), `status-idle` (0.305) and `status-working` (0.386), so it reads darker than
all three. Every other status colour is at least 5.15:1 on every `surface` and `surface-raised` (the
lowest is `status-needs` on the aquarium `surface-raised`). So `status-held` as text on a card on the
brain or aquarium tab (4.39:1, 4.33:1) falls below WCAG AA's 4.5:1 for normal text. Default: every
status colour used as text must reach 4.5:1 on every `surface` and `surface-raised`, so S66 lightens
`#9466ff` just enough to pass, keeping its hue; open to Blue's eye at question 5 and the S66 look
review. (Numbers recomputed by the PR sweeper in review run 1's fix, 2026-11-24.) Text on
`accent` is 4.80:1. `emblem-ink` on the eight emblem colours is 5.39:1 to 13.55:1. The message box's
placeholder is 8.16:1 on `composer`.

**Note on the control room's `line-strong`:** `#62626c` is exactly 3.00:1 on its `surface` but only
2.73:1 on its `surface-raised`, so a button or input on a card there falls below 3:1. Default: S66
uses `#6e6e78` for the control room's `line-strong` (3.65:1 on `surface-raised`, 3.92:1 on `surface`,
3.33:1 on `surface-hover`), a one-step lighter grey with the same hue. Builder's correction, open to
Blue's eye at the S66 look review.

### 3.2 Node colours (the brain stage, and the same meaning everywhere)

Red needs you · blue working · green done or ready · grey paused or queued · violet held by Blue.
Scope S4 and S5.

### 3.3 Type

Families: **Inter** for the UI, **Cascadia Code** for terminals and code (question 1). Sizes are A's.
Both fonts are shipped with the app, never loaded from the web at runtime (the renderer's CSP blocks
web fonts, and Mako makes no runtime downloads); S66 checks both licences (both are under the SIL Open
Font Licence, not verified here: check each font's licence file at pin time) and adds them to
`THIRD-PARTY-NOTICES.md`.

| Style | Size / line, weight | Used for |
|---|---|---|
| display | 40/44, 600 | The wordmark only |
| title | 22/28, 600 | Page and card titles |
| question | 18/24, 600 | The question on a question card: the biggest text after the title on the brain tab |
| body | 14.5/23, 400 | The conversation |
| ui | 13.5/20, 500 | Sidebar, buttons, chips, table cells |
| meta | 12.5/18, 400, `ink-muted` | Metadata, times |
| overline | 11/14, 600, 0.12em tracking, uppercase, `ink-faint` | Section labels |
| code (mono) | 12.5/19 | Branches, commands, paths, agent IDs |
| numeral (mono) | 15/20, 600, tabular digits | Usage, counts, timers, so digits line up |

### 3.4 Spacing, radius, sizes

- **Spacing:** 4, 8 (the dense default), 12 (card padding and gap), 16 (panel padding), 24
  (conversation inset), 32 (between page regions).
- **Radius:** 4 (status chips, shortcut hints, authority tags), 7 (buttons, sidebar items, inputs), 12
  (cards), 14 (message box), full (emblems, dots).
- **Sizes:** scope stripe 22, emblem rail 68, emblem 42, tab bar 50, sidebar 238 (196 when narrow),
  right panel 272 (228 when narrow), conversation max width about 760, brain stage height 360. The
  layout stretches from 1440 × 900 down to the narrow widths.

### 3.5 Components (one set, shared by all tabs; S66 builds them)

Emblem · tab · card (with a `permission` variant) · card head · status chip (needs, working, ended,
held, idle, permission) · primary and secondary button · icon button · chip (with a `mode` variant) ·
message box · properties list (name and value) · overline · numeral · banner (status line) · dialog ·
command palette. Each has a focus ring (2 px `focus`), a hover state and a disabled state.

### 3.6 Motion and accessibility

- **Reduced motion:** when Windows asks for less motion (`prefers-reduced-motion`), the shark stops
  swimming (it holds still and keeps its glow), pulses become steady, and nodes move without
  animation.
- **Hidden means stopped:** anything animated stops drawing when its tab or window is hidden.
- **Keyboard:** every control is reachable by Tab, the tabs are a real tablist (arrow keys move between
  tabs), dialogs trap focus and Esc closes them, and the palette is a combobox. Pattern source: the
  W3C WAI-ARIA Authoring Practices (tabs, dialog, combobox).
- **Screen reader:** status changes are announced politely (a live region), never by colour alone.

## 4. Tab 1: Brain (S18)

### 4.1 Layout, top to bottom (inside S66's shell)

1. **Quiet-hours banner** (S66's, shown on every tab when on): "Quiet hours until 12:00 PM. 2 alerts
   held for your digest. Agents keep working. Only urgent items break through." with **End now**.
2. **Pause-all banner** (S66's, every tab, while paused): a thin amber line "Paused since 14:05" with
   **Resume all**.
3. **The stage**, 360 px tall on the `stage-glow` background: the shark in the middle, task nodes
   around it (4.2), the stage's own live line and **Pause** (freezes this view's updates and motion,
   not the agents: "Live · updated 2 seconds ago" or "Paused · last updated 2:55 PM"), the counts
   ("Waiting on you 2 · On agents 4 · Ready 2"), and a small voice meter: "Hold Ctrl Space to talk.
   The mic is off until you do."
4. **Work-flow strip**, three equal links: INBOX (ready to start, from the plan), RUNNING (working,
   waiting on Blue), OUTPUT (ready to merge, reports).
5. **Conversation** (max about 760 px wide; question 17 for who fills what): the collapsible **Morning
   brief** card (7:30 AM, three bullets, "Saved to your vault · Read it aloud"); the **evening summary**
   at 22:00; Blue's own messages as right-aligned bubbles (`surface-hover`); "Update from <agent>"
   cards; Mako's replies with the Mako mark; **plan cards** (V3); **question cards**; **permission
   cards**. Finished work is batched into one line ("4 finished: ...") rather than one card each.
6. **Message box**: suggestion chips above it (for example "Start S19", "Evening summary", "Read it
   aloud"); the warm amber box, placeholder "Talk to Mako, or give it a job"; chips for repo, tier and
   model, each "auto" by default; attach; push-to-talk; Send.
7. **Right panel** (272 px), three states: **Right now** (default: Waiting on you, On agents, Ready to
   merge with PR links, Runner; the usage bars with reset times; "PRs merged, last 7 days" with a small
   trend line; an Activity list with times), **In focus** (S66's shared card, 4.4), and **Category**
   (after a "group by kind" group is clicked: its items with state dots and one action).

### 4.2 The task-node stage (described in words: question 4)

- **One node per live task**, labelled with the task's short title and its holder (an agent, Codex or
  Blue), coloured by state (3.2), with "state · waiting n min" under the label. Needs-you dots are 12
  px with a soft red halo; others 10 px. No memory nodes, no category chips.
- **Position is urgency:** higher on the stage = more urgent; needs-you nodes sit on the top row,
  oldest first; then held, working, queued, and finished last (question 2). Left and right are only
  for spreading nodes out, never meaning.
- **Lines** from the shark to each node (pending Blue's visual check, question 3): **solid** (faint
  `status-working`, 30% opacity) = tracking; **dashed red** (`status-needs`, dash 3/7) = waiting on
  Blue; **none** = paused.
- **More than 8 tasks:** one node per repo with its emblem and a count, coloured by its most urgent
  task; clicking a repo group fans its tasks out. A switch groups **by repo** (default), **by kind**,
  or **none**.
- **Hover** shows one line: "Review #174 · waiting 6 min · asks adapter or port".
- **Click** opens the In-focus card in the right panel.
- **Finished tasks** fly into the shark and fade, and stay in the history and in Ctrl+F.
- **Stall watch** (scope V7): a node turns red "stalled" after 20 minutes of silence or 5 failed tries;
  a usage stop shows "waiting for reset at hh:mm" and is never called stalled.
- **Ctrl+F finds a node** by title or content, and the matching node is focused on the stage (folded
  groups open to show it).
- **The shark shows only Mako's own state, never a task's** (section 7). Clicking the shark opens
  **"What Mako knows"** (V9; pending Blue's visual check, question 3).

### 4.3 Cards in the conversation

- **Question card:** title; repo · waiting time; the question in the `question` style; one line of
  why; answer buttons with the recommended one primary; "Details".
- **Permission card** (V2): **always a red card** (question 16) with the shield icon and the word
  "Permission", **Allow once** and **Deny**, and the line "Mako never answers this for you. Your click
  is the answer." The raw terminal is one click away (**Open pane**).
- **Plan card** (V3): the plan's steps with **start** / **start all** (approval tier 2, A2).

### 4.4 The In-focus card (shared; S66 builds it, S18 and S19 wire its actions)

The same card appears on the brain tab and in the control room (scope S7: "the same card appears in
the control room"). It shows the task and its state, then Held by, Repo, Role, Model, Authority,
Branch, Elapsed, Latest; "Open agent page" and "Terminal"; "Back to Right now". Its buttons depend on
the state:

- **Question:** its answer buttons, **Ask why**, **Snooze**, **Open pane**.
- **Permission:** **Allow once**, **Deny**, **Open pane**, with "Mako never answers this for you. Your
  click is the answer."
- **Working:** **Peek**, **Ask Mako**, **Open pane**, **Pause**, **Interrupt (Esc)** (stops the current
  step, keeps the session).
- **Finished:** the READY TO MERGE or NOT READY line, **Open PR**, **What next?**, **Archive** (off the
  stage, still in the history).

### 4.5 Brain tab done-when (from row S18)

Live task nodes from real panes; a card answer reaches the pane; Ctrl+F finds a node; 2 working days
without a blocker. Automated end-to-end tests for the tab pass, and one batched PC-check session.

## 5. Tab 2: Control room (S19)

### 5.1 Proposed layout (question 6: Blue looks before S19 builds past the frame)

Modelled on Paperclip's first image and A's shell, in the control room's near-black colours, compact:

- **The shared shell** (S66): scope stripe, emblem rail, tab bar with Pause all, quiet hours and the
  usage chip with the reset time, the sidebar.
- **Centre: the Dockview panes**, as today, each with a **pane header** showing status (dot, icon and
  word), task, branch, authority tag, maximize and close. Dockview stays the pane engine underneath.
- **A "Needs you" strip** above the panes, only when something waits: one chip per waiting pane
  (repo emblem, task, waiting minutes); a click focuses that pane. The jump key cycles through them.
- **Right panel** (the same 272 px slot as the brain tab): **In focus** (the shared card) for the
  selected pane; otherwise a properties list for the selected pane (owner, state, done-when, idle time;
  S46) and the crew's branch status (S47).
- **Cheat sheet** behind a "?" icon button and in the palette: the non-sensitive phrases and key
  bindings, read from S66's shortcut list so it never drifts. Sensitive phrases stay in Blue's password
  manager and never appear here.
- **No conversation column** on this tab: Blue talks to Mako on the brain tab, or by push-to-talk from
  any tab.

### 5.2 What the control room does

- **Needs you** (sheet): a Windows toast, a taskbar badge and a jump key, with sound off; quiet hours
  hold the toast and keep the badge. The existing alerts (S05, `docs/NEEDS-YOU-ALERTS.md`) are the
  base.
- **Usage reset time always visible** (S66's top-bar chip, on every tab).
- **Pause all** (V10, the behaviour; S66 builds the button and banner): nothing new starts, every
  working pane gets Esc, nothing is killed, panes waiting on Blue stay as they are; each task card has
  its own Pause. The matching spoken phrase comes with the Composer. Sensitive (process control): a
  second review.
- **Stall watch** (V7), as on the brain tab, shown in the pane header.
- **Session hygiene** (S46) and **Symvibe's three pieces** (S47) live here.
- **Pop-outs** (question 12): S19 sizes them and leaves the seam (one window can host any tab).
- **Every pane's status is correct after a restart** (row S19's done-when).

### 5.3 Control room done-when (from row S19)

Every pane's status is correct after a restart. Automated end-to-end tests for the tab pass, and one
batched PC-check session.

## 6. Tab 3: Aquarium (S20)

- **A tank is a repo**; the MVP has one tank. **Species shows the role**: about 3 species, default
  builder, reviewer and scout (question 11). Free stylized art for now; "hyper realistic is the final
  goal" (1.2).
- **One creature per live pane**, in the pane's state colour within about 2 seconds; a click opens
  the pane; the agentId is stored.
- **A crew list** beside the tank: one row per creature (species, task, state, repo).
- **Base:** Pixel Agents 1.6.0, pinned exactly, watch-only (`--no-terminal`), after the pin-and-scan
  step (licence, tool-security scan, the China-origin check). Blue's H1 trial (checklist step 55, by
  2026-11-27) comes first.
- **Then the old layout is removed**, after 2 full working days on the new one with no blocker, and
  only once S18 and S19 are done.

**Done-when (from row S20):** one creature per live pane with the right colour within about 2
seconds; a click opens the pane; the agentId is stored. Automated end-to-end tests for the tab pass,
one batched PC-check session, and Blue's 2-working-day acceptance before the old layout goes.

## 7. The shark (final, 2026-11-18: "thats it")

**Look.** A glowing glass hologram: a see-through glass outline, glowing inner threads, star-like
sparkle points and a warm core. Not too realistic (Blue: "if we go a little bit too realistic, it's
going to look weird"); the mouth is a line of light and the teeth are short strokes of light. No
"Scary" dial. **Never red.** "Kinda 3D holographic, but of a similar design just with depth"
(2026-11-10).

**Motion.** It swims instead of turning in place, with a stiff front and a beating tail. The tail-beat
wave starts at about s 0.32 with a wavelength of about 1.6 body lengths; the tail beats at about 0.45
Hz at speed 1.0, "the slow beat of a big animal".

**Shape: B3 Heavy**, the stocky shortfin (Blue: "B, stocky appears to be more true to the actual
shape"; "B3, Heavy"). The shape is **swappable data** ("that's going to be a necessary feature"):
`app/assets/shark/shark-shape-B3.json`, format `mako-shark-shape/1`, added by this PR (question 8). It
holds the body profile (top, bottom and width ratio along the body), the eye, mouth and gill
positions, the pectoral placement, and every fin edge as a list of points. Units: *s* runs from 0 at
the snout tip to 1 at the caudal-fin base; heights are fractions of that length (LB) above (+) or
below (-) the snout-to-tail axis; width = half-depth × width ratio; LB = 3.2 scene units. The tail
forks at s 1.075, the upper lobe tip at (1.21, +0.20), the lower at (1.17, -0.16). Pectorals are 0.245
LB long. S18 loads the file as it is.

**Shape-file errors refuse visibly:** a bad or missing file shows a visible error and falls back to
the last good shape, logged, never silent.

**Colours: Dusk** by default, with the nebula family (Dusk, Dusk Nebula, Orion, Carina, Helix, Veil,
Pillars, Rosette) to pick from in Settings; each sets shell, edge, core hot, core deep and nebula gas.
Only Dusk's values are in this brief; the other seven come with the lab page's values when Blue adds
them. Water: **deep**.

Default settings:

```
shape B3 (Heavy) · water 5% (deep) · colours Dusk
shell #2a66ff · edge #9a82ff · edge glow 1.65 · glass fill 0.20 · veins 0.5 · bloom 1.0 · threads 0.95 · sparkles 50%
core 0.75 · hot #ffb04a · deep #ff5a6a · flow 0.75 · nebula gas #ff5a6a · nebula tint 0
path cruise · speed 1.0 · tail 1.0 · pectoral 100% · eye 1.0 · frame rate 30 fps
```

**The four states, and no others:**

| State | What the shark does |
|---|---|
| Idle | Calm swim, base glow |
| Listening (while Blue holds Ctrl Space) | Sparkles draw in to the skin, a soft light runs toward the head, the swim slows a little |
| Thinking | Bands of light roll from snout to tail about once a second; the core and threads flow faster |
| Speaking | The whole shark brightens and the glow swells with Mako's voice. No mouth movement |

The shark shows only Mako's own state, never a task's (scope S3).

**Frame rate: 30 fps by default** ("The frame rate, 30 by default, is good"), with 60, 120, 144, Max
and Auto in Settings. Measured on the lab page: 4.4 to 5.3 ms per frame at 653 × 768 on an Intel
integrated GPU.

**Engine: Three.js** (MIT; Blue: "Three.js is fine, that has my okay"). The lab page used 0.160.0 with
these addons only: `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass` (bloom) and
`BufferGeometryUtils.mergeGeometries`. In Mako: install `three` from npm at **one exact version**
(0.160.0 by default, question 7), no version range, no web download at runtime; read its licence and
run the tool-security scan before installing. Mako has no `three` dependency today. Create WebGL with
`powerPreference: 'high-performance'` (the lab page rendered on the integrated GPU, not the discrete
one).

**One renderer module, five calls:**

- `setState(idle | listening | thinking | speaking)`
- `setVoiceLevel(0..1)` while speaking, fed from Mako's real speech level
- `setLook(settings)`, including the nebula gas colour and tint
- `setFrameRate(mode)`
- `pause()` / `resume()`

**Must keep:** reduced motion; stop drawing when hidden; 30 fps by default; no task state on the
shark; never red. Its settings (colour look, water tone, frame rate) are saved with the Composer
settings; the lab page's "Copy settings" output can be the import format.

**Shark tests:** shape-file validation (good, bad and missing file); state-transition timing; a
frame-time check at 30 fps, full screen, on Blue's PC.

## 8. Where each item sits (S66, S18, S19, S20)

S66 now takes the pieces every tab shows (section 1.7 of the hand-over; question 9), so S18, S19 and
S20 don't each build them. The rows in `docs/PLAN-1.1.md` change to match in this PR.

| Item | Row | Notes |
|---|---|---|
| Three-tab layout, behind "Use the old layout" on the Settings page | S66 | Question 13. Today's `--classic-layout` recovery flag is separate and stays |
| Per-tab colour set on the app root; the token set and the shared components (3.1 to 3.5) | S66 | |
| Inter and Cascadia Code, shipped with the app | S66 | Licences into `THIRD-PARTY-NOTICES.md` |
| Scope stripe; repo emblem rail with the red needs-you dot; "Customize repo emblems" with image upload (PNG, JPEG, WebP, SVG; cropped to a circle, stored as a 256 px copy) | S66 | Question 10. The upload reads a file Blue picks, so it is checked by content (not extension) and gets the security reviewer. An SVG is rasterized to the 256 px copy before use, never inlined |
| Tab bar: the tablist, "Jump to a repo, agent or command" (Ctrl K) | S66 | Already S66's |
| Top bar: **Pause all** button and the "Paused since" banner with **Resume all** | S66 (button, banner, state); S19 (what pausing does to panes) | Question 9. S19's part is process control: a second review |
| Top bar: **Quiet hours** switch and banner; the one "quiet" state every alert and voice path reads | S66 (switch, banner, state); S18 and S19 honour it | Manual only in 1.1 |
| Top bar: **usage chip** (5-hour and weekly percentage and reset time) on every tab | S66 | Moves today's usage panel (S11); question 15 (no line) and 18 (90% warning kept) |
| The sidebar frame, with "Everything else" (Library and Video Scout, Quick Links, Logs, Settings) | S66 | Tabs add their own entries |
| The **In-focus card** component with its four state layouts | S66 (component); S18 and S19 wire its actions | "A card answer reaches the pane" stays S18's done-when |
| Global shortcuts: one shortcut list; Ctrl K, Ctrl Space (push-to-talk, on every tab) | S66 | S19 binds the needs-you jump key; the cheat sheet reads the list |
| The one Settings page with sections (Layout, Shark, Quiet hours, Repos and emblems, Voice, Keys, and today's settings) | S66 | |
| Brain stage, task nodes, lines, grouping, hover, Ctrl+F, the work-flow strip, the right panel's Right now and Category states | S18 | Lines and "What Mako knows" last (question 3) |
| The shark renderer module and Three.js pin | S18 | Section 7; shape file added by this PR |
| Conversation column, message box shell, question and permission cards | S18 | Question 17 |
| The conductor's content: replies, plan cards, morning brief, evening summary, "What Mako knows" data | S51 | Scope pending Blue's sign-off; renders in S18's column |
| Pane header, Needs-you strip, toast, badge and jump key, stall watch in the header, cheat sheet, pop-out seam | S19 | With S46 and S47 |
| Aquarium tank, species, crew list, Pixel Agents | S20 | After step 55 |
| Removing the old layout and its setting | S20 | After S18 and S19 and 2 working days |

## 9. UI test plan

Blue's standing ask: state his own time up front and keep manual testing short.

- **Automated end-to-end tests per tab**, in the real Electron app (the pattern of
  `app/dockview-app-harness.js`: the real renderer, the real preload, main replaced by counting stubs
  for the IPC calls). At least:
  - **S66:** the three tabs switch by click and by keyboard; each tab sets its colour set on the app
    root; Ctrl K opens the palette and Esc closes it; the Settings page opens; "Use the old layout"
    brings the old layout back after a restart; Pause all and quiet hours show their banners on every
    tab; the usage chip shows the reset time on every tab; an emblem upload of a bad file refuses
    visibly; focus rings show on every control.
  - **S18:** nodes appear for live panes and sit higher when more urgent; more than 8 tasks group by
    repo; a click opens the In-focus card with the right buttons for each state; a card answer reaches
    the pane (counted at the IPC boundary); Ctrl+F finds a node by title and by content; **a
    permission prompt always shows as a red card** (V2); the shark's shape file loads, and a bad or
    missing file shows the error and falls back; state-transition timing; the shark stops drawing when
    the tab is hidden and holds still under reduced motion.
  - **S19:** pane headers show the right status, including after a restart; the needs-you strip and
    jump key; Pause all sends Esc to working panes only and kills nothing (counted at the IPC
    boundary); "stalled" after 20 minutes or 5 failed tries, and "waiting for reset at hh:mm" on a
    usage stop.
  - **S20:** one creature per live pane with the right colour within about 2 seconds; a click opens
    the pane; the agentId is stored.
- **Colour checks** as a unit test: every status colour reaches at least 4.5:1, and `line-strong` at
  least 3:1, on every `surface` and `surface-raised` of its tab (section 3.1), so a token change can't
  quietly break them.
- **One batched PC-check session per tab** on Blue's PC (Tuesday or Friday evening), each listed in
  `BLUE-CHECKLIST.md` with its minutes up front (about 10 to 15 minutes each, builder's estimate). The
  S18 session includes the 30 fps frame-time check full screen, and Blue's look at the task-node stage
  (question 4), the lines and "What Mako knows" (question 3).
- **Blue's 2-working-day acceptance** before the old layout goes (S20).

## 10. Pattern sources (OSS first)

| Pattern | Source | Status |
|---|---|---|
| Overall shell: scope stripe, halftone emblem rail, small-caps sidebar, amber reply box, properties panel | Paperclip's first image (a third-party screenshot Blue chose, 2026-11-10); prototype A took these from it | Design reference only; nothing taken in. Paperclip's licence is not verified (check its repository before borrowing any code) |
| Brain screen layout, In-focus card, question and permission cards, Pause on the stage, quiet-hours banner | Prototype A (Shark A, S17, picked 2026-11-10) | Blue's pick |
| Pane engine | Dockview 7.0.4, already in Mako | Adopted (`docs/OSS-PROCUREMENT-dockview.md`) |
| Task-node web | Cytoscape.js (core), with sigma.js and Vis Network as alternatives | S63's record, `docs/decisions/OSS-ui-libraries.md`: PROTOTYPE aimed at ADOPT, **Blue's verdict pending**. S18 builds on it only after his verdict |
| Ctrl+F ranked find | MiniSearch | Same record: ADOPT proposed, verdict pending |
| Conversation transcript and input | Deep Chat (UI-only build) | Same record: PROTOTYPE; the published bundle fails the China-origin rule as shipped, so only a source build with those references removed. For S51 and S18 to weigh |
| Opening a vault note | The Obsidian URI | Same record: ADOPT proposed |
| Shark renderer | Three.js (MIT), 0.160.0 | Blue's OK of the engine; the pin needs the scan |
| Aquarium | Pixel Agents 1.6.0, watch-only | Pin and scan first; H1 trial (step 55) |
| Tabs, dialog and palette keyboard behaviour | W3C WAI-ARIA Authoring Practices | Primary source |
| Needs-you alerts | Mako's own S05 alerts | In Mako |
| Usage figures | Mako's own S11 usage panel (Claude Code's status line data) | In Mako |
| Command palette widget | Not chosen: S66 looks for a maintained, dependency-light palette first (OSS first) and records the options, or builds a small one on the combobox pattern | S66 decides and records it |
| Design rules and checks | UI UX Pro Max, core skill folder, pinned at `4f2dbb6` | **Not installed here** (question 14): a follow-up PR installs it at `.claude/skills/ui-ux-pro-max/`, flagged sensitive; its plugin, command-line tool and `stack` folder are never installed (2026-11-16). Blue: "make sure we use UI UX Pro Max as well." |

## 11. Not in 1.1

Clicking a star in the shark zooms into a nebula ("sky and sea", the next pass) · a quiet-hours
schedule · phone updates · a hyper-realistic aquarium (1.2 revamps it) · pop-outs, if not cheap or if
the 2026-12-20 checkpoint says behind · a light theme.
