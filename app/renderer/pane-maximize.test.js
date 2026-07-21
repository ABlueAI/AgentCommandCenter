'use strict';
// Run: node app/renderer/pane-maximize.test.js
// Plain Node.js — no framework (matches agent-dom.test.js / term-copy.test.js).
// Proves the V1a maximize contract on the ACTUAL exported controller: maximize/restore
// class toggling, Escape restore (consumed only when it acted), close-while-maximized,
// view-switch restore, direct pane switching, and the onLayout side-effect protocol.
// The trailing section statically checks app.js (Escape capture listener, switchTab
// restore, close ordering, refit + PTY resize in onLayout), styles.css (hidden-not-
// closed siblings), and the V1A acceptance marker in app.js + index.html.

const fs = require('fs');
const path = require('path');
const { createPaneMaximizer } = require('./pane-maximize');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// classList-only element stub — the controller's entire DOM surface.
function stubEl() {
  const set = new Set();
  return {
    classes: set,
    classList: { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) },
  };
}

function harness() {
  const grid = stubEl();
  const logs = [];
  const layouts = [];
  const max = createPaneMaximizer({
    grid,
    log: (line) => logs.push(line),
    onLayout: (id, prev) => layouts.push([id, prev]),
  });
  return { grid, logs, layouts, max };
}

// --- maximize ------------------------------------------------------------------------------------
{
  const { grid, logs, layouts, max } = harness();
  const pane = stubEl();
  assert(max.toggle('pty1', pane) === true, 'toggle on a normal grid maximizes');
  assert(pane.classList.contains('maximized') && grid.classList.contains('has-maximized'),
    'maximize sets pane .maximized + grid .has-maximized (CSS hides the siblings)');
  assert(max.maximizedId === 'pty1', 'controller reports the maximized pane id');
  assert(layouts.length === 1 && layouts[0][0] === 'pty1' && layouts[0][1] === null,
    'onLayout fires once with the maximized id');
  assert(logs.some((l) => l.includes('maximized pty1')), 'maximize is logged with the pane id');
}

// --- toggle restores ------------------------------------------------------------------------------
{
  const { grid, layouts, max } = harness();
  const pane = stubEl();
  max.toggle('pty1', pane);
  assert(max.toggle('pty1', pane) === true, 'the same control restores');
  assert(!pane.classList.contains('maximized') && !grid.classList.contains('has-maximized'),
    'restore removes both classes (the grid comes back)');
  assert(max.maximizedId === null, 'state cleared after restore');
  assert(layouts.length === 2 && layouts[1][0] === null && layouts[1][1] === 'pty1',
    'restore onLayout carries the previous id for predictable refocus');
}

// --- Escape ---------------------------------------------------------------------------------------
{
  const { logs, max } = harness();
  const pane = stubEl();
  assert(max.handleEscape() === false, 'Escape with nothing maximized is NOT consumed (flows to the PTY)');
  max.toggle('pty2', pane);
  assert(max.handleEscape() === true, 'Escape while maximized restores and IS consumed');
  assert(max.maximizedId === null && !pane.classList.contains('maximized'), 'Escape fully restores the grid');
  assert(logs.some((l) => l.includes('escape')), 'the escape restore path is logged with its reason');
  assert(max.handleEscape() === false, 'a second Escape after restore is not consumed');
}

// --- switching directly between panes -------------------------------------------------------------
{
  const { grid, layouts, max } = harness();
  const a = stubEl(); const b = stubEl();
  max.toggle('a', a);
  assert(max.toggle('b', b) === true, 'maximizing pane B while A is maximized switches directly');
  assert(!a.classList.contains('maximized') && b.classList.contains('maximized') && grid.classList.contains('has-maximized'),
    'switch removes A\'s class, sets B\'s, grid stays maximized');
  assert(max.maximizedId === 'b' && layouts.length === 2 && layouts[1][0] === 'b',
    'one onLayout per transition, ending on B');
}

// --- close-while-maximized ------------------------------------------------------------------------
{
  const { grid, layouts, max } = harness();
  const pane = stubEl();
  max.toggle('pty3', pane);
  assert(max.handlePaneClosed('other') === false && max.maximizedId === 'pty3',
    'closing a NON-maximized pane leaves maximize state alone');
  assert(max.handlePaneClosed('pty3') === true, 'closing the maximized pane restores the grid');
  assert(!grid.classList.contains('has-maximized') && max.maximizedId === null,
    'grid class cleared so the surviving panes un-hide');
  assert(layouts[layouts.length - 1][0] === null && layouts[layouts.length - 1][1] === null,
    'close passes no previous id (that pane no longer exists to refocus)');
}

// --- view switch ----------------------------------------------------------------------------------
{
  const { grid, max } = harness();
  const pane = stubEl();
  assert(max.handleViewSwitch() === false, 'view switch with nothing maximized is a no-op');
  max.toggle('pty4', pane);
  assert(max.handleViewSwitch() === true && !grid.classList.contains('has-maximized') && max.maximizedId === null,
    'leaving the Terminals view never strands maximize state');
}

