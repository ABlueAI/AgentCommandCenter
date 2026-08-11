'use strict';
// Run: node app/dockview-default-path.test.js
//
// THE DEFAULT PATH IS NOW DOCKVIEW. That inversion is the whole point of this branch, and it moves
// what this file has to prove.
//
// On the prototype branch the guarantee was "default `npm start` imports or initializes Dockview"
// -> NO-GO, and this suite pinned the code shape that kept Dockview unreachable. Under Blue's ADOPT
// verdict (`docs/OSS-PROCUREMENT-dockview.md`) Dockview IS the production pane-layout engine, so
// the guarantee is inverted: `npm start` MUST select Dockview, and the hand-built grid survives
// only as a bounded emergency recovery surface behind `--classic-layout`.
//
// These are SOURCE-STRUCTURE assertions, deliberately, and they are a SUPPLEMENT — not the proof.
// The behaviour is proven in real Electron renderers:
//   * `dockview-app-integration.test.js` — the whole application: which engine starts, what the
//     user sees, PTY and Library lifecycle, resize ownership, maximize routing;
//   * `dockview-bootstrap.test.js` — the adapter's bootstrap and every refusal path.
// What lives HERE is the code shape that makes those properties cheap to keep true, so an edit that
// quietly loosens one fails fast and locally instead of only in a browser gate. Same posture as
// launcher-fence-invariant.test.js.

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
const appCode = stripComments(appSrc);
const indexSrc = read('renderer', 'index.html');
const cssSrc = read('renderer', 'styles.css');
const adapterSrc = read('renderer', 'dockview-prototype.js');
const adapterCode = stripComments(adapterSrc);
const pkg = JSON.parse(read('package.json'));

// ---------------------------------------------------------------------------
process.stdout.write('\nthis proof file is itself reviewable as text\n');
// ---------------------------------------------------------------------------
{
  // A single NUL byte anywhere in a file makes Git classify it as binary, so `git diff` emits only
  // "Binary files ... differ" and every assertion below becomes INVISIBLE in a review artifact.
  // That is not hypothetical: one literal NUL sentinel on the old line 112 hid this entire file —
  // the whole default-path / kill-criterion proof — from the pinned R5 diff. The check reads the
  // RAW BYTES of this file rather than a decoded string, because decoding is exactly what masks
  // the problem: `readFileSync(f, 'utf8')` yields a perfectly ordinary-looking string.
  //
  // This is a FAIL-FAST GUARD, not a counted assertion, for two reasons. It keeps the suite total
  // pinned at its own value, so the count stays usable as a regression control. And a
  // reviewability violation should ABORT rather than log one ✗ among many: if this file is binary,
  // every result it prints is unreadable in the artifact anyway.
  //
  // The probe buffer is built from NUMERIC byte values, so proving the detection works needs no
  // escape sequence and cannot reintroduce the very byte being checked for.
  if (Buffer.from([0x61, 0x00, 0x62]).indexOf(0) !== 1) {
    process.stderr.write('  ✗ FATAL: the NUL detection is broken — it cannot see a NUL that is present\n');
    process.exit(1);
  }
  const ownBytes = fs.readFileSync(__filename);
  const nulAt = ownBytes.indexOf(0);
  if (nulAt !== -1) {
    process.stderr.write(`  ✗ FATAL: NUL byte at offset ${nulAt} — Git will classify this file as binary\n`);
    process.stderr.write('           and hide this entire proof from the review artifact.\n');
    process.exit(1);
  }
  process.stdout.write(`  ✓ GUARD: zero NUL bytes in ${ownBytes.length} bytes — Git treats this file as text\n`);
}

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
  assert(appCode.includes('cc.openExternal(uri)'),
    'the WebLinks regex line survives stripping of the real app.js source');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe layout decision is MAIN\'s, and the DEFAULT is Dockview\n');
