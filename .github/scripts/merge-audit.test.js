'use strict';
// Run: node .github/scripts/merge-audit.test.js
//
// The merge audit alerts on any commit that reached main outside a PR merged into main, and on PRs
// merged by someone other than Blue or without his approval. Fixtures model GitHub's REST answers.

const { auditPush, githubApi } = require('./merge-audit');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function eq(a, b, label) { assert(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)})`); }

const HUMAN = 'ABlueAI';

// A fake GitHub: `associated` maps a commit to the PRs GitHub links it to; `prs` holds each PR's
// details, its merge commit (`merge`), its commit list and its reviews.
function fakeApi({ associated = {}, prs = {} }) {
  const pr = (n) => {
    if (!(n in prs)) throw new Error(`unexpected PR #${n}`);
    return prs[n];
  };
  return {
    prsForCommit: async (sha) => (associated[sha] || []).map((n) => ({ number: n, merged_at: pr(n).merged_at, base: { ref: pr(n).base } })),
    recentPrsIntoMain: async () => Object.keys(prs).map((n) => ({ number: Number(n), merged_at: prs[n].merged_at, base: { ref: prs[n].base }, merge_commit_sha: prs[n].merge || null })),
    prCommits: async (n) => pr(n).commits,
    getPr: async (n) => ({ user: { login: pr(n).author }, merged_by: pr(n).merged_by ? { login: pr(n).merged_by } : null }),
    prReviews: async (n) => pr(n).reviews || [],
  };
}

const merged = '2026-10-18T18:18:40Z';

