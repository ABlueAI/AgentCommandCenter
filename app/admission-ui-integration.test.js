'use strict';
// Run: node app/admission-ui-integration.test.js
//
// END-TO-END proof for the controlled-run admission chain, after the Quick Links integration rebase.
//
// Everything here is REAL except the two things that cannot be real in a unit test: the Electron IPC
// event object and the PTY handle. Specifically the chain is
//
//     renderer/admission-view.js  ->  admission-ipc.js  ->  admission-budget.js  ->  admission-budget-store.js
//                                                                                        (a real file
//                                                                                         on disk)
//
// with the trusted-sender gate stubbed to a real allow/deny decision and the writer standing in for
// `p.write`. The point is that the properties the unit suites prove in isolation still hold when the
// modules are composed the way main.js composes them — in particular that the UI cannot double-spend,
// cannot bypass the boundary, and cannot make a refusal cheaper than it is.
//
// It also holds the QUICK LINKS COEXISTENCE assertions. Both features touched main.js, preload.js and
// package.json, so "the rebase did not quietly drop one of them" is a property worth a test rather
// than a glance at a merge summary.

const fs = require('fs');
const os = require('os');
const path = require('path');

const config = require('./admission-budget-config');
const budgetModule = require('./admission-budget');
const storeModule = require('./admission-budget-store');
const ipcModule = require('./admission-ipc');
const { createAdmissionView } = require('./renderer/admission-view');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
function eq(actual, expected, label) { assert(actual === expected, `${label} (got ${JSON.stringify(actual)})`); }
function section(name) { process.stdout.write(`\n${name}\n`); }

// ---- minimal DOM (same shape as renderer/admission-view.test.js) --------------------------------
class Classes {
  constructor(owner) { this.owner = owner; }
  values() { return this.owner.className.split(/\s+/).filter(Boolean); }
  toggle(name, force) {
    const set = new Set(this.values());
    const add = force === undefined ? !set.has(name) : force;
    if (add) set.add(name); else set.delete(name);
    this.owner.className = [...set].join(' ');
  }
  add(n) { this.toggle(n, true); }
  remove(n) { this.toggle(n, false); }
  contains(n) { return this.values().includes(n); }
}
class Element {
  constructor(tag, id = '') {
    this.tagName = String(tag).toUpperCase(); this.id = id; this.children = []; this.attributes = {};
    this.className = ''; this.classList = new Classes(this); this._text = ''; this.value = '';
    this.disabled = false; this.type = ''; this.maxLength = -1; this.placeholder = '';
    this.onclick = null; this.onkeydown = null; this.oninput = null;
  }
  set textContent(v) { this._text = String(v == null ? '' : v); this.children = []; }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text; }
  setAttribute(n, v) { this.attributes[n] = String(v); }
  getAttribute(n) { return this.attributes[n] || null; }
  appendChild(c) { this.children.push(c); return c; }
  walk() { return this.children.flatMap((c) => [c, ...c.walk()]); }
  find(p) { return this.walk().find(p) || null; }
}
function makeDocument() {
  const ids = { admissionHost: new Element('div', 'admissionHost') };
  return { ids, getElementById: (id) => ids[id] || null, createElement: (t) => new Element(t) };
}

const RUN_ID = 'admission-integration-run';
const TRUSTED = { sender: 'trusted' };
const UNTRUSTED = { sender: 'forged' };

let tmpRoot = null;
function freshUserData() {
  if (!tmpRoot) tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-admission-ui-'));
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'run-'));
  return dir;
}

/**
 * Compose the real chain exactly as app-ready + pty-start + pty-write do in main.js.
 *
 * `panes` is main's real `ptys` Map stand-in: the writer and the liveness check both read it, so a
 * pane that is not in the map is genuinely dead as far as the budget is concerned.
 */
