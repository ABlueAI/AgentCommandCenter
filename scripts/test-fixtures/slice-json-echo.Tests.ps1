$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$echo = Join-Path $here 'slice-json-echo.ps1'

Describe 'slice-json-echo fixture' {
    It 'returns the supplied JSON as one UTF-8 base64 record' {
        $json = '[{"startOffset":60,"label":"' + [char]0x2014 + '"}]'
        $result = @(& $echo -SliceRangesJson $json)
        $result.Count | Should Be 1
        $result[0] | Should Match '^SLICEJSON:'
        $decoded = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($result[0].Substring(10)))
        $decoded | Should BeExactly $json
    }
}
