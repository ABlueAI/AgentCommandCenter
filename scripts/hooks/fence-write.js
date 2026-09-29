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
  'Blocked by Blue Helm web fence: this pane may not fetch that destination. [fence-webfetch-denied]';
const INPUT_REFUSAL_MESSAGE =
  'Blocked by Blue Helm fence: the tool request could not be verified. [fence-input-unverifiable]';

const REFUSAL_MESSAGE =
  'Blocked by Blue Helm path fence: this role may only access files inside its own sandbox. [fence-outside-sandbox]';

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

  const ti = (data && data.tool_input) || {};
  const target = ti.file_path || ti.notebook_path || ti.path;
  if (!target) process.exit(0); // nothing path-like to check

  const root = realOrNearest(path.resolve((data && data.cwd) || process.cwd()));
  const resolved = realOrNearest(path.resolve(root, target));

  // Windows paths are case-insensitive; compare case-folded there.
  const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const within = fold(resolved) === fold(root) || fold(resolved).startsWith(fold(root) + path.sep);

  if (within) process.exit(0); // allowed

  // One CONSTANT refusal. It never names the requested path, the resolved path, the cwd or the sandbox
  // root: the refusal is shown to the model and in the pane, and a path is itself disclosure.
  refuse(REFUSAL_MESSAGE);
});
