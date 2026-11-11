'use strict';
// S35 mako-token: command line.
//
//   mako-token import <pem> --app-id <n> [--replace]   store the App key, prove it, delete the PEM
//   mako-token status [--profile writer|reader]        mint or reuse a token and report; never prints it
//   mako-token git <get|store|erase>                   git credential helper (git runs this)
//   mako-token launch claude [args]                    claude with the App-mode environment (mako-claude.cmd)
//   mako-token install-launchers                       write the gh shim and launchers (Mako does this itself)
//
// Run by Node (`node app\mako-token\cli.js ...`) or by Electron with ELECTRON_RUN_AS_NODE=1. A token is
// written to stdout only by `git get`, to git, in the credential-helper format. Nothing here logs a
// token, a key or a JWT.

const path = require('path');
const nodefs = require('fs');
const os = require('os');
const cfg = require('./config');
const { MakoTokenError, scrub } = require('./errors');

async function readStdin(stream = process.stdin) {
  let data = '';
  stream.setEncoding('utf8');
  for await (const chunk of stream) data += chunk;
  return data;
}

function parseKv(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

function flag(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

/** git's credential helper. Only github.com over HTTPS is answered; anything else gets no credential. */
async function gitHelper({ action, stdinText, getToken, forget, profile, stdout }) {
  const req = parseKv(stdinText);
  const ours = req.protocol === 'https' && String(req.host || '').toLowerCase() === 'github.com';
  if (!ours) return 0;
  if (action === 'erase') { await forget(profile); return 0; }
  if (action !== 'get') return 0; // `store`: nothing to remember, the next call mints or reuses
  const { token } = await getToken(profile);
  stdout.write(`username=x-access-token\npassword=${token}\n`);
  return 0;
}

async function main(argv, io = {}) {
  const env = io.env || process.env;
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const fail = (e) => {
    stderr.write(`mako-token: ${e instanceof MakoTokenError ? e.message : scrub(e && e.message)}\n`);
    return e instanceof MakoTokenError && e.code === 'bad-args' ? 2 : 3;
  };
  const [cmd, ...rest] = argv;
  const profile = cfg.isProfile(flag(rest, '--profile')) ? flag(rest, '--profile') : (cfg.isProfile(env.MAKO_TOKEN_PROFILE) ? env.MAKO_TOKEN_PROFILE : cfg.DEFAULT_PROFILE);
  try {
    if (cmd === 'git') {
      const { createDefaultService } = require('./service');
      const ctx = createDefaultService({ env, fs: io.fs || nodefs, warn: (l) => stderr.write(l + '\n'), ...(io.serviceOptions || {}) });
      return await gitHelper({
        action: rest[0], stdinText: io.stdinText !== undefined ? io.stdinText : await readStdin(io.stdin),
        getToken: (p) => ctx.service.getToken(p), forget: (p) => ctx.service.forget(p), profile, stdout,
      });
    }
    if (cmd === 'status') {
      const { createDefaultService } = require('./service');
      const ctx = createDefaultService({ env, fs: io.fs || nodefs, warn: (l) => stderr.write(l + '\n'), ...(io.serviceOptions || {}) });
      const r = await ctx.service.getToken(profile);
      const mins = Math.max(0, Math.round((Date.parse(r.expiresAt) - Date.now()) / 60000));
      stdout.write(`ok: ${ctx.config.slug} (App ${ctx.config.appId}, installation ${ctx.config.installationId}) on ${ctx.config.owner}/${ctx.config.repo}; "${profile}" token ${r.fromCache ? 'reused from the cache' : 'minted'}, valid for about ${mins} more minutes\n`);
      return 0;
    }
    if (cmd === 'import') {
      const pemPath = rest.find((a) => !a.startsWith('--') && a !== flag(rest, '--app-id'));
      if (!pemPath) throw new MakoTokenError('bad-args', 'usage: mako-token import <path to the .pem> --app-id <number> [--replace]');
      const { createKeyStore } = require('./keystore');
      const { createFileCache } = require('./cache');
      const { importKey } = require('./importer');
      const layout = cfg.layout(env, os.homedir());
      const fs = io.fs || nodefs;
      await importKey({
        pemPath: path.resolve(pemPath), appId: Number(flag(rest, '--app-id')), replace: rest.includes('--replace'), fs, layout,
        keystore: io.keystore || createKeyStore({ fs, keyPath: layout.keyPath, env }),
        cache: io.cache || createFileCache({ fs, dir: layout.cacheDir, env }),
        fetchImpl: io.fetchImpl, loadAuth: io.loadAuth, out: (l) => stdout.write(l + '\n'),
      });
      return 0;
    }
    if (cmd === 'launch') {
      if (rest[0] !== 'claude') throw new MakoTokenError('bad-args', 'usage: mako-token launch claude [args]');
      const { loadConfig } = require('./service');
      const { launchClaude } = require('./launch');
      const layout = cfg.layout(env, os.homedir());
      const loaded = loadConfig({ fs: io.fs || nodefs, configPath: layout.configPath });
      if (!loaded.ok) throw new MakoTokenError('not-configured', loaded.reason === 'not-configured' ? 'GitHub App mode is not set up on this PC; run: mako-token import <path to the .pem> (docs/MAKO-TOKEN.md)' : `the GitHub App config is invalid (${loaded.detail})`);
      const { installForCurrentRuntime } = require('./install');
      installForCurrentRuntime({ env, runAsNode: !!process.versions.electron });
      return launchClaude({ args: rest.slice(1), env, layout, config: loaded.config, stderr });
    }
    if (cmd === 'install-launchers') {
      const { installForCurrentRuntime } = require('./install');
      const names = installForCurrentRuntime({ env });
      stdout.write(`launchers up to date in ${cfg.layout(env, os.homedir()).binDir}${names.length ? ` (written: ${names.join(', ')})` : ''}\n`);
      return 0;
    }
    stderr.write('usage: mako-token <import <pem> --app-id <n> | status | git <get|store|erase> | launch claude | install-launchers>\n');
    return 2;
  } catch (e) {
    return fail(e);
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}

module.exports = { main, gitHelper, parseKv };
