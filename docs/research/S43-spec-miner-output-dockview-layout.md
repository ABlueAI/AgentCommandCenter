<!-- Raw output of ECC's spec-miner (S43 trial, 2026-11-23), kept unedited below this note.
     It is not a Mako spec and nothing reads it. Five of its 40 blocks are partly wrong; the
     corrections and the gaps it missed are in S43-spec-miner-trial.md, which is the one to read. -->

# Spec: dockview-layout

> Auto-extracted by spec-miner. Last mined: 2026-11-23.
> Source: app/renderer/dockview-prototype.js, app/renderer/dockview-fit-policy.js, app/renderer/dockview-panel-policy.js, app/dockview-layout-policy.js, app/dockview-layout-store.js, app/main.js (layout IPC), app/preload.js (ccDockview bridge), app/renderer/app.js (layout engine startup, pane docking, close/maximize routing, Library docking)
> Last verified: 2026-11-23 (commit 0f035e81ef8874f7bdf549b3834e12c2eccaf8ad)

<!-- description: How Mako's renderer lays out agent terminal panes and the Library with dockview 7.0.4: choosing the layout engine, starting it, adopting and adding panes, mounting and moving panels, closing panes, fitting terminals and resizing PTYs, maximizing, and saving, restoring, resetting and clearing the saved arrangement through the main-owned layout file. -->

---

### Requirement: Layout engine selection
<!-- id: app.startLayoutEngine -->
<!-- entities: ccDockview, layoutInstance -->
<!-- enforced: app.startLayoutEngine() -->

Main SHALL choose the layout engine. Dockview is the default, and the `--classic-layout` flag switches to classic recovery mode. The renderer SHALL start Dockview only when `window.ccDockview.enabled === true`. `dockview-panel-policy.shouldLoadDockview()` SHALL accept only the boolean `true`, so values like `'true'`, `1` or `{}` do not count. In classic mode the preload SHALL expose `enabled: false` with no `saveLayout`/`loadLayout`/`resetLayout` members, and main SHALL NOT register the layout IPC channels.

#### Scenario: Normal launch
- **WHEN** the app starts without `--classic-layout`
- **THEN** main registers `dockview-layout-save`, `dockview-layout-load` and `dockview-layout-reset`, and the renderer loads the Dockview scripts in order: the vendor bundle, fit policy, panel policy, layout policy, then the adapter

#### Scenario: Classic recovery mode
- **WHEN** the app starts with `--classic-layout`
- **THEN** no Dockview script is loaded, the layout IPC is not registered, the classic grid is shown, and a "CLASSIC RECOVERY MODE" line is logged

#### Scenario: Truthy but non-boolean enable signal
- **WHEN** `bridge.enabled` is truthy but not the boolean `true`
- **THEN** `shouldLoadDockview` returns false and `activate()` returns `{ ok:false, reason:'dockview-not-enabled' }`

---

### Requirement: Fail-safe layout engine startup
<!-- id: app.startLayoutEngine -->
<!-- entities: layoutInstance, terminalDock, terminalGrid -->
<!-- triggers: Adopt existing panes all-or-nothing -->
<!-- enforced: app.startLayoutEngine() -->

Startup SHALL keep the classic grid visible until the scripts have loaded, the browser exports have been checked, `bootstrap()` has succeeded and every existing pane has been adopted. Only then SHALL it switch the visible surface to `#terminalDock`. If any step fails, it SHALL log one bounded reason and show the grid. The adapter instance SHALL be kept in a module-local variable, not on `window`. After success, a frozen, non-writable `window.ccDockviewDiagnostics` read-only surface SHALL be defined.

#### Scenario: A script fails to load
- **WHEN** any script in `DOCKVIEW_SCRIPTS` fails to load
- **THEN** `[dockview] REFUSED: script-load-failed` is logged and the grid stays visible

#### Scenario: Exports missing after load
- **WHEN** a script loaded but its global (for example `ccDockviewLayoutPolicy.validateLayout`) is absent
- **THEN** startup refuses with `adapter-export-missing` or `missing-exports:<names>`, where the names come only from the adapter's fixed list

#### Scenario: Adoption fails
- **WHEN** `adoptExistingPanes()` returns false
- **THEN** the instance is disposed, `layoutInstance` becomes null, `#terminalDock` is emptied, the refusal reason is `pane-adoption-failed`, and the grid stays visible

#### Scenario: Success
- **WHEN** every step succeeds
- **THEN** `#terminalDock` is shown, `#terminalGrid` is hidden, and "production layout engine active" is logged

---

### Requirement: Bootstrap and activation refusals
<!-- id: dockview-prototype.bootstrap -->
<!-- entities: ccDockviewPrototype, terminalDock -->
<!-- enforced: dockview-prototype.bootstrap() -->

