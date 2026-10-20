'use strict';
// Run: node app/pane-status/pane-status-notifications.test.js
// The native Notification boundary is a fake. This does NOT verify Windows toast delivery.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createPaneStatusNotifications } = require('./pane-status-notifications');
const { createPaneStatusRegistry } = require('./pane-status-registry');
const { createPaneStatusPipe, buildPipeName } = require('./pane-status-pipe');
const { encodeMessage } = require('./pane-status-protocol');

let passed = 0, failed = 0;
function test(label, run) { run(); passed++; console.log(`  ✓ ${label}`); }
function rig(options = {}) {
  const shown = [], logs = [], actions = [];
  class Notification extends EventEmitter {
    static isSupported() { if (options.supportThrows) throw Error('PRIVATE'); return options.supported !== false; }
    constructor(message) { super(); if (options.constructThrows) throw Error('PRIVATE'); this.message = message; this.closed = 0; }
    show() { if (options.showThrows) throw Error('PRIVATE'); shown.push(this); }
    close() { this.closed++; if (options.closeThrows) throw Error('PRIVATE'); this.emit('close'); }
  }
  const win = {
    isDestroyed: () => options.destroyed === true,
    isMinimized: () => options.minimized === true,
    restore: () => actions.push('restore'), show: () => actions.push('show'), focus: () => actions.push('focus'),
  };
  const notifier = createPaneStatusNotifications({
    Notification, platform: options.platform || 'win32',
    getWindow: () => options.noWindow ? null : win, log: line => logs.push(line),
  });
  const view = (state, paneId = 'pty1', reason = null) => notifier.observe({paneId, state, reason});
  return { notifier, shown, logs, actions, view };
}

