<#
.SYNOPSIS
  Pester tests for the V4 bounded multi-slice control-argument helper
  (lib/get-video-scout-slice-ranges.ps1).
.DESCRIPTION
  Pure parse/validate/compose logic only -- no network, no yt-dlp, no provider call, no API key, no
  filesystem writes. Covers the whole contract feed-gemini.ps1 re-enforces independently of the
  Electron main boundary: the 2048-unit bound BEFORE parsing, JSON array shape (including the PS 5.1
  object/singleton coercion edge cases), exact per-entry keys, 2-8 count, integer 0..86400 offsets,
  end > start, chronological non-overlap in the GIVEN order, the FIXED 1800s aggregate cap, the
  override refusal, canonical re-serialization, and the deterministic scope instruction.
  Run: Invoke-Pester -Path scripts\lib\get-video-scout-slice-ranges.Tests.ps1
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'get-video-scout-slice-ranges.ps1')

$S2 = '[{"startOffset":10,"endOffset":30},{"startOffset":60,"endOffset":90}]'

Describe 'ConvertFrom-VideoScoutSliceRangesJson: accepts a valid bounded slice set' {
    It 'parses two chronological slices in the ORDER GIVEN, with exact int offsets' {
        $r = @(ConvertFrom-VideoScoutSliceRangesJson -Json $S2)
        $r.Count | Should Be 2
        $r[0].StartOffset | Should Be 10
        $r[0].EndOffset   | Should Be 30
        $r[1].StartOffset | Should Be 60
        $r[1].EndOffset   | Should Be 90
    }
    It 'allows ADJACENT slices (current start == previous end)' {
        $r = @(ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,"endOffset":20},{"startOffset":20,"endOffset":30}]')
        $r.Count | Should Be 2
    }
    It 'accepts the maximum 8 slices at exactly the 1800s aggregate cap (inclusive)' {
        $entries = 0..7 | ForEach-Object { '{"startOffset":' + ($_ * 400) + ',"endOffset":' + ($_ * 400 + 225) + '}' }
        $json = '[' + ($entries -join ',') + ']'
        $r = @(ConvertFrom-VideoScoutSliceRangesJson -Json $json)
        $r.Count | Should Be 8
        $agg = 0; foreach ($x in $r) { $agg += ($x.EndOffset - $x.StartOffset) }
        $agg | Should Be 1800
    }
    It 'accepts 0 as a start offset (the very beginning of the video)' {
        $r = @(ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":0,"endOffset":10},{"startOffset":20,"endOffset":30}]')
        $r[0].StartOffset | Should Be 0
    }
    It 'accepts the maximum offset value 86400' {
        $r = @(ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,"endOffset":20},{"startOffset":86390,"endOffset":86400}]')
        $r[1].EndOffset | Should Be 86400
    }
}

Describe 'ConvertFrom-VideoScoutSliceRangesJson: serialized bound is enforced BEFORE parsing' {
    It 'refuses a payload longer than 2048 UTF-16 units' {
        $entries = 0..199 | ForEach-Object { '{"startOffset":1,"endOffset":2}' }
        $json = '[' + ($entries -join ',') + ']'
        $json.Length | Should BeGreaterThan 2048
        { ConvertFrom-VideoScoutSliceRangesJson -Json $json } | Should Throw '2048-unit bound'
    }
    It 'refuses a null / blank argument rather than treating it as "no slices"' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json $null } | Should Throw
        { ConvertFrom-VideoScoutSliceRangesJson -Json '' } | Should Throw
        { ConvertFrom-VideoScoutSliceRangesJson -Json '   ' } | Should Throw
    }
}

Describe 'ConvertFrom-VideoScoutSliceRangesJson: JSON shape and PS 5.1 coercion edge cases' {
    It 'refuses malformed JSON' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,' } | Should Throw 'not valid JSON'
    }
    It 'refuses a bare JSON OBJECT (PSCustomObject must never masquerade as a 1-entry array)' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '{"startOffset":10,"endOffset":30}' } | Should Throw 'must be a JSON array'
    }
    It 'refuses a JSON scalar / string payload' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '42' } | Should Throw 'must be a JSON array'
        { ConvertFrom-VideoScoutSliceRangesJson -Json '"[]"' } | Should Throw 'must be a JSON array'
    }
    It 'refuses a SINGLE-element array (PS 5.1 unwraps it; the count gate must still see 1)' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,"endOffset":30}]' } | Should Throw '2 to 8 slices'
    }
    It 'refuses an empty array' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[]' } | Should Throw '2 to 8 slices'
    }
    It 'refuses 9 slices' {
        $entries = 0..8 | ForEach-Object { '{"startOffset":' + ($_ * 20) + ',"endOffset":' + ($_ * 20 + 10) + '}' }
        { ConvertFrom-VideoScoutSliceRangesJson -Json ('[' + ($entries -join ',') + ']') } | Should Throw '2 to 8 slices'
    }
    It 'refuses a null entry' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,"endOffset":30},null]' } | Should Throw
    }
    It 'refuses a nested-array entry' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,"endOffset":30},[60,90]]' } | Should Throw
    }
    It 'refuses a scalar entry' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,"endOffset":30},5]' } | Should Throw
    }
}

