'use strict';
// Run: node app/task-name.test.js
// Plain Node.js — no framework (matches video-scout-args.test.js). Proves the main-process task
// validator (the enforcement boundary) REFUSES traversal / injection / malformed names before any
// fs/git/spawn call, and still accepts every legitimate name unchanged (AUDIT-REPORT.md finding #4).

const { validateTask, MAX_TASK_LEN } = require('./task-name');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
const refused = (task, label) => {
  const r = validateTask(task);
  assert(r.ok === false && typeof r.error === 'string' && r.error.length > 0, `REFUSED (visible error): ${label}`);
};
const accepted = (task, label) => {
  const r = validateTask(task);
  assert(r.ok === true && r.task === task, `accepted unchanged: ${label}`);
};

// --- required refusal cases (verbatim from the work order) ----------------------------------------
refused('../../etc', 'path traversal ../../etc');
refused('a/b', 'forward-slash separator');
refused('a\\b', 'back-slash separator');
refused('..', 'bare ..');
refused('-flag', 'leading dash (git/CLI flag ambiguity)');
refused('\x00', 'NUL byte');
refused('a\x07b', 'control character (BEL)');
refused('a\tb', 'tab');
refused('a\nb', 'newline');
refused('x'.repeat(500), '500-char over-length string');
refused('', 'empty string');
refused('   ', 'whitespace-only');
refused(' lead', 'leading space');
refused('trail ', 'trailing space');
refused('has space', 'interior space (invalid in a git ref)');

// --- other hostile / malformed inputs -------------------------------------------------------------
refused(undefined, 'undefined');
refused(null, 'null');
refused(42, 'non-string number');
refused({}, 'object');
refused('<img src=x onerror=alert(1)>', 'HTML/XSS payload (< > = etc.)');
refused('a"b', 'double quote');
refused("a'b", 'single quote');
refused('a&b', 'ampersand');
refused('a;b', 'semicolon');
refused('a..b', 'embedded .. / dot');
refused('a.b', 'single dot (not in charset)');
refused('café', 'non-ASCII letter');
refused('_'.repeat(0) || '', 'empty (guard)');

// --- boundary on length ---------------------------------------------------------------------------
accepted('x'.repeat(MAX_TASK_LEN), `exactly MAX_TASK_LEN (${MAX_TASK_LEN}) chars`);
refused('x'.repeat(MAX_TASK_LEN + 1), 'one over MAX_TASK_LEN');

// --- case rule (M2): lowercase-only, mirroring what the renderer canonicalizes to. REFUSE mixed
//     case, never silently lowercase. -------------------------------------------------------------
refused('Task-1', 'mixed case (uppercase T) — renderer canonicalizes to lowercase, so this is refused not folded');
refused('MixedCase', 'interior uppercase');
refused('ALLCAPS', 'all uppercase');
refused('CON', 'uppercase reserved-device name — refused by the lowercase rule (not by any device-name special-case)');
// "con" (lowercase) is ACCEPTED: this app never special-cases Windows reserved device names because
// the "<repo>-<task>" prefix defeats the hazard — the worktree folder is "<repo>-con", never a bare
// "con", so the reserved name is never the actual path. It is lowercase, so it passes the case rule.
accepted('con', 'lowercase reserved-device name — safe because the <repo>- prefix means the folder is <repo>-con, never bare CON');

// --- legitimate names pass unchanged (regression proof: identical path/branch as today) -----------
accepted('search-bar', 'renderer-produced kebab slug');
accepted('hotfix-login', 'kebab slug with two dashes');
accepted('fix123', 'letters + digits');
accepted('a', 'single char');
accepted('feature_x', 'underscore allowed');
accepted('9lives', 'leading digit allowed');
accepted('_scratch', 'leading underscore allowed');

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
