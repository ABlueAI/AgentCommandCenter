'use strict';
// Test fixture (never invoked in production): echoes back what a REAL node.exe process actually
// received in process.argv, so a Windows PowerShell 5.1 caller can prove a value survived the
// native argument boundary (PowerShell native-command serialization -> CreateProcess command line
// -> CommandLineToArgvW -> process.argv) BYTE-IDENTICALLY and as exactly ONE argv element.
//
// Why a real process is mandatory here: a PowerShell `function global:node` shadow receives the
// argument array verbatim and never crosses CommandLineToArgvW, so it CANNOT observe the quote
// stripping that broke the first V4 multi-slice acceptance attempt. Only node.exe can.
//
// Usage (mirrors the production shape):  node node-argv-echo.js --slice-ranges-json <value>
//        or, for a bare single argument:  node node-argv-echo.js <value>
// Emits:  ARGC:<number of arguments after the script>
//         B64:<base64 of the reported value>      (base64 removes console-encoding ambiguity)
//         JSONOK:<true|false>                     (does NODE's JSON.parse accept what arrived?)
//
// JSONOK is reported by this process on purpose. Windows PowerShell 5.1's ConvertFrom-Json is
// LENIENT -- it happily parses `[{startOffset:60}]` with unquoted keys -- so a PowerShell-side check
// would call the quote-stripped payload "valid" and hide the very defect under test. Node's
// JSON.parse is the actual production consumer (scripts/gemini-video-sdk.js resolveSliceRanges), so
// only its verdict is meaningful here.
// Reads nothing, writes nothing, opens no socket, needs no API key.
const args = process.argv.slice(2);
const value = (args[0] === '--slice-ranges-json' ? args[1] : args[0]) || '';
let jsonOk = false;
try { JSON.parse(value); jsonOk = true; } catch (e) { jsonOk = false; }
process.stdout.write('ARGC:' + args.length + '\n');
process.stdout.write('B64:' + Buffer.from(value, 'utf8').toString('base64') + '\n');
process.stdout.write('JSONOK:' + jsonOk + '\n');
