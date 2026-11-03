'use strict';
// Run: node app/page-reader.test.js
//
// S15 PAGE READER (docs/decisions/OSS-research-capture.md, Blue's verdict 2026-11-03: ADOPT
// Playwright MCP). Pins:
//   1. the URL check and the request file main writes;
//   2. the MCP config (exact pinned server, fixed arguments, no listener, no headless, no
//      unrestricted file access) and the CLI arguments (opening line before every variadic option);
//   3. that the literals agree across page-reader.js, role-fence-policy.js, the fence hook, the role
//      file, package.json and package-lock.json (tripwire);
//   4. the fence policy grants the two MCP tools to page-reader alone;
//   5. the fence hook's two gates, by running the real hook;
//   6. end to end through the real main.js: page-reader-prepare and the pty-start command.

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const pr = require('./page-reader');
const policy = require('./role-fence-policy');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  ✓ ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
function section(t) { process.stdout.write('\n' + t + '\n'); }

const REPO = path.join(__dirname, '..');
const HOOK_SRC = path.join(REPO, 'scripts', 'hooks', 'fence-write.js');
const ROLE_SRC = path.join(REPO, 'agent-roles', 'page-reader.md');

section('1. URL check and request file');
{
  const ok = pr.validatePageUrl('https://www.reddit.com/r/test/comments/abc/title/');
  assert(ok.ok === true && ok.url === 'https://www.reddit.com/r/test/comments/abc/title/', 'a www.reddit.com thread URL is accepted unchanged');
  assert(pr.validatePageUrl('  https://example.org/a  ').ok === true, 'surrounding spaces are trimmed');
  const cases = [
    [undefined, pr.REASON.NOT_STRING], [42, pr.REASON.NOT_STRING], ['', pr.REASON.EMPTY], ['   ', pr.REASON.EMPTY],
    ['http://www.reddit.com/', pr.REASON.NOT_HTTPS], ['file:///C:/Users/x/.ssh/id_rsa', pr.REASON.NOT_HTTPS],
    ['javascript:alert(1)', pr.REASON.NOT_HTTPS], ['data:text/html,hi', pr.REASON.NOT_HTTPS],
    ['https://user:pw@example.org/', pr.REASON.CREDENTIALS], ['https://user@example.org/', pr.REASON.CREDENTIALS],
    ['https://exa mple.org/', pr.REASON.WHITESPACE], ['https://example.org/\n--settings=x', pr.REASON.WHITESPACE],
    ['not a url', pr.REASON.WHITESPACE], ['notaurl', pr.REASON.UNPARSEABLE],
    ['https://example.org/' + 'a'.repeat(2000), pr.REASON.TOO_LONG],
  ];
  for (const [input, reason] of cases) {
    const r = pr.validatePageUrl(input);
    assert(r.ok === false && r.reason === reason, 'refuses ' + JSON.stringify(String(input).slice(0, 40)) + ' as ' + reason);
  }
  const req = pr.buildPageRequest('https://example.org/x');
  assert(JSON.stringify(JSON.parse(req)) === JSON.stringify({ url: 'https://example.org/x' }), 'the request file holds the URL and nothing else');
}

