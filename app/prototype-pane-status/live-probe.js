'use strict';
// EXPERIMENT A live probe — BUILDER-OPERATED, NOT PART OF THE APPLICATION.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: PROTOTYPE
//
// Stands in for the Electron main process so the live experiment is measurable without driving the
// GUI. It uses the REAL store, the REAL server and the REAL protocol — the only thing simulated is
// the window. It spawns a Claude session with EXACTLY the environment app/main.js builds in pty-start,
// including CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1, which is the whole point: if the scrub prevents the
// hook reporter from inheriting the pipe/token variables, this probe is how we find out, and the
// experiment is then reported BLOCKED rather than worked around.
//
// Bounded by construction: N turns (default 1, hard max 3), a disposable cwd, and a wall-clock cap.

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const serverMod = require('./pane-status-server');
const { createPaneStatusStore } = require('./pane-status-store');

const CLAUDE_CMD = process.env.EXPERIMENT_CLAUDE_CMD || path.join(process.env.APPDATA || '', 'npm', 'claude.cmd');
const TURNS = Math.min(Number(process.env.EXPERIMENT_TURNS || 1), 3); // hard cap: at most three turns
const CLAUDE_VERSION = process.env.EXPERIMENT_CLAUDE_VERSION || '2.1.196';

(async () => {
  const token = crypto.randomBytes(32).toString('hex');
  const pipeName = serverMod.buildPipeName(crypto.randomBytes(12).toString('hex'));
  const store = createPaneStatusStore({ crypto, randomToken: () => token, observedVersion: CLAUDE_VERSION });
  store.enrollPane('pty1');

  const logs = [];
  const events = [];
  const srv = serverMod.createPaneStatusServer({
    net, store, pipeName,
    log: (l) => logs.push(l),
    onStateChange: (v) => {
      const at = Date.now();
      events.push({ atMs: at, ...v });
      process.stdout.write(`  [${new Date(at).toISOString()}] STATE ${v.paneId} -> ${v.state}${v.reason ? ' (' + v.reason + ')' : ''}\n`);
    },
  });
  const started = srv.start();
  if (!started.ok) { process.stderr.write(`listener failed: ${started.error}\n`); process.exit(1); }
  process.stdout.write(`listener up on a per-run named pipe (no network socket)\n`);

  // Disposable working directory — nothing of Blue's is in scope for the session.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'blue-helm-expA-'));
  fs.writeFileSync(path.join(cwd, 'README.txt'), 'disposable experiment directory\n', 'utf8');

  // EXACTLY the environment app/main.js builds for a Claude pane, scrub included and unweakened.
  const env = {
    ...process.env,
    CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
    BLUE_HELM_PANE_STATUS_PROTOTYPE: '1',
    BLUE_HELM_PANE_STATUS_PIPE: pipeName,
    BLUE_HELM_PANE_STATUS_TOKEN: token,
  };

  const turnLog = [];
  for (let i = 0; i < TURNS; i++) {
    const prompt = 'Reply with exactly the word: ok';
    process.stdout.write(`\n--- turn ${i + 1}/${TURNS} (content-free prompt, disposable cwd) ---\n`);
    const t0 = Date.now();
    const beforeCount = events.length;
    const result = await new Promise((resolve) => {
      // Node 24 refuses to spawn a .cmd directly without a shell (EINVAL, the CVE-2024-27980 fix), so
      // go through ComSpec with a discrete argument array — Node quotes each element, nothing is
      // concatenated into a command string, and the prompt is never shell-parsed as source text.
      const comspec = process.env.ComSpec || 'cmd.exe';
      const child = spawn(comspec, ['/d', '/s', '/c', CLAUDE_CMD, '-p', prompt], { cwd, env, windowsHide: true });
      let out = '', err = '';
      child.stdout.on('data', (d) => { out += d.toString('utf8'); });
      child.stderr.on('data', (d) => { err += d.toString('utf8'); });
      const kill = setTimeout(() => { try { child.kill(); } catch {} resolve({ code: 'timeout', out, err }); }, 120000);
      child.on('close', (code) => { clearTimeout(kill); resolve({ code, out, err }); });
      child.on('error', (e) => { clearTimeout(kill); resolve({ code: 'spawn-error', out, err: String(e && e.message) }); });
    });
    const elapsed = Date.now() - t0;
    // Give in-flight hook children a moment to land before we tally this turn.
    await new Promise((r) => setTimeout(r, 1500));
    turnLog.push({
      turn: i + 1, exit: result.code, turnMs: elapsed,
      newEvents: events.slice(beforeCount).map((e) => e.state),
      stdoutBytes: result.out.length, stderrBytes: result.err.length,
      stderrHadReporterLine: /\[pane-status-prototype\]/.test(result.err),
    });
    process.stdout.write(`  exit=${result.code} turnMs=${elapsed} newEvents=${JSON.stringify(events.slice(beforeCount).map((e) => e.state))}\n`);
    if (result.err && /\[pane-status-prototype\]/.test(result.err)) {
      const lines = result.err.split('\n').filter((l) => l.indexOf('[pane-status-prototype]') !== -1);
      process.stdout.write(`  reporter stderr codes: ${JSON.stringify(lines.slice(0, 5))}\n`);
    }
  }

  await new Promise((r) => setTimeout(r, 1500));
  srv.stop();

  const summary = {
    claudeVersion: CLAUDE_VERSION,
    turns: turnLog,
    eventsObserved: events.map((e) => ({ state: e.state, reason: e.reason })),
    distinctStates: [...new Set(events.map((e) => e.state))],
    metrics: srv.metrics(),
    stats: store.stats(),
    scrubBlockedTransport: events.length === 0,
  };
  process.stdout.write('\n=== EXPERIMENT A LIVE SUMMARY ===\n');
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');

  // Privacy check against the real traffic: no log line may contain the token.
  const joined = logs.join('|');
  process.stdout.write(`\ntokenInLogs=${joined.indexOf(token) !== -1}\n`);
  process.stdout.write(`logLines=${logs.length}\n`);

  try { fs.rmSync(cwd, { recursive: true, force: true }); } catch { /* best effort */ }
  process.exit(0);
})();
