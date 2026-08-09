# OSS Procurement Decision Record — Dockview (layout/docking subsystem)

Subsystem: **Dockview — pane layout / docking manager for the Blue Helm renderer**
Record path: `docs/OSS-PROCUREMENT-dockview.md` (this file — the tracked record required by
`AGENTS.md` § *OSS-FIRST PROCUREMENT GATE — HARD INVARIANT*, item 6)
Work orders, in order: *Work Order — Dockview Bounded Prototype* (superseded for future work) ·
*Work Order — Dockview Production Integration* (**current**)
Branches: `feature/dockview-prototype` (prototype, accepted) ·
`feature/dockview-production-integration` (production adoption, **under review**)
Base `main` SHA for both: `1dce24c141e929c04122e8b2998277d4c2d0c728`
Evidence retrieval date: **2026-08-04** (all registry/GitHub values in §§ 2–14 were read on this
date and are unchanged). Adoption recorded: **2026-08-07**.

This record was the **first** commit on the prototype branch and preceded any dependency install,
per that work order § 4. It is now also the tracked adoption record required by `AGENTS.md` § OSS-FIRST
PROCUREMENT GATE item 6.

---

## 1. Blue's binding verdicts — verbatim

Two verdicts exist for this subsystem. The current one governs; the earlier one is retained as
historical evidence, not deleted, because it is what authorized the prototype whose results the
current verdict rests on.

### 1.1 CURRENT — ADOPT (2026-08-07), verbatim

> ADOPT — Dockview: adopt dockview@7.0.4 as Blue Helm 1.0's production pane-layout engine using the
> reviewed prototype architecture. Preserve main-owned IPC, PTY, filesystem, credential, clipboard,
> Library, audio, and persistence authority; exclude popouts; persist only strictly validated
> versioned layout metadata; and keep pane-status indicators separate.

This **supersedes the earlier PROTOTYPE verdict for future Dockview work**. It authorizes
implementation only. It does not authorize merge or push, and it does not assert that the production
integration has passed anything — see § 1.3.

### 1.2 HISTORICAL — PROTOTYPE (2026-08-04), verbatim

Retained as evidence. It governed `feature/dockview-prototype` and nothing else.

> PROTOTYPE — Dockview: evaluate the MIT dockview package at an exact verified version using real
> terminal and Library panes. Exclude popouts. Preserve main-owned IPC, PTY, filesystem, and
> credential authority. Persist only versioned layout metadata. Production integration requires
> separate human acceptance.

Its binding scope clarification, verbatim:

> That authorizes a bounded prototype only, not production adoption, and does not authorize merge,
> push, or any change to the production renderer path.

That clarification remains true **of the prototype branch**. It is not a constraint on the
production-integration branch, which the ADOPT verdict authorizes.

**ADOPT** and **PROTOTYPE** are both among the five allowed final subsystem verdicts (ADOPT · FORK ·
PROTOTYPE · PATTERN-MINE · BUILD FRESH). Candidate disposition (§ 14) is the separate, lower level.
Pane-status indicators remain a **separate subsystem** with their own record and verdict; the ADOPT
verdict restates that they stay separate, and they are out of scope here.

### 1.3 What the adoption rests on — and what it does not claim

**Independent review of the prototype: PASS.** A fresh Claude Opus 5 Very-High-effort, read-only
Full-class review of Round-6 code tip `be4422d84bab4727d3bd11772f30d9a010069ed5`, plus a supplement
covering its items 7–15, ended in the literal line `VERDICT: PASS`. That review reproduced the pinned
artifact byte-for-byte, re-ran the app gate (2287/0, 44 suites, exit 0), Pester (955/0/0), the vendor
tripwire (`remoteRequestCount: 0`), and the PowerShell parse (71 files, 0 errors), and recorded three
non-blocking observations (an inert resize-listener leak on an unreachable rollback branch, an
incomplete harness-CSS drift pin, and one undisclosed unreachable branch).