Describe 'ConvertFrom-VideoScoutSliceRangesJson: exact entry keys' {
    It 'refuses an extra key' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,"endOffset":30},{"startOffset":60,"endOffset":90,"label":"x"}]' } |
            Should Throw 'exactly the keys'
    }
    It 'refuses a missing key' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,"endOffset":30},{"startOffset":60}]' } |
            Should Throw 'exactly the keys'
    }
    It 'refuses a renamed/manifest-style key (startOffsetSeconds is the MANIFEST spelling, not the transport one)' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,"endOffset":30},{"startOffsetSeconds":60,"endOffsetSeconds":90}]' } |
            Should Throw 'exactly the keys'
    }
}

Describe 'ConvertFrom-VideoScoutSliceRangesJson: offset types and bounds' {
    It 'refuses a FRACTIONAL offset (never silently truncated to an int)' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,"endOffset":30},{"startOffset":60.5,"endOffset":90}]' } |
            Should Throw 'whole number'
    }
    It 'refuses a STRING offset (never coerced)' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,"endOffset":30},{"startOffset":"60","endOffset":90}]' } |
            Should Throw 'whole number'
    }
    It 'refuses a null offset' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,"endOffset":30},{"startOffset":null,"endOffset":90}]' } |
            Should Throw 'whole number'
    }
    It 'refuses a boolean offset' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,"endOffset":30},{"startOffset":true,"endOffset":90}]' } |
            Should Throw 'whole number'
    }
    It 'refuses a negative offset' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":-1,"endOffset":30},{"startOffset":60,"endOffset":90}]' } |
            Should Throw 'from 0 to 86400'
    }
    It 'refuses an offset beyond 86400' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,"endOffset":30},{"startOffset":60,"endOffset":86401}]' } |
            Should Throw 'from 0 to 86400'
    }
}

Describe 'ConvertFrom-VideoScoutSliceRangesJson: per-slice and cross-slice ordering' {
    It 'refuses a zero-length slice (end == start)' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,"endOffset":30},{"startOffset":90,"endOffset":90}]' } |
            Should Throw 'strictly after'
    }
    It 'refuses a reversed slice (end < start)' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,"endOffset":30},{"startOffset":90,"endOffset":60}]' } |
            Should Throw 'strictly after'
    }
    It 'refuses OVERLAPPING slices' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,"endOffset":30},{"startOffset":20,"endOffset":40}]' } |
            Should Throw 'chronological and non-overlapping'
    }
    It 'refuses DUPLICATE slices' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,"endOffset":30},{"startOffset":10,"endOffset":30}]' } |
            Should Throw 'chronological and non-overlapping'
    }
    It 'refuses OUT-OF-ORDER slices and never silently reorders them' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":100,"endOffset":200},{"startOffset":10,"endOffset":50}]' } |
            Should Throw 'never reordered or merged'
    }
    It 'refuses a fully CONTAINED slice (a subset is still an overlap, never merged away)' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":10,"endOffset":100},{"startOffset":20,"endOffset":30}]' } |
            Should Throw 'chronological and non-overlapping'
    }
}

Describe 'ConvertFrom-VideoScoutSliceRangesJson: the FIXED aggregate cap' {
    It 'refuses an aggregate of 1801s (one second over)' {
        $entries = 0..6 | ForEach-Object { '{"startOffset":' + ($_ * 400) + ',"endOffset":' + ($_ * 400 + 225) + '}' }
        $entries += '{"startOffset":2800,"endOffset":3026}'   # 226s -> 1575 + 226 = 1801
        { ConvertFrom-VideoScoutSliceRangesJson -Json ('[' + ($entries -join ',') + ']') } |
            Should Throw 'exceeds the fixed 1800s multi-slice cap'
    }
    It 'refuses a two-slice set whose aggregate exceeds the cap even though each slice is legal alone' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":0,"endOffset":1700},{"startOffset":2000,"endOffset":2200}]' } |
            Should Throw 'exceeds the fixed 1800s multi-slice cap'
    }
    It 'names -MaxDurationSeconds as unable to raise the cap' {
        { ConvertFrom-VideoScoutSliceRangesJson -Json '[{"startOffset":0,"endOffset":1700},{"startOffset":2000,"endOffset":2200}]' } |
            Should Throw 'cannot be raised with -MaxDurationSeconds'
    }
}

