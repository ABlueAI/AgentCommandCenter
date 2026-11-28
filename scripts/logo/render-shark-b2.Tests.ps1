$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$suite = Join-Path $here 'render-shark-b2.test.py'

Describe 'render-shark-b2' {
    It 'packs all requested icon sizes and writes a preview with Pillow stubbed' {
        $python = (@(Get-Command python -CommandType Application -ErrorAction Stop)[0]).Source
        $output = & $python -I $suite
        $LASTEXITCODE | Should Be 0
        ($output -join "`n") | Should Match 'render-shark-b2 ICO directory passed'
    }
}
