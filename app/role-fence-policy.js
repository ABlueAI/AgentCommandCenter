'use strict';
// FENCED-ROLE DECLARATION POLICY (P4 + hook integrity).
//
// Applied to the EFFECTIVE role definition selected by role-definition-resolver.js, at spawn time,
// before any side effect. It answers one question: may this fenced role be launched at all?
//
// It replaces the pre-existing `verify-fence` whole-file regexes, which bound nothing structurally.
// An independent probe drove the real handler against synthetic content and got ok:true for all of:
//   * the canonical role;
//   * a role whose matcher covered only `Read` while its tools still declared `Write`;
//   * a role with an EMPTY `PreToolUse` list whose fence command sat under `PostToolUse`.
// So the checks here bind the approved command to the actual PreToolUse entry, and bind that same
// entry's matcher to the operations the role's own `tools:` line declares.
//
// THREAT LIMITATION, STATED HONESTLY AND NOT SOFTENED: every check here reads files the launching
// user can also write. This defeats an unreviewed or drifted declaration, a renderer-side bypass,
// and a stale deployment. It is NOT isolation from a malicious or compromised same-user process,
// which can edit the deployed role, the hook, or this application before the check runs.
//
// Pure apart from injected filesystem/hash accessors.

const { parseRoleFrontmatter } = require('./role-frontmatter');

// The dormant-but-catastrophic set. `Bash` gives a shell the path fence cannot gate (its input is a
// command string, not a file path); `Glob` and `NotebookEdit` reach paths the matcher does not cover.
const FORBIDDEN_TOOLS = Object.freeze(['Bash', 'Glob', 'NotebookEdit']);

// Tools whose invocation carries a filesystem path and therefore MUST be covered by the fence
// matcher when the role declares them.
const PATH_CAPABLE_TOOLS = Object.freeze(['Read', 'Write', 'Edit', 'MultiEdit']);

const REASON = Object.freeze({
  PLACEHOLDER: 'fence-policy-unsubstituted-hook-placeholder',
  PARSE: 'fence-policy-declaration-unparseable',
  IDENTITY_MISMATCH: 'fence-policy-identity-mismatch',
  TOOLS_ABSENT: 'fence-policy-tools-not-declared',
  FORBIDDEN_TOOL: 'fence-policy-forbidden-tool-declared',
  PRETOOLUSE_MISSING: 'fence-policy-pretooluse-absent-or-empty',
  HOOK_NOT_IN_PRETOOLUSE: 'fence-policy-fence-hook-not-in-pretooluse-entry',
  HOOK_COMMAND_FORM: 'fence-policy-hook-command-form-unsupported',
  HOOK_PATH_NOT_CANONICAL: 'fence-policy-hook-path-not-canonical',
  HOOK_FILE_MISSING: 'fence-policy-hook-file-missing',
  HOOK_CONTENT_MISMATCH: 'fence-policy-hook-content-not-tracked-identity',
  MATCHER_UNSUPPORTED: 'fence-policy-matcher-form-unsupported',
  MATCHER_COVERAGE: 'fence-policy-matcher-does-not-cover-declared-tools',
});

// `node "<absolute path>"` and nothing else. A bare `node path` or an extra argument refuses.
const COMMAND_FORM = /^node\s+"(.+)"$/;
// Plain alternation only. Any other regex metacharacter refuses rather than being interpreted.
const MATCHER_FORM = /^[A-Za-z]+(\|[A-Za-z]+)*$/;

function refuse(reason) { return { ok: false, reason: reason }; }

/**
 * assertFencedRoleDefinition({ role, text, canonicalHookPath, trackedHookSha256, fsx, hashFile, platform })
 *   -> { ok:true, hookPath, tools, matcher } | { ok:false, reason }
 *
 * `canonicalHookPath` and `trackedHookSha256` are MAIN-ISSUED. The renderer supplies neither.
 */
