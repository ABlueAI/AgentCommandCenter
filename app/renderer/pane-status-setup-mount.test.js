'use strict';
// Run: node app/renderer/pane-status-setup-mount.test.js
//
// THE SETUP CONTROL ACTUALLY MOUNTS IN THE REAL PAGE (advisory review, finding 2).
//
// The previous build resolved its mount point with three selectors — `#terminals-toolbar`,
// `.term-toolbar`, `#term-toolbar` — none of which exists anywhere in index.html. Every one returned
// null, `createSetupControl` mounted nothing, and there was no way to install or remove the hooks from
// the running application at all. The existing badge suite passed throughout, because it injected its
// own `getToolbarElement`.
//
// THAT IS THE MISTAKE THIS SUITE EXISTS TO MAKE IMPOSSIBLE. Nothing here fabricates the integration
// point:
//   * the DOM is BUILT FROM app/renderer/index.html, by parsing the real `.term-bar` subtree;
//   * the mount point is resolved by the PRODUCTION function `resolveSetupHost`;
//   * `createSetupControl` is called the way app.js calls it — a document and a bridge, no
//     `getToolbarElement` — so if the markup loses its host, this suite fails.

const fs = require('fs');
const path = require('path');
const badgeMod = require('./pane-status-badge');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function eq(a, b, label) { assert(a === b, `${label} (got ${JSON.stringify(a)})`); }

const RENDERER_DIR = __dirname;
const indexSrc = fs.readFileSync(path.join(RENDERER_DIR, 'index.html'), 'utf8');
const appSrc = fs.readFileSync(path.join(RENDERER_DIR, 'app.js'), 'utf8');
const badgeSrc = fs.readFileSync(path.join(RENDERER_DIR, 'pane-status-badge.js'), 'utf8');

// -------------------------------------------------------------------------------------------------
// 1. THE REAL MARKUP
// -------------------------------------------------------------------------------------------------
process.stdout.write('\nindex.html carries exactly one .term-bar and one #paneStatusHost inside it\n');
{
  const noComments = indexSrc.replace(/<!--[\s\S]*?-->/g, '');
  const bars = noComments.match(/class="term-bar"/g) || [];
  eq(bars.length, 1, 'EXACTLY ONE .term-bar host exists in the real markup');

  const hosts = noComments.match(/id="paneStatusHost"/g) || [];
  eq(hosts.length, 1, 'EXACTLY ONE #paneStatusHost exists');

  const barIdx = noComments.indexOf('class="term-bar"');
  const hostIdx = noComments.indexOf('id="paneStatusHost"');
  const ttsIdx = noComments.indexOf('class="tts-controls"');
  const shellIdx = noComments.indexOf('id="newTermShell"');
  assert(barIdx > -1 && hostIdx > barIdx, 'the host sits INSIDE the terminal toolbar, not before it');
  assert(ttsIdx > barIdx && hostIdx > ttsIdx, 'it is a sibling AFTER .tts-controls');
  assert(shellIdx > hostIdx, 'and immediately BEFORE #newTermShell — the placement Work Order 1 J.1 specified');

  // It ships EMPTY, exactly like #admissionHost: nothing renders unless main says something.
  assert(/<div\s+id="paneStatusHost"\s+class="pane-status-host"><\/div>/.test(noComments),
    'it ships EMPTY in markup — the control is built by the renderer, or not at all');
}

