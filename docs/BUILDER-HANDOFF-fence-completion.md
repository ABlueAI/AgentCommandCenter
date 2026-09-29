# Builder Handoff — Fence Completion (`pty-start` launch authority)

**Branch:** `feature/fence-completion-pty-start-authority`
**Baseline:** `70fe1f1920979d43427be78332c4966acd3b408d` (local `main` = live `origin/main`, re-verified by `git fetch` at branch creation)
**Reviewed production/security content tip:** `96720f9`
**Status:** IMPLEMENTATION COMPLETE — STOPS FOR FRESH INDEPENDENT FULL-CLASS REVIEW.
No merge, no push, no branch deletion, no cleanup, **no live provider session**.

---

## 0. PRE-REGISTRATION (recorded BEFORE any source edit, commit `f50de2d`)

Committed before `app/main.js` was touched. It is the falsifiable prediction the
review measures the result against.

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

### 0.2 Pre-registered pin movements — and what actually happened

| Region | Predicted | Actual | Reason |
|---|---|---|---|
| `pty-start handler` | MOVES | **MOVED** 13566 → **14805**, sha `cbe2f345015245108e84656014f9e66c6a3c1eb187c866a1255ce2e9ae649376` | Authority gate + classifier inserted; start anchor changed `(_e, opts)` → `(e, opts)` and was updated in the same revision. |
| `fenced-role cwd gate` | MOVES | **MOVED** 1326 → **1896**, sha `ba003038c21fb4c802fa0d86c0d65dd1e12774f24e57fe6568d15182c36d8de0` | (a) anchor predicate replaced by the classified verdict; (b) refusal strings became bounded reason constants. |
| `ptyEnv block` | MOVES | **MOVED** 229 → **184**, sha `f64b6bd93abb18dced7c8d114d3ea82b98349d317878aa84dd04c25f17f7bb7b` | Anchor was the third copy of the predicate. `buildPtyEnv` arguments and P1 semantics unchanged. |
| `envBlock` / `failBlock` slices | ANCHORS UPDATED, ASSERTIONS STRENGTHENED | **AS PREDICTED** | `mustFind()` added; one extra positive assertion added. |
| All behavioural non-hash assertions | MUST NOT MOVE | **NONE MOVED** | Every one retained; two negative controls ADDED. |

**Unpredicted movement — declared here as required.** `app/pty-env.test.js`
carried two P1 source-shape assertions that pinned the *literal old predicates*
(`const fencedRole = !opts.videoScout && ...` and `videoScout: opts.videoScout,`).
They failed, correctly, for exactly the pre-registered reason. Both were
re-anchored to the classified form and each gained a **negative control** that is
strictly stronger than what it replaced:

- `!mainSrc.includes('FENCED_ROLES.has(opts.role)')` — main never re-derives the
  fence decision from the renderer role anywhere, not merely on that line;
- `!/opts\.videoScout/.test(mainSrc)` — main never reads the renderer Video Scout
  field for any decision at all.

`app/pty-env.test.js` went 156 assertions → **158**, 0 failed.

### 0.3 `mustFind` justification (corrected, narrow)

With `indexOf` returning `-1`, `src.slice(-1, ...)` yields `''`, so
`envBlock.indexOf('baseEnv: process.env,') > envBlock.indexOf('const ptyEnv = buildPtyEnv({')`
evaluates `-1 > -1` → FAILS, and `failBlock.indexOf('paneStatus.releasePane(id)') !== -1`
→ FAILS. Only the negative `!/\.\.\.process\.env\b/.test(envBlock)` passes
vacuously on the empty string. `mustFind` is retained ONLY to convert a confusing
indirect failure into a precise immediate one and to close that single vacuous
negative. **It is not claimed that the suite would otherwise silently pass.**

### 0.4 Exact path cap — FINAL

Source (5): `app/pty-launch-classify.js`, `app/role-frontmatter.js`,
`app/role-definition-resolver.js`, `app/role-fence-policy.js`,
`app/pty-start-authority.js`.

