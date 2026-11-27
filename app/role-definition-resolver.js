'use strict';

// Mako supplies the checked user definition through Claude's --agents option, which
// takes precedence over project, user and plugin discovery. Managed policy can
// override CLI definitions, so the existing managed-scope checks still apply.

const path = require('path');
const { parseRoleFrontmatter } = require('./role-frontmatter');

const ROLE_ARG_ENV = 'MAKO_LAUNCH_ROLE_ARG';
const ROLE_SETTINGS_ENV = 'MAKO_LAUNCH_ROLE_SETTINGS';
const MAX_ROLE_BYTES = 16 * 1024;
const MAX_ROLE_ARG_LENGTH = 24000;
const ROLE_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ROLE_FIELDS = new Set(['name', 'description', 'tools', 'disallowedTools', 'model', 'effort', 'permissionMode', 'color']);

const DEFAULT_MANAGED_PATHS = Object.freeze([
  'C:\\Program Files\\ClaudeCode\\.claude\\agents',
  'C:\\Program Files\\ClaudeCode\\managed-settings.json',
  'C:\\Program Files\\ClaudeCode\\managed-settings.d',
]);

const DEFAULT_MANAGED_REGISTRY_KEYS = Object.freeze([
  'HKLM\\SOFTWARE\\Policies\\ClaudeCode',
  'HKCU\\SOFTWARE\\Policies\\ClaudeCode',
]);

