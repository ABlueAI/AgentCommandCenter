'use strict';
// Run: node app/repo-sanitizer.test.js
//
// Session S41, issue #172: this repository is public, so CI fails when a tracked file adds
//   1. a real home-folder path (it carries a user name),
//   2. an email address whose domain isn't on a short safe list, or
//   3. a high-confidence secret (a small backstop; GitHub push protection is the main guard).
// The home paths already in public history are allowlisted per file with exact counts (Blue,
// 2026-11-15: "Allowlist them"), so the list can only shrink.
//
// The patterns are adapted from ECC's opensource-sanitizer agent (ECC commit d2ef268,
// agents/opensource-sanitizer.md); nothing from it is copied.
//
// This file must not hold anything that matches its own rules: every fake path, address and
// secret below is joined from pieces at run time. Failure output names the rule and file:line
// only. It never prints a matched secret or address, and home paths are printed with the name
// masked, because CI logs on a public repository are public.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  \u2713 ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
function section(t) { process.stdout.write('\n' + t + '\n'); }

// ---- Rule 1: home-folder paths -------------------------------------------------------------

// Forms matched, case-insensitive: X:\Users\<user>, X:/Users/<user>, X:\\Users\\<user> (inside
// JS or JSON strings), \Users\<user> (a HOMEPATH value), /c/Users/<user> (Git Bash),
// file:///C:/Users/<user>, /home/<user> and /Users/<user> (macOS). The prefix must not come
// right after a host name or another path segment, so an API URL ending in users/<login> is not a
// home path.
const SEP = '(?:\\\\\\\\|\\\\|/)';
const HOME_PATH = new RegExp(
  '(' +
    '(?<![A-Za-z0-9])[A-Za-z]:' + // a drive letter
    '|(?<![A-Za-z0-9._~%/:\\\\-])/[A-Za-z](?=/users/)' + // Git Bash: /c/Users
    '|(?<![A-Za-z0-9._~%/:\\\\-])' + // nothing: \Users\<user>, /home/<user>, /Users/<user>
  ')' +
  '(' + SEP + '(?:users|home)' + SEP + ')' +
  "(<[^>\\s]{1,40}>|[A-Za-z0-9._$%{}-]+(?:'+[A-Za-z]+)?)",
  'gi');

// Names that are not a real person's: each with the reason it is safe.
const PLACEHOLDER_NAMES = {
  blue: 'the public handle the tests use as a fake name (an assumption, named in the PR TLDR)',
  example: 'fake name in tests',
  someone: 'fake name in tests',
  x: 'fake name in tests',
  real: 'fake name in tests ("a real path" fixture)',
  acceptance: 'fake name in tests',
  "o'neil": 'fake name in tests (quote-escaping fixture)',
  web_user: 'fake name in tests',
  sampleuser: 'the made-up name S41 switched the old test values to',
  user: 'generic placeholder',
  '<user>': 'generic placeholder in docs',
  you: 'generic placeholder',
  public: 'Windows shared profile, not a person',
  default: 'Windows default profile, not a person',
  runneradmin: 'the GitHub Actions Windows runner account',
};

function isPlaceholderName(name) {
  // A PowerShell single-quoted string doubles the quote (O''Neil).
  const key = name.toLowerCase().replace(/'+/g, "'");
  return Object.prototype.hasOwnProperty.call(PLACEHOLDER_NAMES, key);
}

// ---- Rule 2: email addresses ---------------------------------------------------------------

const EMAIL = /[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})(?![A-Za-z0-9-])/g;

// Domains that never belong to a person or business. A subdomain of one counts too.
const SAFE_EMAIL_DOMAINS = {
  'example.com': 'reserved for documentation (RFC 2606)',
  'example.org': 'reserved for documentation (RFC 2606)',
  'example.net': 'reserved for documentation (RFC 2606)',
  'users.noreply.github.com': "GitHub's no-reply commit addresses",
  'github.com': 'git@github.com remotes',
  'evil.com': 'the attacker host in URL-policy tests (https://example.com@evil.com/)',
};
// Reserved top-level names (RFC 2606): any *.example and *.invalid address is fake.
const SAFE_EMAIL_TLDS = ['example', 'invalid'];