**Human acceptance of the prototype: PASS — attested by Blue**, in the *Work Order — Dockview
Production Integration* dated 2026-08-07, covering: the ordinary app path; Dockview pane creation,
movement, splitting, resizing and closure; Library singleton docking, closing and reopening; layout
save and restore; a Copy Output controlled test; Dictate destination locking; TTS selection, voice,
speed and Stop; and a final ordinary-app fallback control. **This is recorded as Blue's attestation,
not as repository-proven evidence** — the prototype branch's own handoff still reads "No human
acceptance" because it was written before acceptance was performed, and no acceptance transcript is
committed. The saved prototype layout produced during that work remained a schema-versioned envelope
for `dockview@7.0.4` (1,653 bytes, SHA-256
`D49D616FEE7F1569611C7F0C9631EEEE50AE70AF3E0AC85DF6B43D640DDBD477`, `schemaVersion 1`), verified
unmodified.

**No production adoption, merge, or push occurred before this record.**

**The production integration itself has passed nothing yet.** It is implemented on
`feature/dockview-production-integration` and is **separately reviewed under the production-integration
work order § 14**. Nothing in this file may be read as a passing review, human acceptance, or merge
authorization for that branch.

---

## 2. Package ruling

Use exactly **`dockview@7.0.4`**. Do **not** install `dockview-core` directly.

Rationale, confirmed against the package's own shipped source rather than documentation alone —
`dist/dockview.js`, verbatim in-bundle comment:

> This marker exists for ONE purpose: a developer warning about the v7 package renames. It has no
> functional effect on dockview's behaviour. Following the renames, `dockview-core` is internal and
> `dockview` is the public JavaScript package; `dockview` calls `markDockviewPackageLoaded` on import
> so that `dockview-core` can detect — and warn about — being used directly.

- Dockview v7 realigned package names: `dockview` is the framework-agnostic **JavaScript** package;
  `dockview-react` is the React wrapper; `dockview-core` is **internal**.
- `dist/esm/index.js` shows `dockview` is the "batteries-included" entry: it re-exports the core API
  *and* calls `registerModules(Modules)` to register the separable feature modules. Depending on
  `dockview-core` directly would therefore ship an incomplete v7 feature set **and** emit a
  "don't use dockview-core directly" developer warning.
- `dockview@7.0.4` depends on `dockview-core@^7.0.4` and introduces **no** React dependency.

Install command (only after this record is committed):

```
npm install --save-exact dockview@7.0.4
```

---

## 3. Primary sources (retrieved 2026-08-04)

| Source | URL / command |
| --- | --- |
| npm registry manifest (authoritative version, license, deps, dist, provenance) | `npm view dockview@7.0.4 --json` |
| npm registry manifest — core | `npm view dockview-core@7.0.4 --json` |
| Published tarballs, extracted and read directly | `npm pack dockview@7.0.4 dockview-core@7.0.4` |
| Source repository | https://github.com/mathuo/dockview |
| Repository metadata (GitHub REST API) | https://api.github.com/repos/mathuo/dockview |
| Repository licence map | https://raw.githubusercontent.com/mathuo/dockview/master/LICENCE.md |
| Project site | https://dockview.dev |

"No suitable OSS exists" is **not** claimed here; candidates were searched and compared (§ 5).

---

## 4. Package identity — exact values

Recorded from the registry on 2026-08-04. These are the values the lockfile must reproduce; the
post-install reconciliation is recorded in the branch handoff.

**`dockview@7.0.4`** — published `2026-07-22T18:33:18.158Z`, `dist-tags.latest = 7.0.4`

- integrity: `sha512-n6n9WpYZgp/WY8SgvP4hr9qh01ZXhSGIRmlhoJXxRU3f34bwxCbFyOhBArV4W8quolX8OQe1yPfAUwUUjdnZPA==`
- shasum: `1a49b4afe535d5f713919b5669dd06e7084e61c3`
- fileCount `14` · unpackedSize `3,042,013` bytes · `gitHead 08097bd22495af8db171698355dffde93b9f5a88`
- provenance: **SLSA v1 attestation present**, published by GitHub Actions OIDC
  (`_npmUser: GitHub Actions <npm-oidc-no-reply@github.com>`)

**`dockview-core@7.0.4`** — published `2026-07-22T18:33:11.400Z`

- integrity: `sha512-AiIzD6ov153L/VuhqVBg5KD5oSAgJGH7L1xvzV/X+ghIEOTFfEQYEBGNd/ys+ZjQfdGRogHSeQ0v9JF/L6JrPg==`
- shasum: `c01aa63e3fc0d01f298269bface76b94adfe8082`
- fileCount `417` · unpackedSize `10,267,321` bytes

---

## 5. Candidate comparison

All rows retrieved 2026-08-04 from the npm registry.

