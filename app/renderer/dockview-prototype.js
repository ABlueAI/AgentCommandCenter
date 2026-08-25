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
  // No banner. Dockview is the production layout engine under Blue's ADOPT verdict, so there is
  // nothing to warn about — a "NOT PRODUCTION" strip on the production surface would be false.

  // ENVIRONMENT SELECTION IS EXPLICIT (round 4). The previous shape was
  //     window.ccDockviewFitPolicy || require('./dockview-fit-policy')
  // which reads fine under Node and is a live grenade in the renderer: when the browser global was
  // missing — because the policy script had failed to PARSE — the `||` fell through and evaluated
  // `require`, which does not exist under `nodeIntegration: false`. That threw
  // "ReferenceError: require is not defined" and took this script down with it.
  //
  // `module` is tested FIRST and `require` is never reached on the browser path, so a renderer can
  // neither name nor evaluate it. Resolution is also DEFERRED into activate(): a missing dependency
  // must still leave this file parsed and `window.ccDockviewPrototype` published, so the bootstrap
  // can verify the export and refuse in a bounded way rather than dying at load time.
  const isCommonJS = typeof module === 'object' && module !== null && !!module.exports;

  function resolveDependency(globalName, cjsPath) {
    if (typeof window !== 'undefined' && window[globalName]) return window[globalName];
    if (isCommonJS) {
      try { return require(cjsPath); } catch { return null; }
    }
    return null;
  }

  // The exact browser globals the prototype cannot start without, each with the member the
  // bootstrap actually calls. A fetched-but-unparsed script publishes NOTHING, so checking the
  // member — not merely the namespace — is what makes script-element `onload` non-load-bearing.
  const REQUIRED_BROWSER_EXPORTS = [
    ['dockview', (v) => !!v && typeof v.createDockview === 'function'],
    ['ccDockviewFitPolicy', (v) => !!v && typeof v.createFitController === 'function' && typeof v.createFitRegistry === 'function'],
    ['ccDockviewPanelPolicy', (v) => !!v && typeof v.shouldLoadDockview === 'function' && typeof v.buildPanelDescriptor === 'function'],
    // Phase C. The renderer validates state immediately before EVERY fromJSON, so a missing or
    // unparsed layout policy is not a degraded mode — it is a refusal that lands on the classic
    // grid. Without it the only alternatives would be an unvalidated fromJSON or a second,
    // drift-prone validator, and both are worse than not starting the layout engine at all.
    ['ccDockviewLayoutPolicy', (v) => !!v
      && typeof v.validateLayout === 'function'
      && typeof v.validateEnvelope === 'function'
      && typeof v.paneIdsFromLayout === 'function'
      && typeof v.comparePaneSets === 'function'
      && typeof v.buildDefaultArrangement === 'function'],
    ['ccDockviewPrototype', (v) => !!v && typeof v.activate === 'function'],
  ];

  /**
   * Which required browser globals are absent or incomplete? Returns names drawn ONLY from the
   * closed literal list above, so a refusal built from it can never carry state, paths, or content.
   */
  function missingBrowserExports(win) {
    if (!win) return REQUIRED_BROWSER_EXPORTS.map(([name]) => name);
    return REQUIRED_BROWSER_EXPORTS
      .filter(([name, isValid]) => { try { return !isValid(win[name]); } catch { return true; } })
      .map(([name]) => name);
  }

  /**
   * @param {object} host  The controlled surface app.js exposes. The adapter may use ONLY these.
   */
  function activate(host) {
    // Dependencies are resolved HERE, not at module load, so a missing one is a bounded refusal
    // instead of a script-killing throw. See resolveDependency above.
    const fitPolicy = resolveDependency('ccDockviewFitPolicy', './dockview-fit-policy');
    const panelPolicy = resolveDependency('ccDockviewPanelPolicy', './dockview-panel-policy');
    // The SAME module main validates with, loaded here as a browser global. Not a renderer copy of
    // the rules — the identical file, so the two sides cannot disagree about what is valid.
    const layoutPolicy = resolveDependency('ccDockviewLayoutPolicy', '../dockview-layout-policy');
    if (!fitPolicy || !panelPolicy || !layoutPolicy) {
      if (host && typeof host.log === 'function') {
        host.log('[dockview] REFUSED: policy modules unavailable\n');
      }
      return { ok: false, reason: 'policy-modules-missing' };
    }
    const REASON = layoutPolicy.REASON;
    // Defense in depth: app.js already gated the dynamic load behind the same predicate. Asserting
    // it again here means this module cannot be activated by being loaded some other way.
    if (!panelPolicy.shouldLoadDockview(host && host.bridge)) {
      return { ok: false, reason: 'dockview-not-enabled' };
    }

    // The prototype's audio-control preflight is GONE, along with the borrow/restore seam it
    // guarded. It existed only because the prototype covered the whole viewport with an opaque
    // full-screen root, which put `.tts-controls` — and therefore Dictate — behind it. The
    // production surface is embedded below the toolbar, so the controls are never covered, never
    // move, and are never this module's business. The adapter now has no knowledge of them at all.

    const dockview = host.getDockviewGlobal();
    if (!dockview || typeof dockview.createDockview !== 'function') {
      host.log('[dockview] REFUSED: dockview bundle did not expose createDockview\n');
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

    // The container is supplied by the host — in production it is the embedded `#terminalDock`
    // inside the Terminals tab. The adapter neither creates nor positions it, and specifically does
    // NOT create a full-screen root: nothing here can cover the toolbar, the navigation, or the
    // `.tts-controls` element.
    const container = host.getContainer();
    const surface = document.createElement('div');
    surface.className = 'dockview-prototype-surface dockview-theme-abyss';

    const controls = buildControls();
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
        // single live resize path for panes this adapter hosts.
        //
        // OWNERSHIP TRANSFERS BOTH WAYS. This hands grid resizing TO the fit controller; the app
        // takes it back with `resumeAppResizeObserver(paneId)` when a pane leaves this adapter
        // without being closed — the adoption-rollback path, where the pane goes home to the
        // classic grid and must resize normally again. A pane that is genuinely closed needs
        // neither: the app's own close path disconnects the observer for good.
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
      // The Library is a SINGLETON that was borrowed from the tab strip, so a permanent release has
      // to give it back — to the exact position it came from. This lives in releasePane and NOT in
      // unmountPane on purpose: a restore-driven rebuild is a mount transition, which calls only
      // unmountPane, so a rebuild reparents the Library between panel hosts without ever sending it
      // home and back (which would flicker it through the tab strip mid-restore).
      if (paneId === 'library' && typeof host.undockLibrary === 'function') {
        try { host.undockLibrary(); }
        catch { host.log('[dockview] Library undock REFUSED: element could not be returned\n'); }
      }
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

    /**
     * Is the pane's GROUP reachable by the user?
     *
     * The pane element itself may be hidden legitimately when it is an inactive TAB, so testing
     * that element would reject valid tab groups. The owning group must nevertheless remain in the
     * document with non-zero geometry: its tab strip is the recovery affordance for every panel in
     * it. A `visible:false` split deserializes as a mounted panel inside a hidden group, which is the
     * stranded-live-PTY state this check closes.
     */
    function paneIsReachable(paneId) {
      if (!paneIsMounted(paneId)) return false;
      let groupElement = null;
      try {
        const panel = typeof api.getPanel === 'function' ? api.getPanel(paneId) : null;
        groupElement = panel && panel.api && panel.api.group && panel.api.group.element;
      } catch { return false; }
      if (!groupElement || !groupElement.isConnected || groupElement.offsetParent === null) return false;
      let rect;
      try { rect = groupElement.getBoundingClientRect(); } catch { return false; }
      return !!(rect && Number.isFinite(rect.width) && Number.isFinite(rect.height)
        && rect.width > 0 && rect.height > 0);
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
        host.log('[dockview] REFUSED: panel removal with no resolvable pane ID\n');
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

    api.onDidLayoutChange(() => {
      registry.scheduleAll();
      // PANE STATUS. Dockview reparents pane elements on a layout change, which can drop the badge
      // NODE. The badge STATE is unaffected — it lives in the badge module keyed by pane id — so
      // re-attaching restores the visual without inventing, resetting, or re-keying a status.
      //
      // This is deliberately keyed by pane id and never by group, position, tab index, or "the active
      // pane": a status indicator that followed POSITION would hand one pane's status to another the
      // moment somebody dragged a tab, which is exactly threat 10 of the procurement record.
      const badge = host && typeof host.reattachPaneStatus === 'function' ? host : null;
      if (badge) badge.reattachPaneStatus();
    });

    const onWindowResize = () => registry.scheduleAll();
    window.addEventListener('resize', onWindowResize);

    // ---- panel creation -----------------------------------------------------------------------
    /**
     * Add one pane to the Dockview workspace. TRANSACTIONAL: it either produces a panel, or it
     * leaves the workspace, the ownership map, and the Library DOM exactly as it found them and
     * returns a bounded refusal. There is no partially-applied outcome and no silent no-op — a
     * silently discarded click is what made Add Library appear to do nothing at all.
     *
     * @returns {{ok: true} | {ok: false, reason: string}}
     */
    function addPane(paneId, kind, positionOptions) {
      // STEP 1 — duplicate detection, BEFORE touching hostedPanes or the Library DOM. Doing this
      // first is what guarantees a duplicate Add cannot leave a stray ownership entry or a homeless
      // singleton behind.
      const existing = typeof api.getPanel === 'function' ? api.getPanel(paneId) : null;
      if (existing) {
        // Focus the panel the user already has. `panel.api.setActive()` is dockview@7.0.4's public
        // panel API (dockviewPanelApi.d.ts: `setActive(): void`), and is what the bundle's own tab
        // handlers call.
        let focused = false;
        try {
          if (existing.api && typeof existing.api.setActive === 'function') { existing.api.setActive(); focused = true; }
        } catch { focused = false; }
        const reason = paneId === 'library' ? 'library-already-open' : 'pane-already-open';
        host.log(`[dockview] ${reason}: focused the existing panel instead of adding a second\n`);
        return { ok: false, reason, focused };
      }

      // STEP 2 — validate the descriptor before any DOM move, so an invalid request never dislodges
      // the Library from the tab strip.
      const title = panelPolicy.defaultTitleFor(paneId);
      const descriptor = panelPolicy.buildPanelDescriptor({ paneId, kind, title });
      if (!descriptor.ok) {
        host.log(`[dockview] REFUSED addPane: ${descriptor.reason}\n`);
        return { ok: false, reason: descriptor.reason };
      }

      // STEP 3 — resolve the element. The Library is borrowed out of the tab strip here, which is
      // the only mutation performed before addPanel, and the only one step 4 has to undo.
      let element = null;
      let didDock = false;
      if (descriptor.panel.component === 'library') {
        element = typeof host.dockLibrary === 'function' ? host.dockLibrary() : null;
        if (!element) {
          host.log('[dockview] REFUSED addPane: library-dom-missing\n');
          return { ok: false, reason: 'library-dom-missing' };
        }
        didDock = true;
      } else {
        element = host.getPaneElement(paneId);
        if (!element) {
          host.log(`[dockview] REFUSED addPane: pane-element-missing (${paneId})\n`);
          return { ok: false, reason: 'pane-element-missing' };
        }
      }

      // STEP 4 — provisional ownership, then the commit. Ownership is recorded WITH the pane's kind
      // so a failed restore can rebuild exactly these panes from exactly these live elements.
      hostedPanes.set(paneId, { element, kind: descriptor.panel.component });
      // Only the three allowlisted fields cross into Dockview. `params` is never supplied, which is
      // why dockview@7.0.4 omits it from toJSON and the layout validator can refuse it outright.
      const options = { id: descriptor.panel.id, component: descriptor.panel.component, title: descriptor.panel.title };
      if (positionOptions) options.position = positionOptions;
      try {
        api.addPanel(options);
      } catch (e) {
        // ROLLBACK: drop the provisional ownership and put the Library back where it was, so a
        // failed add is indistinguishable from never having been attempted.
        hostedPanes.delete(paneId);
        if (didDock && typeof host.undockLibrary === 'function') {
          try { host.undockLibrary(); } catch { /* the refusal below still reports the failure */ }
        }
        host.log(`[dockview] REFUSED addPane: add-panel-failed (${paneId})\n`);
        return { ok: false, reason: 'add-panel-failed' };
      }
      return { ok: true };
    }


    // ---- Phase C: layout persistence ------------------------------------------------------------
    //
    // FOUR honest operations, and one rule they all obey: NO LAYOUT OPERATION MAY CREATE, CLOSE,
    // RESTART, RESUME, OR SILENTLY STRAND A PTY. Layout is arrangement metadata; terminal lifecycle
    // belongs to the app, and nothing below touches it.
    //
    //   Save Arrangement           metadata out, nothing else changes
    //   Restore Saved Arrangement  one validated fromJSON, or a validated rollback
    //   Reset Current Arrangement  the same transaction, applied to a computed default; no file I/O
    //   Clear Saved Arrangement    deletes only the saved file; the workspace is untouched
    //
    // VALIDATION HAPPENS HERE TOO, not only in main. Main validates what it writes and what it
    // reads, but between main's check and `fromJSON` the state crosses IPC and passes through this
    // module — and a rollback snapshot never goes near main at all. So every single `fromJSON` in
    // this file goes through `applyValidatedLayout`, and there is no other call site.

    /** The operation currently running, or null. Exactly one layout operation may run at a time. */
    let busyOperation = null;

    const OPERATION_LABEL = {
      save: 'Saving the current arrangement',
      restore: 'Restoring the saved arrangement',
      reset: 'Resetting the current arrangement',
      clear: 'Clearing the saved arrangement',
    };

    /**
     * Run one layout operation with EXCLUSIVE ownership of the layout.
     *
     * Overlapping operations are the failure mode this prevents: a restore's `fromJSON` interleaved
     * with a save's `toJSON`, or two restores racing to roll back to each other's snapshot, would
     * corrupt the workspace in ways no individual operation could detect. The controls are disabled
     * for the duration AND a programmatic second call is refused, so neither a fast double-click nor
     * a future caller can open the window.
     *
     * The release is in `finally`: an operation that throws must not leave the UI permanently dead.
     * Nothing is ever retried automatically.
     */
    async function runExclusive(name, fn) {
      if (busyOperation !== null) {
        host.log(`[dockview] ${name} REFUSED: ${REASON.BUSY}\n`);
        controls.setStatus(`${OPERATION_LABEL[busyOperation]} is still running. Nothing was changed.`);
        return { ok: false, reason: REASON.BUSY };
      }
      busyOperation = name;
      controls.setBusy(name);
      try {
        return await fn();
      } finally {
        busyOperation = null;
        controls.setIdle();
      }
    }

    /** A bounded refusal: one reason code to the log, one sentence to the status surface. */
    function refuseOperation(name, reason, sentence) {
      host.log(`[dockview] ${name} REFUSED: ${reason}\n`);
      controls.setStatus(sentence);
      return { ok: false, reason };
    }

    /** The pane IDs this adapter OWNS right now, read from its own map — never from saved state. */
    function ownedIds() { return [...hostedPanes.keys()]; }

    /** How many owned panes are terminals, and how many are the Library. Counts only, never IDs. */
    function ownershipCounts() {
      let terminals = 0;
      let library = 0;
      for (const [, record] of hostedPanes) {
        if (record.kind === 'library') library += 1; else terminals += 1;
      }
      return { terminals, library };
    }

    /**
     * THE ONLY `fromJSON` CALL SITE IN THIS FILE.
     *
     * Validates through the shared policy IMMEDIATELY BEFORE applying — not earlier, because the
     * gap between an earlier check and the call is exactly where an unvalidated object could be
     * substituted. A validation failure returns the bounded reason and `fromJSON` is never reached.
     *
     * The apply itself runs inside a mount transition, because `fromJSON` clears the workspace
     * before rebuilding it and every removal it fires is a MOUNT transition, not a user close.
     */
    function applyValidatedLayout(layout) {
      const error = layoutPolicy.validateLayout(layout);
      if (error) return { ok: false, reason: error, applied: false };
      try {
        inMountTransition(() => api.fromJSON(layout));
      } catch {
        // The exception is deliberately NOT echoed: Dockview's messages interpolate panel IDs and
        // layout fragments, and no state content may reach the Logs tab.
        return { ok: false, reason: REASON.APPLY_THREW, applied: true };
      }
      return { ok: true, applied: true };
    }

    /**
     * Did the apply actually produce the workspace it promised?
     *
     * "Did not throw" is not "mounted". This checks four independent things, because each has been
     * a real defect class: a pane silently missing, a panel nobody owns, a rebuilt shell holding a
     * COPY of the element instead of the live one, and ownership drifting between kinds.
     *
     * @param {string[]} expectedIds        the panes that must be present, and no others
     * @param {Map<string,object>} elements paneId -> the element object that must still be there
     * @param {{terminals:number, library:number}} counts  ownership counts that must be unchanged
     */
    function verifyApplied(expectedIds, elements, counts) {
      for (const id of expectedIds) {
        if (!paneIsMounted(id)) return { ok: false, reason: REASON.APPLY_INCOMPLETE };
        if (!paneIsReachable(id)) return { ok: false, reason: REASON.APPLY_INCOMPLETE };
      }
      // No unexpected panel: the workspace must hold exactly the expected set, no more.
      let panelRecords = null;
      try { panelRecords = api.panels; } catch { return { ok: false, reason: REASON.APPLY_INCOMPLETE }; }
      // Enumeration is itself part of the post-apply proof. If the API is unavailable or no longer
      // returns an array, the operation cannot honestly claim that every panel was checked. Refuse
      // as an incomplete apply and roll back; reserve UNEXPECTED_PANEL for a successful enumeration
      // whose contents actually disagree with the expected set.
      if (!Array.isArray(panelRecords)) return { ok: false, reason: REASON.APPLY_INCOMPLETE };
      const livePanels = panelRecords.map((p) => p && p.id);
      const expected = new Set(expectedIds);
      if (livePanels.length !== expected.size) return { ok: false, reason: REASON.UNEXPECTED_PANEL };
      for (const id of livePanels) if (!expected.has(id)) return { ok: false, reason: REASON.UNEXPECTED_PANEL };
      // Object identity: the live xterm, its PTY and every handler ride on the ORIGINAL element.
      // A rebuilt panel holding anything else means the pane was recreated, which would have killed
      // a terminal — the one thing a layout operation may never do.
      for (const [id, element] of elements) {
        const owned = hostedPanes.get(id);
        if (!owned || owned.element !== element) return { ok: false, reason: REASON.IDENTITY_CHANGED };
      }
      const after = ownershipCounts();
      if (after.terminals !== counts.terminals || after.library !== counts.library) {
        return { ok: false, reason: REASON.OWNERSHIP_MISMATCH };
      }
      return { ok: true };
    }

    /**
     * Capture everything needed to put the workspace back exactly as it is right now.
     *
     * Elements are captured BY OBJECT IDENTITY, so the verification after a rollback compares the
     * same objects rather than trusting IDs. The snapshot layout is Dockview's own serialization of
     * the live topology, so a rollback re-applies a shape Dockview itself produced.
     */
    function captureWorkspace() {
      const elements = new Map();
      for (const [id, record] of hostedPanes) elements.set(id, record.element);
      let layout = null;
      try { layout = api.toJSON(); } catch { layout = null; }
      let activePaneId = null;
      try { activePaneId = (api.activePanel && api.activePanel.id) || null; } catch { activePaneId = null; }
      return { ids: [...hostedPanes.keys()], elements, layout, activePaneId, counts: ownershipCounts() };
    }

    /**
     * Put the captured workspace back after a failed apply.
     *
     * ONE attempt, through the same validated call site, and validated AGAIN immediately before it
     * — the snapshot was checked when it was captured, but that was before a failed `fromJSON` ran,
     * and re-checking costs nothing next to restoring the wrong thing.
     *
     * There is deliberately no second strategy. The prototype fell back to clearing and re-adding
     * every pane through `addPane`, which changes the topology, re-docks the Library, and is a
     * REPAIR rather than a rollback. An honest "the previous arrangement could not be fully put
     * back" is better than a quiet substitution, so an incomplete rollback is REPORTED, not patched.
     *
     * @returns {'restored'|'incomplete'}
     */
    function rollbackWorkspace(snapshot) {
      if (!snapshot || !snapshot.layout) return 'incomplete';
      const applied = applyValidatedLayout(snapshot.layout);
      if (!applied.ok) return 'incomplete';
      const verdict = verifyApplied(snapshot.ids, snapshot.elements, snapshot.counts);
      if (!verdict.ok) return 'incomplete';
      // Best-effort: put focus back where the user had it. Never load-bearing for the outcome.
      if (snapshot.activePaneId) {
        try {
          const panel = typeof api.getPanel === 'function' ? api.getPanel(snapshot.activePaneId) : null;
          if (panel && panel.api && typeof panel.api.setActive === 'function') panel.api.setActive();
        } catch { /* focus is cosmetic; a failure here does not make the rollback incomplete */ }
      }
      registry.scheduleAll();
      return 'restored';
    }

    /**
     * The shared tail of Restore and Reset: apply a validated target layout as ONE transaction, and
     * roll back to the captured workspace if anything about the result is wrong.
     *
     * No retry, no repair, no fallback layout, no terminal creation, no continuation.
     */
    function applyAsTransaction(name, targetLayout, snapshot) {
      const applied = applyValidatedLayout(targetLayout);
      if (!applied.ok && !applied.applied) {
        // Validation refused: `fromJSON` was never called, so the workspace is untouched and there
        // is nothing to roll back.
        return refuseOperation(name, applied.reason,
          `${OPERATION_LABEL[name]} refused (${applied.reason}). Nothing was changed.`);
      }

      let verdict = applied.ok ? verifyApplied(snapshot.ids, snapshot.elements, snapshot.counts)
        : { ok: false, reason: applied.reason };

      if (verdict.ok) {
        registry.scheduleAll();
        return { ok: true };
      }

      const outcome = rollbackWorkspace(snapshot);
      host.log(`[dockview] ${name} REFUSED: ${verdict.reason} — rollback ${outcome}\n`);
      controls.setStatus(outcome === 'restored'
        ? `${OPERATION_LABEL[name]} failed (${verdict.reason}). Your previous arrangement was put back; `
          + 'no terminal was closed and the saved arrangement on disk is unchanged.'
        : `${OPERATION_LABEL[name]} failed (${verdict.reason}) and the previous arrangement could NOT be `
          + 'fully put back. No terminal was closed and the saved arrangement on disk is unchanged.');
      return { ok: false, reason: verdict.reason, rollback: outcome };
    }

    // ---- 1. Save Arrangement ----------------------------------------------------------------------
    /**
     * Write the CURRENT arrangement as metadata. Creates and kills nothing, and moves nothing.
     *
     * Four preconditions are checked BEFORE main is called, so a workspace that could not be
     * restored is never written in the first place — and a refusal leaves any previously saved
     * valid arrangement exactly as it was, because nothing reaches the file at all.
     */
    async function saveArrangement() {
      return runExclusive('save', async () => {
        let current = null;
        try { current = api.toJSON(); } catch { current = null; }
        if (!current) {
          return refuseOperation('save', REASON.LAYOUT_SHAPE,
            'Save refused: the layout engine could not describe the current arrangement. Nothing was saved.');
        }

        // (1) + (2) validate, and take the pane IDs from the SAME validated traversal.
        const ids = layoutPolicy.paneIdsFromLayout(current);
        if (!ids.ok) {
          return refuseOperation('save', ids.reason,
            `Save refused (${ids.reason}). Nothing was saved and any previously saved arrangement is unchanged.`);
        }

        // (3) exact set equality against the panes this adapter actually OWNS. Derived
        // independently — one list from the serialized layout, one from the ownership map.
        const match = layoutPolicy.comparePaneSets(ids.sorted, ownedIds());
        if (!match.ok) {
          return refuseOperation('save', match.reason,
            `Save refused (${match.reason}): the arrangement describes ${match.savedCount} pane(s) but `
            + `${match.liveCount} are open. Nothing was saved.`);
        }

        // (4) every owned pane is really mounted. Saving a workspace with an unmounted pane would
        // persist a panel that restores as an empty shell.
        for (const id of hostedPanes.keys()) {
          if (!paneIsMounted(id)) {
            return refuseOperation('save', REASON.PANE_NOT_MOUNTED,
              'Save refused: a pane is not mounted in the layout yet. Nothing was saved.');
          }
        }

        // (5) main validates AGAIN before writing, and owns the path.
        const result = await host.bridge.saveLayout(current);
        if (!result || !result.ok) {
          const reason = (result && result.reason) || 'unknown';
          return refuseOperation('save', reason,
            `Save refused (${reason}). Nothing was written and any previously saved arrangement is unchanged.`);
        }
        host.log('[dockview] arrangement saved\n');
        controls.setStatus(`Arrangement saved (${match.count} pane(s)). No terminal was created, closed or moved.`);
        return { ok: true, savedAt: result.savedAt };
      });
    }

    // ---- 2. Restore Saved Arrangement -------------------------------------------------------------
    /**
     * Apply the saved arrangement to the CURRENTLY LIVE panes, as one transaction.
     *
     * Restoring geometry cannot resurrect a PTY, and this operation never tries: it requires the
     * live pane set to already equal the saved one, EXACTLY. Anything else is refused before
     * `fromJSON`, because the alternatives are both kill criteria — mounting empty shells for saved
     * panes that are not open, or stranding open panes the saved state does not mention.
     */
    async function restoreArrangement() {
      return runExclusive('restore', async () => {
        const loaded = await host.bridge.loadLayout();
        if (!loaded || !loaded.ok) {
          const reason = (loaded && loaded.reason) || 'unknown';
          // A refusal is a FULL STOP: no terminal is created, no default layout is substituted, and
          // the current workspace is left exactly as it was. The invalid file stays on disk for
          // diagnosis, untouched by main.
          return refuseOperation('restore', reason, reason === REASON.NOT_FOUND
            ? 'There is no saved arrangement yet. Nothing was changed.'
            : `Restore refused (${reason}). Nothing was changed and the saved file is unchanged on disk.`);
        }

        // Validate AGAIN, here, against the whole envelope — not just the layout. Main already
        // validated what it read, but this side is the one about to call `fromJSON`.
        const verdict = layoutPolicy.validateEnvelope(loaded.envelope);
        if (!verdict.ok) {
          return refuseOperation('restore', verdict.reason,
            `Restore refused (${verdict.reason}). Nothing was changed and the saved file is unchanged on disk.`);
        }
        const savedLayout = verdict.envelope.layout;

        // EXACT set equality. The two lists are derived independently: the saved one from the
        // validated saved layout, the live one from this adapter's ownership map.
        const ids = layoutPolicy.paneIdsFromLayout(savedLayout);
        if (!ids.ok) {
          return refuseOperation('restore', ids.reason,
            `Restore refused (${ids.reason}). Nothing was changed.`);
        }
        const match = layoutPolicy.comparePaneSets(ids.sorted, ownedIds());
        if (!match.ok) {
          const detail = match.reason === REASON.SAVED_NOT_LIVE
            ? `${match.savedNotLive} saved pane(s) are not open. Open them first.`
            : match.reason === REASON.LIVE_NOT_SAVED
              ? `${match.liveNotSaved} open pane(s) are not in the saved arrangement. Close them first.`
              : `the saved arrangement describes ${match.savedCount} pane(s) and ${match.liveCount} are open.`;
          return refuseOperation('restore', match.reason,
            `Restore refused (${match.reason}): ${detail} Nothing was changed and the saved file is intact.`);
        }

        // Capture the rollback target, and refuse BEFORE touching the workspace if it could not be
        // put back. Applying a change we cannot undo is worse than not applying it.
        const snapshot = captureWorkspace();
        if (!snapshot.layout || layoutPolicy.validateLayout(snapshot.layout)) {
          return refuseOperation('restore', REASON.SNAPSHOT_INVALID,
            'Restore refused: the current arrangement could not be captured for rollback, so nothing was changed.');
        }

        const outcome = applyAsTransaction('restore', savedLayout, snapshot);
        if (!outcome.ok) return outcome;
        host.log('[dockview] arrangement restored\n');
        controls.setStatus(`Saved arrangement restored (${match.count} pane(s)). No terminal was created or closed.`);
        return { ok: true, savedAt: loaded.envelope.savedAt };
      });
    }

    // ---- 3. Reset Current Arrangement -------------------------------------------------------------
    /**
     * Re-arrange the panes that are ALREADY open into the deterministic default, and do nothing
     * else. It reads no file, writes no file, and — critically — creates no terminal.
     *
     * The prototype's `useDefaultLayout()` is GONE, not disabled. That control created two
     * terminals and the Library every time it ran, which multiplied live PTYs during human
     * acceptance; there is now no UI control and no automatic route in production that can create a
     * pane as a side effect of a layout operation. The default arrangement is computed from the
     * panes that exist (`buildDefaultArrangement`), so it cannot conjure one.
     */
    async function resetArrangement() {
      return runExclusive('reset', async () => {
        if (hostedPanes.size === 0) {
          return refuseOperation('reset', REASON.NO_LIVE_PANES,
            'There are no open panes to re-arrange. Nothing was changed and no terminal was created.');
        }

        const snapshot = captureWorkspace();
        if (!snapshot.layout || layoutPolicy.validateLayout(snapshot.layout)) {
          return refuseOperation('reset', REASON.SNAPSHOT_INVALID,
            'Reset refused: the current arrangement could not be captured for rollback, so nothing was changed.');
        }

        // Built from the LIVE ownership map, so the pane set is preserved by construction.
        const panes = [];
        for (const [id, record] of hostedPanes) {
          panes.push({ id, component: record.kind, title: panelPolicy.defaultTitleFor(id) });
        }
        const built = layoutPolicy.buildDefaultArrangement({
          panes,
          width: snapshot.layout.grid.width,
          height: snapshot.layout.grid.height,
        });
        if (!built.ok) {
          return refuseOperation('reset', built.reason,
            `Reset refused (${built.reason}). Nothing was changed and no terminal was created.`);
        }

        const outcome = applyAsTransaction('reset', built.layout, snapshot);
        if (!outcome.ok) return outcome;
        host.log('[dockview] current arrangement reset\n');
        controls.setStatus(`Current arrangement reset to the default row (${snapshot.ids.length} pane(s)). `
          + 'No terminal was created or closed, and the saved arrangement was not read or written.');
        return { ok: true };
      });
    }

    // ---- 4. Clear Saved Arrangement ---------------------------------------------------------------
    /**
     * Delete ONLY the saved metadata file. It closes no pane, kills no PTY, moves nothing, and never
     * calls `fromJSON` — the status says so explicitly, because the prototype's bare "Saved layout
     * cleared." read like the live workspace had been reset, which it never was.
     */
    async function clearSavedArrangement() {
      return runExclusive('clear', async () => {
        const result = await host.bridge.resetLayout();
        if (!result || !result.ok) {
          const reason = (result && result.reason) || 'unknown';
          return refuseOperation('clear', reason,
            `Clear Saved Arrangement refused (${reason}). Your live panes were NOT changed.`);
        }
        host.log('[dockview] saved arrangement cleared\n');
        // An already-absent file is a SUCCESSFUL no-op — the caller asked for "no saved arrangement"
        // and that is the state. Saying so is more honest than reporting a deletion that did not
        // happen, and more honest than reporting a failure.
        controls.setStatus(result.existed === false
          ? `There was no saved arrangement to clear. Your live panes were NOT changed — ${hostedPanes.size} pane(s) still open.`
          : `Saved arrangement deleted. Your live panes were NOT changed — ${hostedPanes.size} pane(s) still open.`);
        return { ok: true, existed: result.existed !== false };
      });
    }

    // ---- controls -----------------------------------------------------------------------------
    function buildControls() {
      const element = document.createElement('div');
      element.className = 'dockview-prototype-controls';
      const status = document.createElement('span');
      status.className = 'dockview-prototype-status';
      status.textContent = 'Layout ready. Panes are created by + Shell, the Agents tab, and Library.';

      // THE FOUR PHASE-C CONTROLS, enabled and honest.
      //
      // Terminal creation is deliberately NOT here: `+ Shell` and the Agents tab own it, and a
      // second creation affordance is exactly how the prototype's "Use Default" quietly multiplied
      // PTYs. Library docking is not here either — the Library tab owns it. Every control on this
      // bar changes ARRANGEMENT or SAVED METADATA, and nothing else.
      //
      // Each carries a stable id so tests and support transcripts can address it by name rather
      // than by label text or DOM position.
      const BUTTONS = [
        ['dvSaveArrangement', 'Save Arrangement', 'Write the current arrangement to disk. No terminal is created, closed or moved.', () => saveArrangement()],
        ['dvRestoreArrangement', 'Restore Saved Arrangement', 'Re-apply the saved arrangement to the panes that are open now.', () => restoreArrangement()],
        ['dvResetArrangement', 'Reset Current Arrangement', 'Re-arrange the panes that are open now into the default row. Nothing is created, closed or saved.', () => resetArrangement()],
        ['dvClearSaved', 'Clear Saved Arrangement', 'Delete the saved arrangement file. Your open panes are not changed.', () => clearSavedArrangement()],
      ];
      const buttons = BUTTONS.map(([id, label, title, run]) => {
        const b = document.createElement('button');
        b.className = 'ghost';
        b.id = id;
        b.textContent = label;
        b.title = title;
        // The floating promise is deliberate — the handler must return immediately — but it can
        // never go unhandled: every operation resolves to a bounded result, and the .catch is the
        // belt-and-braces net for a defect inside the operation itself.
        b.onclick = () => {
          run().catch(() => {
            host.log('[dockview] layout operation FAILED unexpectedly\n');
            status.textContent = 'That layout operation failed unexpectedly. Nothing was changed.';
          });
        };
        return b;
      });

      for (const b of buttons) element.appendChild(b);
      element.appendChild(status);
      return {
        element,
        setStatus: (t) => { status.textContent = t; },
        /** Disable every control for the duration of one operation, and say which one is running. */
        setBusy: (name) => {
          for (const b of buttons) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
          status.textContent = `${OPERATION_LABEL[name]}…`;
        },
        /** Always reached through `finally`, so a thrown operation cannot leave the UI dead. */
        setIdle: () => {
          for (const b of buttons) { b.disabled = false; b.removeAttribute('aria-disabled'); }
        },
        buttonIds: () => buttons.map((b) => b.id),
      };
    }

    host.log('[dockview] layout engine active — layout only. PTY, clipboard, TTS, Dictate and Library remain app-owned.\n');

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
        catch { host.log('[dockview] removePanel REFUSED: panel could not be removed\n'); }
      },
      /**
       * Maximize / restore the panel hosting `paneId`.
       *
       * Uses dockview@7.0.4's public panel API, VERIFIED against the installed type definitions
       * (`dockview-core/dist/cjs/api/dockviewPanelApi.d.ts` declares `maximize(): void`,
       * `isMaximized(): boolean`, `exitMaximized(): void`) and confirmed present in the shipped UMD
       * bundle. The method names are read from the installed package, never inferred.
       *
       * REFIT IS PART OF THE OPERATION, and it happens through the OWNING path. Maximizing hides
       * every sibling leaf view and gives the maximized one the whole surface, so both the grown
       * pane and the shrunk ones need a fit; the gated controllers are the only thing allowed to do
       * that for a hosted pane, so they are scheduled here. The caller must NOT also run the
       * classic grid fitter — that would be a second resize owner for the same panes.
       *
       * Returns null when this adapter does not host the pane, or when the panel API refuses. The
       * caller treats null as a REFUSAL and must not silently fall through to the grid maximizer:
       * that would hide the siblings of a grid that is not even on screen.
       */
      maximizePane(paneId) {
        if (!paneId || !api || !hostedPanes.has(paneId)) return null;
        const panel = typeof api.getPanel === 'function' ? api.getPanel(paneId) : null;
        if (!panel || !panel.api || typeof panel.api.maximize !== 'function') return null;
        try {
          const already = typeof panel.api.isMaximized === 'function' && panel.api.isMaximized();
          if (already) {
            if (typeof panel.api.exitMaximized === 'function') panel.api.exitMaximized();
            registry.scheduleAll();
            return { maximized: false };
          }
          panel.api.maximize();
          registry.scheduleAll();
          return { maximized: true };
        } catch {
          host.log('[dockview] maximize REFUSED: the panel API rejected the request\n');
          return null;
        }
      },
      /**
       * Is the panel hosting `paneId` currently maximized? Returns null when this adapter does not
       * host the pane or the panel API cannot answer, so the caller can distinguish "not mine" from
       * a definite false. Read-only: it exists so the app can keep its own ⛶/🗗 glyphs truthful
       * after a maximize that changed which panel is maximized.
       */
      isPaneMaximized(paneId) {
        if (!paneId || !api || !hostedPanes.has(paneId)) return null;
        const panel = typeof api.getPanel === 'function' ? api.getPanel(paneId) : null;
        if (!panel || !panel.api || typeof panel.api.isMaximized !== 'function') return null;
        try { return panel.api.isMaximized() === true; } catch { return null; }
      },
      // THE FOUR PHASE-C OPERATIONS. `useDefaultLayout` is deliberately absent from this surface,
      // not merely unbound from a button: nothing outside this module can reach a routine that
      // creates panes as a side effect of a layout operation, because no such routine exists.
      saveArrangement,
      restoreArrangement,
      resetArrangement,
      clearSavedArrangement,
      /** Which operation is running, or null. Read-only; the exclusivity itself is enforced inside. */
      busyOperation: () => busyOperation,
      releasePane,
      unmountPane,
      paneIsMounted,
      /** Read-only view of which panes this adapter currently owns. Diagnostics/tests only. */
      ownedPaneIds: () => [...hostedPanes.keys()],
      /** The stable ids of the four layout controls, for tests and support transcripts. */
      controlIds: () => controls.buttonIds(),
      /**
       * Diagnostics for human acceptance. Terminal IDs are MONOTONIC and never reused, so a pane
       * labelled "Terminal 17" does not mean seventeen terminals are live — it means seventeen have
       * been created since launch. These counters report what is actually live and actually owned,
       * so the two can never be confused while reading the screen.
       */
      diagnostics: () => ({
        liveTerminals: typeof host.liveTerminalCount === 'function' ? host.liveTerminalCount() : null,
        liveTerminalIds: typeof host.liveTerminalIds === 'function' ? host.liveTerminalIds() : null,
        ownedPanes: hostedPanes.size,
        ownedPaneIds: [...hostedPanes.keys()],
        fitControllers: registry.size(),
        libraryDocked: typeof host.isLibraryDocked === 'function' ? host.isLibraryDocked() : null,
      }),
      registry,
      dispose() {
        if (disposed) return;
        disposed = true;
        // No audio undock here any more. The production surface never borrows `.tts-controls`, so
        // there is nothing to give back and no ordering constraint to honour.
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

  /**
   * FAIL-SAFE BROWSER BOOTSTRAP (round 4).
   *
   * The round-3 sequence created the full-screen prototype root and THEN called activate(). When the
   * script chain had not actually initialized, activation threw, the root survived, and
   * `.dockview-prototype-root` (position:fixed; inset:0; opaque background; z-index:9000) covered a
   * perfectly working application with an opaque rectangle — the observed blank screen.
   *
   * The order is now: verify exports -> build the root -> activate inside an error boundary ->
   * publish the instance only on `ok === true`. Every failure removes any root this call created,
   * clears any partial instance, emits ONE bounded reason, and leaves the existing UI usable. No
   * exception text, path, layout fragment, or source text is ever echoed.
   *
   * `win`/`doc` are injected so the same function is exercised by Node tests and by the real
   * Electron harness — the bootstrap is never proven by reading its source.
   */
  function bootstrap(options) {
    const opts = options || {};
    const win = opts.win;
    const doc = opts.doc;
    const log = typeof opts.log === 'function' ? opts.log : () => {};
    const buildHost = opts.buildHost;
    // The EMBEDDED production container. The bootstrap looks it up; it never creates it, and it
    // never creates a full-screen root. If the markup does not provide it, that is a refusal — a
    // silently-invented container is how a dead layout ends up covering a working application.
    const containerId = opts.containerId || 'terminalDock';

    if (!win || !doc || typeof buildHost !== 'function') {
      log('[dockview] REFUSED: bootstrap-misconfigured\n');
      return { ok: false, reason: 'bootstrap-misconfigured' };
    }

    let container = null;
    const refuse = (reason) => {
      // Strip anything a partial activation appended, so no half-built surface survives. The
      // container is empty in markup and only this adapter ever writes into it, so clearing it is
      // exact rather than approximate. Wrapped: a refusal that throws would be worse than the
      // failure it reports.
      try {
        if (container) { while (container.firstChild) container.removeChild(container.firstChild); }
      } catch { /* best effort */ }
      // The container stays hidden. The caller never switched the visible surface, because that
      // switch happens only after a successful activation — so the classic grid is still the live,
      // usable terminal workspace in this same process.
      log(`[dockview] REFUSED: ${reason} — layout engine not started, classic grid left usable\n`);
      return { ok: false, reason };
    };

    // A script element's onload fires when the file was FETCHED, not when it parsed and published
    // an API. Both policy scripts once fetched fine and then failed to parse, which is precisely why
    // onload is not treated as proof of anything here.
    const missing = missingBrowserExports(win);
    if (missing.length > 0) return refuse(`missing-exports:${missing.join('+')}`);

    try {
      container = doc.getElementById(containerId);
    } catch {
      container = null;
    }
    if (!container) return refuse('dock-container-missing');

    let instance = null;
    try {
      instance = win.ccDockviewPrototype.activate(buildHost(container));
    } catch {
      return refuse('activation-threw');
    }
    if (!instance || instance.ok !== true) {
      return refuse(instance && instance.reason ? `activation-refused:${instance.reason}` : 'activation-refused');
    }

    // The instance is RETURNED, not published on `window`. The prototype's
    // `window.ccDockviewPrototypeInstance` was a mutable global that the app's close path read as an
    // authority; any script could have replaced it. The caller now holds it in module scope.
    log('[dockview] layout engine started\n');
    return { ok: true, instance };
  }

  const api = { activate, bootstrap, missingBrowserExports };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ccDockviewPrototype = api;
})();
