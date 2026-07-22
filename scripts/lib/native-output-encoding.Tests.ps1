<#
.SYNOPSIS
  V5b1 content acceptance (FAIL 2): EXECUTION test that native provider stdout is decoded correctly
  at the Windows PowerShell 5.1 boundary, so the persisted report holds the EXACT U+2013 / U+2014
  code points (not mojibake).
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\native-output-encoding.Tests.ps1

  This is a REAL native-boundary test: it runs actual node.exe emitting UTF-8 en/em dashes, captures
  it through the PRODUCTION bounded collector (get-bounded-report.ps1), persists it through the
  PRODUCTION create-only writer (write-video-scout-report.ps1), then reads the file back as UTF-8 and
  asserts the exact code points. The PowerShell .ps1 stubs used by the behavioral lifecycle suite run
  in-process and therefore CANNOT exercise the byte-decode boundary -- only a real external process
  can, which is why this suite exists separately.

  It forces [Console]::OutputEncoding = CP437 to faithfully simulate the app PTY's legacy OEM console
  (where the bug was found: UTF-8 0xE2 0x80 0x93 decoded as CP437 -> U+0393 U+00C7 U+00F4). A control
  case (no fix) proves the mojibake reproduces -- so a regression that dropped the fix would fail this
  suite -- and the fixed case uses the exact production pattern (New-NativeOutputEncoding scoped around
  the capture, restored in finally). No network, no paid call.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'get-native-output-encoding.ps1')
. (Join-Path $here 'get-bounded-report.ps1')
. (Join-Path $here 'write-video-scout-report.ps1')

# Code points built numerically so THIS test file stays plain ASCII.
$en = [char]0x2013   # EN DASH
$em = [char]0x2014   # EM DASH
# UTF-8 en dash (0xE2 0x80 0x93) mis-decoded as CP437 becomes these three code points:
$mojibakeEn = ([char]0x0393).ToString() + ([char]0x00C7) + ([char]0x00F4)

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCmd) { $nodeCmd.Source } else { $null }

# A node script that emits real UTF-8 en/em dashes. String.fromCharCode keeps THIS file ASCII-only;
# node produces the genuine multi-byte UTF-8 sequences on stdout.
$nodeScriptPath = Join-Path ([System.IO.Path]::GetTempPath()) ("nativeenc-{0}.js" -f ([guid]::NewGuid().ToString('N')))
if ($nodeExe) {
    $js = 'process.stdout.write("## 1. TL;DR\n");' + "`n" +
          'process.stdout.write("[00:00:00" + String.fromCharCode(0x2013) + "00:00:07] " + String.fromCharCode(0x2014) + " intro\n");'
    [System.IO.File]::WriteAllText($nodeScriptPath, $js, (New-Object System.Text.ASCIIEncoding))
}

function Test-ContainsByteSequence {
    param([byte[]]$Haystack, [byte[]]$Needle)
    if (-not $Haystack -or $Haystack.Length -lt $Needle.Length) { return $false }
    for ($i = 0; $i -le ($Haystack.Length - $Needle.Length); $i++) {
        $match = $true
        for ($j = 0; $j -lt $Needle.Length; $j++) {
            if ($Haystack[$i + $j] -ne $Needle[$j]) { $match = $false; break }
        }
        if ($match) { return $true }
    }
    return $false
}

