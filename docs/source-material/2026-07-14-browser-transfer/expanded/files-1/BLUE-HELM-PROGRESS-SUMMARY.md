# Blue Helm — Progress Summary
### Prepared for folding into the Starboard / JL Automation master progress file

**What this is:** a status snapshot of Blue Helm, the internal
development-and-operations platform used to build and run Starboard Automation.
Written to drop into the broader business progress file. Status is marked
honestly — *merged/done*, *built (pending test)*, or *in progress* — not
rounded up.

---

## 1. What Blue Helm is — and how it relates to Starboard

Blue Helm is a self-hosted "mission control" desktop application (Electron,
Windows 11) that orchestrates multiple AI coding agents — Claude Code, Codex,
and Gemini — working in parallel, each isolated in its own git worktree or
sandbox. It is meant as the daily driver: the workspace opened every morning to
build Starboard and, in time, to run its growth operations.

**Important distinction for the business file:** Blue Helm is *not* the Starboard
product or its customer-facing stack. Starboard runs on a Hexona/GoHighLevel
white-label foundation with n8n orchestration. Blue Helm is the *cockpit* — the
tooling used to build, automate, and operate that stack faster and more safely.
Its value to the business is leverage: it lets a very small team (currently one
builder) produce the output of many by delegating to supervised AI agents,
without paying for a third-party platform or routing sensitive code, keys, or
customer data through one.

---

## 2. Architecture at a glance

One agent = one terminal session = one git worktree (or fenced sandbox) + its
own working branch. The Electron main process owns all shell-outs and terminal
sessions behind a controlled bridge; the interface is sandboxed. Six defined
roles each carry a different, **tool-enforced** permission set: Builder
(read-write + shell), Reviewer (read-only, independent-model code review),
Codebase-Scout (read-only, fast/cheap), Web-Scout and Source-Scout (web research,
sandboxed), and Operator (scoped growth-ops cycles). A separate video-scout path
runs Gemini for video analysis (the only one of the three vendors with native
video understanding).

Two principles are non-negotiable and hold throughout: **the human merge gate is
sacred** (no agent ever auto-merges to production), and **permissions are
enforced by the tool layer, not by prompt instructions** — an agent physically
cannot use a capability it wasn't granted, rather than merely being asked not to.

---

## 3. What's been completed

### Core platform (foundation, established earlier)
- Full Electron / terminal / git-worktree core, built from scratch.
- The six-role system with tool-enforced access, deployed and in daily use.
- Secrets handling: API keys held in OS-encrypted storage, never crossing into
  the sandboxed interface layer.
- ~20+ change sets merged to date across the platform's development.
- A running convention that every failure must surface visibly (no silent
  errors), adopted after real debugging time was lost to silent failures.

### Security hardening (major focus of the most recent work)
A deliberate audit-and-fix pass on the agent-isolation model, treated with the
same rigor a production SaaS handling customer data would require:
- **Fence audit — complete.** Mapped exactly what each role can and cannot
  reach. Key finding: the research roles have no shell access, so the practical
  risk surface was narrower than assumed and centered on one enforcement gap.
- **Working-directory enforcement — built and independently reviewed
  (passed).** Closes the gap that could have let a research agent read outside
  its sandbox. Reviewed by a separate AI model (different from the one that
  wrote it) and confirmed correct at the source level.
- **Concurrency-safe config writes — built and independently reviewed
  (passed).** Fixed a race condition that could silently drop state when
  multiple agents launch at once (the platform's normal operating mode).
- **Secret-exposure cleanup — built, reviewed, and executed.** Removed a
  lingering environment-variable exposure and tightened how credentials reach
  agent processes.

### Video analysis pipeline (video-scout)
A capability for pulling a video and producing structured, cross-checked
analysis — useful for competitive/market research and content review:
- **Persistent analysis prompt — merged.** A reusable "forensic analyst" brief
  that produces a consistent five-section output (summary, categorized
  findings, timestamped detail, discrepancy cross-checks, source-credibility
  read) without re-entering it each time.
- **Model and quality-tier controls — merged.** Configurable model and
  resolution selection, surfaced in the launch UI, with honest in-app warnings
  where a control isn't fully enforceable by the underlying tool.
- **A real invocation bug — found and fixed.** The first genuine end-to-end run
  surfaced a Windows-specific argument-handling bug; it was root-caused
  properly (not patched blindly) and fixed with test coverage.

---

## 4. Current status / what's genuinely in flight

Marked honestly, because "merged" and "confirmed working end-to-end" are not the
same thing:

- **Security fixes:** the core changes are built and independently reviewed, but
  a handful of live runtime tests and a set of non-blocking cleanup follow-ups
  remain before that workstream is fully closed. The design work is done; the
  final verification is not.
- **Video pipeline:** functional through several merged improvements, but
  **currently blocked on a recurring launch error** that is being diagnosed
  (likely either a local-vs-merged code sync gap or a secondary argument bug).
  No full, successful end-to-end analysis run has completed yet through the
  latest code.
- **Cost/usage visibility:** identified as a real gap — there is not yet a clear
  view of token/compute spend across the three AI vendors. Flagged as a
  near-term priority.

---

## 5. What this means for Starboard

The strategic point for the business: **the build-and-operate infrastructure is
maturing to production-grade discipline before Starboard has revenue.** The same
practices being enforced in Blue Helm — independent review of anything touching
security, a sacred human approval gate, secrets never exposed to untrusted
layers, failures surfaced rather than swallowed — are exactly the practices
Starboard will need when it is handling real client data and payments on the
Hexona/GHL/n8n stack.

In other words, the tooling is being hardened to the standard the *product* will
demand, so that when client onboarding begins, the workspace building and
running it is already trustworthy rather than a liability. This is unglamorous,
pre-revenue foundation work, but it is the kind that prevents a security or
data-integrity incident later, when there are customers to lose.

---

## 6. Open items (near-term)

1. Unblock the video-scout launch error, then complete the first real
   end-to-end analysis run.
2. Finish the remaining live security tests and batch the non-blocking review
   follow-ups.
3. Build cost/tier guardrails for the video pipeline (budget ceiling, then
   chunking for large files).
4. Stand up cross-vendor usage/cost visibility.
5. Minor: a copy-paste fix for the video pane, and remaining per-role
   environment tightening.

*None of the above blocks Starboard's separate business setup track (LLC,
banking, contracts, A2P registration, etc.), which proceeds independently of
Blue Helm.*
