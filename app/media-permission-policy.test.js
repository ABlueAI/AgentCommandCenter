'use strict';
// Run: node app/media-permission-policy.test.js
// Plain Node.js -- no framework (matches nav-guard.test.js). Covers the K8 media-permission
// boundary: media permission is granted ONLY when the current trusted window's main frame
// requests microphone-only access from the exact trusted entry document; everything else is
// denied fail-closed with a bounded visible refusal. The adapter tests exercise the ACTUAL
// exported handler pair main.js installs (not a reconstruction), so callback-exactly-once
// and logging behavior are proven on the production path.
//
// All paths here are SYNTHETIC (per the K8 corrections): trust must derive from the runtime
// ENTRY_URL, so nothing below may pin the worktree or main-checkout absolute path.

const {
  REASONS,
  TRUSTED_FILE_ORIGIN,
  fileEntryOrigin,
  isTrustedWebContents,
  decideMediaRequest,
  decideMediaCheck,
  createMediaPermissionHandlers,
} = require('./media-permission-policy');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// Synthetic trusted entry (demonstrates the pathToFileURL serialization shape without
// pinning any real checkout path). ORIGIN is Chromium's file:-origin serialization as
// observed on Electron 42.5.0.
const ENTRY = 'file:///X:/synthetic-checkout/app/renderer/index.html';
const ORIGIN = 'file:///';
const TRUST = Object.freeze({ entryUrl: ENTRY, entryOrigin: ORIGIN });

function fakeWindow() {
  const wc = { isDestroyed: () => false };
  const win = { isDestroyed: () => false, webContents: wc };
  return { win, wc };
}

// The exact facts Electron 42.5.0 reported for the real trusted microphone request
// (probed 2026-07-16), transplanted onto the synthetic entry.
const trustedRequestDetails = () => ({
  isMainFrame: true,
  requestingUrl: ENTRY,
  securityOrigin: ORIGIN,
  mediaTypes: ['audio'],
});
const trustedCheckDetails = () => ({
  isMainFrame: true,
  requestingUrl: ENTRY,
  securityOrigin: ORIGIN,
  mediaType: 'audio',
});

// --- fileEntryOrigin: trusted-origin derivation refuses non-file entries -------------------------
assert(fileEntryOrigin(ENTRY) === TRUSTED_FILE_ORIGIN && TRUSTED_FILE_ORIGIN === 'file:///',
  'fileEntryOrigin returns the observed Chromium file: origin serialization ("file:///")');
for (const bad of ['https://example.com/index.html', 'app/renderer/index.html', '', null, undefined, 42]) {
  let threw = false;
  try { fileEntryOrigin(bad); } catch { threw = true; }
  assert(threw, `fileEntryOrigin refuses (throws) for a non-file entry: ${JSON.stringify(bad)}`);
}

// --- isTrustedWebContents: exact current-window identity -----------------------------------------
{
  const { win, wc } = fakeWindow();
  assert(isTrustedWebContents(wc, win) === true, 'the current window\'s own webContents is trusted');
  assert(isTrustedWebContents({ isDestroyed: () => false }, win) === false, 'a WRONG WebContents (not the window\'s) is untrusted');
  assert(isTrustedWebContents(null, win) === false, 'a null WebContents is untrusted');
  assert(isTrustedWebContents(undefined, win) === false, 'a missing WebContents is untrusted');
  assert(isTrustedWebContents(wc, null) === false, 'no current window means nothing is trusted');
  assert(isTrustedWebContents({ isDestroyed: () => true }, win) === false, 'a DESTROYED WebContents is untrusted');
}
{
  const wc = { isDestroyed: () => false };
  const win = { isDestroyed: () => true, webContents: wc };
  assert(isTrustedWebContents(wc, win) === false, 'a destroyed window trusts nothing (stale window)');
}
assert(isTrustedWebContents({}, { isDestroyed: () => false, webContents: {} }) === false,
  'a WebContents without isDestroyed (malformed shape) is untrusted');
{
  const wc = { isDestroyed: () => { throw new Error('boom'); } };
  const win = { isDestroyed: () => false, webContents: wc };
  assert(isTrustedWebContents(wc, win) === false, 'a throwing isDestroyed reads as untrusted (fail closed)');
}

// --- decideMediaRequest: the ONLY allow shape -----------------------------------------------------
{
  const d = decideMediaRequest({ permission: 'media', trustedWc: true, details: trustedRequestDetails() }, TRUST);
  assert(d.allow === true && d.reason === null,
    'ALLOWED: trusted window + entry document + main frame + media + mediaTypes [\'audio\']');
}

