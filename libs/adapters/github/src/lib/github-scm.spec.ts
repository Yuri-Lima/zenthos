import { repoProfile, type PullRequest } from '@zenthos/domain';
import { scmContract } from '@zenthos/ports';
import type { GitHubClients, GitHubPullsApi } from './clients.js';
import { GitHubScm } from './github-scm.js';

const profile = repoProfile({ repo: 'owner/repo', cloneUrl: 'x', baseBranch: 'staging', allowedCommands: [], gateCommands: [] });
const checkout = { id: 'w', path: '/w', repo: 'owner/repo', baseBranch: 'staging', branch: 'zenthos/owner-repo-12' };

/** A pulls API that remembers what it created, plus one pull request already open for `openForBranch`. */
function fakeClients(openForBranch?: string) {
  const created: Parameters<GitHubPullsApi['create']>[0][] = [];
  const reviews: Parameters<GitHubPullsApi['createReview']>[0][] = [];
  const clients: GitHubClients = {
    for: async () => ({
      issues: {} as never,
      commits: {} as never,
      gitToken: async () => 'ghs_fake',
      gitIdentity: async () => ({ name: 'zenthos-test[bot]', email: '1+zenthos-test[bot]@users.noreply.github.com' }),
      pulls: {
        create: async (params) => {
          created.push(params);
          return { data: { html_url: 'https://github.com/owner/repo/pull/7', number: 7 } };
        },
        list: async ({ head }) => ({
          data: [
            ...(head === `owner:${openForBranch}` ? [{ html_url: 'https://github.com/owner/repo/pull/5', number: 5 }] : []),
            ...created.filter((c) => head === `owner:${c.head}`).map(() => ({ html_url: 'https://github.com/owner/repo/pull/7', number: 7 })),
          ],
        }),
        get: (async (params: { pull_number: number; mediaType?: unknown }) =>
          params.mediaType
            ? { data: 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1,2 @@\n const a = 1;\n+const b = 2;\n' }
            : { data: { state: params.pull_number === 5 ? 'closed' : 'open', merged: params.pull_number === 5 } }) as GitHubPullsApi['get'],
        createReview: async (params) => {
          reviews.push(params);
        },
      },
    }),
  };
  return { clients, created, reviews };
}

describe('GitHubScm', () => {
  for (const [name, check] of Object.entries(scmContract)) {
    it(name, () => check({ port: new GitHubScm(fakeClients().clients), profile, checkout }));
  }

  it('finds the open pull request for a branch, reads its diff, and posts a review as a comment', async () => {
    const { clients, reviews } = fakeClients('zenthos/owner-repo-12');
    const scm = new GitHubScm(clients);
    const found = (await scm.findPullRequest(profile, 'zenthos/owner-repo-12')) as PullRequest;
    expect(found).toEqual({ url: 'https://github.com/owner/repo/pull/5', number: 5 });
    expect(await scm.findPullRequest(profile, 'zenthos/other')).toBeUndefined();
    const diff = await scm.readPullRequestDiff(profile, found);
    expect(diff.files).toEqual(['src/a.ts']);
    expect(diff.changedLines).toBe(1);
    await scm.postReview({ profile, pullRequest: found, body: '## Review' });
    expect(reviews[0]).toMatchObject({ pull_number: 5, event: 'COMMENT', body: '## Review' });
    expect(await scm.pullRequestState(profile, found)).toBe('merged');
  });

  it('opens the pull request against the base branch with the closing line', async () => {
    const { clients, created } = fakeClients();
    const pr = await new GitHubScm(clients).openPullRequest({
      profile,
      checkout,
      title: 'Add CSV export (owner/repo#12)',
      body: 'Implemented by ZenthOs.',
      ticketKey: 'owner/repo#12',
    });
    expect(pr).toEqual({ url: 'https://github.com/owner/repo/pull/7', number: 7 });
    expect(created[0]).toMatchObject({ owner: 'owner', repo: 'repo', head: 'zenthos/owner-repo-12', base: 'staging' });
    expect(created[0].body.endsWith('Closes #12')).toBe(true);
  });
});
