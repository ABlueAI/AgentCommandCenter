// Run: node app/renderer/tts-selection.test.js
const {
  createSelectionMemory,
  installMouseTrackingSelectionFallback,
  pointerToBufferCell,
  resolveDragSelection,
  resolveSpeakAction,
} = require('./tts-selection.js');

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

{
  const rect = { left: 10, top: 20, width: 800, height: 400 };
  assert(JSON.stringify(pointerToBufferCell({ clientX: 410, clientY: 220 }, rect, 80, 20, 100))
    === JSON.stringify({ column: 40, row: 110 }),
  'maps a pointer into the visible xterm grid plus its scrollback offset');
  assert(JSON.stringify(pointerToBufferCell({ clientX: -100, clientY: 9999 }, rect, 80, 20, 5))
    === JSON.stringify({ column: 0, row: 24 }),
  'clamps a drag released outside the terminal to the nearest visible cell');
}

{
  const forward = resolveDragSelection({ column: 5, row: 2 }, { column: 12, row: 3 }, 80);
  assert(forward.column === 5 && forward.row === 2 && forward.length === 88,
    'turns a forward multi-row drag into xterm select() coordinates');
  const reverse = resolveDragSelection({ column: 12, row: 3 }, { column: 5, row: 2 }, 80);
  assert(JSON.stringify(reverse) === JSON.stringify(forward), 'reverse drags select the same range');
  assert(resolveDragSelection({ column: 5, row: 2 }, { column: 5, row: 2 }, 80) === null,
    'a same-cell click is not converted into a selection');
}

{
  const elementHandlers = {};
  const documentHandlers = {};
  const doc = {
    addEventListener: (type, fn) => { documentHandlers[type] = fn; },
    removeEventListener: (type, fn) => { if (documentHandlers[type] === fn) delete documentHandlers[type]; },
  };
  const element = {
    ownerDocument: doc,
    addEventListener: (type, fn) => { elementHandlers[type] = fn; },
    removeEventListener: (type, fn) => { if (elementHandlers[type] === fn) delete elementHandlers[type]; },
  };
  const selections = [];
  let selection = '';
  let cleared = 0;
  let remembered = '';
  let capturedChars = -1;
  const term = {
    cols: 80,
    rows: 20,
    modes: { mouseTrackingMode: 'any' },
    buffer: { active: { viewportY: 30 } },
    element: { querySelector: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 400 }) }) },
    clearSelection: () => { cleared++; selection = ''; },
    getSelection: () => selection,
    select: (column, row, length) => { selections.push({ column, row, length }); selection = 'Agent text selected by fallback.'; },
  };
  const bridge = installMouseTrackingSelectionFallback({
    term,
    element,
    remember: (text) => { remembered = text; },
    onCapture: (charCount) => { capturedChars = charCount; },
  });
  elementHandlers.mousedown({ button: 0, shiftKey: false, clientX: 100, clientY: 100 });
  documentHandlers.mouseup({ clientX: 300, clientY: 140 });
  assert(cleared === 1 && selections.length === 1, 'mouse-mode drag uses xterm select() after the TUI consumed the gesture');
  assert(selections[0].row === 35 && selections[0].column === 10 && selections[0].length === 181,
    'the fallback selects the intended absolute buffer range');
  assert(remembered === selection, 'fallback selection is handed directly to pane-local TTS memory');
  assert(capturedChars === selection.length, 'capture diagnostics receive only a character count');

  const before = selections.length;
  elementHandlers.mousedown({ button: 0, shiftKey: false, clientX: 100, clientY: 100 });
  documentHandlers.mouseup({ clientX: 101, clientY: 101 });
  assert(selections.length === before, 'normal same-cell clicks remain available to the agent TUI');

  term.modes.mouseTrackingMode = 'none';
  elementHandlers.mousedown({ button: 0, shiftKey: false, clientX: 100, clientY: 100 });
  documentHandlers.mouseup({ clientX: 300, clientY: 140 });
  assert(selections.length === before, 'PowerShell/non-mouse terminals keep xterm native selection behavior');

  bridge.dispose();
  assert(!elementHandlers.mousedown && !documentHandlers.mouseup, 'the per-pane mouse bridge disposes both listeners');
}

process.stdout.write(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
