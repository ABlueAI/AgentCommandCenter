<#
.SYNOPSIS
  Pester tests for the V4Q diagnostic-artifact verifier (get-video-scout-diagnostic-artifact.ps1):
  the independent PowerShell-side check of a preserved rejected-response file, the quality-line
  parser, the closed failure-code allowlist, and the diagnostic bounds.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\get-video-scout-diagnostic-artifact.Tests.ps1
  Pester 3.4 syntax (no BeforeAll/AfterAll), matching the other suites in this directory.

  Everything here runs against temp directories. No network, no provider call, no credentials, and
  no media. The point of the module under test is that the PARENT process never trusts node's
  self-reported artifact metadata -- so these tests exercise the mismatch cases too.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'get-video-scout-diagnostic-artifact.ps1')

$script:DiagLeaf = 'rejected-response.txt'

function New-DiagRoot {
    $p = Join-Path ([IO.Path]::GetTempPath()) ('v4q-diag-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $p -Force | Out-Null
    $p
}
function Write-Diag {
    param([string]$Dir, [string]$Text = 'rejected body', [string]$Name = 'rejected-response.txt')
    $enc = New-Object System.Text.UTF8Encoding($false)   # UTF-8, no BOM
    [System.IO.File]::WriteAllText((Join-Path $Dir $Name), $Text, $enc)
    Join-Path $Dir $Name
}

Describe 'V4Q diagnostic contract constants' {
    It 'pins the fixed leaf name, byte bound, and character bound' {
        Get-VideoScoutDiagnosticFileName | Should Be 'rejected-response.txt'
        Get-VideoScoutMaxDiagnosticBytes | Should Be (4 * 1024 * 1024)
        Get-VideoScoutMaxDiagnosticChars | Should Be 1000000
    }
    It 'declares exactly the 13 allowlisted quality-gate failure codes' {
        $codes = @(Get-VideoScoutQualityFailureCodes)
        $codes.Count | Should Be 13
        foreach ($c in @('finish-max-tokens', 'finish-not-stop', 'missing-section', 'duplicate-section',
                'scope-mismatch', 'missing-slice', 'missing-slice-audio', 'missing-speech-anchor',
                'unjustified-universal-silence', 'unsupported-synthetic-claim',
                'speculative-source-duration', 'repetitive-timestamp-filler', 'diagnostic-write-failed')) {
            ($codes -ccontains $c) | Should Be $true
        }
    }
    It 'the allowlist is CLOSED and case-sensitive' {
        (Test-VideoScoutQualityFailureCode -Code 'scope-mismatch') | Should Be $true
        (Test-VideoScoutQualityFailureCode -Code 'Scope-Mismatch') | Should Be $false
        (Test-VideoScoutQualityFailureCode -Code 'made-up-code') | Should Be $false
        (Test-VideoScoutQualityFailureCode -Code '') | Should Be $false
        (Test-VideoScoutQualityFailureCode -Code $null) | Should Be $false
    }
    It 'the bounds agree with the SDK producer (three independent copies, pinned)' {
        $sdk = Get-Content -LiteralPath (Join-Path (Split-Path $here -Parent) 'gemini-video-sdk.js') -Raw
        ($sdk -match 'MAX_DIAGNOSTIC_BYTES = 4 \* 1024 \* 1024') | Should Be $true
        ($sdk -match 'MAX_DIAGNOSTIC_CHARS = 1000000') | Should Be $true
        ($sdk -match "DIAGNOSTIC_FILENAME = 'rejected-response\.txt'") | Should Be $true
    }
}

Describe 'ConvertFrom-VideoScoutQualityLine' {
    $good = '[video-scout quality] rejected code=scope-mismatch file=rejected-response.txt bytes=1234 sha256=' + ('a' * 64)

    It 'parses a well-formed rejection line' {
        $p = ConvertFrom-VideoScoutQualityLine -Line $good
        $p | Should Not BeNullOrEmpty
        $p.Code | Should Be 'scope-mismatch'
        $p.FileName | Should Be 'rejected-response.txt'
        $p.Bytes | Should Be 1234
        $p.Sha256 | Should Be ('a' * 64)
    }
    It 'parses the write-failure shape (a code with NO artifact metadata)' {
        $p = ConvertFrom-VideoScoutQualityLine -Line '[video-scout quality] rejected code=diagnostic-write-failed'
        $p.Code | Should Be 'diagnostic-write-failed'
        $p.FileName | Should BeNullOrEmpty
        $p.Bytes | Should BeNullOrEmpty
        $p.Sha256 | Should BeNullOrEmpty
    }
    It 'accepts every allowlisted NON-write-failure code with full metadata' {
        foreach ($c in (Get-VideoScoutQualityFailureCodes | Where-Object { $_ -ne 'diagnostic-write-failed' })) {
            $line = "[video-scout quality] rejected code=$c file=rejected-response.txt bytes=1 sha256=$('b' * 64)"
            (ConvertFrom-VideoScoutQualityLine -Line $line).Code | Should Be $c
        }
    }
    It 'accepts a valid ZERO-BYTE artifact (an empty response is still evidence)' {
        # The real SHA-256 of zero bytes, computed rather than transcribed.
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try { $emptyHash = (($sha.ComputeHash([byte[]]@()) | ForEach-Object { $_.ToString('x2') }) -join '') }
        finally { $sha.Dispose() }
        $emptyHash.Length | Should Be 64
        $p = ConvertFrom-VideoScoutQualityLine -Line "[video-scout quality] rejected code=missing-section file=rejected-response.txt bytes=0 sha256=$emptyHash"
        $p | Should Not BeNullOrEmpty
        $p.Bytes | Should Be 0
        $p.Code | Should Be 'missing-section'
        $p.Sha256 | Should Be $emptyHash
    }

    # --- V4Q CORRECTION: the two shapes are MUTUALLY EXCLUSIVE ----------------------------------
    # Both forms below were previously ACCEPTED. A non-write-failure code with no metadata let a
    # real rejection that silently lost its artifact parse as if that were normal; and
    # diagnostic-write-failed carrying metadata claimed an artifact that by definition was never
    # written. Each is now refused outright.
    It 'REFUSES any non-write-failure code that carries NO artifact metadata' {
        foreach ($c in (Get-VideoScoutQualityFailureCodes | Where-Object { $_ -ne 'diagnostic-write-failed' })) {
            ConvertFrom-VideoScoutQualityLine -Line "[video-scout quality] rejected code=$c" | Should BeNullOrEmpty
        }
    }
    It 'REFUSES diagnostic-write-failed that carries artifact metadata' {
        ConvertFrom-VideoScoutQualityLine -Line ("[video-scout quality] rejected code=diagnostic-write-failed file=rejected-response.txt bytes=10 sha256=" + ('a' * 64)) | Should BeNullOrEmpty
        ConvertFrom-VideoScoutQualityLine -Line '[video-scout quality] rejected code=diagnostic-write-failed bytes=10' | Should BeNullOrEmpty
        ConvertFrom-VideoScoutQualityLine -Line '[video-scout quality] rejected code=diagnostic-write-failed file=rejected-response.txt' | Should BeNullOrEmpty
    }
    It 'REFUSES partial metadata (all three fields or none)' {
        foreach ($rest in @(
                'file=rejected-response.txt',
                'file=rejected-response.txt bytes=10',
                ('bytes=10 sha256=' + ('a' * 64)),
                ('sha256=' + ('a' * 64)),
                'bytes=10')) {
            ConvertFrom-VideoScoutQualityLine -Line "[video-scout quality] rejected code=scope-mismatch $rest" | Should BeNullOrEmpty
        }
    }
    It 'REFUSES metadata in the wrong ORDER' {
        ConvertFrom-VideoScoutQualityLine -Line ("[video-scout quality] rejected code=scope-mismatch bytes=10 file=rejected-response.txt sha256=" + ('a' * 64)) | Should BeNullOrEmpty
        ConvertFrom-VideoScoutQualityLine -Line ("[video-scout quality] rejected code=scope-mismatch sha256=" + ('a' * 64) + ' file=rejected-response.txt bytes=10') | Should BeNullOrEmpty
    }
    It 'REFUSES wrong CASE in the field names or the code' {
        ConvertFrom-VideoScoutQualityLine -Line ("[video-scout quality] rejected code=scope-mismatch File=rejected-response.txt Bytes=10 SHA256=" + ('a' * 64)) | Should BeNullOrEmpty
        ConvertFrom-VideoScoutQualityLine -Line ("[video-scout quality] rejected code=SCOPE-MISMATCH file=rejected-response.txt bytes=10 sha256=" + ('a' * 64)) | Should BeNullOrEmpty
    }
    It 'REFUSES an EXTRA field even when every required field is well formed' {
        ConvertFrom-VideoScoutQualityLine -Line ("[video-scout quality] rejected code=scope-mismatch file=rejected-response.txt bytes=10 sha256=" + ('a' * 64) + ' kind=quality-rejected-response') | Should BeNullOrEmpty
    }
    It 'returns $null for an ordinary report or log line (never a false positive)' {
        foreach ($l in @('## 1. TL;DR something', '[video-scout usage] prompt=10 output=5',
                '[video-scout sdk] analyzing https://youtu.be/x', '', $null, '   ')) {
            ConvertFrom-VideoScoutQualityLine -Line $l | Should BeNullOrEmpty
        }
    }
    It 'REFUSES a code outside the allowlist' {
        ConvertFrom-VideoScoutQualityLine -Line '[video-scout quality] rejected code=made-up-code' | Should BeNullOrEmpty
        ConvertFrom-VideoScoutQualityLine -Line ('[video-scout quality] rejected code=made-up file=rejected-response.txt bytes=1 sha256=' + ('a' * 64)) | Should BeNullOrEmpty
    }
    It 'REFUSES a non-canonical leaf name (the filename is ours, never the providers)' {
        ConvertFrom-VideoScoutQualityLine -Line ('[video-scout quality] rejected code=scope-mismatch file=evil.txt bytes=1 sha256=' + ('a' * 64)) | Should BeNullOrEmpty
        ConvertFrom-VideoScoutQualityLine -Line ('[video-scout quality] rejected code=scope-mismatch file=..\rejected-response.txt bytes=1 sha256=' + ('a' * 64)) | Should BeNullOrEmpty
    }
    It 'REFUSES a malformed byte count or hash' {
        ConvertFrom-VideoScoutQualityLine -Line ('[video-scout quality] rejected code=scope-mismatch file=rejected-response.txt bytes=ten sha256=' + ('a' * 64)) | Should BeNullOrEmpty
        ConvertFrom-VideoScoutQualityLine -Line '[video-scout quality] rejected code=scope-mismatch file=rejected-response.txt bytes=1 sha256=abc' | Should BeNullOrEmpty
        ConvertFrom-VideoScoutQualityLine -Line ('[video-scout quality] rejected code=scope-mismatch file=rejected-response.txt bytes=1 sha256=' + ('A' * 64)) | Should BeNullOrEmpty
    }
    It 'REFUSES trailing junk after the metadata (exact shape only)' {
        ConvertFrom-VideoScoutQualityLine -Line ($good + ' extra=1') | Should BeNullOrEmpty
    }
}

Describe 'Get-VideoScoutDiagnosticArtifact -- happy path and identity' {
    $root = New-DiagRoot
    try {
        $text = 'rejected body with unicode: cafe' + [char]0x00E9
        [void](Write-Diag -Dir $root -Text $text)
        $a = Get-VideoScoutDiagnosticArtifact -RunDir $root

        It 'returns exactly the schema-v4 diagnosticArtifacts entry shape' {
            (@($a.PSObject.Properties.Name) -join ',') | Should Be 'kind,fileName,bytes,sha256'
            $a.kind | Should Be 'quality-rejected-response'
            $a.fileName | Should Be 'rejected-response.txt'
        }
        It 'measures the byte count from disk (UTF-8, no BOM)' {
            $expected = ([System.Text.Encoding]::UTF8.GetBytes($text)).Length
            $a.bytes | Should Be $expected
            $bytes = [System.IO.File]::ReadAllBytes((Join-Path $root $script:DiagLeaf))
            ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) | Should Be $false
        }
        It 'computes a SHA-256 that matches an INDEPENDENT hasher' {
            $a.sha256 | Should Be ((Get-FileHash -LiteralPath (Join-Path $root $script:DiagLeaf) -Algorithm SHA256).Hash.ToLower())
            $a.sha256 | Should Match '^[0-9a-f]{64}$'
        }
        It 'never returns the diagnostic CONTENT' {
            ($a | ConvertTo-Json -Depth 5) | Should Not Match 'rejected body'
        }
        It 'is idempotent (verification never mutates the artifact)' {
            $b = Get-VideoScoutDiagnosticArtifact -RunDir $root
            $b.sha256 | Should Be $a.sha256
            $b.bytes | Should Be $a.bytes
        }
    }
    finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue } }
}

