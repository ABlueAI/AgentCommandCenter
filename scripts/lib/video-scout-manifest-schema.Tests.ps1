<#
.SYNOPSIS
  Pester tests for the SHARED manifest schema (video-scout-manifest-schema.ps1): the single canonical
  key set/order, the live and backfill constructors, and the variant-aware validator that is the
  drift gate both writers call before persisting JSON.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\video-scout-manifest-schema.Tests.ps1
  Pester 3.4 syntax (no BeforeAll/AfterAll), matching the other suites in this directory.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'video-scout-manifest-schema.ps1')

$expectedCanonicalKeys = @(
    'schemaVersion', 'runId', 'videoScout', 'url', 'videoTitle', 'requestedMode', 'appliedMode',
    'route', 'model', 'mediaResolutionRequested', 'mediaResolutionApplied', 'startOffsetSeconds',
    'endOffsetSeconds', 'startedAt', 'finishedAt', 'usage', 'reportFile', 'outcome', 'reason'
)

Describe 'Canonical key set (single source of truth)' {

    It 'exposes the exact canonical keys in the documented order' {
        $keys = @(Get-VideoScoutManifestCanonicalKeys)
        ($keys -join ',') | Should Be ($expectedCanonicalKeys -join ',')
    }

    It 'has schemaVersion 1 and every other key null in the base skeleton' {
        $b = New-VideoScoutManifestBase
        $b.schemaVersion | Should Be 1
        foreach ($k in $expectedCanonicalKeys) {
            if ($k -ne 'schemaVersion') { $b[$k] | Should Be $null }
        }
    }
}

Describe 'New-VideoScoutLiveManifest (ground-truth variant)' {

    $m = New-VideoScoutLiveManifest -RunId 'run-live-1' -Url 'https://youtu.be/abc' `
        -RequestedMode 'video' -AppliedMode 'video' -Route 'sdk' -Model 'gemini-2.5-flash-lite' `
        -MediaResolutionRequested 'LOW' -MediaResolutionApplied 'LOW' -VideoScout $true `
        -StartOffset 120 -EndOffset 240

    It 'produces EXACTLY the canonical keys and NO backfill key' {
        ((@($m.Keys)) -join ',') | Should Be ($expectedCanonicalKeys -join ',')
        ($m.Keys -contains 'backfill') | Should Be $false
    }

    It 'records a real startedAt (UTC ms) and leaves terminal state null' {
        $m.startedAt | Should Match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
        $m.outcome | Should Be $null
        $m.finishedAt | Should Be $null
    }

    It 'sanitizes url and model and preserves route/modes/offsets' {
        $m.url | Should Be 'https://youtu.be/abc'
        $m.model | Should Be 'gemini-2.5-flash-lite'
        $m.route | Should Be 'sdk'
        $m.appliedMode | Should Be 'video'
        $m.startOffsetSeconds | Should Be 120
        $m.endOffsetSeconds | Should Be 240
        $m.videoScout | Should Be $true
    }

    It 'validates clean through the shared validator' {
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
    }
}

Describe 'New-VideoScoutBackfillManifest (approximate/provenance variant)' {

    $b = New-VideoScoutBackfillManifest -RunId 'run-20260715-011043-123-4567-ab12cd34' `
        -AppliedMode 'audio' -VideoTitle 'Some Talk' -StartedAtFromDirNameLocal '2026-07-15T01:10:43.123'

    It 'adds a backfill key on top of the canonical keys (discriminator present only here)' {
        ((@($b.Keys)) -join ',') | Should Be (($expectedCanonicalKeys + 'backfill') -join ',')
    }

    It 'keeps canonical startedAt and every unprovable run fact null' {
        $b.startedAt | Should Be $null
        $b.finishedAt | Should Be $null
        $b.outcome | Should Be $null
        $b.reason | Should Be $null
        $b.usage | Should Be $null
        $b.url | Should Be $null
        $b.model | Should Be $null
        $b.requestedMode | Should Be $null
        $b.mediaResolutionRequested | Should Be $null
        $b.mediaResolutionApplied | Should Be $null
        $b.startOffsetSeconds | Should Be $null
        $b.endOffsetSeconds | Should Be $null
        $b.reportFile | Should Be $null
        $b.videoScout | Should Be $null
    }

    It 'infers route = cli structurally and records the classified appliedMode + sanitized title' {
        $b.route | Should Be 'cli'
        $b.appliedMode | Should Be 'audio'
        $b.videoTitle | Should Be 'Some Talk'
    }

    It 'preserves the parsed local run stamp, explicitly marked approximate' {
        $b.backfill.startedAtApproximate | Should Be $true
        $b.backfill.startedAtFromDirNameLocal | Should Be '2026-07-15T01:10:43.123'
    }

    It 'names route (and inferred fields) as inferred' {
        (@($b.backfill.inferredFields) -contains 'route') | Should Be $true
        (@($b.backfill.inferredFields) -contains 'appliedMode') | Should Be $true
        (@($b.backfill.inferredFields) -contains 'videoTitle') | Should Be $true
    }

    It 'carries the established route-inference code basis with the pre-V5a commit SHA' {
        $b.backfill.routeInference.value | Should Be 'cli'
        $b.backfill.routeInference.basis | Should Be 'code-control-flow'
        $b.backfill.routeInference.commit | Should Be 'efd76f8bf8c86548c1479cd3e2852d49cce36317'
        $b.backfill.routeInference.detail | Should Match 'New-VideoScoutRunDir'
    }

    It 'validates clean through the shared validator' {
        { Assert-VideoScoutManifestValid -Manifest $b } | Should Not Throw
    }

    It 'serializes inferredFields as a JSON array even when it holds a single element' {
        $empty = New-VideoScoutBackfillManifest -RunId 'run-x'
        (@($empty.backfill.inferredFields).Count) | Should Be 1
        ($empty | ConvertTo-Json -Depth 8) | Should Match '"inferredFields":\s*\[\s*"route"\s*\]'
    }

    It 'allows a null appliedMode/title (zero or mixed media) and still validates' {
        $none = New-VideoScoutBackfillManifest -RunId 'run-y'
        $none.appliedMode | Should Be $null
        $none.videoTitle | Should Be $null
        { Assert-VideoScoutManifestValid -Manifest $none } | Should Not Throw
    }
}

