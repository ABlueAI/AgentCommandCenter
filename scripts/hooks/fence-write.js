#!/usr/bin/env node
/*
 * PreToolUse path fence (Blue Helm).
 *
 * Denies any Read/Write/Edit/MultiEdit/NotebookEdit whose target resolves OUTSIDE the
 * session's working directory. The launcher runs the fenced roles (web-scout, operator)
 * with cwd set to a dedicated outputs sandbox, so this confines them to that sandbox —
 * they cannot touch any repo, regardless of what their prompt says.
 *
 * Originally write-only. Extended to also gate Read (Blue Helm checklist P1, hard gate):
 * the write-fence stopped exfil-by-write, but a prompt-injected web-scout/operator could
 * still `Read` a repo secret (e.g. `.env`) and emit its contents in normal output. Read
 * needed the same boundary as Write, enforced the same way — at the hook, not the prompt.
 *
 * Resolution is filesystem-real, not just textual. `path.resolve` alone collapses `..\`
 * lexically but does NOT follow symlinks — a symlink sitting inside the sandbox that points
 * outside it would pass a pure path.resolve check. We resolve via fs.realpathSync, walking
 * up to the nearest existing ancestor when the target itself doesn't exist yet (true for
 * most writes, and harmless for reads of paths that were never there).
 *
 * Wired from a role's frontmatter (S58: every tool call, and the role's own name as the one argument):
 *   hooks:
 *     PreToolUse:
 *       - matcher: "*"
 *         hooks: [ { type: command, command: "node \"<abs path to this file>\" <role>" } ]
 *
 * Contract (verified against Claude Code docs): reads a JSON object on stdin with
 * `cwd`, `tool_name` and `tool_input`; exit 2 (with a stderr reason) blocks the call,
 * exit 0 allows it.
 *
 * CONTROLLED WEBFETCH GATE. Blue Helm issues BLUE_HELM_CONTROLLED_WEBFETCH_MODE to every fenced
 * web-scout pane: `https://example.com` for the admission-controlled pane, which alone also carries the
 * CLI grant `--allowedTools 'WebFetch(domain:example.com)'`, and `disabled` for every other one. The CLI
 * grant keys on the hostname only, so this gate is the narrower layer: in origin mode a WebFetch is
 * allowed only for https://example.com on the default port with no userinfo. `disabled` leaves WebFetch
 * to Claude Code's ordinary permission flow. A missing or any other mode refuses, so losing the
 * variable can never leave the CLI grant without this gate. The mode is read from this process's own
 * environment, never from the payload. Scope (Blue decision D1): this checks the INITIAL request; Claude
 * Code may internally follow its built-in example.com/www.example.com redirect rule, which no hook sees.
 * The literals below equal CONTROLLED_WEBFETCH in app/role-fence-policy.js (tripwire-tested); this file
 * is deployed standalone and cannot require it.
 *
 * PAGE-READER BROWSER GATE (S15). The page-reader role may call exactly two Playwright MCP tools, and
 * its matcher routes both here: `browser_navigate` only to an https: URL with no userinfo, at most
 * PAGE_MAX_URL_LENGTH characters; `browser_snapshot` never with a `filename` (Playwright would write
 * that file itself, outside the Write fence). Since S58 every other MCP tool reaches this hook too and
 * refuses at the allowlist; the launch's main-issued --disallowedTools list (app/page-reader.js
 * DENIED_MCP_TOOLS) stays as the layer in front of it. The
 * literals equal app/page-reader.js and ROLE_MCP_TOOLS in app/role-fence-policy.js
 * (tripwire-tested in app/page-reader.test.js).
 *
 * S58 TOOL ALLOWLIST (fenced web-reading agents). Every web-reading role routes EVERY tool call here
 * (`matcher: "*"`) and names itself as the hook's one argument (`node "<hook>" <role>`). Before any other
 * gate, the call's tool must be on that role's allowlist (ROLE_TOOLS below, exact and case-sensitive);
 * anything else refuses with one constant message, so a tool the CLI adds later, a `tools:` line that
 * drifted, or a tool the model is talked into asking for is stopped here, not only by the role's
 * `tools:` line and main's --disallowedTools. A missing, unknown or extra argument refuses every call.
 * ROLE_TOOLS equals ROLE_TOOL_ALLOWLIST in app/role-fence-policy.js (tripwire-tested in
 * app/fenced-web-roles.test.js); the launch policy refuses a deployed role whose entry is not `*` or
 * whose argument is not its own name. WebFetch is origin-gated for web-scout only (above); operator and
 * source-scout keep Claude Code's ordinary WebFetch permission flow, as before S58.
 *
 * MALFORMED INPUT (stdin not JSON, not an object, or `tool_name` not a string) always refuses: the hook
 * can't check a tool it can't read against the allowlist. (Before S58 the `disabled` WebFetch mode let
 * unparseable input through; that exception is gone.)
 *
 * Required as a module (tests), it exports its constants and runs nothing.
 */
