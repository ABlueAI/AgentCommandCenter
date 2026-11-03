'use strict';
// S15 PAGE READER (Blue's verdict 2026-11-03, docs/decisions/OSS-research-capture.md: ADOPT
// Playwright MCP). Everything the page-reader pane is launched with comes from here, MAIN-OWNED:
// the URL check, the request file main writes into the pane's fenced outputs folder, the MCP config
// (one pinned Playwright MCP server, two tools), the CLI arguments and the fixed opening line.
//
// No renderer value reaches the command line. The URL Blue gives is checked here and written to a
// JSON file in the fresh outputs folder; the pane reads that file. Renderer-supplied opening prompts
// stay refused for every fenced role (pty-launch-classify.js).
//
// Pure apart from the `path` module: no Electron, filesystem, process or spawning.

const path = require('path');

const ROLE = 'page-reader';

// The MCP server's name in the config. Claude Code names its tools mcp__<server>__<tool>.
const MCP_SERVER = 'playwright';

// THE ONLY TWO BROWSER TOOLS. Navigate to a page; read it as an accessibility snapshot. Everything
// else Playwright MCP offers (click, type, fill, evaluate, upload, screenshot, tabs, file output) is
// left out. scripts/hooks/fence-write.js carries the same two literals (it is deployed standalone and
// cannot require this module); page-reader.test.js holds them equal.
const MCP_TOOLS = Object.freeze([
  'mcp__playwright__browser_navigate',
  'mcp__playwright__browser_snapshot',
]);

// Pinned exactly in app/package.json and package-lock.json; page-reader.test.js holds them equal.
const PLAYWRIGHT_MCP_VERSION = '0.0.84';

const MAX_URL_LENGTH = 2000;
const REQUEST_FILE = 'page-request.json';
const REPORT_FILE = 'report.md';

// Fixed opening line. No renderer text is ever appended. It must not start with `-`, and it holds
// no character that is significant inside the double-quoted PowerShell -Command argument.
const OPENING_PROMPT = 'Read ./' + REQUEST_FILE + ' and follow your role instructions for that page.';

const REASON = Object.freeze({
  NOT_STRING: 'page-url-not-string',
  EMPTY: 'page-url-empty',
  TOO_LONG: 'page-url-too-long',
  UNPARSEABLE: 'page-url-unparseable',
  NOT_HTTPS: 'page-url-not-https',
  CREDENTIALS: 'page-url-has-credentials',
  WHITESPACE: 'page-url-has-whitespace-or-control',
});

/**
 * validatePageUrl(raw) -> { ok:true, url } | { ok:false, reason }
 *
 * `https:` only, no user name or password, no whitespace or control characters, at most
 * MAX_URL_LENGTH characters, parsed by WHATWG `URL`. Returns the parser's normalized href.
 */
function validatePageUrl(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: REASON.NOT_STRING };
  const s = raw.trim();
  if (s === '') return { ok: false, reason: REASON.EMPTY };
  if (s.length > MAX_URL_LENGTH) return { ok: false, reason: REASON.TOO_LONG };
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(s)) return { ok: false, reason: REASON.WHITESPACE };
  let u;
  try { u = new URL(s); } catch (e) { return { ok: false, reason: REASON.UNPARSEABLE }; }
  if (u.protocol !== 'https:') return { ok: false, reason: REASON.NOT_HTTPS };
  if (u.username !== '' || u.password !== '') return { ok: false, reason: REASON.CREDENTIALS };
  if (u.href.length > MAX_URL_LENGTH) return { ok: false, reason: REASON.TOO_LONG };
  return { ok: true, url: u.href };
}

/** The request file's text: the checked URL and nothing else. */
function buildPageRequest(url) {
  return JSON.stringify({ url: url }, null, 2) + '\n';
}

/**
 * buildMcpConfig({ cliPath, profileDir }) -> the MCP config object for `--mcp-config`.
 *
 * Arguments are fixed: Chromium, one persistent profile, visible (no --headless), stdio only (no
 * --port or --host, so no network listener), and no --allow-unrestricted-file-access (file:// pages
 * stay blocked and Playwright's own file access stays in the workspace, the outputs folder).
 */
function buildMcpConfig(input) {
  const i = input || {};
  if (typeof i.cliPath !== 'string' || !path.isAbsolute(i.cliPath)) throw new Error('page-reader: cliPath must be absolute');
  if (typeof i.profileDir !== 'string' || !path.isAbsolute(i.profileDir)) throw new Error('page-reader: profileDir must be absolute');
  return {
    mcpServers: {
      [MCP_SERVER]: {
        type: 'stdio',
        command: 'node',
        args: [i.cliPath, '--browser', 'chromium', '--user-data-dir', i.profileDir],
      },
    },
  };
}

// Single-quoted PowerShell literal: only `'` is special, and it is escaped by doubling.
function psQuote(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

/**
 * pageReaderCliArgs(mcpConfigPath) -> the argument text appended after `claude --agent page-reader`.
 *
 * The opening line comes FIRST, before any variadic option (`--disallowedTools`, `--mcp-config` and
 * `--allowedTools` each take several values and would otherwise swallow it). `--strict-mcp-config`
 * loads only this config, so no user or project MCP server joins the pane. `--allowedTools` names the
 * two tools so they run without a permission dialog under CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1.
 */
function pageReaderCliArgs(mcpConfigPath) {
  if (typeof mcpConfigPath !== 'string' || !path.isAbsolute(mcpConfigPath)) {
    throw new Error('page-reader: mcpConfigPath must be absolute');
  }
  return {
    prompt: ' "' + OPENING_PROMPT + '"',
    options: ' --mcp-config ' + psQuote(mcpConfigPath) + ' --strict-mcp-config --allowedTools ' + psQuote(MCP_TOOLS.join(',')),
  };
}

module.exports = {
  ROLE,
  MCP_SERVER,
  MCP_TOOLS,
  PLAYWRIGHT_MCP_VERSION,
  MAX_URL_LENGTH,
  REQUEST_FILE,
  REPORT_FILE,
  OPENING_PROMPT,
  REASON,
  validatePageUrl,
  buildPageRequest,
  buildMcpConfig,
  psQuote,
  pageReaderCliArgs,
};
