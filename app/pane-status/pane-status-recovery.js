'use strict';
// Blue Helm production pane status — startup reconciliation.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
//
// THE ONE RULE THAT GOVERNS THIS ENTIRE FILE:
//
//     STARTUP RECONCILIATION MAY UPDATE ONLY THE APP-OWNED DESCRIPTOR.
//     IT MAY NEVER MUTATE CLAUDE SETTINGS.
//
// Reconciliation runs unattended, at launch, with no human watching and no confirmation. Anything it
// wrote into somebody else's shared settings file would be a write nobody asked for, at the least
// observable moment, in a file another installation may be mid-transaction on. So it READS settings to
// find out what happened, and writes only our own record of it. Every crash-point fixture asserts the
// settings bytes are byte-identical before and after.
//
// WHEN IT CANNOT TELL, IT REFUSES. `RECONCILIATION_REQUIRED` is a real, visible, terminal-until-a-human
// -acts state: reporting is disabled, tokens are revoked, the badge reads `unknown`, and no further
// automatic settings write is permitted. Guessing ownership is the one thing that could destroy a
// user's hooks, so the code does not contain a branch that guesses.

const fs = require('fs');

const descriptorMod = require('./pane-status-descriptor');
const doc = require('./pane-status-settings-doc');
const txnMod = require('./pane-status-settings-txn');
const shimMod = require('./pane-status-runtime-shim');

const TXN = descriptorMod.TXN;

const OUTCOME = Object.freeze({
  NOT_INSTALLED: 'not-installed',
  INSTALLED: 'installed',
  RECONCILIATION_REQUIRED: 'reconciliation-required',
  REMOVED: 'removed',
});

const RECONCILE_REASON = Object.freeze({
  CLEAN: 'clean',
  ROLLED_FORWARD: 'rolled-forward-to-installed',
  ROLLED_BACK: 'rolled-back-to-idle',
  REMOVAL_COMPLETED: 'removal-completed',
  REMOVAL_REVERTED: 'removal-reverted-to-installed',
  DESCRIPTOR_MISSING_HOOKS_PRESENT: 'descriptor-missing-but-marked-hooks-present',
  DESCRIPTOR_CORRUPT: 'descriptor-corrupt',
  DESCRIPTOR_NEWER_SCHEMA: 'descriptor-newer-schema',
  SETTINGS_UNREADABLE: 'settings-unreadable',
  GROUPS_MODIFIED: 'installed-groups-modified-externally',
  GROUPS_VANISHED: 'installed-groups-absent-externally',
  OTHER_INSTALL: 'another-installation-owns-hooks',
  AMBIGUOUS: 'ambiguous-hook-ownership',
  ALREADY_REQUIRED: 'already-reconciliation-required',
  SHIM_REPAIR_FAILED: 'shim-repair-failed',
  SHIM_REPAIRED: 'shim-repaired-after-runtime-change',
  CLEANUP_INCOMPLETE: 'removal-cleanup-incomplete',
});

/**
 * Does the settings document contain hook groups marked with ANY Blue Helm install id?
 * Used for the "descriptor missing but hooks marked" refusal, which must never guess.
 */
function markedInstallIds(settingsValue) {
  const ids = new Set();
  const hooks = settingsValue && settingsValue.hooks;
  if (!hooks || typeof hooks !== 'object') return ids;
  for (const ev of Object.keys(hooks)) {
    const groups = Array.isArray(hooks[ev]) ? hooks[ev] : [];
    for (const g of groups) {
      const entries = g && Array.isArray(g.hooks) ? g.hooks : [];
      for (const h of entries) {
        const id = doc.installIdOf(h);
        if (id) ids.add(id);
      }
    }
  }
  return ids;
}

/**
 * deps:
 *   userDataPath, settingsPath, installId, cmdExe  -> as in pane-status-settings-txn
 *   currentRuntimePath -> process.execPath at startup
 *   reporterPath       -> absolute path to pane-status-reporter.js in THIS build
 *   log(line), now()
 */
