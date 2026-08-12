'use strict';
// Run: node app/prototype-pane-status/pane-status-runner.test.js
//
// EXPERIMENT A — PROTOTYPE ONLY. docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: PROTOTYPE
//
// REVISION 2 suite. Two findings converge here:
//
//   * HIGH — a fresh-process second `install` could overwrite the genuine recovery copy and identity
//     sidecar with already-patched state, then "prove" restoration to the patched file.
//   * LOW  — `listen` printed the bearer token to stdout. The live probe never called it, but the
//     PATH existed, and kill-criterion 3 is only honestly answerable if no such path exists.
//
// Every command mode is actually EXECUTED here, against a disposable temp tree (via the runner's
// EXPERIMENT_SETTINGS_PATH / EXPERIMENT_WORK_DIR overrides), and every byte of stdout and stderr is
// scanned for anything token-shaped. Nothing touches Blue's real ~/.claude.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function eq(a, b, label) { assert(a === b, `${label} (got ${JSON.stringify(a)})`); }

const RUNNER = path.join(__dirname, 'run-experiment-a.js');
// A 64-char lowercase hex run is exactly the token shape. Scanning for the SHAPE rather than for a
// known value is the point: the runner mints its own token, so a test that only looked for a value it
// supplied would miss the very leak this file exists to prevent.
const TOKEN_SHAPE = /[0-9a-f]{64}/;
const PIPE_SHAPE = /\\\\\.\\pipe\\blue-helm-pane-status-[0-9a-f]+/;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pane-status-runner-'));
const SETTINGS = path.join(tmp, 'settings.json');
const WORK = path.join(tmp, 'work');
const BACKUP = path.join(WORK, 'claude-settings.backup');
const IDENTITY = path.join(WORK, 'identity.json');

function run(mode, extraEnv) {
  const r = spawnSync(process.execPath, [RUNNER, mode], {
    env: {
      ...process.env,
      EXPERIMENT_SETTINGS_PATH: SETTINGS,
      EXPERIMENT_WORK_DIR: WORK,
      EXPERIMENT_LISTEN_MS: '400',
      ...(extraEnv || {}),
    },
    encoding: 'utf8',
    timeout: 30000,
  });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '', all: (r.stdout || '') + (r.stderr || '') };
}
const shaOf = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const GENUINE = { model: 'sonnet', permissions: { allow: ['Bash(git *)'] }, theme: 'dark' };
fs.writeFileSync(SETTINGS, JSON.stringify(GENUINE, null, 2) + '\n', 'utf8');
const GENUINE_SHA = shaOf(SETTINGS);
const GENUINE_BYTES = fs.statSync(SETTINGS).size;

const captured = [];
// A SHA-256 digest is ALSO 64 lowercase hex characters, and `identity`/`restore` legitimately print
// settings hashes — that is the whole point of proving byte-identical restoration. So the scan below
// does not ask "is there a 64-hex run?"; it asks "is EVERY 64-hex run one of the settings hashes we
// know about?". An unrecognised one is a token leak.
const allowedHashes = new Set([GENUINE_SHA]);

// ---------------------------------------------------------------- every mode runs
process.stdout.write('\n-- every runner command mode executes --\n');
{
  const usage = run('');
  captured.push(usage.all);
  assert(usage.code === 1, 'no subcommand exits non-zero with usage');
  assert(usage.err.indexOf('usage:') !== -1, 'and prints usage');

  const identity = run('identity');
  captured.push(identity.all);
  eq(identity.code, 0, 'identity reports without writing');
  assert(identity.out.indexOf(GENUINE_SHA) !== -1, 'identity reports the real sha256 of the file');
  eq(shaOf(SETTINGS), GENUINE_SHA, 'and identity modified nothing');
  assert(!fs.existsSync(BACKUP), 'identity created no recovery copy');
}

