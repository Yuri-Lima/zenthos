import { repoProfile } from '@zenthos/domain';
import type { GitHubClients, GitHubPullsApi } from './clients.js';
import { GitHubScm } from './github-scm.js';

describe('GitHubScm', () => {
  it('opens the pull request against the base branch with the closing line', async () => {
    const created: Parameters<GitHubPullsApi['create']>[0][] = [];
    const clients: GitHubClients = {
      for: async () => ({
        issues: {} as never,
        pulls: {
          create: async (params) => {
            created.push(params);
            return { data: { html_url: 'https://github.com/owner/repo/pull/7', number: 7 } };
          },
        },
        gitToken: async () => 'ghs_fake',
        gitIdentity: async () => ({ name: 'zenthos-test[bot]', email: '1+zenthos-test[bot]@users.noreply.github.com' }),
      }),
    };
    const profile = repoProfile({ repo: 'owner/repo', cloneUrl: 'x', baseBranch: 'staging', allowedCommands: [], gateCommands: [] });
    const pr = await new GitHubScm(clients).openPullRequest({
      profile,
      workspace: { id: 'w', path: '/w', repo: 'owner/repo', baseBranch: 'staging', branch: 'zenthos/owner-repo-12' },
      title: 'Add CSV export (owner/repo#12)',
      body: 'Implemented by ZenthOs.',
      ticketKey: 'owner/repo#12',
    });
    expect(pr).toEqual({ url: 'https://github.com/owner/repo/pull/7', number: 7 });
    expect(created[0]).toMatchObject({ owner: 'owner', repo: 'repo', head: 'zenthos/owner-repo-12', base: 'staging' });
    expect(created[0].body.endsWith('Closes #12')).toBe(true);
  });
});
