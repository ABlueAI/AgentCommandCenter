// Small, dependency-free state bridge between the classic renderer and the
// deferred audio ES modules. A module import can fail before it emits its
// ready event, so the controls need an honest unavailable state rather than a
// silent no-op.
(function exposeAudioModuleHealth(global) {
  function cleanDetail(value) {
    const text = String(value || 'unknown startup failure')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .trim();
    return (text || 'unknown startup failure').slice(0, 220);
  }

  function createAudioModuleHealth() {
    const state = {
      tts: { phase: 'pending', detail: '' },
      stt: { phase: 'pending', detail: '' },
    };
    function entry(kind) {
      if (!Object.prototype.hasOwnProperty.call(state, kind)) throw new Error(`Unknown audio module: ${kind}`);
      return state[kind];
    }
    return {
      get(kind) { const value = entry(kind); return { phase: value.phase, detail: value.detail }; },
      markReady(kind) { const value = entry(kind); value.phase = 'ready'; value.detail = ''; return this.get(kind); },
      markFailed(kind, detail) { const value = entry(kind); value.phase = 'failed'; value.detail = cleanDetail(detail); return this.get(kind); },
      failIfPending(kind, detail) {
        const value = entry(kind);
        return value.phase === 'pending' ? this.markFailed(kind, detail) : this.get(kind);
      },
    };
  }

  const api = { cleanDetail, createAudioModuleHealth };
  global.ccAudioModuleHealth = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
