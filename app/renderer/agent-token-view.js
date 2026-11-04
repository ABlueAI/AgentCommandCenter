'use strict';
// S31 item 4: the text the ABlueAgent token banner shows after Save. PURE: no DOM, no IPC.
// Main's reply carries a bounded reason that never contains the token (agent-git-env.js
// normalizeAgentToken); this only turns it into the banner line.
((global) => {
  function saveResultMessage(result) {
    if (result && result.ok === true) return { ok: true, text: 'Token stored (encrypted).' };
    const reason = result && typeof result.error === 'string' && result.error ? result.error : 'unknown error';
    return { ok: false, text: `Not saved: ${reason}.` };
  }
  const api = { saveResultMessage };
  global.ccAgentTokenView = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
