'use strict';
// S05: a presentation observer of the existing validated, token-free pane-status views.
// No hook, IPC command, terminal parsing, process control, or provider payload access.
// OSS choice: docs/decisions/OSS-pane-notifications.md (ADOPT Electron Notification).

const MESSAGES = Object.freeze({
  attention: Object.freeze({
    title: 'Mako — Claude needs attention',
    body: 'A Claude pane needs attention. Open Mako and check its status badge.',
  }),
  'turn ended': Object.freeze({
    title: 'Mako — Claude turn ended',
    body: 'A Claude turn ended. Open Mako to review it; this does not mean the task is finished.',
  }),
});

function createPaneStatusNotifications({ Notification, platform, getWindow, log }) {
  const states = new Map();
  const active = new Map(); // Retain Electron objects for click/failure events; one per live pane.
  const report = typeof log === 'function' ? log : () => {};
  let disposed = false;
  let unsupportedReported = false;

  function dismiss(paneId) {
    const notification = active.get(paneId);
    active.delete(paneId);
    if (notification) {
      try { notification.close(); }
      catch { report('[pane-notifications] dismissal failed'); }
    }
  }

  function observe(view) {
    if (disposed || platform !== 'win32' || !view || typeof view.paneId !== 'string') return;
    const { paneId, state, reason } = view;
    if (state === 'unknown') {
      dismiss(paneId);
      // A heartbeat becoming stale (or a transport/version outage) must never re-arm an alert.
      // Clear only when a pane is new/released or the hooks have been removed.
      if (reason === 'no-signal' || reason === 'hook-removed') {
        states.delete(paneId);
      }
      return;
    }
    if (state === 'exited' || state === 'failed') {
      states.delete(paneId);
      dismiss(paneId);
      return;
    }
    if (states.get(paneId) === state) return;
    states.set(paneId, state);
    dismiss(paneId);
    if (!Object.hasOwn(MESSAGES, state)) return;

    try {
      if (!Notification || !Notification.isSupported()) {
        if (!unsupportedReported) report('[pane-notifications] desktop notifications unavailable');
        unsupportedReported = true;
        return;
      }
      const notification = new Notification({ ...MESSAGES[state] });
      active.set(paneId, notification);
      const forget = () => { if (active.get(paneId) === notification) active.delete(paneId); };
      notification.on('failed', () => {
        forget();
        report('[pane-notifications] delivery failed; check Windows notification settings');
      });
      // Keep the reference after timeout/dismissal: Windows can still activate a toast
      // from Notification Center. Replacement, pane removal or dispose releases it.
      notification.on('click', () => {
        // A stale toast must not act after the pane has changed/closed or Mako has shut down.
        if (disposed || active.get(paneId) !== notification) return;
        try {
          const win = getWindow();
          if (!win || win.isDestroyed()) return;
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        } catch { report('[pane-notifications] could not focus Mako'); }
      });
      notification.show();
    } catch {
      dismiss(paneId);
      report('[pane-notifications] delivery failed; check Windows notification settings');
    }
  }

  function dispose() {
    disposed = true;
    for (const paneId of active.keys()) dismiss(paneId);
    states.clear();
  }

  return { observe, dispose };
}

module.exports = { createPaneStatusNotifications };
