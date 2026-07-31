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

# --- V4R: real node.exe round-trip for the V4 multi-slice control argument ---------------------
# The defect this locks down: feed-gemini.ps1 passed the canonical slice JSON to `& node` RAW.
# Windows PowerShell 5.1 has no PSNativeCommandArgumentPassing, so it does not escape a value's own
# interior double quotes; node's CommandLineToArgvW parsing then reads each " as a quote toggle and
# STRIPS it, so `[{"startOffset":60,...}]` arrived as `[{startOffset:60,...}]` -- not JSON. The SDK
# refused (correctly) before any provider submission, and the manifest blamed "upstream API/network".
#
# A PowerShell function/mock shadow CANNOT catch this: it receives the argument array verbatim and
# never crosses CommandLineToArgvW. So these tests spawn the ACTUAL node.exe application and compare
# process.argv against the original canonical JSON byte-for-byte (base64, to remove every console-
# encoding ambiguity). Each case carries its own NEGATIVE control -- the same value sent unescaped --
# so the suite proves the escaping is what fixes it, not that the assertion is vacuous.
# No network, no provider, no API key, no media: one local process and a repo-owned fixture.
$script:V4RNodeExe = $null
$v4rNodeCmd = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
if ($v4rNodeCmd) { $script:V4RNodeExe = @($v4rNodeCmd)[0].Source }
$script:V4RFixture = Join-Path (Split-Path $here -Parent) 'test-fixtures\node-argv-echo.js'
. (Join-Path $here 'get-video-scout-slice-ranges.ps1')

# Build canonical JSON through the REAL production serializer, never a hand-typed literal, so these
# tests track ConvertTo-VideoScoutSliceRangesJson if it ever changes shape.
#
# NOTE the deliberately distinct loop-variable names in this block. A bare $i is a live hazard here:
# it is a very common ambient name, and if anything in an enclosing scope leaves an array in $i the
# arithmetic fails with the opaque "[System.Object[]] does not contain a method named 'op_Multiply'".
function New-V4RCanonicalJson {
    param([Parameter(Mandatory)][int[]]$Pairs)   # flat: start,end,start,end,...
    $ranges = New-Object System.Collections.Generic.List[object]
    for ([int]$pairIx = 0; $pairIx -lt $Pairs.Count; $pairIx += 2) {
        $ranges.Add([PSCustomObject]@{ StartOffset = $Pairs[$pairIx]; EndOffset = $Pairs[$pairIx + 1] }) | Out-Null
    }
    ConvertTo-VideoScoutSliceRangesJson -Ranges $ranges.ToArray()
}

# PS 5.1 array trap (the same one lib/get-video-scout-slice-ranges.ps1 documents): ConvertFrom-Json
# hands back a JSON array as ONE object, so `@(ConvertFrom-Json ...)` wraps it into a 1-ELEMENT
# array. Assign FIRST, then materialize -- otherwise every count assertion silently reads 1.
function ConvertTo-V4RSliceArray {
    param([Parameter(Mandatory)][string]$Json)
    $parsed = ConvertFrom-Json -InputObject $Json
    return @($parsed)
}

# Invoke the REAL node.exe with `--slice-ranges-json <value>` -- the exact production argv shape.
function Invoke-V4RNodeArgv {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$WireValue)
    if (-not $script:V4RNodeExe) { throw 'V4R: node.exe was not resolvable; the native round-trip cannot be proven (this is a FAILURE, not a skip).' }
    $lines = & $script:V4RNodeExe $script:V4RFixture '--slice-ranges-json' $WireValue
    $argc = [int](((@($lines) | Where-Object { $_ -like 'ARGC:*' }) -replace '^ARGC:', ''))
    $b64  = ((@($lines) | Where-Object { $_ -like 'B64:*' }) -replace '^B64:', '')
    $ok   = ((@($lines) | Where-Object { $_ -like 'JSONOK:*' }) -replace '^JSONOK:', '')
    [PSCustomObject]@{
        Argc       = $argc
        Received   = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
        NodeJsonOk = ([string]$ok -eq 'true')
    }
}

