'use strict';
// BOUNDED ROLE-FRONTMATTER GRAMMAR.
//
// This is deliberately NOT a YAML parser and must never become one. It accepts exactly the shape
// `scripts/sync-roles.ps1` deploys and REFUSES everything else, so an unrecognised construct can
// never be silently reinterpreted into a weaker meaning. No dependency; the OSS procurement gate
// does not reopen for an accept-list of this size.
//
// WHY THE HOOKS BLOCK CANNOT STAY OPAQUE. The pre-existing `verify-fence` checks were whole-file
// regexes with no structural binding: a `PreToolUse` test matches the literal anywhere, the
// `command:` regex matches anywhere INCLUDING under `PostToolUse`, and the matcher regex returns the
// FIRST matcher in the file regardless of which block owns it. An independent probe confirmed three
// synthetic roles all returned ok:true, including one whose fence command sat under `PostToolUse`
// with an empty `PreToolUse` list. So the block is parsed as a real structure here.
//
// Pure: no filesystem, process, Electron, or logging.

const REASON = Object.freeze({
  NOT_TEXT: 'frontmatter-not-text',
  NO_FRONTMATTER: 'frontmatter-missing',
  UNTERMINATED: 'frontmatter-unterminated',
  DUPLICATE_KEY: 'frontmatter-duplicate-key',
  UNSUPPORTED_STRUCTURE: 'frontmatter-unsupported-structure',
  UNSUPPORTED_VALUE: 'frontmatter-unsupported-value',
  UNSUPPORTED_HOOKS_GRAMMAR: 'frontmatter-unsupported-hooks-grammar',
  // Distinct from NAME_INVALID on purpose: a file with NO `name` key is documented as being treated
  // as documentation and skipped by the loader, so resolution skips it too. A file that HAS a name
  // which is malformed is a different thing and refuses.
  NAME_ABSENT: 'frontmatter-name-absent',
  NAME_INVALID: 'frontmatter-name-invalid',
});