section('2. MCP config and CLI arguments');
{
  const abs = path.resolve('/opt/mako/app/node_modules/@playwright/mcp/cli.js');
  const prof = path.resolve('/opt/mako/userData/page-reader/browser-profile');
  const cfg = pr.buildMcpConfig({ cliPath: abs, profileDir: prof });
  assert(Object.keys(cfg.mcpServers).length === 1 && cfg.mcpServers.playwright, 'exactly one MCP server, named playwright');
  const s = cfg.mcpServers.playwright;
  assert(s.type === 'stdio' && s.command === 'node', 'stdio, started with node (no npx download at launch)');
  assert(JSON.stringify(s.args) === JSON.stringify([abs, '--browser', 'chromium', '--user-data-dir', prof]), 'fixed arguments: chromium and the one persistent profile');
  for (const bad of ['--port', '--host', '--headless', '--allow-unrestricted-file-access', '--caps', '--isolated', '--extension']) {
    assert(s.args.indexOf(bad) === -1, 'no ' + bad);
  }
  let threw = false;
  try { pr.buildMcpConfig({ cliPath: 'cli.js', profileDir: prof }); } catch (e) { threw = true; }
  assert(threw, 'a relative cli path is refused');

  const a = pr.pageReaderCliArgs(path.resolve('/opt/mako/userData/page-reader/mcp.json'));
  assert(a.prompt === ' "' + pr.OPENING_PROMPT + '"', 'the opening line is the fixed constant');
  assert(!/["`$\r\n]/.test(pr.OPENING_PROMPT) && pr.OPENING_PROMPT.charAt(0) !== '-', 'the opening line holds no PowerShell-significant character and is not an option');
  assert(a.options.indexOf(' --strict-mcp-config ') !== -1, '--strict-mcp-config: no other MCP server loads');
  assert(/ --allowedTools 'mcp__playwright__browser_navigate,mcp__playwright__browser_snapshot'$/.test(a.options), 'only the two browser tools are pre-allowed');
  assert(pr.psQuote("C:\\Users\\O'Neil\\x.json") === "'C:\\Users\\O''Neil\\x.json'", 'a single quote in a path is doubled');
}

section('3. Tripwire: the same literals everywhere');
{
  const hook = fs.readFileSync(HOOK_SRC, 'utf8');
  assert(hook.indexOf("const PAGE_NAVIGATE_TOOL = '" + pr.MCP_TOOLS[0] + "';") !== -1, 'the hook names the same navigate tool');
  assert(hook.indexOf("const PAGE_SNAPSHOT_TOOL = '" + pr.MCP_TOOLS[1] + "';") !== -1, 'the hook names the same snapshot tool');
  assert(hook.indexOf('const PAGE_MAX_URL_LENGTH = ' + pr.MAX_URL_LENGTH + ';') !== -1, 'the hook uses the same URL length cap');
  assert(JSON.stringify(policy.ROLE_MCP_TOOLS['page-reader']) === JSON.stringify(pr.MCP_TOOLS), 'the fence policy grants the same two tools');
  assert(Object.keys(policy.ROLE_MCP_TOOLS).join() === 'page-reader', 'no other role has an MCP grant');
  const role = fs.readFileSync(ROLE_SRC, 'utf8');
  assert(role.indexOf('tools: Read, Write, ' + pr.MCP_TOOLS.join(', ') + '\n') !== -1, 'the role file declares exactly Read, Write and the two tools');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  assert(pkg.dependencies['@playwright/mcp'] === pr.PLAYWRIGHT_MCP_VERSION, 'package.json pins @playwright/mcp exactly to ' + pr.PLAYWRIGHT_MCP_VERSION);
  const lock = JSON.parse(fs.readFileSync(path.join(__dirname, 'package-lock.json'), 'utf8'));
  const locked = lock.packages['node_modules/@playwright/mcp'];
  assert(locked && locked.version === pr.PLAYWRIGHT_MCP_VERSION && /^sha512-/.test(locked.integrity), 'package-lock.json locks it with an integrity hash');
}

section('4. Fence policy: the MCP grant is page-reader only');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mako-page-reader-policy-'));
  const hookPath = path.join(tmp, 'fence-write.js');
  fs.copyFileSync(HOOK_SRC, hookPath);
  const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const roleText = fs.readFileSync(ROLE_SRC, 'utf8').replace('__CC_HOOK__', hookPath.replace(/\\/g, '/'));
  const check = (role, text) => policy.assertFencedRoleDefinition({
    role, text, canonicalHookPath: hookPath, trackedHookSha256: sha(HOOK_SRC), fsx: fs, hashFile: sha,
  });
  const good = check('page-reader', roleText);
  assert(good.ok === true, 'the tracked page-reader role is accepted');
  const asScout = check('web-scout', roleText.replace('name: page-reader', 'name: web-scout'));
  assert(asScout.ok === false && asScout.reason === policy.REASON.TOOL_NOT_ALLOWED, 'the same MCP tools on web-scout refuse');
  const extra = check('page-reader', roleText.replace('mcp__playwright__browser_snapshot\n', 'mcp__playwright__browser_snapshot, mcp__playwright__browser_click\n'));
  assert(extra.ok === false && extra.reason === policy.REASON.TOOL_NOT_ALLOWED, 'a third Playwright tool (click) refuses');
  const uncovered = check('page-reader', roleText.replace('|mcp__playwright__browser_snapshot"', '"'));
  assert(uncovered.ok === false && uncovered.reason === policy.REASON.MATCHER_COVERAGE, 'a matcher that skips the snapshot tool refuses');
  const bash = check('page-reader', roleText.replace('tools: Read, Write,', 'tools: Read, Write, Bash,'));
  assert(bash.ok === false && bash.reason === policy.REASON.FORBIDDEN_TOOL, 'Bash still refuses');
}

section('5. Fence hook gates (the real hook)');
{
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'mako-page-reader-hook-'));
  const env = Object.assign({}, process.env);
  delete env.BLUE_HELM_CONTROLLED_WEBFETCH_MODE; // a page-reader pane is issued no WebFetch mode
  const run = (tool, input) => spawnSync(process.execPath, [HOOK_SRC], {
    input: JSON.stringify({ cwd: sandbox, tool_name: tool, tool_input: input }), env, encoding: 'utf8',
  });
  const nav = 'mcp__playwright__browser_navigate';
  const snap = 'mcp__playwright__browser_snapshot';
  assert(run(nav, { url: 'https://www.reddit.com/r/x/comments/y/z/' }).status === 0, 'navigate to an https page is allowed');
  for (const u of ['http://www.reddit.com/', 'file:///etc/passwd', 'https://u:p@example.org/', 'chrome://settings', 'javascript:alert(1)', '', 'https://example.org/' + 'a'.repeat(2000)]) {
    const r = run(nav, { url: u });
    assert(r.status === 2 && r.stderr.indexOf('[fence-page-denied]') !== -1, 'navigate refuses ' + JSON.stringify(u.slice(0, 30)));
  }
  assert(run(nav, {}).status === 2, 'navigate with no URL refuses');
  assert(run(snap, {}).status === 0, 'a snapshot returned in the response is allowed');
  assert(run(snap, { target: 'e12' }).status === 0, 'a snapshot of one element is allowed');
  const toFile = run(snap, { filename: '../../outside.md' });
  assert(toFile.status === 2 && toFile.stderr.indexOf('[fence-page-denied]') !== -1, 'a snapshot written to a file refuses');
  for (const t of ['mcp__playwright__browser_click', 'mcp__playwright__browser_evaluate', 'mcp__playwright__browser_type', 'mcp__other__anything']) {
    assert(run(t, {}).status === 2, t + ' refuses');
  }
  const w = run('Write', { file_path: path.join(sandbox, 'report.md'), content: 'x' });
  assert(w.status === 0, 'Write of report.md inside the sandbox is still allowed');
  const out = run('Write', { file_path: path.join(os.tmpdir(), 'elsewhere.md'), content: 'x' });
  assert(out.status === 2, 'Write outside the sandbox still refuses');
}

