'use strict';

// Resolve push destinations using read-only Git and GitHub calls. The hook never runs a push.
class PushRefusal extends Error {}

const REFUSED_OPTIONS = new Set(['--all', '--branches', '--mirror', '--tags', '--follow-tags', '--prune',
  '--delete', '--force', '--force-with-lease', '--force-if-includes']);
const VALUE_OPTIONS = new Set(['--repo', '--receive-pack', '--exec', '--push-option', '--recurse-submodules']);
const SHORT_SWITCHES = new Set(['v', 'q', 'u', 'n', '4', '6']);

function refuse(reason) {
  throw new PushRefusal(reason);
}

function pushArguments(args) {
  let remote;
  let positionalOnly = false;
  const positionals = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!positionalOnly && arg === '--') { positionalOnly = true; continue; }
    if (positionalOnly || !arg.startsWith('-')) { positionals.push(arg); continue; }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const flag = eq === -1 ? arg : arg.slice(0, eq);
      if (REFUSED_OPTIONS.has(flag)) refuse('force, deletion and bulk push options are blocked');
      if (VALUE_OPTIONS.has(flag)) {
        const value = eq === -1 ? args[++i] : arg.slice(eq + 1);
        if (!value) refuse('a push option is missing its value');
        if (flag === '--repo') remote = value;
        if (flag === '--recurse-submodules' && !['no', 'check'].includes(value)) refuse('submodule pushes are blocked');
      } else if (!/^--(?:no-)?(?:atomic|dry-run|signed|porcelain|progress|quiet|set-upstream|verbose|verify|thin|ipv4|ipv6)$/.test(flag)
        && flag !== '--no-recurse-submodules' && flag !== '--no-follow-tags') {
        refuse('the push option could not be verified');
      }
      continue;
    }
    for (let j = 1; j < arg.length; j++) {
      const flag = arg[j];
      if (flag === 'f' || flag === 'd') refuse('force and deletion pushes are blocked');
      if (flag === 'o') {
        if (j + 1 === arg.length && !args[++i]) refuse('a push option is missing its value');
        break;
      }
      if (!SHORT_SWITCHES.has(flag)) refuse('the push option could not be verified');
    }
  }
  if (remote && positionals.length && !positionals[0].includes(':')) {
    // Git takes a positional repository ahead of --repo when both are present.
    refuse('the push lists two possible repositories');
  }
  return { remote: remote || positionals.shift(), refs: positionals };
}