Describe 'Assert-VideoScoutManifestValid rejects drift and malformed shapes' {

    function New-GoodLive {
        New-VideoScoutLiveManifest -RunId 'r' -Url 'u' -AppliedMode 'video' -Route 'sdk' -Model 'm' `
            -MediaResolutionRequested 'LOW'
    }
    function New-GoodBackfill { New-VideoScoutBackfillManifest -RunId 'r' -AppliedMode 'video' }

    It 'rejects a null manifest' {
        { Assert-VideoScoutManifestValid -Manifest $null } | Should Throw
    }

    It 'rejects a live manifest that grows a backfill key (drift into approximate)' {
        # The backfill key IS the variant discriminator, so a live manifest that grows one is judged
        # under the backfill contract -- and its real (live) facts immediately violate the must-be-null
        # rule. Rejected either way; assert the actual refusal message, not a hypothetical one.
        $m = New-GoodLive; $m.backfill = @{ x = 1 }
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'must be null on a backfilled manifest'
    }

    It 'rejects an unknown extra key' {
        $m = New-GoodLive; $m.bogus = 1
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'unknown key'
    }

    It 'rejects a missing canonical key' {
        $m = New-GoodLive; $m.Remove('route')
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'missing key'
    }

    It 'rejects schemaVersion != 1' {
        $m = New-GoodLive; $m.schemaVersion = 2
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'schemaVersion'
    }

    It 'rejects an empty runId' {
        $m = New-GoodLive; $m.runId = '  '
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'runId'
    }

    It 'rejects a live outcome outside completed/refused/error' {
        $m = New-GoodLive; $m.outcome = 'running'
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'outcome'
    }

    It 'rejects a live manifest with no startedAt' {
        $m = New-GoodLive; $m.startedAt = $null
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'startedAt'
    }

    It 'rejects a live appliedMode outside the mode set' {
        $m = New-GoodLive; $m.appliedMode = 'photo'
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'appliedMode'
    }

    It 'rejects a backfilled manifest that smuggles in a real startedAt' {
        $b = New-GoodBackfill; $b.startedAt = '2026-07-15T01:10:43.123Z'
        { Assert-VideoScoutManifestValid -Manifest $b } | Should Throw 'startedAt must be null'
    }

    It 'rejects a backfilled manifest that claims a terminal outcome' {
        $b = New-GoodBackfill; $b.outcome = 'completed'
        { Assert-VideoScoutManifestValid -Manifest $b } | Should Throw 'outcome must be null'
    }

    It 'rejects a backfilled manifest whose route is not the inferred cli' {
        $b = New-GoodBackfill; $b.route = 'sdk'
        { Assert-VideoScoutManifestValid -Manifest $b } | Should Throw "route must be the inferred 'cli'"
    }

    It 'rejects a backfilled manifest with the wrong provenance commit' {
        $b = New-GoodBackfill; $b.backfill.routeInference.commit = 'deadbeef'
        { Assert-VideoScoutManifestValid -Manifest $b } | Should Throw 'commit must be the established'
    }

    It 'rejects a backfilled manifest whose route-inference basis was tampered' {
        $b = New-GoodBackfill; $b.backfill.routeInference.basis = 'vibes'
        { Assert-VideoScoutManifestValid -Manifest $b } | Should Throw 'basis must be code-control-flow'
    }

    It 'rejects a backfilled manifest missing route from inferredFields' {
        $b = New-GoodBackfill; $b.backfill.inferredFields = @('appliedMode')
        { Assert-VideoScoutManifestValid -Manifest $b } | Should Throw 'must name route as inferred'
    }

    It 'rejects a backfilled manifest with startedAtApproximate not true' {
        $b = New-GoodBackfill; $b.backfill.startedAtApproximate = $false
        { Assert-VideoScoutManifestValid -Manifest $b } | Should Throw 'startedAtApproximate'
    }

    It 'validates a read-back (PSCustomObject) manifest the same as an in-memory one' {
        $b = New-GoodBackfill
        $roundTrip = $b | ConvertTo-Json -Depth 8 | ConvertFrom-Json
        { Assert-VideoScoutManifestValid -Manifest $roundTrip } | Should Not Throw
    }
}

Describe 'reportFile validation (V5b1)' {

    function New-CompletedLive {
        # A minimal valid completed live manifest to attach a reportFile to.
        $m = New-VideoScoutLiveManifest -RunId 'r' -Url 'u' -AppliedMode 'transcript' -Route 'cli' `
            -Model 'm' -MediaResolutionRequested 'MEDIUM'
        $m.outcome = 'completed'
        $m.finishedAt = '2026-07-18T09:05:03.007Z'
        return $m
    }

    It 'accepts a null reportFile on any outcome (historical/backfill/failure/refusal/incomplete)' {
        $m = New-CompletedLive; $m.reportFile = $null
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
        $r = New-VideoScoutLiveManifest -RunId 'r' -Url 'u' -AppliedMode 'video' -Route 'sdk' -Model 'm' -MediaResolutionRequested 'LOW'
        $r.outcome = 'refused'; $r.reason = 'Refusing: over limit'; $r.finishedAt = '2026-07-18T09:05:03.007Z'; $r.reportFile = $null
        { Assert-VideoScoutManifestValid -Manifest $r } | Should Not Throw
    }

    It 'accepts the canonical analysis-output.txt on a completed run' {
        $m = New-CompletedLive; $m.reportFile = 'analysis-output.txt'
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
    }

    It 'rejects a non-null reportFile on a refused outcome' {
        $m = New-VideoScoutLiveManifest -RunId 'r' -Url 'u' -AppliedMode 'video' -Route 'sdk' -Model 'm' -MediaResolutionRequested 'LOW'
        $m.outcome = 'refused'; $m.reason = 'Refusing: over limit'; $m.finishedAt = '2026-07-18T09:05:03.007Z'
        $m.reportFile = 'analysis-output.txt'
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw "permitted only with outcome='completed'"
    }

    It 'rejects a non-null reportFile on an error outcome' {
        $m = New-VideoScoutLiveManifest -RunId 'r' -Url 'u' -AppliedMode 'video' -Route 'sdk' -Model 'm' -MediaResolutionRequested 'LOW'
        $m.outcome = 'error'; $m.reason = 'boom'; $m.finishedAt = '2026-07-18T09:05:03.007Z'
        $m.reportFile = 'analysis-output.txt'
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw "permitted only with outcome='completed'"
    }

    It 'rejects a non-null reportFile on a null (never-finalized) outcome' {
        $m = New-VideoScoutLiveManifest -RunId 'r' -Url 'u' -AppliedMode 'video' -Route 'sdk' -Model 'm' -MediaResolutionRequested 'LOW'
        $m.reportFile = 'analysis-output.txt'   # outcome stays null
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw "permitted only with outcome='completed'"
    }

    It 'rejects a reportFile that is a path, not a leaf filename' {
        $m = New-CompletedLive; $m.reportFile = 'sub/analysis-output.txt'
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'leaf filename'
        $m2 = New-CompletedLive; $m2.reportFile = 'sub\analysis-output.txt'
        { Assert-VideoScoutManifestValid -Manifest $m2 } | Should Throw 'leaf filename'
    }

    It 'rejects a reportFile with a traversal sequence' {
        $m = New-CompletedLive; $m.reportFile = '..\analysis-output.txt'
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw
    }

    It 'rejects a reportFile with a drive or rooted prefix' {
        $m = New-CompletedLive; $m.reportFile = 'C:analysis-output.txt'
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw
    }

    It 'rejects a reportFile with a disallowed extension' {
        $m = New-CompletedLive; $m.reportFile = 'analysis-output.exe'
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'approved plain-text extension'
        $m2 = New-CompletedLive; $m2.reportFile = 'analysis-output'
        { Assert-VideoScoutManifestValid -Manifest $m2 } | Should Throw 'approved plain-text extension'
    }

    It 'rejects a reportFile with control characters' {
        $m = New-CompletedLive; $m.reportFile = "analysis`toutput.txt"
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'control characters'
    }

    It 'rejects an over-length reportFile' {
        $m = New-CompletedLive; $m.reportFile = ('a' * 250) + '.txt'
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'maximum length'
    }

    It 'still rejects a non-null reportFile on a backfill manifest (never completed => never a report)' {
        # A backfill has outcome=null, so the shared reportFile rule (permitted only with
        # outcome='completed') rejects it; the backfill must-be-null rule would also reject it. Either
        # refusal is correct -- assert that it is rejected.
        $b = New-VideoScoutBackfillManifest -RunId 'r' -AppliedMode 'video'
        $b.reportFile = 'analysis-output.txt'
        { Assert-VideoScoutManifestValid -Manifest $b } | Should Throw
    }
}
