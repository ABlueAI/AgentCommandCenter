'use strict';
// Run: node app/single-instance.test.js
// Pure behavior tests plus source tripwires for Electron startup wiring. No Electron app, provider,
// PTY, hook, server, or remote TUI is launched by this suite.

const fs = require('fs');
const path = require('path');
const { RESULT, focusExistingWindow } = require('./single-instance');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}

process.stdout.write('\n-- second-instance window behavior --\n');
{
  const calls = [];
  const logs = [];
  const win = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
  };
  const result = focusExistingWindow(() => win, (line) => logs.push(line));
  assert(result.ok === true && result.reason === RESULT.FOCUSED, 'a live existing window is handled');
  assert(JSON.stringify(calls) === JSON.stringify(['restore', 'show', 'focus']),
    'a minimized window is restored, shown, and focused in order');
  assert(logs.length === 1 && /restored and focused/.test(logs[0]),
    'the primary process reports the visible second-launch outcome');
}
{
  const calls = [];
  const result = focusExistingWindow(() => ({
    isDestroyed: () => false,
    isMinimized: () => false,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
  }));
  assert(result.ok === true, 'a non-minimized existing window is focused');
  assert(JSON.stringify(calls) === JSON.stringify(['show', 'focus']), 'restore is not called unnecessarily');
}
{
  const logs = [];
  const absent = focusExistingWindow(() => null, (line) => logs.push(line));
  assert(absent.ok === false && absent.reason === RESULT.NO_WINDOW,
    'a second launch during primary startup returns a bounded no-window result');
  assert(logs.length === 1 && !/undefined|null/.test(logs[0]), 'the no-window log is bounded metadata only');
}
{
  const destroyed = focusExistingWindow(() => ({ isDestroyed: () => true }));
  assert(destroyed.ok === false && destroyed.reason === RESULT.NO_WINDOW,
    'a destroyed primary window is never operated on');
}
{
  const logs = [];
  const failedResult = focusExistingWindow(() => ({
    isDestroyed: () => false, isMinimized: () => false,
    show: () => { throw new Error('SECRET-WINDOW-ERROR'); },
  }), (line) => logs.push(line));
  assert(failedResult.ok === false && failedResult.reason === RESULT.FOCUS_FAILED,
    'a focus failure is contained and returned as a bounded reason');
  assert(logs.join('\n').indexOf('SECRET-WINDOW-ERROR') === -1, 'focus errors do not leak exception content');
}

process.stdout.write('\n-- main-process startup wiring --\n');
{
  const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert((src.match(/requestSingleInstanceLock\(\)/g) || []).length === 1,
    'main requests the Electron single-instance lock exactly once');
  assert(/if \(!hasSingleInstanceLock\)[\s\S]*?app\.quit\(\)/.test(src),
    'the losing process quits before creating a window');
  assert(/app\.on\('second-instance',[\s\S]*?focusExistingWindow\(\(\) => win/.test(src),
    'the primary process handles second-instance by focusing its existing window');
  assert(/if \(hasSingleInstanceLock\) app\.whenReady\(\)\.then/.test(src),
    'only the lock-owning process enters the ready/createWindow path');
}

process.stdout.write(`\nsingle-instance: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
