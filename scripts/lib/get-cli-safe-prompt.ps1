<#
.SYNOPSIS
  Flatten a prompt string to one line so it survives being passed as a Windows CLI argument
  through the gemini npm .cmd shim (used by feed-gemini.ps1).
.DESCRIPTION
  gemini's Windows install (`npm i -g @google/gemini-cli`) resolves to a .cmd shim -- a cmd.exe
  batch script whose final line expands to `node ... %*`. cmd.exe's %* substitution is
  line-based: a literal newline embedded inside an otherwise-single quoted argument silently
  ends that "line", and the text after the newline is re-parsed as extra bare token(s). Those
  bare tokens reach gemini's yargs parser as a second, *positional* "query" argument alongside
  the (now-truncated) -p value, which trips gemini's own mutual-exclusion guard: "Cannot use
  both a positional prompt and the --prompt (-p) flag together."

  This is invisible with short, hand-typed -Prompt values (no embedded newline, nothing to
  truncate) but fires reliably for -VideoScout's default brief, which is loaded straight from
  the multi-line prompts/video-scout-analysis.md file (see get-video-scout-prompt.ps1) and keeps
  its embedded newlines intact.

  Collapsing every whitespace run (including newlines/tabs/repeated spaces) to a single space
  keeps the whole prompt on one physical line so it survives the .cmd shim as exactly one
  argument -- and never introduces a second, un-flagged token for the file-attachment reference
  either, since that reference is concatenated onto the same flattened string before it is ever
  handed to -p.
#>
function Get-CliSafePrompt {
    param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Prompt
    )
    ($Prompt -replace '\s+', ' ').Trim()
}
