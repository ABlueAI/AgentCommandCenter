# S15: research capture

2026-10-27. Session S15 (docs/PLAN-1.1.md): "Send this page to Reviewer" flow; evaluate Claude in
Chrome on Windows; research agents stay read-only. Done when Blue sends a Reddit thread to a
reviewer without copy and paste.

**Verdict (2026-11-03): ADOPT Playwright MCP** ([microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp),
Apache-2.0) as the page reader. Claude in Chrome, proposed on 2026-10-27, is **rejected for this
use**: on Blue's PC it returned "This site is blocked." for every page read on reddit.com.

Blue's verdict, word for word (from his verdict comment on PR #130, posted as `ABlueAI` from his
main chat on 2026-11-03):

- 2026-10-28, on the proposal as written: "I think that's a good place to start"
- 2026-11-03, after the step 43 check showed Claude in Chrome can't read Reddit: "this is for
  personal use so i will take the risk. lets go with playwright"

The risk he accepts: automated reading of Reddit outside its official API goes against Reddit's
terms. It is for personal, low-volume use: a visible browser, a few pages per run, no robot-check
solvers, no "stealth" plugins and no browser User-Agent spoofing. If a robot check appears, the
pane stops and Blue clicks it himself.

## Step 43 results (Blue's PC, 2026-11-02 to 11-03)

Recorded from Blue's verdict comment on PR #130; not re-run by an agent.

Claude in Chrome (extension 1.0.104, Claude Code 2.1.317, `claude --chrome --permission-mode plan`,
separate Chrome profile, no Google account):

1. It connects and loads its tools, but it can't read the tab the user has open: it only sees tabs
   in its own Claude tab group.
2. It read the thread's title, then every page read on reddit.com returned "This site is blocked."
   Site access was "On all sites" with no blocked-site list, so nothing Blue can change. User
   reports (not an Anthropic statement) describe a built-in block list that includes reddit.com.
   The unofficial fork that removes it is not to be used.
3. Edge is supported (code.claude.com/docs/en/chrome), but it kept signing Blue in with his Windows
   Microsoft account, a poor fit for an identity-free research profile.
4. Tool names: browser_batch, computer, file_upload, find, form_input, get_page_text, gif_creator,
   javascript_tool, list_connected_browsers, navigate, read_console_messages,
   read_network_requests, read_page, resize_window, select_browser, shortcuts_execute,
   shortcuts_list, switch_browser, tabs_close_mcp, tabs_context_mcp, tabs_create_mcp,
   upload_image.

Other routes:

5. Claude Code's WebFetch: "unable to fetch from old.reddit.com".
6. Reddit's public `.json` URL with an honest non-browser User-Agent: 403 Forbidden.

Playwright MCP, **PASS** (2026-11-03, about 00:51 Eastern):

7. In `D:\Workspace\Mako-Vault`: `npx -y playwright@1.65.0-alpha-2026-10-30 install chromium` (the
   Playwright version `@playwright/mcp@0.0.84` depends on; it installed Chrome for Testing
   157.0.8103.15 into `%LOCALAPPDATA%\ms-playwright`), then
   `claude mcp add playwright --scope local -- cmd /c npx -y @playwright/mcp@0.0.84 --browser chromium`.
   On native Windows, npx needs the `cmd /c` wrapper. It uses its own Chromium and profile: no
   Google Chrome, no Microsoft account, no extension.
8. In plan mode, approving only `browser_navigate` and `browser_snapshot`, it read the full title,
   the pinned summary comment and the first human comment of a www.reddit.com thread, with no
   login, click, typing or robot check.
9. old.reddit.com now sends logged-out visitors to "Log in to use old Reddit", so the reader uses
   www.reddit.com.
10. No Reddit account is needed so far. If one ever is, it is a throwaway research account Blue
    creates himself, never his personal one.

Uncertainty that remains: how often Reddit shows robot checks over weeks of use. One check isn't
proof.

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
| **Claude in Chrome via `claude --chrome`** (Anthropic, official) | Blue installs the extension (v1.0.36 or later) in Chrome; Mako starts a reading pane with `--chrome`. No Mako code that talks to the browser. | Reads the page Blue has open, including Reddit, with his browser's rendering. Works on native Windows (not WSL), on Pro and Max with a `/login` sign-in. Acts in a real browser, so it must be fenced (below). | Rejected (2026-11-03): blocked on reddit.com |
| **Playwright MCP** (`@playwright/mcp`, Microsoft, Apache-2.0) | A pinned MCP server that drives its own Chromium; the pane allows only `browser_navigate` and `browser_snapshot`. | Read a www.reddit.com thread on Blue's PC with no login (step 43). Reads a URL Blue gives it, not his open tab. | **ADOPT** (Blue, 2026-11-03) |
| Our own browser extension plus a native messaging host | A Manifest V3 extension, a host program registered under `HKCU\SOFTWARE\Google\Chrome\NativeMessagingHosts`, and a way into Mako. | Sends exact page text, but it is a new extension and IPC path for us to write, sign and maintain. | Not needed |
| `mako://` link from a bookmarklet (Electron `setAsDefaultProtocolClient`) | Register a URL protocol; handle `second-instance` on Windows; strict URL checks and a confirm dialog. | Sends only the URL, which still needs a reader that can open Reddit. Any web page can fire the link, so it is a new outside entry point (CVE-2018-1000006 was this class of bug in Electron). | Not needed |
| Windows Share target | Package identity (MSIX or a sparse package), signing, Windows App SDK activation. | Heavy, and not verified that Chrome shares the page URL. | Not needed |
| WebFetch in the existing web-scout role | Nothing new. | Can't reach Reddit (above); summary only. | Not enough alone |

