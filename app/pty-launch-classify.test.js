'use strict';
// Run: node app/pty-launch-classify.test.js
//
// MAIN-OWNED CLASSIFIER MATRIX.
//
// The positive controls use the REAL payload shapes the renderer sends, so this suite cannot pass by
// refusing everything: app/renderer/app.js:442 normalizes an unknown role to `role: null` for CLI and
// shell panes, and app/renderer/app.js:2102 launches Video Scout with role 'video-scout',
// videoScout:true and no cli/agent key.
//
// It also pins the AGREEMENT property: for every shape the classifier ACCEPTS, the independently
// written admission eligibility predicate must reach the same verdict. Before this module the two
// disagreed — main used loose `!opts.videoScout`, admission used strict `=== true`.

const { classifyPtyLaunch, KIND, REASON } = require('./pty-launch-classify');
const { isEligibleClaudePane } = require('./admission-pty-boundary');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  \u2713 ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
function section(t) { process.stdout.write('\n' + t + '\n'); }

const VALID_ROLES = new Set(['builder', 'reviewer', 'codebase-scout', 'web-scout', 'operator', 'source-scout']);
const FENCED_ROLES = new Set(['web-scout', 'operator', 'source-scout']);
const VALID_CLIS = new Set(['claude', 'codex', 'gemini']);
const DEPS = { validRoles: VALID_ROLES, fencedRoles: FENCED_ROLES, validClis: VALID_CLIS };
const go = (opts) => classifyPtyLaunch(opts, DEPS);

section('POSITIVE CONTROLS \u2014 the real renderer payload shapes');
for (const role of VALID_ROLES) {
  const r = go({ id: 'pty1', cwd: 'D:\\x', role, cli: 'claude', cols: 80, rows: 24 });
  assert(r.ok && r.kind === KIND.ROLE && r.role === role, 'role pane accepted: ' + role);
  assert(r.ok && r.fenced === FENCED_ROLES.has(role), 'fence verdict correct for ' + role);
}
{
  // app/renderer/app.js:2102 \u2014 exactly what the Video Scout modal sends.
  const r = go({ id: 'pty2', cwd: undefined, role: 'video-scout', videoScout: true, cli: null,
    videoUrl: 'https://youtu.be/x', videoModel: 'a', mediaResolution: 'b', analysisMode: 'transcript' });
  assert(r.ok && r.kind === KIND.VIDEO_SCOUT, 'Video Scout real payload accepted');
  assert(r.ok && r.fenced === false, 'Video Scout is deliberately UNFENCED');
  assert(r.ok && r.videoScout === true, 'Video Scout flag carried on the result');
}
for (const cli of VALID_CLIS) {
  // app/renderer/app.js:442 \u2014 role normalizes to null for an ordinary CLI pane.
  const r = go({ id: 'pty3', cwd: 'D:\\x', role: null, cli });
  assert(r.ok && r.kind === KIND.CLI && r.cli === cli, 'CLI pane accepted with role:null and cli=' + cli);
}
{
  const r = go({ id: 'pty4', cwd: 'D:\\x', role: null, cli: null });
  assert(r.ok && r.kind === KIND.SHELL, 'plain shell pane accepted with role:null and cli:null');
  const viaAgent = go({ id: 'pty5', role: null, agent: 'codex' });
  assert(viaAgent.ok && viaAgent.kind === KIND.CLI && viaAgent.cli === 'codex',
    'the legacy `agent` field is still honoured when `cli` is absent');
}

section('MISMATCHED role/cli/agent \u2014 ACCEPTED, role wins (disposition pinned)');
{
  const r = go({ id: 'p', cwd: 'D:\\x', role: 'web-scout', cli: 'codex' });
  assert(r.ok && r.kind === KIND.ROLE && r.role === 'web-scout' && r.cli === null,
    '{role:web-scout, cli:codex} classifies as web-scout and DISCARDS the codex hint');
  assert(r.ok && r.fenced === true, 'and it is still fenced');
  const b = go({ id: 'p', cwd: 'D:\\x', role: 'builder', agent: 'gemini' });
  assert(b.ok && b.kind === KIND.ROLE && b.role === 'builder' && b.fenced === false,
    '{role:builder, agent:gemini} classifies as builder, unfenced, gemini hint discarded');
}

section('HOSTILE \u2014 Video Scout coherence, both directions');
assert(go({ role: 'web-scout', videoScout: true }).reason === REASON.VIDEO_SCOUT_ROLE_MISMATCH,
  'a fenced role carrying videoScout:true refuses (cannot dodge the fence via the flag)');
