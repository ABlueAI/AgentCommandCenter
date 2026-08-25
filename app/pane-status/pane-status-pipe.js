'use strict';
// Blue Helm production pane status — the out-of-band transport.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
//
// A MAIN-PROCESS-OWNED WINDOWS NAMED PIPE, and deliberately not either of the two obvious alternatives:
//
//   * Not terminal output. § 8 threat 1 of the procurement record: anything a pane can print, pane
//     CONTENT can forge. A status channel sharing a byte stream with model output is forgeable by the
//     model, by a file the model cats, and by a dependency's build log. Out-of-band is the point.
//   * Not a TCP listener, not even on loopback. A loopback socket is reachable by every process and
//     every user session on the machine. A named pipe is addressed by name, never by port, and never
//     appears on the network.
//
// `net` is injected, so the transport is testable against a stub and the real module is the only
// thing that ever binds a pipe.
//
// THE PIPE NAME IS NOT A SECRET and is not treated as one. The TOKEN is the authority. The name is
// unique per app run only so a stale pipe from a crashed run can never be mistaken for the live one.

const protocol = require('./pane-status-protocol');

// A connection may not sit open forever, may not send unbounded bytes, and may not fan out. All
// deliberately small: the only legitimate client writes ~110 bytes once and disconnects.
const CONNECTION_IDLE_MS = 5000;
const MAX_CONNECTION_BYTES = 4096;      // several max-size messages' worth, then the peer is dropped
const MAX_CONCURRENT_CONNECTIONS = 16;  // PreToolUse/PostToolUse fire per tool call across panes
const MAX_MESSAGES_PER_CONNECTION = 4;

function buildPipeName(uniqueSuffix) {
  if (typeof uniqueSuffix !== 'string' || !/^[0-9a-f]{8,64}$/.test(uniqueSuffix)) {
    throw new Error('pane-status-pipe: pipe suffix must be 8-64 lowercase hex chars');
  }
  return `\\\\.\\pipe\\blue-helm-pane-status-${uniqueSuffix}`;
}

/**
 * deps:
 *   net          -> node net module (injected)
 *   registry     -> pane-status-registry instance
 *   pipeName     -> full pipe path from buildPipeName()
 *   onStateChange(view) -> called ONLY after a message is accepted AND changed something
 *   log(line)    -> bounded logger. Never receives a token or a message body.
 *   now()        -> injected clock, for latency accounting
 *
 * THIS MODULE PERFORMS NO PROCESS CREATION AND NO PROCESS CONTROL. It has no child_process import and
 * no path to one; that is asserted by the negative-control suite, not merely intended.
 */
