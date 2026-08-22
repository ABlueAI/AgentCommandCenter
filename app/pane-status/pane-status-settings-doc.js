'use strict';
// Blue Helm production pane status — the Claude settings document model.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
//
// PURE. This module reads and writes JavaScript values, never files. It decides what a hook group
// should look like, whether a group already in someone's settings is ours, and how to add or remove
// ours while leaving every other byte of meaning alone. The file I/O, locking, and CAS live in
// pane-status-settings-txn.js so that this — the part with all the judgement in it — is testable with
// plain objects.
//
// THE OWNER MARKER, AND WHY IT IS A PATH RATHER THAN A FIELD.
//
// Claude Code validates hook entries against a strict schema. Inventing an extra key to carry an
// ownership marker would either be stripped (making the marker useless) or rejected (making the
// hook fail), and the work order forbids inventing fields. So ownership is carried by the ONE thing
// we already control and that already has to be in the entry: the shim path.
//
//     <userData>\pane-status\<installId>\pane-status-reporter.cmd
//
// A group is ours if its argument vector points at a shim path with that shape AND our install ID.
// A group with that shape and a DIFFERENT install ID belongs to another Blue Helm installation —
// a distinct, visible, never-automatic outcome. This makes ownership self-describing from the
// settings file alone, which matters because § 9 requires us to refuse rather than guess when the
// descriptor is missing.
//
// USER-SCOPE SETTINGS ARE SHARED. ~/.claude/settings.json is shared by every Blue Helm installation
// for this user. That is why "another installation owns these" is a first-class classification and
// not an error: two installs are a legitimate state, and neither may silently evict the other.

const path = require('path');
const shimMod = require('./pane-status-runtime-shim');
const protocol = require('./pane-status-protocol');

// The eight event groups this subsystem installs. Exactly these, in this order.
const INSTALLED_EVENTS = protocol.ALLOWED_EVENTS;

// Directory component that marks a Blue Helm pane-status shim.
const OWNER_DIR = 'pane-status';
const SHIM_BASENAME = 'pane-status-reporter.cmd';

// Install IDs are 32 lowercase hex characters. Nonsecret — it identifies an installation, it does not
// authenticate anything. It appears in the shim path, the descriptor, and the lock; never on the wire.
const INSTALL_ID_PATTERN = /^[0-9a-f]{32}$/;

// Per-hook timeout, seconds. The chain is measured in tens of milliseconds; 5s is a generous ceiling
// that still guarantees a wedged reporter cannot hold a turn open.
const HOOK_TIMEOUT_SECONDS = 5;

const OWNERSHIP = Object.freeze({
  ABSENT: 'absent',
  OWNED_EXACT: 'owned-exact',
  OWNED_MODIFIED: 'owned-modified',
  OTHER_INSTALL: 'owned-by-another-installation',
  AMBIGUOUS: 'ambiguous',
  FOREIGN: 'unrelated-foreign',
});

/** The stable shim directory for an installation. */
function buildShimDir(userDataPath, installId) {
  if (!INSTALL_ID_PATTERN.test(String(installId))) throw new Error('pane-status-settings-doc: bad install id');
  return path.join(userDataPath, OWNER_DIR, installId);
}

/** The stable shim path for an installation. § 8: stable across upgrades, rewritten in place. */
function buildShimPath(userDataPath, installId) {
  return path.join(buildShimDir(userDataPath, installId), SHIM_BASENAME);
}

// Reverse the caret-escaping applied by pane-status-runtime-shim so a stored arg can be compared with
// a real path. Only carets that PRECEDE a metacharacter are escapes; a caret in the path itself was
// itself escaped, so this is exact rather than heuristic.
function unescapeFromCmd(value) {
  return String(value).replace(/\^([&^()<>|;,= ])/g, '$1');
}

/**
 * Recover the install ID a hook entry points at, or null if it does not look like a Blue Helm shim.
 * Works from the settings file alone — no descriptor, no filesystem.
 */
function installIdOf(entry) {
  if (!entry || !Array.isArray(entry.args)) return null;
  for (const rawArg of entry.args) {
    if (typeof rawArg !== 'string') continue;
    const candidate = unescapeFromCmd(rawArg);
    if (candidate.slice(-SHIM_BASENAME.length) !== SHIM_BASENAME) continue;
    const parts = candidate.split(/[\\/]/);
    // ... / <OWNER_DIR> / <installId> / <SHIM_BASENAME>
    if (parts.length < 3) continue;
    const id = parts[parts.length - 2];
    const owner = parts[parts.length - 3];
    if (owner === OWNER_DIR && INSTALL_ID_PATTERN.test(id)) return id;
  }
  return null;
}