Describe 'Get-VideoScoutSliceRangeSet: the entry point feed-gemini.ps1 calls' {
    It 'returns $null when no slice argument was provided (whole-video / single-slice runs unaffected)' {
        Get-VideoScoutSliceRangeSet -SliceRangesJson $null | Should BeNullOrEmpty
        Get-VideoScoutSliceRangeSet -SliceRangesJson $S2 | Should BeNullOrEmpty
    }
    It 'returns the ranges, count, and aggregate when provided' {
        $set = Get-VideoScoutSliceRangeSet -SliceRangesJson $S2 -Provided
        $set.Count | Should Be 2
        $set.AggregateSeconds | Should Be 50
        @($set.Ranges).Count | Should Be 2
    }
    It 'throws (never returns a partial set) when the payload is invalid' {
        { Get-VideoScoutSliceRangeSet -SliceRangesJson '[]' -Provided } | Should Throw
    }
}

Describe 'ConvertTo-VideoScoutSliceRangesJson: canonical re-serialization' {
    It 'rebuilds compact canonical JSON from the VALIDATED values' {
        $set = Get-VideoScoutSliceRangeSet -SliceRangesJson $S2 -Provided
        ConvertTo-VideoScoutSliceRangesJson -Ranges $set.Ranges | Should Be $S2
    }
    It 'round-trips: canonical output re-parses to the identical slice set' {
        $set = Get-VideoScoutSliceRangeSet -SliceRangesJson $S2 -Provided
        $again = @(ConvertFrom-VideoScoutSliceRangesJson -Json (ConvertTo-VideoScoutSliceRangesJson -Ranges $set.Ranges))
        $again.Count | Should Be 2
        $again[1].StartOffset | Should Be 60
    }
    It 'normalizes cosmetic whitespace in the caller payload away (the SDK receives canonical bytes)' {
        $spaced = '[ { "startOffset" : 10 , "endOffset" : 30 } , { "startOffset" : 60 , "endOffset" : 90 } ]'
        $set = Get-VideoScoutSliceRangeSet -SliceRangesJson $spaced -Provided
        ConvertTo-VideoScoutSliceRangesJson -Ranges $set.Ranges | Should Be $S2
    }
}

Describe 'Assert-MultiSliceOverrideAllowed: the fixed cap cannot be overridden' {
    It 'permits a multi-slice run with no override (0 = unset)' {
        { Assert-MultiSliceOverrideAllowed -MaxDurationSeconds 0 } | Should Not Throw
    }
    It 'REFUSES visibly when -MaxDurationSeconds accompanies slices (never silently ignored)' {
        { Assert-MultiSliceOverrideAllowed -MaxDurationSeconds 3600 } | Should Throw 'cannot be used with a multi-slice request'
    }
    It 'refuses even an override BELOW the cap (the cap is fixed, not a ceiling to negotiate)' {
        { Assert-MultiSliceOverrideAllowed -MaxDurationSeconds 60 } | Should Throw 'cannot be used with a multi-slice request'
    }
}

Describe 'Add-SliceScopeToPrompt: deterministic, structure-preserving scope instruction' {
    $ranges = @(ConvertFrom-VideoScoutSliceRangesJson -Json $S2)
    It 'preserves the base prompt verbatim as the prefix' {
        (Add-SliceScopeToPrompt -BasePrompt 'BASE BRIEF' -Ranges $ranges).StartsWith('BASE BRIEF') | Should Be $true
    }
    It 'names the slice count and lists chronological labels with exact offsets and lengths' {
        $t = Add-SliceScopeToPrompt -BasePrompt 'B' -Ranges $ranges
        $t | Should Match '2 AUTHORIZED VIDEO SLICES'
        $t | Should Match '- Slice 1: 10s to 30s \(20s\)'
        $t | Should Match '- Slice 2: 60s to 90s \(30s\)'
    }
    It 'states that ONLY those slices are authorized' {
        Add-SliceScopeToPrompt -BasePrompt 'B' -Ranges $ranges | Should Match 'ONLY these explicit slices are authorized'
    }
    It 'asks for per-slice attribution so slices stay distinguishable in the report' {
        Add-SliceScopeToPrompt -BasePrompt 'B' -Ranges $ranges | Should Match 'distinguishable'
    }
    It 'preserves the required report structure incl. the leading TL;DR header' {
        $t = Add-SliceScopeToPrompt -BasePrompt 'B' -Ranges $ranges
        $t | Should Match '## 1\. TL;DR'
        $t | Should Match 'the same sections, the same headers'
    }
    It 'leaks no transport/tool-call internals into the prompt' {
        $t = Add-SliceScopeToPrompt -BasePrompt 'B' -Ranges $ranges
        $t | Should Not Match 'slice-ranges-json'
        $t | Should Not Match 'videoMetadata'
        $t | Should Not Match 'fileData'
    }
    It 'is deterministic: identical input produces identical text' {
        (Add-SliceScopeToPrompt -BasePrompt 'B' -Ranges $ranges) |
            Should Be (Add-SliceScopeToPrompt -BasePrompt 'B' -Ranges $ranges)
    }
}
