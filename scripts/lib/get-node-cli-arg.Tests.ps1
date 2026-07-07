<#
.SYNOPSIS
  Pester tests for ConvertTo-NodeCliArg (the CommandLineToArgvW-correct escaping feed-gemini.ps1
  applies to the -p value before invoking `& node <gemini.js> ...` directly).
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\get-node-cli-arg.Tests.ps1

  The string-shape tests assert the escaping the function performs. The node round-trip test (only
  defined when node is on PATH) is the one that actually locks in Step 4 of the fix: it confirms
  node's real argv receives exactly ONE -p value and ZERO stray positional tokens for a prompt full
  of the characters that previously broke it -- reproducing gemini's own yargs parse, not merely
  checking "the string has no newline" (the property the previous fix checked, which passed while
  the real invocation still failed).
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'get-node-cli-arg.ps1')

Describe 'ConvertTo-NodeCliArg (string shape)' {

    It 'leaves a quote-free, backslash-free string unchanged' {
        ConvertTo-NodeCliArg -Arg 'Summarize this video briefly.' | Should Be 'Summarize this video briefly.'
    }

    It 'escapes an interior double quote as backslash-quote' {
        ConvertTo-NodeCliArg -Arg 'say "hi" now' | Should Be 'say \"hi\" now'
    }

    It 'doubles a backslash that immediately precedes a quote, then escapes the quote' {
        # source: one backslash + quote  ->  two backslashes + escaped quote  (\\\")
        ConvertTo-NodeCliArg -Arg 'a\"b' | Should Be 'a\\\"b'
    }

    It 'doubles a run of trailing backslashes so PowerShells appended closing quote is not escaped' {
        ConvertTo-NodeCliArg -Arg 'ends with slash\' | Should Be 'ends with slash\\'
        ConvertTo-NodeCliArg -Arg 'two slashes\\' | Should Be 'two slashes\\\\'
    }

    It 'leaves cmd metacharacters (%, &, ^) untouched -- node.exe is called directly, not via cmd' {
        ConvertTo-NodeCliArg -Arg 'a & b %VAR% ^c' | Should Be 'a & b %VAR% ^c'
    }

    It 'escapes every quote in a multi-quote brief and adds no other change' {
        $in  = 'observation ("the screen shows...") vs inference ("this appears to be...")'
        $out = 'observation (\"the screen shows...\") vs inference (\"this appears to be...\")'
        ConvertTo-NodeCliArg -Arg $in | Should Be $out
    }

    It 'accepts an empty string' {
        ConvertTo-NodeCliArg -Arg '' | Should Be ''
    }
}

# --- Step 4 lock-in: real node argv parse (only when node is available) ------------------------
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    Describe 'ConvertTo-NodeCliArg (node argv round-trip)' {

        # A tiny node program that reproduces gemini's yargs guard: -p / -m consume the next token,
        # anything else un-flagged is a positional "query". It prints "<hasP>|<positionalCount>".
        $probe = Join-Path $env:TEMP ("node-cli-arg-probe-{0}.js" -f ([guid]::NewGuid().ToString('N')))
        $probeBody = @'
const a = process.argv.slice(2);
let hasP = false, pos = 0;
for (let i = 0; i < a.length; i++) {
  if (a[i] === '-p' || a[i] === '--prompt') { hasP = true; i++; continue; }
  if (a[i] === '-m' || a[i] === '--model') { i++; continue; }
  pos++;
}
process.stdout.write(hasP + '|' + pos + '|' + a.length);
'@
        Set-Content -LiteralPath $probe -Value $probeBody -Encoding UTF8

        It 'delivers a quote-heavy, metachar-heavy prompt as one -p value with zero positionals' {
            $prompt = 'Report observation ("the screen shows...") vs inference ("this appears to be...") ' +
                      'and say "No material limitations." Handle & % ^ and a path C:\dir\ too.'
            $pArg = ConvertTo-NodeCliArg -Arg ("$prompt @D:\Gemini_Video_Review\downloads\Test_Video.mp4")
            $result = & node $probe -m 'gemini-2.5-flash-lite' -p $pArg
            # hasPromptFlag = True, positionalCount = 0, total argv = 4 (-m, model, -p, value)
            $result | Should Be 'true|0|4'
        }

        It 'delivers the real 49-line file-loaded brief as one -p value with zero positionals' {
            $repoRoot = Split-Path (Split-Path $here -Parent) -Parent
            . (Join-Path $here 'get-video-scout-prompt.ps1')
            . (Join-Path $here 'get-cli-safe-prompt.ps1')
            $brief = Get-CliSafePrompt -Prompt (Get-VideoScoutPrompt)
            $pArg = ConvertTo-NodeCliArg -Arg ("$brief @D:\Gemini_Video_Review\downloads\Test_Video.mp4")
            $result = & node $probe -m 'gemini-2.5-flash-lite' -p $pArg
            $result | Should Be 'true|0|4'
        }

        if (Test-Path -LiteralPath $probe) { Remove-Item -LiteralPath $probe -Force }
    }
}
