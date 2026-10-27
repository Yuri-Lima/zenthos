import { createAppAuth } from '@octokit/auth-app';
import { createOAuthUserAuth } from '@octokit/auth-oauth-user';
import { Octokit } from '@octokit/rest';
import { DomainError, type GitHubAppManifestResult, type GitHubCredentials, type GitHubUser, type Installation, type RepositoryInfo } from '@zenthos/domain';
import type { GitHubAppsPort } from '@zenthos/ports';

/** Live only (Octokit is ESM); the API composes it, tests use the in-memory twin. */
export class OctokitGitHubApps implements GitHubAppsPort {
  async exchangeManifestCode(code: string): Promise<GitHubAppManifestResult> {
    const { data } = await new Octokit().rest.apps.createFromManifest({ code });
    return { appId: String(data.id), slug: data.slug ?? data.name, privateKey: data.pem, webhookSecret: data.webhook_secret ?? '', clientId: data.client_id, clientSecret: data.client_secret };
  }

  async describeInstallation({ appId, privateKey }: Extract<GitHubCredentials, { type: 'github-app' }>, installationId: number): Promise<Installation> {
    const app = new Octokit({ authStrategy: createAppAuth, auth: { appId, privateKey } });
    const { data } = await app.rest.apps.getInstallation({ installation_id: installationId });
    const installation = new Octokit({ authStrategy: createAppAuth, auth: { appId, privateKey, installationId } });
    const repositories = await installation.paginate(installation.rest.apps.listReposAccessibleToInstallation, { per_page: 100 });
    const account = data.account && 'login' in data.account ? data.account.login : (data.account?.slug ?? '');
    return { installationId, account, repositories: repositories.map((repo) => repo.full_name) };
  }

  /** The App's user authorization (web flow): the code becomes a user token, used once to read who signed in. */
  async signInUser({ clientId, clientSecret }: { clientId: string; clientSecret: string }, code: string, redirectUri: string): Promise<GitHubUser> {
    const octokit = new Octokit({ authStrategy: createOAuthUserAuth, auth: { clientType: 'github-app', clientId, clientSecret, code, redirectUrl: redirectUri } });
    const { data } = await octokit.rest.users.getAuthenticated();
    return { login: data.login, id: data.id, avatarUrl: data.avatar_url };
  }

  async listInstallations(credentials: Extract<GitHubCredentials, { type: 'github-app' }>): Promise<Installation[]> {
    const app = new Octokit({ authStrategy: createAppAuth, auth: { appId: credentials.appId, privateKey: credentials.privateKey } });
    const installations = await app.paginate(app.rest.apps.listInstallations, { per_page: 100 });
    return Promise.all(installations.map((installation) => this.describeInstallation(credentials, installation.id)));
  }

  /** GET /orgs/{org}/members/{username} with the installation's token: a 2xx is a member, 404 is not (needs organisation permission members: read). */
  async isMember({ appId, privateKey }: Extract<GitHubCredentials, { type: 'github-app' }>, installationId: number, organisation: string, login: string): Promise<boolean> {
    const octokit = new Octokit({ authStrategy: createAppAuth, auth: { appId, privateKey, installationId } });
    try {
      await octokit.rest.orgs.checkMembershipForUser({ org: organisation, username: login });
      return true;
    } catch (error) {
      if ((error as { status?: number }).status === 404) return false;
      throw error;
    }
  }

  /** GET /repos/{owner}/{repo} through the installation that covers it (an app) or the token; GitHub's 404 is `repository_not_found`. */
  async describeRepository(credentials: GitHubCredentials, repo: string): Promise<RepositoryInfo> {
    const [owner, name] = repo.split('/');
    const notFound = (error: { status?: number }): never => {
      if (error.status === 404) throw new DomainError('repository_not_found', { repo });
      throw error;
    };
    let octokit = new Octokit(credentials.type === 'github-token' ? { auth: credentials.token } : { authStrategy: createAppAuth, auth: { appId: credentials.appId, privateKey: credentials.privateKey } });
    if (credentials.type === 'github-app') {
      const { data } = await octokit.rest.apps.getRepoInstallation({ owner, repo: name }).catch(notFound);
      octokit = new Octokit({ authStrategy: createAppAuth, auth: { appId: credentials.appId, privateKey: credentials.privateKey, installationId: data.id } });
    }
    const { data } = await octokit.rest.repos.get({ owner, repo: name }).catch(notFound);
    return { defaultBranch: data.default_branch, cloneUrl: data.clone_url };
  }

  /** One authenticated read: GET /app for an app (signed with its key), GET /user for a token. */
  async whoAmI(credentials: GitHubCredentials): Promise<string> {
    if (credentials.type === 'github-token') {
      const { data } = await new Octokit({ auth: credentials.token }).rest.users.getAuthenticated();
      return data.login;
    }
    const { data } = await new Octokit({ authStrategy: createAppAuth, auth: { appId: credentials.appId, privateKey: credentials.privateKey } }).rest.apps.getAuthenticated();
    return data?.slug ?? data?.name ?? credentials.appId;
  }
}
