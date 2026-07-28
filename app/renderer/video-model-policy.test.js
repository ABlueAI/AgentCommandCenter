// V4Q Phase B — renderer model-policy suite. Pure Node, no DOM, no Electron, no key, no provider,
// no network. Reached by run-pester through scripts/video-model-policy-node.Tests.ps1 and by the
// Node-side reachability watchdog; both are pinned below so this suite cannot become an orphan.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const P = require('./video-model-policy.js');
const args = require('../video-scout-args.js');
const sdk = require('../../scripts/gemini-video-sdk.js');

let passed = 0; let failed = 0;
function section(name) { process.stdout.write(`\n— ${name}\n`); }
function ok(cond, msg) {
  if (cond) { passed++; process.stdout.write(`  ✓ ${msg}\n`); }
  else { failed++; process.stdout.write(`  ✗ FAIL: ${msg}\n`); }
}

const { TRANSCRIPT_MODE, AUDIO_MODE, VIDEO_MODE, FLASH_LITE_MODEL, FLASH_MODEL, PRO_MODEL } = P;
const ALL_MODES = [TRANSCRIPT_MODE, AUDIO_MODE, VIDEO_MODE];

section('initial and reset session state');
{
  for (const [label, make] of [['initialPolicyState', P.initialPolicyState], ['resetPolicyState', P.resetPolicyState]]) {
    const s = make();
    ok(s.analysisMode === TRANSCRIPT_MODE, `${label}: starts in transcript mode`);
    ok(s.model === FLASH_LITE_MODEL, `${label}: starts on the economy model`);
    ok(s.manuallyChosen === false, `${label}: starts UNPINNED`);
  }
  const a = P.initialPolicyState();
  a.model = PRO_MODEL;
  ok(P.initialPolicyState().model === FLASH_LITE_MODEL, 'each call returns a FRESH object (no shared mutable state)');
}

section('automatic policy: mode decides, slice count does not');
{
  ok(P.recommendedModelForMode(TRANSCRIPT_MODE) === FLASH_LITE_MODEL, 'transcript recommends Flash-Lite');
  ok(P.recommendedModelForMode(AUDIO_MODE) === FLASH_LITE_MODEL, 'audio recommends Flash-Lite');
  ok(P.recommendedModelForMode(VIDEO_MODE) === PRO_MODEL, 'video recommends Pro');
  ok(P.recommendedModelForMode('nonsense') === FLASH_LITE_MODEL,
    'an UNKNOWN mode falls back to the economy model — never a silent escalation to Pro');
  // Whole-video and sliced video are the same renderer decision: the module takes no slice input.
  ok(Object.keys(P.applyAnalysisMode(P.initialPolicyState(), VIDEO_MODE)).length === 3,
    'the policy takes analysis mode only; slice count is not an input');
  let s = P.initialPolicyState();
  s = P.applyAnalysisMode(s, VIDEO_MODE);
  ok(s.model === PRO_MODEL && s.manuallyChosen === false, 'automatic transcript → video gives Pro, still unpinned');
  s = P.applyAnalysisMode(s, TRANSCRIPT_MODE);
  ok(s.model === FLASH_LITE_MODEL, 'automatic video → transcript returns to Flash-Lite');
  s = P.applyAnalysisMode(s, AUDIO_MODE);
  ok(s.model === FLASH_LITE_MODEL, 'automatic transcript → audio stays Flash-Lite');
  s = P.applyAnalysisMode(s, VIDEO_MODE);
  ok(s.model === PRO_MODEL, 'automatic audio → video gives Pro');
}

section('repeated mode toggles never drift while unpinned');
{
  let s = P.initialPolicyState();
  for (let i = 0; i < 12; i++) {
    for (const mode of ALL_MODES) {
      s = P.applyAnalysisMode(s, mode);
      ok(s.model === P.recommendedModelForMode(mode) && s.manuallyChosen === false,
        `toggle ${i + 1} → ${mode}: model tracks the automatic policy exactly`);
    }
  }
}

