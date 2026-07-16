// Run: node app/renderer/tts-selection.test.js
const { createSelectionMemory, resolveSpeakAction } = require('./tts-selection.js');

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
  const memory = createSelectionMemory();
  assert(memory.remember('Agent output retained before focus changes.') === 43,
    'remembers a non-empty agent-pane selection when xterm reports it');
  assert(memory.remember('   ') === 43,
    'an empty selection-change event cannot erase the last usable selection');
  const action = resolveSpeakAction({
    selectionAtPointerDown: '', selectionAtClick: '', selectionRemembered: memory.peek(),
    paneId: 'term-9', role: 'builder',
  });
  assert(action.ok && action.text === 'Agent output retained before focus changes.',
    'uses remembered text after the agent TUI clears its live selection');
  assert(/selection=remembered/.test(action.log),
    'diagnostic identifies remembered selection without logging its text');
  assert(!action.log.includes(action.text), 'remembered agent text never enters Logs');
  memory.clear();
  assert(memory.peek() === '', 'memory clears after the Speak attempt');
}

{
  const action = resolveSpeakAction({
    selectionAtPointerDown: 'Newest selection.',
    selectionAtClick: '',
    selectionRemembered: 'Older selection.',
    paneId: 'term-10', role: 'reviewer',
  });
  assert(action.text === 'Newest selection.' && /selection=current/.test(action.log),
    'a current selection always wins over remembered text');
}

{
  const first = createSelectionMemory();
  const second = createSelectionMemory();
  first.remember('Builder one text.');
  second.remember('Builder two text.');
  first.clear();
  assert(first.peek() === '' && second.peek() === 'Builder two text.',
    'selection memory is pane-local rather than shared across agents');
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
