'use strict';
// Run: node app/launchers.test.js
// Plain Node.js -- no framework. Proves the launcher arg builders keep the directory path as a
// discrete argv element, and (the real point) that spawning with shell:false passes a path full of
// shell metacharacters to the child LITERALLY -- never shell-interpreted (AUDIT #7).

const { spawnSync } = require('child_process');
const { openVscodeSpec, openTerminalSpec, IS_WIN } = require('./launchers');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// A directory name carrying every metacharacter that a shell (cmd.exe OR sh under WSL) would act on:
// command substitution, backticks, background/pipe. All are LEGAL in a directory name.
const META = 'C:\\repos\\proj $(whoami) `id` & echo x | dir';

// --- open-terminal: path is a discrete, verbatim argv element (no quotes, no concatenation) ------
{
  const s = openTerminalSpec(META);
  assert(s.cmd === 'wt', 'open-terminal spawns wt directly (App Execution Alias, shell:false-safe)');
  assert(s.args[s.args.length - 1] === META, 'the path is the LAST argv element, byte-for-byte (no quote-wrapping)');
  assert(s.args.filter((a) => a === META).length === 1 && s.args.indexOf('-d') === s.args.length - 2, 'path follows -d as its own element');
  assert(!s.args.some((a) => a !== META && /[$`&|]/.test(a)), 'no other arg carries shell metacharacters');
}

// --- open-vscode: code is a .cmd -> routed through cmd.exe with path as a DISCRETE argv element ---
{
  const s = openVscodeSpec(META);
  if (IS_WIN) {
    assert(/cmd\.exe$/i.test(s.cmd) || s.cmd === process.env.ComSpec, 'open-vscode (win) invokes cmd.exe explicitly, not a bare .cmd');
    assert(s.args.slice(0, 4).join(' ') === '/d /s /c code', 'cmd.exe args are /d /s /c code, then the path');
    assert(s.args[s.args.length - 1] === META, 'the path is a discrete final argv element (Node escapes it; sh never sees it)');
    assert(s.args.length === 5, 'exactly one path argument -- not spliced into the code token');
  } else {
    assert(s.cmd === 'code' && s.args.length === 1 && s.args[0] === META, 'open-vscode (non-win) spawns code with the path as its only, literal argv');
  }
}

// --- open-vscode: a '%' path is REFUSED on Windows (cmd.exe /c would expand %VAR%) ---------------
{
  const s = openVscodeSpec('C:\\repos\\%PATH%\\proj');
  if (IS_WIN) {
    assert(!!s.error && !s.args && !s.cmd, 'open-vscode (win) REFUSES a %VAR% path -- returns an error, nothing to launch');
    assert(/%/.test(s.error), 'the refusal names the % problem so the user can fix it');
  } else {
    assert(!s.error && s.args.length === 1 && s.args[0] === 'C:\\repos\\%PATH%\\proj', 'off-win, % is literal (code spawned directly, no cmd.exe expansion)');
  }
}

// --- THE PROOF: shell:false passes a metacharacter path to the child as a literal argument --------
// Spawn node itself (cross-platform, no VS Code / wt needed) and echo back the argument it received.
// If any shell were in the loop, $(whoami)/`id` would be substituted and &/| would split the command.
{
  const r = spawnSync(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', META], { shell: false });
  assert(!r.error, 'shell:false spawn of a metacharacter-laden argv does not error');
  assert(r.status === 0, 'child exits cleanly (the & / | did not split it into extra commands)');
  assert(r.stdout.toString() === META, 'the child received the path BYTE-FOR-BYTE -- no shell interpretation');
}

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
