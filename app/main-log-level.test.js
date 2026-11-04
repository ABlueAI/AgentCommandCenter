'use strict';
// Run: node app/main-log-level.test.js
// S31 item 5: routine main-process lines show as "[main]", refusals and failures as "[main error]".

const { CHANNEL, channelFor } = require('./main-log-level');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const routine = [
  '[TIMING +12ms] pty-start: START pane-1',
  '[TIMING +40ms] env built for pane-1',
  '[admission] run created; allowance 5, admitted 0',
  '[admission] pane bound; remaining 5',
  '[admission] admitted 1/5; remaining 4',
  '[usage] panel refreshed',
];
for (const l of routine) assert(channelFor(l, 'routine') === CHANNEL.INFO, `routine: ${l}`);

const failures = [
  '[TIMING +3ms] pty-start refused [classify]: classify-fenced-initial-prompt-refused',
  '[TIMING +3ms] new-agent: REFUSED invalid task: bad',
  '[admission] REFUSED: allowance of 5 is fully consumed; nothing was written to the PTY',
  '[admission] admission 2/5 CONSUMED but the PTY write failed; not refunded',
  '[admission] run NOT started: ledger-unreadable.',
  '[TIMING +9ms] Fenced launch refused [x]',
  '[TIMING +1ms] uncaught exception',
  '[TIMING +1ms] Agent pane started WITHOUT the ABlueAgent token',
  '[TIMING +1ms] git worktree add error: exit 128',
  '[TIMING +1ms] could not read settings',
];
for (const l of failures) assert(channelFor(l, 'routine') === CHANNEL.ERROR, `a refusal or failure stays an error: ${l}`);

for (const kind of [undefined, null, 'error', 'refusal', 'ROUTINE']) {
  assert(channelFor('[admission] pane bound; remaining 5', kind) === CHANNEL.ERROR, `kind ${String(kind)}: error by default`);
}
assert(channelFor(undefined, 'routine') === CHANNEL.INFO && channelFor(null, 'routine') === CHANNEL.INFO, 'an empty routine line is info');
assert(CHANNEL.ERROR === 'main-error' && CHANNEL.INFO === 'main-info' && Object.isFrozen(CHANNEL), 'the two channel names');

// Wiring: main uses the classifier for timing, usage and admission lines; preload exposes the info
// channel; the renderer labels it "[main]".
const fs = require('fs');
const path = require('path');
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, 'renderer', 'app.js'), 'utf8');
assert(/function sendMainLog\(line, kind\)/.test(main) && /channelFor\(line, kind\)/.test(main), 'main has one sender that uses channelFor');
assert(/const line = `\[TIMING \+\$\{elapsed\}ms\] \$\{msg\}`;\s*console\.log\(line\);\s*sendMainLog\(line, 'routine'\);/.test(main),
  'timing lines go through it as routine');
assert(/logUsage: \(line\) => \{\s*console\.log\(line\);\s*sendMainLog\(line, 'routine'\);/.test(main), 'usage lines go through it as routine');
assert(/log: \(line\) => \{ tlog\(line\); sendMainLog\(line, 'routine'\); \}/.test(main), 'admission budget lines go through it as routine');
assert(/onMainInfo: \(cb\) => ipcRenderer\.on\('main-info', \(_e, m\) => cb\(m\)\)/.test(preload), 'preload exposes main-info (receive only)');
assert(/cc\.onMainInfo\(\(m\) => appendLog\('\\n\[main\] ' \+ m \+ '\\n'\)\)/.test(app), 'the renderer labels it [main]');
assert(/cc\.onMainError\(\(m\) => appendLog\('\\n\[main error\] ' \+ m \+ '\\n'\)\)/.test(app), 'errors keep [main error]');

process.stdout.write(`\nmain-log-level: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
