'use strict';

// S55 Firefox presets: config validation, profiles.ini verification and the launch path. Every
// refusal must return its exact reason and spawn nothing. Shape A summary (test-summary-formats).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createQuickLinksPresets } = require('./quick-links-presets');
const example = require('./quick-links-presets.example.json');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
function same(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  assert(a === e, `${label} (got ${a})`);
}

const roots = [];
function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mako-presets-'));
  roots.push(root);
  const firefoxDir = path.join(root, 'Mozilla', 'Firefox');
  const profilesFile = path.join(firefoxDir, 'profiles.ini');
  const exe = path.join(root, 'Mozilla Firefox', 'firefox.exe');
  fs.mkdirSync(path.dirname(exe));
  fs.writeFileSync(exe, '');
  fs.mkdirSync(path.join(firefoxDir, 'Profiles', 'test'), { recursive: true });
  fs.writeFileSync(profilesFile, '[Profile0]\nName=Mako\nIsRelative=1\nPath=Profiles/test\n');
  const configFile = path.join(root, 'quick-links-presets.json');
  const calls = [];
  const api = createQuickLinksPresets({
    settingsDir: root, appData: root, isWin: options.isWin !== false, env: { ProgramFiles: root },
    spawnFirefox(...request) {
      calls.push(request);
      const child = new EventEmitter();
      child.unref = () => {};
      queueMicrotask(() => child.emit(options.spawnError ? 'error' : 'spawn', new Error('spawn failed')));
      return child;
    },
  });
  return { api, root, firefoxDir, configFile, profilesFile, calls, exe };
}
function writeConfig(f, mutate) {
  const config = structuredClone(example);
  if (mutate) mutate(config);
  fs.writeFileSync(f.configFile, JSON.stringify(config));
}

