'use strict';

const fs = require('node:fs');
const path = require('node:path');
const helpers = require('./helper-programs');
const policy = require('./quick-links-policy');

const FILE = 'quick-links-presets.json';
const PROFILE = 'Mako';

function refuse(reason) { return { ok: false, reason }; }

function loadPresets(file) {
  let bytes;
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile()) return refuse('presets-file-not-regular');
    if (stat.size > policy.MAX_CONFIG_BYTES) return refuse(policy.REASON.CONFIG_TOO_LARGE);
    bytes = fs.readFileSync(file);
  } catch (error) {
    return refuse(error.code === 'ENOENT' ? 'presets-file-missing' : 'presets-file-unreadable');
  }
  if (bytes.length > policy.MAX_CONFIG_BYTES) return refuse(policy.REASON.CONFIG_TOO_LARGE);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return refuse('presets-invalid-utf8'); }
  let config;
  try { config = JSON.parse(text); }
  catch { return refuse(policy.REASON.INVALID_JSON); }
  if (config?.schemaVersion !== 1 || !Array.isArray(config.presets)
      || config.presets.length > policy.MAX_ENTRIES) return refuse('presets-invalid');

  const presets = new Map();
  for (const preset of config.presets) {
    if (!preset || !Array.isArray(preset.urls)
        || preset.urls.length < 2 || preset.urls.length > policy.MAX_ENTRIES) return refuse('preset-urls-invalid');
    const urls = [];
    for (const raw of preset.urls) {
      const checked = policy.validateEntry({ id: preset.id, label: preset.label, url: raw });
      if (!checked.ok) return checked;
      if (new URL(checked.entry.url).protocol !== 'https:') return refuse('preset-https-required');
      urls.push(checked.entry.url);
    }
    if (presets.has(preset.id)) return refuse(policy.REASON.DUPLICATE_ID);
    presets.set(preset.id, { id: preset.id, label: preset.label, urls });
  }
  return { ok: true, presets };
}

function verifyProfile(root) {
  let text;
  try { text = fs.readFileSync(path.join(root, 'profiles.ini'), 'utf8'); }
  catch (error) { return refuse(error.code === 'ENOENT' ? 'firefox-profile-missing' : 'firefox-profiles-unreadable'); }

  const profiles = [];
  let profile;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      profile = /^\[Profile\d+\]$/.test(line) ? new Map() : undefined;
      if (profile) profiles.push(profile);
    } else if (profile && line.includes('=')) {
      const separator = line.indexOf('=');
      const key = line.slice(0, separator);
      if (profile.has(key)) return refuse('firefox-profiles-invalid');
      profile.set(key, line.slice(separator + 1));
    }
  }

  const matches = profiles.filter((entry) => entry.get('Name') === PROFILE);
  if (matches.length === 0) return refuse('firefox-profile-missing');
  if (matches.length !== 1) return refuse('firefox-profile-ambiguous');
  const profilePath = matches[0].get('Path');
  const relative = matches[0].get('IsRelative');
  if (!profilePath || !['0', '1'].includes(relative)
      || path.isAbsolute(profilePath) !== (relative === '0')
      || (relative === '1' && profilePath.split(/[\\/]/).includes('..'))) {
    return refuse('firefox-profile-path-invalid');
  }
  try {
    const directory = relative === '1' ? path.join(root, profilePath) : profilePath;
    if (fs.statSync(directory).isDirectory()) return { ok: true };
  } catch (error) {
    if (error.code !== 'ENOENT') return refuse('firefox-profile-unreadable');
  }
  return refuse('firefox-profile-missing');
}

function createQuickLinksPresets({
  settingsDir, appData, isWin = process.platform === 'win32',
  resolveFirefox = () => helpers.resolve('firefox'), spawnFirefox = helpers.spawn,
}) {
  const file = path.join(settingsDir, FILE);

  function list() {
    const loaded = loadPresets(file);
    if (!loaded.ok) return loaded;
    return { ok: true, presets: Array.from(loaded.presets.values(), ({ id, label }) => ({ id, label })) };
  }

  async function open(id) {
    if (typeof id !== 'string' || id.length > policy.MAX_ID_LENGTH || !policy.ID_PATTERN.test(id)) {
      return refuse('invalid-id');
    }
    const loaded = loadPresets(file);
    if (!loaded.ok) return loaded;
    const preset = loaded.presets.get(id);
    if (!preset) return refuse('unknown-id');
    if (!isWin) return refuse('firefox-platform-unsupported');
    const profile = verifyProfile(path.join(appData, 'Mozilla', 'Firefox'));
    if (!profile.ok) return profile;
    const firefox = resolveFirefox();
    if (!firefox.ok) return firefox;
    const args = ['-P', PROFILE, ...preset.urls.flatMap((url) => ['-new-tab', url])];
    try {
      await new Promise((resolve, reject) => {
        const child = spawnFirefox(firefox.exe, args, { shell: false, detached: true, stdio: 'ignore' });
        child.once('error', reject);
        child.once('spawn', () => { child.unref(); resolve(); });
      });
    } catch { return refuse('firefox-launch-failed'); }
    return { ok: true };
  }

  return { list, open };
}

module.exports = { createQuickLinksPresets };
