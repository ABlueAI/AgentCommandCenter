# Blue Helm — Master Status & Runbook
### ⭐ Open THIS file first. The other briefs are deep reference only.

**What this is:** the current project-state source of truth plus the historical
execution plans that produced the present baseline. Use the **August 14 release
scope reset checkpoint below** for current 1.0 scope and ordering. Older
checkpoints and dated plans remain as provenance and are not active promises.

**⏱ CURRENT SHIP GOAL:** Blue Helm 1.0 is Blue's personal Windows daily driver:
an agent supervisor for coding orchestration, Video Scout research, and
one-place access to daily business destinations. Finish the seven active items
in the August 14 checkpoint, pass their security and human gates, complete a
full daily-driver day, and then run the release gate. Portable family
distribution is deferred to 2.0; 1.0 is not a public Store launch or permanent
feature freeze. Four days yields 1.0 only if every discovery gate passes;
otherwise it yields a release candidate plus an explicit blocker list.

**Functional acceptance rule:** a visible control must work end-to-end, show an
honest in-progress state, and surface failure visibly. A dead button, silent
module-load failure, unreachable output, or feature that exists only in code is
not complete. Every included surface receives a human smoke test in addition to
its automated gate before the current ship goal is called complete.

**The reference docs (open only when you need deep detail on a step):**
- Historical Video-scout / Gemini SDK detail →
  `docs/source-material/2026-07-14-browser-transfer/expanded/files-1/BLUE-HELM-VIDEO-SCOUT.md`
- Historical fence-security detail (WO-1…WO-7) →
  `docs/source-material/2026-07-14-browser-transfer/expanded/files-1/BLUE-HELM-READ-FENCE-TEST-BRIEF.md`
- Full audit findings → `AUDIT-REPORT.md` (in-repo, @ `fad5ebc`)

**What we're building (one line):** a self-hosted "mission control" desktop app
that runs several AI coding agents in parallel — each sandboxed and supervised —
and makes Video Scout research plus daily business destinations reachable from
one place. Native CRM/mail data panels are not required for 1.0.

**Standing rules (do not violate even under time pressure):**
- Feature branches always; `main` is merge-only. One invariant per branch.
- Reviewer verdicts are read **verbatim** at the merge gate — never summarized.
- **Queue-label convention:** every forward sequence must say **remaining
  work**. A sequence without an explicit already-complete inventory has caused
  fresh reviewers to report shipped features as missing. The current checkpoint
  must name both what is already complete and what remains.
- **Gate tier is declared in every work order, with a one-line blast-radius
  rationale.** Chore-class is direct-to-`main` only when the existing three
  chore conditions hold. **Standard-class** is one-invariant branch → ONE
  scoped Reviewer pass over the named load-bearing hunks → merge; use it when
  worst-case failure is recoverable and non-destructive. **Full-class** is the
  multi-round whole-diff/delta-review path, reserved for security boundaries,
  credentials, destructive operations, or cost-direction guards. Applying
  Full-class to Standard-class work is cost without risk reduction. Mixed work
  names its Full-class hunks explicitly; the remaining hunks are Standard.
- **Diff size is a scoping signal.** If a one-shot or small-surface work order
  produces a large diff, the work order was wrong before review started. Cap
  the brief to the safety contract that matters; do not test or review the
  entire adjacent surface by reflex.
- Failure paths must **refuse visibly** — never silently downgrade/drop.
- Error/exception paths must exit cleanly with a visible message — never crash,
  segfault, or emit a native assertion (see K5: libuv `UV_HANDLE_CLOSING` on
  the 503 path). This is the refuse-visibly rule applied to failure paths, not
  just guard paths.
- Diff transport for gates: always pin the diff to a gitignored
  `.agent-review*.diff` via `git diff main...<sha> --output=` — inline paste has
  failed on every gate attempted (3×+). Until R1 (in-app diff+merge-gate UI)
  exists, treat R1 not as post-ship polish but as the standing fix for the
  project's most reliable recurring failure mode.
- Reviewer subprocesses use the workspace's approved network-enabled launch
  path from the first attempt. A sandboxed `ConnectionRefused` is runner
  configuration failure, not a review attempt; correct it before counting a
  Reviewer pass.
- The fence gate is sacred: business-widget credentials live main-process-side
  via `safeStorage`, never enter any PTY env, never reach the renderer beyond
  display data. No agent role gets email/CRM access by default.
- Full Electron **process restart** to load renderer/main changes (not reload).
- **OSS POLICY (Blue, July 10 — two layers):**
  **(1) Orchestrator/agent layer — OWN THROUGH THE CORE BUILD.** Peer
  orchestrators are a pattern mine during Handoff #4 and Day 1–3 execution:
  study session lifecycle, diff-review UX, kanban states, and status detection,
  then implement only what is needed behind our fence. Near the end of the
  current completion plan, run R15's time-boxed fork/replacement evaluation.
  No peer code enters the production branch and no migration begins without a
  separate explicit human decision after that evaluation. Credential and
  business-data boundaries remain ours regardless of the result.
  **(2) Utility libraries — adopt as whole, vetted deps** instead of building
  from scratch (Excalidraw/esbuild is the model; dockview-core, DOMPurify,
  ripgrep qualify). Vetting gate per dep: permissive license (MIT/Apache/BSD;
  flag GPL/AGPL) · `npm audit` clean · active maintenance + real adoption ·
  pinned in lockfile · telemetry/phone-home checked and disabled · transitive
  weight sanity-checked.
  Across both layers: **never paste code fragments** into security-sensitive
  paths (IPC handlers, PTY plumbing, credential handling, validators) — those
  are always read-and-re-implemented. Whole audited libraries in, loose
  snippets out, peer-orchestrator code never.

**Model-routing reminder (Blue, July 23):** every work order starts with a
model recommendation. Preference order is **Fable → Opus → Sonnet**, while
still matching model cost to task risk:

- **Fable** first while Blue's usage credits remain — architecture, substantial
  implementation, OSS integration, and difficult multi-file work.
- **Opus** for deep architecture/security assessment and as Reviewer for
  credentials, IPC, cost guards, destructive operations, and other Full-class
  boundaries.
- **Sonnet** for bounded implementation, mechanical deltas, tests,
  documentation, and small Standard-class work.

Builder and Reviewer remain separate roles. Fable may route guarded subjects to
Opus; the model indicator is authoritative, while prose style is not evidence
of a routing failure.

**OSS procurement protocol (Blue, July 23):** before building commodity
infrastructure, ask whether a maintained OSS library or official SDK already
solves it. Good candidates include layout engines, terminal addons,
authentication libraries, vendor API clients, sanitizers, and search tools.
Blue Helm continues to own PTY/process authority, IPC trust, credentials,
filesystem/path validation, cost guards, manifest ownership/deletion, and role
fencing.

Run a read-only Source Scout against primary sources before adoption. Its
candidate card must cover: capability match/limits · license/commercial use ·
maintenance/releases/adoption/issues · Windows/Electron fit · framework needs ·
runtime/transitive weight · telemetry/network behavior · security advisories ·
persistence/migration implications · Blue Helm integration seams · adopt-whole
versus owned boundary · and effort. A PROTOTYPE verdict authorizes only the named
experiment, never production adoption. Never copy loose snippets into IPC, PTY,
credential, validator, cost-guard, or deletion paths.

**Two verdict levels, deliberately not the same thing.** An individual
*candidate* may be **rejected** during evaluation — an ordinary outcome of
comparing options, needing no ceremony. Blue's final *subsystem* verdict is a
separate decision and must be exactly one of:

> **ADOPT · FORK · PROTOTYPE · PATTERN-MINE · BUILD FRESH**

Two passages in this file previously ended in a single four-term set
`ADOPT, PROTOTYPE, PATTERN-MINE, or REJECT` — this protocol section and the
July 30 *Next-feature direction* section below. Both conflated the two levels,
omitted `FORK` and `BUILD FRESH`, and presented candidate rejection as a final
subsystem verdict. **Both were stale, and both are corrected here — not
reinterpreted.** `AGENTS.md` § *OSS-FIRST PROCUREMENT GATE — HARD INVARIANT* is
the authority and the five terms above match it exactly. Rejecting every
candidate does not by itself produce a subsystem verdict — it produces the
documented search evidence a **BUILD FRESH** decision requires.

**The verdict must live in a tracked OSS procurement decision record** — a
committed Markdown file under `docs/`, named for the subsystem — and be quoted
verbatim in every work order and handoff for that subsystem, which must also
identify the record by path.

**Enforcement is procedural, not automated.** `scripts/merge-gate.ps1` does not
read work-order text, handoff prose, or procurement-record contents, and it
enforces no OSS verdict; it verifies plan-declared SHAs, ancestry, clean state,
the declared handoff document's tail shape and blob identity, the pinned diff,
the predicted merge tree, and the declared gates. Blue refusing merge
authorization is the control. Automating it would require its own separately
reviewed branch.

**Dockview and cross-provider pane-status indicators are separate subsystems,
each requiring its own tracked procurement record and its own Blue verdict.**
One record cannot cover both. **Dockview has a tracked record and an ADOPT
verdict** in `docs/OSS-PROCUREMENT-dockview.md`, and its production integration
is now reviewed, human-accepted, merged at
`d23e2c28c53fa5fd23ed73dbd48a4f43c369ebc2`, gated on merged `main`, and pushed.

**Cross-provider pane-status indicators now have their own tracked record and
their own Blue verdict, and both are merged into `main` and pushed** at
`045be87973512ac532eee3868a3cc9b916f30ab0`. Tracked procurement record:
`docs/OSS-PROCUREMENT-pane-status.md`.

**The record's canonical verdict is now, verbatim:**

> BLUE SUBSYSTEM VERDICT: BUILD FRESH

Blue's full authorization, verbatim, recorded in § 13 of the record:

> APPROVE BUILD FRESH VERDICT
>
> BUILD FRESH — Pane status: build Blue Helm’s production pane-status subsystem
> as an advisory-only, human-facing indicator using official provider lifecycle
> interfaces and the reviewed Experiment A architecture. Provider events are
> unauthenticated hints and must never authorize or automatically trigger merge,
> push, approval, pane closure, process control, restart, credential access, or
> another consequential action. Begin with Claude Code only; fail closed to
> `unknown` for unverified versions; require explicit reversible hook setup and
> removal; keep logs metadata-only; preserve the Experiment A provenance
> limitation as an accepted residual.

**The earlier verdict is preserved, not rewritten.** § 12 of the record still
carries Blue's first verdict verbatim:

> BLUE SUBSYSTEM VERDICT: PROTOTYPE

That verdict authorized **bounded Experiment A**, that experiment was carried out
under it, and it is **superseded as the record's canonical ending, not withdrawn
and not reinterpreted**. It never meant production authorization and is not read
that way now.

**What `BUILD FRESH` authorizes is a production direction, not production code.**
Blue Helm owns its status normalization, lifecycle, UI, and safety boundaries
while consuming official provider lifecycle interfaces; it does **not** authorize
reimplementing provider hook systems. **Production specification and production
implementation each still require their own work order**, and neither is begun.
**Experiment B — app-server runtime testing — remains unauthorized** pending a
separate Blue scope decision, as do providers beyond Claude Code.

> **UPDATED — August 12 (decision reconciliation).** This block previously quoted
> `BLUE SUBSYSTEM VERDICT: PROTOTYPE` as the current canonical verdict and read
> *"That authorizes bounded prototype work only."* Blue has since issued the
> `BUILD FRESH` verdict above. The earlier wording is **stale, not
> reinterpreted**, and the `PROTOTYPE` verdict itself is retained verbatim.

**Experiment A has been carried out, reviewed to `VERDICT: PASS`, merged, and
pushed** at `7afd945314fc3d4430b9030ef3b2a33b1acd1feb` (August 12 checkpoint):
a gated Claude-only hook reporter over a main-owned Windows named pipe, one
pane, with a `PROTOTYPE`-labelled renderer badge. It ended with both positive
and negative results — see the checkpoint for the full split.

**The procurement gate is complete; the subsystem is not.** What is in `main` is
now a decision record **plus dormant prototype code**, still not a feature. The
prototype gates on `BLUE_HELM_PANE_STATUS_PROTOTYPE === '1'` and is inert when
unset, so no indicator runs for Blue in normal use. **Reporter provenance is
unresolved**, which is a production blocker: the badge is advisory, not
authenticated truth.

> **UPDATED — August 12.** This paragraph previously read *"The next pane-status
> action is **Experiment A** …"* and *"No detection code, reporter, indicator, or
> provider integration exists."* Experiment A is done and its code is merged, so
> both are **stale, not reinterpreted**.

> **SUPERSEDED — retained as historical provenance.** This paragraph previously
> read *"Cross-provider pane-status indicators still have no Blue verdict, so
> that separate subsystem remains unauthorized for specification or
> implementation."* That was accurate until Blue issued the PROTOTYPE verdict
> and is **stale, not reinterpreted**.

The `dockview-core` expectation in the
R3 roadmap entry remains a roadmap note, not a pane-status procurement verdict.
**Dockview's completed procurement decision did not transfer to pane-status**;
finishing Dockview satisfied Dockview's gate only, and pane-status's verdict is
its own.

## Current checkpoint — August 14 — RELEASE 1.0 SCOPE RESET; SEVEN ACTIVE ITEMS

> **BASELINE PROVENANCE.** This checkpoint was prepared on
> `codex/release-1.0-scope-reset` after a live fetch proved local `main` and
> `origin/main` equal at `bd07da5678ea604da32fee692120cf9bbc6a3c43`.
> Review and merge status belongs in the branch handoff/closeout rather than in
> this durable scope statement.

Blue authorized this documentation-only reset with the exact issuing line
`AUTHORIZE RELEASE 1.0 SCOPE RESET AND BACKUP EVIDENCE RECORD`. The detailed
plan is `docs/RELEASE-1.0-FOUR-DAY-PLAN.md`; the measured local recovery drill
is `docs/BACKUP-RECOVERY-EVIDENCE-2026-08-14.md`.

**Product boundary:** Blue Helm is an owned, self-hosted desktop **agent
supervisor / command center**, not an agent runtime or model provider. Claude
Code and Codex remain the runtimes; Blue Helm launches, isolates, arranges, and
helps Blue supervise them. The 1.0 target is Blue's personal Windows daily
driver.

**The seven active 1.0 items, in controlling integration order:**

1. Quick Links: its own structured URL-policy boundary and visible refusal.
2. Pane-status production completion, rebased onto merged Quick Links before
   its review; no paid live provider turn until turn accounting is resolved or
   mechanically bounded.
3. P1 fenced-role environment containment at
   `ipcMain.handle('pty-start') -> buildPtyEnv -> pty.spawn`, integrated after
   the PTY environment path is stable.
4. Fence completion: `pty-start` trusted-sender/classifier integrity, WO-6/WO-7,
   P4 fail-closed enforcement, and the adversarial Read/WebFetch matrix on a
   quiet system.
5. One full daily-driver day with builders idle and Blue as the instrument.
6. Clean-machine/VM installation and restore-path testing, including the
   measured Windows long-path risk.
7. Release triage and gate: blocker disposition, branch classification,
   retained evidence, and the 1.0 release decision.

**Controlling calendar and hard dependency:** before Day 1, land this reset and
the backup evidence, complete the turn-accounting preflight, and prepare the VM.
Day 1 runs Quick Links in Codex and pane-status build/unit-test work in Claude,
with no live provider turns. Day 2 is Quick Links review/merge → pane-status
rebase/review → P1 integration → the quiet-system fence test. Day 3 is the full
daily-driver day, builders idle. Day 4 is blocker triage, clean-machine test,
and release gate. **If P1 or the fence test has not passed by the end of Day 2,
the daily-driver day moves. The date never overrides the security gate.**

**Integration and review rules:** Quick Links lands first. A rebased pane-status
tip receives a fresh review; the earlier verdict does not survive the rebase.
P1 lands last because it changes the PTY environment boundary and can invalidate
assumptions reviewed in pane-status. Pane-status uses a mixed tier: Full-class
for settings lifecycle, pipe/token boundary, dead-reporter expiry, version
fail-closed, turn accounting, and consequential-action isolation; Standard-
class for badge presentation and Dockview identity. Full-class security review
comes from a fresh independent session.

**P1 implementation checkpoint — August 25:** branch
`codex/p1-fenced-role-env-containment`, forked from merged pane-status baseline
`d64192ba680d932623e5557793a159076e26d8d6`, is prepared for independent
Full-class review; it is **not merged or authorized to merge**. The existing
fenced-role predicate now selects a pure environment builder that starts from
an empty object and copies only Blue's exact Tier 1 Windows allowlist. Unfenced
panes begin with the pre-P1 admission-scrubbed base; before main-owned values are
layered, ASCII-case-insensitive ambient variants of those reserved names are
removed. Environment values are not logged. Filtering is dynamically proven, main-process wiring is
structurally pinned, and adversarial live/provider behavior remains part of the
later fence-completion item. Blue's controlling procurement disposition is:
“P1 hardens the existing owned PTY environment boundary and introduces no new
subsystem or dependency; the OSS procurement gate does not reopen.”

**P1 Revision 2 scope correction — August 25:** the P1 merge claim is limited to
environment filtering **given the existing classification decision**. The
current `pty-start` handler does not apply a trusted-sender gate, and renderer-
supplied role/Video-Scout classification is therefore not claimed as a new P1
security boundary; its integrity is explicit remaining work in item 4 above.
Source inspection established that `buildAgentCommand` exact-matches the same
role spellings without normalization and that its agent-role branch is mutually
exclusive with the Video Scout branch. A poisoned-parent comparison further
established two distinct Windows behaviors: libuv `child_process` back-fills
its required `USERNAME`, `USERDOMAIN`, and `LOGONSERVER` entries from the real
parent, while the production `@lydell/node-pty`/ConPTY path preserved their
omission. The test records libuv only as a proxy/negative contrast and uses the
production spawn mechanism for the P1 inheritance claim.

**P1 Revision 3 correction — August 25:** the focused Revision 2 verdict was
retained verbatim: `VERDICT: FAIL — CHANGES REQUESTED — NOT AUTHORIZED FOR
MERGE`. The remaining blocker was a pre-existing environment-layering shape
that became load-bearing in P1: a differently cased ambient spelling could
coexist with a canonical main-issued key, leaving Windows lookup behavior
unspecified. The builder now removes every ASCII-case-insensitive ambient
variant of the always-main-owned scrub and pane-status transport names, and of
`GEMINI_API_KEY` for Video Scout, before injecting one canonical value. Missing
or invalid Video Scout Gemini input reserves the name but injects nothing;
ambient residue is never a fallback. Pane-status names remain reserved even
when enrollment is absent. The operation uses fresh copies and a test proves
`process.env` is byte-identical before and after construction. Unrelated
ambient-vs-ambient duplicates remain deliberately unchanged; non-Video-Scout
unfenced panes also retain ambient Gemini residue as pre-existing behavior.

The real `@lydell/node-pty`/ConPTY measurement observed all constructed Tier 1
names plus the one explicit scrub key, with `added=[]`, `missing=[]`, and no
`USERNAME`/`USERDOMAIN`/`LOGONSERVER` back-fill. A separate case-poisoned Video
Scout probe observed only the main-issued scrub, Gemini, pipe, and token
sentinels. Focused results are `pty-env` **109/0/0** and the unchanged-pin gate
**26/0** (environment block `229`, handler `13205`); Pester is **955/0/0**.
The fresh 88-suite app gate attempted every suite once: 86 green and only the
two fork-point-matched pre-assertion Electron/GPU `0xC0000135` AGR candidates.
Independent focused Full re-review remains required; there is no merge
authorization.

**P1 Revision 4 correction — August 26:** the independent Revision 3 verdict is
retained verbatim: `VERDICT: FAIL — CHANGES REQUESTED — NOT AUTHORIZED FOR
MERGE`. Its remaining blocker showed that strict ASCII folding alone did not
remove non-ASCII ambient spellings whose Unicode uppercase collapses to an exact
ASCII reserved name, including dotless-i and long-s aliases of the scrub,
Gemini, and pane-status pipe names. The reserved-name omission path now applies
a second, denylist-only check when strict ASCII folding refuses a source name:
Unicode uppercase must collapse to printable ASCII and then exactly match the
already-frozen reserved set before the entry is removed. That fallback can
never admit an allowlist entry and does not globally deduplicate ambient names;
an unrelated Unicode ambient-name negative control remains present.

The pure builder and the installed `@lydell/node-pty`/ConPTY production probe
both receive all three non-ASCII poisons and prove them absent before and after
the production spawn, while the canonical main-issued sentinels remain visible.
Focused results are `pty-env` **120/0/0**, unchanged source pins **26/0**, and
admission configuration **86/0**; authoritative Pester is **955/0/0**. The two
fork-point controls and the fresh branch gate reproduced the same pre-assertion
Electron/GPU `0xC0000135` signatures exactly once. The one suffix invocation
ran to process completion with no visible failure in the retained stream, but
its output exceeded the execution window and the controller did not retain its
terminal exit code; that capture limitation is review evidence, not a green
claim. Revision 4 remains unmerged and requires its own independent Full-class
verdict.

**P1 Revision 5 correction — August 26:** the independent Revision 4 verdict is
retained verbatim: `VERDICT: FAIL — CHANGES REQUESTED — NOT AUTHORIZED FOR
MERGE`. Revision 5 does not claim that JavaScript case conversion reproduces
Windows NLS comparison. Instead, the reserved-name denylist uses a documented
conservative superset: NFKC normalization followed by lowercase then uppercase,
accepted only when the result is printable ASCII and exactly matches a frozen
reserved name. This may deliberately remove non-ASCII names Windows would keep;
it cannot admit an allowlist name. The test independently generates the complete
Unicode scalar corpus whose conservative fold can replace an ASCII substring in
one of the four reserved names, builds one environment containing the whole
corpus, and asserts the closed invariant that each reserved family is either
absent or represented exactly once in canonical ASCII spelling. The generated
corpus contains more than 1,000 aliases and covers the reviewer-named dotless-i,
long-s, Kelvin, sharp-s/capital-sharp-s, and ligature families. The non-reserved
`ſAFE_HARBOR` control traverses the ASCII-collapse path and remains present.

