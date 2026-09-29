'use strict';
// Run: node app/role-frontmatter.test.js
//
// BOUNDED GRAMMAR SUITE. Proves the parser reads the hooks block as a STRUCTURE (which entry owns
// which matcher and which command) rather than as whole-file substrings, and that every construct it
// does not support REFUSES instead of being silently reinterpreted.

const fs = require('fs');
const path = require('path');
const { parseRoleFrontmatter, REASON } = require('./role-frontmatter');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  \u2713 ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
function section(t) { process.stdout.write('\n' + t + '\n'); }

const ROLES_DIR = path.join(__dirname, '..', 'agent-roles');
const HOOK = 'C:/Users/x/.claude/hooks/fence-write.js';

function role(opts) {
  const o = opts || {};
  const lines = ['---', 'name: ' + (o.name || 'web-scout'), 'description: d'];
  // `=== undefined`, not `||`: an EMPTY tools value is a distinct case under test and must not be
  // silently replaced by the default list.
  if (o.tools !== null) lines.push('tools: ' + (o.tools === undefined ? 'WebSearch, WebFetch, Read, Write' : o.tools));
  lines.push('model: sonnet');
  if (o.hooks !== null) lines.push(o.hooks !== undefined ? o.hooks : [
    'hooks:',
    '  PreToolUse:',
    '    - matcher: "Read|Write|Edit|MultiEdit"',
    '      hooks:',
    '        - type: command',
    '          command: "node \\"' + HOOK + '\\""',
  ].join('\n'));
  lines.push('---', '', 'Body text.');
  return lines.join('\n');
}

section('REAL TRACKED ROLES ALL PARSE (positive control)');
for (const r of ['web-scout', 'operator', 'source-scout', 'builder', 'reviewer', 'codebase-scout']) {
  const p = parseRoleFrontmatter(fs.readFileSync(path.join(ROLES_DIR, r + '.md'), 'utf8'));
  assert(p.ok && p.name === r, 'parses with frontmatter name === ' + r);
  assert(p.ok && p.toolsDeclared && p.tools.length > 0, r + ' declares a non-empty tools list');
}
{
  const ws = parseRoleFrontmatter(fs.readFileSync(path.join(ROLES_DIR, 'web-scout.md'), 'utf8'));
  assert(ws.events.PreToolUse.length === 1, 'web-scout has exactly one PreToolUse entry');
  // MOVED (controlled WebFetch): web-scout's single matcher also routes WebFetch to the fence hook's
  // origin gate. Previous expectation: 'Read|Write|Edit|MultiEdit'.
  assert(ws.events.PreToolUse[0].matcher === 'Read|Write|Edit|MultiEdit|WebFetch', 'its matcher is read structurally');
  assert(ws.events.PreToolUse[0].hooks[0].type === 'command', 'its hook type is read structurally');
  // A PLAIN scalar may carry interior quotes; codebase-scout's tracked description does. Refusing
  // that would false-refuse a real deployed role and, because resolution parses every sibling in a
  // directory, would refuse launches for an unrelated role.
  const cs = parseRoleFrontmatter(fs.readFileSync(path.join(ROLES_DIR, 'codebase-scout.md'), 'utf8'));
  assert(cs.ok && cs.scalars.description.indexOf('"') !== -1,
    'a plain scalar containing interior quotes parses (codebase-scout description)');
}

section('STRUCTURAL BINDING \u2014 the block is not a bag of substrings');
{
  const multi = parseRoleFrontmatter(role({ hooks: [
    'hooks:',
    '  PreToolUse:',
    '    - matcher: "Read"',
    '      hooks:',
    '        - type: command',
    '          command: "node \\"C:/other.js\\""',
    '    - matcher: "Read|Write"',
    '      hooks:',
    '        - type: command',
    '          command: "node \\"' + HOOK + '\\""',
  ].join('\n') }));
  assert(multi.ok && multi.events.PreToolUse.length === 2, 'two PreToolUse entries are kept separate');
  assert(multi.events.PreToolUse[0].hooks[0].command.indexOf('other.js') !== -1
      && multi.events.PreToolUse[1].hooks[0].command.indexOf('fence-write.js') !== -1,
    'each matcher stays bound to ITS OWN command, not the first one in the file');
}
{
  const post = parseRoleFrontmatter(role({ hooks: [
    'hooks:',
    '  PreToolUse: []',
    '  PostToolUse:',
    '    - matcher: "Read|Write"',
    '      hooks:',
    '        - type: command',
    '          command: "node \\"' + HOOK + '\\""',
  ].join('\n') }));
  assert(post.ok, 'the PostToolUse counterexample parses');
  assert(Array.isArray(post.events.PreToolUse) && post.events.PreToolUse.length === 0,
    'and its PreToolUse is observed as EMPTY, not as "PreToolUse appears in the file"');
  assert(post.events.PostToolUse.length === 1, 'the fence command is correctly attributed to PostToolUse');
}

