'use strict';
// Licence guardrail (S57). Pure functions, no I/O: app/third-party-notices.test.js feeds them the
// real app/package-lock.json and THIRD-PARTY-NOTICES.md, plus planted samples.
//
// The rule: every npm package in the lockfile (dependencies and devDependencies, optional ones
// too) and every file in the notices' file tables must carry only licences on PERMISSIVE below,
// licences Mako can ship alongside its own MIT code with a notice. Anything else (GPL, AGPL,
// LGPL, MPL, a missing or unreadable licence, "SEE LICENSE IN ...") fails, unless that exact
// package or file, with that exact licence, is on the exception lists below. Each exception is
// named in THIRD-PARTY-NOTICES.md, and an exception that no longer matches anything fails too,
// so the lists can't rot. Adding an exception is a reviewed change to this file.
//
// The lockfile's `license` field is what each package's own package.json declares; npm copies it
// in when the lockfile is written. A package that declares one licence and ships files under
// another is not caught here (THIRD-PARTY-NOTICES.md "What is inside kokoro.web.js" is that case,
// found by hand).

// SPDX identifiers (https://spdx.org/licenses/) that need only a notice.
// OFL-1.1 (SIL Open Font License) joined on 2026-11-24 for S66's two fonts: it lets fonts be
// bundled and shipped with any software, needing only its notice and licence text alongside; its
// one restriction is that the font may not be sold by itself, which Mako never does.
const PERMISSIVE = new Set([
  '0BSD', 'Apache-2.0', 'BlueOak-1.0.0', 'BSD-2-Clause', 'BSD-3-Clause', 'CC0-1.0', 'ISC',
  'MIT', 'MIT-0', 'OFL-1.1', 'Unlicense', 'Zlib',
]);

// npm packages allowed despite a licence outside PERMISSIVE. Matched on the package name and the
// exact `license` string from the lockfile, so a licence change upstream fails again.
const LGPL_SHARP = 'libvips, LGPL-3.0-or-later, shipped by sharp as a separate prebuilt library '
  + 'that sharp loads at run time (not linked into Mako\'s code). sharp comes in through '
  + '@huggingface/transformers, as optional platform packages: npm installs only the one for the '
  + 'machine it runs on.';
const PACKAGE_EXCEPTIONS = [
  ['@img/sharp-libvips-darwin-arm64', 'LGPL-3.0-or-later'],
  ['@img/sharp-libvips-darwin-x64', 'LGPL-3.0-or-later'],
  ['@img/sharp-libvips-linux-arm', 'LGPL-3.0-or-later'],
  ['@img/sharp-libvips-linux-arm64', 'LGPL-3.0-or-later'],
  ['@img/sharp-libvips-linux-ppc64', 'LGPL-3.0-or-later'],
  ['@img/sharp-libvips-linux-riscv64', 'LGPL-3.0-or-later'],
  ['@img/sharp-libvips-linux-s390x', 'LGPL-3.0-or-later'],
  ['@img/sharp-libvips-linux-x64', 'LGPL-3.0-or-later'],
  ['@img/sharp-libvips-linuxmusl-arm64', 'LGPL-3.0-or-later'],
  ['@img/sharp-libvips-linuxmusl-x64', 'LGPL-3.0-or-later'],
  ['@img/sharp-wasm32', 'Apache-2.0 AND LGPL-3.0-or-later AND MIT'],
  ['@img/sharp-win32-arm64', 'Apache-2.0 AND LGPL-3.0-or-later'],
  ['@img/sharp-win32-ia32', 'Apache-2.0 AND LGPL-3.0-or-later'],
  ['@img/sharp-win32-x64', 'Apache-2.0 AND LGPL-3.0-or-later'],
].map(([name, licence]) => ({ name, licence, why: LGPL_SHARP }));