The installed `@lydell/node-pty`/ConPTY probe measured Windows lookup directly.
An ASCII lowercase control resolved through its canonical spelling. Each of the
eight reviewer-named non-ASCII spellings genuinely entered the child under its
exact name, while none resolved through the canonical reserved spelling on this
VM. That measurement is recorded as platform evidence, not generalized into a
Windows equivalence claim; the conservative denylist removes every measured
alias regardless. Reserved canonical values are layered before ambient values as
defense in depth, while correctness remains independent of insertion order.
`omitReservedWindowsEnv` now copies through a null-prototype intermediate so an
own `__proto__` entry is preserved without prototype mutation, then returns a
plain object.

Focused results are `pty-env` **176/0/0**, unchanged source pins **26/0**, and
admission configuration **86/0**; authoritative Pester is **955/0/0**. The fresh
88-suite app gate used the same AGR decision tree. The bootstrap and direct
integration segments each reproduced the fork-point pre-assertion Electron
`ERR_FAILED` / GPU `0xC0000135` signature exactly once; the registered suffix
from the next suite through the end completed once with exit `0`. Revision 5
remains unmerged and requires its own independent Full-class verdict.

**P1 Revision 6 correction — August 26:** the independent Revision 5 verdict is
retained verbatim: `VERDICT: FAIL — CHANGES REQUESTED — NOT AUTHORIZED FOR
MERGE`. It confirmed the containment property and found four accuracy blockers,
not a security regression. Revision 6 changes tests, assertions, comments, pins,
and evidence only; production logic is unchanged. Its six paths are all members
of the existing cumulative eight-path cap. It deliberately reopens `main.js`
after three four-path revisions solely to correct two inaccurate comments inside
the pinned handler.

The generated corpus is now derived from the reserved canonical names: after a
Unicode scalar is conservatively folded, the generator asks each canonical name
directly whether that complete folded string is a substring. There is no
character-class pre-filter to drift when a canonical name changes. The resulting
exhaustive corpus is explicitly scoped to **single-scalar substitutions**; the
whole-string production fold covers composed substitutions, and the two bounded
controls `GEMıNı_API_KEY` and `BLUE_HELM_PANE_ﬅATUſ_PIPE` prove that path. The
expected reviewer-code-point representative set is derived by the same
canonical-substring rule and asserted as exact set equality. U+FB01 folds to
`FI` and is explicitly absent because none of the current canonical names
contains `FI`; a future name containing `FI` changes the derived set rather than
silently preserving a magic count.

Before editing `main.js`, Revision 6 pre-registered that the comment-free
`229`-byte executable environment block and separate `1326`-byte cwd gate must
remain byte-identical, while the full `13205`-byte handler must move. The old
tripwire then failed exactly that way: `1326` and `229` retained their prior
hashes, while only the handler moved. The new handler pin is length `13484`,
SHA-256 `ab6f6cd37752029c52d4a89fb99331a319f8b032a011b297d78d22beeafea161`.
An independently pinned `main.js`-only diff from the Revision 4 content tip to
the Revision 6 content tip must show that the executable handler content is
unchanged and only the comments moved. The corrected main comment now describes
both facts accurately: the builder constructs explicit entries before filtered
ambient entries, and it copies at most the two exact pane-status transport names
whose values are strings.

The installed `@lydell/node-pty`/ConPTY measurement placed canonical and
ASCII-case-alias scrub names into the child environment in both insertion
orders. Both exact spellings appeared in the child's full relevant name list.
Canonical lookup returned the canonical sentinel when canonical was inserted
first and the alias sentinel when the alias was inserted first: local
**first-wins** evidence. This is not generalized into a Windows guarantee, and
correctness still relies on reserved-family removal. The test now includes an
integer-like ambient key and makes no universal JavaScript enumeration-order
claim. Its parent timeout is derived from the complete sequential probe count,
and every platform lookup must emit exactly one canonical-result marker.

Fresh focused results are `pty-env` **185/0/0**, launcher/source pins **26/0**,
and admission configuration **86/0**. Authoritative Pester is **955/0/0**, exit
`0`, in `136.58s`. The fresh 88-suite app gate followed the same once-only AGR
tree. Exact-fork bootstrap and integration controls reproduced their respective
pre-assertion parse/no-report `ERR_FAILED` and GPU `0xC0000135` signatures.
Branch bootstrap and integration matched those controls; the registered suffix
from suite 3 through suite 88 completed once with exit `0`. Therefore all 88
suites were attempted exactly once: 86 green and only the two named AGR
candidates. Revision 6 remains unmerged and has no PASS or merge authorization.

**Quick Links ruling:** it is a bounded extension of the already-owned external
launcher boundary, so the OSS procurement gate does not apply. “Extension” is
policy-only: Quick Links **must not reuse** the existing `open-external` handler.
It gets a pure URL policy module with structured parsing, `http:`/`https:` only,
trusted window and main-frame enforcement, bounded input, visible refusal, and
bounded metadata-only logging. The existing handler's prefix-regex weakness is
a separate post-1.0 finding and is not refactored in the Quick Links branch.
The product label is **Starboard Platform**, never `CRM` or `Starboard CRM`.
The 1.0 default seed set is exactly **Starboard Platform** and **Outlook Web**;
any additional default requires Blue's explicit addition before the work order.

**Backup status:** the August 14 drill proves a useful but bounded fact: two
encrypted restic 0.19.1 snapshots of `D:\Workspace` were written to a repository
on a different physical disk. The first exposed an included `.env`; the second
(`9b7f3cfe`) excluded `.env` patterns and its restore scan was clean. The source
and restore each counted 2,725 files, and a representative tracked file was read
from the corrected `D:\restore-test\D\Workspace\...` path. It does **not** prove off-site survival, scheduling,
stale-backup detection, complete secret exclusion, or independent recovery
material. Blue explicitly accepts those residuals for personal 1.0 and defers
the production backup subsystem; the evidence record is controlling and the
older “no backup exists” statement is stale, not reinterpreted.

**Explicit 1.0 deferrals:** production backup automation/off-site recovery,
Quick Check and merge-evidence automation, session persistence/resume UX,
portable family distribution, the full environment/distribution audit,
business-data MCP integration, Windows Hello/passkey merge approval, Sentry/
PostHog, and autonomous remediation. Reasons and re-entry conditions are in the
release plan; the clean-machine test remains in 1.0 even though portable
distribution does not.

**Branch closeout policy:** classify every branch as `LANDED`, `SUPERSEDED`,
`DEFERRED`, or `ABANDONED`. Delete only after its commits/evidence are preserved
where required and the exact local and remote targets are verified. Do not
delete the backup-specification branch as part of 1.0 cleanup.

> **SUPERSEDED SCOPE PRESERVED AS HISTORY.** The August 12 eleven-item queue and
> the July 23 portable-family ship goal below were accurate statements of their
> then-current plans. They are not deleted or reinterpreted, but they are no
> longer the active 1.0 scope once this checkpoint lands.

## Current checkpoint — August 12 — RELEASE 1.0 DECISION RECONCILIATION; PANE-STATUS VERDICT IS NOW `BUILD FRESH`

**Baseline:** local `main` and `origin/main` are both
**`4e6787f6dbafb482138ac4623654aa6bb63e997c`**, subject
`Merge pane status Prototype A closeout`.

**This checkpoint is written on an unmerged documentation-only branch**,
`feature/release-1.0-decision-reconciliation`, which stops for a fresh
independent Standard-class review. Nothing in it is merged or pushed, and by its
own standing control (§ *Standing control — branch reconciliation* in
`docs/DECISION-RECONCILIATION-release-1.0.md`) **nothing here is a current
release commitment until this branch lands on `main`.**

### What this reconciliation did

- **Recorded Blue's pane-status `BUILD FRESH` verdict** verbatim in § 13 of
  `docs/OSS-PROCUREMENT-pane-status.md`, which is now that record's canonical
  ending. The earlier `PROTOTYPE` verdict is retained verbatim in § 12 as the
  historical authorization under which Experiment A was carried out —
  **superseded as the canonical ending, not withdrawn and not reinterpreted.**
- **Audited every local branch not merged into `main`** — the complete set was
  exactly four — and classified each. Full record:
  `docs/DECISION-RECONCILIATION-release-1.0.md`.
- **Found two genuine Release 1.0 commitments stranded on unmerged branches:**
  independent backup and recovery, and Quick Check / work-order decision
  preflight. The Quick Check branch also carries a **verbatim Blue OSS
  procurement verdict dated July 30, 2026** that never became tracked state on
  `main`.
- **Reordered the remaining-work queue** so independent backup and recovery is
  the blocking prerequisite and the next implementation area, followed by Quick
  Check / merge-evidence reconciliation, then pane-status production.
- **Reframed Red-risk merge protection** around evidence binding rather than
  assuming Windows Hello or a passkey is the solution — see
  *Red-risk merge protection* below.
- **Adopted a standing branch-reconciliation control** so a decision can never
  again be treated as durable before its controlling tracked record lands on
  `main`.

### The process finding

> Blue Helm had no systematic reconciliation control ensuring that an approved
> decision became durable tracked state on `main`. A chat decision or
> feature-branch document was being treated as durable before it landed.

### Honest completion estimate — a planning range, not a release commitment

- **Nine workstreams were tracked on `main` before reconciliation.**
- **Independent backup and recovery adds one known commitment.**
- **Quick Check / merge-evidence reconciliation adds one known commitment.**
- **The working total is therefore approximately eleven known workstreams.**
- **A separate biometric authorization subsystem would increase that count only
  if later justified** — it is not currently counted, and it is not
  automatically a 1.0 implementation requirement.
- **Approximately 55–65% of known release-risk work remains.**
- **EDA-1, clean-machine installation, and the daily-driver day are discovery
  exercises whose findings may create additional work.** They are scheduled to
  find unknowns, so the count above can grow for legitimate reasons.

**This is a planning range, not a release commitment.** It is stated so the
remaining distance is visible, not to fix a date or a scope.

### What this reconciliation does NOT authorize

Backup implementation, Quick Check implementation, a pane-status production
specification, pane-status production code, provider commands, hooks, live model
sessions, biometric or passkey merge authorization, or any merge of the four
audited branches. **The next implementation work after this reconciliation
passes review and lands is independent backup and recovery — not pane status.**

## Current checkpoint — August 12 — PANE-STATUS EXPERIMENT A MERGED AND PUSHED; PROTOTYPE CODE IN `main`, DORMANT

> **SUPERSEDED AS THE CURRENT BASELINE — retained as historical provenance.**
> Accurate through the Experiment A merge. `main` has since advanced to
> `4e6787f6dbafb482138ac4623654aa6bb63e997c` (the Experiment A closeout merge),
> and the pane-status verdict quoted below as canonical has since been superseded
> by `BLUE SUBSYSTEM VERDICT: BUILD FRESH` (decision-reconciliation checkpoint
> above). **Every Experiment A fact recorded here remains correct**, including
> every open item — the unperformed Dockview drag, the unobserved state
> animation, the unresolved reporter provenance, and the four-against-three model
> turns. Only the current-baseline and canonical-verdict claims are **stale, and
> they are not reinterpreted**.

**Baseline:** local `main`, `origin/main`, and GitHub `refs/heads/main` are all
**`7afd945314fc3d4430b9030ef3b2a33b1acd1feb`**. Verified during closeout by
`git rev-parse main`, `git rev-parse origin/main`, and `git ls-remote origin
refs/heads/main` — the third read live from GitHub rather than from the local
remote-tracking ref.

- Merge subject: `Merge pane status Prototype A experiment`.
- Merge parent 1 (recorded pre-merge `main`):
  `3ff96bdea3e68a83cd5774c9b94b68d9cb292add`; merge parent 2 (branch tip):
  `5764ce61c8caa0b5f0de37e9f2e329a7f1a839e0`; merge tree
  `8c8be52a1440978f3f4f20d2c9ea5ea94666e8e3`, which is **byte-identical to the
  branch-tip tree** — the merge introduced no merge-time edit. The pre-merge
  `main` tree was `e9d418fa20323bbd5f346b28a717b59050086ff0`, genuinely
  different, so that tree-identity match is a meaningful check rather than a
  comparison against an unchanged base.
- Reviewed revision-4 content tip: `583688343547d957f30551c5468b418f31136761`.
  The branch tip is one handoff-only commit above it, which is why the reviewed
  tree and the merged tree differ; both are recorded rather than conflated.
- Reviewer verdicts, all retained verbatim in
  `docs/BUILDER-HANDOFF-pane-status-prototype-a-claude.md`: revision 1
  `VERDICT: FAIL`, revision 2 `VERDICT: PASS`, revision 3 `VERDICT: FAIL`, and
  revision 4 **`VERDICT: PASS`** — the review the merge rests on, with **no
  blocking defects**, four non-blocking Low editorial findings and one further
  observation. The two FAILs are historical fact, not superseded wording.
- **Independence, recorded because it was breached mid-branch:** no verdict
  between revisions 2 and 4 was genuinely independent — the same agent built and
  reviewed revisions 3 and 4, and revision 3's FAIL was a self-audit. The
  revision-4 review was performed by a **different** reviewer, which closed that
  gap before merge.
- Merge gate: `scripts/merge-gate.ps1` with plan
  `.merge-gate/plan-pane-status-prototype-a.psd1`, 838 bytes, SHA-256
  `2206b878249a310f40e9f6839f9d9eaff8f517d5cfa0357dd3696dcad5fd5169`
  (recomputed in place during closeout and matching), `documentationOnly = $false`,
  **`gates = @('app', 'pester')`**, preflight PASS, predicted tree matching the
  realized `8c8be52a…`. `.merge-gate/` is gitignored by design, so the plan is
  verifiable on this machine but is not tracked history.
- Pinned reviewed artifacts, preserved and **not regenerated**: seven in total,
  all verified at closeout. The plan's `pinnedDiff` is
  `.agent-review-pane-status-prototype-a-claude-rev4-cumulative.diff`,
  `3ff96bde...58368834`, **324,582 bytes**, SHA-256
  `db7edce273a2a07a592eb77fd4fa2b0ad718ebbc2ca2b182c52491fc83eec974`.
- **This merge landed CODE, not only a decision record** — 26 files,
  **+5,494 / −10**: 24 files under `app/` (+4,034 / −10) and 2 documentation
  files (+1,460). That is the material difference from the August 11
  Source-Scout merge, which was documentation-only.
- **The prototype is DORMANT in `main` and defaults to off.** The gate is
  `env['BLUE_HELM_PANE_STATUS_PROTOTYPE'] === '1'` — an exact string comparison,
  not truthiness. Unset, `main.js` receives an inert object whose every method is
  a no-op, the preload bridge is never constructed, and the badge module
  publishes no renderer global. **Merging prototype code neither enabled a
  prototype feature nor authorized one.**
- **Merged-`main` gates, run by Codex BEFORE push and independent of the branch
  runs:** app gate exit `0` with **52 chain entries, 3,678 assertions passed / 0
  failed**, and Pester **955 passed / 0 failed / 0 skipped**. The order was:
  merge created → parents and predicted tree verified → both merged-`main` gates
  run → **push only after both passed**. Because the merge tree `8c8be52a…` is
  byte-identical to the branch-tip tree, an independent run over merged `main`
  reproducing the reviewed figures exactly is **corroboration that the merge
  introduced nothing** — not a copy-forward.
- **The documentation-only closeout branch did not rerun those gates**, and none
  was required: its delta is three tracked Markdown files. **That is a statement
  about the closeout's scope, not about merged `main`, which was gated.**

**Experiment A is COMPLETE AS A BOUNDED PROTOTYPE — which means it ENDED with
results recorded, not that every objective passed.** Two objectives did not: the
live Dockview drag was **NOT PERFORMED** (wrong-pane-after-move remains **NOT
SATISFIED**), and visible state animation was **NEVER OBSERVED**. One security
question was answered in the negative: **reporter provenance is UNRESOLVED** — a
pane descendant can forge an allowlisted event, so the badge is **advisory, not
authenticated truth**. The run also consumed **four model turns against three
authorized**, and the origin of the extra prompt cycle is still unresolved.

**Positive results that are equally real:** the transport, the privacy boundary,
byte-identical settings reversibility, single-pane containment, live
`Notification` delivery, and **human-verified static badge rendering**
(`PROTOTYPE ○ unknown` in the visible pane header).

**Production pane-status specification and implementation, Experiment B, and all
app-server runtime testing remain UNAUTHORIZED.** A merged prototype is not an
adopted subsystem. The canonical verdict in
`docs/OSS-PROCUREMENT-pane-status.md` is unchanged and its tracked blob
`5c0803777c1ea42209aec84568eed906ac9bdad1` is byte-identical across the merge:

> BLUE SUBSYSTEM VERDICT: PROTOTYPE

**Next pane-status action: a Blue decision on what Experiment A's results
justify** — not further prototype building by default. Any next step needs its
own work order.

### ACCEPTED RESIDUALS — reporter provenance AND admission-ledger integrity

**These two sit in the same category: advisory, human-controlled, and explicitly
NOT protection against a hostile local process.** They are recorded together
because accepting one while misreading the other as stronger is the failure mode.

**Residual 1 — reporter provenance (Experiment A).** A pane descendant can forge
an allowlisted event, so the badge is **advisory, not authenticated truth**.
Unchanged by the entry below.

**Residual 2 — admission-ledger integrity (turn admission budget).** Blue's
authorization, verbatim:

> I ACCEPT THE ADMISSION LEDGER AS AN ACCIDENTAL-SPEND CONTROL, NOT A SECURITY
> BOUNDARY AGAINST A MALICIOUS OR COMPROMISED SAME-USER PANE. CORRECT THE FALSE
> PROVIDER-INACCESSIBILITY CLAIMS, REMOVE THE UNREACHABLE ROLLBACK GUARD, AND
> RETURN FOR FULL REVIEW.

What the admission budget **is**: an accidental-spend control over Blue Helm's
own controlled input paths. It bounds paid turns admitted through the controlled
prompt path, refuses direct terminal input to the controlled pane, decrements
durably before any byte reaches the PTY, does not refund a post-persist writer
failure, and refuses a plan mismatch so that raising the configured allowance and
restarting cannot top a run up.

What it is **not**: a security boundary against a malicious or compromised
process running as the same Windows user. **Such a process may locate, delete,
replace, or rewrite the local ledger directly.** Specifically — each of these was
stated falsely in earlier revisions and is now corrected in the modules' own
headers:

- Stripping the admission environment keys prevents those keys from being
  **inherited** by the pane. It does not make their values unknowable: the same
  user can read them from the ledger and choose environment values for descendants.
- It does **not** hide Electron `userData` and creates **no** filesystem
  isolation. `APPDATA` / `USERPROFILE` are present in every PTY, the ledger
  filename is a literal in readable repository source, and plain filesystem
  enumeration finds it.
- `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` concerns credentials in Claude Code's own
  subprocesses. It is **not** evidence that a same-user Claude process cannot
  reach the ledger.
- The absence of an import from `prototype-pane-status/` proves only that **no
  supported pane-status module API mutates admission state**. It is not proof of
  OS-level inaccessibility.

**Checksum protection detects accidental edits only.** Every persisted ledger
carries an unkeyed SHA-256 checksum over a canonical serialization, verified
before any run record is accepted; a mismatch fails closed visibly as
`admission-ledger-integrity-mismatch`, and the rejected file is never repaired,
deleted, or overwritten. It is **not** authentication, **not** hostile tamper
resistance, and **not** rollback prevention. A same-user process can recompute
it; replaying an earlier valid checksummed ledger is not detected; deleting the
ledger still recreates a fresh run.

Every live mutation now repeats that validated read and refuses before `save`
on an integrity or read failure. Cooperating writers — including two entirely
separate Blue Helm processes — are serialized by the ledger store’s own `wx`
lock file plus a checksum-revision compare-and-swap, which together close the
accidental duplicate-process spend path. That is the whole mechanism: it does
**not** change the same-user threat boundary above, authenticate the ledger, or
prevent replay/deletion.

**The application-wide single-instance lock was REMOVED.** An earlier revision
called `app.requestSingleInstanceLock()` unconditionally in `app/main.js` and
described it as part of the duplicate-process story. Ledger correctness never
depended on it — `app/admission-process-cas.test.js` proves the property with two
genuinely independent OS processes racing a one-turn ledger, with no application
singleton anywhere — while the global lock changed startup for every gate-off
user and made `--classic-layout` recovery unreachable whenever a Dockview
instance already held the lock. It had no separate product authority, so it was
removed rather than repaired, and no other application-wide singleton replaced
it. **No admission claim rests on single-instance startup.**

The protective input boundary is process-local and route-complete: completely
absent admission configuration leaves Blue Helm ordinary, while any malformed
attempted configuration refuses eligible Claude-pane startup visibly. Only bare
Claude and configured Claude roles may claim the run. The intended pane is
selected and durably claimed before spawn; a nonempty launch-time prompt is
refused for that pane, and spawn failure closes the claimed run and voids the
remainder. Pending/bound pane designation is separate from ledger health, so a
checksum, read, CAS, claim, or persistence failure cannot convert that pane into
an ordinary pane. Generic and durably admitted input converge at one final PTY
writer, whose admitted route uses a main-local capability unavailable to IPC or
renderer code. This remains an accidental-spend property of supported Blue Helm
paths, not same-user isolation.

**The unreachable rollback guard was REMOVED.** `REASON.STORAGE_ROLLED_BACK` and
its `highWaterAdmitted` comparison advertised a cross-restart guarantee the code
never delivered. Nothing replaces it, and **no new prevention claim replaces it.**