section('6. End to end through the real main.js');
const FIX = fs.mkdtempSync(path.join(os.tmpdir(), 'mako-page-reader-main-'));
const USER_DATA = path.join(FIX, 'userData');
const HOME = path.join(FIX, 'home');
const PROJECTS = path.join(FIX, 'projects');
const OUTPUTS = path.join(PROJECTS, '.command-center', 'outputs');
for (const d of [USER_DATA, HOME, OUTPUTS]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(USER_DATA, 'settings.json'), JSON.stringify({ projectsRoot: PROJECTS, selectedRepo: '' }));
const ENTRY_URL = pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).toString();
const record = { handled: new Map(), on: new Map(), spawnArgs: [], webContents: null };
function electronStub() {
  const wc = { mainFrame: { url: ENTRY_URL }, on() {}, send() {}, setWindowOpenHandler() {}, openDevTools() {}, session: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } };
  record.webContents = wc;
  const w = new Proxy({ webContents: wc, isDestroyed: () => false, isMinimized: () => false }, { get(t, k) { return k in t ? t[k] : () => {}; } });
  class BrowserWindow { constructor() { return w; } static getAllWindows() { return []; } }
  return {
    app: { whenReady: () => Promise.resolve(), getPath: (n) => (n === 'userData' ? USER_DATA : HOME), setAppUserModelId() {}, on() {}, quit() {}, requestSingleInstanceLock() { throw new Error('no'); } },
    BrowserWindow,
    ipcMain: { handle(ch, fn) { record.handled.set(ch, fn); }, on(ch, fn) { record.on.set(ch, fn); } },
    shell: { openExternal: async () => {}, openPath: async () => {} },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
    safeStorage: { isEncryptionAvailable: () => false, encryptString: (s) => Buffer.from(s), decryptString: (b) => Buffer.from(b).toString() },
    clipboard: { readText: () => '', writeText: () => {} },
  };
}
const ptyStub = {
  spawn(file, args, opts) {
    record.spawnArgs.push({ file, args, cwd: opts && opts.cwd });
    return new Proxy({ onData() {}, onExit() {}, write() {}, resize() {}, kill() {}, pid: 4321 }, { get(t, k) { return k in t ? t[k] : () => {}; } });
  },
};
const realLoad = Module._load;
const prevProfile = process.env.USERPROFILE;
const prevBrowsers = process.env.PLAYWRIGHT_BROWSERS_PATH;
process.env.USERPROFILE = HOME;
const BROWSERS = path.join(FIX, 'ms-playwright');
process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS;
for (const k of Object.keys(process.env)) if (/^BLUE_HELM_ADMISSION_/i.test(k)) delete process.env[k];
Module._load = function (request) {
  if (request === 'electron') return electronStub();
  if (request === '@lydell/node-pty') return ptyStub;
  return realLoad.apply(this, arguments);
};

