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
  // pinned at its pre-existing value, so the count stays usable as a regression control. And a
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
  assert(stripComments(appSrc).includes('cc.openExternal(uri)'),
    'app.js:427 (the WebLinks regex line) survives stripping of the real source');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nindex.html is untouched by the prototype\n');
// ---------------------------------------------------------------------------
{
  // R5 added ONE inert `id="libraryPane"` plus a comment explaining why, so a blanket "the word
  // dockview never appears" check would now fail on the comment alone. The guarantee that actually
  // matters is narrower and is asserted directly: index.html must LOAD nothing from Dockview and
  // must carry no Dockview markup. Comments cannot execute.
  const indexCode = indexSrc.replace(/<!--[\s\S]*?-->/g, '');
  assert(!/dockview/i.test(indexCode),
    'renderer/index.html contains NO executable/markup reference to dockview (comments excluded)');
  assert(!/<script[^>]*dockview/i.test(indexSrc), 'index.html loads no Dockview script');
  assert(!/<link[^>]*dockview/i.test(indexSrc), 'index.html loads no Dockview stylesheet');
  assert(!/class="[^"]*dockview/i.test(indexSrc), 'index.html carries no Dockview class');

  // R5 Library seam: the inert stable identity, and the pre-R5 selector as a negative control.
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
  // FAILS instead of silently passing. This was a literal NUL byte, which made Git classify this
  // whole JavaScript file as binary and reduced it to "Binary files ... differ" in the pinned
  // review artifact. A printable sentinel has the identical never-matches property, and the
  // assertion below PROVES that property rather than assuming it.
  // Also a fail-fast guard: if the sentinel ever DID occur in index.html the extraction below would
  // silently produce a wrong section, and the 15 control assertions would report meaningless
  // results. Aborting is correct; counting it as a pass would only dilute the total.
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
  const scriptTags = (indexSrc.match(/<script[^>]*src=/g) || []).length;
  assert(scriptTags === 21, `index.html still loads exactly its original 21 <script src> tags (found ${scriptTags})`);
  assert(!/dockview/i.test(read('renderer', 'styles.css').split('/* ---- Dockview prototype')[0]),
    'no dockview styling leaks into the pre-existing part of styles.css');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nR5: the docked-Library seam is correct by construction\n');