**BOTH ACCEPTANCES BECOME VOID AUTOMATICALLY, AND REQUIRE A NEW THREAT DECISION,
IF PANE STATUS OR ADMISSION STATE EVER:**

1. **authorizes an action**;
2. **triggers automation**;
3. **controls merge, push, approval, restart, process termination, credentials,
   or another consequential operation**;
4. **is represented as protection against a hostile local process.**

Until then both remain advisory inputs to a human who is watching. Neither may be
cited as a control in any argument that an operation is safe to perform
automatically.

## Current checkpoint — August 11 — PANE-STATUS PROCUREMENT MERGED AND PUSHED; PROTOTYPE VERDICT IN `main`

> **SUPERSEDED AS THE CURRENT BASELINE — retained as historical provenance.**
> Accurate through the Source-Scout procurement merge. `main` has since advanced
> to `7afd945314fc3d4430b9030ef3b2a33b1acd1feb` (August 12 checkpoint above), and
> the "next action is Experiment A" statement below has been **carried out**.
> Every other fact here remains correct; only the current-baseline and
> next-action claims are **stale, and they are not reinterpreted**.

**Baseline:** local `main`, `origin/main`, and GitHub `refs/heads/main` are all
**`045be87973512ac532eee3868a3cc9b916f30ab0`**. Verified three independent ways
during closeout: `git rev-parse main origin/main`, `git ls-remote origin
refs/heads/main`, and the GitHub REST API.

- Merge subject: `Merge pane status Source Scout and PROTOTYPE verdict`.
- Merge parent 1 (recorded pre-merge `main`):
  `7a102a2498cb48fdc168e20503741509c5daefd3`; merge parent 2 (branch tip):
  `258f44dc6bf6654631659d6da8ab76023552d2db`; merge tree
  `18560427f2a56c1e79418974e7f491aaa81c1766`, which is **byte-identical to the
  branch-tip tree** — the merge introduced no merge-time edit.
- Reviewed corrective tip: `291cf0bc83176e1765efe4aecb52ea31aadafdbc`.
- Reviewer verdicts, all retained verbatim in
  `docs/BUILDER-HANDOFF-pane-status-source-scout.md`: revisions 1, 2 and 3 each
  returned literal `VERDICT: FAIL`; revision 4 returned literal `VERDICT: PASS`;
  the verdict-finalization commit returned literal `VERDICT: FAIL` on one Low
  finding (a stale verification row contradicting the verdict); and the final
  focused review of `291cf0bc` returned literal **`VERDICT: PASS`** — the review
  the merge rests on. The four FAILs are historical fact, not superseded wording.
- Merge gate: `scripts/merge-gate.ps1` with plan
  `.merge-gate/plan-pane-status-source-scout.psd1`, 815 bytes, SHA-256
  `e502969aeddd411b2c2d70989844d95d11e9910528e20958f96e24571eded7a1`
  (recomputed during closeout and matching), `documentationOnly = $true`,
  **`gates = @()`**.
- Pinned reviewed artifact, preserved and **not regenerated**:
  `.agent-review-pane-status-source-scout-stale-row-cumulative.diff`,
  `7a102a24...291cf0bc`, **196,193 bytes**, SHA-256
  `f1b104ab45fc7e42b02e2739721ec377cd9b90746b5a4e7ad0be031ec1507f36`.
- **No application or Pester gate was run, and none was required.** The merge
  changed exactly three tracked Markdown files (**+2,539 / −20**) and no code,
  test, dependency, script, or configuration file; the approved plan declared no
  gates. Recorded plainly rather than omitted.

**The pane-status OSS procurement gate is COMPLETE. The pane-status subsystem is
NOT complete.** What reached `main` is a decision record — Source-Scout evidence
plus Blue's verdict. **No detection code, reporter, indicator, or provider
integration exists.** The verdict authorizes **bounded Experiment A only**;
production implementation, production specification, Experiment B, and all
app-server runtime testing remain unauthorized. **Next pane-status action:
Experiment A**, which remains remaining-work item 1.

## Current checkpoint — August 8 — DOCKVIEW MERGED, GATED, AND PUSHED

> **SUPERSEDED AS THE CURRENT BASELINE — retained as historical provenance.**
> Accurate through the Dockview merge. `main` has since advanced to
> `045be87973512ac532eee3868a3cc9b916f30ab0` (August 11 checkpoint above). The
> Dockview facts below remain correct; only the "current baseline" claim is
> **stale, and it is not reinterpreted**.

**Baseline:** Dockview production pane-layout integration is independently
reviewed, human-accepted, merged with `--no-ff`, gated on merged `main`, and
pushed. Local and remote `main` are both
**`d23e2c28c53fa5fd23ed73dbd48a4f43c369ebc2`**.

- Merge subject: `Merge Dockview: production pane layout integration`.
- Merge parent 1 (recorded pre-merge `main`):
  `1dce24c141e929c04122e8b2998277d4c2d0c728`; merge parent 2 (branch tip):
  `cddd63314709c32aac93cb4816a96502e6d528ff`; merge tree
  `bc1a0fb660999c27be537431f995828dad237e6a`, which is byte-identical to the
  branch-tip tree — the `--no-ff` merge introduced no merge-time edit.
- Corrective reviewed-code tip: `6be07912ed0ad29aa99a35994fd284aac247d036`.
- Reviewer verdicts, both retained verbatim in
  `docs/BUILDER-HANDOFF-dockview-production-integration.md`: the first
  cumulative Full-class review returned literal `VERDICT: FAIL` over
  `fba57dc4` (two MEDIUM, one LOW), and the focused Full-class review of the
  bounded corrective delta returned literal `VERDICT: PASS`. The FAIL is
  historical fact, not superseded wording.
- Human production acceptance: `HUMAN ACCEPTANCE: PASS` — a full-restart
  walkthrough of all four layout operations in which both original terminal
  PIDs survived every operation.
- Merged-main gates: app gate exit `0`, **46 suites, 3,099 assertions passed /
  0 failed**; Pester **955 passed / 0 failed / 0 skipped**.
- The first post-merge app-gate attempt stopped because `main`'s gitignored
  `app/node_modules` predated the merge and so lacked the newly merged
  packages. The merge was retained; Blue approved a bounded
  `npm install --ignore-scripts --no-audit --no-fund`, which installed only
  `dockview@7.0.4` and `dockview-core@7.0.4` from the already-tracked
  `app/package-lock.json` and changed no tracked file. Both full gates then
  passed and push proceeded. This was an environment-hydration stop, not a
  code defect.

**Dockable/resizable layout integration is complete.** Cross-provider
pane-status indicators (R4) move to the next queue position.

> **UPDATED — August 10.** All three preconditions named in the original wording
> — a Source-Scout evaluation, a tracked OSS procurement record, and an explicit
> Blue verdict — are now satisfied. The record is
> `docs/OSS-PROCUREMENT-pane-status.md` and the verdict is
> `BLUE SUBSYSTEM VERDICT: PROTOTYPE`, authorizing **bounded prototyping only**.
> Production specification and implementation remain unauthorized.

## Current checkpoint — August 8 — DOCKVIEW FULL REVIEW FAILED; CORRECTIVE DELTA GREEN

> **SUPERSEDED — retained as historical provenance.** This checkpoint was
> accurate at the corrective-delta stage, before the focused delta review, human
> acceptance, merge, merged-main gates, and push. It is preserved rather than
> rewritten so the FAIL verdict and the bounded correction that answered it
> remain visible. The current state is the August 8 merged checkpoint above.

`feature/dockview-production-integration` now carries the accepted prototype history plus the
production Phase-B and Phase-C implementations. Phase C enables four explicit operations — Save
Arrangement, Restore Saved Arrangement, Reset Current Arrangement, and Clear Saved Arrangement —
through one dependency-free layout policy shared by main and renderer. Saved/live pane sets must
match exactly; every `fromJSON` is validated immediately before use; restore/reset are transactional;
and no layout operation may create, close, restart, resume, or silently strand a PTY.

Tracked procurement record: `docs/OSS-PROCUREMENT-dockview.md`.

Blue's binding verdict, verbatim:

> ADOPT — Dockview: adopt dockview@7.0.4 as Blue Helm 1.0's production pane-layout engine using the
> reviewed prototype architecture. Preserve main-owned IPC, PTY, filesystem, credential, clipboard,
> Library, audio, and persistence authority; exclude popouts; persist only strictly validated
> versioned layout metadata; and keep pane-status indicators separate.

Status at this checkpoint: Phase-C implementation `3ffb28e857aab5ae614cd05e418aa331a10f4b08`;
fail-closed panel-enumeration correction `d203b63`; cumulative reviewed-code tip `fba57dc4` returned
literal `VERDICT: FAIL` with two MEDIUM findings (non-atomic Windows replacement fallback and hidden
pane groups passing post-apply verification) plus one LOW (`lstat` errors reported as absence).
Blue approved the bounded correction, implemented at `9d1efb839a1f5312626c9445d35f3fa3b88d8d41`.
The corrective delta is green in the app gate and awaits its focused Full-class delta review. There
is no human production acceptance, merge, or push. Dockview is therefore still **remaining work**,
and pane-status procurement must not begin until Dockview reaches its clean stopping point.

## Current checkpoint — July 23 — V3A MERGED; BLUE HELM 1.0 SCOPE FROZEN

> **BASELINE ADVANCED — August 8.** The `main` SHA in the baseline paragraph below
> was accurate on July 23 and is now historical. Local and remote `main` are both
> **`d23e2c28c53fa5fd23ed73dbd48a4f43c369ebc2`** — the Dockview production
> pane-layout integration merge — after P12 (`4c07db9`), Merge Gate v1
> (`147fb74`), V3b (`6baa732`), V4 (`22592b7`), the V4 closeout (`c58ddfa`),
> procurement governance (`1dce24c`), and Dockview (`d23e2c2`) landed. The
> scope-frozen Blue Helm 1.0
> definition in this section still stands; only the baseline SHA moved. The
> *Already complete* and *Remaining work* lists below are current as of August 8.
>
> The intermediate `1dce24c141e929c04122e8b2998277d4c2d0c728` baseline recorded
> here earlier — and the "Dockview has not reached `main`" wording that
> accompanied it — are **stale, not reinterpreted**: both were accurate until
> the Dockview merge, and `1dce24c` is retained above as Dockview's recorded
> pre-merge `main` and merge parent 1.

**Baseline:** V3a Video Scout pre-analysis focus is human-accepted, merged with
`--no-ff`, gated, and pushed. Local and remote `main` are both
`9641de3066d471452dad40042a32968652e82f68`.

- Reviewed code tip: `3fefd0998eb27ebff348fca29680f6361449e397`;
  feature branch tip: `f5b93e6`; merge commit: `9641de3`.
- Reviewer verdicts: `VERDICT: PASS` (base) and `VERDICT: PASS` (privacy
  delta), both recorded verbatim in
  `docs/BUILDER-HANDOFF-v3a-pre-analysis-focus.md`.
- Human smoke acceptance: PASS — the Video-Scout-only field resets cleanly,
  the report remains `## 1. TL;DR` first and follows the focus, Logs contain
  focus metadata only, Library/report/manifest behavior remains intact, and
  exactly one provider analysis occurred.
- Merged-main gates: app **997 passed / 0 failed**; Pester **571 passed /
  0 failed / 0 skipped**.

### Already complete — included in Blue Helm 1.0

This is load-bearing context, not historical decoration:

- Core Electron/worktree/PTY orchestration and fenced roles.
- Navigation/process hardening, secure Gemini-key storage, credential scrub,
  trusted clipboard IPC, and audio-only permission boundary.
- TTS, STT/dictation, Fast Clear, and test-reachability mutual watchdogs.
- **V1a** readable/maximizable/reflowing panes and bounded Copy Output, merged
  at `60d5230`.
- **V2** TL;DR-first and per-section TL;DR output.
- **V5a** manifests/backfill; **V5b1** durable reports/main-owned run identity;
  **V5b2** Analysis Library + in-app report reader, merged at `20f2000`.
- **V5c1/V5c2a/V5c2b** manifest-owned media inventory, successful-run cleanup,
  retention, and crash reconciliation. K1 is CLOSED at `0c633ad`.
- **V3a** optional bounded pre-analysis focus, merged at `9641de3`.
- **P12** external-launcher hardening, merged at `4c07db9`.
- **Merge Gate v1** (`scripts/merge-gate.ps1`) evidence-checked local `--no-ff`
  merge helper, merged at `147fb74`.
- **V3b** stored-report follow-up Q&A, merged at `6baa732`.
- **Dockview dockable/resizable pane-layout integration**, merged at `d23e2c2`
  (recorded pre-merge `main` `1dce24c`, branch tip `cddd633`, corrective
  reviewed-code tip `6be0791`; first cumulative Full-class review
  `VERDICT: FAIL`, focused corrective-delta Full-class review `VERDICT: PASS`,
  `HUMAN ACCEPTANCE: PASS`; merged-main gates app exit `0` with **3,099
  assertions / 0 failed** across 46 suites and Pester **955 passed / 0 failed /
  0 skipped**). Adopts `dockview@7.0.4` per `docs/OSS-PROCUREMENT-dockview.md`
  with app-owned PTY/IPC/filesystem authority, classic-grid recovery, and four
  explicit layout operations that cannot create, close, restart, resume, or
  strand a PTY. Full release record in
  `docs/BUILDER-HANDOFF-dockview-production-integration.md`. The bounded
  `dockview@7.0.4` prototype that produced the ADOPT decision passed its own
  Full-class review and human acceptance; its branch stays unmerged and
  unpushed as the retained evidence trail behind that decision.
- **V4 bounded multi-slice + V4Q report-quality gate**, merged at `22592b7`
  (reviewed range `4c07db9...0e412e0`, branch tip `7eecb1c`; independent
  Opus 5 Full-class whole-diff `VERDICT: PASS`; merged-main gates app exit `0`
  with zero failures and Pester **955 passed / 0 failed / 0 skipped**). Full
  release record in `docs/BUILDER-HANDOFF-v4-bounded-multi-slice.md`.
- Aggregate test reachability and the Pester `<5` pin are already complete;
  they are not remaining work.

### Remaining work — Blue Helm 1.0, in order

> **STALE WORDING CORRECTED — July 30.** The previous version of this list opened
> with four items that have since been reviewed, gated, merged, and pushed:
> `merge-gate.ps1` (merged `147fb74`), V3b stored-report follow-up (merged
> `6baa732`), V4 bounded multi-slice (merged `22592b7`), and P12 launcher
> hardening (merged `4c07db9`). That wording is **stale, not reinterpreted** —
> those four are now recorded in *Already complete* above, and their design
> history is retained in the completed entries and their handoff documents. The
> list below is renumbered accordingly and reordered to match Blue's
> next-feature direction recorded beneath it.
>
> **P12 is retained explicitly, not closed silently.** Its standing requirement
> — launcher hardening precedes Quick Links — is **satisfied**, because P12
> merged at `4c07db9`, before the Quick Links entry below was reached. Quick
> Links is unblocked on that axis. Do not delete this constraint; it is the
> reason Quick Links may proceed at all.
>
> **RENUMBERED — August 8, after the Dockview merge.** The two leading Dockview
> entries — the prototype adoption decision and *Dockable/resizable layout
> integration* — are complete and now recorded in *Already complete* above with
> their SHAs, both verdicts, human acceptance, and merged-main gates. That
> wording is **stale, not reinterpreted**; the design history stays in the
> completed entry and in
> `docs/BUILDER-HANDOFF-dockview-production-integration.md`. Cross-provider
> pane-status indicators therefore move up into the next queue position, which
> is what the Dockview-first sequencing was always waiting on. Moving up the
> queue is not authorization — see the gate note attached to the entry.
>
> **REORDERED AND RENUMBERED — August 12, by the Release 1.0 decision
> reconciliation** (`docs/DECISION-RECONCILIATION-release-1.0.md`). Two genuine
> 1.0 commitments were found stranded on unmerged local branches and are now
> carried forward here as entries 1 and 2: **independent backup and recovery**
> (from `codex/release-1.0-auth-backup-blockers`) and **Quick Check /
> merge-evidence reconciliation** (from `codex/docs-quick-check-roadmap`).
> Cross-provider pane-status moves from position 1 to position 3 and every
> following entry shifts by two; **their relative order is unchanged**. Nothing
> was removed. The previous nine-item numbering is **stale, not reinterpreted**.
> **Moving up the queue is not authorization** — entries 1 and 2 each still need
> their own procurement work and work orders, and neither is authorized to begin
> by this list.

> **SUPERSEDED AS THE ACTIVE 1.0 QUEUE — August 14 scope reset.** The eleven
> entries below are retained as decision provenance. The active seven-item
> release scope and deferrals are in the August 14 checkpoint and
> `docs/RELEASE-1.0-FOUR-DAY-PLAN.md`; do not execute this historical numbering
> as the current queue.

1. **Independent backup and recovery. BLOCKING 1.0 PREREQUISITE — NOT COMPLETE.**
   **Procurement gate status, August 13: Source-Scout evaluation complete;
   independent Standard-class review returned `VERDICT: PASS`; Blue issued the
   canonical tracked verdict **`ADOPT`**.** Procurement record:
   `docs/OSS-PROCUREMENT-backup-recovery.md` (verdict in its § 12).
   **Adopted engine: restic**, with an external removable copy and a separate
   encrypted **Backblaze B2** off-site repository; GitHub is an additional
   convenience and is **not** one of the required backup copies.

   **The next authorized technical stage is a bounded prototype under its own
   reviewed work order.** It must prove VSS-consistent capture to both
   destinations, off-site immutability (append-only-key immutability is the
   primary pass condition; compliance-mode Object Lock is reported separately),
   visible failed-job and stale-backup detection including **coverage
   staleness**, an allowlist-shaped credential-exclusion policy verified with
   **metadata-only** reporting, an isolated restore without the active workspace
   or GitHub, and a restore on a **different Windows machine or clean VM**.

   **Still unauthorized:** production backup configuration, production-data
   upload, unattended recurring schedules, software installation, account or
   application-key creation, and any claim that Blue Helm is protected.

   **This entry and the 1.0 blocker are NOT complete.** Completion still requires
   reviewed implementation, both destinations, visible failure and staleness
   detection, coverage-staleness detection, credential-exclusion proof,
   different-machine restore, integrity verification, and retained recovery
   evidence on `main`. **A verdict is not protection.**

   Blue Helm's release risk is not only "does the feature work" but "can this project
   survive a lost disk, a bad delete, or a compromised account." Nothing in
   `main` currently answers that. Requirements:
   - **Its own Source-Scout evaluation** and **its own tracked Blue verdict** in
     its own procurement decision record under `docs/`, per `AGENTS.md` §
     *OSS-FIRST PROCUREMENT GATE — HARD INVARIANT*. Backup tooling is a
     subsystem like any other; it does not inherit another subsystem's verdict.
     **Satisfied** — record and verdict are present on `main` at the August 14
     baseline. The production backup system remains deferred by the scope reset.
   - **At least three recoverable copies across two storage forms, with one
     off-site.**
   - **Coverage of both Git history and declared non-Git application state** —
     the second is inventoried explicitly rather than assumed, because it is the
     part GitHub does not hold.
   - **Provider secrets excluded**, with their independent recovery path
     documented separately. Backups must not become a new credential store.
   - **Integrity verification** — recorded, verifiable digests, not "the job
     reported success."
   - **A clean isolated restore drill that does not rely on the active workspace
     or GitHub being available.** A configured-but-undrilled backup is not
     completion.

   **GitHub is an off-site copy of committed and pushed Git history, and that is
   all it is.** It is **not** the sole backup, and it is **not** a backup of
   uncommitted files, gitignored artifacts, application state, configuration, or
   recovery material. Treating a remote as the backup is the specific
   assumption this entry exists to retire.

   Carried forward from `codex/release-1.0-auth-backup-blockers`
   (tip `cc440d44`, dated 2026-08-08), which is **not merged**.
2. **Quick Check / merge-evidence reconciliation.** Two related problems, kept
   deliberately distinct:
   - **A work-order decision preflight** — a canonical validated work-order
     manifest, deterministic linting, an allowlisted read-only factual
     preflight, a digest-bound review bundle, and an independent semantic review
     before high-impact work is sent. This improves **decision quality**.
   - **A merge-evidence control** — binding a literal reviewer verdict to an
     exact reviewed artifact. This is a different guarantee; see *Red-risk merge
     protection* below.

   **Neither one proves that a human review was thoughtful.** They may share a
   manifest or review bundle, but **must not be conflated without a
   specification** that says which guarantee each part provides.

   **Status: requires reconciliation under the current OSS procurement gate
   before implementation.** A verbatim Blue procurement verdict for the Quick
   Check stack, dated **July 30, 2026**, exists on the unmerged branch
   `codex/docs-quick-check-roadmap` (tip `5eb697f3`) — recorded in
   `BLUE-HELM-MASTER-STATUS.md` on that branch rather than in a tracked
   procurement record under `docs/` on `main`. **It therefore does not satisfy
   the current gate as it stands, and the stale branch text is not current
   authorization.** Reconciling it — bringing it onto `main` in the form the
   gate requires and confirming with Blue that it still stands — is its own work
   order. **No Quick Check implementation is authorized here.**