// --- defensive: a hostile pane node cannot wedge the grid ----------------------------------------
{
  const { grid, max } = harness();
  const pane = stubEl();
  max.toggle('pty5', pane);
  pane.classList.remove = () => { throw new Error('detached node'); };
  assert(max.handleEscape() === true && !grid.classList.contains('has-maximized') && max.maximizedId === null,
    'a throwing pane classList still restores the grid (state + grid class always recover)');
}

// --- static wiring checks (app.js / index.html / styles.css) --------------------------------------
// CRLF-safe: normalize before matching (a fresh autocrlf checkout materializes \r\n).
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8').replace(/\r\n/g, '\n');
const appSrc = read('app.js');
const html = read('index.html');
const css = read('styles.css');
{
  // V5b2: the Escape handler now offers the key to the terminal maximizer AND the Library reader
  // maximizer, still consuming it ONLY when one of them actually restored (preventDefault +
  // stopPropagation guarded by the combined condition), still in the capture phase (, true).
  assert(/document\.addEventListener\('keydown',[\s\S]*?Escape[\s\S]*?paneMaximizer\.handleEscape\(\)[\s\S]*?libMaximizer\.handleEscape\(\)[\s\S]*?e\.preventDefault\(\);\s*e\.stopPropagation\(\);[\s\S]*?\}, true\);/.test(appSrc),
    'Escape listener: capture phase, consumes the key ONLY when a restore happened (terminal or library reader)');
  assert(/function switchTab\(name\) \{[\s\S]{0,300}if \(name !== 'terminals'\) paneMaximizer\.handleViewSwitch\(\);/.test(appSrc),
    'switchTab restores maximize state when leaving the Terminals view');
  const closeStart = appSrc.indexOf("pane.querySelector('.x').onclick");
  const closeBlock = appSrc.slice(closeStart, appSrc.indexOf('showTermEmpty()', closeStart));
  assert(closeStart > 0 && closeBlock.indexOf('paneMaximizer.handlePaneClosed(id)') !== -1
    && closeBlock.indexOf('paneMaximizer.handlePaneClosed(id)') < closeBlock.indexOf('pane.remove()'),
    'close handler restores the grid BEFORE removing the pane');
  assert(/pane\.querySelector\('\.max'\)\.onclick[\s\S]{0,200}paneMaximizer\.toggle\(id, pane\)/.test(appSrc),
    'the header ⛶ control toggles through the exported controller');
  const onLayoutStart = appSrc.indexOf('onLayout: (maximizedId, previousId)');
  const onLayoutBlock = appSrc.slice(onLayoutStart, appSrc.indexOf('},', appSrc.indexOf('if (focusId)', onLayoutStart)));
  assert(onLayoutStart > 0 && onLayoutBlock.includes('t.fit.fit()') && onLayoutBlock.includes('cc.ptyResize('),
    'every layout transition reruns FitAddon AND the PTY resize path (reflow, not unreachable lines)');
  assert(onLayoutBlock.includes('term.focus()'), 'every layout transition restores keyboard focus predictably');
}
{
  assert(/\.term-grid\.has-maximized > \.term-pane:not\(\.maximized\) \{ display: none; \}/.test(css),
    'CSS hides (does not close) sibling panes while one is maximized');
  assert(/\.term-grid\.has-maximized \{ display: block; \}/.test(css)
    && /\.term-grid\.has-maximized > \.term-pane\.maximized \{ height: 100%; \}/.test(css),
    'CSS gives the maximized pane the whole grid content area (header stays visible)');
}
{
  // Tripwire (see term-copy.test.js): the shared <script> global scope means a top-level
  // `const api` here would collide with agent-dom.js and kill the renderer at load.
  const modSrc = read('pane-maximize.js');
  assert(modSrc.includes('((global) => {')
    && modSrc.includes("})(typeof window === 'undefined' ? globalThis : window);")
    && !/^const api\b/m.test(modSrc),
    'pane-maximize.js is IIFE-wrapped — no top-level const collides in the shared <script> scope');
}
{
  const MARKER = 'V5C2A SUCCESS CLEANUP ACCEPTANCE 2026-07-21.13';
  assert(appSrc.includes(`const ACCEPTANCE_BUILD = '${MARKER}';`), 'app.js pins the V1a acceptance marker');
  assert(appSrc.includes('document.title = `Blue Helm — ${ACCEPTANCE_BUILD}`')
    && appSrc.includes('appendLog(`[build] ${ACCEPTANCE_BUILD}\\n`)'),
    'marker reaches the window title and the startup Logs');
  assert(html.includes(`>${MARKER}</span>`), 'marker is visible in the Terminals bar UI');
  const pmTag = html.indexOf('<script src="pane-maximize.js">');
  assert(pmTag > 0 && html.indexOf('<script src="app.js">') > pmTag, 'pane-maximize.js loads before app.js');
}

process.stdout.write(`\npane-maximize: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
