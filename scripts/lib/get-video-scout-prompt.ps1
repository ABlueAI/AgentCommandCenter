<#
.SYNOPSIS
  Resolve the default video-scout analysis prompt for feed-gemini.ps1 -VideoScout.
.DESCRIPTION
  Loads the forensic-analyst brief from prompts/video-scout-analysis.md so the long
  prompt never has to be pasted/quoted on a command line, and is applied on every
  video-scout run by default. Kept in its own file (rather than inline in
  feed-gemini.ps1) so it is independently testable and editable without touching
  the download/feed logic. Returns a plain string suitable for `gemini -p`.
#>
function Get-VideoScoutPrompt {
    param(
        [string]$PromptPath = (Join-Path $PSScriptRoot '..\..\prompts\video-scout-analysis.md')
    )
    if (-not (Test-Path -LiteralPath $PromptPath)) {
        throw "Video-scout default prompt file not found at: $PromptPath"
    }
    # -Encoding UTF8 is required: Windows PowerShell 5.1's Get-Content does not assume UTF-8
    # for BOM-less files (it falls back to the system ANSI code page), which mangles the
    # non-ASCII punctuation (em dashes, curly quotes) in the prompt text.
    (Get-Content -LiteralPath $PromptPath -Raw -Encoding UTF8).Trim()
}
