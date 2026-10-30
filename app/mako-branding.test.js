'use strict';
// Run: node app/mako-branding.test.js
//
// Visible-branding contract. Mako is the product-facing name; command-center and BLUE_HELM_*
// remain compatibility identities. This suite intentionally checks named presentation surfaces
// instead of banning historical/internal wording throughout the repository.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  \u2713 ${label}\n`); passed++; }
  else { process.stderr.write(`  x FAIL: ${label}\n`); failed++; }
}
function read(...parts) { return fs.readFileSync(path.join(__dirname, ...parts), 'utf8'); }
function count(text, needle) { return text.split(needle).length - 1; }

const main = read('main.js');
const pkg = JSON.parse(read('package.json'));
const html = read('renderer', 'index.html');
const renderer = read('renderer', 'app.js');
const admission = read('renderer', 'admission-view.js');
const badge = read('renderer', 'pane-status-badge.js');
const hook = read('..', 'scripts', 'hooks', 'fence-write.js');
const appReadme = read('README.md');
const install = read('..', 'docs', 'INSTALL-WINDOWS.md');

assert(main.includes("title: 'Mako'"), 'the initial BrowserWindow title is Mako');
assert(html.includes('<title>Mako</title>'), 'the static document title is Mako');
assert(html.includes('class="brand" role="img" aria-label="Mako"'),
  'the top-bar artwork has one accessible Mako name');
const brand = html.match(/<div class="brand"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
assert(/src="assets\/mako-mark.svg"[\s\S]*src="assets\/mako-wordmark.svg"/.test(brand),
  'the local shark precedes the local outlined wordmark');
assert((brand.match(/alt=""/g) || []).length === 2 && !brand.includes('\u2693'),
  'the old anchor is removed and decorative images do not duplicate the accessible name');
assert(main.includes("icon: path.join(__dirname, 'assets', 'mako.ico')"),
  'the window icon is the fixed local ICO, independent of the working directory');

const css = read('renderer', 'styles.css');
assert(/\.brand\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*flex:\s*0 0 auto;/.test(css),
  'the brand remains an aligned, non-shrinking horizontal lockup');
assert(/\.brand-mark\s*\{[^}]*width:\s*40px;[^}]*height:\s*40px;/.test(css) &&
  /\.brand-wordmark\s*\{[^}]*width:\s*110px;[^}]*height:\s*20px;[^}]*object-fit:\s*contain;/.test(css),
  'header asset dimensions are bounded without distorting the artwork');

const mark = read('renderer', 'assets', 'mako-mark.svg');
const wordmark = read('renderer', 'assets', 'mako-wordmark.svg');
const allowedTags = new Set(['svg', 'title', 'defs', 'linearGradient', 'stop', 'rect', 'g', 'path']);
for (const [name, svg] of [['mark', mark], ['wordmark', wordmark]]) {
  const body = svg.replace(/<!--[\s\S]*?-->/g, '');
  const tags = [...body.matchAll(/<\/?([\w:-]+)/g)].map(match => match[1]);
  assert(tags.every(tag => allowedTags.has(tag)), `${name}: only static vector elements`);
  assert(!/\b(?:href|src|style|on\w+)\s*=|<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(body),
    `${name}: no external content, event handlers, stylesheet, or entity expansion`);
  assert(!/<(?:text|image|script|foreignObject)\b|@font-face|data:/i.test(body),
    `${name}: no embedded raster, font dependency, or executable content`);
  assert(svg.length < 10000 && svg.includes('<title>Mako'), `${name}: small, named local artwork`);
}
assert(mark.includes('viewBox="0 0 1024 1024"') &&
  /<rect[^>]*width="1024"[^>]*height="1024"[^>]*fill="#000"/.test(mark),
  'the app mark includes its own black square background');
const silhouette = mark.match(/fill="url\(#navy\)" d="([^"]+)"/)?.[1] || '';
const points = (silhouette.match(/\d+/g) || []).map(Number);
const pairs = Array.from({length: points.length / 2}, (_, i) => [points[i * 2], points[i * 2 + 1]]);
assert(pairs.length > 10 && pairs.every(([x, y]) => pairs.some(([mx, my]) => mx === 938 - x && my === y)),
  'the shark silhouette is exactly mirrored about its centerline');