`bootstrap()` SHALL check the required browser exports before touching the DOM. It SHALL bind only to an existing `#terminalDock` and never create a container or a full-screen root. It SHALL run `activate()` inside an error boundary and return the instance only when `ok === true`. On any refusal it SHALL remove everything it added to the container. `activate()` SHALL refuse without throwing if a policy module is unavailable (`policy-modules-missing`) or the bundle has no `createDockview` (`bundle-missing`). It SHALL create the dockview instance with `disableFloatingGroups: true`.

#### Scenario: Container missing
- **WHEN** `#terminalDock` does not exist
- **THEN** `{ ok:false, reason:'dock-container-missing' }` is returned

#### Scenario: Activation throws or refuses
- **WHEN** `activate()` throws, or returns a result whose `ok` is not `true`
- **THEN** the container's children are removed and the reason is `activation-threw` or `activation-refused[:<reason>]`

#### Scenario: Misconfigured call
- **WHEN** `win`, `doc` or `buildHost` is missing
- **THEN** `bootstrap-misconfigured` is returned

---

### Requirement: Adopt existing panes all-or-nothing
<!-- id: app.adoptExistingPanes -->
<!-- entities: terms, layoutInstance -->
<!-- enforced: app.adoptExistingPanes() -->

Terminal panes created while the Dockview scripts were loading SHALL be adopted with `addPane(id,'terminal')`. If one adoption fails, every pane already adopted SHALL be released through `onAppPaneClosed`, and `returnAllPanesToGrid()` SHALL move each pane back under `#terminalGrid`, reconnect the app's own ResizeObserver and run one `fitAllTerms()`. No PTY is created or killed on this path.

#### Scenario: One adoption refused
- **WHEN** the third of three existing panes fails `addPane`
- **THEN** the first two are released from the adapter, all three are back in the grid with `roConnected === true`, and the function returns false

---

### Requirement: Add a pane as a transaction
<!-- id: dockview-prototype.addPane -->
<!-- entities: hostedPanes, Library, DockviewPanel -->
<!-- enforced: dockview-prototype.addPane() -->

`addPane(paneId, kind, positionOptions)` SHALL either create exactly one panel and return `{ok:true}`, or leave the workspace, the ownership map and the Library DOM unchanged and return a bounded refusal. It SHALL check for a duplicate first, then validate the descriptor, then get the element (moving the Library out of the tab strip for `kind:'library'`). It SHALL then record provisional ownership `{element, kind}` and call `api.addPanel` with only `id`, `component`, `title` and an optional `position`.

#### Scenario: Pane already open
- **WHEN** a panel with `paneId` already exists
- **THEN** the existing panel is activated with `panel.api.setActive()` and `{ ok:false, reason:'library-already-open'|'pane-already-open', focused }` is returned; ownership and the DOM are unchanged

#### Scenario: Invalid descriptor
- **WHEN** `buildPanelDescriptor` refuses the request
- **THEN** its reason is returned and no element is moved

#### Scenario: Element missing
- **WHEN** the Library DOM is missing, or the terminal pane element is missing
- **THEN** `library-dom-missing` or `pane-element-missing` is returned

#### Scenario: addPanel throws
- **WHEN** `api.addPanel` throws
- **THEN** the provisional ownership is deleted, a docked Library is moved back home, and `add-panel-failed` is returned

---

### Requirement: Panel descriptor allowlist
<!-- id: dockview-panel-policy.buildPanelDescriptor -->
<!-- entities: PanelDescriptor -->
<!-- enforced: dockview-panel-policy.buildPanelDescriptor() -->

The panel descriptor SHALL be built only from a pane ID matching `^(library|pty[0-9]{1,6})$`, a kind in `{terminal, library}`, and a safe title. A safe title is 1–200 characters with no path separators, drive letters, URL schemes, `..`, control characters or credential words. The descriptor SHALL be frozen. `defaultTitleFor` SHALL derive titles from the pane ID alone: `Library`, `Terminal N`, or `''` for anything else.

#### Scenario: Refusals
- **WHEN** the pane ID, kind or title fails its check
- **THEN** `bad-pane-id`, `unknown-component-kind` or `unsafe-title` is returned

#### Scenario: Title derivation
- **WHEN** `defaultTitleFor('pty12')` is called
- **THEN** it returns `'Terminal 12'`

---

### Requirement: Dock a terminal before starting its PTY
<!-- id: app.openInAppTerminal -->
<!-- entities: terms, layoutInstance, Pty -->
<!-- enforced: app.openInAppTerminal() -->

When Dockview is active, a new terminal pane SHALL be docked with `addPane(id,'terminal')` before `cc.ptyStart` is called. If docking fails, `rollbackLocalPane()` SHALL undo the renderer-side pane without calling `ptyStart` or `ptyKill`. If the start is refused or the IPC call rejects, the pane SHALL be closed through the single close path, which also removes its panel.

