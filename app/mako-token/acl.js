'use strict';
// S35 mako-token: make a folder readable by the current Windows user only (icacls: drop inherited
// permissions, grant this user full control). On other platforms, mode 0700. A failure THROWS: the
// token cache is never written to a folder that could not be locked down.

const { execFileSync } = require('child_process');
const { MakoTokenError, scrub } = require('./errors');

function currentUserSpec(env) {
  const user = env.USERNAME;
  if (!user) throw new MakoTokenError('acl-failed', 'cannot lock down the folder: USERNAME is not set');
  const domain = env.USERDOMAIN;
  const spec = domain ? `${domain}\\${user}` : user;
  if (/[:(),*\r\n"]/.test(spec)) throw new MakoTokenError('acl-failed', 'cannot lock down the folder: the user name has characters icacls cannot take');
  return spec;
}

function restrictToCurrentUser(dir, { fs, env = process.env, platform = process.platform, run = execFileSync } = {}) {
  if (platform !== 'win32') { fs.chmodSync(dir, 0o700); return; }
  const spec = currentUserSpec(env);
  try {
    run('icacls.exe', [dir, '/inheritance:r', '/grant:r', `${spec}:(OI)(CI)F`], { stdio: 'pipe', windowsHide: true });
  } catch (e) {
    throw new MakoTokenError('acl-failed', `could not restrict ${dir} to your Windows user (icacls: ${scrub(e && e.message)})`);
  }
}

module.exports = { restrictToCurrentUser, currentUserSpec };
