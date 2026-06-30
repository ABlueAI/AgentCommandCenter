# Hard-Test Checklist

A manual pass to confirm everything works. Check a box when it passes; for a failure, jot
**which step, what you did, what happened, and any Logs-tab text** — that's what's needed to fix it fast.

> **Do this first:** fully **quit and reopen** the app. Most "bugs" are a stale `main.js` /
> `preload.js` / module from not restarting. Watch the **Logs** tab — errors surface there now
> instead of crashing.

## A. Core
- [ ] App launches; repo picker lists your repos; switching repos works.
- [ ] Open in VSCode / GitHub / Terminal buttons each work.
- [ ] Vibe Kanban button opens the board app.

## B. Roles (New Agent modal)
- [ ] Modal shows all 7: Builder / Reviewer / Codebase / Web Scout / Operator / 🎥 Video / Plain.
- [ ] **Builder** → creates a worktree; pane shows the orange 🔨 badge; runs `claude --agent builder`.
- [ ] Builder **"Hard task"** checkbox → command includes `--model opus --effort xhigh`.
- [ ] **Plain** → CLI sub-picker appears; launches a bare claude/codex/gemini.
- [ ] Re-use a task name you previously removed → reuses/attaches the branch (no error-267 crash).

## C. Reviewer & read-only roles
- [ ] On an agent card, **🔎 Review** → green 🔎🔒 pane; Logs shows "diff ready: N file(s)"; reviewer reads `.agent-review.diff`.
- [ ] **🧭 Scout** (Codebase) → cyan 🔒 pane; read-only.
- [ ] **Prove read-only is real, not cosmetic:** ask the Reviewer (or Codebase Scout) to *edit/create a file* → it **cannot** (no Write/Edit tool). A badge that looks locked but can still write would pass the two checks above — this is the one that matters.

## D. Video-scout
- [ ] 🎥 Video → paste a short URL → downloads (yt-dlp) then Gemini analyzes (needs `GEMINI_API_KEY`).
- [ ] A bad/garbage URL → rejected cleanly (Logs), no crash.
- [ ] **SSRF/scope guard:** each of these is rejected *before* any download — `file:///C:/Windows/win.ini`, `http://localhost:8080/`, `http://169.254.169.254/`, and a non-allowlisted host (e.g. `https://example.com/x`). Logs show "invalid or disallowed video URL".
- [ ] **Size/playlist caps:** a playlist URL pulls **one** item (not the whole list); an oversized/multi-hour video is skipped by the cap, not downloaded in full.

## E. Write-fence  (run `scripts\sync-roles.ps1` first)
- [ ] **Fail-closed check:** WITHOUT running sync-roles (e.g. temporarily rename `~/.claude/agents/web-scout.md`), launch **Web Scout** → it is **BLOCKED** with "write-fence not active", not launched. Restore, re-run sync-roles, then continue.
- [ ] Launch **Web Scout** → ask it to write to `D:\Workspace\agent-command-center\test.txt` → **denied** by the fence.
- [ ] Ask it to write a file in its own sandbox → allowed.

## E2. Human merge gate  (the sacred rule)
- [ ] Let a **Builder** finish a task. Confirm it **stops at the work / a PR** and does **not** push to or merge into `main` on its own — it waits for you. (Even though the gate is workflow discipline, watch it hold once.)

## F. Terminal
- [ ] Open **two** agents → they tile and stay fit (no overflow).
- [ ] **Ctrl+C** with a selection copies; with none, interrupts. **Ctrl+V** pastes. Right-click copies/pastes.
- [ ] A program's "(Copied!)" (e.g., Claude's OAuth URL) actually lands on the clipboard.
- [ ] A URL in output is **clickable**; box-drawing/emoji render cleanly.

## G. Audio — TTS  (first use downloads ~80MB)
- [ ] Select agent text → **🔊** → it speaks. Try each deep-male voice + a speed.
- [ ] Stop button halts speech.

## H. Audio — STT  (first use downloads ~150MB)
- [ ] Click into a pane → **🎤 Dictate** → speak → click again → words type into that pane (no auto-Enter).
- [ ] Note transcription accuracy on commands vs. code identifiers.

---

### Failure log
| Step | What I did | What happened | Logs text |
|------|------------|---------------|-----------|
|      |            |               |           |