const fs = require('fs');
const path = require('path');

const WEBFETCH_MODE_ENV = 'BLUE_HELM_CONTROLLED_WEBFETCH_MODE';
const WEBFETCH_ORIGIN = 'https://example.com';
const WEBFETCH_HOSTNAME = 'example.com';
const WEBFETCH_DISABLED = 'disabled';
const WEBFETCH_MAX_URL_LENGTH = 2000;

const WEBFETCH_REFUSAL_MESSAGE =
  'Blocked by Mako web fence: this pane may not fetch that destination. [fence-webfetch-denied]';
const INPUT_REFUSAL_MESSAGE =
  'Blocked by Mako fence: the tool request could not be verified. [fence-input-unverifiable]';

const PAGE_NAVIGATE_TOOL = 'mcp__playwright__browser_navigate';
const PAGE_SNAPSHOT_TOOL = 'mcp__playwright__browser_snapshot';
const PAGE_MAX_URL_LENGTH = 2000;
const PAGE_REFUSAL_MESSAGE =
  'Blocked by Mako page fence: this pane may only open https pages and read them, with no file output. [fence-page-denied]';

const REFUSAL_MESSAGE =
  'Blocked by Mako path fence: this role may only access files inside its own sandbox. [fence-outside-sandbox]';

// S58: each web-reading role's whole tool allowlist. Equal to ROLE_TOOL_ALLOWLIST in
// app/role-fence-policy.js and to each tracked role's `tools:` line (app/fenced-web-roles.test.js).
const ROLE_TOOLS = Object.freeze({
  'web-scout': Object.freeze(['WebSearch', 'WebFetch', 'Read', 'Write']),
  'operator': Object.freeze(['Read', 'WebSearch', 'WebFetch', 'Write']),
  'source-scout': Object.freeze(['WebSearch', 'WebFetch', 'Read', 'Write']),
  'page-reader': Object.freeze(['Read', 'Write', PAGE_NAVIGATE_TOOL, PAGE_SNAPSHOT_TOOL]),
});
// The one role whose WebFetch goes through the origin gate (CONTROLLED_WEBFETCH.role in the policy).
const WEBFETCH_GATED_ROLE = 'web-scout';

const TOOL_REFUSAL_MESSAGE =
  'Blocked by Mako tool fence: this role may not use that tool. [fence-tool-not-allowed]';
const ROLE_REFUSAL_MESSAGE =
  'Blocked by Mako tool fence: the fence was started without a known role, so every tool is refused. [fence-role-unknown]';

// The role named by the hook's one argument, or null when it is missing, unknown or not alone.
function roleFromArgv(argv) {
  if (!Array.isArray(argv) || argv.length !== 3) return null;
  const r = argv[2];
  return typeof r === 'string' && Object.prototype.hasOwnProperty.call(ROLE_TOOLS, r) ? r : null;
}

// Resolve the real (symlink-free) path. Walks up to the nearest existing ancestor if the
// target doesn't exist yet, then re-appends the unresolved tail, so a brand-new file inside
// a real sandbox dir still resolves correctly instead of throwing ENOENT.
function realOrNearest(p) {
  try {
    return fs.realpathSync.native(p);
  } catch {
    const parent = path.dirname(p);
    if (parent === p) return p; // hit a filesystem root; nothing left to resolve
    return path.join(realOrNearest(parent), path.basename(p));
  }
}

// Constant refusals only: none names a path, URL, host or port.
function refuse(message) {
  process.stderr.write(message);
  process.exit(2); // block
}

