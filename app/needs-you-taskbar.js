'use strict';
// S19: the taskbar badge for "Needs you" (docs/DESIGN-BRIEF-1.1.md 5.2). Main already sees every
// validated, token-free pane-status view (it publishes them); this observer counts the panes whose
// status is `attention` and puts a red overlay dot on Mako's taskbar button while any wait, with
// the count in its accessible description. Quiet hours hold the toast, never the badge.
//
// Windows only (BrowserWindow.setOverlayIcon is a Windows taskbar feature). No hook, no IPC, no
// terminal output and no process control: it reads a pane id and a state word and sets an icon.

// A 16x16 red dot with a white rim (PNG, generated for this file; no external asset).
const DOT_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOUlEQVR42mNgoDb4TwAQrfmphy8KJmgILo24DCJLM05DqGIAsZqRDRluBgxsLFCckKiSlKmSmcgBAE9QBB9qmyuLAAAAAElFTkSuQmCC';

function describe(count) {
  return count === 1 ? '1 pane needs you' : `${count} panes need you`;
}

/**
 * deps: { platform, getWindow() -> BrowserWindow|null, nativeImage, log(line) }
 * Returns { observe(view), waiting() -> count, dispose() }.
 */
function createNeedsYouTaskbar({ platform, getWindow, nativeImage, log }) {
  const report = typeof log === 'function' ? log : () => {};
  const waiting = new Set();
  let icon = null;
  let shown = 0;
  let failedReported = false;
  let disposed = false;

  function dot() {
    if (!icon) icon = nativeImage.createFromDataURL(`data:image/png;base64,${DOT_PNG_BASE64}`);
    return icon;
  }

  function apply() {
    if (platform !== 'win32' || disposed) return;
    const count = waiting.size;
    if (count === shown) return;
    try {
      const win = typeof getWindow === 'function' ? getWindow() : null;
      if (!win || win.isDestroyed()) return;
      if (count > 0) win.setOverlayIcon(dot(), describe(count));
      else win.setOverlayIcon(null, '');
      shown = count;
    } catch {
      if (!failedReported) report('[needs-you-taskbar] the taskbar badge could not be set (overlay-failed)');
      failedReported = true;
    }
  }

  function observe(view) {
    if (disposed || !view || typeof view.paneId !== 'string' || !view.paneId) return;
    if (view.state === 'attention') waiting.add(view.paneId);
    else waiting.delete(view.paneId);
    apply();
  }

  function dispose() {
    waiting.clear();
    apply();
    disposed = true;
  }

  return { observe, waiting: () => waiting.size, dispose };
}

module.exports = { createNeedsYouTaskbar, describe, DOT_PNG_BASE64 };