#### Scenario: Dock refused
- **WHEN** `addPane` returns a non-ok result or throws
- **THEN** the refusal is logged, the xterm is disposed, the pane is removed from `terms`, and no PTY is started

#### Scenario: Start failed in Dockview mode
- **WHEN** `ptyStart` resolves with `ok !== true` or rejects, and the pane is still open
- **THEN** `closeThisPane()` runs, which removes the Dockview panel and kills the PTY

#### Scenario: Start failed in classic mode
- **WHEN** the start fails and `layoutInstance` is null
- **THEN** the failure is logged and the pane is kept

---

### Requirement: Reparent the live pane into each panel host
<!-- id: dockview-prototype.createPaneRenderer -->
<!-- entities: hostedPanes, mountedHosts, DockviewPanel -->
<!-- triggers: Fit controller per terminal pane -->
<!-- enforced: dockview-prototype.createPaneRenderer() -->

When Dockview initializes a panel component, the adapter SHALL move the pane element it already owns into the panel's host element with `appendChild`, record the host in `mountedHosts`, and make sure a fit controller exists. It SHALL never rebuild the pane. `onShow` SHALL schedule a fit. `onHide` and `dispose` SHALL do nothing.

#### Scenario: Panel moved or rebuilt by fromJSON
- **WHEN** Dockview builds a new panel for an owned `paneId`
- **THEN** the same element object (with its xterm and PTY) becomes a child of the new host, and `paneIsMounted(paneId)` is true

---

### Requirement: Panel removal from Dockview converges on the app close path
<!-- id: dockview-prototype.activate -->
<!-- entities: hostedPanes, terms, DockviewPanel -->
<!-- enforced: dockview-prototype.activate() -->

`onDidRemovePanel` SHALL read the pane ID from the panel payload itself. During a mount transition (inside `fromJSON`, an app-side `removePanel`, or `dispose`) it SHALL only unmount: release the controller, the observer and the `mountedHosts` entry, and keep ownership. Otherwise it SHALL release the pane and call `host.closePane(paneId)`, which runs the pane's idempotent `closeThisPane`.

#### Scenario: User closes a panel tab
- **WHEN** a panel is removed outside a mount transition
- **THEN** ownership is dropped and the app's close path kills the PTY once and disposes the xterm once

#### Scenario: Removal during fromJSON
- **WHEN** `fromJSON` clears the workspace
- **THEN** each removed pane is unmounted only, and stays in `hostedPanes`

#### Scenario: Payload without an ID
- **WHEN** the removal payload has no `id`
- **THEN** `[dockview] REFUSED: panel removal with no resolvable pane ID` is logged

---

### Requirement: App close button removes the Dockview panel
<!-- id: app.closeThisPane -->
<!-- entities: terms, layoutInstance, DockviewPanel -->
<!-- enforced: app.closeThisPane() -->

`closeThisPane` SHALL return early if the pane is no longer in `terms`. Otherwise it SHALL call `layoutInstance.onAppPaneClosed(id)`, then clear maximize state, disconnect the app ResizeObserver, `ptyKill`, dispose the xterm, remove the pane and delete it from `terms`. `onAppPaneClosed` SHALL release ownership first and then call `api.removePanel` inside a mount transition, so the two close directions cannot call each other.

#### Scenario: Close from the ✕ button
- **WHEN** the user clicks ✕ on a docked pane
- **THEN** the panel is removed from Dockview, and the PTY kill happens exactly once

#### Scenario: Repeat close
- **WHEN** `closeThisPane` runs again for an already-closed pane
- **THEN** nothing happens

---

### Requirement: Library singleton docking
<!-- id: app.dockLibraryElement -->
<!-- entities: Library, libraryHomePlaceholder -->
<!-- enforced: app.dockLibraryElement() -->

The single `#libraryPane` element SHALL be moved, never copied, into a panel. A comment placeholder SHALL mark its original position. Docking SHALL be idempotent. When the Library pane is released (a real close, not a mount transition), `undockLibraryElement` SHALL put it back at the placeholder and remove the placeholder. Undocking when the Library is not docked SHALL return false without throwing.

#### Scenario: Close the Library panel
- **WHEN** the Library panel is closed by the user or by `dispose`
- **THEN** the element returns to the exact position marked by its placeholder in the tab strip

#### Scenario: Restore rebuild
- **WHEN** `fromJSON` rebuilds the Library panel
- **THEN** the element is moved between panel hosts without going back to the tab strip

---

### Requirement: Library navigation while Dockview is active
<!-- id: app.openLibraryInDock -->
<!-- entities: Library, libState -->
<!-- enforced: app.openLibraryInDock() -->

While Dockview is active, opening the Library SHALL switch to the Terminals tab and add or focus the `library` panel. `library-already-open` SHALL count as success. If the Library has never been loaded, a first-load refresh SHALL run unless `firstLoadRefresh:false` is passed. In classic mode the original Library tab SHALL be used.

