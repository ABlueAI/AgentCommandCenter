'use strict';
// S35 mako-token: the `gh` shim. A directory holding this shim's launchers sits first on an agent
// pane's PATH. For every `gh ...` it asks mako-token for a fresh token, puts it in GH_TOKEN for that
// one child process only, and runs the REAL gh by absolute path. The pane itself never has GH_TOKEN
// or GITHUB_TOKEN; GH_CONFIG_DIR points at an empty folder so a stored login (ABlueAI's) can't be
// used; and `gh auth token` and the other subcommands that would print or change a login are refused.
//
// Exit codes: gh's own; 2 = refused subcommand or profile; 3 = no token (message on stderr, never a fallback);
// 4 = the real gh could not be found or started.

const path = require('path');
const nodefs = require('fs');
const { spawnSync } = require('child_process');
const cfg = require('./config');
const { MakoTokenError, scrub } = require('./errors');

// Names a token (or a host that would receive one) can arrive through. All removed from the child's
// inherited environment before GH_TOKEN is set for it.
const STRIPPED = ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', 'GH_HOST', 'GH_CONFIG_DIR'];
// Subcommands that print or change a login, or that plant behaviour that runs in later panes with the token
// set: aliases and `config set` write to the shared GH_CONFIG_DIR; extensions are installed to gh's data folder.
const REFUSED_AUTH = new Set(['token', 'login', 'logout', 'refresh', 'setup-git', 'switch', 'git-credential']);
const REFUSED_TOP = new Set(['alias', 'extension', 'extensions', 'ext']);
// gh auth status --show-token / -t, in a cluster (-at) and in pflag's `=` forms (--show-token=true, -t=true).
const SHOWS_TOKEN = /^(?:--show-token(?:=.*)?|-[A-Za-z]*t.*)$/;

/** null if allowed, else the reason. */
function refusedReason(argv) {
  if (REFUSED_TOP.has(argv[0])) return `"gh ${argv[0]}" is not available here: it would plant code or behaviour that runs in every later pane with the token set.`;
  if (argv[0] === 'config' && argv[1] === 'set') return '"gh config set" is not available here: it would persist settings (a pager, browser or editor command) into every later pane\'s shared gh config.';
  if (argv[0] === 'auth') {
    if (REFUSED_AUTH.has(argv[1])) return `"gh auth ${argv[1]}" is not available here: panes use a GitHub App token that mako-token hands to each gh call and never shows or stores.`;
    if (argv[1] === 'status' && argv.slice(2).some((a) => SHOWS_TOKEN.test(a))) return '"gh auth status --show-token" would print the token; it is not available here.';
  }
  return null;
}

function envKeyFold(k) { return k.toUpperCase(); }

function findRealGh({ env, binDir, exists = (p) => nodefs.existsSync(p), platform = process.platform }) {
  const win = platform === 'win32';
  const pathMod = win ? path.win32 : path.posix;
  const pathVar = Object.keys(env).find((k) => envKeyFold(k) === 'PATH');
  const entries = String(pathVar ? env[pathVar] : '').split(win ? ';' : ':').filter(Boolean);
  const skip = pathMod.resolve(binDir).toLowerCase();
  const candidates = entries
    .map((d) => d.replace(/^"|"$/g, ''))
    .filter((d) => pathMod.isAbsolute(d)) // a relative entry (., node_modules\\.bin) would resolve against the worktree
    .filter((d) => pathMod.resolve(d).toLowerCase() !== skip)
    .map((d) => pathMod.join(d, win ? 'gh.exe' : 'gh'));
  if (win) {
    const pf = env.ProgramFiles || 'C:\\Program Files';
    candidates.push(path.win32.join(pf, 'GitHub CLI', 'gh.exe'));
  }
  return candidates.find((c) => exists(c)) || null;
}

function childEnv(parentEnv, { token, ghConfigDir }) {
  const out = {};
  for (const [k, v] of Object.entries(parentEnv)) {
    if (STRIPPED.includes(envKeyFold(k)) || envKeyFold(k) === 'ELECTRON_RUN_AS_NODE') continue;
    out[k] = v;
  }
  out.GH_TOKEN = token;
  out.GH_CONFIG_DIR = ghConfigDir;
  out.GH_PROMPT_DISABLED = '1';
  out.GH_NO_UPDATE_NOTIFIER = '1';
  return out;
}

/**
 * runGhShim({ argv, env, getToken, ghConfigDir, binDir, realGh, spawn, stderr, fs }) -> exit code
 *   getToken: async (profile) -> { token }        (mako-token's service)
 */
async function runGhShim({
  argv, env, getToken, ghConfigDir, binDir, realGh, spawn = spawnSync, stderr = process.stderr, fs = nodefs, platform = process.platform,
}) {
  const say = (line) => stderr.write(`mako-token gh shim: ${line}\n`);
  const refused = refusedReason(argv);
  if (refused) { say(refused); return 2; }
  const real = realGh || findRealGh({ env, binDir, platform });
  if (!real) { say('the real gh was not found on PATH or in C:\\Program Files\\GitHub CLI. Install GitHub CLI.'); return 4; }
  const sel = cfg.selectProfile(env.MAKO_TOKEN_PROFILE);
  if (!sel.ok) { say(`${sel.reason}; not running gh.`); return 2; }
  const profile = sel.profile;
  let token;
  try {
    token = (await getToken(profile)).token;
  } catch (e) {
    say(e instanceof MakoTokenError ? e.message : `could not get a GitHub App token (${scrub(e && e.message)})`);
    return 3;
  }
  try { fs.mkdirSync(ghConfigDir, { recursive: true }); } catch { /* gh will report an unusable config dir */ }
  const r = spawn(real, argv, { env: childEnv(env, { token, ghConfigDir }), stdio: 'inherit', windowsHide: true });
  if (r.error) { say(`could not start the real gh (${scrub(r.error.message)})`); return 4; }
  return typeof r.status === 'number' ? r.status : 1;
}

if (require.main === module) {
  const { createDefaultService } = require('./service');
  (async () => {
    let ctx;
    try { ctx = createDefaultService(); }
    catch (e) { process.stderr.write(`mako-token gh shim: ${e.message}\n`); process.exit(3); }
    const code = await runGhShim({
      argv: process.argv.slice(2), env: process.env, getToken: (p) => ctx.service.getToken(p),
      ghConfigDir: ctx.layout.ghEmptyDir, binDir: ctx.layout.binDir,
    });
    process.exit(code);
  })();
}

module.exports = { runGhShim, findRealGh, childEnv, refusedReason, STRIPPED, REFUSED_AUTH, REFUSED_TOP };
