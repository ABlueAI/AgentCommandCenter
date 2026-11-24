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
const PERMISSIVE = new Set([
  '0BSD', 'Apache-2.0', 'BlueOak-1.0.0', 'BSD-2-Clause', 'BSD-3-Clause', 'CC0-1.0', 'ISC',
  'MIT', 'MIT-0', 'Unlicense', 'Zlib',
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
// names a word that must stay in its Licence cell, so the row keeps saying what it is.
const FILE_EXCEPTIONS = [
  {
    file: 'app/renderer/vendor/kokoro.web.js',
    mustName: 'GPL-3.0-or-later',
    why: 'Carries the eSpeak NG engine (GPL-3.0-or-later), recorded with its source in '
      + 'THIRD-PARTY-NOTICES.md by PR #168. Replacing it is a separate follow-up (STATUS.md).',
  },
];

// Words that mark a Licence cell in THIRD-PARTY-NOTICES.md as not (only) permissive.
const NON_PERMISSIVE_WORDS = /\b(?:A|L)?GPL|\b(?:MPL|EPL|CDDL|EUPL|SSPL|BUSL|OSL|CPAL|CC-BY-NC|CC-BY-SA)\b|copyleft|commons clause|proprietary|commercial|unknown|unlicensed|see licen[cs]e/i;

// --- SPDX expressions -------------------------------------------------------------------------
// Grammar (SPDX spec, annex D, without LicenseRef/DocumentRef, which are refused):
//   or   := and ('OR' and)*
//   and  := atom ('AND' atom)*
//   atom := '(' or ')' | id ['+'] ['WITH' exception-id]
// Returns { ok: true, permissive: bool } or { ok: false, error }. An expression is permissive
// when, after choosing the best side of each OR, every licence it needs is on PERMISSIVE. A
// `WITH` exception only adds permissions, so it never changes the verdict of its licence.
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
      if (!ex || !/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(ex)) fail('WITH needs an exception id');
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
    const name = entry.name || key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const licence = entry.license;
    const parsed = parseSpdx(licence);
    if (parsed.ok && parsed.permissive) continue;
    const ex = exceptions.find((x) => x.name === name);
    if (ex && ex.licence === licence) { used.add(name); continue; }
    const what = parsed.ok ? `"${licence}" is not on the permissive list` : `licence "${licence === undefined ? '' : licence}" can't be read (${parsed.error})`;
    const exNote = ex ? ` (its exception is for "${ex.licence}")` : '';
    problems.push(`npm package ${name}@${entry.version || '?'} (${key}): ${what}${exNote}`);
  }
  for (const ex of exceptions) {
    if (!used.has(ex.name)) problems.push(`stale exception: no package ${ex.name} with licence "${ex.licence}" in the lockfile`);
  }
  return { problems, checked, usedExceptions: used };
}

// --- THIRD-PARTY-NOTICES.md file tables -------------------------------------------------------
// Finds every markdown table whose header has a "Licence" column and whose rows start with a
// backticked path, and returns [{ file, licence }].
function noticeFileRows(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const rows = [];
  for (let n = 0; n < lines.length; n++) {
    if (!lines[n].startsWith('|') || !/^\|[\s|:-]+\|$/.test((lines[n + 1] || '').trim())) continue;
    const header = splitRow(lines[n]);
    const col = header.findIndex((h) => h === 'Licence');
    if (col < 0) continue;
    for (let m = n + 2; m < lines.length && lines[m].startsWith('|'); m++) {
      const cells = splitRow(lines[m]);
      const file = /^`([^`]+)`$/.exec(cells[0] || '');
      if (file) rows.push({ file: file[1], licence: cells[col] || '' });
    }
  }
  return rows;
}
function splitRow(line) {
  // Cells never contain a literal "|" in this file; links use (...) and code uses backticks.
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function checkNoticeRows(rows, exceptions = FILE_EXCEPTIONS) {
  const problems = [];
  const used = new Set();
  for (const { file, licence } of rows) {
    const text = licence.replace(/\[[^\]]*\]\([^)]*\)/g, ''); // drop "[text](LICENSES/...)" links
    const ids = (text.match(/[A-Za-z0-9][A-Za-z0-9.+-]*/g) || []).filter((t) => PERMISSIVE.has(t));
    const nonPermissive = NON_PERMISSIVE_WORDS.test(text);
    if (ids.length && !nonPermissive) continue;
    const ex = exceptions.find((x) => x.file === file);
    if (ex && text.includes(ex.mustName)) { used.add(file); continue; }
    problems.push(`notices row ${file}: licence "${text.trim()}" ${ids.length ? 'names a licence that is not permissive' : 'names no permissive SPDX licence'}`
      + (ex ? ` (its exception needs the cell to name ${ex.mustName})` : ''));
  }
  for (const ex of exceptions) {
    if (!used.has(ex.file)) problems.push(`stale file exception: ${ex.file} has no non-permissive row naming ${ex.mustName}`);
  }
  return problems;
}

module.exports = {
  PERMISSIVE, PACKAGE_EXCEPTIONS, FILE_EXCEPTIONS,
  parseSpdx, checkLockfile, noticeFileRows, checkNoticeRows,
};
