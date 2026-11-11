'use strict';
// S35 mako-token: `mako-token launch claude [args]`, behind the interim launcher mako-claude.cmd.
// For a plain terminal that starts `claude` outside Mako: it builds the environment with the SAME
// builder a Mako agent pane uses (pty-env.js, App mode), so that terminal also gets no token, the gh
// shim first on PATH, an empty gh config folder, the credential helper and the bot identity.
// Only `claude` is launched.

const path = require('path');
const nodefs = require('fs');
const { spawnSync } = require('child_process');
const cfg = require('./config');
const { buildPtyEnv } = require('../pty-env');

const SAFE_CMD_ARG = /^[A-Za-z0-9_ .:\/\\=@,+-]*$/;

function resolveClaude({ env, binDir, exists = (p) => nodefs.existsSync(p), platform = process.platform }) {
  const win = platform === 'win32';
  const pathMod = win ? path.win32 : path.posix;
  const pathVar = Object.keys(env).find((k) => k.toUpperCase() === 'PATH');
  const skip = pathMod.resolve(binDir).toLowerCase();
  const dirs = String(pathVar ? env[pathVar] : '').split(win ? ';' : ':').filter(Boolean)
    .filter((d) => pathMod.resolve(d).toLowerCase() !== skip);
  for (const d of dirs) {
    for (const name of win ? ['claude.exe', 'claude.cmd'] : ['claude']) {
      const p = pathMod.join(d.replace(/^"|"$/g, ''), name);
      if (exists(p)) return p;
    }
  }
  return null;
}

function launchClaude({ args, env, layout, config, spawn = spawnSync, exists, platform = process.platform, stderr = process.stderr }) {
  const say = (l) => stderr.write(`mako-claude: ${l}\n`);
  const base = {};
  for (const [k, v] of Object.entries(env)) if (k.toUpperCase() !== 'ELECTRON_RUN_AS_NODE') base[k] = v;
  const childEnv = buildPtyEnv({
    baseEnv: base, fencedRole: false, videoScout: false, paneStatusEnv: {}, agentGit: true,
    agentApp: { config, binDir: layout.binDir, ghConfigDir: layout.ghEmptyDir },
  });
  const target = resolveClaude({ env: base, binDir: layout.binDir, exists, platform });
  if (!target) { say('claude was not found on PATH'); return 4; }
  let r;
  if (/\.(cmd|bat)$/i.test(target)) {
    if (args.some((a) => !SAFE_CMD_ARG.test(a))) { say('claude here is a .cmd launcher and one of the arguments has characters cmd.exe would mangle; start claude inside a Mako pane instead'); return 2; }
    const line = `"${target}"${args.map((a) => ` "${a}"`).join('')}`;
    r = spawn(env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], { env: childEnv, stdio: 'inherit', windowsVerbatimArguments: true });
  } else {
    r = spawn(target, args, { env: childEnv, stdio: 'inherit' });
  }
  if (r.error) { say(`could not start claude (${r.error.message})`); return 4; }
  return typeof r.status === 'number' ? r.status : 1;
}

module.exports = { launchClaude, resolveClaude };
