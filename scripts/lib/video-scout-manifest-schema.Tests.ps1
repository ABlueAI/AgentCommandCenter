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

    It 'produces EXACTLY the version-4 keys (v1 canonical + the three v4 collections) and NO backfill key' {
        # V4Q: a newly initialized live SDK run is schema version 4. It always carries all three
        # collection fields so the shape is stable across whole-video / scalar / multipart scopes.
        ((@($m.Keys)) -join ',') | Should Be (($expectedCanonicalKeys + 'mediaArtifacts' + 'requestedSliceRanges' + 'diagnosticArtifacts') -join ',')
        ($m.Keys -contains 'backfill') | Should Be $false
        $m.schemaVersion | Should Be 4
        @($m.mediaArtifacts).Count | Should Be 0
        @($m.diagnosticArtifacts).Count | Should Be 0
        # A scalar run keeps its scalar offsets authoritative and records no slice SET.
        $m.requestedSliceRanges | Should BeNullOrEmpty
        $m.startOffsetSeconds | Should Be 120
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

    # Deliberately the CLI route, which V4Q leaves on schema version 2: this helper backs the generic
    # live-contract assertions below (runId, offsets, timestamps, outcomes, reportFile), and keeping
    # it on v2 preserves that existing coverage byte-for-byte. Version 4 has its own Describe block.
    function New-GoodLive {
        New-VideoScoutLiveManifest -RunId 'r' -Url 'u' -AppliedMode 'video' -Route 'cli' -Model 'm' `
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

    It 'accepts the supported schemaVersions and rejects any other' {
        # V5c1 introduced version 2; V4 introduced version 3; V4Q introduces version 4. The
        # unsupported version is DERIVED as max(supported) + 1 rather than hard-coded, so the next
        # schema bump does not silently turn this into a test of an already-valid version.
        $m2 = New-GoodLive; $m2.schemaVersion | Should Be 2
        { Assert-VideoScoutManifestValid -Manifest $m2 } | Should Not Throw
        $supported = Get-VideoScoutSchemaVersions
        ($supported -contains 1) | Should Be $true
        ($supported -contains 4) | Should Be $true
        $unsupported = (($supported | Measure-Object -Maximum).Maximum) + 1
        ($supported -contains $unsupported) | Should Be $false
        $bad = New-GoodLive; $bad.schemaVersion = $unsupported
        { Assert-VideoScoutManifestValid -Manifest $bad } | Should Throw 'schemaVersion'
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

Describe 'V4 schema version 3 -- multi-slice requested scope' {
    # A valid multi-slice SDK run: 2 chronological slices, empty media inventory, null scalars.
    function New-Slices { param($ranges = @(@{S=10;E=30}, @{S=60;E=90}))
        @(foreach ($r in $ranges) { [PSCustomObject]@{ StartOffset = $r.S; EndOffset = $r.E } }) }
    # V4Q: version 3 is now HISTORY. New live SDK runs are version 4, but every existing v3 manifest
    # on disk must stay valid unchanged and is never migrated -- which is exactly what this block
    # still proves. The fixture is therefore built by demoting a fresh v4 manifest to the v3 shape
    # (drop diagnosticArtifacts), rather than by asking the constructor for a version it no longer
    # produces.
    function New-V3 { param($ranges = $null)
        $m = New-VideoScoutLiveManifest -RunId 'r' -Url 'u' -AppliedMode 'video' -Route 'sdk' -Model 'm' `
            -MediaResolutionRequested 'MEDIUM' -VideoScout $true `
            -SliceRanges $(if ($null -eq $ranges) { New-Slices } else { $ranges })
        $m.schemaVersion = 3
        $m.Remove('diagnosticArtifacts')
        $m }

    It 'a legacy multi-slice manifest stays schema version 3 with requestedSliceRanges in the REQUESTED order' {
        $m = New-V3
        $m.schemaVersion | Should Be 3
        @($m.requestedSliceRanges).Count | Should Be 2
        @($m.requestedSliceRanges)[0].startOffsetSeconds | Should Be 10
        @($m.requestedSliceRanges)[1].endOffsetSeconds | Should Be 90
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
    }
    It 'a v3 manifest has NULL scalar offsets (the slice set is the authoritative scope)' {
        $m = New-V3
        $m.startOffsetSeconds | Should BeNullOrEmpty
        $m.endOffsetSeconds | Should BeNullOrEmpty
    }
    It 'a v3 manifest requires an EMPTY mediaArtifacts array' {
        $m = New-V3
        @($m.mediaArtifacts).Count | Should Be 0
    }
    It 'survives a JSON round-trip (the shape the Library actually reads back from disk)' {
        $rt = (New-V3 | ConvertTo-Json -Depth 8) | ConvertFrom-Json
        { Assert-VideoScoutManifestValid -Manifest $rt } | Should Not Throw
        @($rt.requestedSliceRanges).Count | Should Be 2
    }
    It 'records all 8 slices for a maximum multi-slice run' {
        $eight = New-Slices -ranges @(0..7 | ForEach-Object { @{ S = $_ * 400; E = $_ * 400 + 225 } })
        $m = New-V3 -ranges $eight
        @($m.requestedSliceRanges).Count | Should Be 8
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
    }

    # --- version isolation: v1 and v2 stay valid unchanged and REJECT the new key ---------------
    It 'a new scalar SDK run is version 4 with a NULL slice set and authoritative scalar offsets' {
        $v4 = New-VideoScoutLiveManifest -RunId 'r' -Url 'u' -AppliedMode 'video' -Route 'sdk' -Model 'm' -MediaResolutionRequested 'MEDIUM' -StartOffset 5 -EndOffset 9
        $v4.schemaVersion | Should Be 4
        $v4.requestedSliceRanges | Should BeNullOrEmpty
        $v4.startOffsetSeconds | Should Be 5
        { Assert-VideoScoutManifestValid -Manifest $v4 } | Should Not Throw
    }
    It 'an EMPTY slice set leaves a v4 manifest with a NULL slice set (never an empty array)' {
        $m = New-VideoScoutLiveManifest -RunId 'r' -Url 'u' -AppliedMode 'video' -Route 'sdk' -Model 'm' -MediaResolutionRequested 'MEDIUM' -SliceRanges @()
        $m.schemaVersion | Should Be 4
        $m.requestedSliceRanges | Should BeNullOrEmpty
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
    }
    It 'a CLI run stays schema version 2 and REJECTS a silently added requestedSliceRanges key' {
        $v2 = New-VideoScoutLiveManifest -RunId 'r' -Url 'u' -AppliedMode 'video' -Route 'cli' -Model 'm' -MediaResolutionRequested 'MEDIUM'
        $v2.schemaVersion | Should Be 2
        ($v2.Keys -contains 'requestedSliceRanges') | Should Be $false
        $v2.requestedSliceRanges = @([ordered]@{ startOffsetSeconds = 10; endOffsetSeconds = 30 })
        { Assert-VideoScoutManifestValid -Manifest $v2 } | Should Throw 'unknown key'
    }
    It 'version 1 REJECTS a silently added requestedSliceRanges key' {
        $v1 = [ordered]@{ schemaVersion=1; runId='r'; videoScout=$true; url='u'; videoTitle=$null; requestedMode=$null; appliedMode='video'; route='sdk'; model='m'; mediaResolutionRequested='MEDIUM'; mediaResolutionApplied=$null; startOffsetSeconds=$null; endOffsetSeconds=$null; startedAt='2026-07-20T00:00:00.000Z'; finishedAt=$null; usage=$null; reportFile=$null; outcome=$null; reason=$null; requestedSliceRanges=@() }
        { Assert-VideoScoutManifestValid -Manifest $v1 } | Should Throw 'unknown key'
    }
    It 'version 3 REQUIRES the requestedSliceRanges field' {
        $m = New-V3; $m.Remove('requestedSliceRanges')
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'missing key'
    }
    It 'version 3 still REQUIRES the mediaArtifacts field' {
        $m = New-V3; $m.Remove('mediaArtifacts')
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'missing key'
    }
    It 'the DERIVED next-unsupported schemaVersion is refused' {
        # Derived as max(supported) + 1, never a literal: when version 5 eventually ships this test
        # keeps testing an unsupported version instead of quietly asserting a valid one.
        $unsupported = ((Get-VideoScoutSchemaVersions | Measure-Object -Maximum).Maximum) + 1
        ((Get-VideoScoutSchemaVersions) -contains $unsupported) | Should Be $false
        $m = New-V3; $m.schemaVersion = $unsupported
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'schemaVersion must be one of'
    }

    # --- the structural guarantee: v3 can NEVER become media-deletion authority -----------------
    It 'a v3 manifest with ANY media artifact is INVALID (v3 is never media-ownership authority)' {
        $m = New-V3
        $m.mediaArtifacts = @([ordered]@{ fileName='x.srt'; kind='transcript'; sizeBytes=10; recordedAt='2026-07-20T00:00:00.000Z'; state='present'; deletedAt=$null; deletionReason=$null })
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'mediaArtifacts must be EMPTY'
    }
    It 'a v3 manifest with a DELETED artifact is equally invalid' {
        $m = New-V3
        $m.mediaArtifacts = @([ordered]@{ fileName='x.srt'; kind='transcript'; sizeBytes=10; recordedAt='2026-07-20T00:00:00.000Z'; state='deleted'; deletedAt='2026-07-20T00:01:00.000Z'; deletionReason='completed-analysis' })
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'mediaArtifacts must be EMPTY'
    }
    It 'a v3 manifest must record the SDK route (slices exist only on that route)' {
        $m = New-V3; $m.route = 'cli'
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'must record route'
    }
    It 'a v3 manifest must not also carry scalar offsets (two competing scope records)' {
        $m = New-V3; $m.startOffsetSeconds = 5; $m.endOffsetSeconds = 9
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'must both be null'
    }
    It 'a v3 manifest is never a backfill' {
        $m = New-V3
        $m.backfill = [ordered]@{ startedAtApproximate = $true; generatedAt = 'x'; source = 'y'; inferredFields = @('route'); routeInference = @{} }
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw
    }

    # --- requestedSliceRanges shape enforcement -------------------------------------------------
    It 'refuses fewer than 2 or more than 8 slice entries' {
        $m = New-V3; $m.requestedSliceRanges = @([ordered]@{ startOffsetSeconds=10; endOffsetSeconds=30 })
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw '2 to 8 entries'
        $m2 = New-V3; $m2.requestedSliceRanges = @(0..8 | ForEach-Object { [ordered]@{ startOffsetSeconds = $_ * 20; endOffsetSeconds = $_ * 20 + 10 } })
        { Assert-VideoScoutManifestValid -Manifest $m2 } | Should Throw '2 to 8 entries'
    }
    It 'refuses a non-array requestedSliceRanges' {
        $m = New-V3; $m.requestedSliceRanges = [ordered]@{ startOffsetSeconds = 10; endOffsetSeconds = 30 }
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'must be an array'
    }
    It 'refuses an entry with extra or missing keys' {
        $m = New-V3
        $m.requestedSliceRanges = @([ordered]@{ startOffsetSeconds=10; endOffsetSeconds=30 }, [ordered]@{ startOffsetSeconds=60; endOffsetSeconds=90; label='x' })
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'unknown key'
        $m2 = New-V3
        $m2.requestedSliceRanges = @([ordered]@{ startOffsetSeconds=10; endOffsetSeconds=30 }, [ordered]@{ startOffsetSeconds=60 })
        { Assert-VideoScoutManifestValid -Manifest $m2 } | Should Throw 'missing key'
    }
    It 'refuses non-integer / out-of-range offsets' {
        $m = New-V3
        $m.requestedSliceRanges = @([ordered]@{ startOffsetSeconds=10; endOffsetSeconds=30 }, [ordered]@{ startOffsetSeconds='60'; endOffsetSeconds=90 })
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'whole number'
        $m2 = New-V3
        $m2.requestedSliceRanges = @([ordered]@{ startOffsetSeconds=10; endOffsetSeconds=30 }, [ordered]@{ startOffsetSeconds=60; endOffsetSeconds=86401 })
        { Assert-VideoScoutManifestValid -Manifest $m2 } | Should Throw 'from 0 to 86400'
    }
    It 'refuses end less than or equal to start' {
        $m = New-V3
        $m.requestedSliceRanges = @([ordered]@{ startOffsetSeconds=10; endOffsetSeconds=30 }, [ordered]@{ startOffsetSeconds=90; endOffsetSeconds=90 })
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'strictly greater'
    }
    It 'refuses overlapping / out-of-order entries (order is recorded as requested, never repaired)' {
        $m = New-V3
        $m.requestedSliceRanges = @([ordered]@{ startOffsetSeconds=10; endOffsetSeconds=30 }, [ordered]@{ startOffsetSeconds=20; endOffsetSeconds=40 })
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'overlaps or precedes'
        $m2 = New-V3
        $m2.requestedSliceRanges = @([ordered]@{ startOffsetSeconds=100; endOffsetSeconds=200 }, [ordered]@{ startOffsetSeconds=10; endOffsetSeconds=50 })
        { Assert-VideoScoutManifestValid -Manifest $m2 } | Should Throw 'overlaps or precedes'
    }
    It 'refuses an aggregate above the fixed 1800s cap' {
        $m = New-V3
        $m.requestedSliceRanges = @([ordered]@{ startOffsetSeconds=0; endOffsetSeconds=1700 }, [ordered]@{ startOffsetSeconds=2000; endOffsetSeconds=2200 })
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'exceeds the fixed 1800s'
    }
    It 'ACCEPTS an aggregate of exactly 1800s' {
        $m = New-V3
        $m.requestedSliceRanges = @([ordered]@{ startOffsetSeconds=0; endOffsetSeconds=900 }, [ordered]@{ startOffsetSeconds=1000; endOffsetSeconds=1900 })
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
    }

    # --- requested-vs-analyzed truth ------------------------------------------------------------
    It 'a REFUSED multi-slice run keeps its requested scope and persists no report' {
        $m = New-V3; $m.outcome = 'refused'; $m.reason = 'Refusing: ...'; $m.finishedAt = '2026-07-20T00:01:00.000Z'
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
        $m.reportFile | Should BeNullOrEmpty
        @($m.requestedSliceRanges).Count | Should Be 2
    }
    It 'an ERROR multi-slice run is equally valid and equally report-less' {
        $m = New-V3; $m.outcome = 'error'; $m.reason = 'provider rejected the request'; $m.finishedAt = '2026-07-20T00:01:00.000Z'
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
        $m.reportFile | Should BeNullOrEmpty
    }
    It 'a COMPLETED multi-slice run may carry a report (the analyzed-scope evidence)' {
        $m = New-V3; $m.outcome = 'completed'; $m.reportFile = 'analysis-output.txt'; $m.finishedAt = '2026-07-20T00:01:00.000Z'
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
    }
    It 'a non-completed multi-slice run may NOT carry a report (unchanged V5b1 rule)' {
        $m = New-V3; $m.outcome = 'error'; $m.reportFile = 'analysis-output.txt'
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'permitted only with'
    }
}

Describe 'V4Q schema version 4 -- live SDK runs and rejected-response diagnostics' {

    function New-V4 { param($ranges = $null, $so = $null, $eo = $null)
        New-VideoScoutLiveManifest -RunId 'r' -Url 'u' -AppliedMode 'video' -Route 'sdk' -Model 'gemini-2.5-pro' `
            -MediaResolutionRequested 'MEDIUM' -MediaResolutionApplied 'MEDIUM' -VideoScout $true `
            -StartOffset $so -EndOffset $eo -SliceRanges $ranges }
    function New-Ranges { @([PSCustomObject]@{ StartOffset = 60; EndOffset = 90 }, [PSCustomObject]@{ StartOffset = 240; EndOffset = 280 }) }
    function New-Entry { [ordered]@{ kind = 'quality-rejected-response'; fileName = 'rejected-response.txt'; sha256 = ('a' * 64); bytes = 1234 } }
    function New-Rejected { param($entry = $null)
        $m = New-V4 -so 60 -eo 75
        $m.outcome = 'error'
        $m.reason = '[quality:scope-mismatch] rejected locally; preserved as evidence'
        $m.finishedAt = '2026-07-28T00:00:00.000Z'
        $m.diagnosticArtifacts = @($(if ($null -eq $entry) { New-Entry } else { $entry }))
        $m }

    # --- every new live SDK scope is version 4 --------------------------------------------------
    It 'whole-video, scalar, and multipart SDK runs are ALL schema version 4' {
        (New-V4).schemaVersion | Should Be 4
        (New-V4 -so 60 -eo 75).schemaVersion | Should Be 4
        (New-V4 -ranges (New-Ranges)).schemaVersion | Should Be 4
    }
    It 'a v4 multipart run records the slice set and nulls the scalar offsets' {
        $m = New-V4 -ranges (New-Ranges)
        @($m.requestedSliceRanges).Count | Should Be 2
        @($m.requestedSliceRanges)[0].startOffsetSeconds | Should Be 60
        @($m.requestedSliceRanges)[1].endOffsetSeconds | Should Be 280
        $m.startOffsetSeconds | Should BeNullOrEmpty
        $m.endOffsetSeconds | Should BeNullOrEmpty
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
    }
    It 'a v4 manifest must record route=sdk (CLI runs stay on version 2)' {
        $m = New-V4; $m.route = 'cli'
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'version 4 is the live SDK'
    }
    It 'a v4 manifest is never a backfill' {
        $m = New-V4; $m.backfill = [ordered]@{ generatedAt = '2026-07-28T00:00:00.000Z' }
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'must not be a backfill'
    }
    It 'survives a JSON round-trip (the shape the Library actually reads back from disk)' {
        $rt = (New-Rejected | ConvertTo-Json -Depth 8) | ConvertFrom-Json
        { Assert-VideoScoutManifestValid -Manifest $rt } | Should Not Throw
        @($rt.diagnosticArtifacts).Count | Should Be 1
        @($rt.diagnosticArtifacts)[0].fileName | Should Be 'rejected-response.txt'
    }

    # --- the structural guarantee: v4 is NEVER media-ownership or deletion authority -------------
    It 'a v4 manifest with ANY media artifact is INVALID' {
        $m = New-V4
        $m.mediaArtifacts = @([ordered]@{ fileName = 'x.srt'; kind = 'transcript'; sizeBytes = 10; recordedAt = '2026-07-28T00:00:00.000Z'; state = 'present'; deletedAt = $null; deletionReason = $null })
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'mediaArtifacts must be EMPTY'
    }

    # --- diagnostics begin empty and stay empty on every non-rejection path ----------------------
    It 'a fresh v4 manifest begins with an EMPTY diagnosticArtifacts array' {
        @((New-V4).diagnosticArtifacts).Count | Should Be 0
        { Assert-VideoScoutManifestValid -Manifest (New-V4) } | Should Not Throw
    }
    It 'a COMPLETED run requires empty diagnostics and may carry a report' {
        $m = New-V4 -so 60 -eo 75; $m.outcome = 'completed'; $m.reportFile = 'analysis-output.txt'; $m.finishedAt = '2026-07-28T00:00:00.000Z'
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
        $m.diagnosticArtifacts = @(New-Entry)
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'must record outcome'
    }
    It 'refusal and ordinary error runs leave diagnostics empty' {
        foreach ($o in @('refused', 'error')) {
            $m = New-V4; $m.outcome = $o; $m.reason = 'guard refusal'; $m.finishedAt = '2026-07-28T00:00:00.000Z'
            @($m.diagnosticArtifacts).Count | Should Be 0
            { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
        }
    }
    It 'the diagnostic-write-failure path is error + EMPTY diagnostics + null reportFile' {
        $m = New-V4; $m.outcome = 'error'; $m.reason = '[quality:diagnostic-write-failed] could not preserve'; $m.finishedAt = '2026-07-28T00:00:00.000Z'
        @($m.diagnosticArtifacts).Count | Should Be 0
        $m.reportFile | Should BeNullOrEmpty
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
    }

    # --- a NONEMPTY diagnostic array is bound to error + no report + an allowlisted code ----------
    It 'a valid rejected-response manifest passes' {
        { Assert-VideoScoutManifestValid -Manifest (New-Rejected) } | Should Not Throw
    }
    It 'a diagnostic may never accompany a reportFile' {
        $m = New-Rejected; $m.reportFile = 'analysis-output.txt'
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw
    }
    It 'a diagnostic requires an allowlisted quality-code reason marker' {
        $m = New-Rejected; $m.reason = 'something generic went wrong'
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'allowlisted'
        $m2 = New-Rejected; $m2.reason = '[quality:totally-made-up] x'
        { Assert-VideoScoutManifestValid -Manifest $m2 } | Should Throw 'not an allowlisted'
    }
    It 'EVERY allowlisted code is accepted in the reason marker' {
        foreach ($code in Get-VideoScoutQualityReasonCodes) {
            $m = New-Rejected; $m.reason = "[quality:$code] rejected"
            { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
        }
    }
    It 'V4Q FINAL: the schema declares exactly 15 codes, including both canonical-field FORMAT codes' {
        $codes = @(Get-VideoScoutQualityReasonCodes)
        $codes.Count | Should Be 15
        ($codes -ccontains 'source-duration-field-format') | Should Be $true
        ($codes -ccontains 'synthetic-assessment-field-format') | Should Be $true
        # The FORMAT codes are additions, never replacements: their CONTENT counterparts survive.
        ($codes -ccontains 'speculative-source-duration') | Should Be $true
        ($codes -ccontains 'unsupported-synthetic-claim') | Should Be $true
    }
    It 'V4Q FINAL: a v4 manifest carrying either new FORMAT code validates end to end' {
        foreach ($code in @('source-duration-field-format', 'synthetic-assessment-field-format')) {
            $m = New-Rejected; $m.reason = "[quality:$code] the canonical field is malformed"
            { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
            $m.schemaVersion | Should Be 4
            $m.outcome | Should Be 'error'
            $m.reportFile | Should BeNullOrEmpty
            @($m.diagnosticArtifacts).Count | Should Be 1
        }
    }
    It 'V4Q FINAL: a near-miss format code is still refused (the allowlist stays CLOSED)' {
        foreach ($bogus in @('source-duration-format', 'synthetic-field-format', 'field-format')) {
            $m = New-Rejected; $m.reason = "[quality:$bogus] x"
            { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'not an allowlisted'
        }
    }
    It 'at most ONE diagnostic entry is permitted' {
        $m = New-Rejected; $m.diagnosticArtifacts = @((New-Entry), (New-Entry))
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'at most'
    }
    It 'the entry shape is exact: kind, fileName, bytes, sha256 and nothing else' {
        $extra = New-Entry; $extra.surprise = 'x'
        { Assert-VideoScoutManifestValid -Manifest (New-Rejected -entry $extra) } | Should Throw 'unknown key'
        $missing = New-Entry; $missing.Remove('sha256')
        { Assert-VideoScoutManifestValid -Manifest (New-Rejected -entry $missing) } | Should Throw 'missing key'
    }
    It 'the diagnostic leaf name is the repository constant, never a supplied name' {
        $bad = New-Entry; $bad.fileName = 'evil.txt'
        { Assert-VideoScoutManifestValid -Manifest (New-Rejected -entry $bad) } | Should Throw 'must be exactly'
        $trav = New-Entry; $trav.fileName = '..\rejected-response.txt'
        { Assert-VideoScoutManifestValid -Manifest (New-Rejected -entry $trav) } | Should Throw 'must be exactly'
    }
    It 'kind is restricted to the approved diagnostic kind' {
        $bad = New-Entry; $bad.kind = 'analysis-output'
        { Assert-VideoScoutManifestValid -Manifest (New-Rejected -entry $bad) } | Should Throw 'kind must be one of'
    }
    It 'sha256 must be a lowercase 64-character hex digest' {
        foreach ($h in @(('A' * 64), ('a' * 63), 'not-a-hash', 12345)) {
            $bad = New-Entry; $bad.sha256 = $h
            { Assert-VideoScoutManifestValid -Manifest (New-Rejected -entry $bad) } | Should Throw 'sha256'
        }
    }
    It 'bytes must be a whole number inside the diagnostic byte bound' {
        foreach ($b in @(-1, ((Get-VideoScoutSchemaMaxDiagnosticBytes) + 1), 'ten', $null)) {
            $bad = New-Entry; $bad.bytes = $b
            { Assert-VideoScoutManifestValid -Manifest (New-Rejected -entry $bad) } | Should Throw 'bytes'
        }
        $ok = New-Entry; $ok.bytes = Get-VideoScoutSchemaMaxDiagnosticBytes
        { Assert-VideoScoutManifestValid -Manifest (New-Rejected -entry $ok) } | Should Not Throw
    }
    It 'diagnosticArtifacts must be an array, never an object or null' {
        $m = New-V4; $m.diagnosticArtifacts = $null
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'must be an array'
        $m2 = New-V4; $m2.diagnosticArtifacts = [ordered]@{ kind = 'quality-rejected-response' }
        { Assert-VideoScoutManifestValid -Manifest $m2 } | Should Throw 'must be an array'
    }
    It 'version 4 REQUIRES the diagnosticArtifacts field' {
        $m = New-V4; $m.Remove('diagnosticArtifacts')
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Throw 'missing key'
    }
    It 'version 2 REJECTS a silently added diagnosticArtifacts key' {
        $v2 = New-VideoScoutLiveManifest -RunId 'r' -Url 'u' -AppliedMode 'video' -Route 'cli' -Model 'm' -MediaResolutionRequested 'MEDIUM'
        $v2.diagnosticArtifacts = @()
        { Assert-VideoScoutManifestValid -Manifest $v2 } | Should Throw 'unknown key'
    }

    # --- the three independent copies of the diagnostic contract must agree ----------------------
    It 'the schema, verifier, and SDK agree on the diagnostic bounds, leaf name, and code allowlist' {
        . (Join-Path $PSScriptRoot 'get-video-scout-diagnostic-artifact.ps1')
        (Get-VideoScoutSchemaMaxDiagnosticBytes) | Should Be (Get-VideoScoutMaxDiagnosticBytes)
        (Get-VideoScoutSchemaDiagnosticFileName) | Should Be (Get-VideoScoutDiagnosticFileName)
        ((Get-VideoScoutQualityReasonCodes) -join ',') | Should Be ((Get-VideoScoutQualityFailureCodes) -join ',')

        # The Node producer is the third copy: pin it from source so a one-sided edit fails loudly.
        $sdk = Get-Content -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) 'gemini-video-sdk.js') -Raw
        ($sdk -match 'MAX_DIAGNOSTIC_BYTES = 4 \* 1024 \* 1024') | Should Be $true
        ($sdk -match 'MAX_DIAGNOSTIC_CHARS = 1000000') | Should Be $true
        ($sdk -match "DIAGNOSTIC_FILENAME = 'rejected-response\.txt'") | Should Be $true
        foreach ($code in Get-VideoScoutQualityReasonCodes) {
            ($sdk -match [regex]::Escape("'$code'")) | Should Be $true
        }
    }
}
