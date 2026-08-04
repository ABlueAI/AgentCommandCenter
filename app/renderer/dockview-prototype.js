'use strict';
// Dockview prototype adapter — PROTOTYPE ONLY (branch feature/dockview-prototype).
//
// Loaded and executed ONLY after main's trusted prototype flag reaches the renderer. Default
// `npm start` never fetches, parses, or initializes this file or the Dockview bundle (§ 5.10).
//
// DIVISION OF AUTHORITY (§ 7) — Dockview owns LAYOUT ONLY. It is told exactly three things about a
// pane: an opaque ID, an allowlisted component kind, and a display-safe title. It is never given a
// path, prompt, role, credential, report body, terminal output, IPC handle, or filesystem handle.
// Blue Helm keeps ownership of PTY lifecycle, xterm/FitAddon instances, clipboard IPC, TTS/Dictate
// targeting, Library IPC, Video Scout pane->run identity, and secure storage.
//
// PANE HOSTING — panels do NOT recreate panes. The adapter REPARENTS the pane element the existing
// code already built, so the xterm instance, its PTY, its clipboard handlers, its OSC 52 handler,
// its selection listeners, and its Video Scout identity all survive a move unchanged. Recreating a
// pane would kill its PTY, which is a predeclared kill criterion (§ 5.8).

