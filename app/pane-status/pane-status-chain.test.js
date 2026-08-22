'use strict';
// Run: node app/pane-status/pane-status-chain.test.js
//
// THE FULL-CHAIN FIXTURES. This is the discovery gate of Work Order 2 § 2, promoted from a temporary
// lab into a tracked suite so the invocation can never silently rot.
//
//     Claude Code  ->  cmd.exe  ->  pane-status-reporter.cmd  ->  Electron (as node)  ->  reporter.js
//
// Nothing here is simulated. The cmd.exe is the real one, the shim is written by the real shim builder,
// the args come from the real hook-args builder, Electron really runs as node, and the bytes asserted
// on are the bytes that crossed a real Windows named pipe.
//
// WHY THE ENCODING IS WHAT IT IS — measured, not transcribed. Claude Code spawns exec-form hooks with
// spawn(command, args, {...}) and NO windowsVerbatimArguments, so Windows MSVCRT argv quoting applies.
// Consequences, each pinned by a test below:
//   * a quote placed INSIDE an arg is emitted as \" and cmd.exe cannot read it — and with the trailing
//     `& exit /b 0` that failure is SILENT (exit 0, empty stderr, reporter never runs). That silent
//     mode is exactly why these fixtures assert the reporter RAN, not merely that the exit code was 0.
//   * /s makes it worse: it strips the encoder's quoting and unquotes a path containing a space.
//   * cmd re-parses metacharacters after quote removal, so & ^ ( ) ; , = and + must be caret-escaped,
//     AND so must the space.

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const protocol = require('./pane-status-protocol');
const shimMod = require('./pane-status-runtime-shim');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const CMD = shimMod.resolveCmdExe();
const REPORTER_SRC = path.join(__dirname, 'pane-status-reporter.js');
const PROTOCOL_SRC = path.join(__dirname, 'pane-status-protocol.js');

// The repository's own Electron runtime.
function resolveElectron() {
  try {
    const p = require('electron');
    if (typeof p === 'string' && fs.existsSync(p)) return p;
  } catch { /* fall through */ }
  const guess = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
  return fs.existsSync(guess) ? guess : null;
}
const ELECTRON = resolveElectron();

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-chain-'));

// Unique sentinels, one per payload field, so a leak names its own source.
const S = {
  session: 'SENTINEL-SESSION-abc12de3',
  transcript: 'SENTINEL-TRANSCRIPT-e4d8b115',
  cwd: 'SENTINEL-CWD-9091fcab',
  prompt: 'SENTINEL-PROMPT-8f3a1c9d',
  toolInput: 'SENTINEL-TOOLINPUT-5c1d9a63',
  toolResponse: 'SENTINEL-TOOLRESP-77aa02be',
  nested: 'SENTINEL-NESTED-30ff6c72',
};
const ALL_SENTINELS = Object.values(S);

function payload(eventName) {
  return JSON.stringify({
    session_id: S.session,
    transcript_path: 'C:\\Users\\x\\.claude\\projects\\' + S.transcript + '\\transcript.jsonl',
    cwd: 'C:\\work\\' + S.cwd,
    permission_mode: 'default',
    hook_event_name: eventName,
    prompt: S.prompt,
    tool_name: 'Bash',
    tool_input: { command: S.toolInput, description: S.toolInput },
    tool_response: { stdout: S.toolResponse },
    deeply: { nested: { thing: [{ secret: S.nested }] } },
  });
}

/** Build a fixture directory containing a real shim and (optionally) the real reporter. */
function makeFixture(name, opts) {
  const o = opts || {};
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  const reporter = path.join(dir, 'pane-status-reporter.js');
  const shim = path.join(dir, 'pane-status-reporter.cmd');
  if (o.reporterSource === 'real') {
    fs.copyFileSync(REPORTER_SRC, reporter);
    fs.copyFileSync(PROTOCOL_SRC, path.join(dir, 'pane-status-protocol.js'));
  } else if (typeof o.reporterSource === 'string') {
    fs.writeFileSync(reporter, o.reporterSource);
  }
  if (o.shim !== 'absent') {
    fs.writeFileSync(shim, shimMod.buildShimContent(
      o.runtimePath === undefined ? ELECTRON : o.runtimePath,
      o.reporterPath === undefined ? reporter : o.reporterPath));
  }
  return { dir, shim, reporter };
}