Describe 'V4Q: a ZERO-BYTE diagnostic is valid evidence, verified and hashed like any other' {
    # An empty provider response is still a billed response. The corrected SDK lifecycle preserves it
    # as a zero-byte artifact rather than exiting early, so the verifier must accept and hash it.
    $root = New-DiagRoot
    try {
        [System.IO.File]::WriteAllBytes((Join-Path $root $script:DiagLeaf), [byte[]]@())
        $a = Get-VideoScoutDiagnosticArtifact -RunDir $root

        It 'verifies a zero-byte artifact instead of refusing it' {
            $a | Should Not BeNullOrEmpty
            $a.kind | Should Be 'quality-rejected-response'
            $a.fileName | Should Be 'rejected-response.txt'
        }
        It 'reports bytes = 0' {
            $a.bytes | Should Be 0
        }
        It 'hashes it, and the hash matches an INDEPENDENT hasher' {
            $a.sha256 | Should Match '^[0-9a-f]{64}$'
            $a.sha256 | Should Be ((Get-FileHash -LiteralPath (Join-Path $root $script:DiagLeaf) -Algorithm SHA256).Hash.ToLower())
        }
        It 'a zero-byte artifact is trivially valid UTF-8 and inside both bounds' {
            $a.bytes -le (Get-VideoScoutMaxDiagnosticBytes) | Should Be $true
            $a.bytes -le (Get-VideoScoutMaxDiagnosticChars) | Should Be $true
        }
        It 'the resulting entry is accepted by the schema-v4 manifest contract' {
            . (Join-Path $here 'video-scout-manifest-schema.ps1')
            $m = New-VideoScoutLiveManifest -RunId 'r' -Url 'u' -AppliedMode 'video' -Route 'sdk' `
                -Model 'gemini-2.5-pro' -MediaResolutionRequested 'MEDIUM' -VideoScout $true -StartOffset 60 -EndOffset 75
            $m.outcome = 'error'
            $m.reason = '[quality:missing-section] the provider returned an empty response'
            $m.finishedAt = '2026-07-28T00:00:00.000Z'
            $m.diagnosticArtifacts = @([ordered]@{ kind = $a.kind; fileName = $a.fileName; sha256 = $a.sha256; bytes = $a.bytes })
            { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
            $m.reportFile | Should BeNullOrEmpty
        }
    }
    finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue } }
}

Describe 'Get-VideoScoutDiagnosticArtifact -- refusals (fail closed)' {

    It 'refuses a missing run directory' {
        { Get-VideoScoutDiagnosticArtifact -RunDir (Join-Path ([IO.Path]::GetTempPath()) 'v4q-nope-does-not-exist') } |
            Should Throw 'does not exist'
    }
    It 'refuses when no diagnostic is present' {
        $root = New-DiagRoot
        try { { Get-VideoScoutDiagnosticArtifact -RunDir $root } | Should Throw 'is not present' }
        finally { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
    }
    It 'refuses a DIRECTORY masquerading as the diagnostic file' {
        $root = New-DiagRoot
        try {
            New-Item -ItemType Directory -Path (Join-Path $root $script:DiagLeaf) -Force | Out-Null
            { Get-VideoScoutDiagnosticArtifact -RunDir $root } | Should Throw
        }
        finally { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
    }
    It 'refuses content that is not valid UTF-8 (a mojibaked artifact is not evidence)' {
        $root = New-DiagRoot
        try {
            # 0xFF 0xFE is not a legal UTF-8 sequence.
            [System.IO.File]::WriteAllBytes((Join-Path $root $script:DiagLeaf), [byte[]](0x41, 0xFF, 0xFE, 0x42))
            { Get-VideoScoutDiagnosticArtifact -RunDir $root } | Should Throw 'not valid UTF-8'
        }
        finally { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
    }
    It 'refuses an over-bound artifact by BYTE count' {
        $root = New-DiagRoot
        try {
            $big = New-Object byte[] ((Get-VideoScoutMaxDiagnosticBytes) + 1)
            for ($i = 0; $i -lt $big.Length; $i++) { $big[$i] = 0x41 }
            [System.IO.File]::WriteAllBytes((Join-Path $root $script:DiagLeaf), $big)
            { Get-VideoScoutDiagnosticArtifact -RunDir $root } | Should Throw 'exceeds the'
        }
        finally { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
    }
    It 'refuses an over-bound artifact by DECODED CHARACTER count' {
        # The character bound is the BINDING constraint in practice: any artifact large enough to
        # breach the 4 MiB byte bound has already breached 1,000,000 decoded characters. The byte
        # check is a deliberate defence-in-depth backstop that keeps the guarantee if either
        # constant is ever retuned independently.
        ((Get-VideoScoutMaxDiagnosticChars) * 3 -le (Get-VideoScoutMaxDiagnosticBytes)) | Should Be $true
        $root = New-DiagRoot
        try {
            $over = New-Object byte[] ((Get-VideoScoutMaxDiagnosticChars) + 1)
            for ($i = 0; $i -lt $over.Length; $i++) { $over[$i] = 0x41 }
            [System.IO.File]::WriteAllBytes((Join-Path $root $script:DiagLeaf), $over)
            { Get-VideoScoutDiagnosticArtifact -RunDir $root } | Should Throw 'decoded characters exceeds'
        }
        finally { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
    }
    It 'accepts an artifact exactly AT the character bound (inclusive)' {
        $root = New-DiagRoot
        try {
            $exact = New-Object byte[] (Get-VideoScoutMaxDiagnosticChars)
            for ($i = 0; $i -lt $exact.Length; $i++) { $exact[$i] = 0x41 }
            [System.IO.File]::WriteAllBytes((Join-Path $root $script:DiagLeaf), $exact)
            (Get-VideoScoutDiagnosticArtifact -RunDir $root).bytes | Should Be (Get-VideoScoutMaxDiagnosticChars)
        }
        finally { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
    }
    It 'reads ONLY the fixed leaf -- an alternate filename in the same directory is ignored' {
        $root = New-DiagRoot
        try {
            [void](Write-Diag -Dir $root -Text 'decoy' -Name 'rejected-response.txt.bak')
            [void](Write-Diag -Dir $root -Text 'evil' -Name 'analysis-output.txt')
            { Get-VideoScoutDiagnosticArtifact -RunDir $root } | Should Throw 'is not present'
        }
        finally { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
    }
    It 'refuses a NESTED diagnostic (direct-child containment only)' {
        $root = New-DiagRoot
        try {
            $nested = Join-Path $root 'inner'
            New-Item -ItemType Directory -Path $nested -Force | Out-Null
            [void](Write-Diag -Dir $nested)
            { Get-VideoScoutDiagnosticArtifact -RunDir $root } | Should Throw 'is not present'
        }
        finally { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
    }
    It 'a traversal-style run directory resolves and still verifies only its own direct child' {
        $root = New-DiagRoot
        try {
            $inner = Join-Path $root 'run'
            New-Item -ItemType Directory -Path $inner -Force | Out-Null
            [void](Write-Diag -Dir $inner -Text 'inner body')
            [void](Write-Diag -Dir $root -Text 'outer body')
            $viaTraversal = Join-Path (Join-Path $inner '..') 'run'
            $a = Get-VideoScoutDiagnosticArtifact -RunDir $viaTraversal
            $a.sha256 | Should Be ((Get-FileHash -LiteralPath (Join-Path $inner $script:DiagLeaf) -Algorithm SHA256).Hash.ToLower())
        }
        finally { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
    }
    It 'refuses a REPARSE POINT diagnostic (a junction could redirect the read outside the run dir)' {
        $root = New-DiagRoot
        try {
            $outside = New-DiagRoot
            try {
                [void](Write-Diag -Dir $outside -Text 'somewhere else entirely')
                # A directory junction named like the diagnostic leaf: Get-Item sees a reparse point.
                $link = Join-Path $root $script:DiagLeaf
                & cmd /c mklink /J "$link" "$outside" 2>&1 | Out-Null
                if (Test-Path -LiteralPath $link) {
                    { Get-VideoScoutDiagnosticArtifact -RunDir $root } | Should Throw
                }
                else {
                    # Junction creation unsupported in this environment: assert the guard exists.
                    $src = Get-Content -LiteralPath (Join-Path $here 'get-video-scout-diagnostic-artifact.ps1') -Raw
                    ($src -match 'ReparsePoint') | Should Be $true
                }
            }
            finally { Remove-Item -LiteralPath $outside -Recurse -Force -ErrorAction SilentlyContinue }
        }
        finally { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

Describe 'V4Q verifier catches a MISMATCH between the SDK claim and the artifact on disk' {
    $root = New-DiagRoot
    try {
        [void](Write-Diag -Dir $root -Text 'the real preserved body')
        $a = Get-VideoScoutDiagnosticArtifact -RunDir $root
        # This is exactly the comparison feed-gemini.ps1 performs before recording a manifest entry.
        $claimed = ConvertFrom-VideoScoutQualityLine -Line ("[video-scout quality] rejected code=scope-mismatch file=rejected-response.txt bytes=999999 sha256=" + ('c' * 64))

        It 'the independently measured identity does NOT match a false claim' {
            ([int64]$a.bytes -eq [int64]$claimed.Bytes) | Should Be $false
            ($a.sha256 -ceq $claimed.Sha256) | Should Be $false
        }
        It 'the independently measured identity DOES match a truthful claim' {
            $truth = ConvertFrom-VideoScoutQualityLine -Line ("[video-scout quality] rejected code=scope-mismatch file=rejected-response.txt bytes=$($a.bytes) sha256=$($a.sha256)")
            ([int64]$a.bytes -eq [int64]$truth.Bytes) | Should Be $true
            ($a.sha256 -ceq $truth.Sha256) | Should Be $true
        }
    }
    finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue } }
}

Describe 'V4Q verifier makes no network, provider, or credential access' {
    It 'the module source contains no network, credential, or provider call' {
        # Match on real API surface, not on English words: the file's own comments legitimately
        # discuss credentials and the provider, and a prose match would be a meaningless assertion.
        $src = Get-Content -LiteralPath (Join-Path $here 'get-video-scout-diagnostic-artifact.ps1') -Raw
        ($src -match 'Invoke-WebRequest|Invoke-RestMethod|System\.Net\.|New-Object Net\.|curl\.exe|generativelanguage') | Should Be $false
        ($src -match '\$env:GEMINI_API_KEY|safeStorage') | Should Be $false
        ($src -match 'Invoke-Expression|\biex\b') | Should Be $false
        ($src -match 'Start-Process|cmd /c|& node|powershell\.exe') | Should Be $false
    }
    It 'it never deletes, moves, or rewrites anything (verification is read-only)' {
        $src = Get-Content -LiteralPath (Join-Path $here 'get-video-scout-diagnostic-artifact.ps1') -Raw
        ($src -match 'Remove-Item|\[IO\.File\]::Delete|\[System\.IO\.File\]::Delete') | Should Be $false
        ($src -match 'Move-Item|\[System\.IO\.File\]::Move|WriteAllText|WriteAllBytes') | Should Be $false
    }
}