function isSafeEmailDomain(domain) {
  const d = domain.toLowerCase();
  if (SAFE_EMAIL_TLDS.some((t) => d === t || d.endsWith('.' + t))) return true;
  return Object.keys(SAFE_EMAIL_DOMAINS).some((s) => d === s || d.endsWith('.' + s));
}

// ---- Rule 3: secret backstop (small on purpose) ---------------------------------------------

const DASH5 = '-'.repeat(5);
const SECRET_RULES = [
  ['private-key header', new RegExp(DASH5 + 'BEGIN [A-Z0-9 ]*PRIVATE KEY' + DASH5)],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9_]{36,}/],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{22,}/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
];

// ---- Scanning ------------------------------------------------------------------------------

// Returns { home: [{ line, masked }], email: [{ line }], secret: [{ line, rule }] }.
// `home` holds only names that aren't placeholders.
function scanText(text) {
  const out = { home: [], email: [], secret: [] };
  const lines = text.split('\n');
  lines.forEach((ln, i) => {
    for (const m of ln.matchAll(HOME_PATH)) {
      if (isPlaceholderName(m[3])) continue;
      out.home.push({ line: i + 1, masked: m[1] + m[2] + '<masked>' });
    }
    for (const m of ln.matchAll(EMAIL)) {
      if (!isSafeEmailDomain(m[1])) out.email.push({ line: i + 1 });
    }
    for (const [rule, re] of SECRET_RULES) {
      if (re.test(ln)) out.secret.push({ line: i + 1, rule });
    }
  });
  return out;
}

// Files with home paths already in public history: path -> [exact count, reason]. A higher
// count fails as a new mention; a lower one fails until the entry is lowered, so the list can
// only shrink. Paths use forward slashes, as `git ls-files` prints them.
const HISTORICAL_DOC = 'historical record (AGENTS.md "History"); already in public history';
const HOME_PATH_ALLOWLIST = {
  'docs/AUDIT-app-gate-reliability.md': [1, HISTORICAL_DOC],
  'docs/BUILDER-HANDOFF-backup-recovery-source-scout.md': [1, HISTORICAL_DOC],
  'docs/BUILDER-HANDOFF-dockview-prototype.md': [2, HISTORICAL_DOC],
  'docs/BUILDER-HANDOFF-fence-live-admission-refresh.md': [3, HISTORICAL_DOC],
  'docs/BUILDER-HANDOFF-mako-taskbar-identity.md': [1, HISTORICAL_DOC],
  'docs/BUILDER-HANDOFF-mako-visible-rename.md': [2, HISTORICAL_DOC],
  'docs/BUILDER-HANDOFF-p1-fenced-role-env-containment.md': [7, HISTORICAL_DOC],
  'docs/BUILDER-HANDOFF-pane-status-production.md': [3, HISTORICAL_DOC],
  'docs/BUILDER-HANDOFF-pane-status-prototype-a-claude.md': [1, HISTORICAL_DOC],
  'docs/BUILDER-HANDOFF-pane-status-source-scout.md': [2, HISTORICAL_DOC],
  'docs/BUILDER-HANDOFF-quick-links.md': [2, HISTORICAL_DOC],
  'docs/BUILDER-HANDOFF-sync-roles-deterministic-deploy.md': [3, HISTORICAL_DOC],
  'docs/OSS-PROCUREMENT-backup-recovery.md': [2, HISTORICAL_DOC],
  'docs/OSS-PROCUREMENT-pane-status.md': [6, HISTORICAL_DOC],
  'docs/PROTOTYPE-EVIDENCE-pane-status-claude-hook.md': [6, HISTORICAL_DOC],
  'docs/SMART-APP-CONTROL-AND-DISTRIBUTION.md': [1, HISTORICAL_DOC],
  'app/pane-status/pane-status-version.js': [7, 'comments recording the measured Claude install path'],
  'app/pane-status/pane-status-resolution.test.js': [1, 'a comment recording the measured Claude install path'],
};