/** Run the EXACT chain the hook config would run. */
function runChain(shimPath, extraEnv, stdinPayload, opts) {
  const o = opts || {};
  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.BLUE_HELM_PANE_STATUS_PIPE;
  delete env.BLUE_HELM_PANE_STATUS_TOKEN;
  Object.assign(env, extraEnv || {});

  const args = shimMod.buildHookArgs(shimPath);
  return new Promise((resolve) => {
    const child = spawn(CMD, args, { env, windowsHide: true, detached: false });
    let so = '', se = '', stdinError = null, done = false;
    const t0 = Date.now();
    child.stdout.on('data', (d) => { so += d; });
    child.stderr.on('data', (d) => { se += d; });
    child.stdin.on('error', (e) => { stdinError = e.code || 'ERR'; });
    if (stdinPayload !== null && stdinPayload !== undefined) {
      try { child.stdin.write(stdinPayload + '\n', 'utf8'); child.stdin.end(); }
      catch (e) { stdinError = e.code || 'ERR'; }
    } else if (!o.leaveStdinOpen) {
      try { child.stdin.end(); } catch { /* already closed */ }
    }
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill(); } catch { /* gone */ }
      resolve({ exit: 'TIMEOUT', stdout: so, stderr: se, stdinError, ms: Date.now() - t0 });
    }, 25000);
    child.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ exit: code, stdout: so, stderr: se, stdinError, ms: Date.now() - t0 });
    });
  });
}

function startPipe() {
  const name = '\\\\.\\pipe\\bh-chain-' + crypto.randomBytes(8).toString('hex');
  const received = [];
  const server = net.createServer((sock) => {
    let buf = '';
    sock.setEncoding('utf8');
    sock.on('data', (d) => { buf += d; });
    sock.on('end', () => { if (buf.length) received.push(buf); });
    sock.on('error', () => { /* client vanished */ });
  });
  return new Promise((res) => server.listen(name, () => res({
    name, received, close: () => new Promise((r) => server.close(r)),
  })));
}
const settle = (ms) => new Promise((r) => setTimeout(r, ms || 400));

