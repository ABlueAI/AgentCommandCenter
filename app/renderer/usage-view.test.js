'use strict';
// Run: node app/renderer/usage-view.test.js
// S11: the usage panel's text, countdowns, 90% warning, setup copy and routines button.

const fs = require('fs');
const path = require('path');
const { createUsageView, summarize, describeWindow, formatDuration, ROUTINES_URL, POLL_MS } = require('./usage-view');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
function eq(actual, expected, label) { assert(actual === expected, `${label} (got ${JSON.stringify(actual)})`); }

class Classes {
  constructor(owner) { this.owner = owner; }
  values() { return this.owner.className.split(/\s+/).filter(Boolean); }
  toggle(name, force) {
    const set = new Set(this.values());
    const add = force === undefined ? !set.has(name) : force;
    if (add) set.add(name); else set.delete(name);
    this.owner.className = [...set].join(' ');
  }
  contains(name) { return this.values().includes(name); }
}
class Element {
  constructor(id) { this.id = id; this.className = ''; this.classList = new Classes(this); this.textContent = ''; this.attributes = {}; this.onclick = null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}
function makeDocument() {
  const ids = {};
  for (const id of ['usagePanel', 'usageFive', 'usageWeek', 'usageNote', 'usageSetup', 'usageRoutines']) ids[id] = new Element(id);
  ids.usageSetup.className = 'hidden';
  return { ids, getElementById: (id) => ids[id] || null };
}

const NOW = 1792850000000;
const H = 3600 * 1000;
const S = (ms) => Math.floor(ms / 1000);
const ok = (five, week, capturedAt = NOW - 60000) => ({
  ok: true, state: 'ok', capturedAt,
  fiveHour: five, sevenDay: week, setupLine: '"statusLine": {}',
});

process.stdout.write('\nformatDuration\n');
eq(formatDuration(0), '0m', 'zero');
eq(formatDuration(30 * 1000), '<1m', 'under a minute');
eq(formatDuration(45 * 60000), '45m', 'minutes');
eq(formatDuration(3 * H + 12 * 60000), '3h 12m', 'hours and minutes');
eq(formatDuration(2 * 24 * H + 4 * H + 5 * 60000), '2d 4h', 'days and hours');

process.stdout.write('\ndescribeWindow\n');
{
  const d = describeWindow('5h', { usedPercentage: 42.3, resetsAt: S(NOW + 72 * 60000) }, NOW);
  eq(d.text, '5h 42% · 1h 12m', 'percentage and countdown');
  assert(!d.warn, 'under 90%: no warning');
  assert(describeWindow('5h', { usedPercentage: 90, resetsAt: S(NOW + H) }, NOW).warn, '90% exactly: warning');
  assert(!describeWindow('5h', { usedPercentage: 89.9, resetsAt: S(NOW + H) }, NOW).warn, '89.9%: no warning');
  const r = describeWindow('Week', { usedPercentage: 97, resetsAt: S(NOW - 1000) }, NOW);
  eq(r.text, 'Week reset', 'a window past its reset shows as reset');
  assert(!r.warn, 'and no longer warns');
  eq(describeWindow('5h', null, NOW).text, '5h –', 'absent window: a dash');
}

process.stdout.write('\nsummarize\n');
{
  const s = summarize(ok({ usedPercentage: 42, resetsAt: S(NOW + H) }, { usedPercentage: 18, resetsAt: S(NOW + 50 * H) }), NOW);
  eq(s.five.text, '5h 42% · 1h 0m', 'five-hour text');
  eq(s.week.text, 'Week 18% · 2d 2h', 'weekly text');
  eq(s.note, '', 'fresh, under 90%: no note');
  assert(!s.warn && !s.showSetup, 'no warning, no setup button');

  const w = summarize(ok({ usedPercentage: 30, resetsAt: S(NOW + H) }, { usedPercentage: 92, resetsAt: S(NOW + 50 * H) }), NOW);
  assert(w.warn && w.note.includes('90%+') && w.note.includes('pause the runner'), 'weekly at 92%: the warning shows');

  const stale = summarize(ok({ usedPercentage: 10, resetsAt: S(NOW + 4 * H) }, null, NOW - 40 * 60000), NOW);
  eq(stale.note, 'as of 40m ago', 'old figures say how old they are');

  const ns = summarize({ ok: true, state: 'not-set-up', setupLine: 'x' }, NOW);
  assert(ns.showSetup && ns.note.startsWith('Not set up'), 'not set up: the setup button and a note');

  const bad = summarize({ ok: false, reason: 'usage-file-malformed', setupLine: 'x' }, NOW);
  eq(bad.note, 'Usage unavailable (usage-file-malformed)', 'a refusal is shown with its reason');
  eq(summarize({ ok: false, reason: '<img src=x>' }, NOW).note, 'Usage unavailable (unknown-error)', 'an unexpected reason is bounded');
  eq(summarize(undefined, NOW).note, 'Usage unavailable (unknown-error)', 'no result at all is visible too');
}

process.stdout.write('\ncontroller\n');
(async () => {
  {
    const doc = makeDocument();
    const logs = [];
    const opened = [];
    const copied = [];
    let polled = null;
    let result = ok({ usedPercentage: 42, resetsAt: S(NOW + H) }, { usedPercentage: 18, resetsAt: S(NOW + 50 * H) });
    const view = createUsageView({
      document: doc,
      api: { read: async () => result, copy: async (t) => { copied.push(t); return { ok: true }; }, openExternal: (u) => { opened.push(u); } },
      log: (l) => logs.push(l),
      now: () => NOW,
      setInterval: (fn, ms) => { polled = { fn, ms }; },
    });
    await view.mount();
    eq(doc.ids.usageFive.textContent, '5h 42% · 1h 0m', 'mount renders the five-hour window');
    eq(doc.ids.usageWeek.textContent, 'Week 18% · 2d 2h', 'and the weekly one');
    assert(doc.ids.usageSetup.classList.contains('hidden'), 'setup button hidden once set up');
    assert(polled && polled.ms === POLL_MS, 'polls every 30 seconds');

    doc.ids.usageRoutines.onclick();
    eq(opened.length === 1 && opened[0], ROUTINES_URL, 'Pause runner opens claude.ai/code/routines');
    eq(ROUTINES_URL, 'https://claude.ai/code/routines', 'the routines URL');

    result = ok({ usedPercentage: 91, resetsAt: S(NOW + H) }, { usedPercentage: 18, resetsAt: S(NOW + 50 * H) });
    await polled.fn();
    await new Promise((r) => setImmediate(r));
    assert(doc.ids.usagePanel.classList.contains('usage-warn'), 'at 91% the panel is marked as a warning');
    assert(doc.ids.usageNote.textContent.includes('90%+'), 'and says so');
    eq(logs.filter((l) => l.startsWith('[usage]')).length, 1, 'the warning is logged once');
    await view.refresh();
    eq(logs.filter((l) => l.startsWith('[usage]')).length, 1, 'not again on the next poll in the same window');

    result = { ok: true, state: 'not-set-up', setupLine: '"statusLine": {"type":"command"}' };
    await view.refresh();
    assert(!doc.ids.usagePanel.classList.contains('usage-warn'), 'warning cleared');
    assert(!doc.ids.usageSetup.classList.contains('hidden'), 'not set up: the setup button shows');
    await view.copySetup();
    eq(copied[0], '"statusLine": {"type":"command"}', 'Set up copies the main-built line');
    assert(doc.ids.usageNote.textContent.includes('step 41'), 'and points at the checklist step');
  }
  {
    const doc = makeDocument();
    const logs = [];
    const view = createUsageView({
      document: doc,
      api: { read: async () => { throw new Error('ipc down'); }, copy: async () => ({ ok: false }), openExternal: () => {} },
      log: (l) => logs.push(l),
      now: () => NOW,
      setInterval: () => {},
    });
    await view.mount();
    eq(doc.ids.usageNote.textContent, 'Usage unavailable (usage-read-failed)', 'a failed read shows, never a blank panel');
    const r = await view.copySetup();
    assert(!r.ok && logs.some((l) => l.includes('no setup line')), 'copy with nothing to copy is logged');
  }
  {
    let threw = 0;
    try { createUsageView({ document: { getElementById: () => null }, api: { read() {}, copy() {}, openExternal() {} } }); } catch { threw += 1; }
    try { createUsageView({ document: makeDocument(), api: {} }); } catch { threw += 1; }
    eq(threw, 2, 'missing elements or API refuse at construction');
  }

  process.stdout.write('\nmarkup\n');
  {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    for (const id of ['usagePanel', 'usageFive', 'usageWeek', 'usageNote', 'usageSetup', 'usageRoutines']) {
      assert(html.includes(`id="${id}"`), `index.html has #${id}`);
    }
    assert(html.indexOf('<script src="usage-view.js"></script>') < html.indexOf('<script src="app.js"></script>'), 'usage-view.js loads before app.js');
    const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    assert(/read: \(\) => cc\.usageRead\(\),/.test(app) && /usageView\.mount\(\);/.test(app), 'app.js builds and mounts the view');
  }

  process.stdout.write(`\nusage-view: ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
})();
