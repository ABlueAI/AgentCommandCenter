# Work Order — K8 Audio Permission Hardening

Branch: `feature/k8-audio-permission-hardening` (fork point `a02c17b`, isolated worktree)

Tier: **FULL-CLASS**. Blast radius: this changes Electron's media-permission security
boundary; a faulty grant could expose the camera or microphone to an unintended
renderer, origin, or subframe. Gate: plan approval before implementation → whole
three-dot diff review → delta review after any FAIL → human approval before merge.
Never merge or push automatically.

## One invariant

Blue Helm grants media permission only when the current trusted application window's
main frame requests microphone-only access from the exact trusted application entry
document. Everything else is denied fail-closed and the refusal is visible without
disclosing user content.

## Proven defect (before this branch)

`app/main.js` granted on the permission NAME alone:

```js
const allowMedia = (perm) => perm === 'media' || perm === 'audioCapture';
```

No proof of the requesting WebContents, entry document, main frame, or audio-only
media types; `audioCapture` is not even in Electron 42's request-handler permission
union. Denials were silent.

## Required implementation (as approved)

1. One pure dependency-free CJS policy module (`app/media-permission-policy.js`)
   feeding BOTH `setPermissionRequestHandler` and `setPermissionCheckHandler` —
   structured `{ allow, reason }` decisions with bounded reason constants only.
2. Trusted requester = exact current non-destroyed window's webContents + main
   frame + exact canonical ENTRY_URL + the origin Electron actually reports for it,
   established by a bounded runtime observation (metadata only), not assumption.
3. Request contract: `permission === 'media'` and `details.mediaTypes` exactly
   `['audio']`; callback called exactly once on every path.
4. Check contract: trusted requester + `details.mediaType === 'audio'`; every
   ambiguous/missing case denied.
5. Visible bounded refusal (`[audio-permission] denied ...`) with no URLs, content,
   device labels, or exception text; smallest deterministic dedup only if the
   observation demonstrates duplication (it did — page-load automatic checks).
6. One canonical entry-URL definition shared by `loadFile`, navigation lockdown,
   and the permission policy. No navigation/preload/IPC/CSP/audio-engine changes.

## Approved plan corrections (from the human gate)

1. The origin observation must force the trusted probe through BOTH handlers
   (check logs metadata and returns false for it, so the request handler provably
   fires); remove all diagnostic instrumentation before the implementation commit.
2. `navigator.permissions.query` is optional evidence only; the load-bearing
   observation is the real `getUserMedia(MIC_CONSTRAINTS)` path.
3. No absolute worktree/main paths or drive-letter casing pinned in production
   code or fixtures; trust derives from the runtime ENTRY_URL; fixtures use
   synthetic paths; must survive merge back to the main checkout.
4. The callback-exactly-once test must exercise the actual exported adapter that
   main.js installs, not a reconstruction.
5. Refusal dedup only if observation/tests demonstrate duplicate logs, and then
   the smallest DETERMINISTIC mechanism (no preemptive time-window state).

## Acceptance

- App + Pester gates green with exact totals (baseline app 423/0, Pester 216/0/0;
  counts may only grow via the focused K8 suite).
- Live: launch the exact worktree build directly (no Desktop-shortcut retarget),
  marker `K8 ACCEPTANCE 2026-07-16.5` in title + startup Logs verified before human
  testing; Dictate round-trip works; camera-only and mixed audio/video probes are
  denied before access with the bounded Logs refusal (any unexpectedly resolved
  stream: stop all tracks immediately and fail acceptance); TTS, Stop, voice/speed
  selection, and pane targeting remain functional.
- Whole-diff Full-class Reviewer pass with a literal `VERDICT: PASS|FAIL`.
- Stop after the reviewed handoff: no merge, push, shortcut retarget, worktree
  cleanup, or TTS Fast Clear work without explicit human approval.
