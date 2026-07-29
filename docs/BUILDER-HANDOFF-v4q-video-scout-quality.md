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
knows from the validated ranges. **The hedge immediately preceding the value decides how**, resolved
by longest terminal phrase over five closed classes — a finite terminal-token rule, with no semantic
parsing, no tolerance arithmetic, and no fuzzy matching.

| Class | Phrases | Rejects when |
|---|---|---|
| **Strict lower** | `over`, `more than`, `in excess of`, `greater than`, `longer than` | `N >= aggregate` — the phrase excludes `N` itself, so equality already claims more |
| **Inclusive lower** | `at least`, `upwards of`, `no less than` | `N > aggregate` — the aggregate itself satisfies the claim |
| **Upper** | `under`, `less than`, `at most`, `up to`, `no more than`, `shorter than` | never — an upper bound cannot establish an excess |
| **Non-binding approximation** | `approximately`, `approx.`, `approx`, `about`, `roughly`, `around`, `circa`, `nearly`, `almost`, `some`, standalone `just` | never — see below |
| **Binding / bare** | `exactly`, `precisely`, `only`, or no hedge | `N > aggregate` — ordinary comparison |

Worked examples against a 50s aggregate: `over 50 seconds` rejects but `over 49 seconds` passes;
`at least 50 seconds` passes and `at least 51 seconds` rejects; `exactly 51 seconds` rejects and
`exactly 50 seconds` passes.

**Terminal-hedge precedence.** `just over 50 seconds` is governed by strict `over` and rejects;
`approximately over 50 seconds` likewise. `over approximately 51 seconds` is governed by non-binding
`approximately` and passes. Longest terminal phrase wins, which is what keeps `no less than`
(inclusive) from being read as its `less than` tail (upper), and `no more than` (upper) from being
read as its `more than` tail (strict).

**Why approximation under-matching is deliberate.** `approximately 51 seconds` against a 50s
aggregate is *not* proof that the source exceeds the authorized scope. The phrase supplies no
deterministic lower bound, and the only way to manufacture one would be to invent an approximation
tolerance — a threshold nobody reviewed, applied to text the gate cannot actually interpret. **The
validator applies no invented approximation tolerance.** So the durable rule below governs, and the
claim passes.

- if the comparison cannot deterministically establish that the claim exceeds the aggregate → **pass**

These approximation passes are accepted **under-matches**, not findings that the report is correct.
A report that says `approximately 51 seconds` about a 50-second authorized scope may well be wrong;
the gate simply cannot prove it from the text, and discarding a provider response after usage and
quota were already consumed, on an unprovable reading, is the worse error. **Human acceptance remains responsible for semantic truth**, here as
everywhere else in this gate.

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
- preserves usage (provider usage occurred and is recorded in the manifest; whether it was free-tier
  or billable is unknown to this repository);
- records `outcome: error` and `reportFile: null`;
- publishes exactly one diagnostic entry, and only after the PowerShell side **independently
  re-derives** the artifact's byte count and SHA-256 rather than trusting what the child reported;
- never emits rejected content to terminal output or the Logs pane, and never exposes it through
  Library or media inventory.

If local writing or verification fails: record `diagnostic-write-failed`, leave `diagnosticArtifacts`
empty, preserve usage where available, and never repeat the provider request.

> **No quality rejection ever triggers another provider request.** There is no repair, no
> continuation, no fallback, and no quality-driven retry. K5's bounded 503 recovery is untouched and
> applies only to eligible transport failures. A rejected response is a terminal provider-response
> failure that occurred after usage was consumed — potentially billable, depending on the user's own
> Gemini project and account — whose only output is evidence.

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
cannot pass, that fixture fails first and loudly.

> **If a realistic correct report cannot pass, stop and report the contract as over-strict rather than weakening tests.**

---

## Later prompt-compliance probe — NOT AUTHORIZED BY THIS WORK

> **This probe is not authorized by any V4Q correction, including this one. It must not run automatically, and no agent may start it on its own initiative.**

The gate now rejects origin restatement anywhere outside the canonical field, including *negative*
restatement. Whether a real model actually obeys that instruction is an open question that only a
real request can answer — and no real request has been made at any point during V4Q.