(async () => {
  {
    // Issue #35: PR #33 was stacked on #32's branch, so GitHub links de6599c and eaefbdb only to #33
    // (base claude/finish-1.0-closeout). They reached main inside PR #34, whose merge commit is 37009eb.
    const api = fakeApi({
      associated: { de6599c: [33], eaefbdb: [33], '37009eb': [34] },
      prs: {
        33: { base: 'claude/finish-1.0-closeout', merged_at: merged, author: HUMAN, merged_by: HUMAN, commits: ['de6599c', 'eaefbdb'] },
        34: { base: 'main', merged_at: merged, author: HUMAN, merged_by: HUMAN, commits: ['de6599c', 'eaefbdb'] },
      },
    });
    const problems = await auditPush({ shas: ['de6599c', 'eaefbdb', '37009eb'], human: HUMAN, api });
    eq(problems, [], 'commits from a stacked PR that reached main inside a merged PR do not alert');
  }
  {
    // The same push before the fix, if PR #34 had never existed: nothing merged into main covers them.
    const api = fakeApi({
      associated: { de6599c: [33], eaefbdb: [33] },
      prs: { 33: { base: 'claude/finish-1.0-closeout', merged_at: merged, author: HUMAN, merged_by: HUMAN, commits: ['de6599c', 'eaefbdb'] } },
    });
    const problems = await auditPush({ shas: ['de6599c', 'eaefbdb'], human: HUMAN, api });
    eq(problems.length, 2, 'a PR merged into another branch does not cover commits on main');
  }
  {
    const api = fakeApi({ associated: {} });
    const problems = await auditPush({ shas: ['abc1234def'], human: HUMAN, api });
    eq(problems, ['Commit abc1234 reached main without a merged pull request.'], 'a direct push with no PR alerts');
  }
  {
    // A direct push riding along with a proper merge: the PR covers its own commits, not the extra one.
    const api = fakeApi({
      associated: { aaa1111: [40], mmm0000: [40] },
      prs: { 40: { base: 'main', merged_at: merged, author: HUMAN, merged_by: HUMAN, commits: ['aaa1111'] } },
    });
    const problems = await auditPush({ shas: ['aaa1111', 'mmm0000', 'zzz9999'], human: HUMAN, api });
    eq(problems, ['Commit zzz9999 reached main without a merged pull request.'], 'an extra commit outside every merged PR still alerts');
  }
  {
    const api = fakeApi({
      associated: { bbb2222: [41] },
      prs: { 41: { base: 'main', merged_at: null, author: HUMAN, merged_by: null, commits: ['bbb2222'] } },
    });
    const problems = await auditPush({ shas: ['bbb2222'], human: HUMAN, api });
    eq(problems.length, 1, 'an open (unmerged) PR into main does not cover a commit');
  }
  {
    const api = fakeApi({
      associated: { ccc3333: [42] },
      prs: { 42: { base: 'main', merged_at: merged, author: HUMAN, merged_by: 'someone-else', commits: ['ccc3333'] } },
    });
    const problems = await auditPush({ shas: ['ccc3333'], human: HUMAN, api });
    eq(problems, ['PR #42 was merged by someone-else, not ABlueAI.'], 'a PR merged by someone other than Blue alerts');
  }
  {
    const api = fakeApi({
      associated: { ddd4444: [43] },
      prs: { 43: { base: 'main', merged_at: merged, author: HUMAN, merged_by: null, commits: ['ddd4444'] } },
    });
    const problems = await auditPush({ shas: ['ddd4444'], human: HUMAN, api });
    eq(problems, ['PR #43 was merged by unknown, not ABlueAI.'], 'a missing merged_by alerts as unknown');
  }
  {
    const api = fakeApi({
      associated: { eee5555: [44] },
      prs: { 44: { base: 'main', merged_at: merged, author: 'ablueai-agent', merged_by: HUMAN, commits: ['eee5555'],
        reviews: [{ user: { login: 'ablueai-agent' }, state: 'APPROVED' }, { user: { login: HUMAN }, state: 'COMMENTED' }] } },
    });
    const problems = await auditPush({ shas: ['eee5555'], human: HUMAN, api });
    eq(problems, ['PR #44 by ablueai-agent merged without an approval from ABlueAI.'], 'an agent PR without Blue\'s approval alerts');
  }
  {
    const api = fakeApi({
      associated: { fff6666: [45] },
      prs: { 45: { base: 'main', merged_at: merged, author: 'ablueai-agent', merged_by: HUMAN, commits: ['fff6666'],
        reviews: [{ user: null, state: 'APPROVED' }, { user: { login: HUMAN }, state: 'APPROVED' }] } },
    });
    const problems = await auditPush({ shas: ['fff6666'], human: HUMAN, api });
    eq(problems, [], 'an agent PR approved and merged by Blue passes');
  }
  {
    // A stacked agent PR reaching main inside another PR is still checked as that PR.
    const api = fakeApi({
      associated: { ggg7777: [46], hhh8888: [47] },
      prs: {
        46: { base: 'feature-branch', merged_at: merged, author: 'ablueai-agent', merged_by: HUMAN, commits: ['ggg7777'] },
        47: { base: 'main', merged_at: merged, author: 'ablueai-agent', merged_by: HUMAN, commits: ['ggg7777'] },
      },
    });
    const problems = await auditPush({ shas: ['ggg7777', 'hhh8888'], human: HUMAN, api });
    eq(problems, ['PR #47 by ablueai-agent merged without an approval from ABlueAI.'], 'the covering PR still needs Blue\'s approval');
  }
  {
    // Issue #40: PR #39 (agent-authored, approved and merged by Blue) merged as 0b6d432, but GitHub
    // associated none of its commits with any PR. The PR list's merge commit covers it.
    const api = fakeApi({
      associated: {},
      prs: { 39: { base: 'main', merged_at: merged, merge: '0b6d432', author: 'ABlueAgent', merged_by: HUMAN, commits: ['281de31', 'a0798d0'],
        reviews: [{ user: { login: HUMAN }, state: 'APPROVED' }] } },
    });
    const problems = await auditPush({ shas: ['281de31', 'a0798d0', '0b6d432'], human: HUMAN, api });
    eq(problems, [], 'a merged PR found by its merge commit covers its commits when GitHub associates none');
  }
  {
    // The same push without Blue's approval still alerts, so the fallback only replaces the lookup.
    const api = fakeApi({
      associated: {},
      prs: { 39: { base: 'main', merged_at: merged, merge: '0b6d432', author: 'ABlueAgent', merged_by: HUMAN, commits: ['281de31', 'a0798d0'] } },
    });
    const problems = await auditPush({ shas: ['281de31', 'a0798d0', '0b6d432'], human: HUMAN, api });
    eq(problems, ['PR #39 by ABlueAgent merged without an approval from ABlueAI.'], 'a PR found by its merge commit still needs Blue\'s approval');
  }
  {
    // A direct push next to a fallback-covered merge: only the PR's own commits are covered.
    const api = fakeApi({
      associated: {},
      prs: { 50: { base: 'main', merged_at: merged, merge: 'mmm5000', author: HUMAN, merged_by: HUMAN, commits: ['aaa5000'] } },
    });
    const problems = await auditPush({ shas: ['aaa5000', 'mmm5000', 'zzz5000'], human: HUMAN, api });
    eq(problems, ['Commit zzz5000 reached main without a merged pull request.'], 'the fallback does not cover a commit outside the PR');
  }
  {
    // Only a PR that merged into main counts: not one closed unmerged, and not one merged elsewhere.
    const api = fakeApi({
      associated: {},
      prs: {
        51: { base: 'main', merged_at: null, merge: 'nnn5100', author: HUMAN, merged_by: null, commits: ['nnn5100'] },
        52: { base: 'feature-branch', merged_at: merged, merge: 'ppp5200', author: HUMAN, merged_by: HUMAN, commits: ['ppp5200'] },
      },
    });
    const problems = await auditPush({ shas: ['nnn5100', 'ppp5200'], human: HUMAN, api });
    eq(problems.length, 2, 'the fallback ignores unmerged PRs and PRs merged into other branches');
  }
  {
    let listed = 0;
    const api = fakeApi({ associated: { qqq5300: [53] }, prs: { 53: { base: 'main', merged_at: merged, author: HUMAN, merged_by: HUMAN, commits: ['qqq5300'] } } });
    const recent = api.recentPrsIntoMain;
    api.recentPrsIntoMain = async () => { listed++; return recent(); };
    await auditPush({ shas: ['qqq5300'], human: HUMAN, api });
    eq(listed, 0, 'the PR list is read only when a commit has no associated PR');
  }
  {
    const api = fakeApi({ associated: {} });
    api.recentPrsIntoMain = async () => { throw new Error('API down'); };
    let threw = false;
    try { await auditPush({ shas: ['rrr5400'], human: HUMAN, api }); } catch { threw = true; }
    assert(threw, 'an API error in the fallback fails the audit instead of passing quietly');
  }
  {
    let calls = 0;
    const api = fakeApi({
      associated: { iii9999: [48], jjj0000: [48] },
      prs: { 48: { base: 'main', merged_at: merged, author: HUMAN, merged_by: HUMAN, commits: ['iii9999'] } },
    });
    const getPr = api.getPr;
    api.getPr = async (n) => { calls++; return getPr(n); };
    await auditPush({ shas: ['iii9999', 'jjj0000'], human: HUMAN, api });
    eq(calls, 1, 'each PR is checked once even when several commits link to it');
  }
  {
    const api = fakeApi({ associated: { kkk1111: [49] }, prs: { 49: { base: 'main', merged_at: merged, author: HUMAN, merged_by: HUMAN, commits: ['kkk1111'] } } });
    api.prCommits = async () => { throw new Error('API down'); };
    let threw = false;
    try { await auditPush({ shas: ['kkk1111'], human: HUMAN, api }); } catch { threw = true; }
    assert(threw, 'an API error fails the audit instead of passing quietly');
  }
  {
    let threw = false;
    try { await auditPush({ shas: [], human: HUMAN, api: fakeApi({}) }); } catch { threw = true; }
    assert(threw, 'an empty commit list fails instead of passing');
    threw = false;
    try { await auditPush({ shas: ['abc'], human: '', api: fakeApi({}) }); } catch { threw = true; }
    assert(threw, 'a missing approver fails instead of passing');
  }
  {
    // The adapter paginates every list and passes owner and repo through.
    const seen = [];
    const fn = (name) => { const f = () => {}; f.endpoint = name; return f; };
    const github = {
      rest: {
        repos: { listPullRequestsAssociatedWithCommit: fn('assoc') },
        pulls: {
          listCommits: fn('commits'), listReviews: fn('reviews'), get: async (p) => ({ data: { number: p.pull_number } }),
          list: async (p) => { seen.push(['list', p]); return { data: [{ number: 39 }] }; },
        },
      },
      paginate: async (f, params) => { seen.push([f.endpoint, params]); return f.endpoint === 'commits' ? [{ sha: 's1' }, { sha: 's2' }] : []; },
    };
    const api = githubApi(github, { owner: 'o', repo: 'r' });
    await api.prsForCommit('abc');
    eq(await api.prCommits(7), ['s1', 's2'], 'prCommits returns the SHAs of every page');
    await api.prReviews(7);
    eq((await api.getPr(7)).number, 7, 'getPr returns the PR data');
    eq(seen.map(([e]) => e), ['assoc', 'commits', 'reviews'], 'associated PRs, commits and reviews are all paginated');
    eq(seen[1][1], { owner: 'o', repo: 'r', pull_number: 7, per_page: 100 }, 'listCommits gets owner, repo and the PR number');
    eq(await api.recentPrsIntoMain(), [{ number: 39 }], 'recentPrsIntoMain returns the PR list');
    eq(seen[3][1], { owner: 'o', repo: 'r', state: 'closed', base: 'main', sort: 'updated', direction: 'desc', per_page: 100 },
      'recentPrsIntoMain asks for the newest closed PRs into main');
  }

  process.stdout.write(`\nmerge-audit: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((err) => { process.stderr.write(`${err.stack}\n`); process.exit(1); });
