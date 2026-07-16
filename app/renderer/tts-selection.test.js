// Run: node app/renderer/tts-selection.test.js
const { resolveSpeakAction } = require('./tts-selection.js');

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  PASS ${label}\n`); passed++; }
  else { process.stderr.write(`  FAIL ${label}\n`); failed++; }
}

{
  const action = resolveSpeakAction({ selectionAtPointerDown: 'Selected Builder response.', selectionAtClick: '', paneId: 'term-7', role: 'builder' });
  assert(action.ok, 'uses the selection captured before speaker-button interaction');
  assert(action.text === 'Selected Builder response.', 'preserves the selected text for TTS');
  assert(/pane=term-7 role=builder chars=26/.test(action.log), 'logs pane, role, and character count');
  assert(!action.log.includes(action.text), 'never logs selected terminal content');
}

{
  const action = resolveSpeakAction({ selectionAtPointerDown: '', selectionAtClick: 'Still selected at click time.', paneId: 'term-2', role: 'reviewer' });
  assert(action.ok && action.text === 'Still selected at click time.', 'uses click-time selection when no snapshot exists');
}

{
  const action = resolveSpeakAction({ selectionAtPointerDown: '   ', selectionAtClick: '', paneId: 'term-4', role: 'web-scout' });
  assert(!action.ok, 'refuses honestly when neither capture contains text');
  assert(/selection missing/.test(action.log), 'missing-selection refusal is visible in Logs');
}

process.stdout.write(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