**When it may happen.** After the complete V4Q implementation receives the required final Full-class
whole-diff review `VERDICT: PASS`, and *before* the final provider acceptance run, Blue may
**separately and explicitly** authorize one probe.

**What it is.** One deliberately cheap request: approximately **15 seconds**, **single slice**, Pro.
Its sole purpose is to test compliance with the instruction not to restate the synthetic-origin
conclusion outside the canonical field. Read the response — or the preserved diagnostic — looking
specifically for that restatement.

**What it is not.** It is **not** analysis-quality acceptance. Passing the probe says the model
follows one formatting instruction. It says nothing about whether the analysis is correct.

**Rules while it runs.**

- No automatic re-probe, repair, retry, continuation, or fallback is permitted.
- K5's existing bounded recovery — at most three byte-identical attempts, eligible 503 responses only
  — is the *only* retry that may occur, and it is unchanged.

**If it fails.** Stop. Preserve the diagnostic and inspect it. Tighten the prompt through a reviewed
code change, re-run the gates, and obtain review again. **Do not re-probe automatically**; a
replacement probe requires fresh explicit authorization from Blue.

**If it passes.** Continue only to the separately authorized final acceptance run.

> Passing the deterministic gate does not establish factual truth. Human acceptance remains
> responsible for euphemism and semantic accuracy, before and after this probe.

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

---

## Phase B — the renderer model policy

One invariant: **within each New Agent modal session, Video Scout automatically selects Flash-Lite
for transcript/audio and Pro for video, until the user manually picks a model. A manual choice then
wins for the rest of that session, and closing/reopening the modal resets the policy.**

`app/renderer/video-model-policy.js` is a pure dual-environment module (browser `<script>` global +
CommonJS, following `video-range-ui.js`). No DOM, Electron, filesystem, network, credentials,
provider calls, or timers; every transition returns a new plain state object.

| Session state | transcript | audio | video |
|---|---|---|---|
| unpinned (automatic) | Flash-Lite | Flash-Lite | **Pro** |
| pinned (manual) | the pinned model | the pinned model | the pinned model |

**Why Pro is the automatic video choice.** The quality gate rejects a response that fails
deterministic validation, and a rejected response is a terminal failure whose only output is
evidence — it **consumes quota and may incur cost**, since free-tier versus billable status depends
on the user's own Gemini project and account and cannot be determined here. Flash-Lite on a bounded
video pass is exactly the configuration that produced the V4Q failure evidence. Transcript and audio
keep the economy model because they never enter that path.

**Slice count is deliberately not an input.** Analysis mode alone decides, so a whole-video pass and
an eight-slice pass receive the same automatic model. Backend effective-model resolution is a
separate mechanism and is unchanged.

**A manual choice is refused, never substituted.** An out-of-allowlist value returns a refusal and
leaves the previous concrete model on the wire — the same reasoning that made `buildVideoScoutArgs`
refuse rather than drop `-Model`. Re-selecting the model already displayed still pins the session:
the user made a choice, and that it matches the automatic one does not make it automatic.

### Why `change` alone was not enough

A `<select>` emits **no** `change` event when the user picks the option already displayed. Wiring the
policy to `change` only therefore left this path open:

1. Transcript mode displays Flash-Lite automatically.
2. The user opens the selector and deliberately chooses that same Flash-Lite.
3. No event fires; the session stays **unpinned**.
4. The user switches to video — and the renderer silently escalates to Pro.

The symmetric case downgraded a deliberately kept Pro when leaving video mode. Both are exactly the
silent model substitution this policy exists to prevent, and the pure unit tests could not catch it
because they called `applyManualModel()` directly rather than going through the UI.

**Deliberate activation now pins the displayed model**, via a pure interaction adapter
(`applyModelInteraction`) that takes plain data rather than a DOM event:

- **Pointer** — primary mouse, touch, or pen activation pins the currently displayed model. It fires
  on `pointerdown`, *before* the native selector changes anything, so dismissing still pins.
  Right-click and middle-click are ignored; a context menu is not a choice.