function Invoke-EncodedCapture {
    # Simulate the broken OEM console (CP437), run real node through the production collector + writer,
    # optionally applying the production UTF-8 scoping fix, then ALWAYS restore the real default so the
    # Should assertions (and the rest of the Pester run) execute under normal encoding.
    param([switch]$ApplyFix)
    $realDefault = [Console]::OutputEncoding
    $runDir = Join-Path ([System.IO.Path]::GetTempPath()) ("nativeenc-run-{0}" -f ([guid]::NewGuid().ToString('N')))
    New-Item -ItemType Directory -Path $runDir -Force | Out-Null
    $streamed = $null; $encAfterScope = $null; $fileText = $null; $fileBytes = $null
    try {
        [Console]::OutputEncoding = [System.Text.Encoding]::GetEncoding(437)
        $collector = New-BoundedReportCollector
        if ($ApplyFix) {
            # EXACT production pattern from feed-gemini.ps1.
            $prevOutputEncoding = [Console]::OutputEncoding
            try {
                [Console]::OutputEncoding = New-NativeOutputEncoding
                $streamed = & $nodeExe $nodeScriptPath | ForEach-Object {
                    $line = [string]$_
                    Add-BoundedReportLine -Collector $collector -Line $line
                    $line
                }
            }
            finally {
                [Console]::OutputEncoding = $prevOutputEncoding
            }
            # Prove the scoped restore returned the PREVIOUS (OEM) encoding, not the process default.
            $encAfterScope = [Console]::OutputEncoding.CodePage
        }
        else {
            $streamed = & $nodeExe $nodeScriptPath | ForEach-Object {
                $line = [string]$_
                Add-BoundedReportLine -Collector $collector -Line $line
                $line
            }
            $encAfterScope = [Console]::OutputEncoding.CodePage
        }
        $report = Complete-BoundedReport -Collector $collector
        $reportName = Write-VideoScoutReportFile -RunDir $runDir -Text $report.Text
        $fileBytes = [System.IO.File]::ReadAllBytes((Join-Path $runDir $reportName))
        $fileText = [System.Text.Encoding]::UTF8.GetString($fileBytes)
    }
    finally {
        [Console]::OutputEncoding = $realDefault
        Remove-Item -LiteralPath $runDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    [PSCustomObject]@{
        Streamed      = ($streamed -join "`n")
        FileText      = $fileText
        FileBytes     = $fileBytes
        EncAfterScope = $encAfterScope
    }
}

Describe 'V5b1 native-output decoding (FAIL 2, real node execution)' {

    if (-not $nodeExe) {
        It 'requires node on PATH to run the native-output encoding execution test' {
            # Visible failure, not a silent skip: this suite must exercise the real native boundary.
            $nodeExe | Should Not BeNullOrEmpty
        }
        return
    }

    Context 'control: no fix under a CP437 console reproduces the live mojibake' {
        $noFix = Invoke-EncodedCapture
        It 'persists mojibake (proving the bug, and that this test would catch a regression)' {
            $noFix.FileText.Contains($mojibakeEn) | Should Be $true
            $noFix.FileText.Contains($en) | Should Be $false
        }
    }

    Context 'fixed: scoped UTF-8 (no BOM) around the native capture (production pattern)' {
        $fixed = Invoke-EncodedCapture -ApplyFix

        It 'persists a report that decodes back to the EXACT U+2013 and U+2014 code points' {
            $fixed.FileText.Contains($en) | Should Be $true
            $fixed.FileText.Contains($em) | Should Be $true
            $fixed.FileText.Contains($mojibakeEn) | Should Be $false
        }
        It 'writes the exact UTF-8 bytes for U+2013 (E2 80 93) and U+2014 (E2 80 94), no BOM' {
            ($fixed.FileBytes[0] -eq 0xEF -and $fixed.FileBytes[1] -eq 0xBB -and $fixed.FileBytes[2] -eq 0xBF) | Should Be $false
            (Test-ContainsByteSequence -Haystack $fixed.FileBytes -Needle ([byte[]]@(0xE2, 0x80, 0x93))) | Should Be $true
            (Test-ContainsByteSequence -Haystack $fixed.FileBytes -Needle ([byte[]]@(0xE2, 0x80, 0x94))) | Should Be $true
        }
        It 'streams the correct code points to the pane as well' {
            $fixed.Streamed.Contains($en) | Should Be $true
            $fixed.Streamed.Contains($em) | Should Be $true
            $fixed.Streamed.Contains($mojibakeEn) | Should Be $false
        }
        It 'restores the PREVIOUS (OEM CP437) console encoding after the scoped block' {
            $fixed.EncAfterScope | Should Be 437
        }
    }
}

Describe 'V5b1 native-output decoding: feed-gemini.ps1 source wiring' {
    $feedGemini = Join-Path (Split-Path $here -Parent) 'feed-gemini.ps1'
    $src = Get-Content -LiteralPath $feedGemini -Raw -Encoding UTF8

    It 'dot-sources the shared native-output encoding helper' {
        $src | Should Match 'get-native-output-encoding\.ps1'
    }
    It 'scopes UTF-8 output encoding around BOTH native captures (SDK + CLI)' {
        ([regex]::Matches($src, '\[Console\]::OutputEncoding = New-NativeOutputEncoding')).Count | Should Be 2
    }
    It 'restores the previous console encoding in a finally on BOTH routes' {
        ([regex]::Matches($src, '\[Console\]::OutputEncoding = \$prevOutputEncoding')).Count | Should Be 2
    }
    It 'sets UTF-8 encoding BEFORE invoking node on the SDK route' {
        $setIdx  = $src.IndexOf('[Console]::OutputEncoding = New-NativeOutputEncoding')
        $nodeIdx = $src.IndexOf('& node $sdkScript')
        ($setIdx -gt 0 -and $nodeIdx -gt $setIdx) | Should Be $true
    }
}

# --- trailing cleanup (Pester 3.4 pattern) ---------------------------------------------------------
if (Test-Path -LiteralPath $nodeScriptPath) { Remove-Item -LiteralPath $nodeScriptPath -Force -ErrorAction SilentlyContinue }
