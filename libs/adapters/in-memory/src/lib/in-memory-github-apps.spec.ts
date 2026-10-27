import { githubAppsContract } from '@zenthos/ports';
import { InMemoryGitHubApps } from './in-memory-github-apps.js';

describe('InMemoryGitHubApps', () => {
  for (const [name, check] of Object.entries(githubAppsContract)) {
    it(name, () => check(new InMemoryGitHubApps(), { manifestCode: 'code', signInCode: 'user:octocat', repo: 'owner/repo', installationId: 7 }));
  }

  it('signs in the login named by the code', async () => {
    expect((await new InMemoryGitHubApps().signInUser({ clientId: 'c', clientSecret: 's' }, 'user:yuri', 'x')).login).toBe('yuri');
  });
});
