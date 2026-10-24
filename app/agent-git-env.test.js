'use strict';
// Run: node app/agent-git-env.test.js
// Plain Node.js — no framework. Proves S06's local-agent identity: with a valid ABlueAgent token an
// unfenced agent pane gets GH_TOKEN, a git credential-helper reset followed by gh's helper, and the
// ABlueAgent commit identity; fenced roles, Video Scout and plain shells never do; an agent pane owns
// every identity name so no ambient spelling can stand in; the forced subprocess scrub is untouched.

const fs = require('fs');
const path = require('path');
const {
  AGENT_GIT_ENV_KEYS, AGENT_NOREPLY_EMAIL, isAgentToken, isAgentPane, buildAgentGitEnv,
} = require('./agent-git-env');
const { buildPtyEnv } = require('./pty-env');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// A synthetic, correctly shaped value; not a real token.
const TOKEN = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';
const FINE = 'github_pat_' + '11ABCDEFG0123456789abc_' + 'x'.repeat(59);

// --- token shape --------------------------------------------------------------------------------
{
  assert(isAgentToken(TOKEN), 'a classic ghp_ token is accepted');
  assert(isAgentToken(FINE), 'a fine-grained github_pat_ token is accepted');
  for (const bad of ['', ' ' + TOKEN, TOKEN + '\n', 'ghp_short', 'gho_' + TOKEN.slice(4), 'AIza' + TOKEN.slice(4), null, 42]) {
    assert(!isAgentToken(bad), `refused: ${JSON.stringify(bad).slice(0, 20)}`);
  }
}

// --- which panes are agent panes ---------------------------------------------------------------
{
  assert(isAgentPane({ kind: 'cli', cli: 'claude', fenced: false, videoScout: false }), 'a bare CLI pane is an agent pane');
  assert(isAgentPane({ kind: 'role', role: 'builder', fenced: false, videoScout: false }), 'an unfenced role is an agent pane');
  assert(!isAgentPane({ kind: 'role', role: 'web-scout', fenced: true, videoScout: false }), 'a fenced role is never an agent pane');
  assert(!isAgentPane({ kind: 'video-scout', fenced: false, videoScout: true }), 'Video Scout is never an agent pane');
  assert(!isAgentPane({ kind: 'shell', fenced: false, videoScout: false }), 'a plain shell (Blue\'s own terminal) is not an agent pane');
  assert(!isAgentPane({ kind: 'cli', videoScout: false }), 'a launch without an explicit fenced:false is refused');
  assert(!isAgentPane(null), 'no launch, no agent pane');
}

// --- the entries ---------------------------------------------------------------------------------
{
  const env = buildAgentGitEnv(TOKEN);
  assert(env.GH_TOKEN === TOKEN, 'GH_TOKEN carries the token');
  assert(env.GIT_CONFIG_COUNT === '2', 'two command-scope git config entries');
  assert(env.GIT_CONFIG_KEY_0 === 'credential.helper' && env.GIT_CONFIG_VALUE_0 === '',
    'entry 0 resets the credential helper list (no Git Credential Manager / ABlueAI login)');
  assert(env.GIT_CONFIG_KEY_1 === 'credential.https://github.com.helper' && env.GIT_CONFIG_VALUE_1 === '!gh auth git-credential',
    'entry 1 is gh\'s own helper for github.com (no hand-written helper)');
  assert(env.GIT_TERMINAL_PROMPT === '0', 'a failed login fails visibly instead of prompting');
  assert(env.GIT_AUTHOR_NAME === 'ABlueAgent' && env.GIT_COMMITTER_NAME === 'ABlueAgent', 'commits are attributed to ABlueAgent');
  assert(env.GIT_AUTHOR_EMAIL === AGENT_NOREPLY_EMAIL && env.GIT_COMMITTER_EMAIL === AGENT_NOREPLY_EMAIL &&
    /^\d+\+ABlueAgent@users\.noreply\.github\.com$/.test(AGENT_NOREPLY_EMAIL), 'with ABlueAgent\'s noreply address');
  assert(Object.keys(env).every((k) => AGENT_GIT_ENV_KEYS.includes(k)), 'every emitted name is a reserved identity name');
  assert(!('GITHUB_TOKEN' in env), 'only GH_TOKEN is emitted (GITHUB_TOKEN is reserved, not set)');
  assert(JSON.stringify(buildAgentGitEnv('nope')) === '{}', 'an invalid token emits nothing');
}