// Compares per-file home-path counts with the allowlist. Returns a list of error strings that
// name files and counts only.
function checkAllowlist(counts, allowlist) {
  const errors = [];
  for (const [file, n] of Object.entries(counts)) {
    if (n === 0) continue;
    const entry = allowlist[file];
    if (!entry) continue; // reported per line by the caller
    if (n > entry[0]) errors.push(`${file}: ${n} home paths, allowlist says ${entry[0]}: a new mention was added`);
    if (n < entry[0]) errors.push(`${file}: ${n} home paths, allowlist says ${entry[0]}: lower the entry to ${n}`);
  }
  for (const [file, entry] of Object.entries(allowlist)) {
    if (!counts[file]) errors.push(`${file}: no home paths left, allowlist says ${entry[0]}: remove the entry`);
  }
  return errors;
}

// What the real scan leaves out, each with its reason.
const SKIPPED = [
  [(f) => f.startsWith('app/renderer/vendor/'), 'third-party minified bundles'],
  [(f) => /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(f),
    'lockfiles (generated; registry URLs and hashes only)'],
];
function isBinary(buf) { return buf.subarray(0, 8192).includes(0); }

// ---- Self-tests on in-memory text (nothing fake is ever written to the repository) ----------

const J = (...parts) => parts.join('');
const BS = '\\';
const FAKE = J('jq', 'zz', 'v'); // a made-up name that isn't a placeholder

section('home-folder paths: each form is caught');
{
  const cases = [
    ['drive with backslashes', J('C:', BS, 'Users', BS, FAKE, BS, 'x.txt')],
    ['drive with forward slashes', J('D:/Users/', FAKE, '/x')],
    ['escaped inside a JS string', J("'C:", BS, BS, 'Users', BS, BS, FAKE, "'")],
    ['HOMEPATH value', J('HOMEPATH=', BS, 'Users', BS, FAKE)],
    ['Git Bash', J('cd /c/Users/', FAKE, '/repo')],
    ['file URL', J('file:///C:/Users/', FAKE, '/a.html')],
    ['Linux home', J('ls /home/', FAKE, '/x')],
    ['macOS home', J('"/Users/', FAKE, '/Library"')],
    ['lower-case users', J('c:', BS, 'users', BS, FAKE)],
  ];
  for (const [label, text] of cases) {
    const r = scanText(text);
    assert(r.home.length === 1, `${label} is caught`);
  }
  const masked = scanText(J('C:', BS, 'Users', BS, FAKE, BS, 'x')).home[0];
  assert(masked && masked.masked.indexOf(FAKE) === -1 && /<masked>$/.test(masked.masked),
    'the report masks the name (' + (masked && masked.masked) + ')');
}

section('home-folder paths: near misses are not caught');
{
  const cases = [
    ['a placeholder name', J('C:', BS, 'Users', BS, 'example', BS, 'x')],
    ['a placeholder in another case', J('/home/Sampleuser/x')],
    ['a quoted placeholder name', J("'C:", BS, 'Users', BS, "O''Neil", BS, "x'")],
    ['a <user> placeholder', J('C:', BS, 'Users', BS, '<user>', BS, 'x')],
    ['an API URL', J('https://api.github.com/users/', FAKE)],
    ['a host then /home', J('https://example.com/home/', FAKE)],
    ['a nested path segment', J('/srv/data/home/', FAKE)],
  ];
  for (const [label, text] of cases) {
    assert(scanText(text).home.length === 0, `${label} is not a finding`);
  }
}

section('email addresses');
{
  const at = '@';
  assert(scanText(J('mail ', FAKE, at, FAKE, 'mail.com')).email.length === 1, 'a personal address is caught');
  assert(scanText(J(FAKE, at, 'business-', FAKE, '.co.uk')).email.length === 1, 'a business address is caught');
  for (const d of ['example.com', 'sub.example.org', 'users.noreply.github.com', 'github.com', 'fixture.example', 'x.invalid']) {
    assert(scanText(J('a', at, d)).email.length === 0, `an address at ${d} is safe`);
  }
  assert(scanText(J('actions/checkout', at, 'v4.1.1')).email.length === 0, 'an action version pin is not an address');
}