test('construction is inert; initial/enrollment/working/unknown views do not notify', () => {
  const r = rig({supportThrows:true});
  r.notifier.observe(null); r.view('unknown', 'pty1', 'no-signal'); r.view('idle'); r.view('working');
  assert.equal(r.shown.length, 0); assert.equal(r.logs.length, 0);
});
test('attention and turn-ended transitions notify once each, with honest fixed wording', () => {
  const r = rig();
  r.view('attention'); r.view('attention'); r.view('turn ended'); r.view('turn ended');
  assert.equal(r.shown.length, 2);
  assert.match(r.shown[0].message.title, /needs attention/);
  assert.match(r.shown[1].message.title, /turn ended/);
  assert.match(r.shown[1].message.body, /does not mean the task is finished/);
  assert.equal(r.shown[0].closed, 1);
});
test('heartbeat duplicates and stale/outage recovery do not replay a toast', () => {
  const r = rig(); r.view('attention');
  for (let i=0; i<10; i++) r.view('attention');
  for (const reason of ['stale','version-mismatch','reconciliation-required']) {
    r.view('unknown', 'pty1', reason); r.view('attention');
  }
  assert.equal(r.shown.length, 1);
  r.view('working'); r.view('attention'); assert.equal(r.shown.length, 2);
});
test('panes deduplicate independently; release and ID reuse discard old state', () => {
  const r = rig(); r.view('attention'); r.view('attention','pty2');
  r.view('unknown','pty1','no-signal'); r.view('attention');
  assert.equal(r.shown.length, 3); assert.equal(r.shown[1].closed, 0);
});
test('working, removal, failure, exit and shutdown dismiss retained notifications', () => {
  for (const [state,reason] of [['working',null],['unknown','hook-removed'],['failed',null],['exited',null]]) {
    const r = rig(); r.view('attention'); const n=r.shown[0]; r.view(state,'pty1',reason);
    assert.equal(n.closed,1); n.emit('click'); assert.deepEqual(r.actions,[]);
  }
  const r=rig(); r.view('attention'); r.view('turn ended','pty2');
  r.notifier.dispose(); r.notifier.dispose(); r.view('attention','pty3');
  assert.equal(r.shown.length,2); assert(r.shown.every(n=>n.closed===1));
});
test('click after Windows timeout restores/focuses only Mako; obsolete clicks do nothing', () => {
  const r=rig({minimized:true}); r.view('attention'); const n=r.shown[0];
  n.emit('close', {reason:'timedOut'}); n.emit('click');
  assert.deepEqual(r.actions,['restore','show','focus']);
  r.actions.length=0; r.view('working'); n.emit('click'); assert.deepEqual(r.actions,[]);
});
test('clicks with a destroyed or missing window are harmless', () => {
  for (const options of [{destroyed:true},{noWindow:true}]) {
    const r=rig(options); r.view('attention'); r.shown[0].emit('click'); assert.deepEqual(r.actions,[]);
  }
});
test('unsupported hosts and OS delivery exceptions are visible and do not cause heartbeat retries', () => {
  for (const options of [{supported:false},{supportThrows:true},{constructThrows:true},{showThrows:true}]) {
    const r=rig(options); r.view('attention'); r.view('attention');
    assert.equal(r.logs.length,1); assert(!r.logs.join().includes('PRIVATE'));
  }
  const r=rig(); r.view('attention'); r.shown[0].emit('failed', {}, 'PRIVATE');
  r.view('attention'); assert.equal(r.shown.length,1); assert.equal(r.logs.length,1);
});
test('dismissal errors are visible; Linux/macOS do not invoke a native notification', () => {
  const r=rig({closeThrows:true}); r.view('attention'); r.view('working'); assert.equal(r.logs.length,1);
  for (const platform of ['linux','darwin']) {
    const other=rig({platform,supportThrows:true}); other.view('attention'); other.view('turn ended');
    assert.equal(other.shown.length,0); assert.equal(other.logs.length,0);
  }
});
test('notification payloads contain no pane names, paths, tokens or arbitrary view fields', () => {
  const r=rig(); r.notifier.observe({paneId:'PRIVATE',state:'attention',reason:null,token:'PRIVATE',transcript:'PRIVATE'});
  assert.deepEqual(Object.keys(r.shown[0].message).sort(),['body','title']);
  assert(!JSON.stringify(r.shown[0].message).includes('PRIVATE'));
});
test('real pane registry and transport validation gate alerts; malformed/foreign/refresh-only events cannot alert', () => {
  const r=rig();
  const registry=createPaneStatusRegistry({now:()=>1000,randomToken:()=>crypto.randomBytes(32).toString('hex'),crypto,isVersionSupported:()=>true});
  registry.setOverrideReason(null);
  const token=registry.enroll('pty1').token;
  const pipe=createPaneStatusPipe({net:require('net'),registry,pipeName:buildPipeName('abcdef01'),onStateChange:r.notifier.observe});
  pipe.deliverLine('garbage');
  pipe.deliverLine(encodeMessage('Stop','d'.repeat(64)));
  pipe.deliverLine(JSON.stringify({v:1,e:'Notification',t:token,content:'PRIVATE'}));
  assert.equal(r.shown.length,0);
  pipe.deliverLine(encodeMessage('Notification',token));
  pipe.deliverLine(encodeMessage('PostToolUse',token));
  r.notifier.observe(registry.viewFor('pty1')); // heartbeat
  assert.equal(r.shown.length,1);
  pipe.deliverLine(encodeMessage('UserPromptSubmit',token));
  pipe.deliverLine(encodeMessage('Stop',token));
  assert.equal(r.shown.length,2);
  registry.revoke('pty1','pty-exit');
  pipe.deliverLine(encodeMessage('Notification',token)); assert.equal(r.shown.length,2);
});
test('main composes the observer with the existing controller publisher and preserves delivery result', () => {
  const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
  assert.match(main,/publishView: \(view\) => \{\s*const delivered = paneStatusPublishers\.publishView\(view\);\s*paneStatusNotifications\.observe\(view\);\s*return delivered;/);
  assert.match(main,/app\.on\('will-quit', \(\) => \{\s*paneStatusNotifications\.dispose\(\);/);
  assert.match(main,/app\.on\('window-all-closed', \(\) => \{\s*paneStatusNotifications\.dispose\(\);/);
});
console.log(`\npane-status-notifications: ${passed} passed, ${failed} failed`);