section('a manual choice always wins for the rest of the session');
{
  // Every manual model, across every starting mode, toggled through every mode.
  for (const manual of [FLASH_LITE_MODEL, FLASH_MODEL, PRO_MODEL]) {
    for (const startMode of ALL_MODES) {
      let s = P.applyAnalysisMode(P.initialPolicyState(), startMode);
      const picked = P.applyManualModel(s, manual);
      ok(picked.error === null, `${manual} from ${startMode}: a valid selection is accepted`);
      s = picked.state;
      ok(s.model === manual && s.manuallyChosen === true, `${manual} from ${startMode}: pinned`);
      for (const mode of ALL_MODES) {
        s = P.applyAnalysisMode(s, mode);
        ok(s.model === manual, `${manual} from ${startMode}: survives a toggle to ${mode}`);
        ok(s.analysisMode === mode, `${manual} from ${startMode}: the MODE still changes to ${mode}`);
        ok(s.manuallyChosen === true, `${manual} from ${startMode}: stays pinned through ${mode}`);
      }
    }
  }
  // The four named examples from the work order, spelled out.
  let s = P.applyManualModel(P.initialPolicyState(), FLASH_LITE_MODEL).state;
  s = P.applyAnalysisMode(s, VIDEO_MODE);
  ok(s.model === FLASH_LITE_MODEL, 'NAMED: manually chose Flash-Lite, then entered video → remains Flash-Lite (no silent escalation)');
  s = P.applyManualModel(P.initialPolicyState(), FLASH_MODEL).state;
  for (const mode of [VIDEO_MODE, AUDIO_MODE, TRANSCRIPT_MODE, VIDEO_MODE]) s = P.applyAnalysisMode(s, mode);
  ok(s.model === FLASH_MODEL, 'NAMED: manually chose Flash, toggled every mode → remains Flash');
  s = P.applyAnalysisMode(P.initialPolicyState(), VIDEO_MODE);
  s = P.applyManualModel(s, PRO_MODEL).state;
  s = P.applyAnalysisMode(s, TRANSCRIPT_MODE);
  ok(s.model === PRO_MODEL, 'NAMED: manually chose Pro, then left video → remains Pro (no silent downgrade)');
}

section('re-selecting the displayed model still pins the session');
{
  // Transcript already shows Flash-Lite; choosing it deliberately is still a choice.
  const s = P.applyManualModel(P.initialPolicyState(), FLASH_LITE_MODEL).state;
  ok(s.manuallyChosen === true, 'choosing the model already displayed sets the manual flag');
  const after = P.applyAnalysisMode(s, VIDEO_MODE);
  ok(after.model === FLASH_LITE_MODEL, 'and that pin holds when video mode is entered');
  // Same for Pro while already in video mode.
  const v = P.applyAnalysisMode(P.initialPolicyState(), VIDEO_MODE);
  ok(v.model === PRO_MODEL && v.manuallyChosen === false, 'video shows Pro automatically');
  const pinnedPro = P.applyManualModel(v, PRO_MODEL).state;
  ok(pinnedPro.manuallyChosen === true, 're-selecting Pro in video mode pins it');
  ok(P.applyAnalysisMode(pinnedPro, AUDIO_MODE).model === PRO_MODEL, 'and audio no longer downgrades it');
}

section('an invalid model is REFUSED, never substituted');
{
  const base = P.applyAnalysisMode(P.initialPolicyState(), VIDEO_MODE);
  for (const bad of ['gemini-3-ultra', 'gpt-4', '', '   ', 'auto', 'GEMINI-2.5-PRO', null, undefined, 42, {}, [], true]) {
    const r = P.applyManualModel(base, bad);
    ok(typeof r.error === 'string' && r.error.length > 0, `invalid model ${JSON.stringify(bad)} returns a refusal`);
    ok(r.state.model === PRO_MODEL, `invalid model ${JSON.stringify(bad)} leaves the previous CONCRETE model intact`);
    ok(r.state.manuallyChosen === false, `invalid model ${JSON.stringify(bad)} does NOT pin the session`);
    ok(P.ALLOWED_MODELS.indexOf(r.state.model) !== -1, `invalid model ${JSON.stringify(bad)} never yields a non-allowlisted model`);
  }
  ok(P.applyManualModel(base, 'gemini-3-ultra').error.indexOf('gemini-3-ultra') === -1,
    'the refusal message does not echo the rejected value back as if it were a model');
  ok(P.isAllowedModel('auto') === false, "'auto' is NOT an allowlisted model — no sentinel exists");
}

section('closing and reopening the modal resets the session');
{
  // Build the most "sticky" state possible, then reset.
  let s = P.applyAnalysisMode(P.initialPolicyState(), VIDEO_MODE);
  s = P.applyManualModel(s, FLASH_MODEL).state;
  s = P.applyAnalysisMode(s, AUDIO_MODE);
  ok(s.manuallyChosen === true && s.model === FLASH_MODEL, 'pre-reset: a manual Flash pin is in force');
  const fresh = P.resetPolicyState();
  ok(fresh.manuallyChosen === false, 'reset: the manual flag is cleared');
  ok(fresh.analysisMode === TRANSCRIPT_MODE, 'reset: mode returns to transcript');
  ok(fresh.model === FLASH_LITE_MODEL, 'reset: model returns to Flash-Lite');
  ok(P.applyAnalysisMode(fresh, VIDEO_MODE).model === PRO_MODEL,
    'reset: the AUTOMATIC policy is live again in the new session');
  ok(s.model === FLASH_MODEL, 'reset does not mutate the previous session object');
}

