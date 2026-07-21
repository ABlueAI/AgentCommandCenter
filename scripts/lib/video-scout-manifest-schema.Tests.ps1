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

    It 'produces EXACTLY the version-2 keys (v1 canonical + mediaArtifacts) and NO backfill key' {
        # V5c1: newly initialized live runs are schema version 2 with an empty media inventory.
        ((@($m.Keys)) -join ',') | Should Be (($expectedCanonicalKeys + 'mediaArtifacts') -join ',')
        ($m.Keys -contains 'backfill') | Should Be $false
        $m.schemaVersion | Should Be 2
        @($m.mediaArtifacts).Count | Should Be 0
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

    It 'rejects a live (v2) manifest that grows a backfill key (drift into approximate)' {
        # V5c1: a schema-v2 manifest must NEVER be a backfill (backfills remain version 1 — ownership is
        # never fabricated for history). A v2 that grows a backfill key is rejected at the version gate.
        $m = New-GoodLive; $m.backfill = @{ x = 1 }
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'must not be a backfill'
    }

    It 'rejects an unknown extra key' {
        $m = New-GoodLive; $m.bogus = 1
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'unknown key'
    }

    It 'rejects a missing canonical key' {
        $m = New-GoodLive; $m.Remove('route')
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'missing key'
    }

    It 'accepts the supported schemaVersions (1 and 2) and rejects any other' {
        # V5c1 introduced version 2; version 1 stays valid, an unsupported version is rejected.
        $m2 = New-GoodLive; $m2.schemaVersion | Should Be 2
        { Assert-VideoScoutManifestValid -Manifest $m2 } | Should Not Throw
        $m3 = New-GoodLive; $m3.schemaVersion = 3
        { Assert-VideoScoutManifestValid -Manifest $m3 } | Should Throw 'schemaVersion'
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

Describe 'V5c1 schema version 2 media inventory' {
    # A helper that builds a good v2 live manifest and lets a test set its mediaArtifacts.
    function New-V2 { New-VideoScoutLiveManifest -RunId 'r' -Url 'u' -AppliedMode 'transcript' -Route 'cli' -Model 'm' -MediaResolutionRequested 'MEDIUM' }
    function New-Artifact { param($n, $k = 'transcript', $size = 10, $state = 'present', $recordedAt = '2026-07-20T00:00:00.000Z', $deletedAt = $null, $deletionReason = $null)
        [ordered]@{ fileName = $n; kind = $k; sizeBytes = $size; recordedAt = $recordedAt; state = $state; deletedAt = $deletedAt; deletionReason = $deletionReason } }

    It 'version 1 (base skeleton) remains valid unchanged and has no mediaArtifacts' {
        $b = New-VideoScoutManifestBase
        $b.schemaVersion | Should Be 1
        ($b.Keys -contains 'mediaArtifacts') | Should Be $false
        { Assert-VideoScoutManifestValid -Manifest ([ordered]@{ schemaVersion=1; runId='r'; videoScout=$true; url='u'; videoTitle=$null; requestedMode=$null; appliedMode='transcript'; route='cli'; model='m'; mediaResolutionRequested='MEDIUM'; mediaResolutionApplied=$null; startOffsetSeconds=$null; endOffsetSeconds=$null; startedAt='2026-07-20T00:00:00.000Z'; finishedAt=$null; usage=$null; reportFile=$null; outcome=$null; reason=$null }) } | Should Not Throw
    }
    It 'version 1 REJECTS a silently added mediaArtifacts key' {
        $v1 = [ordered]@{ schemaVersion=1; runId='r'; videoScout=$true; url='u'; videoTitle=$null; requestedMode=$null; appliedMode='transcript'; route='cli'; model='m'; mediaResolutionRequested='MEDIUM'; mediaResolutionApplied=$null; startOffsetSeconds=$null; endOffsetSeconds=$null; startedAt='2026-07-20T00:00:00.000Z'; finishedAt=$null; usage=$null; reportFile=$null; outcome=$null; reason=$null; mediaArtifacts=@() }
        { Assert-VideoScoutManifestValid -Manifest $v1 } | Should Throw 'unknown key'
    }
    It 'version 2 REQUIRES the mediaArtifacts field' {
        $m = New-V2; $m.Remove('mediaArtifacts')
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'missing key'
    }
    It 'an empty inventory is valid' {
        $m = New-V2; @($m.mediaArtifacts).Count | Should Be 0
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
    }
    It 'each kind/extension pair is valid' {
        foreach ($pair in @(@('transcript','.srt'), @('audio','.mp3'), @('video','.mp4'))) {
            $m = New-V2; $m.mediaArtifacts = @((New-Artifact "file$($pair[1])" $pair[0]))
            { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
        }
    }
    It 'a mismatched extension is rejected' {
        $m = New-V2; $m.mediaArtifacts = @((New-Artifact 'a.mp3' 'transcript'))
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'requires extension'
    }
    It 'an extra artifact key is rejected' {
        $a = New-Artifact 'a.srt'; $a['bogus'] = 1
        $m = New-V2; $m.mediaArtifacts = @($a)
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'unknown key'
    }
    It 'a missing artifact key is rejected' {
        $a = New-Artifact 'a.srt'; $a.Remove('state')
        $m = New-V2; $m.mediaArtifacts = @($a)
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'missing key'
    }
    It 'duplicate filenames are rejected case-insensitively' {
        $m = New-V2; $m.mediaArtifacts = @((New-Artifact 'A.srt'), (New-Artifact 'a.srt'))
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'duplicate'
    }
    It 'separators / rooted / traversal / control / bidi filenames are rejected' {
        $bad = @('sub/of.srt', 'a\b.srt', 'C:\x.srt', '\rooted.srt', '..\up.srt', '..', '.')
        foreach ($n in $bad) {
            $m = New-V2; $m.mediaArtifacts = @((New-Artifact $n))
            { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw
        }
        # control + bidi built from code points so this test file stays plain ASCII
        foreach ($cp in @(0x07, 0x202E)) {
            $m = New-V2; $m.mediaArtifacts = @((New-Artifact ('a' + [char]$cp + '.srt')))
            { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw
        }
    }
    It 'invalid sizes / timestamps / states / non-null deletion fields are rejected' {
        $cases = @(
            (New-Artifact 'a.srt' 'transcript' -1),
            (New-Artifact 'a.srt' 'transcript' 'x'),
            (New-Artifact 'a.srt' 'transcript' 10 'present' 'not-a-timestamp'),
            (New-Artifact 'a.srt' 'transcript' 10 'deleted'),
            (New-Artifact 'a.srt' 'transcript' 10 'present' '2026-07-20T00:00:00.000Z' '2026-07-20T00:00:00.000Z'),
            (New-Artifact 'a.srt' 'transcript' 10 'present' '2026-07-20T00:00:00.000Z' $null 'gone')
        )
        foreach ($a in $cases) {
            $m = New-V2; $m.mediaArtifacts = @($a)
            { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw
        }
    }
    It 'more than 16 entries is rejected' {
        $m = New-V2; $m.mediaArtifacts = @(1..17 | ForEach-Object { New-Artifact "f$_.srt" })
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'maximum is 16'
    }
    It 'mediaArtifacts as an arbitrary object (not an array) is rejected' {
        $m = New-V2; $m.mediaArtifacts = [pscustomobject]@{ x = 1 }
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'must be an array'
    }
    It 'a backfill manifest remains version 1 (never grows a media inventory)' {
        $bf = New-VideoScoutBackfillManifest -RunId 'r' -AppliedMode 'video'
        $bf.schemaVersion | Should Be 1
        ($bf.Keys -contains 'mediaArtifacts') | Should Be $false
        { Assert-VideoScoutManifestValid -Manifest $bf } | Should Not Throw
    }
    It 'round-trips a v2 manifest with a recorded artifact through JSON unchanged' {
        $m = New-V2; $m.mediaArtifacts = @((New-Artifact 'video.en.srt'))
        $json = ConvertTo-Json -InputObject $m -Depth 6
        $back = $json | ConvertFrom-Json
        $back.schemaVersion | Should Be 2
        @($back.mediaArtifacts).Count | Should Be 1
        $back.mediaArtifacts[0].fileName | Should Be 'video.en.srt'
        { Assert-VideoScoutManifestValid -Manifest $back } | Should Not Throw
    }
}

Describe 'V5c2a schema — media artifact deletion states and per-state nullability' {
    function New-V2 { New-VideoScoutLiveManifest -RunId 'r' -Url 'u' -AppliedMode 'transcript' -Route 'cli' -Model 'm' -MediaResolutionRequested 'MEDIUM' }
    function New-Art { param($state, $deletedAt = $null, $deletionReason = $null)
        [ordered]@{ fileName = 'a.srt'; kind = 'transcript'; sizeBytes = 10; recordedAt = '2026-07-21T00:00:00.000Z'; state = $state; deletedAt = $deletedAt; deletionReason = $deletionReason } }
    $ts = '2026-07-21T00:00:02.000Z'

    It 'accepts every valid per-state shape (present/deleting/deleted/delete-failed/missing)' {
        $valid = @(
            (New-Art 'present'),
            (New-Art 'deleting'      $null 'completed-analysis'),
            (New-Art 'deleted'       $ts   'completed-analysis'),
            (New-Art 'delete-failed' $null 'identity-mismatch'),
            (New-Art 'delete-failed' $null 'reparse-point-refused'),
            (New-Art 'delete-failed' $null 'unsafe-file-type'),
            (New-Art 'delete-failed' $null 'filesystem-delete-failed'),
            (New-Art 'missing'       $null 'owned-file-missing')
        )
        foreach ($a in $valid) {
            $m = New-V2; $m.mediaArtifacts = @($a)
            { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
        }
    }
    It "rejects a 'deleted' artifact without a UTC deletedAt" {
        $m = New-V2; $m.mediaArtifacts = @((New-Art 'deleted' $null 'completed-analysis'))
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'deletedAt'
    }
    It "rejects a 'deleting'/'delete-failed'/'missing' artifact that carries a deletedAt" {
        foreach ($st in @('deleting', 'delete-failed', 'missing')) {
            $m = New-V2; $m.mediaArtifacts = @((New-Art $st $ts 'completed-analysis'))
            { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'deletedAt null'
        }
    }
    It "rejects a non-present state with a null deletionReason" {
        foreach ($st in @('deleting', 'deleted', 'delete-failed', 'missing')) {
            $da = if ($st -eq 'deleted') { $ts } else { $null }
            $m = New-V2; $m.mediaArtifacts = @((New-Art $st $da $null))
            { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw
        }
    }
    It 'rejects a deletionReason outside the bounded allowlist (no raw text persisted)' {
        $m = New-V2; $m.mediaArtifacts = @((New-Art 'delete-failed' $null 'Access is denied: C:\secret\path'))
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'deletionReason must be one of'
    }
    It "still rejects a 'present' artifact that carries a deletedAt or deletionReason" {
        $m1 = New-V2; $m1.mediaArtifacts = @((New-Art 'present' $ts $null))
        { Assert-VideoScoutManifestValid -Manifest $m1 } | Should Throw
        $m2 = New-V2; $m2.mediaArtifacts = @((New-Art 'present' $null 'completed-analysis'))
        { Assert-VideoScoutManifestValid -Manifest $m2 } | Should Throw
    }
    It 'rejects an unknown state value' {
        $m = New-V2; $m.mediaArtifacts = @((New-Art 'quarantined' $null 'completed-analysis'))
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'state must be one of'
    }
    It 'round-trips a deleted artifact through JSON and stays valid' {
        $m = New-V2; $m.mediaArtifacts = @((New-Art 'deleted' $ts 'completed-analysis'))
        $back = (ConvertTo-Json -InputObject $m -Depth 6) | ConvertFrom-Json
        $back.mediaArtifacts[0].state | Should Be 'deleted'
        $back.mediaArtifacts[0].deletedAt | Should Be $ts
        { Assert-VideoScoutManifestValid -Manifest $back } | Should Not Throw
    }
}
