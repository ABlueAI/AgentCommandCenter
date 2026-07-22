<#
.SYNOPSIS
  Pester tests for the V5a per-run manifest module (write-video-scout-manifest.ps1).
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\write-video-scout-manifest.Tests.ps1

  Covers the manifest invariant's building blocks: creation-with-run-dir, valid versioned JSON,
  UTF-8 (no BOM) encoding, atomic replace (no observable partial file, no leftover temp),
  exactly-once terminal outcomes, sanitized reasons, secret redaction, optional-metadata nulls,
  and the pure usage-line parser + failure classifier. Pester 3.4 syntax (no BeforeAll/AfterAll),
  matching the other suites in this directory. Every directory touched here is created by this
  suite under $env:TEMP and only those are cleaned up at the end.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'write-video-scout-manifest.ps1')

$testBase = Join-Path $env:TEMP ("manifest-test-{0}" -f ([guid]::NewGuid().ToString('N')))

function Read-ManifestJson {
    param([string]$RunDir)
    $path = Get-VideoScoutManifestPath -RunDir $RunDir
    Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
}

Describe 'Initialize-VideoScoutRun (new-run manifest creation)' {

    $run = Initialize-VideoScoutRun -BaseDir $testBase -Url 'https://youtu.be/abc123' `
        -RequestedMode 'video' -AppliedMode 'video' -Route 'sdk' -Model 'gemini-2.5-flash-lite' `
        -MediaResolutionRequested 'LOW' -MediaResolutionApplied 'LOW' -VideoScout $true `
        -StartOffset 120 -EndOffset 240

    It 'creates the run directory with a manifest.json inside it' {
        Test-Path -LiteralPath $run.RunDir -PathType Container | Should Be $true
        Test-Path -LiteralPath (Get-VideoScoutManifestPath -RunDir $run.RunDir) | Should Be $true
    }

    It 'writes valid JSON with schemaVersion 2 and an empty media inventory (V5c1)' {
        $m = Read-ManifestJson -RunDir $run.RunDir
        $m.schemaVersion | Should Be 2
        @($m.mediaArtifacts).Count | Should Be 0
    }

    It 'records runId equal to the run directory name (stable, unique)' {
        $m = Read-ManifestJson -RunDir $run.RunDir
        $m.runId | Should Be (Split-Path $run.RunDir -Leaf)
    }

    It 'records url, modes, route, model, media resolutions, and offsets as given' {
        $m = Read-ManifestJson -RunDir $run.RunDir
        $m.url | Should Be 'https://youtu.be/abc123'
        $m.requestedMode | Should Be 'video'
        $m.appliedMode | Should Be 'video'
        $m.route | Should Be 'sdk'
        $m.model | Should Be 'gemini-2.5-flash-lite'
        $m.mediaResolutionRequested | Should Be 'LOW'
        $m.mediaResolutionApplied | Should Be 'LOW'
        $m.startOffsetSeconds | Should Be 120
        $m.endOffsetSeconds | Should Be 240
        $m.videoScout | Should Be $true
    }

    It 'starts with a startedAt timestamp and NO terminal state (outcome/finishedAt/reason null)' {
        $m = Read-ManifestJson -RunDir $run.RunDir
        $m.startedAt | Should Match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
        $m.outcome | Should Be $null
        $m.finishedAt | Should Be $null
        $m.reason | Should Be $null
    }

    It 'is UTF-8 WITHOUT a BOM (first byte is "{")' {
        $bytes = [System.IO.File]::ReadAllBytes((Get-VideoScoutManifestPath -RunDir $run.RunDir))
        $bytes[0] | Should Be 0x7B
    }

    It 'leaves no temp file behind after the atomic create' {
        @(Get-ChildItem -LiteralPath $run.RunDir -Filter 'manifest.json.tmp-*').Count | Should Be 0
    }
}

Describe 'Initialize-VideoScoutRun (optional metadata absent -> explicit nulls, still valid JSON)' {

    $run = Initialize-VideoScoutRun -BaseDir $testBase -Url 'https://example.com/v' `
        -AppliedMode 'transcript' -Route 'cli' -Model 'gemini-2.5-flash-lite' `
        -MediaResolutionRequested 'MEDIUM' -VideoScout $false
    $m = Read-ManifestJson -RunDir $run.RunDir

    It 'keeps every schema key present even when its value is unknown' {
        $names = $m.PSObject.Properties.Name
        foreach ($k in @('schemaVersion', 'runId', 'videoScout', 'url', 'videoTitle', 'requestedMode',
                'appliedMode', 'route', 'model', 'mediaResolutionRequested', 'mediaResolutionApplied',
                'startOffsetSeconds', 'endOffsetSeconds', 'startedAt', 'finishedAt', 'usage',
                'reportFile', 'outcome', 'reason')) {
            $names -contains $k | Should Be $true
        }
    }

    It 'records JSON null (not empty string) for a defaulted -Mode (requestedMode)' {
        $m.requestedMode | Should Be $null
    }

    It 'records mediaResolutionApplied as JSON null on the CLI route (requested-but-not-applied truth)' {
        $m.mediaResolutionApplied | Should Be $null
        $m.mediaResolutionRequested | Should Be 'MEDIUM'
    }

    It 'records null offsets, title, usage, and reportFile without malformed JSON' {
        $m.startOffsetSeconds | Should Be $null
        $m.endOffsetSeconds | Should Be $null
        $m.videoTitle | Should Be $null
        $m.usage | Should Be $null
        $m.reportFile | Should Be $null
    }
}

Describe 'Complete-VideoScoutRunManifest (terminal outcomes)' {

    It 'records a completed outcome with finishedAt, usage, and title -- and reason stays null' {
        $run = Initialize-VideoScoutRun -BaseDir $testBase -Url 'https://youtu.be/ok' `
            -AppliedMode 'video' -Route 'sdk' -Model 'm' -MediaResolutionRequested 'LOW' `
            -MediaResolutionApplied 'LOW' -VideoScout $true
        $usage = [ordered]@{ promptTokens = [long]100; videoTokens = [long]80; audioTokens = [long]10; textTokens = [long]10; outputTokens = [long]50; totalTokens = [long]150 }
        Complete-VideoScoutRunManifest -RunDir $run.RunDir -Manifest $run.Manifest -Outcome 'completed' `
            -Usage $usage -VideoTitle 'A Fine Video' | Out-Null
        $m = Read-ManifestJson -RunDir $run.RunDir
        $m.outcome | Should Be 'completed'
        $m.finishedAt | Should Match 'Z$'
        $m.reason | Should Be $null
        $m.usage.promptTokens | Should Be 100
        $m.usage.totalTokens | Should Be 150
        $m.videoTitle | Should Be 'A Fine Video'
    }

    It 'records a refused outcome with its sanitized reason' {
        $run = Initialize-VideoScoutRun -BaseDir $testBase -Url 'https://youtu.be/long' `
            -AppliedMode 'video' -Route 'sdk' -Model 'm' -MediaResolutionRequested 'LOW' -VideoScout $true
        Complete-VideoScoutRunManifest -RunDir $run.RunDir -Manifest $run.Manifest -Outcome 'refused' `
            -Reason "Refusing: video duration is 6873s, which exceeds the 5400s limit for mode 'video'." | Out-Null
        $m = Read-ManifestJson -RunDir $run.RunDir
        $m.outcome | Should Be 'refused'
        $m.reason | Should Match 'exceeds the 5400s limit'
    }

    It 'sanitizes an error reason to a single capped line (control chars stripped, long text truncated)' {
        $run = Initialize-VideoScoutRun -BaseDir $testBase -Url 'https://youtu.be/err' `
            -AppliedMode 'video' -Route 'cli' -Model 'm' -MediaResolutionRequested 'LOW' -VideoScout $true
        $hostile = "line1`r`nline2`tline3" + [char]0x1B + '[31mred' + ('x' * 600)
        Complete-VideoScoutRunManifest -RunDir $run.RunDir -Manifest $run.Manifest -Outcome 'error' -Reason $hostile | Out-Null
        $m = Read-ManifestJson -RunDir $run.RunDir
        $m.outcome | Should Be 'error'
        $m.reason.Contains("`n") | Should Be $false
        $m.reason.Contains([string][char]0x1B) | Should Be $false
        $m.reason | Should Match '\[truncated\]$'
        # 500 cap + the truncation marker
        ($m.reason.Length -le 512) | Should Be $true
    }

    It 'refuses a second terminal outcome (exactly-once)' {
        $run = Initialize-VideoScoutRun -BaseDir $testBase -Url 'https://youtu.be/twice' `
            -AppliedMode 'video' -Route 'sdk' -Model 'm' -MediaResolutionRequested 'LOW' -VideoScout $true
        Complete-VideoScoutRunManifest -RunDir $run.RunDir -Manifest $run.Manifest -Outcome 'completed' | Out-Null
        { Complete-VideoScoutRunManifest -RunDir $run.RunDir -Manifest $run.Manifest -Outcome 'error' -Reason 'nope' } |
            Should Throw 'already records terminal outcome'
    }

    It 'refuses an unexplained refused/error (reason is mandatory for failures)' {
        $run = Initialize-VideoScoutRun -BaseDir $testBase -Url 'https://youtu.be/noreason' `
            -AppliedMode 'video' -Route 'sdk' -Model 'm' -MediaResolutionRequested 'LOW' -VideoScout $true
        { Complete-VideoScoutRunManifest -RunDir $run.RunDir -Manifest $run.Manifest -Outcome 'error' } |
            Should Throw 'requires a reason'
    }

    It 'rejects an outcome outside completed/refused/error at bind time' {
        $run = Initialize-VideoScoutRun -BaseDir $testBase -Url 'https://youtu.be/badoutcome' `
            -AppliedMode 'video' -Route 'sdk' -Model 'm' -MediaResolutionRequested 'LOW' -VideoScout $true
        { Complete-VideoScoutRunManifest -RunDir $run.RunDir -Manifest $run.Manifest -Outcome 'running' } |
            Should Throw
    }
}

Describe 'Atomic update behavior (a partial or torn manifest is never observable)' {

    It 'leaves no temp file after a successful update' {
        $run = Initialize-VideoScoutRun -BaseDir $testBase -Url 'https://youtu.be/atomic' `
            -AppliedMode 'video' -Route 'sdk' -Model 'm' -MediaResolutionRequested 'LOW' -VideoScout $true
        Complete-VideoScoutRunManifest -RunDir $run.RunDir -Manifest $run.Manifest -Outcome 'completed' | Out-Null
        @(Get-ChildItem -LiteralPath $run.RunDir -Filter 'manifest.json.tmp-*').Count | Should Be 0
    }

    It 'on a blocked replace: throws visibly, leaves the ORIGINAL manifest intact, and cleans its temp file' {
        $run = Initialize-VideoScoutRun -BaseDir $testBase -Url 'https://youtu.be/locked' `
            -AppliedMode 'video' -Route 'sdk' -Model 'm' -MediaResolutionRequested 'LOW' -VideoScout $true
        $path = Get-VideoScoutManifestPath -RunDir $run.RunDir
        # Hold the manifest open with NO sharing so File.Replace cannot swap it -- simulates any
        # mid-update failure. The update must refuse visibly, never half-write.
        $lock = [System.IO.File]::Open($path, 'Open', 'Read', [System.IO.FileShare]::None)
        try {
            { Complete-VideoScoutRunManifest -RunDir $run.RunDir -Manifest $run.Manifest -Outcome 'completed' } |
                Should Throw 'manifest write FAILED'
        }
        finally { $lock.Dispose() }
        $m = Read-ManifestJson -RunDir $run.RunDir
        $m.outcome | Should Be $null          # original pre-update content, still valid JSON
        $m.startedAt | Should Not Be $null
        @(Get-ChildItem -LiteralPath $run.RunDir -Filter 'manifest.json.tmp-*').Count | Should Be 0
    }
}

Describe 'No secrets in the manifest (GEMINI_API_KEY redaction)' {

    It 'redacts a literal API-key value that rides an error message' {
        $saved = $env:GEMINI_API_KEY
        try {
            $env:GEMINI_API_KEY = 'AIzaFAKEKEY1234567890'
            $run = Initialize-VideoScoutRun -BaseDir $testBase -Url 'https://youtu.be/secret' `
                -AppliedMode 'video' -Route 'sdk' -Model 'm' -MediaResolutionRequested 'LOW' -VideoScout $true
            Complete-VideoScoutRunManifest -RunDir $run.RunDir -Manifest $run.Manifest -Outcome 'error' `
                -Reason "HTTP 400: API key AIzaFAKEKEY1234567890 not valid" | Out-Null
            $raw = Get-Content -LiteralPath (Get-VideoScoutManifestPath -RunDir $run.RunDir) -Raw
            $raw.Contains('AIzaFAKEKEY1234567890') | Should Be $false
            $raw.Contains('[redacted]') | Should Be $true
        }
        finally {
            if ($null -eq $saved) { Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue }
            else { $env:GEMINI_API_KEY = $saved }
        }
    }
}

Describe 'Get-SanitizedManifestText' {

    It 'returns $null for null/empty/whitespace input' {
        Get-SanitizedManifestText -Text $null | Should Be $null
        Get-SanitizedManifestText -Text '' | Should Be $null
        Get-SanitizedManifestText -Text "  `t " | Should Be $null
    }

    It 'flattens newlines/tabs to single spaces and trims' {
        Get-SanitizedManifestText -Text "  a`r`n`tb  " | Should Be 'a b'
    }

    It 'strips bidi/direction-override characters (log-spoof class)' {
        $spoof = 'abc' + [char]0x202E + 'def' + [char]0x2066 + 'ghi'
        Get-SanitizedManifestText -Text $spoof | Should Be 'abcdefghi'
    }

    It 'caps length and marks the truncation' {
        $out = Get-SanitizedManifestText -Text ('y' * 700) -MaxLength 500
        $out.Length | Should Be (500 + ' [truncated]'.Length)
        $out | Should Match '\[truncated\]$'
    }
}

