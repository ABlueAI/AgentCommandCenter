'use strict';
// S20: the aquarium tab (docs/DESIGN-BRIEF-1.1.md section 6). The MVP only: one tank, three
// species, a crew list, one creature per live pane in the pane's state colour, and a click (or Enter
// on a crew row) opens the pane in the control room. Each creature stores its pane's id (the
// agentId), and that id is the only thing a click hands back to app.js.
//
// Drawn on a canvas with the small engine forked from Pixel Agents 1.6.0 (aquarium-engine.js; record:
// docs/decisions/OSS-pixel-agents.md). The fish art below is Mako's own, made for this tab: three
// stylized species, free art until 1.2's revamp ("hyper realistic is the final goal"). Builder,
// reviewer and scout are the brief's default species (question 11).
//
// What this module may know about a pane: its id, its title, its repo label, its role word and its
// pane-status state word (S06/S07's advisory hook view). It never writes to a pane. Every visible
// value reaches the DOM as text (createElement and textContent), never as HTML.
//
// Motion rules (brief 3.6): the tank draws only while its tab is showing and the window is visible
// (hidden means stopped), and under reduced motion the fish hold still (no swimming, bobbing or
// blinking) but keep their colours. A state change is announced politely in a live region, with the
// state's word, never by colour alone.
//
// Dual browser-<script> / CommonJS module: the pure parts are unit-tested in plain node
// (aquarium.test.js), the DOM and canvas parts in a real Electron renderer (aquarium-app-harness.js).

