'use strict';
// S35 mako-token: `mako-token import <pem> --app-id <n>`.
//
// Proves the App key works, stores it protected, prints its fingerprint, then deletes the PEM.
// Order matters: nothing is stored until a token has been minted and checked, so a failed import
// leaves the PC as it was (a replaced key is put back). No PEM, JWT or token is printed or logged.
//
//   1. read and check the PEM; compute its SHA-256 fingerprint;
//   2. with an App JWT: GET /app (right App ID, owned by the expected account, slug) and
//      GET /app/installations (exactly one, on that account, "selected" repositories);
//   3. the bot's user ID (public), for the commit email;
//   4. mint a writer token for the one repository and run the same identity checks as every mint;
//   5. store the key (DPAPI) and the config; read the key back and compare, so decryption is proven;
//   6. delete the PEM (zeros, then unlink); an undeletable PEM is a visible failure, not a warning;
//   7. drop any older cached token.

const nodefs = require('fs');
const cfg = require('./config');
const { MakoTokenError, scrub } = require('./errors');
const { checkPem, secureDelete } = require('./keystore');
const { createMinter, getJson, API } = require('./minter');

async function importKey({
  pemPath, appId, replace = false, fs = nodefs, layout, keystore, cache, fetchImpl = globalThis.fetch, loadAuth, out,
}) {
  if (!Number.isSafeInteger(appId) || appId <= 0) throw new MakoTokenError('bad-args', 'give the App ID: mako-token import <pem> --app-id <number> (it is on the App page)');
  if (keystore.exists() && !replace) {
    throw new MakoTokenError('key-exists', 'a key is already imported on this PC (one key per PC); to replace it, delete the old key on GitHub first and run the import again with --replace');
  }
  let pem;
  try { pem = fs.readFileSync(pemPath, 'utf8'); }
  catch { throw new MakoTokenError('bad-pem', 'cannot read the .pem file at that path'); }
  const fp = checkPem(pem);

  const loadAuthApp = loadAuth || (() => import('@octokit/auth-app'));
  const { createAppAuth } = await loadAuthApp();
  const appAuth = createAppAuth({ appId, privateKey: pem });
  let jwt;
  try { jwt = (await appAuth({ type: 'app' })).token; }
  catch (e) { throw new MakoTokenError('bad-pem', `could not sign with that key (${scrub(e && e.message)})`); }

  const app = await getJson(fetchImpl, `${API}/app`, jwt);
  if (app.id !== appId) throw new MakoTokenError('identity-mismatch', `GitHub says this key belongs to App ${app.id}, not ${appId}`);
  if (!app.owner || String(app.owner.login).toLowerCase() !== cfg.APP_OWNER.toLowerCase()) {
    throw new MakoTokenError('identity-mismatch', `the App is owned by ${app.owner && app.owner.login}, expected ${cfg.APP_OWNER}`);
  }
  const installs = await getJson(fetchImpl, `${API}/app/installations`, jwt);
  const mine = (Array.isArray(installs) ? installs : []).filter((i) => i.account && String(i.account.login).toLowerCase() === cfg.APP_OWNER.toLowerCase());
  if (!Array.isArray(installs) || installs.length !== 1 || mine.length !== 1) {
    throw new MakoTokenError('identity-mismatch', `expected exactly one installation (on ${cfg.APP_OWNER}), found ${Array.isArray(installs) ? installs.length : 'none'}`);
  }
  const installationId = mine[0].id;
  const bot = await getJson(fetchImpl, `${API}/users/${encodeURIComponent(app.slug + '[bot]')}`);

  const v = cfg.validateConfig({
    appId, installationId, slug: app.slug, botUserId: bot.id, owner: cfg.APP_OWNER, repo: cfg.APP_REPO,
  });
  if (!v.ok) throw new MakoTokenError('identity-mismatch', `GitHub's answers do not make a valid config (${v.reason})`);
  const config = v.config;

  const mint = createMinter({ config, getPrivateKey: () => pem, fetchImpl, loadAuth: loadAuthApp });
  const minted = await mint({ profile: 'writer' }); // runs every identity check; the token is discarded
  if (!minted.token) throw new MakoTokenError('renewal-failed', 'no token was minted');

  fs.mkdirSync(layout.dataDir, { recursive: true });
  const tmp = `${layout.configPath}.${process.pid}.tmp`;
  // --replace overwrites a working key: keep its (protected) blob until the new one is stored and its config
  // is written, so a failure puts the old key back instead of leaving none.
  const backup = `${layout.keyPath}.bak`;
  const hadKey = keystore.exists();
  if (hadKey) fs.copyFileSync(layout.keyPath, backup);
  try {
    keystore.save(pem);
    const back = keystore.load();
    if (back !== pem) throw new MakoTokenError('dpapi-failed', 'the stored key did not read back the same; nothing was kept');
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n');
    fs.renameSync(tmp, layout.configPath);
  } catch (e) {
    // Never leave a key without its config (Mako refuses to start App panes in that state): undo both, and
    // put a replaced key back.
    let restored = true;
    if (hadKey) {
      try { fs.copyFileSync(backup, layout.keyPath); }
      catch { restored = false; }
    } else keystore.remove();
    try { fs.unlinkSync(tmp); } catch { /* not written */ }
    if (hadKey && !restored) {
      // Keep the only copy of the old key and say where it is; never claim "nothing was kept".
      throw new MakoTokenError('import-failed', `the new key could not be stored and the old key could not be put back. The old key is saved at ${backup}; copy it over ${layout.keyPath} to restore it.`);
    }
    try { fs.unlinkSync(backup); } catch { /* none */ }
    if (e instanceof MakoTokenError) throw e;
    throw new MakoTokenError('import-failed', `could not store the key and config (${scrub(e && e.message)}); nothing was kept`);
  }
  try { fs.unlinkSync(backup); } catch { /* none */ }
  cache.removeAll();

  const del = secureDelete(fs, pemPath);
  const bi = cfg.botIdentity(config);
  out(`App ${config.slug} (ID ${config.appId}), installation ${config.installationId} on ${config.owner}/${config.repo} only.`);
  out(`Commit identity: ${bi.name} <${bi.email}>`);
  out(`Key fingerprint: ${fp}`);
  out('Compare it with the fingerprint shown next to this key on the App page (Settings > Developer settings > GitHub Apps > mako-agents > Private keys). If it differs, this is not the key you made: stop and revoke it.');
  out('A test token was minted and checked (the right App, the one repository, the profile\'s permissions) and then discarded.');
  if (!del.ok) {
    throw new MakoTokenError('pem-not-deleted', `the key is imported, but the PEM file could not be deleted (${del.reason}). Delete ${pemPath} yourself now.`);
  }
  out('The PEM file was overwritten and deleted. The key now exists only as a Windows-protected file under your user.');
  return { config, fingerprint: fp };
}

module.exports = { importKey };