3. **Cross-provider pane-status indicators (R4, promoted) — production
   specification and `BUILD FRESH` implementation. NOT STARTED; SEQUENCED AFTER
   ITEMS 1 AND 2.** Detect
   idle / awaiting-input / done and surface it per pane across providers, so the
   app interrupts Blue rather than requiring him to poll it. Sequenced after
   Dockview so the indicators target stable pane and tab headers rather than the
   hand-rolled grid they would otherwise have to be rebuilt against; that
   prerequisite is now satisfied, because Dockview merged at `d23e2c2`.
   **The subsystem has passed its Source-Scout review and carries its own Blue
   verdict, and both are now merged into `main` and pushed** at
   `045be87973512ac532eee3868a3cc9b916f30ab0` (August 11 checkpoint). Tracked
   procurement record:
   `docs/OSS-PROCUREMENT-pane-status.md`. **Canonical verdict, verbatim:**
   `BLUE SUBSYSTEM VERDICT: BUILD FRESH` (§ 13, August 12). The earlier
   `BLUE SUBSYSTEM VERDICT: PROTOTYPE` (§ 12) is retained verbatim as the
   historical authorization for Experiment A — **superseded as the canonical
   ending, not withdrawn and not reinterpreted**.
   **Experiment A is DONE and MERGED** at
   `7afd945314fc3d4430b9030ef3b2a33b1acd1feb` (August 12 checkpoint), after four
   review revisions ending in `VERDICT: PASS` from an independent reviewer, and
   closed out at `4e6787f6`.
   **The procurement gate is complete and Experiment A is complete; this roadmap
   item is not.** What is in `main` is a decision record plus **dormant,
   gate-off prototype code** — not a shipped indicator.
   **What `BUILD FRESH` authorizes is a production direction, not production
   code.** Blue Helm owns status normalization, lifecycle, UI, and safety
   boundaries while consuming **official provider lifecycle interfaces**;
   reimplementing provider hook systems is **not** authorized. **Production
   specification and production implementation each still require their own work
   order, and neither is begun.** **Experiment B, app-server runtime testing
   generally, and providers beyond Claude Code remain unauthorized** pending a
   separate Blue scope decision.
   **Advisory-only is binding:** provider events are unauthenticated hints and
   must never authorize or automatically trigger merge, push, approval, pane
   closure, process control, restart, credential access, or another consequential
   action.
   **Before another paid live run:** the unexplained four-turn use against a
   three-turn authorization must be resolved, or enforceable turn accounting must
   be implemented first; and no live run may occur merely to gather convenient
   evidence.
   **Production acceptance requires all five:** (i) a human visibly observes the
   badge animate through real states; (ii) pane identity and status stay correct
   through a live Dockview move; (iii) a second pane cannot receive or inherit
   the first pane's status; (iv) advisory status cannot trigger any consequential
   action; (v) an absent, broken, removed, or silent hook drives the badge to
   `unknown` within a documented bounded interval — never a false `working` or
   `attention`.
   **What Experiment A left open, and what any production step must answer
   first — three distinct facts that must not be collapsed:** static badge
   rendering was **HUMAN-CONFIRMED** as `PROTOTYPE ○ unknown`; visible live state
   animation was **NOT CONFIRMED**; and the live Dockview move was **NOT
   PERFORMED**, so wrong-pane-after-move is **NOT SATISFIED**. Separately,
   **reporter provenance is unresolved** — a pane descendant can forge an
   allowlisted event, so the badge is **advisory, not authenticated truth**. That
   residual is accepted **only** while pane status is advisory and human-facing:
   if it ever becomes an input to automation or a consequential action, the
   acceptance is **automatically void** and requires a new security decision and
   review.
   The Dockview record and its ADOPT verdict never covered pane-status and were
   not reused for it. Design
   history and the original ranking remain in the R4 roadmap entry.

   > **UPDATED — August 12 (decision reconciliation).** This entry previously sat
   > at position 1, read *"NEXT IN QUEUE — BOUNDED PROTOTYPING AUTHORIZED"* and
   > *"Only bounded prototyping is authorized"*, quoted
   > `BLUE SUBSYSTEM VERDICT: PROTOTYPE` as canonical, and said *"The next action
   > is a Blue decision on what these results justify."* Blue has since made that
   > decision — the `BUILD FRESH` verdict — and independent backup and recovery
   > now precedes this entry. All of that wording is **stale, not
   > reinterpreted**; the `PROTOTYPE` verdict itself is retained verbatim in § 12
   > of the procurement record.

   > **UPDATED — August 12.** This entry previously read *"no detection code,
   > reporter, indicator, or provider integration exists"* and *"The next action
   > is **Experiment A**."* Experiment A has been performed, reviewed, and
   > merged; both statements are **stale, not reinterpreted**.

   > **SUPERSEDED — retained as historical provenance.** This entry previously
   > read *"NEXT IN QUEUE — NOT YET AUTHORIZED"* and required all three
   > procurement preconditions before any work. All three are now satisfied;
   > that wording is **stale, not reinterpreted**.
4. **Quick Links.** Configurable, main-validated HTTP/HTTPS links. **Historical
   labels `CRM` / `Starboard CRM` are stale; the correct product label is
   `Starboard Platform`.** It opens Blue's Hexona Systems login and `Outlook` opens Outlook
   Web in the Windows default browser. No embedded webviews, native CRM/mail
   panel, Electron-held business credentials, or agent access in 1.0. Its P12
   prerequisite is satisfied (see the note above).
5. **Session persistence and explicit Claude resume controls.** Restore pane
   type, role, worktree, safe presentation state, and Dockview placement.
   `Continue Latest` uses supported `claude --continue`; `Choose Session…` uses
   the native `claude --resume` selector. Never reconstruct conversations,
   parse terminal output for session identity, claim arbitrary PTYs resumed, or
   auto-restart Video Scout/paid work. Missing state refuses visibly; offer
   Restore Workspace and Start Fresh.
6. **P1 fenced-role environment containment.** Full-class credential boundary:
   explicit minimal environments; no provider/business/secret-shaped ambient
   values in fenced PTYs.
7. **Fence completion.** Finish WO-6/WO-7 live tests and implement P4 unless
    preflight proves an equivalent enforcement mechanism. Session continuation
    must reuse or deliberately extend the existing `.claude.json` coordination
    surface, cover multiple app processes (not only panes), and prevent/warn on
    duplicate continuation rather than building a second competing lock.
8. **Portable family distribution and clean-machine setup.** Before 1.0 is
    complete, replace the development-only shortcut/runtime handoff with an
    organized packaged build that Blue can install locally and give to one
    trusted family member at no recurring signing cost. Remove machine-specific
    `D:\Workspace\...` / `D:\Gemini_Video_Review\...` assumptions from the
    distribution path through explicit first-run configuration; provide
    dependency detection and setup instructions; keep credentials per-machine
    in `safeStorage` and never copy Blue's keys; audit all bundled code, native
    modules, models, and media tools for redistribution licenses; and prove
    install, launch, first-run setup, and one representative agent workflow on
    a clean Windows account or second computer. Time-box a free distribution
    route: prefer a Microsoft Store-signed MSIX if Blue Helm's full-trust
    process/filesystem behavior passes a prototype, otherwise ship a direct
    family build with exact Smart App Control behavior and recovery documented.
    Azure Artifact Signing or any recurring paid certificate service is
    optional and is not a 1.0 requirement. Ship
    `docs/INSTALL-WINDOWS.md` with every direct transfer and retain the
    investigation record in
    `docs/SMART-APP-CONTROL-AND-DISTRIBUTION.md`.
9. **EDA-1 environment and deployment assumptions audit.** After the
    portable package exists and before the functional ship-check, run the
    read-only inventory in `docs/AUDIT-SCOPE-environment-deployment.md`.
    Record every host-policy, runtime/toolchain, external-service, filesystem,
    distribution/license, network, locale/time, reboot/update, and recipient
    assumption as fact, inference, or unverified; assign blast radius,
    warning time, detection, severity, and 1.0 disposition. The highest-value
    acceptance is a clean-clone/clean-machine install using only
    `docs/INSTALL-WINDOWS.md`. The audit makes no fixes; each blocking
    remediation receives its own normally gated work order.
10. **Release gate.** **Independent backup and recovery (entry 1) is a blocking
    prerequisite of this gate**, and a plan, a procurement record, or a
    configured-but-undrilled backup is not completion — the restore drill is.
    Then resolve or explicitly accept every EDA-1 1.0 blocker,
    then run the full app/Pester/reachability gates, `npm audit`,
    Electronegativity, full Electron restart, every included control smoked,
    visible progress/refusal, metadata-only Logs, credential-boundary checks,
    no automatic paid restart, clean synchronized `main`, and accepted
    residuals recorded. Run the **branch-reconciliation enumeration** here as
    well: every local branch not merged into `main`, classified `LANDED` /
    `SUPERSEDED` / `DEFERRED` / `ABANDONED`, recorded on `main`.
11. **One complete daily-driver day.** Blue records friction, failures,
    repeated manual steps, missing capabilities, and desired improvements in a
    DOCX. Repair blockers, record/tag Blue Helm 1.0, and use non-blocking
    findings to plan 2.0.

### Red-risk merge protection — reframed August 12

**Do not restore the earlier Windows Hello / passkey language as the assumed
solution.** That framing, drafted on `codex/release-1.0-auth-backup-blockers`,
named a mechanism before it named the failure it was defending against. The
failure modes actually observed in this project are these:

- **A merge could proceed without the required verdict being bound to the exact
  reviewed change.** Verdicts are read verbatim by a human today; nothing
  mechanically ties a `VERDICT: PASS` to the specific artifact it was issued
  against.
- **A stale branch could produce a materially dangerous cumulative tree.** A
  branch that forked long ago can merge cleanly and still deliver a tree nobody
  reviewed as a whole.
- **Authenticating the person at the keyboard does not prove that the correct
  diff was reviewed.** Proving *who* approved is a different guarantee from
  proving *what* they approved, and only the second addresses the failures above.

**The primary future control is therefore evidence binding.** A Red-risk merge
path must bind and verify:

- the **literal reviewer verdict**;
- the **exact repository identity**;
- the **reviewed base and tip**;
- the **declared branch tip and handoff-only tail**;
- the **pinned-diff SHA-256**;
- the **predicted merge tree**;
- the **realized merge tree**;
- and it must **refuse on missing, stale, mismatched, or non-`PASS` evidence.**

**This is not implemented.** `scripts/merge-gate.ps1` verifies plan-declared
SHAs, ancestry, clean state, the declared handoff document's tail shape and blob
identity, the pinned diff, the predicted merge tree, and the declared gates — it
**does not parse verdict prose** and never has. Describing this protection as
implemented would be false; it is currently enforced by human review and
authorization.

**Windows Hello or a passkey may remain a defence-in-depth candidate for
genuinely Red operations, but only after its own Source-Scout work and
threat-model decision.** It is **not** automatically a separate 1.0
implementation requirement, and it is not counted as a workstream in the
completion estimate.

> **REFRAMED — August 12 (decision reconciliation).** The stranded
> `codex/release-1.0-auth-backup-blockers` entry required "a hardware-backed
> passkey or Windows Hello gesture" as a blocking 1.0 item. That branch is **not
> merged**, its wording is not restored here, and the commitment it represents is
> carried forward as the evidence-binding control above. The branch is retained
> as provenance; see `docs/DECISION-RECONCILIATION-release-1.0.md` § 3.

### Next-feature direction — Blue, July 30

**Dockview and cross-provider pane-status indicators are the next two feature
areas, in that order.** Dockview comes first so the status UI targets stable
pane and tab headers instead of the hand-rolled grid it would otherwise have to
be rebuilt against.

> **FIRST HALF DISCHARGED — August 8.** Dockview merged at `d23e2c2`, so the
> stable pane and tab headers this ordering was protecting now exist on `main`.
> The direction is retained as the reason pane-status is sequenced after Dockview
> rather than before it, not as outstanding work.

> **UPDATED — August 12 (decision reconciliation).** This note previously ended
> *"Pane-status is now the next feature area on its own."* It no longer is:
> **independent backup and recovery is the next implementation area**, followed
> by Quick Check / merge-evidence reconciliation, with pane-status production at
> entry 3. The July 30 direction still explains why pane-status follows Dockview;
> it no longer describes the queue position. That wording is **stale, not
> reinterpreted**.

**Pane-status R4's revisit trigger has FIRED.** R4 was consciously deprioritized
with an explicit condition: if pane-babysitting during the audio or V3/V4
branches became a friction point, R4 jumps the queue. It did — babysitting panes
became demonstrated friction across those branches, not a hypothetical. R4 is
therefore promoted into the 1.0 remaining-work list above rather than left in
the Tier-1 roadmap backlog. The original entry and ranking are retained as design
history.

**Each subsystem requires its own OSS procurement record before
implementation.** Per the OSS procurement protocol, each needs a read-only
Source Scout run against primary sources and a candidate card covering
capability match/limits, license, maintenance, Windows/Electron fit, framework
needs, runtime/transitive weight, telemetry/network behavior, security
advisories, persistence/migration implications, integration seams, adopt-whole
versus owned boundary, and effort. **Candidate disposition and the subsystem
verdict are two different decisions.** Individual candidates may be accepted or
rejected while the card is built; that comparison outcome is not a subsystem
verdict. Each record then ends in exactly one final subsystem verdict term:
**ADOPT, FORK, PROTOTYPE, PATTERN-MINE, or BUILD FRESH**. Rejecting every
candidate produces the documented search evidence that may support **BUILD
FRESH**; `REJECT` is not itself the final subsystem verdict.

> **CORRECTED — this paragraph previously ended "exactly one verdict term:
> ADOPT, PROTOTYPE, PATTERN-MINE, or REJECT."** That four-term wording omitted
> `FORK` and `BUILD FRESH` and presented candidate rejection as Blue's final
> subsystem verdict. It is **stale, not reinterpreted**. `AGENTS.md` §
> *OSS-FIRST PROCUREMENT GATE — HARD INVARIANT* is the authority; the five terms
> above match it exactly and match the OSS procurement protocol section at the
> top of this file.

**Dockview has satisfied this gate, and its production integration is now
finished.** Its tracked record is
`docs/OSS-PROCUREMENT-dockview.md`, and Blue's verdict is the verbatim
ADOPT line recorded in the August 8 checkpoints above. The production branch
was reviewed, human-accepted, merged at `d23e2c2`, gated on merged `main`, and
pushed.

**Pane-status has now satisfied this gate too, and its record is merged and
pushed** at `045be87973512ac532eee3868a3cc9b916f30ab0`. Its tracked record is
`docs/OSS-PROCUREMENT-pane-status.md`, and its **canonical verdict is verbatim
`BLUE SUBSYSTEM VERDICT: BUILD FRESH`** (§ 13, August 12) — **an approved
production direction, not production code: production specification and
production implementation each still require their own work order, and
Experiment B, app-server runtime testing, and providers beyond Claude Code remain
unauthorized.** The earlier `BLUE SUBSYSTEM VERDICT: PROTOTYPE` (§ 12) is
retained verbatim as the authorization under which bounded Experiment A was
carried out. It satisfied the gate
through its own Source-Scout evaluation, its own record, and its own verdict:
the Dockview record and verdict never authorized pane-status work, and Dockview
reaching `main` did not discharge pane-status's separate procurement gate — a
completed subsystem verdict covers only the subsystem it names.

> **UPDATED — August 12 (decision reconciliation).** This paragraph previously
> quoted `BLUE SUBSYSTEM VERDICT: PROTOTYPE` as the current verdict and read
> *"bounded Experiment A only."* Blue has since issued the `BUILD FRESH` verdict;
> that wording is **stale, not reinterpreted**, and the `PROTOTYPE` verdict is
> retained verbatim in the record.

**Satisfying the gate is not shipping the subsystem.** Both Dockview and
pane-status have cleared procurement, but Dockview's *integration* is complete
while pane-status's has only reached a **bounded prototype**: Experiment A is
built, reviewed, and merged at `7afd9453`, and it is gate-off dormant code with
provenance unresolved — not an integration. **A `BUILD FRESH` verdict does not
change that**: it approves a direction, and the subsystem still has no production
specification, no production code, and no shipped indicator. The gate governs
whether work may begin, not whether it is done.

> **UPDATED — August 12.** This paragraph previously read *"while pane-status's
> is not started."* Experiment A has since been performed and merged; that
> wording is **stale, not reinterpreted**. No production integration exists.

> **SUPERSEDED — retained as historical provenance.** This paragraph previously
> read *"Pane-status has not satisfied this gate: it still needs its own
> Source-Scout evaluation, tracked record, and Blue verdict."* It is **stale,
> not reinterpreted**.

### Windows launch/distribution constraint — July 26

**Direct signed-binary swap: CLOSED for Electron 42.5.0.** A bounded
checksum-verified comparison found both the installed Electron runtime and the
official Electron 42.5.0 Windows prebuilt Authenticode-unsigned. Do not repeat
the 148 MB download/investigation unless the pinned Electron version or
Electron's signing policy changes. This closes only the idea of replacing the
runtime with an officially signed upstream binary; it does **not** mean every
zero-dollar distribution route is closed.

Smart App Control can block any unsigned Electron development/family build
before Blue Helm code starts. It offers no per-app exception. On the current
development machine Blue chose the supported free resolution—Smart App Control
Off—while keeping Defender and the other independent Windows protections
enabled. This is an explicit security tradeoff, not an app defect or a silent
bypass.

| 1.0 distribution candidate | Recurring signing cost | Decision/status |
|---|---:|---|
| Direct packaged family build + `INSTALL-WINDOWS.md` | $0 | Required fallback; a recipient with SAC On must make the documented human security-setting choice. |
| Microsoft Store MSIX | $0 signing; current new-account onboarding is $0 | Preferred time-boxed prototype. Microsoft re-signs a certified MSIX, but Blue Helm must first prove its full-trust child-process/filesystem model is Store-compatible. |
| SignPath Foundation OSS signing | $0 if accepted | Eligibility scout only: requires a released, fully OSI-licensed project, verifiable builds, and Foundation approval. Never assume acceptance. |
| CA certificate / Azure Artifact Signing | Paid | Optional future convenience for direct public distribution; never a Blue Helm 1.0 blocker. Current Microsoft documentation permits US/Canada individual Public Trust identities, so do not retain the stale “three-year organization only” claim. |

Do not rearchitect Blue Helm away from Electron merely to avoid signing. That
would replace `safeStorage`, IPC, process, and window security boundaries and
requires an independent architecture decision rather than release cleanup.

### V4 × K5 retry-attribution release trigger — DECIDED July 30

**Decided against V4's actual, merged request architecture, not a projection.**
The trigger asked which of two shapes V4 would take. It took the first, and this
was verified in the independent Full-class whole-diff review of the merged code:

- **One logical provider request per run.** `buildRequestBody` emits **N ordered
  media parts** — each repeating the same validated URL via `fileData.fileUri`
  with only its own `videoMetadata` — followed by **one final text part**.
- **Zero sequential per-slice requests.** The SDK holds exactly one attempt
  loop, one `submitGeminiRequest` call site on the video path, and one
  `fetchImpl` call site; the request body is serialized **once before the loop**.
- **At most three byte-identical eligible attempts**, unchanged from K5.
  Retries are eligible 503/UNAVAILABLE only; a thrown fetch is ambiguous and is
  never retried; no quality rejection, repair, continuation, or fallback ever
  triggers another request.

**Decision: durable `requestCount` / `attemptCount` is NOT a Blue Helm 1.0
blocker under this architecture.** The exposure ceiling is three submitted
attempts per run — the pre-V4 cost surface — because N slices ride inside one
request rather than multiplying it. The metadata remains useful and stays
available as a 2.0 candidate; it was deliberately kept out of V4's
one-invariant branch and no longer gates release.

### Deferred to Blue Helm 2.0 consideration

Calculator · whiteboard · native CRM/Outlook panels · CRM/mail writes · Outlook
calendar · cost dashboard · cross-report search · remote/mobile access ·
auto-update/crash reporting · broader visual polish · R15 orchestrator
replacement evaluation · and additions identified by the daily-driver report.
Run R15 after real use so alternatives are compared against observed friction,
not hypothetical feature lists.

#### Pane status — packaged-runtime compatibility (deferred, NOT claimed)

**Blue Helm 1.0's pane-status release runtime is the unpackaged, developer-installed
Electron application run from this repository.** That is the runtime the subsystem was
built against, measured on, and is documented for. The later clean-machine/VM release
item must install and exercise **that same documented developer runtime**, including
pane-status setup, reporter invocation, removal, and recovery — pane status is *not*
excluded from it.

**No packaged-runtime compatibility is claimed.** MSIX, Electron Forge,
electron-builder, the family installer, and any other packaged runtime are untested
for pane status, and nothing in the 1.0 record should be read as saying otherwise.
Deferred to 2.0, with these specific reasons recorded now so they are not rediscovered:

- **Packaged builds may disable Electron's `runAsNode` fuse.** The hook chain runs the
  reporter as `Electron with ELECTRON_RUN_AS_NODE=1`. A build that disables that fuse
  breaks the chain outright — the shim would launch a GUI process instead of a script
  host, or fail. This is the single largest packaging risk.
- **Packaged path visibility may differ.** The hook entry embeds an absolute shim path
  beneath `app.getPath('userData')`, and the shim embeds an absolute path to the
  Electron runtime. Both may move, be virtualised, or be unreadable from outside the
  package under MSIX-style containment.
- **User-scope Claude settings are shared across Blue Helm installations.** A packaged
  install and a developer install on the same machine write to the *same* settings
  file. The install-ID ownership model handles this — it is why "another installation
  owns hooks" is a first-class, visible refusal — but it has not been exercised across
  a packaged/unpackaged pair.
- **Uninstalling without removal strands hooks.** An uninstaller that removes the app
  without running pane-status removal leaves eight hook entries pointing at a shim that
  no longer exists. This is *safe* — every stranded link in the chain is proven to fail
  silently and exit zero — but the entries remain until a human clears them, and a
  packaged uninstaller has no hook into Blue Helm's removal path.
  See `docs/RECOVERY-pane-status-hooks.md` § 7.
- **Packaged-runtime compatibility requires its own later validation.** Not an
  inference from the developer-runtime evidence, and not a small one.

## Current checkpoint — July 22 — V5 VIDEO SCOUT STACK MERGED & ACCEPTED

