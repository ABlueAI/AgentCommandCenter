'use strict';
// Run: node app/renderer/clipboard-consumer.test.js
// Plain Node.js — no framework. Exercises the ACTUAL exported createClipboardConsumer
// (the async renderer-side clipboard logic app.js uses) against injected fake IPC:
// success is reported only after the promise RESOLVES {ok:true}; a rejection or {ok:false}
// refuses visibly and never throws; a failed READ never pastes into the PTY; no clipboard
// CONTENT is logged; and none of the async paths leave an unhandled rejection.
// A trailing section checks app.js's clipboard wiring and the main/preload boundary.

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { createClipboardConsumer, pastePolicyFor, createOscClipboardRefusal, OSC_REFUSAL_LOG_GAP_MS } = require('./clipboard-consumer');
const { CLIPBOARD_CHAR_LIMIT } = require('../clipboard-ipc');
const { Terminal } = require('./vendor/xterm');

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
    paste: o.paste || ((text) => pastes.push(text)),
    confirmMultiline: o.confirmMultiline,
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

  // Shell pastes prompt on any line break, including a trailing newline copied with a command.
  {
    const unsafe = harness({ invokeRead: async () => ({ ok: true, text: 'sample\u0000\u001b\u007f\u0085text' }) });
    assert(await unsafe.consumer.pasteIntoPty() === false && unsafe.pastes.length === 0
      && unsafe.logs.some((line) => /control characters/i.test(line) && !line.includes('sample')),
      'paste refuses control characters visibly without printing clipboard text');
    const prompts = [];
    const accepted = harness({
      invokeRead: async () => ({ ok: true, text: 'one\titem\r\ntwo\rthree\n' }),
      confirmMultiline: () => { prompts.push('confirm'); return true; },
    });
    assert(await accepted.consumer.pasteIntoPty() === true && prompts.length === 1
      && accepted.pastes[0] === 'one\titem\ntwo\nthree\n', 'confirmed paste preserves tabs and normalizes line endings');
    const cancelled = harness({
      invokeRead: async () => ({ ok: true, text: 'one\n' }),
      confirmMultiline: () => false,
    });
    assert(await cancelled.consumer.pasteIntoPty() === false && cancelled.pastes.length === 0,
      'cancelling a shell paste with a trailing newline sends nothing');
    const single = harness({
      invokeRead: async () => ({ ok: true, text: 'one\titem' }),
      confirmMultiline: () => { throw new Error('unexpected confirmation'); },
    });
    assert(await single.consumer.pasteIntoPty() === true && single.pastes[0] === 'one\titem',
      'one-line text with a tab pastes without confirmation');
    const promptFailed = harness({ confirmMultiline: () => { throw new Error('prompt unavailable'); } });
    assert(promptFailed.consumer.pasteText('one\ntwo') === false && promptFailed.pastes.length === 0
      && promptFailed.logs.at(-1).includes('confirmation failed'), 'a failed confirmation visibly refuses the paste');
    const unavailable = harness({ paste: () => false });
    assert(unavailable.consumer.pasteText('one') === false && unavailable.logs.at(-1).includes('terminal input unavailable'),
      'paste into a closed or read-only pane is visibly refused');
    const native = harness();
    assert(native.consumer.pasteText('a'.repeat(CLIPBOARD_CHAR_LIMIT + 1)) === false
      && native.pastes.length === 0 && native.logs.at(-1).includes('size limit'), 'native paste uses the clipboard IPC size limit');
  }

  // Exercise the shipped xterm's paste framing and mode negotiation without a browser.
  {
    const term = new Terminal();
    term._core.textarea = { value: '' }; // The clipboard helper clears the textarea after pasting.
    const data = [];
    term.onData((text) => data.push(text));
    const { consumer } = harness({
      invokeRead: async () => ({ ok: true, text: 'one\ntwo' }),
      paste: (text) => term.paste(text),
    });
    await new Promise((resolve) => term.write('\x1b[?2004h', resolve));
    await consumer.pasteIntoPty();
    await new Promise((resolve) => term.write('\x1b[?2004l', resolve));
    await consumer.pasteIntoPty();
    assert(data.length === 2 && data[0] === '\x1b[200~one\rtwo\x1b[201~' && data[1] === 'one\rtwo',
      'the active xterm mode determines whether paste is bracketed');
    term.dispose();
  }

  // A Gemini pane ignores bracketed-paste mode (the Gemini prompt drops the escapes), so its paste
  // arrives as plain text even while the program has enabled the mode.
  {
    const term = new Terminal({ ignoreBracketedPasteMode: pastePolicyFor({ paneCli: 'gemini' }).ignoreBracketedPaste });
    term._core.textarea = { value: '' };
    const data = [];
    term.onData((text) => data.push(text));
    await new Promise((resolve) => term.write('\x1b[?2004h', resolve));
    term.paste('one\ntwo');
    assert(data.length === 1 && data[0] === 'one\rtwo', 'a Gemini pane pastes without bracketed-paste escapes');
    term.dispose();
  }

  // --- pastePolicyFor: which panes confirm a multiline paste and which skip bracketed paste --------
  {
    const cases = [
      [{ paneCli: undefined }, true, false, 'a plain shell pane'],
      [{ paneCli: null }, true, false, 'a shell pane with no CLI'],
      [{ paneCli: 'claude' }, false, false, 'a Claude pane'],
      [{ paneCli: 'codex' }, false, false, 'a Codex pane'],
      [{ paneCli: 'gemini' }, false, true, 'a Gemini pane (including the Video Scout role)'],
      [{ paneCli: undefined, claudeVideoScout: true }, false, false, 'a Claude Video Scout pane'],
    ];
    for (const [input, confirm, ignoreBracketed, label] of cases) {
      const policy = pastePolicyFor(input);
      assert(policy.confirmMultiline === confirm && policy.ignoreBracketedPaste === ignoreBracketed,
        `paste policy for ${label}: confirm multiline ${confirm}, ignore bracketed paste ${ignoreBracketed}`);
    }
    const empty = pastePolicyFor();
    assert(empty.confirmMultiline === true && empty.ignoreBracketedPaste === false,
      'no pane facts means the safest shell policy (confirm multiline)');
  }

  // --- createOscClipboardRefusal: actionable, bounded, never logs the payload ---------------------
  {
    const logs = [];
    let t = 1000;
    const refuse = createOscClipboardRefusal({ log: (l) => logs.push(l), paneId: 'pty9', now: () => t });
    const payload = 'c;' + btoa('sample clipboard text');
    assert(refuse(payload) === true && logs.length === 1, 'the first OSC 52 request is consumed and logged once');
    assert(/blocked/i.test(logs[0]) && /Ctrl\+C/.test(logs[0]) && /did not change your clipboard/.test(logs[0]),
      'the first refusal says the clipboard was not changed and how to copy instead');
    t += 1000; refuse(payload); refuse(payload);
    assert(logs.length === 1, 'repeat requests inside the gap are counted, not logged');
    t += OSC_REFUSAL_LOG_GAP_MS;
    assert(refuse(payload) === true && logs.length === 2 && /3 more/.test(logs[1]),
      'after the gap, the next refusal logs again with the number blocked since the last line');
    assert(!logs.join('').includes('sample clipboard text') && !logs.join('').includes(payload.slice(2)),
      'no OSC 52 payload is ever logged');
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
    assert(block.includes(".catch(() => clipboardFailed('clipboardWrite: IPC failed'))"),
      'the Copy Output write reports rejection through the visible failure handler');
    assert(!/cc\.clipboardWrite\(/.test(block), 'Copy Output no longer calls cc.clipboardWrite directly — it routes through the consumer');
    // The terminal shortcut paths are async with .catch.
    assert(/handlePasteKey\(e, pasteFromClipboard\)/.test(appSrc), 'Ctrl+V retains the double-paste guard');
    assert(/clip\.writeClip\(sel\)\.catch\(/.test(appSrc), 'Ctrl+C copy handles an unexpected rejection');
    assert(/addEventListener\('paste',[\s\S]*?clip\.pasteText\([\s\S]*?\}, true\);/.test(appSrc),
      'native paste events pass through the same paste policy before reaching xterm');
    const oscBlock = /term\.parser\.registerOscHandler\(52, window\.ccClipboardConsumer\.createOscClipboardRefusal\(\{[\s\S]*?\}\)\);/.exec(appSrc);
    const logs = [];
    const writes = [];
    let onOsc52;
    assert(Boolean(oscBlock), 'the terminal explicitly handles OSC 52');
    if (oscBlock) {
      vm.runInNewContext(oscBlock[0], {
        id: 'pty9', appendLog: (line) => logs.push(line),
        window: { ccClipboardConsumer: { createOscClipboardRefusal } },
        term: { parser: { registerOscHandler: (_id, handler) => { onOsc52 = handler; } } },
        clip: { writeClip: (text) => { writes.push(text); return Promise.resolve(); } },
        atob,
      });
      const payload = 'sample clipboard text';
      assert(onOsc52(`c;${btoa(payload)}`) === true && onOsc52('c;?') === true && writes.length === 0
        && logs.length === 1 && /clipboard.*(blocked|refused)/i.test(logs[0]) && !logs[0].includes(payload),
        'OSC 52 requests are consumed and visibly refused without writing or logging the payload');
    }
    // The pane's paste policy comes from the tested helper, and a closed pane refuses input.
    const paneCliAt = appSrc.indexOf('const paneCli = role ? ROLES[role].cli : cli;');
    const policyAt = appSrc.indexOf('const pastePolicy = window.ccClipboardConsumer.pastePolicyFor({ paneCli, claudeVideoScout });');
    const consumerAt = appSrc.indexOf('window.ccClipboardConsumer.createClipboardConsumer({', policyAt);
    assert(paneCliAt > 0 && policyAt > paneCliAt && consumerAt > policyAt,
      'app.js derives the pane CLI, then its paste policy, before building the clipboard consumer');
    assert(/confirmMultiline: pastePolicy\.confirmMultiline\s*\?/.test(appSrc),
      'multiline confirmation follows the paste policy');
    assert(/if \(pastePolicy\.ignoreBracketedPaste\) term\.options\.ignoreBracketedPasteMode = true;/.test(appSrc),
      'Gemini panes turn off bracketed paste through the paste policy');
    assert(/if \(!terms\.has\(id\) \|\| term\.options\.disableStdin\) return false;\s*term\.paste\(text\);/.test(appSrc),
      'paste refuses a closed or input-disabled pane before reaching xterm');
    const startFailed = /const onStartFailed = \(reason, cancel\) => \{[\s\S]*?\n  \};/.exec(appSrc);
    assert(Boolean(startFailed) && startFailed[0].includes('term.options.disableStdin = true;'),
      'a failed start disables the pane\'s input');
    const ptyExit = /cc\.onPtyExit\(\(\{ id \}\) => \{[\s\S]*?\n  \}\);/.exec(appSrc);
    assert(Boolean(ptyExit) && ptyExit[0].includes('t.term.options.disableStdin = true;'),
      'a PTY exit disables the pane\'s input');
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
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
