'use strict';
// Run: node app/pane-status/pane-status-version.test.js
//
// Version gating. The DEFAULT ANSWER IS STILL NO: not probed, probe failed, unparseable, older than
// the floor, and a different major version are all unsupported. Since Blue's 2026-10-16 amendment, a
// later release of the floor's major version is SUPPORTED but not VERIFIED.

const versionMod = require('./pane-status-version');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// ---------------------------------------------------------------- parsing
assert(versionMod.parseVersion('2.1.196 (Claude Code)') === '2.1.196', 'a version is taken from the leading dotted triple');
assert(versionMod.parseVersion('  2.1.196\n') === '2.1.196', 'surrounding whitespace is tolerated');
assert(versionMod.parseVersion('2.1.196') === '2.1.196', 'a bare triple parses');
assert(versionMod.parseVersion('v2.1.196') === null, 'a leading v is NOT silently accepted');
assert(versionMod.parseVersion('2.1') === null, 'a two-part version does not parse');
assert(versionMod.parseVersion('') === null, 'empty output does not parse');
assert(versionMod.parseVersion(null) === null, 'null does not parse');
assert(versionMod.parseVersion('claude 2.1.196') === null, 'the triple must be at the START — no scanning for one anywhere');

// ---------------------------------------------------------------- verified list plus a same-major floor
assert(versionMod.isVersionSupported('2.1.196', ['2.1.196']) === true, 'an exactly listed version is supported');
assert(versionMod.isVersionVerified('2.1.196', ['2.1.196']) === true, 'and verified');
assert(versionMod.isVersionSupported('2.1.197', ['2.1.196'], '2.1.200') === false, 'an unlisted version BELOW the floor is NOT supported');
assert(versionMod.isVersionSupported('2.1.195', ['2.1.196']) === false, 'an unlisted version below the default floor is NOT supported');
assert(versionMod.isVersionSupported('2.1.196', [], '2.1.200') === false, 'an empty list below the floor supports nothing');
assert(versionMod.isVersionSupported(null, ['2.1.196']) === false, 'null is not supported');
assert(versionMod.isVersionSupported('', ['2.1.196']) === false, 'empty string is not supported');
assert(versionMod.MINIMUM_CLAUDE_VERSION === '2.1.228', 'the shipped floor is the first verified version, 2.1.228');
assert(versionMod.isVersionSupported('2.1.228', []) === true, 'the floor itself is supported');
assert(versionMod.isVersionSupported('2.1.283', []) === true, 'a later patch release of the same major version is supported');
assert(versionMod.isVersionVerified('2.1.283', versionMod.SUPPORTED_CLAUDE_VERSIONS) === false, 'but is NOT verified');
assert(versionMod.isVersionSupported('2.2.0', []) === true, 'a later minor release of the same major version is supported');
assert(versionMod.isVersionSupported('2.1.227', []) === false, 'the release just below the floor is NOT supported');
assert(versionMod.isVersionSupported('3.0.0', []) === false, 'a NEW MAJOR version is NOT supported');
assert(versionMod.isVersionSupported('1.9.999', []) === false, 'an OLDER major version is NOT supported');
assert(versionMod.isVersionSupported('2.1.300-beta', []) === false, 'a suffixed string is never compared as a number');
assert(versionMod.compareVersions('2.1.10', '2.1.9') > 0, 'comparison is numeric, not lexical');

// The shipped list is PROVISIONAL and is filled only by the § 18 probe.
assert(Array.isArray(versionMod.SUPPORTED_CLAUDE_VERSIONS), 'the shipped supported list exists');
assert(Object.isFrozen(versionMod.SUPPORTED_CLAUDE_VERSIONS), 'and is frozen');
assert(versionMod.SUPPORTED_CLAUDE_VERSIONS.every((v) => /^\d+\.\d+\.\d+$/.test(v)),
  'every shipped entry is an EXACT triple — no ranges, no carets, no wildcards');

