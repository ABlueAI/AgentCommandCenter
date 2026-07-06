# Session Handoff — 2026-07-02

Pick up from here. Two sessions worth of work; summarised below per file. Nothing is committed yet.

---

## 1. What was implemented / changed this session

### NEW: `agent-roles/source-scout.md`
New Blue Helm role. Research-only agent that finds best existing OSS before anyone builds something from scratch.

- `tools: WebSearch, WebFetch, Read, Write`
- `model: sonnet`, `permissionMode: default`, `color: cyan`
- Has same `PreToolUse` fence hook as `web-scout` (matcher: `Read|Write|Edit|MultiEdit`, command: `node "__CC_HOOK__"`)
- `__CC_HOOK__` placeholder — sync-roles.ps1 replaces it on deploy
- Deployed via `sync-roles.ps1`: confirmed "Synced 6 roles" (builder, codebase-scout, operator, reviewer, source-scout, web-scout)

### `app/main.js`

**Line 20 — `VALID_ROLES`**: added `'source-scout'`. This Set gatekeeps `verify-fence` and all other role-related IPC handlers. Without this, the fence check would return `{ ok: false, error: 'unknown role' }` on every source-scout launch.

**Line 446 — `pty-resize` handler**: `catch {}` → `catch (err) { tlog(...) }`. Added a `tlog()` (Electron dev console only, not the user-facing Logs tab) so the death-race-window case is visible if ever debugging unexpected pane deaths.

```js
// was:
ipcMain.on('pty-resize', (_e, { id, cols, rows }) => { const p = ptys.get(id); if (p) { try { p.resize(cols, rows); } catch {} } });
// now:
ipcMain.on('pty-resize', (_e, { id, cols, rows }) => { const p = ptys.get(id); if (p) { try { p.resize(cols, rows); } catch (err) { tlog(`pty-resize ${id} failed (process likely exiting): ${(err && err.message) || err}`); } } });
```

**Note on why resize throw is benign (verified from node-pty source):** `WindowsPtyAgent.resize()` throws only when `_exitCode !== undefined` (process definitively dead) or in the race window between native process death and the JS `_$onProcessExit` callback firing. `ResizePseudoConsole()` on a genuinely live ConPTY process is infallible for valid dimensions; node-pty pre-validates dims at the JS layer before calling native. There is no state where a live, healthy process causes a resize throw.

### `app/renderer/app.js`

**Lines 144–153 — `writeClip` function**: was a one-liner with bare `catch {}`. Now logs success and failure to the Logs tab.

```js
const writeClip = (s) => {
  try {
    if (s && cc.clipboardWrite) {
      cc.clipboardWrite(s);
      appendLog(`[copy ${id}] ${s.length} chars written to clipboard\n`);
    }
  } catch (err) {
    appendLog(`[copy ${id}] clipboardWrite FAILED: ${(err && err.message) || err}\n`);
  }
};
```

**Lines 159–173 — `attachCustomKeyEventHandler`**: logs every Ctrl+C / Ctrl+Shift+C attempt (selection size or "no selection → SIGINT"), plus a registration confirmation line per pane after the handler is attached.

```
[copy pty1] key handler registered          ← per pane, at registration time
[copy pty1] Ctrl+C: 42 chars selected       ← or "no selection → SIGINT"
[copy pty1] 42 chars written to clipboard   ← from writeClip on success
```

**Line 189 — OSC 52 base64 fallback catch**: inner bare `catch {}` → `catch (err) { appendLog(...) }`. Fires only if both the UTF-8 decode AND raw `atob` fail — i.e., truly malformed base64 from a program in the PTY.

**Line 223 — `pane.addEventListener('mousedown', ...)`**: added `term.focus()`. This is the root-cause fix for Ctrl+C not working after clicking on non-canvas parts of the pane (title bar, role badge, `.term-head`). Without it, keyboard focus stayed on the document and `attachCustomKeyEventHandler` never fired.

```js
// was:
pane.addEventListener('mousedown', () => { activeTermId = id; });
// now:
pane.addEventListener('mousedown', () => { activeTermId = id; term.focus(); });
```

**Lines 590–596 — `openModal()`**: second-agent-launch freeze fix (from previous session). Sets `pointer-events: none` on `#terminalGrid` and calls `term.blur()` on all active terminals so xterm's WebGL layer can't intercept clicks inside the modal and the name input accepts keystrokes immediately.

### `app/renderer/tts.js`