// Files in THIRD-PARTY-NOTICES.md's file tables allowed despite a non-permissive licence. Each
// lists the exact non-permissive licence ids its Licence cell may name: the cell must name all of
// them and nothing else outside PERMISSIVE, so a new or changed licence in that cell fails again.
const FILE_EXCEPTIONS = [
  {
    file: 'app/renderer/vendor/kokoro.web.js',
    licences: ['GPL-3.0-or-later'],
    why: 'Carries the eSpeak NG engine (GPL-3.0-or-later), recorded with its source in '
      + 'THIRD-PARTY-NOTICES.md by PR #168. Replacing it is a separate follow-up (STATUS.md).',
  },
];

// Words that mark a Licence cell in THIRD-PARTY-NOTICES.md as not (only) permissive, on top of
// the licence-id rule in checkNoticeRows (a net for licences written without an SPDX id).
const NON_PERMISSIVE_WORDS = /\b(?:A|L)?GPL|\b(?:MPL|EPL|CDDL|EUPL|SSPL|BUSL|OSL|CPAL|CC-BY-NC|CC-BY-SA)\b|copyleft|commons clause|proprietary|commercial|unknown|unlicensed|see licen[cs]e/i;

// --- SPDX expressions -------------------------------------------------------------------------
// Grammar (SPDX spec, annex D, without LicenseRef/DocumentRef, which are refused):
//   or   := and ('OR' and)*
//   and  := atom ('AND' atom)*
//   atom := '(' or ')' | id ['+'] ['WITH' exception-id]
// Returns { ok: true, permissive: bool } or { ok: false, error }. An expression is permissive
// when, after choosing the best side of each OR, every licence it needs is on PERMISSIVE. A
// `WITH` exception on SPDX_EXCEPTIONS only adds permissions, so it keeps its licence's verdict;
// any other WITH id (for example "Commons-Clause", which restricts) fails.
const SPDX_EXCEPTIONS = new Set([
  'LLVM-exception', 'Classpath-exception-2.0', 'GCC-exception-3.1', 'Autoconf-exception-3.0',
  'Bison-exception-2.2', 'Font-exception-2.0', 'OpenJDK-assembly-exception-1.0',
]);
function parseSpdx(expr) {
  if (typeof expr !== 'string' || !expr.trim()) return { ok: false, error: 'no licence declared' };
  const tokens = expr.match(/\(|\)|[^\s()]+/g) || [];
  let i = 0;
  const peek = () => tokens[i];
  const fail = (msg) => { throw new Error(msg); };
  function parseOr() {
    let v = parseAnd();
    while (peek() === 'OR') { i++; const r = parseAnd(); v = v || r; }
    return v;
  }
  function parseAnd() {
    let v = parseAtom();
    while (peek() === 'AND') { i++; const r = parseAtom(); v = v && r; }
    return v;
  }
  function parseAtom() {
    const t = tokens[i++];
    if (t === undefined) fail('expression ends early');
    if (t === '(') {
      const v = parseOr();
      if (tokens[i++] !== ')') fail('missing )');
      return v;
    }
    if (t === ')' || t === 'AND' || t === 'OR' || t === 'WITH') fail(`unexpected "${t}"`);
    if (!/^[A-Za-z0-9][A-Za-z0-9.-]*\+?$/.test(t)) fail(`"${t}" is not an SPDX licence id`);
    if (/^(LicenseRef|DocumentRef)-/.test(t)) fail(`"${t}" is a custom licence reference`);
    if (peek() === 'WITH') {
      i++;
      const ex = tokens[i++];
      if (!ex || !SPDX_EXCEPTIONS.has(ex)) fail(`WITH "${ex === undefined ? '' : ex}" is not a known SPDX exception`);
    }
    return PERMISSIVE.has(t.replace(/\+$/, ''));
  }
  try {
    const permissive = parseOr();
    if (i !== tokens.length) fail(`unexpected "${tokens[i]}"`);
    return { ok: true, permissive };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// --- npm lockfile -----------------------------------------------------------------------------
// lock: the parsed app/package-lock.json (lockfileVersion 2 or 3, which have `packages`).
// Returns { problems: [string], checked: number, usedExceptions: Set<name> }.
function checkLockfile(lock, exceptions = PACKAGE_EXCEPTIONS) {
  const problems = [];
  const used = new Set();
  let checked = 0;
  if (!lock || typeof lock.packages !== 'object' || lock.packages === null) {
    return { problems: ['the lockfile has no "packages" map (lockfileVersion 2 or later needed)'], checked, usedExceptions: used };
  }
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key === '') {
      // Mako itself.
      if (entry.license !== 'MIT') problems.push(`the root package declares "${entry.license}", not MIT`);
      continue;
    }
    if (entry.link) continue; // a symlink to a workspace folder; its own entry is checked
    checked++;
    // The install path names the package; `name` can differ for an npm: alias, so exceptions
    // match on the path only.
    const at = key.lastIndexOf('node_modules/');
    const name = at < 0 ? key : key.slice(at + 'node_modules/'.length);
    const licence = entry.license;
    const parsed = parseSpdx(licence);
    if (parsed.ok && parsed.permissive) continue;
    const ex = exceptions.find((x) => x.name === name);
    if (ex && ex.licence === licence) { used.add(name); continue; }
    const what = parsed.ok ? `"${licence}" is not on the permissive list` : `licence ${JSON.stringify(licence === undefined ? '' : licence)} can't be read (${parsed.error})`;
    const exNote = ex ? ` (its exception is for "${ex.licence}")` : '';
    problems.push(`npm package ${name}@${entry.version || '?'} (${key}): ${what}${exNote}`);
  }
  for (const ex of exceptions) {
    if (!used.has(ex.name)) problems.push(`stale exception: no package ${ex.name} with licence "${ex.licence}" in the lockfile`);
  }
  return { problems, checked, usedExceptions: used };
}

