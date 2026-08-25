'use strict';
// Blue Helm production pane status — the Claude Code hook reporter.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
//
// Claude Code spawns this file (through cmd.exe -> pane-status-reporter.cmd -> Electron as node) as a
// hook command and writes the hook payload to its stdin. That payload contains prompt text, tool
// inputs, tool responses, a transcript path, the cwd, and a session id. This process may read exactly
// one field out of it — `hook_event_name` — and must forward nothing else, log nothing else, and open
// nothing else.
//
// THE RULE THAT MAKES THAT TRUE: we never build an outbound message FROM the input object. We read one
// string, check it against an eight-entry allowlist, and construct a FRESH object from that string
// plus a token this process got from its own environment. There is no code path that copies a field,
// spreads an object, or stringifies the input. A leak would have to be written on purpose.
//
// HOW THE TOKEN GETS HERE: Blue Helm spawns Claude Code inside a pane's PTY with
// BLUE_HELM_PANE_STATUS_PIPE and BLUE_HELM_PANE_STATUS_TOKEN set in that PTY's environment. Claude
// Code passes its own environment through to hook children, so the reporter inherits exactly the pane
// that spawned it. The token is the ONLY pane selector on the wire — see pane-status-registry.js.
//
// NON-BLUE-HELM SESSIONS: if those variables are absent, this exits 0 immediately having read nothing
// and connected to nothing. Blue's ordinary Claude sessions must be unaffected while the hook entries
// are installed, and exiting before touching stdin is what makes that true.
//
// SILENCE IS DELIBERATE, AND IT IS NOT A SILENT FAILURE. The repo rule is that failures must be
// visible, and they are — but NOT on this channel. A hook child's stdout/stderr lands in Blue's Claude
// transcript, where a status reporter has no business writing. Every failure here instead becomes
// visible as an ABSENCE: the pane stops being refreshed, freshness ages it out, and the badge falls to
// `unknown`. Honest `unknown` in the UI is the visible failure. See pane-status-freshness.js.
//
// EXIT CODE: always 0. Claude Code treats hook exit code 2 as a blocking signal, and any nonzero
// status is surfaced to the user; a status reporter must never block, fail, or editorialize a turn.

const PIPE_ENV = 'BLUE_HELM_PANE_STATUS_PIPE';
const TOKEN_ENV = 'BLUE_HELM_PANE_STATUS_TOKEN';

// Hard bounds. Claude's payload can legitimately be large (a transcript path plus a big tool_response),
// so we accept up to STDIN_LIMIT_BYTES and then stop reading — we discard all of it anyway.
// Everything is time-boxed: a hook that hangs would stall a real turn.
const STDIN_LIMIT_BYTES = 1048576;  // 1 MiB, then refuse
const TOTAL_BUDGET_MS = 2000;       // absolute wall clock for this process
const CONNECT_BUDGET_MS = 750;      // pipe connect + write

function main() {
  const env = process.env || {};
  const pipeName = env[PIPE_ENV];
  const token = env[TOKEN_ENV];

  // Not a Blue Helm pane. Exit silently and fast, BEFORE reading stdin. Reading nothing is the
  // strongest possible statement about what we did with the payload.
  //
  // Note for live acceptance: Claude Code writes the payload to our stdin and logs an EPIPE warning if
  // we close it before the write completes. Small payloads fit the OS pipe buffer and never notice;
  // a large payload on an unenrolled pane may produce one such warning. That is a Claude-side log
  // line, not a failure, and it is recorded as a live-acceptance observation rather than something
  // this process can fix without reading the payload it must not read.
  if (typeof pipeName !== 'string' || !pipeName || typeof token !== 'string' || !token) {
    process.exitCode = 0;
    return;
  }

  const protocol = require('./pane-status-protocol');
  const net = require('net');

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    process.exitCode = 0;
    // Do not call process.exit(): let handles unwind so a half-written pipe flushes. The watchdog
    // below is the guarantee that we leave regardless.
  };

  // Absolute watchdog. unref() so it cannot itself keep the process alive.
  const watchdog = setTimeout(() => {
    finish();
    try { process.exit(0); } catch { /* already leaving */ }
  }, TOTAL_BUDGET_MS);
  if (typeof watchdog.unref === 'function') watchdog.unref();

  let chunks = [];
  let total = 0;
  let overflowed = false;

  process.stdin.on('error', finish);
  process.stdin.on('data', (chunk) => {
    if (overflowed) return;
    total += chunk.length;
    if (total > STDIN_LIMIT_BYTES) { overflowed = true; chunks = []; return; }
    chunks.push(chunk);
  });

  process.stdin.on('end', () => {
    if (overflowed) { finish(); return; }

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
      finish();                          // malformed payload, refused without echoing a byte of it
      return;
    }

    if (!eventName || protocol.ALLOWED_EVENTS.indexOf(eventName) === -1) {
      finish();                          // a real Claude event we did not allowlist. Not ours.
      return;
    }

    let line;
    try {
      // Constructed FRESH from a validated allowlist constant plus our own token. Nothing from the
      // input object reaches this call.
      line = protocol.encodeMessage(eventName, token);
    } catch {
      finish();
      return;
    }

    let socket;
    const connectTimer = setTimeout(() => {
      try { if (socket) socket.destroy(); } catch { /* already gone */ }
      finish();
    }, CONNECT_BUDGET_MS);
    if (typeof connectTimer.unref === 'function') connectTimer.unref();

    try {
      socket = net.createConnection(pipeName);
    } catch {
      clearTimeout(connectTimer);
      finish();
      return;
    }
    socket.on('error', () => { clearTimeout(connectTimer); finish(); });
    socket.on('connect', () => {
      socket.end(line, () => { clearTimeout(connectTimer); finish(); });
    });
  });

  try { process.stdin.resume(); } catch { finish(); }
}

// Only run when executed directly, so tests can require() this file to assert its constants without
// spawning anything.
if (require.main === module) main();

const api = { PIPE_ENV, TOKEN_ENV, STDIN_LIMIT_BYTES, TOTAL_BUDGET_MS, CONNECT_BUDGET_MS, main };
if (typeof module === 'object' && module.exports) module.exports = api;
