<#
.SYNOPSIS
  Resolve the default timestamped-transcript analysis prompt for feed-gemini.ps1 transcript mode.
.DESCRIPTION
  Loads the timestamped summary/map/range brief from prompts/transcript-analysis.md so the
  multi-paragraph prompt never has to be pasted/quoted on a command line. Applied by
  feed-gemini.ps1 only when -Mode transcript runs WITHOUT an explicit -Prompt (a custom
  -Prompt remains a complete caller override). Kept in its own file, mirroring
  get-video-scout-prompt.ps1, so the contract is independently testable and the prompt is
  editable without touching download/feed logic. Returns a plain string suitable for
  `gemini -p` (feed-gemini flattens it to one line via Get-CliSafePrompt before use).
#>
function Get-TranscriptPrompt {
    param(
        [string]$PromptPath = (Join-Path $PSScriptRoot '..\..\prompts\transcript-analysis.md')
    )
    if (-not (Test-Path -LiteralPath $PromptPath)) {
        throw "Transcript default prompt file not found at: $PromptPath"
    }
    # -Encoding UTF8 is required: Windows PowerShell 5.1's Get-Content does not assume UTF-8
    # for BOM-less files (it falls back to the system ANSI code page), which mangles the
    # non-ASCII punctuation (en dashes) in the prompt text.
    (Get-Content -LiteralPath $PromptPath -Raw -Encoding UTF8).Trim()
}
