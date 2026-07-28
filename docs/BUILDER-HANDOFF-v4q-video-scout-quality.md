# V4Q — Video Scout report-quality gate

Backend handoff. Written for the next person who has to decide whether a Video Scout report can be
trusted, and for the reviewer who has to decide whether this gate is honest about what it does.

Companion to [`BUILDER-HANDOFF-v4-bounded-multi-slice.md`](BUILDER-HANDOFF-v4-bounded-multi-slice.md),
whose V4R release authorization is now **stale** — see the banner at the top of that file.

---

## Read this first

> The quality gate is a deterministic structural and lexical filter, not a truth oracle. It does not
> interpret arbitrary semantics, euphemisms, or unlisted paraphrases. Convincing false claims may
> pass. Human acceptance must evaluate factual accuracy. **"Quality gate passed" must never be
> represented as "the analysis is true."**

Everything below is written on that assumption. If you find yourself about to say "the gate checked
it, so it's fine", stop and re-read the paragraph above.

---

## Why V4Q exists

V4 shipped bounded multi-slice transport, and V4R repaired it on Windows. Both were reviewed and
both were correct. Then a human acceptance run failed anyway — not on transport, on **content**:

- The report asserted an approximate source duration for a video it had only seen 70 bounded
  seconds of.
- It asserted synthetic/AI origin with no timestamped evidence, on the strength of the imagery
  looking simple and static.
- It reported a blanket "no audio" finding while audio tokens had been billed.
- It padded the evidence section with near-identical per-second lines.

The response arrived, was billed, and was structurally a valid API result. Correct transport is not
a correct report. V4Q adds the missing layer.

**The invariant:** an SDK response may become a completed report only if deterministic local
validation establishes exact slice coverage, per-slice audio assessment, all nine sections once and
in order, both canonical quality fields, no forbidden origin or source-duration content, no filler,
and no truncation. A failing response is preserved as evidence and never becomes `reportFile`, a
Library report, media, or media-deletion authority.

---

## The two canonical quality fields

Bounded sliced analysis must close Section 2 (`## 2. VIDEO PROFILE`) with exactly two fields.

### Source duration

```
**Source duration:** UNDETERMINABLE FROM AUTHORIZED SLICES
```

Exact complete trimmed line, exactly once, inside the canonical Video Profile section, no
alternative wording.

> **Standing limitation.** This assertion is valid only while sliced requests receive no
> authoritative full-source duration metadata. Today they do not. **If a future feature supplies
> authoritative duration metadata, this field and its validator must be revisited rather than left
> to enforce a known falsehood.** Do not treat `UNDETERMINABLE` as a permanent truth about the
> world; it is a truth about what this request was given.

### Synthetic-media assessment

Exactly one of:

```
**Synthetic-media assessment:** NO OBSERVABLE EVIDENCE
**Synthetic-media assessment:** <finding> — Evidence: <timestamped observation> — Confidence: LOW|MEDIUM|HIGH
```

**Separator tolerance.** Each separator is *independently* a hyphen (` - `), en dash (` – `), or em
dash (` — `). The two need not match; a model that emits ` - ` before `Evidence:` and ` — ` before
`Confidence:` is compliant. Surrounding whitespace is required, so a hyphen inside a compound word
is not mistaken for a separator. All three variants and mixed pairs are tested.

---

## Format codes vs content codes

The closed allowlist is now **15** codes, declared independently in three layers
(`scripts/gemini-video-sdk.js`, `scripts/lib/get-video-scout-diagnostic-artifact.ps1`,
`scripts/lib/video-scout-manifest-schema.ps1`) and pinned equal by tests.

| Concern | Format code | Content code |
|---|---|---|
| Source duration | `source-duration-field-format` | `speculative-source-duration` |
| Synthetic origin | `synthetic-assessment-field-format` | `unsupported-synthetic-claim` |

A **format** code means the field is missing, duplicated, outside Section 2, prefixed, suffixed, or
otherwise malformed. A **content** code means both fields were well-formed and the rest of the
report then violated a lexical contract.

**Precedence is explicit and deterministic.** After the existing finish-reason, section, scope,
slice, and audio checks:

1. source-duration field format
2. synthetic-assessment field format
3. source-duration content
4. synthetic-origin content

If **both** fields are malformed, the returned code is `source-duration-field-format`. A malformed
field that *also* contains forbidden content still gets its format code — format is decided first.
This matters operationally: a format rejection tells you the model got the shape wrong, and a
content rejection tells you it said something it could not know. Collapsing them would lose that.

Failure reasons are bounded structural descriptions. They never echo provider text — not the
asserted duration, not the asserted claim, not a matched phrase.

---

## The frozen synthetic-origin vocabulary

Semantic negation handling is **gone**. There is no `NEGATED_SYNTHETIC_CLAIMS` any more. After the
one accepted canonical assessment line is removed, the remaining report is matched case-insensitively
with word boundaries against exactly these 17 phrases:

`AI-generated` · `AI generated` · `AI generation` · `synthetic media` · `synthetically generated` ·
`deepfake` · `deepfakes` · `deepfaked` · `deepfaking` · `deep fake` · `deep fakes` · `deep faked` ·
`deep faking` · `stock footage` · `manipulated footage` · `manipulated imagery` ·
`digitally manipulated`

### Negative restatement is rejected on purpose

> **This is the single most likely false-positive rejection you will see from an otherwise
> well-behaved model.**

`No observable evidence of AI generation was found.` in the Limitations section is **rejected**. So
are `The material does not appear AI-generated.`, `Nothing suggests AI generation.`, and `The
footage was not digitally manipulated.` They are rejected because the canonical field is the *only*
place origin may be discussed at all, and a denial elsewhere is still a restatement of an origin
conclusion.

If you are triaging a rejection and the preserved diagnostic looks like a perfectly good report,
check for this first. It is a prompt-compliance problem, not a model-quality problem. Both the base
prompt and the generated sliced supplement instruct against it explicitly.

### Why bare terms are excluded

`synthetic`, `synthesized`, `synth`, `manipulate`, `manipulation`, `manipulated exposure`, and
`manipulated focus` are deliberately **absent** from the list. They carry ordinary audio, editing,
and camera meanings. All of these must pass, and are tested:

- `Synthesized ambient tones continue under the narration.`
- `A low synth-pad drone is audible.`
- `Synthetic strings enter near the end.`
- `The camera manipulates focus during the transition.`
- `The exposure appears manually manipulated.`
- `The imagery is not demonstrably synthetic.`

Rejecting those would discard correct observations. **The gate prefers under-matching to discarding
a correct response.** Euphemistic phrasing that avoids all 17 phrases will pass; that is the
accepted cost, and it belongs to human acceptance.

---

## The sentence-local source-duration contract

Tokens are never combined across units. A paragraph mentioning `video` and a later paragraph
mentioning `62 minutes` cannot be assembled into a claim neither sentence made.

**Units** come from a pure, tested splitter using fixed delimiters only: line boundaries, and
`.`/`?`/`!` followed by whitespace or end of input. No NLP, no probabilistic segmentation. `1.5
hours` and `1:02:03` do not split, because the character after the `.` is not whitespace.

**Whole-source subjects** are `video`, `source`, `footage`, `recording`, `film`. `slice`, `clip`,
`segment`, and `part` are **not** — a statement about an authorized portion is in scope.

**Six rejecting productions**, each matching inside one unit:

| # | Form | Example | Gated? |
|---|---|---|---|
| 1 | subject + duration noun + link + value | `The video's duration is 1:02:03.` | no |
| 2 | duration noun + `of` + subject + link + value | `The duration of the video is 62 minutes.` | no |
| 3 | whole-source modifier + duration noun + link + value | `The overall runtime is 90 minutes.` | no |
| 4 | subject + link + value + `long` | `The video is over one hour long.` | **yes** |
| 5 | line-anchored duration FIELD outside the canonical line | `Approximate duration: Over 1 hour` | no |
| 6 | subject + running verb + value | `The recording runs for 62 minutes.` | **yes** |

Every production requires a **concrete value** — a clock reading, or a number followed by a spelled
time unit. That single requirement is why honest limitation prose keeps passing: `The source
duration cannot be determined from these slices.` supplies no value, so nothing can match it.

Production 4 is an explicit finite exception carved out to cover the reviewer-mandated `over one
hour long` example. It is deliberately not a general subject-plus-time co-occurrence rule.

### The authorized-aggregate comparison

Productions 4 and 6 compare the parsed value against the authorized aggregate the validator already
knows from the validated ranges:

- below the aggregate → pass
- equal to the aggregate → pass
- above the aggregate → reject
- `over N` / `more than N` / `in excess of N` → exceeds only when `N >= aggregate`
- if the comparison cannot deterministically establish that the claim exceeds the aggregate → **pass**

> **This is the ONLY semantic ambiguity in the entire gate that is resolved using known authorized
> scope.** At or below the aggregate, `The video is 15 seconds long.` describes what was actually
> supplied. Above it, the same grammar necessarily claims knowledge the request never provided.
> Nothing else in V4Q disambiguates prose this way, and nothing else should start to without a
> reviewed scope decision.

Statements like `The recording runs for 62 minutes` may under-match when they lack the required
duration noun or explicit `long` construction against a large aggregate. That is deliberate.

---

## Prompt and gate now agree

The root defect behind the original failure was in the prompt, not only the model: Section 2 of
`prompts/video-scout-analysis.md` **ordered** the model to report "approximate duration" — precisely
the field the gate rejects. A model obeying the prompt was being rejected for obeying it.

The prompt now:

- lists no approximate-duration item, and says so explicitly;
- states a source duration may be given only when the full source duration is directly observable;
- keeps Global Rule 7's non-literal discipline (static/low-budget content is not evidence, never
  classify origin by vibe, affirmative findings need timestamped evidence and confidence);
- forbids restating origin conclusions — positive or negative — in the TL;DR, detailed summary,
  discrepancies, credibility assessment, limitations, or anywhere else.