**Lines 125–128 — `ac.resume()`**: was `try { await ac.resume(); } catch {}`. Now logs to `setStatus('error', ...)` and returns, which surfaces in the TTS status indicator in the UI. Previously: clicked Speak, audio context stayed suspended, heard nothing, no feedback.

```js
if (ac.state === 'suspended') {
  try { await ac.resume(); }
  catch (err) { speaking = false; setStatus('error', 'AudioContext resume failed: ' + (err && err.message)); return; }
}
```

### `app/renderer/index.html`

**Lines 143–147 — role choices in New Agent modal**: added `🔍 Source` button for source-scout, between web-scout and operator.

### `app/renderer/styles.css`

Added `.role-badge[data-role="source-scout"]` — same cyan as web-scout (`#22B8CF`).

---

## 2. Silent-failure audit results (from this session's retrofit pass)

The rule "failures must surface visibly — no bare `catch {}`" was saved as a memory and applied retroactively. Full findings:

| Location | Old | New | Verdict |
|---|---|---|---|
| `tts.js:125` `ac.resume()` | silent | `setStatus('error', ...)` + return | **FIXED** |
| `app.js:189` OSC 52 inner decode | silent | `appendLog(...)` | **FIXED** |
| `main.js:446` pty-resize | silent | `tlog(...)` | **FIXED (debug-level)** |
| `tts.js:46` `setStatus` callback guard | silent | left alone | Swallowing prevents infinite error loop |
| `tts.js:125` `ac.resume()` | → | fixed above | — |
| `tts.js:148` `s.stop()` audio cleanup | silent | left alone | Only throws when already stopped; no user effect |
| `stt.js:29` `setStatus` callback guard | silent | left alone | Same as tts.js:46 |
| `stt.js:58` `ac.close()` | silent | left alone | Post-transcription cleanup; harmless |
| `stt.js:91` `recorder.stop()` race | silent | left alone | `res()` handles it; recorder may already be stopped |
| `stt.js:92` `t.stop()` track cleanup | silent | left alone | Tracks may already be stopped |
| `stt.js:110` `resultCb(text)` guard | silent | left alone | Callback protection |
| `app.js:85` `fitAllTerms` | silent | left alone | Throws only on disposed panes |
| `app.js:124` Unicode11 addon | silent | left alone | Graceful degradation; xterm still works |
| `app.js:129` `webgl.dispose()` context loss | silent | left alone | Cleanup in error path |
| `app.js:131` WebGL init fallback | silent | left alone | Named degradation with comment |
| `app.js:202` `fit.fit()` ResizeObserver | silent | left alone | Throws only on disposed panes |
| `app.js:594` `t.term.blur()` modal open | silent | left alone | Can only fail if term already gone |
| `main.js:140` `p.kill()` on quit | silent | left alone | App is exiting; log would never surface |
| `main.js:447` `p.kill()` IPC | silent | left alone | PTY may already be dead |

---

## 3. Open investigations — current status

### Ctrl+C copy bug
**Status: FIXED IN CODE — AWAITING LIVE TEST**

Three root causes found and patched:
1. `term.focus()` missing from `mousedown` handler → handler never fired for non-canvas clicks. Fixed (line 223).
2. `writeClip` silently swallowed errors. Fixed with logging (lines 144–153).
3. No visibility into whether handler fired vs. clipboard write failed. Fixed with per-Ctrl+C log lines (lines 166, 173).

**Live test protocol:**
1. Restart app. Logs tab should show `[copy pty1] key handler registered` (and similar for every pane, including ones created after startup).
2. Select text in a pane → Ctrl+C. Expect: `[copy ptyN] Ctrl+C: X chars selected` then `[copy ptyN] X chars written to clipboard`.
3. No selection → Ctrl+C. Expect: `[copy ptyN] Ctrl+C: no selection → SIGINT` (process should receive SIGINT).
4. Ctrl+Shift+C (any state). Expect: same copy flow, or swallow with no SIGINT.
5. Right-click with selection → copy. Right-click without → paste.
6. Repeat steps 2–5 on a pane that already existed at app start AND a newly created pane. If only one works, that's a registration timing bug.

### Second-agent-launch freeze (modal stacking)
**Status: FIXED IN CODE — AWAITING LIVE TEST**

Fix: `z-index: 1000` on `.modal-backdrop`, `pointer-events: none` on `#terminalGrid` in `openModal()`, `term.blur()` loop. These are all in place (lines 590–596).

**Live test:** Open 2+ active agent panes → click `+ New` from Terminals tab → confirm name input accepts typing and Create button is clickable immediately without clicking around first.