(function () {
  const fitPolicy = (typeof window !== 'undefined' && window.ccDockviewFitPolicy) || require('./dockview-fit-policy');
  const panelPolicy = (typeof window !== 'undefined' && window.ccDockviewPanelPolicy) || require('./dockview-panel-policy');

  const BANNER_TEXT = 'DOCKVIEW PROTOTYPE — NOT PRODUCTION';

  /**
   * @param {object} host  The controlled surface app.js exposes. The adapter may use ONLY these.
   */
  function activate(host) {
    // Defense in depth: app.js already gated the dynamic load behind the same predicate. Asserting
    // it again here means this module cannot be activated by being loaded some other way.
    if (!panelPolicy.shouldLoadDockview(host && host.bridge)) {
      return { ok: false, reason: 'prototype-not-enabled' };
    }
    const dockview = host.getDockviewGlobal();
    if (!dockview || typeof dockview.createDockview !== 'function') {
      host.log('[dockview-prototype] REFUSED: dockview bundle did not expose createDockview\n');
      return { ok: false, reason: 'bundle-missing' };
    }

    const registry = fitPolicy.createFitRegistry();
    // paneId -> { element, kind } for every pane this adapter OWNS. Ownership is deliberately
    // INDEPENDENT of whether the pane is currently mounted in a Dockview panel, because fromJSON
    // destroys every panel and builds new ones: the pane must survive that gap intact.
    const hostedPanes = new Map();
    // paneId -> the panel content host the pane is CURRENTLY mounted into. Transient by definition:
    // dropped on unmount, rewritten by the rebuilt component's init(). This is what lets a restore
    // PROVE it actually reparented rather than assuming it did.
    const mountedHosts = new Map();
    let api = null;
    let disposed = false;
    // True only for the synchronous duration of a call in which DOCKVIEW is restructuring the
    // workspace on our behalf: fromJSON's implicit clear and rebuild, our own removePanel during an
    // app-side close, and final teardown. Removals fired inside that window are MOUNT TRANSITIONS,
    // not user closes — they release the transient mount and nothing else.
    let mountTransition = false;

    /** Run `fn` with removals classified as mount transitions. Restores the previous mode always. */
    function inMountTransition(fn) {
      const previous = mountTransition;
      mountTransition = true;
      try { return fn(); } finally { mountTransition = previous; }
    }

    // ---- persistent, unmistakable prototype banner (§ 6) -------------------------------------
    const banner = document.createElement('div');
    banner.id = 'dockviewPrototypeBanner';
    banner.className = 'dockview-prototype-banner';
    banner.textContent = BANNER_TEXT;
    banner.setAttribute('role', 'status');

    const container = host.getContainer();
    const surface = document.createElement('div');
    surface.className = 'dockview-prototype-surface dockview-theme-abyss';

    const controls = buildControls();
    container.appendChild(banner);
    container.appendChild(controls.element);
    container.appendChild(surface);

    // ---- Dockview instance --------------------------------------------------------------------
    api = dockview.createDockview(surface, {
      // Blue's verdict EXCLUDES popouts, and floating windows are outside acceptance scope (§ 6).
      // Disabling floating groups here means the feature cannot be reached by drag at all, rather
      // than relying on nobody clicking the right thing.
      disableFloatingGroups: true,
      createComponent: (options) => createPaneRenderer(options),
    });

    /**
     * Build the renderer for one Dockview panel. `options.id` is the opaque pane ID; `options.name`
     * is the allowlisted component kind. NOTHING else about the pane is available here, by design.
     */
    function createPaneRenderer(options) {
      const paneId = options && options.id;
      const element = document.createElement('div');
      element.className = 'dockview-prototype-pane-host';

      return {
        element,
        init() {
          const owned = hostedPanes.get(paneId);
          if (owned && owned.element) {
            // REPARENT, never rebuild. appendChild MOVES the existing node, preserving the live
            // xterm, its PTY, and every handler already bound to it. fromJSON's rebuild lands here
            // too, which is precisely why an unmount must never drop pane ownership: if the entry
            // were gone, this would mount an empty shell and strand the live pane on a dead host.
            if (owned.element.parentNode !== element) element.appendChild(owned.element);
            mountedHosts.set(paneId, element);
          }
          ensureController(paneId, element);
        },
        // Dockview calls these on tab activation / deactivation and on mount into a visible group.
        // They are the § 8 "wait until the panel is visible" signal — no polling required.
        onShow() {
          const controller = registry.get(paneId);
          if (controller) controller.schedule();
        },
        onHide() { /* deliberately nothing: a hidden pane must not fit (§ 8) */ },
        dispose() { /* pane teardown converges on the single close path, not here */ },
      };
    }

    /**
     * One fit controller — and therefore one observer — per terminal pane, ever (§ 8).
     * The Library pane has no xterm and needs no fit controller.
     */
    function ensureController(paneId, panelElement) {
      if (!host.isTerminalPane(paneId)) return null;
      const controller = registry.ensure(paneId, () => fitPolicy.createFitController({
        paneId,
        fit: () => host.fitTerminal(paneId),
        measure: () => host.measureTerminal(paneId),
        // Visible AND non-zero sized. offsetParent is null for a display:none subtree, which is how
        // Dockview hides an inactive tab; the size check catches a mounted-but-collapsed group.
        isVisible: () => {
          const el = host.getTerminalBody(paneId);
          if (!el || !el.isConnected) return false;
          if (el.offsetParent === null) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        },
        sendResize: (id, cols, rows) => host.sendResize(id, cols, rows),
        requestFrame: (cb) => window.requestAnimationFrame(cb),
        cancelFrame: (h) => window.cancelAnimationFrame(h),
      }));

      // One ResizeObserver per pane, attached exactly once, alongside the controller. Re-entry
      // through a move returns the SAME controller, so no second observer is created.
      if (!controller._observerAttached) {
        // The app's OWN per-pane ResizeObserver (app.js) calls fit() with no visibility and no
        // geometry gate. Left running, a Dockview-hosted terminal would carry TWO observers and two
        // resize senders, and the ungated one could push a collapsed 2x1 geometry to the PTY
        // mid-drag — defeating the whole § 8 contract. Suspend it so the gated controller is the
        // single live resize path for panes this adapter hosts. The app restores nothing here; its
        // observer is reconnected only if the pane leaves the prototype (it does not, on this
        // branch) and is disconnected by the app's own close path either way.
        host.suspendAppResizeObserver(paneId);

        const body = host.getTerminalBody(paneId);
        if (body && typeof ResizeObserver === 'function') {
          const ro = new ResizeObserver(() => controller.schedule());
          ro.observe(body);
          controller._observer = ro;
          controller._observerAttached = true;
        }
      }
      if (panelElement) controller.schedule();
      return controller;
    }

    /**
     * TEMPORARY DOCKVIEW UNMOUNT — releases only what belonged to the PANEL the pane was mounted in:
     * the fit controller, its ResizeObserver, and any pending animation frame.
     *
     * Pane OWNERSHIP is deliberately preserved. This runs during fromJSON's clear, and the very next
     * thing Dockview does is rebuild the panels and call each component's init(), which must still
     * find the live element to reparent. Deleting ownership here was the round-2 defect: the rebuild
     * mounted empty shells while the live xterm and its PTY stayed attached to a discarded host.
     *
     * Idempotent: unmounting an already-unmounted pane is a no-op, never a throw.
     */
    function unmountPane(paneId) {
      const controller = registry.get(paneId);
      if (controller && controller._observer) {
        try { controller._observer.disconnect(); } catch { /* best effort */ }
        controller._observer = null;
        controller._observerAttached = false;
      }
      registry.remove(paneId);       // disposes the controller (cancels any pending frame)
      mountedHosts.delete(paneId);
    }

    /**
     * PERMANENT PANE RELEASE — everything the unmount does, PLUS dropping this adapter's ownership.
     * Used for a genuine user close, the app-owned ✕ path, and final teardown. Never for a
     * Dockview-driven rebuild. Idempotent.
     */
    function releasePane(paneId) {
      unmountPane(paneId);
      hostedPanes.delete(paneId);
    }

    /**
     * Is this pane actually mounted in the panel host Dockview most recently built for it? Compares
     * live DOM parentage by object identity, so a restore cannot report success while the rebuilt
     * panel is an empty shell.
     */
    function paneIsMounted(paneId) {
      const owned = hostedPanes.get(paneId);
      const hostElement = mountedHosts.get(paneId);
      return !!(owned && owned.element && hostElement && owned.element.parentNode === hostElement);
    }

    // ---- ONE idempotent close path (§ 7) ------------------------------------------------------
    // A Dockview panel removal and the pane's own close button must converge, so ptyKill, xterm
    // disposal, observer disconnect, map deletion, and DOM cleanup each happen EXACTLY once.
    // Dockview's removal event releases the adapter's own state and then delegates to the app's
    // single close path; that path is itself guarded, so the second caller is a no-op.
    // PAYLOAD SHAPE: dockview@7.0.4's DockviewComponent unwraps the group model's `{ panel }` event
    // and fires the PANEL ITSELF on the public `onDidRemovePanel`
    // (dockview.js: `this._onDidRemovePanel.fire(event.panel)`). Reading `event.panel.id` here
    // yields undefined and silently disables this entire convergence path, so the ID is read
    // directly off the payload — and an unresolvable ID is a VISIBLE refusal, never a silent
    // return, because a silent return is exactly what would hide this class of bug again.
    api.onDidRemovePanel((panel) => {
      const paneId = panel && panel.id;
      if (!paneId) {
        host.log('[dockview-prototype] REFUSED: panel removal with no resolvable pane ID\n');
        return;
      }
      // CLASSIFY BEFORE RELEASING. fromJSON() clears the whole workspace first, and those removals
      // surface here as ordinary panel removals. They are mount transitions, not user closes, so
      // they must release ONLY the transient mount — the pane stays owned and is reparented into
      // the panel Dockview is about to rebuild. Deciding this after a permanent release (the
      // round-2 shape) both stranded the live pane and left the rebuild nothing to mount.
      if (mountTransition) {
        unmountPane(paneId);
        return;
      }
      // A genuine user close: drop ownership, then converge on the app's single guarded close path.
      releasePane(paneId);
      host.closePane(paneId);
    });

    api.onDidActivePanelChange((event) => {
      const paneId = event && event.panel && event.panel.id;
      if (!paneId) return;
      // Focus follows activation, but pane IDENTITY never changes: the app's own focus bookkeeping
      // is told which pane is active; nothing is re-keyed or re-created.
      host.focusPane(paneId);
      const controller = registry.get(paneId);
      if (controller) controller.schedule();
    });

    api.onDidLayoutChange(() => registry.scheduleAll());

    const onWindowResize = () => registry.scheduleAll();
    window.addEventListener('resize', onWindowResize);

    // ---- panel creation -----------------------------------------------------------------------
    function addPane(paneId, kind, positionOptions) {
      const title = panelPolicy.defaultTitleFor(paneId);
      const descriptor = panelPolicy.buildPanelDescriptor({ paneId, kind, title });
      if (!descriptor.ok) {
        host.log(`[dockview-prototype] REFUSED addPane: ${descriptor.reason}\n`);
        return false;
      }
      const element = host.getPaneElement(paneId);
      if (!element) {
        host.log(`[dockview-prototype] REFUSED addPane: no pane element for ${paneId}\n`);
        return false;
      }
      // Ownership is recorded WITH the pane's kind, so a failed restore can rebuild exactly these
      // panes from exactly these live elements without asking the app to create anything.
      hostedPanes.set(paneId, { element, kind: descriptor.panel.component });
      // Only the three allowlisted fields cross into Dockview. `params` is never supplied, which is
      // why dockview@7.0.4 omits it from toJSON and the layout validator can refuse it outright.
      const options = { id: descriptor.panel.id, component: descriptor.panel.component, title: descriptor.panel.title };
      if (positionOptions) options.position = positionOptions;
      api.addPanel(options);
      return true;
    }

    // ---- layout persistence (all validation is main's; this side only transports) --------------
    async function saveLayout() {
      const result = await host.bridge.saveLayout(api.toJSON());
      host.log(result && result.ok
        ? `[dockview-prototype] layout saved (${result.savedAt})\n`
        : `[dockview-prototype] layout save REFUSED: ${(result && result.reason) || 'unknown'}\n`);
      controls.setStatus(result && result.ok ? 'Layout saved.' : `Save refused: ${(result && result.reason) || 'unknown'}`);
      return result;
    }

    async function restoreLayout() {
      const result = await host.bridge.loadLayout();
      if (!result || !result.ok) {
        const reason = (result && result.reason) || 'unknown';
        // Refuse VISIBLY with a bounded reason code, do NOT call fromJSON, and load the default
        // layout instead. The invalid file is left on disk untouched by main for diagnosis (§ 9).
        host.log(`[dockview-prototype] restore REFUSED: ${reason}\n`);
        controls.setStatus(reason === 'no-saved-layout'
          ? 'No saved prototype layout.'
          : `Restore refused (${reason}). Loading default layout.`);
        await useDefaultLayout();
        return result;
      }
      // Restoring geometry cannot resurrect a PTY: after a restart there are no live panes to host,
      // and § 9 forbids auto-launching PTYs. Rather than mount empty panel shells — the "silently
      // missing pane" shape § 5.7 forbids — refuse visibly when a restored pane ID has no live pane
      // and say exactly which panes would need to be recreated first.
      const restoredIds = Object.keys((result.layout && result.layout.panels) || {});
      const missing = restoredIds.filter((paneId) => !host.getPaneElement(paneId));
      if (missing.length > 0) {
        host.log(`[dockview-prototype] restore REFUSED: ${missing.length} restored pane(s) have no live pane\n`);
        controls.setStatus(
          `Restore refused: ${missing.length} saved pane(s) are not open (${missing.join(', ')}). ` +
          'Create them first, or use Use Default. Nothing was changed and the saved layout is intact.');
        return { ok: false, reason: 'panes-not-live' };
      }

      // ---- TRANSACTION: capture enough to put the live topology back if applying the saved layout
      // fails. Both captures are in-memory only; nothing is written and the saved file is untouched.
      const preRestorePanes = new Map(hostedPanes);
      let preRestoreLayout = null;
      try { preRestoreLayout = api.toJSON(); } catch { preRestoreLayout = null; }

      try {
        // main validated this immediately before returning it; the shape reaching fromJSON is the
        // shape the validator accepted. fromJSON clears the workspace first and then rebuilds it,
        // so every removal it fires is a mount transition rather than a user close.
        inMountTransition(() => api.fromJSON(result.layout));
      } catch {
        // The exception is deliberately NOT echoed: Dockview's messages interpolate panel IDs and
        // layout fragments, and § 9 forbids putting state contents in the Logs tab.
        return failRestore('restore-apply-failed', preRestoreLayout, preRestorePanes);
      }

      // Applying did not throw — but "did not throw" is not "mounted". Verify by object identity
      // that every restored pane really is parented to the panel host Dockview just built for it.
      // This is the assertion whose absence let a restore report success over empty shells.
      const unmounted = restoredIds.filter((paneId) => !paneIsMounted(paneId));
      if (unmounted.length > 0) {
        return failRestore('restore-apply-incomplete', preRestoreLayout, preRestorePanes);
      }

      controls.setStatus(`Layout restored (saved ${result.savedAt}).`);
      host.log('[dockview-prototype] layout restored\n');
      registry.scheduleAll();
      return result;
    }

    /**
     * Put the pre-restore workspace back after a failed apply, using the ORIGINAL live pane elements.
     * No PTY is created or killed and `useDefaultLayout()` is never used here, because it would spawn
     * replacement terminals alongside the ones still running.
     *
     * Two ordered strategies, not a retry of one:
     *   1. Re-apply the layout Dockview itself serialized moments earlier — restores exact topology.
     *   2. Last resort: clear, then rebuild the captured panes through the same `addPanel` primitive
     *      that created them. Loses the split arrangement, but no live pane is left unmounted.
     * Returns a bounded outcome code for the log — never layout contents.
     */
    function rollbackRestore(snapshot, panes) {
      if (snapshot) {
        try {
          inMountTransition(() => api.fromJSON(snapshot));
          if ([...panes.keys()].every((paneId) => paneIsMounted(paneId))) return 'topology-restored';
        } catch { /* fall through to the flat rebuild */ }
      }
      try { inMountTransition(() => { if (typeof api.clear === 'function') api.clear(); }); }
      catch { /* best effort — the rebuild below re-adds regardless */ }
      let rebuilt = 0;
      for (const [paneId, record] of panes) {
        hostedPanes.set(paneId, record);          // ownership was never dropped; make it explicit
        if (addPane(paneId, record.kind)) rebuilt++;
      }
      if (rebuilt === panes.size && [...panes.keys()].every((paneId) => paneIsMounted(paneId))) {
        return 'panes-rebuilt-flat';
      }
      return 'incomplete';
    }

    /** Bounded, content-free restore failure: roll back, say so in both surfaces, refuse. */
    function failRestore(reason, snapshot, panes) {
      host.log(`[dockview-prototype] restore REFUSED: ${reason}\n`);
      const outcome = rollbackRestore(snapshot, panes);
      host.log(`[dockview-prototype] restore rollback: ${outcome}\n`);
      controls.setStatus(outcome === 'incomplete'
        ? `Restore failed (${reason}) and the previous arrangement could not be fully rebuilt. ` +
          'No terminal was closed and the saved layout on disk is unchanged.'
        : `Restore failed (${reason}). The saved layout was NOT applied and is unchanged on disk; ` +
          'your previous panes were put back and no terminal was closed.');
      registry.scheduleAll();
      return { ok: false, reason };
    }

    async function resetLayout() {
      const result = await host.bridge.resetLayout();
      controls.setStatus(result && result.ok ? 'Saved layout cleared.' : 'Reset refused.');
      host.log(`[dockview-prototype] layout reset: ${result && result.ok ? 'ok' : 'refused'}\n`);
      return result;
    }

    /**
     * The default prototype workspace. Explicitly user-triggered — never created on app startup,
     * so a normal launch never spawns a PTY or restores a workspace (§ 9).
     */
    async function useDefaultLayout() {
      const first = await host.createTerminalPane();
      if (first) addPane(first, 'terminal');
      const second = await host.createTerminalPane();
      if (second) addPane(second, 'terminal', { direction: 'right' });
      const library = host.createLibraryPane();
      if (library) addPane(library, 'library', { direction: 'below' });
      controls.setStatus('Default prototype layout loaded.');
      registry.scheduleAll();
    }

    // ---- controls -----------------------------------------------------------------------------
    function buildControls() {
      const element = document.createElement('div');
      element.className = 'dockview-prototype-controls';
      const status = document.createElement('span');
      status.className = 'dockview-prototype-status';
      status.textContent = 'Prototype idle. Nothing is created until you ask.';

      const buttons = [
        ['Add Terminal', async () => { const id = await host.createTerminalPane(); if (id) addPane(id, 'terminal'); }],
        ['Add Library', () => { const id = host.createLibraryPane(); if (id) addPane(id, 'library'); }],
        ['Save Layout', () => saveLayout()],
        ['Restore Layout', () => restoreLayout()],
        ['Use Default', () => useDefaultLayout()],
        ['Reset', () => resetLayout()],
      ].map(([label, onClick]) => {
        const b = document.createElement('button');
        b.className = 'ghost';
        b.textContent = label;
        b.onclick = () => { Promise.resolve(onClick()).catch((e) => host.log(`[dockview-prototype] ${label} failed: ${(e && e.message) || e}\n`)); };
        return b;
      });

      for (const b of buttons) element.appendChild(b);
      element.appendChild(status);
      return { element, setStatus: (t) => { status.textContent = t; } };
    }

    host.log('[dockview-prototype] ACTIVE — layout only. PTY, clipboard, TTS, Dictate, Library remain app-owned.\n');

    return {
      ok: true,
      api: () => api,
      addPane,
      /**
       * The INVERSE convergence: called by the app's own close path (the ✕ button) so a pane closed
       * from its own header also disappears from Dockview. Without it the panel survives as a ghost
       * empty host, its controller and observer leak, and a later Save would persist a panel for a
       * pane that no longer exists — which would restore as a missing pane (§ 5.7).
       * Removal here is suppressed from the close-convergence path, because the app is already
       * mid-close; otherwise the two paths would call each other.
       */
      onAppPaneClosed(paneId) {
        if (!paneId || !api) return;
        // Ownership is dropped FIRST, so the removal this triggers finds nothing left to release
        // and the two directions cannot call each other.
        releasePane(paneId);
        const panel = typeof api.getPanel === 'function' ? api.getPanel(paneId) : null;
        if (!panel) return;
        try { inMountTransition(() => api.removePanel(panel)); }
        catch { host.log('[dockview-prototype] removePanel REFUSED: panel could not be removed\n'); }
      },
      saveLayout,
      restoreLayout,
      resetLayout,
      useDefaultLayout,
      releasePane,
      unmountPane,
      paneIsMounted,
      /** Read-only view of which panes this adapter currently owns. Diagnostics/tests only. */
      ownedPaneIds: () => [...hostedPanes.keys()],
      registry,
      dispose() {
        if (disposed) return;
        disposed = true;
        window.removeEventListener('resize', onWindowResize);
        // Every OWNED pane, not only those carrying a fit controller — the Library pane has no
        // xterm and therefore no controller, but the adapter still owns its mount.
        for (const id of [...hostedPanes.keys()]) releasePane(id);
        for (const id of registry.ids()) releasePane(id);
        registry.disposeAll();
        // Ownership is already gone, so any removal Dockview fires while disposing is a teardown
        // transition: it must not reach the app's close path and kill a PTY on the way out.
        try { inMountTransition(() => api.dispose()); } catch { /* best effort */ }
      },
    };
  }

  const api = { activate, BANNER_TEXT };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ccDockviewPrototype = api;
})();