const REASON = Object.freeze({
  MANAGED_PRESENT: 'resolve-managed-scope-present',
  MANAGED_UNREADABLE: 'resolve-managed-scope-unreadable',
  CANDIDATE_UNREADABLE: 'resolve-candidate-unreadable',
  // One bounded reason per role-file check, so a refusal names what to fix (never the value).
  ROLE_TOO_LARGE: 'resolve-role-too-large',
  ROLE_NOT_UTF8: 'resolve-role-not-utf8',
  ROLE_FRONTMATTER_INVALID: 'resolve-role-frontmatter-invalid',
  ROLE_NAME_MISMATCH: 'resolve-role-name-mismatch',
  ROLE_TOOLS_MISSING: 'resolve-role-tools-missing',
  ROLE_TOOLS_EMPTY: 'resolve-role-tools-empty',
  ROLE_DESCRIPTION_MISSING: 'resolve-role-description-missing',
  ROLE_BODY_EMPTY: 'resolve-role-body-empty',
  ROLE_CONTROL_CHARACTER: 'resolve-role-control-character',
  ROLE_UNKNOWN_FIELD: 'resolve-role-unknown-field',
  ROLE_INVALID_MODEL: 'resolve-role-invalid-model',
  ROLE_INVALID_EFFORT: 'resolve-role-invalid-effort',
  ROLE_INVALID_PERMISSION_MODE: 'resolve-role-invalid-permission-mode',
  ROLE_INVALID_COLOR: 'resolve-role-invalid-color',
  ROLE_ARG_TOO_LONG: 'resolve-role-argument-too-long',
  LINKED_ENTRY: 'resolve-agent-tree-linked-entry',
  UNSUPPORTED_ENTRY: 'resolve-agent-tree-unsupported-entry',
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

  function resolve(input) {
    const role = input?.role;
    if (typeof role !== 'string' || !ROLE_NAME.test(role)) return refuse(REASON.BAD_INPUT);
    const managed = assertNoManagedScope();
    if (!managed.ok) return managed;

    const config = path.join(homeDir, '.claude');
    const agents = path.join(config, 'agents');
    const filename = role + '.md';
    const file = path.join(agents, filename);
    const bytes = Buffer.alloc(MAX_ROLE_BYTES + 1);
    let length = 0;
    try {
      for (const dir of [config, agents]) {
        const stat = fsx.lstatSync(dir);
        if (stat.isSymbolicLink()) return refuse(REASON.LINKED_ENTRY);
        if (!stat.isDirectory()) return refuse(REASON.UNSUPPORTED_ENTRY);
      }
      // On a case-insensitive filesystem, opening the requested path alone can
      // succeed even when the deployed filename differs by case.
      if (!fsx.readdirSync(agents).includes(filename)) return refuse(REASON.ROLE_NOT_DEPLOYED);
      const stat = fsx.lstatSync(file);
      if (stat.isSymbolicLink()) return refuse(REASON.LINKED_ENTRY);
      if (!stat.isFile()) return refuse(REASON.UNSUPPORTED_ENTRY);
      if (stat.nlink > 1) return refuse(REASON.LINKED_ENTRY);
      if (stat.size > MAX_ROLE_BYTES) return refuse(REASON.ROLE_TOO_LARGE);
      const fd = fsx.openSync(file, 'r');
      try {
        const opened = fsx.fstatSync(fd);
        if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino || opened.nlink !== 1) {
          return refuse(REASON.CANDIDATE_UNREADABLE);
        }
        while (length < bytes.length) {
          const read = fsx.readSync(fd, bytes, length, bytes.length - length, null);
          if (read === 0) break;
          length += read;
        }
      } finally {
        fsx.closeSync(fd);
      }
    } catch (error) {
      return refuse(error.code === 'ENOENT' ? REASON.ROLE_NOT_DEPLOYED : REASON.CANDIDATE_UNREADABLE);
    }

    if (length > MAX_ROLE_BYTES) return refuse(REASON.ROLE_TOO_LARGE);
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)); }
    catch { return refuse(REASON.ROLE_NOT_UTF8); }
    if (/[\x00-\x08\x0b-\x1f\x7f]/.test(text.replace(/\r\n|\n/g, ''))) return refuse(REASON.ROLE_CONTROL_CHARACTER);
    const parsed = parseRoleFrontmatter(text);
    if (!parsed.ok) return refuse(REASON.ROLE_FRONTMATTER_INVALID);
    if (parsed.name !== role) return refuse(REASON.ROLE_NAME_MISMATCH);
    if (Object.keys(parsed.scalars).some((key) => !ROLE_FIELDS.has(key))) return refuse(REASON.ROLE_UNKNOWN_FIELD);
    if (!parsed.toolsDeclared) return refuse(REASON.ROLE_TOOLS_MISSING);
    if (parsed.tools.length === 0) return refuse(REASON.ROLE_TOOLS_EMPTY);
    if (!parsed.scalars.description) return refuse(REASON.ROLE_DESCRIPTION_MISSING);
    if (!parsed.prompt.trim()) return refuse(REASON.ROLE_BODY_EMPTY);

    const { description, model, effort, permissionMode, color } = parsed.scalars;
    if (model !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(model)) return refuse(REASON.ROLE_INVALID_MODEL);
    if (effort !== undefined && !['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) return refuse(REASON.ROLE_INVALID_EFFORT);
    if (permissionMode !== undefined && permissionMode !== 'default') return refuse(REASON.ROLE_INVALID_PERMISSION_MODE);
    if (color !== undefined && !['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'].includes(color)) {
      return refuse(REASON.ROLE_INVALID_COLOR);
    }
    const definition = { description, prompt: parsed.prompt, tools: parsed.tools, model, effort, permissionMode, color };
    if (parsed.disallowedTools.length) definition.disallowedTools = parsed.disallowedTools;
    const roleArg = encodeRoleArg({ [role]: definition });
    const events = Object.keys(parsed.events);
    const pre = parsed.events.PreToolUse;
    const singlePreToolUse = events.length === 1 && pre?.length === 1 && pre[0].hooks.length === 1;
    // Use Claude's session settings for the checked fence hook. CLI agents keep
    // the role definition and its tool list, and the settings flag owns the hook.
    const settingsArg = events.length ? encodeRoleArg({ disableAllHooks: false, hooks: parsed.events }) : null;
    if (roleArg.length + (settingsArg?.length || 0) > MAX_ROLE_ARG_LENGTH) return refuse(REASON.ROLE_ARG_TOO_LONG);
    return { ok: true, text, path: file, scope: 'user', roleArg, settingsArg, singlePreToolUse };
  }

  return { resolve, assertNoManagedScope };
}

// PowerShell 5 forwards env-variable values to native argv with legacy quote
// handling. JSON-escape whitespace and shell metacharacters inside the JSON
// strings, then escape literal quotes for Windows' native argv parser. This is
// one whitespace-free argument regardless of the deployed prompt or hook path.
function encodeRoleArg(value) {
  return JSON.stringify(value)
    .replace(/[ %&|^<>()!`'\u007f-\uffff]/g, (char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'))
    .replace(/(\\*)"/g, '$1$1\\"');
}

module.exports = {
  DEFAULT_MANAGED_PATHS,
  DEFAULT_MANAGED_REGISTRY_KEYS,
  REASON,
  ROLE_ARG_ENV,
  ROLE_SETTINGS_ENV,
  createRoleDefinitionResolver,
};
