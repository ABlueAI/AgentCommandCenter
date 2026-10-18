# Decisions log

Blue's decisions, newest first, with his words where available. Append only: add a new entry instead
of editing an old one, and say which entry it replaces. Agents follow the newest entry.

## 2026-10-18

| Decision | Blue's words |
|---|---|
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