Registered suites (8, taking the app gate **88 → 96**):
`app/pty-launch-classify.test.js`, `app/role-frontmatter.test.js`,
`app/role-definition-resolver.test.js`, `app/role-fence-policy.test.js`,
`app/pty-start-authority.test.js`, `app/pty-start-authority-main.test.js`,
`app/ensure-output-dir-lock.test.js`, `app/ensure-output-dir-uniqueness.test.js`.

Modified (4): `app/main.js`, `app/launcher-fence-invariant.test.js`,
`app/package.json`, **`app/pty-env.test.js`** (cap updated per §0.2), plus this
handoff. **No other file was touched.** `git status` on the tip is clean.

---

## 1. The invariant

> `pty-start` refuses before any side effect unless (a) the request comes from
> the trusted window, (b) main's own classifier accepts the launch shape, and
> (c) for a fenced role, the **effective** deployed definition is unambiguous,
> carries the required path-fence hook, and declares no forbidden tool.

WO-6 and WO-7 runtime proof are evidence obligations for that same boundary. The
WO-7 sandbox-uniqueness correction is included under it because a same-second
collision made two concurrently launched fenced agents **share one sandbox**,
which is a fence-isolation property.

## 2. What changed, and the ordering that matters

`pty-start` now runs the authority as its **first statement**, ahead of every
side effect. Two phases, deliberately separate:

1. `assess(event, opts)` — trusted sender, then main-owned classification.
   Before any log, filesystem read, pane-status enrolment, admission claim,
   command construction or spawn. The previous handler logged `opts.cwd` and
   `opts.role` here before any validation and dereferenced `opts.id` on a
   malformed payload (a `TypeError`, not a visible refusal). Both are closed.
2. `authorizeFencedRole({role, cwd})` — effective-definition resolution, then
   fence policy. Runs **only after** the fenced cwd containment gate passes, so
   no role directory is scanned for a launch whose cwd was never established.

Classification is computed **once** and every consumer reads that one result.
Previously the same decision was re-derived from renderer fields at three points
in `pty-start` with loose truthiness, while `admission-pty-boundary.js:21` used
strict `=== true` — a real cross-module disagreement. The classifier refuses
every shape on which the two could differ, so the disagreement is now
*unreachable*, and `pty-launch-classify.test.js` pins that agreement as a
property over the full shape matrix.

Accepted shapes are the real UI payloads: `role: null` for CLI and shell panes
(`app/renderer/app.js:442`) and `role:'video-scout'` + `videoScout:true` +
`cli:null` for Video Scout (`app/renderer/app.js:2102`). Per Blue's decision,
`role:'video-scout'` is required **if and only if** `videoScout === true`.

**Mismatched `role`/`cli`/`agent` disposition: ACCEPTED, role wins**, preserving
`buildAgentCommand`'s existing precedence. `{role:'web-scout', cli:'codex'}`
launches web-scout on Claude, fenced, with the codex hint discarded; every
downstream consumer is asserted to agree.

## 3. P4 — two independent layers

**Direct enforcement.** Every fenced Claude launch now carries the main-issued
`--disallowedTools Bash Glob NotebookEdit`. These are constants
(`FORBIDDEN_TOOLS`), never renderer fields. `pty-start-authority-main.test.js`
asserts the exact constructed command against the real handler and proves a
renderer cannot add, remove, duplicate, or reorder them, nor introduce
`--allowedTools`. Builder carries **no** denials — deliberately unfenced.

**Declaration checks, retained as drift/refusal evidence.** The effective
definition must also survive the policy. An omitted `tools:` key **refuses**,
because the documented loader inherits *all* tools when it is absent — including
`Bash`. `disallowedTools` is parsed and can never rescue a forbidden grant.

## 4. Effective-definition resolution — fails closed

The earlier "managed settings are not enumerable, accepted residual" position was
withdrawn: the locations are documented, so absence is **provable**.