(function publish(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ccAquarium = api;
})(typeof window !== 'undefined' ? window : globalThis, function factory() {
  // ---- species -----------------------------------------------------------------------------------
  // Species shows the role (brief 6). Mako's roles map onto three species; a pane started without a
  // role (a plain Claude, Codex or shell pane) is a builder, the default kind of work in Mako.
  const SPECIES = Object.freeze([
    Object.freeze({ id: 'builder', label: 'Builder', roles: Object.freeze(['builder', 'operator']) }),
    Object.freeze({ id: 'reviewer', label: 'Reviewer', roles: Object.freeze(['reviewer']) }),
    Object.freeze({ id: 'scout', label: 'Scout', roles: Object.freeze(['codebase-scout', 'web-scout', 'source-scout', 'video-scout', 'page-reader']) }),
  ]);
  const SPECIES_IDS = SPECIES.map((s) => s.id);
  function speciesForRole(role) {
    if (typeof role === 'string') {
      for (const s of SPECIES) if (s.roles.includes(role)) return s.id;
    }
    return 'builder';
  }
  function speciesLabel(id) { const s = SPECIES.find((x) => x.id === id); return s ? s.label : 'Builder'; }

  // ---- state -> colour and word --------------------------------------------------------------------
  // The pane-status words (pane-status-badge.js) onto the brief's status tokens (3.1, 3.2): red needs
  // you, blue working, green turn ended, grey idle or gone. "failed" is red too: it needs Blue. The
  // word always goes with the colour.
  const STATE_STYLE = Object.freeze({
    attention: Object.freeze({ token: 'status-needs', word: 'Needs you', rank: 0 }),
    failed: Object.freeze({ token: 'status-needs', word: 'Failed', rank: 1 }),
    working: Object.freeze({ token: 'status-working', word: 'Working', rank: 2 }),
    'turn ended': Object.freeze({ token: 'status-ended', word: 'Turn ended', rank: 3 }),
    idle: Object.freeze({ token: 'status-idle', word: 'Idle', rank: 4 }),
    exited: Object.freeze({ token: 'status-idle', word: 'Exited', rank: 5 }),
    unknown: Object.freeze({ token: 'status-idle', word: 'Status unknown', rank: 6 }),
  });
  function normalizeState(state) {
    return typeof state === 'string' && Object.prototype.hasOwnProperty.call(STATE_STYLE, state) ? state : 'unknown';
  }
  function stateStyle(state) { return STATE_STYLE[normalizeState(state)]; }

  // ---- colours -----------------------------------------------------------------------------------
  function parseHex(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) { const e = new Error('bad-colour'); e.kind = 'bad-colour'; throw e; }
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function toHex(rgb) { return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
  // Mix a colour toward another by t (0 = a, 1 = b).
  function mix(a, b, t) { const x = parseHex(a); const y = parseHex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); }

  // ---- the fish (Mako's own pixel art) -------------------------------------------------------------
  // One character per pixel: '.' transparent, 'O' outline, 'B' body (the state colour), 'D' belly
  // shade, 'F' fins (lighter), 'E' eye white, 'P' pupil. Every fish faces left; swimming right flips it.
  // `body` is a pixel that is always 'B': the point the end-to-end test samples for the colour.
  const FISH = Object.freeze({
    builder: Object.freeze({
      rows: Object.freeze([
        '.....OOOOO......',
        '...OOFFFFFOO...O',
        '..OBBBBBBBBBO.OF',
        '.OBEPBBBBBBBBOFF',
        'OBBEEBBBBBBBBBFF',
        '.OBBBBBBBBBBBOFF',
        '..ODDDDDDDDDO.OF',
        '...OODDDDDOO...O',
        '.....OOOOO......',
      ]),
      body: Object.freeze([8, 4]),
      speed: 7,
    }),
    reviewer: Object.freeze({
      rows: Object.freeze([
        '.....O......',
        '....OFO.....',
        '...OFFO.....',
        '..OBBBBO....',
        '.OEPBBBBO..O',
        'OBEEBBBBBOOF',
        'OBBBBBBBBBFF',
        '.OBBBBBBBOOF',
        '..ODDDDDO..O',
        '...ODDDO....',
        '....OFFO....',
        '.....OFO....',
        '......O.....',
      ]),
      body: Object.freeze([5, 6]),
      speed: 5,
    }),
    scout: Object.freeze({
      rows: Object.freeze([
        '..OOOOOOOOOOO.....',
        '.OBBBBBBBBBBBOO..O',
        'OEPBBBBBBBBBBBBOFF',
        'OBBBBBBBBBBBBBBOFF',
        '.ODDDDDDDDDDDOO..O',
        '..OOOOOOOOOOO.....',
      ]),
      body: Object.freeze([8, 3]),
      speed: 10,
    }),
  });
  const OUTLINE = '#021010';
  const EYE = '#eaf5f3';
  const PUPIL = '#0b1020';

  // The permission bubble from Pixel Agents 1.6.0 (webview-ui/src/office/sprites/bubble-permission.json,
  // MIT), with its amber dots drawn in the needs-you red instead (brief question 16: permission is red).
  const BUBBLE_ROWS = Object.freeze([
    'BBBBBBBBBBB',
    'BFFFFFFFFFB',
    'BFFFFFFFFFB',
    'BFFFFFFFFFB',
    'BFFFFFFFFFB',
    'BFFAFAFAFFB',
    'BFFFFFFFFFB',
    'BFFFFFFFFFB',
    'BFFFFFFFFFB',
    'BBBBBBBBBBB',
    '____BBB____',
    '_____B_____',
    '___________',
  ]);

  /** A fish as SpriteData (rows of colour strings, '' transparent) in the given body colour. */
  function fishSprite(species, bodyColour, opts) {
    const fish = FISH[species] || FISH.builder;
    const shut = !!(opts && opts.eyesShut);
    const flip = !!(opts && opts.facingRight);
    const shade = mix(bodyColour, '#000000', 0.3);
    const fin = mix(bodyColour, '#ffffff', 0.35);
    const map = { '.': '', O: OUTLINE, B: bodyColour, D: shade, F: fin, E: shut ? shade : EYE, P: shut ? shade : PUPIL };
    const out = fish.rows.map((row) => Array.from(row, (ch) => map[ch]));
    return flip ? out.map((r) => r.slice().reverse()) : out;
  }
  function bubbleSprite(needsColour) {
    const map = { _: '', B: '#555566', F: '#EEEEFF', A: needsColour };
    return BUBBLE_ROWS.map((row) => Array.from(row, (ch) => map[ch]));
  }
  function fishSize(species) { const f = FISH[species] || FISH.builder; return { w: f.rows[0].length, h: f.rows.length }; }

  // ---- layout ------------------------------------------------------------------------------------
  // Higher = more urgent, the same rule as the brain stage (brief question 2): needs-you fish swim
  // near the top, working ones in the middle, the rest low. Within a band, fish spread by order.
  function bandFor(state) {
    const s = normalizeState(state);
    if (s === 'attention' || s === 'failed') return [0.12, 0.3];
    if (s === 'working') return [0.35, 0.6];
    return [0.62, 0.82];
  }
  function targetY(state, slot, slots, tankH, fishH) {
    const [a, b] = bandFor(state);
    const t = slots <= 1 ? 0.5 : slot / (slots - 1);
    const y = Math.round((a + (b - a) * t) * tankH - fishH / 2);
    return Math.max(1, Math.min(tankH - fishH - 4, y));
  }
  function zoomFor(width) { return width >= 1000 ? 6 : width >= 640 ? 5 : 4; }
  // How fast a fish swims in each state, as a share of its species' speed.
  function speedFactor(state) {
    const s = normalizeState(state);
    if (s === 'working') return 1.6;
    if (s === 'attention' || s === 'failed') return 0; // it stops and waits at the top
    if (s === 'exited') return 0.25;
    return 0.6;
  }

  function refusal(kind) { const e = new Error(kind); e.kind = kind; return e; }
  function text(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
  function h(doc, tag, opts, children) {
    const n = doc.createElement(tag);
    const o = opts || {};
    if (o.className) n.className = o.className;
    if (o.text !== undefined) n.textContent = o.text;
    if (o.attrs) for (const [k, v] of Object.entries(o.attrs)) n.setAttribute(k, v);
    for (const c of children || []) n.appendChild(c);
    return n;
  }

  // ---- the view ----------------------------------------------------------------------------------
  function createAquarium(deps) {
    const d = deps || {};
    const { doc, host, engine, tokens } = d;
    if (!doc || !host) throw refusal('host-missing');
    if (!engine || typeof engine.startGameLoop !== 'function') throw refusal('engine-missing');
    if (!tokens || !tokens.SHARED_TOKENS) throw refusal('tokens-missing');
    const log = typeof d.log === 'function' ? d.log : () => {};
    const onOpenPane = typeof d.onOpenPane === 'function' ? d.onOpenPane : null;
    if (!onOpenPane) throw refusal('open-pane-missing');
    const reducedMotion = typeof d.prefersReducedMotion === 'function' ? d.prefersReducedMotion : () => false;
    const rand = typeof d.rand === 'function' ? d.rand : Math.random;
    const colourOf = (token) => tokens.SHARED_TOKENS[token];
    const focusColour = (tokens.TAB_TOKENS && tokens.TAB_TOKENS.aquarium && tokens.TAB_TOKENS.aquarium.focus) || '#9fe6ff';

    const title = h(doc, 'p', { className: 'mk-overline mk-aq-title', attrs: { id: 'makoTankTitle' } });
    const canvas = h(doc, 'canvas', { className: 'mk-aq-canvas', attrs: { id: 'makoTank', role: 'img', 'aria-describedby': 'makoCrewTitle' } });
    const note = h(doc, 'p', { className: 'mk-meta mk-aq-note', attrs: { id: 'makoTankNote', role: 'status' } });
    const tankWrap = h(doc, 'div', { className: 'mk-aq-tank' }, [title, canvas, note]);
    const crewList = h(doc, 'ul', { className: 'mk-aq-crew-list', attrs: { id: 'makoCrewList', 'aria-labelledby': 'makoCrewTitle' } });
    const crewEmpty = h(doc, 'p', { className: 'mk-meta', text: 'No live panes. Start an agent in the control room and its creature appears here.', attrs: { id: 'makoCrewEmpty' } });
    const crew = h(doc, 'section', { className: 'mk-aq-crew', attrs: { 'aria-labelledby': 'makoCrewTitle' } }, [
      h(doc, 'h2', { className: 'mk-overline', text: 'Crew', attrs: { id: 'makoCrewTitle' } }),
      crewEmpty, crewList,
    ]);
    const live = h(doc, 'div', { className: 'mk-aq-sr', attrs: { id: 'makoAquariumLive', 'aria-live': 'polite', role: 'log' } });
    const rootEl = h(doc, 'div', { className: 'mk-aq', attrs: { id: 'makoAquarium' } }, [tankWrap, crew, live]);
    host.appendChild(rootEl);

    // agentId (the pane's id) -> creature. The id is stored on the creature and on its crew row, and
    // is all a click hands back.
    const creatures = new Map();
    let order = [];
    let tank = { w: 240, h: 90, zoom: 3 };
    let shown = false;
    let loop = null;
    let broken = null;
    let hoverId = null;
    let t = 0;
    const spriteCache = new Map();

    function sprite(c, shut) {
      const key = `${c.species}|${c.colour}|${shut ? 1 : 0}|${c.facingRight ? 1 : 0}`;
      let s = spriteCache.get(key);
      if (!s) { s = fishSprite(c.species, c.colour, { eyesShut: shut, facingRight: c.facingRight }); spriteCache.set(key, s); }
      return s;
    }
    let bubble = null;
    function bubbleSpriteOnce() { if (!bubble) bubble = bubbleSprite(colourOf('status-needs')); return bubble; }

    function setNote(message, isError) {
      note.textContent = message || '';
      note.classList.toggle('mk-aq-note-error', !!isError);
    }

    function resize() {
      const room = Math.floor(tankWrap.clientWidth || 0);
      const cssW = room > 0 ? Math.max(240, room) : 720;
      const cssH = 360;
      const zoom = zoomFor(cssW);
      if (canvas.width !== cssW || canvas.height !== cssH) { canvas.width = cssW; canvas.height = cssH; }
      tank = { w: Math.floor(cssW / zoom), h: Math.floor(cssH / zoom), zoom };
      for (const c of creatures.values()) placeIn(c, false);
      if (loop) loop.redraw();
    }

    // Keep a fish inside the tank and give it its band's height.
    function placeIn(c, jump) {
      const { w, h: fh } = fishSize(c.species);
      const peers = order.filter((id) => { const o = creatures.get(id); return o && bandFor(o.state)[0] === bandFor(c.state)[0]; });
      const slot = Math.max(0, peers.indexOf(c.agentId));
      c.ty = targetY(c.state, slot, peers.length, tank.h, fh);
      c.x = Math.max(1, Math.min(tank.w - w - 1, c.x));
      if (jump || reducedMotion()) c.y = c.ty;
    }

    function update(panes) {
      const list = Array.isArray(panes) ? panes : [];
      const seen = new Set();
      const changes = [];
      for (const p of list.slice(0, 64)) {
        if (!p || typeof p.id !== 'string' || !p.id || seen.has(p.id)) continue;
        seen.add(p.id);
        const state = normalizeState(p.status);
        const style = stateStyle(state);
        const species = speciesForRole(p.role);
        let c = creatures.get(p.id);
        if (!c) {
          const { w } = fishSize(species);
          c = {
            agentId: p.id, species, state, word: style.word, colour: colourOf(style.token),
            title: text(p.title, 80) || p.id, repo: text(p.repo, 60),
            x: Math.round(rand() * Math.max(1, tank.w - w - 2)) + 1, y: 0, ty: 0,
            dir: rand() < 0.5 ? -1 : 1, facingRight: false, phase: rand() * Math.PI * 2,
            blink: engine.startBlink(rand), shut: false, since: Date.now(),
          };
          c.facingRight = c.dir > 0;
          creatures.set(p.id, c);
          order.push(p.id);
          placeIn(c, true);
        } else {
          if (c.state !== state) {
            changes.push(`${speciesLabel(species)} ${c.title}: ${style.word}`);
            c.since = Date.now();
          }
          c.state = state; c.word = style.word; c.colour = colourOf(style.token); c.species = species;
          c.title = text(p.title, 80) || p.id; c.repo = text(p.repo, 60);
        }
      }
      for (const id of Array.from(creatures.keys())) {
        if (!seen.has(id)) { creatures.delete(id); if (hoverId === id) hoverId = null; }
      }
      order = order.filter((id) => creatures.has(id));
      for (const c of creatures.values()) placeIn(c, false);
      renderCrew();
      if (changes.length) live.textContent = changes.slice(-3).join('. ');
      // A showing tank draws the new colours on its next frame; a hidden one draws nothing until
      // it shows (setShown redraws at once).
    }

    function sortedCreatures() {
      return order.map((id) => creatures.get(id)).filter(Boolean)
        .sort((a, b) => stateStyle(a.state).rank - stateStyle(b.state).rank || a.since - b.since);
    }

    function renderCrew() {
      while (crewList.firstChild) crewList.removeChild(crewList.firstChild);
      const list = sortedCreatures();
      crewEmpty.hidden = list.length > 0;
      for (const c of list) {
        const dot = h(doc, 'span', { className: 'mk-aq-dot', attrs: { 'aria-hidden': 'true' } });
        dot.style.background = c.colour;
        const btn = h(doc, 'button', {
          className: 'mk-aq-row',
          attrs: { type: 'button', 'data-agent-id': c.agentId, 'data-state': c.state, 'data-species': c.species, title: `Open ${c.title} in the control room` },
        }, [
          dot,
          h(doc, 'span', { className: 'mk-aq-species', text: speciesLabel(c.species) }),
          h(doc, 'span', { className: 'mk-aq-task', text: c.title }),
          h(doc, 'span', { className: 'mk-aq-state', text: c.word }),
          h(doc, 'span', { className: 'mk-aq-repo mk-meta', text: c.repo || 'No repo' }),
        ]);
        btn.addEventListener('click', () => open(c.agentId));
        crewList.appendChild(h(doc, 'li', {}, [btn]));
      }
      const n = list.length;
      const needs = list.filter((c) => c.state === 'attention' || c.state === 'failed').length;
      canvas.setAttribute('aria-label', n === 0 ? 'The tank is empty: no live panes.'
        : `The tank: ${n} creature${n === 1 ? '' : 's'}, one per live pane${needs ? `; ${needs} need${needs === 1 ? 's' : ''} you` : ''}. The crew list below names each one.`);
      if (!broken) setNote(n === 0 ? 'No live panes.' : '', false);
    }

    function open(agentId) {
      try {
        onOpenPane(agentId);
      } catch (e) {
        const kind = e && typeof e.kind === 'string' ? e.kind : 'open-failed';
        setNote(`That pane could not be opened (${kind}).`, true);
        log(`[aquarium] REFUSED: could not open pane ${String(agentId).slice(0, 40)} (${kind})\n`);
      }
    }

    // ---- drawing ----
    function step(dt) {
      t += dt;
      const still = reducedMotion();
      for (const c of creatures.values()) {
        const { w } = fishSize(c.species);
        if (still) { c.y = c.ty; c.shut = false; continue; }
        const v = FISH[c.species].speed * speedFactor(c.state);
        c.x += c.dir * v * dt;
        if (c.x < 1) { c.x = 1; c.dir = 1; }
        if (c.x > tank.w - w - 1) { c.x = tank.w - w - 1; c.dir = -1; }
        if (v > 0) c.facingRight = c.dir > 0;
        // Ease toward the band: a state change shows within about a second.
        const k = Math.min(1, dt * 3);
        c.y += (c.ty - c.y) * k;
        c.shut = engine.tickBlink(c.blink, dt, c.state === 'working', rand);
      }
    }
    function bob(c) { return reducedMotion() ? 0 : Math.round(Math.sin(t * 2 + c.phase)); }
    function draw(ctx) {
      const z = tank.zoom;
      const sunken = (tokens.TAB_TOKENS && tokens.TAB_TOKENS.aquarium && tokens.TAB_TOKENS.aquarium['surface-sunken']) || '#031213';
      const surface = (tokens.TAB_TOKENS && tokens.TAB_TOKENS.aquarium && tokens.TAB_TOKENS.aquarium.surface) || '#05191a';
      ctx.fillStyle = sunken;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Water: three bands, lighter toward the top. Sand: a strip with a pixel ripple.
      ctx.fillStyle = mix(surface, '#1b5a5e', 0.35);
      ctx.fillRect(0, 0, canvas.width, Math.round(canvas.height * 0.12));
      ctx.fillStyle = mix(surface, '#1b5a5e', 0.15);
      ctx.fillRect(0, Math.round(canvas.height * 0.12), canvas.width, Math.round(canvas.height * 0.3));
      const sandY = (tank.h - 3) * z;
      ctx.fillStyle = '#3d3a2a';
      ctx.fillRect(0, sandY, canvas.width, canvas.height - sandY);
      ctx.fillStyle = '#57513a';
      for (let x = 0; x < tank.w; x += 5) ctx.fillRect(x * z, sandY, 2 * z, z);
      // Fish, least urgent first so a needs-you fish is drawn on top.
      const list = sortedCreatures().reverse();
      for (const c of list) {
        const s = sprite(c, c.shut);
        const px = Math.round(c.x) * z;
        const py = (Math.round(c.y) + bob(c)) * z;
        if (hoverId === c.agentId) ctx.drawImage(engine.getCachedSprite(doc, engine.getOutlineSprite(s, focusColour), z), px - z, py - z);
        ctx.drawImage(engine.getCachedSprite(doc, s, z), px, py);
        if (c.state === 'attention') {
          const b = bubbleSpriteOnce();
          const { w } = fishSize(c.species);
          ctx.drawImage(engine.getCachedSprite(doc, b, z), px + Math.round((w - b[0].length) / 2) * z, py - (b.length - 1) * z);
        }
      }
    }

    function hitTest(cssX, cssY) {
      const z = tank.zoom;
      // Most urgent first: the fish drawn on top wins.
      for (const c of sortedCreatures()) {
        const { w, h: fh } = fishSize(c.species);
        const x = Math.round(c.x) * z;
        const y = (Math.round(c.y) + bob(c)) * z;
        if (cssX >= x && cssX < x + w * z && cssY >= y && cssY < y + fh * z) return c.agentId;
      }
      return null;
    }
    function toCanvas(e) {
      const r = canvas.getBoundingClientRect();
      const sx = r.width ? canvas.width / r.width : 1;
      const sy = r.height ? canvas.height / r.height : 1;
      return [(e.clientX - r.left) * sx, (e.clientY - r.top) * sy];
    }
    canvas.addEventListener('click', (e) => {
      const [x, y] = toCanvas(e);
      const id = hitTest(x, y);
      if (id) open(id);
    });
    canvas.addEventListener('mousemove', (e) => {
      const [x, y] = toCanvas(e);
      const id = hitTest(x, y);
      if (id !== hoverId) { hoverId = id; canvas.style.cursor = id ? 'pointer' : ''; }
    });
    canvas.addEventListener('mouseleave', () => { hoverId = null; canvas.style.cursor = ''; });

    function fail(kind) {
      broken = kind;
      setNote(`The tank can't draw here (${kind}). The crew list still opens each pane.`, true);
      log(`[aquarium] REFUSED: the tank stopped drawing (${kind})\n`);
    }
    try {
      loop = engine.startGameLoop(canvas, { update: step, render: draw, onError: fail }, d.frames);
      loop.pause(); // nothing draws until the tab shows
    } catch (e) {
      loop = null;
      fail(e && typeof e.kind === 'string' ? e.kind : 'start-failed');
    }

    function setShown(on) {
      const next = !!on;
      if (next === shown) return;
      shown = next;
      if (!loop) return;
      if (shown) { resize(); loop.resume(); } else loop.pause();
    }

    title.textContent = 'Tank';
    renderCrew();

    return {
      update,
      setShown,
      resize,
      setTankName: (name) => { title.textContent = text(name, 60) ? `Tank · ${text(name, 60)}` : 'Tank'; },
      // What each creature shows, for the end-to-end test and for S19 or S51 to read: its stored
      // agentId, species, state, colour, and where it is on the canvas (canvas pixels).
      creatures: () => sortedCreatures().map((c) => {
        const f = FISH[c.species];
        const { w, h: fh } = fishSize(c.species);
        const z = tank.zoom;
        const x = Math.round(c.x) * z;
        const y = (Math.round(c.y) + bob(c)) * z;
        const bx = c.facingRight ? w - 1 - f.body[0] : f.body[0];
        return {
          agentId: c.agentId, species: c.species, state: c.state, word: c.word, colour: c.colour,
          box: { x, y, w: w * z, h: fh * z },
          body: { x: x + bx * z + Math.floor(z / 2), y: y + f.body[1] * z + Math.floor(z / 2) },
        };
      }),
      creatureFor: (agentId) => { const c = creatures.get(agentId); return c ? { agentId: c.agentId, species: c.species, state: c.state } : null; },
      hitTest,
      state: () => ({ shown, broken, loop: loop ? loop.state() : null, zoom: tank.zoom, count: creatures.size }),
    };
  }

  return {
    SPECIES, SPECIES_IDS, STATE_STYLE, FISH, BUBBLE_ROWS,
    speciesForRole, speciesLabel, normalizeState, stateStyle, mix, fishSprite, bubbleSprite, fishSize,
    bandFor, targetY, zoomFor, speedFactor, createAquarium,
  };
});
