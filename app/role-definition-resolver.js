'use strict';
// EFFECTIVE ROLE-DEFINITION RESOLUTION (bounded, fail-closed).
//
// Validating `~/.claude/agents/<role>.md` alone is not enough: higher-priority scopes can override a
// user definition, and identity comes from frontmatter `name`, not the filename. The documented
// precedence is managed(1) > `--agents`(2) > project `.claude/agents/`(3) > user `~/.claude/agents/`(4)
// > plugin(5). This module resolves the definition the launched CLI will ACTUALLY consume, over the
// scopes main can observe, and REFUSES whenever it cannot establish that answer.
//
// SCOPE-BY-SCOPE:
//   1 managed  — presence OR unreadability of any managed agent/policy surface REFUSES. Main does not
//                parse managed policy (Blue's decision: refuse-on-presence, do not interpret).
//                The obsolete ProgramData path is deliberately NOT consulted: the CLI does not read
//                it, so checking it would manufacture false refusals.
//   2 --agents — absent BY CONSTRUCTION. buildAgentCommand emits only `--agent`; asserted as a
//                negative control in the test suites rather than probed here.
//   3 project  — every `<ancestor>/.claude/agents/` from the launch cwd upward, scanned recursively
//                because subfolders share the directory's identity namespace.
//   4 user     — `~/.claude/agents/`, same recursive scan.
//   5 plugin   — NOT scanned, justified by precedence: it ranks BELOW user scope and therefore cannot
//                override the deployed definition. This is a precedence argument, not a disclaimer.
//
// NOT A LOADER REPLACEMENT. This resolves exactly one identity, for one launch, under hard caps, and
// refuses on anything it cannot resolve. It must not grow into a general reimplementation of Claude
// Code's discovery.
//
// RESIDUAL, RECORDED HONESTLY: server-delivered administrative policy cannot be disproved from these
// filesystem and registry checks. Trusted organization-admin policy is outside Blue Helm's
// renderer-threat boundary; no universal protection against a future enterprise administrator
// override is claimed.

const path = require('path');
const { parseRoleFrontmatter, REASON: FM_REASON } = require('./role-frontmatter');

const DEFAULT_MANAGED_PATHS = Object.freeze([
  'C:\\Program Files\\ClaudeCode\\.claude\\agents',
  'C:\\Program Files\\ClaudeCode\\managed-settings.json',
  'C:\\Program Files\\ClaudeCode\\managed-settings.d',
]);

const DEFAULT_MANAGED_REGISTRY_KEYS = Object.freeze([
  'HKLM\\SOFTWARE\\Policies\\ClaudeCode',
  'HKCU\\SOFTWARE\\Policies\\ClaudeCode',
]);

const DEFAULT_CAPS = Object.freeze({ ancestors: 32, filesPerDir: 64, depth: 4 });

const REASON = Object.freeze({
  MANAGED_PRESENT: 'resolve-managed-scope-present',
  MANAGED_UNREADABLE: 'resolve-managed-scope-unreadable',
  ANCESTOR_CAP: 'resolve-ancestor-cap-exceeded',
  SCAN_CAP: 'resolve-scan-cap-exceeded',
  CANDIDATE_UNREADABLE: 'resolve-candidate-unreadable',
  CANDIDATE_UNSUPPORTED: 'resolve-candidate-unsupported-grammar',
  AMBIGUOUS_IDENTITY: 'resolve-ambiguous-identity',
  ROLE_NOT_DEPLOYED: 'resolve-role-not-deployed',
  BAD_INPUT: 'resolve-bad-input',
});

function refuse(reason) { return { ok: false, reason: reason }; }

