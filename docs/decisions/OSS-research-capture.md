# S15: research capture

2026-10-27. Session S15 (docs/PLAN-1.1.md): "Send this page to Reviewer" flow; evaluate Claude in
Chrome on Windows; research agents stay read-only. Done when Blue sends a Reddit thread to a
reviewer without copy and paste.

Proposed choice: **ADOPT** Claude in Chrome through Claude Code's own `--chrome` integration as the
page reader, behind one Mako button, with no protocol handler, listener or extension of our own.

Blue's verdict, word for word: _pending (checklist step 43)._

## The gap today

- Mako's Reviewer role (`agent-roles/reviewer.md`) reads only local files (Read, Grep, Glob). It
  can't open a web page.
- The fenced web-scout role can fetch pages with WebFetch, but WebFetch can't reach Reddit:
  in this research Claude Code refused `www.reddit.com` with "Claude Code is unable to fetch from
  <host>". WebFetch is also "lossy by design": the model gets a summary of the page, not the page
  (code.claude.com/docs/en/tools-reference).
- So the page has to come from Blue's browser, where he is already reading it.

## Options

| Option | What it takes | Fit | Proposed |
|---|---|---|---|
| **Claude in Chrome via `claude --chrome`** (Anthropic, official) | Blue installs the extension (v1.0.36 or later) in Chrome; Mako starts a reading pane with `--chrome`. No Mako code that talks to the browser. | Reads the page Blue has open, including Reddit, with his browser's rendering. Works on native Windows (not WSL), on Pro and Max with a `/login` sign-in. Acts in a real browser, so it must be fenced (below). | **ADOPT** |
| Our own browser extension plus a native messaging host | A Manifest V3 extension, a host program registered under `HKCU\SOFTWARE\Google\Chrome\NativeMessagingHosts`, and a way into Mako. | Sends exact page text, but it is a new extension and IPC path for us to write, sign and maintain. | Fallback if Claude in Chrome fails step 43 |
| `mako://` link from a bookmarklet (Electron `setAsDefaultProtocolClient`) | Register a URL protocol; handle `second-instance` on Windows; strict URL checks and a confirm dialog. | Sends only the URL, which still needs a reader that can open Reddit. Any web page can fire the link, so it is a new outside entry point (CVE-2018-1000006 was this class of bug in Electron). | Not needed |
| Windows Share target | Package identity (MSIX or a sparse package), signing, Windows App SDK activation. | Heavy, and not verified that Chrome shares the page URL. | Not needed |
| WebFetch in the existing web-scout role | Nothing new. | Can't reach Reddit (above); summary only. | Not enough alone |

Licences: Claude in Chrome and Claude Code are Anthropic products (proprietary, already on Blue's
plan); Electron is MIT. No new paid service.

## How the adopted option would be built (after Blue's verdict)

1. A **Send current page to Reviewer** button in Mako. It starts a read-only "page reader" pane:
   `claude --chrome` with a fixed opening prompt (read the active tab, write its text and the
   thread's comments to one report file in the pane's fenced outputs folder, change nothing in the
   browser). Blue switches from the browser to Mako and clicks once: no copy and paste.
2. **Read-only by permission rules, not by the prompt.** Claude Code matches MCP tools as
   `mcp__claude-in-chrome__<tool>` (code.claude.com/docs/en/permissions). The pane allows only the
   reading tools and denies the rest (clicking, typing, form filling, navigation, uploads). The
   official docs name only `tabs_context_mcp` and `browser_batch`; the full list comes from
   `/mcp` on Blue's PC (step 43), and the allowlist is pinned in a test from that list.
3. **The Reviewer then reads the report file**, as it reads a diff today, so the Reviewer itself
   keeps no web or browser tool.
4. Only this pane starts with `--chrome`. Claude Code's docs say a project can't turn Chrome on by
   itself ("a project can't turn on Claude in Chrome"), so other panes stay off unless Blue runs
   `/chrome` in them.

## Risks

- **Prompt injection.** Anthropic calls it "the biggest risk facing browser-using AI tools", and
  "the risk is not zero" (support.claude.com, using Claude in Chrome safely). The reading tools
  only, a report-only prompt and a separate Chrome profile limit what an injected page can do.
- **Blue's logged-in browser.** AGENTS.md runs web-reading agents at Minimum or in the cloud. This
  pane runs on Blue's PC, so step 43 uses a **separate Chrome profile with no sensitive accounts**
  (Anthropic's own advice) and the pane runs at Minimum with no shell. Blue's verdict covers this
  exception.
- **Browser support.** The Claude Code page lists Chrome and Edge; the extension's help page says
  Chrome only. Step 43 uses Chrome.
- **Sign-in.** Chrome integration needs a `/login` sign-in; with an API key or long-lived token,
  Claude Code keeps it off. Mako's panes use Blue's normal sign-in.

## Sources

- https://code.claude.com/docs/en/chrome (flag, Windows, Edge, requirements, project rule)
- https://code.claude.com/docs/en/permissions (`mcp__<server>__<tool>` rules)
- https://code.claude.com/docs/en/tools-reference (WebFetch)
- https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome (plans,
  browsers)
- https://support.claude.com/en/articles/12902428-using-claude-in-chrome-safely (safety)
- Electron `app.setAsDefaultProtocolClient` and the 2018 protocol-handler advisory (electron/electron,
  electron/website on GitHub)
- Chrome native messaging (GoogleChrome/developer.chrome.com on GitHub)
- Windows share targets for packaged and sparse-packaged apps (MicrosoftDocs/windows-dev-docs on
  GitHub)

Not verified: Reddit's own API terms (Claude Code couldn't fetch reddit.com or redditinc.com
here), and the beta status of the extension (help pages differ).
