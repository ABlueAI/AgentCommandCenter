'use strict';
// Run: node app/pane-status/pane-status-atomic.test.js
//
// WINDOWS ATOMIC REPLACEMENT (§ 12), turned from a one-off measurement into a standing fixture.
//
// The two-resource protocol rests entirely on two Windows facts. Both were measured by hand on this
// host; both are re-measured here on every run, on BOTH runtimes, because a fact nobody re-checks is
// an assumption:
//
//   1. rename-over-existing is atomic and reliable — asserted 100/100.
//   2. fsync on a READ-ONLY handle returns EPERM. The durable write must open 'r+'.
//
// Fact 2 is the one that bites: a "durable" write that fsyncs a read-only handle throws on Windows,
// and the obvious fix — skipping the fsync — silently removes the durability the protocol depends on.
// So the failure mode is asserted directly rather than merely avoided.
//
// The suite runs under system Node AND under the repository's Electron-as-node runtime, because that
// is the runtime the reporter and the app actually use, and the two are different builds of Node.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const descriptorMod = require('./pane-status-descriptor');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-atomic-'));
const ITERATIONS = 100;

// The probe body, run in-process here and again inside Electron-as-node. Written without any
// backslash escape sequences so it survives being embedded in a generated file.
const NL = String.fromCharCode(10);
const PROBE = [
  "'use strict';",
  "const fs=require('fs');const path=require('path');const os=require('os');",
  "const root=fs.mkdtempSync(path.join(os.tmpdir(),'bh-atomic-child-'));",
  'const target=path.join(root,"settings.json");',
  'const out={renameOver:0,renameFail:null,rPlusFsync:null,readOnlyFsync:null,version:process.versions.node};',
  'fs.writeFileSync(target,"seed");',
  'for(let i=0;i<' + ITERATIONS + ';i++){',
  '  const tmp=path.join(root,".t"+i+".tmp");',
  '  const body="iteration-"+i;',
  '  fs.writeFileSync(tmp,body);',
  '  let fd=null;',
  '  try{fd=fs.openSync(tmp,"r+");fs.fsyncSync(fd);}catch(e){out.rPlusFsync=out.rPlusFsync||("FAIL:"+e.code);}finally{if(fd!==null)try{fs.closeSync(fd);}catch(e2){}}',
  '  try{fs.renameSync(tmp,target);}catch(e){out.renameFail=out.renameFail||e.code;continue;}',
  '  if(fs.readFileSync(target,"utf8")===body)out.renameOver++;',
  '}',
  'if(out.rPlusFsync===null)out.rPlusFsync="OK";',
  'const ro=path.join(root,"readonly.txt");fs.writeFileSync(ro,"x");',
  'let rfd=null;',
  'try{rfd=fs.openSync(ro,"r");fs.fsyncSync(rfd);out.readOnlyFsync="OK";}catch(e){out.readOnlyFsync=e.code||"THREW";}finally{if(rfd!==null)try{fs.closeSync(rfd);}catch(e3){}}',
  'try{fs.rmSync(root,{recursive:true,force:true});}catch(e){}',
  'process.stdout.write(JSON.stringify(out));',
].join(NL) + NL;

function resolveElectron() {
  try {
    const p = require('electron');
    if (typeof p === 'string' && fs.existsSync(p)) return p;
  } catch { /* fall through */ }
  const guess = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
  return fs.existsSync(guess) ? guess : null;
}

function runProbe(label, exe, extraEnv) {
  const script = path.join(root, 'probe-' + label + '.js');
  fs.writeFileSync(script, PROBE);
  const env = Object.assign({}, process.env, extraEnv || {});
  const out = execFileSync(exe, [script], { encoding: 'utf8', timeout: 180000, env, windowsHide: true });
  return JSON.parse(out.trim());
}

// ---------------------------------------------------------------- system Node
{
  const r = runProbe('node', process.execPath, { ELECTRON_RUN_AS_NODE: undefined });
  assert(r.renameOver === ITERATIONS,
    `system Node ${r.version}: rename-over-existing succeeded ${r.renameOver}/${ITERATIONS}`);
  assert(r.renameFail === null, 'system Node: no rename failed');
  assert(r.rPlusFsync === 'OK', "system Node: fsync on an 'r+' handle succeeds");
  assert(r.readOnlyFsync === 'EPERM',
    `system Node: fsync on a READ-ONLY handle returns EPERM (got ${r.readOnlyFsync}) — this is why the durable write reopens 'r+'`);
}

// ---------------------------------------------------------------- the repository's Electron runtime
{
  const electron = resolveElectron();
  if (!electron) {
    process.stdout.write('  (Electron runtime not resolvable; Electron half skipped)\n');
  } else {
    const r = runProbe('electron', electron, { ELECTRON_RUN_AS_NODE: '1' });
    assert(r.renameOver === ITERATIONS,
      `Electron-as-node ${r.version}: rename-over-existing succeeded ${r.renameOver}/${ITERATIONS}`);
    assert(r.renameFail === null, 'Electron-as-node: no rename failed');
    assert(r.rPlusFsync === 'OK', "Electron-as-node: fsync on an 'r+' handle succeeds");
    assert(r.readOnlyFsync === 'EPERM',
      `Electron-as-node: fsync on a READ-ONLY handle returns EPERM (got ${r.readOnlyFsync})`);
  }
}

// ---------------------------------------------------------------- the production writer itself
{
  const dir = path.join(root, 'writer');
  const target = path.join(dir, 'settings.json');
  fs.mkdirSync(dir, { recursive: true });
  let ok = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    const body = 'production-' + i + NL;
    const res = descriptorMod.atomicWriteFileSync(target, body);
    if (res.ok && fs.readFileSync(target, 'utf8') === body && res.sha256 === descriptorMod.sha256(body)) ok++;
  }
  assert(ok === ITERATIONS, `the production atomicWriteFileSync replaced ${ok}/${ITERATIONS} times with a verified read-back`);
  const leftovers = fs.readdirSync(dir).filter((f) => f.indexOf('.tmp') !== -1);
  assert(leftovers.length === 0, 'and left no temp files behind across 100 replacements');
}

// ---------------------------------------------------------------- there is NO copy-over fallback
{
  const src = fs.readFileSync(path.join(__dirname, 'pane-status-descriptor.js'), 'utf8');
  assert(/fs\.renameSync\(/.test(src), 'the durable write uses renameSync');
  assert(!/copyFileSync|createWriteStream|appendFileSync/.test(src),
    'and there is NO copy-over or streaming fallback that would weaken atomicity');
  assert(/openSync\([^)]*['"]r\+['"]/.test(src), "and it explicitly opens 'r+' for the fsync");
}

try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
process.stdout.write(`\npane-status-atomic: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