Describe 'V4R ConvertTo-NodeCliArg: real node.exe argv round-trip (multi-slice control argument)' {

    It 'resolves a REAL node.exe application, not a function, alias, mock, or PATH shim' {
        $script:V4RNodeExe | Should Not BeNullOrEmpty
        ([System.IO.Path]::GetExtension($script:V4RNodeExe)).ToLowerInvariant() | Should Be '.exe'
        (Test-Path -LiteralPath $script:V4RNodeExe -PathType Leaf) | Should Be $true
        (Get-Command node -CommandType Application -ErrorAction SilentlyContinue) | Should Not BeNullOrEmpty
    }

    It 'uses the repository-owned fixture' {
        (Test-Path -LiteralPath $script:V4RFixture -PathType Leaf) | Should Be $true
    }

    It 'the canonical JSON under test is compact (no whitespace at all)' {
        $canon = New-V4RCanonicalJson -Pairs @(60, 90, 240, 270)
        ($canon -match '\s') | Should Be $false
        $canon | Should Be '[{"startOffset":60,"endOffset":90},{"startOffset":240,"endOffset":270}]'
    }

    It 'NEGATIVE CONTROL: sending the raw canonical JSON LOSES its quotation marks (the defect)' {
        $canon = New-V4RCanonicalJson -Pairs @(60, 90, 240, 270)
        $raw = Invoke-V4RNodeArgv -WireValue $canon
        $raw.Received | Should Not Be $canon
        ($raw.Received -match '"') | Should Be $false
        $raw.Received | Should Be '[{startOffset:60,endOffset:90},{startOffset:240,endOffset:270}]'
        # ...and NODE's JSON.parse rejects it -- which is precisely why resolveSliceRanges refused
        # the accepted human run before any provider submission. Asserted by the node process itself:
        # PowerShell 5.1's own ConvertFrom-Json is LENIENT about unquoted keys and would call this
        # mangled text "valid JSON", hiding the defect entirely.
        $raw.NodeJsonOk | Should Be $false
    }

    It 'two ordinary slices survive ConvertTo-NodeCliArg byte-for-byte as ONE argv element' {
        $canon = New-V4RCanonicalJson -Pairs @(60, 90, 240, 270)
        $out = Invoke-V4RNodeArgv -WireValue (ConvertTo-NodeCliArg -Arg $canon)
        $out.Received | Should Be $canon
        $out.Argc | Should Be 2          # --slice-ranges-json + its single value
        $out.NodeJsonOk | Should Be $true
    }

    It 'boundary offsets 0 and 86400 survive byte-for-byte' {
        $canon = New-V4RCanonicalJson -Pairs @(0, 1, 86399, 86400)
        $canon | Should Be '[{"startOffset":0,"endOffset":1},{"startOffset":86399,"endOffset":86400}]'
        $out = Invoke-V4RNodeArgv -WireValue (ConvertTo-NodeCliArg -Arg $canon)
        $out.Received | Should Be $canon
        $out.Argc | Should Be 2
        $out.NodeJsonOk | Should Be $true
    }

    It 'the maximum eight slices survive byte-for-byte as ONE argv element' {
        $pairs = New-Object System.Collections.Generic.List[int]
        for ([int]$sliceIx = 0; $sliceIx -lt 8; $sliceIx++) {
            $pairs.Add($sliceIx * 100) | Out-Null
            $pairs.Add($sliceIx * 100 + 50) | Out-Null
        }
        $canon = New-V4RCanonicalJson -Pairs $pairs.ToArray()
        $out = Invoke-V4RNodeArgv -WireValue (ConvertTo-NodeCliArg -Arg $canon)
        $out.Received | Should Be $canon
        $out.Argc | Should Be 2
        $out.NodeJsonOk | Should Be $true
        (ConvertTo-V4RSliceArray -Json $out.Received).Count | Should Be 8
    }

    It 'what node receives re-parses to the EXACT requested offsets, in the requested order' {
        $canon = New-V4RCanonicalJson -Pairs @(60, 90, 240, 270)
        $out = Invoke-V4RNodeArgv -WireValue (ConvertTo-NodeCliArg -Arg $canon)
        $out.NodeJsonOk | Should Be $true
        $parsed = ConvertTo-V4RSliceArray -Json $out.Received
        $parsed.Count | Should Be 2
        $parsed[0].startOffset | Should Be 60
        $parsed[0].endOffset   | Should Be 90
        $parsed[1].startOffset | Should Be 240
        $parsed[1].endOffset   | Should Be 270
    }

    It 'node receives NO retained escape backslashes (escaping is transport-only, never content)' {
        $canon = New-V4RCanonicalJson -Pairs @(60, 90, 240, 270)
        $out = Invoke-V4RNodeArgv -WireValue (ConvertTo-NodeCliArg -Arg $canon)
        ($out.Received.Contains([string][char]92)) | Should Be $false
    }

    It 'DOUBLE escaping is detectably wrong -- the escaping must be applied exactly once' {
        $canon = New-V4RCanonicalJson -Pairs @(60, 90, 240, 270)
        $twice = ConvertTo-NodeCliArg -Arg (ConvertTo-NodeCliArg -Arg $canon)
        $out = Invoke-V4RNodeArgv -WireValue $twice
        $out.Received | Should Not Be $canon
        ($out.Received.Contains([string][char]92)) | Should Be $true
    }

    It 'the escaped wire form is the canonical text with every quote escaped once' {
        $canon = New-V4RCanonicalJson -Pairs @(60, 90)
        ConvertTo-NodeCliArg -Arg $canon | Should Be '[{\"startOffset\":60,\"endOffset\":90}]'
    }

    It 'the round-trip performs no network, provider, or media access (fixture is inert)' {
        $body = Get-Content -LiteralPath $script:V4RFixture -Raw
        ($body -match 'require\(') | Should Be $false
        ($body -match 'http|fetch|net\.|fs\.') | Should Be $false
    }
}
