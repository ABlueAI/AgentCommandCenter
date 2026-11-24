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
// Kept as its own list for two reasons: it is the main-issued `--disallowedTools` denial (defense in
// depth at the CLI), and it keeps its specific refusal reason. ALLOWED_TOOLS below already excludes it.
const FORBIDDEN_TOOLS = Object.freeze(['Bash', 'Glob', 'NotebookEdit']);

// Tools whose invocation carries a filesystem path, which the fence hook's path gate checks. Before
// S58 the matcher had to name each one the role declares; the `*` matcher now covers them all.
const PATH_CAPABLE_TOOLS = Object.freeze(['Read', 'Write', 'Edit', 'MultiEdit']);

// THE EXPLICIT ALLOWLIST. A fenced role may declare ONLY these tools; anything else refuses. It
// replaces acceptance-by-denylist, under which any tool not named in FORBIDDEN_TOOLS was accepted
// with no hook coverage — `Grep` (content search anywhere), `PowerShell` (the Windows equivalent of
// the shell Bash is forbidden for), `Agent`/`Task` (delegation outside the frontmatter hook), or any
// name a future CLI adds.
//
// Derived, not guessed: the three tracked fenced roles declare exactly `WebSearch, WebFetch, Read,
// Write`, and fence-write.js gates the path of the four path-capable tools. So every allowed
// filesystem tool is a PATH_CAPABLE_TOOLS member, and the only non-filesystem entries are the two web
// tools. Adding a tool here is a policy change that needs its own review. Since S58 this is the
// CEILING: each fenced role may declare only its own ROLE_TOOL_ALLOWLIST entry, which stays inside it.
const ALLOWED_TOOLS = Object.freeze(['Read', 'Write', 'Edit', 'MultiEdit', 'WebSearch', 'WebFetch']);

// S15 PAGE READER (Blue's verdict 2026-11-03: ADOPT Playwright MCP). The ONLY MCP tools any fenced
// role may declare, granted to `page-reader` by role IDENTITY and to no other role. The same role must
// route both through the canonical fence hook entry (matcher coverage, below), because the hook is
// what limits navigation to https: and refuses a snapshot written to a file. Literals equal
// page-reader.js MCP_TOOLS and scripts/hooks/fence-write.js (tripwire-tested in page-reader.test.js).
const ROLE_MCP_TOOLS = Object.freeze({
  'page-reader': Object.freeze(['mcp__playwright__browser_navigate', 'mcp__playwright__browser_snapshot']),
});

function roleMcpTools(role) {
  return Object.prototype.hasOwnProperty.call(ROLE_MCP_TOOLS, role) ? ROLE_MCP_TOOLS[role] : [];
}

// S58 FENCED WEB-READING AGENTS. Each fenced role's WHOLE tool allowlist, by role identity: its
// `tools:` line may declare only these, and the fence hook refuses every other tool at every call
// (scripts/hooks/fence-write.js ROLE_TOOLS carries the same lists; app/fenced-web-roles.test.js holds
// them equal and equal to each tracked role file). Every fenced role reads the open web (WebSearch and
// WebFetch, or the page-reader's browser), so every fenced role is in this map; a fenced role missing
// from it refuses to launch. Each list stays inside ALLOWED_TOOLS plus that role's MCP grant (checked
// when this module loads).
const ROLE_TOOL_ALLOWLIST = Object.freeze({
  'web-scout': Object.freeze(['WebSearch', 'WebFetch', 'Read', 'Write']),
  'operator': Object.freeze(['Read', 'WebSearch', 'WebFetch', 'Write']),
  'source-scout': Object.freeze(['WebSearch', 'WebFetch', 'Read', 'Write']),
  'page-reader': Object.freeze(['Read', 'Write'].concat(ROLE_MCP_TOOLS['page-reader'])),
});

function roleToolAllowlist(role) {
  return Object.prototype.hasOwnProperty.call(ROLE_TOOL_ALLOWLIST, role) ? ROLE_TOOL_ALLOWLIST[role] : null;
}

{
  for (const r of Object.keys(ROLE_TOOL_ALLOWLIST)) {
    const ceiling = ALLOWED_TOOLS.concat(roleMcpTools(r));
    for (const t of ROLE_TOOL_ALLOWLIST[r]) {
      if (ceiling.indexOf(t) === -1) throw new Error('role-fence-policy: ROLE_TOOL_ALLOWLIST widens the ceiling for ' + r);
    }
  }
}

// S58: the canonical fence entry's matcher. `*` sends every tool call to the hook, so the hook's
// allowlist sees tools the role was never meant to have, not only the ones a matcher names.
const FENCE_MATCHER = '*';

