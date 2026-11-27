'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const renderer = path.join(__dirname, '..', 'renderer');
const noop = () => {};

class Element {
  constructor(tag, id = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.children = [];
    this.attributes = new Map();
    this.className = '';
    this.value = '';
    this._text = '';
    this.classList = {
      toggle: (name, force = !this.classList.contains(name)) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        if (force) classes.add(name); else classes.delete(name);
        this.className = [...classes].join(' ');
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
      add: (name) => this.classList.toggle(name, true),
      remove: (name) => this.classList.toggle(name, false),
    };
  }
  get options() { return this.children; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  set textContent(text) { this._text = String(text); this.children = []; }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener() {}
  querySelector(selector) {
    if (!selector.startsWith('.')) throw new Error(`Unsupported fixture selector: ${selector}`);
    const name = selector.slice(1);
    for (const child of this.children) {
      if (child.classList.contains(name)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}

class Terminal {
  constructor(options) {
    this.options = options;
    this.cols = 80;
    this.rows = 24;
    this.unicode = {};
    this.parser = { registerOscHandler: noop };
  }
  loadAddon() {}
  open() {}
  onData() {}
  onResize() {}
  attachCustomKeyEventHandler() {}
  onSelectionChange() { return { dispose: noop }; }
}

// Execute the page's real classic scripts in order. Stub Chromium/xterm, unrelated navigation
// widgets and the preload bridge so boot needs no display, native process, network or user files.
async function bootRenderer({ cc, admission }) {
  const html = fs.readFileSync(path.join(renderer, 'index.html'), 'utf8');
  const ids = new Map([...html.matchAll(/<([\w-]+)\b[^>]*\sid="([\w-]+)"/g)]
    .map(([, tag, id]) => [id, new Element(tag, id)]));
  const empty = ids.get('termEmpty');
  if (empty) empty.remove = () => ids.delete('termEmpty');
  const document = {
    documentElement: new Element('html'),
    createElement: (tag) => Object.assign(new Element(tag), { ownerDocument: document }),
    getElementById: (id) => ids.get(id) || null,
    querySelector: (selector) => selector.startsWith('#') ? ids.get(selector.slice(1)) || null : null,
    querySelectorAll: () => [],
    addEventListener: noop,
  };
  const context = vm.createContext({
    document, Terminal,
    cc: {
      onMainError: noop, onMainInfo: noop, onPtyData: noop, onPtyExit: noop, onClaudeVideoScoutEvent: noop,
      getSettings: async () => ({ authority: 'medium' }), saveSettings: async () => ({ ok: true }),
      getGeminiKeyStatus: async () => ({ ok: true }), getAgentTokenStatus: async () => ({ ok: true }),
      listRepos: async () => ({ repos: [] }), quickLinksPresetsList: async () => ({ ok: true, presets: [] }),
      quickLinksList: async () => ({ ok: true, config: { schemaVersion: 1, entries: [] } }),
      sessionResumeOffer: async () => ({ ok: true, rows: [] }),
      sessionHygieneList: async () => ({ ok: true, idle: [] }),
      buildInfo: async () => ({ label: 'Fixture build' }), ...cc,
    },
    ccAdmission: admission, ccDockview: { enabled: false },
    ccShellNav: { createShell: () => ({ refreshScope: noop }), createPushToTalk: () => ({}) },
    ccEmblemRail: { createEmblemRail: () => ({ render: noop }) },
    addEventListener: noop, setTimeout: noop, setInterval: noop,
    ResizeObserver: class { observe() {} },
    FitAddon: { FitAddon: class { fit() {} } }, WebLinksAddon: { WebLinksAddon: class {} },
    Unicode11Addon: { Unicode11Addon: class {} }, WebglAddon: { WebglAddon: class { onContextLoss() {} } },
  });
  context.window = context;

  const runScript = (name) => vm.runInContext(fs.readFileSync(path.join(renderer, name), 'utf8'), context,
    { filename: name, timeout: 5000 });
  for (const [, name] of html.matchAll(/<script src="([\w./-]+\.js)"><\/script>/g)) {
    if (name.startsWith('vendor/') || name === 'shell-nav.js' || name === 'emblem-rail.js') continue;
    if (name !== 'app.js') { runScript(name); continue; }
    let timer;
    try {
      await Promise.race([runScript(name), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Renderer boot did not settle')), 5000);
      })]);
    } finally {
      clearTimeout(timer);
    }
    if (document.title !== 'Fixture build') throw new Error('Renderer did not reach its build label during boot');
    return document;
  }
  throw new Error('The renderer page did not load app.js');
}

module.exports = { bootRenderer };
