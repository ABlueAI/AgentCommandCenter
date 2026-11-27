'use strict';
// S06 LINK HARDENING (pure). The legacy `open-external` channel (e.g. the GitHub button)
// used to check only an /^https?:\/\// prefix and had no sender check. It now runs the same pipeline
// as the other privileged handlers:
//   trusted-sender gate -> Quick Links URL policy (quick-links-policy.js validateUrl) -> http(s) only
//   -> shell.openExternal with the policy's normalized URL. Terminal links additionally require
//   confirmation showing that same URL.
// The three desktop-app links the policy accepts (claude://, codex://, obsidian://) are for stored
// Quick Links only; a link printed in a terminal never launches an app. Every refusal logs a bounded
// reason constant, never the URL, so terminal output can't turn the log into an injection sink.

function createOpenExternalIpc(deps) {
  const assessSender = deps && deps.assessSender; // (event) => { ok, reason? }
  const validateUrl = deps && deps.validateUrl;   // (url) => { ok, url?, reason? }
  const openExternal = deps && deps.openExternal; // (url) => Promise | void
  const confirmTerminalLink = deps && deps.confirmTerminalLink; // (url) => Promise<boolean>
  const logRefusal = (deps && deps.logRefusal) || (() => {});
  for (const [name, fn] of [['assessSender', assessSender], ['validateUrl', validateUrl], ['openExternal', openExternal]]) {
    if (typeof fn !== 'function') throw new Error(`open-external-ipc: ${name} must be a function.`);
  }

  function refuse(reason) { logRefusal(`Open link refused: ${reason}`); return { ok: false, reason }; }

  function checkTarget(event, url) {
    const g = assessSender(event);
    if (!g.ok) return g;
    const v = validateUrl(url);
    if (v.ok && !/^https?:\/\//i.test(v.url)) return { ok: false, reason: 'url-protocol-not-allowed' };
    return v;
  }

  function handleOpenExternal(event, url) {
    const v = checkTarget(event, url);
    if (!v.ok) return refuse(v.reason);
    try {
      Promise.resolve(openExternal(v.url)).catch(() => logRefusal('Open link failed: os-open-failed'));
    } catch {
      return refuse('os-open-failed');
    }
    return { ok: true };
  }

  async function handleOpenTerminalLink(event, url) {
    const target = checkTarget(event, url);
    if (!target.ok) return refuse(target.reason);
    if (typeof confirmTerminalLink !== 'function') return refuse('confirmation-unavailable');
    try {
      if (await confirmTerminalLink(target.url) !== true) return { ok: false, reason: 'cancelled' };
    } catch {
      return refuse('confirmation-failed');
    }
    const sender = assessSender(event);
    if (!sender.ok) return refuse(sender.reason);
    try {
      await openExternal(target.url);
    } catch {
      return refuse('os-open-failed');
    }
    return { ok: true };
  }

  return { handleOpenExternal, handleOpenTerminalLink };
}

module.exports = { createOpenExternalIpc };
