'use strict';
// S35 mako-token: mint a repository-scoped, permission-narrowed installation token with the official
// MIT library @octokit/auth-app (the whole vetted library; no hand-written JWT or token code), then
// check who it is for.
//
// `gh api user` does not work for installation tokens, so identity is validated two ways, on every
// mint (about once an hour), before anything is cached or handed out:
//   1. with the App JWT: GET /app/installations/{id} must name the expected App ID, the repository
//      selection must be "selected" and the installation must not be suspended;
//   2. with the new token: GET /installation/repositories must list exactly the one expected
//      repository, and the permissions GitHub granted must equal the profile's.

const { MakoTokenError, scrub } = require('./errors');
const cfg = require('./config');

const API = 'https://api.github.com';

function sameBytes(a, b) { return String(a).toLowerCase() === String(b).toLowerCase(); }

async function getJson(fetchImpl, url, bearer) {
  let res;
  try {
    res = await fetchImpl(url, {
      headers: {
        accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28',
        'user-agent': 'mako-token', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
    });
  } catch (e) {
    throw new MakoTokenError('network', `cannot reach GitHub (${scrub(e && (e.cause && e.cause.code || e.message))})`);
  }
  if (!res.ok) throw new MakoTokenError('github-refused', `GitHub answered ${res.status} for ${url.replace(API, '')}`);
  return res.json();
}

function samePermissions(granted, wanted) {
  const g = granted || {};
  const keys = new Set([...Object.keys(g), ...Object.keys(wanted)]);
  for (const k of keys) if (g[k] !== wanted[k]) return false;
  return true;
}

/** Checks the installation with the App JWT. Used by mint and by import. */
async function checkInstallation({ fetchImpl, jwt, config }) {
  const inst = await getJson(fetchImpl, `${API}/app/installations/${config.installationId}`, jwt);
  if (inst.app_id !== config.appId) throw new MakoTokenError('identity-mismatch', `installation ${config.installationId} belongs to App ${inst.app_id}, not the expected App ${config.appId}`);
  if (inst.suspended_at) throw new MakoTokenError('suspended', `the App installation is suspended (${inst.suspended_at}); unsuspend it on GitHub first`);
  if (inst.repository_selection !== 'selected') throw new MakoTokenError('identity-mismatch', 'the App installation covers more than selected repositories; it must be limited to this one repository');
  if (!inst.account || !sameBytes(inst.account.login, config.owner)) throw new MakoTokenError('identity-mismatch', `the installation is on account ${inst.account && inst.account.login}, not ${config.owner}`);
  return inst;
}

/** Checks a new installation token reaches exactly the one expected repository. */
async function checkTokenRepos({ fetchImpl, token, config }) {
  const body = await getJson(fetchImpl, `${API}/installation/repositories?per_page=100`, token);
  const repos = Array.isArray(body.repositories) ? body.repositories : [];
  const want = `${config.owner}/${config.repo}`;
  if (body.total_count !== 1 || repos.length !== 1 || !sameBytes(repos[0].full_name, want)) {
    throw new MakoTokenError('identity-mismatch', `the token reaches ${body.total_count} repositories, expected only ${want}`);
  }
}

async function loadAuthApp() { return import('@octokit/auth-app'); }

/**
 * createMinter({ config, privateKey, fetchImpl, loadAuth }) -> async ({ profile }) => { token, expiresAt }
 * `privateKey` is a function so the key is decrypted only when a mint is actually needed.
 */
function createMinter({ config, getPrivateKey, fetchImpl = globalThis.fetch, loadAuth = loadAuthApp }) {
  return async function mint({ profile }) {
    if (!cfg.isProfile(profile)) throw new MakoTokenError('bad-profile', 'unknown token profile');
    const permissions = { ...cfg.PROFILES[profile] };
    const { createAppAuth } = await loadAuth();
    const auth = createAppAuth({ appId: config.appId, privateKey: getPrivateKey(), installationId: config.installationId });
    let jwt;
    let res;
    try {
      jwt = (await auth({ type: 'app' })).token;
      await checkInstallation({ fetchImpl, jwt, config });
      res = await auth({
        type: 'installation', installationId: config.installationId,
        repositoryNames: [config.repo], permissions, refresh: true,
      });
    } catch (e) {
      if (e instanceof MakoTokenError) throw e;
      throw new MakoTokenError('renewal-failed', `GitHub refused to mint a token (${scrub(e && e.message)})`);
    }
    if (res.installationId !== undefined && Number(res.installationId) !== config.installationId) {
      throw new MakoTokenError('identity-mismatch', 'the token is for a different installation than expected');
    }
    if (!samePermissions(res.permissions, permissions)) {
      throw new MakoTokenError('identity-mismatch', `GitHub granted different permissions than the "${profile}" profile asks for`);
    }
    await checkTokenRepos({ fetchImpl, token: res.token, config });
    return { token: res.token, expiresAt: res.expiresAt };
  };
}

module.exports = { createMinter, checkInstallation, checkTokenRepos, samePermissions, getJson, API };
