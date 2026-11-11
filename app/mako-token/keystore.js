'use strict';
// S35 mako-token: where the App's private key lives, and how it is protected.
//
// ONE key per PC, never copied. It is stored only as a Windows DPAPI blob (current user) in
// %APPDATA%\Mako\mako-agents.key.dpapi. Both the standalone CLI and the helpers Mako runs for panes
// open it in their own short-lived process, only when a new token must be minted (a valid cached token
// needs no key). Electron's safeStorage is deliberately not used for this file: the git helper and gh
// shim run outside Electron, where safeStorage does not exist, and a second copy of the key in another
// format would break "one key, never copied".
//
// Honest limit: this keeps the file from being copied off the PC and read elsewhere. It does not
// stop another process running as the same Windows user from asking DPAPI to open it.

const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { MakoTokenError, scrub } = require('./errors');
const { restrictToCurrentUser } = require('./acl');
const { resolvePowerShell } = require('./winexe');

const DPAPI_SCRIPT = path.join(__dirname, 'dpapi.ps1');

/** Real DPAPI through Windows PowerShell 5.1. Data moves only over stdin and stdout, as base64. */
function windowsDpapi(mode, buffer, { platform = process.platform, spawn = spawnSync, env = process.env, exists } = {}) {
  if (platform !== 'win32') throw new MakoTokenError('unsupported-platform', 'the App key is protected with Windows DPAPI; this works on Windows only');
  const powershell = resolvePowerShell(env, exists); // absolute path, never a bare name (winexe.js)
  const r = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', DPAPI_SCRIPT, mode], {
    input: buffer.toString('base64'), encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 20,
  });
  if (r.error || r.status !== 0) {
    throw new MakoTokenError('dpapi-failed', `Windows could not ${mode} the App key (${scrub((r.error && r.error.message) || r.stderr || `exit ${r.status}`)})`);
  }
  return Buffer.from(String(r.stdout).trim(), 'base64');
}

/** SHA-256 of the private key's public half (DER), as "SHA256:<base64>", the form GitHub shows. */
function fingerprint(pem) {
  const priv = crypto.createPrivateKey(pem);
  const der = crypto.createPublicKey(priv).export({ type: 'spki', format: 'der' });
  return 'SHA256:' + crypto.createHash('sha256').update(der).digest('base64');
}

/** A PEM the App could use: parseable, unencrypted, RSA. Returns its fingerprint. Never echoes it. */
function checkPem(pem) {
  let key;
  try { key = crypto.createPrivateKey(pem); }
  catch { throw new MakoTokenError('bad-pem', 'that file is not an unencrypted PEM private key'); }
  if (key.asymmetricKeyType !== 'rsa') throw new MakoTokenError('bad-pem', 'that private key is not an RSA key (GitHub App keys are RSA)');
  return fingerprint(pem);
}

function createKeyStore({ fs, keyPath, protect, unprotect, env = process.env, platform = process.platform, acl = restrictToCurrentUser }) {
  const p = protect || ((b) => windowsDpapi('protect', b, { platform, env }));
  const u = unprotect || ((b) => windowsDpapi('unprotect', b, { platform, env }));
  const dir = path.dirname(keyPath);
  return {
    exists() { return fs.existsSync(keyPath); },
    save(pem) {
      const blob = p(Buffer.from(pem, 'utf8'));
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${keyPath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, blob.toString('base64'), { mode: 0o600 });
      try { acl(tmp, { fs, env, platform }); } catch (e) { try { fs.unlinkSync(tmp); } catch { /* best effort */ } throw e; }
      fs.renameSync(tmp, keyPath);
    },
    load() {
      let text;
      try { text = fs.readFileSync(keyPath, 'utf8'); }
      catch { throw new MakoTokenError('no-key', 'the App key is not imported on this PC; run: mako-token import <path to the .pem> (docs/MAKO-TOKEN.md)'); }
      return u(Buffer.from(text.trim(), 'base64')).toString('utf8');
    },
    remove() { try { fs.unlinkSync(keyPath); } catch { /* already gone */ } },
  };
}

/** Overwrite with zeros, then delete. Best effort on an SSD (wear levelling and snapshots can keep copies). */
function secureDelete(fs, file) {
  try {
    const size = fs.statSync(file).size;
    fs.writeFileSync(file, Buffer.alloc(size));
    fs.unlinkSync(file);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: scrub(e && e.message) };
  }
}

module.exports = { createKeyStore, windowsDpapi, fingerprint, checkPem, secureDelete, DPAPI_SCRIPT };
