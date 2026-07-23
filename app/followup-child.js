'use strict';
// V3b follow-up child runner (main process). Owns exactly one thing: launching the text-follow-up
// child (scripts/gemini-followup.js) safely and returning its ONE bounded JSON result. All policy
// (identity resolution, question/report validation, single-flight, code allowlisting) lives in
// followup-ipc.js — this module is the process boundary only.
//
// Launch contract (work-order-fixed, tests pin every property):
//   - spawn (never exec/shell), shell:false, windowsHide:true — no shell ever parses anything here.
//   - process.execPath + child-only ELECTRON_RUN_AS_NODE=1: the Electron binary runs the script as
//     plain Node. The flag is set ONLY in the child's env (setting it in the parent would break
//     Electron itself), and no PTY or other subprocess inherits it.
//   - Environment ALLOWLIST, never a spread of process.env: ELECTRON_RUN_AS_NODE, the decrypted
//     GEMINI_API_KEY, and (when present) SystemRoot / WINDIR with their exact original names and
//     values (Node's TLS/DNS needs them on Windows). Nothing else — parent secrets (setx residue
//     included) structurally cannot reach this child. No TEMP/TMP: stdin transport needs no files.
//   - The report and question travel ONLY through stdin as one JSON document. argv carries nothing.
//   - Bounds: stdout 2 MiB / stderr 64 KiB / hard timeout 180 s. Every violation kills the child
//     and fails closed with a stable code. stderr content is never parsed, logged, or forwarded.
//   - The returned promise settles EXACTLY once (flag-guarded) no matter how events interleave.
//
// PURE of Electron: deps inject spawnImpl/execPath/env for unit tests (followup-child.test.js).

const { spawn } = require('child_process');

const FOLLOWUP_CHILD_STDOUT_MAX = 2 * 1024 * 1024;   // bytes
const FOLLOWUP_CHILD_STDERR_MAX = 64 * 1024;         // bytes
const FOLLOWUP_CHILD_TIMEOUT_MS = 180000;            // hard wall clock; provider retries fit well inside

// Build the child environment from scratch (allowlist). Windows env names are case-insensitive,
// so SystemRoot/WINDIR are matched case-insensitively but copied with their EXACT original name
// and value (never rewritten, never logged).
function buildFollowupChildEnv(baseEnv, key) {
  const env = { ELECTRON_RUN_AS_NODE: '1', GEMINI_API_KEY: key };
  for (const name of Object.keys(baseEnv || {})) {
    const upper = name.toUpperCase();
    if ((upper === 'SYSTEMROOT' || upper === 'WINDIR') && typeof baseEnv[name] === 'string') {
      env[name] = baseEnv[name];
    }
  }
  return env;
}

function createFollowupChildRunner(deps) {
  const spawnImpl = (deps && deps.spawnImpl) || spawn;
  const execPath = (deps && deps.execPath) || process.execPath;
  const scriptPath = deps && deps.scriptPath;
  const getKey = deps && deps.getKey;                 // () => decrypted key | null (safeStorage-backed)
  const getBaseEnv = (deps && deps.getBaseEnv) || (() => process.env);
  const stdoutMax = (deps && deps.stdoutMax) || FOLLOWUP_CHILD_STDOUT_MAX;
  const stderrMax = (deps && deps.stderrMax) || FOLLOWUP_CHILD_STDERR_MAX;
  const timeoutMs = (deps && deps.timeoutMs) || FOLLOWUP_CHILD_TIMEOUT_MS;
  if (typeof scriptPath !== 'string' || scriptPath.length === 0) {
    throw new Error('followup-child: scriptPath (the follow-up child script) is required.');
  }
  if (typeof getKey !== 'function') {
    throw new Error('followup-child: getKey (the safeStorage key getter) is required.');
  }

  // run({ report, question }) -> resolves the child's parsed JSON (untrusted — the caller
  // allowlists it) or { ok:false, error:<stable code> }. NEVER rejects.
  function run({ report, question }) {
    return new Promise((resolve) => {
      const key = getKey();
      // Refuse BEFORE spawn: no key means no process and no request, visibly.
      if (typeof key !== 'string' || key.length === 0) {
        return resolve({ ok: false, error: 'gemini-key-missing' });
      }
      let child;
      try {
        child = spawnImpl(execPath, [scriptPath], {
          shell: false,
          windowsHide: true,
          env: buildFollowupChildEnv(getBaseEnv(), key),
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch {
        return resolve({ ok: false, error: 'child-spawn-failed' });
      }

      let settled = false;
      let timer = null;
      const settle = (result) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(result);
      };
      const killChild = () => { try { child.kill(); } catch { } };

      timer = setTimeout(() => { killChild(); settle({ ok: false, error: 'child-timeout' }); }, timeoutMs);

      const outChunks = [];
      let outBytes = 0;
      let errBytes = 0;
      child.on('error', () => { killChild(); settle({ ok: false, error: 'child-spawn-failed' }); });
      child.stdout.on('data', (b) => {
        outBytes += b.length;
        if (outBytes > stdoutMax) { killChild(); settle({ ok: false, error: 'child-output-overflow' }); return; }
        outChunks.push(b);
      });
      // stderr is counted for the bound but its CONTENT is never read into a string, parsed,
      // logged, or forwarded anywhere — it cannot become a leak channel.
      child.stderr.on('data', (b) => {
        errBytes += b.length;
        if (errBytes > stderrMax) { killChild(); settle({ ok: false, error: 'child-output-overflow' }); }
      });
      child.on('close', () => {
        if (settled) return;
        const text = Buffer.concat(outChunks).toString('utf8');
        let parsed = null;
        try { parsed = JSON.parse(text); } catch { parsed = null; }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return settle({ ok: false, error: 'child-malformed-output' });
        }
        settle(parsed);   // untrusted — followup-ipc.js allowlists every field before use
      });

      // The ONLY content transport: one JSON document down stdin, then EOF. An early child death
      // makes this write EPIPE — swallow it; the close/error handlers above settle the result.
      try {
        child.stdin.on('error', () => { });
        child.stdin.end(JSON.stringify({ report, question }));
      } catch {
        killChild();
        settle({ ok: false, error: 'child-spawn-failed' });
      }
    });
  }

  return { run };
}

const api = {
  createFollowupChildRunner, buildFollowupChildEnv,
  FOLLOWUP_CHILD_STDOUT_MAX, FOLLOWUP_CHILD_STDERR_MAX, FOLLOWUP_CHILD_TIMEOUT_MS,
};
if (typeof module === 'object' && module.exports) module.exports = api;