section('secret backstop');
{
  const A36 = 'A'.repeat(36);
  const cases = [
    ['private-key header', J(DASH5, 'BEGIN RSA PRIVATE KEY', DASH5)],
    ['AWS access key', J('AK', 'IA', 'Q'.repeat(16))],
    ['GitHub token', J('gh', 'p_', A36)],
    ['GitHub fine-grained token', J('github', '_pat_', 'B'.repeat(22))],
    ['JWT', J('ey', 'J', 'h'.repeat(12), '.ey', 'J', 'p'.repeat(12), '.', 's'.repeat(12))],
  ];
  for (const [rule, text] of cases) {
    const r = scanText(text);
    assert(r.secret.length === 1 && r.secret[0].rule === rule, `a planted ${rule} is caught`);
  }
  assert(scanText(J('gh', 'p_', 'A'.repeat(35))).secret.length === 0, 'a 35-character ghp_ string is not a token');
  assert(scanText(J(DASH5, 'BEGIN PUBLIC KEY', DASH5)).secret.length === 0, 'a public-key header is not a secret');
}

section('allowlist ratchet');
{
  const allow = { 'docs/a.md': [2, 'test'] };
  const more = checkAllowlist({ 'docs/a.md': 3 }, allow);
  assert(more.length === 1 && /new mention/.test(more[0]), 'one extra mention fails as a new mention');
  const fewer = checkAllowlist({ 'docs/a.md': 1 }, allow);
  assert(fewer.length === 1 && /lower the entry to 1/.test(fewer[0]), 'one fewer mention fails with "lower the entry"');
  const gone = checkAllowlist({}, allow);
  assert(gone.length === 1 && /remove the entry/.test(gone[0]), 'a file with none left fails with "remove the entry"');
  assert(checkAllowlist({ 'docs/a.md': 2 }, allow).length === 0, 'the exact count passes');
}

// ---- The real scan over every tracked file ---------------------------------------------------

section('real scan of every tracked file');
{
  const repoRoot = path.join(__dirname, '..');
  let files = [];
  try {
    files = execFileSync('git', ['-C', repoRoot, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0').filter(Boolean);
  } catch (e) {
    assert(false, 'git ls-files ran (' + e.message.split('\n')[0] + ')');
  }
  assert(files.length > 100, `git ls-files listed the tracked files (${files.length})`);
  assert(files.includes('app/repo-sanitizer.test.js'), 'the scan includes this test file itself');

  const counts = {};
  const problems = [];
  let scanned = 0, skipped = 0;
  for (const file of files) {
    if (SKIPPED.some(([skip]) => skip(file))) { skipped++; continue; }
    let buf;
    try {
      buf = fs.readFileSync(path.join(repoRoot, file));
    } catch (e) {
      problems.push(`${file}: could not be read (${e.code || e.message})`);
      continue;
    }
    if (isBinary(buf)) { skipped++; continue; }
    scanned++;
    const r = scanText(buf.toString('utf8'));
    counts[file] = r.home.length;
    if (!HOME_PATH_ALLOWLIST[file]) {
      for (const h of r.home) problems.push(`${file}:${h.line}: home-folder path ${h.masked}`);
    }
    for (const e of r.email) problems.push(`${file}:${e.line}: email address with a domain not on the safe list`);
    for (const s of r.secret) problems.push(`${file}:${s.line}: possible secret (${s.rule})`);
  }
  problems.push(...checkAllowlist(counts, HOME_PATH_ALLOWLIST));
  for (const p of problems) process.stderr.write('    ' + p + '\n');
  assert(problems.length === 0,
    `no new home paths, emails or secrets in ${scanned} files (${skipped} skipped: vendor, lockfiles, binaries)`);
  const allowed = Object.keys(HOME_PATH_ALLOWLIST).length;
  const total = Object.values(HOME_PATH_ALLOWLIST).reduce((a, [n]) => a + n, 0);
  assert(allowed === 18, `the allowlist holds the expected 18 files (${allowed}, ${total} mentions)`);
}

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