// -------------------------------------------------------------------------------------------------
// 2. THE NONEXISTENT SELECTOR CHAIN IS GONE FROM THE CODE
// -------------------------------------------------------------------------------------------------
process.stdout.write('\nthe selectors that never existed are gone from the code (not merely from prose)\n');
{
  // Match the CONSTRUCT, not the word: these names are legitimately discussed in the correction
  // comments, and an assertion that scans for the bare string would fail on the explanation of its own
  // fix. What must not exist is a query for them.
  for (const dead of ['#terminals-toolbar', '.term-toolbar', '#term-toolbar']) {
    const re = new RegExp('querySelector\\(\\s*[\'"]' + dead.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\'"]');
    assert(!re.test(appSrc), `app.js never queries ${dead}`);
    assert(!re.test(badgeSrc), `the badge module never queries ${dead} either`);
  }
  // And the real one IS queried, by the production resolver.
  assert(/querySelector\(\s*['"]\.term-bar['"]\s*\)/.test(badgeSrc),
    'the production resolver queries the ACTUAL .term-bar selector');
  assert(/querySelector\(\s*['"]#paneStatusHost['"]\s*\)/.test(badgeSrc),
    'and the actual #paneStatusHost placeholder inside it');

  // app.js must NOT supply its own mount point any more — that is what let the defect hide.
  const call = appSrc.slice(appSrc.indexOf('createSetupControl({'), appSrc.indexOf('  : null;', appSrc.indexOf('createSetupControl({')));
  assert(call.length > 0, 'app.js calls createSetupControl');
  // Match the PROPERTY, not the word. The correction comment inside this very call names the
  // dependency it removed, and an assertion scanning for the bare identifier would fail on the
  // explanation of its own fix.
  assert(!/getToolbarElement\s*:/.test(call),
    'and passes no such dependency as a property — production resolves its own mount point');
  assert(/\bdocument,/.test(call), 'it passes the real document');
  assert(/bridge:\s*window\.ccPaneStatus/.test(call), 'and the real bridge');
}

// -------------------------------------------------------------------------------------------------
// 3. A DOM BUILT FROM THE REAL MARKUP
// -------------------------------------------------------------------------------------------------
// A deliberately small parser: it walks the `.term-bar` subtree of the real file and builds nodes with
// the ids and classes that file actually carries. If the host is deleted from index.html, the tree
// below simply will not contain it and every assertion in section 4 fails.
function buildDomFromTermBar(html) {
  const src = html.replace(/<!--[\s\S]*?-->/g, '');
  const open = src.indexOf('<div class="term-bar">');
  if (open === -1) return null;

  const makeEl = (tag, id, className) => ({
    tagName: tag, id: id || '', className: className || '',
    children: [], attrs: {}, textContent: '', hidden: false, disabled: false, listeners: {},
    appendChild(c) { this.children.push(c); c.parent = this; return c; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    addEventListener(k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); },
    querySelector(sel) {
      const byId = sel.charAt(0) === '#';
      const want = sel.slice(1);
      const walk = (node) => {
        for (const c of node.children) {
          if (byId ? c.id === want : (c.className || '').split(/\s+/).indexOf(want) !== -1) return c;
          const deeper = walk(c);
          if (deeper) return deeper;
        }
        return null;
      };
      return walk(this);
    },
  });

  const root = makeEl('div', '', 'term-bar');
  const stack = [root];
  const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
  TAG.lastIndex = open + '<div class="term-bar">'.length;
  let m;
  while ((m = TAG.exec(src)) !== null) {
    const [, closing, tag, attrs] = m;
    if (closing) {
      stack.pop();
      if (stack.length === 0) break;   // the .term-bar close tag
      continue;
    }
    const id = (/\bid="([^"]*)"/.exec(attrs) || [])[1] || '';
    const cls = (/\bclass="([^"]*)"/.exec(attrs) || [])[1] || '';
    const el = makeEl(tag, id, cls);
    stack[stack.length - 1].appendChild(el);
    // Void elements and self-closing tags do not open a scope.
    if (!/\/\s*$/.test(attrs) && ['input', 'br', 'img', 'hr', 'meta', 'link'].indexOf(tag) === -1) {
      stack.push(el);
    }
  }
  return root;
}

const termBar = buildDomFromTermBar(indexSrc);
process.stdout.write('\nthe production resolver finds the host in a DOM built from that markup\n');
{
  assert(termBar !== null, 'the .term-bar subtree was parsed out of the real index.html');
  const realDoc = {
    createElement: (tag) => ({
      tagName: tag, id: '', className: '', children: [], attrs: {}, textContent: '',
      hidden: false, disabled: false, listeners: {},
      appendChild(c) { this.children.push(c); c.parent = this; return c; },
      setAttribute(k, v) { this.attrs[k] = v; },
      getAttribute(k) { return this.attrs[k]; },
      addEventListener(k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); },
      querySelector(sel) {
        const byId = sel.charAt(0) === '#';
        const want = sel.slice(1);
        const walk = (node) => {
          for (const c of node.children) {
            if (byId ? c.id === want : (c.className || '').split(/\s+/).indexOf(want) !== -1) return c;
            const deeper = walk(c);
            if (deeper) return deeper;
          }
          return null;
        };
        return walk(this);
      },
    }),
    querySelector(sel) { return (sel === '.term-bar' && termBar) ? termBar : null; },
  };

  const host = badgeMod.resolveSetupHost(realDoc);
  assert(host !== null, 'resolveSetupHost returns a node');
  eq(host.id, 'paneStatusHost', 'and it is the #paneStatusHost placeholder from the real markup');

  // The `.tts-controls` sibling proves we really parsed the toolbar rather than an empty stub.
  assert(termBar.querySelector('.tts-controls') !== null,
    'NEGATIVE CONTROL: the parsed toolbar really contains .tts-controls, so the tree is the real one');
  assert(termBar.querySelector('#newTermShell') !== null, 'and #newTermShell');

  // ---- the control mounts THROUGH PRODUCTION WIRING: a document and a bridge, nothing else
  const calls = [];
  const bridge = {
    getSetupState: async () => ({ ok: true, setup: { state: 'disabled' } }),
    install: async () => { calls.push('install'); return { ok: true, setup: { state: 'ready' } }; },
    remove: async () => { calls.push('remove'); return { ok: true, setup: { state: 'disabled' } }; },
    clearStaleLock: async () => { calls.push('clearStaleLock'); return { ok: false, reason: 'x' }; },
  };
  const control = badgeMod.createSetupControl({ document: realDoc, bridge, log: () => {} });

  (async () => {
    await control.refresh();
    eq(control.currentState(), 'disabled', 'the control reads its state and renders');
    const mounted = host.querySelector('.pane-status-setup');
    assert(mounted !== null, 'and it MOUNTED INTO the real markup host — no injected toolbar anywhere');
    eq(host.querySelector('.pane-status-setup-action').textContent, 'Set up', 'offering "Set up"');

    await control.onAction();
    assert(calls.indexOf('install') !== -1, 'the Set up action reaches bridge.install()');
    eq(control.currentState(), 'ready', 'and the control follows the state main returned');

    // ---- fallback and failure, both from the production resolver
    const hostless = {
      querySelector: (sel) => (sel === '.term-bar' ? { querySelector: () => null } : null),
    };
    assert(badgeMod.resolveSetupHost(hostless) !== null,
      'with the placeholder gone the resolver falls back to the toolbar itself');
    eq(badgeMod.resolveSetupHost({ querySelector: () => null }), null,
      'with no .term-bar at all it returns null rather than inventing a mount point');
    eq(badgeMod.resolveSetupHost(null), null, 'and a missing document is null, not a throw');

    process.stdout.write(`\npane-status-setup-mount: ${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
  })();
}