function createRecovery(deps) {
  const d = deps || {};
  const userDataPath = d.userDataPath;
  const settingsPath = d.settingsPath;
  const installId = d.installId;
  const cmdExe = d.cmdExe || shimMod.resolveCmdExe();
  const currentRuntimePath = d.currentRuntimePath;
  const reporterPath = d.reporterPath;
  const log = typeof d.log === 'function' ? d.log : () => {};
  const now = typeof d.now === 'function' ? d.now : () => Date.now();

  const shimPath = doc.buildShimPath(userDataPath, installId);

  function putDescriptor(state, source, extra) {
    const base = source || {};
    const runtime = base.runtime || {};
    const descriptor = descriptorMod.buildDescriptor(Object.assign({
      installId,
      ownerMarker: base.ownerMarker || (doc.OWNER_DIR + '/' + installId),
      transactionState: state,
      installedGroups: base.installedGroups || null,
      installedEvents: base.installedEvents || null,
      runtimePath: runtime.runtimePath || null,
      runtimeSize: typeof runtime.runtimeSize === 'number' ? runtime.runtimeSize : null,
      runtimeMtimeMs: typeof runtime.runtimeMtimeMs === 'number' ? runtime.runtimeMtimeMs : null,
      shimPath: runtime.shimPath || null,
      shimSha256: runtime.shimSha256 || null,
      reporterPath: runtime.reporterPath || null,
      settingsPath,
      preTransactionSha256: base.preTransactionSha256 || null,
      attemptedOutputSha256: base.attemptedOutputSha256 || null,
      createdAt: typeof base.createdAt === 'number' ? base.createdAt : now(),
      updatedAt: now(),
    }, extra || {}));
    return descriptorMod.write(userDataPath, descriptor);
  }

  /**
   * Bring the runtime shim back into agreement with THIS build, if Electron moved or the reporter path
   * changed. § 8: rewrite the shim at its STABLE path — Claude settings are never updated for this,
   * which is the entire reason the shim exists as an indirection.
   */
  function reconcileShim(descriptorValue) {
    const runtime = descriptorValue.runtime || {};
    let stat = null;
    try { stat = fs.statSync(currentRuntimePath); } catch { stat = null; }

    const unchanged = runtime.runtimePath === currentRuntimePath
      && runtime.reporterPath === reporterPath
      && stat !== null
      && runtime.runtimeSize === stat.size
      && runtime.runtimeMtimeMs === stat.mtimeMs;

    // Also confirm the shim file still exists and still hashes to what we recorded. A shim someone
    // deleted is a stranded hook waiting to happen.
    let shimOk = false;
    if (unchanged && typeof runtime.shimSha256 === 'string') {
      try { shimOk = descriptorMod.sha256(fs.readFileSync(shimPath, 'utf8')) === runtime.shimSha256; }
      catch { shimOk = false; }
    }
    if (unchanged && shimOk) return { ok: true, changed: false };

    const res = txnMod.writeShim(shimPath, currentRuntimePath, reporterPath);
    if (!res.ok) return { ok: false, reason: res.reason, detail: res.detail };
    return {
      ok: true,
      changed: true,
      shimSha256: res.sha256,
      runtimeSize: stat ? stat.size : null,
      runtimeMtimeMs: stat ? stat.mtimeMs : null,
    };
  }

  /**
   * Reconcile. Returns { outcome, reason, settingsUnchanged, descriptorState }.
   * NEVER writes settingsPath — the only fs writes are the descriptor and the shim, both app-owned.
   */
  function reconcile() {
    const settingsBefore = txnMod.readSettings(settingsPath);
    const existing = descriptorMod.read(userDataPath);

    // ---- no usable descriptor -----------------------------------------------------------------
    if (!existing.ok) {
      if (existing.readOnly) {
        log('[pane-status] descriptor has a NEWER schema; refusing read-only');
        return { outcome: OUTCOME.RECONCILIATION_REQUIRED, reason: RECONCILE_REASON.DESCRIPTOR_NEWER_SCHEMA };
      }
      if (!settingsBefore.ok) {
        return { outcome: OUTCOME.RECONCILIATION_REQUIRED, reason: RECONCILE_REASON.SETTINGS_UNREADABLE };
      }
      const marked = markedInstallIds(settingsBefore.value);
      if (marked.size === 0) {
        // Nothing of ours anywhere. The clean, ordinary first-run state.
        return {
          outcome: OUTCOME.NOT_INSTALLED,
          reason: existing.reason === descriptorMod.DESCRIPTOR_REFUSAL.MISSING
            ? RECONCILE_REASON.CLEAN : RECONCILE_REASON.DESCRIPTOR_CORRUPT,
        };
      }
      // Marked hooks exist but we have no record of them. NEVER guess ownership: refuse and send the
      // human to docs/RECOVERY-pane-status-hooks.md.
      log('[pane-status] marked hook groups exist but the descriptor is missing or corrupt; manual recovery required');
      return {
        outcome: OUTCOME.RECONCILIATION_REQUIRED,
        reason: RECONCILE_REASON.DESCRIPTOR_MISSING_HOOKS_PRESENT,
        markedInstallIds: Array.from(marked),
      };
    }

    const value = existing.value;
    const state = value.transactionState;

    if (state === TXN.RECONCILIATION_REQUIRED) {
      return { outcome: OUTCOME.RECONCILIATION_REQUIRED, reason: RECONCILE_REASON.ALREADY_REQUIRED };
    }
    if (!settingsBefore.ok) {
      return { outcome: OUTCOME.RECONCILIATION_REQUIRED, reason: RECONCILE_REASON.SETTINGS_UNREADABLE };
    }

    const recordedGroups = value.installedGroups;
    const present = recordedGroups
      ? doc.classifyDocument(settingsBefore.value, recordedGroups, installId)
      : { overall: doc.OWNERSHIP.ABSENT, perEvent: {} };

    // ---- interrupted install ------------------------------------------------------------------
    if (state === TXN.INSTALL_PENDING || state === TXN.INSTALL_WRITTEN || state === TXN.INSTALL_VERIFIED) {
      if (present.overall === doc.OWNERSHIP.OWNED_EXACT) {
        putDescriptor(TXN.INSTALLED, value);
        log('[pane-status] interrupted setup rolled FORWARD: groups are present and exact');
        return { outcome: OUTCOME.INSTALLED, reason: RECONCILE_REASON.ROLLED_FORWARD, descriptorState: TXN.INSTALLED };
      }
      if (present.overall === doc.OWNERSHIP.ABSENT || present.overall === doc.OWNERSHIP.FOREIGN) {
        putDescriptor(TXN.IDLE, value, { installedGroups: null, installedEvents: null });
        log('[pane-status] interrupted setup rolled BACK: nothing was written to settings');
        return { outcome: OUTCOME.NOT_INSTALLED, reason: RECONCILE_REASON.ROLLED_BACK, descriptorState: TXN.IDLE };
      }
      putDescriptor(TXN.RECONCILIATION_REQUIRED, value);
      return {
        outcome: OUTCOME.RECONCILIATION_REQUIRED,
        reason: present.overall === doc.OWNERSHIP.OTHER_INSTALL ? RECONCILE_REASON.OTHER_INSTALL
          : present.overall === doc.OWNERSHIP.AMBIGUOUS ? RECONCILE_REASON.AMBIGUOUS
            : RECONCILE_REASON.GROUPS_MODIFIED,
      };
    }

    // ---- interrupted removal ------------------------------------------------------------------
    if (state === TXN.REMOVE_PENDING || state === TXN.REMOVE_WRITTEN || state === TXN.REMOVE_VERIFIED) {
      if (present.overall === doc.OWNERSHIP.ABSENT || present.overall === doc.OWNERSHIP.FOREIGN) {
        // FINISHING A VERIFIED CLEANUP (finding 12). The settings are already clean, so this is the
        // safe half of the two-resource protocol: only app-owned artifacts are retired, and BOTH
        // results are checked. A cleanup that cannot be completed is reported as such rather than
        // announced as a completed removal — the descriptor stays put and the next start tries again.
        let shimRetired = true;
        try { fs.unlinkSync(shimPath); }
        catch (e) { if (!e || e.code !== 'ENOENT') shimRetired = false; }
        if (!shimRetired) {
          log('[pane-status] interrupted removal: settings are clean but the shim could not be deleted');
          return { outcome: OUTCOME.RECONCILIATION_REQUIRED, reason: RECONCILE_REASON.CLEANUP_INCOMPLETE };
        }
        const retired = descriptorMod.remove(userDataPath);
        if (!retired || retired.ok !== true) {
          log('[pane-status] interrupted removal: settings are clean but the descriptor could not be retired');
          return { outcome: OUTCOME.RECONCILIATION_REQUIRED, reason: RECONCILE_REASON.CLEANUP_INCOMPLETE };
        }
        log('[pane-status] interrupted removal COMPLETED: groups are gone, descriptor retired');
        return { outcome: OUTCOME.REMOVED, reason: RECONCILE_REASON.REMOVAL_COMPLETED };
      }
      if (present.overall === doc.OWNERSHIP.OWNED_EXACT) {
        putDescriptor(TXN.INSTALLED, value);
        log('[pane-status] interrupted removal REVERTED: groups are still present and exact');
        return { outcome: OUTCOME.INSTALLED, reason: RECONCILE_REASON.REMOVAL_REVERTED, descriptorState: TXN.INSTALLED };
      }
      putDescriptor(TXN.RECONCILIATION_REQUIRED, value);
      return { outcome: OUTCOME.RECONCILIATION_REQUIRED, reason: RECONCILE_REASON.GROUPS_MODIFIED };
    }

    // ---- steady states ------------------------------------------------------------------------
    if (state === TXN.IDLE) {
      return { outcome: OUTCOME.NOT_INSTALLED, reason: RECONCILE_REASON.CLEAN, descriptorState: TXN.IDLE };
    }

    // state === INSTALLED
    if (present.overall === doc.OWNERSHIP.OWNED_MODIFIED) {
      putDescriptor(TXN.RECONCILIATION_REQUIRED, value);
      return { outcome: OUTCOME.RECONCILIATION_REQUIRED, reason: RECONCILE_REASON.GROUPS_MODIFIED };
    }
    if (present.overall === doc.OWNERSHIP.ABSENT || present.overall === doc.OWNERSHIP.FOREIGN) {
      // Somebody removed our groups outside the app. That is their right; it is not our cue to write.
      putDescriptor(TXN.RECONCILIATION_REQUIRED, value);
      return { outcome: OUTCOME.RECONCILIATION_REQUIRED, reason: RECONCILE_REASON.GROUPS_VANISHED };
    }
    if (present.overall !== doc.OWNERSHIP.OWNED_EXACT) {
      putDescriptor(TXN.RECONCILIATION_REQUIRED, value);
      return {
        outcome: OUTCOME.RECONCILIATION_REQUIRED,
        reason: present.overall === doc.OWNERSHIP.OTHER_INSTALL ? RECONCILE_REASON.OTHER_INSTALL : RECONCILE_REASON.AMBIGUOUS,
      };
    }

    // Installed and exact. Last job: make the shim agree with this build.
    const shim = reconcileShim(value);
    if (!shim.ok) {
      putDescriptor(TXN.RECONCILIATION_REQUIRED, value);
      log('[pane-status] shim repair FAILED; reporting disabled pending reconciliation');
      return { outcome: OUTCOME.RECONCILIATION_REQUIRED, reason: RECONCILE_REASON.SHIM_REPAIR_FAILED };
    }
    if (shim.changed) {
      putDescriptor(TXN.INSTALLED, value, {
        runtimePath: currentRuntimePath,
        runtimeSize: shim.runtimeSize,
        runtimeMtimeMs: shim.runtimeMtimeMs,
        shimPath,
        shimSha256: shim.shimSha256,
        reporterPath,
        installedGroups: value.installedGroups,
        installedEvents: value.installedEvents,
      });
      log('[pane-status] runtime changed: shim rewritten in place, Claude settings untouched');
      return { outcome: OUTCOME.INSTALLED, reason: RECONCILE_REASON.SHIM_REPAIRED, descriptorState: TXN.INSTALLED };
    }
    return { outcome: OUTCOME.INSTALLED, reason: RECONCILE_REASON.CLEAN, descriptorState: TXN.INSTALLED };
  }

  return { reconcile, reconcileShim, shimPath: () => shimPath };
}

const api = { OUTCOME, RECONCILE_REASON, markedInstallIds, createRecovery };
if (typeof module === 'object' && module.exports) module.exports = api;
