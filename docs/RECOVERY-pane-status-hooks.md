# Manual recovery — pane-status Claude Code hooks

Procurement record: `docs/OSS-PROCUREMENT-pane-status.md`
Blue's verdict, verbatim: **`BLUE SUBSYSTEM VERDICT: BUILD FRESH`**

This document is for the situations where Blue Helm **deliberately refuses to act on its own**. Pane
status will not guess who owns a hook group, and it will not write to your Claude settings
unattended. When it cannot prove what it is looking at, it stops, shows `needs attention`, disables
reporting, and sends you here.

Everything below is done by hand, in a text editor. Every path is a **placeholder** — substitute your
own. Nothing in this document asks you to run a Blue Helm command that repairs anything, because no
such command exists: repair is a human decision by design.

---

## 0. Before you edit anything: back it up

    copy "<CLAUDE_SETTINGS>" "<CLAUDE_SETTINGS>.backup-<DATE>"

where `<CLAUDE_SETTINGS>` is your user-scope Claude Code settings file (on Windows, `settings.json`
inside the `.claude` directory in your user profile).

Do this even if you are only going to look. The rest of this document assumes you can restore.

**Blue Helm never deletes this file.** If removal takes out the last thing in it, the file is left as
a valid empty document — `{}` — not removed. If the file is missing entirely, something other than
Blue Helm removed it.

---

## 1. Identify what belongs to which installation

Pane-status hook entries are self-identifying. Ownership is carried by the **shim path**, because
Claude Code validates hook entries against a strict schema and Blue Helm will not invent a field to
carry a marker.

A Blue Helm entry looks like this (line-wrapped here for reading):

    {
      "type": "command",
      "command": "C:\\Windows\\System32\\cmd.exe",
      "args": ["/d", "/c",
               "<USER_DATA>\\pane-status\\<INSTALL_ID>\\pane-status-reporter.cmd",
               ">nul", "2>nul", "&", "exit", "/b", "0"],
      "timeout": 5
    }

The two parts that matter:

* `pane-status` — the directory component that marks this as a Blue Helm pane-status shim.
* `<INSTALL_ID>` — **32 lowercase hex characters** identifying WHICH installation owns it.

Your installation's ID is in a one-line file next to the installation record:

    <USER_DATA>\pane-status-install-id

> **Caret escaping.** If your user-data path contains a space or one of `& ^ ( ) < > | ; , =`, those
> characters appear in `args` preceded by a caret (`^`). `C:\Blue Helm\...` appears as
> `C:\Blue^ Helm\...`. That is correct and deliberate — `cmd.exe` re-parses metacharacters after
> quoting is removed, so they must be escaped. Ignore the carets when matching the install ID.

Blue Helm installs **exactly eight** event groups, one hook entry each:

    SessionStart   UserPromptSubmit   Notification   Stop
    StopFailure    SessionEnd         PreToolUse     PostToolUse

---

## 2. Remove only your own groups

Inside `"hooks"`, for each of the eight event names above, find the matcher group whose single hook
entry carries **your** `<INSTALL_ID>`, and delete **that group object only**.

Rules, in order of importance:

1. **Delete only groups whose entry carries YOUR install ID.** A different ID is another Blue Helm
   installation — see §3.
2. **Preserve every other matcher group on the same event.** If `PreToolUse` holds your group plus a
   `Bash` matcher group of your own making, only yours goes.
3. **Preserve every hook event Blue Helm does not install**, and every unrelated top-level setting
   (`permissions`, `model`, `env`, anything else).
4. If an event's array becomes empty, delete the event key. If `"hooks"` becomes empty, delete
   `"hooks"`. **Do not delete the file.** An empty `{}` is correct and valid.
5. If a single matcher group contains your hook **alongside** somebody else's, that group is
   *ambiguous*. Blue Helm refuses to rewrite it, and so should you until you are certain which entry
   is which — remove only the individual hook entry that carries your install ID, leaving the group
   and its other entries intact.

Then delete Blue Helm's own record so it stops believing it is installed:

    <USER_DATA>\pane-status-installation.json
    <USER_DATA>\pane-status\<INSTALL_ID>\      (the whole directory — it holds only the shim)

Leave `pane-status-install-id` alone unless you are removing Blue Helm entirely; it is how this
installation recognises its own groups next time.

---

## 3. "Another Blue Helm installation owns hooks"

The toolbar shows **Claude status: other install**, and there is no button.

This is not an error. User-scope Claude settings are **shared by every Blue Helm installation for
this user**, and two installations are a legitimate state. Blue Helm will never adopt, replace,
duplicate, or remove another installation's groups automatically, because it cannot tell whether that
installation is still in use.