#### Scenario: Library already docked
- **WHEN** the user opens the Library and it is already a panel
- **THEN** that panel is focused and the call returns true

#### Scenario: Add refused
- **WHEN** `addPane('library','library')` returns any other refusal
- **THEN** the refusal is logged and the call returns false

---

### Requirement: Focus follows panel activation
<!-- id: dockview-prototype.activate -->
<!-- entities: activeTermId, DockviewPanel -->
<!-- enforced: dockview-prototype.activate() -->

When the active panel changes, the adapter SHALL call `host.focusPane(paneId)`, which sets `activeTermId` and focuses the xterm, and SHALL schedule that pane's fit.

#### Scenario: Tab activation
- **WHEN** the user activates the tab for `pty3`
- **THEN** `activeTermId` becomes `pty3` and a fit is scheduled for `pty3`

---

### Requirement: Refit on layout change and window resize
<!-- id: dockview-prototype.activate -->
<!-- entities: FitRegistry, paneStatusBadge -->
<!-- enforced: dockview-prototype.activate() -->

On `onDidLayoutChange` and on window `resize`, the adapter SHALL schedule a fit for every controller. On a layout change it SHALL also call `host.reattachPaneStatus()`, which re-attaches badges by pane ID, never by position.

#### Scenario: Drag a tab to another group
- **WHEN** Dockview reports a layout change
- **THEN** every fit controller is scheduled, and each badge is re-attached to the pane with the same ID

---

### Requirement: Gated, coalesced terminal fit
<!-- id: dockview-fit-policy.createFitController -->
<!-- entities: FitController, Pty -->
<!-- enforced: dockview-fit-policy.createFitController() -->

`schedule()` SHALL request at most one animation frame at a time, merging extra calls into the pending frame. When the frame runs, the controller SHALL skip the pane without retrying if `isVisible()` is not true: the pane must be connected, have an `offsetParent`, and have non-zero size. Otherwise it SHALL call `fit()` and `measure()`. It SHALL refuse geometry unless cols and rows are positive integers, and SHALL skip the resize if cols and rows match the last values sent. If they pass, it SHALL call `sendResize(paneId, cols, rows)`, which maps to `cc.ptyResize`. `dispose()` SHALL be idempotent, cancel any pending frame, and make later `schedule()` calls do nothing. Construction SHALL throw if any dependency is missing or `paneId` is empty.

#### Scenario: Burst of events
- **WHEN** `schedule()` is called many times before the frame runs
- **THEN** exactly one fit runs

#### Scenario: Hidden panel
- **WHEN** the frame runs while the pane is hidden or zero-sized
- **THEN** no fit, no measure and no resize happen, and nothing is rescheduled

#### Scenario: Bad or repeated geometry
- **WHEN** the measured cols/rows are 0, negative, non-integer, or the same as the last values sent
- **THEN** no `ptyResize` is sent

---

### Requirement: Fit controller per terminal pane
<!-- id: dockview-prototype.ensureController -->
<!-- entities: FitRegistry, FitController, ResizeObserver -->
<!-- enforced: dockview-prototype.ensureController() -->

Only panes in `terms` (terminals) SHALL get a controller. The Library gets none. `registry.ensure` SHALL return the existing controller for a pane. The first time a controller is attached, the adapter SHALL call `host.suspendAppResizeObserver(paneId)` and attach one ResizeObserver to the pane's `.term-body` that calls `schedule()`. Unmounting SHALL disconnect that observer and remove the controller.

#### Scenario: Move a terminal between groups
- **WHEN** a docked terminal is moved and its panel is initialized again
- **THEN** the same controller is reused and no second observer is created

---

### Requirement: Return resize ownership to the grid
<!-- id: app.resumeAppResizeObserver -->
<!-- entities: terms, ResizeObserver -->
<!-- enforced: app.resumeAppResizeObserver() -->

`resumeAppResizeObserver` SHALL reconnect the pane's existing ResizeObserver and never construct a new one. It SHALL be idempotent (based on `roConnected`). It SHALL log a refusal and return false if `.term-body` is missing. `fitAllTerms` SHALL skip panes that the adapter owns.

#### Scenario: Already connected
- **WHEN** it is called on a pane with `roConnected === true`
- **THEN** it returns true without calling `observe` again

---

### Requirement: Maximize routes by pane ownership
<!-- id: app.maximizeDockedPane -->
<!-- entities: DockviewPanel, paneMaximizer -->
<!-- enforced: app.maximizeDockedPane() -->