section('the policy only ever yields CONCRETE allowlisted models');
{
  let s = P.initialPolicyState();
  const seen = new Set([s.model]);
  for (const mode of ALL_MODES) {
    for (const manual of [null, FLASH_LITE_MODEL, FLASH_MODEL, PRO_MODEL]) {
      let t = P.applyAnalysisMode(s, mode);
      if (manual) t = P.applyManualModel(t, manual).state;
      seen.add(t.model);
      ok(P.isAllowedModel(t.model), `mode=${mode} manual=${manual || 'none'} yields an allowlisted model`);
      ok(t.model !== 'auto' && t.model !== '' && t.model !== null && t.model !== undefined,
        `mode=${mode} manual=${manual || 'none'} yields no sentinel/blank`);
    }
  }
  ok(seen.size === 3, 'exactly the three allowlisted models are reachable');
  // A corrupt state can never leak a bad model onward.
  const bad = P.normalizePolicyState({ analysisMode: 'nonsense', model: 'gpt-4', manuallyChosen: true });
  ok(P.isAllowedModel(bad.model) && bad.manuallyChosen === false,
    'normalizePolicyState repairs a corrupt state without honouring its bogus pin');
}

section('bounded status copy distinguishes automatic from pinned');
{
  const autoT = P.describeModelSelection(P.initialPolicyState());
  const autoV = P.describeModelSelection(P.applyAnalysisMode(P.initialPolicyState(), VIDEO_MODE));
  const pinned = P.describeModelSelection(P.applyManualModel(P.initialPolicyState(), FLASH_MODEL).state);
  ok(/automatically/i.test(autoT) && /automatically/i.test(autoV), 'an automatic selection says so');
  ok(!/automatically/i.test(pinned), 'a pinned selection does NOT claim to be automatic');
  ok(/your choice/i.test(pinned) && /close this window/i.test(pinned), 'a pinned selection says it is kept until the modal closes');
  ok(autoT.indexOf(FLASH_LITE_MODEL) !== -1 && autoV.indexOf(PRO_MODEL) !== -1 && pinned.indexOf(FLASH_MODEL) !== -1,
    'each description names the concrete model that will run');
  ok(/quota and cost more/i.test(autoV), 'the Pro description carries the cost caveat');
  ok(!/quota and cost more/i.test(autoT), 'the economy description does not');
  for (const text of [autoT, autoV, pinned]) {
    ok(!/manuallyChosen|policyState|undefined|null|\bflag\b/i.test(text), 'the copy exposes no internal state or jargon');
    ok(!/\bfree\b|\bpaid\b|\bbillable\b/i.test(text), 'the copy never claims a run is free, paid, or billable');
    ok(text.length <= 220, 'the copy stays bounded');
  }
}

section('CROSS-LAYER: the renderer mirror agrees with the launch path and the SDK');
{
  const launchAllowlist = [...args.VALID_VIDEO_MODELS].sort();
  ok(JSON.stringify([...P.ALLOWED_MODELS].sort()) === JSON.stringify(launchAllowlist),
    'the renderer allowlist EQUALS VALID_VIDEO_MODELS in app/video-scout-args.js');
  ok(P.FLASH_LITE_MODEL === args.DEFAULT_VIDEO_MODEL, 'the renderer Flash-Lite constant EQUALS DEFAULT_VIDEO_MODEL');
  ok(P.PRO_MODEL === sdk.PRO_MODEL, "the renderer Pro constant EQUALS the SDK's exported PRO_MODEL");
  for (const mode of ALL_MODES) {
    ok(args.VALID_VIDEO_MODELS.has(P.recommendedModelForMode(mode)),
      `the automatic model for ${mode} is accepted by the launch allowlist`);
  }
  // Serialization: what the policy produces is what -Model carries. Slice/whole-video generation
  // policy stays owned by the SDK suite — this only proves the model reaches the wire.
  const serialize = (model) => {
    const built = args.buildVideoScoutArgs({ videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk', videoModel: model });
    ok(!built.error, `buildVideoScoutArgs accepts ${model}`);
    const i = built.args.indexOf('-Model');
    return i === -1 ? null : built.args[i + 1];
  };
  const autoVideo = P.applyAnalysisMode(P.initialPolicyState(), VIDEO_MODE).model;
  ok(serialize(autoVideo) === PRO_MODEL, 'automatic video Pro is serialized EXPLICITLY as -Model gemini-2.5-pro');
  const pinnedLite = P.applyAnalysisMode(P.applyManualModel(P.initialPolicyState(), FLASH_LITE_MODEL).state, VIDEO_MODE);
  ok(pinnedLite.model === FLASH_LITE_MODEL && serialize(pinnedLite.model) === FLASH_LITE_MODEL,
    'a manually pinned Flash-Lite VIDEO request serializes Flash-Lite explicitly (never reinterpreted as omitted)');
  const pinnedFlash = P.applyManualModel(P.initialPolicyState(), FLASH_MODEL).state;
  ok(serialize(pinnedFlash.model) === FLASH_MODEL, 'a manually pinned Flash request serializes Flash explicitly');
  // The SDK must not import renderer policy: the mirror may drift only in the safe direction.
  const sdkSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'gemini-video-sdk.js'), 'utf8');
  ok(sdkSrc.indexOf('video-model-policy') === -1, 'scripts/gemini-video-sdk.js contains NO reference to video-model-policy');
  ok(sdkSrc.indexOf('videoModelPolicy') === -1, 'scripts/gemini-video-sdk.js does not reference the renderer global either');
}

