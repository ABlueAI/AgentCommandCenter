# Blue Helm — Windows Installation and Launch Notes

## Scope

This guide applies to the current unsigned Blue Helm development/family build.
Blue Helm 1.0 will replace the source-tree shortcut with a packaged build and a
clean-machine setup flow, but direct unsigned transfers can still encounter the
same Windows trust checks.

Blue Helm itself does not require a recurring signing subscription. Claude,
Gemini, or other providers may require the recipient's own account or paid
plan. Never transfer Blue's provider credentials to another computer.

## Before installation

1. Install all offered Windows updates and restart if Windows requests it.
2. Obtain Blue Helm only from Blue or the project's approved repository/release
   location.
3. Keep Microsoft Defender, SmartScreen, Windows Firewall, and User Account
   Control enabled.
4. Do not import Blue's encrypted credential files. Configure credentials
   separately on each computer through Blue Helm's setup UI.

## Smart App Control

### The message

Windows 11 may display:

> Smart App Control blocked an app that may be unsafe  
> Windows can't tell who created this app.

The app does not start. Windows is refusing to load the unsigned Electron
executable before Blue Helm code runs, so Blue Helm cannot catch or override
the refusal.

This message is primarily about publisher identity and reputation. It is not,
by itself, a malware verdict. It also is not proof that an unsigned application
is safe; recipients should obtain the build from a trusted source and verify
the release instructions.

### No per-app exception

Microsoft currently documents no Smart App Control exception for one
particular application. The supported choices are to run a trusted/signed
build or turn Smart App Control off.

Official reference:

- [Smart App Control FAQ](https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions)

### The security decision belongs to the user

Turning Smart App Control off removes one preventive layer that blocks unknown
or unsigned executables. It does not itself turn off Microsoft Defender or
other independent Windows protections, but it is still a real reduction in
defense. Blue Helm must never change this setting automatically.

If the user does not accept that tradeoff, stop and use a trusted distribution
route instead. Blue Helm 1.0 will time-box a Microsoft Store MSIX prototype,
where Microsoft signs certified packages at no signing charge.

### Update Windows before changing the setting

Microsoft states that recent Windows updates allow Smart App Control to be
re-enabled without reinstalling Windows. Older Windows versions documented a
reset/reinstall requirement after it was turned off. Update first and review
the current Microsoft FAQ before proceeding.

Do not rely on a registry value as the final authority. Read the state shown in
Windows Security.

### Human-only steps

If the user knowingly accepts the tradeoff:

1. Open **Windows Security**.
2. Select **App & browser control**.
3. Open **Smart App Control settings**.
4. Set Smart App Control to **Off** and confirm the Windows prompt.
5. Restart only if Windows requests it.
6. Reopen Windows Security and confirm the displayed state.
7. Launch Blue Helm again.

Do not automate these steps, edit the registry, or install a policy bypass.

## SmartScreen is different

A file downloaded through a browser or transferred over the internet may also
carry Mark of the Web. SmartScreen can show a separate
**Windows protected your PC** reputation prompt, sometimes with
**More info → Run anyway**.

That prompt is not the Smart App Control block. Smart App Control has no
equivalent per-app **Run anyway** choice.

Do not run `Unblock-File` blindly. First verify that a `Zone.Identifier`
alternate data stream actually exists and that SmartScreen—not Code
Integrity—is the active blocker.

## Launch verification

For the current development build:

1. Confirm no stale Electron process is running:

   ```powershell
   Get-Process electron -ErrorAction SilentlyContinue
   ```

2. Launch the Blue Helm shortcut.
3. Confirm the window appears and reaches its normal startup Logs.
4. Confirm the running Electron processes point to the expected Blue Helm
   installation.
5. Use a non-paid check such as opening the Library pane before testing any
   provider-backed workflow.

For a packaged 1.0 build, use the package's own Start-menu/desktop shortcut and
the clean-machine acceptance checklist shipped with that release.

## Troubleshooting

If Blue Helm still does not launch:

1. Reopen Windows Security and confirm the visible Smart App Control state.
2. Check whether Windows requested a restart.
3. Open Event Viewer:
   **Applications and Services Logs → Microsoft → Windows → CodeIntegrity →
   Operational**.
4. Check for Events **3033** or **3077** at the failed-launch time.
5. Check whether Windows is in S mode.
6. Check for separately managed WDAC or AppLocker policy.
7. Check Defender Protection History and any third-party security product.
8. Launch the same executable directly from an interactive PowerShell window
   to distinguish an executable-policy block from a broken shortcut.

If Code Integrity no longer blocks the executable but Electron starts and
exits, collect the startup output. That is an application-startup problem and
should receive a separate diagnostic work order.

## Do not do these

- Do not disable Defender, SmartScreen, the firewall, or real-time protection.
- Do not use registry hacks to bypass Smart App Control.
- Do not weaken PowerShell execution policy globally.
- Do not install a self-signed certificate while describing it as equivalent
  to a publicly trusted publisher signature.
- Do not download Electron or Blue Helm components from unofficial mirrors.
- Do not copy provider credentials or encrypted key material between machines.
- Do not claim that repackaging the same unsigned Electron binary alone solves
  Smart App Control.

## Future Blue Helm 1.0 distribution

The 1.0 release gate requires:

- a packaged application rather than a source-tree `node_modules` shortcut;
- configurable repository and Video Scout storage paths;
- prerequisite detection and clear setup instructions;
- per-machine credentials stored through Electron `safeStorage`;
- redistribution-license checks for bundled code, native modules, models, and
  media tools;
- installation and one representative workflow on a clean Windows account or
  second computer;
- a zero-recurring-signing-cost distribution decision.

The preferred candidate is a Microsoft Store MSIX because current Microsoft
documentation says the Store re-signs certified MSIX packages for free and the
new developer-account onboarding flow has no registration fee. Blue Helm must
still prototype Store compatibility before relying on that route.

Official references:

- [Choose a Windows distribution path](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/choose-distribution-path)
- [Open a Microsoft Store developer account](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account)
- [Electron packaging](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging)