function destination(ref) {
  if (ref.startsWith('+')) refuse('force-push refspecs are blocked');
  if (ref.startsWith(':')) refuse('deletion and matching refspecs are blocked');
  const colon = ref.indexOf(':');
  const target = colon === -1 ? ref : ref.slice(colon + 1);
  if (!target || /[\s*?\[\]~^:\\$]/.test(target)) refuse('a push destination could not be verified');
  if (target.startsWith('refs/') && !target.startsWith('refs/heads/')) {
    if (target.startsWith('refs/tags/')) return null;
    refuse('the push destination is outside branches and tags');
  }
  const branch = target.replace(/^refs\/heads\//, '');
  if (!branch || branch.startsWith('-')) refuse('a push destination could not be verified');
  if (branch === 'main') refuse('pushes to main are blocked');
  return branch;
}

function gitConfig(output) {
  const config = new Map();
  for (const entry of output.split('\0')) {
    if (!entry) continue;
    const nl = entry.indexOf('\n');
    const key = nl === -1 ? entry : entry.slice(0, nl);
    const values = config.get(key) || [];
    values.push(nl === -1 ? '' : entry.slice(nl + 1));
    config.set(key, values);
  }
  return config;
}

function enabled(value) {
  return value !== undefined && !/^(?:no|off|false|0)$/i.test(value);
}

function remoteOverride(config, url) {
  let instead = '';
  let replacement = '';
  for (const type of ['pushinsteadof', 'insteadof']) {
    for (const [key, values] of config) {
      if (!key.startsWith('url.') || !key.endsWith(`.${type}`)) continue;
      for (const value of values) {
        if (value.length <= instead.length || !url.startsWith(value)) continue;
        instead = value;
        replacement = key.slice(4, -type.length - 1);
      }
    }
    if (instead) return replacement + url.slice(instead.length);
  }
  return url;
}

function gitHubRepository(url) {
  const location = /^(?:https?:\/\/|ssh:\/\/(?:git@)?|git@)(?:github\.com|ssh\.github\.com)(?::443\/|[:/])([\w.-]+\/[\w.-]+)\/?$/i.exec(url);
  if (location) return location[1].replace(/\.git$/i, '');
  if (/^(?:file:\/\/|\/|\.{1,2}(?:$|[\\/])|[a-z]:[\\/])/i.test(url)) return null;
  refuse('the push remote could not be verified as a GitHub repository or local path');
}

function resolvePush(push, git, charge) {
  const { remote: explicitRemote, refs } = pushArguments(push.args);
  let branches = refs.map(destination);
  const runGit = (args) => git([...push.globalArgs, ...args]);
  const rawConfig = runGit(['config', '--null', '--list']);
  charge(rawConfig.length);
  const config = gitConfig(rawConfig);
  const get = (key) => config.get(key)?.at(-1);
  let branch;
  const currentBranch = () => {
    if (branch === undefined) branch = runGit(['symbolic-ref', '--quiet', '--short', 'HEAD']).trim();
    if (!branch) refuse('the current branch could not be verified');
    return branch;
  };
  if (get('push.recursesubmodules') && !['no', 'check'].includes(get('push.recursesubmodules'))) refuse('configured submodule pushes are blocked');
  if (enabled(get('push.followtags'))) refuse('configured bulk tag pushes are blocked');

  let remote = explicitRemote;
  if (!remote) {
    const name = currentBranch();
    const remotes = new Set([...config.keys()].filter((key) => /^remote\..+\.(?:url|pushurl)$/.test(key))
      .map((key) => key.slice(7, key.lastIndexOf('.'))));
    remote = get(`branch.${name}.pushremote`) ?? get('remote.pushdefault') ?? get(`branch.${name}.remote`)
      ?? (remotes.size === 1 ? remotes.values().next().value : 'origin');
  }
  if (enabled(get(`remote.${remote}.mirror`))) refuse('configured mirror pushes are blocked');

  if (!refs.length) {
    const configured = config.get(`remote.${remote}.push`);
    if (configured?.length) branches = configured.map(destination);
    else {
      const behavior = (get('push.default') ?? 'simple').toLowerCase();
      if (behavior === 'nothing') return [];
      if (behavior === 'matching') refuse('push.default=matching pushes multiple branches');
      const name = currentBranch();
      const upstreamRemote = get(`branch.${name}.remote`);
      const upstream = config.get(`branch.${name}.merge`) || [];
      if (behavior === 'upstream' || behavior === 'tracking') {
        if (upstreamRemote !== remote || upstream.length !== 1) refuse('the upstream push destination could not be verified');
        branches = upstream.map(destination);
      } else if (behavior === 'current' || behavior === 'simple') branches = [destination(`refs/heads/${name}`)];
      else refuse('the configured push.default could not be verified');
    }
  }
  const branchNames = new Set(branches.filter(Boolean).map((name) => name === 'HEAD' ? destination(`refs/heads/${currentBranch()}`) : name));
  if (!branchNames.size) return [];
  const urls = /[/:\\]/.test(remote) || remote === '.'
    ? [remoteOverride(config, remote)]
    : runGit(['remote', 'get-url', '--push', '--all', '--', remote]).trim().split(/\r?\n/);
  if (!urls[0]) refuse('the push remote has no URL');
  return urls.map(gitHubRepository).filter(Boolean).map((repo) => ({ repo, branchNames }));
}

function checkPushes(pushes, { login, git, openPulls, charge }) {
  const repositories = new Map();
  const seen = new Set();
  for (const push of pushes) {
    const key = JSON.stringify(push);
    if (seen.has(key)) continue;
    seen.add(key);
    charge(key.length);
    for (const { repo, branchNames } of resolvePush(push, git, charge)) {
      const key = repo.toLowerCase();
      if (!repositories.has(key)) repositories.set(key, new Set());
      for (const branch of branchNames) repositories.get(key).add(branch);
    }
  }
  for (const [repo, branches] of repositories) {
    const pulls = openPulls(repo);
    if (!Array.isArray(pulls)) refuse('GitHub returned an unreadable pull request list');
    for (const pr of pulls) {
      charge();
      const author = pr?.user?.login;
      if (author && login && author.toLowerCase() === login.toLowerCase()) continue;
      for (const ref of [pr?.head, pr?.base]) {
        if (ref?.repo?.full_name?.toLowerCase() === repo && branches.has(ref.ref)) {
          refuse('a destination branch is in use by another open pull request');
        }
      }
    }
  }
}

module.exports = { checkPushes, PushRefusal };
