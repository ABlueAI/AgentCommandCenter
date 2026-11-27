'use strict';

// Resolve push destinations using read-only Git and GitHub calls. The hook never runs a push.
// Where the hook can't be sure it reaches the same destination as git, it refuses the push (fails
// closed): a destination is checked under every name git could give it, never only the likeliest one.
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
  // With both --repo and a positional, git takes the first positional as the repository, even one
  // spelled like a refspec (`git@github.com:o/r.git`). The hook doesn't guess which one git uses.
  if (remote && positionals.length) refuse('the push lists two possible repositories');
  remote = remote || positionals.shift();
  // `tag <name>` is git's short form of refs/tags/<name>:refs/tags/<name>.
  const refs = [];
  for (let i = 0; i < positionals.length; i++) {
    if (positionals[i] === 'tag' && i + 1 < positionals.length) {
      refs.push(`refs/tags/${positionals[++i]}:refs/tags/${positionals[i]}`);
    } else refs.push(positionals[i]);
  }
  return { remote, refs };
}

// A ref name the hook can read: no glob, revision syntax or anything git's ref-name rules reject.
function unreadableName(name) {
  return !name || /[\s*?[\]~^:\\$]|\.\.|@\{|\/\/|\/\.|^[./-]|[/.]$|\.lock(?:\/|$)|^@$/.test(name);
}

// Every branch on the remote that a destination name could update. A full name is exact. A short
// name is matched by git against the remote's refs (refs/<name>, refs/tags/<name>, refs/heads/<name>
// and so on), so `heads/main` reaches refs/heads/main; failing a match, git guesses a prefix from the
// source. Both readings are returned. A tag-only destination returns no branch.
function destinationBranches(target) {
  if (unreadableName(target)) refuse('a push destination could not be verified');
  if (target.startsWith('refs/')) {
    if (target.startsWith('refs/heads/')) return [target.slice('refs/heads/'.length)];
    if (target.startsWith('refs/tags/')) return [];
    refuse('the push destination is outside branches and tags');
  }
  // HEAD, FETCH_HEAD and the like name a pseudo-ref, not a branch: as a destination they can't be read.
  if (/^[A-Z_]*HEAD$/.test(target)) refuse('a push destination could not be verified');
  return target.startsWith('heads/') ? [target, target.slice('heads/'.length)] : [target];
}

// The local full ref names a source-only refspec (`git push origin topic`) could stand for; git then
// pushes to the same full name on the remote. `HEAD` and its alias `@` are the current branch.
function sourceRefs(ref, currentBranch) {
  if (ref === 'HEAD' || ref === '@') return [`refs/heads/${currentBranch()}`];
  if (unreadableName(ref) || /^[A-Z_]*HEAD$/.test(ref)) refuse('a push destination could not be verified');
  if (ref.startsWith('refs/')) return [ref];
  const full = [`refs/heads/${ref}`, `refs/tags/${ref}`];
  if (ref.startsWith('heads/')) full.push(`refs/${ref}`);
  if (ref.startsWith('tags/')) full.push(`refs/${ref}`);
  return full;
}

// remote.<name>.push applied to a source-only refspec, as git's refspec_append_mapped does. Returns the
// mapped destinations (empty if none matched). A mapping that forces the push is refused.
function mappedDestinations(configured, srcFull, shortRef) {
  const out = [];
  for (const raw of configured) {
    const force = raw.startsWith('+');
    const spec = force ? raw.slice(1) : raw;
    if (spec.startsWith('^')) refuse('a configured push mapping could not be verified');
    const colon = spec.indexOf(':');
    const src = colon === -1 ? spec : spec.slice(0, colon);
    const dst = colon === -1 ? src : spec.slice(colon + 1);
    let mapped = null;
    const star = src.indexOf('*');
    if (star !== -1) {
      const head = src.slice(0, star);
      const tail = src.slice(star + 1);
      if (srcFull.length >= head.length + tail.length && srcFull.startsWith(head) && srcFull.endsWith(tail)) {
        mapped = dst.replace('*', srcFull.slice(head.length, srcFull.length - tail.length));
      }
    } else if (src === srcFull || src === shortRef) mapped = dst;
    if (mapped === null) continue;
    if (force) refuse('force-push refspecs are blocked');
    out.push(mapped);
  }
  return out;
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
  // Refspecs that name their destination are refused before any git call when they push to main or
  // force or delete (the same checks run again below, with the configuration).
  for (const ref of refs) {
    if (ref.startsWith('+')) refuse('force-push refspecs are blocked');
    if (ref.startsWith(':')) refuse('deletion and matching refspecs are blocked');
    const colon = ref.indexOf(':');
    if (colon !== -1 && destinationBranches(ref.slice(colon + 1)).includes('main')) refuse('pushes to main are blocked');
  }
  const runGit = (args) => git([...push.globalArgs, ...args], push.cwd);
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

  const behavior = (get('push.default') ?? 'simple').toLowerCase();
  const configured = config.get(`remote.${remote}.push`) || [];
  // The branches one refspec can update. `mapped` applies remote.<name>.push and push.default=upstream
  // to a source-only refspec, as git does for one given on the command line.
  const refspecBranches = (ref, mapped) => {
    if (ref.startsWith('+')) refuse('force-push refspecs are blocked');
    if (ref.startsWith(':')) refuse('deletion and matching refspecs are blocked');
    if (ref.startsWith('^')) refuse('a push destination could not be verified');
    const colon = ref.indexOf(':');
    if (colon !== -1) return destinationBranches(ref.slice(colon + 1));
    const names = [];
    for (const full of sourceRefs(ref, currentBranch)) {
      names.push(...destinationBranches(full));
      if (!mapped) continue;
      for (const dst of mappedDestinations(configured, full, ref)) names.push(...destinationBranches(dst));
      const local = full.startsWith('refs/heads/') ? full.slice('refs/heads/'.length) : null;
      if (local && (behavior === 'upstream' || behavior === 'tracking')) {
        const merge = config.get(`branch.${local}.merge`) || [];
        if (merge.length > 1) refuse('the upstream push destination could not be verified');
        if (merge.length === 1) names.push(...destinationBranches(merge[0]));
      }
    }
    return names;
  };

  let branches = [];
  if (refs.length) branches = refs.flatMap((ref) => refspecBranches(ref, true));
  else if (configured.length) branches = configured.flatMap((ref) => refspecBranches(ref, false));
  else {
    if (behavior === 'nothing') return [];
    if (behavior === 'matching') refuse('push.default=matching pushes multiple branches');
    const name = currentBranch();
    const upstreamRemote = get(`branch.${name}.remote`);
    const upstream = config.get(`branch.${name}.merge`) || [];
    if (behavior === 'upstream' || behavior === 'tracking') {
      if (upstreamRemote !== remote || upstream.length !== 1) refuse('the upstream push destination could not be verified');
      branches = destinationBranches(upstream[0]);
    } else if (behavior === 'current' || behavior === 'simple') branches = destinationBranches(`refs/heads/${name}`);
    else refuse('the configured push.default could not be verified');
  }
  const branchNames = new Set(branches);
  if (branchNames.has('main')) refuse('pushes to main are blocked');
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
          // With no known login (an App installation token, or gh could not answer), the hook can't
          // tell this session's own PR from another author's, so it says that instead.
          if (!login) refuse('an open pull request uses a destination branch and the guard could not check who owns the PR branch (no GitHub login)');
          refuse('a destination branch is in use by another open pull request');
        }
      }
    }
  }
}

module.exports = { checkPushes, PushRefusal };
