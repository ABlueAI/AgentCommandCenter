'use strict';

const {
  SCHEMA_VERSION, MAX_CONFIG_BYTES, MAX_ENTRIES, MAX_ID_LENGTH, MAX_LABEL_LENGTH, MAX_URL_LENGTH,
  DEFAULT_LABELS, REASON, validateUrl, validateConfigObject, parseConfigText, buildDefaultConfig,
} = require('./quick-links-policy');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
function eq(actual, expected, label) { assert(actual === expected, `${label} (got ${JSON.stringify(actual)})`); }
function refused(input, reason, label) {
  const result = validateUrl(input);
  assert(!result.ok && result.reason === reason, `${label} -> ${reason}`);
}
function entry(id = 'ql-a', label = 'Example', url = 'https://fixture.example/path') { return { id, label, url }; }
function config(entries = [entry()]) { return { schemaVersion: SCHEMA_VERSION, entries }; }

process.stdout.write('\nexact HTTP/HTTPS policy\n');
for (const input of [
  'http://fixture.example',
  'https://fixture.example/path?query=1#fragment',
  'HTTP://FIXTURE.EXAMPLE/UppercaseInput',
  'https://127.0.0.1:8443/path',
  'https://[::1]/',
]) {
  assert(validateUrl(input).ok, `accepts structured ${input.split(':')[0]} URL fixture`);
}
for (const input of [
  'file:///C:/Windows', 'javascript:alert(1)', 'data:text/plain,x', 'ftp://fixture.example',
  'mailto:test@fixture.example', 'ws://fixture.example', 'wss://fixture.example', 'vbscript:msgbox(1)',
]) {
  refused(input, REASON.URL_PROTOCOL, `rejects unsupported ${input.split(':')[0]} scheme`);
}

process.stdout.write('\nstructured-parser deceptive and malformed cases\n');
for (const input of [
  'https://user@fixture.example/',
  'https://user:password@fixture.example/',
  'https://%75ser@fixture.example/',
  'https://@fixture.example/',
]) refused(input, REASON.URL_USERINFO, 'rejects credential/userinfo authority');
refused(' //fixture.example/path', REASON.URL_SURROUNDING_WHITESPACE, 'rejects surrounding whitespace before relative form');
refused('//fixture.example/path', REASON.URL_MALFORMED, 'rejects protocol-relative URL');
refused('/relative/path', REASON.URL_MALFORMED, 'rejects relative path');
refused('fixture.example/path', REASON.URL_MALFORMED, 'rejects host-like relative text');
refused('http:fixture.example', REASON.URL_MALFORMED, 'rejects WHATWG shorthand without //');
refused('https:////fixture.example', REASON.URL_MALFORMED, 'rejects ambiguous extra-slash authority');
refused('https://', REASON.URL_MALFORMED, 'rejects missing host');
refused('https:// fixture.example', REASON.URL_MALFORMED, 'rejects malformed authority');
refused('https://fixture.example\\@evil.example', REASON.URL_BACKSLASH, 'rejects backslash normalization ambiguity');
refused('https://fixture.example/line\nbreak', REASON.URL_CONTROL_CHARACTER, 'rejects literal LF control');
refused('https://fixture.example/line\rbreak', REASON.URL_CONTROL_CHARACTER, 'rejects literal CR control');
refused('https://fixture.example/%0d%0aInjected', REASON.URL_ENCODED_CONTROL, 'rejects encoded CRLF ambiguity');
refused('https://fixture.example/%7f', REASON.URL_ENCODED_CONTROL, 'rejects encoded DEL');
refused('https://fixture.example/%8f', REASON.URL_ENCODED_CONTROL, 'rejects encoded C1 control');
refused('https://fixture.example/%GG', REASON.URL_INVALID_PERCENT_ENCODING, 'rejects malformed percent escape');
refused('https://fixture.example/%', REASON.URL_INVALID_PERCENT_ENCODING, 'rejects truncated percent escape');
refused('https://fixture.example/\u202eevil', REASON.URL_BIDI_CHARACTER, 'rejects bidi override');

