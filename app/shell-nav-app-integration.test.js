'use strict';
// Run: node app/shell-nav-app-integration.test.js
//
// S66's end-to-end gate (docs/DESIGN-BRIEF-1.1.md section 9, "S66"), measured in a REAL Electron
// renderer running the real index.html, preload.js, app.js and shell-nav.js
// (shell-nav-app-harness.js; only main is stubbed). It checks: the three tabs switch by click and
// by keyboard; each tab sets its colour set on the app root; Ctrl K opens the palette and Esc closes
// it; the Settings page opens; "Use the old layout" applies at once and comes back after a restart;
// a shell that can't start refuses visibly and leaves the old layout usable; and no PTY starts and
// nothing is fetched from the network along the way.
//
// Not covered yet (later steps of S66): the emblem upload and focus-ring rendering.

const { spawnSync } = require('child_process');
const path = require('path');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
const eq = (a, b, label) => assert(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)})`);

let electronPath = null;
try { electronPath = require('electron'); } catch { electronPath = null; }
assert(typeof electronPath === 'string' && electronPath.length > 0, 'the existing Electron dependency provides the executable');

const childEnv = Object.assign({}, process.env);
delete childEnv.ELECTRON_RUN_AS_NODE;
const args = [path.join(__dirname, 'shell-nav-app-harness.js')];
// Linux containers run Electron as root without a sandbox; Windows CI needs neither switch.
if (process.platform === 'linux') args.unshift('--no-sandbox');
const run = spawnSync(electronPath, args, { cwd: __dirname, env: childEnv, encoding: 'utf8', timeout: 300000 });

let report = null;
const line = String(run.stdout || '').split('\n').find((l) => l.startsWith('{"ok"'));
try { report = JSON.parse(line); } catch { report = null; }
assert(report !== null, 'the harness produced a JSON report');
if (!report) {
  process.stderr.write(`harness exit ${run.status} signal ${run.signal}\nstderr tail:\n${String(run.stderr || '').split('\n').slice(-25).join('\n')}\n`);
  process.stdout.write(`\nshell-nav-app-integration: ${passed} passed, ${failed} failed\n`);
  process.exit(1);
}
assert(report.ok === true, `every scenario ran (fatal: ${JSON.stringify(report.fatal)})`);
const S = report.scenarios || {};

process.stdout.write('\nfirst run: the three-tab layout, opening on the control room\n');
const f = S.firstRun || {};
eq(f.initial && f.initial.layout, 'tabs', 'the three-tab layout is the default');
eq(f.initialSelected, 'control', 'first run selects the control room');
eq(f.initial && f.initial.surface, '#0a0a0b', 'the control room\'s surface colour is on the app root');
assert(f.headerShown === true && f.controlShown === true && f.topbarShown === true, 'tab bar, today\'s layout and its top bar are visible on the control room');
assert(f.brainShown === false, 'the brain frame is hidden while on the control room');
eq(f.tabCount, 3, 'three tabs');
eq(f.tabIndexes, ['-1', '0', '-1'], 'only the selected tab is in the Tab order (roving tabindex)');
assert(/^No repo selected · Control room · /.test(f.stripeNoRepo || ''), 'with no repo, the scope stripe says so');

process.stdout.write('\ntabs switch by click and keyboard, and each sets its colours\n');
eq(f.afterClickSelected, 'brain', 'clicking Brain selects it');
eq(f.afterClick && f.afterClick.surface, '#0a1530', 'the brain tab\'s surface colour is applied');
assert(f.afterClickBrainShown === true && f.afterClickControlShown === false && f.afterClickTopbarShown === false, 'the brain frame shows; today\'s layout and its top bar hide');
assert(f.rightPrevented === true, 'Right arrow is handled by the tablist');
eq(f.afterRight, 'control', 'Right moves to the control room');
eq(f.focusAfterRight, 'makoTab-control', 'focus follows the selected tab');
eq(f.afterEnd, 'aquarium', 'End selects the last tab');
eq(f.afterEndRoot && f.afterEndRoot.surface, '#05191a', 'the aquarium\'s surface colour is applied');
assert(f.aquariumShown === true, 'the aquarium frame shows');
eq(f.afterHome, 'brain', 'Home selects the first tab');
eq(f.afterLeftWrap, 'aquarium', 'Left from the first tab wraps to the last');
assert((f.saves || []).some((s) => s.uiTab === 'aquarium'), 'the selected tab is saved with the settings');
assert(f.permissionBorder === true, 'the shared In-focus card renders a permission prompt as a red card');
assert(f.permissionAllowDisabled === true, 'an unwired card action is disabled in the real page');
eq(f.ptyStart, 0, 'no PTY started');

process.stdout.write('\nCtrl K palette\n');
const p = S.palette || {};
eq(p.rememberedTab, 'brain', 'a remembered tab is restored after a restart');
assert(p.ctrlKPrevented === true && p.paletteShown === true, 'Ctrl K opens the palette and is consumed');
eq(p.focusInInput, 'makoPaletteInput', 'focus moves into the palette');
eq(p.inputRole, 'combobox', 'the palette input is a combobox');
eq(p.dialogModal, 'true', 'the palette is a modal dialog');
assert((p.allOptions || []).length >= 9, 'the palette lists the tabs, Settings, the layout switch and today\'s views');
eq(p.activeDescendant, 'makoPaletteOpt-0', 'the first option is active');
assert(p.escPrevented === true && p.paletteShownAfterEsc === false, 'Esc closes the palette and is consumed');
eq(p.focusAfterEsc, 'makoTab-brain', 'focus goes back where it was');
assert(p.ctrlShiftKPrevented === false && p.paletteAfterCtrlShiftK === false, 'Ctrl Shift K is left to the terminal');
eq(p.filtered, ['Go to Aquarium'], 'typing filters the list');
assert(p.afterEnterTab === 'aquarium' && p.afterEnterPalette === false, 'Enter runs the command and closes the palette');
assert(p.noMatchShown === true, 'no match shows a visible line');
eq(p.activeAfterDown, 'makoPaletteOpt-1', 'Down moves the active option');
eq(p.activeAfterUpWrap, 'makoPaletteOpt-2', 'Up wraps from the first option to the last');
assert(p.tabTrapped === true, 'Tab stays inside the palette dialog');
assert(p.tabsWired === true && p.afterLogsTab === 'control' && p.logsPaneActive === true, '"Open Logs" goes to the control room and opens its Logs view');
assert(/^AgentCommandCenter · Control room · /.test(p.stripeRepo || ''), 'the scope stripe names the repo in use and the tab');
eq(p.repoOption, ['Repo: <img src=x onerror=window.__pwned=1>'], 'repos are palette commands, their names shown as text');
assert(p.repoOptionNoMarkup === true, 'a repo name is never parsed as markup in the palette');
assert(/^<img src=x onerror=window.__pwned=1> · Control room · /.test(p.stripeAfterRepo || '') && p.stripeNoMarkup === true, 'a palette repo command switches the repo and the stripe, as text');
eq(p.ptyStart, 0, 'no PTY started');

process.stdout.write('\nSettings page and the old layout\n');
const s = S.settings || {};
assert(s.view === 'settings' && s.settingsShown === true && s.controlShownInSettings === false, 'the Settings page opens in place of the tab');
eq(s.focusInSettings, 'makoSettingsTitle', 'focus moves to the Settings title');
eq(s.sections, ['Layout', 'Shortcuts', 'Shark', 'Quiet hours', 'Repos and emblems', 'Voice', 'Keys'], 'the Settings page has its sections');
eq(s.shortcutRows, 5, 'the Shortcuts section shows the one shortcut list');
assert(s.escPrevented === true && s.viewAfterEsc === 'tab', 'Esc closes the Settings page');
eq(s.focusAfterEsc, 'makoTab-control', 'focus goes back to the selected tab');
eq(s.layoutAfterSwitch, 'old', '"Use the old layout" switches at once');
assert(/stays after a restart/.test(s.statusText || ''), 'the switch says it is saved');
assert(s.headerShownOld === false && s.controlShownOld === true && s.topbarShownOld === true, 'the old layout shows today\'s app with no tab bar');
eq(s.tabAttrOld, null, 'the old layout keeps its own themes (no tab colour set)');
assert((s.saves || []).some((x) => x.uiLayout === 'old'), 'the layout choice is saved with the settings');

process.stdout.write('\nafter a restart with the old layout saved\n');
const r = S.restartOld || {};
eq(r.root && r.root.layout, 'old', 'the old layout comes back');
assert(r.headerShown === false && r.controlShown === true && r.brainShown === false && r.terminalsTabShown === true, 'today\'s app, unchanged, with no tab bar');
assert(r.paletteShown === true && r.offersTabs === true, 'Ctrl K still works and offers the three-tab layout');
assert(r.settingsFromTopbar === true && r.boxChecked === true, 'the top bar\'s Settings button opens the page, with the switch on');

process.stdout.write('\ntop bar: usage chip, quiet hours and Pause all\n');
const b = S.topBar || {};
assert(b.pausedRestored === true && /^Paused since .+\.Resume all$/.test(b.pausedText || ''), 'a saved Pause all comes back after a restart, with Resume all');
assert(b.quietBadStoredOff === true && b.quietBadLogged === true, 'an unreadable saved quiet state is off and reported');
eq(b.usageOnTab, { brain: true, control: true, aquarium: true }, 'the usage chip shows in the shell\'s top bar on every tab');
eq(b.pausedOnTab, { brain: true, control: true, aquarium: true }, 'the paused banner shows on every tab');
assert(b.quietDisabled === true && b.pauseDisabled === true, 'the quiet-hours and Pause all switches stay disabled until S18 and S19 give them their effect');
eq(b.quietOnTab, { brain: true, control: true, aquarium: true }, 'the quiet-hours banner shows on every tab');
assert(/^Quiet hours since .+\. Agents keep working\.End now$/.test(b.quietText || ''), 'the quiet banner has End now');
eq(b.rootQuiet, 'on', 'the one quiet state is on the app root for every alert and voice path to read');
assert(b.enableUnknown === false && b.enableQuiet === true, 'only known switches can be enabled');
assert(b.quietAfterToggle === null && b.quietPressed === 'true', 'an enabled switch toggles by click (on to off, then on again)');
assert(b.pausedInOld === true && b.quietInOld === true, 'both banners show in the old layout too');
assert(b.usageInOldTopbar === true && b.usageBeforeTheme === 'theme-picker', 'the usage chip goes back to its old place in the old top bar');
assert(b.quietAfterEnd === false && b.pausedAfterResume === false, 'End now and Resume all clear the banners');
assert((b.saves || []).some((x) => x.uiQuietSince === null) && (b.saves || []).some((x) => x.uiPausedSince === null), 'both states are saved with the settings');

process.stdout.write('\na shell that can\'t start refuses visibly\n');
const x = S.refusal || {};
assert(x.logged === true, 'the Logs tab says the shell was refused');
assert(x.headerShown === false && x.controlShown === true, 'the old layout stays the whole app');
eq(x.layoutAttr, null, 'no half-applied layout on the root');

process.stdout.write('\nnothing reached the network, and no renderer errors\n');
eq(report.remote, [], 'no remote request');
eq(report.consoleErrors, [], 'no console errors');

process.stdout.write(`\nshell-nav-app-integration: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
