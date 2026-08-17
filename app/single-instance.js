'use strict';
// Electron single-instance behavior. A second Blue Helm launch is an ordinary operator accident and
// is therefore inside the admission budget's accidental-spend boundary. The OS-backed Electron lock
// prevents a second main process from creating independent PTYs; the primary process restores and
// focuses its existing window so the second launch has a visible, useful result.

const RESULT = Object.freeze({
  FOCUSED: 'focused',
  NO_WINDOW: 'no-window',
  FOCUS_FAILED: 'focus-failed',
});

function focusExistingWindow(getWindow, log = () => {}) {
  let win;
  try {
    win = typeof getWindow === 'function' ? getWindow() : null;
  } catch {
    log('[single-instance] second launch received; existing window lookup failed');
    return { ok: false, reason: RESULT.FOCUS_FAILED };
  }
  if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) {
    log('[single-instance] second launch received; primary window is not ready yet');
    return { ok: false, reason: RESULT.NO_WINDOW };
  }

  try {
    if (typeof win.isMinimized === 'function' && win.isMinimized() && typeof win.restore === 'function') {
      win.restore();
    }
    if (typeof win.show === 'function') win.show();
    if (typeof win.focus === 'function') win.focus();
    log('[single-instance] second launch received; restored and focused the existing window');
    return { ok: true, reason: RESULT.FOCUSED };
  } catch {
    log('[single-instance] second launch received; existing window focus failed');
    return { ok: false, reason: RESULT.FOCUS_FAILED };
  }
}

module.exports = { RESULT, focusExistingWindow };