- **Keyboard** — ArrowUp/ArrowDown/Home/End/PageUp/PageDown/Enter/Space, Alt+ArrowDown, and any
  single printable type-ahead character pin the displayed model.
- **Change** — still pins, and replaces a temporary same-value pin with the newly selected model.

**Not pinning:** Tab, focus alone, Escape alone, modifier-only presses (Shift/Control/Alt/Meta), and
Ctrl/Meta shortcuts. Tabbing across the selector leaves the automatic policy fully live.

> **Disclosed tradeoff.** Opening the selector and dismissing it without changing the value *does*
> count as a manual pin. That is deliberate: the user reached for the cost/quality control, and
> preserving what they were looking at is safer than silently escalating or downgrading it a moment
> later. Nothing is hidden — the status line flips from automatic wording to "your choice"
> immediately, so the pinned state is visible the instant it happens.

This correction is renderer-only. It does not alter automatic recommendations, the model allowlist,
generation policy, concrete model serialization, backend enforcement, or provider behavior.

**No sentinel reaches the wire.** `state.videoModel` always holds a concrete allowlisted model —
never `auto`, never blank. `syncVideoModelControls()` is the single place the policy is pushed into
both the DOM and `state`, so the dropdown can never display one model while `ptyStart` sends
another. `openModal()` resets the session wholesale, which is what stops a manual pin from leaking
into the next one. Nothing is persisted to settings or disk.

**The renderer is a mirror, not authority.** `app/video-scout-args.js` owns the launch allowlist and
`scripts/gemini-video-sdk.js` independently owns generation policy. Tests pin the renderer allowlist
equal to `VALID_VIDEO_MODELS`, Flash-Lite equal to `DEFAULT_VIDEO_MODEL`, Pro equal to the SDK's
`PRO_MODEL`, and assert the SDK contains **no** reference to `video-model-policy`.

**Honest modal copy.** The status line distinguishes an automatic selection from a pinned one and
carries the Pro cost caveat. It never claims a run is free, paid, or billable: whether a request
falls inside a free tier depends on the user's own Gemini project and account, which the app cannot
see.

### Manual acceptance plan — record only, not yet run

Requires a full **Electron process restart**, not a reload. Do **not** click Create & Launch during
this renderer-only check.

1. Open the modal, choose Video Scout → transcript mode with Flash-Lite selected automatically.
2. Open the model selector and choose *or dismiss* the displayed Flash-Lite.
3. The status line changes immediately to the manual "your choice" wording.
4. Switch to video → **Flash-Lite remains** (no silent escalation).
5. Reopen a fresh modal and enter video → automatic Pro.
6. Open the selector and choose *or dismiss* the displayed Pro.
7. Switch to transcript → **Pro remains** (no silent downgrade).
8. Reopen again → transcript with automatic Flash-Lite; no manual state survives.
9. Tab through the selector without activating it, then switch to video → Pro appears automatically.
10. Keyboard-operate the selector (arrows/Enter/type-ahead) → the displayed model pins.
11. Switch back to transcript, then audio → Flash-Lite returns each time (unpinned session).
12. Manually select Flash, toggle every mode → Flash remains.
13. Read the help text: it describes the automatic/manual state accurately and does not claim a run
    is necessarily free or billable.
14. Do not start a run.

---

---

## Final implementation inventory

**Backend (7 production files).** `scripts/gemini-video-sdk.js` (generation policy, authorized-scope
instruction, the deterministic quality validator, durable diagnostics), `prompts/video-scout-analysis.md`,
`scripts/lib/video-scout-manifest-schema.ps1` (schema v4), `scripts/lib/get-video-scout-diagnostic-artifact.ps1`
(new — independent PowerShell verification), `scripts/lib/write-video-scout-manifest.ps1`,
`scripts/feed-gemini.ps1`, `app/video-scout-args.js`. Two further files carry **authorized
comment-only** corrections: `scripts/lib/get-video-scout-slice-ranges.ps1` and `scripts/gemini-followup.js`.

**Renderer (3 production files).** `app/renderer/video-model-policy.js` (new — the pure policy and
interaction adapter), `app/renderer/app.js`, `app/renderer/index.html`.

