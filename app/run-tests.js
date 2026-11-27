'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.worktrees', 'vendor', 'dist', 'source-material']);
const SKIPPED_TESTS = {
  'renderer/video-model-policy.test.js': {
    reason: 'Runs in the Pester gate through scripts/video-model-policy-node.Tests.ps1.',
    wrapper: 'scripts/video-model-policy-node.Tests.ps1',
  },
};

// Check the installed binary before any suite can trigger Electron's lazy download.
const RUN_FIRST = ['electron-binary.test.js'];

function getTestFiles() {
  const found = new Set();
  function walk(dir, prefix) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name)) {
        walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
        found.add(prefix + entry.name);
      }
    }
  }
  walk(__dirname, '');

  const stale = Object.keys(SKIPPED_TESTS).filter((file) => !found.delete(file));
  if (stale.length) throw new Error(`Stale skip-list entry: ${stale.join(', ')}`);

  const first = RUN_FIRST.filter((file) => found.delete(file));
  const files = [...first, ...[...found].sort()];
  if (!files.length) throw new Error('No test files to run.');
  return files;
}

function run() {
  const failures = [];
  for (const file of getTestFiles()) {
    console.log(`Running ${file}`);
    const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
      cwd: __dirname,
      stdio: 'inherit',
    });
    if (result.error) {
      failures.push(`${file} (${result.error.message})`);
    } else if (result.signal) {
      failures.push(`${file} (signal ${result.signal})`);
    } else if (result.status === 0) {
      continue;
    } else {
      failures.push(`${file} (exit ${result.status})`);
    }
    // Keep the first failure's code, as the old chain did, while running every suite.
    process.exitCode ||= result.status || 1;
  }

  if (failures.length) console.error(`\nFailed test files:\n  ${failures.join('\n  ')}`);
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(`Test runner: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { getTestFiles, SKIPPED_TESTS };