// ---------------------------------------------------------------------------
{
  const css = read('renderer', 'styles.css');
  // The docked Library must beat BOTH `.tabpane{display:none}` (0,1,0) and `.tabpane.active`
  // (0,2,0). The selector below is (0,3,0), so it wins without `!important`.
  assert(/\.dockview-prototype-pane-host > \.tabpane\[data-pane="library"\]\s*\{[^}]*display:\s*flex/.test(css),
    'styles.css forces the docked Library visible with a (0,3,0) selector');
  assert(/\.tabpane\s*\{[^}]*display:\s*none/.test(css), 'the default `.tabpane{display:none}` rule still exists to fight');
  // The rule can never match on the default path, because the host class exists only in prototype mode.
  assert(css.indexOf('.dockview-prototype-pane-host') > css.indexOf('.tabpane {'),
    'the prototype rules come after the defaults, so no default rule was reordered');

  const appCode = stripComments(appSrc);
  assert(/const LIBRARY_SELECTOR = '#libraryPane';/.test(appCode), 'app.js resolves the Library by its production id');
  assert(/document\.createComment\('dockview-prototype: Library home'\)/.test(appCode),
    'docking records the exact original position with a placeholder, not just a parent');
  // The held reference is LOAD-BEARING: the adapter detaches the pane before releasing it, so a
  // querySelector lookup at undock time returns null and the singleton would be stranded outside
  // the DOM forever. The real-Electron harness caught exactly that.
  assert(/let libraryDockedElement = null;/.test(appCode), 'app.js holds a reference to the docked element');
  assert(/const el = libraryDockedElement \|\| document\.querySelector\(LIBRARY_SELECTOR\);/.test(appCode),
    'undock prefers the HELD reference over a document lookup (the element is already detached)');
  assert(/placeholder\.parentNode\.insertBefore\(el, placeholder\)/.test(appCode),
    'undock returns the element to the placeholder position, not merely to the parent');
  assert(/placeholder\.parentNode\.removeChild\(placeholder\)/.test(appCode), 'the placeholder is cleaned up');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nR6: the audio-control seam is correct by construction\n');
// ---------------------------------------------------------------------------
{
  const CANONICAL_AUDIO_CONTROLS = [
    'audioBuild', 'sttStatus', 'sttMic', 'ttsStatus', 'ttsStop', 'ttsVoice', 'ttsSpeed',
  ];

  // --- index.html required NO production markup change: the existing element and IDs are the
  // authority, and the seam binds to the class that was already there.
  const audioOpenTags = indexSrc.match(/<div\s+class="tts-controls"[^>]*>/g) || [];
  assert(audioOpenTags.length === 1,
    `index.html has EXACTLY ONE .tts-controls surface (found ${audioOpenTags.length})`);
  for (const id of CANONICAL_AUDIO_CONTROLS) {
    assert(new RegExp(`id="${id}"`).test(indexSrc), `index.html still owns #${id}`);
  }
  // No prototype-only id, hook, or attribute was added to the audio surface — unlike the Library
  // seam, this one needed nothing, because `.tts-controls` was already a unique stable anchor.
  assert(!/tts-controls[^>]*id=/.test(indexSrc), 'the audio surface needed no prototype-only id');
  assert(!/dockview/i.test(audioOpenTags[0]), 'the audio surface carries no Dockview attribute');

  const css = read('renderer', 'styles.css');
  assert(/\.dockview-prototype-audio\s*\{[^}]*display:\s*flex/.test(css),
    'styles.css defines the prototype audio slot as a visible flex row');
  // The slot is a direct child of the root, a SIBLING of the surface — never inside a pane host, so
  // no pane arrangement can hide it.
  assert(!/\.dockview-prototype-pane-host[^{]*\.dockview-prototype-audio/.test(css),
    'the audio slot is never scoped inside a Dockview pane host');
  // It cannot match on the default path: the class exists only in the prototype root.
  assert(css.indexOf('.dockview-prototype-audio') > css.indexOf('/* ---- Dockview prototype'),
    'the audio rules live inside the fenced prototype block, so deleting the branch removes them');

  // --- the harness page copies these rules; pin the two together so they cannot drift ---------
  const harnessHtml = fs.readFileSync(path.join(__dirname, 'dockview-bootstrap-harness.html'), 'utf8');
  assert(/\.tts-controls\s*\{[^}]*display:\s*flex/.test(harnessHtml),
    'the harness page carries the real .tts-controls rule, so its reachability measurement is real');
  assert(/\.dockview-prototype-audio\s*\{[^}]*display:\s*flex/.test(harnessHtml),
    'and the real audio-slot rule');
  assert(/\.dockview-prototype-root\s*\{[^}]*position:\s*fixed/.test(harnessHtml)
    && /\.dockview-prototype-root\s*\{[^}]*z-index:\s*9000/.test(harnessHtml),
    'the harness reproduces the full-screen overlay — without it the negative control proves nothing');
  assert(/\.tts-controls\s*\{[^}]*display:\s*flex/.test(css),
    'production styles.css still carries the .tts-controls rule the harness copies');

  // --- app.js: placeholder + held reference, exactly as the Library seam does ------------------
  const appCode = stripComments(appSrc);
  assert(/const AUDIO_CONTROLS_SELECTOR = '\.tts-controls';/.test(appCode),
    'app.js resolves the audio surface by its existing production class');
  assert(/document\.createComment\('dockview-prototype: audio controls home'\)/.test(appCode),
    'docking records the exact original position with a placeholder, not just a parent');
  assert(/let audioDockedElement = null;/.test(appCode), 'app.js holds a reference to the docked element');
  assert(/const el = audioDockedElement \|\| document\.querySelector\(AUDIO_CONTROLS_SELECTOR\);/.test(appCode),
    'undock prefers the HELD reference over a document lookup');
  assert(/placeholder\.parentNode\.insertBefore\(el, placeholder\)/.test(appCode),
    'undock returns the element to the placeholder position, not merely to the parent');
  // The element is MOVED, never cloned: a clone would carry no STT/TTS handler at all.
  assert(!/cloneNode/.test(appCode), 'app.js never clones DOM for the prototype');
  assert(!/tts-controls[^\n]*innerHTML/.test(appCode), 'app.js never rebuilds the audio markup');

  // --- the whole seam is unreachable on the default path --------------------------------------
  // `buildDockviewHost` is only ever called from the prototype bootstrap, so if every call site of
  // the dock/undock helpers lives inside it, nothing on the default path can move the controls.
  // The anchor must survive comment stripping, so it is a real statement rather than a comment.
  const hostStart = appCode.indexOf('function buildDockviewHost(');
  const hostEnd = appCode.indexOf('async function boot()', hostStart);
  assert(hostStart > -1 && hostEnd > hostStart, 'buildDockviewHost is bounded by the boot function');
  const hostBody = appCode.slice(hostStart, hostEnd);
  // `\b` before `dock` is load-bearing: without it, `undockAudioControlsElement` also matches,
  // because `dockAudioControlsElement` is a literal substring of it.
  for (const fn of ['dockAudioControlsElement', 'undockAudioControlsElement', 'audioControlsCount']) {
    const rx = () => new RegExp(`\\b${fn}\\(\\)`, 'g');
    const total = (appCode.match(rx()) || []).length;
    const inHost = (hostBody.match(rx()) || []).length;
    // One declaration (outside the host) plus exactly one call site (inside it).
    assert(total === 2 && inHost === 1,
      `${fn} has exactly one call site, and it is inside the prototype host surface (${inHost} in host / ${total} total)`);
  }
  assert(!/\bdockAudioControlsElement\(\)/.test(appCode.slice(0, hostStart).replace(/function dockAudioControlsElement\(\)/, '')),
    'nothing before the prototype host surface docks the audio controls');

  // --- dictation destination locking is untouched by any of this ------------------------------
  // The lock keys off `activeTermId`, which is renderer state, not DOM position — so moving the
  // controls cannot redirect a transcript. Dockview focus keeps that state current, and the
  // finalized transcript still goes to the pane locked at recording START.
  assert(/focusPane: \(paneId\) => \{[\s\S]{0,160}activeTermId = paneId;/.test(hostBody),
    'Dockview focus changes continue to update activeTermId');
  assert(/sttDictationTargetId = activeTermId;/.test(appCode),
    'the dictation destination is still locked to the pane focused at recording start');
  assert(/const targetId = sttDictationTargetId;[\s\S]{0,120}sttDictationTargetId = null;/.test(appCode),
    'the finalized transcript still resolves against the LOCKED target, not the current pane');
  assert(/window\.ccSttTargetLock\.resolveTranscriptDelivery/.test(appCode),
    'delivery still goes through the existing target-lock policy module');
  // No second Dictate/TTS implementation, no proxy, no synthesized click anywhere in the seam.
  // Bounded to the seam itself — from its first declaration to the next unrelated section — so the
  // app's OWN setupSTTControls/setupTTSControls (which legitimately use ccSTT/ccTTS) are excluded.
  const seamStart = appCode.indexOf('const AUDIO_CONTROLS_SELECTOR');
  const seamEnd = appCode.indexOf('function loadScriptOnce(', seamStart);
  assert(seamStart > -1 && seamEnd > seamStart, 'the audio seam is a bounded, self-contained block');
  const protoSeam = appCode.slice(seamStart, seamEnd);
  for (const forbidden of ['ccSTT', 'ccTTS', 'getUserMedia', 'MediaRecorder', '.click()', 'dispatchEvent']) {
    assert(!protoSeam.includes(forbidden),
      `the audio seam never touches ${forbidden} — it moves the element and nothing else`);
  }
  const adapterAll = stripComments(read('renderer', 'dockview-prototype.js'));
  for (const forbidden of ['ccSTT', 'ccTTS', 'sttMic', 'ttsStop', 'ttsVoice', 'ttsSpeed', 'getUserMedia', 'dispatchEvent']) {
    assert(!adapterAll.includes(forbidden),
      `the adapter never references ${forbidden} — it only borrows an opaque element`);
  }

  // --- the adapter attaches the controls LAST, after every risky step has succeeded ------------
  const adapterCode = stripComments(read('renderer', 'dockview-prototype.js'));
  const preflightAt = adapterCode.indexOf('audioControlsCount');
  const createAt = adapterCode.indexOf('dockview.createDockview(');
  const dockAt = adapterCode.indexOf('host.dockAudioControls()');
  const activeLogAt = adapterCode.indexOf('ACTIVE — layout only');
  assert(preflightAt > -1 && createAt > -1 && dockAt > -1 && activeLogAt > -1, 'all four anchors exist');
  assert(preflightAt < createAt,
    'the audio preflight runs BEFORE Dockview is created — a refusal builds and moves nothing');
  assert(adapterCode.indexOf('container.appendChild(banner)') > preflightAt,
    'the preflight runs before ANY DOM mutation');
  assert(dockAt > createAt,
    'the controls are attached only AFTER createDockview succeeded');
  assert(dockAt < activeLogAt, 'and the attach is the final activation step');
  assert(/audio-controls-dock-failed/.test(adapterCode), 'a failed attach has a bounded reason');
  assert(/audio-controls-missing/.test(adapterCode) && /audio-controls-duplicated/.test(adapterCode),
    'missing and duplicated surfaces have distinct bounded reasons');
  // The refusal path must give the controls back before the bootstrap deletes the root.
  const refuseStart = adapterCode.indexOf('const refuse = (reason) =>');
  const refuseBody = adapterCode.slice(refuseStart, adapterCode.indexOf('return { ok: false, reason };', refuseStart));
  assert(/undockAudioControls\(\)/.test(refuseBody),
    'bootstrap refusal returns the app-owned controls BEFORE removing the root');
  assert(refuseBody.indexOf('undockAudioControls') < refuseBody.indexOf('removeChild'),
    'and does so in that order — restore first, then remove the root');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nR5: layout-control semantics cannot silently create or destroy\n');
// ---------------------------------------------------------------------------
{
  const adapterCode = stripComments(read('renderer', 'dockview-prototype.js'));

  // Create Default Workspace preflights emptiness BEFORE creating the first terminal.
  const defaultStart = adapterCode.indexOf('async function useDefaultLayout()');
  const defaultBody = adapterCode.slice(defaultStart, adapterCode.indexOf('\n    }', defaultStart));
  assert(defaultStart > -1, 'the default-workspace creator exists');
  assert(defaultBody.indexOf('hostedPanes.size > 0') < defaultBody.indexOf('createTerminalPane'),
    'the emptiness preflight runs BEFORE any terminal is created — a refusal spawns zero PTYs');
  assert(/workspace-not-empty/.test(defaultBody), 'the refusal is a bounded, named reason');

  // Restore failure must never reach the default-workspace creator.
  const restoreStart = adapterCode.indexOf('async function restoreLayout()');
  const restoreBody = adapterCode.slice(restoreStart, adapterCode.indexOf('\n    async function', restoreStart + 10));
  assert(restoreStart > -1, 'the restore path exists');
  assert(!/useDefaultLayout\(\)/.test(restoreBody),
    'restore NEVER calls the default-workspace creator — a failed restore creates no terminal');

  // Clear Saved Layout must say live panes were untouched.
  assert(/Live panes were NOT changed/.test(adapterCode),
    'Clear Saved Layout states explicitly that live panes were unchanged');

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
}

// ---------------------------------------------------------------------------
process.stdout.write('\nR5: terminal IDs stay monotonic and are never reused\n');
// ---------------------------------------------------------------------------
{
  const appCode = stripComments(appSrc);
  assert(/let termSeq = 0;/.test(appCode), 'the terminal sequence starts at zero');
  assert(/'pty' \+ \(\+\+termSeq\)/.test(appCode), 'every terminal takes the NEXT sequence value');
  assert((appCode.match(/termSeq\s*=\s*0/g) || []).length === 1,
    'termSeq is initialised exactly once and never reset — "Terminal 17" means 17 created, not 17 live');
  assert(/liveTerminalCount: \(\) => terms\.size/.test(appCode),
    'a separate live counter exists so a monotonic label cannot be mistaken for a live count');
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