| Scope | Priority | Handling |
|---|---|---|
| Managed | 1 | `C:\Program Files\ClaudeCode\.claude\agents`, `...\managed-settings.json`, `...\managed-settings.d`, plus `HKLM\SOFTWARE\Policies\ClaudeCode` and `HKCU\SOFTWARE\Policies\ClaudeCode`. **Presence OR unreadability REFUSES.** Managed policy is never parsed. The obsolete `C:\ProgramData\ClaudeCode` path is deliberately not consulted — the CLI does not read it, so checking it would manufacture false refusals. |
| `--agents` | 2 | Absent by construction; `buildAgentCommand` emits only `--agent`. |
| Project | 3 | Every `<ancestor>/.claude/agents/` from the launch cwd upward, scanned **recursively**; closest-to-cwd wins (valid on the installed **2.1.250** ≥ 2.1.178). |
| User | 4 | `~/.claude/agents/`, same recursive scan. |
| Plugin | 5 | Not scanned — justified by *precedence* (below user scope, cannot override), not by disclaimer. |

Caps: 32 ancestors, 64 files and depth 4 per tree; exceeding any cap **refuses**.
Unreadable candidates **refuse**. Unsupported grammar **refuses**. Two files
declaring the same `name` in one tree **refuse** (documented as read-order
dependent with no precedence). "Winner" means the highest-priority candidate
**matching the requested identity** — a nearer directory holding only other
agents does not end the search; asserted directly.

**Residual, stated plainly and not softened:** server-delivered administrative
policy cannot be disproved from filesystem and registry checks. Trusted
organization-admin policy is outside Blue Helm's renderer-threat boundary. **No
universal protection against a future enterprise administrator override is
claimed.**

## 5. Hook integrity — the opaque block is gone

An independent no-write probe drove the **real** `verify-fence` handler against
synthetic content and got `{ok:true}` for all three of: the canonical role; a
role whose matcher covered only `Read` while its tools still declared `Write`;
and a role with `PreToolUse: []` whose fence command sat under `PostToolUse`.
The cause is visible at the old `main.js:1089-1099`: `/PreToolUse/.test(text)`
matches the literal anywhere, the `command:` regex matches anywhere, and the
matcher regex returns the **first** `matcher:` in the file regardless of owner.

The hooks block is now parsed as a structure and the policy binds the fence to:
the actual `PreToolUse` entry; **that same entry's** matcher covering every
path-capable tool the role declares (Read and Write for all three fenced roles);
the **exact canonical deployed hook path** — a different file merely named
`fence-write.js` is refused; and the **tracked `scripts/hooks/fence-write.js`
content identity** by SHA-256, so a tampered deployed hook refuses.

All five counterexamples (N1–N5) plus the decoy-path and content-drift cases are
negative controls. All three real fenced roles pass as actually deployed.

`verify-fence` now delegates to the same modules and is documented as **early
renderer feedback, not enforcement** — `pty-start` never calls it, so a bypassed
renderer can skip it entirely.

**Threat limitation, preserved honestly:** every check reads files the launching
user can also write. This defeats an unreviewed or drifted declaration, a
renderer-side bypass, and a stale deployment. It is **not** isolation from a
malicious or compromised same-user process.

## 6. WO-6 and WO-7

**WO-6.** Missing cwd, nonexistent cwd, outside-root, and the `outputs-evil`
prefix sibling all refuse with **zero** spawns in main; Builder launches
unaffected from a non-sandbox cwd; a fenced happy path is a positive control, and
the `ensure-output-dir` → `pty-start` round trip is asserted end to end.
**Nothing here remained live-only.**

**WO-7, split into two suites as required.**

- *Lock* (`ensure-output-dir-lock.test.js`): 20 concurrent calls — all settle,
  all 20 trust entries survive, no lost update. Deadlock-freedom is **measured**,
  not reasoned: a `JSON.parse` throw and a rename-onto-directory throw are each
  forced inside the critical section, and the next call is proven to still
  acquire — the `finally { release() }` guarantee the WO-7 reviewer flagged as
  the one failure mode that would silently hang every future launch app-wide.