**Single source.** The exact field literals and the evidence-backed template live in exactly ONE
place: the sliced-analysis supplement generated by `buildAuthorizedScopeInstruction`. Tests prove
each appears exactly once in the resolved sliced prompt and zero times in the base prompt, so there
is no second wording source that can drift away from the SDK constants.

---

## Mandatory rejected-response preservation

Every quality rejection, including both new format codes:

- preserves the exact response text as UTF-8 **without BOM**, in `rejected-response.txt` only,
  as a direct child of the existing run directory;
- preserves usage (the run was billed; the manifest says so);
- records `outcome: error` and `reportFile: null`;
- publishes exactly one diagnostic entry, and only after the PowerShell side **independently
  re-derives** the artifact's byte count and SHA-256 rather than trusting what the child reported;
- never emits rejected content to terminal output or the Logs pane, and never exposes it through
  Library or media inventory.

If local writing or verification fails: record `diagnostic-write-failed`, leave `diagnosticArtifacts`
empty, preserve usage where available, and never repeat the provider request.

> **No quality rejection ever triggers another provider request.** There is no repair, no
> continuation, no fallback, and no quality-driven retry. K5's bounded 503 recovery is untouched and
> applies only to eligible transport failures. A rejected response is a terminal, paid failure whose
> only output is evidence.

The mandatory pre-submission `--diagnostic-dir` gate is unchanged: the SDK refuses to submit at all
if it has nowhere to preserve a rejection, with zero fetches.

---

## The realistic passing fixture

`MEDITATION_REPORT` in `scripts/gemini-video-sdk.test.js` is a complete, hand-written, nine-section,
two-slice report for a static-imagery guided-meditation video — 180s aggregate across two
non-adjacent windows. It carries exact scope and both canonical fields, exact slice headings, audio
status/evidence/anchors for both slices, honestly described synthesized ambient music, static imagery
consolidated into ranges, truthful bounded-duration prose, and a non-vacuous discrepancies section
naming a real cross-channel conflict.

It must pass `validateReportQuality` with **zero** failure codes.

It exists to answer one question: *is this contract over-strict?* If a genuinely correct report
cannot pass, that fixture fails first and loudly, and the correct response is to report the contract
as over-strict — **not** to weaken the fixture.

---

## Intentional test reversals

Three classes of assertion were deliberately inverted relative to the previous checkpoint
(`4aeb28f`). A reviewer diffing the range will see them; they are authorized, not regressions.

| Case | Was | Now |
|---|---|---|
| `No observable evidence of AI generation was found.` | passing | **rejecting** |
| `The material does not appear AI-generated.` | passing | **rejecting** |
| `Nothing suggests AI generation.` | passing | **rejecting** |
| `The footage was not digitally manipulated.` | passing | **rejecting** |
| `The imagery is not demonstrably synthetic.` | passing | passing (unchanged) |
| `The clip spans 1:05:00.` | rejecting | **passing** |

The first four flipped because negation interpretation was removed in favour of a frozen vocabulary.
The last flipped because `clip` is a bounded subject, not a whole-source subject.

---

## What this does NOT cover

> **Whole-video limitation.** Canonical duration and synthetic-origin enforcement applies only to
> bounded sliced SDK analysis. Whole-video responses retain prompt-level Rule 7 discipline but
> receive **no equivalent deterministic gate**. The original unsupported-origin defect is not
> inherently slice-only; extending the gate to whole-video analysis requires a separate reviewed
> scope decision.

Also not covered, and worth stating plainly:

- **Semantic truth.** A convincing, well-formatted, entirely false audio justification passes.
- **Euphemism.** Origin claims phrased around all 17 frozen phrases pass.
- **Unlisted paraphrase.** Duration claims that avoid the six productions pass.
- **Under-match by design.** Bare `manipulation` and similar excluded wording pass. Accepted.

---

## Files

**Production:** `scripts/gemini-video-sdk.js` (validator, generation policy, diagnostics),
`prompts/video-scout-analysis.md`, `scripts/lib/get-video-scout-diagnostic-artifact.ps1`,
`scripts/lib/video-scout-manifest-schema.ps1`, `scripts/lib/write-video-scout-manifest.ps1`,
`scripts/feed-gemini.ps1`, `app/video-scout-args.js`.

**Tests:** `scripts/gemini-video-sdk.test.js`,
`scripts/lib/get-video-scout-diagnostic-artifact.Tests.ps1`,
`scripts/lib/video-scout-manifest-schema.Tests.ps1`, `scripts/feed-gemini.Tests.ps1`, plus the
Library / cleanup / retention / record / writer non-exposure proofs.

---

## Status

Backend correction checkpoints only. **Renderer Phase B is blocked** pending a literal
`CHECKPOINT REVIEW: PASS`. Nothing here is merged or pushed, and no provider request has been made
at any point during V4Q implementation. Release requires a new Opus 5 Full-class whole-diff review
ending in a literal `VERDICT: PASS`; a checkpoint PASS unblocks Phase B and nothing else.