The ⛶ button SHALL use Dockview maximize when `paneIsDocked(id)` is true, and the classic `paneMaximizer.toggle` otherwise, never both. `maximizePane(paneId)` SHALL toggle `panel.api.maximize()` / `exitMaximized()`, schedule every controller, and return `{maximized}`. It SHALL return null if the pane is not owned, the panel API is missing, or the panel API throws. A null result SHALL be logged as a refusal, with no fallback to the grid maximizer. After a successful toggle, `refreshDockedMaximizeGlyphs` SHALL set 🗗/⛶ on every docked pane from `isPaneMaximized`, which returns null when it cannot answer.

#### Scenario: Maximize B while A is maximized
- **WHEN** docked pane B is maximized while A is maximized
- **THEN** A's glyph is reset to ⛶ and B's is set to 🗗

#### Scenario: Engine declines
- **WHEN** `maximizePane` returns null
- **THEN** "maximize REFUSED" is logged and the grid maximizer is not called

---

### Requirement: Exclusive layout operations
<!-- id: dockview-prototype.runExclusive -->
<!-- entities: busyOperation, LayoutControls -->
<!-- enforced: dockview-prototype.runExclusive() -->

Save, Restore, Reset and Clear SHALL run one at a time. While one is running, the four controls (`dvSaveArrangement`, `dvRestoreArrangement`, `dvResetArrangement`, `dvClearSaved`) SHALL be disabled. A second call SHALL return `layout-operation-in-progress`. The controls SHALL be re-enabled in `finally`. Nothing SHALL be retried automatically.

#### Scenario: Double click
- **WHEN** Restore is triggered while Save is running
- **THEN** `{ok:false, reason:'layout-operation-in-progress'}` is returned and the status says Save is still running

---

### Requirement: Save arrangement
<!-- id: dockview-prototype.saveArrangement -->
<!-- entities: LayoutEnvelope, hostedPanes -->
<!-- enforced: dockview-prototype.saveArrangement() -->

Save SHALL serialize the layout with `api.toJSON()`, validate it and extract pane IDs (`paneIdsFromLayout`), and require the ID set to equal the owned panes exactly (`comparePaneSets`). It SHALL require every owned pane to be mounted. Only then SHALL it call `bridge.saveLayout`. It SHALL NOT create, close or move panes.

#### Scenario: Pane set mismatch
- **WHEN** the serialized layout's pane set differs from the owned panes
- **THEN** the save is refused with the comparison reason and main is not called

#### Scenario: Pane not mounted
- **WHEN** an owned pane is not mounted in its panel host
- **THEN** `pane-not-mounted` is returned and nothing is written

#### Scenario: Success
- **WHEN** every check passes and main saves the file
- **THEN** `{ok:true, savedAt}` is returned and the status reports the pane count

---

### Requirement: Restore saved arrangement
<!-- id: dockview-prototype.restoreArrangement -->
<!-- entities: LayoutEnvelope, hostedPanes -->
<!-- depends_on: Save arrangement -->
<!-- enforced: dockview-prototype.restoreArrangement() -->

Restore SHALL load the envelope, validate it again with `validateEnvelope`, and require the saved pane set to equal the owned pane set exactly. It SHALL capture a rollback snapshot and refuse if the snapshot is invalid. Then it SHALL apply the saved layout as one transaction. It SHALL NOT create terminals or fall back to a default layout.

#### Scenario: No saved file
- **WHEN** load returns `no-saved-layout`
- **THEN** the status says there is no saved arrangement and nothing changes

#### Scenario: Saved pane not open
- **WHEN** the saved layout names a pane that is not open
- **THEN** `saved-panes-not-live` is returned with counts only and `fromJSON` is not called

#### Scenario: Open pane not in saved layout
- **WHEN** an open pane is missing from the saved layout
- **THEN** `live-panes-not-saved` is returned

---

### Requirement: Reset current arrangement
<!-- id: dockview-prototype.resetArrangement -->
<!-- entities: hostedPanes, LayoutPolicy -->
<!-- enforced: dockview-prototype.resetArrangement() -->

Reset SHALL refuse with `no-live-panes` when nothing is owned. Otherwise it SHALL capture a snapshot, build the default arrangement from the owned panes using the snapshot's grid width and height, and apply it as one transaction. It SHALL NOT read or write the saved file.

#### Scenario: Three open panes
- **WHEN** Reset runs with `pty10`, `library` and `pty2` owned
- **THEN** the workspace becomes one horizontal row ordered `pty2`, `pty10`, `library`, and no terminal is created

---

### Requirement: Clear saved arrangement
<!-- id: dockview-prototype.clearSavedArrangement -->
<!-- entities: LayoutEnvelope -->
<!-- enforced: dockview-prototype.clearSavedArrangement() -->

Clear SHALL call `bridge.resetLayout()`, which deletes only the saved file. It SHALL NOT call `fromJSON` or touch any pane. If the file was already absent, the call SHALL still succeed, with `existed:false`.

#### Scenario: Nothing to clear
- **WHEN** no saved file exists
- **THEN** `{ok:true, existed:false}` is returned and the status reports that the panes are unchanged