(async () => {
  // ---------------------------------------------------------------- the encoding itself
  {
    const args = shimMod.buildHookArgs('C:\\some dir\\pane-status-reporter.cmd');
    assert(args[0] === '/d' && args[1] === '/c', 'the hook args start /d /c');
    assert(args.indexOf('/s') === -1, '/s is NOT used — it strips quoting and unquotes paths with spaces');
    assert(args.slice(-6).join(' ') === '>nul 2>nul & exit /b 0',
      'suppression and the forced zero exit are SEPARATE argv elements, not embedded in one string');
    assert(args.every((a) => a.indexOf('"') === -1),
      'no argument contains a quote — the argv encoder would emit \\" and cmd.exe cannot read that');
    assert(args[2] === 'C:\\some^ dir\\pane-status-reporter.cmd', 'the space in the shim path is caret-escaped');

    assert(shimMod.escapeForCmd('a&b') === 'a^&b', '& is caret-escaped');
    assert(shimMod.escapeForCmd('a^b') === 'a^^b', '^ is caret-escaped');
    assert(shimMod.escapeForCmd('a b') === 'a^ b', 'space is caret-escaped');
    assert(shimMod.escapeForCmd('a(b)') === 'a^(b^)', 'parentheses are caret-escaped');
    assert(shimMod.escapeForCmd("a'b") === "a'b", 'an apostrophe needs no escaping');
    assert(shimMod.escapeForCmd('a!b') === 'a!b', 'an exclamation mark needs no escaping (delayed expansion is off)');
  }

  // ---------------------------------------------------------------- path refusal
  {
    const R = shimMod.REFUSAL;
    const refusals = [
      ['C:\\a%PATH%b\\x.cmd', R.PAIRED_PERCENT, 'paired percent signs (cmd expands them before carets apply)'],
      ['C:\\a"b\\x.cmd', R.CONTROL_OR_QUOTE, 'a quote'],
      ['C:\\a\nb\\x.cmd', R.CONTROL_OR_QUOTE, 'a newline'],
      ['C:\\a\u0000b\\x.cmd', R.CONTROL_OR_QUOTE, 'a NUL'],
      ['C:\\a\u0007b\\x.cmd', R.CONTROL_OR_QUOTE, 'a control character'],
      ['relative\\x.cmd', R.NOT_ABSOLUTE, 'a relative path'],
      ['', R.EMPTY, 'an empty path'],
    ];
    for (const [p, reason, why] of refusals) {
      const v = shimMod.validateShimPath(p);
      assert(v.ok === false && v.reason === reason, `a shim path with ${why} is REFUSED`);
      let threw = false;
      try { shimMod.buildHookArgs(p); } catch { threw = true; }
      assert(threw, `and buildHookArgs throws rather than emitting args for it (${why})`);
    }
    const accepted = ['C:\\plain\\x.cmd', 'C:\\lab dir\\x.cmd', 'C:\\lab&dir\\x.cmd', 'C:\\lab^dir\\x.cmd',
      'C:\\lab(dir)\\x.cmd', 'C:\\lab &dir\\x.cmd', 'C:\\lab;,=dir\\x.cmd', 'C:\\lab%dir\\x.cmd',
      "C:\\lab'dir\\x.cmd", 'C:\\lab!dir\\x.cmd', 'C:\\lab+=dir\\x.cmd'];
    for (const p of accepted) assert(shimMod.validateShimPath(p).ok === true, `an encodable path is accepted: ${p}`);
  }

  // ---------------------------------------------------------------- the shim's own text
  {
    const text = shimMod.buildShimContent('C:\\e\\electron.exe', 'C:\\r\\reporter.js');
    assert(text.indexOf('\r\n') !== -1 && text.indexOf('\n\n') === -1, 'the shim is CRLF (an LF-only .cmd is not reliably parsed)');
    assert(/^@echo off\r\n/.test(text), 'it starts @echo off');
    assert(text.indexOf('setlocal') !== -1, 'it uses setlocal so the variable never escapes');
    assert(text.indexOf('set "ELECTRON_RUN_AS_NODE=1"') !== -1, 'it sets ELECTRON_RUN_AS_NODE for its child ONLY');
    assert(/exit \/b 0\r\n$/.test(text), 'it ends with an unconditional exit /b 0');
    const pct = shimMod.buildShimContent('C:\\e%x\\electron.exe', 'C:\\r\\reporter.js');
    assert(pct.indexOf('C:\\e%%x\\electron.exe') !== -1, 'a single percent in a path is doubled for batch expansion');
  }

  if (!ELECTRON) {
    process.stdout.write('\n  (Electron runtime not resolvable; live-chain fixtures skipped)\n');
    process.stdout.write(`\npane-status-chain: ${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
  }

  // ---------------------------------------------------------------- CASE A: unenrolled
  {
    const f = makeFixture('A1', { reporterSource: 'real' });
    const r = await runChain(f.shim, {}, null, { leaveStdinOpen: true });
    assert(r.exit === 0, 'CASE A: an unenrolled pane exits 0 with stdin still open');
    assert(r.stdout.length === 0 && r.stderr.length === 0, 'CASE A: nothing escapes to stdout or stderr');
    assert(r.ms < 20000, 'CASE A: it exits promptly rather than waiting on stdin');

    const f2 = makeFixture('A2', { reporterSource: 'real' });
    const big = await runChain(f2.shim, {}, 'x'.repeat(400000), {});
    assert(big.exit === 0 && big.stdout.length === 0 && big.stderr.length === 0,
      'CASE A: an oversize payload on an unenrolled pane is still silent and exit 0');
    assert(big.stdinError !== null,
      'CASE A: our write could NOT complete, proving the reporter never drained stdin (recorded as the EPIPE/EOF observation)');
  }

  // ---------------------------------------------------------------- CASE B: enrolled traversal
  {
    const listener = await startPipe();
    const token = crypto.randomBytes(protocol.TOKEN_BYTES).toString('hex');
    const f = makeFixture('B1', { reporterSource: 'real' });
    const r = await runChain(f.shim, {
      BLUE_HELM_PANE_STATUS_PIPE: listener.name, BLUE_HELM_PANE_STATUS_TOKEN: token,
    }, payload('UserPromptSubmit'), {});
    await settle();
    await listener.close();

    assert(r.exit === 0 && r.stdout.length === 0 && r.stderr.length === 0, 'CASE B: exit 0 and no output escape');
    assert(listener.received.length === 1, 'CASE B: EXACTLY ONE message reached the pipe');
    const raw = listener.received[0] || '';
    const decoded = protocol.decodeMessage(raw.trim());
    assert(decoded.ok === true && decoded.e === 'UserPromptSubmit' && decoded.t === token,
      'CASE B: it is a well-formed {v,e,t} carrying our event and our token');
    assert(Object.keys(JSON.parse(raw.trim())).length === 3, 'CASE B: exactly three keys');
    for (const s of ALL_SENTINELS) {
      assert(raw.indexOf(s) === -1, `CASE B: no ${s.split('-')[1].toLowerCase()} field reached the pipe`);
    }
    assert(raw.indexOf('Bash') === -1, 'CASE B: not even the tool NAME reached the pipe');
  }

  // ---------------------------------------------------------------- CASE B(ii): all eight events
  {
    let ok = 0;
    for (const ev of protocol.ALLOWED_EVENTS) {
      const listener = await startPipe();
      const token = crypto.randomBytes(protocol.TOKEN_BYTES).toString('hex');
      const f = makeFixture('BE-' + ev, { reporterSource: 'real' });
      const r = await runChain(f.shim, {
        BLUE_HELM_PANE_STATUS_PIPE: listener.name, BLUE_HELM_PANE_STATUS_TOKEN: token,
      }, payload(ev), {});
      await settle(300);
      await listener.close();
      const d = listener.received.length === 1 ? protocol.decodeMessage(listener.received[0].trim()) : { ok: false };
      if (r.exit === 0 && d.ok && d.e === ev && d.t === token && !r.stdout.length && !r.stderr.length) ok++;
    }
    assert(ok === 8, `CASE B: all EIGHT allowlisted events traverse the real chain (${ok}/8)`);

    const listener = await startPipe();
    const token = crypto.randomBytes(protocol.TOKEN_BYTES).toString('hex');
    const f = makeFixture('BE-none', { reporterSource: 'real' });
    const r = await runChain(f.shim, {
      BLUE_HELM_PANE_STATUS_PIPE: listener.name, BLUE_HELM_PANE_STATUS_TOKEN: token,
    }, payload('PermissionRequest'), {});
    await settle(300);
    await listener.close();
    assert(r.exit === 0 && listener.received.length === 0,
      'CASE B: a real Claude event we do not allowlist sends NOTHING and still exits 0');
  }

  // ---------------------------------------------------------------- CASE C: three-layer zero exit
  {
    const layers = [
      ['outer cmd.exe failure', { reporterSource: 'real', shim: 'absent' }],
      ['shim-reported failure', { reporterSource: 'real', runtimePath: path.join(root, 'no-electron.exe') }],
      ['reporter-reported failure', { reporterSource: "'use strict';" + String.fromCharCode(10) + 'process.exit(3);' }],
    ];
    for (const [label, opts] of layers) {
      const f = makeFixture('C-' + label.replace(/\W+/g, '_'), opts);
      const r = await runChain(f.shim, {}, payload('Stop'), {});
      assert(r.exit === 0 && r.stdout.length === 0 && r.stderr.length === 0,
        `CASE C: ${label} terminates at exit 0 with no output`);
    }
  }

  // ---------------------------------------------------------------- CASE D: stranded hooks
  {
    const cases = [
      ['shim absent', { reporterSource: 'real', shim: 'absent' }],
      ['shim not readable as a file', { reporterSource: 'real', shim: 'absent', mkdirShim: true }],
      ['Electron missing', { reporterSource: 'real', runtimePath: path.join(root, 'gone', 'electron.exe') }],
      ['reporter missing', { reporterSource: 'real', reporterPath: path.join(root, 'gone', 'reporter.js') }],
      ['Electron exits nonzero', { reporterSource: "'use strict';" + String.fromCharCode(10) + 'process.exit(9);' }],
      ['reporter throws', { reporterSource: "'use strict';" + String.fromCharCode(10) + "throw new Error('boom');" }],
    ];
    for (const [label, opts] of cases) {
      const f = makeFixture('D-' + label.replace(/\W+/g, '_'), opts);
      if (opts.mkdirShim) fs.mkdirSync(f.shim, { recursive: true });
      const r = await runChain(f.shim, {}, payload('Stop'), {});
      assert(r.exit === 0 && r.stdout.length === 0 && r.stderr.length === 0 && r.ms < 20000,
        `CASE D: ${label} stays silent, nonblocking, and exits 0`);
    }
  }

  // ---------------------------------------------------------------- an enrolled pane with a dead pipe
  {
    const f = makeFixture('E-deadpipe', { reporterSource: 'real' });
    const r = await runChain(f.shim, {
      BLUE_HELM_PANE_STATUS_PIPE: '\\\\.\\pipe\\bh-chain-does-not-exist-' + crypto.randomBytes(6).toString('hex'),
      BLUE_HELM_PANE_STATUS_TOKEN: crypto.randomBytes(32).toString('hex'),
    }, payload('Stop'), {});
    assert(r.exit === 0 && r.stdout.length === 0 && r.stderr.length === 0,
      'an enrolled pane whose listener is GONE still exits 0 silently — a dead app never blocks a turn');
  }

  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  process.stdout.write(`\npane-status-chain: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { process.stderr.write('UNCAUGHT: ' + (e && e.stack) + '\n'); process.exit(1); });
