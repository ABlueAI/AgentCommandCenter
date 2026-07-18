'use strict';
// Run: node app/renderer/clipboard-consumer.test.js
// Plain Node.js — no framework. Exercises the ACTUAL exported createClipboardConsumer
// (the async renderer-side clipboard logic app.js uses) against injected fake IPC:
// success is reported only after the promise RESOLVES {ok:true}; a rejection or {ok:false}
// refuses visibly and never throws; a failed READ never pastes into the PTY; no clipboard
// CONTENT is logged; and none of the async paths leave an unhandled rejection.
// A trailing static section pins app.js's wiring (await-before-success, .catch on the
// fire-and-forget callers, no direct cc.clipboardWrite in the copy path) and preload/main.

const fs = require('fs');
const path = require('path');
const { createClipboardConsumer } = require('./clipboard-consumer');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// Track unhandled rejections across the whole run — the async-hygiene guarantee.
let unhandled = 0;
process.on('unhandledRejection', () => { unhandled++; });

function harness(opts) {
  const o = opts || {};
  const logs = [];
  const pastes = [];
  const consumer = createClipboardConsumer({
    invokeRead: o.invokeRead || (() => Promise.resolve({ ok: true, text: '' })),
    invokeWrite: o.invokeWrite || (() => Promise.resolve({ ok: true })),
    ptyWrite: (text) => pastes.push(text),
    log: (line) => logs.push(line),
    paneId: 'pty9',
  });
  return { consumer, logs, pastes };
}

