'use strict';
// Run: node app/vendor-three.test.js
//
// S18: the vendored Three.js files (app/renderer/vendor/three/) are exactly three@0.160.0 from npm
// (tarball integrity sha512-DLU8lc0zNIPkM7rH5/e1Ks1Z8tWCGRq6g8mPowdDJpw1CFBJMU7UoJjC6PefXW7z//SSl0b2+GCw14LB+uDhng==),
// pinned by hash. The addons import from the bare name 'three', which a renderer page can't
// resolve without an inline import map (the CSP allows no inline script), so in the vendored
// copies that one specifier is rewritten to the relative path of three.module.min.js. The core is
// upstream's own minified build (build/three.module.min.js), unmodified. This test
// proves that is the only change: putting 'three' back gives the upstream file's hash.
// Line endings are normalised to LF first, so a Windows checkout hashes the same.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
const DIR = path.join(__dirname, 'renderer', 'vendor', 'three');
const sha = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

// [file, vendored sha256, upstream sha256 (with 'three' put back)]
const FILES = [
  ['addons/postprocessing/EffectComposer.js', '9936afeb9cf7743ad8263efe3d5e75fc3af487f21456797e93e8b9ed72237b42', 'd234e578618fa816955ebdc059c049c577e203e650e33cf22bde3f232c29e669'],
  ['addons/postprocessing/MaskPass.js', '328cf7db0da5d9be83ffe39d54b01d5ac1fddf108cc98182ddbb056f5c8b537f', '328cf7db0da5d9be83ffe39d54b01d5ac1fddf108cc98182ddbb056f5c8b537f'],
  ['addons/postprocessing/OutputPass.js', '5cc29024844fdbaf2dcc753fceda5d41607662b5e0e946ccac937034ef3e1137', '13817fc7a87f662d29d2c5e00f44d3a4588c9afac4a372de0cacb0e44e368ffd'],
  ['addons/postprocessing/Pass.js', '52f4a298d2ab39c5f034af04a7a9f184b8a1d7976f17a85abe120779f088d8de', 'b3c6128340eaa37e40a6a2f1b738e894c855239417d50959759b34a2b5e89f92'],
  ['addons/postprocessing/RenderPass.js', '3b1f50e44846820331fe5e04028c20b6c1e1a14bcb10dbd56bfeee476d97b53b', '1c90c085312871c4bcdccfcf519499c6276dd503363fcf7cb7f703add45cf4a2'],
  ['addons/postprocessing/ShaderPass.js', 'e1127e62e93a629106702697311098863b71c69311ddf1a67aa2975cf4232413', '3b28a1ee27e0eb96c0eab137a1f442ccf127a926904eced2d51e125ec44af781'],
  ['addons/postprocessing/UnrealBloomPass.js', '22b95440b70ce58b0095d3915f71a34b712fe29ac51c6e2e81beb5e9490d34f4', '8f09315c0cec117a0ca2494d3e3586035b3c4323d6dcb037537cc51b04c3cdba'],
  ['addons/shaders/CopyShader.js', '4e3346db194db56a596cd074e9bdb39fb5eb52040c333e0d29dc4eb1324d3b1d', '4e3346db194db56a596cd074e9bdb39fb5eb52040c333e0d29dc4eb1324d3b1d'],
  ['addons/shaders/LuminosityHighPassShader.js', '8f0e847eeecb23a0a5401a27e4ed2bbcd6d0753ea00abf953bc264545162b3f9', '3d841cc594a0c1767d1b0185720b32761a0133c5f1b70b56658e28f2fb9b7900'],
  ['addons/shaders/OutputShader.js', '53a52e430c27bc36ceaab8ae90a2b4af7b02672d7ee4b29d6ba3c28e09c92c2a', '53a52e430c27bc36ceaab8ae90a2b4af7b02672d7ee4b29d6ba3c28e09c92c2a'],
  ['three.module.min.js', '3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6', '3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6'],
];

const listed = new Set(FILES.map((f) => f[0]));
function walk(dir, base) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel)); else out.push(rel);
  }
  return out;
}
const present = walk(DIR, '');
assert(present.length === FILES.length && present.every((f) => listed.has(f)), `exactly the ${FILES.length} pinned files are vendored (found ${present.join(', ')})`);

for (const [file, vendored, upstream] of FILES) {
  let text = '';
  try { text = fs.readFileSync(path.join(DIR, ...file.split('/')), 'utf8').replace(/\r\n/g, '\n'); } catch { /* asserted below */ }
  assert(sha(text) === vendored, `${file} matches its pinned hash`);
  const restored = text.replace(/from '\.\.\/\.\.\/three\.module\.min\.js';/g, "from 'three';");
  assert(sha(restored) === upstream, `${file} differs from three@0.160.0 only in the 'three' import path`);
  assert(!/from 'three'/.test(text), `${file} has no bare 'three' import left`);
}

process.stdout.write(`\nvendor-three: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
