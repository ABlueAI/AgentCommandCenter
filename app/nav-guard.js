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

// Cap on how much of the offending URL we echo into the log. Long enough to identify the target,
// short enough that a giant data:/blob: URL can't flood the Logs tab.
const MAX_LOG_URL = 200;

// Sanitize a URL for a single-line log entry. The whole point of B is to make silent denials VISIBLE,
// but a URL is attacker-influenced (git ref names, injected navigations), so it must never itself
// become a log-injection sink: strip C0/DEL control chars -- critically CR/LF, which would otherwise
// let a crafted URL forge extra log lines -- then truncate. Non-strings are coerced so a malformed
// event can't throw here.
function sanitizeForLog(url) {
  const s = (typeof url === 'string' ? url : String(url)).replace(/[\x00-\x1f\x7f]/g, '');
  return s.length > MAX_LOG_URL ? s.slice(0, MAX_LOG_URL) + '...(truncated)' : s;
}

// The visible refusal line sent to the renderer (main-error channel) whenever a navigation or
// window.open is denied. Names which guard fired and whether the target was forwarded to the OS
// browser (http(s)) or dropped entirely -- so a blocked file:/javascript: target reads as a refusal,
// not a silent no-op. Pure string builder; main.js does the send.
function refusalLine(guard, url, forwarded) {
  const disp = forwarded ? 'forwarded to external browser' : 'blocked (not forwarded)';
  return `[nav-guard] denied ${guard}: ${disp} -- ${sanitizeForLog(url)}`;
}

module.exports = { isHttpUrl, decideWindowOpen, decideNavigation, sanitizeForLog, refusalLine, MAX_LOG_URL };