async function main() {
  process.stdout.write('\nmissing and malformed preset files\n');
  {
    const f = fixture();
    same(f.api.list(), { ok: false, reason: 'presets-file-missing' }, 'missing file refuses listing');
    same(await f.api.open('preset-one'), f.api.list(), 'missing file refuses launch');
    fs.writeFileSync(f.configFile, '{');
    same(f.api.list(), { ok: false, reason: 'invalid-json' }, 'malformed JSON refuses listing');
    same(await f.api.open('preset-one'), f.api.list(), 'malformed JSON refuses launch');
    same(f.calls, [], 'nothing spawned');
  }

  process.stdout.write('\nloadPresets refusal branches\n');
  {
    const f = fixture();
    const thirteen = Array.from({ length: 13 }, (_, i) => `https://example.com/${i}`);
    for (const [label, mutate, reason] of [
      ['wrong schema version', (c) => { c.schemaVersion = 2; }, 'presets-invalid'],
      ['fewer than 2 URLs', (c) => { c.presets[0].urls = ['https://example.com/one']; }, 'preset-urls-invalid'],
      ['more than 12 URLs', (c) => { c.presets[0].urls = thirteen; }, 'preset-urls-invalid'],
      ['duplicate preset ID', (c) => { c.presets.push(structuredClone(c.presets[0])); }, 'duplicate-id'],
      ['invalid preset ID', (c) => { c.presets[0].id = '../x'; }, 'id-invalid'],
      ['invalid preset label', (c) => { c.presets[0].label = ''; }, 'label-invalid'],
    ]) {
      writeConfig(f, mutate);
      const result = f.api.list();
      same(result, { ok: false, reason }, `${label} refuses with ${reason}`);
      same(await f.api.open('preset-one'), { ok: false, reason }, `${label} refuses launch with ${reason}`);
    }
    fs.writeFileSync(f.configFile, Buffer.from([0x7b, 0xff, 0xfe, 0x7d]));
    same(f.api.list(), { ok: false, reason: 'presets-invalid-utf8' }, 'invalid UTF-8 refuses');
    fs.writeFileSync(f.configFile, ' '.repeat(require('./quick-links-policy').MAX_CONFIG_BYTES + 1));
    same(f.api.list(), { ok: false, reason: 'config-too-large' }, 'oversized file refuses');
    fs.unlinkSync(f.configFile);
    fs.mkdirSync(f.configFile);
    same(f.api.list(), { ok: false, reason: 'presets-file-not-regular' }, 'a directory in place of the file refuses');
    same(f.calls, [], 'nothing spawned');
  }

  process.stdout.write('\npreset URLs must pass the existing policy and use HTTPS\n');
  {
    const f = fixture();
    for (const [url, reason] of [
      ['http://example.com/', 'preset-https-required'],
      ['https://user@example.com/', 'url-userinfo-not-allowed'],
      ['https://example.com/%0a', 'url-encoded-control'],
      ['-new-tab', 'url-malformed'],
    ]) {
      writeConfig(f, (c) => { c.presets[0].urls[1] = url; });
      same(await f.api.open('preset-one'), { ok: false, reason }, `${url} refuses with ${reason}`);
    }
    same(f.calls, [], 'nothing spawned');
  }

  process.stdout.write('\nopen guards\n');
  {
    const f = fixture();
    writeConfig(f);
    for (const id of [42, '../x', 'a'.repeat(65)]) {
      same(await f.api.open(id), { ok: false, reason: 'invalid-id' }, `id ${JSON.stringify(id).slice(0, 20)} refuses with invalid-id`);
    }
    same(await f.api.open('no-such-preset'), { ok: false, reason: 'unknown-id' }, 'unknown preset refuses with unknown-id');
    same(f.calls, [], 'nothing spawned');
    const off = fixture({ isWin: false });
    writeConfig(off);
    same(await off.api.open('preset-one'), { ok: false, reason: 'firefox-platform-unsupported' }, 'off Windows refuses');
    same(off.calls, [], 'nothing spawned off Windows');
    const broken = fixture({ spawnError: true });
    writeConfig(broken);
    same(await broken.api.open('preset-one'), { ok: false, reason: 'firefox-launch-failed' },
      'a spawn error event becomes firefox-launch-failed');
  }

  process.stdout.write('\nlaunch\n');
  {
    const f = fixture();
    writeConfig(f);
    same(f.api.list(), { ok: true, presets: example.presets.map(({ id, label }) => ({ id, label })) }, 'lists id and label only');
    same(await f.api.open('preset-one'), { ok: true }, 'launch succeeds');
    same(f.calls, [[f.exe, ['-P', 'Mako', '-new-tab', 'https://example.com/one',
      '-new-tab', 'https://example.com/two'], { shell: false, detached: true, stdio: 'ignore' }]],
    'one process, a literal argument per flag and URL, shell:false');
  }

  process.stdout.write('\nprofiles.ini verification\n');
  {
    for (const [label, ini, reason] of [
      ['two Name=Mako profiles', '[Profile0]\nName=Mako\nIsRelative=1\nPath=Profiles/test\n[Profile1]\nName=Mako\nIsRelative=1\nPath=Profiles/test\n', 'firefox-profile-ambiguous'],
      ['duplicate key in one section', '[Profile0]\nName=Mako\nName=Mako\nIsRelative=1\nPath=Profiles/test\n', 'firefox-profiles-invalid'],
      ['IsRelative=1 with an absolute Path', `[Profile0]\nName=Mako\nIsRelative=1\nPath=${path.resolve('/abs/profile')}\n`, 'firefox-profile-path-invalid'],
      ['IsRelative=0 with a relative Path', '[Profile0]\nName=Mako\nIsRelative=0\nPath=Profiles/test\n', 'firefox-profile-path-invalid'],
      ['.. in a relative Path', '[Profile0]\nName=Mako\nIsRelative=1\nPath=Profiles/../test\n', 'firefox-profile-path-invalid'],
      ['.. with a backslash', '[Profile0]\nName=Mako\nIsRelative=1\nPath=Profiles\\..\\test\n', 'firefox-profile-path-invalid'],
      ['missing profile directory', '[Profile0]\nName=Mako\nIsRelative=1\nPath=Profiles/gone\n', 'firefox-profile-missing'],
      ['Name=Mako outside a [ProfileN] section', '[General]\nName=Mako\nIsRelative=1\nPath=Profiles/test\n[Install1234]\nName=Mako\n', 'firefox-profile-missing'],
    ]) {
      const f = fixture();
      writeConfig(f);
      fs.writeFileSync(f.profilesFile, ini);
      same(await f.api.open('preset-one'), { ok: false, reason }, `${label} refuses with ${reason}`);
      same(f.calls, [], `${label}: nothing spawned`);
    }
    const crlf = fixture();
    writeConfig(crlf);
    fs.writeFileSync(crlf.profilesFile, '[General]\r\nStartWithLastProfile=1\r\n\r\n[Profile0]\r\nName=Mako\r\nIsRelative=1\r\nPath=Profiles/test\r\n');
    same(await crlf.api.open('preset-one'), { ok: true }, 'a CRLF profiles.ini passes');
    same(crlf.calls.length, 1, 'the CRLF case spawns once');
  }

  process.stdout.write('\nmissing profile or executable\n');
  {
    const f = fixture();
    writeConfig(f);
    fs.unlinkSync(f.exe);
    same(await f.api.open('preset-one'), { ok: false, reason: 'firefox-not-found' }, 'missing firefox.exe refuses');
    fs.unlinkSync(f.profilesFile);
    same(await f.api.open('preset-one'), { ok: false, reason: 'firefox-profile-missing' }, 'missing profiles.ini refuses');
    same(f.calls, [], 'nothing spawned');
  }
}

main()
  .catch((error) => { process.stderr.write(`  ✗ FAIL: unexpected error ${error && error.stack}\n`); failed += 1; })
  .finally(() => {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
    process.stdout.write(`\nquick-links-presets: ${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
  });
