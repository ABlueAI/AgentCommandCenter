$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$backfill = Join-Path $here 'backfill-video-scout-manifests.ps1'

Describe 'backfill-video-scout-manifests entry point' {
    It 'reports a legacy run in dry-run mode and writes it only with Apply' {
        $runName = 'run-20260701-120000-000-1234'
        $runDir = New-Item -ItemType Directory -Path (Join-Path $TestDrive $runName) -ErrorAction Stop
        $manifest = Join-Path $runDir.FullName 'manifest.json'

        $preview = & $backfill -BaseDir $TestDrive
        $preview.Applied | Should Be $false
        ($preview.Backfilled -join ', ') | Should Be $runName
        Test-Path -LiteralPath $manifest | Should Be $false

        $result = & $backfill -BaseDir $TestDrive -Apply
        $result.Applied | Should Be $true
        Test-Path -LiteralPath $manifest -PathType Leaf | Should Be $true
    }

    It 'throws when the supplied downloads root is missing' {
        $missingRoot = Join-Path $TestDrive 'missing-downloads'
        { & $backfill -BaseDir $missingRoot } | Should Throw 'Backfill refused'
    }
}