// Origin mode: exactly https://example.com on the default port, no userinfo. WHATWG parsing, the same
// family Claude Code uses, so `:443` normalizes to the default port and a trailing dot is kept (and
// refused) rather than stripped.
function isAllowedWebFetchUrl(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > WEBFETCH_MAX_URL_LENGTH) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  return u.protocol === 'https:' && u.hostname === WEBFETCH_HOSTNAME && u.port === ''
    && u.username === '' && u.password === '';
}

// https: only, no user name or password, bounded length, WHATWG parsing (as for WebFetch above).
function isAllowedPageUrl(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > PAGE_MAX_URL_LENGTH) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  return u.protocol === 'https:' && u.username === '' && u.password === '';
}

function decide(input, role) {
  const mode = process.env[WEBFETCH_MODE_ENV];
  let data;
  let parsed = true;
  try { data = JSON.parse(input.replace(/^﻿/, '')); } catch { parsed = false; }
  const wellFormed = parsed && data !== null && typeof data === 'object' && !Array.isArray(data)
    && typeof data.tool_name === 'string';
  if (!wellFormed) refuse(INPUT_REFUSAL_MESSAGE);

  // S58: the role's allowlist comes first, before any tool-specific gate.
  if (role === null) refuse(ROLE_REFUSAL_MESSAGE);
  if (ROLE_TOOLS[role].indexOf(data.tool_name) === -1) refuse(TOOL_REFUSAL_MESSAGE);

  if (data.tool_name === 'WebFetch') {
    // operator and source-scout: Claude Code's ordinary permission flow, as before S58 (no grant is
    // issued to them, and exit 0 without output approves nothing by itself).
    if (role !== WEBFETCH_GATED_ROLE) process.exit(0);
    if (mode === WEBFETCH_DISABLED) process.exit(0); // ordinary permission flow; grants nothing itself
    const wti = data.tool_input !== null && typeof data.tool_input === 'object' ? data.tool_input : {};
    if (mode === WEBFETCH_ORIGIN && isAllowedWebFetchUrl(wti.url)) process.exit(0);
    refuse(WEBFETCH_REFUSAL_MESSAGE); // wrong destination, or a missing/unexpected mode
  }

  if (data.tool_name.startsWith('mcp__')) {
    const pti = data.tool_input !== null && typeof data.tool_input === 'object' && !Array.isArray(data.tool_input)
      ? data.tool_input : null;
    if (pti && data.tool_name === PAGE_NAVIGATE_TOOL && isAllowedPageUrl(pti.url)) process.exit(0);
    if (pti && data.tool_name === PAGE_SNAPSHOT_TOOL
      && (pti.filename === undefined || pti.filename === null || pti.filename === '')) process.exit(0);
    refuse(PAGE_REFUSAL_MESSAGE); // any other MCP tool, a non-https page, or a snapshot to a file
  }

  const ti = data.tool_input || {};
  const target = ti.file_path || ti.notebook_path || ti.path;
  if (!target) process.exit(0); // nothing path-like to check

  const root = realOrNearest(path.resolve(data.cwd || process.cwd()));
  const resolved = realOrNearest(path.resolve(root, target));

  // Windows paths are case-insensitive; compare case-folded there.
  const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const within = fold(resolved) === fold(root) || fold(resolved).startsWith(fold(root) + path.sep);

  if (within) process.exit(0); // allowed

  // One CONSTANT refusal. It never names the requested path, the resolved path, the cwd or the sandbox
  // root: the refusal is shown to the model and in the pane, and a path is itself disclosure.
  refuse(REFUSAL_MESSAGE);
}

if (require.main === module) {
  // The role is read before stdin, but decided on only after the whole request has been read.
  const role = roleFromArgv(process.argv);
  let input = '';
  process.stdin.on('data', (d) => { input += d; });
  process.stdin.on('end', () => decide(input, role));
}

module.exports = {
  ROLE_TOOLS,
  WEBFETCH_GATED_ROLE,
  TOOL_REFUSAL_MESSAGE,
  ROLE_REFUSAL_MESSAGE,
  INPUT_REFUSAL_MESSAGE,
  roleFromArgv,
};
