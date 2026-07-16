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

  // Claude's terminal UI enables xterm mouse tracking. In that mode an ordinary
  // drag is forwarded to the TUI instead of creating an xterm selection (Windows
  // users can force xterm selection with Shift, but Speak must not require a
  // hidden modifier). Map the completed drag back into xterm's PUBLIC select()
  // API. A click that begins and ends in one cell remains a normal TUI click.
  function pointerToBufferCell(event, rect, cols, rows, viewportY) {
    if (!event || !rect || !(rect.width > 0) || !(rect.height > 0)
      || !Number.isInteger(cols) || cols < 1 || !Number.isInteger(rows) || rows < 1) return null;
    const clamp = (value, max) => Math.max(0, Math.min(max, value));
    const column = clamp(Math.floor(((Number(event.clientX) - rect.left) / rect.width) * cols), cols - 1);
    const viewportRow = clamp(Math.floor(((Number(event.clientY) - rect.top) / rect.height) * rows), rows - 1);
    if (!Number.isFinite(column) || !Number.isFinite(viewportRow)) return null;
    return { column, row: Math.max(0, Number(viewportY) || 0) + viewportRow };
  }

  function resolveDragSelection(start, end, cols) {
    if (!start || !end || !Number.isInteger(cols) || cols < 1) return null;
    const startOffset = start.row * cols + start.column;
    const endOffset = end.row * cols + end.column;
    if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset) || startOffset === endOffset) return null;
    const first = Math.min(startOffset, endOffset);
    const last = Math.max(startOffset, endOffset);
    return { column: first % cols, row: Math.floor(first / cols), length: last - first + 1 };
  }

  function installMouseTrackingSelectionFallback({ term, element, remember, onCapture }) {
    if (!term || !element || typeof element.addEventListener !== 'function') {
      throw new Error('TTS mouse-selection fallback requires a terminal and element');
    }
    const doc = element.ownerDocument;
    if (!doc || typeof doc.addEventListener !== 'function') {
      throw new Error('TTS mouse-selection fallback requires an owner document');
    }
    let dragStart = null;

    const currentCell = (event) => {
      const screen = term.element && term.element.querySelector('.xterm-screen');
      if (!screen || typeof screen.getBoundingClientRect !== 'function') return null;
      const viewportY = term.buffer && term.buffer.active ? term.buffer.active.viewportY : 0;
      return pointerToBufferCell(event, screen.getBoundingClientRect(), term.cols, term.rows, viewportY);
    };

    const onMouseDown = (event) => {
      dragStart = null;
      const mode = term.modes && term.modes.mouseTrackingMode;
      if (!event || event.button !== 0 || event.shiftKey || !mode || mode === 'none') return;
      dragStart = currentCell(event);
      if (dragStart && typeof term.clearSelection === 'function') term.clearSelection();
    };

    const onMouseUp = (event) => {
      const start = dragStart;
      dragStart = null;
      if (!start) return;
      const mode = term.modes && term.modes.mouseTrackingMode;
      if (!mode || mode === 'none') return;
      // A genuine xterm selection (for example Shift+drag) always wins.
      if (typeof term.getSelection === 'function' && term.getSelection()) return;
      const range = resolveDragSelection(start, currentCell(event), term.cols);
      if (!range) return; // same-cell click: preserve normal agent-TUI interaction
      term.select(range.column, range.row, range.length);
      const text = term.getSelection();
      if (typeof remember === 'function') remember(text);
      if (typeof onCapture === 'function') onCapture(text.length);
    };

    element.addEventListener('mousedown', onMouseDown, true);
    doc.addEventListener('mouseup', onMouseUp, true);
    return {
      dispose() {
        element.removeEventListener('mousedown', onMouseDown, true);
        doc.removeEventListener('mouseup', onMouseUp, true);
        dragStart = null;
      },
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

  const api = {
    createSelectionMemory,
    installMouseTrackingSelectionFallback,
    pointerToBufferCell,
    resolveDragSelection,
    resolveSpeakAction,
  };
  global.ccTTSSelection = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