// WO15A — the shipped list admits EXACTLY the two probed versions and nothing adjacent to them.
// 2.1.241 was admitted only after Claude Code auto-updated mid-order and this fail-closed gate
// stopped Work Order 15 before its paid turn. Both entries are recorded probe results, never
// inferences about a neighbouring release.
{
  const shipped = versionMod.SUPPORTED_CLAUDE_VERSIONS;
  assert(shipped.length === 2, 'the shipped list holds exactly two entries');
  assert(shipped.indexOf('2.1.228') !== -1, '2.1.228 is retained');
  assert(shipped.indexOf('2.1.241') !== -1, '2.1.241 is admitted');
  assert(shipped.slice().sort().join(',') === '2.1.228,2.1.241',
    'the shipped list is exactly {2.1.228, 2.1.241} — no third entry crept in');

  // Accepted against the SHIPPED array, not a local fixture.
  assert(versionMod.isVersionSupported('2.1.241', shipped) === true, '2.1.241 is supported by the shipped list');
  assert(versionMod.isVersionSupported('2.1.228', shipped) === true, '2.1.228 is still supported by the shipped list');

  // Since the 2026-10-16 amendment, unlisted releases at or above the floor are supported but not
  // verified, and releases below it stay refused. Verification still means exact membership.
  for (const near of ['2.1.240', '2.1.242', '2.1.229', '2.1.239', '2.1.2410']) {
    assert(versionMod.isVersionSupported(near, shipped) === true && versionMod.isVersionVerified(near, shipped) === false,
      `an unlisted release ${near} at or above the floor is supported but NOT verified`);
  }
  for (const below of ['2.1.227', '2.1.24']) {
    assert(versionMod.isVersionSupported(below, shipped) === false,
      `an unlisted release ${below} below the floor is NOT supported`);
  }
  // SUPPLEMENTARY ONLY - NOT proof of raw-output rejection. WO15A-R: an independent Full review
  // found this assertion non-representative, and it was right. Production never hands a raw string
  // to isVersionSupported(); it hands it to parseVersion() FIRST. Under the old parser
  // '2.1.241-beta' normalized to '2.1.241' and the gate OPENED, while this leaf-level assertion
  // passed and appeared to prove the opposite. The load-bearing proof is the composed-path block
  // below; this line survives only as evidence about the leaf function itself.
  assert(versionMod.isVersionSupported('2.1.241-beta', shipped) === false,
    '[supplementary] the leaf membership check rejects a suffixed string handed to it directly');
  assert(versionMod.parseVersion('2.1.241 (Claude Code)') === '2.1.241',
    'the real 2.1.241 --version line parses to the exact admitted string');
}

