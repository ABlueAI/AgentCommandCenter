#!/usr/bin/env node
/*
 * PreToolUse write fence (Blue Helm).
 *
 * Denies any Write/Edit/MultiEdit/NotebookEdit whose target path resolves OUTSIDE the
 * session's working directory. The launcher runs the fenced roles (web-scout, operator)
 * with cwd set to a dedicated outputs sandbox, so this confines their writes to that
 * sandbox — they cannot touch any repo, regardless of what their prompt says.
 *
 * Wired from a role's frontmatter:
 *   hooks:
 *     PreToolUse:
 *       - matcher: "Write|Edit|MultiEdit"
 *         hooks: [ { type: command, command: "node \"<abs path to this file>\"" } ]
 *
 * Contract (verified against Claude Code docs): reads a JSON object on stdin with
 * `cwd` and `tool_input.file_path`; exit 2 (with a stderr reason) blocks the call,
 * exit 0 allows it. Fails OPEN on malformed input so a hook bug never wedges an agent.
 */
const path = require('path');

let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  let data;
  try { data = JSON.parse(input); } catch { process.exit(0); } // unparseable -> don't block
  const ti = (data && data.tool_input) || {};
  const target = ti.file_path || ti.notebook_path || ti.path;
  if (!target) process.exit(0); // nothing path-like to check

  const root = path.resolve((data && data.cwd) || process.cwd());
  const resolved = path.resolve(root, target);

  // Windows paths are case-insensitive; compare case-folded there.
  const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const within = fold(resolved) === fold(root) || fold(resolved).startsWith(fold(root) + path.sep);

  if (within) process.exit(0); // allowed

  process.stderr.write(
    `Write fence: "${resolved}" is outside this role's sandbox (${root}). ` +
    `This role may only write inside its own output folder.`
  );
  process.exit(2); // block
});