// ---------------------------------------------------------------- install / interrupted / restore
process.stdout.write('\n-- install, interrupted second install, restore --\n');
{
  const install = run('install');
  captured.push(install.all);
  eq(install.code, 0, 'install succeeds on a clean tree');
  assert(fs.existsSync(BACKUP), 'a recovery copy exists');
  assert(fs.existsSync(IDENTITY), 'an identity sidecar exists');
  eq(shaOf(BACKUP), GENUINE_SHA, 'the recovery copy is the GENUINE original');
  assert(fs.readFileSync(SETTINGS, 'utf8').indexOf('blue-helm-pane-status-prototype') !== -1,
    'the live settings file now carries the marker');
  const patchedSha = shaOf(SETTINGS);
  allowedHashes.add(patchedSha);

  // The crash: a brand-new process, artifacts still on disk.
  const second = run('install');
  captured.push(second.all);
  assert(second.code !== 0, 'a fresh-process SECOND install refuses');
  assert(second.err.indexOf('INSTALL REFUSED') !== -1, 'visibly');
  assert(second.err.toLowerCase().indexOf('restore') !== -1, 'and points the operator at restore');
  assert(second.err.indexOf('NOT modified') !== -1, 'and states that nothing was modified');
  eq(shaOf(BACKUP), GENUINE_SHA, 'THE GENUINE RECOVERY COPY SURVIVED the second install attempt');
  eq(shaOf(SETTINGS), patchedSha, 'and the settings file was not patched a second time');
  const sidecar = JSON.parse(fs.readFileSync(IDENTITY, 'utf8'));
  eq(sidecar.sha256, GENUINE_SHA, 'the identity sidecar still describes the GENUINE original');

  // Restore, from a process that never ran install.
  const restore = run('restore');
  captured.push(restore.all);
  eq(restore.code, 0, 'a fresh-process restore succeeds');
  eq(shaOf(SETTINGS), GENUINE_SHA, 'the settings file is byte-identical to the genuine original');
  eq(fs.statSync(SETTINGS).size, GENUINE_BYTES, 'and the same byte length');
  assert(!Object.prototype.hasOwnProperty.call(JSON.parse(fs.readFileSync(SETTINGS, 'utf8')), 'hooks'),
    'the hooks key is absent on re-parse');
  assert(!fs.existsSync(BACKUP), 'the recovery copy is removed only after restoration was proven');
  assert(!fs.existsSync(IDENTITY), 'and so is the identity sidecar');

  // Clean again: install is permitted once more.
  const again = run('install');
  captured.push(again.all);
  eq(again.code, 0, 'after a proven restore, a new install is permitted again');
  run('restore');
  eq(shaOf(SETTINGS), GENUINE_SHA, 'and restores byte-identically a second time');
}

// ---------------------------------------------------------------- listen prints no token
process.stdout.write('\n-- listen: no bearer token on any console --\n');
{
  const listen = run('listen');
  captured.push(listen.all);
  eq(listen.code, 0, 'listen runs and exits within its bound');
  assert(listen.out.indexOf('Listener up') !== -1, 'it reports that the listener is up');
  // `listen` mints a token and a pipe name but touches no settings file, so it has no legitimate
  // 64-hex output at all: any match here is the token itself.
  assert(!TOKEN_SHAPE.test(listen.all), 'NO 64-hex token appears anywhere in its output');
  assert(!PIPE_SHAPE.test(listen.all), 'and the per-run pipe name is not printed either');
  assert(listen.out.indexOf('never printed') !== -1, 'and it says so explicitly');

  const badChild = run('listen', { EXPERIMENT_CHILD_ARGV: 'not-json' });
  captured.push(badChild.all);
  assert(badChild.err.indexOf('not a JSON array') !== -1, 'a malformed child spec refuses visibly');
  assert(!TOKEN_SHAPE.test(badChild.all), 'and still leaks no token');
}

// ---------------------------------------------------------------- the whole corpus
process.stdout.write('\n-- token absence across EVERY captured output surface --\n');
{
  const corpus = captured.join('\n');
  assert(corpus.length > 0, 'output was actually captured from every mode');
  const hexRuns = corpus.match(/[0-9a-f]{64}/g) || [];
  const unknown = hexRuns.filter((h) => !allowedHashes.has(h));
  assert(hexRuns.length > 0, 'the corpus does contain 64-hex runs (the settings hashes), so the scan is live');
  eq(unknown.length, 0,
    'EVERY 64-hex run in any mode\'s output is a known settings hash — none is an unaccounted-for token');
  assert(!PIPE_SHAPE.test(corpus), 'no per-run pipe name in any stdout or stderr from any mode');
  assert(corpus.indexOf('BLUE_HELM_PANE_STATUS_TOKEN=') === -1, 'no token assignment is ever echoed');

  // Source-level: no path exists that could interpolate the token into output. A runtime scan proves
  // no path RAN; this proves no path EXISTS — the same two-kinds-of-proof rule the reporter uses.
  const src = fs.readFileSync(RUNNER, 'utf8');
  const writes = src.split('\n').filter((l) => /process\.(stdout|stderr)\.write/.test(l));
  for (const line of writes) {
    assert(line.indexOf('${token}') === -1 && !/\btoken\b\s*\)/.test(line),
      `no console write interpolates the token: ${line.trim().slice(0, 72)}`);
  }
  assert(src.indexOf("$env:BLUE_HELM_PANE_STATUS_TOKEN='") === -1,
    'the copy/paste token instructions are gone entirely');
  assert(src.indexOf('spawnGatedChild') !== -1,
    'the token reaches a child through its ENVIRONMENT instead');
}

// ---------------------------------------------------------------- the app never imports this
process.stdout.write('\n-- the application has no authority over Claude settings --\n');
{
  const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert(mainSrc.indexOf('run-experiment-a') === -1, 'main.js does not import the experiment runner');
  assert(mainSrc.indexOf('pane-status-settings') === -1, 'main.js does not import the settings guard');
  assert(mainSrc.indexOf('EXPERIMENT_SETTINGS_PATH') === -1,
    'and the test-only path override is unreachable from the application');
}

fs.rmSync(tmp, { recursive: true, force: true });
process.stdout.write(`\npane-status-runner: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