function makeStack(opts = {}) {
  const o = opts;
  const userDataDir = freshUserData();
  const env = {
    BLUE_HELM_ADMISSION_ENABLED: '1',
    BLUE_HELM_ADMISSION_RUN_ID: RUN_ID,
    BLUE_HELM_ADMISSION_ALLOWANCE: String(o.allowance === undefined ? 2 : o.allowance),
    ...(o.env || {}),
  };
  const plan = config.parseAdmissionConfig(env);
  const store = storeModule.createAdmissionLedgerStore({ userDataDir });
  const panes = new Map(o.panes || [['pty1', true]]);
  const written = [];
  const mainLog = [];
  let clock = 1000;
  const budget = budgetModule.createAdmissionBudget({
    plan,
    storage: store,
    now: () => (clock += 1),
    isPaneRunning: (id) => panes.has(id),
    writer: o.writer || ((paneId, bytes) => {
      if (!panes.has(paneId)) throw new Error('pty-missing');
      written.push({ paneId, bytes, ledgerOnDisk: readLedger(userDataDir) });
    }),
    log: (line) => mainLog.push(String(line)),
  });
  const init = budget.initialize();
  const ipc = ipcModule.createAdmissionIpc({
    budget,
    assessSender: (e) => (e === TRUSTED ? { ok: true } : { ok: false, reason: 'untrusted-document' }),
    logRefusal: (line) => mainLog.push(`[admission] ${line}`),
    now: () => (clock += 1),
  });

  // The renderer side: the real view, talking to the real IPC handlers through the same two calls the
  // preload exposes. This is the ONLY wire between the two halves.
  const document = makeDocument();
  const rendererLog = [];
  const view = createAdmissionView({
    document,
    bridge: {
      enabled: true,
      submitPrompt: (req) => ipc.handleSubmitPrompt(TRUSTED, req),
      getState: () => ipc.handleGetState(TRUSTED),
    },
    log: (line) => rendererLog.push(line),
  });

  return {
    userDataDir, plan, store, budget, ipc, view, document, panes, written, mainLog, rendererLog, init,
    host: document.ids.admissionHost,
    input: () => document.ids.admissionHost.find((n) => n.id === 'admissionPrompt'),
    send: () => document.ids.admissionHost.find((n) => n.id === 'admissionSend'),
    status: () => document.ids.admissionHost.find((n) => n.className.includes('admission-status')),
    ledger: () => readLedger(userDataDir),
    record: () => (readLedger(userDataDir) || { runs: {} }).runs[RUN_ID] || null,
  };
}
function readLedger(dir) {
  const p = path.join(dir, 'admission-ledger.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
async function settle() { for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r)); }