function createPaneStatusPipe(deps) {
  const d = deps || {};
  const net = d.net;
  const registry = d.registry;
  const pipeName = d.pipeName;
  const onStateChange = typeof d.onStateChange === 'function' ? d.onStateChange : () => {};
  // Called when the transport dies AFTER it was ready. The controller uses this to leave READY.
  const onFatal = typeof d.onFatal === 'function' ? d.onFatal : () => {};
  const log = typeof d.log === 'function' ? d.log : () => {};
  const now = typeof d.now === 'function' ? d.now : () => Date.now();
  if (!net || typeof net.createServer !== 'function') throw new Error('pane-status-pipe: net is required');
  if (!registry) throw new Error('pane-status-pipe: registry is required');
  if (typeof pipeName !== 'string' || pipeName.indexOf('\\\\.\\pipe\\') !== 0) {
    throw new Error('pane-status-pipe: pipeName must be a \\\\.\\pipe\\ path');
  }

  let server = null;
  // READY is the 'listening' event, not the listen() call. See start().
  let listening = false;
  let live = 0;
  const counters = { accepted: 0, refused: 0, connections: 0, dropped: 0, noop: 0 };

  function handleConnection(socket) {
    counters.connections += 1;
    if (live >= MAX_CONCURRENT_CONNECTIONS) {
      counters.dropped += 1;
      log('[pane-status] connection dropped: concurrency bound reached');
      try { socket.destroy(); } catch { /* already gone */ }
      return;
    }
    live += 1;

    let buffer = '';
    let bytes = 0;
    let messages = 0;
    let closed = false;

    const done = () => {
      if (closed) return;
      closed = true;
      live -= 1;
      try { socket.destroy(); } catch { /* already gone */ }
    };

    try { socket.setTimeout(CONNECTION_IDLE_MS); } catch { /* stub sockets may not implement it */ }
    socket.on('timeout', () => { counters.dropped += 1; log('[pane-status] connection closed: idle timeout'); done(); });
    socket.on('error', () => { counters.dropped += 1; done(); });   // never prints the peer's bytes
    socket.on('close', done);
    socket.on('end', done);

    socket.on('data', (chunk) => {
      if (closed) return;
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      bytes += Buffer.byteLength(text, 'utf8');
      // Oversize is decided on the CONNECTION total, before any parse, so a peer cannot stream an
      // unbounded blob one byte under the per-message limit at a time.
      if (bytes > MAX_CONNECTION_BYTES) {
        counters.refused += 1;
        registry.countRefusal();
        log(`[pane-status] REFUSED: ${protocol.REFUSE.OVERSIZE} (connection byte bound exceeded)`);
        done();
        return;
      }
      buffer += text;
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl + 1);
        buffer = buffer.slice(nl + 1);
        if (++messages > MAX_MESSAGES_PER_CONNECTION) {
          counters.refused += 1;
          registry.countRefusal();
          log('[pane-status] REFUSED: message-count bound exceeded on one connection');
          done();
          return;
        }
        deliverLine(line);
      }
      // A partial line larger than one legal message can never complete into a legal one.
      if (Buffer.byteLength(buffer, 'utf8') > protocol.MAX_MESSAGE_BYTES) {
        counters.refused += 1;
        registry.countRefusal();
        log(`[pane-status] REFUSED: ${protocol.REFUSE.OVERSIZE} (unterminated line exceeds message bound)`);
        done();
      }
    });
  }

  function deliverLine(line) {
    const parsed = protocol.decodeMessage(String(line).trim());
    if (!parsed.ok) {
      counters.refused += 1;
      registry.countRefusal();
      // `parsed.reason` is a bounded constant. The line itself is NEVER logged — that is the
      // difference between a useful log and a transcript leak.
      log(`[pane-status] REFUSED: ${parsed.reason}`);
      return;
    }
    const applied = registry.applyMessage({ e: parsed.e, t: parsed.t });
    if (!applied.ok) {
      counters.refused += 1;
      log(`[pane-status] REFUSED: ${applied.reason}`);
      return;
    }
    if (applied.applied === 'none') { counters.noop += 1; return; }
    counters.accepted += 1;
    const view = registry.viewFor(applied.paneId);
    if (view) onStateChange(view);
  }

  /**
   * START THE LISTENER, AND DO NOT CLAIM READY UNTIL IT IS ACTUALLY LISTENING.
   *
   * CORRECTION (advisory review, finding 9): `server.listen()` is ASYNCHRONOUS. The previous build
   * returned `{ ok:true }` on the next line and the controller went straight to READY — so a pipe that
   * failed to bind (EADDRINUSE from a crashed run, EACCES from a policy) produced a green badge, a
   * running heartbeat, and panes enrolled with a token nothing was listening for. The bind error
   * arrived milliseconds later on the `error` handler, which only logged it.
   *
   * Now readiness is the `listening` event and nothing else. An error BEFORE readiness fails the
   * start; an error AFTER readiness is reported to the controller through `onFatal`, which takes the
   * subsystem out of READY rather than leaving it claiming a transport it no longer has.
   */
  function start() {
    if (server) return Promise.resolve({ ok: true, pipeName });
    return new Promise((resolve) => {
      let settled = false;
      let s;
      try { s = net.createServer(handleConnection); }
      catch (err) { resolve({ ok: false, error: (err && err.code) || 'create-failed' }); return; }

      const failBeforeReady = (code) => {
        if (settled) return;
        settled = true;
        listening = false;
        server = null;
        // Partial server state is cleaned up: a server object that never bound still holds handles.
        try { s.close(); } catch { /* never bound */ }
        log(`[pane-status] transport FAILED to start: ${code}`);
        resolve({ ok: false, error: code });
      };

      s.on('error', (err) => {
        const code = err && err.code ? err.code : 'unknown';
        if (!settled) { failBeforeReady(code); return; }
        // After readiness. Visible, never a crash, and never silently survivable: the controller is
        // told, and it stops claiming READY.
        listening = false;
        log(`[pane-status] transport error after start: ${code}`);
        try { onFatal(code); } catch { /* a failing handler must not take the process down */ }
      });

      s.once('listening', () => {
        if (settled) return;
        settled = true;
        server = s;
        listening = true;
        log('[pane-status] named-pipe listener started (per-run unique name, no network socket)');
        resolve({ ok: true, pipeName });
      });

      try { s.listen(pipeName); }
      catch (err) { failBeforeReady((err && err.code) || 'listen-failed'); }
    });
  }

  function stop() {
    if (!server) return false;
    try { server.close(); } catch { /* already closing */ }
    server = null;
    listening = false;
    log('[pane-status] named-pipe listener stopped');
    return true;
  }

  function metrics() { return Object.assign({}, counters, { live }); }

  return { start, stop, metrics, deliverLine, isListening: () => listening };
}

const api = {
  CONNECTION_IDLE_MS,
  MAX_CONNECTION_BYTES,
  MAX_CONCURRENT_CONNECTIONS,
  MAX_MESSAGES_PER_CONNECTION,
  buildPipeName,
  createPaneStatusPipe,
};
if (typeof module === 'object' && module.exports) module.exports = api;
