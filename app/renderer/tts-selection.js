// Terminal-selection handoff for the Speak button.
//
// The pane itself focuses xterm on mouse input. A speaker-button press therefore
// has to capture the selection before that generic focus behavior can clear it.
// Keep this a small classic-script module so app.js can use it without converting
// the whole renderer to ES modules; Node tests can require the same implementation.
(function exposeTtsSelection(global) {
  function usable(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function createSelectionMemory() {
    let remembered = '';
    return {
      remember(value) {
        if (usable(value)) remembered = value;
        return remembered.length;
      },
      peek() { return remembered; },
      clear() { remembered = ''; },
    };
  }

  function resolveSpeakAction({ selectionAtPointerDown, selectionAtClick, selectionRemembered, paneId, role }) {
    const text = usable(selectionAtPointerDown)
      ? selectionAtPointerDown
      : (usable(selectionAtClick)
        ? selectionAtClick
        : (usable(selectionRemembered) ? selectionRemembered : ''));
    const selectionSource = usable(selectionAtPointerDown) || usable(selectionAtClick)
      ? 'current'
      : (usable(selectionRemembered) ? 'remembered' : 'none');
    const source = `pane=${String(paneId)} role=${String(role)}`;

    if (!text) {
      return { ok: false, text: '', log: `[tts] selection missing: ${source}; select terminal text, then click speaker.\n` };
    }
    return { ok: true, text, log: `[tts] speak requested: ${source} chars=${text.length} selection=${selectionSource}\n` };
  }

  const api = { createSelectionMemory, resolveSpeakAction };
  global.ccTTSSelection = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
