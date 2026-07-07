<#
.SYNOPSIS
  Escape one string so it survives the Windows PowerShell 5.1 -> node.exe argument boundary as
  exactly ONE argv element, with embedded double quotes preserved verbatim.
.DESCRIPTION
  feed-gemini.ps1 invokes `& node <gemini.js> -m <model> -p <prompt+file>` directly, bypassing the
  `gemini` npm shim. The -VideoScout analysis brief contains literal " characters (quoted
  instructional examples that must reach Gemini intact).

  Windows PowerShell 5.1 has no PSNativeCommandArgumentPassing (that arrived in PowerShell 7.3).
  When 5.1 serializes a native-command argument it wraps a value containing whitespace in "..." but
  does NOT escape the value's own interior double quotes. node's C runtime (CommandLineToArgvW
  rules) then reads each unescaped interior " as a quote toggle and splits the value on the
  following spaces, producing extra bare tokens. gemini's yargs parser sees those as a second,
  positional query alongside -p and aborts with:
    "Cannot use both a positional prompt and the --prompt (-p) flag together"
  This is why the failure is deterministic regardless of video, and why routing through the shim
  (.ps1/.cmd) can't fix it: each shim does its own uncontrolled `& node ... $args` re-serialization
  across the same 5.1 boundary. Only doing the final `& node` call ourselves, with correct
  escaping, works.

  Under the CommandLineToArgvW convention, a " inside a quoted argument must be written as \", and
  any run of backslashes immediately preceding a " (or preceding the argument's closing ") must be
  doubled. This function applies exactly that:
    (\\*)"  -> double the backslashes, then escape the quote            ->  $1$1\"
    (\\+)$  -> double trailing backslashes (PowerShell appends the ")   ->  $1$1
  After PowerShell wraps the returned string in "...", node reconstitutes the ORIGINAL text: the
  real " characters reach Gemini unchanged. This is delivery-layer escaping, not content mutation,
  and it is intentionally NOT folded into Get-CliSafePrompt (which only flattens newlines).

  ASSUMPTION: the caller's argument contains whitespace, so PowerShell wraps it in double quotes and
  the trailing-backslash doubling is correct. feed-gemini.ps1's -p value is always
  "<prompt> @<file>", which always contains a space, so this holds. Because node.exe is invoked
  directly (never via cmd.exe), the cmd metacharacters %, &, ^ are not special and need no handling.
#>
function ConvertTo-NodeCliArg {
    param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Arg
    )
    ($Arg -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1'
}