| Candidate | Licence | Latest | Last publish | Runtime deps | React required | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| **`dockview@7.0.4`** | MIT | 7.0.4 | 2026-07-22 | `dockview-core` only | **No** | **Accepted for prototype** |
| `dockview-core@7.0.4` (direct) | MIT | 7.0.4 | 2026-07-22 | none | No | Rejected — internal package, incomplete v7 feature set, emits direct-use warning |
| `dockview-react@7.0.4` | MIT | 7.0.4 | 2026-07-22 | `dockview` | **Yes** (peer `react`, `react-dom` ^16.8–^19) | Rejected — would introduce React |
| `golden-layout` | MIT | 2.6.0 | **2022-09-26** | none | No | Rejected — no release in ~3 years 10 months |
| `@lumino/widgets` | **BSD-3-Clause** | 2.9.0 | 2026-07-03 | **11** `@lumino/*` packages | No | Rejected — 11-package transitive surface; JupyterLab widget/messaging framework, not a drop-in layout host |
| `flexlayout-react` | MIT | 0.10.2 | 2026-07-29 | none | **Yes** (peer `react`, `react-dom` ^18–^19) | Rejected — would introduce React |
| Build fresh (owned code) | n/a | n/a | n/a | none | No | Rejected for *this* step — see § 12 |

Notes on the two maintained non-React rejections:

- **Golden Layout** is functionally the closest non-React peer and is dependency-free, but its last
  npm release predates the current Electron/Chromium line by nearly four years. For a subsystem whose
  whole risk is resize/observer correctness in a modern Chromium renderer, an unmaintained candidate
  is the wrong prototype target.
