'use strict';
// `pty-start` LAUNCH AUTHORITY (pure orchestrator).
//
// Mirrors the canonical P12 pipeline in launcher-ipc.js — trusted sender, then main-owned
// authorization, then the side effect — for the one privileged surface that never had it. Before
// this, `pty-start` received the IPC event as `_e` and never used it.
//
// TWO PHASES, AND THE ORDER IS THE POINT:
//   assess()              — sender trust, then main-owned classification. Runs as the FIRST
//                           statement of the handler, before any log, filesystem read, pane-status
//                           enrolment, admission claim, command construction, or spawn.
//   authorizeFencedRole() — effective-definition resolution and fence policy. Runs ONLY after the
//                           fenced cwd containment gate has passed, so no role directory is ever
//                           scanned for a launch whose cwd was not established first.
//
// Splitting them is deliberate: containment must precede scanning, and a single call could not
// express that without pulling main's settings/filesystem access into this module.
//
// Pure: every dependency is injected. No Electron, filesystem, process, or spawning.

function createPtyStartAuthority(deps) {
  const d = deps || {};
  const assessSender = d.assessSender;
  const classify = d.classify;
  const resolveDefinition = d.resolveDefinition;
  const assertPolicy = d.assertPolicy;
  const logRefusal = typeof d.logRefusal === 'function' ? d.logRefusal : function () {};
  for (const pair of [
    ['assessSender', assessSender], ['classify', classify],
    ['resolveDefinition', resolveDefinition], ['assertPolicy', assertPolicy],
  ]) {
    if (typeof pair[1] !== 'function') {
      throw new Error('pty-start-authority: ' + pair[0] + ' must be a function.');
    }
  }

  // Every refusal carries a bounded reason CONSTANT. Never a path, a prompt, a credential, an
  // environment value, or any other renderer-supplied payload.
  function refuse(stage, reason) {
    logRefusal('pty-start refused [' + stage + ']: ' + reason);
    return { ok: false, reason: reason };
  }

  function assess(event, opts) {
    const gate = assessSender(event);
    if (!gate || gate.ok !== true) return refuse('sender', (gate && gate.reason) || 'untrusted-sender');
    const launch = classify(opts);
    if (!launch || launch.ok !== true) return refuse('classify', (launch && launch.reason) || 'classify-malformed-opts');
    return { ok: true, launch: launch };
  }

  function authorizeFencedRole(req) {
    const role = req && req.role;
    const cwd = req && req.cwd;
    const found = resolveDefinition({ role: role, cwd: cwd });
    if (!found || found.ok !== true) return refuse('resolve', (found && found.reason) || 'resolve-bad-input');
    const policy = assertPolicy({ role: role, text: found.text });
    if (!policy || policy.ok !== true) return refuse('policy', (policy && policy.reason) || 'fence-policy-declaration-unparseable');
    return { ok: true, definitionPath: found.path, scope: found.scope, hookPath: policy.hookPath };
  }

  return { assess: assess, authorizeFencedRole: authorizeFencedRole };
}

module.exports = { createPtyStartAuthority: createPtyStartAuthority };
