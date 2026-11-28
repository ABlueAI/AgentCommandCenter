'use strict';

const { writeSync } = require('node:fs');

const SUITE_TIMEOUT_MS = 5000;

async function runAsyncSuite(name, run, timeoutMs = SUITE_TIMEOUT_MS) {
  // Keep Node alive even when the suite awaits a promise with no active handles.
  const deadline = setTimeout(() => {
    writeSync(2, `${name}: timed out after ${timeoutMs} ms before all assertions finished\n`);
    process.exit(1);
  }, timeoutMs);

  try {
    const { passed, failed } = await run();
    if (passed + failed === 0) throw new Error('no assertions ran');
    if (failed > 0) process.exitCode = 1;
  } catch (error) {
    console.error(`${name}: suite failed`, error);
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
  }
}

module.exports = { runAsyncSuite, SUITE_TIMEOUT_MS };