**The full V5 stack is human-merged to `main` and accepted.** The five reviewed
branches (V5b1 → V5b2 → V5c1 → V5c2a → V5c2b) were merged in order with
`--no-ff`, each pinned reviewed delta reproduced byte-for-byte, and both full
gates re-run green on the merged tree. This is the durable record; the older
July 18 "BUILT, pending" bullets below are provenance (their status lines are
updated to MERGED).

- **Merged `main` tip:** `0c633adf50764d8783a546beafb7308285410199` (the V5c2b
  merge commit). `origin/main` was `23dc9d5` at merge time; this record is on the
  docs-only branch `docs/record-v5-stack-acceptance` and the human pushes `main`
  after this branch merges.
- **Linear ancestry (all `--is-ancestor` verified 2026-07-22):**
  `23dc9d5 → 2e8ec32 → 2abd716 → 5f8415a → ffa27b0 → 6541f2e`, with the branch/merge
  commits `0d708c1 → 20f2000 → 429c474 → fd73172 → 0c633ad` on `main`.

**Per-branch record (fork / pre-merge-main / reviewed code tip / branch tip / merge):**

| Branch | fork/stacked base | pre-merge `main` | reviewed code tip | branch tip | merge commit |
|--------|-------------------|------------------|-------------------|-----------|--------------|
| V5b1 `feature/v5b1-report-artifacts` | `23dc9d5` | `23dc9d5` | `c28123f` (layered) | `2e8ec32` | `0d708c1258c69438b214bb677710915e634c0956` |
| V5b2 `feature/v5b2-library-reader` | `2e8ec32` | `0d708c1` | `2abd716` | `2abd716` | `20f200074a8a0e5b3ea3a18496f2a8c458c3eb06` |
| V5c1 `feature/v5c1-media-inventory` | `2abd716` | `20f2000` | `5f8415a` | `5f8415a` | `429c474d25df28fcecd1b6415f6bff5a81ec9615` |
| V5c2a `feature/v5c2a-success-media-cleanup` | `5f8415a` | `429c474` | `ffa27b0` | `ffa27b0` | `fd7317273532de0be91c5d9d72ed4c7f475d6b20` |
| V5c2b `feature/v5c2b-retention-reconciliation` | `ffa27b0` | `fd73172` | `6541f2e` | `7f0a1f0` | `0c633adf50764d8783a546beafb7308285410199` |

> **Recorded reviewed tips (per the merge packet §4):** V5b1 `2e8ec32` (branch
> tip; reviewed code `c28123f` + 1 docs-only commit) · V5b2 `2abd716` · V5c1
> `5f8415a` · V5c2a `ffa27b0` · V5c2b `6541f2e` (branch tip `7f0a1f0` carries
> docs-only commits above the reviewed code). The earlier July 18 bullets cite
> the *build-time* stacked bases (`92cacb3`/`f2cbb1c`/`c26ba1f`); those are the
> pre-FAIL-3 / pre-restack tips and are superseded by this table.

