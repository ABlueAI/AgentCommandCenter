# Builder Handoff — Release 1.0 Quick Links

## 0. Status

**STOPPED FOR FRESH INDEPENDENT STANDARD-CLASS REVIEW.** Nothing merged or
pushed. Blue alone authorizes merge and push.

## 1. Authority and invariant

One invariant only: deliver the bounded Release 1.0 Quick Links surface without
touching pane status, turn accounting, P1/fenced-role work, backup work, or the
legacy `open-external` implementation.

Binding procurement ruling, quoted verbatim:

> Quick Links is a bounded extension of the already-owned external-launcher boundary. No new dependency, provider, protocol, credential store, or embedded browser. The OSS procurement gate does NOT apply.

Blue explicitly approved these production defaults on 2026-08-16:

- `Starboard Platform` → `https://jlautomationsystems.com/`
- `Outlook Web` → `https://outlook.office365.com/`

No URL was guessed or committed before that approval.

## 2. Git shape

| Field | Value |
|---|---|
| Branch | `codex/quick-links` |
| Isolated worktree | `C:\Users\levij\.codex\worktrees\91ad\agent-command-center` |
| Fork point / pre-merge `main` | `a2121ca36727bbb3294fd61a057f13730b8a1d17` |
| Fetched `origin/main` at dispatch | `a2121ca36727bbb3294fd61a057f13730b8a1d17` |
| Reviewed content tip | `6e660096ba794b305f43de45672612e2b52ef7a9` |
| Handoff-only tail / branch tip | this document's amended census-correction commit; exact SHA accompanies the refreshed review request |
| Merge commit | Pending until Blue authorizes merge |

Before editing, a real `git fetch origin --prune` completed and the checked-out
base, local `main`, and `origin/main` were verified equal to the fork point.

## 3. Files changed in the reviewed range

- `app/quick-links-policy.js` (new)
- `app/quick-links-policy.test.js` (new)
- `app/quick-links-store.js` (new)
- `app/quick-links-store.test.js` (new)
- `app/quick-links-ipc.js` (new)
- `app/quick-links-ipc.test.js` (new)
- `app/quick-links-integration.test.js` (new)
- `app/renderer/quick-links-view.js` (new)
- `app/renderer/quick-links-view.test.js` (new)
- `app/main.js`
- `app/preload.js`
- `app/renderer/app.js`
- `app/renderer/index.html`
- `app/renderer/styles.css`
- `app/package.json`
- `app/dockview-default-path.test.js`

No dependency, lockfile, PowerShell, provider-setting, credential, pane-status,
turn-accounting, fence, backup, or legacy-handler change is in the range.

## 4. Delivered behavior

- A compact Quick Links group appears in the existing left navigation.
- First run atomically seeds exactly `Starboard Platform` and `Outlook Web` at
  the two approved destinations.
- Manage supports bounded add, edit, remove, Save Changes, and Cancel flows.
- Opens happen only after an explicit link-button click and send an opaque
  stored ID, never a renderer-supplied URL.
- Main reloads the persisted configuration, resolves the stored ID, and
  immediately revalidates the URL before `shell.openExternal`.
- Every list, save, and open operation uses the canonical
  `trusted-ipc-sender.js` gate and dedicated narrow preload/IPC methods.
- All refusals are visible in the renderer and use bounded reason codes.
- Quick Links logs contain operation/result/reason/count metadata only.

## 5. Security-sensitive surfaces

The load-bearing boundaries are:

1. the pure `new URL()` policy accepting only exact `http:` and `https:`;
2. rejection of credentials/userinfo, controls, bidi, backslash normalization,
   malformed escapes, relative/shorthand forms, malformed URLs, unsupported
   protocols, closed-schema violations, duplicates, and every declared bound;
3. the fixed, versioned, bounded `userData/quick-links.json` store with strict
   UTF-8, ordinary-file/reparse guards, exclusive temporary creation, flush,
   atomic rename, previous-file preservation, and malformed-data refusal;
4. the trusted window/webContents/main-frame/canonical-document sender gate;
5. open-by-ID with persisted-data reload and immediate pre-open validation;
6. caught `shell.openExternal` throw/rejection converted to bounded visible
   failure; and
7. metadata-only main and renderer logging.

The known post-1.0 `open-external` handler and `cc.openExternal` bridge remain
present for existing features but are content-identical to the dispatched base.
Quick Links neither calls nor reuses them.

## 6. Commands and exact verification

Commands included:

- `git fetch origin --prune`
- focused `node` runs for all five new suites
- `node --check` across new and touched JavaScript entry points
- `npm.cmd test` from `app` outside the sandbox for the real Electron harness
- `git diff --check`
- dependency/lockfile identity checks against the fork point
- fully restarted Electron acceptance runs
- `git diff --output` for both pinned and independently regenerated review diffs

Final full app gate:

- **57 chained test entries**;
- **57 assertion-reporting suites**;
- **3,883 passed, 0 failed assertions**; and
- exit code `0`.

Delta reconciliation against the dispatched base:

- shared base: 52 entries, 52 reporting suites, 3,678 assertions;
- Quick Links: 57 entries, 57 reporting suites, 3,883 assertions;
- delta: **+5 entries, +5 reporting suites, +205 assertions**;
- 204 assertions are the five focused Quick Links suites
  (`58 + 30 + 38 + 40 + 38`); and
- one assertion is the updated shipped-script tripwire proving
  `quick-links-view.js` is the exact 23rd renderer script.

The original collector required a suite-name prefix before the standard
`N passed, M failed` summary. It therefore omitted six unprefixed standard
summaries totaling 423 assertions and also omitted the two alternate
`N assertions passed` summaries totaling 18. The read-only reconciliation
proved all eight suite blobs byte-identical between the shared base and reviewed
content tip. No suite was absent or unreachable; the error was reporting only.

Other gates:

- `git diff --check`: passed;
- `package.json` runtime and development dependencies: identical to base;
- `package-lock.json`: byte/range unchanged from base;
- legacy `open-external` handler source: content-identical to base;
- new tests: reachable exactly once from the full chain; and
- Pester: not run because no PowerShell changed.

## 7. Manual verification

Performed in fully restarted visible Electron applications on Windows:

- exact defaults visibly rendered in order;
- the persisted first-run configuration contained the exact approved labels,
  opaque IDs, and URLs;
- neither default opened automatically;
- clicking `Starboard Platform` explicitly produced a successful real Windows
  `shell.openExternal` result;
- clicking `Outlook Web` explicitly produced a successful real Windows
  `shell.openExternal` result;
- add, edit, remove, Save, and Cancel worked with disposable fixture entries;
- `javascript:` input visibly refused with
  `url-protocol-not-allowed` while retaining the editor state;
- no `webview`, iframe, embedded browser, or Electron child page appeared;
- metadata logs contained no fixture/production URL, origin, host, path, query,
  fragment, userinfo, configuration body, or entered-label sentinel; and
- layout remained keyboard-reachable and the compact navigation group remained
  visible in the existing sidebar.

An initial attempt to redirect Electron by overriding `APPDATA` did not change
`app.getPath('userData')`. That test-created fixture file was identified at the
exact canonical path and removed after the initial-load evidence proved it had
not existed beforehand. The corrected production run then seeded the two exact
defaults without edits. After the run, Electron was stopped and that exact seed
file plus all temporary acceptance artifacts were removed, restoring the
pre-test absence. No lasting user-data change remains.

## 8. Known limitations

- The Starboard Platform destination is a DBA/WIP site supplied by Blue; remote
  site availability and content are outside this branch.
- The Outlook destination is the approved Microsoft 365 business sign-in page.
  The mailbox currently remains on Gmail, so useful Outlook mailbox access
  depends on later Microsoft 365 provisioning/migration.
- Repair of the old arbitrary-URL `open-external` boundary remains deliberately
  post-1.0 and out of scope.

## 9. Unexpected pre-existing findings

None in the reviewed repository range. Git emitted an existing warning that it
could not read `C:\Users\levij\.config\git\ignore`; the tracked `.gitignore`
still correctly ignores the pinned review artifact.

## 10. Review diff

Reviewed range:

`a2121ca36727bbb3294fd61a057f13730b8a1d17...6e660096ba794b305f43de45672612e2b52ef7a9`

Pinned artifact:

`.agent-review-quick-links.diff`

Generation command shape:

`git diff --output=.agent-review-quick-links.diff a2121ca36727bbb3294fd61a057f13730b8a1d17...6e660096ba794b305f43de45672612e2b52ef7a9`

- shortstat: `16 files changed, 1382 insertions(+), 2 deletions(-)`;
- size: `81,011` bytes;
- SHA-256:
  `f1cc5c1e1c1be242bf453c876fc6b3e206487da42ed0a0749923b3313cc8fa00`;
- independently regenerated SHA-256: identical; and
- pinned artifact: ignored by tracked Git rules and not committed.

## 11. Recommended Standard-class review focus

1. Verify the canonical sender gate covers every list/save/open path, including
   destroyed windows, wrong webContents, subframes, wrong documents, and torn
   frames.
2. Attack URL parsing with userinfo, controls/encoded controls, deceptive
   authority forms, backslashes, malformed escapes, unsupported protocols,
   relative/shorthand inputs, and all size bounds.
3. Verify schema/version/unknown-field/duplicate-ID handling and malformed-file
   preservation through atomic-write failure paths.
4. Prove open accepts only an opaque ID, reloads and revalidates persisted data,
   and never reaches the shell on any refusal.
5. Prove shell throw/rejection is visible and bounded.
6. Search every Quick Links error/log route for raw URL, origin, host, path,
   query, fragment, userinfo, label, configuration, or caught-error leakage.
7. Confirm the exact two approved defaults and that no other default is seeded.
8. Confirm the old handler source is unchanged and Quick Links does not call the
   old channel/bridge.
9. Confirm no dependency, embedded browser, provider credential, or unrelated
   release item entered the range.

## 12. Reviewer verdict

Pending fresh independent Standard-class review.

Reviewer verdict source: pending.

The reviewer must return a literal `VERDICT: PASS` or `VERDICT: FAIL` line.
