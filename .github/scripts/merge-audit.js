'use strict';
// Decision logic for .github/workflows/merge-audit.yml, kept here so `npm test` can run it on fixtures.
//
// A commit in a push to main is covered when a pull request merged into main includes it: either
// GitHub associates the commit with that PR directly (its merge or squash commit), or the commit is
// in the PR's own commit list. The second case matters when commits were first merged into another
// branch (a stacked PR) and later reached main through a PR whose merge commit is the only one GitHub
// associates with it (issue #35). A commit no merged-to-main PR covers is still an alert.
//
// `api` is injected so the workflow passes GitHub's REST client and tests pass fixtures:
//   prsForCommit(sha)    -> [{ number, merged_at, base: { ref } }]
//   prCommits(number)    -> [sha]
//   getPr(number)        -> { user: { login }, merged_by: { login } | null }
//   prReviews(number)    -> [{ user: { login } | null, state }]
// Any error from `api` propagates, so the workflow fails instead of passing quietly.

const BASE = 'main';

async function auditPush({ shas, human, api }) {
  if (!Array.isArray(shas) || shas.length === 0) throw new Error('merge audit: no commits to check');
  if (!human) throw new Error('merge audit: no human approver configured');

  const problems = [];
  const mergedPrs = new Map();
  const covered = new Set();

  for (const sha of shas) {
    const prs = await api.prsForCommit(sha);
    for (const pr of prs) {
      if (!pr.merged_at || !pr.base || pr.base.ref !== BASE) continue;
      mergedPrs.set(pr.number, pr);
      covered.add(sha);
    }
  }

  for (const number of mergedPrs.keys()) {
    for (const sha of await api.prCommits(number)) covered.add(sha);
  }

  for (const sha of shas) {
    if (!covered.has(sha)) problems.push(`Commit ${sha.slice(0, 7)} reached main without a merged pull request.`);
  }

  for (const number of mergedPrs.keys()) {
    const full = await api.getPr(number);
    const mergedBy = full.merged_by && full.merged_by.login;
    if (mergedBy !== human) problems.push(`PR #${number} was merged by ${mergedBy || 'unknown'}, not ${human}.`);
    if (full.user.login !== human) {
      const reviews = await api.prReviews(number);
      const approved = reviews.some((r) => r.user && r.user.login === human && r.state === 'APPROVED');
      if (!approved) problems.push(`PR #${number} by ${full.user.login} merged without an approval from ${human}.`);
    }
  }

  return problems;
}

// Adapter from actions/github-script's `github` client. Every list is paginated.
function githubApi(github, { owner, repo }) {
  return {
    prsForCommit: (commit_sha) =>
      github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, { owner, repo, commit_sha, per_page: 100 }),
    prCommits: async (pull_number) =>
      (await github.paginate(github.rest.pulls.listCommits, { owner, repo, pull_number, per_page: 100 })).map((c) => c.sha),
    getPr: async (pull_number) => (await github.rest.pulls.get({ owner, repo, pull_number })).data,
    prReviews: (pull_number) => github.paginate(github.rest.pulls.listReviews, { owner, repo, pull_number, per_page: 100 }),
  };
}

module.exports = { auditPush, githubApi };
