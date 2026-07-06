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
 *
 * Contract (verified against Claude Code docs): reads a JSON object on stdin with
 * `cwd` and `tool_input.file_path`; exit 2 (with a stderr reason) blocks the call,
 * exit 0 allows it. Fails OPEN on malformed input so a hook bug never wedges an agent.
 */
const fs = require('fs');
const path = require('path');

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

let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  let data;
  try { data = JSON.parse(input.replace(/^﻿/, '')); } catch { process.exit(0); } // unparseable -> don't block
  const ti = (data && data.tool_input) || {};
  const target = ti.file_path || ti.notebook_path || ti.path;
  if (!target) process.exit(0); // nothing path-like to check

  const root = realOrNearest(path.resolve((data && data.cwd) || process.cwd()));
  const resolved = realOrNearest(path.resolve(root, target));

  // Windows paths are case-insensitive; compare case-folded there.
  const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const within = fold(resolved) === fold(root) || fold(resolved).startsWith(fold(root) + path.sep);

  if (within) process.exit(0); // allowed

  process.stderr.write(
    `Path fence: "${resolved}" (from "${target}") is outside this role's sandbox (${root}). ` +
    `This role may only access files inside its own output folder.`
  );
  process.exit(2); // block
});
