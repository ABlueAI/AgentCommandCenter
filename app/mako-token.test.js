'use strict';
// Run: node app/mako-token.test.js
// Plain Node.js, no framework. S35 mako-token: the token service (fake clock: expiry margin, sleep and
// wake, offline, renewal failure, no fallback), the minter's identity checks, the key store, the file
// cache, the import command and git's credential helper protocol. Windows-only checks (real DPAPI, real
// icacls) run only on win32; CI runs them. What CI cannot cover is listed in docs/MAKO-TOKEN.md.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const cfg = require('./mako-token/config');
const { MakoTokenError, scrub } = require('./mako-token/errors');
const { createTokenService, recordMatches, usable } = require('./mako-token/core');
const { createFileCache } = require('./mako-token/cache');
const { createKeyStore, fingerprint, checkPem, secureDelete, windowsDpapi } = require('./mako-token/keystore');
const { createMinter, samePermissions } = require('./mako-token/minter');
const { importKey } = require('./mako-token/importer');
const { gitHelper, parseKv } = require('./mako-token/cli');
const { restrictToCurrentUser } = require('./mako-token/acl');

let passed = 0, failed = 0, skipped = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function skip(label) { process.stdout.write(`  - skipped (${label})\n`); skipped++; }
async function rejects(fn) { try { await fn(); return null; } catch (e) { return e; } }

const CONFIG = { appId: 4242, installationId: 777, slug: 'mako-agents', botUserId: 99001, owner: 'ABlueAI', repo: 'AgentCommandCenter' };
const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 10, 12, 9, 0, 0);
const FAKE_TOKEN = (n) => `ghs_${'A'.repeat(30)}${n}`;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mako-token-'));

// An in-memory cache with the same contract as the file cache.
function memCache() {
  const m = new Map();
  return { m, read: (p) => (m.has(p) ? JSON.parse(m.get(p)) : null), write: (p, r) => { m.set(p, JSON.stringify(r)); }, remove: (p) => { m.delete(p); } };
}

