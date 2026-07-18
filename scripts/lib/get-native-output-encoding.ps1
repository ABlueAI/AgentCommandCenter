<#
.SYNOPSIS
  V5b1 content acceptance (FAIL 2): the single source of truth for the console output encoding that
  Windows PowerShell 5.1 must use to DECODE a native child process's stdout bytes.
.DESCRIPTION
  PS 5.1 decodes the bytes a native process writes to stdout using [Console]::OutputEncoding. In the
  Electron app PTY that value is the legacy OEM console code page (CP437 on a US install), so a
  provider that emits UTF-8 (Gemini's analysis contains en/em dashes and other non-ASCII) arrived
  MOJIBAKED: the UTF-8 bytes for U+2013 (0xE2 0x80 0x93) decoded as CP437 became the three code
  points U+0393 U+00C7 U+00F4 -- exactly the corruption seen in live acceptance -- and that corrupted
  text was what the bounded collector then persisted to analysis-output.txt.

  The fix is to scope [Console]::OutputEncoding to UTF-8 (no BOM) ONLY around the native capture, then
  restore the previous value in a finally, so it is never a process-wide permanent change. This is a
  CORRECT decode at the native boundary -- NOT a mojibake-replacement parser. It fixes both the
  persisted report and the live pane stream (the same decoded string is what streams). Proven
  end-to-end, under a forced CP437 console with real node, by
  scripts/lib/native-output-encoding.Tests.ps1.

  Kept in one helper so both native-capture sites in feed-gemini.ps1 (the SDK route and the CLI
  route) and the execution test construct the byte-for-byte same encoding object.
#>
function New-NativeOutputEncoding {
    # UTF-8 WITHOUT a BOM: [Console]::OutputEncoding is a decode setting for native stdout bytes; a
    # BOM-emitting encoding is never wanted here (the constructor arg $false disables the BOM).
    New-Object System.Text.UTF8Encoding $false
}