// S21 B2 (Blue, 2026-10-28): the white "M" itself is drawn bolder, one filled shape with sharp corners.
const whiteShape = mark.match(/<path fill="#fff" d="([^"]+)"\/>/)?.[1] || '';
const whitePoints = (whiteShape.match(/\d+(?:\.\d+)?/g) || []).map(Number);
const whitePairs = Array.from({length: whitePoints.length / 2}, (_, i) => [whitePoints[i * 2], whitePoints[i * 2 + 1]]);
assert(count(mark, 'stroke') === 0 && count(mark, '<path fill="#fff"') === 1,
  'B2: one filled white shape, no strokes (no rounded joins or overlays)');
assert(whitePairs.length === 14 && whitePairs.every(([x, y]) => whitePairs.some(([mx, my]) => Math.abs(mx - (938 - x)) < 1e-6 && my === y)),
  'B2: the white M is mirrored about the centerline');
assert(whitePairs.some(([x, y]) => x === 55 && y === 527) && whitePairs.some(([x, y]) => x === 883 && y === 527),
  'B2: the white fin tips stay where they were');

// These outlined glyphs deliberately use only absolute M/L/H/Q/Z commands.
// Check the geometry, not merely a comment claiming that the k has no descender.
function pathYCoordinates(data) {
  const tokens = data.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g) || [];
  const ys = [];
  let i = 0;
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === 'M' || command === 'L') {
      i++; ys.push(Number(tokens[i++]));
      while (i < tokens.length && !/^[A-Za-z]$/.test(tokens[i])) {
        i++; ys.push(Number(tokens[i++]));
      }
    } else if (command === 'Q') {
      i++; ys.push(Number(tokens[i++])); i++; ys.push(Number(tokens[i++]));
    } else if (command === 'H') { i++; }
    else if (command !== 'Z') { throw new Error(`Unexpected glyph path command: ${command}`); }
  }
  return ys;
}
for (const letter of ['m', 'a', 'k', 'o']) {
  const data = wordmark.match(new RegExp(`id="letter-${letter}" d="([^"]+)"`))?.[1] || '';
  const ys = pathYCoordinates(data);
  assert(ys.length > 0 && ys.every(Number.isFinite) && Math.max(...ys) === 194,
    `${letter}: shared baseline 194, including every curve control point (no descending k leg)`);
  if (letter === 'a' || letter === 'o') {
    assert(Math.min(...ys) === 59, `${letter}: lowercase x-height 59`);
  }
}

const ico = fs.readFileSync(path.join(__dirname, 'assets', 'mako.ico'));
const iconSizes = [16, 24, 32, 48, 64, 128, 256];
assert(ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) === iconSizes.length,
  'the Windows ICO has the expected header and seven resolutions');
let iconEnd = 6 + iconSizes.length * 16;
for (let i = 0; i < iconSizes.length; i++) {
  const pos = 6 + i * 16;
  const size = iconSizes[i];
  const bytes = ico.readUInt32LE(pos + 8);
  const start = ico.readUInt32LE(pos + 12);
  const png = ico.subarray(start, start + bytes);
  assert((ico[pos] || 256) === size && (ico[pos + 1] || 256) === size &&
    ico.readUInt16LE(pos + 4) === 1 && ico.readUInt16LE(pos + 6) === 32 &&
    start === iconEnd && png.length === bytes && png.length > 32 &&
    png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    png.readUInt32BE(16) === size && png.readUInt32BE(20) === size,
    `ICO ${size}px: contiguous valid PNG frame with matching dimensions`);
  iconEnd = start + bytes;
}
assert(iconEnd === ico.length, 'the ICO has no trailing payload');
assert(crypto.createHash('sha256').update(ico).digest('hex') ===
  'baa99e545ce11bc5901ad882cda250739490b66004b5a32e876ba6a9ff11baa9',
  'the approved Mako ICO bytes are unchanged (binary, identical in every checkout)');
assert(count(main, "icon: path.join(__dirname, 'assets', 'mako.ico')") === 1,
  'the one BrowserWindow still receives the Mako ICO');