(async () => {
  // --- config, profiles, bot identity -----------------------------------------------------------
  {
    assert(cfg.validateConfig(CONFIG).ok, 'a complete config is valid');
    for (const [k, v] of [['appId', 0], ['appId', '4242'], ['installationId', -1], ['botUserId', 1.5], ['slug', 'bad slug!'], ['owner', ''], ['repo', 'a/b']]) {
      assert(!cfg.validateConfig({ ...CONFIG, [k]: v }).ok, `refused: ${k} = ${JSON.stringify(v)}`);
    }
    assert(!cfg.validateConfig(null).ok && !cfg.validateConfig([]).ok, 'a non-object config is refused');
    const bot = cfg.botIdentity(CONFIG);
    assert(bot.name === 'mako-agents[bot]' && bot.email === '99001+mako-agents[bot]@users.noreply.github.com', 'bot identity is <id>+<slug>[bot]@users.noreply.github.com');
    const w = cfg.PROFILES.writer, r = cfg.PROFILES.reader;
    assert(w.contents === 'write' && w.pull_requests === 'write' && w.issues === 'write'
      && w.actions === 'read' && w.checks === 'read' && w.statuses === 'read' && w.metadata === 'read' && Object.keys(w).length === 7,
    'writer profile: contents, pull requests and issues write plus the three reads (and metadata)');
    assert(Object.values(r).every((v) => v === 'read') && Object.keys(r).length === 7, 'reader profile: reads only');
    assert(cfg.isProfile('writer') && cfg.isProfile('reader') && !cfg.isProfile('admin') && !cfg.isProfile('__proto__') && !cfg.isProfile(undefined), 'only the two profiles exist');
    assert(Object.isFrozen(cfg.PROFILES.writer) && Object.isFrozen(cfg.PROFILES), 'profiles are frozen');
    const l = cfg.layout({ APPDATA: 'C:\\Users\\b\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\b\\AppData\\Local' }, 'C:\\Users\\b');
    assert(l.dataDir.endsWith('Mako') && l.cacheDir.includes('Local') && l.cacheDir.endsWith('token-cache'), 'data lives under APPDATA\\Mako, the cache under LOCALAPPDATA\\Mako');
    assert(cfg.REFRESH_MARGIN_MS === 5 * MIN, 'refresh margin is 5 minutes');
    assert(cfg.selectProfile().profile === 'writer' && cfg.selectProfile(undefined, '').profile === 'writer' && cfg.selectProfile('reader', 'writer').profile === 'reader' && cfg.selectProfile(undefined, 'reader').profile === 'reader', 'selectProfile: the first thing set wins; nothing set means writer');
    for (const bad of ['Reader', 'read', 'admin', 'writer ', '__proto__']) assert(cfg.selectProfile(bad).ok === false && cfg.selectProfile(undefined, bad).ok === false, `selectProfile refuses ${JSON.stringify(bad)} instead of falling back`);
  }

  // --- the token service with a fake clock -----------------------------------------------------
  {
    let now = T0;
    let mints = 0;
    let mode = 'ok';
    const cache = memCache();
    const mint = async ({ profile }) => {
      mints++;
      if (mode === 'offline') throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } });
      if (mode === 'bad') throw new Error('Bad credentials: Bearer ' + FAKE_TOKEN('x') + ' for ' + profile);
      if (mode === 'empty') return { token: '', expiresAt: 'x' };
      return { token: FAKE_TOKEN(mints), expiresAt: new Date(now + 60 * MIN).toISOString() };
    };
    const warnings = [];
    const svc = createTokenService({ config: CONFIG, cache, mint, now: () => now, warn: (l) => warnings.push(l) });

    let r = await svc.getToken('writer');
    assert(r.token === FAKE_TOKEN(1) && r.fromCache === false && mints === 1, 'first call mints');
    now = T0 + 10 * MIN;
    r = await svc.getToken('writer');
    assert(r.fromCache === true && mints === 1 && r.token === FAKE_TOKEN(1), 'minute 10: the cached token is reused');
    now = T0 + 54 * MIN + 59 * 1000;
    r = await svc.getToken('writer');
    assert(r.fromCache === true && mints === 1, 'minute 54:59 (just over 5 minutes left): still reused');
    now = T0 + 55 * MIN;
    r = await svc.getToken('writer');
    assert(r.fromCache === false && mints === 2 && r.token === FAKE_TOKEN(2), 'minute 55 (exactly 5 minutes left): a new token is minted');
    now = T0 + 65 * MIN;
    r = await svc.getToken('writer');
    assert(r.fromCache === true && mints === 2, 'minute 65 (10 minutes into the second token): the second token is reused');

    // sleep and wake: the laptop sleeps for 6 hours with a token that was valid when it slept
    now = T0 + 6 * 60 * MIN;
    r = await svc.getToken('writer');
    assert(r.fromCache === false && mints === 3, 'after a 6-hour sleep the expired token is replaced, not reused');

    // profiles are separate
    r = await svc.getToken('reader');
    assert(r.fromCache === false && mints === 4 && cache.m.has('reader') && cache.m.has('writer'), 'the reader profile has its own cache entry');
    const rec = JSON.parse(cache.m.get('reader'));
    assert(rec.permissionsKey === cfg.profileKey('reader') && !/write/.test(rec.permissionsKey), 'the reader record carries read-only permissions');

    // a clock set back: a record minted in the future is not trusted
    now = T0 + 6 * 60 * MIN - 3 * 60 * MIN;
    r = await svc.getToken('writer');
    assert(r.fromCache === false && mints === 5, 'clock set back by 3 hours: the cache is distrusted and a new token is minted');

    // offline at renewal: refuses visibly, no old or other token
    now = now + 70 * MIN;
    mode = 'offline';
    let e = await rejects(() => svc.getToken('writer'));
    assert(e instanceof MakoTokenError && e.code === 'renewal-failed' && /No other login is used instead/.test(e.message), 'offline at renewal: refuses with a clear message');
    assert(!/ghs_/.test(e.message), 'the refusal never contains token text');
    mode = 'bad';
    e = await rejects(() => svc.getToken('writer'));
    assert(e && e.code === 'renewal-failed' && !/ghs_|Bearer A/.test(e.message), 'a library error that quotes a token is scrubbed');
    mode = 'empty';
    e = await rejects(() => svc.getToken('writer'));
    assert(e && e.code === 'renewal-failed', 'an answer without a usable token is a renewal failure');
    mode = 'ok';
    r = await svc.getToken('writer');
    assert(r.fromCache === false && typeof r.token === 'string', 'once the network is back the next call mints again');

    // unknown profile
    e = await rejects(() => svc.getToken('root'));
    assert(e && e.code === 'bad-profile', 'an unknown profile is refused');

    // forget (git erase)
    await svc.forget('writer');
    const before = mints;
    await svc.getToken('writer');
    assert(mints === before + 1, 'after forget (git erase) the next call mints');

    // two simultaneous calls share one mint
    now += 200 * MIN;
    const m0 = mints;
    const [a, b] = await Promise.all([svc.getToken('writer'), svc.getToken('writer')]);
    assert(mints === m0 + 1 && a.token === b.token, 'two simultaneous calls share one mint');
  }
  {
    // a record for another App, installation, repository or permission set is not reused
    const good = { v: 1, appId: 4242, installationId: 777, owner: 'ABlueAI', repo: 'AgentCommandCenter', profile: 'writer', permissionsKey: cfg.profileKey('writer'), token: 't', expiresAt: new Date(T0 + 50 * MIN).toISOString(), mintedAt: new Date(T0).toISOString() };
    assert(recordMatches(good, CONFIG, 'writer'), 'a matching record is accepted');
    for (const [k, v] of [['appId', 1], ['installationId', 1], ['repo', 'Other'], ['owner', 'Someone'], ['profile', 'reader'], ['permissionsKey', 'contents:write'], ['v', 2], ['token', ''], ['expiresAt', 'soon']]) {
      assert(!recordMatches({ ...good, [k]: v }, CONFIG, 'writer'), `a record with a different ${k} is not reused`);
    }
    assert(!recordMatches(null, CONFIG, 'writer') && !recordMatches('x', CONFIG, 'writer'), 'no record, no match');
    assert(usable(good, T0 + 44 * MIN) && !usable(good, T0 + 45 * MIN + 1), 'usable() ends 5 minutes before expiry');
    // a corrupt or unreadable cache is a miss, not an error
    let mints = 0;
    const svc = createTokenService({
      config: CONFIG, now: () => T0, warn() {},
      cache: { read() { throw new Error('EACCES'); }, write() { throw new Error('disk full'); }, remove() {} },
      mint: async () => { mints++; return { token: FAKE_TOKEN(mints), expiresAt: new Date(T0 + 60 * MIN).toISOString() }; },
    });
    const r = await svc.getToken('writer');
    assert(r.token === FAKE_TOKEN(1) && mints === 1, 'an unreadable and unwritable cache still yields a token');
  }
  {
    const warnings = [];
    const svc = createTokenService({
      config: CONFIG, now: () => T0, warn: (l) => warnings.push(l),
      cache: { read: () => null, write() { throw new Error('icacls refused'); }, remove() {} },
      mint: async () => ({ token: FAKE_TOKEN(1), expiresAt: new Date(T0 + 60 * MIN).toISOString() }),
    });
    await svc.getToken('writer');
    assert(warnings.length === 1 && /not cached/.test(warnings[0]) && !/ghs_/.test(warnings[0]), 'a cache that cannot be written is reported, never silent, and never shows the token');
  }

  // --- scrub -------------------------------------------------------------------------------------
  {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEabc\n-----END RSA PRIVATE KEY-----';
    const out = scrub(`x ${pem} y ghp_${'a'.repeat(36)} github_pat_${'b'.repeat(30)} Bearer abcdefghijkl eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiIxMjMifQ.abcdefghij`);
    assert(!/BEGIN|MIIE|ghp_|github_pat_|Bearer a|eyJ/.test(out), 'scrub removes a PEM, PATs, bearer values and a JWT');
    assert(scrub('x'.repeat(500)).length <= 303, 'scrub bounds the length');
  }

  // --- minter: identity validation ------------------------------------------------------------
  {
    const calls = [];
    const grant = cfg.PROFILES.writer;
    function build({ instOverride = {}, reposOverride, permsOverride, installationIdOverride, fetchFail } = {}) {
      const fetchImpl = async (url, init) => {
        calls.push({ url, auth: init && init.headers && init.headers.authorization });
        if (fetchFail) throw new TypeError('fetch failed');
        if (/\/app\/installations\/777$/.test(url)) {
          return { ok: true, status: 200, json: async () => ({ id: 777, app_id: 4242, account: { login: 'ABlueAI' }, repository_selection: 'selected', suspended_at: null, ...instOverride }) };
        }
        if (/\/installation\/repositories/.test(url)) {
          const repos = reposOverride || [{ full_name: 'ABlueAI/AgentCommandCenter' }];
          return { ok: true, status: 200, json: async () => ({ total_count: repos.length, repositories: repos }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      };
      const authCalls = [];
      const loadAuth = async () => ({
        createAppAuth: (o) => async (req) => {
          authCalls.push({ o: { ...o, privateKey: o.privateKey ? '[key]' : undefined }, req });
          if (req.type === 'app') return { type: 'app', token: 'jwt.fake.value' };
          return {
            token: FAKE_TOKEN('m'), expiresAt: new Date(T0 + 60 * MIN).toISOString(),
            installationId: installationIdOverride !== undefined ? installationIdOverride : 777,
            permissions: permsOverride || { ...req.permissions },
          };
        },
      });
      let keyReads = 0;
      const mint = createMinter({ config: CONFIG, getPrivateKey: () => { keyReads++; return 'PEM'; }, fetchImpl, loadAuth });
      return { mint, authCalls, keyReads: () => keyReads };
    }
    let t = build();
    let r = await t.mint({ profile: 'writer' });
    const inst = t.authCalls.find((c) => c.req.type === 'installation');
    assert(r.token === FAKE_TOKEN('m') && inst.req.installationId === 777 && inst.req.refresh === true, 'mints an installation token for the configured installation, bypassing the library cache');
    assert(JSON.stringify(inst.req.repositoryNames) === '["AgentCommandCenter"]', 'the token is limited to the one repository');
    assert(JSON.stringify(inst.req.permissions) === JSON.stringify(cfg.PROFILES.writer), 'the token asks for exactly the writer permissions');
    t = build();
    await t.mint({ profile: 'reader' });
    assert(JSON.stringify(t.authCalls.find((c) => c.req.type === 'installation').req.permissions) === JSON.stringify(cfg.PROFILES.reader), 'a reader token asks for reads only');
    assert(calls.some((c) => /\/installation\/repositories/.test(c.url) && c.auth === `Bearer ${FAKE_TOKEN('m')}`), 'the new token is checked with GET /installation/repositories');
    assert(calls.some((c) => /\/app\/installations\/777$/.test(c.url) && c.auth === 'Bearer jwt.fake.value'), 'the installation is checked with the App JWT');
    assert(!JSON.stringify(t.authCalls).includes('PEM'), 'the key is only handed to the library, never recorded');

    const bad = [
      ['an installation of another App', { instOverride: { app_id: 5 } }, /belongs to App 5/],
      ['a suspended installation', { instOverride: { suspended_at: '2026-11-08T00:00:00Z' } }, /suspended/],
      ['an installation on all repositories', { instOverride: { repository_selection: 'all' } }, /selected repositories/],
      ['an installation on another account', { instOverride: { account: { login: 'someone' } } }, /someone/],
      ['a token that reaches two repositories', { reposOverride: [{ full_name: 'ABlueAI/AgentCommandCenter' }, { full_name: 'ABlueAI/other' }] }, /2 repositories/],
      ['a token that reaches another repository', { reposOverride: [{ full_name: 'ABlueAI/other' }] }, /expected only/],
      ['a token for another installation', { installationIdOverride: 5 }, /different installation/],
      ['broader permissions than asked', { permsOverride: { ...grant, administration: 'write' } }, /different permissions/],
      ['narrower permissions than asked', { permsOverride: { ...grant, contents: 'read' } }, /different permissions/],
    ];
    for (const [label, o, re] of bad) {
      const e = await rejects(() => build(o).mint({ profile: 'writer' }));
      assert(e instanceof MakoTokenError && (e.code === 'identity-mismatch' || e.code === 'suspended'), `${label}: refused`);
      assert(e && re.test(e.message), `${label}: the message says why`);
    }
    const e = await rejects(() => build({ fetchFail: true }).mint({ profile: 'writer' }));
    assert(e && e.code === 'network' && /cannot reach GitHub/.test(e.message), 'offline during validation: refused as a network failure');
    assert(samePermissions({ a: 'read' }, { a: 'read' }) && !samePermissions({ a: 'read', b: 'read' }, { a: 'read' }) && !samePermissions(undefined, { a: 'read' }), 'samePermissions is exact');
    const e2 = await rejects(() => build().mint({ profile: 'admin' }));
    assert(e2 && e2.code === 'bad-profile', 'the minter refuses an unknown profile');
  }

  // --- key store, fingerprint, secure delete ----------------------------------------------------
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const PEM_PKCS1 = privateKey.export({ type: 'pkcs1', format: 'pem' });
  const PEM_PKCS8 = privateKey.export({ type: 'pkcs8', format: 'pem' });
  {
    const fp = fingerprint(PEM_PKCS1);
    assert(/^SHA256:[A-Za-z0-9+/]{43}=$/.test(fp), 'the fingerprint is SHA256:<base64>');
    assert(fp === fingerprint(PEM_PKCS8), 'the same key gives the same fingerprint in PKCS#1 and PKCS#8 form');
    let ref = null;
    try {
      const der = execFileSync('openssl', ['rsa', '-pubout', '-outform', 'DER'], { input: PEM_PKCS1, stdio: ['pipe', 'pipe', 'ignore'] });
      ref = 'SHA256:' + crypto.createHash('sha256').update(der).digest('base64');
    } catch { /* no openssl on this machine */ }
    if (ref) assert(fp === ref, 'the fingerprint equals `openssl rsa -pubout -outform DER | openssl sha256 -binary | openssl base64`');
    else skip('openssl not available');
    assert(checkPem(PEM_PKCS1) === fp, 'checkPem returns the fingerprint of a good key');
    for (const [label, text] of [['not a key', 'hello'], ['empty', ''], ['a public key', publicKey.export({ type: 'spki', format: 'pem' })]]) {
      const e = await rejects(async () => checkPem(text));
      assert(e && e.code === 'bad-pem', `checkPem refuses ${label}`);
    }
    const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
    assert((await rejects(async () => checkPem(ec))).code === 'bad-pem', 'checkPem refuses a non-RSA key');
  }
  {
    const dir = tmp();
    const keyPath = path.join(dir, 'k.dpapi');
    const aclCalls = [];
    // A stand-in for DPAPI: reversible, and visibly not the plaintext.
    const protect = (b) => Buffer.from(Buffer.from(b).toString('hex').split('').reverse().join(''), 'utf8');
    const unprotect = (b) => Buffer.from(b.toString('utf8').split('').reverse().join(''), 'hex');
    const ks = createKeyStore({ fs, keyPath, protect, unprotect, acl: (p) => aclCalls.push(p) });
    assert(!ks.exists(), 'no key yet');
    const e = await rejects(async () => ks.load());
    assert(e && e.code === 'no-key' && /mako-token import/.test(e.message), 'loading without a key says how to import one');
    ks.save(PEM_PKCS1);
    const onDisk = fs.readFileSync(keyPath, 'utf8');
    assert(ks.exists() && !onDisk.includes('BEGIN') && !onDisk.includes(PEM_PKCS1.slice(40, 80)), 'the key on disk is the protected blob, not the PEM');
    assert(aclCalls.length === 1, 'the key file is restricted to the current user');
    assert(ks.load() === PEM_PKCS1, 'the key reads back');
    assert(fs.readdirSync(dir).length === 1, 'no temp file is left behind');
    // an ACL failure stores nothing
    const ks2 = createKeyStore({ fs, keyPath: path.join(dir, 'k2.dpapi'), protect, unprotect, acl: () => { throw new MakoTokenError('acl-failed', 'no'); } });
    const e2 = await rejects(async () => ks2.save(PEM_PKCS1));
    assert(e2 && e2.code === 'acl-failed' && !fs.existsSync(path.join(dir, 'k2.dpapi')) && fs.readdirSync(dir).length === 1, 'if the file cannot be locked down, nothing is kept');
    ks.remove();
    assert(!ks.exists(), 'remove deletes the key');

    // secure delete
    const pemFile = path.join(dir, 'k.pem');
    fs.writeFileSync(pemFile, PEM_PKCS1);
    assert(secureDelete(fs, pemFile).ok && !fs.existsSync(pemFile), 'secureDelete removes the file');
    assert(secureDelete(fs, pemFile).ok === false, 'secureDelete reports a file it could not delete');

    // non-Windows platforms refuse real DPAPI visibly
    const e3 = await rejects(async () => windowsDpapi('protect', Buffer.from('x'), { platform: 'linux' }));
    assert(e3 && e3.code === 'unsupported-platform', 'DPAPI on a non-Windows platform is refused, not faked');
    // PowerShell is started by absolute path under the system directory, never by a bare name
    const sysRoot = process.platform === 'win32' ? 'C:\\Windows' : '/win';
    let target = null;
    windowsDpapi('protect', Buffer.from('x'), { platform: 'win32', env: { SystemRoot: sysRoot }, exists: () => true, spawn: (c) => { target = c; return { status: 0, stdout: 'AA==' }; } });
    assert(target === path.join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') && path.isAbsolute(target), 'DPAPI starts PowerShell by ABSOLUTE path under the system directory, never a bare name');
    const e4 = await rejects(async () => windowsDpapi('protect', Buffer.from('x'), { platform: 'win32', env: { SystemRoot: sysRoot }, exists: () => false, spawn: () => { throw new Error('must not run'); } }));
    assert(e4 && e4.code === 'system-exe-missing', 'a missing PowerShell refuses visibly');
    assert(!/(?:spawn(?:Sync)?|run|execFile(?:Sync)?)\(\s*'(?:powershell|icacls|cmd)/.test(fs.readFileSync(path.join(__dirname, 'mako-token', 'keystore.js'), 'utf8') + fs.readFileSync(path.join(__dirname, 'mako-token', 'acl.js'), 'utf8')), 'no spawn or run of a bare powershell, icacls or cmd name remains in keystore.js or acl.js');
  }

  // --- the file cache ----------------------------------------------------------------------------
  {
    const dir = path.join(tmp(), 'token-cache');
    const acls = [];
    const c = createFileCache({ fs, dir, acl: (d) => acls.push(d) });
    assert(c.read('writer') === null, 'an empty cache reads as nothing');
    c.write('writer', { v: 1, token: 't' });
    c.write('writer', { v: 1, token: 't2' });
    assert(acls.length === 1 && acls[0] === dir, 'the folder is locked down once, before the first token is written');
    assert(c.read('writer').token === 't2' && fs.readdirSync(dir).join() === 'token-writer.json', 'an atomic write leaves one file');
    c.remove('writer');
    assert(c.read('writer') === null, 'remove empties it');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'token-writer.json'), '{not json');
    assert(c.read('writer') === null, 'a corrupt cache reads as nothing');
    const dir2 = path.join(tmp(), 'token-cache');
    const c2 = createFileCache({ fs, dir: dir2, acl: () => { throw new MakoTokenError('acl-failed', 'denied'); } });
    const e = await rejects(async () => c2.write('writer', { token: 'SECRET' }));
    assert(e && e.code === 'acl-failed' && !fs.existsSync(path.join(dir2, 'token-writer.json')), 'if the folder cannot be locked down, no token is written');
  }
  if (process.platform === 'win32') {
    const dir = path.join(tmp(), 'locked');
    fs.mkdirSync(dir);
    restrictToCurrentUser(dir, { fs });
    const listing = execFileSync('icacls.exe', [dir], { encoding: 'utf8' });
    assert(/\(OI\)\(CI\)\(F\)/.test(listing), 'icacls: the current user has full control, inherited by files');
    assert(!/Everyone|BUILTIN\\Users|Authenticated Users/i.test(listing), 'icacls: Everyone, Users and Authenticated Users have no access');
    fs.writeFileSync(path.join(dir, 'f.txt'), 'x');
    assert(fs.readFileSync(path.join(dir, 'f.txt'), 'utf8') === 'x', 'the current user can still use the folder');
  } else {
    const dir = tmp();
    restrictToCurrentUser(dir, { fs });
    assert((fs.statSync(dir).mode & 0o077) === 0, 'non-Windows: the folder is mode 0700');
    const e = await rejects(async () => restrictToCurrentUser(dir, { fs, platform: 'win32', env: {} }));
    assert(e && e.code === 'acl-failed', 'Windows without a USERNAME refuses');
    const root = '/win'; // an absolute path on this OS; only the shape matters for these fakes
    const exe = path.join(root, 'System32', 'icacls.exe');
    const e2 = await rejects(async () => restrictToCurrentUser(dir, { fs, platform: 'win32', env: { USERNAME: 'b', SystemRoot: root }, exists: () => true, run: () => { throw new Error('Access is denied'); } }));
    assert(e2 && e2.code === 'acl-failed', 'an icacls failure refuses');
    let argv = null; let called = null;
    restrictToCurrentUser(dir, { fs, platform: 'win32', env: { USERNAME: 'blue', USERDOMAIN: 'PC1', SystemRoot: root }, exists: () => true, run: (c, a) => { called = c; argv = a; } });
    assert(argv && argv.includes('/inheritance:r') && argv.includes('PC1\\blue:(OI)(CI)F'), 'icacls is called to drop inheritance and grant only this user');
    assert(called === exe && path.isAbsolute(called), 'icacls is started by ABSOLUTE path under System32, never a bare name (a worktree could hold an icacls.exe)');
    const e3 = await rejects(async () => restrictToCurrentUser(dir, { fs, platform: 'win32', env: { USERNAME: 'blue', SystemRoot: root }, exists: () => false, run: () => { throw new Error('must not run'); } }));
    assert(e3 && e3.code === 'system-exe-missing', 'a missing icacls.exe refuses visibly');
  }
  if (process.platform === 'win32') {
    const blob = windowsDpapi('protect', Buffer.from('hello key'));
    assert(blob.length > 20 && !blob.includes(Buffer.from('hello key')), 'real DPAPI: the blob is not the plaintext');
    assert(windowsDpapi('unprotect', blob).toString() === 'hello key', 'real DPAPI: it opens again for the same user');
    const ksDir = tmp();
    const ks = createKeyStore({ fs, keyPath: path.join(ksDir, 'real.dpapi') });
    ks.save(PEM_PKCS1);
    assert(ks.load() === PEM_PKCS1 && !fs.readFileSync(path.join(ksDir, 'real.dpapi'), 'utf8').includes('PRIVATE KEY'), 'real DPAPI key store: round trip, no plaintext on disk');
  } else skip('real DPAPI runs on Windows CI only');

  // --- import: the whole command with fakes ------------------------------------------------------
  {
    function world({ appOverride = {}, installs, botId = 99001 } = {}) {
      const dir = tmp();
      const layout = { dataDir: path.join(dir, 'Mako'), configPath: path.join(dir, 'Mako', 'mako-agents.json'), keyPath: path.join(dir, 'Mako', 'k.dpapi'), cacheDir: path.join(dir, 'cache') };
      const pemPath = path.join(dir, 'mako-agents.private-key.pem');
      fs.writeFileSync(pemPath, PEM_PKCS1);
      const protect = (b) => Buffer.from(Buffer.from(b).toString('hex'), 'utf8');
      const unprotect = (b) => Buffer.from(b.toString('utf8'), 'hex');
      const keystore = createKeyStore({ fs, keyPath: layout.keyPath, protect, unprotect, acl: () => {} });
      const cache = createFileCache({ fs, dir: layout.cacheDir, acl: () => {} });
      const urls = [];
      const fetchImpl = async (url) => {
        urls.push(url);
        const ok = (body) => ({ ok: true, status: 200, json: async () => body });
        if (/\/app$/.test(url)) return ok({ id: 4242, slug: 'mako-agents', owner: { login: 'ABlueAI' }, ...appOverride });
        if (/\/app\/installations$/.test(url)) return ok(installs || [{ id: 777, account: { login: 'ABlueAI' } }]);
        if (/\/users\/mako-agents%5Bbot%5D$/.test(url)) return ok({ id: botId });
        if (/\/app\/installations\/777$/.test(url)) return ok({ id: 777, app_id: 4242, account: { login: 'ABlueAI' }, repository_selection: 'selected', suspended_at: null });
        if (/\/installation\/repositories/.test(url)) return ok({ total_count: 1, repositories: [{ full_name: 'ABlueAI/AgentCommandCenter' }] });
        return { ok: false, status: 404, json: async () => ({}) };
      };
      const loadAuth = async () => ({
        createAppAuth: (o) => {
          if (!o.privateKey || !o.privateKey.includes('PRIVATE KEY')) throw new Error('no key');
          return async (req) => (req.type === 'app'
            ? { token: 'jwt.fake.value' }
            : { token: FAKE_TOKEN('i'), expiresAt: new Date(T0 + 60 * MIN).toISOString(), installationId: 777, permissions: { ...req.permissions } });
        },
      });
      const lines = [];
      return { dir, layout, pemPath, keystore, cache, fetchImpl, loadAuth, lines, urls, run: (extra = {}) => importKey({ pemPath, appId: 4242, fs, layout, keystore, cache, fetchImpl, loadAuth, out: (l) => lines.push(l), ...extra }) };
    }
    let w = world();
    fs.mkdirSync(w.layout.cacheDir, { recursive: true });
    fs.writeFileSync(path.join(w.layout.cacheDir, 'token-writer.json'), '{"old":true}');
    const res = await w.run();
    const out = w.lines.join('\n');
    assert(!fs.existsSync(w.pemPath), 'import deletes the PEM file');
    assert(w.keystore.exists() && w.keystore.load() === PEM_PKCS1, 'import stores the key so it reads back');
    const saved = JSON.parse(fs.readFileSync(w.layout.configPath, 'utf8'));
    assert(JSON.stringify(saved) === JSON.stringify(CONFIG), 'import writes the non-secret config (App ID, installation, slug, bot ID, repository)');
    assert(out.includes(fingerprint(PEM_PKCS1)) && res.fingerprint === fingerprint(PEM_PKCS1), 'import prints the SHA-256 fingerprint to compare with the App page');
    assert(/Compare it with the fingerprint/.test(out) && /mako-agents\[bot\] <99001\+mako-agents\[bot\]@users\.noreply\.github\.com>/.test(out), 'import says what to compare and prints the bot identity');
    assert(!/BEGIN|PRIVATE KEY|ghs_|jwt\.fake|MII/.test(out + JSON.stringify(saved)), 'no PEM, JWT or token in the output or the config');
    assert(!fs.existsSync(path.join(w.layout.cacheDir, 'token-writer.json')), 'import drops any older cached token');
    assert(!w.urls.some((u) => /token/.test(u) && /pem/i.test(u)), 'the PEM is never put in a URL');

    w = world();
    let e = await rejects(() => w.run({ appId: 1 }));
    assert(e && e.code === 'identity-mismatch' && fs.existsSync(w.pemPath) && !w.keystore.exists() && !fs.existsSync(w.layout.configPath), 'wrong App ID: refused, nothing stored, the PEM is kept for a retry');
    w = world({ appOverride: { owner: { login: 'someone-else' } } });
    e = await rejects(() => w.run());
    assert(e && e.code === 'identity-mismatch' && fs.existsSync(w.pemPath) && !w.keystore.exists(), 'an App owned by someone else: refused');
    w = world({ installs: [{ id: 1, account: { login: 'ABlueAI' } }, { id: 2, account: { login: 'other' } }] });
    e = await rejects(() => w.run());
    assert(e && e.code === 'identity-mismatch' && !w.keystore.exists(), 'two installations: refused (it must be installed on this repository only)');
    w = world();
    fs.writeFileSync(w.pemPath, 'not a key');
    e = await rejects(() => w.run());
    assert(e && e.code === 'bad-pem' && fs.existsSync(w.pemPath) && !/not a key/.test(e.message), 'a bad PEM: refused without echoing it');
    w = world();
    e = await rejects(() => w.run({ appId: undefined }));
    assert(e && e.code === 'bad-args', 'a missing App ID is a usage error');
    w = world();
    await w.run();
    fs.writeFileSync(w.pemPath, PEM_PKCS1);
    e = await rejects(() => w.run());
    assert(e && e.code === 'key-exists' && fs.existsSync(w.pemPath), 'a second import without --replace is refused (one key per PC)');
    await w.run({ replace: true });
    assert(!fs.existsSync(w.pemPath), '--replace imports again');
    w = world();
    e = await rejects(() => w.run({ fs: Object.assign(Object.create(fs), { unlinkSync(p) { if (p === w.pemPath) throw new Error('EBUSY'); return fs.unlinkSync(p); } }) }));
    assert(e && e.code === 'pem-not-deleted' && e.message.includes(w.pemPath) && w.keystore.exists(), 'a PEM that cannot be deleted is a visible failure naming the file');
    w = world();
    e = await rejects(() => w.run({ keystore: { exists: () => false, save() {}, load: () => 'something else', remove() {} } }));
    assert(e && e.code === 'dpapi-failed' && fs.existsSync(w.pemPath), 'a key that does not read back the same is refused and the PEM is kept');
  }

  // --- git credential helper protocol -----------------------------------------------------------
  {
    const input = 'protocol=https\nhost=github.com\npath=ABlueAI/AgentCommandCenter.git\n';
    assert(JSON.stringify(parseKv(input)) === '{"protocol":"https","host":"github.com","path":"ABlueAI/AgentCommandCenter.git"}', 'parseKv reads git\'s key=value lines');
    const run = async (action, stdinText, getToken) => {
      let out = ''; const forgets = [];
      const code = await gitHelper({ action, stdinText, getToken, forget: async (p) => forgets.push(p), profile: 'writer', stdout: { write: (s) => { out += s; } } });
      return { code, out, forgets };
    };
    let r = await run('get', input, async (p) => ({ token: FAKE_TOKEN(p) }));
    assert(r.code === 0 && r.out === `username=x-access-token\npassword=${FAKE_TOKEN('writer')}\n`, 'get: x-access-token and the token');
    r = await run('get', 'protocol=https\nhost=example.com\n', async () => { throw new Error('must not mint'); });
    assert(r.code === 0 && r.out === '', 'get for another host: no credential and no token minted');
    r = await run('get', 'protocol=http\nhost=github.com\n', async () => { throw new Error('must not mint'); });
    assert(r.code === 0 && r.out === '', 'get over plain http: no credential');
    r = await run('store', input + 'username=x\npassword=y\n', async () => { throw new Error('must not mint'); });
    assert(r.code === 0 && r.out === '', 'store: nothing is remembered');
    r = await run('erase', input, async () => { throw new Error('must not mint'); });
    assert(r.forgets.join() === 'writer' && r.out === '', 'erase: the cached token is dropped');
    const e = await rejects(() => run('get', input, async () => { throw new MakoTokenError('renewal-failed', 'offline'); }));
    assert(e && e.code === 'renewal-failed', 'get with a renewal failure throws (the CLI then exits non-zero with no output)');
  }

  process.stdout.write(`\nmako-token: ${passed} passed, ${failed} failed, ${skipped} skipped\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { process.stderr.write(`mako-token test crashed: ${e && e.stack}\n`); process.exit(1); });