// ---------------------------------------------------------------------------
{
  assert(/const CLASSIC_LAYOUT_FLAG = '--classic-layout';/.test(mainSrc),
    'main.js declares the exact OPT-OUT flag --classic-layout');
  assert(/const classicLayoutEnabled = process\.argv\.includes\(CLASSIC_LAYOUT_FLAG\);/.test(mainSrc),
    'the opt-out is read from MAIN process.argv, once, at startup');
  assert(/const dockviewLayoutEnabled = !classicLayoutEnabled;/.test(mainSrc),
    'Dockview is enabled by DEFAULT — it is the negation of the opt-out, not its own flag');

  // NEGATIVE CONTROLS for the flag polarity. The prototype's opt-IN vocabulary must be gone from
  // main and the preload entirely; if any of it survived, a reader could not tell which polarity
  // is live, and a partial revert would pass unnoticed.
  for (const [file, src] of [['main.js', mainSrc], ['preload.js', preloadSrc]]) {
    assert(!/--dockview-prototype\b/.test(src),
      `NEGATIVE CONTROL: ${file} no longer knows the opt-IN launch flag --dockview-prototype`);
    assert(!/--cc-dockview-prototype\b/.test(src),
      `NEGATIVE CONTROL: ${file} no longer knows the opt-IN renderer token`);
    assert(!/dockviewPrototypeEnabled/.test(src),
      `NEGATIVE CONTROL: ${file} carries no dockviewPrototypeEnabled binding`);
  }

  assert(!/ipcMain\.handle\(\s*['"]dockview-[a-z-]*enabled/.test(mainSrc),
    'there is no IPC channel by which the renderer could ASK to change the engine');
  assert(!/get-settings[\s\S]{0,200}dockview/i.test(mainSrc),
    'the decision is not read from settings (which the renderer can write)');
  assert(!/process\.env\.[A-Z_]*(DOCKVIEW|CLASSIC)/.test(mainSrc),
    'and not from an environment variable');

  // The renderer-side token is a DIFFERENT string, forwarded by main at window construction, and
  // present ONLY in recovery mode.
  assert(/const CLASSIC_LAYOUT_RENDERER_ARG = '--cc-classic-layout';/.test(mainSrc),
    'the renderer-side token is a distinct string from the launch flag');
  // RE-PINNED (Experiment A revision 2), and not silently. `additionalArguments` was a single
  // ternary; it is now a spread list because the pane-status PROTOTYPE forwards its OWN gate token
  // the same way, so the preload can make its bridge ABSENT rather than inert when the gate is off.
  //
  // Old pin, retained so the reviewed base stays reproducible:
  //   additionalArguments: classicLayoutEnabled ? [CLASSIC_LAYOUT_RENDERER_ARG] : []
  //
  // The replacement is stronger than a shape match: it asserts that EVERY entry is conditional, so
  // "the production path forwards an empty list" survives any future addition instead of having to
  // be re-argued each time.
  assert(/additionalArguments:\s*\[/.test(mainSrc),
    'main still forwards renderer-side decisions via additionalArguments');
  assert(/\.\.\.\(classicLayoutEnabled \? \[CLASSIC_LAYOUT_RENDERER_ARG\] : \[\]\)/.test(mainSrc),
    'the classic-layout token is present ONLY in recovery mode');
  assert(/\.\.\.\(paneStatusPrototypeEnabled \? \[PANE_STATUS_RENDERER_ARG\] : \[\]\)/.test(mainSrc),
    'the pane-status prototype token is present ONLY when its gate is on');
  const addArgsBlock = mainSrc.slice(mainSrc.indexOf('additionalArguments: ['));
  const addArgsEntries = addArgsBlock.slice(0, addArgsBlock.indexOf('],'))
    .split('\n').map((l) => l.trim()).filter((l) => l.indexOf('...') === 0);
  assert(addArgsEntries.length >= 2, 'both forwarded tokens are accounted for');
  assert(addArgsEntries.every((l) => l.indexOf('?') !== -1 && l.indexOf(': [])') !== -1),
    'EVERY additionalArguments entry is conditional, so the DEFAULT production path forwards an EMPTY list');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nlayout IPC exists on the production path and NOWHERE in recovery mode\n');
// ---------------------------------------------------------------------------
{
  for (const channel of ['dockview-layout-save', 'dockview-layout-load', 'dockview-layout-reset']) {
    const occurrences = (mainSrc.match(new RegExp(`ipcMain\\.handle\\('${channel}'`, 'g')) || []).length;
    assert(occurrences === 1, `${channel} is registered exactly once`);
  }
  const guardIndex = mainSrc.indexOf('if (dockviewLayoutEnabled) {');
  assert(guardIndex > -1, 'the layout IPC block is guarded by `if (dockviewLayoutEnabled)`');
  const guardEnd = mainSrc.indexOf('\n  } else {', guardIndex);
  assert(guardEnd > guardIndex, 'the guard has an explicit recovery-mode else branch');
  const guardedBlock = mainSrc.slice(guardIndex, guardEnd);
  for (const channel of ['dockview-layout-save', 'dockview-layout-load', 'dockview-layout-reset']) {
    assert(guardedBlock.includes(`ipcMain.handle('${channel}'`),
      `${channel} is registered INSIDE the guard (absent entirely under --classic-layout)`);
  }
  const gateCalls = (guardedBlock.match(/dockviewGate\.assess\(e\)/g) || []).length;
  assert(gateCalls === 3, 'all three handlers call the trusted-sender gate before doing anything');
  assert(/createLayoutStore\(\{ userDataDir: app\.getPath\('userData'\) \}\)/.test(guardedBlock),
    'the store path comes from Electron userData — the renderer supplies no path');

  // The store is only ever constructed inside the guard, so recovery mode never touches the file.
  const storeConstructions = (mainSrc.match(/createLayoutStore\(/g) || []).length;
  assert(storeConstructions === 1, 'createLayoutStore is called exactly once in main.js');
  assert(mainSrc.indexOf('createLayoutStore({') > guardIndex, 'and only inside the guard');
  assert(/CLASSIC RECOVERY MODE — Dockview disabled, layout IPC NOT registered/.test(mainSrc),
    'recovery mode announces itself in main\'s log — never a silent fallback');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe preload exposes TWO shapes, not one shape with an inert flag\n');
// ---------------------------------------------------------------------------
{
  assert(/contextBridge\.exposeInMainWorld\('ccDockview', Object\.freeze\(/.test(preloadSrc),
    'the ccDockview bridge is frozen at creation');
  const preloadCode = stripComments(preloadSrc);
  assert((preloadCode.match(/exposeInMainWorld\('ccDockview'/g) || []).length === 1,
    'there is exactly one ccDockview exposure');
  assert(/const classicLayoutEnabled = process\.argv\.includes\('--cc-classic-layout'\);/.test(preloadSrc),
    'the preload reads the forwarded token from its own process argv');
  assert(/classicLayoutEnabled\s*\?[\s\S]{0,200}enabled: false,/.test(preloadCode),
    'recovery mode gets `enabled: false`');
  assert(/enabled: true,[\s\S]{0,400}saveLayout:[\s\S]{0,200}loadLayout:[\s\S]{0,200}resetLayout:/.test(preloadCode),
    'the production branch gets `enabled: true` plus the three bounded operations');

  // The recovery branch must carry NOTHING but the boolean. Bounded to the ternary's first arm.
  const ternary = preloadCode.slice(preloadCode.indexOf('classicLayoutEnabled'), preloadCode.indexOf(': {'));
  for (const member of ['saveLayout', 'loadLayout', 'resetLayout']) {
    assert(!ternary.includes(member),
      `${member} is ABSENT from the recovery-mode shape, not merely inert`);
  }
  const body = preloadSrc.slice(preloadSrc.indexOf("exposeInMainWorld('ccDockview'"));
  assert(!/setEnabled|enable\s*:/.test(body), 'the bridge exposes no way to change the engine');
  assert(!/layoutPath|filePath|path\s*:/.test(body), 'the bridge accepts no path from the renderer');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nindex.html ships the EMBEDDED dock and loads no Dockview script\n');
// ---------------------------------------------------------------------------
{
  const indexCode = indexSrc.replace(/<!--[\s\S]*?-->/g, '');
  assert(!/<script[^>]*dockview/i.test(indexSrc), 'index.html loads no Dockview script');
  assert(!/<link[^>]*dockview/i.test(indexSrc), 'index.html loads no Dockview stylesheet');
  assert(!/class="[^"]*dockview/i.test(indexSrc), 'index.html carries no Dockview class');

  // The ONE piece of Dockview-related markup: the embedded container, empty and hidden.
  const dockTags = indexCode.match(/<div\s+id="terminalDock"[^>]*>/g) || [];
  assert(dockTags.length === 1, `index.html has EXACTLY ONE #terminalDock (found ${dockTags.length})`);
  assert(/<div\s+id="terminalDock"\s+class="term-dock"\s+hidden><\/div>/.test(indexCode),
    'it ships EMPTY and HIDDEN, so recovery mode leaves it inert and invisible');
  const gridIndex = indexCode.indexOf('id="terminalGrid"');
  const dockIndex = indexCode.indexOf('id="terminalDock"');
  const barIndex = indexCode.indexOf('class="term-bar"');
  assert(barIndex > -1 && gridIndex > barIndex && dockIndex > gridIndex,
    'it is a SIBLING of the grid, below the terminal toolbar — not a wrapper and not before it');
  assert(indexCode.slice(barIndex, dockIndex).includes('tts-controls'),
    'and the audio controls sit in that toolbar ABOVE it, where nothing can cover them');

  // The Library seam: the inert stable identity, and the pre-R5 selector as a negative control.
  const libraryOpenTags = indexSrc.match(/<section\s+id="libraryPane"[^>]*>/g) || [];
  assert(libraryOpenTags.length === 1, `index.html has EXACTLY ONE #libraryPane section (found ${libraryOpenTags.length})`);
  assert(/id="libraryPane"\s+class="tabpane"\s+data-pane="library"/.test(indexSrc),
    'the id sits on the existing Library tabpane — it did not become a new element');
  assert(!/libraryPanel/.test(indexSrc),
    'NEGATIVE CONTROL: #libraryPanel appears nowhere in index.html — it never existed');
  assert(!/libraryPanel/.test(appSrc),
    'NEGATIVE CONTROL: app.js no longer references the nonexistent #libraryPanel');

  const CANONICAL_LIBRARY_CONTROLS = [
    'libRefresh', 'libSearch', 'libMode', 'libRoute', 'libOutcome', 'libDateKind', 'libSort',
    'libStatus', 'libList', 'libReader', 'libCopy', 'libMax', 'libMetaHost', 'libReportText',
    'libFollowupHost',
  ];
  // The fallback is a sentinel that must never occur in index.html: a missing open tag then
  // yields libStart === -1 and an EMPTY section, so every canonical-control assertion below
  // FAILS instead of silently passing. This was once a literal NUL byte, which made Git classify
  // this whole JavaScript file as binary and reduced it to "Binary files ... differ" in the pinned
  // review artifact. A printable sentinel has the identical never-matches property, and the
  // assertion below PROVES that property rather than assuming it.
  const MISSING_LIBRARY_OPEN_TAG = '__missing_library_open_tag__';
  if (indexSrc.includes(MISSING_LIBRARY_OPEN_TAG)) {
    process.stderr.write('  ✗ FATAL: the missing-open-tag sentinel occurs in index.html — the fallback could match\n');
    process.exit(1);
  }
  const libStart = indexSrc.indexOf(libraryOpenTags[0] || MISSING_LIBRARY_OPEN_TAG);
  const librarySection = libStart > -1 ? indexSrc.slice(libStart, indexSrc.indexOf('</section>', libStart)) : '';
  for (const id of CANONICAL_LIBRARY_CONTROLS) {
    assert(new RegExp(`id="${id}"`).test(librarySection), `the Library section still owns #${id}`);
  }

  const CANONICAL_AUDIO_CONTROLS = ['audioBuild', 'sttStatus', 'sttMic', 'ttsStatus', 'ttsStop', 'ttsVoice', 'ttsSpeed'];
  const audioOpenTags = indexSrc.match(/<div\s+class="tts-controls"[^>]*>/g) || [];
  assert(audioOpenTags.length === 1,
    `index.html has EXACTLY ONE .tts-controls surface (found ${audioOpenTags.length})`);
  for (const id of CANONICAL_AUDIO_CONTROLS) {
    assert(new RegExp(`id="${id}"`).test(indexSrc), `index.html still owns #${id}`);
  }
  assert(!/tts-controls[^>]*id=/.test(indexSrc), 'the audio surface needed no layout-only id');
  assert(!/dockview/i.test(audioOpenTags[0]), 'the audio surface carries no Dockview attribute');

  // RE-PINNED for Experiment A (pane-status PROTOTYPE), and not silently: this tripwire exists so an
  // added renderer script has to be argued for rather than slipped in. 21 -> 22. The one addition is
  // `pane-status-badge.js`, gated at the source — main never sends on the pane-status-prototype
  // channel unless BLUE_HELM_PANE_STATUS_PROTOTYPE=1, so with the gate off the module loads, defines
  // one global, and does nothing else. The assertion below names the expected file, so a FUTURE extra
  // script still fails here rather than riding in on this bump.
  const scriptTags = (indexSrc.match(/<script[^>]*src=/g) || []).length;
  assert(scriptTags === 22, `index.html loads exactly 22 <script src> tags — the original 21 plus the gated pane-status prototype badge (found ${scriptTags})`);
  assert(/<script src="pane-status-badge\.js"><\/script>/.test(indexSrc),
    'the 22nd script is exactly the pane-status prototype badge');
  assert(indexSrc.indexOf('BLUE SUBSYSTEM VERDICT: PROTOTYPE') !== -1,
    'index.html records the procurement verdict that authorizes that prototype script');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe surface is EMBEDDED by CSS — no overlay rule exists to regress to\n');
// ---------------------------------------------------------------------------
{
  const harnessHtml = read('dockview-bootstrap-harness.html');
  // Rules only. Prose legitimately DESCRIBES the deleted overlay — quoting the removed declaration
  // in the comment that explains why it is gone must not read as the declaration still existing.
  const cssRules = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
  const harnessRules = cssRules(harnessHtml.replace(/<!--[\s\S]*?-->/g, ''));
  // The Dockview block, fenced at the end of styles.css. Scoped deliberately: `.modal-backdrop` is
  // a pre-existing, unrelated `position: fixed` rule for the New Agent modal, and a blanket ban
  // would either fail on it or force it to be excused by name.
  const dockviewCss = cssRules(cssSrc).split('.term-dock')[0].length < cssRules(cssSrc).length
    ? cssRules(cssSrc).slice(cssRules(cssSrc).indexOf('.term-dock'))
    : '';
  assert(dockviewCss.length > 0, 'the Dockview CSS block is locatable in styles.css');

  // THE R6 NEGATIVE CONTROL, as a permanent structural fact. The prototype's
  // `.dockview-prototype-root { position: fixed; inset: 0; z-index: 9000 }` is what covered the
  // toolbar and made Dictate unreachable. It is deleted, not merely unused, in BOTH the production
  // stylesheet and the harness page that measures against it.
  for (const [name, src] of [['the Dockview block of styles.css', dockviewCss], ['the bootstrap harness page', harnessRules]]) {
    assert(!/dockview-prototype-root/.test(src),
      `NEGATIVE CONTROL: ${name} defines no .dockview-prototype-root overlay class`);
    assert(!/dockview-prototype-banner/.test(src), `${name} defines no prototype banner`);
    assert(!/dockview-prototype-audio/.test(src), `${name} defines no audio slot`);
    assert(!/position:\s*fixed/.test(src), `NEGATIVE CONTROL: ${name} declares no position:fixed rule`);
    assert(!/z-index/.test(src), `${name} declares no stacking override at all`);
  }
  // And the class name itself appears nowhere in the renderer's code, not only in its styles.
  assert(!/dockview-prototype-root/.test(appCode) && !/dockview-prototype-root/.test(adapterCode),
    'NEGATIVE CONTROL: no renderer code creates or looks for a .dockview-prototype-root');

  // The embedded rules, in production and copied into the harness page so its measurements are real.
  for (const [name, src] of [['styles.css', cssSrc], ['the bootstrap harness page', harnessHtml]]) {
    assert(/\.term-dock\s*\{[^}]*flex:\s*1/.test(src), `${name} lays the dock out as an in-flow flex child`);
    assert(/\.dockview-prototype-surface\s*\{[^}]*flex:\s*1 1 auto/.test(src), `${name} carries the surface rule`);
    assert(/\.dockview-prototype-pane-host\s*\{[^}]*height:\s*100%/.test(src), `${name} carries the pane-host rule`);
    assert(/\.tabpane\s*\{[^}]*display:\s*none/.test(src), `${name} keeps the default .tabpane{display:none} rule to fight`);
    assert(/\.dockview-prototype-pane-host > \.tabpane\[data-pane="library"\]\s*\{[^}]*display:\s*flex/.test(src),
      `${name} forces the docked Library visible with a (0,3,0) selector`);
    assert(/\.tts-controls\s*\{[^}]*display:\s*flex/.test(src), `${name} lays out the audio controls`);
  }
  assert(/\.term-dock\[hidden\]\s*\{\s*display:\s*none/.test(cssSrc),
    'styles.css hides the dock explicitly — an author display value beats the UA [hidden] rule');
  assert(/\.term-grid\[hidden\]\s*\{\s*display:\s*none/.test(cssSrc), 'and the grid the same way');
  assert(cssSrc.indexOf('.dockview-prototype-pane-host') > cssSrc.indexOf('.tabpane {'),
    'the layout rules come after the defaults, so no default rule was reordered');
  assert(!/dockview/i.test(cssSrc.split('/* ---- Dockview production layout engine')[0]),
    'no dockview styling leaks into the pre-existing part of styles.css');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe renderer starts the engine by DEFAULT and refuses into a usable grid\n');
// ---------------------------------------------------------------------------
{
  assert(/if \(!window\.ccDockview \|\| window\.ccDockview\.enabled !== true\) \{/.test(appCode),
    'the engine starts unless `enabled` is not the boolean true (strict !== true, fail-closed)');
  const guardPos = appCode.indexOf('if (!window.ccDockview || window.ccDockview.enabled !== true) {');
  const beforeGuard = appCode.slice(0, guardPos);
  assert(!/window\.dockview|createDockview|toJSON\(\)|fromJSON/.test(beforeGuard),
    'no Dockview API is touched before that guard');

  assert(/const DOCKVIEW_SCRIPTS = \[/.test(appCode),
    'the Dockview scripts are a dynamic list, not <script> tags in index.html');
  assert(/'\.\.\/node_modules\/dockview\/dist\/dockview\.js'/.test(appCode),
    'the vendor bundle is loaded from node_modules (nothing new is committed to the repo)');
  assert(/startLayoutEngine\(\)\.catch\(/.test(appCode),
    'boot() attaches a .catch so this floating promise cannot become an invisible failure');
  assert((appCode.match(/startLayoutEngine\(\)/g) || []).length === 2,
    'the seam is declared once and called once');
  assert(!/^\s*(import|require)\(['"]dockview/m.test(appCode), 'app.js has no top-level dockview import');

  // Both containers always exist; only visibility moves, and only AFTER activation succeeded.
  assert(/dock\.hidden = !useDock;\s*\n\s*grid\.hidden = useDock;/.test(appCode),
    'showTerminalSurface toggles visibility only — the grid is hidden, never destroyed');
  const startBody = appCode.slice(appCode.indexOf('async function startLayoutEngine()'),
    appCode.indexOf('function buildDockviewHost('));
  assert(startBody.indexOf('adoptExistingPanes()') < startBody.indexOf("showTerminalSurface('dock')"),
    'panes are adopted BEFORE the visible surface is switched, so a failure never flashes a broken workspace');
  assert((startBody.match(/refuseLayoutEngine\(/g) || []).length >= 6,
    'every failure path in the starter refuses through the one bounded helper');
  assert(/function refuseLayoutEngine\(reason\) \{[\s\S]{0,300}showTerminalSurface\('grid'\)/.test(appCode),
    'and every refusal lands on the working classic grid');

  // NEGATIVE CONTROL for the old polarity, in the renderer.
  assert(!/maybeStartDockviewPrototype|DOCKVIEW_PROTOTYPE_SCRIPTS|ccDockviewPrototypeInstance/.test(appCode),
    'NEGATIVE CONTROL: none of the prototype-era opt-in identifiers survive in app.js');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe terminal launch transaction docks BEFORE it starts a PTY\n');
// ---------------------------------------------------------------------------
{
  const openStart = appCode.indexOf('function openInAppTerminal(');
  const openEnd = appCode.indexOf('const DOCKVIEW_SCRIPTS', openStart);
  assert(openStart > -1 && openEnd > openStart, 'openInAppTerminal is a bounded block');
  const openBody = appCode.slice(openStart, openEnd);

  const dockAt = openBody.indexOf("layoutInstance.addPane(id, 'terminal')");
  const startAt = openBody.indexOf('cc.ptyStart({');
  assert(dockAt > -1 && startAt > -1, 'both the dock attempt and the PTY start are present');
  assert(dockAt < startAt,
    'THE ORDERING: adoption is attempted BEFORE ptyStart, so a failed dock cannot race a spawning PTY');

  assert((appCode.match(/cc\.ptyStart\(/g) || []).length === 1,
    'ptyStart appears exactly once in app.js — there is no second terminal implementation');
  assert((appCode.match(/cc\.ptyKill\(/g) || []).length === 1,
    'ptyKill appears exactly once — one kill path, in the single close path');

  // The pre-PTY rollback must invoke NEITHER. Bounded to its own function body.
  const rbStart = openBody.indexOf('const rollbackLocalPane = () => {');
  const rbEnd = openBody.indexOf('\n  };', rbStart);
  assert(rbStart > -1 && rbEnd > rbStart, 'the local rollback is its own bounded function');
  const rbBody = openBody.slice(rbStart, rbEnd);
  assert(!/ptyKill/.test(rbBody), 'the pre-PTY rollback never kills a PTY — none was ever started');
  assert(!/ptyStart/.test(rbBody), 'and never starts one');
  assert(/terms\.delete\(id\)/.test(rbBody), 'it deletes the renderer bookkeeping');
  assert(/pane\.remove\(\)/.test(rbBody) && /term\.dispose\(\)/.test(rbBody),
    'and disposes the pane element and its xterm');
  assert(/ro\.disconnect\(\); paneData\.roConnected = false;/.test(rbBody),
    'and disconnects the pane\'s own resize observer, recording that it did');

  // NEGATIVE CONTROL for the previous ordering: the "close what we just started" shape is gone.
  const dockBlock = openBody.slice(dockAt - 400, startAt);
  assert(!/closeThisPane\(\)/.test(dockBlock),
    'NEGATIVE CONTROL: the dock-failure path no longer calls the full close path (which would ptyKill)');

  // A refused or rejected start must converge on the ONE close path, and only when docked.
  assert(/const onStartFailed = \(reason\) => \{[\s\S]{0,600}if \(layoutInstance\) closeThisPane\(\);/.test(openBody),
    'a failed start removes the pane and its panel — and only when a panel exists to remove');
  assert(/Promise\.resolve\(startResult\)\.then\(/.test(openBody),
    'the ptyStart result is always consumed, so a rejection cannot go unhandled');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nresize ownership has exactly one owner, and hands back on rollback\n');
// ---------------------------------------------------------------------------
{
  assert(/function fitAllTerms\(\) \{[\s\S]{0,300}if \(paneIsDocked\(id\)\) continue;/.test(appCode),
    'the global grid fitter SKIPS docked panes — otherwise a hosted pane would have two fitters');

  // The subscription is mutated in exactly three places, and each records what it did. That is what
  // makes `roConnected` a record rather than a hopeful flag.
  const disconnects = (appCode.match(/\bro\.disconnect\(\)|\bt\.ro\.disconnect\(\)/g) || []).length;
  assert(disconnects === 3,
    `ro.disconnect() appears exactly three times: suspend, pre-PTY rollback, close (saw ${disconnects})`);
  const observes = (appCode.match(/\bro\.observe\(/g) || []).length;
  assert(observes === 2, `ro.observe() appears exactly twice: creation and resume (saw ${observes})`);
  assert((appCode.match(/roConnected = (true|false)/g) || []).length === 4,
    'every one of those transitions updates the record, plus its initial value');
  assert((appCode.match(/new ResizeObserver\(/g) || []).length === 1,
    'exactly ONE ResizeObserver is ever constructed per pane — resume never builds a second');

  const resumeStart = appCode.indexOf('function resumeAppResizeObserver(paneId)');
  const resumeBody = appCode.slice(resumeStart, appCode.indexOf('\n}', resumeStart));
  assert(resumeStart > -1, 'the narrowly scoped resume operation exists');
  assert(/if \(t\.roConnected === true\) return true;/.test(resumeBody),
    'it is idempotent — resuming a pane that already owns its resizing subscribes nothing');
  assert(/t\.ro\.observe\(body\)/.test(resumeBody), 'it reconnects the EXISTING observer object');
  assert(!/new ResizeObserver/.test(resumeBody), 'and never constructs a second one');
  assert(/REFUSED to resume grid resizing/.test(appSrc), 'a missing terminal body is a VISIBLE refusal');

  // The rollback path restores DOM position and resize ownership together, then refits once.
  const returnStart = appCode.indexOf('function returnAllPanesToGrid()');
  const returnBody = appCode.slice(returnStart, appCode.indexOf('\n}', returnStart));
  assert(returnStart > -1, 'the rollback helper exists');
  assert(/grid\.appendChild\(t\.pane\)/.test(returnBody), 'it reparents the pane element by object identity');
  assert(/resumeAppResizeObserver\(id\)/.test(returnBody), 'it hands resize ownership back to the app');
  assert(returnBody.indexOf('resumeAppResizeObserver') < returnBody.indexOf('fitAllTerms()'),
    'observers are reconnected BEFORE the refit, so the refit runs under the restored ownership');
  assert((returnBody.match(/fitAllTerms\(\)/g) || []).length === 1,
    'and there is exactly ONE bounded refit for the whole transition');

  // The adoption rollback releases the adapter's controller before returning panes to the grid,
  // so no pane is ever owned by both and none is left owned by neither.
  const adoptStart = appCode.indexOf('function adoptExistingPanes()');
  const adoptBody = appCode.slice(adoptStart, appCode.indexOf('\nfunction returnAllPanesToGrid', adoptStart));
  assert(adoptBody.indexOf('onAppPaneClosed(doneId)') < adoptBody.indexOf('returnAllPanesToGrid()'),
    'the adapter releases each adopted pane BEFORE the app takes its resizing back');

  // The adapter's side of the handover.
  assert(/host\.suspendAppResizeObserver\(paneId\);/.test(adapterCode),
    'the adapter suspends the app observer when it takes a terminal');
  assert(!/resumeAppResizeObserver/.test(adapterCode),
    'and never resumes it — handing ownership back is the APP\'s decision, on rollback only');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nmaximize routes by ownership, with no silent fall-through\n');
// ---------------------------------------------------------------------------
{
  assert(/if \(paneIsDocked\(id\)\) \{ maximizeDockedPane\(id\); return; \}\s*\n\s*paneMaximizer\.toggle\(id, pane\);/.test(appCode),
    'the click handler routes on adapter ownership and RETURNS — the two maximizers are exclusive');
  const maxStart = appCode.indexOf('function maximizeDockedPane(paneId)');
  const maxBody = appCode.slice(maxStart, appCode.indexOf('\n}', maxStart));
  assert(maxStart > -1, 'the docked maximize path exists');
  assert(/layoutInstance\.maximizePane\(paneId\)/.test(maxBody), 'it uses the adapter\'s panel-API maximize');
  assert(/if \(!result\) \{[\s\S]{0,400}return false;/.test(maxBody), 'a refusal is a full stop');
  assert(/maximize REFUSED/.test(maxBody), 'and is visible');
  assert(!/paneMaximizer/.test(maxBody),
    'THE ROUTING GUARANTEE: the docked path never reaches the classic grid maximizer');
  assert(!/fitAllTerms/.test(maxBody),
    'and never runs the grid fitter — the adapter refits through its own controllers');
  assert(/registry\.scheduleAll\(\);\s*\n\s*return \{ maximized: true \}/.test(adapterCode),
    'the adapter refits through the OWNING path after a maximize');
  assert(/registry\.scheduleAll\(\);\s*\n\s*return \{ maximized: false \}/.test(adapterCode),
    'and after a restore');
  assert(/isPaneMaximized\(paneId\) \{/.test(adapterCode),
    'the adapter exposes a read-only maximized query for the app\'s glyph bookkeeping');
  assert(/function refreshDockedMaximizeGlyphs\(\)/.test(appCode),
    'and the app repaints every docked glyph after a maximize, because only one group may be maximized');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nLibrary navigation targets the singleton, and classic keeps its tab\n');
// ---------------------------------------------------------------------------
{
  assert(/if \(t\.dataset\.tab === 'library' && dockviewIsActive\(\)\) \{ openLibraryInDock\(\); return; \}/.test(appCode),
    'the Library tab navigates to the docked panel while Dockview is live, and returns');
  const navStart = appCode.indexOf('function openLibraryInDock(options = {})');
  const navBody = appCode.slice(navStart, appCode.indexOf('\n}', navStart));
  assert(navStart > -1, 'the docked Library navigation exists');
  assert(navBody.indexOf("switchTab('terminals')") < navBody.indexOf('addPane'),
    'it activates the Terminals workspace FIRST — that is where a docked Library physically lives');
  assert(/layoutInstance\.addPane\('library', 'library'\)/.test(navBody),
    'it adds the singleton through the adapter\'s one transactional add');
  assert(/result\.reason === 'library-already-open'/.test(navBody),
    'an already-open Library is a SUCCESS for navigation — the adapter focused it');
  assert(/Library REFUSED/.test(navBody), 'anything else is a visible refusal');
  assert(/if \(options\.firstLoadRefresh !== false && !libState\.loaded\) refreshLibrary\(\);/.test(navBody),
    'the existing V5b2 first-load scan is preserved, and is suppressible for Open Report');
  assert(!/cloneNode|innerHTML/.test(navBody), 'it never clones or rebuilds the Library markup');

  // Classic mode and every refusal keep the original tab behaviour, byte for byte.
  const focusStart = appCode.indexOf('function focusLibrarySurface(options = {})');
  const focusBody = appCode.slice(focusStart, appCode.indexOf('\n}', focusStart));
  assert(/if \(dockviewIsActive\(\)\) return openLibraryInDock\(options\);/.test(focusBody),
    'Open Report routes through the same navigation while Dockview is live');
  assert(/switchTab\('library'\)/.test(focusBody), 'and falls back to the original tab switch otherwise');
  assert(/focusLibrarySurface\(\{ firstLoadRefresh: false \}\)/.test(appCode),
    'Open Report suppresses the first-load scan so V3b\'s ordered algorithm still owns it');

  // The singleton dock seam itself.
  assert(/const LIBRARY_SELECTOR = '#libraryPane';/.test(appCode), 'app.js resolves the Library by its production id');
  assert(/document\.createComment\('dockview-prototype: Library home'\)/.test(appCode),
    'docking records the exact original position with a placeholder, not just a parent');
  assert(/let libraryDockedElement = null;/.test(appCode), 'app.js holds a reference to the docked element');
  assert(/const el = libraryDockedElement \|\| document\.querySelector\(LIBRARY_SELECTOR\);/.test(appCode),
    'undock prefers the HELD reference over a document lookup (the element is already detached)');
  assert(/placeholder\.parentNode\.insertBefore\(el, placeholder\)/.test(appCode),
    'undock returns the element to the placeholder position, not merely to the parent');
  assert(/placeholder\.parentNode\.removeChild\(placeholder\)/.test(appCode), 'the placeholder is cleaned up');
  assert(!/cloneNode/.test(appCode), 'app.js never clones DOM for the layout engine');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe audio seam is GONE, not disabled\n');
// ---------------------------------------------------------------------------
{
  // The safest reparenting code is the code that does not exist. These are the R6 negative controls
  // as permanent structural facts: every identifier the prototype's borrow/restore mechanism used
  // must be absent from app.js AND the adapter.
  for (const [name, code] of [['app.js', appCode], ['the adapter', adapterCode]]) {
    for (const forbidden of ['AUDIO_CONTROLS_SELECTOR', 'dockAudioControls', 'undockAudioControls',
      'audioControlsCount', 'isAudioControlsDocked', 'audioDockedElement', 'dockview-prototype-audio']) {
      assert(!code.includes(forbidden), `NEGATIVE CONTROL: ${name} does not mention ${forbidden}`);
    }
  }
  for (const forbidden of ['ccSTT', 'ccTTS', 'sttMic', 'ttsStop', 'ttsVoice', 'ttsSpeed', 'getUserMedia', 'dispatchEvent', 'tts-controls']) {
    assert(!adapterCode.includes(forbidden),
      `the adapter never references ${forbidden} — it has no knowledge of the audio surface at all`);
  }

  // Dictation destination locking is renderer state, not DOM position, and is untouched.
  const hostStart = appCode.indexOf('function buildDockviewHost(');
  const hostEnd = appCode.indexOf('async function boot()', hostStart);
  assert(hostStart > -1 && hostEnd > hostStart, 'buildDockviewHost is bounded by the boot function');
  const hostBody = appCode.slice(hostStart, hostEnd);
  assert(!/audio|tts|stt/i.test(hostBody), 'the host surface exposes no audio member of any kind');
  assert(/focusPane: \(paneId\) => \{[\s\S]{0,160}activeTermId = paneId;/.test(hostBody),
    'Dockview focus changes continue to update activeTermId');
  assert(/sttDictationTargetId = activeTermId;/.test(appCode),
    'the dictation destination is still locked to the pane focused at recording start');
  assert(/const targetId = sttDictationTargetId;[\s\S]{0,120}sttDictationTargetId = null;/.test(appCode),
    'the finalized transcript still resolves against the LOCKED target, not the current pane');
  assert(/window\.ccSttTargetLock\.resolveTranscriptDelivery/.test(appCode),
    'delivery still goes through the existing target-lock policy module');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nterminal IDs stay monotonic and are never reused\n');
// ---------------------------------------------------------------------------
{
  assert(/let termSeq = 0;/.test(appCode), 'the terminal sequence starts at zero');
  assert(/'pty' \+ \(\+\+termSeq\)/.test(appCode), 'every terminal takes the NEXT sequence value');
  assert((appCode.match(/termSeq\s*=\s*0/g) || []).length === 1,
    'termSeq is initialised exactly once and never reset — "Terminal 17" means 17 created, not 17 live');
  assert(/liveTerminalCount: \(\) => terms\.size/.test(appCode),
    'a separate live counter exists so a monotonic label cannot be mistaken for a live count');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe pane close path is single and idempotent\n');
// ---------------------------------------------------------------------------
{
  assert(/const closeThisPane = \(\) => \{\s*\n\s*if \(!terms\.has\(id\)\) return;/.test(appCode),
    'the close path guards on terms.has(id) — a second call is a no-op');
  assert(/paneData\.closePane = closeThisPane;/.test(appCode), 'the close path is published on the pane record');
  assert(/pane\.querySelector\('\.x'\)\.onclick = closeThisPane;/.test(appCode),
    'the close BUTTON uses that same single path');

  // NOTE: the convergence itself is proven BEHAVIOURALLY, in the adapter lifecycle suite against
  // the vendor's real event payload shape and in the application harness against real IPC counts.
  // A source-regex once "proved" this while the delegation was dead code (the handler read
  // `event.panel.id`, but dockview fires the panel itself), so what is pinned here is only the
  // negative space: the adapter holds no privileged authority.
  assert(/onDidRemovePanel/.test(adapterSrc), 'the adapter subscribes to panel removal');

  // dockview@7.0.4 fires these two events with DIFFERENT payload shapes, which is an easy trap:
  //   onDidRemovePanel        -> the panel ITSELF        (`_onDidRemovePanel.fire(event.panel)`)
  //   onDidActivePanelChange  -> a wrapper { panel, origin } (`.fire({ panel, origin })`)
  const removeStart = adapterCode.indexOf('api.onDidRemovePanel(');
  const removeBlock = adapterCode.slice(removeStart, adapterCode.indexOf('});', removeStart));
  assert(removeStart > -1 && !/\.panel\.id/.test(removeBlock),
    'the removal handler does NOT read a wrapper — dockview fires the panel itself there');
  assert(/panel && panel\.id/.test(removeBlock), 'the removal handler reads the ID off the payload directly');

  const activeStart = adapterCode.indexOf('api.onDidActivePanelChange(');
  const activeBlock = adapterCode.slice(activeStart, adapterCode.indexOf('});', activeStart));
  assert(activeStart > -1 && /event && event\.panel && event\.panel\.id/.test(activeBlock),
    'the active-panel handler DOES read the wrapper — that event really is { panel, origin }');

  assert(!/ptyKill|ptyStart|ptyWrite|ptyResize/.test(adapterCode),
    'the adapter never touches PTY IPC directly — PTY authority stays with the app');
  assert(!/clipboardRead|clipboardWrite|libraryList|libraryRead|libraryFollowup|getGeminiKeyStatus|setGeminiKey/.test(adapterCode),
    'the adapter never touches clipboard, Library, follow-up, or credential IPC');
  assert(!/\bcc\./.test(adapterCode),
    'the adapter never reaches the privileged cc.* preload bridge at all');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nPHASE C: ONE validator, and the prototype evidence file is untouchable\n');
// ---------------------------------------------------------------------------
{
  const policySrc = read('dockview-layout-policy.js');
  const storeSrc = read('dockview-layout-store.js');
  const storeCode = stripComments(storeSrc);

  // Exactly ONE file in the app defines the schema. A second `function validateLayout(` anywhere
  // would be the drift this architecture exists to prevent.
  const definers = [];
  for (const f of ['dockview-layout-policy.js', 'dockview-layout-store.js', 'main.js', 'preload.js',
    'renderer/app.js', 'renderer/dockview-prototype.js', 'renderer/dockview-fit-policy.js',
    'renderer/dockview-panel-policy.js']) {
    const parts = f.split('/');
    if (/function validateLayout\s*\(/.test(stripComments(read(...parts)))) definers.push(f);
  }
  assert(JSON.stringify(definers) === JSON.stringify(['dockview-layout-policy.js']),
    `exactly ONE module defines validateLayout (saw ${JSON.stringify(definers)})`);

  assert(/const policy = require\('\.\/dockview-layout-policy'\);/.test(storeCode),
    'the main-side store REQUIRES the shared policy rather than carrying its own copy');
  assert(!/function validateEnvelope\s*\(|function buildEnvelope\s*\(/.test(storeCode),
    'and defines no envelope logic of its own');
  assert(/^  validateEnvelope,$/m.test(storeCode) && /^  validateLayout,$/m.test(storeCode),
    'it re-exports the shared functions so existing callers keep one import site');
  assert(!/require\s*\(/.test(stripComments(policySrc)),
    'the policy itself requires nothing — that is what makes it loadable in the renderer');
  assert(/'\.\.\/dockview-layout-policy\.js'/.test(appCode),
    'and the renderer loads THAT FILE as a classic script');
  assert(/resolveDependency\('ccDockviewLayoutPolicy', '\.\.\/dockview-layout-policy'\)/.test(adapterCode),
    'the adapter resolves it by the same path under CommonJS');
  assert(/\['ccDockviewLayoutPolicy', \(v\) => !!v/.test(adapterCode),
    'and it is a REQUIRED browser export, so a missing or unparsed copy refuses into the classic grid');

  // THE PROTOTYPE EVIDENCE FILE. It is the human-acceptance record behind Blue's ADOPT verdict and
  // must never be read, migrated, renamed, deleted, or overwritten by production code.
  const PROTOTYPE_FILE = 'dockview-prototype-layout.json';
  for (const f of ['dockview-layout-store.js', 'dockview-layout-policy.js', 'main.js', 'preload.js',
    'renderer/app.js', 'renderer/dockview-prototype.js']) {
    const parts = f.split('/');
    assert(!stripComments(read(...parts)).includes(PROTOTYPE_FILE),
      `NEGATIVE CONTROL: ${f} contains no production read/write/delete path for ${PROTOTYPE_FILE}`);
  }
  assert(storeSrc.includes(PROTOTYPE_FILE),
    'the store\'s PROSE explains why that file is off limits — the ban is documented, not accidental');
  assert(/const LAYOUT_FILENAME = 'dockview-layout\.json';/.test(storeCode),
    'the production filename is the distinct dockview-layout.json');

  // The main-owned boundary is intact: every guard still lives in the store.
  for (const [pattern, label] of [
    [/lstatSync\(layoutPath\)/, 'it lstats rather than stats, so a link is never followed'],
    [/st\.isSymbolicLink\(\)/, 'reparse points are refused'],
    [/!st\.isFile\(\)/, 'non-regular files are refused'],
    [/st\.size > MAX_RAW_BYTES/, 'the byte bound is checked BEFORE any parsing'],
    [/buf\.length > MAX_RAW_BYTES/, 'and re-checked after the read'],
    [/new TextDecoder\('utf-8', \{ fatal: true, ignoreBOM: false \}\)/, 'decoding is strict UTF-8'],
    [/path\.join\(userDataDir, LAYOUT_FILENAME\)/, 'the path is main-owned and fixed'],
    [/renameSync\(tmp, layoutPath\)/, 'the write is atomic through a temp file'],
  ]) {
    assert(pattern.test(storeCode), label);
  }
  assert(/const verdict = validateEnvelope\(envelope\);\s*\n\s*if \(!verdict\.ok\) return verdict;/.test(storeCode),
    'main validates BEFORE writing, so an invalid layout is never persisted');
  assert(storeCode.indexOf('validateEnvelope(envelope)') < storeCode.indexOf('writeFileSync'),
    'and it does so before the file is touched at all');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nPHASE C: no layout operation can create, close or strand a PTY\n');
// ---------------------------------------------------------------------------
{
  // THE PROTOTYPE'S PANE-CREATING LAYOUT CONTROL IS GONE, NOT DISABLED. `useDefaultLayout()` created
  // two terminals and the Library every time it ran, which multiplied live PTYs during human
  // acceptance. There is no such routine, no export for one, and no control that could reach one.
  assert(!/useDefaultLayout/.test(adapterCode),
    'NEGATIVE CONTROL: `useDefaultLayout` appears nowhere in the adapter code');
  assert(!/workspace-not-empty/.test(adapterCode),
    'NEGATIVE CONTROL: nor does its refusal reason — the whole routine is deleted');
  assert(!/'Add Terminal'|'Add Library'|'Create Default Workspace'/.test(adapterCode),
    'and no control label can create a pane');
  assert(!/createTerminalPane\(\)/.test(adapterCode),
    'NEGATIVE CONTROL: the adapter never calls the host\'s terminal creator at all');

  // The four operations exist, each as its own bounded async function.
  for (const fn of ['saveArrangement', 'restoreArrangement', 'resetArrangement', 'clearSavedArrangement']) {
    assert(new RegExp(`async function ${fn}\\(\\)`).test(adapterCode), `${fn} exists`);
    assert(new RegExp(`^      ${fn},$`, 'm').test(adapterCode), `${fn} is on the instance surface`);
  }

  // EXACTLY ONE fromJSON CALL SITE, and it validates first. This is the Phase-C invariant: there is
  // no route by which unvalidated state can be applied, because there is only one route at all.
  const applySites = (adapterCode.match(/api\.fromJSON\(/g) || []).length;
  assert(applySites === 1, `api.fromJSON appears exactly ONCE in the adapter (saw ${applySites})`);
  const applyStart = adapterCode.indexOf('function applyValidatedLayout(layout)');
  const applyBody = adapterCode.slice(applyStart, adapterCode.indexOf('\n    }', applyStart));
  assert(applyStart > -1, 'and it lives inside applyValidatedLayout');
  assert(applyBody.indexOf('layoutPolicy.validateLayout(layout)') < applyBody.indexOf('api.fromJSON('),
    'which validates through the SHARED policy IMMEDIATELY BEFORE applying');
  assert(/if \(error\) return \{ ok: false, reason: error, applied: false \};/.test(applyBody),
    'a validation failure returns the bounded reason and never reaches fromJSON');
  assert(/inMountTransition\(\(\) => api\.fromJSON\(layout\)\)/.test(applyBody),
    'and the apply runs inside a mount transition, so its removals never kill a PTY');

  // Every operation goes through the exclusivity wrapper.
  for (const fn of ['saveArrangement', 'restoreArrangement', 'resetArrangement', 'clearSavedArrangement']) {
    const start = adapterCode.indexOf(`async function ${fn}()`);
    const head = adapterCode.slice(start, start + 200);
    assert(/return runExclusive\('/.test(head), `${fn} runs under runExclusive — one operation at a time`);
  }
  assert(/} finally \{\s*\n\s*busyOperation = null;\s*\n\s*controls\.setIdle\(\);/.test(adapterCode),
    'and the busy state is released in `finally`, so a throwing operation cannot deadlock the UI');
  assert(!/setTimeout|retry/i.test(adapterCode.slice(adapterCode.indexOf('async function runExclusive'),
    adapterCode.indexOf('async function saveArrangement'))),
    'nothing is ever retried automatically');

  // SAVE validates and compares BEFORE it calls main.
  const saveStart = adapterCode.indexOf('async function saveArrangement()');
  const saveBody = adapterCode.slice(saveStart, adapterCode.indexOf('async function restoreArrangement', saveStart));
  assert(saveBody.indexOf('layoutPolicy.paneIdsFromLayout(current)') < saveBody.indexOf('host.bridge.saveLayout'),
    'Save validates the layout BEFORE the IPC');
  assert(saveBody.indexOf('layoutPolicy.comparePaneSets') < saveBody.indexOf('host.bridge.saveLayout'),
    'and compares the pane sets BEFORE the IPC');
  assert(saveBody.indexOf('paneIsMounted(id)') < saveBody.indexOf('host.bridge.saveLayout'),
    'and confirms every owned pane is mounted BEFORE the IPC');
  assert(!/fromJSON/.test(saveBody), 'Save never applies a layout');

  // RESTORE: validate the envelope, compare the sets, capture and validate the rollback, then apply.
  const restoreStart = adapterCode.indexOf('async function restoreArrangement()');
  const restoreBody = adapterCode.slice(restoreStart, adapterCode.indexOf('async function resetArrangement', restoreStart));
  assert(/layoutPolicy\.validateEnvelope\(loaded\.envelope\)/.test(restoreBody),
    'Restore validates the WHOLE envelope again in the renderer');
  assert(restoreBody.indexOf('validateEnvelope') < restoreBody.indexOf('comparePaneSets'),
    'before comparing the pane sets');
  assert(restoreBody.indexOf('comparePaneSets') < restoreBody.indexOf('captureWorkspace()'),
    'and before capturing the rollback target');
  assert(restoreBody.indexOf('captureWorkspace()') < restoreBody.indexOf('applyAsTransaction'),
    'which is captured before anything is applied');
  assert(/layoutPolicy\.validateLayout\(snapshot\.layout\)/.test(restoreBody),
    'the rollback snapshot is validated too — applying a change we could not undo is refused');
  assert(/ownedIds\(\)/.test(restoreBody),
    'the LIVE set comes from the adapter\'s own ownership map, not from the saved layout');
  assert(!/useDefaultLayout|createTerminalPane/.test(restoreBody),
    'a failed restore has no fallback layout and creates no terminal');

  // RESET: no file I/O at all, and the arrangement is computed from the LIVE panes.
  const resetStart = adapterCode.indexOf('async function resetArrangement()');
  const resetBody = adapterCode.slice(resetStart, adapterCode.indexOf('async function clearSavedArrangement', resetStart));
  assert(!/bridge\.(save|load|reset)Layout/.test(resetBody),
    'Reset reads no file, writes no file and deletes no file');
  assert(/layoutPolicy\.buildDefaultArrangement\(\{/.test(resetBody),
    'it computes the default arrangement through the shared policy');
  assert(/for \(const \[id, record\] of hostedPanes\)/.test(resetBody),
    'from the LIVE ownership map, so the pane set is preserved by construction');
  assert(/applyAsTransaction\('reset'/.test(resetBody),
    'and applies it through the SAME validated transactional machinery as Restore');
  assert(!/createTerminalPane|dockLibrary/.test(resetBody),
    'creating a terminal or docking the Library is not something Reset can do');

  // CLEAR: only main's reset, and never fromJSON.
  const clearStart = adapterCode.indexOf('async function clearSavedArrangement()');
  // Anchored on CODE, not on the section comment: `adapterCode` has had its comments stripped, so a
  // comment anchor would miss and silently widen the slice to the whole rest of the file.
  const clearBody = adapterCode.slice(clearStart, adapterCode.indexOf('function buildControls()', clearStart));
  assert(/host\.bridge\.resetLayout\(\)/.test(clearBody), 'Clear invokes only main\'s reset operation');
  assert(!/fromJSON|applyAsTransaction|addPane/.test(clearBody),
    'and applies nothing, adds nothing, and closes nothing');
  assert(/result\.existed === false/.test(clearBody),
    'an already-absent file is distinguished as a successful no-op');
  assert(/live panes were NOT changed/i.test(clearBody),
    'and the status states explicitly that live panes were unchanged');

  // The single rollback strategy — no repair, no rebuild-through-addPane.
  const rollbackStart = adapterCode.indexOf('function rollbackWorkspace(snapshot)');
  const rollbackBody = adapterCode.slice(rollbackStart, adapterCode.indexOf('\n    }', rollbackStart));
  assert(/applyValidatedLayout\(snapshot\.layout\)/.test(rollbackBody),
    'the rollback re-applies the captured topology through the one validated call site');
  assert(!/addPane\(|api\.clear\(\)/.test(rollbackBody),
    'NEGATIVE CONTROL: it never falls back to clearing and re-adding — that is a repair, not a rollback');
  assert(/return 'incomplete'/.test(rollbackBody) && /return 'restored'/.test(rollbackBody),
    'and it reports honestly which of the two happened');
  assert(/could NOT be/.test(adapterCode), 'an incomplete rollback says so in the status');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nlayout controls cannot silently create or destroy\n');
// ---------------------------------------------------------------------------
{
  // Transactional docking: duplicate detection precedes every mutation.
  const addStart = adapterCode.indexOf('function addPane(');
  const addBody = adapterCode.slice(addStart, adapterCode.indexOf('\n    }', addStart));
  assert(addBody.indexOf('api.getPanel(paneId)') < addBody.indexOf('hostedPanes.set'),
    'an existing panel is detected BEFORE hostedPanes is mutated');
  assert(addBody.indexOf('api.getPanel(paneId)') < addBody.indexOf('host.dockLibrary'),
    'an existing panel is detected BEFORE the Library DOM is touched');
  assert(/library-already-open/.test(addBody), 'a duplicate Library Add is a bounded, named refusal');
  assert(/existing\.api\.setActive\(\)/.test(addBody), 'the duplicate path focuses via the verified public panel API');
  assert(/library-dom-missing/.test(addBody), 'a missing Library surface is a bounded, named refusal');
  assert(/hostedPanes\.delete\(paneId\);[\s\S]{0,200}host\.undockLibrary\(\)/.test(addBody),
    'a failed addPanel rolls back BOTH provisional ownership and the Library DOM');

  // The undock belongs to permanent release only — a restore rebuild must not send it home.
  const releaseStart = adapterCode.indexOf('function releasePane(');
  const releaseBody = adapterCode.slice(releaseStart, adapterCode.indexOf('\n    }', releaseStart));
  assert(/host\.undockLibrary\(\)/.test(releaseBody), 'a permanent release returns the Library home');
  const unmountStart = adapterCode.indexOf('function unmountPane(');
  const unmountBody = adapterCode.slice(unmountStart, adapterCode.indexOf('\n    }', unmountStart));
  assert(!/undockLibrary/.test(unmountBody),
    'an unmount (a restore-driven rebuild) does NOT undock the Library');

  // Phase C renders four ENABLED controls with stable ids. The disabled placeholders are gone: an
  // operation is either implemented and clickable, or it is not on the bar.
  assert(!/PHASE_C_TITLE|Layout persistence arrives in Phase C/.test(adapterCode),
    'NEGATIVE CONTROL: the Phase-B disabled-placeholder machinery is gone');
  assert(!/dataset\.phase = 'c'/.test(adapterCode), 'and so is its data-phase marker');
  const CONTROL_IDS = ['dvSaveArrangement', 'dvRestoreArrangement', 'dvResetArrangement', 'dvClearSaved'];
  for (const id of CONTROL_IDS) {
    assert(adapterCode.includes(`'${id}'`), `the stable control id ${id} is declared`);
  }
  assert(/b\.disabled = true;[\s\S]{0,200}status\.textContent = `\$\{OPERATION_LABEL\[name\]\}…`/.test(adapterCode),
    'controls are disabled only for the duration of an operation, alongside an in-progress status');
  assert(/b\.disabled = false;/.test(adapterCode), 'and re-enabled afterwards');

  assert(/disableFloatingGroups: true/.test(adapterCode),
    'floating groups are disabled (popouts excluded by the verdict, floating out of scope)');
  assert(!/addPopoutGroup|popoutUrl/.test(adapterCode), 'the adapter never creates a popout group');
  assert(!/activate[\s\S]{0,4000}?await restoreLayout\(\)/.test(adapterCode),
    'activate() does not auto-restore a workspace');
  assert(!/activate[\s\S]{0,4000}?await useDefaultLayout\(\)/.test(adapterCode),
    'activate() does not auto-create a workspace (no PTY is spawned on launch)');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe browser bootstrap is fail-safe by CONSTRUCTION\n');
// ---------------------------------------------------------------------------
// Structural supplements. The BEHAVIOUR is proven in a real Electron renderer by
// dockview-bootstrap.test.js; these pin the shape so a future edit that reintroduces the defect
// fails here too, cheaply, without waiting for the browser gate.
{
  const fitSrc = read('renderer', 'dockview-fit-policy.js');
  const panelSrc = read('renderer', 'dockview-panel-policy.js');

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

  // (c) THE ROOT LIFECYCLE IS GONE. bootstrap() no longer creates ANY element: it LOOKS UP the
  // container index.html ships. Creating a full-screen overlay first is what turned a script
  // failure into an opaque blank screen over a working application.
  const bootstrapStart = adapterCode.indexOf('function bootstrap(');
  assert(bootstrapStart > -1, 'the adapter exposes bootstrap()');
  const bootstrapBody = adapterCode.slice(bootstrapStart);
  assert(!/doc\.createElement\(/.test(bootstrapBody),
    'NEGATIVE CONTROL: bootstrap() creates no element at all — there is no root to leave behind');
  assert(/const containerId = opts\.containerId \|\| 'terminalDock';/.test(bootstrapBody),
    'it binds to the EMBEDDED production container');
  assert(/doc\.getElementById\(containerId\)/.test(bootstrapBody), 'which it looks up rather than invents');
  assert(/return refuse\('dock-container-missing'\)/.test(bootstrapBody),
    'a missing container is a bounded refusal, never a silently-invented one');
  const verifyAt = bootstrapBody.indexOf('missingBrowserExports(win)');
  const lookupAt = bootstrapBody.indexOf('doc.getElementById(containerId)');
  assert(verifyAt > -1 && lookupAt > verifyAt,
    'exports are verified BEFORE the container is even resolved');
  assert(/while \(container\.firstChild\) container\.removeChild\(container\.firstChild\)/.test(bootstrapBody),
    'a refusal strips anything a partial activation appended to the container');
  assert(/catch \{[\s\S]{0,120}?refuse\('activation-threw'\)/.test(bootstrapBody),
    'activation is wrapped in an error boundary that refuses with a bounded code');
  assert(/instance\.ok !== true/.test(bootstrapBody),
    'an activation that returns a falsy/ok:false result is treated as a failure');
  assert(/return \{ ok: true, instance \};/.test(bootstrapBody),
    'the instance is RETURNED, not published on a mutable window global');
  assert(!/window\.ccDockviewPrototypeInstance|win\.ccDockviewPrototypeInstance/.test(adapterCode),
    'NEGATIVE CONTROL: the prototype instance global the close path read as an authority is gone');

  // (d) No refusal may echo an exception, path, or state.
  assert(!/e\.message|err\.message|String\(e\)/.test(bootstrapBody),
    'bootstrap() never echoes an exception message');
  assert(!/e\.message|err\.message/.test(appCode.slice(appCode.indexOf('async function startLayoutEngine'))),
    'the app.js starter never echoes an exception message either');

  // (e) app.js must verify the exports itself rather than trusting script onload.
  assert(/typeof engine\.bootstrap !== 'function'/.test(appCode),
    'app.js verifies the adapter actually published bootstrap()');
  assert(/missingBrowserExports\(window\)/.test(appCode),
    'app.js verifies every required browser export before starting');
  const appBootBody = appCode.slice(appCode.indexOf('async function startLayoutEngine'),
    appCode.indexOf('function buildDockviewHost'));
  assert(!/createElement\('div'\)/.test(appBootBody),
    'app.js creates no layout container of its own — index.html owns it and bootstrap() fills it');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe launch scripts are exact\n');
// ---------------------------------------------------------------------------
{
  assert(pkg.scripts.start === 'electron .', 'npm start is the PRODUCTION launch — no flag, and it gets Dockview');
  assert(pkg.scripts['start:classic'] === 'electron . --classic-layout',
    'npm run start:classic is the exact recovery launch');
  assert(pkg.scripts['dockview:tripwire'] === 'electron dockview-tripwire.js',
    'the Dockview-only network tripwire has its own script');
  assert(!('prototype:dockview' in pkg.scripts),
    'NEGATIVE CONTROL: the prototype opt-in script is gone');
  assert(pkg.dependencies.dockview === '7.0.4',
    'dockview is pinned to the exact reviewed version, with no range operator');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe four Dockview scripts are reachable ONLY through the gated list\n');
// ---------------------------------------------------------------------------
{
  const FIVE = ['dockview/dist/dockview.js', 'dockview-fit-policy.js', 'dockview-panel-policy.js', 'dockview-layout-policy.js', 'dockview-prototype.js'];
  for (const script of FIVE) {
    assert(!indexSrc.includes(script), `index.html never references ${script}`);
    assert(appSrc.includes(script), `${script} is reachable only via the gated DOCKVIEW_SCRIPTS list`);
  }
  for (const global of ['ccDockviewPrototype', 'ccDockviewFitPolicy', 'ccDockviewPanelPolicy', 'ccDockviewLayoutPolicy']) {
    assert(!indexSrc.includes(global), `index.html exposes no ${global}`);
  }
  const listMatch = /const DOCKVIEW_SCRIPTS = \[([\s\S]*?)\];/.exec(appSrc);
  assert(!!listMatch, 'the gated script list is present');
  const listed = (listMatch ? listMatch[1] : '').match(/'([^']+)'/g) || [];
  assert(listed.length === 5, `exactly five scripts are gated behind the layout decision (saw ${listed.length})`);
  assert(/dockview\/dist\/dockview\.js/.test(listed[0]), 'the vendor bundle loads first');
  assert(/dockview-layout-policy\.js/.test(listed[3]),
    'the SHARED layout policy loads before the adapter, which depends on it');
  assert(/dockview-prototype\.js/.test(listed[4]),
    'and the adapter loads last, after all three policy modules');

  // Neither harness may become a way to load Dockview on the production path.
  for (const harness of ['dockview-bootstrap-harness', 'dockview-app-harness']) {
    assert(!indexSrc.includes(harness), `${harness} is not referenced by the production document`);
    assert(!mainSrc.includes(harness), `${harness} is not reachable from main.js — it is a standalone test entry point`);
  }
}

// ---------------------------------------------------------------------------
process.stdout.write(`\ndockview-default-path: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
