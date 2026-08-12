'use strict';
// EXPERIMENT A — PROTOTYPE ONLY. Claude Code hook reporter.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: PROTOTYPE
//
// Claude Code spawns THIS FILE as a hook command and writes the hook payload to its stdin. That
// payload contains prompt text, tool inputs, tool responses, a transcript path, the cwd, and a session
// id. This process may read exactly one field out of it — `hook_event_name` — and must forward
// nothing else, log nothing else, and open nothing.
//
// THE RULE THAT MAKES THAT TRUE: we never build an outbound message FROM the input object. We read one
// string, check it against a six-entry allowlist, and construct a FRESH object from that string plus a
// token this process got from its own environment. There is no code path that copies a field, spreads
// an object, or stringifies the input. A leak would have to be written on purpose.
//
// NON-BLUE-HELM SESSIONS: if the prototype environment variables are absent, this exits 0 immediately
// having read nothing and connected to nothing. Blue's ordinary Claude sessions must be unaffected
// even while the temporary hook entry is installed, and that is what makes that true.
//
// EXIT CODE: always 0. Claude Code treats hook exit code 2 as a blocking signal; a status reporter
// must never be able to block, fail, or editorialize a turn. Every failure path here is "exit 0 and
// say nothing useful to an attacker".

const PIPE_ENV = 'BLUE_HELM_PANE_STATUS_PIPE';
const TOKEN_ENV = 'BLUE_HELM_PANE_STATUS_TOKEN';
const GATE_ENV = 'BLUE_HELM_PANE_STATUS_PROTOTYPE';

// Hard bounds. Claude's payload can legitimately be large (a transcript path plus a big tool_response),
// so we accept up to STDIN_LIMIT bytes and then stop reading — we are going to discard all of it
// anyway. Everything is time-boxed: a hook that hangs would stall a real turn, which is a kill
// criterion for this experiment.
const STDIN_LIMIT_BYTES = 1048576;  // 1 MiB, then we stop reading and refuse
const TOTAL_BUDGET_MS = 2000;       // absolute wall clock for this process
const CONNECT_BUDGET_MS = 750;      // pipe connect + write

function reasonOut(gateOn, code) {
  // Visible failures are a repo rule, but the only channel a hook child has is stderr, which lands in
  // Blue's Claude UI. So: a bounded reason CODE, never input, and only when the prototype gate is on —
  // an ordinary Claude session must stay completely silent.
  if (gateOn) { try { process.stderr.write(`[pane-status-prototype] ${code}\n`); } catch { /* ignore */ } }
}

function main() {
  const env = process.env || {};
  const gateOn = env[GATE_ENV] === '1';
  const pipeName = env[PIPE_ENV];
  const token = env[TOKEN_ENV];

  // No gate, no pipe, or no token -> this is not a Blue Helm prototype pane. Exit silently and fast,
  // BEFORE reading stdin. Reading nothing is the strongest possible statement about what we did with
  // the payload.
  if (!gateOn || typeof pipeName !== 'string' || !pipeName || typeof token !== 'string' || !token) {
    process.exitCode = 0;
    return;
  }

  const protocol = require('./pane-status-protocol');
  const net = require('net');

  let finished = false;
  const finish = (code) => {
    if (finished) return;
    finished = true;
    if (code) reasonOut(gateOn, code);
    process.exitCode = 0;
    // Do not call process.exit(): let handles unwind so a half-written pipe flushes. The watchdog
    // below is the guarantee that we leave regardless.
  };

  // Absolute watchdog. unref() so it cannot itself keep the process alive.
  const watchdog = setTimeout(() => { finish('timeout'); try { process.exit(0); } catch { /* ignore */ } }, TOTAL_BUDGET_MS);
  if (typeof watchdog.unref === 'function') watchdog.unref();

  let chunks = [];
  let total = 0;
  let overflowed = false;

  process.stdin.on('error', () => finish('stdin-error'));
  process.stdin.on('data', (chunk) => {
    if (overflowed) return;
    total += chunk.length;
    if (total > STDIN_LIMIT_BYTES) { overflowed = true; chunks = []; return; }
    chunks.push(chunk);
  });

  process.stdin.on('end', () => {
    if (overflowed) { finish('payload-oversize'); return; }

    let eventName = null;
    try {
      const raw = Buffer.concat(chunks).toString('utf8');
      chunks = [];                       // drop the payload as early as possible
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const value = parsed.hook_event_name;
        // Read the ONE field, as a primitive, and immediately stop referencing the parsed object.
        if (typeof value === 'string') eventName = value;
      }
    } catch {
      // A malformed payload is refused without echoing a single byte of it.
      finish('bad-payload');
      return;
    }

    if (!eventName || protocol.ALLOWED_EVENTS.indexOf(eventName) === -1) {
      // Includes every real Claude event we did not allowlist (PreToolUse, PostToolUse, ...). Not an
      // error — just not ours.
      finish(eventName ? 'event-not-allowlisted' : 'no-event-name');
      return;
    }

    let line;
    try {
      // Constructed FRESH from a validated allowlist constant plus our own token. Nothing from the
      // input object reaches this call.
      line = protocol.encodeMessage(eventName, token);
    } catch {
      finish('encode-refused');
      return;
    }

    let socket;
    const connectTimer = setTimeout(() => {
      try { if (socket) socket.destroy(); } catch { /* ignore */ }
      finish('connect-timeout');
    }, CONNECT_BUDGET_MS);
    if (typeof connectTimer.unref === 'function') connectTimer.unref();

    try {
      socket = net.createConnection(pipeName);
    } catch {
      clearTimeout(connectTimer);
      finish('connect-failed');
      return;
    }
    socket.on('error', () => { clearTimeout(connectTimer); finish('transport-error'); });
    socket.on('connect', () => {
      socket.end(line, () => { clearTimeout(connectTimer); finish(null); });
    });
  });

  // Nothing to read from (no stdin attached): still exit cleanly rather than hanging.
  try { process.stdin.resume(); } catch { finish('stdin-unavailable'); }
}

// Only run when executed directly, so the tests can require() this file to assert its constants
// without spawning anything.
if (require.main === module) main();

const api = { PIPE_ENV, TOKEN_ENV, GATE_ENV, STDIN_LIMIT_BYTES, TOTAL_BUDGET_MS, CONNECT_BUDGET_MS, main };
if (typeof module === 'object' && module.exports) module.exports = api;