// --- THIRD-PARTY-NOTICES.md file tables -------------------------------------------------------
// Finds every markdown table whose header has a Licence column (a cell starting "Licence" or
// "License"), other than the npm-package table, and returns [{ file, licence }] for its rows.
// A row whose first cell isn't exactly one backticked path is returned with file: null, so the
// check can fail it instead of skipping it.
function noticeTables(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const tables = [];
  for (let n = 0; n < lines.length; n++) {
    if (!lines[n].startsWith('|') || !/^\|[\s|:-]+\|$/.test((lines[n + 1] || '').trim())) continue;
    const header = splitRow(lines[n]);
    const rows = [];
    let m = n + 2;
    for (; m < lines.length && lines[m].startsWith('|'); m++) rows.push(splitRow(lines[m]));
    tables.push({ header, rows });
    n = m - 1;
  }
  return tables;
}
function noticeFileRows(md) {
  const out = [];
  for (const { header, rows } of noticeTables(md)) {
    const col = header.findIndex((h) => /^licen[cs]e\b/i.test(h));
    if (col < 0 || header[0] === 'npm package') continue;
    // The kokoro component table names bundle parts, not files; its first header says so.
    if (/^Component/.test(header[0])) continue;
    for (const cells of rows) {
      const file = /^`([^`]+)`$/.exec(cells[0] || '');
      out.push({ file: file ? file[1] : null, first: cells[0] || '', licence: cells[col] || '' });
    }
  }
  return out;
}
// The npm-package table: [{ name, version, licence }] (header "npm package | Version | Licence...").
function noticeNpmRows(md) {
  const t = noticeTables(md).find(({ header }) => header[0] === 'npm package');
  if (!t) return null;
  const vcol = t.header.indexOf('Version');
  const lcol = t.header.findIndex((h) => /^licen[cs]e\b/i.test(h));
  return t.rows.map((c) => ({ name: (/^`([^`]+)`$/.exec(c[0] || '') || [])[1] || c[0], version: c[vcol], licence: c[lcol] }));
}
function splitRow(line) {
  // Cells never contain a literal "|" in this file; links use (...) and code uses backticks.
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

// Licence ids in a cell: SPDX-shaped tokens (an upper-case letter or digit, then at least one
// hyphenated part, such as GPL-3.0-only, MS-RL, CC-BY-ND-4.0, Commons-Clause), bare ids on
// PERMISSIVE (MIT, ISC, ...), and any other bare token starting with an upper-case letter or
// digit that sits next to an SPDX operator (AND, OR, WITH, in any case), so the JSON in
// "MIT AND JSON" counts as an id. Every one must be on PERMISSIVE: deny by default.
const SPDX_OPERATOR = /^(?:and|or|with)$/i;
function licenceIds(text) {
  const tokens = text.match(/[A-Za-z0-9][A-Za-z0-9.+-]*/g) || [];
  const nextToOperator = (i) => SPDX_OPERATOR.test(tokens[i - 1] || '') || SPDX_OPERATOR.test(tokens[i + 1] || '');
  return tokens.filter((t, i) => !SPDX_OPERATOR.test(t) && (PERMISSIVE.has(t)
    || /^[A-Z0-9][A-Za-z0-9.+]*(?:-[A-Za-z0-9.+]+)+$/.test(t)
    || (/^[A-Z0-9]/.test(t) && nextToOperator(i))))
    .map((t) => t.replace(/[.]+$/, ''));
}

function checkNoticeRows(rows, exceptions = FILE_EXCEPTIONS) {
  const problems = [];
  const used = new Set();
  for (const { file, first, licence } of rows) {
    if (!file) { problems.push(`notices row "${first}": the first cell must be one backticked file path`); continue; }
    const text = licence.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'); // keep link text, drop the target
    const ids = licenceIds(text);
    const bad = [...new Set(ids.filter((t) => !PERMISSIVE.has(t)))].sort();
    const hasPermissive = ids.some((t) => PERMISSIVE.has(t));
    const ex = exceptions.find((x) => x.file === file);
    const allowed = ex ? [...ex.licences].sort() : [];
    // Words outside the id rule, checked with the exception's own ids taken out.
    let rest = text;
    for (const a of allowed) rest = rest.split(a).join('');
    const badWord = NON_PERMISSIVE_WORDS.test(rest);
    if (hasPermissive && !bad.length && !badWord) continue;
    if (ex && hasPermissive && !badWord && JSON.stringify(bad) === JSON.stringify(allowed)) { used.add(file); continue; }
    const why = bad.length ? `names ${bad.join(', ')}, not on the permissive list`
      : badWord ? 'has a word that marks a non-permissive licence' : 'names no permissive SPDX licence';
    problems.push(`notices row ${file}: licence "${text.trim()}" ${why}`
      + (ex ? ` (its exception allows exactly ${allowed.join(', ')})` : ''));
  }
  for (const ex of exceptions) {
    if (!used.has(ex.file)) problems.push(`stale file exception: no row for ${ex.file} naming exactly ${ex.licences.join(', ')} outside the permissive list`);
  }
  return problems;
}

// The npm-package table must list exactly the package exceptions, each with its pinned licence
// and the version the lockfile installs.
function checkNoticeNpmTable(npmRows, lock, exceptions = PACKAGE_EXCEPTIONS) {
  if (!npmRows) return ['THIRD-PARTY-NOTICES.md has no "npm package" table'];
  const problems = [];
  const versionOf = (name) => {
    const e = lock && lock.packages && lock.packages['node_modules/' + name];
    return e ? e.version : undefined;
  };
  for (const ex of exceptions) {
    const r = npmRows.find((x) => x.name === ex.name);
    if (!r) { problems.push(`npm exception ${ex.name} has no row in THIRD-PARTY-NOTICES.md`); continue; }
    if (r.licence !== ex.licence) problems.push(`notices npm row ${ex.name}: licence "${r.licence}", exception pins "${ex.licence}"`);
    if (r.version !== versionOf(ex.name)) problems.push(`notices npm row ${ex.name}: version ${r.version}, lockfile has ${versionOf(ex.name)}`);
  }
  for (const r of npmRows) {
    if (!exceptions.some((ex) => ex.name === r.name)) problems.push(`notices npm row ${r.name} is not a package exception (stale row)`);
  }
  if (new Set(npmRows.map((r) => r.name)).size !== npmRows.length) problems.push('a package has two rows in the notices npm table');
  return problems;
}

module.exports = {
  PERMISSIVE, PACKAGE_EXCEPTIONS, FILE_EXCEPTIONS,
  parseSpdx, checkLockfile, noticeFileRows, checkNoticeRows, noticeNpmRows, checkNoticeNpmTable,
};
