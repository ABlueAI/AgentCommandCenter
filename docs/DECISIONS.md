# Decisions log

Blue's decisions, newest first, with his words where available. Append only: add a new entry instead
of editing an old one, and say which entry it replaces. Agents follow the newest entry.

## 2026-10-19

| Decision | Blue's words |
|---|---|
| Session-end messages and phone notifications start with "READY TO MERGE" (CI green, review done, PR marked ready) or "NOT READY: <reason>"; Blue acts only on READY TO MERGE. Usage is handled with an alert and a pause button, not an automatic stop at a fixed percentage. Composer is a must-have early in 1.1. A new session refreshes the agent profiles from Blue's package. Planned in PR #47 (proposed entry below). | "really more of a pause button here and or on Mako ... so i can still use claude as needed without burning through all usage" · "flag this as a necessity early on in 1.1" (Composer). For the READY TO MERGE format and the agent-profile session, Blue's own words are not available: both came in his 2026-10-19 instruction relayed to the PR #47 session. |
| **Proposed, pending Blue (PR #47):** S04 becomes "All-day runner and digest" and needs only S01; new session S26 "Codex builder lane"; AGENTS.md: once S04 is merged and applied, session PRs stop editing STATUS.md and add only the checklist steps and decisions they need; effective on merge, a new checklist step takes the next number not used on `main` or by an open PR, and agents never write Codex's handle in GitHub text unless a comment by `ABlueAI` or Blue's own message to the agent asks, or, after S26, for the runner's claim-issue hand-off. Replaces the once-a-day 8:01 AM runner schedule (2026-10-17 and 2026-10-18 entries) once S04's PR is merged and applied, and amends the 25-session block (2026-10-17) to 28 sessions this month. Also: AGENTS.md "How work flows" step 5 gains the READY TO MERGE / NOT READY notice format (effective on merge); S04 adds a pause button and usage alert, S11 a 90% warning and Pause and Resume buttons; new S27 "Composer" (NEEDS BLUE) and S28 "Agent profile refresh". Merging PR #47 approves it. | (none yet) |
| The runner runs all day: it keeps building through the day, and Blue reviews once at the end of the day and merges everything that is ready after review. He takes the back seat and wants to push hard and fast. Asked whether the runner should run all day, he chose "Yes, all day". Planned as the S04 rewrite (proposed entry above). | "if we can set it up so that it runs all day, i review at the end of the day and merge everything that is ready after review, this would be the best system for me." · "take the backseat" · "push hard and fast" |
| Codex's GitHub connection moves from `ABlueAI` to `ABlueAgent`, so Codex can build and its PRs are expected to be ones Blue can approve (S26 verifies which account they are attributed to). Same ChatGPT Plus account, no new seat. Blue re-links it (BLUE-CHECKLIST.md step 16). Replaces the Codex half of the entry below, "Codex stays linked to `ABlueAI`"; Claude's link stays on `ABlueAgent`. | "Yes" (asked whether to re-link Codex's GitHub to `ABlueAgent` so Codex can build) |
| **Proposed, pending Blue (PR #44):** S01 is DONE; moving local agents off Blue's git login to `ABlueAgent` becomes part of S06. Merging PR #44 approves it. | (none yet) |
| A separate Claude Opus reviewer replaces Codex as the required independent review: the builder runs the read-only `pr-reviewer` subagent (`.claude/agents/pr-reviewer.md`) on its own PR before marking it ready and posts "Independent review (Opus)" as a PR comment (AGENTS.md "How work flows" step 3; runner prompt in docs/RUNNER.md). Codex review becomes optional, on Blue's request only. This replaces the same day's unmerged plan for agents to comment `@codex review` themselves, which failed: Codex ignores accounts not linked to ChatGPT (BLUE-CHECKLIST.md step 13). Replaces the 2026-10-17 entry "Codex reviews every PR after it". | "lets just do option 3, less reliant on gpt so i can drop that subscription if need be" |
| Claude's GitHub link stays on `ABlueAgent`; Codex stays linked to `ABlueAI` (not re-linked to the agent account). | "nah, im not doing that" |
| Password manager is set up (BLUE-CHECKLIST.md step 9). | "password storage is set up" |
| Fix the merge audit's false alert on agent PRs (issue #40) instead of closing one alert per merge: when GitHub links a commit to no PR, also match it against the merge commits of PRs merged into `main`. | "yes, open the audit fix PR. id rather not deal with this every time." |
| Guardrails Part B (checklist step 7) is complete. The agent account is `ABlueAgent` (write access), Claude's cloud sessions act as it, and every PR into `main` needs Blue's approval as code owner. Done with the guide session on 2026-10-18; verified as `ABlueAgent` on 2026-10-19 (BLUE-CHECKLIST.md step 7). | Blue did steps 7a to 7e with the guide session on 2026-10-18 and ran the checker session (step 7f). Merging the checker's PR is his approval of this entry. |

## 2026-10-18

| Decision | Blue's words |
|---|---|
| Every PR targets `main`; no stacked PRs (AGENTS.md "How work flows"). Prompted by the false merge-audit alert in issue #35, which came from PR #33 being merged into PR #32's branch. | "every PR targets `main`; no stacked PRs. If work depends on an unmerged PR, wait, or include the change in that PR." (work order for the issue #35 fix; merging that PR is Blue's approval) |
| The merge audit counts a commit as merged when any PR merged into `main` includes it, keeping all three alerts and the fail-closed behaviour. | "Flag only commits that no merged-to-main PR covers." (same work order) |
| The `v1.0.0` tag waits for the Electron-binary fix (PR #33). Once Blue merges it, the PC session tags `v1.0.0` on that `main`. | "Hold the tag until the Electron binary fix PR is merged, then tag v1.0.0 on that main." |
| The recovered Oct 6–7 reviewer conversations (business research, two Mako panes) are the missing work from the closure. | "Yes, that's it" (answer in the PC session, FINISH-1.0 step A4). |
| The missing builder task is dropped: no transcript exists and Blue can't recall it. | "Can't recall, drop it" |
| Keep Claude Code's 30-day transcript retention; `cleanupPeriodDays` is not raised to 365. | "Skip it" |
| Windows Update active hours and restart notifications are set (FINISH-1.0 step A7). | "Done" |
| Build now on Pro: the runner no longer waits for Max 5x (step 8 dropped from its gate). Upgrade to Max 5x on Wednesday 2026-10-21, after Tuesday's reset and before Pro renews Thursday. Replaces the 2026-10-17 gate on steps 1, 7 and 8. | "i would like to keep building today on the pro plan as it resets tuesday id like to get the most out of it. i will get the Pro Max subscription on Wednesday ... lets just run it." |
| Finish 1.0 within 1 to 2 days, well before the Nov 3 transcript deadline. | "i would like to finish 1.0 well before nov 3. more like 1 to 2 days from now..." |
| Time zone is Eastern. The daily runner is scheduled for 8:01 AM America/New_York, following daylight saving (scheduled task "Mako daily runner", created 2026-10-18; docs/RUNNER.md). Completes the 2026-10-17 runner entry. | "by the way i am EST." |
| Auto-merge was already off before the guardrail setup (checklist step 2a). | "auto merge was already off" |

## 2026-10-17

| Decision | Blue's words |
|---|---|
| node-pty leftover-process risk accepted as a known 1.0 limitation, fixed in S06 (replaces the "confirm" entry below). | "leftover-process limitation for 1.0: yes that is fine." |
| PR #27 is merged on green CI plus Blue's read of the TLDR; Codex reviews every PR after it. | "okay that is fine" |
| The daily runner starts at 8:01 AM Blue's local time, one minute after Claude's weekly usage reset. Time zone still to be confirmed (BLUE-CHECKLIST.md step 3). | "morning daily runner should probably start at 8:01 AM since claudes weekly usage resets at 8AM." |
| Everything Blue must do lives in BLUE-CHECKLIST.md, in order, with when to do it; never only in a chat message. | "you will need to list all of my steps in order and when to complete them otherwise you dont know what ive completed and things can get missed." |
| Lighter operating rules replace the review rituals; work flows through GitHub PRs. | "yes, approved." · "i am on board with the PR ready plan." |
| Every change on its own branch; only Blue merges; no auto-merge, ever. | "this seems the best way to keep things secure while also moving quickly." |
| Every PR that is ready to merge carries a TLDR with facts and uncertainty. | "i would like to recieve a TLDR every time something is at this stage ready to be merged. i need the facts and i need to know if there is any uncertainty" |
| The four small fixes ship in 1.0.0. | "i agree with the small fixes, lets do those quickly before 1.0.0 release." |
| Maximum authority runs in sandboxes (cloud sessions by default, Codex Windows sandbox for Windows-only work), not on Blue's bare Windows account. No VM. | "a sandbox environment is fine by me as long as it wont cause too many problems for us. i believe that it is fine how you have it setup in the table above." |
| Plans: Claude Max 5x plus ChatGPT Plus; reassess in a month. | "i agree with your plan recommendation, we will reassess in a month if $100 isnt enough." |
| Finish 1.0 as written; hand the PC-only steps to a new local session. | "lets proceed as written for 'What's left for 1.0'" |
| Plan 1.1 in month-long, 25-session blocks; plan changes are highlighted for approval before merge. | "i would like a month /or 25 sessions at a time organized plan for items to be completed that we follow ... if plans change theyre highlighted and that knowledge is relayed to me for approval before we merge." |
| GPT and Claude work from one shared brain. | "we need to be able to connect gpt and claude so they operate on the same brain." |
| node-pty leftover-process risk is a known 1.0 limitation, fixed in 1.1 session S06. | Recommended by Claude; Blue said to proceed as written. **Confirm in the PR #27 review.** |

## 2026-10-16

| Decision | Blue's words |
|---|---|
| Pane status shows on any Claude Code 2.x at or above 2.1.228; untested versions are labelled unverified (record: docs/OSS-PROCUREMENT-pane-status.md § 14). | "i want to say yes. i definitely dont want the alternative version. this sounds like what we want." |
| Finish personal 1.0 as fast as possible, then expand in 1.1. | "the biggest thing i want to emphasize is lets complete 1.0 ASAP" |
| Prefer open source and Quick Links; all tools in one place. | "OSS is our friend, quicklinks is our friend, ensuring we have all the tools in one place is the goal" |
| One-click authority levels: Minimum, Medium, High, Maximum. | "it should be one click, maximum, high, medium, & minimum authority options" |
| Maximum: no avoidable questions until merge review; Blue keeps scope changes, preferences and the merge. | "when i hit send, i shouldnt need to review it until it is time to merge." |
| Adopt Obsidian Skills (kepano/obsidian-skills) in 1.1. | "yes i would like to use Obsidian Skills moving past 1.0 into 1.1." |
| Jarvis reference is Personal Jarvis, now Dodaios (github.com/Dodaios/Dodaios); the earlier Reddit link is withdrawn. Identity only, no ADOPT/FORK verdict. | "personal Jarvis was actually the correct version ... Please utilize that as the official version, not the one I linked." |
| First business niche: independent marinas in Charlotte County, Florida, using Blue's existing Hexona (HighLevel) features. Healthcare/PHI work deferred. | Confirmed in the Codex planning chat. |
| Brother gets a separate Windows install with his own accounts, target around April 2027. | Confirmed in the Codex planning chat. |
| A five-agent, 3-of-5 vote is an idea to evaluate, not the chosen design. | Confirmed in the Codex planning chat. |

## Earlier, still in force

- 2026-10-03: shortcut launch accepted: "YES & accept as is." Do not rerun the timed launch scripts.
- 2026-10-02: clean-machine, newcomer install and restore testing moved from 1.0 to 1.1.
- 2026-09: H1 application gate passed once for `aa1640c`. Never rerun it.
- 2026-08-12: pane status `BUILD FRESH` verdict (amended 2026-10-16 above).
- 2026-08-08: Dockview `ADOPT` verdict.