**Tests (14).** The SDK suite, `app/renderer/video-model-policy.test.js` (new),
`scripts/lib/get-video-scout-diagnostic-artifact.Tests.ps1` (new),
`scripts/video-model-policy-node.Tests.ps1` (new wrapper), plus the manifest schema, writer,
feed-gemini, Library core, follow-up, video-scout-args, record, cleanup, retention, and
media-inventory suites.

## Accepted checkpoint verdicts

| Range | Verdict |
|---|---|
| `ad14423e...4e77046` (cumulative backend) | `CHECKPOINT REVIEW: PASS` |
| `72c632e...810f257` (Phase B selector correction) | `CHECKPOINT REVIEW: PASS` |
| `ad14423e...810f257` (cumulative V4Q) | `CHECKPOINT REVIEW: PASS` |

A checkpoint PASS unblocked the next phase and, finally, this handoff and pinned-diff preparation.
**None of them authorizes a provider probe, an acceptance run, a merge, or a push.**

## Gate totals at the reviewed tip

| Gate | Result |
|---|---|
| app | 1340 passed / 0 failed |
| Pester | 955 passed / 0 failed / 0 skipped |
| `video-model-policy.test.js` | 398 / 0 |
| `gemini-video-sdk.test.js` | 839 / 0 |
| `video-scout-args.test.js` | 205 / 0 |
| `video-range-ui.test.js` | 52 / 0 |
| reachability | Node 6 / 0, PowerShell green |

> **No V4Q implementation step and no V4Q checkpoint test used a provider request.** Every suite
> runs on injected fakes and a 127.0.0.1 fixture. Throughout V4Q the preserved run directory count
> stayed at 31, with `run-20260727-001226-817-10472-c46bea78` — the failed-acceptance evidence —
> remaining the newest and untouched.

---

## The Full-class review FAILED — and what was corrected

The first Full-class whole-diff review of `4c07db9...20bf2ec` returned the literal verdict:

```text
VERDICT: FAIL
```

**The defect.** `normalizeEvidenceLine` strips `Slice N` (deliberately — so relabelled per-second
filler cannot evade the count), and the repetition counter ran **one Map across the whole of
Section 5** with a fixed allowance of 3. It therefore could not distinguish repetition *inside* one
slice — genuine filler — from the one consolidated entry *per slice* that this repository's own
scope instruction demands: *"Consolidate an unchanged condition into ONE ranged entry."*

On uniform footage a maximally compliant report was rejected once it carried four or more slices:

| Slices | Before | After |
|---|---|---|
| 1, 2, 3 | pass | pass |
| **4, 5, 6, 7, 8** | **`repetitive-timestamp-filler`** | **pass** |

The allowance of 3 was also smaller than `MAX_SLICES = 8`, so the most-authorized configurations
were the most likely to be rejected. This discarded a structurally correct response *after* provider
usage had already occurred, in the most expensive configuration the branch produces (Pro, an 8,192
thinking budget, up to 28,672 output tokens) — and it directly contradicted the calibration
principle stated elsewhere in the same file: *the gate prefers under-matching to discarding a
correct response.*

**The correction.** Repetition is now counted **per bucket**, with a fresh counter for each:

- the Section 5 preamble (lines before the first exact slice heading), and
- each exact slice subsection.

`findRepeatedObservation` is a small pure helper so bucket behaviour is directly testable. The
global whole-evidence Map is **deleted** — there is no second or fallback counter that could
reintroduce cross-slice conflation.

**Two alternatives were rejected.**

1. *Scaling the threshold with slice count* — backwards. It would weaken real within-slice filler
   detection in exact proportion to how many slices were requested, so the runs with the most
   authorized content would get the loosest filler check.
2. *Keeping `Slice N` in the normalized key* — it would let eight literally identical per-second
   lines evade the check simply by carrying different slice labels, defeating the whole purpose.

The threshold stays a constant **3**, the failure code stays `repetitive-timestamp-filler`, and the
reason now names *which* bucket repeated (`slice N` or `the Section 5 preamble`) while still never
echoing the repeated provider text.

