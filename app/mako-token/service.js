'use strict';
// S35 mako-token: wire the real pieces together for the CLI, the gh shim and the git helper. Each of
// those is a short-lived process; none keeps a token or the key beyond its own run.

const os = require('os');
const nodefs = require('fs');
const cfg = require('./config');
const { MakoTokenError, scrub } = require('./errors');
const { createFileCache } = require('./cache');
const { createKeyStore } = require('./keystore');
const { createMinter } = require('./minter');
const { createTokenService } = require('./core');

function loadConfig({ fs = nodefs, configPath }) {
  let text;
  try { text = fs.readFileSync(configPath, 'utf8'); }
  catch (e) {
    if (e && e.code === 'ENOENT') return { ok: false, reason: 'not-configured' };
    return { ok: false, reason: 'invalid', detail: scrub(e && e.message) };
  }
  let obj;
  try { obj = JSON.parse(text); } catch { return { ok: false, reason: 'invalid', detail: 'the config is not valid JSON' }; }
  const v = cfg.validateConfig(obj);
  return v.ok ? { ok: true, config: v.config } : { ok: false, reason: 'invalid', detail: v.reason };
}

/** -> { service, layout, config } or throws MakoTokenError('not-configured' | 'bad-config'). */
function createDefaultService({ env = process.env, fs = nodefs, homedir = os.homedir(), now = Date.now, warn = (l) => process.stderr.write(l + '\n'), fetchImpl, loadAuth } = {}) {
  const layout = cfg.layout(env, homedir);
  const loaded = loadConfig({ fs, configPath: layout.configPath });
  if (!loaded.ok) {
    if (loaded.reason === 'not-configured') throw new MakoTokenError('not-configured', 'GitHub App mode is not set up on this PC; run: mako-token import <path to the .pem> (docs/MAKO-TOKEN.md)');
    throw new MakoTokenError('bad-config', `the GitHub App config ${layout.configPath} is invalid (${loaded.detail})`);
  }
  const config = loaded.config;
  const keystore = createKeyStore({ fs, keyPath: layout.keyPath, env });
  const cache = createFileCache({ fs, dir: layout.cacheDir, env });
  const mint = createMinter({ config, getPrivateKey: () => keystore.load(), fetchImpl, loadAuth });
  return { service: createTokenService({ config, cache, mint, now, warn }), layout, config, keystore, cache };
}

module.exports = { createDefaultService, loadConfig };
