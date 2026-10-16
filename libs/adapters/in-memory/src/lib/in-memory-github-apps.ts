import type { GitHubAppManifestResult, Installation } from '@zenthos/domain';
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
}
