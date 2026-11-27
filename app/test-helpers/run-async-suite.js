'use strict';

const { writeSync } = require('node:fs');

const SUITE_TIMEOUT_MS = 5000;

async function runAsyncSuite(name, run) {
  // Keep Node alive even when the suite awaits a promise with no active handles.
  const deadline = setTimeout(() => {
    writeSync(2, `${name}: timed out after ${SUITE_TIMEOUT_MS} ms before all assertions finished\n`);
    process.exit(1);
  }, SUITE_TIMEOUT_MS);

  try {
    const { passed, failed } = await run();
    if (passed + failed === 0) throw new Error('no assertions ran');
    process.stdout.write(`\n${name}: ${passed} passed, ${failed} failed\n`);
    if (failed > 0) process.exitCode = 1;
  } catch (error) {
    console.error(`${name}: suite failed`, error);
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
  }
}

module.exports = { runAsyncSuite };
