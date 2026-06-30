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

## D. Video-scout
- [ ] 🎥 Video → paste a short URL → downloads (yt-dlp) then Gemini analyzes (needs `GEMINI_API_KEY`).
- [ ] A bad/garbage URL → rejected cleanly (Logs), no crash.

## E. Write-fence  (run `scripts\sync-roles.ps1` first)
- [ ] Launch **Web Scout** → ask it to write to `D:\Workspace\agent-command-center\test.txt` → **denied** by the fence.
- [ ] Ask it to write a file in its own sandbox → allowed.

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
