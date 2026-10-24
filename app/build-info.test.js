'use strict';
// Run: node app/build-info.test.js
//
// The visible build label names the real version and commit, and never guesses when git is missing.

const { readBuildInfo, formatBuildLabel } = require('./build-info');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function eq(a, b, label) { assert(a === b, `${label} (got ${JSON.stringify(a)})`); }

const fakeGit = (answers) => async (args) => {
  const key = args.join(' ');
  if (!(key in answers)) return '';
  const v = answers[key];
  if (v instanceof Error) throw v;
  return v;
};

(async () => {
  {
    const info = await readBuildInfo({
      version: '1.0.0',
      runGit: fakeGit({ 'rev-parse --short HEAD': 'f57066c', 'rev-parse --abbrev-ref HEAD': 'main', 'status --porcelain --untracked-files=no': '' }),
    });
    eq(info.label, 'Mako 1.0.0 · main@f57066c', 'a clean checkout shows version, branch and commit');
    eq(info.dirty, false, 'and is not dirty');
  }
  {
    const info = await readBuildInfo({
      version: '1.0.0',
      runGit: fakeGit({ 'rev-parse --short HEAD': 'f57066c', 'rev-parse --abbrev-ref HEAD': 'main', 'status --porcelain --untracked-files=no': ' M app/main.js' }),
    });
    eq(info.label, 'Mako 1.0.0 · main@f57066c + local edits', 'tracked local edits are called out');
  }
  {
    const info = await readBuildInfo({
      version: '1.0.0',
      runGit: fakeGit({ 'rev-parse --short HEAD': 'f57066c', 'rev-parse --abbrev-ref HEAD': 'HEAD', 'status --porcelain --untracked-files=no': '' }),
    });
    eq(info.label, 'Mako 1.0.0 · f57066c', 'a detached HEAD shows the commit alone');
  }
  {
    const info = await readBuildInfo({ version: '1.0.0', runGit: fakeGit({}) });
    eq(info.commit, null, 'no git answer leaves the commit null');
    eq(info.label, 'Mako 1.0.0 · commit unknown', 'and the label says unknown instead of guessing');
  }
  {
    const info = await readBuildInfo({
      version: '1.0.0',
      runGit: fakeGit({ 'rev-parse --short HEAD': new Error('git missing'), 'rev-parse --abbrev-ref HEAD': new Error('git missing') }),
    });
    eq(info.label, 'Mako 1.0.0 · commit unknown', 'a throwing git is handled, never a crash');
  }
  {
    const info = await readBuildInfo({
      version: '1.0.0',
      runGit: fakeGit({ 'rev-parse --short HEAD': 'fatal: not a git repository', 'rev-parse --abbrev-ref HEAD': 'main' }),
    });
    eq(info.commit, null, 'non-SHA output is not shown as a commit');
  }
  {
    const info = await readBuildInfo({
      version: '1.0.0',
      runGit: fakeGit({ 'rev-parse --short HEAD': 'f57066c', 'rev-parse --abbrev-ref HEAD': '<img src=x>', 'status --porcelain --untracked-files=no': '' }),
    });
    eq(info.branch, null, 'a branch name with unexpected characters is dropped');
  }
  eq(formatBuildLabel({ version: null, commit: null }), 'Mako · commit unknown', 'no version and no commit still renders');
  // S07: the dev copy names itself in the title and build badge; anything but a short lowercase tag is dropped.
  {
    const info = await readBuildInfo({
      version: '1.0.0',
      instanceTag: 'dev',
      runGit: fakeGit({ 'rev-parse --short HEAD': 'f57066c', 'rev-parse --abbrev-ref HEAD': 'claude/x', 'status --porcelain --untracked-files=no': '' }),
    });
    eq(info.label, 'Mako (dev) 1.0.0 · claude/x@f57066c', 'the dev copy is labelled (dev)');
    eq(info.instanceTag, 'dev', 'and reports its tag');
  }
  eq(formatBuildLabel({ version: '1.0.0', instanceTag: null, commit: 'f57066c', branch: 'main' }), 'Mako 1.0.0 · main@f57066c', 'the stable copy keeps the plain label');
  eq(formatBuildLabel({ version: '1.0.0', instanceTag: '<b>x</b>', commit: 'f57066c', branch: 'main' }), 'Mako 1.0.0 · main@f57066c', 'an unexpected tag is dropped');

  const pkg = require('./package.json');
  eq(pkg.version, '1.0.0', 'package.json carries the 1.0.0 release version');

  process.stdout.write(`\nbuild-info: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
