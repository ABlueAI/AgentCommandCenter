'use strict';
// Run: node app/renderer/agent-token-view.test.js
// S31 item 4: the token banner shows why a save was refused, and the renderer keeps the input then.

const fs = require('fs');
const path = require('path');
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

process.stdout.write(`\nagent-token-view: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