// Windows taskbar identity: one explicit AppUserModelID, set at module startup. The taskbar showed
// the shared electron.exe atom until the process declared its own identity before any window.
// S07: the ID now comes from the instance profile, ABlueAI.Mako for the stable copy (unchanged) and
// its own ID for the dev copy (instance-profile.test.js covers the selection).
const instanceProfiles = require('./instance-profile').PROFILES;
const aumidDecl = 'const MAKO_APP_USER_MODEL_ID = instanceProfile.appUserModelId;';
const aumidCall = "if (process.platform === 'win32') app.setAppUserModelId(MAKO_APP_USER_MODEL_ID);";
assert(count(main, aumidDecl) === 1 && count(main, 'MAKO_APP_USER_MODEL_ID =') === 1 &&
  instanceProfiles.stable.appUserModelId === 'ABlueAI.Mako' && instanceProfiles.dev.appUserModelId !== 'ABlueAI.Mako',
  'the Windows AppUserModelID is declared exactly once, ABlueAI.Mako for the stable copy and another for dev');
assert(count(main, 'setAppUserModelId(') === 1 && count(main, aumidCall) === 1,
  'exactly one setAppUserModelId call, under one win32 guard, passes that constant');
assert(/^if \(process\.platform === 'win32'\) app\.setAppUserModelId\(MAKO_APP_USER_MODEL_ID\);\r?$/m.test(main),
  'the call is an unindented module-scope statement, evaluated during startup');
const aumidAt = main.indexOf(aumidCall);
assert(aumidAt > main.indexOf(aumidDecl) && main.indexOf(aumidDecl) > -1,
  'the constant is declared before it is used');
for (const later of ['app.whenReady().then(', 'function createWindow(', 'new BrowserWindow(']) {
  assert(aumidAt > -1 && main.indexOf(later) > aumidAt, `the identity is set before the first ${later}`);
}
assert(!/setAppDetails|app\.setName\(|typeof app\.setAppUserModelId/.test(main),
  'no window app details, app rename, or method-existence skip accompanies the identity');
assert(!Object.prototype.hasOwnProperty.call(pkg, 'productName'),
  'package metadata adds no productName, so the userData identity stays command-center');
// 2026-10-16: the static acceptance marker became the real build label from build-info.js, which
// always begins with the product name.
assert(renderer.includes('document.title = buildLabel') && renderer.includes("let buildLabel = 'Mako "),
  'the window title is the Mako build label');
assert(require('./build-info').formatBuildLabel({ version: '1.0.0', commit: 'abc1234' }).indexOf('Mako ') === 0,
  'every build label begins with the Mako name');
assert(main.includes('no other Mako window') && main.includes('Mako will still refuse'),
  'the stale-lock confirmation uses the Mako name');
assert(admission.includes('Another Mako process changed or is updating the ledger.'),
  'the admission conflict message uses the Mako name');
assert(badge.includes('Another Mako installation owns the Claude Code hooks.'),
  'the pane-status ownership tooltip uses the Mako name');
assert(pkg.description.startsWith('Mako \u2014 '), 'package metadata presents the Mako name');
assert(appReadme.startsWith('# Mako (desktop app)'), 'the current app README presents Mako');
assert(install.startsWith('# Mako \u2014 Windows Source-Tree Installation Guide'),
  'the current Windows installation guide presents Mako');

const refusalMessages = [
  'Blocked by Mako web fence: this pane may not fetch that destination. [fence-webfetch-denied]',
  'Blocked by Mako fence: the tool request could not be verified. [fence-input-unverifiable]',
  'Blocked by Mako path fence: this role may only access files inside its own sandbox. [fence-outside-sandbox]',
];
for (const message of refusalMessages) {
  assert(count(hook, message) === 1, `the hook contains exactly one approved refusal: ${message}`);
}
for (const code of ['fence-webfetch-denied', 'fence-input-unverifiable', 'fence-outside-sandbox']) {
  assert(count(hook, `[${code}]`) === 1, `stable reason code is retained exactly once: ${code}`);
}
assert(!hook.includes('Blocked by Blue Helm'), 'no legacy product name remains in a live hook refusal');

assert(pkg.name === 'command-center', 'the package/storage identity remains command-center');
assert(main.includes("'.command-center', 'outputs'"), 'the output storage directory remains .command-center');
assert(hook.includes("'BLUE_HELM_CONTROLLED_WEBFETCH_MODE'"),
  'the controlled-WebFetch environment identifier remains BLUE_HELM_CONTROLLED_WEBFETCH_MODE');
assert(appReadme.includes('D:\\Workspace\\agent-command-center\\app'),
  'the repository path in the launch command remains agent-command-center');
assert(install.includes('<projectsRoot>\\.command-center\\outputs\\'),
  'the documented output path remains .command-center');

process.stdout.write(`\nmako-branding: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
