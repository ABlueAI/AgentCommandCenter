# Smart App Control and Blue Helm Distribution

## Status

- **Local launch diagnosis:** closed.
- **Official signed-Electron-binary swap:** closed for Electron 42.5.0.
- **Portable Blue Helm 1.0 distribution:** open release item.

The upstream-binary investigation proved that replacing the installed runtime
with the same-version official Electron prebuilt does not add an Authenticode
signature. It did not prove that every zero-dollar distribution route is
closed.

## Local launch evidence

On July 25–26, 2026:

- Shortcut:
  `C:\Users\levij\OneDrive\Desktop\Command Center.lnk`
- Target:
  `D:\Workspace\agent-command-center\app\node_modules\electron\dist\electron.exe`
- Arguments:
  `"D:\Workspace\agent-command-center\app"`
- Working directory:
  `D:\Workspace\agent-command-center\app`
- Electron version: `42.5.0`
- Installed executable Authenticode status: `NotSigned`
- Installed executable streams: only `:$DATA`; no `Zone.Identifier`
- Code Integrity Event IDs `3033` and `3077` recorded `explorer.exe`
  attempting to load that exact executable and refusing it for Enterprise
  signing-level/policy requirements.

This establishes that Windows blocked the executable before Blue Helm's main
process started. Rewriting renderer/main code, changing the shortcut wrapper,
or calling `Unblock-File` could not repair that specific failure.

## Bounded upstream-binary investigation

Claude performed a read-only investigation using the official
`electron/electron` GitHub release:

- Asset: `electron-v42.5.0-win32-x64.zip`
- Reported SHA-256:
  `127bbf7a755b438612c076b22baee258a87cd3d07168cc82ea46ffc015936114`
- The asset hash reportedly matched the release's `SHASUMS256.txt` before
  extraction.
- Extracted official `electron.exe`: `NotSigned`.
- Electron-authored DLLs inspected in the bundle were also unsigned; the
  signed DLLs observed were redistributed Microsoft components.
- The scratch download was deleted and `node_modules` was not modified.

Disposition: do not repeat this 148 MB comparison unless the pinned Electron
version changes or Electron changes its signing policy.

## What the investigation proves

- There is no same-version, officially Authenticode-signed Electron 42.5.0
  prebuilt to swap into the current development installation.
- Packaging the same unsigned runtime without adding a trust/signing mechanism
  does not, by itself, address Smart App Control.
- App distributors—not the Electron runtime download—own production signing
  and packaging decisions.

## What it does not prove

- It does not rule out Microsoft Store MSIX distribution. Microsoft currently
  re-signs certified MSIX packages without a signing charge.
- It does not rule out free open-source signing programs such as SignPath
  Foundation if the project satisfies all eligibility and build-provenance
  requirements.
- It does not require Blue to buy Azure Artifact Signing or a CA certificate.
- It does not justify replacing Electron, `safeStorage`, IPC, or the existing
  process trust model solely to avoid signing.

## Current development-machine resolution

Blue made the supported human choice to turn Smart App Control Off so the
unsigned development runtime can execute. Defender and other independent
Windows protections remain enabled.

This is a real security tradeoff: one preventive unknown-app layer is removed.
It is acceptable for Blue's current self-controlled development workflow, but
must be disclosed to every direct-build recipient. Blue Helm never changes
this setting automatically.

Microsoft documents that:

- Smart App Control has no per-app exception;
- it works alongside antivirus rather than replacing it; and
- recent Windows updates permit re-enabling it without a clean installation.

Reference:

- [Smart App Control FAQ](https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions)

## Blue Helm 1.0 distribution candidates

| Candidate | Cost | Fit and constraint |
|---|---:|---|
| Direct packaged family build | $0 | Guaranteed fallback. A recipient with SAC On must knowingly turn it off or decline installation. Ship `docs/INSTALL-WINDOWS.md`. |
| Microsoft Store MSIX | $0 signing and current new-account registration | Preferred prototype. Microsoft re-signs certified MSIX packages, but Blue Helm must prove Store compatibility for its full-trust child processes, filesystem access, local tools, and external CLIs. |
| SignPath Foundation | $0 if approved | Scout after packaging. The project must already be released, fully OSI-licensed with no proprietary components, actively maintained, documented, built with verifiable provenance, and accepted by the Foundation. |
| Paid CA/Azure signing | Recurring or certificate cost | Optional convenience for direct public distribution. Not a 1.0 requirement. Current Microsoft documentation allows Public Trust identity validation for individual developers in the United States and Canada; the transferred “three-year organization only” claim is not current. |
| Replace Electron with signed Node/browser architecture | Large engineering cost | Rejected as signing cleanup. It would replace `safeStorage`, native windows, IPC, and established security boundaries. Consider only under a separate product-architecture work order. |

Official references:

- [Microsoft Windows distribution paths](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/choose-distribution-path)
- [Free Microsoft Store onboarding](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account)
- [Artifact Signing setup and current identity regions](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)
- [SignPath Foundation](https://signpath.org/)
- [SignPath Foundation eligibility](https://signpath.org/terms.html)
- [Electron packaging](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging)
- [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)

## 1.0 decision rule

1. Finish the app's remaining functional/security queue.
2. Make paths and prerequisites portable.
3. Produce a packaged Windows build.
4. Time-box the Store MSIX compatibility prototype.
5. If Store compatibility passes, use the free Store-signed path for the
   easiest recipient experience.
6. If it fails or would distort Blue Helm's architecture, ship the direct
   family build with `INSTALL-WINDOWS.md`.
7. Optionally scout SignPath eligibility after the release package and license
   inventory exist.
8. Do not buy recurring signing merely to declare 1.0 complete.

## Explainer for a direct recipient

Treat skepticism about disabling a security feature as appropriate. The honest
explanation is:

- Windows is blocking an unsigned publisher, not reporting a Blue Helm malware
  detection.
- Blue Helm's source and build process are controlled and review-gated, but
  that does not make an unsigned executable universally trustworthy.
- Smart App Control provides a real preventive layer, and turning it off is a
  real tradeoff.
- Defender, SmartScreen, the firewall, and other separate protections should
  remain enabled.
- The recipient may decline the direct build and wait for a Store-signed or
  otherwise trusted release.

That explanation is stronger and safer than claiming the change is costless,
that Microsoft intended every developer machine to have SAC Off, or that
signing would prove the application is secure.

