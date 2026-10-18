import { createAppAuth } from '@octokit/auth-app';
import { createOAuthUserAuth } from '@octokit/auth-oauth-user';
import { Octokit } from '@octokit/rest';
import type { GitHubAppManifestResult, GitHubCredentials, GitHubUser, Installation } from '@zenthos/domain';
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