// CONTROLLED WEBFETCH GRANT (run -d case 6). The ONE destination a controlled run may fetch without a
// terminal permission dialog, which controlled-run admission cannot answer. MAIN-ISSUED, like
// FORBIDDEN_TOOLS: no renderer field, role Markdown or prompt text reaches it.
//
// Two layers, because the CLI rule alone is too wide. Claude Code keys WebFetch permission on the URL's
// hostname only (port, scheme, path and userinfo discarded) and auto-allows its built-in pre-approved
// hosts, so `allowedToolsRule` by itself would approve https://example.com:8443/ and docs hosts. The
// fence hook therefore applies the exact origin gate first, switched on by `modeEnvKey`, which main
// issues to every fenced web-scout pane: the origin for the admission-controlled pane, `disabledMode`
// for every other one. A missing or unexpected mode refuses WebFetch in the hook, so losing the
// variable can never leave the CLI grant without the gate.
//
// Blue decision D1 bounds what this guarantees: the INITIAL request must be https://example.com on the
// default HTTPS port. Claude Code may internally follow its built-in example.com/www.example.com
// redirect rule, which no hook or permission check sees.
//
// scripts/hooks/fence-write.js is deployed standalone and cannot require this module; it carries the
// same literals, and a tripwire test holds them equal.
const CONTROLLED_WEBFETCH = Object.freeze({
  role: 'web-scout',
  origin: 'https://example.com',
  hostname: 'example.com',
  allowedToolsRule: 'WebFetch(domain:example.com)',
  modeEnvKey: 'BLUE_HELM_CONTROLLED_WEBFETCH_MODE',
  disabledMode: 'disabled',
});

/**
 * Validate a controlled-WebFetch policy object. Returns the list of problems (empty when valid).
 * Checked when this module loads, so a malformed constant stops the application instead of issuing a
 * wider grant than reviewed.
 */
function controlledWebFetchProblems(p) {
  const problems = [];
  const v = p && typeof p === 'object' ? p : {};
  if (v.role !== 'web-scout') problems.push('role');
  // Plain lowercase DNS labels with at least one dot: no wildcard, port, userinfo, path or space.
  if (typeof v.hostname !== 'string' || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v.hostname)) problems.push('hostname');
  if (typeof v.origin !== 'string' || v.origin !== 'https://' + v.hostname) {
    problems.push('origin');
  } else {
    let u = null;
    try { u = new URL(v.origin); } catch (e) { u = null; }
    if (!u || u.origin !== v.origin || u.port !== '' || u.hostname !== v.hostname) problems.push('origin');
  }
  if (typeof v.allowedToolsRule !== 'string' || v.allowedToolsRule !== 'WebFetch(domain:' + v.hostname + ')') {
    problems.push('allowedToolsRule');
  }
  if (typeof v.modeEnvKey !== 'string' || !/^BLUE_HELM_[A-Z_]+$/.test(v.modeEnvKey)) problems.push('modeEnvKey');
  if (v.disabledMode !== 'disabled' || v.disabledMode === v.origin) problems.push('disabledMode');
  return problems;
}

{
  const problems = controlledWebFetchProblems(CONTROLLED_WEBFETCH);
  if (problems.length) throw new Error('role-fence-policy: CONTROLLED_WEBFETCH invalid: ' + problems.join(', '));
}

/**
 * controlledWebFetchLaunch({ fenced, role, controlled }) -> { allowedToolsRule, mode }
 *
 * Every input is MAIN-OWNED: `fenced` and `role` from the main classification, `controlled` from the
 * admission claim. Only a strict `true` counts. `allowedToolsRule` is non-null for the controlled,
 * fenced web-scout pane alone; `mode` is issued to every fenced web-scout pane and to nothing else.
 */
function controlledWebFetchLaunch(input) {
  const i = input || {};
  const fencedWebScout = i.fenced === true && i.role === CONTROLLED_WEBFETCH.role;
  if (!fencedWebScout) return { allowedToolsRule: null, mode: null };
  if (i.controlled === true) {
    return { allowedToolsRule: CONTROLLED_WEBFETCH.allowedToolsRule, mode: CONTROLLED_WEBFETCH.origin };
  }
  return { allowedToolsRule: null, mode: CONTROLLED_WEBFETCH.disabledMode };
}

const REASON = Object.freeze({
  PLACEHOLDER: 'fence-policy-unsubstituted-hook-placeholder',
  PARSE: 'fence-policy-declaration-unparseable',
  IDENTITY_MISMATCH: 'fence-policy-identity-mismatch',
  TOOLS_ABSENT: 'fence-policy-tools-not-declared',
  TOOLS_EMPTY: 'fence-policy-tools-declared-empty',
  FORBIDDEN_TOOL: 'fence-policy-forbidden-tool-declared',
  TOOL_NOT_ALLOWED: 'fence-policy-tool-not-allowed',
  PRETOOLUSE_MISSING: 'fence-policy-pretooluse-absent-or-empty',
  HOOK_NOT_IN_PRETOOLUSE: 'fence-policy-fence-hook-not-in-pretooluse-entry',
  HOOK_COMMAND_FORM: 'fence-policy-hook-command-form-unsupported',
  HOOK_PATH_NOT_CANONICAL: 'fence-policy-hook-path-not-canonical',
  HOOK_FILE_MISSING: 'fence-policy-hook-file-missing',
  HOOK_CONTENT_MISMATCH: 'fence-policy-hook-content-not-tracked-identity',
  MATCHER_COVERAGE: 'fence-policy-matcher-does-not-cover-declared-tools',
  ROLE_NO_ALLOWLIST: 'fence-policy-role-has-no-tool-allowlist',
  HOOK_ROLE_ARGUMENT: 'fence-policy-hook-role-argument-mismatch',
});

