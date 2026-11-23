# Mako 1.1 schedule

Adopted when Blue merges the PR that adds this file (plan row S61). Written from the plan as of
2026-11-22, then re-synced with `main` after the plan change in PR #212 merged and with Blue's
answers dated 2026-11-24. Row numbers are docs/PLAN-1.1.md's; step numbers are BLUE-CHECKLIST.md's.
Estimates are planning guesses unless marked measured.

## Units

- **Build day:** one agent working one day, ending in one reviewed pull request ready to merge.
- **Lane:** one agent session building at a time.
- **Calendar time = build days ÷ lanes that actually run**, except where one piece waits for
  another (most of the Composer, the shared navigation (S66) before the tabs, and Blue's acceptance
  days).

Measured: 65 PRs merged 2026-10-17 to 2026-11-11 on one lane, median about 5 hours from open to
merge (GitHub's open and merge times).

## Goal and checkpoint

- Goal: release by 2027-01-15, and all of 1.1 within 60 days of 2026-11-17 (S59; Blue, 2026-11-22).
- Scope freeze: 2026-12-01 (only work vital to security joins after it).
- Pace checkpoint: 2026-12-20, defined below.

## What is left (from 2026-11-22)

| Group | Rows | Build days |
|---|---|---|
| Gate rows (before any UI code) | S38, S37, S41, S43, S42, S61, S14 | 4.5 to 8.5 |
| Other foundations (Claude) | S48, S49, S40, S57, S58, S44, S45, S35, S28 + S60, small fixes (#210, #211, worktree clean-up) | 11 to 20 |
| Codex | S52, S53, S54, S55, S56, S63 | 5.25 to 10.75 |
| Tabs and Composer | S66 + S18 (2 to 4 together), S51 Composer v1 (20 to 32), S19 (5 to 10), S46 + S47 (4 to 7), S62 (3 to 6), S20 (6.5 to 13), per-tab tests (2 to 4) | 42.5 to 76 |
| Release | S64 (1 to 2), S65 (1 to 3), S59 (1.5 to 3) | 3.5 to 8 |
| **Total** | | **about 67 to 123** |

The S66 + S18 estimate is the old S18's, from before the split; it isn't re-estimated. The Codex
estimate still holds a build half for S53. Blue's verdict on S53 is PATTERN-MINE (2026-11-18,
recorded in PR #208, not yet merged), so S53 itself builds nothing, and any replay work belongs to
S19 or S62. The totals are left as they were.

Codex builds only non-sensitive rows. It never builds the UI, the Composer's dispatch tools, or
anything in a sensitive area (AGENTS.md "Sensitive areas").

## The UI gate and the two chains

**UI gate, about 2026-11-28 to 2026-12-02:**
- S61 merged;
- the S14 design brief written;
- S38 done;
- S43 done;
- Blue's go on the UI (step 18).

**Chain 1, the Composer (S51):**
- Its back-end lane (dispatch tools, run ledger, provider adapter) starts once the scope is signed
  and S38 is done, about 2026-11-27 to 11-30.
- Its screen pieces start once S66 (the shared navigation) exists.
- On two lanes it takes about 13 to 21 calendar days.
- Then 2 acceptance days with fixes.

**Chain 2, the tabs:**
- S66 (the shared navigation) first; then S18 (the brain tab), S19 (the control room) and S20 (the
  aquarium) build in parallel on top of it, as each needs only S66. S20's removal of the old layout
  also waits for S18 and S19.
- About 8.5 to 17 days if the three tabs get their own lanes (S66 and S18's 2 to 4, then S20's 6.5
  to 13 as the longest tab), up to 13.5 to 27 days if they run one at a time. Worked out from the
  ranges above, not re-estimated.
- Then the aquarium's acceptance days.

**Tail:** the S65 audit runs during the last acceptance days; S59 (1.5 to 3 days) follows.

## Calendar

Assumes 2 Claude lanes from 2026-11-23, a third from about 2026-11-29, Codex on 2 tasks at a time,
and two days off at the year's end. Mako's main chat keeps the Claude lanes full, starting the next
row as each finishes (decision 5).

| Case | Release |
|---|---|
| Main case (with the tab split, S66) | about 2026-12-18 to 2027-01-05 |
| Two Claude lanes only | about 2026-12-24 to 2027-01-21 |
| Design review inputs slip a week | about 2026-12-21 to 2027-01-13 |
| A day the lanes sit idle | about +1 day each |

The last three cases were worked out before the split, from the old main case (about 2026-12-18
to 2027-01-08); the split can bring their late end up to 3 days earlier.

Lane plan through 2026-12-20:

| Weeks | Lane A | Lane B | Lane C (from about 11-29) |
|---|---|---|---|
| 11-23 to 11-28 | S37 (PR #218), S38, S41 | S43 (PR #222), S61, S14, S42, S48 | — |
| 11-29 to about 12-05 | Composer back end | S66, then S18 and the Composer screen pieces | S40, S57, S58, small fixes |
| about 12-06 to 12-20 | Composer back end, then the rest of S51 | Composer screen pieces | S19, then S20 |

Once S66 merges, S18, S19 and S20 each start on the first free lane; the table shows the planned
order. S35, S28 + S60, S44, S45, S46, S47 and S62 run once the Composer frees a lane.

## The 2026-12-20 checkpoint

"Remaining" uses this file's numbers: the middle of each unmerged row's range. Nothing is
re-estimated on the day.

| Mark | Must be true |
|---|---|
| 1. Composer (mandatory) | the dispatch tools merged, and S51 pieces worth at least 13 build days merged |
| 2. Navigation (mandatory) | S66 merged and look-reviewed |
| 3. Gate rows | S37, S38, S41 to S43, S48, S49, S50, S57, S58, S61, S14 merged |
| 4. Other tabs | S18 and S19 merged or in review; S20 started |
| 5. Remaining (mandatory) | 36 build days or fewer (12 working days × 3 lanes to 2027-01-03) |

- **Ahead:** all five, and 25 or fewer remaining.
- **On pace:** marks 1, 2 and 5, and one of 3 and 4.
- **Behind:** mark 1, 2 or 5 missed. Then the release date moves, not the scope: S54, S47 and
  any replay work (S19 or S62, as S53 builds nothing) stay in 1.1, and only pop-out windows (S19) may move to 1.2. The date moves as
  little as it can (decision 8).

## Blue's steps in this schedule

Steps on BLUE-CHECKLIST.md, with dates as planned on 2026-11-22 and re-dated on 2026-11-24. The
checklist stays the source of truth for each step's instructions.

| When | Step | Minutes |
|---|---|---|
| 2026-11-22 | merge the plan-change PR (#212) | done (merged 2026-11-22) |
| 2026-11-24 | answer this file's open decisions; 64: hand over the schedule | done (decisions 6 and 7 still open) |
| 2026-11-24 | 60: Composer prototype day | a working day + 45 to 90 |
| 2026-11-25 | finish the Composer v1 scope | 60 to 150 |
| 2026-11-27, earlier if ahead | 55: aquarium trial part 2; the design visuals (step 55 as written needs S20's PR, which the lane plan puts after 12-06; which trial this date is for is to confirm) | 35 to 80 |
| 2026-11-27, before it if ahead | 58: lessons review; 68: verdict on S48's OSS record | 45 to 55 |
| 2026-11-30, then weekly to 12-28 | 63: Codex check-in | 5 to 10 each |
| 2026-12-01 | scope freeze; 56: memory setup | 50 to 70 |
| 2026-12-03 | Composer re-scout | 15 |
| 2026-12-04 | 35, once S35 merges | 15 |
| 2026-12-20 | the pace checkpoint | 15 to 30 |
| per tab | one batched PC check, then 2 working days of real use | 50 to 65 + the days |
| release week | final PC check; 17: token audit; release merge | 90 to 120 |

## Decisions

Decided (Blue's words are in docs/DECISIONS.md, 2026-11-21 and 2026-11-24):

| # | Decision | Blue's answer |
|---|---|---|
| 1 | Split S18 into the shared navigation (S66) and the brain tab (S18); S18, S19 and S20 each wait only for S66 | Yes (2026-11-22); in the plan since PR #212 |
| 2 | S59's date wording: goal 2027-01-15, all of 1.1 within 60 days of 2026-11-17, checkpoint 2026-12-20 | Yes (2026-11-22); in S59 since PR #212 |
| 3 | Merge the 2026-11-22 plan-change PR (it also narrows S50's needs to S49's pre-prototype pieces) | Done: PR #212 merged 2026-11-22 |
| 4 | Step 58 by 2026-11-27, before that Friday if the work runs ahead; if it isn't done, the agent tune-up (S28, S60) runs from the lessons draft as it is | Yes (2026-11-24) |
| 5 | Mako's main chat keeps the Claude lanes full, starting the next row as each finishes; Blue doesn't open lanes daily | Yes, as revised (2026-11-24) |
| 8 | If 12-20 says behind, the date slips instead of moving S54, S47 or the replay work to 1.2; only pop-out windows may move | No to moving them (2026-11-24) |

Still open (pending Blue):

| # | Decision | Recommendation |
|---|---|---|
| 6 | Run the 2026-12-20 checkpoint in that day's brief | Yes |
| 7 | Steps 56, 58 and 60 minutes: 45 to 65; 30 to 40; a working day + 45 to 90 | Yes |