**Verbatim Reviewer verdicts (read at the gate; recorded in each branch's handoff):**

- **V5b1** — `VERDICT: PASS` (report artifacts, whole-diff) · `VERDICT: PASS`
  (content-acceptance delta, FAIL 1+2) · `VERDICT: PASS` (FAIL-3 `update_topic`
  policy, scoped). Source: `docs/BUILDER-HANDOFF-v5b1-report-artifacts.md`.
- **V5b2** — `VERDICT: PASS` (whole-diff) · `VERDICT: PASS` (LOW-1 scoped delta).
  Source: `docs/BUILDER-HANDOFF-v5b2-library-reader.md`.
- **V5c1** — `VERDICT: PASS` (Standard-class scoped). Source:
  `docs/BUILDER-HANDOFF-v5c1-media-inventory.md`.
- **V5c2a** — `VERDICT: PASS` (Full-class whole-diff + delta). Source:
  `docs/BUILDER-HANDOFF-v5c2a-success-media-cleanup.md`.
- **V5c2b** — `VERDICT: PASS` (Full-class whole-diff base) · `VERDICT: PASS`
  (LOW-1/LOW-2 delta) · `VERDICT: PASS` (safety-test delta). Source:
  `docs/BUILDER-HANDOFF-v5c2b-retention-reconciliation.md`.

**Human live acceptance:**

- **V5b1–V5c2a stack — PASS**, marker `V5 STACK CONTENT ACCEPTANCE 2026-07-21.14`,
  accepted by Blue **2026-07-22** against the live Electron app (main + GPU +
  renderer + utility) and the CLI Video Scout route on the v5c2a tip `ffa27b0`
  (the tip that stacks v5b1+v5b2+v5c1): report leads with `## 1. TL;DR`, Library
  Open Report resolves correctly, manifest stays `outcome: completed`, and only
  the newly downloaded manifest-owned `.srt` was deleted (`state: deleted`,
  populated `deletedAt`, `deletionReason: completed-analysis`).
- **V5c2b — PASS**, accepted by Blue **2026-07-22** against a disposable `%TEMP%`
  fixture (**no `-Apply` against the real downloads root**): dry-run made zero
  changes (`manifest.json` SHA-256 unchanged, artifact `state: present`,
  `owned.srt` present, `runsMutated = 0`); `-Apply` removed **only** the
  manifest-owned media; the unowned sibling, report, manifest, and run directory
  survived; the manifest records `state: deleted` + `deletionReason: retention-error`
  + populated `deletedAt`; fixture cleanup ran through the guarded path (direct
  parent == `%TEMP%`, leaf begins `vsret-accept-`).

**Pinned-diff reproduction — six of six MATCH (byte-for-byte, 2026-07-22):**
`23dc9d5...92cacb3` (v5b1 report) · `92cacb3...c28123f` (v5b1 FAIL-3) ·
`2e8ec32...2abd716` (v5b2) · `2abd716...5f8415a` (v5c1) · `5f8415a...ffa27b0`
(v5c2a) · `ffa27b0...6541f2e` (v5c2b code tip). Verify v5c2b at the **code** tip
`6541f2e`, never the branch tip `7f0a1f0`.

**Final merged-`main` gates:** app **939 passed / 0 failed**; Pester **521 passed
/ 0 failed / 0 skipped**.

- **K1 (video download cleanup / auto-delete) is CLOSED** by the merged and gated
  V5c2b implementation (bounded cross-run retention/reconciliation sweep for
  error/refused/abandoned runs + crash-interrupted deletion reconciliation), on
  top of V5c2a's successful-current-run cleanup. See the K1 entry below.
- **Next queue position:** the V5 Video Scout stack is complete and K1 is closed.
  The next feature (V5c2b's successors in the V-series / V5d, or any other item)
  does **not** begin without a new work order.

## Current checkpoint — July 18

- **Repository baseline:** `main` @ `60d5230` after the human-approved V1a
  no-fast-forward merge. Both gates were re-run green on the merged tree: 275
  Pester assertions and 875 app assertions. All Day-0 security modules, K8's
  media-permission boundary, V1a's bounded clipboard IPC boundary, and the full
  `npm test` runner remain present.
- **`analysisMode` fail-closed: COMPLETE.** The last invalid-mode silent
  cost-direction path is merged.
- **V5a manifest + legacy backfill: COMPLETE.** New accepted runs write the
  shared-schema manifest. The authorized one-shot `-Apply` sweep created and
  schema-validated 12 legacy manifests: every one records `route:"cli"` as a
  code-control-flow inference pinned to `efd76f8bf8c86548c1479cd3e2852d49cce36317`,
  keeps canonical `startedAt=null`, and retains its folder stamp only in
  explicit approximate provenance. The sweep reported 0 skipped, unsafe, or
  failed directories.
- **V5b1 report artifacts + main-owned run identity: MERGED (`feature/v5b1-report-artifacts`,
  reviewed tip `2e8ec32` / reviewed code `c28123f`; Reviewer `VERDICT: PASS` ×3 verbatim in the
  handoff; human live-accepted 2026-07-22; MERGED @ `0d708c1`; see the July 22 checkpoint above).**
  Prerequisite fact recorded before implementation:
  the real downloads directory holds **23 schema-valid manifests with 0 non-null
  `reportFile` values** — those runs stay metadata-only forever ("No report was
  persisted for this run"); V5b1 does NOT parse terminal output/logs/paths/PTY history
  to reconstruct them (that would recreate the P9 untrusted-output parser and fabricate
  history). What V5b1 delivers:
    - **Main-issued run identity.** Main generates the run ID (clock + PID + crypto
      randomness, `app/video-scout-run-id.js`) when an app launch is accepted and passes
      it as a discrete `-RunId` to feed-gemini.ps1. Four explicit negative rules, tested:
      the renderer never generates it, never supplies it, never derives it from a path,
      and it is never parsed from terminal output (no terminal-output parser introduced).
      PowerShell re-validates the complete value before any filesystem use and creates the
      run dir as a direct child of the fixed downloads root, refusing separators,
      traversal, rooted paths, malformed stamps/PIDs/suffixes, over-length, and
      collisions. Main keeps a pane→runId map that SURVIVES PTY exit (so V5b2 can open the
      finished pane's report) and is removed on explicit pane close / window shutdown; it
      is never returned to the renderer.
    - **Bounded untrusted-report write contract.** A streaming collector caps the persisted
      report at 1,000,000 UTF-16 units, keeps the BEGINNING (TLDR-first), reserves room for
      and appends a truncation marker inside the cap, never splits a surrogate pair, counts
      total size numerically, and never accumulates the whole stream (every provider stdout
      line still streams live to the pane). Report text is never sanitized/interpreted/
      rendered/executed and never appears in Logs (only run ID, counts, `truncated=true`).
    - **Atomic report-before-manifest ordering.** On a clean provider exit only: finalize
      the bounded text → write a unique temp inside the run dir → flush/close → atomic
      rename to the constant `analysis-output.txt` (create-only, UTF-8 no BOM, no copy
      fallback) → and only THEN complete the manifest to `outcome:"completed"` +
      `reportFile:"analysis-output.txt"`. A nonzero exit, thrown exception, refusal,
      interrupted run, exhausted K5 retry, or empty clean output persists NO report and
      leaves `reportFile` null (existing refused/error behavior stays authoritative; K5
      retry behavior is unchanged). Crash truth is honored, not "repaired": a pre-rename
      crash leaves no report and no pointer; a post-rename/pre-manifest crash leaves an
      orphan report that V5b2 ignores because the manifest does not point at it.
    - **Shared validator reuse.** `reportFile` remains defined/validated only in
      `scripts/lib/video-scout-manifest-schema.ps1`; the single validator now also enforces
      that a non-null `reportFile` is a bounded leaf filename (no separators/traversal/drive
      /control/bidi), uses an approved plain-text extension, and is permitted only with
      `outcome:"completed"`. A null `reportFile` stays valid for all historical/backfill/
      failed/refused/incomplete/non-analysis manifests — that backward compatibility is
      what keeps the 23 existing report-less manifests valid metadata-only history. The new
      app-launch orchestration (not fabricated historical validation) is what guarantees
      future successful app runs have reports. Applied to BOTH production routes (SDK and
      CLI: direct `node gemini.js` + the fallback shim); `-NoFeed` remains non-analysis and
      metadata-only, and the app never launches with `-NoFeed`.
    - **V5b2 remains the separate Full-class read boundary** (in-app report reader using the
      main-owned pane→run identity and this same shared validator — no second JS schema/
      validator). **V5c (retention) and V5d remain untouched.**
  Gates on the branch: app **899/0**, Pester **333/0/0**. Standard-class Reviewer PASS.
  V5b1 later took a Full-class clipboard IPC delta and a Standard content-acceptance delta
  (leading `## 1. TL;DR` + native-output UTF-8 decoding); reviewed tip is `92cacb3`.
- **V5b2 Analysis Library + in-app report reader: MERGED (`feature/v5b2-library-reader`, reviewed
  tip `2abd716`, stacked on the merged V5b1 tip `2e8ec32`; Reviewer `VERDICT: PASS` ×2 verbatim in
  the handoff; human live-accepted 2026-07-22; MERGED @ `20f2000`; see the July 22 checkpoint
  above).** Full-class renderer→filesystem READ boundary. One invariant: the renderer
  lists/reads only bounded, schema-valid Video Scout records/reports selected through MAIN-OWNED
  identities; it never supplies or receives filesystem paths, and untrusted manifest/report content
  renders only as inert plain text. What V5b2 delivers:
    - **One shared trusted-IPC sender gate** (`app/trusted-ipc-sender.js`), extracted from the V1a
      clipboard boundary and reused by BOTH clipboard and V5b2 — no duplicate gate. Same four
      fail-closed checks (trusted window / own webContents / main frame / exact ENTRY_URL); torn-down
      frames refuse instead of throwing; clipboard behavior + reason constants byte-for-byte
      preserved (all clipboard tests green).
    - **One PowerShell library boundary** (`scripts/video-scout-library.ps1` + `-core.ps1`), two
      actions (List/Read), shell-free `execFile`, JSON-only stdout, fixed timeout + bounded buffers.
      `video-scout-manifest-schema.ps1` stays the SOLE validator — **no manifest validation in JS.**
      Bounds: 5,000 run dirs (visible `capExceeded`), 256 KiB manifest, 4 MiB report, 1,000,000
      decoded UTF-16 units; strict UTF-8; reparse refusal; fixed-root direct-child containment; **Read
      re-validates everything independently of List (TOCTOU).** Invalid records are excluded but
      COUNTED with bounded reason constants (never silently omitted, never echoing hostile content).
    - **Main-owned identities.** One run root `D:\Gemini_Video_Review\downloads` (reused for the
      video-scout `-OutDir`, the listing, and report resolution). The PS index returns run IDs to
      main; the renderer requests reports only through OPAQUE main-issued handles (replaced wholesale
      per List refresh — stale/unknown handles refuse) or by pane ID. **Open Report** on a Video Scout
      pane resolves through V5b1's internal pane→runId registry (renderer sends only the pane ID; no
      run ID/path from the pane; no terminal parsing). No path is ever returned to the renderer.
    - **Honest history + dates.** A completed run with a null `reportFile` is `not-persisted` with the
      exact message `No report was persisted for this run.` — no failure implied, no reconstruction
      (no P9 parser). Live = exact UTC date; backfills = explicitly `Approximate` local stamp (never a
      fabricated UTC); missing/invalid provenance = a visible `Unknown date` bucket (never null-sorted
      away). Default sort: exact + approximate newest first, unknown last.
    - **Reader** is plain-text only (`<pre>.textContent`; no HTML/Markdown/URL attributes) with Copy
      Report (reusing V1a's clipboard consumer + 1,000,000-unit copy bound; success only after the
      clipboard IPC resolves; metadata-only Logs) and Maximize (reusing the V1a pane-maximize
      controller; Escape restores; leaving the Library tab cannot strand maximize state).
    - **No OS dispatch** (no `shell.openPath`), **no report reconstruction**, no HTML/Markdown, no
      cross-report search, no retention/deletion, no follow-up/paid requests. **V5c (retention) and
      V5d remain separate and untouched.**
  Gates on the branch: app **0 failed** (new suites trusted-ipc-sender 10, library-ipc 23,
  library-view 25; indexer Pester +28), Pester **375/0/0**. Read-only List dry-run vs the real root:
  25 runs (1 available, 3 not-persisted, 21 incomplete; 13 exact, 12 approximate), 0 invalid.
  Full-class whole-diff review + delta pass: **PASS (both verbatim in the handoff); MERGED @ `20f2000`.**
- **V5c SPLIT into V5c1 (media inventory, non-destructive) and V5c2 (deletion), and V5c2 is itself now
  SPLIT into V5c2a (current successful-run cleanup) and V5c2b (cross-run retention/reconciliation
  sweep).** The original V5c "retention" is deliberately staged so ownership recording lands and is
  proven BEFORE any deletion code exists. **V5c1 is non-destructive: it deletes/moves/quarantines/sweeps
  NOTHING and never infers ownership for existing history.** V5c2a (BUILT below) deletes only a
  successful run's OWN manifest-owned media, right after its report+manifest are durable, and only files
  a validated manifest owns — it ignores any file on disk without a recorded ownership entry.
  **V5c2a does NOT close K1**: K1 stayed open until **V5c2b** implemented bounded retention for
  abandoned/error/interrupted runs. **V5c2b is now built, reviewed (Full-class `VERDICT: PASS` ×3),
  human-accepted, and MERGED @ `0c633ad` — K1 is CLOSED (July 22).** Historical schema-v1 runs remain
  metadata-only and receive no inferred ownership or deletion; NoFeed downloads are intentionally retained.
- **V5c1 Manifest-owned media inventory: MERGED (`feature/v5c1-media-inventory`, reviewed tip
  `5f8415a`, stacked on the merged V5b2 tip `2abd716`; Reviewer `VERDICT: PASS` (Standard-class
  scoped) verbatim in the handoff; human live-accepted 2026-07-22; MERGED @ `429c474`; see the
  July 22 checkpoint above).** Standard-class (reuses the V5b2 read boundary; no new renderer→FS boundary). One
  invariant: every downloadable media artifact a future run produces is recorded in that run's manifest
  BEFORE analysis can complete; no file outside the run, no stale file, and no merely discovered file
  can become manifest-owned. What V5c1 delivers:
    - **Schema version 2** on the SINGLE shared validator (`video-scout-manifest-schema.ps1`) — one new
      top-level field `mediaArtifacts` (array, default `[]`, max 16) whose entries have the exact shape
      `{ fileName (safe leaf), kind (transcript|audio|video), sizeBytes (>=0), recordedAt (UTC), state
      ('present'), deletedAt: null, deletionReason: null }`; extension MUST match kind
      (.srt/.mp3/.mp4); array-not-object, exact-keys, case-insensitive-dup, traversal/rooted/control/
      bidi/size/timestamp/state all enforced. **Version 1 (ALL history + backfills) stays valid
      UNCHANGED and REJECTS the field; v2 REQUIRES it and is never a backfill.** Ownership is never
      fabricated for history. `reportFile` still governs `analysis-output.txt` exclusively — reports/
      manifests/temp/diagnostics are never media.
    - **Ownership recorder** (`record-video-scout-media.ps1` → `Add-VideoScoutMediaArtifact`) takes only
      the run dir, the run's own resolver `FileInfo`, the kind, and the manifest. It validates
      provenance (direct child / ordinary file / no reparse / ext==kind / exists), uses the ACTUAL leaf
      name + real on-disk size (no caller filename, no directory scan), refuses duplicates, then updates
      the manifest ATOMICALLY via the shared writer. On any failure it throws, reverts the in-memory
      claim, and leaves the file untouched. **Deletes/moves/repairs nothing.**
    - **Lifecycle** (`feed-gemini.ps1`): CLI route = v2 init → guarded download → resolver → RECORD →
      ONLY THEN the paid Gemini request → existing V5b1 report/outcome lifecycle. A recording failure
      BLOCKS the paid call, leaves the file, and claims no ownership (outcome error, or null if the
      manifest is unwritable). SDK route records nothing (remote URL, no local file). NoFeed records the
      download and may complete without a report. The yt-dlp `.vtt` temp removal is unchanged, not
      broadened.
    - **V5b2 compat**: the Library lists v1 history, v1 backfills, v2 empty inventories, and v2 recorded
      runs through the same shared validator; a bounded `mediaCount` (count only — never filenames or
      paths) is optionally displayed. No Library delete button (none authorized until V5c2).
  Gates on the branch: app **939/0** (zero new JS test files), Pester **416/0/0** (375 + 41 new: schema
  +16, recorder 12, lifecycle 11, library-core +3). Read-only List dry-run vs the real root: 25 runs,
  25 valid, 0 invalid, every entry `mediaCount = 0` (all history is v1 — ownership never inferred), no
  path/filename leak. No real Gemini request or download during implementation. Standard-class scoped
  review + delta pass: **PASS (verbatim in the handoff); MERGED @ `429c474`.**
- **V5c2a Manifest-owned successful-run media cleanup: MERGED (`feature/v5c2a-success-media-cleanup`,
  reviewed tip `ffa27b0`, stacked on the merged V5c1 tip `5f8415a`; Reviewer `VERDICT: PASS`
  (Full-class whole-diff + delta) verbatim in the handoff; human live-accepted 2026-07-22 under marker
  `V5 STACK CONTENT ACCEPTANCE 2026-07-21.14`; MERGED @ `fd73172`; see the July 22 checkpoint above).**
  **Full-class** — the first and only code that deletes a media file (irreversible). One invariant: after a run completes successfully and its report+completed
  manifest are durable, the app may delete ONLY media files explicitly owned by that same validated
  manifest; no scan, filename guess, extension glob, terminal parse, renderer path, or inferred
  ownership authorizes deletion. What V5c2a delivers:
    - **Schema-v2 artifact-state lifecycle** extended IN PLACE on the SINGLE shared validator (no new
      schema version, no second validator): `present → deleting → deleted`, plus `delete-failed` /
      `missing` — modelling that a filesystem delete and a manifest write are not one atomic
      transaction. A small persisted deletion-reason **allowlist** (`completed-analysis`,
      `owned-file-missing`, `identity-mismatch`, `unsafe-file-type`, `reparse-point-refused`,
      `filesystem-delete-failed`); no raw exception text is ever a persisted reason
      (`manifest-update-failed` is a runtime warning only). Per-state nullability: only `deleted` has a
      UTC `deletedAt`; only `present` has a null reason. **Schema-v1 history and V5c1 present-only
      manifests stay valid unchanged.**
    - **Cleanup helper** (`cleanup-video-scout-media.ps1` → `Invoke-VideoScoutSuccessMediaCleanup`)
      reloads + re-validates the durable manifest (the SOLE deletion authority), eligible only when
      `schemaVersion=2` + `outcome=completed` + non-null `reportFile` + the report exists. Per artifact,
      one at a time, from the validated `mediaArtifacts` only (never a scan): pre-authorize (fixed-root
      containment, run-dir direct-child identity, exact leaf, ext==kind, not manifest/report/temp,
      ordinary file, no reparse, size==sizeBytes) → commit intent `present→deleting` BEFORE the FS
      delete → TOCTOU re-validate → `[IO.File]::Delete` the exact literal path (no wildcard/recursion/
      shell) → `deleting→deleted` with UTC `deletedAt`. Crash truth: absent-while-present → `missing`
      (never a false deleted); absent-while-`deleting` → finalize deleted; safety refusal / OS-delete
      failure → `delete-failed`; manifest-write failure before delete leaves the file intact, after
      delete leaves durable `deleting` (never a false deleted). **TOTAL (never throws)**; a cleanup
      failure surfaces a bounded warning (run ID, counts, allowlisted reasons — no paths/content) and
      never rewrites a successful analysis into a failure. Deletes only media leaves — never a report/
      manifest/temp/directory; never moves/quarantines.
    - **Lifecycle** (`feed-gemini.ps1`): exactly ONE call, after the CLI success branch writes the
      report + completes the manifest (any CLI mode). SDK/NoFeed/error routes never reach it and retain
      media. No change to K5 requests/retries/usage/cost, the duration guard, or the V5c1 recorder.
    - **V5b2 compat**: the Library lists the new states through the same validator; the path-free
      `mediaCount` (total recorded audit entries, incl. deleted) is unchanged; no state/filename/path
      exposed; no Library delete button (V5c2a is automatic-only).
  Gates on the branch: app **939/0** (zero new JS test files), Pester **456/0/0** (416 + 40 new: cleanup
  25, schema +8, library-core +2, lifecycle +5). ALL destructive tests use temp fixture roots only — no
  real Gemini request, download, or real-root deletion during implementation. Full-class whole-diff
  review + delta pass: **PASS (verbatim in the handoff); MERGED @ `fd73172`.** **K1 was closed by
  V5c2b (below), now merged.**
- **V5c2b Cross-run retention/reconciliation sweep: MERGED (`feature/v5c2b-retention-reconciliation`,
  reviewed code tip `6541f2e` / branch tip `7f0a1f0`, stacked on the merged V5c2a tip `ffa27b0`;
  Reviewer `VERDICT: PASS` ×3 (whole-diff base · LOW-1/LOW-2 delta · safety-test delta) verbatim in
  `docs/BUILDER-HANDOFF-v5c2b-retention-reconciliation.md`; human live-accepted 2026-07-22 against a
  disposable `%TEMP%` fixture; MERGED @ `0c633ad`; see the July 22 checkpoint above).** **Full-class** —
  cross-run destructive work that edits 2 V5c2a-reviewed shared files. One invariant: only media a
  validated manifest still owns may be deleted, on runs whose retention lane (completed reconciliation
  OR error/refused/abandoned retention) and dual age gate both authorize it; no scan, filename guess,
  inferred ownership, terminal parse, or renderer path authorizes deletion, and a crash never records a
  false `deleted`. What V5c2b delivers:
    - **Two-lane eligibility.** (1) *Completed-run reconciliation* finalizes/reverts crash-interrupted
      `deleting`/`delete-failed` artifacts left by V5c2a on `outcome: completed` runs, preserving the
      pre-existing durable `deletionReason`. (2) *Retention cleanup* deletes the owned media of aged-out
      `error`/`refused`/`abandoned` runs under new authorization reasons `retention-error` /
      `retention-refused` / `retention-abandoned`. Both lanes reuse the SINGLE shared validator and the
      V5c2a `Remove-OneVideoScoutMediaArtifact` authority (now parameterized with a `-DeletionReason`
      defaulting to `completed-analysis`, so V5c2a's behavior is byte-for-byte unchanged).
    - **Bounded, fail-closed sweep** (`scripts/lib/retention-sweep-video-scout-media.ps1` + thin CLI
      `scripts/video-scout-retention-sweep.ps1`): dry-run by default; refuses the whole invocation if
      candidates exceed `MaxRunCandidates` (5000, inspects ≤5001); caps mutations at `MaxMutatedRuns`
      (100); dual age gate (validated `finishedAt ?? startedAt` and `manifest.json` LastWriteTimeUtc,
      fail-closed on missing/invalid/future) with a 1-day `ValidateRange` floor that exceeds the
      4-hour duration ceiling; ordinal-sorted enumeration; non-blocking `Local\` named mutex
      (`WaitOne(0)`, `AbandonedMutexException` treated as acquired); `-RetryDeleteFailed` re-attempts
      only `filesystem-delete-failed`. Preserves manifests/reports/NoFeed/schema-v1/sibling files.
    - **Schema/validator transition:** retention reasons added to the deletion allowlist and a new
      authorization subset; the validator now requires `deleting`/`deleted` to carry an authorization
      reason while failure states keep the broader allowlist. Schema-v1 history and V5c2a
      present/completed-analysis behavior stay valid unchanged.
  Gates on the branch: app **939/0** (zero JS changed), Pester **521/0/0** (478 + 43 new). ALL
  destructive tests use temp `%TEMP%` fixtures only — no real-root `-Apply` during implementation.
  **This closes K1.**
- **V2 report TL;DRs: COMPLETE.** The prompt preserves its report-leading
  Section 1 TL;DR and now requires an evidence-grounded one-line Section TL;DR
  for Sections 2–9. Standard-class review passed; Pester is 216/216.
- **Live Test D: COMPLETE.** Transcript launch contained no
  `--start-offset` or `--end-offset`, no stale-range `BUG:` line, and reopened
  video fields were empty. The later Gemini 503 is tracked separately under K5
  and does not invalidate the stale-range result.
- **Audio status corrected from “built, needs testing” to “implemented but
  nonfunctional on current main.”** A read-only code scout verified two startup
  blockers: TTS dereferences a Kokoro bundle API that its tracked browser bundle
  does not export, while STT imports a browser module with unresolved bare ONNX
  imports; that STT runtime file is also gitignored and absent from `HEAD`.
  Kokoro, Whisper, Transformers.js, and ONNX Runtime remain the intended OSS
  engines. Repair the integration and packaging; do not rebuild the engines.
- **Audio stack MERGED (July 16, `5ee435b`, marker `AUDIO ACCEPTANCE
  2026-07-16.4`):** TTS terminal live repair (selection capture, fp32/q8 device
  config, latest-request-wins playback), STT/Whisper bootstrap (official
  @huggingface/transformers 3.8.1 bundle, tested env contract, webgpu→wasm
  fallback with throttled visible progress, destination-pane lock, no
  transcript text in Logs), dictation accuracy upgrade, and agent-pane
  mouse-mode selection via xterm's public `select()`. Human acceptance passed
  Dictate + PowerShell TTS on `.3` and drove the `.4` mouse-selection repair;
  Blue authorized the merge. Each branch carried its own Reviewer PASS. This
  closes K7. Voice Console with final transcript review remains roadmap work;
  advanced sequential TTS queueing stays deferred; every future item must
  retain and announce its source agent name and role.
- **K8 media-permission hardening MERGED (July 16, `acf1aee`, marker
  `K8 ACCEPTANCE 2026-07-16.5`):** media permission is granted only when the
  current trusted window's main frame requests microphone-only access from the
  exact entry document (one pure policy module feeds both Electron session
  handlers; legacy `audioCapture` allowance removed; every other permission,
  requester, or media shape denied fail-closed with a bounded visible refusal).
  Trust facts pinned by a bounded Electron 42.5.0 runtime probe; live proof:
  camera-only and mixed getUserMedia denied before access with Logs refusals,
  Dictate's audio-only path granted. Full-class whole-diff Reviewer
  `VERDICT: PASS` (2 LOW non-blocking); Blue live-accepted and authorized the
  merge. Branch record: fork/pre-merge main `a02c17b`, tip `e1fdd1f`, merge
  `acf1aee`. This closes K8. The later TTS Fast Clear / high-speed enunciation
  improvement is now merged; see the July 17 checkpoint below.
- **9c timestamped transcript output + P13 duration-guard hardening MERGED
  (July 17):** 9c now gives default transcript analyses caption-derived
  timestamp citations, a chronological timestamp map, and whole-second suggested
  ranges; Blue live-accepted the timestamp output. P13 makes range shape/mode
  refusals self-defending, removes ambient guard inputs, caps overrides at
  14,400 seconds, surfaces bounded probe failures, anchors the yt-dlp backstop,
  and corrects the obsolete `setx` documentation. Reviewer verdicts were
  `VERDICT: PASS` (9c Standard-class; P13 Full-class). Ordered branch record:
  9c fork/pre-merge main `d8d0931`, tip `0dd0c40`, merge `51a21b8`; P13 fork
  `0dd0c40`, tip `e9275c8`, merge `b4519ec`. Post-merge gates: app 529/0,
  Pester 267/0/0.
- **K5 Gemini SDK 503 recovery MERGED (July 17, `db8b61e`):** explicit
  503/`UNAVAILABLE` responses receive at most three byte-identical attempts with
  bounded visible backoff; terminal and ambiguous failures do not retry; the
  CLI now drains naturally instead of racing libuv through `process.exit()`;
  output and usage remain once-only. Full-class whole-diff and CRLF delta
  reviews both returned `VERDICT: PASS`. A real local HTTP fixture proves the
  bounded retry and natural-shutdown paths; the provider-side race was not
  reproduced in 120 bounded fixture runs, and Blue later completed a successful
  SDK-route run after provider capacity pressure cleared. The root cause remains
  plausible, not proven. Branch record: fork/review base `d8d0931`, actual
  pre-merge main `7c94680`, tip `b60bb1b`, merge `db8b61e`. Post-merge gates:
  app 529/0, Pester 271/0/0 (including the real 105-assertion Node SDK suite).
- **TTS Fast Clear + test-runner reachability MERGED (July 17):** Fast Clear
  synthesizes natural-speed Kokoro audio and applies pitch-preserving playback
  acceleration; Blue live-accepted the 2x clarity as remarkable/perfect.
  Reachability-meta now fails the gate by name when any JS or Pester test becomes
  orphaned and wired the two pre-existing orphan suites it discovered. Reviewer
  verdicts were `VERDICT: PASS`; the expected `app/package.json` conflict received
  a focused post-resolution `VERDICT: PASS` after proving the exact 22-token union
  with no missing, extra, or duplicate suites. Branch records: Fast Clear fork
  `d8d0931`, actual pre-merge main `9ea95c0`, tip `03461d3`, merge `370387e`;
  reachability-meta base `3c5c949`, actual pre-merge main `370387e`, tip `c5e4610`,
  merge `b9063e6`. Combined gates: app 729/0 and Pester 275/0/0.
- **Routing decision:** ChatGPT desktop with GPT-5.6 is the primary planning,
  architecture, research, review, and project-state layer. Claude Code remains
  the primary coding surface. Codex CLI/IDE remains an optional, separate
  verifier and is deferred for now.
- **Source recovery:** browser-era project files are retained under
  `docs/source-material/2026-07-14-browser-transfer/`, with untouched originals,
  expanded archive contents, hashes, and provenance.

### Historical execution order — superseded by July 23

The sequence below is preserved as provenance. It is not the active queue.
Follow **Remaining work — Blue Helm 1.0, in order** in the July 23 checkpoint.

**Historical supersession note:** TTS terminal live repair came before STT bootstrap.
The Voice Console foundation follows successful core-audio proof and precedes
K8 permission hardening; it does not authorize that security-boundary work.

The historical order was: ~~TTS bootstrap → STT bootstrap~~ (✅ merged @ `5ee435b`) →
~~audio permission/error hardening (K8, Full-class)~~ (✅ merged @ `acf1aee`) →
~~timestamped transcripts (9c) → P13~~ (✅ merged @ `b4519ec`) →
~~K5~~ (✅ merged @ `db8b61e`) → ~~Fast Clear + reachability-meta~~
(✅ merged @ `b9063e6`) → ~~V1a~~ (✅ human acceptance passed and merged @
`60d5230`; closes K2; Open Report/OS dispatch deferred — the in-app reader
lands at V5b) → ~~V5b1 → V5b2 → V5c1 → V5c2a → V5c2b (the full V5 Video Scout
stack)~~ (✅ all five reviewed, human-accepted 2026-07-22, and MERGED in order @
`0d708c1 → 20f2000 → 429c474 → fd73172 → 0c633ad`; closes K1; see the July 22
checkpoint) → ~~V3a~~ (✅ merged @ `9641de3`) → **historical forecast only:
V3b → V4 → remaining Day 2/3 work → full functional ship-check → R15
fork/replacement evaluation. The July 23 queue supersedes this forecast.**
Each arrow is a clean
checkpoint; runtime items remain separate one-invariant branches and receive
their own Reviewer gate.

---

## ✅ DAY 0 — SECURITY GATE — **COMPLETE (July 10)**

> **`main` @ `91ca3b7`. Both live HIGHs are closed and merged.** Full detail in
> the DONE section below. Marked complete per Blue; the Day-0 restart + live
> checks are assumed done — **if the full restart (tray too) or the live checks
> (external link → OS browser + `[nav-guard]` refusal line in Logs; agent
> launch works; grid renders clean) have NOT actually been run, do them as
> Day-1 item 4 before spending anything on tests A–D.**

> **PROCESS FIXES (learned the hard way on Day 0's branches — apply to ALL
> future gates):**
> - Generate review diffs with **three dots** (`git diff main...<sha>`), never
>   two. Two-dot diffs compare tip-to-tip and render commits that landed on
>   `main` after branch creation as spurious DELETIONS in the branch's diff.
>   This blocked a clean review once already.
> - **Never ask a fenced read-only role to run pre-flight git commands** — it
>   has no Bash by design. The human runs pre-flight and pastes the output into
>   the brief, or the diff is pinned by content + stated sha (pasting the diff
>   inline failed TWICE on Day 0 — pin a `.agent-review*.diff` file instead;
>   it's gitignored).
> - **A verdict is not a verdict until the literal `VERDICT:` line is read.**
>   A findings list that implies PASS is not PASS. Also: builder sessions will
>   offer courtesy merges of other branches — always decline; every branch
>   waits for its own gate.
> - **Chore-class direct-to-`main` commits are allowed ONLY when all three
>   hold:** zero runtime-code changes · content prescribed verbatim by a
>   Reviewer verdict · verified by execution before push. Anything touching
>   app behavior — however small — goes through a branch and gate.

---

## ✅ DONE — no action needed

**Security**
- **9b — Mode-aware duration guard MERGED to `main` @ `4da1572`** (`--no-ff`,
  three-way, zero conflicts, scripts/+docs only; post-merge verified: all four
  hardening modules + tests present, npm test 205 green, run-pester 105 green,
  zero `shell: true` in app source). Gate history: full review on `cec0473` →
  FAIL (blocking: unproven SDK-route enforcement, false assertion count) → fix
  commit `6074565` (8 findings addressed; probe/guard extracted to
  `scripts/lib/invoke-duration-probe.ps1`; E2E proves `& node` unreachable on
  refusal; `run-pester.ps1` aggregate gate; 0-duration fail-open killed;
  `-MaxDurationSeconds 0` rejected at bind; MediaResolution honest logging;
  `--` before URLs; yt-dlp SDK-route hard-dep documented) → delta review PASS
  (5 non-blocking findings + residuals → P13). Also in-branch: **P10 run-dir
  collision FIXED** (GUID suffix — and P10's open question answered the BAD
  way: it collided rather than threw; real bug, silent-collision class, not a
  flake). Process note: P10 fix landed without stop-and-report — pre-existing
  bugs found mid-gate are report-first. What the guard now holds: ONE
  fail-closed pre-flight probe (duration + is_live) gating BOTH routes before
  any paid call; per-mode caps transcript/audio 14400s · video 5400s ·
  range-slice 1800s; backstop strictly weaker; refusals name
  duration/limit/mode/override.
- **Day-0 #2 + #2b — navigation lockdown + `shell:false` launchers MERGED to
  `main` @ `91ca3b7`** (`--no-ff` merge of `feature/sec-nav-shell`; history:
  `ab5c1c5` security work → `4570e37` chore (main) → `11720b8` review fixes →
  `91ca3b7` merge). What landed: `nav-guard.js` — `setWindowOpenHandler`
  default-DENY with anchored http(s)-only forward-to-OS-browser,
  `will-navigate` AND `will-redirect` fail-closed to exact entry URL, on the
  repo's only BrowserWindow site; `launchers.js` — `shell:false` discrete-argv
  specs, `%`-path refuse-visibly; visible nav-refusal logging through the
  existing `main-error` channel (sanitized: C0-stripped, 200-char cap, into a
  `textContent` sink). Gate history: first Reviewer verdict FAIL (blocking:
  orphaned tests — the P11 rot pattern recurring); fix commit `11720b8`; delta
  review PASS (6 findings, all non-blocking). 114 tests green on the merged
  tree pre-push. **Residuals promoted to P12 (HIGH)** — see PARKED.
- **Test runner fully wired (chore, direct-to-`main` per chore rule):**
  `npm test` now runs all FIVE node suites — nav-guard (26), launchers (13),
  video-scout-args (75), task-name (53), agent-dom (38) = 205 green, non-zero
  exit on any failure. Closes the delta-review's new finding 2 AND the P11
  "tests not wired into any runner" item. Friday's #9 branch stays
  single-invariant — no rider needed.
- **Day-0 #1 — XSS→RCE fix MERGED to `main` @ `25e72ad`.** The live chain
  (hostile git branch/worktree name → `innerHTML` → `ptyStart`/`ptyWrite`) is
  closed: DOM-builder module `agent-dom.js` (`textContent`/`setAttribute`, no
  string-concat HTML for git-derived values), main-side `task` validation via
  `task-name.js` on BOTH new-agent and remove-agent handlers (allowlist charset,
  no separators/`..`/control chars, length cap, Windows reserved-device-name
  rejection), refuse visibly. Remove-path validates independently of create
  (pre-existing hostile artifacts on disk are refused, not `--force`-removed —
  accepted residual documented in P9). Reviewer follow-ups batched in P11.

**Video-scout**
- Persistent analysis prompt (PR #22, merged)
- Model + resolution parameters and modal UI (PR #23, #24, merged)
- CLI argument-escaping bugs fixed (PR #25 + node-direct `ConvertTo-NodeCliArg`, merged)
- Transcript / audio / video mode toggle (merged; **transcript mode confirmed
  working** on a real 12-min video)
- Diagnosed the CLI's hard 20MB video wall → **SDK spike proved the fix and
  answered both cost questions** (LOW res cuts ~65%; section-scoping cuts ~81% of
  billing — both confirmed real)
- **SDK migration merged AND live-verified:** 9-section brief
  verified over SDK; YouTube→SDK routing with CLI fallback byte-for-byte
  unchanged; API key confirmed env-only (no key-file in merged code); per-run
  `usageMetadata` cost logging; `mediaResolution` enforced; section-offset params
  plumbed. **Live tests passed:** whole-video + a 2-min slice that billed exactly
  18.9% of tokens (proportional to duration) with content matching the slice;
  determinism confirmed (numbers reproduced exactly across two runs). 155 tests.
- **Stale-transcript bug fixed, merged, and live-verified:** the CLI transcript/
  audio path used to silently feed Gemini a leftover file from an unrelated prior
  run when a download produced nothing. Fixed by per-run subdirectory isolation
  (stale files structurally unreachable, not just timestamp-skipped); fix sits at
  the single point all three modes converge, so audio is covered too. Live-fired
  against the exact original trigger — now exits cleanly instead of substituting
  stale data. 202 assertions incl. a repro test.
- **Section-select UI built and merged (July 9):** Start/End range inputs in
  the video-scout modal (video mode only, hidden otherwise, cleared on modal
  open), accepting MM:SS / H:MM:SS / bare seconds → integer-seconds
  `-StartOffset`/`-EndOffset`. **Refusal-based validation, two independent
  layers:** renderer blocks with visible inline error; main process
  (`buildVideoScoutArgs` inside the `pty-start` handler, proven main-process via
  require chain + contextIsolation) refuses launch (`{ok:false}` before
  `pty.spawn`) on mode-gate / both-or-neither / type-range / end≤start /
  CLI-route-with-range — never silently falls back to whole-video. Builder
  independently caught + fixed a mode-gate bypass gap. main.js diff: one
  additive ~4-line refusal block, shown verbatim. 75/75 tests + regressions
  green; dry-run proved all five failure classes refuse and valid paths spawn.
  **MERGED July 9** as `bf93993`. A post-merge Reviewer verdict (read verbatim)
  found the refuse-don't-downgrade invariant held only in the JS layer.
- **Range-invariant hotfix built, committed `fad5ebc`, and live-verified:** `feed-gemini.ps1` now
  throws on lone/mis-ordered offsets and wrong-route/non-VideoScout ranges (was
  warn-and-continue); `gemini-video-sdk.js` exits non-zero on lone flag / missing
  value / non-integer / bad order; renderer clears range inputs on leaving video
  mode + resets stale error state + logs any stale-range that slips through. The
  invariant now holds at EVERY spending layer. Tests green across 6 suites
  (276/276). **Live verification A–E is complete.** Two process
  lessons captured as standing rules: verbatim Reviewer reads at the gate;
  feature-branches-always.
- **Deep read-only audit complete (`AUDIT-REPORT.md` @ `fad5ebc`):** 276/276
  suites green, `npm audit` 0 vulns, electronegativity triaged. Surfaced the
  live XSS→RCE chain (Day-0 #1), full-env-to-PTY (P1/#2), missing window-open
  handler (Day-0 #2), task-not-revalidated (Day-0 #1 pair), analysisMode cost gap
  (Fri #9), + 4 LOW/3 INFO. Praised: offset invariant depth, agent output kept
  out of HTML sinks, `.claude.json` mutex + fail-closed verify-fence.
- Fence audit (WO-1)
- cwd enforcement (WO-6) — built + independently reviewed (PASS)
- `claude.json` write-mutex (WO-7) — built + independently reviewed (PASS)
- Env scrub + `setx` GEMINI_API_KEY removal (WO-2) — done + machine restarted
  *(optional 10-sec verify: open a builder pane, `echo $env:GEMINI_API_KEY` → empty)*

---

## 🟠 DAY 1 (FRIDAY) — finish video-scout + establish clean baseline

> **LIVE TEST RESULTS (July 12):** **A ✅** (whole-video + slice both correct;
> slice billed at LOW ≈71 tok/s vs full run's ≈262 tok/s default — empirically
> confirms the SDK-route mediaResolution enforcement AND the old
> logged-but-not-applied trap) · **B ✅** (refused before launch, visible
> message, modal stays open) · **C ✅** (lone `-StartOffset` → pairing check
> at `feed-gemini.ps1:70` throws BEFORE route/probe/yt-dlp/node/Gemini;
> exit 1; refusal explicitly states whole-video is NOT a fallback; $0) · **D ✅**
> (transcript launch contained no `--start-offset` or `--end-offset`, no stale
> range `BUG:` line, and reopened video fields were empty; later Gemini 503 is
> tracked separately under K5) · **E ✅** (90+min video refused: measured=6873 limit=5400,
> honest message, $0, no node launch — probe arg line now live-proven).
> **NEW BUGS from testing → KNOWN ISSUES:** libuv assertion crash on the 503
> error path; no 503 retry/backoff; raw PS exception dump after the honest
> CLI refusal.

> **Note on the range-invariant hotfix:** built + committed `fad5ebc` on
> `main` (parts 1–3 landed: `feed-gemini.ps1` throws on lone/mis-ordered/
> wrong-route offsets; `gemini-video-sdk.js` exits non-zero on bad argv;
> renderer clears range on leaving video mode + resets stale error state).
> The invariant now holds at every spending layer. Live verification A–E was
> subsequently completed; the procedures below are retained as the historical
> test record, not pending work.

> **4. HISTORICAL PREREQUISITE — full Electron restart (completed).**
> `main` moved to `91ca3b7` + the test-runner chore; nothing below is valid
> against a stale process. Quit fully incl. tray; confirm no lingering Electron
> process (`Get-Process electron`); relaunch. Quick live checks if not yet run:
> external link → OS browser + `[nav-guard]` line in Logs · agent launch works
> · agent grid renders clean (whitespace-node cosmetic). Then tests A–D.

> **5. LIVE TEST A — valid slice → proportional billing.** New Agent → role
> video-scout → mode video → range Start `2:00` End `4:00` → 10-min test video
> URL, flash-lite model, LOW res → Create & Launch. Logs tab: launch argv shows
> `--start-offset 120 --end-offset 240`; on response, `usageMetadata` prompt
> tokens land ~20% of the whole-video baseline (script-path measured 18.9%).
> PASS = proportional tokens + content only references 2:00–4:00.

> **6. LIVE TEST B — invalid range → visible refusal.** Modal, video mode,
> Start `4:00` End `2:00` → Create & Launch. PASS = red inline error, red
> borders, modal STAYS OPEN, no pane created, zero spend. Bonus: fix/blank the
> fields, close + reopen modal → fields empty AND no leftover red error
> (confirms the openModal cosmetic fix).

> **7. LIVE TEST C — lone offset via direct CLI → throws, zero spend.** PowerShell
> in repo root, invoke `feed-gemini.ps1` as in a known-good direct run but with
> ONLY `-StartOffset 120` (no `-EndOffset`); then `echo $LASTEXITCODE`. PASS =
> throws immediately (<1s, before any node/network), non-zero exit, no
> `usageMetadata` anywhere. Optional extras (each throws fast, $0): backwards
> `-StartOffset 240 -EndOffset 120`; offsets without `-VideoScout`.

> **8. ✅ LIVE TEST D COMPLETE — stale range cleared on mode switch.** Transcript
> launch contained no `--start-offset` or `--end-offset`, no stale-range `BUG:`
> line, and reopened video fields were empty. The run later encountered Gemini
> 503 throttling; tracked separately under K5 and not a failure of the
> stale-range invariant.

> **8b. LIVE TEST E (NEW, from the 9b merge) — duration guard in anger.**
> (1) Over-limit refusal: video mode, NO range, a video >90min → PASS = refusal
> naming measured duration, the 5400s limit, the mode, and the override flag;
> zero spend; no node launch. (2) The allowed runs in tests A/D double as the
> live proof of the literal yt-dlp probe arg line (verified by inspection only
> until a real probe executes — PASS = probe succeeds, run proceeds).

> **9. FIX audit #5 (MEDIUM) — the last cost-direction gap.** `feed-gemini.ps1:87`:
> invalid `analysisMode` silently defaults to the costliest `video` pass. Branch
> `feature/analysismode-failclosed`. Fail closed (throw) or fall back to the
> cheap transcript mode — decide which, refuse visibly either way. Small; closes
> the one remaining silent-overspend path. Tests for invalid/absent mode.

> **9b. ✅ DONE — Mode-aware duration guard MERGED to `main` @ `4da1572`**
> (see DONE section). Both routes now gated by one fail-closed pre-flight
> probe; per-mode caps 4h/90min/30min-slice; honest refusals; 105 Pester +
> 205 node assertions green on the merged tree. Follow-ups → P13.

> **9c. P8 PULLED UP — timestamps in transcript-mode output.** Was parked; it's
> actually the missing link in the tiered workflow. A transcript without
> timestamps tells you *what* was said but not *where*, so you still can't pick
> the slice for the range picker. Cheap pass → timestamped transcript → pick
> range → expensive video pass on that slice only. Do after #9.

> **✅ RESOLVED (rode with 9b as scoped):** the `MediaResolution='MEDIUM'`
> logged-but-never-sent trap — `Resolve-MediaResolutionLog` now logs APPLIED
> on the SDK route and "requested … NOT APPLIED" on the CLI route. Log what
> happened, not what was requested.

> **After Friday:** video-scout is DONE and verified; the two live HIGHs from the
> audit are fixed and merged; baseline is clean for weekend feature work.

---

## 🟡 DAY 2 (SATURDAY) — heavy build: command-center features (3 parallel panes)

> **How to run Saturday:** three independent feature branches in three builder
> panes — this is Blue Helm building its own command center (dogfood the
> orchestrator). All three run unattended (Pane C's route is pre-decided:
> esbuild). All add renderer UI, so expect small `index.html`/`styles.css`
> friction — merge in size order A→B→C on Sunday and let later branches rebase.
> **Prereq:** Day 0 + Day 1 complete and merged to `main`.

> **10. PANE A — Quick Links panel.** Branch `feature/links-panel`. Config-driven
> business links opened in the system browser. **The security validator IS the
> deliverable:** one main-process IPC handler validates before
> `shell.openExternal` — http/https allowlist ONLY (reject `file:`,
> `javascript:`, protocol-relative `//`, uppercase variants), URL parses clean,
> else visible error. Renderer never calls shell APIs. Links in JSON in userData,
> tiny add/edit/remove UI. Seed: **Starboard Platform** (never the vendor name),
> Stripe, Microsoft 365, GitHub repo, AI Studio. Tests: protocol rejection
> (incl. sneaky cases), config round-trip, malformed config → visible error not
> crash. No new deps; new IPC follows existing allowlist pattern.

> **11. PANE B — Calculator widget.** Branch `feature/calc-widget`. Pure renderer,
> zero IPC, zero deps. **HARD: no eval / no new Function** (audit greps for
> exactly these). Small expression evaluator (shunting-yard/recursive descent):
> `+ - * / %`, parens, decimal, unary minus; divide-by-zero → visible error.
> Keyboard + buttons, session history, copy-result. Extract evaluator to its own
> file (video-range-ui.js dual global/CJS pattern) for node tests. Tests:
> precedence, parens, unary minus, div-by-zero, malformed refuses visibly (never
> silent NaN), input cap. Smallest WO of the day — if it balloons, stop + report.

> **12. PANE C — Whiteboard (Excalidraw, MIT).** Branch `feature/whiteboard`.
> The deep one. **ROUTE DECIDED — no Phase 0 checkpoint needed:** one-shot
> **esbuild** bundle of react + react-dom + @excalidraw/excalidraw → a single
> local `whiteboard.bundle.js`, built by an npm script (`npm run build:whiteboard`),
> loaded via a plain `<script>` tag like the existing renderer files. esbuild is
> a devDependency only; the bundle is committed or built on install — builder
> states which and why. No bundler is introduced for the rest of the app.
> Build: React island mounted into ONE whiteboard div (React stays contained —
> zero React elsewhere). OFFLINE — copy Excalidraw fonts/assets from
> `node_modules/@excalidraw/excalidraw/dist/prod/fonts` into the app's asset dir,
> set `window.EXCALIDRAW_ASSET_PATH` to that local path; acceptance = works with
> networking fully disabled (no CDN fetches at runtime).
> Persistence via new allowlisted IPC (main-process fs only): save/load, path
> FIXED under `userData/whiteboards/` (no renderer-supplied paths), scene JSON
> validated (is-JSON, ~10MB cap), atomic write (tmp+rename), debounced autosave +
> manual save. Errors surface visibly (never silently drop a scene). v1 = single
> board "default". Agents get NO access to whiteboard IPC/files. Deps limited to
> react, react-dom, @excalidraw/excalidraw (+ esbuild devDep). Tests: IPC
> validator (size cap, non-JSON, path fixed), atomic write, load-missing → clean
> empty board. Manual: draw → quit → relaunch → intact, offline.

> **Saturday stretch (only if all three panes are clean early):** start the
> Sunday CRM Phase 0 (item 15) so Sunday is pure execution.

---

## 🟢 DAY 3 (SUNDAY) — CRM integration + cleanup + merge + ship-check

> **Sunday is deliberately lighter on new build.** One integration, then merges,
> then verification. Do NOT start new features Sunday afternoon — protect the
> ship.

> **13. Merge Saturday's panes** (size order A→B→C, each rebased). Per branch:
> verbatim Reviewer read → your read-through → merge → note in DONE. After all
> three: FULL Electron restart, confirm links/calc/whiteboard all work together.

> **14. Fix any CRITICAL/HIGH the audit surfaced** that isn't already handled
> (Day 0 took #1/#3/#4). Then knock out remaining audit LOWs as a batch:
> CSP dead `frame-src`, `shell:true` in `launch()`, fence fail-open/file-only
> matcher, orphan `.tmp`. Branch `feature/audit-lows-cleanup`.

> **15. CRM (Hexona) data — MCP route.** DECIDE THE ROUTE FIRST (audit Phase 2
> env-leakage findings inform this):
> - **Zero-code (fastest):** give a designated agent role the LeadConnector MCP
>   endpoint `https://services.leadconnectorhq.com/mcp/anthropic/v2` (OAuth or
>   PIT, scoped per sub-account). Config not code — BUT an agent then touches CRM
>   data, so the fence question comes first: which role, what scopes, confirmed
>   against the env-allowlist work.
> - **In-app panel (cleaner boundary, more build):** main-process client calls
>   the MCP/API with a PIT in `safeStorage`; renderer shows read-only display
>   data only. No agent access.
> Either way: **client-facing label is "Starboard Platform" / "third-party
> infrastructure" — never Hexona/GoHighLevel.** v1 scope = read-only (contacts
> or pipeline count), not writes. Note: the `GHL_MCP_X_CLAUDE` connector needs
> authorization first (claude.ai connector settings / `claude mcp`).

> **16. SHIP CHECK (Sunday night).** All green before calling it shippable:
> full test suite green (all node + Pester suites) · `npm audit` clean ·
> re-run electronegativity, no new HIGH · FULL restart + smoke test every
> surface (agent launch, video-scout slice, links, calc, whiteboard persist,
> CRM read) · `main` clean, all weekend branches merged + local branches
> deleted · AUDIT-REPORT top-5 all resolved or consciously deferred with a note.

---

## ⏸ PARKED — Fence-security cleanup (post-ship unless time permits Sunday)

> **P1. WO-4 — per-role env allowlist** (AUDIT #2, HIGH). Fenced roles still get
> full `process.env` incl. WebFetch-capable roles that can exfiltrate secret-
> shaped vars (`app/main.js:528-532`). Scope env per role. **If CRM route in #15
> is the zero-code agent path, this becomes a Sunday must-do, not parked** —
> giving an agent CRM access while it can also see all env is the exact risk.

> **P2. Finish WO-6 live tests** — steps 2–4: missing-cwd refusal, wrong-directory
> refusal, builder-unaffected. (Step 1 happy-path already passed.)

> **P3. Finish WO-7 live tests** — steps 2–3: concurrent launches (one trust
> entry per sandbox), read-only error path. (Step 1 already passed.)

> **P4. WO-3 — fail-closed guard** — refuse launch if a fenced role is ever given
> Bash/Glob/NotebookEdit. (Not started.)

> **P5. WO-5 — git hygiene check** — confirm clean commit history across merges.

> **P6. Batch the non-blocking review follow-ups** (all small): shared
> `realOrNearest` module · drop the root-equality branch · gate `videoScout` on
> role identity · dedupe the double log emit · document the cross-process
> `claude.json` race · assert `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` honored at
> runtime · runtime backstop for route drift (assert in `feed-gemini.ps1`:
> refuse if offsets present && route == CLI) · delete merged local branch
> `feature/section-select-ui` · quiet the `[nav-guard] forwarded` line on
> NORMAL link clicks if Logs gets noisy (blocked-case logging stays — only the
> forwarded case is a candidate; refuse-visibly is not negotiable) · drop the
> now-redundant literal `.agent-review.diff` line in `.gitignore` (wildcard
> covers it).

> **P9. Path-based worktree removal (design change, own Reviewer pass).** Today
> `remove-agent` reconstructs the worktree path from a name read back out of
> persistent state (`taskOf` → `Join-Path parent "$repoName-$Task"` →
> `git worktree remove --force`). The Day-0 fix validates that name main-side
> and refuses bad ones, which closes the hole. The cleaner design removes by the
> **known path from `git worktree list`** (existence-checked), eliminating the
> name round-trip entirely. NOTE: this introduces a new untrusted-input parser
> (`git worktree list` output) — that parser is exactly how this bug class gets
> reintroduced in a new location, so it needs its own Reviewer pass, not a
> fold-in. **Known accepted residual until then:** a worktree whose `taskOf()`
> yields a name outside `[A-Za-z0-9_-]` (e.g. the `wt.branch` fallback
> `agent/foo`, or a hand-created odd name) is now REFUSED by the Remove button
> and must be cleaned up via `git worktree remove` at the CLI. Correct direction
> (refuse rather than run `--force` on a weird path), but it means the app will
> not clean up a hostile artifact planted before the fix.

> **P11. Reviewer follow-ups from the Day-0 security branch** (non-blocking,
> batch them): `repo` remains unvalidated in BOTH new-agent and remove-agent
> handlers (`main.js:287/293/337`) — a bypassed renderer can point `cwd` at any
> directory, and `path.dirname(undefined)` throws an unhandled IPC rejection;
> validate it's a non-empty string + an existing dir inside `projectsRoot`. (The
> fix commit validated one of the two untrusted fields of the same IPC payload
> and left the other — worth naming so it doesn't read as "this handler is now
> validated.") · `JSON.stringify` in the remove refusal escapes C0 controls but
> NOT U+202E (RTL override) or U+2028/9 — cosmetic log-line spoof only,
> reachable via the `taskOf` fallback; strip/escape non-ASCII or document bidi
> as out of scope · `updateModalHint()` (`app.js:608-616`) is the last
> string-concatenated `innerHTML` in the renderer — not exploitable today (values
> come from static dataset attrs) but it's the one pattern a future edit could
> point at a git-derived value · ~~`agent-dom.test.js` and `task-name.test.js`
> not wired into any runner~~ **RESOLVED July 10** — `npm test` now runs all 5
> suites (chore commit on `main`) · NEW from the sec-nav-shell delta review:
> the `webContents.send('main-error', …)` refusal emit is asserted by contract
> only, not end-to-end — add an E2E assertion when this batch runs.

> **P12. (HIGH — from the sec-nav-shell delta-review residuals) cmd.exe
> argument re-parsing on the VS Code-open path is NOT closed by `shell:false`,
> and the in-code comment overstates the guarantee.** `launchers.js:31-35`
> routes open-vscode through `cmd.exe /c code <path>`; Node/libuv only quotes
> an argv element containing whitespace/tab/quote, so a directory path with
> `& | ^ < > ( )` and NO spaces reaches cmd.exe verbatim and is re-parsed into
> a second command — **code execution, not path-confusion**, i.e. exactly the
> threat `launchers.js:5-8` claims to defeat; the `%`-only refusal does not
> cover it. **7th instance of the recurring lesson: the guard (`%` refusal)
> sits where the bug was noticed; the dangerous operation (cmd.exe re-parse)
> happens one layer down.** Exposure today: pre-existing hostile artifacts
> only (post-`25e72ad`, task validation blocks such names at create) + trusted
> renderer — same accepted-residual class as P9, which is why this is parked
> not Day-blocking. FIX AS ONE BRANCH, ONE GATE: (a) refuse-visibly any dir
> containing cmd metacharacters `& | ^ < > ( )` — same posture as `%`;
> (b) spawn the resolved `code.cmd`/`Code.exe` directly with `shell:false` +
> explicit quoting control (no cmd.exe intermediary); (c) correct the
> overstated comment at `launchers.js:20-25` — log what's true, not what was
> intended; (d) close the companion residual TOGETHER: `open-vscode` /
> `open-terminal` accept an arbitrary dir with no path validation
> (`main.js:499-504`, `preload.js:25-26`) — post-fix it's an "open arbitrary
> folder" primitive, but it's what makes the metachar bug reachable from a
> compromised renderer, so the two multiply and merge as one fix;
> (e) fold in the deferred Finding 3: a Windows-guarded end-to-end test that
> spawns the ACTUAL cmd.exe spec against a harmless `&`/`|` path (the current
> "proof" test spawns node, and its META string contains spaces so it would be
> quoted regardless — it cannot detect this class).

> **P10. ✅ RESOLVED (in the 9b branch, `6074565`).** `New-VideoScoutRunDir`
> same-millisecond collision was REAL (it collided under the aggregate Pester
> runner — answered the open question the bad way: reuse, not throw). Fixed
> with an 8-char GUID suffix; uniqueness is now structural; no consumer parses
> the run-dir name (verified by the Reviewer).

> **P13. ✅ RESOLVED (July 17, merged @ `b4519ec`).** The duration-guard
> follow-up batch landed after 9c with Full-class `VERDICT: PASS`; post-merge
> gates are Pester 267/0/0 and app 529/0. Original scope retained below for
> provenance.
> **Duration-guard follow-up batch (from the PASS verdict's findings +
> residuals — none blocking, none load-bearing today).**
> **Chore-class, do FIRST (both qualify under the chore rule once verified by
> execution):** (a) **Pester version pin in `run-pester.ps1`** — currently
> imports highest-installed with no pin while every suite is Pester 3.4
> syntax, and its own remediation hint (`Install-Module Pester`) would install
> Pester 5 and break the entire gate; pin `-MaximumVersion 4.99.99` and fix
> the hint. The gate must not carry its own self-destruct instruction.
> (b) **`docs/PROJECT-STATE.md` still documents `GEMINI_API_KEY` via `setx`**
> — the exact PTY-env key-exposure pattern `AGENTS.md` and `CLAUDE.md` §8
> forbid; point at the in-app secure entry + add the `setx` removal command.
> **Batch (one branch, one gate):** positive-control test for the E2E node
> tripwire (one allow-case asserting `NodeReached = $true` — turns the proof
> from reasoned-correct to observed-correct) · step-0 slice refusal in
> `Resolve-DurationGuard` (`HasRange -and EndOffset -le StartOffset` ⇒ refuse
> — same fail-open shape as the `<=0` duration seam 9b killed, currently
> shielded only by upstream validation) · `try/finally` around the lib suite's
> global job-cmdlet stubs (stub leakage into the E2E suite would hollow out
> the one test that must run real code) · surface the swallowed probe-fault
> exception (`Write-Host` the message before returning null — refusal stays,
> operator learns the cause) · anchor `Resolve-NoFileMessage`'s
> `'does not pass filter'` match to yt-dlp's line shape (title-influenceable
> substring drives a message branch) · make `$ProbeTimeoutSec` /
> `$MaxDurationSeconds` explicit parameters of `Assert-DurationGuard` (both
> ambient-scope reads fail closed by ACCIDENT today, not construction) ·
> DECIDE the `-MaxDurationSeconds` ceiling (86400 lets one logged flag lift
> the video cap 16×/slice cap 48× — lower to 14400, or gate above-default
> overrides behind a second explicit flag) · ONE manual live probe run against
> a real over-limit video (the literal yt-dlp arg line is verified by
> inspection only — see also LIVE TEST E) · latent: `Resolve-DurationGuard`
> callable with transcript/audio + HasRange applies the slice cap
> (unreachable from feed-gemini.ps1; add a refusal or ValidateScript).

> **P7. Budget guardrail** — using real `usageMetadata` token numbers (not
> estimates). Better built next week with a week of real data accumulated.

> **P8. ✅ COMPLETE (July 17, 9c merge `51a21b8`).** Timestamps in
> transcript-mode output.

---

## 🐛 KNOWN ISSUES — backlog, not blocking

> **K5. ✅ MITIGATION MERGED / FIXTURE-PROVEN (July 17, `db8b61e`);
> provider recurrence unconfirmed.** Full-class review and corrective delta
> both passed. A real local HTTP fixture proves bounded retry and clean natural
> shutdown, but the provider-side race was not reproduced in 120 bounded fixture
> runs. Blue later accepted a successful SDK path after provider capacity
> pressure cleared. Root-cause attribution remains plausible, not proven.
> Post-merge gates: app 529/0 and Pester 271/0/0. Original finding retained
> below for provenance.
> **K5 (July 12 live testing). SDK-route 503 path crashes node** —
> flash-lite 503 (high demand) was followed by
> `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c:94`
> — a native libuv crash instead of a clean non-zero exit. Refuse visibly,
> never segfault: make the error path close handles once and exit cleanly with
> the upstream message. PAIR WITH: retry-with-backoff for 503/UNAVAILABLE
> (2–3 attempts, jittered) — flash-lite demand spikes make this a daily
> annoyance otherwise.

> **K6 (NEW, July 12). Direct-CLI refusal dumps raw PS exception scaffolding**
> after the honest message (`CategoryInfo`/`FullyQualifiedErrorId` noise from
> the `throw` at `invoke-duration-probe.ps1:86`). Message-first is correct;
> suppress or soften the stack dump on the standalone path (cosmetic).

> **K7 ✅ RESOLVED (July 16, merged @ `5ee435b`, marker 2026-07-16.4).** Both
> engines now bootstrap: TTS via the tracked Kokoro bundle with device-correct
> fp32/q8 config; STT via the official @huggingface/transformers 3.8.1 browser
> bundle as a declared dependency, with a tested env contract, visible
> webgpu→wasm fallback + throttled progress, destination-pane lock, and honest
> module-failure states. Human acceptance passed; each stacked branch had its
> own Reviewer PASS. Original finding retained below for provenance.
>
> **K7 (VERIFIED, July 14). TTS and STT controls are visible but both engines
> fail during module startup.** TTS assumes `env.backends.onnx` exists on the
> Kokoro browser bundle even though that bundle exports only `env.wasmPaths`.
> STT's local Transformers browser file begins with unresolved bare imports for
> `onnxruntime-common` and `onnxruntime-web`; the file is also gitignored and
> absent from `HEAD`, so fresh clones cannot load it at all. Fix on separate
> `feature/tts-bootstrap-fix` and `feature/stt-bootstrap-fix` branches with
> fail-visible initialization and bootstrap contract tests. Do not vendor or
> rewrite model internals as part of these repairs. **Tier: Standard-class** —
> initialization and visible failure state; recoverable and non-destructive,
> with no security, credential, cost-direction, or destructive surface.
> **Observed user behavior:**
> clicking Dictate produces no visible recording or queued/transcribing state.
> This is explained by STT failing before it publishes `window.ccSTT` and its
> ready event; it is a bootstrap defect, not an after-stop transcription UX.

> **K8 ✅ RESOLVED (July 16, merged @ `acf1aee`, marker 2026-07-16.5).** One
> pure policy module (`app/media-permission-policy.js`, 106-assertion suite in
> the app gate) now feeds both `setPermissionRequestHandler` and
> `setPermissionCheckHandler`: a grant requires the trusted window's own
> WebContents + main frame + exact canonical ENTRY_URL + the probed `file:///`
> origin + mediaTypes exactly `['audio']`; `audioCapture` and every non-media
> permission are denied fail-closed with bounded visible refusals (check-side
> first-occurrence latch prevents the probed page-load automatic-check flood).
> Merged-main gates 529/0 app, 216/0/0 Pester; live camera/mixed denial +
> audio-only grant proven; Full-class Reviewer `VERDICT: PASS`. Original
> finding retained below for provenance.
>
> **K8 (VERIFIED, July 14; NEXT in queue now that K7 is merged). Audio
> integration hardening follows bootstrap.** The pane-targeting half is DONE
> (the merged destination-pane lock delivers to the pane where recording
> began, or refuses visibly). REMAINING: the Electron permission handler still
> allows the broad `media` permission class without proving audio-only scope
> or checking the requesting origin. Repair separately so functionality and
> permission changes receive distinct Reviewer gates.
> **Tier: Full-class.** K8 changes an Electron security boundary: trusted
> origin and audio-only scope must be proved before granting media. It receives
> whole-diff review and a delta pass after any FAIL; never fold it into K7.

> **K1. Video download cleanup / auto-delete — ✅ CLOSED (July 22, merged @
> `0c633ad`).** Every run creates a `run-<timestamp>-<PID>` subdir under
> `downloads\`; unmanaged growth is now resolved through the manifest-scoped V5c
> chain. **V5c2a** (merged @ `fd73172`) deletes a successful current run's OWN
> manifest-owned media right after its report+manifest are durable; **V5c2b**
> (merged @ `0c633ad`) adds the bounded cross-run retention/reconciliation sweep
> for error/refused/abandoned runs and reconciles crash-interrupted deletions.
> Both operate only on media a validated manifest still owns, gated by a dual age
> gate, and use temp-fixture-only tests. Full record in the July 22 checkpoint
> above. Original ask (retained for provenance): add auto-delete after a
> successful Gemini analysis and/or a retention sweep, before the tool runs
> unattended for long stretches — done and gated.

> **K2. Clipboard copy-paste — ✅ RESOLVED by V1a (July 18, merged @
> `60d5230`).** Original finding, retained for provenance:
> flaky in panes generally, and likely **never covered for the video-scout pane
> at all** (the original fix targeted the standard Claude pane path). Treat as
> "add coverage for the Gemini pane." Resolution: every pane — Video Scout
> included — now shares ONE tested Copy Output path (live selection first, then
> the pointer-down snapshot, then full-buffer reconstruction — EVERY source
> capped at the newest 1,000,000 characters, selections included, per Blue's
> correction; metadata-only Logs; visible failures), built by the
> same safe pane builder and proven by term-copy.test.js (44 assertions,
> including a static check that the copy path contains no role-conditional
> branch).

---

## 📆 NEXT WEEK — deferred weekend features (ranked out of this weekend's scope)

> **N1. Outlook email via Graph API** — official path is MSAL-node (NOT
> msal-browser) + auth-code-flow-with-PKCE in Electron; sample repo
> `Azure-Samples/ms-identity-javascript-nodejs-desktop`. Needs Entra app
> registration + `Mail.Read` scope beyond default. Heaviest lift; dovetails with
> the in-flight Google→M365 migration. Tokens live main-side via safeStorage,
> never in PTY env.

> **N2. Usage/cost dashboard** — cross-vendor spend visibility (Claude/Codex/
> Gemini). Deliberately deferred: better with a week of real `usageMetadata`
> accumulated to design against. Partly overlaps P7 budget guardrail.

---

## 🚀 DAILY-DRIVER ROADMAP (v1.x, post-ship) — mine patterns, adopt utilities

**Blue's directive (July 10): this app is the daily driver. Stop building from
scratch where proven OSS exists; adopt and integrate.** The parallel-agent
orchestrator space matured fast — a dozen-plus open tools now do worktree-based
parallel agents, and their common feature set is effectively the daily-driver
spec. Roadmap below maps each goal to the OSS that provides it or proves it.

**⚖️ STRATEGY — updated by Blue, July 14: OWN THROUGH THE CORE BUILD, THEN
EVALUATE.** Blue Helm's core remains ours while Handoff #4 and Day 1–3 are
completed. During that work, OSS orchestrators (`parallel-code`, `crystal`,
Emdash, Claudette, Composio AO…) are a pattern mine for session lifecycle,
diff-review UX, kanban states, and status detection. R15 then time-boxes a real
fork/replacement evaluation and may recommend keeping the core, replacing one
bounded subsystem, or migrating/forking. No peer code enters the production
branch and no migration begins without Blue's explicit post-evaluation
approval. Credential boundaries and Starboard business-data controls remain
ours under every option. Neutral utility libraries — Excalidraw,
dockview-core, DOMPurify, ripgrep — remain adoptable as whole, vetted
dependencies throughout.

**SCOPE — DECIDED: daily driver = coding/agent orchestration + business ops
(CRM, email, cost).** Personal productivity (notes, personal tasks, life
planning) is OUT of scope — that stays in existing tools. This confirms N1
(Outlook/Graph), R6 (cost dashboard), and the CRM panel as first-class roadmap
citizens, and frames R5's kanban as work management, not a life organizer.

**🎯 V-SERIES — REQUIRED FOR DAILY-DRIVER FUNCTIONALITY (Blue, July 12, from
live testing — these are NEEDS, not wants; V1 blocks the tool's whole point):**

> **V1. Pane output must be fully readable and copyable.** Original finding:
> no horizontal scroll, no pane maximize/fullscreen, text runs off-screen,
> selection/copy unreliable (K2) — the analysis is effectively trapped in the
> viewport. **SPLIT (July 17): V1a delivers readability + copy; the report
> reader is deferred and recorded separately below.**
>
> **V1a — Pane Readability and Copy Repair: ✅ COMPLETE (July 18, human
> acceptance passed, merged @ `60d5230`).**
> Delivered: maximize/restore one pane inside the Command Center content area
> (same control and Esc restore; siblings hidden, never closed — PTYs keep
> running; FitAddon + the PTY resize path rerun on every layout change so long
> lines REFLOW instead of becoming unreachable; view switches and
> close-while-maximized can never strand the state) · vertical scrollback
> reachable · reliable selection and copying in every pane type · a Copy
> Output control on every terminal pane (selection wins; pointer-down snapshot
> survives the header click; otherwise full-buffer reconstruction — EVERY
> source capped at the newest 1,000,000 characters, selections included,
> surrogate-safe, visible truncation notice, metadata-only Logs). **Video
> Scout goes through the same tested Copy Output
> path as every other pane — this closes K2.**
> The live-found Electron 42 defect was also closed before merge: sandboxed
> preload code no longer accesses the OS clipboard directly. Clipboard reads
> and writes cross a main-process IPC boundary that validates the exact trusted
> window, webContents, main frame, and canonical entry URL; accepts strings
> only; applies the same 1,000,000-character hard limit in both directions; and
> never logs content. Full-class Reviewer verdict: PASS. Final merged-main
> gates: app 875/0; Pester 275/0/0.
>
> **Deferred out of V1a (explicit): Open Report / any OS dispatch.** No
> `shell.openPath`, no run-directory or report-path resolution, no
> terminal-output parsing for run IDs. The report reader arrives IN-APP at
> V5b: main owns pane→run identity from launch; the renderer asks for the
> report belonging to a pane and never supplies paths or derives identity from
> terminal text; V5b reuses `scripts/lib/video-scout-manifest-schema.ps1` and
> its existing validator — no second schema or validator in JavaScript.
> INTERIM (works today): every run's full output is already on disk in its
> `run-<timestamp>-<PID>` dir.

> **V2. TLDR in the analysis output — COMPLETE (July 15).** Section 1 remains
> report-leading and Sections 2–9 now require their own evidence-grounded
> one-line Section TL;DR. Pester 216/216; Standard-class scoped Reviewer
> verdict PASS.

> **V3. Pre-analysis direction + post-analysis follow-up Q&A.** Two halves:
> (a) BEFORE: an optional "focus/instructions" free-text field in the New
> Agent modal, injected into the analysis prompt (validated/escaped — it
> crosses into a paid prompt). (b) AFTER: the pane is a PTY, so freeform
> questions have nowhere to go today. Design options, in effort order:
> open-report button + "ask any LLM" workflow (V1 delivers this) · a
> follow-up input on the video-scout pane that re-invokes the SDK with
> report+question as context (no re-ingest of the video = cheap) ·
> full chat-continuation mode. Start with the first, spec the second.

> **V4. Multi-slice in one run.** e.g. `3:00–5:30` AND `7:10–9:00` in one
> pass on one agent. Design constraints: per-slice validation (each end >
> start) · guard gates on TOTAL sliced seconds vs the 1800s cap (N slices
> must not multiply cost past the cap) · SDK `videoMetadata` takes ONE
> offset pair per part, so multi-slice = multiple content parts or
> sequential calls aggregated into ONE report with per-slice sections (each
> with its V2 TLDR) · UI: repeatable range rows in the modal. Spec first —
> this touches the guard, so it gets a full gate.

> **V5. ANALYSIS LIBRARY — in-app history of all video-scout runs.** Today runs
> live as `run-<timestamp>-<PID>-<guid>` directories, are identifiable only by
> folder name, and are viewable only through Explorer.
>
> **Sequenced ahead of the rest of V5 — see queue. Rationale: the manifest is
> the K1 fix and the backfill target shrinks the sooner this lands.**
>
> **(a) Per-run manifest.** Write a versioned JSON manifest inside each new run
> directory containing: run ID, source URL, video title, mode, route, model,
> media resolution as actually APPLIED, slice offsets when present, start/end
> timestamps, `usageMetadata` token counts, report filename, and terminal
> outcome (`completed`, `refused` with reason, or `error` with sanitized reason).
> Create it when an accepted launch creates the run directory and update it
> atomically. Renderer-only validation failures that never launch are not
> library runs. Provide a one-shot best-effort backfill script for existing run
> directories.
>
> **COMPLETE (July 15).** V5a is merged and the authorized one-shot backfill
> created 12 schema-valid legacy manifests. Backfills record only structural
> facts: `route:"cli"` with code-control-flow provenance, `startedAt=null`, and
> the local run-folder timestamp as explicitly approximate provenance.
>
> **(b) Library pane.** Add a sortable/filterable in-app list by date, title,
> mode, route, outcome, and tokens. Selecting an entry opens its report in-app
> using V1's readable, copyable, maximizable report reader. Cross-report
> full-text search can ride R8 later. **V1 is a prerequisite for this reader.**
> **Backfilled-date requirement:** legacy backfilled manifests intentionally
> keep canonical `startedAt=null`. V5b must sort/display them using the local
> run-stamp retained as `backfill.startedAtFromDirNameLocal`, visibly marked
> **approximate**. If that provenance timestamp is missing or invalid, place the
> run in an explicit **Unknown date** bucket. Never let null-date ordering make
> a backfilled run silently disappear from the library.
>
> **(c) Retention.** Keep manifests and reports indefinitely because they are
> the durable asset. Automatically delete downloaded media after successful
> analysis, and provide a retention sweep for abandoned/error media. Never
> delete a file merely because it happens to be inside a run-like directory;
> cleanup deletes only media recorded as belonging to that run.
>
> **(d) V3 hook.** “Ask a follow-up” from a library entry reuses the stored
> report as context without re-ingesting the video.
>
> **Security constraints.** Manifest writing is scripts-side and receives its
> own normal branch and Reviewer gate. The library pane is app-side and receives
> a separate branch and gate after V1. Video titles, URLs, error text, and all
> other run-derived strings are untrusted. Build DOM with `textContent`/safe
> attributes, never `innerHTML`. Renderer code never supplies arbitrary
> filesystem paths; main-process IPC resolves fixed run-root paths, validates
> manifest/report size and schema, and refuses malformed or escaping paths
> visibly.

**TIER 1 — Blue's ranked order (July 10):**

> **R1. In-app diff viewer + merge-gate UI. ← RANKED #1.** Render the three-dot
> diff in-app (`diff2html` MIT, or Monaco's diff editor), with the Reviewer
> verdict pasted verbatim alongside and a merge button that is DISABLED until a
> verdict is attached. Turns three standing rules (three-dot diffs, verbatim
> verdicts, merge-only `main`) from discipline into mechanism. Pattern-mine:
> Orca / `parallel-code` diff-and-merge UX — studied, then built our way.
> **Scheduling note (July 15):** diff transport again consumed gate time during
> the backfill. R1 is the standing fix for this repeated failure mode, not
> post-ship polish; prioritize it accordingly when the current functional queue
> is re-ranked.

> **R2. Session persistence / restore. ← RANKED #2.** Relaunch reopens the pane
> grid, worktrees, roles, and (where the CLI supports it) resumes sessions
> (`claude --resume`). Pattern-mine: Claudette, Composio AO, clideck session
> lifecycles.

> **R3. Dockable / resizable pane layout. ← RANKED #3.** `dockview-core` (MIT,
> vanilla-JS — no React needed outside the Excalidraw island): drag, split,
> tab, persist layouts. Replaces hand-rolled grid CSS as panes multiply
> (links, calc, whiteboard, CRM, video-scout…). This one IS a utility-dep
> adoption, not a pattern-mine.
>
> **DELIVERED — August 8, merged at `d23e2c2`.** Shipped as `dockview@7.0.4`
> (which bundles `dockview-core`) under the tracked ADOPT verdict in
> `docs/OSS-PROCUREMENT-dockview.md`. This roadmap entry is retained as the
> origin of the requirement, not as open work. Note the scope difference the
> entry anticipated loosely and the delivered subsystem defines exactly:
> persistence is four explicit, validated, transactional operations over the
> live pane set — not implicit layout saving.

> **R4. Agent status detection + notifications. ← RANKED #4.** Detect idle /
> awaiting-input / done from PTY output; Windows toast + tray badge + optional
> sound. The app should interrupt Blue, not require polling it. Pattern-mine:
> `parallel-code` status heuristics + CI-settle notifications.
>
> **DEPRIORITIZED vs the July-10 Tier-1 ranking** — the functional-acceptance
> push (make visible controls work) takes precedence through the current queue.
> **REVISIT TRIGGER:** if pane-babysitting during the audio (K7/K8) or V3/V4
> branches becomes a friction point, R4 is cheap relative to its rank and should
> jump the queue. This is a conscious deferral, not an oversight.
>
> **TRIGGER FIRED — July 30. R4 IS PROMOTED.** Pane babysitting across the audio
> and V3/V4 branches became demonstrated friction, which is exactly the stated
> condition. R4 now sits in the Blue Helm 1.0 remaining-work list as
> *cross-provider pane-status indicators*, sequenced immediately after Dockview
> so the indicators target stable pane/tab headers. The deferral text above is
> retained as design history, not as current queue position. Implementation still
> requires its own OSS procurement record first.

**TIER 2 — daily-driver comfort:**

> **R5. Kanban board bound to branches/worktrees.** Cards = tasks; columns =
> building / gate / merged; card actions spawn agents. Pattern-mine: Vibe Kanban,
> nimbalyst, multica. Could subsume this very status doc.

> **R6. Per-pane token/cost meter + cross-vendor dashboard.** Absorbs N2 + P7.
> Claudette's segmented context meter (streamed usage events, per-turn
> input/output/cache breakdown) is the design to study.

> **R7. Command palette + keyboard-first shortcuts.** Every action reachable
> without the mouse; per-role presets (`parallel-code` pattern).

> **R8. Log/output search.** Bundle `ripgrep` (via `vscode-ripgrep`) across
> pane logs and video-scout run dirs.

**TIER 3 — polish and reach:**

> **R9. Per-task setup/teardown scripts + port injection.** Emdash's
> `$EMDASH_PORT` pattern — each worktree task gets a unique injected port, so
> parallel dev servers never collide. Adopt the pattern (config-file-driven).

> **R10. Remote/mobile monitoring.** `parallel-code` does QR-code phone access
> over Tailscale. HIGH fence implications (a network listener on the box that
> holds keys) — if pursued, it gets its own audit-grade review, not a fold-in.

> **R11. Themes / dark-mode polish.** Cheap goodwill; CSS variables already
> made this easy.

> **R12. Auto-update + crash reporting.** `electron-updater`; crash reports
> local-only unless explicitly opted in.

> **R13. Markdown + Mermaid rendering of agent output/plans.** `marked` +
> `DOMPurify` MANDATORY (we just spent Day 0 killing an `innerHTML` RCE — no
> rendered HTML from agent output without sanitization, ever), `mermaid` for
> plan diagrams. Claudette renders plans/reviews this way.

> **R14. PR/CI status watcher.** Poll GitHub checks for pushed branches →
> R2 notification when they settle.

> **R15. Time-boxed orchestrator fork/replacement evaluation — after Handoff #4
> and Day 1–3 are functionally complete.** Recommendation: cap this at one
> working day and make no production-code adoption during the evaluation.
> Source-Scout shortlists the strongest maintained candidates; compare Windows
> support, Claude Code and multi-CLI routing, worktree isolation, PTY/terminal
> quality, session restore, diff/review gates, extensibility, license,
> maintenance, telemetry, credential boundaries, dependency weight, and
> migration cost. Run the leading candidate only in a disposable sandbox with
> no provider credentials or business data. Deliver three explicit options:
> keep Blue Helm and mine selected patterns; replace one bounded subsystem; or
> fork/migrate the orchestrator. Each option must include estimated effort,
> security regressions, data/config migration, features gained/lost, and a
> rollback path. Blue makes a separate go/no-go decision before any adoption.

**THE PATTERN MINE (study-only through the core build; R15 may recommend a
later, explicitly approved change):**
`johannesjo/parallel-code` (MIT; Electron; the closest feature-set match),
`stravu/crystal`, Emdash (YC W26, open source; strongest worktree
setup/teardown story), Claudette (MIT, Tauri/Rust — architecture + UX ideas,
not code-compatible), `ComposioHQ/agent-orchestrator` (Apache-2.0; note: ships
PostHog session-recording telemetry ON by default — exactly why the vetting
gate checks telemetry), `andyrewlee/awesome-agent-orchestrators` (the index).

---

*Historical July 10 update rule: completed items moved to DONE and the Day 0–3
plan ran top-to-bottom without skipping security or verification gates. The old
Sunday/Monday deadline is no longer active. Current work follows the July 14
checkpoint and latest handoff; security, testing, and human merge gates remain
non-negotiable regardless of the rebaselined ship date.*

---

## 🗺 HISTORICAL SHIP PLAN AT A GLANCE — NOT THE CURRENT QUEUE

This block preserves the July 10 plan. Use the July 14 checkpoint and
`BLUE-HELM-CHAT-HANDOFF-4.md` for current execution order.
- **Day 0:** ✅ **COMPLETE** — `main` @ `91ca3b7`; both HIGHs merged; 205 tests wired + green.
- **Day 1 (Fri):** live tests A–E ✅ → next: #9 analysisMode fail-closed → V2 TLDR → 9c timestamps. (9b ✅ merged @ `4da1572`.)
- **Day 2 (Sat):** heavy build — 3 parallel panes: links, calculator, whiteboard.
- **Day 3 (Sun):** CRM (MCP) + merge Sat panes + audit-LOW cleanup + ship-check.
- **Monday:** ship, if #16 is all green.