/** The exact hook entry this build installs. */
function buildHookEntry(options) {
  const o = options || {};
  const cmdExe = o.cmdExe;
  const shimPath = o.shimPath;
  const timeoutSeconds = typeof o.timeoutSeconds === 'number' ? o.timeoutSeconds : HOOK_TIMEOUT_SECONDS;
  if (typeof cmdExe !== 'string' || !path.isAbsolute(cmdExe)) {
    throw new Error('pane-status-settings-doc: cmdExe must be an absolute path');
  }
  return {
    type: 'command',
    command: cmdExe,
    args: shimMod.buildHookArgs(shimPath),
    timeout: timeoutSeconds,
  };
}

/** One event's group: a matcher plus our single hook entry. Empty matcher means "match all". */
function buildEventGroup(entry) {
  return { matcher: '', hooks: [Object.assign({}, entry, { args: entry.args.slice() })] };
}

/** All eight groups, keyed by event name. This object IS the thing the descriptor records verbatim. */
function buildHookGroups(options) {
  const entry = buildHookEntry(options);
  const groups = {};
  for (const ev of INSTALLED_EVENTS) groups[ev] = [buildEventGroup(entry)];
  return groups;
}

function sameEntry(a, b) {
  if (!a || !b) return false;
  if (a.type !== b.type || a.command !== b.command) return false;
  if (typeof a.timeout !== typeof b.timeout || a.timeout !== b.timeout) return false;
  if (!Array.isArray(a.args) || !Array.isArray(b.args)) return false;
  if (a.args.length !== b.args.length) return false;
  for (let i = 0; i < a.args.length; i++) if (a.args[i] !== b.args[i]) return false;
  return true;
}

/**
 * Classify what is already sitting in a settings document for ONE event.
 *
 * `present` is settings.hooks[event] — an array of matcher groups, or undefined.
 * `expected` is the group array this build would install for that event.
 *
 * The classification is deliberately pessimistic. Anything we cannot positively identify as ours and
 * unmodified is something we refuse to touch.
 */
function classifyEventGroups(present, expected, installId) {
  if (present === undefined || present === null) return { ownership: OWNERSHIP.ABSENT, ours: [], foreign: [] };
  if (!Array.isArray(present)) return { ownership: OWNERSHIP.AMBIGUOUS, ours: [], foreign: [] };

  const ours = [];
  const otherInstalls = [];
  const foreign = [];

  for (const group of present) {
    const hooks = group && Array.isArray(group.hooks) ? group.hooks : [];
    let mine = 0, theirs = 0, unrelated = 0;
    for (const h of hooks) {
      const id = installIdOf(h);
      if (id === null) unrelated += 1;
      else if (id === installId) mine += 1;
      else theirs += 1;
    }
    // A single matcher group that mixes our hook with somebody else's is AMBIGUOUS: we cannot remove
    // ours later without rewriting a group we do not own.
    if (mine > 0 && (theirs > 0 || unrelated > 0)) return { ownership: OWNERSHIP.AMBIGUOUS, ours: [], foreign: [] };
    if (mine > 1) return { ownership: OWNERSHIP.AMBIGUOUS, ours: [], foreign: [] };
    if (mine === 1) ours.push(group);
    else if (theirs > 0) otherInstalls.push(group);
    else foreign.push(group);
  }

  if (ours.length > 1) return { ownership: OWNERSHIP.AMBIGUOUS, ours: [], foreign };
  if (ours.length === 1) {
    const expectedGroup = Array.isArray(expected) && expected.length === 1 ? expected[0] : null;
    const oursGroup = ours[0];
    const exact = expectedGroup
      && oursGroup.matcher === expectedGroup.matcher
      && Array.isArray(oursGroup.hooks) && oursGroup.hooks.length === 1
      && sameEntry(oursGroup.hooks[0], expectedGroup.hooks[0]);
    return { ownership: exact ? OWNERSHIP.OWNED_EXACT : OWNERSHIP.OWNED_MODIFIED, ours, foreign };
  }
  if (otherInstalls.length > 0) return { ownership: OWNERSHIP.OTHER_INSTALL, ours: [], foreign };
  return { ownership: OWNERSHIP.FOREIGN, ours: [], foreign };
}

/**
 * Classify the whole document. Returns a per-event map plus one overall verdict, where the overall
 * verdict is the WORST thing found — a single ambiguous or other-install event blocks the whole
 * transaction, because a partial install is not a state this subsystem is willing to create.
 */
