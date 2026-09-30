'use strict';
// Run: node app/mako-branding.test.js
//
// Visible-branding contract. Mako is the product-facing name; command-center and BLUE_HELM_*
// remain compatibility identities. This suite intentionally checks named presentation surfaces
// instead of banning historical/internal wording throughout the repository.

const fs = require('fs');
const path = require('path');

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
assert(html.includes('<span class="anchor">\u2693</span> Mako'), 'the top-bar brand is Mako and keeps the anchor');
assert(renderer.includes('document.title = `Mako \u2014 ${ACCEPTANCE_BUILD}`'),
  'the acceptance title is Mako plus the unchanged build marker');
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
