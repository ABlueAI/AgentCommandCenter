'use strict';
// Run: node app/prototype-pane-status/pane-status-reporter.test.js
//
// EXPERIMENT A — PROTOTYPE ONLY. docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: PROTOTYPE
//
// THE ADVERSARIAL PRIVACY PROOF. This spawns the REAL reporter as a real child process, over a REAL
// Windows named pipe, with a hook payload shaped exactly like Claude Code's and stuffed with unique
// sentinel secrets in every field a leak could plausibly ride out on.
//
// Nothing here is simulated: the pipe is a pipe, the child is a child, and the bytes asserted on are
// the bytes that crossed the boundary. A source-level check (in pane-status-boundary.test.js) proves
// no code path exists; this proves no path RAN.

const crypto = require('crypto');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const protocol = require('./pane-status-protocol');
const serverMod = require('./pane-status-server');
const reporter = require('./pane-status-reporter');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const REPORTER = path.join(__dirname, 'pane-status-reporter.js');
const TOKEN = crypto.randomBytes(32).toString('hex');

// Unique sentinels — one per field, so a leak names its own source.
const S = {
  prompt: 'SENTINEL-PROMPT-8f3a1c9d',
  assistant: 'SENTINEL-ASSISTANT-2b7e4f01',
  toolInput: 'SENTINEL-TOOLINPUT-5c1d9a63',
  toolResponse: 'SENTINEL-TOOLRESP-77aa02be',
  transcript: 'SENTINEL-TRANSCRIPT-e4d8b115',
  cwd: 'SENTINEL-CWD-9091fcab',
  nested: 'SENTINEL-NESTED-30ff6c72',
  session: 'SENTINEL-SESSION-abc12de3',
};
const ALL_SENTINELS = Object.values(S);

/** A payload shaped like the documented Claude Code hook input, every field poisoned. */
function payload(eventName) {
  return JSON.stringify({
    session_id: S.session,
    transcript_path: `C:\\Users\\x\\.claude\\projects\\${S.transcript}\\transcript.jsonl`,
    cwd: `C:\\work\\${S.cwd}`,
    permission_mode: 'default',
    hook_event_name: eventName,
    prompt: S.prompt,
    last_assistant_message: S.assistant,
    tool_name: 'Bash',
    tool_input: { command: S.toolInput, description: S.toolInput },
    tool_response: { stdout: S.toolResponse },
    deeply: { nested: { thing: [{ secret: S.nested }] } },
  });
}

function startPipe(onLine) {
  return new Promise((resolve) => {
    const pipeName = serverMod.buildPipeName(crypto.randomBytes(12).toString('hex'));
    const received = [];
    const srv = net.createServer((sock) => {
      let buf = '';
      sock.on('data', (c) => {
        buf += c.toString('utf8');
        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl + 1);
          buf = buf.slice(nl + 1);
          received.push(line);
          if (onLine) onLine(line);
        }
      });
    });
    srv.listen(pipeName, () => resolve({ pipeName, received, close: () => srv.close() }));
  });
}

function runReporter(env, stdinText) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [REPORTER], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d.toString('utf8'); });
    child.stderr.on('data', (d) => { err += d.toString('utf8'); });
    const started = Date.now();
    child.on('close', (code) => resolve({ code, out, err, ms: Date.now() - started }));
    child.stdin.write(stdinText);
    child.stdin.end();
  });
}