(async () => {
  // ---- (3) one explicit click, one real admission, one real ledger write ------------------------
  section('(3) one explicit click spends exactly one turn through the REAL chain');
  {
    const s = makeStack({ allowance: 2 });
    eq(s.init.ok, true, 'the run initializes against a real ledger file');
    eq(s.budget.claimPane('pty1').ok, true, 'pty-start claims the pane');
    eq(s.view.mount(), true, 'the bar mounts');
    eq(await s.view.refresh(), true, 'boot state is read through the real IPC handler');
    eq(s.view.snapshot().run.paneId, 'pty1', 'the UI shows the pane main actually bound');
    s.input().value = 'first controlled prompt';
    s.send().onclick();
    await settle();
    eq(s.written.length, 1, 'exactly one write reached the PTY writer');
    eq(s.written[0].paneId, 'pty1', 'it went to the bound pane');
    assert(s.written[0].bytes.startsWith('first controlled prompt'), 'the prompt reached the terminal');
    assert(s.written[0].bytes.endsWith('\r'), 'MAIN appended the submission terminator');
    eq(s.record().admitted, 1, 'the ledger recorded one admission');
    eq(s.written[0].ledgerOnDisk.runs[RUN_ID].admitted, 1,
      'the decrement was DURABLE ON DISK BEFORE the write happened');
    eq(s.view.snapshot().run.remaining, 1, 'the UI shows the reduced remaining count');
    eq(s.input().value, '', 'the field cleared on a real admission');
  }

  // ---- (5) double-click cannot double-spend across the real boundary ----------------------------
  section('(5) a double-click cannot double-spend across the real boundary');
  {
    let release;
    const gate = new Promise((r) => { release = r; });
    const s = makeStack({
      allowance: 5,
      writer: async (paneId, bytes) => { await gate; s2written.push({ paneId, bytes }); },
    });
    const s2written = [];
    s.budget.claimPane('pty1');
    s.view.mount(); await s.view.refresh();
    s.input().value = 'only once';
    const a = s.view.submit();
    await new Promise((r) => setImmediate(r));
    const b = await s.view.submit();
    const c = await s.view.submit();
    eq(b, false, 'second concurrent click refused');
    eq(c, false, 'third concurrent click refused');
    release();
    await a; await settle();
    eq(s.record().admitted, 1, 'the LEDGER shows exactly one admission, not three');
    eq(s2written.length, 1, 'exactly one write reached the PTY');
  }

  // ---- (5b) two main-process budgets cannot spend one durable turn ------------------------------
  section('(5b) two app-process budgets cannot spend the same last turn');
  {
    const seed = makeStack({ allowance: 1 });
    eq(seed.budget.claimPane('pty1').ok, true, 'a prior session establishes the one-turn controlled pane');
    const rebindPlan = config.parseAdmissionConfig({
      BLUE_HELM_ADMISSION_ENABLED: '1',
      BLUE_HELM_ADMISSION_RUN_ID: RUN_ID,
      BLUE_HELM_ADMISSION_ALLOWANCE: '1',
      BLUE_HELM_ADMISSION_REBIND: '1',
    });
    const writesA = [];
    const writesB = [];
    const instanceA = budgetModule.createAdmissionBudget({
      plan: rebindPlan,
      storage: storeModule.createAdmissionLedgerStore({ userDataDir: seed.userDataDir }),
      now: () => 2001, isPaneRunning: () => true,
      writer: (_paneId, bytes) => { writesA.push(bytes); }, log: () => {},
    });
    const instanceB = budgetModule.createAdmissionBudget({
      plan: rebindPlan,
      storage: storeModule.createAdmissionLedgerStore({ userDataDir: seed.userDataDir }),
      now: () => 2002, isPaneRunning: () => true,
      writer: (_paneId, bytes) => { writesB.push(bytes); }, log: () => {},
    });
    eq(instanceA.initialize().ok, true, 'process A loads the shared starting revision');
    eq(instanceB.initialize().ok, true, 'process B loads the same shared starting revision');
    eq(instanceA.claimPane('pty1').ok, true, 'process A wins the locked rebind CAS');
    const losingClaim = instanceB.claimPane('pty1');
    eq(losingClaim.ok, false, 'process B is refused after its revision becomes stale');
    eq(losingClaim.reason, 'admission-ledger-conflict', 'the loser receives the visible bounded conflict reason');
    const [resultA, resultB] = await Promise.all([
      instanceA.submitPrompt('pty1', 'process A prompt'),
      instanceB.submitPrompt('pty1', 'process B prompt'),
    ]);
    eq(resultA.ok, true, 'exactly the CAS winner admits its prompt');
    eq(resultB.ok, false, 'the stale process cannot admit a prompt');
    eq(writesA.length + writesB.length, 1, 'exactly one PTY write occurs across both app processes');
    eq(readLedger(seed.userDataDir).runs[RUN_ID].admitted, 1,
      'the shared durable ledger records admitted: 1');
  }

  // ---- (6) N+1 refuses, and the ledger does not move --------------------------------------------
  section('(6) N+1 refuses and the ledger does not move');
  {
    const s = makeStack({ allowance: 2 });
    s.budget.claimPane('pty1');
    s.view.mount(); await s.view.refresh();
    for (const text of ['turn one', 'turn two']) {
      s.input().value = text;
      eq(await s.view.submit(), true, `"${text}" is admitted`);
    }
    eq(s.record().admitted, 2, 'both authorized turns are recorded');
    s.input().value = 'turn three';
    eq(await s.view.submit(), false, 'the N+1 turn is REFUSED');
    eq(s.record().admitted, 2, 'the ledger still shows 2 — N+1 did not increment it');
    eq(s.written.length, 2, 'no third write reached the PTY');
    assert(s.status().textContent.includes('Budget exhausted'), 'the N+1 refusal is visible to Blue');
    // Even reaching past the UI straight into the IPC handler cannot buy a third turn.
    const direct = await s.ipc.handleSubmitPrompt(TRUSTED, { paneId: 'pty1', prompt: 'sneak' });
    eq(direct.ok, false, 'a direct IPC call is refused too');
    eq(direct.reason, 'admission-budget-exhausted', 'with the exhausted reason');
    eq(s.written.length, 2, 'and still no third write');
  }

  // ---- (7) prompt text is absent from every persisted and logged surface ------------------------
  section('(7) prompt text is absent from logs, errors, persisted state and refusals');
  {
    const SENTINEL = 'INTEGRATION_PROMPT_SENTINEL_9f2b';
    const s = makeStack({ allowance: 1 });
    s.budget.claimPane('pty1');
    s.view.mount(); await s.view.refresh();
    s.input().value = SENTINEL;
    eq(await s.view.submit(), true, 'the sentinel prompt is admitted');
    s.input().value = `${SENTINEL} again`;
    eq(await s.view.submit(), false, 'the follow-up is refused (allowance was 1)');
    const surfaces = {
      'the ledger file on disk': fs.readFileSync(path.join(s.userDataDir, 'admission-ledger.json'), 'utf8'),
      'main-side log lines': s.mainLog.join('\n'),
      'renderer log lines': s.rendererLog.join('\n'),
      'the rendered UI': s.host.textContent,
      'the IPC state payload': JSON.stringify(await s.ipc.handleGetState(TRUSTED)),
      'the IPC refusal payload': JSON.stringify(await s.ipc.handleSubmitPrompt(TRUSTED, { paneId: 'pty1', prompt: SENTINEL })),
    };
    for (const [name, text] of Object.entries(surfaces)) {
      assert(!text.includes(SENTINEL), `sentinel absent from ${name}`);
    }
    // ...while the prompt DID reach the terminal, which is the one place it belongs.
    assert(s.written[0].bytes.includes(SENTINEL), 'the prompt did reach the PTY (and only the PTY)');
  }

  // ---- (8) state refreshes after success and refusal ---------------------------------------------
  section('(8) state refreshes from main after success AND refusal');
  {
    const s = makeStack({ allowance: 2 });
    s.budget.claimPane('pty1');
    s.view.mount(); await s.view.refresh();
    eq(s.view.snapshot().run.remaining, 2, 'boot shows the full allowance');
    s.input().value = 'one';
    await s.view.submit();
    eq(s.view.snapshot().run.remaining, 1, 'the count refreshed after success');
    s.input().value = '';                       // locally refused, no round trip
    await s.view.submit();
    eq(s.view.snapshot().run.remaining, 1, 'a local refusal leaves the authoritative count intact');
    s.input().value = 'two';
    await s.view.submit();
    eq(s.view.snapshot().run.remaining, 0, 'the count refreshed again');
    eq(s.view.snapshot().run.admitted, 2, 'the spent count refreshed too');
  }

  // ---- (9) direct input stays blocked for the controlled pane -----------------------------------
  section('(9) direct terminal input remains BLOCKED for the controlled pane');
  {
    const s = makeStack({ allowance: 2, panes: [['pty1', true], ['pty2', true]] });
    s.budget.claimPane('pty1');
    eq(s.budget.isDirectInputBlocked('pty1'), true, 'the budget reports the controlled pane blocked');
    eq(s.ipc.refuseDirectWrite('pty1'), true, 'the pty-write chokepoint refuses the controlled pane');
    // Simulate main's real handler body for a burst of keystrokes.
    let reached = 0;
    const ptyWrite = (id) => { if (s.ipc.refuseDirectWrite(id)) return; reached += 1; };
    for (const ch of 'rm -rf /\r') ptyWrite('pty1', ch);
    eq(reached, 0, 'not one keystroke of a 9-character burst reached the controlled PTY');
    assert(s.mainLog.some((l) => l.includes('admission-direct-input-blocked')),
      'the refusal is VISIBLE on the Logs channel');
    eq(s.written.length, 0, 'and nothing was written by the admission path either');
  }

  // ---- (10) uncontrolled panes are untouched ----------------------------------------------------
  section('(10) uncontrolled panes keep their existing input behaviour');
  {
    const s = makeStack({ allowance: 2, panes: [['pty1', true], ['pty2', true], ['library', true]] });
    s.budget.claimPane('pty1');
    let reached = 0;
    const ptyWrite = (id) => { if (s.ipc.refuseDirectWrite(id)) return; reached += 1; };
    for (const ch of 'echo hi\r') ptyWrite('pty2', ch);
    for (const ch of 'ls\r') ptyWrite('library', ch);
    eq(reached, 11, 'every keystroke to an UNCONTROLLED pane passed through untouched');
    eq(s.ipc.refuseDirectWrite('pty2'), false, 'pty2 is never refused');
    eq(s.budget.isDirectInputBlocked('pty2'), false, 'pty2 is not a controlled pane');
  }
  {
    // With NO run configured, nothing is blocked anywhere — the ordinary application is unchanged.
    const disabled = budgetModule.createAdmissionBudget({ plan: config.parseAdmissionConfig({}) });
    const ipc = ipcModule.createAdmissionIpc({ budget: disabled, assessSender: () => ({ ok: true }), now: () => 1 });
    for (const id of ['pty1', 'pty2', 'library']) {
      eq(ipc.refuseDirectWrite(id), false, `${id} is unblocked when no run is configured`);
    }
  }

  // ---- (11) Quick Links survived the integration ------------------------------------------------
  section('(11) Quick Links remains reachable and unchanged after the rebase');
  {
    const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
    const preload = read('preload.js');
    for (const m of ['quick-links-list', 'quick-links-save', 'quick-links-open']) {
      assert(preload.includes(m), `preload still exposes ${m}`);
    }
    assert(preload.includes("exposeInMainWorld('ccAdmission'"), 'preload also exposes ccAdmission');
    const main = read('main.js');
    for (const h of ["ipcMain.handle('quick-links-list'", "ipcMain.handle('quick-links-save'", "ipcMain.handle('quick-links-open'"]) {
      assert(main.includes(h), `main still registers ${h.slice(18)}`);
    }
    assert(main.includes('buildQuickLinksDefaultConfig'), 'main still builds the approved Quick Links defaults');
    assert(main.includes('createAdmissionIpc'), 'main also wires the admission boundary');
    const html = read('renderer/index.html');
    for (const id of ['quickLinksList', 'quickLinksManage', 'quickLinksEditor', 'quickLinksStatus']) {
      assert(html.includes(`id="${id}"`), `index.html still has #${id}`);
    }
    assert(html.includes('<script src="quick-links-view.js"></script>'), 'index.html still loads quick-links-view.js');
    assert(html.includes('<script src="admission-view.js"></script>'), 'index.html also loads admission-view.js');
    assert(html.includes('id="admissionHost"'), 'index.html has the admission host');
    const appJs = read('renderer/app.js');
    assert(appJs.includes('ccQuickLinksView.createQuickLinksView('), 'app.js still constructs the Quick Links view');
    assert(appJs.includes('quickLinksView.mount();'), 'app.js still mounts Quick Links');
    assert(appJs.includes('await quickLinksView.load();'), 'app.js still loads Quick Links');
    const css = read('renderer/styles.css');
    assert(css.includes('.quick-links-list'), 'the Quick Links styles survived');
    assert(css.includes('.admission-bar'), 'the admission styles were added alongside them');
    // The test chain must carry BOTH feature sets.
    const chain = JSON.parse(read('package.json')).scripts.test.split('&&').map((s) => s.trim());
    eq(chain.length, new Set(chain).size, 'no duplicate entry in the test chain');
    eq(chain.filter((c) => c.includes('quick-links')).length, 5, 'all 5 Quick Links suites are in the chain');
    eq(chain.filter((c) => c.includes('admission')).length, 8, 'all 8 admission suites are in the chain');
  }

  // ---- (12) no renderer path bypasses admission-submit-prompt -----------------------------------
  section('(12) no renderer path can bypass admission-submit-prompt');
  {
    const view = fs.readFileSync(path.join(__dirname, 'renderer', 'admission-view.js'), 'utf8');
    const code = view.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');
    eq((code.match(/ptyWrite/g) || []).length, 0, 'the view never calls ptyWrite');
    eq((code.match(/submitPrompt\(/g) || []).length, 1, 'the view has exactly one submit call site');
    // Both generic and admitted writes converge on the capability-enforcing module.
    const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
    const handler = main.slice(main.indexOf("ipcMain.on('pty-write'"));
    const body = handler.slice(0, handler.indexOf("ipcMain.on('pty-resize'"));
    assert(body.includes('admissionPtyBoundary.writeDirect(id, data)'),
      'generic input terminates at the final capability-enforcing writer');
    eq((main.match(/ipcMain\.on\('pty-write'/g) || []).length, 1, 'there is exactly ONE pty-write handler');
    const boundary = fs.readFileSync(path.join(__dirname, 'admission-pty-boundary.js'), 'utf8');
    eq((main.match(/\.write\(/g) || []).length, 0, 'main contains no independent PTY write primitive');
    eq((boundary.match(/pty\.write\(bytes\)/g) || []).length, 1,
      'exactly one production PTY write primitive exists in the final boundary');
    assert(main.includes('writer: admissionPtyBoundary.writeAdmitted'),
      "the budget receives the private capability-bearing admitted closure");
    assert(main.includes('getPty: (paneId) => ptys.get(paneId)'),
      'the final boundary resolves panes only from main-owned handles');
  }

  // ---- (13) live ledger access failure writes NOTHING -------------------------------------------
  section('(13) a live ledger access failure writes NOTHING and spends NOTHING');
  {
    const s = makeStack({ allowance: 3 });
    s.budget.claimPane('pty1');
    s.view.mount(); await s.view.refresh();
    // Make the real ledger unwritable by replacing the directory entry with a directory of that name.
    const ledgerPath = path.join(s.userDataDir, 'admission-ledger.json');
    const before = fs.readFileSync(ledgerPath, 'utf8');
    fs.rmSync(ledgerPath);
    fs.mkdirSync(ledgerPath);                     // a directory cannot be replaced by a file rename
    s.input().value = 'this must not be sent';
    eq(await s.view.submit(), false, 'the submission is refused when the ledger cannot be written');
    eq(s.written.length, 0, 'NOTHING was written to the PTY');
    assert(s.status().textContent.includes('NOTHING was sent'), 'the user is told nothing was sent');

    // FAIL CLOSED AND STAY CLOSED. A persist failure is FATAL by design: `fail()` latches
    // `fatalReason` and every later operation refuses with it, with no self-healing. Restoring the
    // file does NOT quietly resume the run — a budget that has lost track of what it durably recorded
    // must not start guessing, and a human decides whether to restart it.
    fs.rmSync(ledgerPath, { recursive: true });
    fs.writeFileSync(ledgerPath, before);
    s.input().value = 'the ledger is writable again';
    eq(await s.view.submit(), false, 'the run stays REFUSING even after the ledger becomes writable');
    eq(s.written.length, 0, 'still nothing written');
    eq(JSON.parse(before).runs[RUN_ID].admitted, 0, 'the durable count never moved during the failure');
    eq(s.record().admitted, 0, 'the failed attempt consumed NO admission');
    const post = await s.ipc.handleGetState(TRUSTED);
    eq(post.state.ok, false, 'the budget reports itself unhealthy rather than pretending to be fine');
    eq(post.state.reason, 'admission-ledger-unreadable', 'and names the rejected live reload as the cause');
  }

  // ---- (14) writer failure is NOT refunded --------------------------------------------------------
  section('(14) a writer failure after a durable decrement is NOT refunded');
  {
    let mode = 'fail';
    const s = makeStack({
      allowance: 2,
      writer: (paneId) => { if (mode === 'fail') throw new Error('pty write exploded'); seen.push(paneId); },
    });
    const seen = [];
    s.budget.claimPane('pty1');
    s.view.mount(); await s.view.refresh();
    s.input().value = 'the write will fail';
    eq(await s.view.submit(), false, 'the writer failure surfaces as a refusal');
    eq(s.record().admitted, 1, 'the admission IS consumed — the decrement was already durable');
    eq(s.view.snapshot().run.remaining, 1, 'the refreshed UI shows the turn as SPENT, not refunded');
    assert(s.status().textContent.includes('not refunded'), 'the UI states plainly that the turn is not refunded');
    mode = 'ok';
    s.input().value = 'this one works';
    eq(await s.view.submit(), true, 'the remaining turn is still spendable');
    eq(s.record().admitted, 2, 'and it consumed the second and last admission');
    s.input().value = 'one too many';
    eq(await s.view.submit(), false, 'the budget is now exhausted — the failed write really did cost a turn');
  }

  // ---- (15) restart, ledger integrity, pane binding, zero budget ----------------------------------
  section('(15) restart, ledger integrity, pane binding and zero budget still hold');
  {
    // Restart: a second process over the SAME ledger sees the spent turns and refuses to rebind.
    const s = makeStack({ allowance: 3 });
    s.budget.claimPane('pty1');
    s.view.mount(); await s.view.refresh();
    s.input().value = 'before the restart';
    await s.view.submit();
    eq(s.record().admitted, 1, 'one turn spent before the restart');

    const store2 = storeModule.createAdmissionLedgerStore({ userDataDir: s.userDataDir });
    const plan2 = config.parseAdmissionConfig({
      BLUE_HELM_ADMISSION_ENABLED: '1', BLUE_HELM_ADMISSION_RUN_ID: RUN_ID, BLUE_HELM_ADMISSION_ALLOWANCE: '3',
    });
    const b2 = budgetModule.createAdmissionBudget({
      plan: plan2, storage: store2, now: () => 9000, isPaneRunning: () => true, writer: () => {}, log: () => {},
    });
    eq(b2.initialize().ok, true, 'the restarted process reads the existing ledger');
    eq(b2.state().admitted, 1, 'the spent turn SURVIVED the restart — the budget is not reset by restarting');
    eq(b2.state().remaining, 2, 'only the unspent remainder is available');
    eq(b2.state().paneBound, false, 'the binding is stale after a restart, so no pane is controlled');
    eq(b2.state().paneId, null, 'and the stale pane id is NOT shown to the UI');
    eq(b2.claimPane('pty1').ok, false, 'a stale binding refuses to rebind without the explicit rebind flag');

    // LEDGER INTEGRITY — what the checksum catches, and what it explicitly does not.
    //
    // The dead `STORAGE_ROLLED_BACK` guard is GONE (see below for the assertion that it is gone). In
    // its place there is an unkeyed SHA-256 checksum over a canonical serialization of the ledger,
    // verified before any run record is accepted. Blue's authorization, verbatim: I ACCEPT THE
    // ADMISSION LEDGER AS AN ACCIDENTAL-SPEND CONTROL, NOT A SECURITY BOUNDARY AGAINST A MALICIOUS OR
    // COMPROMISED SAME-USER PANE.
    //
    // CASE A — an edit that did NOT recompute the checksum is DETECTED and refused.
    const ledgerFile = path.join(s.userDataDir, 'admission-ledger.json');
    const rewound = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
    rewound.runs[RUN_ID].admitted = 0;
    fs.writeFileSync(ledgerFile, JSON.stringify(rewound));   // checksum left stale on purpose
    eq(b2.state().admitted, 1, 'a loaded instance does not mutate merely because the file changed');
    const rejectedBytes = fs.readFileSync(ledgerFile);
    const writesBeforeMismatch = s.written.length;
    s.input().value = 'must refuse after live integrity mismatch';
    eq(await s.view.submit(), false, 'the LIVE admission path refuses the checksum-mismatched reload');
    eq(s.budget.state().reason, 'admission-ledger-integrity-mismatch',
      'the live refusal preserves the distinct integrity reason');
    eq(s.written.length, writesBeforeMismatch, 'the live integrity refusal performs ZERO PTY writes');
    assert(fs.readFileSync(ledgerFile).equals(rejectedBytes),
      'the live integrity refusal leaves the rejected file BYTE-IDENTICAL');
    const b3 = budgetModule.createAdmissionBudget({
      plan: plan2,
      storage: storeModule.createAdmissionLedgerStore({ userDataDir: s.userDataDir }),
      now: () => 9100, isPaneRunning: () => true, writer: () => {}, log: () => {},
    });
    const init3 = b3.initialize();
    eq(init3.ok, false, 'an edit that did not recompute the checksum is DETECTED and refused');
    eq(init3.reason, 'admission-ledger-integrity-mismatch', 'and is named accurately');
    eq(b3.state().ok, false, 'the budget stays fatally closed rather than adopting the edited count');
    const mismatchIpc = ipcModule.createAdmissionIpc({ budget: b3, assessSender: () => ({ ok: true }), now: () => 1 });
    const mismatchResult = await mismatchIpc.handleSubmitPrompt(TRUSTED, { paneId: 'pty1', prompt: 'x' });
    eq(mismatchResult.ok, false, 'no prompt can be admitted through a checksum-mismatched ledger');
    // It cannot self-heal into a fresh allowance, and it never rewrites the file it rejected.
    const afterRefusal = fs.readFileSync(ledgerFile, 'utf8');
    eq(JSON.parse(afterRefusal).runs[RUN_ID].admitted, 0, 'the rejected ledger is left exactly as found');
    const b3again = budgetModule.createAdmissionBudget({
      plan: plan2,
      storage: storeModule.createAdmissionLedgerStore({ userDataDir: s.userDataDir }),
      now: () => 9150, isPaneRunning: () => true, writer: () => {}, log: () => {},
    });
    eq(b3again.initialize().ok, false, 'a further attempt still refuses — no self-healing into a new allowance');

    // CASE B — NEGATIVE CONTROL, AND NOT A PASSING SECURITY PROPERTY.
    // Replaying an EARLIER VALID checksummed ledger IS accepted. The checksum is unkeyed, so an
    // earlier genuine file is indistinguishable from the current one by content alone. This is the
    // ACCEPTED SAME-USER / REPLAY LIMITATION under Blue's stated boundary — it is recorded here so the
    // behaviour is known, NOT because it is desirable.
    const s2 = makeStack({ allowance: 3 });
    s2.budget.claimPane('pty1');
    s2.view.mount(); await s2.view.refresh();
    const earlyCopy = fs.readFileSync(path.join(s2.userDataDir, 'admission-ledger.json'), 'utf8');
    s2.input().value = 'spend one';
    eq(await s2.view.submit(), true, 'a turn is spent on the second stack');
    eq(s2.record().admitted, 1, 'the ledger records it');
    fs.writeFileSync(path.join(s2.userDataDir, 'admission-ledger.json'), earlyCopy); // valid, older
    const replayed = budgetModule.createAdmissionBudget({
      plan: s2.plan,
      storage: storeModule.createAdmissionLedgerStore({ userDataDir: s2.userDataDir }),
      now: () => 9300, isPaneRunning: () => true, writer: () => {}, log: () => {},
    });
    const replayInit = replayed.initialize();
    eq(replayInit.ok, true, 'ACCEPTED LIMITATION: replaying an earlier VALID checksummed ledger is not detected');
    eq(replayed.state().admitted, 0, 'ACCEPTED LIMITATION: the spent turn is forgotten by the replay');
    // CASE C — deleting the ledger still recreates a fresh run under the not-found rule. Also an
    // accepted consequence, stated rather than defended.
    fs.rmSync(path.join(s2.userDataDir, 'admission-ledger.json'));
    const recreated = budgetModule.createAdmissionBudget({
      plan: s2.plan,
      storage: storeModule.createAdmissionLedgerStore({ userDataDir: s2.userDataDir }),
      now: () => 9400, isPaneRunning: () => true, writer: () => {}, log: () => {},
    });
    eq(recreated.initialize().ok, true, 'ACCEPTED LIMITATION: deleting the ledger recreates a fresh run');
    eq(recreated.state().admitted, 0, 'ACCEPTED LIMITATION: with a full allowance');

    // THE DEAD GUARD IS GONE — asserted, so it cannot quietly return.
    assert(!Object.prototype.hasOwnProperty.call(budgetModule.REASON, 'STORAGE_ROLLED_BACK'),
      'REASON.STORAGE_ROLLED_BACK no longer exists');
    assert(!Object.values(budgetModule.REASON).includes('admission-ledger-rolled-back'),
      'no reason value claims rollback protection');
    eq(budgetModule.REASON.STORAGE_INTEGRITY_MISMATCH, 'admission-ledger-integrity-mismatch',
      'the accurately named integrity reason replaces it');

    // The guard that DOES survive a restart, and is the one that matters for ACCIDENTAL top-ups:
    // raising BLUE_HELM_ADMISSION_ALLOWANCE and restarting must not grant more turns.
    //
    // This runs on its own fresh stack with an INTACT, properly checksummed ledger. The `s` stack's
    // file was deliberately corrupted above, and against that file every budget refuses with
    // `integrity-mismatch` first — which would make a plan-mismatch assertion there pass or fail for
    // the wrong reason. Testing one refusal at a time is the whole point of separating them.
    const s3 = makeStack({ allowance: 3 });
    s3.budget.claimPane('pty1');
    s3.view.mount(); await s3.view.refresh();
    s3.input().value = 'establish the run';
    eq(await s3.view.submit(), true, 'a turn is spent so the run is durably recorded at allowance 3');
    const planBigger = config.parseAdmissionConfig({
      BLUE_HELM_ADMISSION_ENABLED: '1', BLUE_HELM_ADMISSION_RUN_ID: RUN_ID, BLUE_HELM_ADMISSION_ALLOWANCE: '9',
    });
    const b4 = budgetModule.createAdmissionBudget({
      plan: planBigger,
      storage: storeModule.createAdmissionLedgerStore({ userDataDir: s3.userDataDir }),
      now: () => 9200, isPaneRunning: () => true, writer: () => {}, log: () => {},
    });
    const init4 = b4.initialize();
    eq(init4.ok, false, 'raising the configured allowance and restarting does NOT top the run up');
    eq(init4.reason, 'admission-ledger-plan-mismatch',
      'it fails closed with a PLAN mismatch — the ledger itself is intact, so this is not the integrity path');
    const toppedIpc = ipcModule.createAdmissionIpc({ budget: b4, assessSender: () => ({ ok: true }), now: () => 1 });
    const toppedResult = await toppedIpc.handleSubmitPrompt(TRUSTED, { paneId: 'pty1', prompt: 'x' });
    eq(toppedResult.ok, false, 'and no prompt can be admitted through the mismatched run');
  }
  {
    // Pane binding: the run binds once and cannot be moved.
    const s = makeStack({ allowance: 3, panes: [['pty1', true], ['pty2', true]] });
    eq(s.budget.claimPane('pty1').ok, true, 'the first pane claims the run');
    eq(s.budget.claimPane('pty2').ok, false, 'a second pane CANNOT take the budget');
    eq(s.budget.boundPaneId(), 'pty1', 'the binding did not move');
    const wrong = await s.ipc.handleSubmitPrompt(TRUSTED, { paneId: 'pty2', prompt: 'wrong pane' });
    eq(wrong.ok, false, 'a prompt aimed at the wrong pane is refused');
    eq(wrong.reason, 'admission-pane-mismatch', 'with the pane-mismatch reason');
    eq(s.written.length, 0, 'nothing was written to either pane');
    // A dead bound pane spends nothing and voids the remainder.
    s.panes.delete('pty1');
    s.budget.notePaneExit('pty1');
    const dead = await s.ipc.handleSubmitPrompt(TRUSTED, { paneId: 'pty1', prompt: 'after exit' });
    eq(dead.ok, false, 'a closed run refuses further prompts');
    eq(s.written.length, 0, 'and still nothing was written');
  }
  {
    // Zero budget: allowance 0 is not a configuration, it is a refusal.
    const s = makeStack({ allowance: 0 });
    eq(s.plan.enabled, false, 'an allowance of 0 does not produce an enabled plan');
    eq(s.budget.enabled, false, 'and yields the refusing budget object');
    eq(s.view.mount(), true, 'the view still mounts (the bridge object exists)');
    eq(await s.view.refresh(), false, 'but state is unavailable');
    s.input().value = 'nothing doing';
    eq(await s.view.submit(), false, 'and no prompt can be submitted');
    eq(s.written.length, 0, 'nothing reached the PTY');
  }
  {
    // The trusted-sender gate still guards the composed boundary.
    const s = makeStack({ allowance: 2 });
    s.budget.claimPane('pty1');
    const forged = await s.ipc.handleSubmitPrompt(UNTRUSTED, { paneId: 'pty1', prompt: 'forged' });
    eq(forged.ok, false, 'an untrusted sender is refused');
    eq(forged.reason, 'admission-untrusted-sender', 'with the untrusted reason');
    eq(s.written.length, 0, 'a forged submission writes nothing');
    eq(s.record().admitted, 0, 'and spends nothing');
    const forgedState = await s.ipc.handleGetState(UNTRUSTED);
    eq(forgedState.ok, false, 'an untrusted sender cannot even read the counts');
  }

  // ---- (16) gate off -> no bridge, no handlers ---------------------------------------------------
  section('(16) with the gate off the bridge is undefined and the channels do not exist');
  {
    const plan = config.parseAdmissionConfig({});
    eq(plan.enabled, false, 'an empty environment yields the disabled plan');
    eq(plan.allowance, 0, 'with allowance 0');
    const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
    // Both the token and the handler registration sit inside the enabled branch.
    assert(main.includes('...(admissionEnabled ? [ADMISSION_RENDERER_ARG] : []),'),
      'the renderer token is added only when a run is configured');
    const readyBlock = main.slice(main.indexOf('if (admissionEnabled) {'));
    const enabledBody = readyBlock.slice(0, readyBlock.indexOf('// ---- Dockview layout boundary'));
    assert(enabledBody.includes('admissionIpc.register(ipcMain);'),
      'the two admission channels are registered ONLY inside the enabled branch');
    eq((main.match(/admissionIpc\.register\(/g) || []).length, 1, 'and registered exactly once');
    // A disabled view never builds anything, so there is nothing to click.
    const document = makeDocument();
    const v = createAdmissionView({ document, bridge: undefined, log: () => {} });
    eq(v.mount(), false, 'the view refuses to mount with no bridge');
    eq(document.ids.admissionHost.children.length, 0, 'and #admissionHost stays empty');
  }

  if (tmpRoot) { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {} }
  process.stdout.write(`\nadmission-ui-integration: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  if (tmpRoot) { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {} }
  process.stderr.write(`admission-ui-integration harness failed: ${error && error.stack}\n`);
  process.exit(1);
});