Decide by hand:

* If the other installation is still in use — leave it. Two installations cannot both own the hooks;
  the one that owns them is the one that reports status.
* If the other installation is gone (uninstalled without removal — see §7), remove its groups using
  §2, substituting **its** `<INSTALL_ID>`, then run **Set up** here.

---

## 4. Missing or corrupt installation record

The toolbar shows **Claude status: needs attention** or **unreadable**, and the log says the
descriptor is missing or corrupt while marked hooks are present.

Blue Helm has found hook groups carrying a Blue Helm install ID but has no record of installing them.
It will not guess. Two honest options:

* **Adopt nothing, clean up by hand.** Follow §2 using the install ID you find in the `args`, then run
  **Set up** again to get a fresh, recorded installation.
* **Restore the record** from a backup of `<USER_DATA>\pane-status-installation.json`, if you have
  one that matches what is actually in the settings file.

Do not hand-write a descriptor. It carries an integrity hash over its own contents, and a
hand-written one will be rejected — which is the point.

### Newer schema

If the log says the descriptor has a **newer schema**, a later build of Blue Helm wrote it. This build
refuses **read-only**: it will not migrate it, overwrite it, or remove the hooks it describes. Either
run the newer build, or remove by hand per §2 and let this build install fresh.

---

## 5. Reconciliation required

The toolbar shows **Claude status: needs attention**. Reporting is disabled, every pane reads
`unknown`, and **no further automatic settings write is permitted** until this is resolved.

Blue Helm reaches this state when it could not reconcile what it intended with what it found —
typically because a third party wrote to the settings file during a transaction, or because the
groups were changed or removed outside the app.

To resolve: inspect the settings file, decide what you want, apply §2 by hand, delete
`<USER_DATA>\pane-status-installation.json`, and restart Blue Helm. Startup will find no record and no
marked hooks, report **off**, and let you run **Set up** cleanly.

---

## 6. Stale lock

The toolbar shows **Claude status: locked**.

The lock lives beside your Claude settings:

    <CLAUDE_SETTINGS_DIR>\.pane-status.lock

**Blue Helm never breaks a lock because it looks old.** Age is not evidence: a long transaction and a
dead process look identical by timestamp. The **Clear stale lock** button will refuse unless it can
*prove* the owning process is gone — it checks the recorded PID **and that process's start time**, so
an unrelated process that inherited the PID cannot be mistaken for the original owner. If it cannot
determine liveness at all, it refuses.

If you are certain no other Blue Helm window is mid-setup, you may delete the lock file by hand. Read
it first — it is small JSON naming the install ID, PID, and start time — and satisfy yourself that the
process really is gone.

---

## 7. Uninstalled Blue Helm without removing hooks

This is the hazard of user-scope settings, and it is worth stating plainly: **uninstalling Blue Helm
does not remove its hooks.** The entries stay in your Claude settings and point at a shim that no
longer exists.

Nothing breaks. The chain is built so that every stranded link fails silently and exits zero: cmd.exe
cannot find the shim, reports nothing, and forces exit code 0, so Claude Code sees a hook that did
nothing. Your sessions are unaffected apart from a small per-hook cost.

To clean up, follow §2 using the install ID in the `args`. You do not need Blue Helm installed to do
it.

**Always use Remove before uninstalling.**

---

## 8. Verify after recovery

1. The settings file still parses. Any JSON validator, or simply open Claude Code — it will complain
   loudly about a malformed settings file.
2. Your unrelated settings and hooks are all still present. Compare against the backup from §0.
3. No `pane-status` shim path remains in `args` anywhere in the file — unless you deliberately left
   another installation's groups in place per §3.
4. Start Blue Helm. The toolbar should read **Claude status: off** with a **Set up** button. If it
   still reads **needs attention**, the descriptor at `<USER_DATA>\pane-status-installation.json` is
   still present — delete it and restart.
5. Optionally run **Set up** again and confirm the toolbar reaches **Claude status: on**.

---

## What pane status can never do

Worth remembering while you are editing files by hand: pane status is **advisory**. It displays a
word next to a pane. It cannot authorize or initiate merge, push, approval, pane closure, process
control, restart, or credential access, and a wrong or forged status cannot cause any of those. If a
badge is wrong, the cost is a wrong word on screen.

The honest failure mode is `unknown`, and you will see it whenever Blue Helm is not certain — an
unverified Claude Code version, a stale signal, a removed hook, or any of the states above.
