import { DomainError, type GitHubAppManifestResult, type GitHubCredentials, type GitHubUser, type Installation, type RepositoryInfo } from '@zenthos/domain';
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

  async listInstallations(): Promise<Installation[]> {
    return this.installations;
  }

  /** `main` and the GitHub clone URL for any repository; one named `missing` is not found, as GitHub answers 404. */
  async describeRepository(_credentials: GitHubCredentials, repo: string): Promise<RepositoryInfo> {
    if (repo.endsWith('/missing')) throw new DomainError('repository_not_found', { repo });
    return { defaultBranch: 'main', cloneUrl: `https://github.com/${repo}.git` };
  }

  /** Credentials whose token or private key is `rejected` fail, as GitHub would answer 401; the rest act as `memory`. */
  async whoAmI(credentials: GitHubCredentials): Promise<string> {
    const secret = credentials.type === 'github-token' ? credentials.token : credentials.privateKey;
    if (secret === 'rejected') throw new Error('Bad credentials');
    return credentials.type === 'github-token' ? 'memory' : this.manifestResult.slug;
  }
}
