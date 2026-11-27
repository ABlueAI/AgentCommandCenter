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
  function createStatusCheck(render, log) {
    let updated = false;
    return {
      async read(getStatus) {
        let result = null;
        try {
          result = await getStatus();
          if (!result || result.ok !== true) log(`[agent token] status check refused: ${result?.error || 'unknown error'}\n`);
          else if (result.loadIssue === 'invalid-shape' || result.loadIssue === 'unreadable') {
            log(`[agent token] the stored ABlueAgent token was refused at start-up (${result.loadIssue}); agent panes use your own git login until you save it again\n`);
          }
        } catch {
          log('[agent token] status check failed\n');
        }
        if (!updated) render(result);
      },
      update(result) {
        updated = true;
        render(result);
      },
    };
  }

  const api = { saveResultMessage, createStatusCheck };
  global.ccAgentTokenView = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