function assertFencedRoleDefinition(input) {
  const inp = input || {};
  const role = inp.role;
  const text = inp.text;
  const fsx = inp.fsx || {};
  const platform = inp.platform || process.platform;
  const fold = (p) => (platform === 'win32' ? String(p).toLowerCase() : String(p));

  // A deployed file still carrying the placeholder was never processed by sync-roles.ps1.
  if (typeof text === 'string' && text.indexOf('__CC_HOOK__') !== -1) return refuse(REASON.PLACEHOLDER);

  const parsed = parseRoleFrontmatter(text);
  if (!parsed.ok) return refuse(REASON.PARSE);

  // Identity comes from frontmatter `name`, never the filename (documented resolution rule).
  if (parsed.name !== role) return refuse(REASON.IDENTITY_MISMATCH);

  // An OMITTED `tools:` key inherits ALL tools, which includes Bash. Fail closed — this is
  // documented loader behaviour, not a defensive guess.
  if (!parsed.toolsDeclared) return refuse(REASON.TOOLS_ABSENT);

  // `disallowedTools` is deliberately NOT consulted here: a denylist must never be able to rescue a
  // forbidden entry that the allowlist granted. Policy is evaluated on `tools:` alone.
  for (const t of parsed.tools) {
    if (FORBIDDEN_TOOLS.indexOf(t) !== -1) return refuse(REASON.FORBIDDEN_TOOL);
  }

  const pre = parsed.events && parsed.events.PreToolUse;
  if (!Array.isArray(pre) || pre.length === 0) return refuse(REASON.PRETOOLUSE_MISSING);

  const canonicalReal = (() => {
    try { return fsx.realpathSync(inp.canonicalHookPath); } catch (e) { return inp.canonicalHookPath; }
  })();

  // Find the PreToolUse entry that ACTUALLY carries the approved fence command. Presence of the
  // command anywhere else in the file (PostToolUse, a comment, another event) counts for nothing.
  let owning = null;
  let owningHookPath = null;
  let sawCommandShaped = false;
  for (const entry of pre) {
    for (const h of entry.hooks) {
      if (h.type !== 'command') continue;
      const cm = COMMAND_FORM.exec(String(h.command).trim());
      if (!cm) continue;
      sawCommandShaped = true;
      let real = cm[1];
      try { real = fsx.realpathSync(cm[1]); } catch (e) { /* not resolvable: compare literally */ }
      // The EXACT canonical deployed path. A different file that merely happens to be named
      // fence-write.js is NOT accepted — basename proves nothing about content or provenance.
      if (fold(real) === fold(canonicalReal)) { owning = entry; owningHookPath = real; break; }
    }
    if (owning) break;
  }
  if (!owning) {
    return refuse(sawCommandShaped ? REASON.HOOK_PATH_NOT_CANONICAL : REASON.HOOK_NOT_IN_PRETOOLUSE);
  }

  if (!fsx.existsSync(owningHookPath)) return refuse(REASON.HOOK_FILE_MISSING);

  // CONTENT identity, not basename identity: the deployed hook must be byte-identical to the tracked
  // scripts/hooks/fence-write.js this build ships.
  let actualSha = null;
  try { actualSha = inp.hashFile(owningHookPath); } catch (e) { actualSha = null; }
  if (!actualSha || actualSha !== inp.trackedHookSha256) return refuse(REASON.HOOK_CONTENT_MISMATCH);

  // The matcher on THAT SAME entry must cover every path-capable tool the role declares.
  const matcher = String(owning.matcher).trim();
  if (!MATCHER_FORM.test(matcher)) return refuse(REASON.MATCHER_UNSUPPORTED);
  const covered = new Set(matcher.split('|'));
  const required = parsed.tools.filter((t) => PATH_CAPABLE_TOOLS.indexOf(t) !== -1);
  for (const t of required) {
    if (!covered.has(t)) return refuse(REASON.MATCHER_COVERAGE);
  }

  return { ok: true, hookPath: owningHookPath, tools: parsed.tools, matcher: matcher };
}

module.exports = {
  FORBIDDEN_TOOLS: FORBIDDEN_TOOLS,
  PATH_CAPABLE_TOOLS: PATH_CAPABLE_TOOLS,
  REASON: REASON,
  assertFencedRoleDefinition: assertFencedRoleDefinition,
};