- *Uniqueness* (`ensure-output-dir-uniqueness.test.js`): the defect is pinned as
  real (twenty same-second same-role calls yield **one** name under the old
  scheme; recursive `mkdir` accepts an existing directory, which is why the
  collision was silent), then 20 concurrent **same-role** calls produce 20
  distinct, empty sandboxes with 20 trust entries. **The collision is not hidden
  by varying the role per fixture.** The fix is `fs.mkdtempSync` — atomic,
  exclusive creation; the suite asserts that plain `mkdirSync` throws on an
  existing directory while recursive `mkdirSync` accepts it, which is exactly why
  a random suffix plus recursive mkdir was rejected.

**The read-only/permission path DID reproduce** on a disposable fixture via
`icacls` deny (EPERM observed), driven through the production handler: the
launch still proceeds, the sandbox is created, and the lock is released
afterwards. **The real `~/.claude.json` was never read, written, renamed, or
permission-modified** — `USERPROFILE` is redirected to a disposable fixture in
every suite. No evidence is outstanding on this axis.

## 7. Evidence exercises production wiring

Zero-spawn is proven against the **real registered handler** obtained from
`record.handled.get('pty-start')` after evaluating the real `app/main.js`, using
the `Module._load` harness pattern already established by
`admission-main-startup.test.js`. The node-pty stub **counts** every spawn, so a
refusal that reached `pty.spawn` would fail the assertion. `electron` and
`@lydell/node-pty` are stubbed: no Electron process, no window, no PTY, no
provider call.

**Fixture note worth reviewing:** the fixture root deliberately avoids the user
profile. Project-scope discovery walks up from the launch cwd, and on Windows
`os.tmpdir()` lives under `C:\Users\<user>`, so a profile-nested fixture
discovers the developer's real `~/.claude/agents` as an ancestor and measures the
wrong tree. That is correct loader behaviour, not a defect — the production
outputs root (`D:\Workspace\.command-center`) is not under the profile.

## 8. Gate results

| Gate | Result |
|---|---|
| Registered app suites | **96/96 green, exit 0** (88 → 96; `&&`-chained, so all ran) |
| `launcher-fence-invariant` | 27 passed, 0 failed |
| `pty-env` (P1) | **158 passed, 0 failed** |
| New suites | classify 85/0 · frontmatter 43/0 · resolver 29/0 · fence-policy 37/0 · authority 59/0 · authority-main 85/0 · WO-7 lock 16/0 · WO-7 uniqueness 17/0 |
| Pester | **955 passed, 0 failed, 0 skipped** — matches the authoritative merged-main baseline |
| Static | `node --check` clean on all 16 changed/added JS files; `package.json` parses |

**Environment note:** the worktree had no `node_modules`. Rather than install
anything, a **directory junction** points `app/node_modules` at the primary
worktree's existing tree, so the gate ran against the identical installed
dependencies with no network access and no dependency change. It is gitignored
and is a local build artifact, not part of the delta.

**Not run:** a full Electron restart with manual verification, which belongs with
the live matrix and is not authorized.

## 9. Review artifacts

Generated with `git diff --output` (never PowerShell `>`), explicit three-dot
range `70fe1f1920979d43427be78332c4966acd3b408d...96720f9`:

| Artifact | Bytes | SHA-256 |
|---|---|---|
| `.agent-review-fence-completion-mainjs.diff` | 18562 | `44171db37e9275a76b1a0a09be3381be3f1eef9e37671dd514684b305ec513cc` |
| `.agent-review-fence-completion-whole.diff` | 157923 | `9835947c6d03e92e0812aff8befdac4f1156c4361e4dcd35255136e2b128496c` |

**Independent pin reproduction.** All three region values are reproducible from
the committed object alone, on any machine and under any `autocrlf` setting:

```
git show 96720f9:app/main.js   # LF-normalize, slice by anchor, sha256 the UTF-8 bytes
  fenced-role cwd gate   1896  / ba003038c21fb4c802fa0d86c0d65dd1e12774f24e57fe6568d15182c36d8de0
  ptyEnv block            184  / f64b6bd93abb18dced7c8d114d3ea82b98349d317878aa84dd04c25f17f7bb7b
  pty-start handler     14805  / cbe2f345015245108e84656014f9e66c6a3c1eb187c866a1255ce2e9ae649376
```

Verified reproduced from `git show` on the tip, not from the working tree.

**Containment claim, checkable in the main.js-only diff.** The lines
`const within = fold(resolvedCwd) === fold(resolvedRoot) ||` and
`fold(resolvedCwd).startsWith(fold(resolvedRoot) + path.sep);` appear as
**unchanged context**, not as `+`/`-`. Only the predicate line and the refusal
strings changed in that region. `realOrNearest` resolution and the placement
before the `USERPROFILE` fallback are untouched.

## 10. Procurement

**The OSS gate does not reopen.** No new dependency and no new subsystem. Reuses
`trusted-ipc-sender.js`, the existing role/CLI sets, the existing role-file read
path, and the existing `Module._load` test harness. `fs.mkdtempSync` is a Node
built-in. The frontmatter/hooks grammar is a bounded accept-list that refuses
every unrecognized construct — **not a general YAML parser and not a replacement
for Claude Code's loader**. If review concludes the hooks structure genuinely
requires a YAML library, work stops for the Source-Scout evaluation before any
further code.

## 11. Live matrix — NOT AUTHORIZED, recorded for the eventual request

1. Read an absolute path outside the sandbox → **denied**
2. Read via `..\..\` traversal → **denied**
3. Read through an in-sandbox junction pointing outside → **denied**
4. Write to a controlled path outside → **denied**
5. Confirm the launched cwd **is** the dedicated outputs sandbox → **successful
   verification** (a positive control, not a denial)
6. `WebFetch https://example.com` → **permitted by design**

Synthetic nonsensitive markers only; no credential, SSH key, `.env`, browser
data, or business file in any prompt or payload; no exfiltration URL constructed.

The admission ledger bounds **admissions through supported Blue Helm input
paths**. It is not a universal provider-call ceiling and not a dollar ceiling,
and it is not same-user isolation.

Before any live run Blue must separately approve the exact prompts, the run
identity, the controlled pane, the allowance, the quiet-system window, and the
stop conditions. Stop rules: any of items 1–4 permitted; any path outside the
sandbox in Logs; any `WebFetch` beyond `example.com`; any unexpected tool; any
refusal text carrying a path, prompt, or credential-shaped value; any gate or
Pester regression — **no retries and no invented exceptions**. AGR-1 and AGR-2
remain OPEN and no failure is to be attributed to them.

## 12. Reported separately — NOT built here

1. `ensure-output-dir` and `verify-fence` still have no trusted-sender gate.
   `pty-start` was the authorized invariant; gating those is a different one and
   would pull `~/.claude.json` writing into this branch.
2. `scripts/hooks/fence-write.js` fails **open** on malformed stdin
   (AUDIT #8) — a deliberate availability tradeoff and a separate decision.
3. WO-6 containment accepts any directory under the outputs root rather than the
   exact directory `ensure-output-dir` returned for this launch (the historical
   brief's open design question; still low severity).
4. `scripts/sync-roles.ps1`'s docstring still names only "web-scout, operator"
   as fenced; all three carry the hook. Non-security prose drift.
5. AUDIT #9 orphan `.tmp` cleanup on rename failure remains open.
6. `source-scout` still lacks an `effort:` field (explicit non-goal).

## 13. Review request

Because this touches a credential/fence boundary, this branch requires a **fresh
independent Full-class whole-diff review**. Blue alone authorizes merge and push.
Nothing in P1's environment policy was reopened; P1 remains closed and its
`pty-env` regression family is green at 158/0.
