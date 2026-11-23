'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createQuickLinksPresets } = require('./quick-links-presets');
const example = require('./quick-links-presets.example.json');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mako-presets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
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
    settingsDir: root, appData: root, isWin: true, env: { ProgramFiles: root },
    spawnFirefox(...request) {
      calls.push(request);
      const child = new EventEmitter();
      child.unref = () => {};
      queueMicrotask(() => child.emit('spawn'));
      return child;
    },
  });
  return { api, configFile, profilesFile, calls, exe };
}

test('missing and malformed preset files refuse listing and launch', async (t) => {
  const { api, configFile, calls } = fixture(t);
  assert.deepEqual(api.list(), { ok: false, reason: 'presets-file-missing' });
  assert.deepEqual(await api.open('preset-one'), api.list());
  fs.writeFileSync(configFile, '{');
  assert.deepEqual(api.list(), { ok: false, reason: 'invalid-json' });
  assert.deepEqual(await api.open('preset-one'), api.list());
  assert.deepEqual(calls, []);
});

test('all preset URLs must pass the existing policy and use HTTPS before launch', async (t) => {
  const { api, configFile, calls } = fixture(t);
  for (const [url, reason] of [
    ['http://example.com/', 'preset-https-required'],
    ['https://user@example.com/', 'url-userinfo-not-allowed'],
    ['https://example.com/%0a', 'url-encoded-control'],
    ['-new-tab', 'url-malformed'],
  ]) {
    const config = structuredClone(example);
    config.presets[0].urls[1] = url;
    fs.writeFileSync(configFile, JSON.stringify(config));
    assert.deepEqual(await api.open('preset-one'), { ok: false, reason });
  }
  assert.deepEqual(calls, []);
});

test('launches one process with a literal argument per flag and URL', async (t) => {
  const { api, configFile, calls, exe } = fixture(t);
  fs.writeFileSync(configFile, JSON.stringify(example));
  assert.deepEqual(api.list(), { ok: true, presets: example.presets.map(({ id, label }) => ({ id, label })) });
  assert.deepEqual(await api.open('preset-one'), { ok: true });
  assert.deepEqual(calls, [[exe, ['-P', 'Mako', '-new-tab', 'https://example.com/one',
    '-new-tab', 'https://example.com/two'], { shell: false, detached: true, stdio: 'ignore' }]]);
});

test('missing profile or executable refuses with no spawn', async (t) => {
  const { api, configFile, profilesFile, calls, exe } = fixture(t);
  fs.writeFileSync(configFile, JSON.stringify(example));
  fs.unlinkSync(exe);
  assert.deepEqual(await api.open('preset-one'), { ok: false, reason: 'firefox-not-found' });
  fs.unlinkSync(profilesFile);
  assert.deepEqual(await api.open('preset-one'), { ok: false, reason: 'firefox-profile-missing' });
  assert.deepEqual(calls, []);
});
