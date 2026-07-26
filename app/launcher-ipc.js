'use strict';
// P12 launcher IPC boundary (pure). Owns open-vscode / open-terminal request handling so the pipeline
//   trusted-sender gate -> directory authorization -> deterministic exe resolution -> shell-free spawn
// is unit-testable in plain node (launcher-ipc.test.js) — including the security-critical property that
// an UNTRUSTED sender OR an UNAUTHORIZED directory OR an unresolvable executable spawns ZERO child
// processes. main.js injects the real gate, authorizer, resolvers, spawner, and logger — the same
// late-binding pattern as clipboard-ipc / library-ipc / followup-ipc. Every refusal carries a bounded
// reason CONSTANT only, never the offending path, so a refusal log line can't become an injection sink.
const { openVscodeSpec, openTerminalSpec } = require('./launchers');

function createLauncherIpc(deps) {
  const assessSender = deps && deps.assessSender;       // (event) => { ok, reason? }
  const authorize = deps && deps.authorize;             // (rawDir) => { ok, dir?, reason? }
  const resolveVscode = deps && deps.resolveVscode;     // () => { ok, exe?, reason? }
  const resolveTerminal = deps && deps.resolveTerminal; // () => exe string
  const launch = deps && deps.launch;                   // (cmd, args, onError) => void
  const logRefusal = (deps && deps.logRefusal) || (() => {});
  for (const [name, fn] of [
    ['assessSender', assessSender], ['authorize', authorize],
    ['resolveVscode', resolveVscode], ['resolveTerminal', resolveTerminal], ['launch', launch],
  ]) {
    if (typeof fn !== 'function') throw new Error(`launcher-ipc: ${name} must be a function.`);
  }

  function refuse(kind, reason) { logRefusal(`${kind} refused: ${reason}`); return undefined; }

  function handleOpenVscode(event, rawDir) {
    const g = assessSender(event);
    if (!g.ok) return refuse('Open in VS Code', g.reason);
    const a = authorize(rawDir);
    if (!a.ok) return refuse('Open in VS Code', a.reason);
    const exe = resolveVscode();
    if (!exe.ok) return refuse('Open in VS Code', exe.reason);
    const s = openVscodeSpec(exe.exe, a.dir);
    launch(s.cmd, s.args, (err) => refuse('Open in VS Code', `spawn-failed (${(err && err.code) || 'error'})`));
    return undefined;
  }

  function handleOpenTerminal(event, rawDir) {
    const g = assessSender(event);
    if (!g.ok) return refuse('Open Terminal', g.reason);
    const a = authorize(rawDir);
    if (!a.ok) return refuse('Open Terminal', a.reason);
    const exe = resolveTerminal();
    const s = openTerminalSpec(exe, a.dir);
    launch(s.cmd, s.args, (err) => refuse('Open Terminal', `spawn-failed (${(err && err.code) || 'error'})`));
    return undefined;
  }

  return { handleOpenVscode, handleOpenTerminal };
}

const api = { createLauncherIpc };
if (typeof module === 'object' && module.exports) module.exports = api;