(async () => {
  require(path.join(__dirname, 'main.js'));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  Module._load = realLoad;
  const prepare = record.handled.get('page-reader-prepare');
  assert(typeof prepare === 'function', 'main registers page-reader-prepare');
  const good = { sender: record.webContents, senderFrame: record.webContents.mainFrame };
  const URL_OK = 'https://www.reddit.com/r/test/comments/abc/title/';

  const untrusted = await prepare({ sender: {}, senderFrame: {} }, { url: URL_OK });
  assert(untrusted.ok === false && untrusted.error === 'untrusted-sender', 'an untrusted sender is refused');
  const badUrl = await prepare(good, { url: 'http://www.reddit.com/' });
  assert(badUrl.ok === false && badUrl.error === pr.REASON.NOT_HTTPS, 'a non-https URL is refused before anything is written');
  assert(!fs.existsSync(path.join(USER_DATA, 'page-reader')), 'nothing was written for a refused URL');

  const mcpInstalled = fs.existsSync(path.join(__dirname, 'node_modules', '@playwright', 'mcp', 'cli.js'));
  if (!mcpInstalled) {
    const missing = await prepare(good, { url: URL_OK });
    assert(missing.ok === false && missing.error === 'page-reader-mcp-missing' && /npm ci/.test(missing.hint), 'without npm ci the launch refuses visibly with the fix');
  } else {
    const noBrowser = await prepare(good, { url: URL_OK });
    assert(noBrowser.ok === false && noBrowser.error === 'page-reader-browser-missing' && /playwright install chromium/.test(noBrowser.hint), 'without the browser the launch refuses visibly with the fix');
    fs.mkdirSync(path.join(BROWSERS, 'chromium-1234'), { recursive: true });
    const r = await prepare(good, { url: URL_OK });
    assert(r.ok === true && typeof r.dir === 'string', 'a good URL prepares a folder');
    const rel = path.relative(OUTPUTS, r.dir);
    assert(rel && !rel.startsWith('..') && !path.isAbsolute(rel) && path.basename(r.dir).indexOf('page-reader-') === 0, 'the folder is a fresh page-reader sandbox under the outputs root');
    const req = JSON.parse(fs.readFileSync(path.join(r.dir, pr.REQUEST_FILE), 'utf8'));
    assert(req.url === URL_OK, 'page-request.json holds the checked URL');
    const cfgPath = path.join(USER_DATA, 'page-reader', 'mcp.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    assert(cfg.mcpServers.playwright.args[0] === path.join(__dirname, 'node_modules', '@playwright', 'mcp', 'cli.js'), 'the MCP config starts the locked app dependency');
    assert(!fs.existsSync(path.join(r.dir, 'mcp.json')), 'the MCP config is not in the pane\'s writable folder');

    // pty-start with the deployed role and hook: the real command for the page-reader pane.
    const agents = path.join(HOME, '.claude', 'agents');
    const hooks = path.join(HOME, '.claude', 'hooks');
    fs.mkdirSync(agents, { recursive: true }); fs.mkdirSync(hooks, { recursive: true });
    fs.copyFileSync(HOOK_SRC, path.join(hooks, 'fence-write.js'));
    fs.writeFileSync(path.join(agents, 'page-reader.md'),
      fs.readFileSync(ROLE_SRC, 'utf8').replace('__CC_HOOK__', path.join(hooks, 'fence-write.js').replace(/\\/g, '/')));
    const ptyStart = record.handled.get('pty-start');
    const started = await ptyStart(good, { id: 'page-1', role: 'page-reader', cli: 'claude', cwd: r.dir, cols: 80, rows: 24 });
    if (started.ok !== true) process.stdout.write('  (pty-start refused: ' + started.error + ')\n');
    assert(started.ok === true, 'pty-start launches the page-reader pane in its folder');
    const spawn = record.spawnArgs[record.spawnArgs.length - 1];
    const cmd = spawn && spawn.args[spawn.args.indexOf('-Command') + 1];
    process.stdout.write('  command: ' + cmd + '\n');
    const expectPrefix = 'claude --agent page-reader "' + pr.OPENING_PROMPT + '" --disallowedTools Bash Glob NotebookEdit --mcp-config ' + pr.psQuote(cfgPath) + ' --strict-mcp-config --allowedTools ' + pr.psQuote(pr.MCP_TOOLS.join(','));
    assert(typeof cmd === 'string' && cmd.indexOf(expectPrefix) === 0, 'the command is the role, the fixed opening line, the denials, the one MCP config and the two tools, in that order');
    assert(/ --session-id [0-9a-f-]{36}$/.test(cmd), 'the main-minted session ID goes last');
    assert(cmd.indexOf('--permission-mode') === -1, 'no permission mode for a fenced role');
    const withPrompt = await ptyStart(good, { id: 'page-2', role: 'page-reader', cli: 'claude', cwd: r.dir, initialPrompt: '--settings=x', cols: 80, rows: 24 });
    assert(withPrompt.ok === false, 'a renderer-supplied opening prompt for page-reader is still refused');
    fs.writeFileSync(path.join(agents, 'web-scout.md'),
      fs.readFileSync(path.join(REPO, 'agent-roles', 'web-scout.md'), 'utf8').replace('__CC_HOOK__', path.join(hooks, 'fence-write.js').replace(/\\/g, '/')));
    const scout = await ptyStart(good, { id: 'scout-1', role: 'web-scout', cli: 'claude', cwd: r.dir, cols: 80, rows: 24 });
    assert(scout.ok === true, 'a web-scout pane still launches');
    const scoutSpawn = record.spawnArgs[record.spawnArgs.length - 1];
    const scoutCmd = scout.ok ? scoutSpawn.args[scoutSpawn.args.indexOf('-Command') + 1] : '';
    assert(scoutCmd.indexOf('--mcp-config') === -1 && scoutCmd.indexOf('mcp__') === -1, 'other roles get no MCP config or MCP tools');
  }

  // The launch command itself, through the real buildAgentCommand (pure; no fence files needed).
  const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const bStart = src.indexOf('function buildAgentCommand(');
  assert(bStart !== -1 && src.indexOf("launch.role === pageReaderMod.ROLE", bStart) !== -1, 'buildAgentCommand adds the page-reader arguments on the classified role only');
  const fences = src.match(/const FENCED_ROLES = new Set\(\[([^\]]*)\]\)/);
  assert(fences && /'page-reader'/.test(fences[1]), 'page-reader is a fenced role in main.js');

  if (prevProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevProfile;
  if (prevBrowsers === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH; else process.env.PLAYWRIGHT_BROWSERS_PATH = prevBrowsers;
  process.stdout.write('\npage-reader: ' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed ? 1 : 0);
})().catch((e) => { process.stderr.write('page-reader: crashed: ' + (e && e.stack || e) + '\n'); process.exit(1); });