### Workspace-trust prompt on first launch
**Status: FIXED IN CODE — AWAITING LIVE TEST**

Fix: `ensure-output-dir` IPC handler pre-writes `{ hasTrustDialogAccepted: true }` into `~/.claude.json` before spawning the agent process. This runs before `pty-start` so Claude Code never prompts.

**Live test:** Delete `~/.claude.json` (or rename it temporarily), launch a web-scout or source-scout agent, confirm no trust dialog appears.

### source-scout role
**Status: FULLY DEPLOYED — AWAITING LIVE TEST**

All wiring is in place (role file, `VALID_ROLES`, `ROLES` object, modal button, badge color). `sync-roles.ps1` ran successfully (6 roles confirmed).

**Live test:** Click `+ New` → verify `🔍 Source` button appears in modal → create agent → verify fence check passes in Logs tab (look for `verify-fence: ok`) → verify agent launches and runs in a sandbox output dir.

### Read-fence adversarial test
**Status: NOT YET RUN**

With a running web-scout or source-scout session, attempt:
- Absolute path read outside the sandbox (e.g. `C:\Windows\System32\drivers\etc\hosts`)
- Relative path traversal (`../../../some-file`)

Both must be DENIED and appear in Logs tab. This test has been documented but not executed.

---

## 4. Known open bugs — diagnosis state

| Bug | Diagnosis | Fix status |
|---|---|---|
| Ctrl+C doesn't copy selected text from xterm panes | Root causes confirmed: missing `term.focus()` on mousedown + silent `writeClip` | Code fix in place; live test pending |
| Second-agent modal freeze | Root cause: xterm WebGL layer intercepts clicks at wrong z-index | Code fix in place; live test pending |
| Workspace-trust prompt on agent launch | Root cause: `~/.claude.json` written too late / not written before Claude Code spawns | Code fix in place; live test pending |
| TTS silent when AudioContext suspended | Root cause: `ac.resume()` failure silently swallowed | Fixed this session (`tts.js:125`) |
| OSC 52 base64 decode failure silent | Root cause: inner fallback catch swallowed error | Fixed this session (`app.js:189`) |

---

## 5. Backlog items (not started, confirmed scope)

- **Feature B Step 3**: Toggle button in `.term-head` for chat view ↔ terminal view. `.chat-body` is currently `display:none` always. Per-role default needed: fenced roles (web-scout, source-scout, operator) → chat default; builder/plain → terminal default.
- **Session persistence/resume**: Use `@xterm/addon-serialize` (MIT, ships with xterm.js 6.0.0) + VS Code "revive" pattern. On `before-quit`: serialize each pane's scrollback to JSON. On cold start: recreate xterm instances, replay serialized ANSI, spawn fresh PTYs. node-pty has no built-in session save. No new deps needed. Source-scout verified: `@xterm/addon-serialize` v0.14.0 is the correct tool. Superset (ELv2, macOS-only) and Zellij (Rust, not importable) eliminated.
- **Feature A** (`feed-gemini.ps1`): Flash-Lite model default, resolution picker, chunking/resume, cost-estimate guardrail.
- **Video auto-delete**: Auto-delete raw video from `media/` after successful Gemini analysis.
- **Audio offline test**: (a) network-off test; (b) ORT WASM + model weights vendored locally; (c) `connect-src` CSP tightened.

---

## 6. Nothing committed yet

All changes from this session and the previous session are uncommitted on `main`. Staged diff covers:

- `agent-roles/source-scout.md` (new file)
- `app/main.js` (VALID_ROLES + pty-resize tlog)
- `app/renderer/app.js` (writeClip logging, key handler logging, mousedown focus, OSC 52 catch, modal stacking)
- `app/renderer/tts.js` (AudioContext resume failure surfacing)
- `app/renderer/index.html` (source-scout modal button)
- `app/renderer/styles.css` (source-scout badge)

Suggested commit message after live tests pass:
```
feat: add source-scout role; fix Ctrl+C copy, modal freeze, TTS silent failure

- New source-scout role (cyan, fenced sandbox, research-only)
- Ctrl+C copy: term.focus() on mousedown fixes handler registration for non-canvas clicks
- Ctrl+C copy: writeClip and key handler now log all attempts/outcomes to Logs tab
- Modal: z-index + pointer-events + term.blur() fix second-agent-launch freeze
- TTS: AudioContext resume failure now surfaces in status indicator instead of silently aborting
- Retrofit: bare catch{} blocks in tts.js, app.js, main.js now log failures visibly
```
