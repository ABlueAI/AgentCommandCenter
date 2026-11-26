'use strict';
// Run: node app/vendor-three.test.js
//
// S18: the vendored Three.js files (app/renderer/vendor/three/) are exactly three@0.160.0 from npm
// (tarball integrity sha512-DLU8lc0zNIPkM7rH5/e1Ks1Z8tWCGRq6g8mPowdDJpw1CFBJMU7UoJjC6PefXW7z//SSl0b2+GCw14LB+uDhng==),
// pinned by hash. The addons import from the bare name 'three', which a renderer page can't
// resolve without an inline import map (the CSP allows no inline script), so in the vendored
// copies that one specifier is rewritten to the relative path of three.module.js. This test
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
  ['addons/postprocessing/EffectComposer.js', '4d45663ca6dfac75d4b9b0954c1204c4e49817cf40691f9975b10372016e26b7', 'd234e578618fa816955ebdc059c049c577e203e650e33cf22bde3f232c29e669'],
  ['addons/postprocessing/MaskPass.js', '328cf7db0da5d9be83ffe39d54b01d5ac1fddf108cc98182ddbb056f5c8b537f', '328cf7db0da5d9be83ffe39d54b01d5ac1fddf108cc98182ddbb056f5c8b537f'],
  ['addons/postprocessing/OutputPass.js', 'cf08d1a960e72766072714f2eeaf388b25c7f8b0ac9399ee7ee6310a5a972f03', '13817fc7a87f662d29d2c5e00f44d3a4588c9afac4a372de0cacb0e44e368ffd'],
  ['addons/postprocessing/Pass.js', '294c2ab6b2fd42092e6210f621d094c23d77ee735a4f3a2fc9bf79e3148e5257', 'b3c6128340eaa37e40a6a2f1b738e894c855239417d50959759b34a2b5e89f92'],
  ['addons/postprocessing/RenderPass.js', '024b6e9b3868d7cc5c30356e17dcf1be7359d166f0faa713affaf4fcd7c9a6a7', '1c90c085312871c4bcdccfcf519499c6276dd503363fcf7cb7f703add45cf4a2'],
  ['addons/postprocessing/ShaderPass.js', 'ea06d52cf5d054d68cbe48b58bf98ee78c53976af863b123ccbe8162ef9f2e2c', '3b28a1ee27e0eb96c0eab137a1f442ccf127a926904eced2d51e125ec44af781'],
  ['addons/postprocessing/UnrealBloomPass.js', '84f72be0915bb14cbad00675c5a5266b795bf8faff99687eb9df6ec0732f9b26', '8f09315c0cec117a0ca2494d3e3586035b3c4323d6dcb037537cc51b04c3cdba'],
  ['addons/shaders/CopyShader.js', '4e3346db194db56a596cd074e9bdb39fb5eb52040c333e0d29dc4eb1324d3b1d', '4e3346db194db56a596cd074e9bdb39fb5eb52040c333e0d29dc4eb1324d3b1d'],
  ['addons/shaders/LuminosityHighPassShader.js', 'a0088bae391ae0d2464d1d8aef4ecae25fd2a2fbfd21b03a846e013d07365af5', '3d841cc594a0c1767d1b0185720b32761a0133c5f1b70b56658e28f2fb9b7900'],
  ['addons/shaders/OutputShader.js', '53a52e430c27bc36ceaab8ae90a2b4af7b02672d7ee4b29d6ba3c28e09c92c2a', '53a52e430c27bc36ceaab8ae90a2b4af7b02672d7ee4b29d6ba3c28e09c92c2a'],
  ['three.module.js', '76dea8151bc9352aef3528b4262e249b2604f62543828328db978d060d61a495', '76dea8151bc9352aef3528b4262e249b2604f62543828328db978d060d61a495'],
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
  const restored = text.replace(/from '\.\.\/\.\.\/three\.module\.js';/g, "from 'three';");
  assert(sha(restored) === upstream, `${file} differs from three@0.160.0 only in the 'three' import path`);
  assert(!/from 'three'/.test(text), `${file} has no bare 'three' import left`);
}

process.stdout.write(`\nvendor-three: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