// Permission gate: every non-media permission in Electron 42's request union, plus the
// legacy 'audioCapture' name (not in the union; its broad allowance is removed).
for (const perm of ['clipboard-read', 'clipboard-sanitized-write', 'display-capture', 'fullscreen',
  'geolocation', 'idle-detection', 'mediaKeySystem', 'midi', 'midiSysex', 'notifications',
  'pointerLock', 'keyboardLock', 'openExternal', 'speaker-selection', 'storage-access',
  'top-level-storage-access', 'window-management', 'unknown', 'fileSystem', 'audioCapture']) {
  const d = decideMediaRequest({ permission: perm, trustedWc: true, details: trustedRequestDetails() }, TRUST);
  assert(d.allow === false && d.reason === REASONS.NOT_MEDIA_PERMISSION, `request denied: permission '${perm}' is not 'media'`);
}

// Media-shape gate: audio-only proof.
const shapeCases = [
  [['video'], REASONS.VIDEO_REQUESTED, 'camera-only request'],
  [['audio', 'video'], REASONS.VIDEO_REQUESTED, 'mixed audio/video request'],
  [['video', 'audio'], REASONS.VIDEO_REQUESTED, 'reversed mixed request'],
  [[], REASONS.MEDIA_TYPES_EMPTY, 'empty mediaTypes array'],
  [undefined, REASONS.MEDIA_TYPES_MISSING, 'missing mediaTypes'],
  [null, REASONS.MEDIA_TYPES_MISSING, 'null mediaTypes'],
  ['audio', REASONS.MEDIA_TYPES_MISSING, 'mediaTypes as a bare string (malformed)'],
  [['screen'], REASONS.UNKNOWN_MEDIA_TYPE, 'unknown media type'],
  [['audio', 'audio'], REASONS.NOT_AUDIO_ONLY, 'extra entries beyond exactly one'],
  [['AUDIO'], REASONS.UNKNOWN_MEDIA_TYPE, 'case-mangled media type is not audio'],
];
for (const [types, want, label] of shapeCases) {
  const details = trustedRequestDetails();
  details.mediaTypes = types;
  const d = decideMediaRequest({ permission: 'media', trustedWc: true, details }, TRUST);
  assert(d.allow === false && d.reason === want, `request denied: ${label}`);
}

// Requester gate on the request path.
{
  const d = decideMediaRequest({ permission: 'media', trustedWc: false, details: trustedRequestDetails() }, TRUST);
  assert(d.allow === false && d.reason === REASONS.UNTRUSTED_WEBCONTENTS, 'request denied: untrusted WebContents');
}
{
  const details = trustedRequestDetails(); details.isMainFrame = false;
  const d = decideMediaRequest({ permission: 'media', trustedWc: true, details }, TRUST);
  assert(d.allow === false && d.reason === REASONS.NOT_MAIN_FRAME, 'request denied: subframe');
}
{
  const details = trustedRequestDetails(); delete details.isMainFrame;
  const d = decideMediaRequest({ permission: 'media', trustedWc: true, details }, TRUST);
  assert(d.allow === false && d.reason === REASONS.NOT_MAIN_FRAME, 'request denied: MISSING isMainFrame (no default-open)');
}
for (const [url, label] of [
  ['https://evil.example/index.html', 'foreign https document'],
  ['file:///X:/synthetic-checkout/app/renderer/other.html', 'same file: scheme, DIFFERENT file'],
  ['file:///x:/synthetic-checkout/app/renderer/index.html', 'drive-letter case difference (exact match required)'],
  ['', 'empty requestingUrl (Chromium load-time shape)'],
  [undefined, 'missing requestingUrl'],
  [42, 'non-string requestingUrl (malformed)'],
]) {
  const details = trustedRequestDetails(); details.requestingUrl = url;
  const d = decideMediaRequest({ permission: 'media', trustedWc: true, details }, TRUST);
  assert(d.allow === false && d.reason === REASONS.UNTRUSTED_DOCUMENT, `request denied: ${label}`);
}
for (const [origin, label] of [
  ['https://evil.example', 'foreign securityOrigin'],
  ['file://', 'near-miss origin serialization ("file://")'],
  [ENTRY, 'entry URL where the origin belongs (mismatch)'],
  [undefined, 'MISSING securityOrigin'],
  ['', 'empty securityOrigin'],
]) {
  const details = trustedRequestDetails(); details.securityOrigin = origin;
  const d = decideMediaRequest({ permission: 'media', trustedWc: true, details }, TRUST);
  assert(d.allow === false && d.reason === REASONS.ORIGIN_MISMATCH, `request denied: ${label}`);
}
{
  const d = decideMediaRequest({ permission: 'media', trustedWc: true, details: undefined }, TRUST);
  assert(d.allow === false && d.reason === REASONS.MISSING_DETAILS, 'request denied: missing details object entirely');
}

