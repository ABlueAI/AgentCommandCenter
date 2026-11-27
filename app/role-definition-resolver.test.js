'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRoleDefinitionResolver, REASON, ROLE_ARG_ENV, ROLE_SETTINGS_ENV,
  DEFAULT_MANAGED_PATHS, DEFAULT_MANAGED_REGISTRY_KEYS } = require('./role-definition-resolver');

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + label + '\n'); }
  else { failed++; process.stderr.write('  x FAIL: ' + label + '\n'); }
}
function section(title) { process.stdout.write('\n' + title + '\n'); }

function roleDoc(name, model = 'model: sonnet') {
  return ['---', 'name: ' + name, 'description: A short description.', 'tools: Read, Write',
    model, '---', '', 'Body.'].join('\n');
}
const noManaged = () => ({ present: false });

section('Exact deployed role files');
{
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mako-roles-'));
  const agents = path.join(home, '.claude', 'agents');
  const cwd = path.join(home, 'repo');
  const projectAgents = path.join(cwd, '.claude', 'agents');
  const deployed = path.join(agents, 'web-scout.md');
  const resolve = (role = 'web-scout', fsx = fs) => createRoleDefinitionResolver({
    fsx, homeDir: home, managedPaths: [], managedRegistryKeys: [], probeRegistryKey: noManaged,
  }).resolve({ role, cwd });
  try {
    fs.mkdirSync(agents, { recursive: true });
    fs.mkdirSync(projectAgents, { recursive: true });
    fs.writeFileSync(path.join(projectAgents, 'web-scout.md'), roleDoc('web-scout', 'model: opus'));
    fs.writeFileSync(path.join(agents, 'other.md'), roleDoc('web-scout'));
    assert(resolve().reason === REASON.ROLE_NOT_DEPLOYED, 'project and alternate filenames cannot supply the role');
    fs.renameSync(path.join(agents, 'other.md'), path.join(agents, 'Web-Scout.md'));
    assert(resolve().reason === REASON.ROLE_NOT_DEPLOYED, 'filename case must match exactly');
    fs.renameSync(path.join(agents, 'Web-Scout.md'), deployed);
    const result = resolve();
    assert(result.ok && result.path === deployed && result.text === roleDoc('web-scout'), 'uses the exact deployed file');
    const unreadable = Object.assign({}, fs, {
      openSync(file, ...args) {
        if (file === deployed) throw Object.assign(new Error('denied'), { code: 'EACCES' });
        return fs.openSync(file, ...args);
      },
    });
    assert(resolve('web-scout', unreadable).reason === REASON.CANDIDATE_UNREADABLE, 'unreadable file refuses');
    const changed = Object.assign({}, fs, {
      openSync(file, ...args) {
        return fs.openSync(file === deployed ? path.join(projectAgents, 'web-scout.md') : file, ...args);
      },
    });
    assert(resolve('web-scout', changed).reason === REASON.CANDIDATE_UNREADABLE,
      'the opened file must match the exact file inspected');
    // Each malformed definition refuses with its own bounded reason, so Blue can tell which line of
    // which file to fix.
    const doc = (lines, body = 'Body.') => ['---', ...lines, '---', '', body].join('\n');
    const base = ['name: web-scout', 'description: A short description.', 'tools: Read, Write'];
    const malformed = [
      ['No frontmatter.', REASON.ROLE_FRONTMATTER_INVALID, 'no frontmatter'],
      [roleDoc('operator'), REASON.ROLE_NAME_MISMATCH, 'a different name'],
      [Buffer.from([0xff]), REASON.ROLE_NOT_UTF8, 'invalid UTF-8'],
      [roleDoc('web-scout').split('Body.')[0], REASON.ROLE_BODY_EMPTY, 'an empty prompt body'],
      [doc(['name: web-scout', 'description: A short description.']), REASON.ROLE_TOOLS_MISSING, 'no tools line'],
      [doc(['name: web-scout', 'description: A short description.', 'tools:']), REASON.ROLE_TOOLS_EMPTY, 'an empty tools line'],
      [doc(['name: web-scout', 'tools: Read, Write']), REASON.ROLE_DESCRIPTION_MISSING, 'no description'],
      [doc([...base, 'extra: value']), REASON.ROLE_UNKNOWN_FIELD, 'an unknown frontmatter field'],
      [doc([...base, 'permissionMode: bypassPermissions']), REASON.ROLE_INVALID_PERMISSION_MODE, 'a permission mode other than default'],
      [doc([...base, 'permissionMode: acceptEdits']), REASON.ROLE_INVALID_PERMISSION_MODE, 'acceptEdits as the permission mode'],
      [doc([...base, 'model: "bad model!"']), REASON.ROLE_INVALID_MODEL, 'an invalid model'],
      [doc([...base, 'effort: ultra']), REASON.ROLE_INVALID_EFFORT, 'an invalid effort'],
      [doc([...base, 'color: magenta']), REASON.ROLE_INVALID_COLOR, 'a colour outside the list'],
      [doc(base, 'Body with a control \u0001 character.'), REASON.ROLE_CONTROL_CHARACTER, 'a control character'],
      [doc(base, 'x'.repeat(16 * 1024 + 1)), REASON.ROLE_TOO_LARGE, 'a file over 16 KiB'],
      // Spaces encode to six characters each in the launch argument: a file under the size cap whose
      // encoded definition is over the argument cap.
      [doc(base, 'a ' + ' '.repeat(15000) + 'b'), REASON.ROLE_ARG_TOO_LONG, 'an encoded definition over the argument cap'],
    ];
    for (const [content, reason, label] of malformed) {
      fs.writeFileSync(deployed, content);
      const got = resolve();
      assert(got.ok === false && got.reason === reason, `${label} refuses with ${reason} (got ${got.reason})`);
    }
    fs.writeFileSync(deployed, doc([...base, 'permissionMode: default', 'model: sonnet', 'effort: high', 'color: blue']));
    assert(resolve().ok === true, 'the allowed values of every checked field still resolve');
    assert(!Object.prototype.hasOwnProperty.call(REASON, 'CANDIDATE_UNSUPPORTED'),
      'no generic "unsupported grammar" reason is left to hide which check failed');
    fs.unlinkSync(deployed);
    fs.linkSync(path.join(projectAgents, 'web-scout.md'), deployed);
    assert(resolve().reason === REASON.LINKED_ENTRY, 'a hard link cannot supply the role');
    fs.unlinkSync(deployed);
    fs.mkdirSync(deployed);
    assert(resolve().reason === REASON.UNSUPPORTED_ENTRY, 'a directory at the exact filename refuses');
    fs.rmdirSync(deployed);
    fs.renameSync(agents, agents + '-saved');
    fs.symlinkSync(projectAgents, agents, 'junction');
    assert(resolve().reason === REASON.LINKED_ENTRY, 'a linked agents directory refuses');
    fs.rmSync(agents, { force: true });
    fs.renameSync(path.dirname(agents), path.dirname(agents) + '-saved');
    fs.symlinkSync(path.dirname(projectAgents), path.dirname(agents), 'junction');
    assert(resolve().reason === REASON.LINKED_ENTRY, 'a linked configuration directory refuses');
    fs.rmSync(path.dirname(agents), { force: true });
    for (const name of ['other/name', 'other\\name', '..', 'a..b', 'x'.repeat(65), 12]) {
      assert(resolve(name).reason === REASON.BAD_INPUT, 'invalid role name refuses before filename lookup');
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

section('Managed scope');
{
  const resolve = (fsx, probeRegistryKey = noManaged) => createRoleDefinitionResolver({
    fsx, homeDir: os.tmpdir(), probeRegistryKey,
  }).resolve({ role: 'web-scout' });
  for (const p of DEFAULT_MANAGED_PATHS) {
    assert(resolve({ existsSync: (name) => name === p }).reason === REASON.MANAGED_PRESENT,
      'a managed path refuses before file lookup');
  }
  for (const key of DEFAULT_MANAGED_REGISTRY_KEYS) {
    assert(resolve({ existsSync: () => false }, (name) => ({ present: name === key })).reason === REASON.MANAGED_PRESENT,
      'a managed registry key refuses before file lookup');
  }
  assert(resolve({ existsSync() { throw new Error('EPERM'); } }).reason === REASON.MANAGED_UNREADABLE,
    'a managed filesystem error refuses visibly');
  for (const probe of [() => ({}), () => { throw new Error('EPERM'); }]) {
    assert(resolve({ existsSync: () => false }, probe).reason === REASON.MANAGED_UNREADABLE,
      'inconclusive managed registry checks refuse visibly');
  }
  assert(DEFAULT_MANAGED_PATHS.every((p) => !p.includes('ProgramData')), 'managed checks exclude the obsolete path');
}

section('All shipped roles resolve and serialize');
{
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mako-deployed-roles-'));
  const agents = path.join(home, '.claude', 'agents');
  fs.mkdirSync(agents, { recursive: true });
  const source = path.join(__dirname, '..', 'agent-roles');
  const resolver = createRoleDefinitionResolver({
    fsx: fs, homeDir: home, probeRegistryKey: noManaged, managedPaths: [], managedRegistryKeys: [],
  });
  try {
    const echo = path.join(home, 'echo-argv.js');
    fs.writeFileSync(echo, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
    for (const file of fs.readdirSync(source).filter((name) => name.endsWith('.md') && name !== 'README.md')) {
      const role = path.basename(file, '.md');
      const sourceText = fs.readFileSync(path.join(source, file), 'utf8');
      const deployed = sourceText.replace('__CC_HOOK__', path.join(home, 'hook-file.js').replaceAll('\\', '/'));
      fs.writeFileSync(path.join(agents, file), deployed);
      const resolved = resolver.resolve({ role });
      assert(resolved.ok && !/\s/.test(resolved.roleArg), role + ' produces one whitespace-free native argument');
      if (resolved.ok && process.platform === 'win32') {
        // Drive PowerShell 5.1's actual legacy native argument path. The fixture
        // echoes argv and does not start Claude or call a provider.
        const command = '& $env:MAKO_TEST_NODE $env:MAKO_TEST_ECHO --agents $env:' + ROLE_ARG_ENV
          + (resolved.settingsArg ? ' --settings $env:' + ROLE_SETTINGS_ENV : '');
        const output = execFileSync('powershell.exe', ['-NoProfile', '-Command', command], {
          encoding: 'utf8',
          env: { ...process.env, MAKO_TEST_NODE: process.execPath,
            MAKO_TEST_ECHO: echo,
            [ROLE_ARG_ENV]: resolved.roleArg, [ROLE_SETTINGS_ENV]: resolved.settingsArg || '' },
        });
        const argv = JSON.parse(output);
        const agent = JSON.parse(argv[argv.indexOf('--agents') + 1])[role];
        assert(agent.tools.length > 0 && agent.description && agent.prompt.trim(),
          role + ' reaches the native process as the checked agent JSON');
        if (resolved.settingsArg) {
          const settings = JSON.parse(argv[argv.indexOf('--settings') + 1]);
          assert(settings.hooks.PreToolUse[0].hooks[0].command.includes('/hook-file.js'),
            role + ' carries the checked hook through the same argv boundary');
        }
      }
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}
process.stdout.write(`\nrole-definition-resolver: ${passed} passed, ${failed} failed\n`);
process.exitCode = failed ? 1 : 0;