- **Lumino** is actively maintained and genuinely capable (it is JupyterLab's foundation), but it is
  **BSD-3-Clause** rather than MIT, expands the dependency closure from 2 packages to 12, and imposes
  its own `Widget`/`MessageLoop` object model. Hosting an existing xterm/PTY pane inside it means
  adopting that model, which is a materially larger change than the one Blue authorized.

---

## 6. Licence

**Effective licence for what we would use: MIT.** Three independent confirmations:

1. `package.json` `"license": "MIT"` in **both** published tarballs (`dockview`, `dockview-core`).
2. `@license MIT` banner in the shipped bundles (`dist/dockview.js`, core `main.esm.mjs`).
3. The repository licence map (below) lists `dockview` and `dockview-core` as MIT.

### Two licence findings that must not be lost

**(a) GitHub reports the repository licence as `NOASSERTION` / "Other" — this is a detector artifact,
not a restriction.** The repo root file is `LICENCE.md` (British spelling), and it is not a bare MIT
text — it is a **monorepo licence map** followed by the full MIT text. GitHub's classifier therefore
declines to assert a single licence. The MIT grant itself is standard and unmodified: `Copyright (c)
2021 mathuo`, verbatim MIT terms, no added clauses.

**(b) The monorepo contains a proprietary sibling.** `LICENCE.md` states verbatim:

> | `dockview-enterprise` | **Proprietary — commercial licence** |

and

> `dockview-enterprise` is **not** covered by the MIT Licence; it is proprietary software governed
> solely by its own commercial licence agreement.

This does **not** affect us: the dependency closure is exactly `dockview` → `dockview-core`
(§ 7), and `dockview-enterprise` is not in it. It is recorded because it is a live boundary — any
future reach for "enterprise" Dockview features crosses from MIT into a paid commercial licence, and
that must be a deliberate, separately-approved decision, never an incidental upgrade.
(The npm package `dockview-enterprise` is currently a `0.0.0` name-reservation placeholder whose npm
metadata says "MIT", contradicting the repo's proprietary designation. The contradiction is further
reason to treat that package as out of bounds without explicit legal review.)

**(c) Attribution gap.** The root `LICENCE.md` claims "Each published package ships its own
`LICENCE.md`". **Neither published tarball actually contains a licence file** — verified by
extracting both. The MIT permission notice ("shall be included in all copies") therefore travels only
via the `package.json` field and the in-bundle `@license MIT` banner. Adequate for a local prototype;
if Blue Helm is ever redistributed, the MIT notice must be reproduced in our own attribution file.

---

## 7. Runtime and transitive dependencies

Complete runtime closure — **2 packages, depth 1**:

```
dockview@7.0.4
└── dockview-core@7.0.4      (dependencies: none · peerDependencies: none)
```

- `dockview@7.0.4` `dependencies` = `{ "dockview-core": "^7.0.4" }`; no `peerDependencies`.
- `dockview-core@7.0.4` `dependencies` = none; `peerDependencies` = none. It is genuinely
  zero-dependency, as its own description claims.
- `dockview`'s `dockview-modules` is a **devDependency** only — not installed by consumers. Its code
  is pre-bundled into the published artifacts.
- **No install lifecycle scripts** in either package. Both expose only `build*`/`test*`/`lint`/
  `format` scripts, none of which npm runs on install — so `npm install` executes no package code.
- No `os` / `cpu` constraints, no `binary` field, **no native module, no node-gyp, no prebuild
  download**. Pure JavaScript + CSS.

## 8. React impact

**None.** `react` and `react-dom` appear nowhere in the closure — not as dependencies, not as peer
dependencies, not as optional dependencies. The React binding lives in the separate `dockview-react`
package, which we do not install. This is verified again post-install as a NO-GO gate (work order
§ 4: "If React appears … stop for Blue").

## 9. Telemetry / network evidence — static check (check 1 of 3)

Work order § 10 requires three independent checks. This is **check 1: source and metadata
inspection**. Checks 2 (isolated Electron harness with request monitoring) and 3 (live prototype
request counting vs. the default-app baseline) are runtime evidence recorded in the branch handoff.

Scanned: the full UMD bundle `dist/dockview.js` and **all** `*.js` / `*.mjs` files under
`dockview-core@7.0.4`'s `dist/` (417-file package), for:

`fetch(` · `XMLHttpRequest` · `WebSocket` · `EventSource` · `sendBeacon` · `navigator.sendBeacon` ·
`importScripts` · `new Worker` · `ServiceWorker` · `eval(` · `new Function` · `localStorage` ·
`sessionStorage` · `indexedDB` · `document.cookie`

**Result: zero matches for every pattern, in both packages.**

Every URL literal in either package was extracted and enumerated. There are **no endpoints**. The
complete set is:

- `http://www.w3.org/2000/svg` — the SVG XML namespace, used with `createElementNS`. Not a fetch.
- 17 documentation/attribution comment URLs (MDN, the dockview repo, microsoft/vscode, Stack
  Overflow, Wikipedia, rxjs.dev). All inside comments.

There is no analytics identifier, no phone-home, no update check, and no remote asset reference.
Dockview also stores nothing in browser storage, which matters here: it cannot independently persist
layout state behind our backs — persistence is only what we explicitly serialize (§ 11).

## 10. Security surface

Positive:

- No network, storage, or code-evaluation primitives (§ 9) — no `eval`, no `new Function`, so no
  conflict with the renderer CSP's absence of `unsafe-eval`.
- **No `innerHTML` usage** in either bundle; DOM is constructed via `createElement`/`textContent`.
- No install-time script execution; no native binary; SLSA provenance attestation on the tarball.
- Repository publishes a `SECURITY.md` and is not archived or disabled.

Surface to bound in the prototype (drives the work order's kill criteria, not blockers):

- Dockview is a **DOM and drag/drop** library: it owns pointer/drag handling and reparents element
  subtrees. Reparenting is exactly the risk to xterm instances and PTY sizing (work order §§ 7–8).
- The library supports **popout / floating windows** (repo topic `popout-windows`). Blue's verdict
  **excludes popouts**; floating windows are outside acceptance scope. The prototype must not enable
  either, and must not require `nodeIntegration` or new window permissions to function.
- `dist/dockview.js` injects its stylesheet into `document.head` at load (`styleInject`). This is a
  load-time side effect (`"sideEffects": true`), so the bundle must only ever be loaded **after** the
  trusted prototype flag is true — never on the default path.
- Serialized layout state is attacker-influenceable once it is a file on disk; it is treated as
  untrusted input and strictly validated before `fromJSON` (work order § 9). Dockview's own
  `fromJSON` performs no such validation for us.

## 11. Persistence / migration implications

- Dockview serializes layout via `toJSON`/`fromJSON`. It writes nothing itself: no `localStorage`,
  no `indexedDB`, no file access. **All** persistence is ours, which is what makes a main-owned,
  schema-validated envelope possible.
- Prototype state is therefore stored by main under Electron `userData` as a versioned envelope
  (`schemaVersion`, `package`, `packageVersion`, `savedAt`, `layout`), so a future Dockview version
  change is detectable and refusable rather than silently mis-parsed.
- **Migration risk to record:** `fromJSON` state shape is Dockview-internal and versioned with the
  library. The v6→v7 line moved fast (6.6.1 → 7.0.2 in under a month). Any adoption must assume
  layout state is **not** forward-compatible across majors and must be re-derivable — which is why
  the prototype restores only known prototype pane IDs and refuses unknown component kinds.
- The exact allowlisted layout shape must be derived from controlled `dockview@7.0.4` fixtures. If
  that state cannot be honestly validated without accepting arbitrary structures, the work order
  requires a **NO-GO** declaration rather than a permissive validator.

## 12. Windows / Electron suitability

- Pure JavaScript + CSS, no native code, no platform constraints — nothing to compile or sign, and no
  Smart App Control exposure beyond what the app already has.
- Ships a self-contained, browser-loadable UMD bundle (`dist/dockview.js`, `dist/dockview.min.js`)
  that registers `globalThis.dockview`. This matches the pattern this repo already uses for xterm and
  its addons (`app/renderer/vendor/*.js` loaded by `<script src>`), so it needs **no bundler, no
  import map, no Node integration, and no CSP change**.
- **Open technical finding — recorded here because it changes how the prototype loads the library.**
  The work order § 6 says to "prefer the published, browser-loadable v7 ESM bundle without adding a
  bundler". Verified against the shipped files: the ESM entry
  (`dist/package/main.esm.mjs`, the `exports.import` target) is **not** standalone-loadable in a
  browser. Its first two statements are:

  ```js
  import { defineModule, DockviewCompositeDisposable, /* … */ } from 'dockview-core';
  export * from 'dockview-core';
  ```

  `'dockview-core'` is a **bare specifier**, which a `file://` Electron renderer cannot resolve
  without an import map. Supplying one requires an inline `<script type="importmap">`, which the
  app's CSP (`script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net` — no `unsafe-inline`)
  blocks. The self-contained UMD bundle in the **same package at the same version** has none of these
  problems and requires none of the mitigations the work order forbids (esbuild, React, Node
  integration, looser CSP). This is a deviation from the letter of § 6 ("ESM") while satisfying its
  stated intent, so per `AGENTS.md` item 8 it is **raised for Blue's approval before code is
  written**, not decided unilaterally.

## 13. Adoption versus owned-code effort

- **Adopt (prototype):** two MIT packages, zero transitive risk, no build tooling. The work is
  integration, not implementation: an opt-in flag, a pane adapter, an xterm refit lifecycle, and a
  validated layout store. Dockview supplies drag/drop, tab groups, split grids, and serialization —
  the parts that are tedious and easy to get subtly wrong.
- **Build fresh:** the repo already owns a hand-built grid that works. Replacing it with an
  owned docking manager means writing drag/drop reparenting, tab groups, nested split geometry, and a
  serialization format — and then owning every resize/observer edge case in perpetuity. That is a
  large, open-ended cost for behaviour a maintained MIT library already provides.
- **Deciding factor:** the risk here is *not* whether a docking manager can be written; it is whether
  a third-party one can host a live xterm/PTY pane without breaking refit, PTY geometry, clipboard,
  TTS, and Dictate targeting. That question is answered only by a bounded prototype against **real**
  panes — which is exactly the verdict Blue issued, and why BUILD FRESH is rejected *at this step*
  rather than on the merits.

## 14. Candidate disposition and rationale

**Accepted for prototype evaluation: `dockview@7.0.4`.**

MIT with an unmodified grant; actively maintained (7.0.2 → 7.0.3 → 7.0.4 between 2026-06-22 and
2026-07-22, with experimental builds through 2026-08-01, repo pushed 2026-08-03, 3,335 stars, not
archived); a two-package, zero-transitive-dependency closure; no React; no native code; no install
scripts; SLSA provenance; and — verified by reading the shipped sources, not by trusting the
description — **no network, telemetry, storage, or code-evaluation primitives whatsoever**.

Rejected candidates and the single deciding reason for each: `dockview-core` direct (internal package,
incomplete v7 feature set) · `dockview-react` and `flexlayout-react` (introduce React) · Golden Layout
(unmaintained since 2022-09-26) · Lumino (BSD-3-Clause, 12-package closure, foreign widget model) ·
build fresh (rejected at this step only; a prototype must answer the integration question first).

**These are candidate dispositions, not a subsystem verdict.** The subsystem verdict remains Blue's
`PROTOTYPE`, and the prototype's outcome is evidence for a later human adoption decision — ADOPT ·
FORK · PROTOTYPE · PATTERN-MINE · BUILD FRESH — not a decision this record makes.

## 15. Audit gate — Blue's amended § 4 clause, and the reachability determination

The work order's § 4 stop condition ("a HIGH/CRITICAL advisory exists") was ambiguous against this
tree, which already carries pre-existing advisories. Blue ruled on 2026-08-04. The clause now reads:

> no NEW high/critical advisory **attributable to the candidate**, including **newly reachable
> existing advisories**

Blue's reasoning, recorded because it is the reusable part: an unchanged advisory *count* can hide a
**new path** to an already-listed vulnerable package, which is exactly the failure mode totals miss.
A pure identity comparison of `npm audit` output is therefore not sufficient evidence on its own.
Future OSS procurement orders should state the clause in the amended form so the next candidate does
not need a human tiebreak on the same ambiguity.

### Determination for `dockview@7.0.4`: PASS — delta is zero and unambiguous

Two independent checks, both required by the amended clause:

1. **Count comparison.** `npm audit` is identical before and after the install:
   `{info 0, low 0, moderate 2, high 4, critical 0, total 6}` in both cases, over the identical
   package set `@huggingface/transformers, kokoro-js, protobufjs, sharp, tar, undici`. No advisory
   names `dockview` or `dockview-core`.
2. **Reachability.** Computed from the lockfile, the set of packages reachable from `dockview` is
   exactly `{dockview-core}` — and `dockview-core` has zero dependencies. **No vulnerable package is
   reachable from Dockview by any path**, so no existing advisory became newly reachable. The
   lockfile diff is `+17 / -0` lines touching only the two `node_modules/dockview*` entries, so no
   pre-existing package gained an edge either.

`npm audit fix` was **not** run, and must not be. Blue's stated reason: it would silently upgrade the
audio/ML chain inside a layout prototype, breaking the one-invariant rule and contaminating the diff
the reviewer has to read.

### The six advisories are pre-existing UNRESOLVED RELEASE RISKS

They are **not** accepted, **not** fixed, and **not** harmless. They are out of scope for this work
order and unchanged by it. Per Blue's required follow-through they are triaged **individually** —
lumping them as "the audio stack" would hide that three of them are not ML-specific at all:

| Advisory | Sev | Shortest path from the app | Shipped at runtime? | Class |
| --- | --- | --- | --- | --- |
| `sharp` (libvips CVE-2026-33327/33328/35590/35591) | high | `@huggingface/transformers → sharp` | **Yes** (prod dep) | ML-specific |
| `@huggingface/transformers` (inherited via sharp) | high | direct prod dependency | **Yes** | ML-specific |
| `kokoro-js` (inherited via transformers) | high | direct prod dependency | **Yes** | ML-specific (TTS) |
| `protobufjs` (DoS via `.proto` option parsing) | moderate | `@huggingface/transformers → onnxruntime-web → protobufjs` | **Yes** | **not** ML-specific |
| `tar` (uncontrolled recursion DoS) | moderate | `@huggingface/transformers → onnxruntime-node → tar` | **Yes** | **not** ML-specific |
| `undici` (5 advisories: response desync, cache disclosure, CRLF injection, cookie injection) | high | `electron → @electron/get → undici` — **not reachable via prod deps at all** | **No** — lockfile marks it `dev: true, optional: true`; it is Electron's build/install-time downloader | **not** ML-specific |

The `undici` row is the clearest illustration of why individual triage was required: it is a *high*
advisory that is **not present in the shipped application** at all, which is a materially different
risk posture from the three ML runtime dependencies.

**Destination and ownership — one item this branch CANNOT durably deliver.** Blue directed that these
six be added as a named item on the Blue Helm 1.0 release-gate list, owned by **EDA-1**
(`docs/AUDIT-SCOPE-environment-deployment.md`), each with its own reachability determination and its
own blocks-1.0 / defer decision. That registration belongs in `BLUE-HELM-MASTER-STATUS.md`, which
this work order's § 12 lists as **Expected unchanged** — and, more decisively, this branch is
explicitly **not authorized to merge or push** and is required to be removable by deleting it. Any
release-gate entry written here would vanish with the branch, recreating exactly the "a phrase that
exists in one handoff and nowhere else" failure Blue called out.

The triage evidence above is therefore recorded here, in a tracked file, and the **registration is
raised as a separate, small, independently-authorized change against `main`**. It is not silently
performed on this branch, and it is not silently skipped.

## 16. Predeclared NO-GO criteria

The work order § 5 predeclares eleven NO-GO criteria (terminal refit failure; stale/zero/oscillating
PTY geometry; any telemetry or network request; a requirement for React, remote assets,
`nodeIntegration`, unsafe IPC authority, weaker context isolation, weaker CSP, or popout permissions;
layout state that cannot be strictly schema-validated and bounded before `fromJSON`; corrupt,
oversized, unsupported, or hand-edited state reaching `fromJSON`; invalid state crashing the renderer,
silently dropping panes, or silently overwriting the file; broken clipboard / Copy Output / TTS /
Dictate / focus / PTY output / close behaviour / Video Scout Open Report after a move or tab; Dockview
receiving terminal or report contents, worktree paths, prompts, credentials, provider keys, or IPC or
filesystem authority; default `npm start` importing or initializing Dockview, creating a layout file,
or changing the current grid; and any architectural refactor whose production consequences cannot be
removed by deleting the branch).

Any one of them makes this candidate a prototype **NO-GO** regardless of appearance. A NO-GO is
evidence about the Dockview candidate — it is **not** a final subsystem verdict, and `REJECT` is never
one. Blue selects the final verdict from the five allowed terms.

Outcome: **none of the eleven fired as a permanent NO-GO.** Criterion 8 (broken TTS/Dictate after
docking) *did* fire at `3e338d9` — Dictate was unreachable behind the prototype's full-screen overlay
— and was corrected in `be4422d`, which the Round-6 review then passed. That criterion is moot for
production by construction: § 6 of the production work order forbids the full-screen overlay, so
`.tts-controls` never leaves its normal toolbar position and is never covered.

## 17. Adoption carry-forward — the constraints that survive the verdict change

The ADOPT verdict changes the *authorization*, not the *facts*. Every finding in §§ 2–16 was
re-verified on 2026-08-07 and carries into production unchanged:

| Constraint | Status under ADOPT |
| --- | --- |
| **Exact version** | `dockview@7.0.4` only, pinned with `--save-exact`; `dockview-core@7.0.4` is the entire transitive closure (2 packages, depth 1). Any version bump needs its own decision. |
| **Licence** | MIT, unmodified grant, both packages (§ 6). The `dockview-enterprise` proprietary sibling stays **out of bounds** — reaching for it crosses into a paid commercial licence and requires separate legal review. The § 6(c) attribution gap still applies: if Blue Helm is ever redistributed, the MIT notice must be reproduced in our own attribution file. |
| **No React** | `react`/`react-dom` appear nowhere in the closure. `dockview-react` is not installed and must not be. Re-gated by `dockview-package-identity.test.js`. |
| **No telemetry / network** | Zero network, storage, or code-evaluation primitives in either package (§ 9). Re-proven at runtime by the vendor tripwire (`remoteRequestCount: 0`). |
| **No popouts / floating groups** | `disableFloatingGroups: true`; no popout API is called. Excluded by both verdicts. |
| **UMD, not ESM** | The published ESM entry imports the bare specifier `dockview-core` and needs an import map the app CSP blocks (§ 12). The self-contained UMD bundle in the same package at the same version is used instead, loaded from a local path — no bundler, no import map, no Node integration, no CSP change, no remote asset. |
| **Layout persistence** | Strictly validated versioned metadata only, main-owned, renderer supplies no path. Production uses `dockview-layout.json`; the prototype's `dockview-prototype-layout.json` is preserved untouched as acceptance evidence and is never imported or overwritten. |
| **Advisory disposition** | Unchanged. The six pre-existing advisories (`sharp`, `@huggingface/transformers`, `kokoro-js`, `protobufjs`, `tar`, `undici`) remain **unresolved release risks**, individually triaged in § 15, still owned by **EDA-1**, and still awaiting their own independently-authorized registration against `main` (§ 15, and the prototype handoff § 7). `npm audit fix` was not run and must not be. No advisory is attributable to Dockview: the set reachable from `dockview` is exactly `{dockview-core}`, which has zero dependencies. |
| **Pane-status indicators** | Still a separate subsystem with its own record and verdict. Explicitly restated in the ADOPT verdict. Out of scope. |
