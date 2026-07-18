<#
.SYNOPSIS
  Pester tests for the V5b1 bounded streaming report collector (get-bounded-report.ps1).
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\get-bounded-report.Tests.ps1
  Exercises the real exported functions: empty/ordinary/multiline/Unicode/HTML-like content, the
  limit-1/exact/limit+1 boundary, a surrogate pair crossing the cut, beginning-retained + marker,
  bounded retained memory as total grows, and counts-only diagnostics.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'get-bounded-report.ps1')

# Feed a collector an array of lines (as the ForEach-Object streaming loop does), return the result.
function Invoke-Collect {
    param([string[]]$Lines, [int]$Limit = 1000000)
    $c = New-BoundedReportCollector -Limit $Limit
    foreach ($l in $Lines) { Add-BoundedReportLine -Collector $c -Line $l }
    Complete-BoundedReport -Collector $c
}

Describe 'Bounded report collector (ordinary content)' {
    It 'returns empty text and zero counts for no input' {
        $r = Invoke-Collect -Lines @()
        $r.Text | Should Be ''
        $r.TotalChars | Should Be 0
        $r.PersistedChars | Should Be 0
        $r.Truncated | Should Be $false
    }
    It 'reconstructs a single line with a trailing newline' {
        $r = Invoke-Collect -Lines @('hello world')
        $r.Text | Should Be "hello world`n"
        $r.TotalChars | Should Be 12   # 11 + 1 newline
        $r.Truncated | Should Be $false
    }
    It 'reconstructs multiline content in order, joined by newlines' {
        $r = Invoke-Collect -Lines @('line 1', 'line 2', 'line 3')
        $r.Text | Should Be "line 1`nline 2`nline 3`n"
        $r.Truncated | Should Be $false
    }
    It 'preserves intentional blank lines' {
        $r = Invoke-Collect -Lines @('a', '', 'b')
        $r.Text | Should Be "a`n`nb`n"
    }
    It 'preserves Unicode content byte-for-byte' {
        # Build non-ASCII from code points so this .ps1 file stays pure ASCII (PS 5.1 mis-decodes a
        # BOM-less UTF-8 source, which can break string parsing) -- assert against the same values.
        $emoji = [char]::ConvertFromUtf32(0x1F3A5)          # movie camera
        $cjk = [string]([char]0x65E5) + [char]0x672C + [char]0x8A9E   # nihongo
        $emdash = [char]0x2014
        $l1 = 'naive cafe ' + $emoji + ' ' + $cjk
        $l2 = 'emoji ' + $emdash + ' dash'
        $r = Invoke-Collect -Lines @($l1, $l2)
        $r.Text | Should Be ($l1 + "`n" + $l2 + "`n")
        $r.Truncated | Should Be $false
    }
    It 'does not interpret or strip embedded HTML/script-like model text' {
        $hostile = '<script>alert(1)</script> <img src=x onerror=y> & <b>bold</b>'
        $r = Invoke-Collect -Lines @($hostile)
        $r.Text | Should Be ($hostile + "`n")   # stored verbatim; not sanitized/rendered/executed
    }
}

