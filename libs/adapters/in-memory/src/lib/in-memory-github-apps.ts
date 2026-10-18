import type { GitHubAppManifestResult, GitHubUser, Installation } from '@zenthos/domain';
import type { GitHubAppsPort } from '@zenthos/ports';

/** Answers the manifest exchange and installation lookups from canned data. */
export class InMemoryGitHubApps implements GitHubAppsPort {
  constructor(
    private readonly manifestResult: GitHubAppManifestResult = { appId: '424242', slug: 'zenthos-memory', privateKey: 'pem', webhookSecret: 'whs', clientId: 'Iv1.memory', clientSecret: 'cs' },
    private readonly installations: Installation[] = [],
  ) {}

  async exchangeManifestCode(code: string): Promise<GitHubAppManifestResult> {
    if (!code) throw new Error('manifest code missing');
    return this.manifestResult;
  }

  async describeInstallation(_credentials: unknown, installationId: number): Promise<Installation> {
    return this.installations.find((i) => i.installationId === installationId) ?? { installationId, account: 'memory', repositories: [] };
  }

  /** A code of the form `user:<login>` signs that login in; anything else is `memory`. The redirect URI plays no part here. */
  async signInUser(...[, code]: Parameters<GitHubAppsPort['signInUser']>): Promise<GitHubUser> {
    const login = code.startsWith('user:') ? code.slice(5) : 'memory';
    return { login, id: 1, avatarUrl: `https://avatars.example.test/${login}` };
  }
}
