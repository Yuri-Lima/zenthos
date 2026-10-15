import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { DomainError, type GitHubCredentials } from '@zenthos/domain';
import type { GitHubClients, GitHubRepoClients, RepoRef } from './clients.js';

/**
 * The production wiring, kept apart from the classes so tests never load Octokit (ESM only).
 * A GitHub App resolves the installation that covers each repository and lets Octokit mint and
 * refresh installation tokens; a personal token is one client for everything.
 */
export function createGitHubClients(credentials: GitHubCredentials): GitHubClients {
  return credentials.type === 'github-app' ? new AppClients(credentials.appId, credentials.privateKey) : new TokenClients(credentials.token);
}

class TokenClients implements GitHubClients {
  private readonly clients: GitHubRepoClients;

  constructor(token: string) {
    const octokit = new Octokit({ auth: token });
    this.clients = { issues: octokit.rest.issues, pulls: octokit.rest.pulls, gitToken: async () => token };
  }

  async for(): Promise<GitHubRepoClients> {
    return this.clients;
  }
}

class AppClients implements GitHubClients {
  private readonly app: Octokit;
  private readonly byRepo = new Map<string, Promise<GitHubRepoClients>>();

  constructor(
    private readonly appId: string,
    private readonly privateKey: string,
  ) {
    this.app = new Octokit({ authStrategy: createAppAuth, auth: { appId, privateKey } });
  }

  for(ref: RepoRef): Promise<GitHubRepoClients> {
    const key = `${ref.owner}/${ref.repo}`;
    let clients = this.byRepo.get(key);
    if (!clients) {
      clients = this.connect(ref);
      this.byRepo.set(key, clients);
      clients.catch(() => this.byRepo.delete(key));
    }
    return clients;
  }

  private async connect(ref: RepoRef): Promise<GitHubRepoClients> {
    const { data } = await this.app.rest.apps.getRepoInstallation(ref).catch(async (error: { status?: number }) => {
      if (error.status !== 404) throw error;
      const { data: app } = await this.app.rest.apps.getAuthenticated();
      throw new DomainError('app_not_installed', {
        repo: `${ref.owner}/${ref.repo}`,
        app: app?.slug,
        installUrl: app?.slug ? `https://github.com/apps/${app.slug}/installations/new` : undefined,
      });
    });
    const auth = { appId: this.appId, privateKey: this.privateKey, installationId: data.id };
    const octokit = new Octokit({ authStrategy: createAppAuth, auth });
    const installationAuth = createAppAuth(auth);
    return {
      issues: octokit.rest.issues,
      pulls: octokit.rest.pulls,
      gitToken: async () => (await installationAuth({ type: 'installation' })).token,
    };
  }
}
