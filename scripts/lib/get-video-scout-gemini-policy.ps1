<#
.SYNOPSIS
  V5 stack content-acceptance correction: resolve the FIXED, repository-owned Gemini CLI policy file
  that denies the built-in `update_topic` tool for headless Video Scout runs.
.DESCRIPTION
  The policy path is derived ONLY from this script's own location ($PSScriptRoot), which is a tracked
  repository path. It NEVER comes from renderer input, terminal/provider output, a manifest, or any
  caller-supplied value -- the function takes no parameters at all, so nothing external can redirect
  which policy file is loaded. Returns an ABSOLUTE path (so it resolves correctly regardless of the
  process working directory -- feed-gemini.ps1 runs the CLI from a Push-Location'd trusted root), and
  fails visibly if the tracked file is missing (a Video Scout CLI run must not silently proceed
  without the tool-deny policy in force).

  This is the single source of truth for the policy location; feed-gemini.ps1 passes the returned path
  with `--policy` on every Gemini CLI invocation. The policy content itself lives in
  scripts/config/video-scout-gemini-policy.toml.
#>
function Get-VideoScoutGeminiPolicyPath {
    # $PSScriptRoot is scripts\lib; the tracked policy lives at scripts\config\. Resolve to an
    # absolute, normalized path. Intentionally NO parameters -- the location is fixed and repo-owned.
    $path = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\config\video-scout-gemini-policy.toml'))
    if (-not [System.IO.File]::Exists($path)) {
        throw "Video Scout Gemini policy file not found at '$path'. A CLI run must not proceed without the update_topic deny policy in force."
    }
    return $path
}