section('REFUSALS \u2014 unsupported structures are never guessed at');
const refusals = [
  ['no frontmatter', 'just a document\n', REASON.NO_FRONTMATTER],
  ['unterminated frontmatter', '---\nname: x\n', REASON.UNTERMINATED],
  ['duplicate key', '---\nname: a\nname: b\n---\n', REASON.DUPLICATE_KEY],
  ['name absent (documentation)', '---\ndescription: d\n---\n', REASON.NAME_ABSENT],
  ['name starting with a hyphen', '---\nname: -bad\n---\n', REASON.NAME_INVALID],
  ['name containing a colon', '---\nname: a:b\n---\n', REASON.NAME_INVALID],
  ['uppercase name', '---\nname: WebScout\n---\n', REASON.NAME_INVALID],
  ['block scalar value', '---\nname: a\ndescription: |\n  text\n---\n', REASON.UNSUPPORTED_VALUE],
  ['flow sequence tools', '---\nname: a\ntools: [Read, Write]\n---\n', REASON.UNSUPPORTED_VALUE],
  ['anchor value', '---\nname: a\ndescription: &anchor x\n---\n', REASON.UNSUPPORTED_VALUE],
  ['half-quoted value', '---\nname: a\ndescription: "unclosed\n---\n', REASON.UNSUPPORTED_VALUE],
  ['nesting outside hooks', '---\nname: a\nmeta:\n  sub: 1\n---\n', REASON.UNSUPPORTED_STRUCTURE],
  ['non-text input', null, REASON.NOT_TEXT],
];
for (const [label, text, expected] of refusals) {
  const r = parseRoleFrontmatter(text);
  assert(r.ok === false && r.reason === expected, 'refuses ' + label + ' (' + expected + ')');
}
{
  const badTool = parseRoleFrontmatter(role({ tools: 'Read, We!rd' }));
  assert(!badTool.ok && badTool.reason === REASON.UNSUPPORTED_VALUE, 'refuses a malformed tool token');
  const blockList = parseRoleFrontmatter(role({ hooks: 'hooks:\n  PreToolUse:\n    - Read\n' }));
  assert(!blockList.ok && blockList.reason === REASON.UNSUPPORTED_HOOKS_GRAMMAR,
    'refuses a PreToolUse entry that is not the supported matcher/hooks shape');
  const noHookList = parseRoleFrontmatter(role({ hooks: [
    'hooks:', '  PreToolUse:', '    - matcher: "Read"', '      hooks:',
  ].join('\n') }));
  assert(!noHookList.ok && noHookList.reason === REASON.UNSUPPORTED_HOOKS_GRAMMAR,
    'refuses an entry whose hooks list is empty');
  const offGrid = parseRoleFrontmatter(role({ hooks: [
    'hooks:', '   PreToolUse:', '    - matcher: "Read"',
  ].join('\n') }));
  assert(!offGrid.ok && offGrid.reason === REASON.UNSUPPORTED_HOOKS_GRAMMAR, 'refuses off-grid indentation');
}

section('TOOLS DECLARATION');
{
  const omitted = parseRoleFrontmatter(role({ tools: null }));
  assert(omitted.ok && omitted.toolsDeclared === false,
    'an OMITTED tools key is reported as not-declared (the loader would inherit ALL tools)');
  const empty = parseRoleFrontmatter(role({ tools: '' }));
  assert(empty.ok && empty.toolsDeclared === true && empty.tools.length === 0,
    'an EMPTY tools value is declared-but-empty, distinct from omitted');
  const dis = parseRoleFrontmatter('---\nname: a\ntools: Read\ndisallowedTools: Bash\n---\n');
  assert(dis.ok && dis.disallowedTools[0] === 'Bash', 'disallowedTools is parsed (never used to grant)');
}
{
  const bom = '\uFEFF' + role({});
  assert(parseRoleFrontmatter(bom).ok === true, 'a UTF-8 BOM before the opening --- still parses');
  assert(parseRoleFrontmatter(role({}).replace(/\n/g, '\r\n')).ok === true, 'CRLF line endings parse');
}

process.stdout.write('\nrole-frontmatter: ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
