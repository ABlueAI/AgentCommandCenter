'use strict';
// Run: node app/followup-child.test.js
// Plain Node.js — exercises the ACTUAL V3b child runner (followup-child.js): the spawn contract
// (process.execPath, shell:false, hidden window, empty argv beyond the script), the environment
// ALLOWLIST (parent secrets structurally absent), the stdin-only content transport, the
// stdout/stderr byte bounds, the hard timeout, malformed-output handling, and the settle-once
// guarantee. The spawn is faked for the contract tests; ONE test spawns the REAL child through
// process.execPath end-to-end with an invalid payload (which refuses before any network use), so
// the runner+child pipe is proven against production code with zero provider calls.

const { EventEmitter } = require('events');
const path = require('path');
const {
  createFollowupChildRunner, buildFollowupChildEnv,
  FOLLOWUP_CHILD_STDOUT_MAX, FOLLOWUP_CHILD_STDERR_MAX, FOLLOWUP_CHILD_TIMEOUT_MS,
} = require('./followup-child');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

function fakeChild() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.stderr = new EventEmitter();
  c.stdin = {
    data: null, ended: false, handlers: {},
    on(ev, fn) { this.handlers[ev] = fn; },
    end(s) { this.data = s; this.ended = true; },
  };
  c.killed = false;
  c.kill = () => { c.killed = true; };
  return c;
}
function makeRunner(overrides) {
  const o = overrides || {};
  const spawns = [];
  let child = o.child || fakeChild();
  const runner = createFollowupChildRunner(Object.assign({
    spawnImpl: (cmd, args, opts) => { spawns.push({ cmd, args, opts }); if (o.spawnThrows) throw new Error('nope'); return child; },
    execPath: 'X:\\FAKE\\electron.exe',
    scriptPath: 'X:\\repo\\scripts\\gemini-followup.js',
    getKey: () => 'DECRYPTED-KEY-42',
    getBaseEnv: () => (o.baseEnv || {}),
  }, o.deps || {}));
  return { runner, spawns, child };
}
const PAYLOAD = { report: 'SECRET-REPORT-BODY', question: 'SECRET-QUESTION-BODY' };

// constructor validation
{
  let threw = 0;
  try { createFollowupChildRunner({ getKey: () => 'k' }); } catch { threw++; }
  try { createFollowupChildRunner({ scriptPath: 'x' }); } catch { threw++; }
  assert(threw === 2, 'constructor rejects a missing scriptPath / getKey');
}

// env allowlist (pure)
{
  const base = {
    GEMINI_API_KEY: 'SETX-RESIDUE-OLD-KEY', AWS_SECRET_ACCESS_KEY: 'aws', PATH: 'C:\\bin',
    SystemRoot: 'C:\\WINDOWS', windir: 'C:\\WINDOWS', TEMP: 'C:\\t', TMP: 'C:\\t',
    ELECTRON_RUN_AS_NODE: '0', CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
  };
  const env = buildFollowupChildEnv(base, 'FRESH-KEY');
  assert(Object.keys(env).sort().join(',') === 'ELECTRON_RUN_AS_NODE,GEMINI_API_KEY,SystemRoot,windir',
    'the child env contains EXACTLY the allowlisted keys (ELECTRON_RUN_AS_NODE, key, SystemRoot, windir)');
  assert(env.ELECTRON_RUN_AS_NODE === '1', 'ELECTRON_RUN_AS_NODE is forced to 1 (child-only)');
  assert(env.GEMINI_API_KEY === 'FRESH-KEY', 'the key is the safeStorage one, never the parent-env (setx-residue) value');
  assert(env.SystemRoot === 'C:\\WINDOWS' && env.windir === 'C:\\WINDOWS', 'SystemRoot/windir keep their exact names and values');
  assert(!('TEMP' in env) && !('TMP' in env), 'TEMP/TMP are NOT passed (stdin transport needs no temp file)');
  assert(!('PATH' in env) && !('AWS_SECRET_ACCESS_KEY' in env), 'parent PATH and secrets are structurally absent');
  const upper = buildFollowupChildEnv({ SYSTEMROOT: 'C:\\W' }, 'k');
  assert(upper.SYSTEMROOT === 'C:\\W', 'an upper-case SYSTEMROOT is matched case-insensitively and kept verbatim');
  assert(Object.keys(buildFollowupChildEnv({}, 'k')).sort().join(',') === 'ELECTRON_RUN_AS_NODE,GEMINI_API_KEY',
    'with no Windows vars present, the env is just the flag and the key (fails closed, nothing invented)');
}