// `node "<absolute path>"`, optionally followed by ONE bare argument. A bare `node path` refuses. The
// argument is captured so the owning entry can be checked for the role's own name (S58): the old form
// without it is still recognised as the fence command, so a stale deployment refuses with
// HOOK_ROLE_ARGUMENT rather than looking as if no fence were wired at all.
const COMMAND_FORM = /^node\s+"([^"]+)"(?:\s+([^\s"]+))?$/;

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
  // A DECLARED-BUT-EMPTY `tools:` (`tools:`, `tools: ""`, `tools: ,` and their whitespace/quoted
  // equivalents) also refuses. Without this, the allowlist loops below have nothing to check and
  // no matcher coverage is required, so the policy would accept it. Whether the CLI treats an empty
  // value as omitted (inherit ALL tools) is NOT established here, and this refusal does not depend on
  // it: an empty declaration is never a tool set this fence was reviewed against.
  if (parsed.tools.length === 0) return refuse(REASON.TOOLS_EMPTY);

  // `disallowedTools` is deliberately NOT consulted here: a denylist must never be able to rescue a
  // forbidden entry that the allowlist granted. Policy is evaluated on `tools:` alone.
  for (const t of parsed.tools) {
    if (FORBIDDEN_TOOLS.indexOf(t) !== -1) return refuse(REASON.FORBIDDEN_TOOL);
  }
  // Allowlist: exact, case-sensitive names only. Unknown names, lower-case variants, specifiers such
  // as `Read(./x)` and MCP tool names all refuse — none is a tool this fence was reviewed against.
  // S58: the ceiling is the role's OWN allowlist (ROLE_TOOL_ALLOWLIST), which the hook also enforces
  // at every call; ALLOWED_TOOLS bounds every such list.
  const roleTools = roleToolAllowlist(role);
  if (roleTools === null) return refuse(REASON.ROLE_NO_ALLOWLIST);
  for (const t of parsed.tools) {
    if (roleTools.indexOf(t) === -1) return refuse(REASON.TOOL_NOT_ALLOWED);
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
  let owningArg = null;
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
      if (fold(real) === fold(canonicalReal)) { owning = entry; owningHookPath = real; owningArg = cm[2]; break; }
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

  // S58: THAT SAME entry must name this role as the hook's one argument, so the hook applies this
  // role's allowlist (and refuses everything when it has none). Checked case-sensitively: the hook's
  // ROLE_TOOLS lookup is exact.
  if (owningArg !== role) return refuse(REASON.HOOK_ROLE_ARGUMENT);

  // S58: and its matcher must be exactly `*`, so every tool call reaches the hook. This subsumes the
  // earlier coverage rules, which it keeps as consequences: every path-capable tool the role declares
  // (P4), WebFetch for the controlled web-scout grant, and the page-reader's two MCP tools (S15) all
  // reach the hook, and so do tools no matcher would have named. Any other matcher, including an
  // alternation that names every declared tool, refuses.
  const matcher = String(owning.matcher).trim();
  if (matcher !== FENCE_MATCHER) return refuse(REASON.MATCHER_COVERAGE);

  return { ok: true, hookPath: owningHookPath, tools: parsed.tools, matcher: matcher };
}

module.exports = {
  ALLOWED_TOOLS: ALLOWED_TOOLS,
  FENCE_MATCHER: FENCE_MATCHER,
  ROLE_TOOL_ALLOWLIST: ROLE_TOOL_ALLOWLIST,
  roleToolAllowlist: roleToolAllowlist,
  CONTROLLED_WEBFETCH: CONTROLLED_WEBFETCH,
  controlledWebFetchProblems: controlledWebFetchProblems,
  controlledWebFetchLaunch: controlledWebFetchLaunch,
  FORBIDDEN_TOOLS: FORBIDDEN_TOOLS,
  PATH_CAPABLE_TOOLS: PATH_CAPABLE_TOOLS,
  ROLE_MCP_TOOLS: ROLE_MCP_TOOLS,
  roleMcpTools: roleMcpTools,
  REASON: REASON,
  assertFencedRoleDefinition: assertFencedRoleDefinition,
};