// --- decideMediaCheck: mirrors the requester gate, audio-only via mediaType ----------------------
{
  const d = decideMediaCheck({ permission: 'media', trustedWc: true, requestingOrigin: ORIGIN, details: trustedCheckDetails() }, TRUST);
  assert(d.allow === true && d.reason === null, 'ALLOWED check: trusted requester + requestingOrigin + securityOrigin + mediaType audio');
}
{
  const details = trustedCheckDetails(); details.embeddingOrigin = ORIGIN;
  const d = decideMediaCheck({ permission: 'media', trustedWc: true, requestingOrigin: ORIGIN, details }, TRUST);
  assert(d.allow === true, 'ALLOWED check: self embeddingOrigin (trusted origin) — observed main-frame shape');
}
{
  const details = trustedCheckDetails(); details.embeddingOrigin = ENTRY;
  const d = decideMediaCheck({ permission: 'media', trustedWc: true, requestingOrigin: ORIGIN, details }, TRUST);
  assert(d.allow === true, 'ALLOWED check: self embeddingOrigin (entry URL form) — observed load-time shape');
}
{
  const details = trustedCheckDetails(); details.embeddingOrigin = 'https://evil.example';
  const d = decideMediaCheck({ permission: 'media', trustedWc: true, requestingOrigin: ORIGIN, details }, TRUST);
  assert(d.allow === false && d.reason === REASONS.EMBEDDER_MISMATCH, 'check denied: FOREIGN embeddingOrigin (embedded frame)');
}
for (const [kind, want, label] of [
  ['video', REASONS.VIDEO_REQUESTED, 'camera check'],
  ['unknown', REASONS.UNKNOWN_MEDIA_TYPE, 'unknown media type check'],
  [undefined, REASONS.MEDIA_TYPE_MISSING, 'missing mediaType (permissions.query shape — fail closed)'],
  ['', REASONS.MEDIA_TYPE_MISSING, 'empty mediaType'],
  ['screen', REASONS.UNKNOWN_MEDIA_TYPE, 'unrecognized mediaType value'],
]) {
  const details = trustedCheckDetails(); details.mediaType = kind;
  const d = decideMediaCheck({ permission: 'media', trustedWc: true, requestingOrigin: ORIGIN, details }, TRUST);
  assert(d.allow === false && d.reason === want, `check denied: ${label}`);
}
for (const [ro, label] of [
  ['', 'empty requestingOrigin (Chromium load-time automatic check)'],
  ['https://evil.example', 'foreign requestingOrigin'],
  [undefined, 'missing requestingOrigin'],
]) {
  const d = decideMediaCheck({ permission: 'media', trustedWc: true, requestingOrigin: ro, details: trustedCheckDetails() }, TRUST);
  assert(d.allow === false && d.reason === REASONS.ORIGIN_MISMATCH, `check denied: ${label}`);
}
{
  const details = trustedCheckDetails(); delete details.securityOrigin;
  const d = decideMediaCheck({ permission: 'media', trustedWc: true, requestingOrigin: ORIGIN, details }, TRUST);
  assert(d.allow === false && d.reason === REASONS.SECURITY_ORIGIN_MISMATCH, 'check denied: securityOrigin ABSENT (observed post-grant shape — fail closed)');
}
{
  const d = decideMediaCheck({ permission: 'geolocation', trustedWc: true, requestingOrigin: ORIGIN, details: trustedCheckDetails() }, TRUST);
  assert(d.allow === false && d.reason === REASONS.NOT_MEDIA_PERMISSION, 'check denied: non-media permission (geolocation)');
}

// --- request and check CANNOT disagree on the same security facts --------------------------------
// Any requester-level defect must produce the identical denial reason from both deciders.
for (const [mutate, label] of [
  [(f) => { f.trustedWc = false; }, 'untrusted WebContents'],
  [(f) => { f.details.isMainFrame = false; }, 'subframe'],
  [(f) => { f.details.requestingUrl = 'file:///X:/other.html'; }, 'foreign document'],
  [(f) => { delete f.details.requestingUrl; }, 'missing requestingUrl'],
]) {
  const reqFacts = { permission: 'media', trustedWc: true, details: trustedRequestDetails() };
  const chkFacts = { permission: 'media', trustedWc: true, requestingOrigin: ORIGIN, details: trustedCheckDetails() };
  mutate(reqFacts); mutate(chkFacts);
  const dr = decideMediaRequest(reqFacts, TRUST);
  const dc = decideMediaCheck(chkFacts, TRUST);
  assert(dr.allow === false && dc.allow === false && dr.reason === dc.reason,
    `request and check agree (same denial reason) on: ${label}`);
}

