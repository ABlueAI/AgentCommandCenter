<#
.SYNOPSIS
  Resolve and validate the Gemini model + media-resolution launch settings for feed-gemini.ps1.
.DESCRIPTION
  Small, independently testable helper so -Model/-MediaResolution validation, the launch-time log
  line, and the "media-resolution has no CLI flag (yet)" warning can all be unit tested without
  invoking yt-dlp/gemini or touching the network.

  -MediaResolution controls how many tokens Gemini spends decoding each frame/image (the
  `mediaResolution` field on the generateContent API: LOW / MEDIUM / HIGH). This is completely
  independent of the *download* resolution -Mode video already caps via yt-dlp's `-S "res:720"`
  filter in feed-gemini.ps1: lowering the source video's pixel dimensions does not reduce the
  per-frame token cost Gemini bills for, and raising -MediaResolution does not upscale or
  re-download the source file. Treat them as two separate dials -- one is a download-size cap,
  the other is a per-request token-cost cap.

  As of the installed Gemini CLI (confirmed via `gemini --help`), there is no `--media-resolution`
  flag, and no documented settings.json key that reaches generateContent's `mediaResolution` field
  for the `-p` (non-interactive) path used by feed-gemini.ps1 -- that field only appears inside the
  CLI's vendored @google/genai SDK type definitions and an internal, undocumented
  ModelConfigService alias/override mechanism (used for the CLI's own subagent tooling), not a
  public/stable CLI surface. So this helper records the caller's intent (for the run log and for
  forward compatibility) but does NOT fabricate a flag or silently drop the setting. Closest
  currently-available levers, until the CLI (or a REST-based path) exposes this directly:
    - Use -Mode transcript/audio instead of -Mode video when visual detail isn't required; those
      requests carry no image tokens at all, which affects cost more than any resolution tier.
    - For real enforcement of generateContent's mediaResolution field, calling the Gemini REST API
      directly (generationConfig.mediaResolution) is the correct mechanism -- not this CLI wrapper.
      That is a separate, larger change (a different transport, not a flag) and out of scope here.
#>
function Resolve-GeminiLaunchConfig {
    param(
        [string]$Model = 'gemini-2.5-flash-lite',
        [ValidateSet('LOW', 'MEDIUM', 'HIGH')][string]$MediaResolution = 'MEDIUM'
    )
    if ([string]::IsNullOrWhiteSpace($Model)) {
        throw "Model must not be empty."
    }

    $warning = "gemini CLI has no -media-resolution flag (checked via 'gemini --help') and no " +
        "documented settings.json passthrough to generateContent's mediaResolution field on the " +
        "-p path; MediaResolution='$MediaResolution' is recorded in the run log only and is NOT " +
        "sent to the CLI. Closest levers: use -Mode transcript/audio to avoid image tokens " +
        "entirely, or call the Gemini REST API directly if mediaResolution enforcement is required."

    [PSCustomObject]@{
        Model           = $Model
        MediaResolution = $MediaResolution
        LogLine         = "Gemini launch config -> model: $Model | media resolution: $MediaResolution (requested; see warning)"
        Warning         = $warning
    }
}