(async () => {
  // ---------------------------------------------------------------- happy path + privacy
  process.stdout.write('\n-- real child, real pipe, poisoned payload --\n');
  {
    const pipe = await startPipe();
    const env = {
      ...process.env,
      [reporter.GATE_ENV]: '1',
      [reporter.PIPE_ENV]: pipe.pipeName,
      [reporter.TOKEN_ENV]: TOKEN,
    };
    const r = await runReporter(env, payload('Stop'));
    await new Promise((res) => setTimeout(res, 150));

    assert(r.code === 0, 'the reporter exits 0 (it can never block a Claude turn)');
    assert(pipe.received.length === 1, 'exactly one message crossed the pipe');
    const line = pipe.received[0] || '';
    const parsed = protocol.parseMessage(line);
    assert(parsed.ok && parsed.event === 'Stop', 'the message is a valid Stop');
    assert(parsed.ok && parsed.token === TOKEN, 'it carries the pane token from the environment');

    // THE assertion this whole file exists for.
    const surfaces = { 'the pipe message': line, 'reporter stdout': r.out, 'reporter stderr': r.err };
    for (const [where, text] of Object.entries(surfaces)) {
      for (const sentinel of ALL_SENTINELS) {
        assert(text.indexOf(sentinel) === -1, `${sentinel.split('-')[1].toLowerCase()} sentinel absent from ${where}`);
      }
    }
    assert(Object.keys(JSON.parse(line)).sort().join(',') === 'e,t,v',
      'the message has exactly three keys and no room for anything else');
    assert(r.ms < reporter.TOTAL_BUDGET_MS + 1500, `reporter completed in bounded time (${r.ms}ms)`);
    process.stdout.write(`  · reporter wall-clock: ${r.ms}ms\n`);
    pipe.close();
  }

  // ---------------------------------------------------------------- gate off = total no-op
  process.stdout.write('\n-- non-Blue-Helm session (no prototype env) --\n');
  {
    const pipe = await startPipe();
    const env = { ...process.env };
    delete env[reporter.GATE_ENV]; delete env[reporter.PIPE_ENV]; delete env[reporter.TOKEN_ENV];
    const r = await runReporter(env, payload('Stop'));
    await new Promise((res) => setTimeout(res, 120));
    assert(r.code === 0, 'exits 0 with no prototype env');
    assert(pipe.received.length === 0, 'sends NOTHING — an ordinary Claude session is unaffected');
    assert(r.out === '' && r.err === '', 'and stays completely silent (no stdout, no stderr)');
    pipe.close();
  }
  {
    // Gate present but token missing -> still a no-op.
    const pipe = await startPipe();
    const env = { ...process.env, [reporter.GATE_ENV]: '1', [reporter.PIPE_ENV]: pipe.pipeName };
    delete env[reporter.TOKEN_ENV];
    const r = await runReporter(env, payload('Stop'));
    await new Promise((res) => setTimeout(res, 120));
    assert(r.code === 0 && pipe.received.length === 0, 'a missing token sends nothing');
    pipe.close();
  }

  // ---------------------------------------------------------------- event allowlist
  process.stdout.write('\n-- event allowlist --\n');
  {
    const pipe = await startPipe();
    const env = { ...process.env, [reporter.GATE_ENV]: '1', [reporter.PIPE_ENV]: pipe.pipeName, [reporter.TOKEN_ENV]: TOKEN };
    for (const ev of ['PreToolUse', 'PostToolUse', 'PermissionRequest', 'SubagentStop']) {
      const r = await runReporter(env, payload(ev));
      assert(r.code === 0, `${ev} exits 0`);
      for (const sentinel of ALL_SENTINELS) {
        assert(r.err.indexOf(sentinel) === -1, `${ev}: no sentinel on stderr`);
      }
    }
    await new Promise((res) => setTimeout(res, 200));
    assert(pipe.received.length === 0, 'no non-allowlisted event is ever forwarded');
    for (const ev of protocol.ALLOWED_EVENTS) {
      const r = await runReporter(env, payload(ev));
      assert(r.code === 0, `${ev} exits 0`);
    }
    await new Promise((res) => setTimeout(res, 250));
    assert(pipe.received.length === protocol.ALLOWED_EVENTS.length,
      `all ${protocol.ALLOWED_EVENTS.length} allowlisted events forwarded`);
    const joined = pipe.received.join('');
    for (const sentinel of ALL_SENTINELS) {
      assert(joined.indexOf(sentinel) === -1, `no sentinel across the whole allowlisted batch (${sentinel.split('-')[1].toLowerCase()})`);
    }
    pipe.close();
  }

  // ---------------------------------------------------------------- malformed + oversize
  process.stdout.write('\n-- malformed and oversized input --\n');
  {
    const pipe = await startPipe();
    const env = { ...process.env, [reporter.GATE_ENV]: '1', [reporter.PIPE_ENV]: pipe.pipeName, [reporter.TOKEN_ENV]: TOKEN };

    const bad = await runReporter(env, '{ this is not json ' + S.prompt);
    assert(bad.code === 0, 'malformed JSON exits 0');
    assert(bad.err.indexOf(S.prompt) === -1, 'malformed input is NOT echoed to stderr');
    assert(bad.err.indexOf('bad-payload') !== -1, 'but the bounded reason code IS surfaced');

    const huge = JSON.stringify({ hook_event_name: 'Stop', filler: S.toolResponse.repeat(200000) });
    const over = await runReporter(env, huge);
    assert(over.code === 0, 'an oversized payload exits 0');
    assert(over.err.indexOf(S.toolResponse) === -1, 'oversized input is not echoed');

    await new Promise((res) => setTimeout(res, 200));
    assert(pipe.received.length === 0, 'neither malformed nor oversized input produced a message');
    pipe.close();
  }

  // ---------------------------------------------------------------- unreachable pipe
  process.stdout.write('\n-- transport failure --\n');
  {
    const dead = serverMod.buildPipeName(crypto.randomBytes(12).toString('hex')); // never listened on
    const env = { ...process.env, [reporter.GATE_ENV]: '1', [reporter.PIPE_ENV]: dead, [reporter.TOKEN_ENV]: TOKEN };
    const r = await runReporter(env, payload('Stop'));
    assert(r.code === 0, 'an unreachable pipe still exits 0 (never blocks Claude)');
    assert(r.ms < 4000, `and fails fast (${r.ms}ms)`);
    assert(r.err.indexOf(TOKEN) === -1, 'the token is not printed on the failure path');
  }

  // ---------------------------------------------------------------- end-to-end through the server
  process.stdout.write('\n-- end to end into the main-process store --\n');
  {
    const { createPaneStatusStore } = require('./pane-status-store');
    const store = createPaneStatusStore({ crypto, randomToken: () => TOKEN, observedVersion: '2.1.196' });
    store.enrollPane('pty1');
    const logs = [];
    const views = [];
    const pipeName = serverMod.buildPipeName(crypto.randomBytes(12).toString('hex'));
    const srv = serverMod.createPaneStatusServer({
      net, store, pipeName, log: (l) => logs.push(l), onStateChange: (v) => views.push(v),
    });
    srv.start();
    await new Promise((res) => setTimeout(res, 120));
    const env = { ...process.env, [reporter.GATE_ENV]: '1', [reporter.PIPE_ENV]: pipeName, [reporter.TOKEN_ENV]: TOKEN };
    await runReporter(env, payload('UserPromptSubmit'));
    await new Promise((res) => setTimeout(res, 250));

    assert(views.length >= 1 && views[0].state === 'working', 'a real hook payload drives the badge to "working"');
    assert(views[0].paneId === 'pty1', 'and it lands on the enrolled pane');
    const all = JSON.stringify(views) + '|' + logs.join('|');
    for (const sentinel of ALL_SENTINELS) {
      assert(all.indexOf(sentinel) === -1, `no sentinel in main logs or renderer views (${sentinel.split('-')[1].toLowerCase()})`);
    }
    assert(all.indexOf(TOKEN) === -1, 'the token appears in neither the logs nor the renderer views');
    srv.stop();
  }

  process.stdout.write(`\npane-status-reporter: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  process.stderr.write(`\nUNCAUGHT: ${e && e.message}\n`);
  process.exit(1);
});
