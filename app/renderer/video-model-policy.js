// V4Q Phase B — Video Scout renderer model policy (PURE).
//
// ONE invariant: within each New Agent modal session, Video Scout automatically selects Flash-Lite
// for transcript/audio and Pro for video, UNTIL the user manually picks a model. A manual choice
// then wins for the rest of that modal session, and closing/reopening the modal resets the policy.
//
// WHY Pro is the automatic VIDEO choice: V4Q's quality gate rejects a response that fails
// deterministic structural validation, and a rejected response is a terminal provider-response
// failure after usage that consumes quota and may incur cost; its only output is evidence. (Whether
// a request is free-tier or billable depends on the user's own Gemini project and account, which
// this repository cannot see.) Flash-Lite on a bounded video pass is exactly the configuration that
// produced the V4Q failure evidence. Defaulting video to Pro buys the analysis quality the gate
// demands; transcript/audio keep the economy model because they never enter that path.
//
// SCOPE. This module decides which model the renderer DISPLAYS and SENDS. It is mirrored policy,
// not provider-request authority: app/video-scout-args.js owns the launch allowlist, and
// scripts/gemini-video-sdk.js independently owns generation policy (maxOutputTokens, thinking
// budget, effective-model resolution). The SDK must never import this file — a cross-layer test
// pins that. Slice COUNT deliberately does not appear here: analysis MODE is the only input, so a
// whole-video pass and an 8-slice pass receive the same automatic model.
//
// PURITY. No DOM, Electron, filesystem, network, credentials, provider calls, or timers. Every
// function returns a NEW plain state object, so a transition can never mutate a caller's state and
// every case is directly testable. Dual-environment (browser <script> global + CommonJS) following
// the video-range-ui.js pattern.

// The renderer's allowlist. Pinned equal to VALID_VIDEO_MODELS in app/video-scout-args.js by test —
// a renderer offering a model the launch path refuses would be a UI that cannot launch.
const FLASH_LITE_MODEL = 'gemini-2.5-flash-lite'; // economy default for transcript/audio
const FLASH_MODEL = 'gemini-2.5-flash';          // manual middle option; never automatic
const PRO_MODEL = 'gemini-2.5-pro';              // automatic video choice; highest quality and cost
const ALLOWED_MODELS = [FLASH_LITE_MODEL, FLASH_MODEL, PRO_MODEL];

const TRANSCRIPT_MODE = 'transcript';
const AUDIO_MODE = 'audio';
const VIDEO_MODE = 'video';
const ANALYSIS_MODES = [TRANSCRIPT_MODE, AUDIO_MODE, VIDEO_MODE];

function isAllowedModel(model) {
  return typeof model === 'string' && ALLOWED_MODELS.indexOf(model) !== -1;
}
function isAnalysisMode(mode) {
  return typeof mode === 'string' && ANALYSIS_MODES.indexOf(mode) !== -1;
}

// The automatic choice for a mode. An unrecognized mode falls back to the ECONOMY model, never to
// Pro: an unknown mode must not silently escalate cost.
function recommendedModelForMode(mode) {
  return mode === VIDEO_MODE ? PRO_MODEL : FLASH_LITE_MODEL;
}

// The state every modal session starts from. openModal() calls this, which is what makes a manual
// choice strictly per-session: there is no path that carries `manuallyChosen` across a reset.
function initialPolicyState() {
  return { analysisMode: TRANSCRIPT_MODE, model: FLASH_LITE_MODEL, manuallyChosen: false };
}
const resetPolicyState = initialPolicyState;

// Normalize whatever the caller hands in, so a malformed state can never leave the policy holding a
// model outside the allowlist or an unknown mode.
function normalizePolicyState(state) {
  const s = state && typeof state === 'object' ? state : {};
  const mode = isAnalysisMode(s.analysisMode) ? s.analysisMode : TRANSCRIPT_MODE;
  const manuallyChosen = s.manuallyChosen === true;
  // An out-of-allowlist model is replaced by what the policy would have chosen anyway; it is never
  // carried forward, and it is never treated as a manual pin.
  const model = isAllowedModel(s.model) ? s.model : recommendedModelForMode(mode);
  return { analysisMode: mode, model, manuallyChosen: manuallyChosen && isAllowedModel(s.model) };
}

// Analysis-mode transition. While the session is UNPINNED the model follows the mode; once pinned,
// the mode still changes but the model does not — that is the whole "manual choice always wins"
// rule, and it is why toggling through every mode after a manual pick cannot escalate to Pro.
function applyAnalysisMode(state, mode) {
  const current = normalizePolicyState(state);
  const nextMode = isAnalysisMode(mode) ? mode : current.analysisMode;
  if (current.manuallyChosen) {
    return { analysisMode: nextMode, model: current.model, manuallyChosen: true };
  }
  return { analysisMode: nextMode, model: recommendedModelForMode(nextMode), manuallyChosen: false };
}

// Manual dropdown selection. Returns { state, error } rather than throwing, so the caller can keep
// the previous concrete model on the wire while surfacing the refusal. An invalid value is REFUSED,
// never substituted: silently converting an unknown string into a valid model is exactly how a user
// ends up billed for a model they never chose (the same reasoning that made
// buildVideoScoutArgs refuse instead of dropping -Model).
function applyManualModel(state, model) {
  const current = normalizePolicyState(state);
  if (!isAllowedModel(model)) {
    return {
      state: current,
      error: `Invalid video model. Allowed models: ${ALLOWED_MODELS.join(', ')}. Selection refused.`,
    };
  }
  // Re-selecting the model already displayed still PINS the session. The user made a choice; that
  // it happens to match the automatic one does not make it automatic.
  return { state: { analysisMode: current.analysisMode, model, manuallyChosen: true }, error: null };
}

