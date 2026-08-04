'use strict';
// Run: node app/dockview-default-path.test.js
//
// The single most important guarantee on this branch, and predeclared kill criterion § 5.10:
//
//   "Default `npm start` imports or initializes Dockview, creates a layout file, or changes the
//    current grid's behavior."  -> NO-GO
//
// These are SOURCE-STRUCTURE assertions, deliberately. A behavioural test would have to launch
// Electron; these instead pin the exact code shape that makes the guarantee true, so a future edit
// that quietly loosens the gate fails here. Same posture as launcher-fence-invariant.test.js.

const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const APP_DIR = __dirname;
const read = (...p) => fs.readFileSync(path.join(APP_DIR, ...p), 'utf8');

/**
 * Strip comments so "does the CODE do X" assertions cannot be satisfied — or falsified — by prose.
 * Walks the source tracking string and template literals so a `//` inside '../node_modules/...' or
 * 'https://...' is not mistaken for a comment. Regex literals are not tracked; none of the sources
 * checked here contains a regex holding an unbalanced quote or a comment marker.
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  let quote = null;      // the open string delimiter, or null
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      if (c === '\\') { out += c + (next || ''); i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i++; continue; }
    if (c === '/' && next === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && next === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    out += c; i++;
  }
  return out;
}
const mainSrc = read('main.js');
const preloadSrc = read('preload.js');
const appSrc = read('renderer', 'app.js');
const indexSrc = read('renderer', 'index.html');
const pkg = JSON.parse(read('package.json'));

// ---------------------------------------------------------------------------
process.stdout.write('\nindex.html is untouched by the prototype\n');
// ---------------------------------------------------------------------------
{
  assert(!/dockview/i.test(indexSrc),
    'renderer/index.html contains NO reference to dockview (no script tag, no stylesheet, no markup)');
  const scriptTags = (indexSrc.match(/<script[^>]*src=/g) || []).length;
  assert(scriptTags === 21, `index.html still loads exactly its original 21 <script src> tags (found ${scriptTags})`);
  assert(!/dockview/i.test(read('renderer', 'styles.css').split('/* ---- Dockview prototype')[0]),
    'no dockview styling leaks into the pre-existing part of styles.css');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe launch flag is a MAIN-process decision the renderer cannot forge\n');
// ---------------------------------------------------------------------------
{
  assert(/const DOCKVIEW_PROTOTYPE_FLAG = '--dockview-prototype';/.test(mainSrc),
    'main.js declares the exact launch flag --dockview-prototype');
  assert(/const dockviewPrototypeEnabled = process\.argv\.includes\(DOCKVIEW_PROTOTYPE_FLAG\);/.test(mainSrc),
    'enablement is read from MAIN process.argv, once, at startup');
  assert(!/ipcMain\.handle\(\s*['"]dockview-prototype-enabled/.test(mainSrc),
    'there is no IPC channel by which the renderer could ASK to be enabled');
  assert(!/get-settings[\s\S]{0,200}dockview/i.test(mainSrc),
    'the flag is not read from settings (which the renderer can write)');
  assert(!/process\.env\.[A-Z_]*DOCKVIEW/.test(mainSrc),
    'the flag is not read from an environment variable');

  // The renderer-side token is a DIFFERENT string, forwarded by main at window construction.
  assert(/additionalArguments: dockviewPrototypeEnabled \? \[DOCKVIEW_PROTOTYPE_RENDERER_ARG\] : \[\]/.test(mainSrc),
    'main forwards the decision via additionalArguments, empty when disabled');
  assert(/DOCKVIEW_PROTOTYPE_RENDERER_ARG = '--cc-dockview-prototype'/.test(mainSrc),
    'the renderer-side token is a distinct string from the launch flag');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nprototype IPC exists ONLY when the flag is set\n');
// ---------------------------------------------------------------------------
{
  for (const channel of ['dockview-layout-save', 'dockview-layout-load', 'dockview-layout-reset']) {
    const occurrences = (mainSrc.match(new RegExp(`ipcMain\\.handle\\('${channel}'`, 'g')) || []).length;
    assert(occurrences === 1, `${channel} is registered exactly once`);
  }
  // All three registrations must sit inside the `if (dockviewPrototypeEnabled) {` block.
  const guardIndex = mainSrc.indexOf('if (dockviewPrototypeEnabled) {');
  assert(guardIndex > -1, 'the prototype IPC block is guarded by `if (dockviewPrototypeEnabled)`');
  const guardEnd = mainSrc.indexOf('\n  }', guardIndex);
  const guardedBlock = mainSrc.slice(guardIndex, guardEnd);
  for (const channel of ['dockview-layout-save', 'dockview-layout-load', 'dockview-layout-reset']) {
    assert(guardedBlock.includes(`ipcMain.handle('${channel}'`),
      `${channel} is registered INSIDE the flag guard (absent entirely in default npm start)`);
  }
  // Each handler must pass the same trusted-sender gate the other privileged surfaces use.
  const gateCalls = (guardedBlock.match(/dockviewGate\.assess\(e\)/g) || []).length;
  assert(gateCalls === 3, 'all three handlers call the trusted-sender gate before doing anything');
  assert(/createLayoutStore\(\{ userDataDir: app\.getPath\('userData'\) \}\)/.test(guardedBlock),
    'the store path comes from Electron userData — the renderer supplies no path');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe preload exposes a frozen boolean and bounded operations only\n');
// ---------------------------------------------------------------------------
{
  assert(/contextBridge\.exposeInMainWorld\('ccDockview', Object\.freeze\(\{/.test(preloadSrc),
    'the ccDockview bridge is frozen at creation');
  assert(/const dockviewPrototypeEnabled = process\.argv\.includes\('--cc-dockview-prototype'\);/.test(preloadSrc),
    'the preload reads the forwarded token from its own process argv');
  assert(/enabled: dockviewPrototypeEnabled,/.test(preloadSrc), 'the bridge exposes the boolean');

  // Exactly four members, and no way to set the flag.
  const body = preloadSrc.slice(preloadSrc.indexOf("exposeInMainWorld('ccDockview'"));
  for (const member of ['enabled', 'saveLayout', 'loadLayout', 'resetLayout']) {
    assert(body.includes(`${member}:`), `the bridge exposes ${member}`);
  }
  assert(!/setEnabled|enable\s*:/.test(body), 'the bridge exposes no way to turn the prototype ON');
  assert(!/layoutPath|filePath|path\s*:/.test(body), 'the bridge accepts no path from the renderer');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe renderer seam is dormant and strictly gated\n');
// ---------------------------------------------------------------------------
{
  assert(/if \(!window\.ccDockview \|\| window\.ccDockview\.enabled !== true\) return;/.test(appSrc),
    'the bootstrap returns immediately unless enabled is the boolean true (strict !== true)');

  // Every Dockview API touch in app.js must live below that guard. Checked against CODE, with
  // comments stripped, so a mention in a comment neither passes nor fails this.
  const appCode = stripComments(appSrc);
  const guardPos = appCode.indexOf('if (!window.ccDockview || window.ccDockview.enabled !== true) return;');
  assert(guardPos > -1, 'the guard is present in code (not only in a comment)');
  const beforeGuard = appCode.slice(0, guardPos);
  assert(!/window\.dockview|createDockview|toJSON\(\)|fromJSON/.test(beforeGuard),
    'no Dockview API is touched before the guard');

  assert(/const DOCKVIEW_PROTOTYPE_SCRIPTS = \[/.test(appSrc),
    'the prototype scripts are a dynamic list, not <script> tags in index.html');
  assert(/'\.\.\/node_modules\/dockview\/dist\/dockview\.js'/.test(appSrc),
    'the vendor bundle is loaded from node_modules (nothing new is committed to the repo)');
  assert(/maybeStartDockviewPrototype\(\);/.test(appSrc), 'boot() calls the dormant seam exactly once');
  assert((appSrc.match(/maybeStartDockviewPrototype\(\)/g) || []).length === 2,
    'the seam is declared once and called once');

  // No Dockview import may sit at module top level, where it would run regardless of the flag.
  assert(!/^\s*(import|require)\(['"]dockview/m.test(appSrc), 'app.js has no top-level dockview import');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nno layout file can be created on the default path\n');
// ---------------------------------------------------------------------------
{
  // The store is only ever constructed inside the flag guard, so `npm start` never touches the file.
  const storeConstructions = (mainSrc.match(/createLayoutStore\(/g) || []).length;
  assert(storeConstructions === 1, 'createLayoutStore is called exactly once in main.js');
  const idx = mainSrc.indexOf('createLayoutStore({');
  const guardIdx = mainSrc.indexOf('if (dockviewPrototypeEnabled) {');
  assert(guardIdx > -1 && idx > guardIdx, 'the store is constructed only inside the flag guard');

  // Restore is never automatic — the adapter exposes it as an explicit control.
  const adapterSrc = read('renderer', 'dockview-prototype.js');
  assert(/\['Restore Layout', \(\) => restoreLayout\(\)\]/.test(adapterSrc),
    'restore is an explicit user control');
  assert(!/activate[\s\S]{0,4000}?await restoreLayout\(\)/.test(adapterSrc),
    'activate() does not auto-restore a workspace');
  assert(!/activate[\s\S]{0,4000}?await useDefaultLayout\(\)/.test(adapterSrc),
    'activate() does not auto-create the default layout (no PTY is spawned on launch)');
  assert(/disableFloatingGroups: true/.test(adapterSrc),
    'floating groups are disabled (popouts excluded, floating out of scope)');
  assert(!/addPopoutGroup|popoutUrl/.test(adapterSrc), 'the adapter never creates a popout group');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe opt-in launch scripts are exact\n');
// ---------------------------------------------------------------------------
{
  assert(pkg.scripts.start === 'electron .', 'npm start is unchanged — no flag, no prototype');
  assert(pkg.scripts['prototype:dockview'] === 'electron . --dockview-prototype',
    'npm run prototype:dockview is the exact opt-in launch');
  assert(pkg.scripts['prototype:dockview:tripwire'] === 'electron dockview-tripwire.js',
    'the Dockview-only network tripwire has its own script');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe pane close path is single and idempotent\n');
// ---------------------------------------------------------------------------
{
  assert(/const closeThisPane = \(\) => \{\s*\n\s*if \(!terms\.has\(id\)\) return;/.test(appSrc),
    'the close path guards on terms.has(id) — a second call is a no-op');
  assert(/paneData\.closePane = closeThisPane;/.test(appSrc), 'the close path is published on the pane record');
  assert(/pane\.querySelector\('\.x'\)\.onclick = closeThisPane;/.test(appSrc),
    'the close BUTTON uses that same single path');
  assert((appSrc.match(/cc\.ptyKill\(id\)/g) || []).length === 1,
    'ptyKill appears exactly once in app.js — there is no second kill path');

  const adapterSrc = read('renderer', 'dockview-prototype.js');
  assert(/api\.onDidRemovePanel\(\(event\) => \{[\s\S]*?host\.closePane\(paneId\);/.test(adapterSrc),
    'a Dockview panel removal delegates to that same app-owned close path');
  // Checked against CODE with comments stripped: the adapter's prose legitimately discusses ptyKill.
  const adapterCode = stripComments(adapterSrc);
  assert(!/ptyKill|ptyStart|ptyWrite|ptyResize/.test(adapterCode),
    'the adapter never touches PTY IPC directly — PTY authority stays with the app');
  assert(!/clipboardRead|clipboardWrite|libraryList|libraryRead|libraryFollowup|getGeminiKeyStatus|setGeminiKey/.test(adapterCode),
    'the adapter never touches clipboard, Library, follow-up, or credential IPC');
  assert(!/\bcc\./.test(adapterCode),
    'the adapter never reaches the privileged cc.* preload bridge at all');
}

// ---------------------------------------------------------------------------
process.stdout.write(`\ndockview-default-path: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