Describe 'ConvertFrom-VideoScoutUsageLine' {

    It 'parses the SDK usage line into token counts' {
        $u = ConvertFrom-VideoScoutUsageLine -Lines @(
            'some analysis text',
            '[video-scout usage] prompt=1234 (video=1000 audio=100 text=134) output=500 total=1734 model=gemini-2.5-flash-lite mediaRes=LOW sliced=yes'
        )
        $u.promptTokens | Should Be 1234
        $u.videoTokens | Should Be 1000
        $u.audioTokens | Should Be 100
        $u.textTokens | Should Be 134
        $u.outputTokens | Should Be 500
        $u.totalTokens | Should Be 1734
    }

    It "maps the SDK's '?' placeholders to null fields, never fabricated numbers" {
        $u = ConvertFrom-VideoScoutUsageLine -Lines '[video-scout usage] prompt=? (video=0 audio=0 text=0) output=? total=? model=m mediaRes=LOW'
        $u.promptTokens | Should Be $null
        $u.outputTokens | Should Be $null
        $u.totalTokens | Should Be $null
        $u.videoTokens | Should Be 0
    }

    It 'returns $null when no usage line is present (usage is optional metadata)' {
        ConvertFrom-VideoScoutUsageLine -Lines @('no usage here', 'still none') | Should Be $null
        ConvertFrom-VideoScoutUsageLine -Lines $null | Should Be $null
    }

    It 'uses the LAST usage line when several appear' {
        $u = ConvertFrom-VideoScoutUsageLine -Lines @(
            '[video-scout usage] prompt=1 (video=1 audio=1 text=1) output=1 total=1 model=m mediaRes=LOW',
            '[video-scout usage] prompt=2 (video=2 audio=2 text=2) output=2 total=2 model=m mediaRes=LOW'
        )
        $u.promptTokens | Should Be 2
    }
}