Describe 'Bounded report collector (limit boundary)' {
    # Limit 1000 (comfortably larger than the ~200-char marker reserve, like the real 1,000,000 limit).
    # One line of N chars costs N+1 (the reconstructed newline).
    It 'limit minus one: everything kept, not truncated' {
        $r = Invoke-Collect -Lines @(('x' * 998)) -Limit 1000   # 998 + 1 = 999 < 1000
        $r.PersistedChars | Should Be 999
        $r.TotalChars | Should Be 999
        $r.Truncated | Should Be $false
    }
    It 'exactly the limit: everything kept, not truncated' {
        $r = Invoke-Collect -Lines @(('x' * 999)) -Limit 1000   # 999 + 1 = 1000 == limit
        $r.PersistedChars | Should Be 1000
        $r.TotalChars | Should Be 1000
        $r.Truncated | Should Be $false
    }
    It 'limit plus one: truncated, persisted within the cap, availability counted' {
        $r = Invoke-Collect -Lines @(('x' * 1000)) -Limit 1000   # 1000 + 1 = 1001 > limit
        $r.Truncated | Should Be $true
        $r.TotalChars | Should Be 1001
        ($r.PersistedChars -le 1000) | Should Be $true
    }
    It 'keeps the BEGINNING of oversized output and appends a marker within the cap' {
        # limit 300 so the marker (~100 chars) fits after the reserved backoff.
        $big = 'A' * 1000
        $r = Invoke-Collect -Lines @($big) -Limit 300
        $r.Truncated | Should Be $true
        ($r.PersistedChars -le 300) | Should Be $true
        $r.Text.StartsWith('AAAA') | Should Be $true                 # beginning retained
        ($r.Text -match 'report truncated') | Should Be $true         # explicit marker present
        $r.TotalChars | Should Be 1001
    }
    It 'slices a single enormous line immediately rather than buffering it whole' {
        # Retained builder length must stay bounded by the limit even though the input line is huge.
        $c = New-BoundedReportCollector -Limit 500
        Add-BoundedReportLine -Collector $c -Line ('Z' * 5000000)
        $c.Builder.Length -le 500 | Should Be $true                  # never copied whole into the buffer
        $c.Total | Should Be 5000001
        $c.Truncated | Should Be $true
    }
}

Describe 'Bounded report collector (surrogate safety)' {
    It 'never splits a surrogate pair at the cut (drops the stranded high half)' {
        # Fill to exactly the limit, then the last kept unit would be a high surrogate whose low half
        # is cut off. Build a line: (limit-1) filler 'a' + an emoji 😀 (2 units) so the newline+emoji
        # straddle the cut.
        $limit = 10
        # line of 9 'a' -> chunk 'aaaaaaaaa' + emoji... construct so cut lands mid-pair.
        $line = ('a' * 9) + [char]::ConvertFromUtf32(0x1F600)   # 9 + 2 = 11 chars, + newline = 12
        $c = New-BoundedReportCollector -Limit $limit
        Add-BoundedReportLine -Collector $c -Line $line
        $kept = $c.Builder.ToString()
        # The cut at 10 would keep 'aaaaaaaaa' + high-surrogate; the high surrogate must be dropped.
        $kept | Should Be ('a' * 9)
        $last = [int]$kept[$kept.Length - 1]
        ($last -ge 0xD800 -and $last -le 0xDBFF) | Should Be $false   # no dangling high surrogate
    }
    It 'keeps an emoji intact when the cut lands on the pair boundary' {
        $emoji = [char]::ConvertFromUtf32(0x1F600)                    # 2 units
        $line = ('a' * 8) + $emoji                                    # 8 + 2 = 10, + newline = 11
        $c = New-BoundedReportCollector -Limit 10
        Add-BoundedReportLine -Collector $c -Line $line
        $c.Builder.ToString() | Should Be (('a' * 8) + $emoji)        # full pair kept, newline cut off
    }
}

Describe 'Bounded report collector (bounded memory + counts-only diagnostics)' {
    It 'retained memory stays bounded as total input grows far beyond the limit' {
        $c = New-BoundedReportCollector -Limit 1000
        for ($i = 0; $i -lt 100000; $i++) { Add-BoundedReportLine -Collector $c -Line ('line ' + $i) }
        $c.Builder.Length -le 1000 | Should Be $true                  # never grows past the limit
        ($c.Total -gt 1000000) | Should Be $true                      # but total is counted numerically
        $c.Truncated | Should Be $true
    }
    It 'the result exposes numeric counts a caller can log without the report text' {
        $r = Invoke-Collect -Lines @('secret analysis text the caller must never log') -Limit 5
        ($r.PSObject.Properties.Name | Sort-Object) -join ',' | Should Be 'PersistedChars,Text,TotalChars,Truncated'
        ($r.TotalChars -is [long] -or $r.TotalChars -is [int]) | Should Be $true
        ($r.PersistedChars -is [int] -or $r.PersistedChars -is [long]) | Should Be $true
        # A diagnostic built from the counts carries no report text.
        $diag = "runId=X persisted=$($r.PersistedChars) available=$($r.TotalChars) truncated=$($r.Truncated)"
        ($diag -match 'secret analysis text') | Should Be $false
    }
}