// --- through the real PTY environment builder ---------------------------------------------------
const AMBIENT = {
  PATH: 'C:\\Windows', SystemRoot: 'C:\\Windows',
  GH_TOKEN: 'ambient-gh', github_token: 'ambient-lower', GIT_CONFIG_COUNT: '9', Git_Config_Key_0: 'core.pager',
  GIT_CONFIG_PARAMETERS: "'credential.helper=manager'", GIT_ASKPASS: 'C:\\evil.exe', GIT_AUTHOR_NAME: 'ABlueAI',
};
{
  const env = buildPtyEnv({ baseEnv: AMBIENT, fencedRole: false, videoScout: false, paneStatusEnv: {}, agentGit: true, agentGitToken: TOKEN });
  assert(env.GH_TOKEN === TOKEN && env.GIT_CONFIG_VALUE_1 === '!gh auth git-credential', 'agent pane: the identity is emitted');
  assert(env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB === '1', 'agent pane: the subprocess scrub is still forced');
  assert(env.PATH === 'C:\\Windows', 'agent pane: ordinary ambient variables are kept');
  const names = Object.keys(env).map((k) => k.toUpperCase());
  assert(names.filter((k) => k === 'GH_TOKEN').length === 1 && !names.includes('GITHUB_TOKEN'),
    'agent pane: no ambient GH_TOKEN/github_token spelling survives beside the agent\'s');
  assert(env.GIT_CONFIG_COUNT === '2' && !('Git_Config_Key_0' in env), 'agent pane: ambient GIT_CONFIG_* is replaced, any case');
  assert(!('GIT_CONFIG_PARAMETERS' in env) && !('GIT_ASKPASS' in env), 'agent pane: ambient GIT_CONFIG_PARAMETERS and GIT_ASKPASS are removed');
  assert(env.GIT_AUTHOR_NAME === 'ABlueAgent', 'agent pane: the ambient author is replaced');
}
{
  const env = buildPtyEnv({ baseEnv: AMBIENT, fencedRole: false, videoScout: false, paneStatusEnv: {}, agentGit: true, agentGitToken: null });
  assert(!('GH_TOKEN' in env) && !('GIT_CONFIG_COUNT' in env) && !('GIT_AUTHOR_NAME' in env),
    'agent pane without a token: no identity, and no ambient stand-in either (main logs the gap visibly)');
}
{
  const env = buildPtyEnv({ baseEnv: AMBIENT, fencedRole: true, videoScout: false, paneStatusEnv: {}, agentGit: true, agentGitToken: TOKEN });
  assert(!Object.keys(env).some((k) => /^GH_|^GITHUB_|^GIT_/i.test(k)), 'fenced role: no token or git identity, even if a caller asks');
}
{
  const env = buildPtyEnv({ baseEnv: AMBIENT, fencedRole: false, videoScout: true, geminiKey: 'AIzaX', paneStatusEnv: {}, agentGit: true, agentGitToken: TOKEN });
  assert(!('GH_TOKEN' in env) || env.GH_TOKEN !== TOKEN, 'Video Scout: never the agent token, even if a caller asks');
}
{
  const env = buildPtyEnv({ baseEnv: AMBIENT, fencedRole: false, videoScout: false, paneStatusEnv: {}, agentGit: false, agentGitToken: TOKEN });
  assert(env.GH_TOKEN === 'ambient-gh' && env.GIT_AUTHOR_NAME === 'ABlueAI' && !('GIT_CONFIG_VALUE_1' in env),
    'plain shell: unchanged from today (Blue\'s own environment, no agent token)');
}

// --- main.js wiring (source tripwires) ----------------------------------------------------------
{
  const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert(/const agentPane = isAgentPane\(launch\);/.test(src) && /agentGit: agentPane,\s*agentGitToken,/.test(src),
    'pty-start decides agentPane from the classified launch and passes the token to buildPtyEnv');
  for (const ch of ['get-agent-token-status', 'set-agent-token', 'clear-agent-token']) {
    const i = src.indexOf(`ipcMain.handle('${ch}'`);
    const body = i < 0 ? '' : src.slice(i, src.indexOf('\n});', i));
    assert(body.includes('launcherGate.assess(e)') && body.indexOf('launcherGate.assess(e)') < 120,
      `${ch}: the trusted-sender gate runs first`);
    assert(!/return \{[^}]*:\s*agentGitToken\s*[,}]/.test(body) && !/return\s+agentGitToken\b/.test(body),
      `${ch}: never returns the token`);
  }
  assert(!/tlog\([^)]*agentGitToken\b(?!\s*\?)/.test(src), 'the token is never logged');
  const preload = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');
  assert(!/getAgentToken\b|readAgentToken/.test(preload), 'preload has no way to read the token back');
}

process.stdout.write(`\nagent-git-env: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
