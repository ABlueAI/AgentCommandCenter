'use strict';
// Run: node app/pane-status/pane-status-lock.test.js
//
// The lock, and above all the things it REFUSES to do. Age is never evidence; a recycled PID is never
// mistaken for the original owner; and a `finally` may only remove a lock it created and still owns.

const fs = require('fs');
const os = require('os');
const path = require('path');
const lockMod = require('./pane-status-lock');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-lock-'));
const INSTALL = 'a'.repeat(32);
let clock = 5000;
function makeLock(over) {
  const dir = fs.mkdtempSync(path.join(root, 'sd-'));
  return lockMod.createPaneStatusLock(Object.assign({
    installId: INSTALL, settingsDir: dir, now: () => clock, log: () => {},
  }, over || {}));
}

// ---------------------------------------------------------------- in-process mutex
{
  const lock = makeLock();
  const order = [];
  const a = lock.withMutex(async () => { order.push('a-start'); await new Promise((r) => setTimeout(r, 40)); order.push('a-end'); });
  const b = lock.withMutex(async () => { order.push('b-start'); });
  Promise.all([a, b]).then(() => {
    assert(order.join(',') === 'a-start,a-end,b-start', 'the in-process mutex serializes overlapping critical sections');
    phase2();
  });
}

function phase2() {
  // ---------------------------------------------------------------- exclusive create
  {
    const lock = makeLock();
    const h1 = lock.acquire();
    assert(h1.ok === true && h1.createdByUs === true, 'acquire creates the lock');
    assert(fs.existsSync(lock.lockPath()), 'the lock file exists on disk');
    const h2 = lock.acquire();
    assert(h2.ok === false && h2.reason === lockMod.LOCK_REFUSAL.HELD, 'a second acquire is REFUSED while held');
    assert(lock.release(h1).ok === true, 'release removes it');
    assert(!fs.existsSync(lock.lockPath()), 'and the file is gone');
    assert(lock.acquire().ok === true, 'it can be acquired again afterwards');
  }

  // ---------------------------------------------------------------- release is ownership-checked
  {
    const lock = makeLock();
    const h = lock.acquire();
    assert(lock.release({ createdByUs: false }).ok === false, 'release refuses a handle we did not create');
    fs.writeFileSync(lock.lockPath(), 'somebody else replaced this\n');
    const r = lock.release(h);
    assert(r.ok === false && r.reason === lockMod.LOCK_REFUSAL.CHANGED,
      'release refuses when the bytes changed — it is no longer our lock to delete');
    assert(fs.existsSync(lock.lockPath()), 'and the replacement is left in place');
  }

  // ---------------------------------------------------------------- identity content
  {
    const lock = makeLock();
    const h = lock.acquire();
    const seen = lock.inspect();
    assert(seen.ok === true, 'inspect parses the lock');
    assert(seen.value.installId === INSTALL, 'lock identity carries the install id');
    assert(seen.value.pid === process.pid, 'lock identity carries the PID');
    assert(typeof seen.value.processStartTimeMs === 'number', 'lock identity carries the process START TIME');
    assert(seen.value.createdAtMs === clock, 'lock identity carries its creation time');
    lock.release(h);
  }

  // ---------------------------------------------------------------- clearStaleLock refusals
  (async () => {
    // (1) another installation's lock is never cleared
    {
      const lock = makeLock({ resolveProcessStartTime: async () => ({ ok: true, running: false }) });
      fs.writeFileSync(lock.lockPath(), lockMod.serialize(lockMod.buildLockBody({
        installId: 'b'.repeat(32), pid: 999999, processStartTimeMs: 1, createdAtMs: 1,
      })));
      const r = await lock.confirmClearStaleLock();
      assert(r.ok === false && r.reason === lockMod.LOCK_REFUSAL.NOT_OURS,
        'a lock owned by ANOTHER installation is never cleared, however dead it looks');
      assert(fs.existsSync(lock.lockPath()), 'and it is left on disk');
    }

    // (2) liveness unknown -> refuse
    {
      const lock = makeLock({ resolveProcessStartTime: async () => ({ ok: false }) });
      const h = lock.acquire();
      const r = await lock.confirmClearStaleLock();
      assert(r.ok === false && r.reason === lockMod.LOCK_REFUSAL.LIVENESS_UNKNOWN,
        'unknown liveness is a REFUSAL — unknown is not permission');
      assert(fs.existsSync(lock.lockPath()), 'the lock survives');
      lock.release(h);
    }

    // (3) no resolver at all -> refuse
    {
      const lock = makeLock();
      lock.acquire();
      const r = await lock.confirmClearStaleLock();
      assert(r.ok === false && r.reason === lockMod.LOCK_REFUSAL.LIVENESS_UNKNOWN, 'no resolver means refuse');
    }

    // (4) owner alive with MATCHING start time -> refuse
    {
      const lock = makeLock({});
      const h = lock.acquire();
      const seen = lock.inspect();
      const alive = makeLockAt(lock, { ok: true, running: true, startTimeMs: seen.value.processStartTimeMs });
      const r = await alive.confirmClearStaleLock();
      assert(r.ok === false && r.reason === lockMod.LOCK_REFUSAL.OWNER_ALIVE,
        'a live owner whose START TIME matches is refused');
      lock.release(h);
    }

    // (5) PID REUSE: pid exists but started at a different time -> the original owner is gone, clear it
    {
      const lock = makeLock({});
      lock.acquire();
      const seen = lock.inspect();
      const recycled = makeLockAt(lock, {
        ok: true, running: true, startTimeMs: seen.value.processStartTimeMs + 60 * 60 * 1000,
      });
      const r = await recycled.confirmClearStaleLock();
      assert(r.ok === true, 'a RECYCLED pid (same number, different start time) proves the owner is gone');
      assert(!fs.existsSync(lock.lockPath()), 'so the stale lock is cleared');
    }

    // (6) dead owner -> clear
    {
      const lock = makeLock({});
      lock.acquire();
      const dead = makeLockAt(lock, { ok: true, running: false });
      assert((await dead.confirmClearStaleLock()).ok === true, 'a confirmed-dead owner allows the lock to be cleared');
    }

    // (7) bytes changed between inspect and unlink -> refuse
    {
      const lock = makeLock({});
      lock.acquire();
      const racing = lockMod.createPaneStatusLock({
        installId: INSTALL,
        settingsDir: path.dirname(lock.lockPath()),
        now: () => clock,
        log: () => {},
        resolveProcessStartTime: async () => {
          // simulate a third party replacing the lock DURING the liveness check
          fs.writeFileSync(lock.lockPath(), lockMod.serialize(lockMod.buildLockBody({
            installId: INSTALL, pid: 4242, processStartTimeMs: 7, createdAtMs: 7,
          })));
          return { ok: true, running: false };
        },
      });
      const r = await racing.confirmClearStaleLock();
      assert(r.ok === false && r.reason === lockMod.LOCK_REFUSAL.CHANGED,
        'a lock replaced between the check and the delete is NOT deleted');
    }

    // (8) a live PID with an UNKNOWN start time is refused, not assumed recycled
    {
      const lock = makeLock({});
      lock.acquire();
      const murky = makeLockAt(lock, { ok: true, running: true, startTimeMs: null });
      const r = await murky.confirmClearStaleLock();
      assert(r.ok === false && r.reason === lockMod.LOCK_REFUSAL.LIVENESS_UNKNOWN,
        'a live PID whose start time cannot be read is REFUSED, never assumed to be a recycled pid');
      assert(fs.existsSync(lock.lockPath()), 'and the lock survives');
    }

    // (9) AGE ALONE NEVER BREAKS A LOCK. A year-old lock whose owner is alive is still refused, and the
    // module contains no age threshold to consult.
    {
      const lock = makeLock({});
      const h = lock.acquire();
      const seen = lock.inspect();
      clock += 365 * 24 * 60 * 60 * 1000;                        // a year later
      const alive = makeLockAt(lock, { ok: true, running: true, startTimeMs: seen.value.processStartTimeMs });
      const r = await alive.confirmClearStaleLock();
      assert(r.ok === false && r.reason === lockMod.LOCK_REFUSAL.OWNER_ALIVE,
        'a YEAR-old lock with a live owner is still refused — age is not evidence');
      const moduleSource = fs.readFileSync(path.join(__dirname, 'pane-status-lock.js'), 'utf8');
      assert(!/maxAge|ageMs|staleAfter|LOCK_TTL|expire/i.test(moduleSource),
        'the lock module contains no age/TTL/expiry threshold at all');
      lock.release(h);
    }

    // ---------------------------------------------------------------- malformed lock
    {
      const lock = makeLock({ resolveProcessStartTime: async () => ({ ok: true, running: false }) });
      fs.writeFileSync(lock.lockPath(), 'not json');
      const r = await lock.confirmClearStaleLock();
      assert(r.ok === false && r.reason === lockMod.LOCK_REFUSAL.MALFORMED, 'a malformed lock is refused, not deleted');
      assert(fs.existsSync(lock.lockPath()), 'and left alone');
    }

    // missing lock
    {
      const lock = makeLock({ resolveProcessStartTime: async () => ({ ok: true, running: false }) });
      assert((await lock.confirmClearStaleLock()).reason === lockMod.LOCK_REFUSAL.MISSING, 'no lock to clear is MISSING');
    }

    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
    process.stdout.write(`\npane-status-lock: ${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
  })();
}

// Build a second lock instance over the SAME directory with a chosen liveness resolver.
function makeLockAt(lock, liveness) {
  return lockMod.createPaneStatusLock({
    installId: INSTALL,
    settingsDir: path.dirname(lock.lockPath()),
    now: () => clock,
    log: () => {},
    resolveProcessStartTime: async () => liveness,
  });
}
