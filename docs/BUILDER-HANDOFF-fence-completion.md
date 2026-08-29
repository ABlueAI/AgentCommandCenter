# Builder Handoff — Fence Completion (`pty-start` launch authority)

**Branch:** `feature/fence-completion-pty-start-authority`
**Baseline:** `70fe1f1920979d43427be78332c4966acd3b408d` (local `main` = live `origin/main`, verified by `git fetch` at branch creation)
**Status:** IN PROGRESS — stops for fresh independent Full-class review. No merge, no push, no live provider session.

---

## 0. PRE-REGISTRATION (recorded BEFORE any source edit)

This section was committed before `app/main.js` was touched. It is the
falsifiable prediction the review measures the result against.

### 0.1 Baseline pin evidence, independently reproduced

Recomputed from the committed object `git show 70fe1f1:app/main.js`
(LF-normalized, UTF-16 code-unit length + SHA-256 over UTF-8 bytes) — NOT from a
working tree:

| Region | Length | SHA-256 |
|---|---|---|
| `fenced-role cwd gate` | 1326 | `9a1255f1e81e0a9e4e289ab15380707dd6bcc1d410ffd16f44adddb99b16f8c6` |
| `ptyEnv block` | 229 | `18cf42b434ee922ee61194d9316150c0b766591e063d0b0545f6aebc8d85cb54` |
| `pty-start handler` | 13566 | `da784a2e5c6be38e4daecc0e7fdfaf1f404aacfa5aac2cd01c8f6c2e2235fad9` |

These equal the values pinned in `app/launcher-fence-invariant.test.js`, and that
suite passed 26/0 at the baseline before editing began.

### 0.2 Pre-registered pin movements

| Region | Prediction | Reason |
|---|---|---|
| `pty-start handler` | **MOVES** | Authority gate + classifier inserted. Its own start anchor `ipcMain.handle('pty-start', (_e, opts) => {` changes (`_e` -> `e`) and is updated in the same revision. |
| `fenced-role cwd gate` | **MOVES** | Two stated reasons: (a) anchor predicate replaced by the classified result; (b) refusal strings become bounded reason constants. Containment LOGIC (realpath, case-fold, `startsWith(root + path.sep)`, placement before the USERPROFILE fallback) is byte-identical apart from those. |
| `ptyEnv block` | **MOVES** | Anchor is the third copy of the predicate. `buildPtyEnv` arguments and all P1 environment semantics UNCHANGED. |
| `envBlock` / `failBlock` `indexOf` slices | **ANCHORS UPDATED, ASSERTIONS STRENGTHENED** | `mustFind()` added. |
| All behavioural non-hash assertions | **MUST NOT MOVE** | scrub=1; explicit Video Scout key; fenced-no-Gemini; `baseEnv: process.env`; no raw `...process.env`; `prepareAdmissionPaneLaunch`; `notePaneExit`; no allowance mutators; pane-status enrolment + refusal-yields-`{}`; no literal token; version resolver; all negative controls. None weakened or dropped. |

### 0.3 `mustFind` justification (corrected, narrow)

With `indexOf` returning `-1`, `src.slice(-1, ...)` yields `''`, so
`envBlock.indexOf('baseEnv: process.env,') > envBlock.indexOf('const ptyEnv = buildPtyEnv({')`
evaluates `-1 > -1` -> FAILS, and `failBlock.indexOf('paneStatus.releasePane(id)') !== -1`
-> FAILS. Only the negative `!/\.\.\.process\.env\b/.test(envBlock)` passes
vacuously on the empty string. `mustFind` is retained ONLY to convert a
confusing indirect failure into a precise immediate one and to close that single
vacuous negative. It is NOT claimed that the suite would otherwise silently pass.

### 0.4 Pre-registered exact path cap

New (8 modules + 8 suites are not both required; the 8 registered SUITES are the cap):

Source: `app/pty-launch-classify.js`, `app/role-frontmatter.js`,
`app/role-definition-resolver.js`, `app/role-fence-policy.js`,
`app/pty-start-authority.js`.

Registered suites (8, taking the app gate 88 -> 96):
`app/pty-launch-classify.test.js`, `app/role-frontmatter.test.js`,
`app/role-definition-resolver.test.js`, `app/role-fence-policy.test.js`,
`app/pty-start-authority.test.js`, `app/pty-start-authority-main.test.js`,
`app/ensure-output-dir-lock.test.js`, `app/ensure-output-dir-uniqueness.test.js`.

Modified: `app/main.js`, `app/launcher-fence-invariant.test.js`,
`app/package.json`, this handoff.

**Any file outside this list requires the cap to be updated here first.**