function createRoleDefinitionResolver(deps) {
  const d = deps || {};
  const fsx = d.fsx;
  const homeDir = d.homeDir;
  const probeRegistryKey = d.probeRegistryKey;
  const managedPaths = d.managedPaths || DEFAULT_MANAGED_PATHS;
  const managedRegistryKeys = d.managedRegistryKeys || DEFAULT_MANAGED_REGISTRY_KEYS;
  const caps = Object.assign({}, DEFAULT_CAPS, d.caps || {});
  if (!fsx || typeof fsx.existsSync !== 'function') {
    throw new Error('role-definition-resolver: fsx.existsSync is required');
  }
  if (typeof probeRegistryKey !== 'function') {
    throw new Error('role-definition-resolver: probeRegistryKey is required');
  }

  // Any managed surface present, or any probe that cannot answer, refuses the launch.
  function assertNoManagedScope() {
    for (const p of managedPaths) {
      let present;
      try { present = fsx.existsSync(p); }
      catch (e) { return refuse(REASON.MANAGED_UNREADABLE); }
      if (present) return refuse(REASON.MANAGED_PRESENT);
    }
    for (const key of managedRegistryKeys) {
      let res;
      try { res = probeRegistryKey(key); }
      catch (e) { return refuse(REASON.MANAGED_UNREADABLE); }
      if (!res || typeof res.present !== 'boolean') return refuse(REASON.MANAGED_UNREADABLE);
      if (res.present) return refuse(REASON.MANAGED_PRESENT);
    }
    return { ok: true };
  }

  function ancestorsOf(startDir) {
    const out = [];
    let cur = path.resolve(startDir);
    for (let i = 0; i < caps.ancestors; i++) {
      out.push(cur);
      const up = path.dirname(cur);
      if (up === cur) return { ok: true, dirs: out };   // reached the filesystem root
      cur = up;
    }
    return refuse(REASON.ANCESTOR_CAP);
  }

  // Recursive scan of one `.claude/agents` tree. Subfolders share the identity namespace, so they
  // are included; caps bound the work and refuse rather than truncating.
  function scanAgentsTree(root) {
    const found = [];
    let fileCount = 0;
    const walk = (dir, depth) => {
      if (depth > caps.depth) return refuse(REASON.SCAN_CAP);
      let entries;
      try { entries = fsx.readdirSync(dir, { withFileTypes: true }); }
      catch (e) { return refuse(REASON.CANDIDATE_UNREADABLE); }
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          const r = walk(full, depth + 1);
          if (!r.ok) return r;
          continue;
        }
        if (!/\.md$/i.test(ent.name)) continue;
        fileCount++;
        if (fileCount > caps.filesPerDir) return refuse(REASON.SCAN_CAP);
        let text;
        try { text = fsx.readFileSync(full, 'utf8'); }
        catch (e) { return refuse(REASON.CANDIDATE_UNREADABLE); }
        const parsed = parseRoleFrontmatter(text);
        if (!parsed.ok) {
          // Documented loader behaviour: a file with no frontmatter, or with no `name`, is treated
          // as documentation and skipped. Anything else is a real parse failure and refuses, so an
          // unresolvable sibling can never be silently ignored.
          if (parsed.reason === FM_REASON.NO_FRONTMATTER || parsed.reason === FM_REASON.NAME_ABSENT) continue;
          return refuse(REASON.CANDIDATE_UNSUPPORTED);
        }
        found.push({ path: full, text: text, name: parsed.name });
      }
      return { ok: true };
    };
    const r = walk(root, 1);
    if (!r.ok) return r;
    return { ok: true, found: found };
  }

  /**
   * resolve({ role, cwd }) -> { ok:true, text, path, scope } | { ok:false, reason }
   *
   * `cwd` MUST already have passed the fenced containment gate — resolution runs against the same
   * cwd the launch will use, and scanning never begins before containment is established.
   */
  function resolve(input) {
    const role = input && input.role;
    const cwd = input && input.cwd;
    if (typeof role !== 'string' || role === '' || typeof cwd !== 'string' || cwd === '') {
      return refuse(REASON.BAD_INPUT);
    }

    const managed = assertNoManagedScope();
    if (!managed.ok) return managed;

    const anc = ancestorsOf(cwd);
    if (!anc.ok) return anc;

    // Priority order: project scopes closest-to-cwd first, then user scope. The winner is the
    // highest-priority candidate MATCHING THE REQUESTED IDENTITY — a nearer directory that contains
    // other agents but not this one does not end the search.
    const levels = [];
    for (const dir of anc.dirs) {
      const agentsDir = path.join(dir, '.claude', 'agents');
      let present;
      try { present = fsx.existsSync(agentsDir); }
      catch (e) { return refuse(REASON.CANDIDATE_UNREADABLE); }
      if (present) levels.push({ scope: 'project', root: agentsDir });
    }
    const userAgents = path.join(homeDir, '.claude', 'agents');
    let userPresent;
    try { userPresent = fsx.existsSync(userAgents); }
    catch (e) { return refuse(REASON.CANDIDATE_UNREADABLE); }
    if (userPresent) levels.push({ scope: 'user', root: userAgents });

    for (const level of levels) {
      const scan = scanAgentsTree(level.root);
      if (!scan.ok) return scan;
      const matches = scan.found.filter((c) => c.name === role);
      if (matches.length === 0) continue;
      // Documented: two files declaring the same name under one `.claude/agents/` tree are resolved
      // by filesystem read order with NO documented precedence. Main cannot predict the loader, so
      // it refuses instead of guessing.
      if (matches.length > 1) return refuse(REASON.AMBIGUOUS_IDENTITY);
      return { ok: true, text: matches[0].text, path: matches[0].path, scope: level.scope };
    }
    return refuse(REASON.ROLE_NOT_DEPLOYED);
  }

  return { resolve: resolve };
}

module.exports = {
  DEFAULT_MANAGED_PATHS: DEFAULT_MANAGED_PATHS,
  DEFAULT_MANAGED_REGISTRY_KEYS: DEFAULT_MANAGED_REGISTRY_KEYS,
  DEFAULT_CAPS: DEFAULT_CAPS,
  REASON: REASON,
  createRoleDefinitionResolver: createRoleDefinitionResolver,
};