// Scalars that would change meaning if we guessed: block scalars, anchors/aliases, flow
// collections, and tags. All refuse rather than parse.
const UNSUPPORTED_VALUE_LEAD = /^[|>&*!\[{]/;

const BOM = '﻿';

function unquote(raw) {
  const s = String(raw).trim();
  if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
    const inner = s.slice(1, -1);
    let out = '';
    for (let i = 0; i < inner.length; i++) {
      const ch = inner.charAt(i);
      if (ch === '\\') {
        const nxt = inner.charAt(i + 1);
        if (nxt === '"' || nxt === '\\') { out += nxt; i++; continue; }
        return null;                       // unsupported escape sequence
      }
      if (ch === '"') return null;         // unescaped interior quote
      out += ch;
    }
    return out;
  }
  // A PLAIN scalar may legitimately contain interior quotes — `codebase-scout`'s tracked
  // `description` does ("where does X live / how does Y work"). Refusing that would false-refuse a
  // real deployed role, and because resolution parses EVERY candidate in a directory, one
  // unparseable sibling would refuse launches for an unrelated role. Only a value that OPENS with a
  // quote but does not close is ambiguous, and that still refuses.
  if (s.charAt(0) === '"') return null;    // half-quoted
  if (UNSUPPORTED_VALUE_LEAD.test(s)) return null;
  return s;
}

const TOP_KEY = /^([A-Za-z][A-Za-z0-9_]*):(.*)$/;
const EVENT_KEY = /^ {2}([A-Za-z][A-Za-z0-9]*):(.*)$/;
const ENTRY_MATCHER = /^ {4}- matcher:(.*)$/;
const ENTRY_HOOKS = /^ {6}hooks:$/;
const HOOK_TYPE = /^ {8}- type:(.*)$/;
const HOOK_COMMAND = /^ {10}command:(.*)$/;
const NAME_OK = /^[a-z0-9][a-z0-9-]*$/;
const TOOL_OK = /^[A-Za-z][A-Za-z0-9]*$/;

function refuse(reason) { return { ok: false, reason: reason }; }

/**
 * parseRoleFrontmatter(text)
 *   -> { ok:true, name, toolsDeclared, tools, disallowedTools, events, scalars }
 *   |  { ok:false, reason }
 *
 * `events` maps an event name (e.g. 'PreToolUse') to an array of
 * { matcher, hooks: [{ type, command }] }. Only structurally complete entries are produced;
 * anything else refuses.
 */
function parseRoleFrontmatter(text) {
  if (typeof text !== 'string') return refuse(REASON.NOT_TEXT);
  let src = text;
  if (src.charAt(0) === BOM) src = src.slice(1);
  const lines = src.split(/\r\n|\n/);
  if (lines[0] !== '---') return refuse(REASON.NO_FRONTMATTER);
  let close = -1;
  for (let i = 1; i < lines.length; i++) { if (lines[i] === '---') { close = i; break; } }
  if (close === -1) return refuse(REASON.UNTERMINATED);

  const body = lines.slice(1, close);
  const seen = new Set();
  const scalars = Object.create(null);
  const events = Object.create(null);
  let i = 0;

  while (i < body.length) {
    const line = body[i];
    if (line.trim() === '' || /^#/.test(line)) { i++; continue; }

    const m = TOP_KEY.exec(line);
    if (!m) return refuse(REASON.UNSUPPORTED_STRUCTURE);   // indented line outside a hooks block
    const key = m[1];
    const rest = m[2];
    if (seen.has(key)) return refuse(REASON.DUPLICATE_KEY);
    seen.add(key);

    if (key !== 'hooks') {
      if (rest.trim() === '') {
        // An empty scalar is acceptable only when nothing is nested under it; nesting outside the
        // hooks block is exactly the structure this grammar refuses to interpret.
        const nxt = body[i + 1];
        if (nxt !== undefined && nxt.trim() !== '' && /^\s/.test(nxt)) {
          return refuse(REASON.UNSUPPORTED_STRUCTURE);
        }
        scalars[key] = '';
        i++;
        continue;
      }
      const v = unquote(rest);
      if (v === null) return refuse(REASON.UNSUPPORTED_VALUE);
      scalars[key] = v;
      i++;
      continue;
    }

    // ---- hooks block ---------------------------------------------------------------------------
    if (rest.trim() !== '') return refuse(REASON.UNSUPPORTED_HOOKS_GRAMMAR);
    i++;
    while (i < body.length) {
      const l = body[i];
      if (l.trim() === '') { i++; continue; }
      if (/^\S/.test(l)) break;                              // dedented back to a top-level key
      const em = EVENT_KEY.exec(l);
      if (!em) return refuse(REASON.UNSUPPORTED_HOOKS_GRAMMAR);
      const eventName = em[1];
      const eventRest = em[2].trim();
      if (Object.prototype.hasOwnProperty.call(events, eventName)) return refuse(REASON.DUPLICATE_KEY);
      i++;
      if (eventRest === '[]') { events[eventName] = []; continue; }
      if (eventRest !== '') return refuse(REASON.UNSUPPORTED_HOOKS_GRAMMAR);

      const entries = [];
      while (i < body.length) {
        const el = body[i];
        if (el.trim() === '') { i++; continue; }
        if (!/^ {4}/.test(el)) break;                        // next event, or out of the hooks block
        const mm = ENTRY_MATCHER.exec(el);
        if (!mm) return refuse(REASON.UNSUPPORTED_HOOKS_GRAMMAR);
        const matcher = unquote(mm[1]);
        if (matcher === null) return refuse(REASON.UNSUPPORTED_HOOKS_GRAMMAR);
        i++;
        if (i >= body.length || !ENTRY_HOOKS.test(body[i])) return refuse(REASON.UNSUPPORTED_HOOKS_GRAMMAR);
        i++;
        const hookList = [];
        while (i < body.length && HOOK_TYPE.test(body[i])) {
          const type = unquote(HOOK_TYPE.exec(body[i])[1]);
          if (type === null) return refuse(REASON.UNSUPPORTED_HOOKS_GRAMMAR);
          i++;
          if (i >= body.length || !HOOK_COMMAND.test(body[i])) return refuse(REASON.UNSUPPORTED_HOOKS_GRAMMAR);
          const command = unquote(HOOK_COMMAND.exec(body[i])[1]);
          if (command === null) return refuse(REASON.UNSUPPORTED_HOOKS_GRAMMAR);
          i++;
          hookList.push({ type: type, command: command });
        }
        if (hookList.length === 0) return refuse(REASON.UNSUPPORTED_HOOKS_GRAMMAR);
        entries.push({ matcher: matcher, hooks: hookList });
      }
      events[eventName] = entries;
    }
  }

  const name = scalars.name;
  if (!Object.prototype.hasOwnProperty.call(scalars, 'name')) return refuse(REASON.NAME_ABSENT);
  if (typeof name !== 'string' || name === '') return refuse(REASON.NAME_INVALID);
  // Documented constraints: lowercase/hyphen identifier, may not start with '-', may not contain ':'.
  if (!NAME_OK.test(name) || name.indexOf(':') !== -1) return refuse(REASON.NAME_INVALID);

  const parseList = (raw) => {
    if (typeof raw !== 'string') return null;
    const items = raw.split(',').map((s) => s.trim()).filter((s) => s !== '');
    for (const t of items) if (!TOOL_OK.test(t)) return null;
    return items;
  };

  const toolsDeclared = Object.prototype.hasOwnProperty.call(scalars, 'tools');
  let tools = [];
  if (toolsDeclared) {
    tools = parseList(scalars.tools);
    if (tools === null) return refuse(REASON.UNSUPPORTED_VALUE);
  }
  let disallowedTools = [];
  if (Object.prototype.hasOwnProperty.call(scalars, 'disallowedTools')) {
    disallowedTools = parseList(scalars.disallowedTools);
    if (disallowedTools === null) return refuse(REASON.UNSUPPORTED_VALUE);
  }

  return {
    ok: true,
    name: name,
    toolsDeclared: toolsDeclared,
    tools: tools,
    disallowedTools: disallowedTools,
    events: events,
    scalars: scalars,
  };
}

module.exports = { REASON: REASON, parseRoleFrontmatter: parseRoleFrontmatter };
