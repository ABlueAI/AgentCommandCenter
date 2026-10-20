# Decisions log

Blue's decisions, newest first, with his words where available. Append only: add a new entry instead
of editing an old one, and say which entry it replaces. Agents follow the newest entry.

## 2026-10-19

| Decision | Blue's words |
|---|---|
| Token rules for every new token (BLUE-CHECKLIST.md step 15b): GitHub tokens fine-grained, one repository, fewest permissions, except where GitHub doesn't support fine-grained tokens (an account that is only a collaborator on a personal account's repository, as `ABlueAgent` is): there a classic token with the single narrowest scope, so step 14's token becomes classic with `public_repo` only (no `repo`, `workflow`, admin or `delete_repo` scopes); no `ABlueAI` token ever gets "Pull requests: write", "Contents: write", "Administration" or "Workflows" ("Issues: read and write" should be enough to comment, not yet checked against GitHub's docs); any `ABlueAI` token for automation or an agent, such as a Codex-comment token, needs its own PR and Blue's decision first, and step 15 approves none; pasted only into Mako's key setup or a `main`-only GitHub environment secret (a Bitwarden copy optional, replacing step 9's "API keys go in Bitwarden" for new tokens; a key Mako's key setup can't hold yet waits only in Bitwarden), never into an AI chat, a file, the repo or `setx`; no GitHub token for Blue's PC other than step 14's before S06 (the one exception: signing in to Git again on the PC if a revoke breaks local pushes, which restores the login Blue already had until S06 replaces it) (Mako's key setup stores only the Gemini key today, and the plan doesn't yet say how S06 stores the token; step 14's token waits only in Bitwarden if made early); workflow secrets live in a `main`-only environment and that workflow never checks out or runs PR code; 90-day expiry (1 year at most) where the provider allows one, Blue tells Claude the expiry date and Claude adds a dated renewal reminder (a 90-day rotation reminder for keys with no expiry setting); a possible leak means revoke it on the provider's page, then tell Claude. Blue also audits old tokens and keys on both accounts and with OpenAI, Anthropic and Google, checking the repo's deploy keys and Actions secrets, keeping the PC's Git login until S06 replaces it (then removing it, step 14), Claude's authorization on `ABlueAgent`, Claude's installation on `ABlueAI` and the Codex links, and revoking any leftover Claude authorization on `ABlueAI` (step 15a), and turns on secret scanning push protection (step 15c). | "okay add this to a checklist" (asked how to keep tokens from leaking and how to find old ones). Two parts are Claude's recommendation, not Blue's words: the classic `public_repo` token for step 14 (after Codex found the fine-grained limitation on PR #46) and the extra `ABlueAI` bans beyond "Pull requests: write". Merging PR #46 approves this entry, both parts included. |
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
