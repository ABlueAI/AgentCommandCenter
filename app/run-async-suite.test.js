'use strict';
// Run: node app/run-async-suite.test.js
//
// The async-suite guard (test-helpers/run-async-suite.js) is what stops a stalled or
// empty suite from exiting 0. Each case runs the guard in a child Node process and
// checks its exit code and stderr, so removing any of its failure paths turns this red.

const { spawnSync } = require('child_process');
const path = require('path');
const { SUITE_TIMEOUT_MS } = require('./test-helpers/run-async-suite');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const HELPER = path.join(__dirname, 'test-helpers', 'run-async-suite.js');

function runChild(body, timeoutMs = 300) {
  const script = `const { runAsyncSuite } = require(${JSON.stringify(HELPER)});\n` +
    `runAsyncSuite('fixture', async () => { ${body} }, ${timeoutMs});\n`;
  return spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 15000 });
}

{
  const r = runChild('await new Promise(() => {}); return { passed: 1, failed: 0 };');
  assert(r.status === 1, 'a suite whose promise never settles exits 1');
  assert(/fixture: timed out after 300 ms/.test(r.stderr), 'a stalled suite names itself and the timeout on stderr');
}
{
  const r = runChild('return { passed: 0, failed: 0 };');
  assert(r.status === 1, 'a suite that ran no assertions exits 1');
  assert(/fixture: suite failed/.test(r.stderr) && /no assertions ran/.test(r.stderr), 'zero assertions is reported as "no assertions ran"');
}
{
  const r = runChild('return { passed: 3, failed: 1 };');
  assert(r.status === 1, 'a suite with a failed assertion exits 1');
}
{
  const r = runChild("throw new Error('boom');");
  assert(r.status === 1, 'a suite that throws exits 1');
  assert(/fixture: suite failed/.test(r.stderr) && /boom/.test(r.stderr), 'a thrown error is reported with the suite name');
}
{
  const r = runChild('return undefined;');
  assert(r.status === 1, 'a suite that returns no counts exits 1');
}
{
  // Negative control: a normal, finishing suite passes and doesn't wait for the deadline.
  const started = Date.now();
  const r = runChild('return { passed: 2, failed: 0 };', 10000);
  assert(r.status === 0, 'NEGATIVE CONTROL: a suite that finishes with passing assertions exits 0');
  assert(Date.now() - started < 8000, 'a finished suite exits without waiting for its deadline');
  assert(r.stderr === '', 'a passing suite writes nothing to stderr');
}
assert(SUITE_TIMEOUT_MS === 5000, 'the default deadline stays 5000 ms');

process.stdout.write(`\nrun-async-suite: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
