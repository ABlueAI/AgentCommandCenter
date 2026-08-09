// Dockview network tripwire + controlled fixture generator (prototype branch only).
//
// This file serves the two evidence obligations the Dockview work order places on the candidate
// BEFORE any of it is wired into the real app:
//
//   1. § 10 check 2 — "Run a minimal Dockview-only harness with Electron request monitoring and
//      zero permitted HTTP(S), WebSocket, EventSource, or beacon traffic."
//   2. § 9 — "Derive the exact allowlisted layout shape from controlled dockview@7.0.4 fixtures."
//      The layout validator must be built against what dockview@7.0.4 ACTUALLY serializes, not
//      against a shape guessed from its TypeScript definitions.
//
// It is a standalone Electron entry point. It is NOT reachable from main.js, is never imported by
// the app, and runs only when invoked explicitly:
//
//     npm run prototype:dockview:tripwire
//
// Isolation properties that make this honest evidence rather than a rehearsal:
//   * Its own session partition, so it cannot inherit or be polluted by the app's session state.
//   * EVERY request is recorded and every non-file:// request is CANCELLED, so a phone-home would
//      both show up in the record and fail — it cannot succeed quietly.
//   * The page loads exactly one script: the vendor bundle. No app code, no preload, no IPC bridge.
//      Nothing else in the process could generate a request and have it misattributed to Dockview.
//   * Metadata only is recorded — scheme, host, resource type, count. Never a full URL, query
//      string, path, or body (§ 10: "Do not log URLs containing queries, credentials, paths,
//      report text, or user content").
//
// Output is a single JSON document on stdout so a test can consume it without scraping logs.

const { app, BrowserWindow, session } = require('electron');
const path = require('path');

const HARNESS_URL_FILE = path.join(__dirname, 'dockview-tripwire.html');
// A real layout must be exercised, not just a bare mount: the fixture has to contain a split
// (branch node), a tab group (two panels in one group), and both allowlisted component kinds,
// because those are the shapes the validator has to accept. A single-panel fixture would let an
// over-strict validator pass here and reject every real save.
const FIXTURE_TIMEOUT_MS = 20000;

/** Requests observed during the harness run. Metadata only — never a full URL. */
const observed = [];

function recordRequest(details) {
  let scheme = 'unknown';
  let host = '';
  try {
    const u = new URL(details.url);
    scheme = u.protocol.replace(/:$/, '');
    host = u.host; // host only — no path, no query, no fragment
  } catch {
    // A URL we cannot even parse is still worth counting; it just has no attributable host.
  }
  observed.push({ scheme, host, resourceType: details.resourceType || 'unknown' });
  return scheme === 'file';
}

function summarize() {
  const counts = new Map();
  for (const r of observed) {
    const key = `${r.scheme}|${r.host}|${r.resourceType}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => {
    const [scheme, host, resourceType] = key.split('|');
    return { scheme, host, resourceType, count };
  }).sort((a, b) => (a.scheme + a.host).localeCompare(b.scheme + b.host));
}

function fail(stage, message) {
  process.stdout.write(JSON.stringify({
    ok: false, stage, error: String(message),
    requests: summarize(),
    remoteRequestCount: observed.filter(r => r.scheme !== 'file').length,
  }, null, 2) + '\n');
  app.exit(1);
}

app.whenReady().then(async () => {
  // Dedicated partition: this harness must not share (or contaminate) the app's session.
  const ses = session.fromPartition('dockview-tripwire', { cache: false });

  // Record everything; allow only file://. A remote request is both recorded AND cancelled, so
  // "zero remote traffic" is enforced, not merely observed — the evidence cannot be a near-miss.
  ses.webRequest.onBeforeRequest((details, callback) => {
    const allowed = recordRequest(details);
    callback({ cancel: !allowed });
  });

  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    webPreferences: {
      session: ses,
      contextIsolation: true,   // same posture as the real app
      nodeIntegration: false,   // Dockview must work WITHOUT node integration (§ 5 kill criterion 4)
      sandbox: true,
    },
  });

  win.webContents.on('render-process-gone', (_e, d) => fail('render-process-gone', (d && d.reason) || 'unknown'));

  try {
    await win.loadFile(HARNESS_URL_FILE);
  } catch (e) {
    return fail('loadFile', (e && e.message) || e);
  }

  // Drive the page from main. The page itself has no script of its own, so anything observed
  // below is attributable to the vendor bundle alone.
  let result;
  try {
    result = await Promise.race([
      win.webContents.executeJavaScript(BUILD_FIXTURE_SOURCE, true),
      new Promise((_, reject) => setTimeout(() => reject(new Error('fixture build timed out')), FIXTURE_TIMEOUT_MS)),
    ]);
  } catch (e) {
    return fail('executeJavaScript', (e && e.message) || e);
  }

  const remoteRequestCount = observed.filter(r => r.scheme !== 'file').length;
  process.stdout.write(JSON.stringify({
    ok: result && result.ok === true && remoteRequestCount === 0,
    dockviewVersion: require('dockview/package.json').version,
    loadedUnderStrictCsp: result && result.ok === true,
    remoteRequestCount,
    requests: summarize(),
    fixture: result && result.fixture,
    fixtureError: result && result.error,
  }, null, 2) + '\n');

  app.exit(remoteRequestCount === 0 && result && result.ok === true ? 0 : 1);
});

// Kept as a string so it is unambiguous that this runs in the PAGE, not in main. It uses only the
// global the UMD bundle publishes (`window.dockview`) — proving the bundle loads and is usable in a
// context-isolated, sandboxed, node-integration-free renderer under a strict CSP.
const BUILD_FIXTURE_SOURCE = `(() => {
  try {
    if (!window.dockview || typeof window.dockview.createDockview !== 'function') {
      return { ok: false, error: 'window.dockview.createDockview missing after <script src> load' };
    }
    const host = document.getElementById('host');
    const api = window.dockview.createDockview(host, {
      disableFloatingGroups: true,          // § 6: floating windows are outside acceptance scope
      createComponent: () => {
        const element = document.createElement('div');
        return { element, init: () => {} };
      },
    });

    // Mirror the real prototype workspace: two terminals + one Library pane, arranged as a split
    // with a tab group, so the fixture contains leaf nodes, a branch node, and a multi-view group.
    api.addPanel({ id: 'pty1', component: 'terminal', title: 'Terminal 1' });
    api.addPanel({ id: 'pty2', component: 'terminal', title: 'Terminal 2', position: { direction: 'right' } });
    api.addPanel({ id: 'library', component: 'library', title: 'Library', position: { referencePanel: 'pty2', direction: 'within' } });

    return { ok: true, fixture: api.toJSON() };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
})()`;
