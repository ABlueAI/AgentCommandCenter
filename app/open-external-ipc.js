'use strict';
// S06 LINK HARDENING (pure). The legacy `open-external` channel (terminal links, the GitHub button)
// used to check only an /^https?:\/\// prefix and had no sender check. It now runs the same pipeline
// as the other privileged handlers:
//   trusted-sender gate -> Quick Links URL policy (quick-links-policy.js validateUrl) -> http(s) only
//   -> shell.openExternal with the policy's normalized URL.
// The three desktop-app links the policy accepts (claude://, codex://, obsidian://) are for stored
// Quick Links only; a link printed in a terminal never launches an app. Every refusal logs a bounded
// reason constant, never the URL, so terminal output can't turn the log into an injection sink.

function createOpenExternalIpc(deps) {
  const assessSender = deps && deps.assessSender; // (event) => { ok, reason? }
  const validateUrl = deps && deps.validateUrl;   // (url) => { ok, url?, reason? }
  const openExternal = deps && deps.openExternal; // (url) => Promise | void
  const logRefusal = (deps && deps.logRefusal) || (() => {});
  for (const [name, fn] of [['assessSender', assessSender], ['validateUrl', validateUrl], ['openExternal', openExternal]]) {
    if (typeof fn !== 'function') throw new Error(`open-external-ipc: ${name} must be a function.`);
  }

  function refuse(reason) { logRefusal(`Open link refused: ${reason}`); return { ok: false, reason }; }

  function handleOpenExternal(event, url) {
    const g = assessSender(event);
    if (!g.ok) return refuse(g.reason);
    const v = validateUrl(url);
    if (!v.ok) return refuse(v.reason);
    if (!/^https?:\/\//i.test(v.url)) return refuse('url-protocol-not-allowed');
    try {
      Promise.resolve(openExternal(v.url)).catch(() => logRefusal('Open link failed: os-open-failed'));
    } catch {
      return refuse('os-open-failed');
    }
    return { ok: true };
  }

  return { handleOpenExternal };
}

module.exports = { createOpenExternalIpc };