**The new regression matrix**, all pinned in `scripts/gemini-video-sdk.test.js`: one consolidated
observation per slice passes at every count 1–8 (with a guard asserting the entries genuinely
collide after normalization, so the matrix cannot pass for the wrong reason); three identical
observations inside one subsection pass and a fourth rejects; four repetitions in slice 8 reject and
name slice 8; three repetitions in *each* of eight slices — 24 identical lines overall — still pass;
four identical lines in the preamble reject and name the preamble; twelve per-second lines inside one
slice still reject; structural markers, headings, and blanks stay excluded.

> The quality gate remains a **deterministic structural and lexical filter, not a truth oracle.**
> This correction removes a false rejection; it does not make the gate any better at judging whether
> a report is true. Human acceptance remains responsible for factual accuracy.

**Release remains blocked** pending a new Full-class whole-diff review. The pinned artifact for
`4c07db9...20bf2ec` belongs to the FAILED review and is historical evidence only.

### Deferred, non-blocking finding

The reviewer also noted that `Add-SliceScopeToPrompt`
(`scripts/lib/get-video-scout-slice-ranges.ps1`) is referenced only by its own test file. Its
docstring claims it mirrors `buildAuthorizedScopeInstruction` and serves CLI-side composition;
neither is true — slices are refused on every non-SDK route, and its wording lacks the entire V4Q
mandatory output contract, so a prompt built from it would be rejected by the quality gate every
time. **It was deliberately not modified or wired here.** Wiring it requires a separate reviewed
decision.

---

## Current limitations and human-acceptance responsibilities

1. The gate is structural and lexical, **not a truth oracle**. Euphemism, unlisted paraphrase, and
   convincing false claims can pass. A human must read the report.
2. **Negative origin restatement is the most likely false-positive rejection** from an otherwise
   well-behaved model. This is deliberate and is why the probe exists.
3. **Whole-video analysis is not gated** — prompt-level discipline only.
4. Approximation hedges deliberately **under-match**; no invented tolerance is applied.
5. The audio-justification heuristic can be evaded by rewording; it stops the observed failure, not
   every possible one.
6. `UNDETERMINABLE FROM AUTHORIZED SLICES` is valid **only** while sliced requests receive no
   authoritative full-source duration metadata. If that ever changes, the field and validator must
   be revisited rather than enforcing a known falsehood.
7. **Dismiss-to-pin** in the model selector is an accepted, visible tradeoff (see above).
8. Whether any request is free-tier or billable depends on the user's Gemini project and account;
   the app cannot determine it.

## Full-class review focus list

1. Canonical-field **format-before-content** precedence, and source-before-synthetic ordering.
2. **Global** (not section-scoped) label uniqueness for both canonical fields.
3. The frozen synthetic-origin vocabulary, its deliberate exclusions (bare `synthetic`, `synthesized`,
   `synth`, `manipulate`, `manipulation`), and the deliberate negative-restatement rejection.
4. Sentence-local duration productions 1–6, the terminal-hedge classes, and the authorized-aggregate
   comparison — the only place known scope disambiguates prose.
5. The complete realistic guided-meditation fixture passing with zero failure codes.
6. All three failure-code allowlists agreeing exactly (SDK, diagnostic verifier, manifest schema).
7. Rejected-response preservation: exact bytes once, usage retained, `outcome: error`,
   `reportFile: null`, one independently verified diagnostic, no content in reasons/Logs/Library.
8. **No quality rejection triggers another provider request** — no repair, continuation, or fallback.
9. Renderer selector wiring: `pointerdown`, `keydown`, `change`; same-value activation;
   tab-without-activation; invalid refusal; modal reset.
10. Cross-layer model agreement and the SDK's freedom from any renderer-policy reference.
11. Prompt single-source ownership and the removal of the `approximate duration` instruction.

## Status

Backend correction checkpoints plus renderer Phase B, now finalized for whole-diff review. Nothing
here is merged or pushed, and **no provider request has been made at any point during V4Q
implementation**. Release requires a new Opus 5 Full-class whole-diff review of
`4c07db9...<FINAL_REVIEWED_TIP>` ending in a literal `VERDICT: PASS`.

**The final Full-class review has not yet occurred.** No verdict on the complete branch exists.
