'use strict';
// Pure decisions for the BrowserWindow navigation lockdown (AUDIT-REPORT.md #3; electronegativity
// LIMIT_NAVIGATION HIGH). Dependency-free (no electron) so the allow/deny logic is unit-tested
// without launching Electron; main.js wires these into setWindowOpenHandler + will-navigate /
// will-redirect on the app's single BrowserWindow. The renderer carries the preload bridge, so a
// stray or injected navigation/popup must never repoint the window or open an uncontrolled child.
//
// Issue #163: a target handed to the OS browser goes through the SAME pipeline as the `open-external`
// IPC channel (open-external-ipc.js): the Quick Links URL policy (quick-links-policy.js validateUrl:
// no user info, at most 2048 characters, no control or bidi characters, no backslashes, no malformed
// or control percent escapes), then http(s) only, and the policy's normalized URL is what is opened.
// quick-links-policy.js is pure too, so this file still needs no Electron.

const { validateUrl } = require('./quick-links-policy');

function isHttpUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u);
}

// externalTarget(url) -> { url, reason }: `url` is the normalized URL to hand to the OS browser, or
// null with `reason` naming why not ('not-http' for any non-http(s) target, else the policy's reason).
// http(s) is checked before AND after the policy: the policy also accepts three desktop-app links
// (claude://, codex://, obsidian://) for stored Quick Links, and a page link must never launch an app.
function externalTarget(url) {
  if (!isHttpUrl(url)) return { url: null, reason: 'not-http' };
  const v = validateUrl(url);
  if (!v.ok) return { url: null, reason: v.reason };
  if (!isHttpUrl(v.url)) return { url: null, reason: 'not-http' };
  return { url: v.url, reason: null };
}

// window.open / target=_blank / middle-click: never open a child window. Forward an http(s) URL the
// policy accepts to the OS browser (externalTarget, the same rule as open-external); deny anything else.
function decideWindowOpen(url) {
  const t = externalTarget(url);
  return { action: 'deny', externalUrl: t.url, reason: t.reason };
}

// will-navigate / will-redirect: allow ONLY the app's own entry document (a reload of it). Forward an
// http(s) target to the OS browser and block everything else -- a file: URL to another local file, a
// custom scheme, etc. -- so nothing can repoint the window that still holds the preload bridge.
function decideNavigation(url, entryUrl) {
  if (url === entryUrl) return { allow: true, externalUrl: null, reason: null };
  const t = externalTarget(url);
  return { allow: false, externalUrl: t.url, reason: t.reason };
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
// not a silent no-op. Pure string builder; main.js does the send. `reason` (optional) is the
// decision's bounded reason constant; an http(s) target the URL policy refused names it, so the line
// says why a web link was not opened.
function refusalLine(guard, url, forwarded, reason) {
  const why = !forwarded && typeof reason === 'string' && /^[a-z][a-z-]{0,63}$/.test(reason) && reason !== 'not-http'
    ? `: ${reason}` : '';
  const disp = forwarded ? 'forwarded to external browser' : `blocked (not forwarded${why})`;
  return `[nav-guard] denied ${guard}: ${disp} -- ${sanitizeForLog(url)}`;
}

module.exports = { isHttpUrl, externalTarget, decideWindowOpen, decideNavigation, sanitizeForLog, refusalLine, MAX_LOG_URL };