---

### Requirement: Validated apply with single rollback
<!-- id: dockview-prototype.applyAsTransaction -->
<!-- entities: WorkspaceSnapshot, hostedPanes -->
<!-- enforced: dockview-prototype.applyAsTransaction() -->

The target layout SHALL be validated right before `fromJSON`. If validation fails, the workspace is untouched and nothing is rolled back. After applying, `verifyApplied` SHALL check that:
- every expected pane is mounted and its group is connected with non-zero size;
- `api.panels` is an array holding exactly the expected IDs;
- each owned element is the same object as in the snapshot;
- the terminal and Library ownership counts are unchanged.

If any check fails, or the apply throws, exactly one rollback SHALL run: it re-applies the snapshot layout after validating it again, verifies it the same way, and tries to restore focus. The outcome SHALL be reported as `restored` or `incomplete`, with no repair attempt.

#### Scenario: fromJSON throws
- **WHEN** `api.fromJSON` throws
- **THEN** the reason is `layout-apply-threw`, a rollback is attempted, and the exception text is not logged

#### Scenario: Extra panel after apply
- **WHEN** the live panel list differs from the expected set
- **THEN** the reason is `unexpected-panel-after-apply` and the result includes `rollback`

#### Scenario: Element replaced
- **WHEN** an owned element after the apply is not the same object as in the snapshot
- **THEN** the reason is `pane-element-identity-changed`

---

### Requirement: Layout file load
<!-- id: dockview-layout-store.load -->
<!-- entities: LayoutEnvelope -->
<!-- enforced: dockview-layout-store.load() -->

`load()` SHALL read only `<userData>/dockview-layout.json`. It SHALL `lstat` the file first, without following links, and SHALL never throw. An invalid file SHALL be left on disk unchanged. Failures map to these reasons:

| Condition | Reason |
|---|---|
| File absent (`ENOENT`) | `no-saved-layout` |
| Any other `lstat` error | `read-failed` |
| Symlink or junction | `reparse-point-refused` |
| Not a regular file | `not-a-regular-file` |
| Larger than 262144 bytes, before or after reading | `file-too-large` |
| Invalid UTF-8 (strict decode, BOM not stripped) | `invalid-utf8` |
| Invalid JSON | `invalid-json` |

If the file passes these checks, the result SHALL be the `validateEnvelope` result.

#### Scenario: Permission denied
- **WHEN** `lstat` fails with an error other than `ENOENT`
- **THEN** `read-failed` is returned, not `no-saved-layout`

---

### Requirement: Atomic layout file save
<!-- id: dockview-layout-store.save -->
<!-- entities: LayoutEnvelope -->
<!-- enforced: dockview-layout-store.save() -->

`save(layout)` SHALL wrap the layout in an envelope (`schemaVersion:1`, `package:'dockview'`, `packageVersion:'7.0.4'`, `savedAt` in second-precision UTC ISO) and validate it before writing. It SHALL write a unique temp file and rename it over the target. It SHALL never delete the target first. On failure it SHALL remove the temp file and return `write-failed`.

#### Scenario: Invalid layout
- **WHEN** the envelope fails validation
- **THEN** the reason is returned and the existing file is unchanged

#### Scenario: Rename fails
- **WHEN** `renameSync` throws
- **THEN** the temp file is removed, `write-failed` is returned, and the previous file is intact

---

### Requirement: Layout file reset
<!-- id: dockview-layout-store.reset -->
<!-- entities: LayoutEnvelope -->
<!-- enforced: dockview-layout-store.reset() -->

`reset()` SHALL delete only the store's file with `rmSync(force:true)` and return `{ok:true, existed}`. A deletion error SHALL return `write-failed`.

#### Scenario: Absent file
- **WHEN** the file does not exist
- **THEN** `{ok:true, existed:false}` is returned

---

### Requirement: Layout IPC trust gate
<!-- id: main.whenReady -->
<!-- entities: TrustedSenderGate, LayoutStore -->
<!-- enforced: main.whenReady() -->

Each layout IPC handler (`dockview-layout-save`, `-load`, `-reset`) SHALL first check the sender with the trusted-sender gate (canonical entry URL plus the trusted window). On refusal it SHALL log `[dockview-layout] <channel> REFUSED: <reason>` to the console and `main-error`, and return `{ok:false, reason}`. Load SHALL return the whole envelope. The renderer SHALL supply no path.

#### Scenario: Untrusted sender
- **WHEN** an invoke comes from a sender that is not the trusted window or entry URL
- **THEN** the store is not called and the gate's reason is returned

---

### Requirement: Envelope and layout validation
<!-- id: dockview-layout-policy.validateEnvelope -->
<!-- entities: LayoutEnvelope, DockviewLayout -->
<!-- enforced: dockview-layout-policy.validateEnvelope() -->

