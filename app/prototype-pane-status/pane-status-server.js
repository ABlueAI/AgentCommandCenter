'use strict';
// EXPERIMENT A — PROTOTYPE ONLY. Claude Code only, one pane only.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: PROTOTYPE
//
// The out-of-band transport: a MAIN-PROCESS-OWNED WINDOWS NAMED PIPE.
//
// WHY A NAMED PIPE AND NOT THE OTHER TWO OBVIOUS OPTIONS:
//   * Not terminal output. § 8 threat 1 of the procurement record: anything a pane can print, pane
//     CONTENT can forge. A status channel that shares a byte stream with model output is forgeable by
//     the model, by a file the model cats, and by a dependency's build log. Out-of-band is the whole
//     point.
//   * Not a TCP listener, not even on loopback. A loopback socket is reachable by every process and
//     every user session on the machine, and creating one is an explicit kill criterion for this
//     experiment. A named pipe is addressed by name, not by port, and never appears on the network.
//
// `net` is injected so the transport is testable in plain node against a stub, and so the real module
// is the only thing that ever binds a pipe.

const protocol = require('./pane-status-protocol');

// A connection may not sit open forever, may not send unbounded bytes, and may not fan out. These are
// all deliberately small: the only legitimate client writes ~110 bytes once and disconnects.
const CONNECTION_IDLE_MS = 5000;
const MAX_CONNECTION_BYTES = 4096;      // several max-size messages' worth, then the peer is dropped
const MAX_CONCURRENT_CONNECTIONS = 8;   // hooks run in parallel; 8 is far above any real burst
const MAX_MESSAGES_PER_CONNECTION = 4;

/**
 * Build the per-run pipe name. Unique per app run so a stale pipe from a crashed run can never be
 * mistaken for the live one, and so two runs cannot collide.
 *
 * NOTE the name itself is not a secret and is not treated as one — the token is the authority. The
 * uniqueness is about correctness (no cross-run confusion), not about hiding the endpoint.
 */
function buildPipeName(uniqueSuffix) {
  if (typeof uniqueSuffix !== 'string' || !/^[0-9a-f]{8,64}$/.test(uniqueSuffix)) {
    throw new Error('pane-status-server: pipe suffix must be 8-64 lowercase hex chars');
  }
  return `\\\\.\\pipe\\blue-helm-pane-status-${uniqueSuffix}`;
}

/**
 * deps:
 *   net           -> node net module (injected)
 *   store         -> pane-status-store instance
 *   pipeName      -> full pipe path from buildPipeName()
 *   onStateChange({paneId,state,reason}) -> called ONLY after a message is accepted
 *   log(line)     -> bounded logger. Never receives a token or a message body.
 *   now()         -> injected clock, for latency accounting
 */
function createPaneStatusServer(deps) {
  const d = deps || {};
  const net = d.net;
  const store = d.store;
  const pipeName = d.pipeName;
  const onStateChange = typeof d.onStateChange === 'function' ? d.onStateChange : () => {};
  const log = typeof d.log === 'function' ? d.log : () => {};
  const now = typeof d.now === 'function' ? d.now : () => Date.now();
  if (!net || typeof net.createServer !== 'function') throw new Error('pane-status-server: net is required');
  if (!store) throw new Error('pane-status-server: store is required');
  if (typeof pipeName !== 'string' || pipeName.indexOf('\\\\.\\pipe\\') !== 0) {
    throw new Error('pane-status-server: pipeName must be a \\\\.\\pipe\\ path');
  }

  let server = null;
  let live = 0;
  const counters = { accepted: 0, refused: 0, connections: 0, dropped: 0 };
  const deliveries = []; // bounded latency samples for the evidence document

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
    const arrivedAt = now();

    const done = () => {
      if (closed) return;
      closed = true;
      live -= 1;
      try { socket.destroy(); } catch { /* already gone */ }
    };

    try { socket.setTimeout(CONNECTION_IDLE_MS); } catch { /* stub sockets may not implement it */ }
    socket.on('timeout', () => { counters.dropped += 1; log('[pane-status] connection closed: idle timeout'); done(); });
    // A transport error is never fatal to the app and never prints the peer's bytes.
    socket.on('error', () => { counters.dropped += 1; done(); });
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
        store.countRefusal();
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
          store.countRefusal();
          log('[pane-status] REFUSED: message-count bound exceeded on one connection');
          done();
          return;
        }
        deliverLine(line, arrivedAt);
      }
      // A partial line larger than one legal message can never complete into a legal one.
      if (Buffer.byteLength(buffer, 'utf8') > protocol.MAX_MESSAGE_BYTES) {
        counters.refused += 1;
        store.countRefusal();
        log(`[pane-status] REFUSED: ${protocol.REFUSE.OVERSIZE} (unterminated line exceeds message bound)`);
        done();
      }
    });
  }

  function deliverLine(line, arrivedAt) {
    const parsed = protocol.parseMessage(line);
    if (!parsed.ok) {
      counters.refused += 1;
      store.countRefusal();
      // `parsed.reason` is a bounded constant from the protocol module. The line itself is never
      // logged — that is the difference between a useful log and a transcript leak.
      log(`[pane-status] REFUSED: ${parsed.reason}`);
      return;
    }
    const applied = store.applyMessage({ event: parsed.event, token: parsed.token });
    if (!applied.ok) {
      counters.refused += 1;
      log(`[pane-status] REFUSED: ${applied.reason}`);
      return;
    }
    counters.accepted += 1;
    const view = store.viewFor(applied.paneId);
    if (deliveries.length < 200) deliveries.push({ event: parsed.event, deliveredMs: now() - arrivedAt });
    // Event name is safe to log: it is one of six allowlisted constants, never free text.
    log(`[pane-status] accepted ${parsed.event} -> ${view ? view.state : 'unknown'}`);
    onStateChange(view);
  }

  function start() {
    if (server) return { ok: true, pipeName };
    try {
      server = net.createServer(handleConnection);
      server.on('error', (err) => {
        // Bounded, sentinel-free. A pipe that cannot bind is a visible failure, not a silent one.
        log(`[pane-status] transport error: ${err && err.code ? err.code : 'unknown'}`);
      });
      server.listen(pipeName);
    } catch (err) {
      server = null;
      return { ok: false, error: (err && err.code) || 'listen-failed' };
    }
    log('[pane-status] PROTOTYPE named-pipe listener started (per-run unique name, no network socket)');
    return { ok: true, pipeName };
  }

  function stop() {
    if (!server) return false;
    try { server.close(); } catch { /* already closing */ }
    server = null;
    log('[pane-status] PROTOTYPE named-pipe listener stopped');
    return true;
  }

  function metrics() {
    const samples = deliveries.map((x) => x.deliveredMs).sort((a, b) => a - b);
    return {
      ...counters,
      samples: samples.length,
      minMs: samples.length ? samples[0] : null,
      medianMs: samples.length ? samples[Math.floor(samples.length / 2)] : null,
      maxMs: samples.length ? samples[samples.length - 1] : null,
    };
  }

  return { start, stop, metrics, deliverLine, isListening: () => !!server };
}

const api = {
  createPaneStatusServer,
  buildPipeName,
  CONNECTION_IDLE_MS,
  MAX_CONNECTION_BYTES,
  MAX_CONCURRENT_CONNECTIONS,
  MAX_MESSAGES_PER_CONNECTION,
};
if (typeof module === 'object' && module.exports) module.exports = api;
