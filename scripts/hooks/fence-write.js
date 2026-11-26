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
 * Filesystem containment uses native realpath for the root and target. A new target must have
 * a verified existing ancestor. Windows paths must use ordinary drive-absolute or relative
 * syntax. Ambiguous Win32 spellings and filesystem errors are refused.
 *
 * Wired from a role's frontmatter:
 *   hooks:
 *     PreToolUse:
 *       - matcher: "Read|Write|Edit|MultiEdit"
 *         hooks: [ { type: command, command: "node \"<abs path to this file>\"" } ]
 * (web-scout's matcher also carries `WebFetch`, for the controlled-WebFetch gate below.)
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
 * its matcher routes both here: `browser_navigate` must pass the app's page-reader URL policy;
 * `browser_snapshot` never with a `filename` (Playwright would write
 * that file itself, outside the Write fence). Any other MCP tool that reaches this hook refuses, but
 * the matcher routes only those two here: the other Playwright tools are kept out by the launch's
 * main-issued --disallowedTools list (app/page-reader.js DENIED_MCP_TOOLS), not by this hook. The
 * literals equal app/page-reader.js and ROLE_MCP_TOOLS in app/role-fence-policy.js
 * (tripwire-tested in app/page-reader.test.js).
 *
 * RUNTIME TOOL ALLOWLIST (S58). A well-formed call for any tool other than HOOK_ALLOWED_TOOLS (and the
 * page-reader's two MCP tools above) refuses with a constant `[fence-tool-not-allowed]` reason, so a
 * matcher that routes more tools here (or a Claude Code version whose matcher reaches a tool it didn't
 * before) is refused instead of reaching the path check, which allows any call with no path. This is a
 * second layer: what keeps other tools away from a fenced role is its `tools:` line and main's
 * --disallowedTools, and only tools its matcher names reach this hook at all. NotebookEdit is refused
 * here outright; `notebook_path` below is read only for malformed input in `disabled` mode. The list
 * equals ALLOWED_TOOLS in app/role-fence-policy.js (tripwire-tested in app/web-reading-fence.test.js).
 *
 * MALFORMED INPUT (stdin not JSON, not an object, or `tool_name` not a string) refuses unless the mode
 * is exactly `disabled`, where the historical behaviour is kept (unparseable exits 0; a parsed payload
 * continues to the path check). A missing mode never allows because the input could not be parsed.
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
const PAGE_POLICY_ENV_KEY = 'BLUE_HELM_PAGE_READER_POLICY';
const PAGE_REFUSAL_MESSAGE =
  'Blocked by Mako page fence: this pane may only open public HTTPS pages and read them, with no file output. [fence-page-denied]';
const PAGE_POLICY_REFUSAL_MESSAGE =
  'Blocked by Mako page fence: the page URL check is unavailable. [fence-page-check-unavailable]';

const HOOK_ALLOWED_TOOLS = ['Read', 'Write', 'Edit', 'MultiEdit', 'WebSearch', 'WebFetch'];
const FILE_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit']);
const TOOL_REFUSAL_MESSAGE =
  'Blocked by Mako tool fence: this role may not use that tool. [fence-tool-not-allowed]';

const REFUSAL_MESSAGE =
  'Blocked by Mako path fence: this role may only access files inside its own sandbox. [fence-outside-sandbox]';

function ordinaryPath(value) {
  if (typeof value !== 'string' || value === '' || value.includes('\0')) {
    throw new Error('Invalid path');
  }
  if (process.platform !== 'win32') return value;

  const normalized = value.replace(/\//g, '\\');
  const driveAbsolute = /^[a-z]:\\/i.test(normalized);
  const tail = driveAbsolute ? normalized.slice(3) : normalized;
  // Refuse UNC, device namespaces, rooted paths without a drive, drive-relative paths and
  // alternate streams before asking the filesystem to resolve them.
  if ((!driveAbsolute && tail.startsWith('\\')) || /[<>:"|?*\x00-\x1f]/.test(tail)) {
    throw new Error('Unsupported Windows path');
  }
  for (const part of tail.split('\\')) {
    if (part === '.' || part === '..') continue;
    // Win32 can interpret these spellings differently depending on the API and namespace.
    if (/[. ]$/.test(part) || /^(?:con|prn|aux|nul|conin\$|conout\$|(?:com|lpt)[1-9¹²³]) *(?:\.|$)/i.test(part)) {
      throw new Error('Ambiguous Windows path component');
    }
  }
  return normalized;
}

// A new file may lack several parent directories. Only ENOENT on a genuinely absent entry
// permits trying its parent. In particular, lstat still sees a dangling link and blocks it.
function realOrNearest(target) {
  const missing = [];
  let current = target;
  for (;;) {
    let real;
    try {
      real = fs.realpathSync.native(current);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (real !== undefined) {
      if (missing.length === 0) return ordinaryPath(real);
      if (!fs.statSync(real).isDirectory()) throw new Error('Ancestor is not a directory');
      return path.join(ordinaryPath(real), ...missing.reverse());
    }

    try {
      fs.lstatSync(current);
      throw new Error('Existing path could not be resolved');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(current);
    const name = path.basename(current);
    if (parent === current || name === '.' || name === '..') throw new Error('Path could not be resolved');
    missing.push(name);
    current = parent;
  }
}

function isWithin(root, target) {
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (target === root || target.startsWith(prefix)) return true;
  if (process.platform !== 'win32') return false;
  if (target.toLowerCase() !== root.toLowerCase() && !target.toLowerCase().startsWith(prefix.toLowerCase())) return false;

  // NTFS also supports case-sensitive directories. Compare the actual directory identities
  // when the canonical spellings only agree after case folding.
  const volume = path.parse(target).root;
  const rootDepth = root.slice(path.parse(root).root.length).split(path.sep).filter(Boolean).length;
  const ancestor = path.join(volume, ...target.slice(volume.length).split(path.sep).slice(0, rootDepth));
  const expected = fs.statSync(root, { bigint: true });
  const actual = fs.statSync(ancestor, { bigint: true });
  return expected.ino !== 0n && expected.dev === actual.dev && expected.ino === actual.ino;
}

function realWithWindowsParents(absolute) {
  const volume = path.parse(absolute).root;
  let directory = volume;
  let parts = [];
  for (const part of absolute.slice(volume.length).split(path.sep)) {
    if (part === '..') {
      // Give native realpath the prefix before Win32 normalization can remove the parent
      // segment and the directory or junction it acts on.
      const real = ordinaryPath(fs.realpathSync.native(path.join(directory, ...parts)));
      if (!fs.statSync(real).isDirectory()) throw new Error('Parent segment must follow a directory');
      directory = path.dirname(real);
      parts = [];
    } else if (part && part !== '.') {
      parts.push(part);
    }
  }
  return realOrNearest(path.join(directory, ...parts));
}

function isAllowedPath(cwd, target) {
  const base = ordinaryPath(cwd);
  const requested = ordinaryPath(target);
  if (!path.isAbsolute(base)) return false;
  const root = ordinaryPath(fs.realpathSync.native(base));
  if (!fs.statSync(root).isDirectory()) return false;

  const lexical = path.resolve(root, requested);
  if (!isWithin(root, realOrNearest(lexical))) return false;

  // Check physical resolution as well when normalization could discard a directory alias
  // before a parent segment.
  const absolute = path.isAbsolute(requested) ? requested : root + path.sep + requested;
  if (process.platform === 'win32') {
    return !requested.split(path.sep).includes('..') || isWithin(root, realWithWindowsParents(absolute));
  }
  return absolute === lexical || isWithin(root, realOrNearest(absolute));
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

// Mako issues the absolute path to its own validator for the classified page-reader launch.
// The hook is deployed outside the checkout, so it uses that app-owned path for navigation only.
function isAllowedPageUrl(url) {
  const policyPath = process.env[PAGE_POLICY_ENV_KEY];
  if (!policyPath || !path.isAbsolute(policyPath)) refuse(PAGE_POLICY_REFUSAL_MESSAGE);
  try {
    const policy = require(policyPath);
    if (typeof url === 'string' && url.length > policy.MAX_URL_LENGTH) return false;
    const checked = policy.validatePageUrl(url);
    if (checked.reason !== policy.REASON.CHECK_UNAVAILABLE) return checked.ok === true;
  } catch {
    refuse(PAGE_POLICY_REFUSAL_MESSAGE);
  }
  refuse(PAGE_POLICY_REFUSAL_MESSAGE);
}

let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  const mode = process.env[WEBFETCH_MODE_ENV];
  let data;
  let parsed = true;
  try { data = JSON.parse(input.replace(/^﻿/, '')); } catch { parsed = false; }
  const wellFormed = parsed && data !== null && typeof data === 'object' && !Array.isArray(data)
    && typeof data.tool_name === 'string';
  if (!wellFormed) {
    if (mode !== WEBFETCH_DISABLED) refuse(INPUT_REFUSAL_MESSAGE);
    if (!parsed) process.exit(0); // `disabled` only: unparseable -> don't block (historical behaviour)
  }

  if (wellFormed && data.tool_name === 'WebFetch') {
    if (mode === WEBFETCH_DISABLED) process.exit(0); // ordinary permission flow; grants nothing itself
    const wti = data.tool_input !== null && typeof data.tool_input === 'object' ? data.tool_input : {};
    if (mode === WEBFETCH_ORIGIN && isAllowedWebFetchUrl(wti.url)) process.exit(0);
    refuse(WEBFETCH_REFUSAL_MESSAGE); // wrong destination, or a missing/unexpected mode
  }

  if (wellFormed && data.tool_name.startsWith('mcp__')) {
    const pti = data.tool_input !== null && typeof data.tool_input === 'object' && !Array.isArray(data.tool_input)
      ? data.tool_input : null;
    if (pti && data.tool_name === PAGE_NAVIGATE_TOOL && isAllowedPageUrl(pti.url)) process.exit(0);
    if (pti && data.tool_name === PAGE_SNAPSHOT_TOOL
      && (pti.filename === undefined || pti.filename === null || pti.filename === '')) process.exit(0);
    refuse(PAGE_REFUSAL_MESSAGE); // any other MCP tool, a non-https page, or a snapshot to a file
  }

  // Any other tool: only the reviewed allowlist reaches the path check below.
  if (wellFormed && HOOK_ALLOWED_TOOLS.indexOf(data.tool_name) === -1) refuse(TOOL_REFUSAL_MESSAGE);

  const ti = (data && data.tool_input) || {};
  const requiresPath = wellFormed && FILE_TOOLS.has(data.tool_name);
  const target = requiresPath ? ti.file_path : ti.file_path || ti.notebook_path || ti.path;
  if (!requiresPath && !target) process.exit(0); // non-file tool without a path
  let allowed;
  try {
    allowed = isAllowedPath(data && data.cwd, target);
  } catch {
    refuse(REFUSAL_MESSAGE);
  }
  if (allowed) process.exit(0);

  // One CONSTANT refusal. It never names the requested path, the resolved path, the cwd or the sandbox
  // root: the refusal is shown to the model and in the pane, and a path is itself disclosure.
  refuse(REFUSAL_MESSAGE);
});
