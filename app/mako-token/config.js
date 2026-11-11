'use strict';
// S35 mako-token: configuration, token profiles and the bot identity. Pure: no filesystem, process
// or network. Everything here is non-secret (App ID, installation ID, slug, bot user ID).
//
// The GitHub App `mako-agents` is owned by ABlueAI and installed on this one repository. Its
// installation tokens last 1 hour, so no long-lived process may hold one (docs/MAKO-TOKEN.md).

const path = require('path');

const APP_OWNER = 'ABlueAI';
const APP_REPO = 'AgentCommandCenter';
const CONFIG_FILE = 'mako-agents.json';
const KEY_FILE = 'mako-agents.key.dpapi';
const BIN_DIR_NAME = 'bin';
const GH_EMPTY_DIR_NAME = 'gh-empty';
const CACHE_DIR_NAME = 'token-cache';
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // mint again once fewer than 5 minutes are left
const MAX_CLOCK_SKEW_MS = 60 * 1000; // a cache minted "in the future" is not trusted

// Per-consumer narrowing. The App itself holds Metadata R, Contents RW, Pull requests RW, Issues RW,
// Actions R, Checks R, Commit statuses R; each token asks for no more than its profile.
const READ_PERMISSIONS = Object.freeze({
  metadata: 'read', contents: 'read', pull_requests: 'read', issues: 'read',
  actions: 'read', checks: 'read', statuses: 'read',
});
const PROFILES = Object.freeze({
  // Agent panes: push, open and update pull requests, comment on issues, read CI.
  writer: Object.freeze({ ...READ_PERMISSIONS, contents: 'write', pull_requests: 'write', issues: 'write' }),
  // A read-only consumer (status checks, reviewers): reads only.
  reader: READ_PERMISSIONS,
});
const DEFAULT_PROFILE = 'writer';

function isProfile(name) { return typeof name === 'string' && Object.prototype.hasOwnProperty.call(PROFILES, name); }

function profileKey(name) {
  const p = PROFILES[name];
  return Object.keys(p).sort().map((k) => `${k}:${p[k]}`).join(',');
}

// Directories come from the standard per-user Windows variables only; nothing a pane can set
// redirects them beyond what APPDATA/LOCALAPPDATA already do for every program.
function dataDir(env, homedir) {
  const roaming = (env && env.APPDATA) || path.join(homedir, 'AppData', 'Roaming');
  return path.join(roaming, 'Mako');
}
function cacheDir(env, homedir) {
  const local = (env && env.LOCALAPPDATA) || path.join(homedir, 'AppData', 'Local');
  return path.join(local, 'Mako', CACHE_DIR_NAME);
}
function layout(env, homedir) {
  const data = dataDir(env, homedir);
  return {
    dataDir: data,
    configPath: path.join(data, CONFIG_FILE),
    keyPath: path.join(data, KEY_FILE),
    binDir: path.join(data, BIN_DIR_NAME),
    ghEmptyDir: path.join(data, GH_EMPTY_DIR_NAME),
    cacheDir: cacheDir(env, homedir),
  };
}

const POSITIVE_INT = (v) => Number.isSafeInteger(v) && v > 0;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38})$/i;
const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;

/** validateConfig(obj) -> { ok:true, config } | { ok:false, reason } */
function validateConfig(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'the config is not an object' };
  const { appId, installationId, slug, botUserId, owner, repo } = obj;
  if (!POSITIVE_INT(appId)) return { ok: false, reason: 'appId must be a positive whole number' };
  if (!POSITIVE_INT(installationId)) return { ok: false, reason: 'installationId must be a positive whole number' };
  if (!POSITIVE_INT(botUserId)) return { ok: false, reason: 'botUserId must be a positive whole number' };
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return { ok: false, reason: 'slug is not a GitHub App slug' };
  if (typeof owner !== 'string' || !NAME_RE.test(owner)) return { ok: false, reason: 'owner is not a GitHub account name' };
  if (typeof repo !== 'string' || !NAME_RE.test(repo)) return { ok: false, reason: 'repo is not a repository name' };
  return { ok: true, config: { appId, installationId, slug, botUserId, owner, repo } };
}

/** The bot's commit identity: `<id>+<slug>[bot]@users.noreply.github.com`. */
function botIdentity(config) {
  return {
    name: `${config.slug}[bot]`,
    email: `${config.botUserId}+${config.slug}[bot]@users.noreply.github.com`,
  };
}

module.exports = {
  APP_OWNER, APP_REPO, CONFIG_FILE, KEY_FILE, REFRESH_MARGIN_MS, MAX_CLOCK_SKEW_MS,
  PROFILES, DEFAULT_PROFILE, isProfile, profileKey, layout, validateConfig, botIdentity,
};
