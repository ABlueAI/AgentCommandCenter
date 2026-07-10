'use strict';
// Pure decisions for the BrowserWindow navigation lockdown (AUDIT-REPORT.md #3; electronegativity
// LIMIT_NAVIGATION HIGH). Dependency-free (no electron) so the allow/deny logic is unit-tested
// without launching Electron; main.js wires these into setWindowOpenHandler + will-navigate /
// will-redirect on the app's single BrowserWindow. The renderer carries the preload bridge, so a
// stray or injected navigation/popup must never repoint the window or open an uncontrolled child.

function isHttpUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u);
}

// window.open / target=_blank / middle-click: never open a child window. Forward http(s) to the OS
// browser (the same http/https-only rule the links panel uses via open-external); deny anything else.
function decideWindowOpen(url) {
  return { action: 'deny', externalUrl: isHttpUrl(url) ? url : null };
}

// will-navigate / will-redirect: allow ONLY the app's own entry document (a reload of it). Forward an
// http(s) target to the OS browser and block everything else -- a file: URL to another local file, a
// custom scheme, etc. -- so nothing can repoint the window that still holds the preload bridge.
function decideNavigation(url, entryUrl) {
  if (url === entryUrl) return { allow: true, externalUrl: null };
  return { allow: false, externalUrl: isHttpUrl(url) ? url : null };
}

module.exports = { isHttpUrl, decideWindowOpen, decideNavigation };