// --- the PRODUCTION adapter pair (what main.js installs) ------------------------------------------
function makeHandlers(overrides = {}) {
  const { win, wc } = fakeWindow();
  const logs = [];
  const handlers = createMediaPermissionHandlers({
    entryUrl: ENTRY,
    getTrustedWindow: () => win,
    logRefusal: (line) => logs.push(line),
    ...overrides,
  });
  return { handlers, win, wc, logs };
}

assert((() => { // policy setup itself refuses a non-file entry (fail closed at startup)
  try { createMediaPermissionHandlers({ entryUrl: 'https://evil.example/', getTrustedWindow: () => null, logRefusal: () => {} }); return false; }
  catch { return true; }
})(), 'createMediaPermissionHandlers throws on a non-file entry URL');

{ // allow path: callback exactly once, true, and NO log line
  const { handlers, wc, logs } = makeHandlers();
  const calls = [];
  handlers.handlePermissionRequest(wc, 'media', (ok) => calls.push(ok), trustedRequestDetails());
  assert(calls.length === 1 && calls[0] === true, 'ALLOW: request callback invoked exactly once with true');
  assert(logs.length === 0, 'ALLOW: no refusal line is logged');
}
{ // deny path: callback exactly once, false, one bounded log line
  const { handlers, wc, logs } = makeHandlers();
  const calls = [];
  const details = trustedRequestDetails(); details.mediaTypes = ['video'];
  handlers.handlePermissionRequest(wc, 'media', (ok) => calls.push(ok), details);
  assert(calls.length === 1 && calls[0] === false, 'DENY: request callback invoked exactly once with false');
  assert(logs.length === 1 && logs[0] === '[audio-permission] denied request: video-requested',
    'DENY: exactly one bounded refusal line with the reason constant');
}
{ // a policy-internal throw still answers the callback exactly once, denying
  const { handlers, wc, logs } = makeHandlers();
  const calls = [];
  const poison = new Proxy({}, { get() { throw new Error('SECRET c:\\users\\someone\\file'); } });
  handlers.handlePermissionRequest(wc, 'media', (ok) => calls.push(ok), poison);
  assert(calls.length === 1 && calls[0] === false, 'THROW: callback still invoked exactly once, denying');
  assert(logs.length === 1 && logs[0] === '[audio-permission] denied request: policy-error',
    'THROW: refusal is visible as policy-error and leaks NO exception text');
}
{ // a throwing logger must not break the grant/deny answer
  const { wc, win } = (() => { const f = fakeWindow(); return f; })();
  const handlers = createMediaPermissionHandlers({
    entryUrl: ENTRY, getTrustedWindow: () => win,
    logRefusal: () => { throw new Error('logger down'); },
  });
  const calls = [];
  const details = trustedRequestDetails(); details.mediaTypes = ['video'];
  handlers.handlePermissionRequest(wc, 'media', (ok) => calls.push(ok), details);
  assert(calls.length === 1 && calls[0] === false, 'a throwing logger still yields exactly one deny callback');
}
{ // wrong / null / destroyed WebContents through the real adapter
  const { handlers, logs } = makeHandlers();
  const calls = [];
  handlers.handlePermissionRequest({ isDestroyed: () => false }, 'media', (ok) => calls.push(ok), trustedRequestDetails());
  handlers.handlePermissionRequest(null, 'media', (ok) => calls.push(ok), trustedRequestDetails());
  handlers.handlePermissionRequest({ isDestroyed: () => true }, 'media', (ok) => calls.push(ok), trustedRequestDetails());
  assert(calls.length === 3 && calls.every((c) => c === false), 'adapter denies wrong, null, and destroyed WebContents');
  assert(logs.every((l) => l === '[audio-permission] denied request: untrusted-webcontents'), 'each denial logs the untrusted-webcontents reason');
}
{ // stale window: the window was destroyed after launch
  const wc = { isDestroyed: () => false };
  const win = { isDestroyed: () => true, webContents: wc };
  const logs = [];
  const handlers = createMediaPermissionHandlers({ entryUrl: ENTRY, getTrustedWindow: () => win, logRefusal: (l) => logs.push(l) });
  const calls = [];
  handlers.handlePermissionRequest(wc, 'media', (ok) => calls.push(ok), trustedRequestDetails());
  assert(calls.length === 1 && calls[0] === false, 'adapter denies when the trusted window is destroyed (stale)');
}
{ // check adapter: strict booleans + first-occurrence-per-signature refusal logging
  const { handlers, wc, logs } = makeHandlers();
  assert(handlers.handlePermissionCheck(wc, 'media', ORIGIN, trustedCheckDetails()) === true, 'check adapter returns literal true for the trusted audio check');
  assert(logs.length === 0, 'an allowed check logs nothing');
  const videoCheck = () => { const d = trustedCheckDetails(); d.mediaType = 'video'; return d; };
  assert(handlers.handlePermissionCheck(wc, 'media', ORIGIN, videoCheck()) === false, 'check adapter returns literal false for a camera check');
  assert(logs.length === 1 && logs[0] === '[audio-permission] denied check: video-requested (video)',
    'first camera-check denial logs one bounded line');
  handlers.handlePermissionCheck(wc, 'media', ORIGIN, videoCheck());
  handlers.handlePermissionCheck(wc, 'media', ORIGIN, videoCheck());
  assert(logs.length === 1, 'repeated identical check denials are latched (observed load-time flood stays out of Logs)');
  const unknownCheck = () => { const d = trustedCheckDetails(); d.mediaType = 'unknown'; return d; };
  handlers.handlePermissionCheck(wc, 'media', ORIGIN, unknownCheck());
  assert(logs.length === 2 && logs[1] === '[audio-permission] denied check: unknown-media-type (unknown)',
    'a DIFFERENT refusal signature still logs (latch is per reason+kind, not global)');
}
{ // request denials are NOT latched: every real denied access attempt stays visible
  const { handlers, wc, logs } = makeHandlers();
  const details = () => { const d = trustedRequestDetails(); d.mediaTypes = ['video']; return d; };
  handlers.handlePermissionRequest(wc, 'media', () => {}, details());
  handlers.handlePermissionRequest(wc, 'media', () => {}, details());
  assert(logs.length === 2, 'two denied camera REQUESTS produce two log lines (no request-side dedup)');
}
{ // Logs hygiene: nothing attacker-controlled reaches the refusal line
  const { handlers, wc, logs } = makeHandlers();
  const details = trustedRequestDetails();
  details.requestingUrl = 'file:///C:/Users/someone/TRANSCRIPT super secret.html';
  handlers.handlePermissionRequest(wc, 'media', () => {}, details);
  const line = logs[0];
  assert(typeof line === 'string' && !line.includes('C:/Users') && !line.includes('secret') && !line.includes('file:///'),
    'refusal line contains no URL, path, or content fragment');
  assert(line.length < 80 && /^[\x20-\x7e]+$/.test(line), 'refusal line is short and printable-ASCII only');
  const known = new Set(Object.values(REASONS));
  assert(known.has(line.replace('[audio-permission] denied request: ', '')), 'refusal line carries only a known reason constant');
}

