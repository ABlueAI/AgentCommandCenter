'use strict';
// Run: node app/renderer/agent-token-view.test.js
// S31 item 4: the token banner shows why a save was refused, and the renderer keeps the input then.

const fs = require('fs');
const path = require('path');
const { saveResultMessage, createStatusCheck } = require('./agent-token-view');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

{
  const m = saveResultMessage({ ok: true });
  assert(m.ok === true && m.text === 'Token stored (encrypted).', 'a stored token says so');
}
{
  const m = saveResultMessage({ ok: false, error: 'not a GitHub token: a classic token (ghp_) is 40 characters; this one is 30' });
  assert(m.ok === false && m.text === 'Not saved: not a GitHub token: a classic token (ghp_) is 40 characters; this one is 30.', 'a refusal shows main\'s reason');
}
for (const r of [null, undefined, {}, { ok: false }, { ok: false, error: '' }, { ok: 'yes' }]) {
  const m = saveResultMessage(r);
  assert(m.ok === false && m.text === 'Not saved: unknown error.', `${JSON.stringify(r)}: not saved, unknown error`);
}

const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const save = app.slice(app.indexOf("$('#agentTokenSave').onclick"), app.indexOf("$('#agentTokenInput').onkeydown"));
assert(save.length > 0, 'the Save handler is found');
assert(/status\.textContent = msg\.text;/.test(save), 'the banner shows the result text');
assert(/if \(msg\.ok\) \{ input\.value = '';/.test(save) && (save.match(/input\.value = ''/g) || []).length === 1,
  'the input is cleared only after a successful save');
assert(save.indexOf('.trim()') === -1 || /if \(!token\.trim\(\)\)/.test(save), 'the raw value goes to main (main strips invisible characters)');
assert(save.indexOf('${token') === -1 && save.indexOf('${input.value') === -1 && !/appendLog\([^)]*\+ ?(token|input\.value)/.test(save),
  'the token itself is never logged');
assert(/<span id="agentTokenStatus"[^>]*role="status"/.test(html), 'the banner has a status line');
assert(html.indexOf('<script src="agent-token-view.js"></script>') !== -1
  && html.indexOf('agent-token-view.js') < html.indexOf('<script src="app.js"></script>'), 'the view loads before app.js');

(async () => {
  assert(typeof createStatusCheck === 'function', 'the status check handles delayed boot replies');
  if (createStatusCheck) {
    const statuses = [];
    const logs = [];
    const check = createStatusCheck((result) => statuses.push(result), (line) => logs.push(line));
    await check.read(async () => ({ ok: false, error: 'untrusted-sender' }));
    assert(statuses[0]?.ok === false && logs[0]?.includes('untrusted-sender'), 'a refused status read shows the banner and logs its reason');
    await check.read(async () => { throw new Error('fixture'); });
    assert(statuses[1] === null && logs[1]?.includes('status check failed'), 'a rejected status read shows the banner and logs failure');
    let respond;
    const pending = check.read(() => new Promise((resolve) => { respond = resolve; }));
    const changed = { ok: true, hasToken: false };
    check.update(changed);
    respond({ ok: true, hasToken: true });
    await pending;
    assert(statuses.length === 3 && statuses[2] === changed, 'a late boot response cannot overwrite an interactive change');
    // A stored token main refused at start-up reaches the Logs tab through the status reply: main's
    // own start-up log line goes out before the window exists, so it would never be seen.
    for (const issue of ['invalid-shape', 'unreadable']) {
      const lines = [];
      const seen = [];
      const boot = createStatusCheck((result) => seen.push(result), (line) => lines.push(line));
      await boot.read(async () => ({ ok: true, hasToken: false, available: true, loadIssue: issue }));
      assert(seen.length === 1 && lines.length === 1 && lines[0].includes(issue) && /save it again/i.test(lines[0]),
        `a stored token refused at start-up (${issue}) is logged with its reason and what to do`);
    }
    {
      const lines = [];
      const boot = createStatusCheck(() => {}, (line) => lines.push(line));
      await boot.read(async () => ({ ok: true, hasToken: true, available: true, loadIssue: null }));
      assert(lines.length === 0, 'a healthy status logs nothing');
    }
  }
  process.stdout.write(`\nagent-token-view: ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed ? 1 : 0;
})().catch((err) => { console.error(err); process.exitCode = 1; });