// Bounded, human-readable status for the modal. Says which model will run and why, distinguishing
// an automatic selection from a pinned manual one, without exposing internal state or jargon.
//
// It deliberately does NOT claim a run is free or paid: whether a request falls inside a free tier
// depends on the user's own Gemini project and account, which this app cannot see. It says Pro
// "can use significantly more quota and cost more" — true in every case — and stops there.
function describeModelSelection(state) {
  const s = normalizePolicyState(state);
  const costNote = s.model === PRO_MODEL
    ? ' Pro can use significantly more quota and cost more than the other options.'
    : '';
  if (s.manuallyChosen) {
    return `Using ${s.model} — your choice, kept until you close this window.${costNote}`;
  }
  const reason = s.analysisMode === VIDEO_MODE
    ? 'chosen automatically for video analysis quality'
    : `chosen automatically for ${s.analysisMode} analysis`;
  return `Using ${s.model} — ${reason}. Pick a model yourself to keep it for this window.${costNote}`;
}

// --- V4Q Phase B CORRECTION: the interaction adapter ---------------------------------------------
// `change` alone was not enough. A <select> emits NO change event when the user picks the option
// ALREADY DISPLAYED, so this sequence silently escalated: transcript shows Flash-Lite automatically
// → the user deliberately chooses that same Flash-Lite → no event → the session stays UNPINNED →
// switching to video replaces it with Pro. The symmetric downgrade existed for a deliberately kept
// Pro. Deliberate ACTIVATION of the control, not just a value change, is what expresses intent.
//
// CONSERVATIVE DISCLOSURE: opening the selector and dismissing it without changing the value counts
// as a pin. That is deliberate. The user reached for the cost/quality control, and preserving what
// they were looking at is safer than silently escalating or downgrading it a moment later. Nothing
// is hidden — the status line flips from automatic wording to "your choice" immediately.
//
// Pure and event-LIKE: it takes plain data, never a DOM event, so every case is directly testable.
const SELECTOR_OPERATION_KEYS = ['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Enter'];
// Pressing a modifier by itself is not operating anything, and Tab/Escape alone are navigation and
// cancellation. None of them expresses a choice.
const NON_PINNING_KEYS = ['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock',
  'NumLock', 'ScrollLock', 'ContextMenu', 'Dead'];

function isDeliberateModelInteraction(interaction) {
  const e = interaction && typeof interaction === 'object' ? interaction : {};
  if (e.type === 'change') return true; // the value already moved; intent is not in question
  if (e.type === 'pointerdown' || e.type === 'mousedown') {
    // PRIMARY activation only. Right-click (2) opens a context menu and middle-click (1) does not
    // operate the control, so neither is a choice. Touch and pen primary contact report button 0.
    return e.button === 0 && e.isPrimary !== false;
  }
  if (e.type !== 'keydown') return false;
  const key = e.key;
  if (typeof key !== 'string' || key === '') return false;
  // A Ctrl/Meta chord is an application shortcut, not selector operation.
  if (e.ctrlKey === true || e.metaKey === true) return false;
  if (NON_PINNING_KEYS.indexOf(key) !== -1) return false;
  if (SELECTOR_OPERATION_KEYS.indexOf(key) !== -1) return true;
  // Any single printable character — including Space — is type-ahead option selection on a <select>.
  return key.length === 1;
}

// Applies the interaction to the CURRENTLY DISPLAYED concrete model. Returns the resulting state,
// any refusal, and whether the interaction was handled as a pin, so the caller never has to guess.
function applyModelInteraction(state, interaction) {
  const current = normalizePolicyState(state);
  if (!isDeliberateModelInteraction(interaction)) {
    return { state: current, error: null, pinned: false, handled: false };
  }
  const e = interaction && typeof interaction === 'object' ? interaction : {};
  const displayed = e.displayedModel === undefined ? current.model : e.displayedModel;
  const result = applyManualModel(current, displayed);
  if (result.error) return { state: result.state, error: result.error, pinned: false, handled: true };
  return { state: result.state, error: null, pinned: true, handled: true };
}

// Uniquely named: renderer <script> files share ONE global scope, so a generic top-level name here
// could collide with another renderer file and break the whole renderer at load time.
const videoModelPolicyExports = {
  FLASH_LITE_MODEL, FLASH_MODEL, PRO_MODEL, ALLOWED_MODELS,
  TRANSCRIPT_MODE, AUDIO_MODE, VIDEO_MODE, ANALYSIS_MODES,
  isAllowedModel, isAnalysisMode, recommendedModelForMode,
  initialPolicyState, resetPolicyState, normalizePolicyState,
  applyAnalysisMode, applyManualModel, describeModelSelection,
  isDeliberateModelInteraction, applyModelInteraction,
  SELECTOR_OPERATION_KEYS, NON_PINNING_KEYS,
};
if (typeof module !== 'undefined') module.exports = videoModelPolicyExports;
else window.videoModelPolicy = videoModelPolicyExports;