// --- wiring tripwire: main.js installs BOTH handlers from this shared policy ---------------------
// Static source check (main.js cannot be require()d outside Electron): both session handlers
// must come from the one policy pair, and the legacy broad 'audioCapture' allowance must be gone.
{
  const mainSrc = require('fs').readFileSync(require('path').join(__dirname, 'main.js'), 'utf8').replace(/\r\n/g, '\n');
  assert(mainSrc.includes('setPermissionRequestHandler(mediaPermission.handlePermissionRequest)'),
    'main.js installs the shared policy\'s REQUEST handler');
  assert(mainSrc.includes('setPermissionCheckHandler(mediaPermission.handlePermissionCheck)'),
    'main.js installs the shared policy\'s CHECK handler');
  assert(!mainSrc.includes('audioCapture'), 'the legacy broad audioCapture allowance is removed from main.js');
  assert(mainSrc.includes('win.loadFile(ENTRY_PATH)') && mainSrc.includes('createMediaPermissionHandlers({\n    entryUrl: ENTRY_URL,'),
    'loadFile and the permission policy share the ONE canonical entry definition');
}

// --- wiring facts: MIC_CONSTRAINTS still requests audio with video:false (async ESM import) ------
(async () => {
  const { MIC_CONSTRAINTS } = await import('./renderer/stt-audio-quality.js');
  assert(MIC_CONSTRAINTS.video === false && !!MIC_CONSTRAINTS.audio,
    'renderer MIC_CONSTRAINTS still requests audio-only (video: false) — matches the allowed shape');
  process.stdout.write(`\nmedia-permission-policy: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