function classifyDocument(settings, expectedGroups, installId) {
  const hooks = settings && typeof settings === 'object' && settings.hooks && typeof settings.hooks === 'object'
    ? settings.hooks : {};
  const perEvent = {};
  let anyOwned = false, anyExact = false, anyModified = false, anyAbsent = false;
  let blocking = null;

  for (const ev of INSTALLED_EVENTS) {
    const c = classifyEventGroups(hooks[ev], expectedGroups[ev], installId);
    perEvent[ev] = c.ownership;
    if (c.ownership === OWNERSHIP.OWNED_EXACT) { anyOwned = true; anyExact = true; }
    else if (c.ownership === OWNERSHIP.OWNED_MODIFIED) { anyOwned = true; anyModified = true; }
    else if (c.ownership === OWNERSHIP.ABSENT || c.ownership === OWNERSHIP.FOREIGN) anyAbsent = true;
    else if (blocking === null) blocking = c.ownership;   // AMBIGUOUS or OTHER_INSTALL
  }

  let overall;
  if (blocking) overall = blocking;
  else if (anyOwned && anyModified) overall = OWNERSHIP.OWNED_MODIFIED;
  else if (anyOwned && anyAbsent) overall = OWNERSHIP.OWNED_MODIFIED;  // partial install is "modified"
  else if (anyExact) overall = OWNERSHIP.OWNED_EXACT;
  else overall = OWNERSHIP.ABSENT;

  return { overall, perEvent };
}

/**
 * Produce the settings document to write for an install.
 *
 * PRESERVATION IS THE POINT. Every key we did not put there is carried through untouched, including
 * hook events we do not install, other matcher groups on events we DO install, and every unrelated
 * top-level setting. We only ever append our own group.
 */
function withInstalled(settings, groups) {
  const base = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  const next = Object.assign({}, base);
  const hooks = Object.assign({}, (base.hooks && typeof base.hooks === 'object') ? base.hooks : {});
  for (const ev of INSTALLED_EVENTS) {
    const existing = Array.isArray(hooks[ev]) ? hooks[ev] : [];
    hooks[ev] = existing.concat(groups[ev]);
  }
  next.hooks = hooks;
  return next;
}

/**
 * Produce the settings document to write for a removal.
 *
 * `recordedGroups` is the descriptor's EXACT installed group — what we actually put there, not what
 * this build would install today. § 11 is explicit about this: after an upgrade the two differ, and
 * removing "what we would install now" would strand the group we really wrote.
 *
 * Unrelated additions and changes made after setup are preserved. If an event's array becomes empty it
 * is deleted; if `hooks` becomes empty it is deleted; the file may end up `{}` but is NEVER deleted.
 */
function withRemoved(settings, recordedGroups) {
  const base = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  const next = Object.assign({}, base);
  if (!base.hooks || typeof base.hooks !== 'object') return next;
  const hooks = Object.assign({}, base.hooks);

  for (const ev of Object.keys(recordedGroups || {})) {
    if (!Array.isArray(hooks[ev])) continue;
    const target = recordedGroups[ev];
    const targetJson = new Set((Array.isArray(target) ? target : []).map((g) => JSON.stringify(g)));
    const kept = hooks[ev].filter((g) => !targetJson.has(JSON.stringify(g)));
    if (kept.length === 0) delete hooks[ev];
    else hooks[ev] = kept;
  }

  if (Object.keys(hooks).length === 0) delete next.hooks;
  else next.hooks = hooks;
  return next;
}

/**
 * Serialize exactly as we intend the file to look. Two-space indent and a trailing newline, matching
 * what Claude Code and every human editor produce, so a round trip is a no-op rather than a diff.
 * An empty document is `{}` plus a newline — a valid file, never a deletion.
 */
function serialize(settings) {
  return JSON.stringify(settings === undefined || settings === null ? {} : settings, null, 2) + '\n';
}

/** Parse. Returns { ok:true, value } or { ok:false, reason } — never throws on hostile content. */
function parse(text) {
  if (typeof text !== 'string') return { ok: false, reason: 'not-a-string' };
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: true, value: {} };   // an empty file is an empty document
  let value;
  try { value = JSON.parse(trimmed); } catch { return { ok: false, reason: 'malformed-json' }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: 'not-an-object' };
  return { ok: true, value };
}

const api = {
  INSTALLED_EVENTS,
  OWNER_DIR,
  SHIM_BASENAME,
  INSTALL_ID_PATTERN,
  HOOK_TIMEOUT_SECONDS,
  OWNERSHIP,
  buildShimDir,
  buildShimPath,
  unescapeFromCmd,
  installIdOf,
  buildHookEntry,
  buildEventGroup,
  buildHookGroups,
  sameEntry,
  classifyEventGroups,
  classifyDocument,
  withInstalled,
  withRemoved,
  serialize,
  parse,
};
if (typeof module === 'object' && module.exports) module.exports = api;