assert(go({ role: 'video-scout' }).reason === REASON.VIDEO_SCOUT_ROLE_MISMATCH,
  'the video-scout identity without the flag refuses');
assert(go({ role: null, videoScout: true }).reason === REASON.VIDEO_SCOUT_ROLE_MISMATCH,
  'the flag without the identity refuses');
for (const bad of [1, 0, 'true', 'false', {}, [], 'yes']) {
  assert(go({ role: 'web-scout', videoScout: bad }).reason === REASON.VIDEO_SCOUT_FLAG_NOT_BOOLEAN,
    'non-boolean videoScout refuses: ' + JSON.stringify(bad));
}
assert(go({ role: 'web-scout', videoScout: false }).ok === true, 'videoScout:false is a legitimate value');
assert(go({ role: 'web-scout', videoScout: undefined }).ok === true, 'videoScout:undefined is a legitimate value');

section('HOSTILE \u2014 role and cli shapes');
for (const bad of ['Web-Scout', 'web-scout ', ' web-scout', '../builder', 'video-scout-x', 'BUILDER', 'unknown']) {
  assert(go({ role: bad }).reason === REASON.UNKNOWN_ROLE, 'unknown role refuses: ' + JSON.stringify(bad));
}
for (const bad of [123, {}, [], true]) {
  assert(go({ role: bad }).reason === REASON.ROLE_NOT_STRING, 'non-string role refuses: ' + JSON.stringify(bad));
}
assert(go({ role: '' }).kind === KIND.SHELL, 'empty-string role is absent (pre-existing `opts.role &&` semantics)');
for (const bad of ['powershell', 'sh', 'node', 'CLAUDE']) {
  assert(go({ role: null, cli: bad }).reason === REASON.UNKNOWN_CLI, 'unknown cli refuses: ' + JSON.stringify(bad));
}
assert(go({ role: null, cli: 42 }).reason === REASON.UNKNOWN_CLI, 'non-string cli refuses');

section('HOSTILE \u2014 malformed options never throw');
for (const bad of [null, undefined, 'string', 42, true, [], [1, 2]]) {
  let r = null, threw = false;
  try { r = go(bad); } catch (e) { threw = true; }
  assert(!threw, 'no throw on malformed opts: ' + JSON.stringify(bad));
  assert(r && r.ok === false && r.reason === REASON.MALFORMED_OPTS,
    'malformed opts refuse with a bounded reason: ' + JSON.stringify(bad));
}
{
  const proto = Object.create(null); proto.role = 'web-scout';
  assert(go(proto).ok === true, 'a null-prototype options object still classifies');
}

section('REFUSAL REASONS ARE BOUNDED CONSTANTS');
{
  const secret = 'D:\\Users\\levij\\.ssh\\id_rsa';
  const r = go({ role: secret, cwd: secret, initialPrompt: secret });
  assert(r.ok === false, 'hostile payload refuses');
  assert(r.reason.indexOf(secret) === -1 && r.reason.indexOf('\\') === -1,
    'and the reason constant carries no path or renderer payload');
  assert(Object.values(REASON).indexOf(r.reason) !== -1, 'the reason is one of the declared constants');
}

section('AGREEMENT \u2014 admission eligibility must match the accepted classification');
{
  const shapes = [
    { id: 'a', role: 'web-scout', cli: 'claude' },
    { id: 'b', role: 'builder', cli: 'claude' },
    { id: 'c', role: 'video-scout', videoScout: true, cli: null },
    { id: 'd', role: null, cli: 'claude' },
    { id: 'e', role: null, cli: 'codex' },
    { id: 'f', role: null, cli: null },
    { id: 'g', role: 'web-scout', cli: 'codex' },
  ];
  for (const s of shapes) {
    const r = go(s);
    assert(r.ok === true, 'shape accepted: ' + JSON.stringify(s));
    // Expected eligibility derived from the CLASSIFICATION, not from the raw fields.
    const expected = (r.kind === KIND.ROLE) || (r.kind === KIND.CLI && r.cli === 'claude');
    assert(isEligibleClaudePane(s, VALID_ROLES) === expected,
      'admission eligibility agrees with the classification for ' + JSON.stringify(s));
  }
  // The shapes on which the two derivations USED to disagree are exactly the ones the classifier
  // now refuses, so the disagreement is unreachable rather than merely unlikely.
  const divergent = { id: 'x', role: 'web-scout', videoScout: 1 };
  assert(go(divergent).ok === false,
    'the shape that split loose `!opts.videoScout` from strict `=== true` never reaches a consumer');
}

process.stdout.write('\npty-launch-classify: ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