// ---------------------------------------------------------------- the gate, fail-closed
(async () => {
  {
    const gate = versionMod.createVersionGate({ resolveVersion: async () => ({ ok: true, raw: '9.9.9' }), supportedVersions: ['9.9.9'] });
    assert(gate.supported() === false, 'BEFORE any probe the gate says NO');
    assert(gate.reason() === versionMod.VERSION_REFUSAL.NOT_PROBED, 'and the reason is version-not-probed');
    const r = await gate.probe();
    assert(r.ok === true && r.supported === true && r.verified === true, 'a listed version probes as supported and verified');
    assert(gate.supported() === true && gate.verified() === true && gate.reason() === null, 'and the gate opens');
  }
  {
    const gate = versionMod.createVersionGate({ resolveVersion: async () => ({ ok: true, raw: '9.9.8' }), supportedVersions: ['9.9.9'] });
    await gate.probe();
    assert(gate.supported() === false && gate.reason() === versionMod.VERSION_REFUSAL.UNSUPPORTED,
      'an UNLISTED version leaves the gate closed with version-unsupported');
  }
  {
    const gate = versionMod.createVersionGate({ resolveVersion: async () => ({ ok: true, raw: 'garbage' }), supportedVersions: ['9.9.9'] });
    await gate.probe();
    assert(gate.supported() === false && gate.reason() === versionMod.VERSION_REFUSAL.UNPARSEABLE,
      'unparseable output leaves the gate closed');
  }
  {
    const gate = versionMod.createVersionGate({ resolveVersion: async () => ({ ok: false }), supportedVersions: ['9.9.9'] });
    await gate.probe();
    assert(gate.supported() === false && gate.reason() === versionMod.VERSION_REFUSAL.RESOLVER_FAILED,
      'a failed resolver leaves the gate closed');
  }
  {
    const gate = versionMod.createVersionGate({ resolveVersion: async () => { throw new Error('boom'); }, supportedVersions: ['9.9.9'] });
    await gate.probe();
    assert(gate.supported() === false, 'a THROWING resolver leaves the gate closed rather than crashing startup');
  }
  {
    const gate = versionMod.createVersionGate({ supportedVersions: ['9.9.9'] });     // no resolver at all
    const r = await gate.probe();
    assert(r.ok === false && gate.supported() === false, 'no resolver at all leaves the gate closed');
  }

  // ---------------------------------------------------------------- the acceptance record
  {
    const gate = versionMod.createVersionGate({
      resolveVersion: async () => ({ ok: true, raw: '9.9.9 (Claude Code)', executable: 'C:/x/claude.exe' }),
      supportedVersions: ['9.9.9'],
    });
    await gate.probe();
    const rec = gate.record();
    assert(rec.observed === '9.9.9', 'the record carries the exact parsed version');
    assert(rec.raw === '9.9.9 (Claude Code)', 'and the raw output');
    assert(rec.executable === 'C:/x/claude.exe', 'and the resolved executable');
    assert(rec.supported === true && rec.verified === true, 'and the verdict');
    assert(rec.minimumVersion === versionMod.MINIMUM_CLAUDE_VERSION, 'and the floor it was judged against');
    assert(JSON.stringify(rec).indexOf('token') === -1, 'and no token');
  }

  // WO15A — the GATE, driven by the SHIPPED list rather than a fixture: it opens on the real 2.1.241
  // version line, and (since the 2026-10-16 amendment) opens UNVERIFIED on the next patch release.
  {
    const gate = versionMod.createVersionGate({
      resolveVersion: async () => ({ ok: true, raw: '2.1.241 (Claude Code)' }),
      supportedVersions: versionMod.SUPPORTED_CLAUDE_VERSIONS,
    });
    assert(gate.supported() === false, 'even an admitted version is NOT assumed supported before the probe runs');
    const r = await gate.probe();
    assert(r.ok === true && r.supported === true, 'probing the real 2.1.241 version line opens the gate');
    assert(gate.supported() === true && gate.reason() === null, 'and the gate reports no refusal reason');
  }
  {
    const gate = versionMod.createVersionGate({
      resolveVersion: async () => ({ ok: true, raw: '2.1.242 (Claude Code)' }),
      supportedVersions: versionMod.SUPPORTED_CLAUDE_VERSIONS,
    });
    const r = await gate.probe();
    assert(r.supported === true && r.verified === false,
      'the patch release immediately after an admitted one is supported but unverified');
    assert(gate.supported() === true && gate.verified() === false && gate.reason() === null,
      'and the gate opens without a refusal reason');
  }

  // ------------------------------------------------- WO15A-R: THE COMPOSED PRODUCTION PATH
  // Everything above this line tests a leaf. This block tests what production actually runs:
  //     createVersionGate() -> parseVersion() -> isVersionSupported()
  // against the REAL shipped allowlist. The independent Full review's negative control is
  // reproduced here as a regression test: under the old leading-triple parser, each of
  // '2.1.241-beta', '2.1.241+build' and '2.1.241.1' parsed to '2.1.241' and OPENED this gate.
  const SHIPPED = versionMod.SUPPORTED_CLAUDE_VERSIONS;
  const gateFor = (raw) => versionMod.createVersionGate({
    resolveVersion: async () => ({ ok: true, raw }),
    supportedVersions: SHIPPED,
  });

  // --- positive: the two accepted forms, and the real observed Windows framing ---
  for (const raw of ['2.1.241', '2.1.241 (Claude Code)', '2.1.241 (Claude Code)\r\n', '2.1.228', '2.1.228 (Claude Code)']) {
    const gate = gateFor(raw);
    assert(gate.supported() === false, `gate is CLOSED before probing ${JSON.stringify(raw)}`);
    const r = await gate.probe();
    assert(r.ok === true && gate.supported() === true && gate.reason() === null,
      `composed path ADMITS ${JSON.stringify(raw)}`);
  }

  // --- negative: malformed / unprobed shapes must be UNPARSEABLE, never normalized ---
  // These are the review's exact negative control plus the remaining Section 3 rejects.
  for (const raw of ['2.1.241-beta', '2.1.241+build', '2.1.241.1', '2.1.241  (Claude Code)',
                     '2.1.241 (claude code)', '2.1.241 (CLAUDE CODE)', '2.1.241 (Claude Code) junk',
                     'claude 2.1.241', 'v2.1.241', '2.1', '2.1.241\nfoo', '']) {
    const gate = gateFor(raw);
    await gate.probe();
    assert(gate.supported() === false,
      `composed path REFUSES ${JSON.stringify(raw)} - it is not normalized onto an admitted version`);
    assert(gate.reason() === versionMod.VERSION_REFUSAL.UNPARSEABLE,
      `and classifies ${JSON.stringify(raw)} as version-unparseable`);
  }

  // --- negative: WELL-FORMED but below the floor or another major must be UNSUPPORTED ---
  for (const raw of ['2.1.227', '2.1.196', '2.0.999', '3.0.0', '1.9.300', '3.0.0 (Claude Code)']) {
    const gate = gateFor(raw);
    await gate.probe();
    assert(gate.supported() === false, `composed path REFUSES ${JSON.stringify(raw)}`);
    assert(gate.reason() === versionMod.VERSION_REFUSAL.UNSUPPORTED,
      `and classifies ${JSON.stringify(raw)} as version-unsupported, not unparseable`);
  }

  // --- positive, unverified: later same-major releases, including the real versions Blue's machine
  // ran during the September runs (2.1.250, 2.1.283) ---
  for (const raw of ['2.1.242', '2.1.250', '2.1.283 (Claude Code)', '2.1.300 (Claude Code)\r\n', '2.2.0']) {
    const gate = gateFor(raw);
    await gate.probe();
    assert(gate.supported() === true && gate.verified() === false && gate.reason() === null,
      `composed path ADMITS ${JSON.stringify(raw)} as supported but unverified`);
  }

  // --- resolver-level fixture: the REAL tagged PowerShell stdout framing observed on the
  // acceptance machine (CRLF-framed, single 0x20 before the case-sensitive literal). This
  // exercises interpretProbe -> readTag -> parseVersion rather than reconstructing a parsed
  // version by hand, so the tag extraction is part of what is proven.
  const tagged = (versionText) =>
    versionMod.SOURCE_TAG + 'C:\\Users\\acceptance\\.local\\bin\\claude.exe\r\n'
    + versionMod.VERSION_TAG + versionText + '\r\n';
  const resolverFor = (versionText) => versionMod.createClaudeVersionResolver({
    execFile: (_exe, _args, _opts, cb) => cb(null, tagged(versionText)),
    env: {},
    commandName: 'claude',
  });
  {
    const res = await resolverFor('2.1.241 (Claude Code)').discover();
    assert(res.ok === true && res.version === '2.1.241',
      'the real tagged CRLF resolver output parses to exactly 2.1.241 through readTag + parseVersion');
    const gate = versionMod.createVersionGate({
      resolveVersion: () => resolverFor('2.1.241 (Claude Code)').discover(),
      supportedVersions: SHIPPED,
    });
    assert(gate.supported() === false, 'gate closed before the resolver-backed probe');
    await gate.probe();
    assert(gate.supported() === true && gate.reason() === null,
      'the full resolver -> gate -> allowlist chain admits the real observed output');
  }
  for (const bad of ['2.1.241-beta', '2.1.241+build', '2.1.241.1']) {
    const res = await resolverFor(bad).discover();
    assert(res.ok === false && res.version === null && res.reason === 'version-unparseable',
      `the resolver refuses tagged output ${JSON.stringify(bad)} as version-unparseable`);
    const gate = versionMod.createVersionGate({
      resolveVersion: () => resolverFor(bad).discover(),
      supportedVersions: SHIPPED,
    });
    await gate.probe();
    assert(gate.supported() === false,
      `and the gate STAYS CLOSED for tagged ${JSON.stringify(bad)} - the review's negative control`);
  }

  // ---------------------------------------------------------------- the module cannot spawn
  {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, 'pane-status-version.js'), 'utf8');
    // Match an actual require, not the words in the file's own explanatory comments.
    assert(!/require\(\s*['"]child_process['"]\s*\)/.test(src),
      'pane-status-version.js never requires child_process — the resolver is injected');
  }

  process.stdout.write(`\npane-status-version: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
