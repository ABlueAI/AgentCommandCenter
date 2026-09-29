'use strict';
// MAIN-OWNED PTY LAUNCH CLASSIFIER.
//
// Before this module, `pty-start` re-derived "is this fenced / is this Video Scout" three separate
// times from renderer-supplied fields (`!opts.videoScout && opts.role && FENCED_ROLES.has(opts.role)`),
// and `admission-pty-boundary.js` derived it a fourth time with STRICTER truthiness (`=== true`). Four
// derivations of one decision can disagree; this module makes the decision once, in main, and the
// command, the fence decision and the environment tier read the same result object.
//
// ADMISSION IS THE EXCEPTION, STATED PRECISELY. `prepareAdmissionPaneLaunch` does NOT consume this
// result: it still derives eligibility separately from the raw `opts` through `isEligibleClaudePane`.
// The loose/strict split is closed because this classifier refuses the divergent shapes before
// admission runs, and pty-launch-classify.test.js pins that the two derivations agree for every shape
// accepted here. That is tested agreement, not a shared input.
//
// Pure: no Electron, filesystem, process, logging, or spawning. Renderer input is untrusted.
//
// ACCEPTED SHAPES ARE THE REAL ONES THE UI SENDS (app/renderer/app.js:442 and :2102):
//   role pane   -> { role: <one of VALID_ROLES>, cli: 'claude' }  (initialPrompt: undefined, except
//                  the reviewer launch, which supplies one; fenced roles never do — see below)
//   Video Scout -> { role: 'video-scout', videoScout: true, cli: null }
//   CLI pane    -> { role: null, cli: 'claude'|'codex'|'gemini' }
//   shell pane  -> { role: null, cli: null }
// `role: null` is LEGITIMATE, never a refusal: app.js:442 normalizes an unknown role to null.

const KIND = Object.freeze({
  ROLE: 'role',
  VIDEO_SCOUT: 'video-scout',
  CLI: 'cli',
  SHELL: 'shell',
});

const VIDEO_SCOUT_ROLE = 'video-scout';

// Bounded reason CONSTANTS. A refusal line never carries a path, a prompt, or a renderer value.
const REASON = Object.freeze({
  MALFORMED_OPTS: 'classify-malformed-opts',
  ROLE_NOT_STRING: 'classify-role-not-string',
  UNKNOWN_ROLE: 'classify-unknown-role',
  VIDEO_SCOUT_FLAG_NOT_BOOLEAN: 'classify-video-scout-flag-not-boolean',
  VIDEO_SCOUT_ROLE_MISMATCH: 'classify-video-scout-role-mismatch',
  UNKNOWN_CLI: 'classify-unknown-cli',
  FENCED_INITIAL_PROMPT: 'classify-fenced-initial-prompt-refused',
});

/**
 * classifyPtyLaunch(opts, { validRoles, fencedRoles, validClis })
 *
 * Returns { ok:true, kind, role, cli, fenced, videoScout } or { ok:false, reason }.
 *
 * `fenced` and `videoScout` on the result are the ONLY values downstream code may use. Consumers must
 * never re-read `opts.role` / `opts.videoScout` for a security decision.
 */
function classifyPtyLaunch(opts, deps) {
  const d = deps || {};
  const validRoles = d.validRoles instanceof Set ? d.validRoles : new Set();
  const fencedRoles = d.fencedRoles instanceof Set ? d.fencedRoles : new Set();
  const validClis = d.validClis instanceof Set ? d.validClis : new Set();

  // Reject anything that is not a plain options object. `null`, arrays and primitives all refuse
  // rather than throwing at the first property read (the pre-existing `opts.id` TypeError).
  if (!opts || typeof opts !== 'object' || Array.isArray(opts)) {
    return { ok: false, reason: REASON.MALFORMED_OPTS };
  }

  // STRICT boolean. `1`, `'true'`, `{}` are the exact hostile inputs that split main's loose
  // `!opts.videoScout` from admission's `=== true`.
  const rawVideo = opts.videoScout;
  if (rawVideo !== undefined && rawVideo !== true && rawVideo !== false) {
    return { ok: false, reason: REASON.VIDEO_SCOUT_FLAG_NOT_BOOLEAN };
  }
  const videoScout = rawVideo === true;

  // A falsy role means "no role" — exactly what `opts.role &&` meant before, so app.js:442's
  // `role: null` and a legitimate empty string both classify as CLI/shell rather than refusing.
  const rawRole = opts.role;
  const roleAbsent = rawRole === null || rawRole === undefined || rawRole === '';
  if (!roleAbsent && typeof rawRole !== 'string') {
    return { ok: false, reason: REASON.ROLE_NOT_STRING };
  }
  const role = roleAbsent ? null : rawRole;

  // Video Scout coherence, BOTH directions (Blue's decision): the flag and the role identity must
  // agree, so neither a flag without the role nor the role without the flag can launch.
  if (videoScout || role === VIDEO_SCOUT_ROLE) {
    if (!videoScout || role !== VIDEO_SCOUT_ROLE) {
      return { ok: false, reason: REASON.VIDEO_SCOUT_ROLE_MISMATCH };
    }
    // Video Scout is deliberately UNFENCED and never launches `claude --agent`.
    return { ok: true, kind: KIND.VIDEO_SCOUT, role: VIDEO_SCOUT_ROLE, cli: null, fenced: false, videoScout: true };
  }

  if (role !== null) {
    if (!validRoles.has(role)) return { ok: false, reason: REASON.UNKNOWN_ROLE };
    // ROLE WINS over any cli/agent hint. This preserves buildAgentCommand's existing precedence
    // (main.js: `if (role && VALID_ROLES.has(role))` is tested before `AGENT_CMD[cli || agent]`),
    // so a mismatched `{role:'web-scout', cli:'codex'}` launches web-scout on Claude and the codex
    // hint is ignored — it is ACCEPTED, not refused, and every consumer agrees via this result.
    const fenced = fencedRoles.has(role);
    // FENCED ROLES TAKE NO OPENING PROMPT. The UI never sends one for them (app/renderer/app.js
    // passes `initialPrompt: undefined`; only the reviewer launch sets it), and a supplied value is
    // an argv element the CLI may parse as an OPTION — `--settings=<file>`, `--mcp-config=<file>`,
    // `--permission-mode=<mode>` — rather than as prompt text. Accept only the absent/empty forms;
    // refuse every other value, well-formed or not, here at the first boundary, before containment,
    // resolution, admission claim, command construction or spawn. The reason never echoes the value.
    if (fenced) {
      const prompt = opts.initialPrompt;
      if (prompt !== undefined && prompt !== '') return { ok: false, reason: REASON.FENCED_INITIAL_PROMPT };
    }
    return { ok: true, kind: KIND.ROLE, role, cli: null, fenced, videoScout: false };
  }

  // No role: the cli/agent hint decides. Same `opts.cli || opts.agent` precedence as app.js:442.
  const rawCli = (opts.cli || opts.agent || null);
  if (rawCli === null) {
    return { ok: true, kind: KIND.SHELL, role: null, cli: null, fenced: false, videoScout: false };
  }
  if (typeof rawCli !== 'string' || !validClis.has(rawCli)) {
    return { ok: false, reason: REASON.UNKNOWN_CLI };
  }
  return { ok: true, kind: KIND.CLI, role: null, cli: rawCli, fenced: false, videoScout: false };
}

module.exports = { KIND, REASON, VIDEO_SCOUT_ROLE, classifyPtyLaunch };
