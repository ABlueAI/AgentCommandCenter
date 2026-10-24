'use strict';
// S11 usage panel (pure; main.js injects the I/O). One invoke-only channel, `usage-read`:
//   trusted-sender gate -> read the usage file (usage/usage-file.js) with a size cap -> validated
//   numbers only.
// The renderer sends nothing and never receives a path except inside `setupLine`, the statusLine
// setting it offers to copy for Blue (a fixed, main-built string pointing at this copy's
// usage-statusline.js). No claude.ai login, cookie or token is read or stored (docs/USAGE-PANEL.md).

const usageFile = require('./usage/usage-file');

function buildSetupLine(scriptPath) {
  // Forward slashes: on Windows Claude Code may run the command through Git Bash, which eats
  // backslashes (https://code.claude.com/docs/en/statusline, "Windows configuration").
  const p = String(scriptPath).replace(/\\/g, '/');
  return '"statusLine": ' + JSON.stringify({ type: 'command', command: `node "${p}"` });
}

function createUsageIpc(deps) {
  const assessSender = deps && deps.assessSender; // (event) => { ok, reason? }
  const statFile = deps && deps.statFile;         // (path) => { size }
  const readFile = deps && deps.readFile;         // (path) => string
  const filePath = deps && deps.filePath;
  const scriptPath = deps && deps.scriptPath;
  const logRefusal = (deps && deps.logRefusal) || (() => {});
  for (const [name, fn] of [['assessSender', assessSender], ['statFile', statFile], ['readFile', readFile]]) {
    if (typeof fn !== 'function') throw new Error(`usage-ipc: ${name} must be a function.`);
  }
  if (typeof filePath !== 'string' || !filePath) throw new Error('usage-ipc: filePath is required.');
  if (typeof scriptPath !== 'string' || !scriptPath) throw new Error('usage-ipc: scriptPath is required.');
  const setupLine = buildSetupLine(scriptPath);
  // A bad file is refused visibly, but once per reason, not on every 30-second poll.
  const logged = new Set();
  function refuseOnce(reason) {
    if (!logged.has(reason)) { logged.add(reason); logRefusal(`Usage panel: ${reason}`); }
    return { ok: false, reason, setupLine };
  }

  function handleRead(event) {
    const g = assessSender(event);
    if (!g.ok) { logRefusal(`Usage read refused: ${g.reason}`); return { ok: false, reason: g.reason }; }
    let text;
    try {
      const st = statFile(filePath);
      if (!st || typeof st.size !== 'number' || st.size > usageFile.MAX_FILE_BYTES) return refuseOnce('usage-file-too-large');
      text = readFile(filePath);
    } catch (err) {
      // Not there yet: the status line isn't set up, or no session has had a reply since.
      if (err && err.code === 'ENOENT') return { ok: true, state: 'not-set-up', setupLine };
      return refuseOnce('usage-file-unreadable');
    }
    const parsed = usageFile.parseSnapshot(text);
    if (!parsed.ok) return refuseOnce(parsed.reason);
    logged.clear();
    return {
      ok: true,
      state: 'ok',
      capturedAt: parsed.capturedAt,
      fiveHour: parsed.fiveHour,
      sevenDay: parsed.sevenDay,
      setupLine,
    };
  }

  return { handleRead, setupLine };
}

module.exports = { createUsageIpc, buildSetupLine };
