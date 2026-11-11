'use strict';
// S35 mako-token: the token service. Pure logic with every effect injected (clock, cache, minter),
// so expiry, sleep and wake, offline and renewal failure are tested with a fake clock.
//
//   getToken(profile) -> { token, expiresAt, fromCache }
//
// A cached token is reused until REFRESH_MARGIN_MS (5 minutes) before its expires_at. After sleep or
// expiry the cache fails that test and a new token is minted. A cache whose record doesn't match the
// current config, profile or permissions, or that looks minted in the future (clock set back), is
// not trusted. If minting fails the call REFUSES with a clear message: there is no fallback to an
// older token, a stored login, a PAT or ABlueAI.

const cfg = require('./config');
const { MakoTokenError, scrub } = require('./errors');

function isIso(s) { return typeof s === 'string' && Number.isFinite(Date.parse(s)); }

function recordMatches(rec, config, profile) {
  return !!rec && rec.v === 1
    && rec.appId === config.appId && rec.installationId === config.installationId
    && rec.owner === config.owner && rec.repo === config.repo
    && rec.profile === profile && rec.permissionsKey === cfg.profileKey(profile)
    && typeof rec.token === 'string' && rec.token.length > 0
    && isIso(rec.expiresAt) && isIso(rec.mintedAt);
}

// A cache file is only as trustworthy as the user account that can write it, so what is read back is checked
// against what a real installation token looks like: `ghs_` plus URL-safe characters, and a lifetime of at
// most one hour. A forged record (any string as the token, an expiry in 2099) fails and a real token is minted.
const INSTALLATION_TOKEN_RE = /^ghs_[A-Za-z0-9_]{20,255}$/;
const MAX_LIFETIME_MS = 60 * 60 * 1000;
// expiresAt is GitHub's clock and mintedAt is this PC's, so a slow or fast PC clock widens the apparent lifetime.
// The check only has to reject far-future forgeries, so it allows 10 minutes of clock difference.
const LIFETIME_TOLERANCE_MS = 10 * 60 * 1000;

function usable(rec, nowMs) {
  const exp = Date.parse(rec.expiresAt);
  const minted = Date.parse(rec.mintedAt);
  if (!INSTALLATION_TOKEN_RE.test(rec.token)) return false;
  if (minted > nowMs + cfg.MAX_CLOCK_SKEW_MS) return false; // the clock went backwards: don't trust it
  if (exp - minted > MAX_LIFETIME_MS + LIFETIME_TOLERANCE_MS) return false; // longer than GitHub ever issues
  // Freshness is judged on THIS PC's clock with an upper bound: a token minted at local time m lives at most an
  // hour of real time, so it is never treated as valid past m + 1 hour even if GitHub's expiresAt (a different
  // clock) says later. That keeps a slow PC clock from handing out a token after it has really expired.
  const effectiveExp = Math.min(exp, minted + MAX_LIFETIME_MS);
  return effectiveExp - nowMs > cfg.REFRESH_MARGIN_MS;
}

/**
 * createTokenService({ config, cache, mint, now, warn })
 *   cache: { read(profile) -> record|null, write(profile, record), remove(profile) }
 *   mint:  async ({ profile }) -> { token, expiresAt }       (throws on any failure)
 *   now:   () -> epoch ms
 *   warn:  (line) -> void   for a cache that could not be written (the token is still returned)
 */
function createTokenService({ config, cache, mint, now, warn }) {
  const inflight = new Map();
  const clock = typeof now === 'function' ? now : Date.now;
  const say = typeof warn === 'function' ? warn : () => {};

  async function mintAndStore(profile) {
    let minted;
    try {
      minted = await mint({ profile });
    } catch (e) {
      if (e instanceof MakoTokenError) throw e;
      throw new MakoTokenError('renewal-failed',
        `could not get a new GitHub App token (${scrub(e && e.message)}). `
        + 'No other login is used instead; fix the cause (network, key, App installation) and try again.');
    }
    if (!minted || typeof minted.token !== 'string' || !minted.token || !isIso(minted.expiresAt)) {
      throw new MakoTokenError('renewal-failed', 'GitHub answered without a usable token; no other login is used instead.');
    }
    const record = {
      v: 1, appId: config.appId, installationId: config.installationId, owner: config.owner, repo: config.repo,
      profile, permissionsKey: cfg.profileKey(profile), token: minted.token,
      expiresAt: minted.expiresAt, mintedAt: new Date(clock()).toISOString(),
    };
    try { await cache.write(profile, record); }
    catch (e) { say(`mako-token: token not cached (${scrub(e && e.message)}); a new one is minted on every call until that is fixed`); }
    return { token: minted.token, expiresAt: minted.expiresAt, fromCache: false };
  }

  async function getToken(profile = cfg.DEFAULT_PROFILE) {
    if (!cfg.isProfile(profile)) throw new MakoTokenError('bad-profile', `unknown token profile "${String(profile).slice(0, 20)}"`);
    let rec = null;
    try { rec = await cache.read(profile); } catch { rec = null; } // an unreadable cache is a cache miss
    if (recordMatches(rec, config, profile) && usable(rec, clock())) {
      return { token: rec.token, expiresAt: rec.expiresAt, fromCache: true };
    }
    if (inflight.has(profile)) return inflight.get(profile);
    const p = mintAndStore(profile).finally(() => inflight.delete(profile));
    inflight.set(profile, p);
    return p;
  }

  /** Drop the cached token (git calls `erase` after GitHub rejected it). */
  async function forget(profile = cfg.DEFAULT_PROFILE) {
    try { await cache.remove(profile); } catch { /* nothing cached */ }
  }

  return { getToken, forget };
}

module.exports = { createTokenService, recordMatches, usable, INSTALLATION_TOKEN_RE };