Describe 'Resolve-ManifestFailureClass (anchored refusal classification)' {

    It "classifies the duration guard's 'Refusing:' messages as refused" {
        Resolve-ManifestFailureClass -Message "Refusing: video duration is 6873s, which exceeds the 5400s limit for mode 'video'." | Should Be 'refused'
    }

    It "classifies the yt-dlp backstop's 'Refused by' message as refused" {
        Resolve-ManifestFailureClass -Message 'Refused by the yt-dlp duration/live backstop: this download did not pass our own match-filter.' | Should Be 'refused'
    }

    It 'classifies everything else as error' {
        Resolve-ManifestFailureClass -Message 'Download produced no *.srt file in this run''s directory.' | Should Be 'error'
        Resolve-ManifestFailureClass -Message 'network error: fetch failed' | Should Be 'error'
    }

    It 'cannot be forged by untrusted text mid-message (anchored to the start)' {
        Resolve-ManifestFailureClass -Message 'Video titled "Refusing: everything" failed to download' | Should Be 'error'
        Resolve-ManifestFailureClass -Message ' Refusing: leading space is not our template' | Should Be 'error'
    }
}

# Plain trailing cleanup (Pester 3.4: no AfterAll). Removes ONLY the base dir this suite created.
if (Test-Path -LiteralPath $testBase) { Remove-Item -LiteralPath $testBase -Recurse -Force }