process.stdout.write('\nbounded URL/config input\n');
refused('https://fixture.example/' + 'x'.repeat(MAX_URL_LENGTH), REASON.URL_TOO_LONG, 'rejects URL over length bound');
eq(validateUrl(42).reason, REASON.URL_NOT_STRING, 'rejects non-string URL');
eq(validateUrl('').reason, REASON.URL_EMPTY, 'rejects empty URL');
eq(parseConfigText('x'.repeat(MAX_CONFIG_BYTES + 1)).reason, REASON.CONFIG_TOO_LARGE,
  'refuses oversized raw config before JSON parsing');
eq(parseConfigText('{broken').reason, REASON.INVALID_JSON, 'rejects malformed JSON');
eq(parseConfigText(null).reason, REASON.CONFIG_NOT_STRING, 'rejects non-string config input');

process.stdout.write('\nclosed versioned schema and bounds\n');
assert(validateConfigObject(config()).ok, 'accepts minimal valid config');
eq(validateConfigObject({ schemaVersion: SCHEMA_VERSION, entries: [], extra: true }).reason,
  REASON.CONFIG_UNKNOWN_FIELD, 'rejects unknown top-level field');
eq(validateConfigObject({ schemaVersion: 99, entries: [] }).reason, REASON.VERSION_MISMATCH,
  'rejects version mismatch');
eq(validateConfigObject({ schemaVersion: SCHEMA_VERSION, entries: {} }).reason, REASON.ENTRIES_NOT_ARRAY,
  'rejects non-array entries');
eq(validateConfigObject(config(Array.from({ length: MAX_ENTRIES + 1 }, (_, i) => entry(`ql-${i}`)))).reason,
  REASON.TOO_MANY_ENTRIES, 'rejects entry-count overflow');
eq(validateConfigObject(config([{ ...entry(), extra: true }])).reason, REASON.ENTRY_UNKNOWN_FIELD,
  'rejects unknown entry field');
eq(validateConfigObject(config([entry('ql-a'), entry('ql-a', 'Second')])).reason, REASON.DUPLICATE_ID,
  'rejects duplicate IDs');
eq(validateConfigObject(config([entry('x'.repeat(MAX_ID_LENGTH + 1))])).reason, REASON.ID_TOO_LONG,
  'rejects ID length overflow');
eq(validateConfigObject(config([entry('../escape')])).reason, REASON.ID_INVALID,
  'rejects non-opaque ID syntax');
eq(validateConfigObject(config([entry('ql-a', 'x'.repeat(MAX_LABEL_LENGTH + 1))])).reason,
  REASON.LABEL_TOO_LONG, 'rejects label length overflow');
eq(validateConfigObject(config([entry('ql-a', ' label ')])).reason, REASON.LABEL_INVALID,
  'rejects label surrounding whitespace');
eq(validateConfigObject(config([entry('ql-a', 'bad\nlabel')])).reason, REASON.LABEL_INVALID,
  'rejects label control character');

process.stdout.write('\ndefault seed contract uses explicit fixtures only\n');
const seeded = buildDefaultConfig({
  starboardUrl: 'https://starboard.test.invalid/login',
  outlookUrl: 'https://outlook.test.invalid/mail',
});
assert(seeded.ok, 'explicit test fixture URLs build a valid seed config');
eq(seeded.config.entries.length, 2, 'seed has exactly two entries');
eq(seeded.config.entries[0].label, DEFAULT_LABELS[0], 'first exact label is Starboard Platform');
eq(seeded.config.entries[1].label, DEFAULT_LABELS[1], 'second exact label is Outlook Web');
eq(buildDefaultConfig({ starboardUrl: 'https://fixture.example' }).reason, REASON.DEFAULTS_INVALID,
  'missing second approved URL cannot build defaults');
assert(!DEFAULT_LABELS.some((label) => /CRM|Hexona|GoHighLevel/.test(label)),
  'default labels contain no forbidden historical/vendor name');

process.stdout.write(`\nquick-links-policy: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
