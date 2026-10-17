# Mako: Claude Code instructions

All project rules live in AGENTS.md, shared with Codex and GPT so every agent works from the same
rulebook:

@AGENTS.md

Claude-specific notes:

- Start every session by reading `STATUS.md`, `docs/PLAN-1.1.md`, `docs/DECISIONS.md` and
  `BLUE-CHECKLIST.md` on `main`.
- In cloud sessions, stay subscribed to your own PR and fix CI failures and review findings until it
  is green, then update the TLDR and mark it ready.
- `.claude/settings.json` denies merge and push-to-main tools. Do not work around it.
