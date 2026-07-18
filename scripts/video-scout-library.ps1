<#
.SYNOPSIS
  V5b2 single Video Scout Library boundary. ONE entry point, two actions (List, Read), invoked by the
  main process via execFile (shell-free): a discrete -RunRoot argument (main-owned; the renderer never
  supplies or modifies it) plus, for Read, a main-issued -RunId.
.DESCRIPTION
  Execution contract (enforced by the caller in main.js): powershell.exe -NoProfile
  -ExecutionPolicy Bypass -File <this> ... with shell disabled, a fixed timeout, and bounded
  stdout/stderr. This script guarantees JSON-ONLY stdout: exactly one JSON document, always. It never
  emits report text or manifest-derived strings to stderr/Logs; any failure is reported as a bounded
  JSON object with a reason constant. video-scout-manifest-schema.ps1 remains the SOLE manifest
  validator (loaded here); there is no manifest validation in JavaScript.
.PARAMETER Action
  List  -- enumerate + project bounded metadata for every valid run under -RunRoot.
  Read  -- resolve one main-issued -RunId to its bounded, re-validated report (plain text on success).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('List', 'Read')][string]$Action,
    [Parameter(Mandatory = $true)][string]$RunRoot,
    [string]$RunId
)

$ErrorActionPreference = 'Stop'
# JSON payloads carry sanitized manifest-derived strings (titles) and report text that may contain
# non-ASCII; emit UTF-8 so main decodes it losslessly (main reads stdout as a UTF-8 buffer). Scoped
# to this short-lived process only.
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }

# Emit exactly one JSON document to stdout and nothing else.
function Write-JsonResult {
    param([Parameter(Mandatory)]$Object)
    $json = $Object | ConvertTo-Json -Depth 6 -Compress
    [Console]::Out.Write($json)
}

try {
    . (Join-Path $PSScriptRoot 'lib\video-scout-manifest-schema.ps1')
    . (Join-Path $PSScriptRoot 'lib\video-scout-library-core.ps1')

    if ($Action -eq 'List') {
        Write-JsonResult (Invoke-VideoScoutLibraryList -RunRoot $RunRoot)
    }
    else {
        if ([string]::IsNullOrEmpty($RunId)) {
            Write-JsonResult @{ ok = $false; status = 'unsafe'; reason = 'run-id-required' }
        }
        else {
            Write-JsonResult (Invoke-VideoScoutLibraryRead -RunRoot $RunRoot -RunId $RunId)
        }
    }
    exit 0
}
catch {
    # Fail closed with a BOUNDED constant. The real exception message can contain hostile
    # manifest/path text, so it is never surfaced.
    try { Write-JsonResult @{ ok = $false; status = 'error'; reason = 'internal-error' } } catch { }
    exit 1
}