**Envelope.** It SHALL have exactly five keys, `schemaVersion === 1`, `package === 'dockview'`, `packageVersion === '7.0.4'`, and a strict UTC ISO `savedAt` that survives a round-trip through `Date`.

**Layout keys.** Allowed keys are:
- top level: `grid`, `panels`, `activeGroup`;
- `grid`: `root`, `width`, `height` (finite), `orientation` (`HORIZONTAL` or `VERTICAL`);
- nodes: `type`, `data`, `size`, `visible`, with a depth of at most 20;
- leaf data: `views`, `activeView`, `id`.

Any other key SHALL be refused. This shuts out `floatingGroups`, `popoutGroups` and `edgeGroups`.

**Other refusals:**
- `visible:false`, at any node;
- `__proto__`, `prototype` or `constructor` keys, at any depth;
- more than 64 groups or panels, or arrays longer than 128;
- unsafe strings, or strings longer than their limit (64 for IDs, 200 for titles);
- pane IDs that do not match the pattern, or a pane listed in more than one group;
- an `activeView` that is not in its group's views;
- components other than `terminal` or `library`.

**Panels.** A panel SHALL have `id`, `contentComponent` and `title`, with `id` equal to its map key. Optional vendor keys (`params`, `renderer`, size hints, `tabComponent`) are allowed only when their value is `undefined`. Grid views and panel entries SHALL refer to each other exactly.

#### Scenario: Hidden split
- **WHEN** a node carries `visible:false`
- **THEN** `invalid-layout-shape` is returned

#### Scenario: Populated params
- **WHEN** a panel carries `params: {...}`
- **THEN** `invalid-layout-shape` is returned

#### Scenario: Wrong vendor version
- **WHEN** `packageVersion` is not `'7.0.4'`
- **THEN** `package-version-mismatch` is returned

---

### Requirement: Exact pane-set comparison
<!-- id: dockview-layout-policy.comparePaneSets -->
<!-- entities: PaneSet -->
<!-- enforced: dockview-layout-policy.comparePaneSets() -->

`comparePaneSets(saved, live)` SHALL return `pane-set-invalid` for non-arrays, lists longer than 64, or IDs that do not match the pattern. It SHALL return `duplicate-pane-id` for duplicates. If the sets are equal it SHALL return `{ok:true, count}`. Otherwise it SHALL return `saved-panes-not-live`, `live-panes-not-saved` or `pane-set-mismatch` (differences in both directions), with counts only and no IDs.

#### Scenario: Both directions differ
- **WHEN** saved is `[pty1, pty2]` and live is `[pty2, pty3]`
- **THEN** `pane-set-mismatch` is returned with `savedNotLive:1` and `liveNotSaved:1`

---

### Requirement: Deterministic default arrangement
<!-- id: dockview-layout-policy.buildDefaultArrangement -->
<!-- entities: DockviewLayout -->
<!-- enforced: dockview-layout-policy.buildDefaultArrangement() -->

`buildDefaultArrangement({panes, width, height})` SHALL build one horizontal branch with one leaf per pane (`size:100`, group IDs `'1'..'n'`, `activeGroup:'1'`). Terminals SHALL come first, in numeric ID order, and the Library last. The result SHALL pass `validateLayout` before it is returned. It SHALL refuse an empty pane list (`no-live-panes`), more than 64 panes, non-finite dimensions, bad or duplicate IDs, unknown components, and unsafe titles.

#### Scenario: Numeric ordering
- **WHEN** the panes are `pty10` and `pty2`
- **THEN** the order is `pty2`, `pty10`

---

### Requirement: Adapter disposal
<!-- id: dockview-prototype.dispose -->
<!-- entities: hostedPanes, FitRegistry -->
<!-- enforced: dockview-prototype.dispose() -->

`dispose()` SHALL be idempotent. It SHALL remove the window resize listener, release every owned pane (which sends a docked Library home), dispose every controller, and call `api.dispose()` inside a mount transition, so teardown never reaches the app close path.

#### Scenario: Teardown with live terminals
- **WHEN** the adapter is disposed while terminals are docked
- **THEN** no `closePane` or `ptyKill` happens because of the disposal

---

### Invariant: Layout operations never change PTY lifecycle
<!-- entities: Pty, hostedPanes -->
<!-- enforced: dockview-prototype.activate() -->

Save, Restore, Reset, Clear, rollback and every `fromJSON` SHALL NOT create, close, restart or strand a PTY or a pane. The adapter does not expose any routine that creates panes as a side effect of a layout operation.

> Last verified: 2026-11-23 (commit 0f035e81ef8874f7bdf549b3834e12c2eccaf8ad)

---

### Invariant: Dockview knows only id, kind and title
<!-- entities: PanelDescriptor, DockviewPanel -->
<!-- enforced: dockview-panel-policy.buildPanelDescriptor() -->