Licences: Claude in Chrome and Claude Code are Anthropic products (proprietary, already on Blue's
plan); Electron is MIT. No new paid service.

## How Playwright MCP is built in (this PR)

1. **A "📄 Page" choice in Mako's New Agent dialog** takes a URL from Blue (Playwright can't see
   his own browser tabs). Main checks it: `https:` only, no user name or password in it, at most 2,048
   characters, parsed with `new URL()`. Anything else refuses visibly.
2. **A new fenced role, `page-reader`** (`agent-roles/page-reader.md`), launched like web-scout in
   its own outputs folder under Mako's path fence (`claude --agent page-reader`): no shell, no repo
   access, Write only to its own report. The URL never reaches the command line: main writes it to
   `page-request.json` in that fresh folder, and the pane starts with a fixed, main-owned opening
   line telling it to read that file. Renderer-supplied opening prompts stay refused for fenced
   roles (`app/pty-launch-classify.js`).
3. **Playwright MCP as a locked app dependency, not `npx` at launch:** `@playwright/mcp` pinned to
   exactly `0.0.84` in `app/package.json` and `app/package-lock.json` (integrity hashes), started
   with Node from `app/node_modules`. This is the same server Blue tested with `npx`, minus a
   download from npm on every launch. Main writes a fixed MCP config for the pane and passes it with
   `--mcp-config` and `--strict-mcp-config`, so no other MCP server loads. Server arguments, all
   main-owned: `--browser chromium`, `--user-data-dir` set to one persistent profile in Mako's app-data folder
   (`page-reader\browser-profile`; cookies carry over; one page-reader pane at a time, since a
   persistent profile serves one browser). The config itself is written there too, never in the
   pane's writable outputs folder, visible (no `--headless`), stdio only (never
   `--port` or `--host`, so no network listener), and no `--allow-unrestricted-file-access`, so
   file:// pages stay blocked and file access stays inside the outputs folder.
4. **Only two browser tools.** The role's `tools:` line allows `Read`, `Write`,
   `mcp__playwright__browser_navigate` and `mcp__playwright__browser_snapshot`, and main passes the
   same two MCP tools to `--allowedTools`, which Claude Code needs when
   `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` is set (2.1.316 or later, step 40's finding). Every other
   Playwright tool (click, type, fill, evaluate, upload, screenshot to file, tabs) is unavailable.
   The fence policy (`app/role-fence-policy.js`) grants these two MCP names to `page-reader` alone;
   every other fenced role still refuses MCP tools.
5. **The fence hook also gates the two tools** (`scripts/hooks/fence-write.js`): `browser_navigate`
   only to an `https:` URL, and `browser_snapshot` never with a `filename` (which would write a
   file outside the Write fence; Playwright resolves it against the workspace root). Playwright's
   own `--allowed-origins` is documented as "not a security boundary", so it isn't relied on.
6. **The report.** The pane reads the page with `browser_snapshot`, writes the title, the post and
   the comments it can see to `report.md` in its outputs folder, says what it couldn't see, and
   stops. If a robot check or login wall appears, it says so and stops; Blue clicks it himself in
   the visible window and asks it to try again. A few pages per run at most.
7. **The Reviewer reads the report.** Under the same "📄 Page" choice, "Send the last page report to
   Reviewer" launches the existing Reviewer role in that page-reader's folder with a fixed opening
   prompt to read `./report.md` as untrusted text, as the Reviewer launch already does for a diff. The Reviewer keeps no web or browser tool.
8. Blue installs the browser once: `npx playwright install chromium` from `app` (the version the
   lockfile pins), as in step 43. Mako refuses visibly, with that command, if the browser is
   missing.

Tests pin: the URL check, the request file, the MCP config (exact version, arguments, no `--port`,
`--host`, `--headless` or unrestricted file access), the policy's MCP grant to `page-reader` only,
the hook's two gates, and the launch command.

## Risks

- **Prompt injection.** A page can carry instructions. The pane can only navigate to `https:`
  pages, read them, and write its own report: no shell, no repo, no clicks, no typing, no
  credentials. The Reviewer treats the report as untrusted text.
- **Blue's PC, not the cloud.** AGENTS.md runs web-reading agents at Minimum or in the cloud. This
  pane runs on Blue's PC in Playwright's own Chromium and profile, with no Google or Microsoft
  account and no extension. Blue's verdict covers this exception.
- **Reddit's terms and robot checks.** Accepted by Blue for personal, low-volume use (verdict
  above). No solvers, stealth plugins or User-Agent spoofing; the pane stops at any check.
- **Pre-release Playwright.** `@playwright/mcp@0.0.84` depends on Playwright
  `1.65.0-alpha-2026-10-30`. Pinned exactly, and only bumped in a reviewed PR.
- **Sign-in.** Mako's Claude panes start with `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`; the pane needs
  no provider key of its own.

## Sources

- https://github.com/microsoft/playwright-mcp and the `@playwright/mcp@0.0.84` npm package's
  README (server options, tool list, file-access defaults; read 2026-11-03)
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

Not verified: Reddit's own terms (Claude Code couldn't fetch reddit.com or redditinc.com here);
Blue accepts the risk (verdict above).
