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
 *
 * Tracks string and template literals so a `//` inside '../node_modules/...' or 'https://...' is
 * not mistaken for a comment, AND consumes backslash escapes everywhere — not only inside strings.
 * That second rule is what makes a regex literal safe: in `/^https?:\/\//i` the escaped `\/` pairs
 * are consumed, so the regex-closing `/` is never seen as the first half of a `//` comment. Without
 * it this function silently deleted the rest of that line, and any assertion scanning that region
 * ran against truncated source. A lone backslash outside a string is a syntax error in JavaScript,
 * so consuming `\X` pairs unconditionally cannot damage valid code.
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  let quote = null;      // the open string delimiter, or null
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '\\') { out += c + (next || ''); i += 2; continue; }   // escape pair, in or out of a string
    if (quote) {
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
process.stdout.write('\nthe comment stripper this file relies on is itself sound\n');
// ---------------------------------------------------------------------------
{
  // The exact shape that previously broke it: a regex literal containing escaped slashes.
  const sample = "if (/^https?:\\/\\//i.test(uri)) cc.openExternal(uri);   // trailing comment\nKEEP_ME";
  const out = stripComments(sample);
  assert(out.includes('cc.openExternal(uri)'), 'code after a regex literal with escaped slashes survives');
  assert(out.includes('KEEP_ME'), 'the following line survives (no runaway comment deletion)');
  assert(!out.includes('trailing comment'), 'a genuine trailing comment is still removed');

  assert(stripComments("const a = 'http://x';  // c").includes("'http://x'"), 'a // inside a string survives');
  assert(stripComments('/* block */ CODE').trim() === 'CODE', 'block comments are removed');
  assert(!stripComments('// whole line\nCODE').includes('whole line'), 'whole-line comments are removed');

  // Load-bearing: the real app.js must not shrink by more than its comment volume, and the specific
  // line the old stripper destroyed must still be present after stripping.
  assert(stripComments(appSrc).includes('cc.openExternal(uri)'),
    'app.js:427 (the WebLinks regex line) survives stripping of the real source');
}

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
  // Stronger than "inert on the default path": the global does not EXIST there.
  const preloadCode = stripComments(preloadSrc);
  const exposeIdx = preloadCode.indexOf("exposeInMainWorld('ccDockview'");
  const gateIdx = preloadCode.indexOf('if (dockviewPrototypeEnabled) {');
  assert(gateIdx > -1 && exposeIdx > gateIdx,
    'the ccDockview bridge is exposed ONLY inside the prototype-mode guard');
  assert((preloadCode.match(/exposeInMainWorld\('ccDockview'/g) || []).length === 1,
    'there is exactly one ccDockview exposure');
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
  // The call site is a FLOATING promise, so it must carry a .catch — an unhandled rejection here
  // would be exactly the invisible failure this branch is not allowed to ship (round 4).
  assert(/maybeStartDockviewPrototype\(\)\.catch\(/.test(appSrc),
    'boot() calls the dormant seam once and attaches a .catch so no unhandled rejection survives');
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
  // NOTE: the convergence itself is proven BEHAVIOURALLY in dockview-adapter-lifecycle.test.js,
  // against the vendor's real event payload shape. A source-regex previously "proved" this while
  // the delegation was dead code (the handler read `event.panel.id`, but dockview fires the panel
  // itself), so the load-bearing assertion deliberately lives in the behavioural suite. What is
  // pinned here is only the negative space: the adapter holds no privileged authority.
  assert(/onDidRemovePanel/.test(adapterSrc), 'the adapter subscribes to panel removal');

  // dockview@7.0.4 fires these two events with DIFFERENT payload shapes, which is an easy trap:
  //   onDidRemovePanel        -> the panel ITSELF        (`_onDidRemovePanel.fire(event.panel)`)
  //   onDidActivePanelChange  -> a wrapper { panel, origin } (`.fire({ panel, origin })`)
  // So `event.panel.id` is WRONG in the first and RIGHT in the second. Assert per-handler rather
  // than over the whole file, or a correct usage gets flagged and an incorrect one gets missed.
  const adapterCodeOnly = stripComments(adapterSrc);
  const removeStart = adapterCodeOnly.indexOf('api.onDidRemovePanel(');
  const removeBlock = adapterCodeOnly.slice(removeStart, adapterCodeOnly.indexOf('});', removeStart));
  assert(removeStart > -1 && !/\.panel\.id/.test(removeBlock),
    'the removal handler does NOT read a wrapper — dockview fires the panel itself there');
  assert(/panel && panel\.id/.test(removeBlock), 'the removal handler reads the ID off the payload directly');

  const activeStart = adapterCodeOnly.indexOf('api.onDidActivePanelChange(');
  const activeBlock = adapterCodeOnly.slice(activeStart, adapterCodeOnly.indexOf('});', activeStart));
  assert(activeStart > -1 && /event && event\.panel && event\.panel\.id/.test(activeBlock),
    'the active-panel handler DOES read the wrapper — that event really is { panel, origin }');
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
process.stdout.write('\nthe browser bootstrap is fail-safe by CONSTRUCTION (round 4)\n');
// ---------------------------------------------------------------------------
// These are structural supplements. The BEHAVIOUR they describe is proven in a real Electron
// renderer by dockview-bootstrap.test.js; these pin the shape so a future edit that reintroduces
// the defect fails here too, cheaply, without waiting for the browser gate.
{
  const adapterSrc = read('renderer', 'dockview-prototype.js');
  const adapterCode = stripComments(adapterSrc);
  const fitSrc = read('renderer', 'dockview-fit-policy.js');
  const panelSrc = read('renderer', 'dockview-panel-policy.js');
  const appCode = stripComments(appSrc);

  // (a) No renderer module may put a lexical binding in the shared global scope. agent-dom.js
  // already owns a top-level `const api`; a second one anywhere is a parse-time collision that
  // takes BOTH scripts down. Checked on raw source: a top-level declaration is column-zero.
  for (const [name, src] of [['dockview-fit-policy.js', fitSrc], ['dockview-panel-policy.js', panelSrc], ['dockview-prototype.js', adapterSrc]]) {
    assert(!/^(const|let|var|class|function)\s/m.test(stripComments(src).replace(/^'use strict';\r?\n/, '')),
      `${name} declares NOTHING at top level — it is fully enclosed, so no future name can collide`);
    assert(/^\(function \(\) \{/m.test(src), `${name} is wrapped in an IIFE`);
  }

  // (b) The browser path must never reach `require`. `module` is tested first and short-circuits,
  // so the identifier is never evaluated under nodeIntegration:false.
  assert(!/\|\|\s*require\(/.test(adapterCode),
    'the adapter has no `window.X || require(...)` fallback — that shape is what evaluated require in the browser');
  assert(/typeof module === 'object'/.test(adapterCode),
    'the adapter selects its environment by testing `module`, not by falling through to require');
  const requireUses = adapterCode.match(/[^.\w]require\(/g) || [];
  assert(requireUses.length === 1, 'the adapter names `require` exactly once, inside the CommonJS branch');

  // (c) Export verification must PRECEDE root creation. Creating the full-screen overlay first is
  // what turned a script failure into an opaque blank screen over a working app.
  const bootstrapStart = adapterCode.indexOf('function bootstrap(');
  assert(bootstrapStart > -1, 'the adapter exposes bootstrap()');
  const bootstrapBody = adapterCode.slice(bootstrapStart);
  const verifyAt = bootstrapBody.indexOf('missingBrowserExports(win)');
  const createAt = bootstrapBody.indexOf('doc.createElement(');
  assert(verifyAt > -1 && createAt > -1 && verifyAt < createAt,
    'bootstrap() verifies the required exports BEFORE it creates the prototype root');
  assert(/catch \{[\s\S]{0,120}?refuse\('activation-threw'\)/.test(bootstrapBody),
    'activation is wrapped in an error boundary that refuses with a bounded code');
  assert(/instance\.ok !== true/.test(bootstrapBody),
    'an activation that returns a falsy/ok:false result is treated as a failure');
  assert(/removeChild\(createdRoot\)/.test(bootstrapBody.replace(/\s+/g, ' ')) || /createdRoot\.parentNode\.removeChild\(createdRoot\)/.test(bootstrapBody),
    'a refusal removes the root this bootstrap created');

  // (d) No refusal may echo an exception, path, or state.
  assert(!/e\.message|err\.message|String\(e\)/.test(bootstrapBody),
    'bootstrap() never echoes an exception message');
  assert(!/e\.message|err\.message/.test(appCode.slice(appCode.indexOf('async function maybeStartDockviewPrototype'))),
    'the app.js bootstrap never echoes an exception message either');

  // (e) app.js must verify the exports itself rather than trusting script onload.
  assert(/typeof proto\.bootstrap !== 'function'/.test(appCode),
    'app.js verifies the adapter actually published bootstrap()');
  assert(/missingBrowserExports\(window\)/.test(appCode),
    'app.js verifies every required browser export before starting');
  const appBootStart = appCode.indexOf('async function maybeStartDockviewPrototype');
  const appBootBody = appCode.slice(appBootStart, appCode.indexOf('function buildDockviewHost'));
  assert(!/createElement\('div'\)|dockviewPrototypeRoot/.test(appBootBody),
    'app.js no longer creates the full-screen root itself — bootstrap() owns that lifecycle');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nDEFAULT mode loads none of the four Dockview scripts (§ 11.12)\n');
// ---------------------------------------------------------------------------
{
  // Every one of the four scripts is reachable ONLY through the gated list, and index.html — the
  // default document — references none of them and no prototype global.
  const FOUR = ['dockview/dist/dockview.js', 'dockview-fit-policy.js', 'dockview-panel-policy.js', 'dockview-prototype.js'];
  for (const script of FOUR) {
    assert(!indexSrc.includes(script), `index.html never references ${script}`);
    assert(appSrc.includes(script), `${script} is reachable only via the gated DOCKVIEW_PROTOTYPE_SCRIPTS list`);
  }
  for (const global of ['ccDockviewPrototype', 'ccDockviewFitPolicy', 'ccDockviewPanelPolicy', 'ccDockviewPrototypeInstance']) {
    assert(!indexSrc.includes(global), `index.html exposes no ${global}`);
  }
  // The list itself is exactly those four, in dependency order, vendor bundle first.
  const listMatch = /const DOCKVIEW_PROTOTYPE_SCRIPTS = \[([\s\S]*?)\];/.exec(appSrc);
  assert(!!listMatch, 'the gated script list is present');
  const listed = (listMatch ? listMatch[1] : '').match(/'([^']+)'/g) || [];
  assert(listed.length === 4, 'exactly four scripts are gated behind the flag');
  assert(/dockview\/dist\/dockview\.js/.test(listed[0]), 'the vendor bundle loads first');
  assert(/dockview-prototype\.js/.test(listed[3]), 'the adapter loads last, after both policy modules');

  // The new harness must not become a way to load Dockview on the default path.
  assert(!indexSrc.includes('dockview-bootstrap-harness'),
    'the bootstrap harness is not referenced by the default document');
  assert(!mainSrc.includes('dockview-bootstrap-harness'),
    'the bootstrap harness is not reachable from main.js — it is a standalone test entry point');
}

// ---------------------------------------------------------------------------
process.stdout.write(`\ndockview-default-path: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
