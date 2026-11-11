'use strict';
// S35 mako-token: the on-disk token cache. One small JSON file per profile in a per-user folder
// (%LOCALAPPDATA%\Mako\token-cache) that is locked to the current Windows user with icacls before
// the first token is written. The folder is created on first write; if it cannot be locked down the
// write throws and nothing is cached. Writes are atomic (temp file, then rename).

const path = require('path');
const { restrictToCurrentUser } = require('./acl');

function createFileCache({ fs, dir, env = process.env, platform = process.platform, acl = restrictToCurrentUser }) {
  const fileFor = (profile) => path.join(dir, `token-${profile}.json`);
  let locked = false;
  return {
    read(profile) {
      try { return JSON.parse(fs.readFileSync(fileFor(profile), 'utf8')); }
      catch { return null; }
    },
    write(profile, record) {
      if (!locked) {
        fs.mkdirSync(dir, { recursive: true });
        acl(dir, { fs, env, platform });
        locked = true;
      }
      const tmp = `${fileFor(profile)}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(record), { mode: 0o600 });
      fs.renameSync(tmp, fileFor(profile));
    },
    remove(profile) { try { fs.unlinkSync(fileFor(profile)); } catch { /* nothing cached */ } },
    removeAll() {
      for (const p of ['writer', 'reader']) try { fs.unlinkSync(fileFor(p)); } catch { /* nothing cached */ }
    },
  };
}

module.exports = { createFileCache };
