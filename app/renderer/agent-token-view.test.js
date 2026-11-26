'use strict';
// Run: node app/renderer/agent-token-view.test.js
// S31 item 4: the token banner shows why a save was refused, and the renderer keeps the input then.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { saveResultMessage } = require('./agent-token-view');

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

async function saveHandlerTest() {
  const button = { disabled: false };
  const input = { value: 'synthetic token input', focus: () => { focused = true; } };
  let focused = false;
  let flagged = false;
  const status = { textContent: '', classList: { toggle: (_name, value) => { flagged = value; } } };
  const elements = { '#agentTokenSave': button, '#agentTokenInput': input, '#agentTokenStatus': status };
  const logs = [];
  let rejectSave;
  let saved = false;
  const pending = new Promise((_resolve, reject) => { rejectSave = reject; });
  let request = pending;
  vm.runInNewContext(save, {
    $: (selector) => elements[selector],
    cc: { setAgentToken: () => request },
    window: { ccAgentTokenView: { saveResultMessage } },
    appendLog: (line) => logs.push(line),
    updateAgentTokenBanner: (result) => { saved = result.hasToken; },
  });

  const attempt = button.onclick();
  assert(button.disabled && status.textContent === 'Saving…', 'the Save button is disabled while the request is pending');
  rejectSave(new Error('IPC disconnected'));
  const rejection = await attempt.then(() => null, (error) => error);
  assert(!rejection && !button.disabled, 'a rejected save is handled and the Save button is restored');
  assert(flagged && status.textContent.includes('IPC disconnected') && logs.some((line) => line.includes('save failed')),
    'a rejected save displays the failure and records it in Logs');
  assert(input.value === 'synthetic token input' && focused, 'a rejected save keeps and focuses the token input for retry');
  request = Promise.resolve({ ok: true });
  await button.onclick();
  assert(!button.disabled && !flagged && !input.value && saved, 'the next save can succeed');
}

saveHandlerTest().then(() => {
  process.stdout.write(`\nagent-token-view: ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed ? 1 : 0;
}).catch((error) => { console.error(error); process.exitCode = 1; });
