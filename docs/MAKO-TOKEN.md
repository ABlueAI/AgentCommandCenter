# mako-token: GitHub App credentials for local agent panes

Session S35 (docs/PLAN-1.1.md). Windows first. This page is the reference for the credential path
that lets Mako's local agent panes act as the GitHub App `mako-agents` instead of a person or the
`ABlueAgent` account.

## Why

Blue decided on 2026-11-10 and 2026-11-11, after `ABlueAgent` was suspended on 2026-11-08, that a
GitHub App becomes the primary identity for local Mako panes, local Claude sessions and the local
runner (cloud sessions keep `ABlueAgent`). The App `mako-agents` is owned by `ABlueAI` and installed on
`ABlueAI/AgentCommandCenter` only, with these permissions and no others: Metadata R, Contents RW, Pull
requests RW, Issues RW, Actions R, Checks R, Commit statuses R. A pull request opened by the App's bot
can be approved by Blue, because he did not author it.

An App works with **installation tokens**, which last 1 hour. `gh` prefers `GH_TOKEN` to any stored
login. So a token placed in a long-running process (a pane's environment) would go stale after an hour
and the pane would stop working. The rule that follows: **no long-lived process holds a token.** Every
call asks for a fresh one.

## What was built

| Piece | File | What it does |
|---|---|---|
| `mako-token` service | `app/mako-token/core.js`, `minter.js`, `cache.js` | Mints a token with the official MIT [`@octokit/auth-app`](https://github.com/octokit/auth-app.js), limited to this one repository and to the permissions of the caller's profile; caches it in a per-user folder until 5 minutes before `expires_at`; mints again after sleep or expiry; refuses visibly if it can't. |
| Key store | `app/mako-token/keystore.js`, `dpapi.ps1` | The App's private key lives only as a Windows DPAPI file (`%APPDATA%\Mako\mako-agents.key.dpapi`), opened in the short-lived process that needs it. |
| `gh` shim | `app/mako-token/gh-shim.js` | Runs the real `gh` by absolute path with `GH_TOKEN` set for that one child process only. |
| git helper | `app/mako-token/cli.js git` | git's credential helper for `https://github.com`; every HTTPS operation gets a fresh token. |
| Launchers | `app/mako-token/shims.js`, `install.js` | Mako writes `gh`, `gh.cmd`, `gh.ps1`, `git-credential-mako` and `mako-claude.cmd` to `%APPDATA%\Mako\bin` before it starts an App-mode pane. |
| App mode | `app/agent-git-env.js`, `app/pty-env.js`, `app/mako-token/main-support.js`, `app/main.js` | What an agent pane's environment looks like (below). |
| Import | `app/mako-token/importer.js` | `mako-token import`: stores the key, proves it works, prints its fingerprint, deletes the PEM. |

### An agent pane in App mode

- **No `GH_TOKEN` and no `GITHUB_TOKEN`** (any spelling), no `GH_HOST`, no enterprise token. The names
  are reserved, so an ambient value can't stand in.
- `PATH` starts with `%APPDATA%\Mako\bin`, so `gh` is the shim (for Git Bash, cmd and PowerShell).
- `GH_CONFIG_DIR` is an empty folder (`%APPDATA%\Mako\gh-empty`), so a stored `ABlueAI` login can't be
  used even if the shim were bypassed: plain `gh.exe` then says "not logged in".
- git: command-scope entries (`GIT_CONFIG_COUNT/KEY/VALUE`, read after every config file) reset every
  credential helper, global and `github.com`-specific, then set `!'<bin>/git-credential-mako'` for
  `https://github.com`, plus `user.name`, `user.email` and an empty `core.askPass` (so a failed helper can't
  fall back to a GUI askpass prompt whose answer would push as Blue). `GIT_TERMINAL_PROMPT=0`.
- Commits are authored as the bot: `mako-agents[bot] <ID+mako-agents[bot]@users.noreply.github.com>`,
  where `ID` is the bot user's ID, read from `%APPDATA%\Mako\mako-agents.json` (import writes it).
- Only unfenced agent panes get this (a bare CLI pane or an unfenced role). Fenced roles, Video Scout
  and plain shells never do.
- If the App config exists but the key is missing, the key exists but the config is missing (a deleted
  config or a half-finished import), the config is invalid, or the launchers can't be written, **the pane
  does not start** and Mako shows why. It never falls back to the `ABlueAgent` token
  or to Blue's own login. With no App config at all, the S06 token path works as before.
- The `ABlueAgent` token path in `app/agent-git-env.js` still only accepts `ghp_` and `github_pat_`
  tokens. An installation token (`ghs_`) is refused there; App mode is a separate, deliberate mode.

### Profiles (per-consumer narrowing)

| Profile | Permissions asked for | Used by |
|---|---|---|
| `writer` (default) | Contents, Pull requests, Issues: write; Actions, Checks, Commit statuses, Metadata: read | agent panes |
| `reader` | all seven: read | a read-only consumer (`MAKO_TOKEN_PROFILE=reader`, or `--profile reader`) |

A token never carries more than its profile, even though the App itself holds the writer set.

### What is checked on every mint (about once an hour)

`gh api user` does not work for installation tokens, so identity is validated against the expected IDs:

1. With the App's JWT, `GET /app/installations/{id}`: the App ID matches, the installation is on
   `ABlueAI`, limited to selected repositories, and not suspended.
2. With the new token, `GET /installation/repositories`: exactly one repository, `ABlueAI/AgentCommandCenter`.
3. The permissions GitHub granted equal the profile's, and the token is for the expected installation.

Any mismatch refuses, and nothing is cached.

## Blue's steps

These need doing in order; the docs PR that runs alongside S35 puts them in `BLUE-CHECKLIST.md` (S35 does
not edit that file).

1. **2026-11-12, about 10 minutes: create the App.** GitHub > Settings > Developer settings > GitHub Apps
   > New. Name `mako-agents`. Untick Webhook. Permissions exactly as above. "Only on this account".
   Create it, note the **App ID**, then "Generate a private key" and save the `.pem` to
   `C:\Users\levij\.mako-agents\`. Install the App on `ABlueAI/AgentCommandCenter` only (not "All
   repositories"). Verify: the App page lists one installation, "Only select repositories", one repository.
2. **About 5 minutes: import the key.** From `app\` in PowerShell, after `npm ci`:

   ```powershell
   node mako-token\cli.js import "C:\Users\levij\.mako-agents\<the file>.pem" --app-id <the App ID>
   ```

   It checks the key and the installation, finds the slug and the bot's user ID itself, mints one test
   token, stores the key (Windows-protected), writes `%APPDATA%\Mako\mako-agents.json`, deletes the PEM,
   and prints a line `Key fingerprint: SHA256:...`. **Compare it with the fingerprint next to the key on
   the App page.** If they differ, stop: that is not the key you made. Then delete the now-empty
   `C:\Users\levij\.mako-agents\` folder if nothing else is in it, and check no other copy of the PEM
   exists (Downloads, a synced folder, a password manager attachment). One key per PC, never copied.
   Verify: `node mako-token\cli.js status` prints `ok: mako-agents ... token minted` and never a token.
3. **Fully restart Mako, then open a new agent pane.** In the pane, verify (each takes seconds):

   ```powershell
   $env:GH_TOKEN                     # prints nothing
   gh api installation/repositories --jq '.repositories[].full_name'   # ABlueAI/AgentCommandCenter only
   git config user.email             # <ID>+mako-agents[bot]@users.noreply.github.com
   gh auth token                     # refused by the shim
   git remote -v                     # https://github.com/... (not git@github.com:...)
   git config --get-regexp insteadOf # prints nothing (no HTTPS-to-SSH rewrite)
   ```
4. **About 70 minutes, mostly waiting: the 65-minute check.** CI can't do this (see below). In one
   agent pane, run at minute 0:

   ```powershell
   gh api repos/ABlueAI/AgentCommandCenter --jq .full_name
   gh pr list --repo ABlueAI/AgentCommandCenter --limit 3
   git push origin HEAD:refs/heads/mako-token-check
   ```

   Leave the pane open for 65 minutes (let the PC sleep for part of it if you like), then repeat the same
   three commands in the same pane, and run `node mako-token\cli.js status --profile writer` from any
   terminal. Pass: all six commands succeed, the second round needed no new login, the pane's
   `$env:GH_TOKEN` is still empty, and the push appears on GitHub with the bot as pusher. Finish with
   `git push origin --delete mako-token-check`. Fail: copy the message (it names the cause) into the PR.
5. **Local sessions started from a plain terminal** use the interim launcher, until Mako's panes cover
   that: put `%APPDATA%\Mako\bin` on your user PATH (or call it by full path) and run `mako-claude` instead
   of `claude`. It starts `claude` with exactly the environment a Mako pane gets. Mako writes the launcher
   the first time an App-mode pane starts, or run `node mako-token\cli.js install-launchers`.

## Rules the code follows

- **No token, key, JWT or PEM** in an IPC reply (this PR adds no IPC channel), a log line, shell history,
  a command line, this repository, or a pane's environment. The PEM's *path* is the only thing on the
  import command line. The key moves between `mako-token` and DPAPI only over a pipe, as base64.
- **Messages are scrubbed.** Text that comes from outside (a GitHub error, a child process) has anything
  shaped like a PEM, a `gh*_`/`github_pat_` token, a bearer value or a JWT removed before it is shown.
- **No fallback.** If a token can't be minted, `mako-token` exits non-zero with `No other login is used
  instead`, `git` gets no credential, and the `gh` shim exits 3 without running `gh`. It never reads
  `GH_TOKEN`, `GITHUB_TOKEN`, a stored `gh` login, Git Credential Manager or the `ABlueAgent` token.
  `app/mako-token-shim.test.js` scans the code for this.
- **The shim hides the token.** It refuses `gh auth token`, `login`, `logout`, `refresh`, `setup-git` and
  `switch`, `gh auth status --show-token` (or `-t`, in a cluster like `-at` or with `=true`), `gh alias`, `gh
  extension` (also `extensions`, `ext`) and `gh config set` (they would plant behaviour that runs in later
  panes with the token set). It
  removes `GH_HOST` and the enterprise token names from the child's environment so a pane can't send the
  token to another host. `gh api` and `gh pr` and the rest work normally.
- **A misspelt profile is refused, never widened.** `MAKO_TOKEN_PROFILE` and `--profile` accept `writer` or
  `reader`; anything else set (`Reader`, `read`) exits 2 with a message and mints nothing. Only when neither is
  set does a pane get `writer`.
- **mako-token starts only absolute programs.** `powershell.exe` (DPAPI) and `icacls.exe` are resolved under
  `%SystemRoot%\System32` (PowerShell through the resolver in `app/pane-status/pane-status-lock.js`), and
  `cmd.exe` for `mako-claude` likewise (ComSpec and PATH are not consulted), never by a bare name: on Windows a program of that name in the current
  directory would win, and git runs the credential helper in an agent's worktree. A missing one refuses.
- **The cache** is `%LOCALAPPDATA%\Mako\token-cache\token-<profile>.json`, in a folder locked to the
  current Windows user with `icacls` (inheritance removed). If the folder can't be locked down, nothing
  is written and each call mints a fresh token (with a warning). A cache for another App, installation,
  repository or permission set, or one that looks minted in the future (clock set back), is not used.
  A rejected token (git's `erase`) is dropped. What is read back is checked too, because any program of Blue's
  can write that folder: the token must look like an installation token (`ghs_` and URL-safe characters), the
  record can't claim a lifetime over an hour, and a record that fails is ignored and replaced by a real mint.
  git's credential protocol is line-based, so a token with a line break is never written to it.
- **Launcher paths are checked** against characters that could change what a shell runs
  (`' " % ! ^ & | < > $` and the backtick); an unsafe path is refused, not escaped.

## If the key is compromised, or might be

Do these in order, and don't wait to be sure:

1. **Delete the key** on the App page (Private keys > Delete). That alone stops anyone with a copy from
   minting new tokens. Tokens already minted work for up to an hour.
2. **Suspend the installation** (Settings > Applications > Installed GitHub Apps > `mako-agents` >
   Configure > Suspend). That revokes tokens at once. (`mako-token` then refuses with "installation is
   suspended".)
3. **Check for unexpected pushes and pull requests.** On the repository: Activity and the Pull requests
   and Branches lists, filtered to `mako-agents[bot]`; the App page's Advanced tab lists recent deliveries;
   the account's Security log lists installation and key events. Remember `main` still needs Blue's approval
   to merge, so the worst case is a branch, a pull request or an issue comment.
4. **Make a new key** (Generate a private key), import it with `mako-token import <pem> --app-id <id>
   --replace`, and compare the fingerprint again. Delete the PEM and any copy.
5. **Unsuspend** the installation.
6. Remove the old `%APPDATA%\Mako\mako-agents.key.dpapi` only if import did not already replace it
   (`--replace` overwrites it).

## Honest limits

- **Safe storage keeps the key from being copied off this PC. It does not stop other processes running as
  Blue.** A DPAPI file opens for any program running as the same Windows user, and so does the token
  cache. Any process of Blue's, including an agent pane, can run `mako-token` or call the Windows API.
  This is the same position as the `ABlueAgent` token and Blue's stored logins: App mode is *not* a
  security boundary against a pane. What it buys: a one-repository, narrow-permission, one-hour token
  instead of a long-lived credential; nothing sensitive in a pane's environment, shell history or logs;
  and a pull request Blue can approve.
- The PEM is overwritten with zeros and then deleted. On an SSD, wear levelling and snapshots (File
  History, OneDrive, restore points) can keep an older copy. Keep the PEM out of synced folders.
- **HTTPS remotes only.** The credential helper and the shim cover `https://github.com`. An SSH remote, or an
  `insteadOf` rewrite from HTTPS to SSH in Blue's global git config, never asks a credential helper, so a push
  would use Blue's own SSH key. "Never falls back to another login" holds for everything that goes through the
  helper and the shim; check `git remote -v` and `git config --get-regexp insteadOf` once (step 3 of Blue's steps above). The
  same assumption is in the S06 token mode (`app/agent-git-env.js`).
- **`gh` found by a program, not a shell.** A Node or Python program in a pane that starts `gh` without a shell
  (`execFile('gh')`) looks for `gh.exe` only, so it skips the shim folder, runs the real `gh` against the empty
  config folder and gets "not logged in". That is a visible failure, not a fallback; run it through a shell.
- **The "empty" gh config folder** (`%APPDATA%\Mako\gh-empty`) is shared by every App-mode pane, and `gh` may
  write files there (for example `config.yml`). It holds no login: Mako recreates the folder if it is missing,
  and the shim refuses the `gh` subcommands that would plant behaviour in it (`alias`, `config set`) or run
  extensions. It cannot stop a program from writing the folder directly, and extensions Blue installed before
  this live in gh's data folder (`%LOCALAPPDATA%\GitHub CLI\extensions`), not here, so they would still run
  with the token set; remove any you don't trust. Delete the folder's contents any time.
- **Programs that look up `gh` through PATHEXT** (Go's `exec.Command("gh")`, Python's `shutil.which`) find
  `gh.cmd` ahead of the real `gh.exe`, and `cmd.exe` re-parses its arguments: `&`, `|` and `^` outside cmd-style
  quotes (a PR title taken from untrusted text, say) can be mangled or run. From a shell use the `gh.ps1` or
  `gh` sh shim; a program that builds `gh` arguments from untrusted text should not start `gh` by bare name.
  Only absolute PATH entries are searched for the real `gh` and for `claude`; a relative one (`.`,
  `node_modules\.bin`) is ignored.
- `gh.cmd` passes its arguments through `cmd.exe`: an argument with an embedded `"` can be mangled. From
  PowerShell the `gh.ps1` shim is used instead (Mako panes run PowerShell with `-ExecutionPolicy Bypass`),
  and from Git Bash the `gh` shell shim, neither of which has the problem. Use `--body-file` for long bodies.
- Mako's stable and dev copies share `%APPDATA%\Mako\bin`; each rewrites the launchers to its own Electron
  path when it starts a pane, and both paths work.
- The cache is plaintext (within a user-only folder) for at most an hour; encrypting it would cost a
  PowerShell start on every `git` call.

## What CI cannot cover

CI (Windows) runs the tests in `app/mako-token.test.js` and `app/mako-token-shim.test.js`: a fake clock for
the 5-minute margin, sleep and wake, a clock set back, offline and renewal failure; the identity and
permission checks with a fake GitHub; the shim with a real child process (the token is in the child's
environment and never in the parent's, and `gh auth token` is refused); no fallback; the credential-helper
protocol through the CLI as a real process and, where git is installed, through `git credential fill`;
import (stores, prints the fingerprint, deletes the PEM, rolls back on failure); real DPAPI and `icacls`
on the Windows runner. It cannot cover, and Blue's PC must (step 4 above):

- a real GitHub App: a real signed JWT, a real installation token, GitHub's real answers (the tests fake
  GitHub and the library);
- a **real 65-minute run** with `gh` REST, `gh pr list` and an HTTPS push at minute 0 and minute 65, so
  the token really expires and is really replaced while the pane stays open;
- Electron running the launchers as Node (`ELECTRON_RUN_AS_NODE`), and the Claude Code Bash tool (Git
  Bash) finding the `gh` shell shim first on `PATH`;
- whether the SHA-256 fingerprint `mako-token` prints equals the one the App page shows (it uses
  GitHub's documented method, `openssl rsa -pubout -outform DER | openssl sha256 -binary | openssl base64`,
  but nothing here has seen the App page).

## Commands

```text
mako-token import <pem> --app-id <n> [--replace]   store the key, prove it, delete the PEM
mako-token status [--profile writer|reader]        mint or reuse a token and report; never prints it
mako-token git <get|store|erase>                   git's credential helper (git runs this)
mako-token launch claude [args]                    claude with the App-mode environment (mako-claude.cmd)
mako-token install-launchers                       write %APPDATA%\Mako\bin
```

Run as `node app\mako-token\cli.js <command>` (there is no global install). Exit codes: 0 ok; 2 usage; 3
refused (the message says why); the `gh` shim also uses 4 for "real gh not found or not startable".