Dockview SHALL receive only an opaque pane ID, a kind from the allowlist, and a safe title derived from the ID. It never receives `params`, paths, prompts, roles, credentials, terminal output or IPC handles.

> Last verified: 2026-11-23 (commit 0f035e81ef8874f7bdf549b3834e12c2eccaf8ad)

---

### Invariant: Every fromJSON is validated immediately before it runs
<!-- entities: DockviewLayout -->
<!-- enforced: dockview-prototype.applyValidatedLayout() -->

`applyValidatedLayout` SHALL be the only place that calls `api.fromJSON`. It SHALL run the shared `validateLayout` right before the call, and SHALL run the call inside a mount transition. Main and the renderer SHALL validate with the same `dockview-layout-policy.js` module.

> Last verified: 2026-11-23 (commit 0f035e81ef8874f7bdf549b3834e12c2eccaf8ad)

---

### Invariant: Exactly one resize owner per terminal pane
<!-- entities: ResizeObserver, FitController, terms -->
<!-- enforced: dockview-prototype.ensureController() -->

At every stable point, each live terminal SHALL have exactly one resize owner: either the app's grid ResizeObserver (`roConnected`), or the adapter's fit controller and its single observer. `fitAllTerms` SHALL skip docked panes.

> Last verified: 2026-11-23 (commit 0f035e81ef8874f7bdf549b3834e12c2eccaf8ad)

---

### Invariant: Pane ownership survives mount transitions
<!-- entities: hostedPanes, mountedHosts -->
<!-- enforced: dockview-prototype.unmountPane() -->

An unmount SHALL remove only the transient mount state (controller, observer, `mountedHosts` entry). The `hostedPanes` entry SHALL be removed only by `releasePane`, which runs on a real close, an app close or a dispose.

> Last verified: 2026-11-23 (commit 0f035e81ef8874f7bdf549b3834e12c2eccaf8ad)

---

### Invariant: Refusals carry only closed reason codes
<!-- entities: REASON -->
<!-- enforced: dockview-layout-policy.validateLayout() -->

Layout refusals that reach logs or the UI SHALL use codes from the closed `REASON` set, or the adapter's fixed literal reasons. They SHALL never echo file contents, layout fragments, paths or exception text. Pane-set refusals SHALL report counts only.

> Last verified: 2026-11-23 (commit 0f035e81ef8874f7bdf549b3834e12c2eccaf8ad)

---

### Invariant: Fixed saved-layout path
<!-- entities: LayoutStore -->
<!-- enforced: dockview-layout-store.createLayoutStore() -->

The saved layout path SHALL be `path.join(userData, 'dockview-layout.json')`, built once in main. No caller-supplied string can reach it. The prototype file `dockview-prototype-layout.json` is never read, migrated or deleted.

> Last verified: 2026-11-23 (commit 0f035e81ef8874f7bdf549b3834e12c2eccaf8ad)

---

### Invariant: Floating and popout groups are unreachable
<!-- entities: DockviewLayout -->
<!-- enforced: dockview-prototype.activate() -->

Dockview SHALL be created with `disableFloatingGroups: true`. Saved state containing floating, popout or edge groups SHALL fail validation.

> Last verified: 2026-11-23 (commit 0f035e81ef8874f7bdf549b3834e12c2eccaf8ad)

<!-- uncertainty: The test files (dockview-fit-policy.test.js, dockview-adapter-lifecycle.test.js, dockview-layout-store.test.js, dockview-layout-policy.test.js, dockview-panel-policy.test.js, dockview-bootstrap.test.js, dockview-app-integration.test.js, dockview-default-path.test.js, pane-maximize.test.js) are plain Node scripts with unnamed assertion blocks, so no test or verified_by entries in TestClass.method form could be recorded. -->
<!-- uncertainty: The layout IPC handlers in main.js are anonymous callbacks inside app.whenReady().then(...), so main.whenReady() is the closest enforcement anchor available. -->
<!-- uncertainty: buildDockviewHost() exposes createTerminalPane and libraryAvailable, but dockview-prototype.js calls neither; they appear to be used only by harnesses and tests. -->
<!-- uncertainty: dispose() releases panes once from hostedPanes and again from registry.ids(); the second loop looks redundant but harmless because releasePane is idempotent. -->
<!-- uncertainty: The id "dockview-prototype.activate" anchors several event-handler Requirements (panel removal, active-panel change, layout change, floating groups) because the handlers are anonymous closures inside activate(); future deltas may need a finer anchor. -->
<!-- deferred: app/dockview-app-harness.js, app/dockview-bootstrap-harness.js, app/dockview-tripwire.js, app/trusted-ipc-sender.js, app/renderer/pane-maximize.js, app/renderer/pane-status-badge.js, app/test-fixtures/dockview-7.0.4-layout.json -->