(async () => {
  // --- writeText: resolves success ONLY on { ok:true } -------------------------------------------
  {
    const { consumer } = harness();
    const ok = await consumer.writeText('hello');
    assert(ok.ok === true, 'writeText resolves { ok:true } when the IPC resolves ok');
    const denied = createClipboardConsumer({ invokeWrite: () => Promise.resolve({ ok: false, error: 'untrusted-document' }) });
    const d = await denied.writeText('x');
    assert(d.ok === false && d.error === 'untrusted-document', 'writeText surfaces a structured { ok:false } as failure, not success');
    const rejected = createClipboardConsumer({ invokeWrite: () => Promise.reject(new Error('IPC channel closed')) });
    const r = await rejected.writeText('x');
    assert(r.ok === false && /IPC channel closed/.test(r.error), 'writeText turns an IPC REJECTION into { ok:false }, never throws');
  }

  // --- writeClip: metadata-only Logs, empty is a no-op -------------------------------------------
  {
    const SECRET = 'do-not-log-this-clipboard-text';
    const { consumer, logs } = harness();
    await consumer.writeClip(SECRET, 'copy pty9');
    assert(logs.join('').includes(`${SECRET.length} chars written`) && !logs.join('').includes(SECRET),
      'writeClip logs the char COUNT, never the copied text');
    const fail = harness({ invokeWrite: () => Promise.resolve({ ok: false, error: 'clipboard-unavailable' }) });
    const fr = await fail.consumer.writeClip('some text', 'copy pty9');
    assert(fr.ok === false && fail.logs.join('').includes('clipboardWrite FAILED: clipboard-unavailable')
      && !fail.logs.join('').includes('some text'),
      'a failed writeClip logs a visible FAILED line with the reason, never the text');
    const empty = harness();
    const er = await empty.consumer.writeClip('', 'copy pty9');
    assert(er.ok === false && er.error === 'empty' && empty.logs.length === 0, 'writeClip on empty input is a silent no-op refusal (nothing to copy)');
  }

  // --- readClip: '' for empty, null for ANY failure ---------------------------------------------
  {
    const okEmpty = harness({ invokeRead: () => Promise.resolve({ ok: true, text: '' }) });
    assert((await okEmpty.consumer.readClip()) === '', 'readClip returns \'\' for a legitimately empty clipboard (not a failure)');
    const okText = harness({ invokeRead: () => Promise.resolve({ ok: true, text: 'pasted' }) });
    assert((await okText.consumer.readClip()) === 'pasted', 'readClip returns the text on success');
    const denied = harness({ invokeRead: () => Promise.resolve({ ok: false, error: 'untrusted-sender' }) });
    const dr = await denied.consumer.readClip();
    assert(dr === null && denied.logs.join('').includes('read FAILED: untrusted-sender'), 'a denied read returns null and logs the reason');
    const rejected = harness({ invokeRead: () => Promise.reject(new Error('IPC down')) });
    const rr = await rejected.consumer.readClip();
    assert(rr === null && rejected.logs.join('').includes('read FAILED'), 'a REJECTED read returns null, never throws');
  }

  // --- pasteIntoPty: a FAILED read never pastes -------------------------------------------------
  {
    const ok = harness({ invokeRead: () => Promise.resolve({ ok: true, text: 'clip contents' }) });
    const okRes = await ok.consumer.pasteIntoPty();
    assert(okRes === true && ok.pastes.length === 1 && ok.pastes[0] === 'clip contents', 'pasteIntoPty writes the clipboard text to the PTY on success');
    const empty = harness({ invokeRead: () => Promise.resolve({ ok: true, text: '' }) });
    const emptyRes = await empty.consumer.pasteIntoPty();
    assert(emptyRes === false && empty.pastes.length === 0, 'an empty clipboard pastes nothing (no stray ptyWrite)');
    const denied = harness({ invokeRead: () => Promise.resolve({ ok: false, error: 'untrusted-sender' }) });
    const deniedRes = await denied.consumer.pasteIntoPty();
    assert(deniedRes === false && denied.pastes.length === 0, 'a FAILED read NEVER pastes into the PTY');
    const rejected = harness({ invokeRead: () => Promise.reject(new Error('IPC down')) });
    const rejectedRes = await rejected.consumer.pasteIntoPty();
    assert(rejectedRes === false && rejected.pastes.length === 0, 'a REJECTED read never pastes into the PTY');
  }

  // --- async hygiene: no unhandled rejection from any path --------------------------------------
  {
    // Fire the fire-and-forget style used by the key handlers: invoke, attach the .catch app.js uses.
    const rej = harness({ invokeWrite: () => Promise.reject(new Error('boom')), invokeRead: () => Promise.reject(new Error('boom')) });
    rej.consumer.writeClip('x', 'copy pty9').catch(() => {});
    rej.consumer.pasteIntoPty().catch(() => {});
    // Also prove the helpers themselves don't reject even WITHOUT a trailing catch.
    const bare = harness({ invokeWrite: () => Promise.reject(new Error('boom')), invokeRead: () => Promise.reject(new Error('boom')) });
    await bare.consumer.writeClip('x');
    await bare.consumer.pasteIntoPty();
    await bare.consumer.writeText('x');
    await new Promise((r) => setTimeout(r, 20)); // let any stray rejection surface
    assert(unhandled === 0, 'no async clipboard path leaves an unhandled rejection');
  }

  // --- static wiring checks (app.js / preload.js / main.js) --------------------------------------
  const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8').replace(/\r\n/g, '\n');
  const appSrc = read('app.js');
  const preload = read('../preload.js');
  const mainSrc = read('../main.js');
  {
    // Copy Output must go through the async consumer and only flash success on resolve.
    const start = appSrc.indexOf("copyBtn.onclick");
    const end = appSrc.indexOf("pane.querySelector('.max').onclick", start);
    const block = appSrc.slice(start, end);
    assert(start > 0 && block.includes('clip.writeText(result.text).then('), 'Copy Output awaits the async clipboard write before deciding success');
    assert(block.indexOf('flashCopyBtn(true)') > block.indexOf('.then('), 'the success flash is INSIDE the resolved .then (never before the IPC resolves)');
    assert(block.includes('.catch(() => {})'), 'the Copy Output write has a trailing .catch (no unhandled rejection)');
    assert(!/cc\.clipboardWrite\(/.test(block), 'Copy Output no longer calls cc.clipboardWrite directly — it routes through the consumer');
    // The terminal shortcut paths are async with .catch.
    assert(/clip\.pasteIntoPty\(\)\.catch\(\(\) => \{\}\)/.test(appSrc), 'Ctrl+V / right-click paste is fire-and-forget WITH a .catch');
    assert(/clip\.writeClip\(sel\)\.catch\(\(\) => \{\}\)/.test(appSrc), 'Ctrl+C copy is fire-and-forget WITH a .catch');
    assert(/clip\.writeClip\(decoded, `osc52 \$\{id\}`\)\.catch\(\(\) => \{\}\)/.test(appSrc), 'OSC 52 write is fire-and-forget WITH a .catch');
    assert(!/cc\.clipboardRead\(\) \|\|/.test(appSrc) && !/return \(cc\.clipboardRead/.test(appSrc),
      'the old synchronous readClip/writeClip helpers are gone');
  }
  {
    // preload exposes ONLY invoke wrappers; no Electron clipboard import. Strip comments
    // before ABSENCE checks so an explanatory comment can't trip a "must not contain" test.
    const preloadCode = preload.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert(!/require\('electron'\)[^\n]*clipboard/.test(preloadCode),
      'preload.js no longer destructures clipboard from Electron');
    assert(preload.includes("clipboardRead: () => ipcRenderer.invoke('clipboard-read')")
      && preload.includes("clipboardWrite: (t) => ipcRenderer.invoke('clipboard-write', t)"),
      'preload exposes clipboard access ONLY as ipcRenderer.invoke wrappers');
    assert(!/navigator\.clipboard/.test(preloadCode) && !/clipboard\.(readText|writeText)/.test(preloadCode),
      'preload never touches navigator.clipboard or the Electron clipboard directly');
  }
  {
    // main registers the two handlers and forwards to the pure module.
    assert(mainSrc.includes("ipcMain.handle('clipboard-read'") && mainSrc.includes("ipcMain.handle('clipboard-write'"),
      'main.js registers the clipboard-read and clipboard-write IPC handlers');
    assert(mainSrc.includes("require('./clipboard-ipc')") && mainSrc.includes('createClipboardIpcHandlers({'),
      'main.js builds the handlers from the pure clipboard-ipc module');
    assert(/entryUrl: ENTRY_URL/.test(mainSrc) && /getTrustedWindow: \(\) => win/.test(mainSrc.slice(mainSrc.indexOf('createClipboardIpcHandlers'))),
      'the clipboard boundary is bound to the canonical ENTRY_URL + the trusted window (same anchors as K8)');
    assert(/contextIsolation: true/.test(mainSrc) && /nodeIntegration: false/.test(mainSrc),
      'renderer sandboxing (contextIsolation true / nodeIntegration false) is unchanged');
  }

  process.stdout.write(`\nclipboard-consumer: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