(async () => {
  // missing key refuses BEFORE spawn
  {
    const spawns = [];
    const runner = createFollowupChildRunner({
      spawnImpl: (...a) => { spawns.push(a); return fakeChild(); },
      scriptPath: 's', getKey: () => null,
    });
    const r = await runner.run(PAYLOAD);
    assert(r.ok === false && r.error === 'gemini-key-missing' && spawns.length === 0,
      'a missing key refuses with gemini-key-missing and NEVER spawns');
  }

  // spawn contract + stdin transport
  {
    const { runner, spawns, child } = makeRunner();
    const p = runner.run(PAYLOAD);
    assert(spawns.length === 1, 'exactly one spawn');
    const s = spawns[0];
    assert(s.cmd === 'X:\\FAKE\\electron.exe', 'the child launches via the injected execPath (process.execPath in production)');
    assert(Array.isArray(s.args) && s.args.length === 1 && s.args[0] === 'X:\\repo\\scripts\\gemini-followup.js',
      'argv is ONLY the script path — no mode/model/content flags');
    assert(s.opts.shell === false, 'shell:false — no shell ever parses anything');
    assert(s.opts.windowsHide === true, 'the child window is hidden');
    assert(JSON.stringify(s.args).indexOf('SECRET-') === -1, 'argv contains neither the report nor the question');
    assert(s.opts.env.ELECTRON_RUN_AS_NODE === '1' && s.opts.env.GEMINI_API_KEY === 'DECRYPTED-KEY-42',
      'the spawn env is the allowlist env with the decrypted key');
    assert(child.stdin.ended && JSON.parse(child.stdin.data).report === 'SECRET-REPORT-BODY'
      && JSON.parse(child.stdin.data).question === 'SECRET-QUESTION-BODY',
      'the report and question travel ONLY through stdin as one JSON document');
    assert(Object.keys(JSON.parse(child.stdin.data)).sort().join(',') === 'question,report', 'the stdin payload has exactly the two content keys');
    child.stdout.emit('data', Buffer.from(JSON.stringify({ ok: true, answer: 'A', attempts: 1 })));
    child.emit('close', 0);
    const r = await p;
    assert(r.ok === true && r.answer === 'A', 'a clean child result resolves parsed');
  }

  // malformed stdout fails closed
  {
    const { runner, child } = makeRunner();
    const p = runner.run(PAYLOAD);
    child.stdout.emit('data', Buffer.from('not json {'));
    child.emit('close', 0);
    const r = await p;
    assert(r.ok === false && r.error === 'child-malformed-output', 'malformed child JSON fails closed');
  }
  {
    const { runner, child } = makeRunner();
    const p = runner.run(PAYLOAD);
    child.stdout.emit('data', Buffer.from('[1,2]'));
    child.emit('close', 0);
    const r = await p;
    assert(r.ok === false && r.error === 'child-malformed-output', 'a JSON array (non-object) is also malformed output');
  }

  // stdout overflow
  {
    const { runner, child } = makeRunner({ deps: { stdoutMax: 10 } });
    const p = runner.run(PAYLOAD);
    child.stdout.emit('data', Buffer.alloc(11));
    const r = await p;
    assert(r.ok === false && r.error === 'child-output-overflow' && child.killed === true,
      'stdout past the byte bound fails closed and kills the child');
  }

  // stderr overflow (content never inspected)
  {
    const { runner, child } = makeRunner({ deps: { stderrMax: 5 } });
    const p = runner.run(PAYLOAD);
    child.stderr.emit('data', Buffer.from('123456'));
    const r = await p;
    assert(r.ok === false && r.error === 'child-output-overflow' && child.killed === true,
      'stderr past the byte bound fails closed and kills the child');
  }

  // timeout
  {
    const { runner, child } = makeRunner({ deps: { timeoutMs: 15 } });
    const r = await runner.run(PAYLOAD);
    assert(r.ok === false && r.error === 'child-timeout' && child.killed === true,
      'a hung child is killed at the hard timeout and returns a safe error');
  }

  // settle exactly once
  {
    const { runner, child } = makeRunner();
    let resolutions = 0;
    const p = runner.run(PAYLOAD).then((r) => { resolutions++; return r; });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ ok: true, answer: 'FIRST' })));
    child.emit('close', 0);
    child.emit('close', 0);                       // duplicate close
    child.emit('error', new Error('late'));       // late error after settle
    const r = await p;
    await new Promise((res) => setTimeout(res, 5));
    assert(resolutions === 1 && r.answer === 'FIRST', 'completion/error handlers settle the promise exactly once');
  }

  // spawn failure paths
  {
    const { runner } = makeRunner({ spawnThrows: true });
    const r = await runner.run(PAYLOAD);
    assert(r.ok === false && r.error === 'child-spawn-failed', 'a throwing spawn fails closed');
  }
  {
    const { runner, child } = makeRunner();
    const p = runner.run(PAYLOAD);
    child.emit('error', new Error('ENOENT'));
    const r = await p;
    assert(r.ok === false && r.error === 'child-spawn-failed', 'an async spawn error fails closed');
  }

  // defaults sanity (the documented production bounds)
  {
    assert(FOLLOWUP_CHILD_STDOUT_MAX === 2 * 1024 * 1024, 'default stdout bound is 2 MiB');
    assert(FOLLOWUP_CHILD_STDERR_MAX === 64 * 1024, 'default stderr bound is 64 KiB');
    assert(FOLLOWUP_CHILD_TIMEOUT_MS === 180000, 'default hard timeout is 180 s');
  }

  // REAL child end-to-end (zero network): the runner spawns the actual gemini-followup.js via
  // process.execPath; an empty report is invalid-input, which the child refuses BEFORE building
  // any request — proving the spawn/stdin/stdout pipe against production code with no provider use.
  {
    const runner = createFollowupChildRunner({
      scriptPath: path.join(__dirname, '..', 'scripts', 'gemini-followup.js'),
      getKey: () => 'dummy-e2e-key',
      getBaseEnv: () => process.env,   // real SystemRoot flows through the allowlist
    });
    const r = await runner.run({ report: '', question: 'q' });
    assert(r && r.ok === false && r.error === 'invalid-input',
      'REAL child via process.execPath: stdin payload round-trips and the invalid input refuses (zero network)');
  }

  process.stdout.write(`\nfollowup-child: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
