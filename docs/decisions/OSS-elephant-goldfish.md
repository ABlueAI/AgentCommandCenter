# OSS record: Google's elephant-goldfish-model (S71)

Written 2026-11-26 by a Claude cloud session (agent account), recording Blue's verdict of
2026-11-25 from a desktop research session that surveyed recent open-source agents. Nothing was
installed or run. Certainty labels are AGENTS.md's.

## Need

A cheap outside check of a plan document before it is built on: what it leaves unsaid, and what a
reader with no history would misread.

## Option

**elephant-goldfish-model**, from Google.

- **Licence: Apache-2.0. Version: v0.1.1.** From the hand-off; not verified here. S71 pins the
  tag and commit and confirms both.
- **What it does** (builder's reading from its name; not verified): a document is read by a reader
  that holds all the context (the elephant) and one that holds none (the goldfish), and the gaps
  between their readings are reported. S71 reads its README and code at the pin before running it.
- **Which model it calls:** not verified. S71 runs it only on Blue's own plans. If it needs an API
  key, credits or a paid service Blue doesn't already use for it, S71 stops and asks Blue
  (AGENTS.md "Deciding without asking"). It never calls a China-origin model.
- **Pin-and-scan:** not run yet. S71 checks the tag, commit and licence, runs SkillSpector
  `--no-llm` on it and searches it for China-origin model names before the trial.

## Verdict

**PROTOTYPE: one trial** on one plan document, the Composer spec, which Blue chose. Blue, word for
word (2026-11-25, as the desktop session's hand-off relayed it): "Yes, as one trial: Google's
elephant-goldfish-model on one plan document". His words choosing the Composer spec were not
relayed.

## How Mako uses it

- S71 (docs/PLAN-1.1.md) runs it once on the Composer spec, once that spec is in the repo (never on
  another document), and writes a one-page result in
  `docs/research/`: what it found, what it missed, what it cost, and whether it is worth using
  again. Nothing is installed into `.claude/` or the app.
- Any further use needs a new verdict from Blue.