section('renderer wiring: script order, honest copy, and the concrete launch value');
{
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const policyAt = html.indexOf('src="video-model-policy.js"');
  const appAt = html.indexOf('src="app.js"');
  ok(policyAt !== -1, 'index.html loads video-model-policy.js');
  ok(policyAt < appAt, 'video-model-policy.js loads BEFORE app.js');
  ok(html.indexOf('id="videoModelStatus"') !== -1, 'index.html carries the bounded model status element');
  for (const [label, re] of [
    ['Flash-Lite is labelled automatic for transcript/audio and cheapest', /gemini-2\.5-flash-lite \(automatic for transcript\/audio, cheapest\)/],
    ['Flash is labelled the manual middle option', /gemini-2\.5-flash \(manual middle option\)/],
    ['Pro is labelled automatic for video, highest quality and cost', /gemini-2\.5-pro \(automatic for video, highest quality and cost\)/],
    ['the copy explains transcript/audio automatic Flash-Lite', /Transcript and audio automatically use Flash-Lite/],
    ['the copy explains automatic Pro for video', /Video automatically uses Pro/],
    ['the copy explains manual choice persists until close', /stays selected until you close this window/],
    ['the copy carries the Pro cost caveat', /Pro can use significantly more quota and cost more/],
    ['the copy refuses to declare free-vs-billable', /depends on your own Gemini project and account/],
  ]) ok(re.test(html), `index.html: ${label}`);
  ok(!/\bevery run is paid\b|\bthis run is free\b/i.test(html), 'index.html never promises a run is free or calls every request paid');

  const appSrc = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  ok(/videoModel:\s*state\.videoModel/.test(appSrc), 'createAgent still passes the concrete state.videoModel to ptyStart');
  ok(appSrc.indexOf("videoModel: 'auto'") === -1 && !/videoModel:\s*['"]\s*['"]/.test(appSrc),
    "the renderer→main payload carries no 'auto' or blank model");
  ok(/modelPolicy = videoModelPolicy\.resetPolicyState\(\)/.test(appSrc), 'openModal resets the policy session');
  ok(/videoModelPolicy\.applyManualModel/.test(appSrc), 'the model dropdown routes through applyManualModel');
  ok(/videoModelPolicy\.applyAnalysisMode/.test(appSrc), 'the analysis-mode dropdown routes through applyAnalysisMode');
  ok(/function syncVideoModelControls/.test(appSrc), 'one sync function owns DOM+state agreement');
  ok(appSrc.indexOf("state.videoModel = 'gemini-2.5-flash-lite'") === -1,
    'openModal no longer hardcodes the model outside the policy module');
  ok(/updateVideoRangeVisibility\(\)/.test(appSrc), 'the mode handler still drives slice-row visibility (clear-on-hide preserved)');
}

section('anti-orphan: this suite is reachable from both watchdog families');
{
  const wrapper = path.join(__dirname, '..', '..', 'scripts', 'video-model-policy-node.Tests.ps1');
  ok(fs.existsSync(wrapper), 'the Pester wrapper exists in scripts/ where run-pester discovers it');
  const w = fs.readFileSync(wrapper, 'utf8');
  ok(w.indexOf("Join-Path (Join-Path $repoRoot 'app\\renderer') 'video-model-policy.test.js'") !== -1,
    'the wrapper uses the reachability-safe NESTED join spelling');
  ok(w.indexOf("Join-Path $repoRoot 'app\\renderer\\video-model-policy.test.js'") === -1
    && w.indexOf("Join-Path $repoRoot 'app/renderer/video-model-policy.test.js'") === -1,
    'the wrapper avoids both spellings the exact reachability watchdog does not recognize');
  const nodeWatchdog = fs.readFileSync(path.join(__dirname, '..', 'test-reachability.test.js'), 'utf8');
  ok(nodeWatchdog.length > 0, 'the Node-side reachability watchdog is present');
}

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
