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
    // paneId -> the pane element the existing app built, parked here while not mounted in a panel.
    const hostedPanes = new Map();
    let api = null;
    let disposed = false;
    // Set while Dockview is tearing the workspace down on our behalf (fromJSON's implicit clear,
    // or adapter dispose). Removals fired during that window must NOT kill PTYs.
    let suppressCloseConvergence = false;

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
          const hosted = hostedPanes.get(paneId);
          if (hosted && hosted.parentNode !== element) {
            // REPARENT, never rebuild. appendChild moves the existing node, preserving the live
            // xterm, its PTY, and every handler already bound to it.
            element.appendChild(hosted);
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

    /** Tear down everything this adapter owns for a pane. Idempotent. */
    function releasePane(paneId) {
      const controller = registry.get(paneId);
      if (controller && controller._observer) {
        try { controller._observer.disconnect(); } catch { /* best effort */ }
        controller._observer = null;
        controller._observerAttached = false;
      }
      registry.remove(paneId);       // disposes the controller (cancels any pending frame)
      hostedPanes.delete(paneId);
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
      // RE-ENTRANCY: fromJSON() clears the whole workspace first, and those removals surface here
      // as ordinary panel removals. Converging them on the app's close path would ptyKill every
      // live terminal on Restore. The guard makes teardown-driven removals release only the
      // adapter's own state, leaving PTYs alone.
      releasePane(paneId);
      if (suppressCloseConvergence) return;
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
      hostedPanes.set(paneId, element);
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

      try {
        // main validated this immediately before returning it; the shape reaching fromJSON is the
        // shape the validator accepted. fromJSON clears the workspace first, so its removals are
        // suppressed from the close-convergence path (they are not user closes).
        suppressCloseConvergence = true;
        try { api.fromJSON(result.layout); } finally { suppressCloseConvergence = false; }
        controls.setStatus(`Layout restored (saved ${result.savedAt}).`);
        host.log('[dockview-prototype] layout restored\n');
      } catch (e) {
        host.log(`[dockview-prototype] fromJSON FAILED: ${(e && e.message) || e}\n`);
        controls.setStatus('Restore failed. Loading default layout.');
        await useDefaultLayout();
      }
      registry.scheduleAll();
      return result;
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
        releasePane(paneId);
        const panel = typeof api.getPanel === 'function' ? api.getPanel(paneId) : null;
        if (!panel) return;
        suppressCloseConvergence = true;
        try { api.removePanel(panel); } catch (e) { host.log(`[dockview-prototype] removePanel failed: ${(e && e.message) || e}\n`); }
        finally { suppressCloseConvergence = false; }
      },
      saveLayout,
      restoreLayout,
      resetLayout,
      useDefaultLayout,
      releasePane,
      registry,
      dispose() {
        if (disposed) return;
        disposed = true;
        window.removeEventListener('resize', onWindowResize);
        for (const id of registry.ids()) releasePane(id);
        registry.disposeAll();
        try { api.dispose(); } catch { /* best effort */ }
      },
    };
  }

  const api = { activate, BANNER_TEXT };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ccDockviewPrototype = api;
})();
